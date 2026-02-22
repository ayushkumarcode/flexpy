import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import React, { useEffect, useState } from "react";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import "../styles.css";

const SUPABASE_URL = "https://hcddekcllbhiiazrcmhi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZGRla2NsbGJoaWlhenJjbWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDY1NzcsImV4cCI6MjA4NzI4MjU3N30.PxcMSJuqIl8FbHbrkdfI8qsn4JocLPrCAM5TN7ZYYlo";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const questionSchema = z.object({
  id: z.string(),
  question_text: z.string(),
  options: z.array(z.string()),
  correct_index: z.number(),
  fun_fact: z.string().optional(),
});

const propSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  gameId: z.string(),
  joinCode: z.string(),
  gameTitle: z.string(),
  status: z.string(),
  currentQuestion: z.number(),
  currentQuestionData: questionSchema.nullable().optional(),
  myScore: z.number(),
  hasAnswered: z.boolean().optional(),
  selectedAnswer: z.number().nullable().optional(),
  wasCorrect: z.boolean().nullable().optional(),
  correctAnswer: z.number().optional(),
  funFact: z.string().optional(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Trivia game player view — shows current question with tappable answer buttons, live score, and real-time game state",
  props: propSchema,
  exposeAsTool: false,
  metadata: {
    csp: {
      connectDomains: [
        "https://hcddekcllbhiiazrcmhi.supabase.co",
        "wss://hcddekcllbhiiazrcmhi.supabase.co",
      ],
    },
    autoResize: true,
  },
};

type Props = z.infer<typeof propSchema>;

const OPTION_COLORS = [
  "bg-red-500 hover:bg-red-600 active:bg-red-700",
  "bg-blue-500 hover:bg-blue-600 active:bg-blue-700",
  "bg-amber-500 hover:bg-amber-600 active:bg-amber-700",
  "bg-green-500 hover:bg-green-600 active:bg-green-700",
];
const OPTION_LETTERS = ["A", "B", "C", "D"];

