"""Virtual Cricket engine.

Runs multiple simulated matches in parallel. Each match ticks ball-by-ball
with realistic outcome distributions, publishes state to subscribed clients
via WebSocket, and drives dynamic odds for a set of betting markets.

Phase 1 markets:
    - match_winner  (mid-match cashout supported)
    - toss_winner   (settled instantly on toss)
    - total_runs    (over/under a line — settled on match end)

The engine is deliberately self-contained so Phase 2 markets (fancy over
lines, ball-by-ball, player runs) can plug in without touching this file's
core loop.
"""
from __future__ import annotations

import asyncio
import logging
import math
import random
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

logger = logging.getLogger("aerox.virtual")


# ─────────────────────────── Configuration ───────────────────────────
FORMAT_OVERS   = 20         # T20 match (20 overs per side)
BALLS_PER_OVER = 6
BALL_TICK_SECS = 6.0        # 6s per ball → 36s/over → ~12 min per innings

# Match phases
PRE_MATCH_SECS     = 180     # 3 min window for betting BEFORE toss
TOSS_SECS          = 25      # toss animation (25s)
LINEUP_SECS        = 60      # team lineup display (1 min)
INNINGS_BREAK_SECS = 90      # innings break (1.5 min)
RESULT_SECS        = 60      # post-match result view (1 min)
MAX_WICKETS   = 10

# Concurrent matches (rooms)
CONCURRENT_MATCHES = 3

# ─────────────────────────── Team pool ──────────────────────────────
TEAMS_INTERNATIONAL = [
    {"name": "India",         "short": "IND", "flag": "🇮🇳", "color": "#0B57D0"},
    {"name": "Australia",     "short": "AUS", "flag": "🇦🇺", "color": "#F6C90E"},
    {"name": "South Africa",  "short": "SA",  "flag": "🇿🇦", "color": "#00A651"},
    {"name": "New Zealand",   "short": "NZ",  "flag": "🇳🇿", "color": "#111111"},
    {"name": "England",       "short": "ENG", "flag": "🏴", "color": "#CE1126"},
    {"name": "Pakistan",      "short": "PAK", "flag": "🇵🇰", "color": "#01411C"},
    {"name": "Sri Lanka",     "short": "SL",  "flag": "🇱🇰", "color": "#0F52BA"},
    {"name": "Bangladesh",    "short": "BAN", "flag": "🇧🇩", "color": "#006A4E"},
    {"name": "West Indies",   "short": "WI",  "flag": "🟥", "color": "#7B0000"},
    {"name": "Afghanistan",   "short": "AFG", "flag": "🇦🇫", "color": "#0038A8"},
]

# Indian domestic (Ranji-style) teams
TEAMS_DOMESTIC = [
    {"name": "Mumbai",         "short": "MUM", "flag": "🔵", "color": "#0055A4"},
    {"name": "Karnataka",      "short": "KAR", "flag": "🟡", "color": "#F1C232"},
    {"name": "Tamil Nadu",     "short": "TN",  "flag": "🟠", "color": "#E17223"},
    {"name": "Delhi",          "short": "DEL", "flag": "🔴", "color": "#B22222"},
    {"name": "Bengal",         "short": "BEN", "flag": "🟢", "color": "#2F855A"},
    {"name": "Baroda",         "short": "BAR", "flag": "🟣", "color": "#6B46C1"},
    {"name": "Kerala",         "short": "KER", "flag": "🟢", "color": "#0F766E"},
    {"name": "Punjab",         "short": "PUN", "flag": "🟠", "color": "#EA580C"},
    {"name": "Rajasthan",      "short": "RAJ", "flag": "🌸", "color": "#DB2777"},
    {"name": "Uttar Pradesh",  "short": "UP",  "flag": "🟨", "color": "#CA8A04"},
    {"name": "Hyderabad",      "short": "HYD", "flag": "⚪", "color": "#334155"},
    {"name": "Gujarat",        "short": "GUJ", "flag": "🟪", "color": "#7C3AED"},
]

