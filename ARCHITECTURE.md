# Collaborative MCP App Engine - Technical Architecture

## What We're Building

An MCP App Engine that creates collaborative widgets on the fly from natural language. Users talk to their AI (ChatGPT/Claude), and interactive shared widgets appear in their chat. Multiple users interact with the same widget from their own separate AI chats, in real-time.

**Demo 1 (60s):** Collaborative trip planner - two people comparing flights/hotels from separate chats, synced live, AI reasons about shared state.

**Demo 2 (30s):** Live trivia game about YC partners - funny AI-generated questions, audience joins on their phones via QR code, leaderboard updates in real-time. Shows generalizability (it's an engine, not one app).

---

## Hackathon Context

- **Event:** Manufact MCP Apps Hackathon, Feb 21 2026, YC office SF
- **Prize:** Guaranteed YC interview
- **Judge:** Jon Xu (YC GP)
- **Requirement:** Build with mcp-use SDK, deploy to Manufact Cloud

### Evaluation Criteria

| # | Criteria | Weight | Our Strategy |
|---|----------|--------|-------------|
| 1 | **Originality** | 30pt | "I didn't know you could do real-time collaboration across different people's AI chats via MCP" |
| 2 | **Real-World Usefulness** | 30pt | Trip planning with friends = universal pain point. Everyone has copy-pasted ChatGPT outputs into group chats. |
| 3 | **Widget-Model Interaction** | 20pt | Rich two-way: callTool(), sendFollowUpMessage(), state/setState, AI reasoning about shared state |
| 4 | **User Experience & UI** | 10pt | Clean card-based boards, real-time sync animations, dark/light theme support |
| 5 | **Production Readiness** | 10pt | Share code to join (no config), one-time MCP server URL paste, Supabase handles persistence |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server (index.ts)                    │
│                     mcp-use SDK + Hono                       │
│                                                              │
│  Tools (called by AI):              Serves:                  │
│  ├── create-board                   ├── /mcp (MCP endpoint)  │
│  ├── join-board                     ├── /inspector            │
│  ├── add-items                      └── /public/* (static)   │
│  ├── get-board                           └── play.html       │
│  ├── update-item                                             │
│  ├── create-game                                             │
│  ├── start-game                                              │
│  ├── next-question                                           │
│  └── get-game-state                                          │
│         │                                                    │
│         ▼                                                    │
│  lib/supabase.ts (server-side Supabase client)               │
└─────────────┬────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Supabase                                 │
│                                                              │
│  Tables:                    Realtime:                        │
│  ├── boards                 ├── postgres_changes (items)     │
│  ├── items                  ├── broadcast (game state)       │
│  ├── members                └── presence (player tracking)   │
│  ├── games                                                   │
│  ├── questions                                               │
│  ├── players                                                 │
│  └── answers                                                 │
└──────┬──────────────────────────────┬────────────────────────┘
       │                              │
       ▼                              ▼
┌──────────────────┐    ┌──────────────────────────┐
│  MCP Widgets      │    │  Player Page              │
│  (in ChatGPT/     │    │  (public/play.html)       │
│   Claude iframe)  │    │                           │
│                   │    │  Standalone web page       │
│  trip-planner/    │    │  Supabase JS from CDN     │
│   widget.tsx      │    │  No MCP, no build step     │
│                   │    │  Players open on phone     │
│  trivia-game/     │    │  via QR code / join link   │
│   widget.tsx      │    │                           │
└──────────────────┘    └──────────────────────────┘
```

---

## Project Structure

```
flexpy/
├── index.ts                          # MCP server - all tool definitions
├── lib/
│   └── supabase.ts                   # Server-side Supabase client
├── resources/
│   ├── trip-planner/
│   │   └── widget.tsx                # Trip planner board widget
│   └── trivia-game/
│       └── widget.tsx                # Trivia host widget (leaderboard, questions)
├── public/
│   └── play.html                     # Trivia player page (standalone, no build)
├── package.json
├── tsconfig.json
└── .env                              # SUPABASE_URL, SUPABASE_ANON_KEY
```

---

## Database Schema (Supabase)

No dynamic tables. One fixed schema serves infinite instances. Every new board/game = new row, not new table.

### Trip Planner Tables

```sql
-- boards: one row per board instance
boards
  - id: uuid (PK, default gen_random_uuid())
  - share_code: text (unique) -- e.g. "TOKYO-7F2A"
  - type: text -- 'trip-planner', 'gift-brainstorm', etc
  - title: text -- "Tokyo Trip April 2026"
  - columns: jsonb -- ["Flights", "Hotels", "Activities"]
  - created_at: timestamptz (default now())

-- items: every card on every board
items
  - id: uuid (PK, default gen_random_uuid())
  - board_id: uuid (FK -> boards)
  - column_name: text -- which column this card is in
  - title: text -- "United $650 direct"
  - description: text -- "SFO→NRT, 11hr, departs 2pm"
  - added_by: text -- user name
  - added_by_color: text -- hex color for avatar
  - votes_up: integer (default 0)
  - metadata: jsonb -- {price: 650, link: "...", airline: "United", ...}
  - link: text -- external booking/product link
  - created_at: timestamptz (default now())

-- members: who's on each board
members
  - id: uuid (PK, default gen_random_uuid())
  - board_id: uuid (FK -> boards)
  - name: text
  - color: text -- hex color
  - joined_at: timestamptz (default now())
```

### Trivia Game Tables

```sql
-- games: one row per game instance
games
  - id: uuid (PK, default gen_random_uuid())
  - join_code: text (unique) -- e.g. "YC42"
  - title: text -- "YC Partners Roast Quiz"
  - status: text -- 'waiting', 'active', 'finished'
  - current_question: integer (default 0) -- index of current question
  - created_at: timestamptz (default now())

-- questions: AI-generated questions for each game
questions
  - id: uuid (PK, default gen_random_uuid())
  - game_id: uuid (FK -> games)
  - question_text: text -- "Which YC partner said 'Do things that don't scale'?"
  - options: jsonb -- ["Paul Graham", "Sam Altman", "Michael Seibel", "Dalton Caldwell"]
  - correct_index: integer -- 0
  - order_index: integer -- question order
  - fun_fact: text -- shown after answering

-- players: who joined each game
players
  - id: uuid (PK, default gen_random_uuid())
  - game_id: uuid (FK -> games)
  - name: text
  - score: integer (default 0)
  - joined_at: timestamptz (default now())

-- answers: each player's response to each question
answers
  - id: uuid (PK, default gen_random_uuid())
  - question_id: uuid (FK -> questions)
  - player_id: uuid (FK -> players)
  - selected_index: integer
  - is_correct: boolean
  - time_ms: integer -- how fast they answered (for scoring)
```

### Example Data

```
boards table
─────────────────────────────────────────────────────────
id          | share_code | type           | title
─────────────────────────────────────────────────────────
uuid-001    | TOKYO-7F2A | trip-planner   | "Tokyo Trip April 2026"
uuid-002    | GIFT-X91B  | gift-brainstorm| "Mom's Birthday Gift"
uuid-003    | TRIP-K33Z  | trip-planner   | "Bali with roommates"

items table
─────────────────────────────────────────────────────────
id       | board_id  | column    | title              | added_by
─────────────────────────────────────────────────────────
uuid-101 | uuid-001  | Flights   | "United $650 direct"| Kumar
uuid-102 | uuid-001  | Flights   | "JAL $590 1-stop"  | Sarah
uuid-103 | uuid-001  | Hotels    | "Shinjuku Hostel"   | Mike
uuid-104 | uuid-002  | Ideas     | "AirPods Max"       | Kumar

games table
─────────────────────────────────────────────────────
id       | join_code | title                    | status
─────────────────────────────────────────────────────
uuid-201 | YC42      | "YC Partners Roast Quiz" | active
uuid-202 | HACK99    | "AI Trivia Night"        | waiting
```

---

## MCP Tools

### Board Tools (Trip Planner / Any Board)

| Tool | Called by | Schema | What it does |
|------|----------|--------|-------------|
| `create-board` | AI | `{type: string, title: string, columns: string[]}` | Creates board in Supabase, generates share code, returns trip-planner widget |
| `join-board` | AI | `{share_code: string, user_name: string}` | Looks up board by share code, adds member, returns trip-planner widget |
| `add-items` | AI | `{board_id: string, column: string, items: Item[]}` | AI adds researched items (flights, hotels) to a board column |
| `get-board` | AI or Widget | `{board_id: string}` | Fetches full board state (for AI analysis or widget refresh) |
| `update-item` | AI or Widget | `{item_id: string, updates: Partial<Item>}` | Edit item, add recommendation tag, toggle vote |

### Game Tools (Trivia)

| Tool | Called by | Schema | What it does |
|------|----------|--------|-------------|
| `create-game` | AI | `{title: string, questions: Question[]}` | Creates game, stores AI-generated questions, returns trivia-game widget |
| `start-game` | AI | `{game_id: string}` | Sets game status to 'active', current_question to 0 |
| `next-question` | AI | `{game_id: string}` | Advances current_question index |
| `get-game-state` | AI or Widget | `{game_id: string}` | Fetches leaderboard, current question, player count |

---

## Widget-Model Interaction (Criteria #3)

### Trip Planner Widget

| Direction | What happens | API |
|-----------|-------------|-----|
| Widget -> Model | User clicks "Compare these 2" button | `sendFollowUpMessage("Compare the United and JAL flights")` |
| Model -> Widget | AI researches and adds flight cards | AI calls `add-items` tool, widget sees new props |
| Widget -> Server | User votes on a card | `callTool('update-item', {item_id, updates: {votes_up: +1}})` |
| Widget -> Server | Widget polls for latest state | `callTool('get-board', {board_id})` every 3s (fallback) |
| Widget state | Board persists across messages | `setState()` / Supabase as source of truth |
| Model -> Widget | AI adds "Recommended" badge | AI calls `update-item` with recommendation metadata |

### Trivia Game Widget

| Direction | What happens | API |
|-----------|-------------|-----|
| Model -> Widget | AI generates questions and creates game | AI calls `create-game`, widget renders with props |
| Widget -> Server | Widget polls for player joins/answers | `callTool('get-game-state')` or Supabase Realtime |
| Widget -> Model | Host clicks "Next Question" | `sendFollowUpMessage("Next question")` or `callTool('next-question')` |
| External -> Server | Players submit answers from play.html | Direct Supabase INSERT (not MCP) |

---

## Real-Time Sync Strategy

### Primary: Supabase Realtime WebSocket from Widget

Widget imports `@supabase/supabase-js` (bundled by Vite), subscribes to changes:

```typescript
// Trip planner: subscribe to item changes
supabase
  .channel(`board-${boardId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `board_id=eq.${boardId}` }, (payload) => {
    updateBoard(payload);
  })
  .subscribe();
```

**CSP config required:**
```json
{
  "connectDomains": ["https://YOUR.supabase.co", "wss://YOUR.supabase.co"]
}
```

### Fallback: callTool Polling

If WebSocket doesn't work in the iframe, poll via MCP tools:

```typescript
setInterval(async () => {
  const result = await callTool('get-board', { board_id: boardId });
  setState(result);
}, 3000);
```

No CSP needed. Guaranteed to work on all MCP clients.

### Player Page (public/play.html)

Regular web page - no CSP restrictions. Supabase Realtime works normally:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script>
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const channel = supabase.channel(`game:${joinCode}`);
  channel.on('broadcast', { event: 'game_state' }, (payload) => {
    renderQuestion(payload);
  }).subscribe();
</script>
```

---

## Demo Data Flows

### Trip Planner Flow

```
You: "Plan a trip to Tokyo with friends"
  → AI calls create-board → Supabase INSERT boards → widget renders with share code
  → AI calls add-items (flights it researched) → Supabase INSERT items → widget shows cards

Friend: "Join board TOKYO-7F2A"
  → AI calls join-board → Supabase INSERT members → widget renders with current state
  → Friend's widget subscribes to Supabase Realtime on items table
  → Friend's AI calls add-items → Supabase INSERT → YOUR widget updates instantly

You: "Which flight is cheapest if we factor in luggage?"
  → AI calls get-board → reads all items → reasons about shared state → responds
```

### Trivia Game Flow

```
You: "Start a funny trivia about YC partners"
  → AI generates 8 questions → calls create-game → Supabase INSERT game + questions
  → Widget renders: join code YC42, QR code, "0 players joined"

5 people scan QR → open play.html?code=YC42 → enter names
  → Supabase INSERT players → Widget shows "5 players joined"

You: "Start the game"
  → AI calls start-game → Supabase UPDATE game status='active'
  → Widget shows Question 1 → play.html shows Question 1 + 4 buttons

Players tap answers → Supabase INSERT answers
  → Widget shows live answer distribution bar

You: "Next question" (or click Next in widget)
  → AI calls next-question → game advances
  → Repeat until done → Final leaderboard
```

---

## Demo Script (90 seconds on stage)

### Setup (before going on stage)
- Both laptops have MCP server pre-added to ChatGPT/Claude
- Tab 1: Trip planner already created with some flights
- Tab 2: Trivia game ready to go
- play.html QR code printed/ready

### On Stage

**First 60 seconds - Trip Planner:**
1. Show your chat: "I asked it to plan a trip to Tokyo. Here's my board with flights I researched."
2. Your teammate on their laptop: "I joined the same board from my Claude. Let me add hotels." They type, hotel cards appear on BOTH screens live.
3. You: "Which combo is cheapest?" AI reads the shared board and gives a recommendation.
4. Punchline: "No Google Sheets. No screenshots in group chats. Two people, two AI chats, one shared plan."

**Last 30 seconds - Trivia Game:**
1. "But this isn't just for trips. Watch this."
2. You type: "Start a trivia game about YC partners"
3. New widget appears - totally different UI. QR code on screen.
4. "Everyone, scan this." 5 people in audience join on their phones.
5. Quick question, answers come in, leaderboard shows.
6. Punchline: "Trip planning, trivia games - this engine builds any collaborative app from a conversation."

---

## Verification Status

| Component | Verified? | Source |
|-----------|-----------|--------|
| `create-mcp-use-app` scaffolding | VERIFIED | mcp-use docs, GitHub README |
| `server.tool()` syntax | VERIFIED | mcp-use GitHub, npm examples |
| Widget `useWidget()` hook | VERIFIED | mcp-use README (API surface) |
| `callTool()` from widget | VERIFIED | ext-apps source code |
| `sendFollowUpMessage()` | VERIFIED | ext-apps source code (`app.sendMessage()`) |
| `state()` / `setState()` | PARTIALLY VERIFIED | mcp-use README; ext-apps uses localStorage |
| Multiple widgets per server | VERIFIED | ext-apps examples, mcp-use project structure |
| `requestDisplayMode()` fullscreen | VERIFIED | ext-apps Patterns docs |
| `public/` auto-served | VERIFIED | mcp-use docs ("Automatic public/ folder serving") |
| npm packages in widget.tsx | VERIFIED | Vite bundling, supabase-mcp-server example |
| Supabase Realtime in widget iframe | SPEC SAYS YES, UNTESTED | CSP `connectDomains` supports `wss://` |
| Supabase free tier sufficient | VERIFIED | 200 connections, 100 msg/sec |
| QR code via API img tag | VERIFIED | api.qrserver.com, no JS needed |
| Deploy to Manufact | VERIFIED | `npx @mcp-use/cli deploy` |
| ChatGPT MCP connector flow | VERIFIED | OpenAI docs, requires paid plan |
| Claude MCP connector flow | VERIFIED | Claude Help Center, requires Pro+ |
| Env vars on Manufact | UNVERIFIED | No public docs, check dashboard |

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | WebSocket from widget blocked by CSP | Medium | Low | Fallback to callTool polling (2-3s delay) |
| 2 | QR code API image blocked by CSP | Low | Low | Pre-generate QR image, serve from public/ |
| 3 | Supabase Realtime in widget fails | Medium | Low | All writes via MCP tools; widget polls via callTool |
| 4 | play.html not served from public/ | Low | Low | Deploy to Vercel separately (2 min) |
| 5 | Manufact env vars unclear | Medium | Low | Hardcode Supabase keys for demo |
| 6 | Widget npm imports don't bundle | Low | Low | Load Supabase from CDN in widget |

**Every risk has a verified fallback. Nothing is a showstopper.**

---

## Build Order

1. Scaffold project + Supabase tables (30 min)
2. Server tools + database CRUD (1 hr)
3. Trip planner widget with real-time sync (2 hr)
4. Trivia game widget + player web page (1.5 hr)
5. Polish UI + test with inspector (1 hr)
6. Deploy to Manufact + test on ChatGPT/Claude (30 min)
