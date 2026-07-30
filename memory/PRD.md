# AeroX Crash (gowin365x.com) — PRD

## Original Problem Statement
AeroX Crash is a real-time aviation "crash" style multiplayer game where players bet virtual balance, watch a multiplier rise, and cash out before the plane crashes. Deposits and withdrawals are handled manually between user and admin via UPI/UTR — no payment gateway, no screenshots. UTR duplicates are auto-rejected. Includes wallet, referrals, leaderboard, live chat, bonuses, and full admin portal.

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
- Roulette lobby (`/games/roulette`) with 7 live tables: Hindi, Lightning, American, Mega Fire Blaze, Speed Sic Bo, Bucharest Quantum, Arabic — each with detail page (`/games/roulette/:tableId`) showing stats + "Gameplay launching soon"

### Admin portal
- Sidebar dashboard with live metrics + game controls
- Users: search, block/unblock, adjust balance
- Deposits queue: pending/approved/rejected tabs, approve credits wallet + 5% bonus
- Withdrawals queue: mark paid or reject (refunds balance)
- UPI/QR CRUD (multi-configurable)
- Game control: pause/resume + house edge tuning
- Reports: top winners, recent rounds

## Prioritized Backlog / P0/P1/P2

### P0 (next)
- Real Roulette gameplay: WebSocket wheel-spin engine, bet types (straight/split/dozen/red-black), payout logic, table UI

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
