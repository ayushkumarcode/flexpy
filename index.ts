// @ts-nocheck
import { MCPServer, widget, text, error } from "mcp-use/server";
import { z } from "zod";
import { supabase, generateCode, randomColor } from "./lib/supabase.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

const server = new MCPServer({
  name: "collabengine",
  version: "1.0.0",
  description: "Collaborative MCP App Engine - create shared boards and games from natural language",
});

// ============================================================================
// BOARD TOOLS (Trip Planner, Gift Brainstorm, etc.)
// ============================================================================

server.tool(
  {
    name: "create-board",
    description: "Create a collaborative board (trip planner, gift brainstorm, comparison, etc). Returns a shared widget that multiple users can interact with.",
    schema: z.object({
      type: z.string().describe("Board type: 'trip-planner', 'gift-brainstorm', 'comparison', etc"),
      title: z.string().describe("Board title, e.g. 'Tokyo Trip April 2026'"),
      columns: z.array(z.string()).describe("Column names, e.g. ['Flights', 'Hotels', 'Activities']"),
      user_name: z.string().describe("Name of the user creating the board"),
    }),
    widget: {
      name: "trip-planner",
      invoking: "Creating collaborative board...",
      invoked: "Board created! Share the code with friends.",
    },
  },
  async ({ type, title, columns, user_name }) => {
    try {
      const shareCode = generateCode();
      const color = randomColor();

      const { data: board, error: boardErr } = await supabase
        .from("boards")
        .insert({ share_code: shareCode, type, title, columns })
        .select()
        .single();

      if (boardErr) return error(`Failed to create board: ${boardErr.message}`);

      await supabase
        .from("members")
        .insert({ board_id: board.id, name: user_name, color });

      return widget({
        props: {
          boardId: board.id,
          shareCode,
          title,
          columns,
          items: [],
          members: [{ name: user_name, color }],
        },
        output: text(`Created board "${title}" with share code ${shareCode}. Board ID: ${board.id}. Use this board ID when calling add-items. Others can join by saying "join board ${shareCode}".`),
      });
    } catch (err) {
      return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

server.tool(
  {
    name: "join-board",
    description: "Join an existing collaborative board using a share code. Returns the shared widget with current state.",
    schema: z.object({
      share_code: z.string().describe("The board share code, e.g. 'ABCD' or 'TOKYO-7F2A'"),
      user_name: z.string().describe("Name of the user joining"),
    }),
    widget: {
      name: "trip-planner",
      invoking: "Joining board...",
      invoked: "Joined the board!",
    },
  },
  async ({ share_code, user_name }) => {
    try {
      const { data: board, error: boardErr } = await supabase
        .from("boards")
        .select("*")
        .eq("share_code", share_code.toUpperCase())
        .single();

      if (boardErr || !board) return error(`Board not found with code: ${share_code}`);

      const color = randomColor();
      await supabase
        .from("members")
        .insert({ board_id: board.id, name: user_name, color });

      const { data: items } = await supabase
        .from("items")
        .select("*")
        .eq("board_id", board.id)
        .order("created_at", { ascending: true });

      const { data: members } = await supabase
        .from("members")
        .select("*")
        .eq("board_id", board.id);

      return widget({
        props: {
          boardId: board.id,
          shareCode: board.share_code,
          title: board.title,
          columns: board.columns,
          items: items || [],
          members: members || [],
        },
        output: text(`Joined "${board.title}"! Board ID: ${board.id}. ${members?.length || 1} people are collaborating. Use this board ID when calling add-items.`),
      });
    } catch (err) {
      return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

server.tool(
  {
    name: "add-items",
    description: "Add one or more items to a board column. Use this to add flight options, hotel options, gift ideas, etc.",
    schema: z.object({
      board_id: z.string().describe("Board ID (UUID) OR share code (e.g. 'U9A8'). Both work."),
      column: z.string().describe("Column name to add items to, e.g. 'Flights'"),
      items: z.array(z.object({
        title: z.string().describe("Item title, e.g. 'United $650 direct'"),
        description: z.string().optional().describe("Item description"),
        added_by: z.string().describe("Name of the person adding this — use the user's real name from context (e.g. from the board creation step or conversation), NOT 'Claude'"),
        metadata: z.record(z.any()).optional().describe("Extra data like price, link, airline, etc"),
        link: z.string().optional().describe("External link (booking page, product page)"),
      })),
    }),
    widget: {
      name: "trip-planner",
      invoking: "Adding items to the board...",
      invoked: "Items added!",
    },
  },
  async ({ board_id, column, items: newItems }) => {
    try {
      // Accept either a UUID or a share code
      let resolvedBoardId = board_id;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(board_id);
      if (!isUuid) {
        const { data: found } = await supabase.from("boards").select("id").eq("share_code", board_id.toUpperCase()).single();
        if (!found) return error(`Board not found with ID or share code: ${board_id}`);
        resolvedBoardId = found.id;
      }

      const color = randomColor();
      const rows = newItems.map(item => ({
        board_id: resolvedBoardId,
        column_name: column,
        title: item.title,
        description: item.description || "",
        added_by: item.added_by,
        added_by_color: color,
        metadata: item.metadata || {},
        link: item.link || "",
      }));

      const { error: insertErr } = await supabase.from("items").insert(rows);
      if (insertErr) return error(`Failed to add items: ${insertErr.message}`);

      // Fetch full board state
      const { data: board } = await supabase.from("boards").select("*").eq("id", resolvedBoardId).single();
      const { data: allItems } = await supabase.from("items").select("*").eq("board_id", resolvedBoardId).order("created_at");
      const { data: members } = await supabase.from("members").select("*").eq("board_id", resolvedBoardId);

      // REALTIME: board widget picks up new items via items subscription — no new iframe
      // REVERT: replace with widget() block that was here (returns full board props)
      return text(`Added ${newItems.length} item(s) to ${column}.`);
    } catch (err) {
      return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

server.tool(
  {
    name: "get-board",
    description: "Get the current state of a board. Use this to analyze items, compare options, or make recommendations based on what everyone has added.",
    schema: z.object({
      board_id: z.string().describe("Board ID (UUID) OR share code (e.g. 'U9A8'). Both work."),
    }),
    widget: {
      name: "trip-planner",
      invoking: "Loading board...",
      invoked: "Board loaded",
    },
  },
  async ({ board_id }) => {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(board_id);
      const { data: board } = isUuid
        ? await supabase.from("boards").select("*").eq("id", board_id).single()
        : await supabase.from("boards").select("*").eq("share_code", board_id.toUpperCase()).single();
      if (!board) return error("Board not found");
      const resolvedBoardId = board.id;

      const { data: items } = await supabase.from("items").select("*").eq("board_id", resolvedBoardId).order("created_at");
      const { data: members } = await supabase.from("members").select("*").eq("board_id", resolvedBoardId);

      return widget({
        props: {
          boardId: resolvedBoardId,
          shareCode: board.share_code,
          title: board.title,
          columns: board.columns,
          items: items || [],
          members: members || [],
        },
        output: text(`Board "${board.title}" has ${items?.length || 0} items across ${(board.columns as string[]).length} columns. ${members?.length || 0} collaborators.`),
      });
    } catch (err) {
      return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

server.tool(
  {
    name: "update-item",
    description: "Update an item on the board (edit, vote, add recommendation tag, etc)",
    schema: z.object({
      item_id: z.string().describe("Item ID to update"),
      board_id: z.string().describe("Board ID the item belongs to"),
      updates: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        votes_up: z.number().optional().describe("Increment votes by this amount"),
        metadata: z.record(z.any()).optional().describe("Merge these fields into existing metadata"),
      }),
    }),
    widget: {
      name: "trip-planner",
      invoking: "Updating item...",
      invoked: "Item updated",
    },
  },
  async ({ item_id, board_id, updates }) => {
    try {
      // Handle vote increment
      if (updates.votes_up) {
        const { data: current } = await supabase.from("items").select("votes_up").eq("id", item_id).single();
        updates.votes_up = (current?.votes_up || 0) + updates.votes_up;
      }

      // Handle metadata merge
      if (updates.metadata) {
        const { data: current } = await supabase.from("items").select("metadata").eq("id", item_id).single();
        updates.metadata = { ...(current?.metadata || {}), ...updates.metadata };
      }

      const { error: updateErr } = await supabase.from("items").update(updates).eq("id", item_id);
      if (updateErr) return error(`Failed to update: ${updateErr.message}`);

      // Return full board state
      const { data: board } = await supabase.from("boards").select("*").eq("id", board_id).single();
      const { data: items } = await supabase.from("items").select("*").eq("board_id", board_id).order("created_at");
      const { data: members } = await supabase.from("members").select("*").eq("board_id", board_id);

      // REALTIME: board widget picks up update via items subscription — no new iframe
      // REVERT: replace with widget() block that was here
      return text("Item updated.");
    } catch (err) {
      return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

// ============================================================================
// GAME TOOLS (Trivia)
// ============================================================================

server.tool(
  {
    name: "create-game",
    description: "Create a trivia game. AI should generate fun/funny questions and pass them in. Returns a host game widget. Players join in their own Claude chat by saying 'join game [CODE] as [name]'.",
    schema: z.object({
      title: z.string().describe("Game title, e.g. 'YC Partners Roast Quiz'"),
      questions: z.array(z.object({
        question_text: z.string(),
        options: z.array(z.string()).length(4).describe("Exactly 4 answer options"),
        correct_index: z.number().min(0).max(3).describe("Index of the correct answer (0-3)"),
        fun_fact: z.string().optional().describe("Fun fact shown after the question"),
      })),
    }),
    widget: {
      name: "trivia-game",
      invoking: "Setting up the game...",
      invoked: "Game ready! Players can join now.",
    },
  },
  async ({ title, questions }) => {
    try {
      const joinCode = generateCode();

      const { data: game, error: gameErr } = await supabase
        .from("games")
        .insert({ join_code: joinCode, title, status: "waiting", current_question: 0 })
        .select()
        .single();

      if (gameErr) return error(`Failed to create game: ${gameErr.message}`);

      const questionRows = questions.map((q, i) => ({
        game_id: game.id,
        question_text: q.question_text,
        options: q.options,
        correct_index: q.correct_index,
        order_index: i,
        fun_fact: q.fun_fact || "",
      }));

      await supabase.from("questions").insert(questionRows);

      return widget({
        props: {
          gameId: game.id,
          joinCode,
          title,
          status: "waiting",
          currentQuestion: 0,
          totalQuestions: questions.length,
          players: [],
          leaderboard: [],
        },
        output: text(`Game "${title}" created! Join code: ${joinCode}. Players: open Claude, add this MCP, then say "join game ${joinCode} as [your name]".`),
      });
    } catch (err) {
      return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

server.tool(
  {
    name: "start-game",
    description: "Start a trivia game that's in 'waiting' status",
    schema: z.object({
      game_id: z.string().describe("Game ID to start"),
    }),
    widget: {
      name: "trivia-game",
      invoking: "Starting game...",
      invoked: "Game started!",
    },
  },
  async ({ game_id }) => {
    try {
      await supabase.from("games").update({ status: "active", current_question: 0 }).eq("id", game_id);

      // REALTIME: host widget picks up via games subscription — no new iframe
      // REVERT: replace with widget() block that was here (fetches game/questions/players and returns full props)
      return text("Game started! Question 1 is live.");
    } catch (err) {
      return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

server.tool(
  {
    name: "next-question",
    description: "Advance to the next question in a trivia game",
    schema: z.object({
      game_id: z.string().describe("Game ID"),
    }),
    widget: {
      name: "trivia-game",
      invoking: "Loading next question...",
      invoked: "Next question!",
    },
  },
  async ({ game_id }) => {
    try {
      const { data: game } = await supabase.from("games").select("*").eq("id", game_id).single();
      if (!game) return error("Game not found");

      const nextQ = game.current_question + 1;
      const { data: questions } = await supabase.from("questions").select("*").eq("game_id", game_id).order("order_index");

      if (nextQ >= (questions?.length || 0)) {
        // Game over
        await supabase.from("games").update({ status: "finished", current_question: nextQ }).eq("id", game_id);
        const { data: players } = await supabase.from("players").select("*").eq("game_id", game_id);

        // REALTIME: widget updates via games subscription — no new iframe
        // REVERT: replace with widget() block that was here
        return text("Game over! The host widget will show the final leaderboard.");
      }

      await supabase.from("games").update({ current_question: nextQ }).eq("id", game_id);
      // REALTIME: widget updates via games subscription — no new iframe
      // REVERT: replace with widget() block that was here (fetches players and returns full props)
      return text(`Question ${nextQ + 1} of ${questions?.length}!`);
    } catch (err) {
      return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

server.tool(
  {
    name: "get-game-state",
    description: "Get the current state of a trivia game including leaderboard, current question, and players",
    schema: z.object({
      game_id: z.string().describe("Game ID"),
    }),
    widget: {
      name: "trivia-game",
      invoking: "Loading game...",
      invoked: "Game state loaded",
    },
  },
  async ({ game_id }) => {
    try {
      const { data: game } = await supabase.from("games").select("*").eq("id", game_id).single();
      if (!game) return error("Game not found");

      const { data: questions } = await supabase.from("questions").select("*").eq("game_id", game_id).order("order_index");
      const { data: players } = await supabase.from("players").select("*").eq("game_id", game_id);

      return widget({
        props: {
          gameId: game_id,
          joinCode: game.join_code,
          title: game.title,
          status: game.status,
          currentQuestion: game.current_question,
          totalQuestions: questions?.length || 0,
          currentQuestionData: questions?.[game.current_question] || null,
          players: players || [],
          leaderboard: (players || []).sort((a: any, b: any) => b.score - a.score),
        },
        output: text(`Game "${game.title}" - ${game.status}. ${players?.length || 0} players. Question ${game.current_question + 1}/${questions?.length || 0}.`),
      });
    } catch (err) {
      return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

server.tool(
  {
    name: "join-game",
    description: "Join a trivia game using a join code. Returns a player widget with live answer buttons — everything happens in chat, no external URL needed.",
    schema: z.object({
      join_code: z.string().describe("The 4-character game join code, e.g. 'AB12'"),
      player_name: z.string().describe("The player's display name"),
    }),
    widget: {
      name: "trivia-player",
      invoking: "Joining game...",
      invoked: "Joined! Waiting for host to start.",
    },
  },
  async ({ join_code, player_name }) => {
    try {
      const { data: game, error: gameErr } = await supabase
        .from("games")
        .select("*")
        .eq("join_code", join_code.toUpperCase())
        .single();

      if (gameErr || !game) return error(`Game not found with code: ${join_code}`);

      const { data: player, error: playerErr } = await supabase
        .from("players")
        .insert({ game_id: game.id, name: player_name, score: 0 })
        .select()
        .single();

      if (playerErr || !player) return error(`Failed to join game: ${playerErr?.message}`);

      let currentQuestionData = null;
      if (game.status === "active") {
        const { data: questions } = await supabase
          .from("questions")
          .select("*")
          .eq("game_id", game.id)
          .order("order_index");
        currentQuestionData = questions?.[game.current_question] || null;
      }

      return widget({
        props: {
          playerId: player.id,
          playerName: player_name,
          gameId: game.id,
          joinCode: game.join_code,
          gameTitle: game.title,
          status: game.status,
          currentQuestion: game.current_question,
          currentQuestionData,
          myScore: 0,
          hasAnswered: false,
        },
        output: text(`${player_name} joined "${game.title}"! Player ID: ${player.id}. Game is ${game.status}. Tap an answer button when the question appears.`),
      });
    } catch (err) {
      return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

server.tool(
  {
    name: "submit-answer",
    description: "Submit a player's answer for the current trivia question. Called automatically when a player taps an answer button in the widget.",
    schema: z.object({
      game_id: z.string().describe("Game ID"),
      player_id: z.string().describe("Player ID from join-game"),
      question_id: z.string().describe("ID of the question being answered"),
      selected_index: z.number().min(0).max(3).describe("Answer option index (0-3) that the player selected"),
    }),
    widget: {
      name: "trivia-player",
      invoking: "Submitting answer...",
      invoked: "Answer submitted!",
    },
  },
  async ({ game_id, player_id, question_id, selected_index }) => {
    try {
      const { data: game } = await supabase.from("games").select("*").eq("id", game_id).single();
      if (!game) return error("Game not found");

      const { data: question } = await supabase.from("questions").select("*").eq("id", question_id).single();
      if (!question) return error("Question not found");

      // Check if already answered
      const { data: existing } = await supabase
        .from("answers")
        .select("id")
        .eq("player_id", player_id)
        .eq("question_id", question_id)
        .maybeSingle();
      if (existing) return error("Already answered this question");

      const isCorrect = selected_index === question.correct_index;
      const points = isCorrect ? 200 : 0;

      await supabase.from("answers").insert({
        game_id,
        player_id,
        question_id,
        selected_index,
        is_correct: isCorrect,
      });

      const { data: playerRow } = await supabase.from("players").select("name, score").eq("id", player_id).single();
      const newScore = (playerRow?.score || 0) + points;
      await supabase.from("players").update({ score: newScore }).eq("id", player_id);

      const { data: questions } = await supabase
        .from("questions")
        .select("*")
        .eq("game_id", game_id)
        .order("order_index");
      const currentQuestionData = game.status === "active" ? (questions?.[game.current_question] || null) : null;

      // REALTIME: player widget computes result instantly from local data — no new iframe
      // REVERT: replace with widget() block that was here (drives wasCorrect/score/funFact via props)
      return text(`Answer recorded. ${isCorrect ? "Correct! +200 points" : "Wrong!"} Score: ${newScore}`);
    } catch (err) {
      return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

// ============================================================================
// STATIC FILES
// ============================================================================

// Serve player page — public/ is not auto-served by mcp-use
server.app.get("/play.html", (c) => {
  const attempts = [
    join(process.cwd(), "public", "play.html"),
    join(__dir, "..", "public", "play.html"),
    join(__dir, "public", "play.html"),
  ];
  for (const p of attempts) {
    try {
      return c.html(readFileSync(p, "utf-8"));
    } catch {}
  }
  return c.text(`play.html not found. cwd=${process.cwd()} dir=${__dir}`, 404);
});

// ============================================================================
// START SERVER
// ============================================================================

await server.listen();
console.log("CollabEngine MCP server running");