LEAGUE_INTERNATIONAL = "AeroX International T20"
LEAGUE_DOMESTIC      = "AeroX Domestic Super League"


# Ball outcome distribution — tuned for a compact 5-over game.
# ~2% wicket / ball = ~3.6 wickets per innings on average.
BALL_PROBS = [
    ("0",  0.32),   # dot
    ("1",  0.28),
    ("2",  0.10),
    ("3",  0.02),
    ("4",  0.16),
    ("6",  0.08),
    ("W",  0.04),
]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


# ─────────────────────────── Match state model ───────────────────────
def _pick_ball_outcome() -> str:
    r = random.random()
    acc = 0.0
    for out, p in BALL_PROBS:
        acc += p
        if r <= acc:
            return out
    return "0"


def _fresh_match_shell(match_no: int, tour_type: str = "international") -> Dict[str, Any]:
    pool = TEAMS_INTERNATIONAL if tour_type == "international" else TEAMS_DOMESTIC
    league = LEAGUE_INTERNATIONAL if tour_type == "international" else LEAGUE_DOMESTIC
    teams = random.sample(pool, 2)
    # Schedule: pre-match window starts NOW, toss at now+PRE_MATCH_SECS
    now = now_utc()
    toss_at = datetime.fromtimestamp(now.timestamp() + PRE_MATCH_SECS, tz=timezone.utc)
    play_at = datetime.fromtimestamp(toss_at.timestamp() + TOSS_SECS + LINEUP_SECS, tz=timezone.utc)
    return {
        "id":          str(uuid.uuid4()),
        "match_no":    match_no,
        "league":      league,
        "tour_type":   tour_type,       # "international" | "domestic"
        "format":      f"T{FORMAT_OVERS}",
        "teams":       [dict(t) for t in teams],  # [team1, team2]
        "phase":       "pre_match",   # pre_match | toss | lineup | innings1 | break | innings2 | completed
        "phase_end":   iso(toss_at),
        "toss_at":     iso(toss_at),
        "play_at":     iso(play_at),
        "toss_winner": None,          # short name
        "toss_choice": None,          # "bat" | "bowl"
        "batting":     None,          # short of batting team in current innings
        "bowling":     None,
        "innings":     0,             # 0 (pre), 1, 2
        "scores": {                    # per team_short
            teams[0]["short"]: {"runs": 0, "wickets": 0, "balls": 0, "overs_str": "0.0"},
            teams[1]["short"]: {"runs": 0, "wickets": 0, "balls": 0, "overs_str": "0.0"},
        },
        "target":      None,          # innings-2 target
        "winner":      None,          # short name at completion
        "commentary":  [],            # last ~24 ball lines
        "started_at":  iso(now_utc()),
        # dynamic odds (recomputed after every ball)
        "odds": {
            "match_winner":  {},     # {short: decimal}
            "toss_winner":   {},
            "total_runs":    {},     # {"line": X, "over": d, "under": d}
        },
    }


# ─────────────────────────── Odds engine ────────────────────────────
def _match_winner_odds(m: Dict[str, Any]) -> Dict[str, float]:
    t1, t2 = m["teams"][0]["short"], m["teams"][1]["short"]

    if m["phase"] in ("pre_match", "toss", "lineup"):
        return {t1: 1.95, t2: 1.95}

    if m["phase"] == "innings1":
        return {t1: 1.95, t2: 1.95}

    if m["phase"] == "completed":
        w = m.get("winner")
        return {t: (1.01 if t == w else 15.0) for t in (t1, t2)}

    # innings2 / break — chasing side's probability estimator
    target = m.get("target") or 0
    chase  = m["batting"]
    defend = m["bowling"]
    sc = m["scores"][chase]
    runs_needed  = max(0, target - sc["runs"])
    balls_left   = FORMAT_OVERS * BALLS_PER_OVER - sc["balls"]
    wkts_left    = MAX_WICKETS - sc["wickets"]

    if balls_left <= 0 or wkts_left <= 0:
        # innings already effectively decided
        won = runs_needed <= 0
        return {chase: (1.01 if won else 15.0),
                defend: (15.0 if won else 1.01)}

    if runs_needed <= 0:
        return {chase: 1.01, defend: 15.0}

    req_rr    = (runs_needed / balls_left) * 6.0
    par_rr    = 8.5   # neutral T5 chase par
    # base prob from RRR delta
    delta = par_rr - req_rr   # positive = chase easier
    prob_chase = 1 / (1 + math.exp(-delta * 0.55))
    # wicket penalty
    wkt_factor = min(1.0, wkts_left / 7.0)
    prob_chase = prob_chase * (0.55 + 0.45 * wkt_factor)
    prob_chase = max(0.03, min(0.97, prob_chase))
    prob_def   = 1 - prob_chase

    # Convert to decimal odds with a 5% house margin
    margin = 1.05
    o_chase  = round(margin / prob_chase, 2)
    o_defend = round(margin / prob_def,   2)
    return {chase: o_chase, defend: o_defend}


