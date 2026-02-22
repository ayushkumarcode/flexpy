// Auto-generated tool registry types - DO NOT EDIT MANUALLY
// This file is regenerated whenever tools are added, removed, or updated during development
// Generated at: 2026-02-22T00:43:34.160Z

declare module "mcp-use/react" {
  interface ToolRegistry {
    "add-items": {
      input: { "board_id": string; "column": string; "items": Array<{ "title": string; "description"?: string | undefined; "added_by": string; "metadata"?: Record<string, any> | undefined; "link"?: string | undefined }> };
      output: Record<string, unknown>;
    };
    "create-board": {
      input: { "type": string; "title": string; "columns": Array<string>; "user_name": string };
      output: Record<string, unknown>;
    };
    "create-game": {
      input: { "title": string; "questions": Array<{ "question_text": string; "options": Array<string>; "correct_index": number; "fun_fact"?: string | undefined }> };
      output: Record<string, unknown>;
    };
    "get-board": {
      input: { "board_id": string };
      output: Record<string, unknown>;
    };
    "get-game-state": {
      input: { "game_id": string };
      output: Record<string, unknown>;
    };
    "join-board": {
      input: { "share_code": string; "user_name": string };
      output: Record<string, unknown>;
    };
    "join-game": {
      input: { "join_code": string; "player_name": string };
      output: Record<string, unknown>;
    };
    "next-question": {
      input: { "game_id": string };
      output: Record<string, unknown>;
    };
    "start-game": {
      input: { "game_id": string };
      output: Record<string, unknown>;
    };
    "submit-answer": {
      input: { "game_id": string; "player_id": string; "question_id": string; "selected_index": number };
      output: Record<string, unknown>;
    };
    "update-item": {
      input: { "item_id": string; "board_id": string; "updates": { "title"?: string | undefined; "description"?: string | undefined; "votes_up"?: number | undefined; "metadata"?: Record<string, any> | undefined } };
      output: Record<string, unknown>;
    };
  }
}

export {};
