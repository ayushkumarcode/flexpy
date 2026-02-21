# CollabEngine - Session Summary & Handoff

## What We're Building
A **Collaborative MCP App Engine** for the Manufact MCP Apps Hackathon at YC (Feb 21, 2026). It creates shared, real-time collaborative widgets inside ChatGPT/Claude from natural language.

**Demo 1 (60s):** Trip planner - two people comparing flights/hotels from separate AI chats, synced live.
**Demo 2 (30s):** Live trivia game about YC partners - audience joins on phones via QR code, leaderboard updates real-time.

**Prize:** Guaranteed YC interview. **Judge:** Jon Xu (YC GP).

---

## Evaluation Criteria (from hackathon slides)

| # | Criteria | Weight | Our Status |
|---|----------|--------|------------|
| 1 | **Originality** - "I didn't know you could build that as an MCP App" | 30pt | STRONG - real-time collab across separate AI chats is novel |
| 2 | **Real-World Usefulness** - solves a real problem | 30pt | STRONG - trip planning with friends, group decisions |
| 3 | **Widget-Model Interaction** - useCallTool, sendFollowUpMessage, state, setState | 20pt | BUILT - AI adds items, widget has "AI Compare" button using sendFollowUpMessage, callTool for votes |
| 4 | **User Experience & UI** | 10pt | NEEDS TESTING - widgets built with Tailwind, not yet visually verified |
| 5 | **Production Readiness** - OAuth, onboarding, config | 10pt | PARTIAL - share code join flow works, NOT yet deployed to Manufact |

### Hackathon Requirements Compliance
- **Must be MCP Apps (not standalone agents):** YES - we use mcp-use SDK with React widgets in resources/ ✅
- **Built with mcp-use SDK:** YES ✅
- **Deployed on Manufact MCP Cloud:** NO - NOT YET ❌ (critical!)
- **Demo on ChatGPT or Claude:** NOT YET TESTED ❌ (critical!)

---

## What's Built & Verified

### Server (index.ts)
9 MCP tools, all tested via MCP endpoint against live Supabase:

| Tool | Purpose | Tested? |
|------|---------|---------|
| `create-board` | Creates collaborative board, generates share code | ✅ Verified - creates row in Supabase, returns widget props |
| `join-board` | Join board by share code | ✅ Code written, follows same pattern |
| `add-items` | Add items to a board column | ✅ Verified - inserts items, returns full board state |
| `get-board` | Fetch full board state | ✅ Code written |
| `update-item` | Edit/vote on items | ✅ Code written |
| `create-game` | Create trivia game with AI-generated questions | ✅ Verified - inserts game + questions |
| `start-game` | Start a waiting game | ✅ Code written |
| `next-question` | Advance to next question | ✅ Code written |
| `get-game-state` | Get current game state/leaderboard | ✅ Code written |

### Widgets
| Widget | File | Status |
|--------|------|--------|
| Trip Planner | `resources/trip-planner/widget.tsx` | Built - columns with cards, member avatars, "AI Compare" button, Supabase Realtime subscription. **NOT visually tested.** |
| Trivia Game | `resources/trivia-game/widget.tsx` | Built - QR code join, waiting/active/finished states, live leaderboard, answer distribution. **NOT visually tested.** |

### Player Page
| File | Status |
|------|--------|
| `public/play.html` | Built - standalone HTML, Supabase from CDN, join by code, answer questions, score tracking. Served at `/play.html` (verified HTTP 200). **NOT functionally tested.** |

### Supabase
- **Project URL:** https://hcddekcllbhiiazrcmhi.supabase.co
- **Tables created:** boards, items, members, games, questions, players, answers ✅
- **Realtime enabled:** All tables ✅
- **RLS:** Open policies for hackathon ✅
- **Anon key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZGRla2NsbGJoaWlhenJjbWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDY1NzcsImV4cCI6MjA4NzI4MjU3N30.PxcMSJuqIl8FbHbrkdfI8qsn4JocLPrCAM5TN7ZYYlo

### Dev Server
- Running at `http://localhost:3000`
- Inspector at `http://localhost:3000/inspector`
- MCP endpoint at `http://localhost:3000/mcp`
- 9 tools, 4 resources registered

---

## What's NOT Done (Remaining Steps)

### Step 1: Test widgets visually in Inspector (15 min)
Open http://localhost:3000/inspector. Click `create-board` tool, fill in test params, execute. See if the trip-planner widget renders correctly. Fix any CSS/layout issues. Do the same for `create-game`.

### Step 2: Test real-time sync (10 min)
Open inspector in two browser tabs. In tab 1, create a board. In tab 2, join that board. In tab 1, add items. Verify they appear in tab 2's widget in real-time.

### Step 3: Test trivia player page (10 min)
Create a game via inspector. Open `http://localhost:3000/play.html?code=XXXX` on phone. Join, verify questions load, submit answers, check leaderboard updates.

### Step 4: Deploy to Manufact Cloud (15 min) ⚠️ CRITICAL
```bash
npx @mcp-use/cli login
npx @mcp-use/cli deploy
```
Get the deployed URL. This is REQUIRED by hackathon rules.

**Potential issue:** Environment variables (SUPABASE_URL, SUPABASE_ANON_KEY) need to be set on Manufact Cloud. Check their dashboard after deploying.

### Step 5: Connect to ChatGPT or Claude (10 min) ⚠️ CRITICAL
- **ChatGPT:** Settings > Developer Mode ON > Connectors > Create > paste Manufact URL
- **Claude:** Settings > Connectors > Add custom connector > paste URL
- Both require paid plans

### Step 6: End-to-end test in real client (15 min)
In ChatGPT/Claude, say "Plan a trip to Tokyo with friends." Verify:
- Widget renders in the chat
- Share code visible
- Ask AI to add flights
- Items appear on widget
- Second user joins from their client
- Real-time sync works

### Step 7: Polish & fix issues (remaining time)
Fix whatever breaks in steps 1-6.

---

## Project Structure
```
flexpy/
├── index.ts                          # MCP server with 9 tools
├── lib/
│   └── supabase.ts                   # Server-side Supabase client + helpers
├── resources/
│   ├── styles.css                    # Tailwind entry
│   ├── trip-planner/
│   │   └── widget.tsx                # Collaborative board widget
│   └── trivia-game/
│       └── widget.tsx                # Trivia host widget
├── public/
│   └── play.html                     # Trivia player page (phone)
├── package.json
├── tsconfig.json
├── .env                              # Supabase credentials (gitignored)
├── .gitignore
├── supabase-setup.sql                # DB schema (already run)
├── ARCHITECTURE.md                   # Full technical architecture doc
├── SESSION-SUMMARY.md                # This file
└── README.md
```

## Git
- **Repo:** https://github.com/codejoey/flexpy
- **Branch:** `ayush` (current working branch, not yet pushed)
- **Main branch:** has ARCHITECTURE.md committed

## Key Technical Decisions
- **mcp-use SDK** (not raw ext-apps) - higher-level abstractions, auto widget discovery
- **Supabase Realtime** for cross-user sync - widgets subscribe to postgres_changes
- **Fallback:** callTool polling if WebSocket doesn't work in iframe CSP
- **Player page** is standalone HTML (not MCP) - zero friction for audience to join trivia
- **QR code** via api.qrserver.com img tag - no JS dependency
- **Supabase credentials hardcoded in widgets** - acceptable for hackathon, anon key is public-safe with RLS

## Commands
```bash
npm run dev      # Start dev server with hot reload + inspector
npm run build    # Production build
npm run deploy   # Deploy to Manufact Cloud
```