const TriviaPlayer: React.FC = () => {
  const { props, isPending, theme, sendFollowUpMessage } = useWidget<Props>();
  const isDark = theme === "dark";

  const [gameStatus, setGameStatus] = useState(props?.status || "waiting");
  const [currentQ, setCurrentQ] = useState(props?.currentQuestion ?? 0);
  const [questionData, setQuestionData] = useState<z.infer<typeof questionSchema> | null>(
    props?.currentQuestionData || null
  );
  const [myScore, setMyScore] = useState(props?.myScore ?? 0);
  const [hasAnswered, setHasAnswered] = useState(props?.hasAnswered || false);
  const [selected, setSelected] = useState<number | null>(props?.selectedAnswer ?? null);
  const [wasCorrect, setWasCorrect] = useState<boolean | null | undefined>(
    props?.wasCorrect
  );
  const [funFact, setFunFact] = useState(props?.funFact || "");

  // Sync props when a tool call (join-game or submit-answer) returns new data
  useEffect(() => {
    if (!props) return;
    if (props.status) setGameStatus(props.status);
    if (props.myScore !== undefined) setMyScore(props.myScore);
    if (props.hasAnswered !== undefined) setHasAnswered(props.hasAnswered);
    if (props.selectedAnswer !== undefined) setSelected(props.selectedAnswer ?? null);
    if (props.wasCorrect !== undefined) setWasCorrect(props.wasCorrect ?? null);
    if (props.funFact !== undefined) setFunFact(props.funFact || "");
    if (props.currentQuestionData !== undefined)
      setQuestionData(props.currentQuestionData || null);
    if (props.currentQuestion !== undefined) setCurrentQ(props.currentQuestion);
  }, [props]);

  // Subscribe to game state changes (host starts game, advances questions, ends game)
  useEffect(() => {
    if (!props?.gameId) return;

    const channel = sb
      .channel(`player-game-${props.gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${props.gameId}`,
        },
        async (payload) => {
          const game = payload.new as any;
          setGameStatus(game.status);

          if (game.current_question !== currentQ) {
            // New question — reset answer state
            setCurrentQ(game.current_question);
            setHasAnswered(false);
            setSelected(null);
            setWasCorrect(undefined);
            setFunFact("");

            // Fetch the new question
            const { data: qs } = await sb
              .from("questions")
              .select("*")
              .eq("game_id", props.gameId)
              .order("order_index");
            setQuestionData(qs?.[game.current_question] || null);
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [props?.gameId, currentQ]);

  if (isPending || !props) {
    return (
      <McpUseProvider autoSize>
        <div className={`p-8 rounded-2xl ${isDark ? "bg-gray-900" : "bg-gray-50"}`}>
          <div className="animate-pulse space-y-3">
            <div className={`h-6 w-48 rounded ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
            <div className={`h-32 rounded ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const bg = isDark ? "bg-gray-900" : "bg-white";
  const cardBg = isDark ? "bg-gray-800" : "bg-gray-50";
  const textPrimary = isDark ? "text-white" : "text-gray-900";
  const textSecondary = isDark ? "text-gray-400" : "text-gray-500";

  const handleAnswer = (index: number) => {
    if (hasAnswered || !questionData) return;
    setSelected(index);
    setHasAnswered(true);
    sendFollowUpMessage?.(
      `Submit answer ${index} for game ${props.gameId}, player ${props.playerId}, question ${questionData.id}`
    );
  };

  return (
    <McpUseProvider autoSize>
      <div className={`${bg} rounded-2xl p-5 min-w-[380px]`}>
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className={`text-base font-bold truncate ${textPrimary}`}>{props.gameTitle}</h2>
          <div
            className={`text-sm font-bold px-3 py-1 rounded-full ${
              isDark ? "bg-indigo-900 text-indigo-300" : "bg-indigo-100 text-indigo-700"
            }`}
          >
            {props.playerName} · {myScore} pts
          </div>
        </div>

        {/* Waiting for host */}
        {gameStatus === "waiting" && (
          <div className={`${cardBg} rounded-xl p-8 text-center`}>
            <div className="text-5xl mb-3">⏳</div>
            <h3 className={`text-xl font-bold ${textPrimary}`}>You're in!</h3>
            <p className={`mt-2 text-sm ${textSecondary}`}>
              Waiting for the host to start the game…
            </p>
            <p
              className={`mt-4 text-3xl font-mono font-bold tracking-widest ${
                isDark ? "text-indigo-400" : "text-indigo-600"
              }`}
            >
              {props.joinCode}
            </p>
          </div>
        )}

        {/* Active — show answer buttons */}
        {gameStatus === "active" && questionData && !hasAnswered && (
          <div className="space-y-4">
            <div className={`${cardBg} rounded-xl p-4`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${textSecondary} mb-2`}>
                Question {currentQ + 1}
              </p>
              <p className={`text-lg font-bold ${textPrimary}`}>{questionData.question_text}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {questionData.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  className={`${OPTION_COLORS[i]} text-white rounded-xl p-4 text-left font-semibold transition-transform active:scale-95 cursor-pointer`}
                >
                  <span className="text-xs opacity-70 block mb-1 font-mono">
                    {OPTION_LETTERS[i]}
                  </span>
                  <span className="text-sm leading-snug">{opt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active — submitted, waiting for result */}
        {gameStatus === "active" && hasAnswered && wasCorrect === undefined && questionData && (
          <div className="space-y-4">
            <div className={`${cardBg} rounded-xl p-4`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${textSecondary} mb-2`}>
                Question {currentQ + 1}
              </p>
              <p className={`text-lg font-bold ${textPrimary}`}>{questionData.question_text}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {questionData.options.map((opt, i) => (
                <div
                  key={i}
                  className={`rounded-xl p-4 text-left font-semibold ${
                    i === selected
                      ? `${OPTION_COLORS[i].split(" ")[0]} text-white`
                      : isDark
                      ? "bg-gray-700 text-gray-500"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  <span className="text-xs opacity-70 block mb-1 font-mono">
                    {OPTION_LETTERS[i]}
                  </span>
                  <span className="text-sm leading-snug">{opt}</span>
                </div>
              ))}
            </div>
            <p className={`text-center text-sm ${textSecondary}`}>Submitted! Waiting for result…</p>
          </div>
        )}

        {/* Active — result shown */}
        {gameStatus === "active" && hasAnswered && wasCorrect !== undefined && wasCorrect !== null && (
          <div className="space-y-4">
            <div
              className={`rounded-xl p-6 text-center ${
                wasCorrect ? "bg-green-500" : "bg-red-500"
              }`}
            >
              <div className="text-4xl mb-2">{wasCorrect ? "✓" : "✗"}</div>
              <h3 className="text-white text-2xl font-bold">
                {wasCorrect ? "Correct!" : "Wrong!"}
              </h3>
              {wasCorrect && <p className="text-white/80 mt-1 text-sm">+200 points</p>}
            </div>
            {funFact && (
              <div className={`${cardBg} rounded-xl p-4`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${textSecondary} mb-1`}>
                  Fun fact
                </p>
                <p className={`text-sm ${textPrimary}`}>{funFact}</p>
              </div>
            )}
            <p className={`text-center text-sm ${textSecondary}`}>
              Waiting for the next question…
            </p>
          </div>
        )}

        {/* Active — no question loaded yet */}
        {gameStatus === "active" && !questionData && (
          <div className={`${cardBg} rounded-xl p-8 text-center`}>
            <p className={`text-sm ${textSecondary}`}>Loading question…</p>
          </div>
        )}

        {/* Game finished */}
        {gameStatus === "finished" && (
          <div className={`${cardBg} rounded-xl p-8 text-center`}>
            <div className="text-5xl mb-3">🏁</div>
            <h3 className={`text-2xl font-bold ${textPrimary}`}>Game Over!</h3>
            <p
              className={`mt-3 text-4xl font-bold ${
                isDark ? "text-indigo-400" : "text-indigo-600"
              }`}
            >
              {myScore}
            </p>
            <p className={`text-sm mt-1 ${textSecondary}`}>points · {props.playerName}</p>
          </div>
        )}
      </div>
    </McpUseProvider>
  );
};

export default TriviaPlayer;
