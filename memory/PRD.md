# GoWin365 (gowin365x.com) — PRD

## Original Problem Statement
GoWin365 is a real-time crash-style multiplayer casino + cricket betting platform. Players bet virtual balance, watch a multiplier rise, and cash out before it crashes. Also includes live cricket, virtual cricket engine, roulette. Deposits and withdrawals are handled manually between user and admin via UPI/UTR — no payment gateway. UTR duplicates are auto-rejected. Includes wallet, referrals, leaderboard, live chat, bonuses, and full admin portal.

## User Choices Confirmed
- Auth: Email + Password only (no OTP)
- Multiple UPI/QR admin options
- No screenshot uploads — UTR uniqueness enforced
- Admin: `gowin365x@gmail.com` / `Admin@AeroX2026`

## User Personas
- **Casual player** — signs up, gets ₹50 bonus, deposits via UPI+UTR, plays crash rounds, cashes out, withdraws.
- **Admin (operator)** — manages users, approves deposits/withdrawals, configures UPI list, pauses game/edits RTP.

## Tech Stack
- Backend: FastAPI + Motor + WebSocket
- Frontend: React (JS) + Tailwind + shadcn/ui + Framer Motion + Sonner
- Auth: JWT (Bearer tokens in localStorage)
- Game engine: async background loop, provably-fair (SHA-256 server+client seed)

## What's Implemented — v1 (2026-02-08)
### Player app
- Register/Login (email+password) with ₹50 signup bonus + referral code support
- Lobby: live multiplier peek, recent crashes strip, claim daily bonus
- Live crash game: WebSocket state, SVG curve + plane, place bet, auto-cashout, manual cashout, live bets list, in-round chat
- Wallet: balance + full transaction history
- Deposit: multi-UPI selection, UTR submission (duplicate-blocked)
- Withdraw: UPI or bank details, balance auto-locked
- Leaderboard: daily / weekly / all-time (profit ranking)
- Referrals: unique code, share link, stats
- Profile: stats + recent bets + daily bonus claim
- Mobile-first bottom nav (5 tabs)

### v1.1 additions (2026-02-08 → 2026-07-30)
- Forced temp-password reset flow, admin-manual deposit crediting, duplicate UTR tracking
- Host-based admin/player routing, cross-device polling for wallet/deposits
- Support ticketing with Emergent Object Storage for payment proofs
- `/games` catalog dashboard with AeroX Crash live + 8 coming-soon games
- Roulette lobby (`/games/roulette`) with 7 live tables: Hindi, Lightning, American, Mega Fire Blaze, Speed Sic Bo, Bucharest Quantum, Arabic
- **Playable European Roulette engine** (2026-07-30) — `/games/roulette/:tableId` opens a real game with wooden wheel (exact 37-number European sequence), 20s betting → 8s spin → 4s result loop, ball animates to winning number, popup shows result. Bet types: straight (35:1), red/black/even/odd/low/high (1:1), dozens (3:1). Zero rule: only straight-0 wins on zero. Backend engine in `/app/backend/roulette.py` with routes `GET /api/roulette/state`, `POST /api/roulette/bet`, `GET /api/roulette/my-bets`, `GET /api/roulette/history`.

### v1.7 fixes (2026-07-30 — Payouts + Marquee + Wheel Timing)
- **Dozens payout corrected 3:1 → 2:1** (both backend + frontend labels updated) to match standard European roulette and the client's requested payout table
- Payouts now: Straight 35:1, Split 17:1, Street/Trio 11:1, Corner 8:1, Six-Line 5:1, Dozen/Column 2:1, Red/Black/Even/Odd/Low/High 1:1
- Rules modal updated with Dozen 2:1 and new Column 2:1 row
- **Winners ticker → scrolling marquee** — auto-scrolls horizontally (Tailwind keyframe `roulette-marquee`, 35s loop). Short lists are looped so the ticker never feels empty
- **Wheel animation duration reduced 9.5s → 7.5s** so the ball settles cleanly inside the 8s spin phase instead of being cut short at phase transition (should stop ball/result mismatches when this build is redeployed)

### v1.6 fix (2026-07-30 — Desktop Visibility)
- Fixed: on desktop, the table + sidebar were hidden during the spin/result phase because of the sequential mobile layout. Now the wheel, table, and sidebar are all shown side-by-side on `md+` screens at all times; buttons are visually disabled while bets are locked.
- Mobile behaviour unchanged (sequential: only wheel during spin/result, only table during betting).

### v1.5 additions (2026-07-30 — Clean Table Redesign)
- **Removed all visible hotspot markers** — the number grid now looks exactly like the client mockup (clean red/black cells, no yellow lines, no cyan dots, no "6"/"012" labels)
- Inside-bet click zones remain — splits, corners, streets, six-lines and trios still trigger from clicking between cells; chips appear only when a bet is placed
- Kept dozens + columns rows below the number grid on the table