def _toss_odds(m: Dict[str, Any]) -> Dict[str, float]:
    if m["phase"] == "pre_match":
        t1, t2 = m["teams"][0]["short"], m["teams"][1]["short"]
        return {t1: 1.95, t2: 1.95}
    # locked after toss
    w = m.get("toss_winner")
    return {t["short"]: (1.01 if t["short"] == w else 15.0) for t in m["teams"]}


def _total_runs_odds(m: Dict[str, Any]) -> Dict[str, Any]:
    # Line = base 320 (T20 par) at pre-match. Adjusts once innings1 completes.
    if m["phase"] in ("pre_match", "toss", "lineup"):
        line = 320.0
        return {"line": line, "over": 1.90, "under": 1.90}

    t1, t2 = m["teams"][0]["short"], m["teams"][1]["short"]
    total_now = m["scores"][t1]["runs"] + m["scores"][t2]["runs"]

    if m["phase"] == "innings1":
        sc = m["scores"][m["batting"]]
        balls_left = FORMAT_OVERS * BALLS_PER_OVER - sc["balls"]
        proj1 = sc["runs"] + int(balls_left * ( (sc["runs"]+1) / max(1, sc["balls"]) ))
        # both innings projected total
        line = round(proj1 * 2 * 0.95)
        # over/under bias by wickets remaining
        wl = MAX_WICKETS - sc["wickets"]
        over_o  = 1.85 + (7 - wl) * 0.02
        under_o = 3.85 - over_o
        return {"line": line, "over": round(over_o, 2), "under": round(under_o, 2)}

    if m["phase"] in ("break", "innings2"):
        sc2 = m["scores"][m["batting"]] if m["batting"] else {"runs": 0, "balls": 0, "wickets": 0}
        balls_left = FORMAT_OVERS * BALLS_PER_OVER - sc2["balls"]
        proj2 = sc2["runs"] + int(balls_left * ((sc2["runs"]+1) / max(1, sc2["balls"] or 1)))
        line = round((total_now + proj2 * 0.5) if m["phase"] == "innings2" else total_now * 2)
        # tighten as match nears end
        over_o  = 1.85 + (30 - balls_left) * 0.01
        over_o  = max(1.30, min(3.50, over_o))
        under_o = round(1 + 1 / (over_o - 1), 2)
        return {"line": line, "over": round(over_o, 2), "under": under_o}

    # completed
    return {"line": total_now, "over": 15.0, "under": 15.0}


def _recompute_odds(m: Dict[str, Any]) -> None:
    m["odds"]["match_winner"] = _match_winner_odds(m)
    m["odds"]["toss_winner"]  = _toss_odds(m)
    m["odds"]["total_runs"]   = _total_runs_odds(m)


# ─────────────────────────── Engine ─────────────────────────────────
class VirtualEngine:
    def __init__(self, db, credit_fn, debit_fn):
        self.db = db
        self.credit = credit_fn
        self.debit = debit_fn
        self.matches: Dict[str, Dict[str, Any]] = {}   # id -> match
        self.subscribers: Dict[str, Set[WebSocket]] = {}  # id -> ws set
        self._lock = asyncio.Lock()
        self._match_counter = 0

    # ─── Subscriptions ───
    async def subscribe(self, match_id: str, ws: WebSocket) -> None:
        self.subscribers.setdefault(match_id, set()).add(ws)

    async def unsubscribe(self, match_id: str, ws: WebSocket) -> None:
        s = self.subscribers.get(match_id)
        if s:
            s.discard(ws)

    async def _broadcast(self, match_id: str, kind: str, payload: Dict[str, Any]) -> None:
        subs = list(self.subscribers.get(match_id, set()))
        dead = []
        msg = {"type": kind, "data": payload}
        for ws in subs:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.subscribers.get(match_id, set()).discard(ws)

    # ─── Match lifecycle ───
    async def start_loops(self):
        # 3 concurrent rooms. Slot 0 always domestic, slots 1,2 international
        # → users see a mix of both tour types at all times.
        for slot in range(CONCURRENT_MATCHES):
            tour = "domestic" if slot == 0 else "international"
            asyncio.create_task(self._match_slot_loop(tour))

    async def _match_slot_loop(self, tour_type: str):
        while True:
            self._match_counter += 1
            m = _fresh_match_shell(self._match_counter, tour_type=tour_type)
            async with self._lock:
                self.matches[m["id"]] = m
            try:
                await self._run_one_match(m)
            except Exception as e:
                logger.exception(f"virtual match loop failed: {e}")
            # drop match from active roster after result showcase
            await asyncio.sleep(RESULT_SECS)
            async with self._lock:
                self.matches.pop(m["id"], None)
                self.subscribers.pop(m["id"], None)

    async def _phase_wait(self, m: Dict[str, Any], secs: float):
        m["phase_end"] = iso(datetime.fromtimestamp(now_utc().timestamp() + secs, tz=timezone.utc))
        _recompute_odds(m)
        await self._broadcast(m["id"], "state", self._public_match(m))
        await asyncio.sleep(secs)

    async def _run_one_match(self, m: Dict[str, Any]):
        # Pre-match window — 3 min for pre-toss bets (winner + toss + total_runs all open)
        m["phase"] = "pre_match"
        await self._phase_wait(m, PRE_MATCH_SECS)

        # Toss — 25s animated window (toss market closed at phase change)
        toss_team = random.choice(m["teams"])
        m["toss_winner"] = toss_team["short"]
        m["toss_choice"] = random.choice(["bat", "bowl"])
        m["phase"] = "toss"
        if m["toss_choice"] == "bat":
            bat_short = toss_team["short"]
        else:
            bat_short = [t["short"] for t in m["teams"] if t["short"] != toss_team["short"]][0]
        bowl_short = [t["short"] for t in m["teams"] if t["short"] != bat_short][0]
        m["batting"] = bat_short
        m["bowling"] = bowl_short
        m["innings"] = 1
        m["commentary"].insert(0, {
            "over": "-", "text": f"{toss_team['short']} won the toss & chose to {m['toss_choice']}",
        })
        # Settle toss bets right after the toss is announced
        await self._settle_market(m, "toss_winner", winning_selection=m["toss_winner"])
        await self._phase_wait(m, TOSS_SECS)

        # Lineup screen — 1 min showcasing both team lists / matchup
        m["phase"] = "lineup"
        m["commentary"].insert(0, {"over": "-", "text": "Teams taking the field — match starts shortly"})
        await self._phase_wait(m, LINEUP_SECS)

        # innings 1
        m["phase"] = "innings1"
        await self._run_innings(m, first=True)

        # Innings break
        m["phase"] = "break"
        m["target"]  = m["scores"][bat_short]["runs"] + 1
        m["batting"] = bowl_short
        m["bowling"] = bat_short
        m["innings"] = 2
        m["commentary"].insert(0, {"over": "-", "text": f"Innings break — target {m['target']}"})
        await self._phase_wait(m, INNINGS_BREAK_SECS)

        # innings 2
        m["phase"] = "innings2"
        await self._run_innings(m, first=False)

        # Determine result
        t1, t2 = m["teams"][0]["short"], m["teams"][1]["short"]
        r1, r2 = m["scores"][t1]["runs"], m["scores"][t2]["runs"]
        if r1 == r2:
            m["winner"] = "TIE"
        else:
            m["winner"] = t1 if r1 > r2 else t2
        m["phase"] = "completed"
        m["commentary"].insert(0, {
            "over": "-",
            "text": (f"{m['winner']} wins!" if m["winner"] != "TIE" else "Match tied"),
        })
        _recompute_odds(m)
        # Settle match_winner + total_runs
        await self._settle_market(m, "match_winner", winning_selection=m["winner"])
        await self._settle_total_runs(m)
        await self._broadcast(m["id"], "state", self._public_match(m))

    async def _run_innings(self, m: Dict[str, Any], first: bool):
        bat = m["batting"]
        for over in range(FORMAT_OVERS):
            for ball in range(BALLS_PER_OVER):
                sc = m["scores"][bat]
                # Stop conditions
                if sc["wickets"] >= MAX_WICKETS: break
                if not first and (sc["runs"] >= (m["target"] or 0)): break
                await asyncio.sleep(BALL_TICK_SECS)
                outcome = _pick_ball_outcome()
                sc["balls"] += 1
                over_idx = sc["balls"] // BALLS_PER_OVER
                ball_idx = sc["balls"] % BALLS_PER_OVER
                sc["overs_str"] = f"{over_idx}.{ball_idx}" if ball_idx else f"{over_idx}.0"

                text = ""
                if outcome == "W":
                    sc["wickets"] += 1
                    text = f"OUT! Wicket falls — {sc['wickets']}/10"
                else:
                    runs = int(outcome)
                    sc["runs"] += runs
                    text = f"{outcome} run{'s' if runs != 1 else ''}"

                comm = {
                    "over": f"{over_idx if ball_idx else max(0, over_idx-0)}.{ball_idx if ball_idx else 0}",
                    "text": text,
                    "outcome": outcome,
                    "team": bat,
                    "score": f"{sc['runs']}/{sc['wickets']}",
                }
                m["commentary"].insert(0, comm)
                m["commentary"] = m["commentary"][:24]

                _recompute_odds(m)
                await self._broadcast(m["id"], "ball", {"match": self._public_match(m), "comm": comm})

            # end of over — light pause
            if m["scores"][bat]["wickets"] >= MAX_WICKETS: break
            if not first and (m["scores"][bat]["runs"] >= (m["target"] or 0)): break

    # ─── Public serializers ───
    def _recent_over_commentary(self, m: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Return only the CURRENT + PREVIOUS over's ball events plus toss/break notes.
        User requirement: hide older overs from the feed to reduce clutter.
        """
        sc = m["scores"].get(m.get("batting") or "", {})
        current_over = (sc.get("balls", 0) // BALLS_PER_OVER)
        keep_overs = {current_over, max(0, current_over - 1)}
        out = []
        for c in m["commentary"]:
            over_str = str(c.get("over", ""))
            # keep non-ball notes (toss / break / result)
            if over_str.startswith("-") or over_str == "":
                out.append(c)
                continue
            try:
                ov_idx = int(over_str.split(".")[0])
            except Exception:
                out.append(c)
                continue
            if ov_idx in keep_overs:
                out.append(c)
        return out[:24]

    def _public_match(self, m: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": m["id"],
            "league": m["league"],
            "tour_type": m.get("tour_type", "international"),
            "format": m["format"],
            "teams": m["teams"],
            "phase": m["phase"],
            "phase_end": m["phase_end"],
            "toss_at": m.get("toss_at"),
            "play_at": m.get("play_at"),
            "toss_winner": m["toss_winner"],
            "toss_choice": m["toss_choice"],
            "batting": m["batting"],
            "bowling": m["bowling"],
            "innings": m["innings"],
            "scores": m["scores"],
            "target": m["target"],
            "winner": m["winner"],
            "commentary": self._recent_over_commentary(m),
            "odds": m["odds"],
        }

    # ─── Bet placement + settlement ───
    async def place_bet(self, user: Dict[str, Any], match_id: str, market: str, selection: str, amount: float) -> Dict[str, Any]:
        m = self.matches.get(match_id)
        if not m: raise HTTPException(404, "Match not found or already ended")
        if m["phase"] == "completed":
            raise HTTPException(400, "Match completed")

        market = market.lower()
        selection = selection.strip()
        if market == "match_winner":
            if selection not in [t["short"] for t in m["teams"]]:
                raise HTTPException(400, "Invalid team")
            odds = m["odds"]["match_winner"].get(selection, 0)
        elif market == "toss_winner":
            if m["phase"] != "pre_match":
                raise HTTPException(400, "Toss market closed")
            if selection not in [t["short"] for t in m["teams"]]:
                raise HTTPException(400, "Invalid team")
            odds = m["odds"]["toss_winner"].get(selection, 0)
        elif market == "total_runs":
            if selection not in ("over", "under"):
                raise HTTPException(400, "Selection must be 'over' or 'under'")
            if m["phase"] in ("completed",):
                raise HTTPException(400, "Market closed")
            odds = m["odds"]["total_runs"].get(selection, 0)
        else:
            raise HTTPException(400, "Unknown market")

        if odds <= 1.0:
            raise HTTPException(400, "Odds unavailable, try again")
        if amount < 10:
            raise HTTPException(400, "Minimum bet is ₹10")

        fresh = await self.db.users.find_one({"id": user["id"]})
        if float(fresh.get("balance", 0)) < amount:
            raise HTTPException(400, "Insufficient balance")

        line = None
        if market == "total_runs":
            line = m["odds"]["total_runs"].get("line")

        bet_id = str(uuid.uuid4())
        bet = {
            "id": bet_id,
            "user_id": user["id"],
            "user_name": user.get("name", "Player"),
            "match_id": match_id,
            "match_no": m["match_no"],
            "market": market,
            "selection": selection,
            "line": line,
            "amount": round(float(amount), 2),
            "odds_taken": round(float(odds), 2),
            "potential_payout": round(float(amount) * float(odds), 2),
            "status": "pending",   # pending | won | lost | cashed_out | void
            "settled_at": None,
            "cashout_multiplier": None,
            "created_at": iso(now_utc()),
        }
        await self.debit(user["id"], amount, "virtual_bet", f"Virtual {market} — {selection}", bet_id)
        await self.db.virtual_bets.insert_one(bet)
        return {"ok": True, "bet_id": bet_id, "odds": odds, "line": line, "potential_payout": bet["potential_payout"]}

    async def cashout(self, user: Dict[str, Any], bet_id: str) -> Dict[str, Any]:
        bet = await self.db.virtual_bets.find_one({"id": bet_id, "user_id": user["id"]})
        if not bet:  raise HTTPException(404, "Bet not found")
        if bet["status"] != "pending": raise HTTPException(400, "Bet already settled")
        if bet["market"] != "match_winner":
            raise HTTPException(400, "Cashout only available on match_winner")

        m = self.matches.get(bet["match_id"])
        if not m: raise HTTPException(400, "Match no longer live")
        if m["phase"] in ("completed",): raise HTTPException(400, "Match ended — no cashout")

        current_odds = m["odds"]["match_winner"].get(bet["selection"], 0)
        if current_odds <= 1.0:
            raise HTTPException(400, "Cashout odds unavailable")
        # Cashout formula: bet_amount * odds_taken / current_odds  (standard book cashout)
        payout = round(float(bet["amount"]) * float(bet["odds_taken"]) / float(current_odds), 2)
        if payout < 0.5:
            raise HTTPException(400, "Cashout too small")

        await self.db.virtual_bets.update_one({"id": bet_id}, {"$set": {
            "status": "cashed_out",
            "cashout_multiplier": round(payout / float(bet["amount"]), 4),
            "settled_at": iso(now_utc()),
            "payout": payout,
        }})
        await self.credit(user["id"], payout, "virtual_cashout",
                          f"Cashout ({bet['market']} — {bet['selection']})", bet_id)
        return {"ok": True, "payout": payout, "odds_at_cashout": current_odds}

    async def _settle_market(self, m: Dict[str, Any], market: str, winning_selection: str):
        """Settle all pending bets in a market for this match."""
        q = {"match_id": m["id"], "market": market, "status": "pending"}
        async for b in self.db.virtual_bets.find(q):
            won = (b["selection"] == winning_selection) if winning_selection != "TIE" else False
            payout = round(float(b["amount"]) * float(b["odds_taken"]), 2) if won else 0.0
            await self.db.virtual_bets.update_one({"id": b["id"]}, {"$set": {
                "status": "won" if won else "lost",
                "settled_at": iso(now_utc()),
                "payout": payout,
            }})
            if won:
                await self.credit(b["user_id"], payout, "virtual_win",
                                  f"Virtual {market} win", b["id"])

    async def _settle_total_runs(self, m: Dict[str, Any]):
        t1, t2 = m["teams"][0]["short"], m["teams"][1]["short"]
        total = m["scores"][t1]["runs"] + m["scores"][t2]["runs"]
        q = {"match_id": m["id"], "market": "total_runs", "status": "pending"}
        async for b in self.db.virtual_bets.find(q):
            line = float(b.get("line", 0) or 0)
            if line == 0:
                won = False
            elif b["selection"] == "over":
                won = total > line
            else:
                won = total < line
            payout = round(float(b["amount"]) * float(b["odds_taken"]), 2) if won else 0.0
            await self.db.virtual_bets.update_one({"id": b["id"]}, {"$set": {
                "status": "won" if won else "lost",
                "settled_at": iso(now_utc()),
                "payout": payout,
                "line_final": total,
            }})
            if won:
                await self.credit(b["user_id"], payout, "virtual_win",
                                  "Virtual total_runs win", b["id"])


# ─────────────────────────── Router ─────────────────────────────────
class BetIn(BaseModel):
    match_id: str
    market:   str = Field(pattern=r"^(match_winner|toss_winner|total_runs)$")
    selection: str
    amount:    float = Field(gt=0)


class CashoutIn(BaseModel):
    bet_id: str


def build_router(db, credit_fn, debit_fn, current_user_dep):
    engine = VirtualEngine(db, credit_fn, debit_fn)
    router = APIRouter(prefix="/api/virtual")

    async def start_engine():
        # DB indexes
        await db.virtual_bets.create_index("user_id")
        await db.virtual_bets.create_index("match_id")
        await db.virtual_bets.create_index("status")
        await engine.start_loops()

    @router.get("/matches")
    async def list_matches(tour: Optional[str] = None):
        rows = [engine._public_match(m) for m in engine.matches.values()]
        if tour in ("international", "domestic"):
            rows = [r for r in rows if r.get("tour_type") == tour]
        return {"matches": rows}

    @router.get("/matches/{match_id}")
    async def get_match(match_id: str):
        m = engine.matches.get(match_id)
        if not m: raise HTTPException(404, "Match not found")
        return engine._public_match(m)

    @router.post("/bet")
    async def place(body: BetIn, user: dict = Depends(current_user_dep)):
        return await engine.place_bet(user, body.match_id, body.market, body.selection, body.amount)

    @router.post("/cashout")
    async def do_cashout(body: CashoutIn, user: dict = Depends(current_user_dep)):
        return await engine.cashout(user, body.bet_id)

    @router.get("/my-bets")
    async def my_bets(user: dict = Depends(current_user_dep), limit: int = 40):
        docs = await db.virtual_bets.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return docs

    @router.websocket("/ws/{match_id}")
    async def ws_match(ws: WebSocket, match_id: str):
        m = engine.matches.get(match_id)
        if not m:
            await ws.close(code=4004)
            return
        await ws.accept()
        await engine.subscribe(match_id, ws)
        try:
            # send initial state
            await ws.send_json({"type": "state", "data": engine._public_match(m)})
            while True:
                # keep-alive; client doesn't send anything meaningful
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            await engine.unsubscribe(match_id, ws)

    return router, start_engine