### v1.4 additions (2026-07-30 — Client Design Match)
- Table now has **dozens row (3:1)** and **columns row (2:1)** rendered below the number grid
- **Column payout corrected to 2:1** (was 3:1) to match standard European roulette
- Sidebar redesigned to match client mockup: chip icon card (`₹50 CHIP`), full-width UNDO card with count badge, full-width STAKE pill, yellow-bordered RED/BLACK/EVEN/ODD/1-18/19-36/1st-2nd-3rd 12 cards
- Sidebar chip picker opens as a popover with denomination + rupee label
- Both table and sidebar dozen buttons route to the SAME bet type (differentiated by `-side` suffix on testid)

### v1.3 additions (2026-07-30 — Vertical Board Redesign)
- **Vertical roulette board layout** (0 at top spanning full width, then 12 rows of 1·2·3 / 4·5·6 / ... / 34·35·36)
- **Right sidebar controls**: circular chip picker (opens ₹10-₹1000 popover), circular undo button (with count), stake pill, and outside bets (RED / BLACK / EVEN / ODD / 1-18 / 19-36 / 1st-2nd-3rd 12)
- All inside-bet hotspots (splits, corners, streets, six-lines, trios 0-1-2 & 0-2-3) preserved on the vertical grid
- Mobile-first sizing: 240–280px table + 100–130px sidebar fits within a 390px viewport

### v1.2 additions (2026-07-30)
- Roulette split (17:1), corner (8:1), street (11:1), and six-line (5:1) bets — full inside-bet coverage
- All 12 in-column streets + trios 0-1-2 and 0-2-3 supported
- 11 six-line hotspots at column-boundary bottom edges
- Column bets (2:1) supported in the engine
- **On-table hotspots**: yellow line splits for 0-1 / 0-2 / 0-3 and every adjacent-cell pair; cyan trio circles for 0-1-2 / 0-2-3; yellow lines below each column for streets; cyan "6" dots for six-lines
- **Sequential mobile-first roulette layout**: during BETTING phase only the betting board is visible; during SPINNING / RESULT phase only the wheel is visible
- **Compact action bar** below board: Stake · Chip picker popover (₹10/50/100/500/1000) · Undo Last Bet with count
- Removed labeled Trio/Street outside buttons and legend text in favor of natural on-table hotspots
- Game history modal separate from wallet transactions with 24-hour auto-cleanup

### Admin portal
- Sidebar dashboard with live metrics + game controls
- Users: search, block/unblock, adjust balance
- Deposits queue: pending/approved/rejected tabs, approve credits wallet + 5% bonus
- Withdrawals queue: mark paid or reject (refunds balance)
- UPI/QR CRUD (multi-configurable)
- Game control: pause/resume + house edge tuning
- **Maintenance Mode toggle (Feb 2026)**: per-game ON/OFF for Crash and Roulette. Disabled game -> `/games/status=false`, bet API 503, users see "Under Maintenance" screen; both engine loops idle while off.
- **Crash Bias Mode (Feb 2026)**: admin selects `normal` / `aggressive` / `ruthless`. Aggressive → ~70% rounds crash <2x; Ruthless → ~90% <2x with cap ≈3x. Value persisted in `settings` collection.
- **Single-Session Enforcement (Feb 2026)**: every `/auth/login` rotates a `session_id` UUID on the user doc and embeds it as `sid` in the JWT. `current_user` compares token `sid` vs DB `session_id` — mismatch returns 401 with detail `SESSION_INVALIDATED: ...`. Frontend axios interceptor + AuthContext listener clears localStorage, shows a toast, and redirects the evicted device to `/login` or `/admin/login` after 1.5s (so the toast is visible).
- **In-Play (Feb 2026)**: `/in-play` tab (replaced Leaderboard nav). Backend proxy `GET /api/inplay/matches` using `CRICKET_API_KEY` (CricAPI); 30s in-memory cache to protect the 100/day free-tier quota. Frontend polls every 30s, shows live + upcoming cricket matches with rich cards.
- **Virtual Cricket Phase 1 (Feb 2026)**: `/virtual` route + featured card on `/in-play`. Backend engine (`virtual.py`) runs 3 concurrent simulated T20 matches, ball-by-ball ticks every 6s, ~30 min per full match cycle. Match phases: `pre_match` (3 min betting window) → `toss` (25s animated) → `lineup` (60s team walkout) → `innings1` (~12 min) → `break` (90s) → `innings2` → `completed`. Team pools: International (10 countries) + Domestic (12 Indian states). Rotation: slot 0 domestic, slots 1+2 international. Fixed stake chips: ₹100/₹500/₹1k/₹5k/₹10k.
- **Virtual Cricket Phase 2 — Fancy Markets (Feb 2026)**:
  - **`match_winner`** — mid-match cashout supported (payout = amount × odds_taken ÷ current_odds)
  - **`toss_winner`** — locks the moment `pre_match` ends
  - **`total_runs`** — over/under line, settles at match end
  - **`over_runs`** — 6 / 10 / 15-over runs per innings (over/under). Line locked at bet time. Settles the moment the target over completes; if the innings ends earlier (all-out) the market settles on the actual runs at close.
  - **`next_ball`** — bet on outcome of the very next ball (0/1/2/3/4/6/W) at dynamic odds derived from the ball-outcome distribution + 5% margin. Only open during `innings1`/`innings2`, locks on next ball, settles instantly.
  - **Ball countdown ring**: 6-sec animated ring on each Next-Ball button so players feel the urgency; resets on every new ball
  - **Live cashout preview**: match_winner rows show the current cash-out value on the button with **green** background when in profit and **red** when in loss — the player sees the payout before clicking
  - **Auto-close finished markets**: over-run cells hide the moment the target over completes (or the innings ends); no empty "closed" tiles polluting the UI
  - Cashout **only** on `match_winner`. All others settle at market close, verified end-to-end (won/lost/payouts). WebSocket at `/api/virtual/ws/{match_id}` streams live state.
- **Admin Virtual P&L (Feb 2026)**: `GET /api/virtual/admin/stats` (admin-only) returns total_wagered, total_paid_out, house_profit + per-market breakdown + current bias_mode. Displayed on the Game Control page as a 3-tile summary (wagered / paid out / house profit — green or red) plus a per-market table (Bets · Wagered · Paid Out · P&L).
- **Virtual House Bias (Feb 2026)**: `POST /api/virtual/admin/bias` sets `normal / aggressive / ruthless`. Bias affects: (a) house margin baked into decimal odds — Normal 5%, Aggressive 12%, Ruthless 22%. (b) projected run lines shifted upward — Normal ×1.00, Aggressive ×1.06, Ruthless ×1.14. Persisted in `settings.virtual_bias_mode`, loaded on startup. All active-match odds recompute + broadcast immediately when bias changes. Also: Innings-2 markets are HIDDEN until Innings 1 completes; Toss card auto-removed after toss done; 20-Over Total Runs label clarified; match_winner odds display green ▲/red ▼ movement indicators when odds change ball-by-ball; "Live betting" label on /in-play changed to "Live cricket".
- Reports: top winners, recent rounds

## v1.6 additions (2026-02-08)
- **Rebrand AeroX → GoWin365**: text-only gold-gradient wordmark across Player + Admin layouts, Login, Register, Games catalog, Legal (Terms/Privacy), Referrals share text, Virtual Cricket league names, backend root endpoint. HTML `<title>` now "GoWin365 — Play. Win. Cash out." with a text-based SVG data-URL favicon (gold "G" on black) — no image asset dependency.
- **Header side-drawer menu**: hamburger button in PlayerLayout header opens a full-height side drawer with sections **Cricket** (Live Matches, Virtual Cricket) · **Casino** (All Games, Crash, Roulette) · **Account** (Wallet, Profile, Referrals, Leaderboard, Support) + red **Logout** at the bottom. Uses backdrop-click + close button, active-route highlighting, and drawer testids for QA.
- **Over-runs projection fix**: `_project_runs_at_over` in `virtual.py` now uses a T20-realistic prior (~8.4 rpo baseline, ~9.3 at 10-over target, ~9.5 at 15-over target) blended with observed pace (observed weight fades in over the first 5 overs). In innings 2 it additionally anchors to innings-1's actual rpo (+5% chase pace). Also applies a striker-bonus factor (up to ×1.10 for a striker with SR ≥ 250 in the current innings). Fixes the degenerate "6-over line = 24 runs at start of innings 2" scenario.
- **Lobby In-Play compact rows (2026-02-05)**: Ported the Govinda365-style compact table row from `/in-play` into the Lobby's In-Play section. Each row now shows `[LIVE tag / day / time] · [team1/team2 stacked + MO/BM/F tags] · [MO back/lay · BM back/lay · F single]` with jittered odds ticking every 2 s and volume-in-K badges. Also removed the earlier bulky `MatchRow` + `OddsCell` duplicates and cleaned trailing broken JSX fragments in `Lobby.jsx`. Verified mobile-fit at 420 px.

## Prioritized Backlog / P0/P1/P2

### P0 (next)
- Wire "Coming Soon" games (Mines, Dice, Plinko, Wheel of Fortune, Slots, Blackjack, Baccarat) on the `/games` catalog to real playable engines
- Roulette in-game chat + live-players count

### P1 (next iterations)
- Chat moderation UI in admin
- Password reset flow (playbook has scaffolding)
- Per-user bet history in admin user detail
- Round-details modal (bets breakdown for a round)
- Real bank / KYC verification workflow

### P2 (nice-to-have)
- Public provably-fair verifier page (paste seeds → compute crash)
- Push notifications for deposit approval
- Multi-language support (Hindi / Tamil)
- Sound effects on takeoff / crash

## Deployment Notes
- Backend port 8001, all routes under `/api`
- Env vars in `/app/backend/.env`: JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, MONGO_URL, DB_NAME
- WebSocket at `/api/ws`
