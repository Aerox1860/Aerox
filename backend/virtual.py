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
import os
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

LEAGUE_INTERNATIONAL = "GoWin365 International T20"
LEAGUE_DOMESTIC      = "GoWin365 Domestic Super League"

# Player pool — realistic, stadium-friendly pseudonyms (no real cricketer names to avoid rights issues)
_PLAYER_FIRSTS = [
    "R.", "V.", "S.", "M.", "K.", "A.", "J.", "H.", "P.", "N.", "D.", "T.",
    "B.", "L.", "Y.", "G.", "I.", "O.",
]
_PLAYER_LASTS = [
    "Sharma", "Patel", "Khan", "Verma", "Iyer", "Kumar", "Singh", "Yadav",
    "Rathi", "Chandra", "Rao", "Menon", "Naidu", "Malik", "Basu", "Sethi",
    "Bose", "Nayak", "Dutta", "Joshi", "Chowdhury", "Prasad",
    "Smith", "Anderson", "Cooper", "Fraser", "Miller", "Wright",
    "Barlow", "Nelson", "Palmer", "Roberts", "Perez", "Silva", "Diaz",
]

def _make_players(team_short: str) -> List[Dict[str, Any]]:
    """Deterministic-per-team 11-man squad (sampled fresh each match to keep it lively)."""
    firsts = random.sample(_PLAYER_FIRSTS, 11)
    lasts  = random.sample(_PLAYER_LASTS, 11)
    return [{"name": f"{firsts[i]} {lasts[i]}", "runs": 0, "balls": 0, "fours": 0, "sixes": 0, "out": False, "team": team_short} for i in range(11)]

# ────────── House bias (admin-adjustable at runtime) ──────────────
# "normal"     : ~5% margin baked into odds (fair-ish)
# "aggressive" : ~12% margin + line pushed 5% against most-bet side
# "ruthless"   : ~22% margin + line pushed 12% against most-bet side
BIAS_MODE = os.environ.get("VIRTUAL_BIAS_MODE", "normal")

def _margin() -> float:
    return {"normal": 1.05, "aggressive": 1.12, "ruthless": 1.22}.get(BIAS_MODE, 1.05)

def _line_bias() -> float:
    """Multiplier applied to projected run lines. > 1 means the line sits ABOVE the
    real projection, making 'Under' the statistically-favoured side while the
    odds already price 'Over' as the favourite — so bettors lose more overall."""
    return {"normal": 1.00, "aggressive": 1.06, "ruthless": 1.14}.get(BIAS_MODE, 1.00)


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
        # Per-team 11-man squads (used to attribute runs to striker/non-striker)
        "squads":      {teams[0]["short"]: _make_players(teams[0]["short"]),
                        teams[1]["short"]: _make_players(teams[1]["short"])},
        # Live batting pair (indices into the batting team's squad)
        "striker_idx":     None,
        "non_striker_idx": None,
        "next_batter_idx": None,
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
            teams[0]["short"]: {"runs": 0, "wickets": 0, "balls": 0, "overs_str": "0.0",
                                # Partnership: runs & balls scored since last wicket
                                "partnership_runs": 0, "partnership_balls": 0,
                                # Last wicket that fell in this innings
                                "last_wicket": None,   # {"name": str, "runs": int, "balls": int} or None
                                # Current & past bowlers (name + O/R/W/M) for this innings
                                "bowler_stats": {},    # {bowler_name: {"balls": int, "runs": int, "wickets": int, "maidens": int, "dots_this_over": int}}
                                "current_bowler": None},
            teams[1]["short"]: {"runs": 0, "wickets": 0, "balls": 0, "overs_str": "0.0",
                                "partnership_runs": 0, "partnership_balls": 0,
                                "last_wicket": None,
                                "bowler_stats": {},
                                "current_bowler": None},
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
            "over_runs":     {},     # {"inn1_o6": {line, over, under, closed}, ...}
            "next_ball":     {},     # {"0":d,"1":d,...,"W":d}
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

    # Convert to decimal odds with a dynamic margin (house-bias aware)
    margin = _margin()
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
    # Line = base 320 (T20 par, both innings) at pre-match. House-biased.
    bias = _line_bias()
    m_ = _margin()
    over_o  = round(m_ / 0.53, 2)
    under_o = round(m_ / 0.51, 2)

    if m["phase"] in ("pre_match", "toss", "lineup"):
        line = round(320.0 * bias)
        return {"line": line, "over": over_o, "under": under_o}

    t1, t2 = m["teams"][0]["short"], m["teams"][1]["short"]
    total_now = m["scores"][t1]["runs"] + m["scores"][t2]["runs"]

    if m["phase"] == "innings1":
        sc = m["scores"][m["batting"]]
        balls_left = FORMAT_OVERS * BALLS_PER_OVER - sc["balls"]
        proj1 = sc["runs"] + int(balls_left * ((sc["runs"] + 1) / max(1, sc["balls"])))
        # both innings projected total, biased upward slightly to favour house
        line = round(proj1 * 2 * bias * 0.95)
        wl = MAX_WICKETS - sc["wickets"]
        return {"line": line, "over": round(over_o + (7 - wl) * 0.02, 2), "under": round(max(1.35, under_o - (7 - wl) * 0.02), 2)}

    if m["phase"] in ("break", "innings2"):
        sc2 = m["scores"][m["batting"]] if m["batting"] else {"runs": 0, "balls": 0, "wickets": 0}
        balls_left = FORMAT_OVERS * BALLS_PER_OVER - sc2["balls"]
        proj2 = sc2["runs"] + int(balls_left * ((sc2["runs"] + 1) / max(1, sc2["balls"] or 1)))
        line = round(((total_now + proj2 * 0.5) if m["phase"] == "innings2" else total_now * 2) * bias)
        over_o2 = max(1.30, min(3.50, over_o + (30 - balls_left) * 0.01))
        under_o2 = round(1 + 1 / (over_o2 - 1), 2)
        return {"line": line, "over": round(over_o2, 2), "under": under_o2}

    # completed
    return {"line": total_now, "over": 15.0, "under": 15.0}


# Fancy over-total markets: 6/10/15 over projected runs per innings.
# Line is expected runs at that over given current run rate + wickets remaining.
FANCY_OVERS = [6, 10, 15]
NEXT_BALL_MARKET = ("0", "1", "2", "3", "4", "6", "W")


def _project_runs_at_over(m: Dict[str, Any], target_over: int) -> Optional[float]:
    """Project a team's total runs at end of `target_over` overs.

    Uses a T20-realistic blended run-rate:
      • Prior (baseline): ~8.4 rpo for early-innings pace, ~9.5 rpo later on.
      • Observed: actual runs / balls so far this innings.
      • Innings-2 anchor: also blends the pace innings-1 was scoring at.
      • Striker bonus: bumps rate if current batter has SR > 150 this innings.

    Weight of the prior fades as more balls are bowled, so by mid-innings the
    projection is dominated by observed pace. This prevents the "0/0 → project 24
    at 6 overs" degenerate case (which sat at ~4 rpo — nowhere near realistic)."""
    if not m.get("batting"): return None
    sc = m["scores"].get(m["batting"], {})
    balls = sc.get("balls", 0)
    runs  = sc.get("runs", 0)
    wickets = sc.get("wickets", 0)
    target_balls = target_over * BALLS_PER_OVER
    if balls >= target_balls:
        return None   # market closed

    # ── Baseline T20 prior ────────────────────────────────────────────
    # Powerplay (o1-6) tends to be ~8.4 rpo; middle (o7-15) ~8.0 rpo;
    # death (o16-20) ~11.5 rpo. Blend a smooth per-ball prior around the
    # projected over window.
    prior_rr_ball = 1.40  # ~8.4 rpo default
    if target_over >= 15:
        prior_rr_ball = 1.55   # ~9.3 rpo (accounts for death-over acceleration)
    elif target_over >= 10:
        prior_rr_ball = 1.45   # ~8.7 rpo

    # ── Innings-2 anchor: use pace innings-1 was scoring at ───────────
    inn1_rrb = None
    if m["phase"] in ("break", "innings2"):
        # find bowling team's score entry from innings 1
        for team_short, s in m["scores"].items():
            if team_short != m["batting"]:
                b1, r1 = s.get("balls", 0), s.get("runs", 0)
                if b1 >= 6:
                    inn1_rrb = r1 / b1
                break
    if inn1_rrb is not None:
        # Innings-2 chases usually track ~5% above innings-1 (batters know target)
        prior_rr_ball = 0.5 * prior_rr_ball + 0.5 * (inn1_rrb * 1.05)

    # ── Observed rate (this innings, this team) ───────────────────────
    observed_rr_ball = (runs / balls) if balls > 0 else prior_rr_ball

    # ── Blend: prior dominates when balls small, observed when balls big ─
    w_obs = min(1.0, balls / 30.0)     # 30 balls (5 overs) to fully trust observed
    rr_ball = w_obs * observed_rr_ball + (1 - w_obs) * prior_rr_ball

    # ── Striker bonus: if striker's SR this innings > 150, bump projection ─
    striker_bonus = 1.0
    sq = m.get("squads", {}).get(m["batting"])
    if sq and m.get("striker_idx") is not None and 0 <= m["striker_idx"] < len(sq):
        st = sq[m["striker_idx"]]
        sb, sr_runs = st.get("balls", 0), st.get("runs", 0)
        if sb >= 6:  # need at least an over of data
            sr = (sr_runs / sb) * 100  # strike rate (runs/100 balls)
            if sr >= 250:   striker_bonus = 1.10
            elif sr >= 200: striker_bonus = 1.07
            elif sr >= 150: striker_bonus = 1.04
            elif sr <= 75:  striker_bonus = 0.95

    remaining = target_balls - balls
    wkt_penalty = 0.82 if wickets >= 7 else 0.90 if wickets >= 5 else 0.97 if wickets >= 3 else 1.0
    projected = runs + remaining * rr_ball * wkt_penalty * striker_bonus
    return round(projected, 1)


def _over_runs_odds(m: Dict[str, Any]) -> Dict[str, Any]:
    """For each innings + each FANCY_OVERS milestone, publish a line + over/under decimals.
    Key format: "inn1_o6", "inn1_o10", "inn1_o15", "inn2_o6", ...

    Innings-2 markets are HIDDEN (closed) until innings 1 has finished — user requirement:
    "do not show second innings sessions until first innings session".
    """
    out: Dict[str, Any] = {}
    bias = _line_bias()
    # Fancy over-runs uses a fixed 1.95 payout (5% flat commission — standard cricket-exchange convention).
    over_o  = 1.95
    under_o = 1.95

    inn2_visible = m["phase"] in ("break", "innings2", "completed")

    if m["phase"] in ("pre_match", "toss", "lineup"):
        pre_lines = {6: 52.0, 10: 82.0, 15: 125.0}
        for ov in FANCY_OVERS:
            out[f"inn1_o{ov}"] = {"line": round(pre_lines[ov] * bias, 1), "over": over_o, "under": under_o, "closed": False}
            out[f"inn2_o{ov}"] = {"line": None, "over": 0, "under": 0, "closed": True}
        return out

    if m["phase"] == "innings1":
        for ov in FANCY_OVERS:
            proj = _project_runs_at_over(m, ov)
            if proj is None:
                out[f"inn1_o{ov}"] = {"line": None, "over": 0, "under": 0, "closed": True}
            else:
                out[f"inn1_o{ov}"] = {"line": round(proj * bias, 1), "over": over_o, "under": under_o, "closed": False}
            # innings 2 stays hidden while innings 1 is in progress
            out[f"inn2_o{ov}"] = {"line": None, "over": 0, "under": 0, "closed": True}
        return out

    if m["phase"] in ("break", "innings2"):
        # Innings 1 markets are all closed
        for ov in FANCY_OVERS:
            out[f"inn1_o{ov}"] = {"line": None, "over": 0, "under": 0, "closed": True}
        for ov in FANCY_OVERS:
            proj = _project_runs_at_over(m, ov)
            if proj is None:
                out[f"inn2_o{ov}"] = {"line": None, "over": 0, "under": 0, "closed": True}
            else:
                out[f"inn2_o{ov}"] = {"line": round(proj * bias, 1), "over": over_o, "under": under_o, "closed": False}
        return out

    # completed — everything closed
    for inn in (1, 2):
        for ov in FANCY_OVERS:
            out[f"inn{inn}_o{ov}"] = {"line": None, "over": 0, "under": 0, "closed": True}
    return out


def _next_ball_odds(m: Dict[str, Any]) -> Dict[str, float]:
    """Odds for each possible next-ball outcome. Uses tuned probs w/ dynamic house margin.
    Open only during innings1/innings2. Closed otherwise (all zero)."""
    if m["phase"] not in ("innings1", "innings2"):
        return {o: 0.0 for o in NEXT_BALL_MARKET}
    margin = 2 - _margin()   # ruthless(1.22) -> 0.78 payout multiplier; effectively lowers odds
    # Use a *reduction* multiplier: fair_odds * (2 - margin). At normal (1.05) → 0.95.
    return {o: round((1.0 / max(0.005, p)) * margin, 2) for o, p in BALL_PROBS}


def _recompute_odds(m: Dict[str, Any]) -> None:
    m["odds"]["match_winner"] = _match_winner_odds(m)
    m["odds"]["toss_winner"]  = _toss_odds(m)
    m["odds"]["total_runs"]   = _total_runs_odds(m)
    m["odds"]["over_runs"]    = _over_runs_odds(m)
    m["odds"]["next_ball"]    = _next_ball_odds(m)


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
        bowl = m["bowling"]
        # Open batting pair — striker + non-striker + next batter to walk in
        m["striker_idx"]     = 0
        m["non_striker_idx"] = 1
        m["next_batter_idx"] = 2
        # Rotating bowlers from the bowling team squad (deterministic: bowler_pool cycles)
        bowl_squad = m["squads"][bowl]
        # A 20-over T20 uses ~5 different bowlers; cycle through positions 4..10 mostly.
        bowler_pool = [p["name"] for p in bowl_squad[4:11]]   # 7 candidate bowlers
        if not bowler_pool:
            bowler_pool = [p["name"] for p in bowl_squad]

        for over in range(FORMAT_OVERS):
            # Pick a bowler for this over (rotate so no bowler bowls two in a row is roughly satisfied)
            bowler_name = bowler_pool[over % len(bowler_pool)]
            m["scores"][bat]["current_bowler"] = bowler_name
            bs = m["scores"][bat]["bowler_stats"].setdefault(
                bowler_name, {"balls": 0, "runs": 0, "wickets": 0, "maidens": 0, "dots_this_over": 0}
            )
            bs["dots_this_over"] = 0   # reset per over

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

                # Attribute outcome to the striker
                squad = m["squads"][bat]
                striker = squad[m["striker_idx"]] if m["striker_idx"] is not None else None
                if striker is not None:
                    striker["balls"] += 1

                # Bowler took the ball
                bs["balls"] += 1

                text = ""
                if outcome == "W":
                    sc["wickets"] += 1
                    if striker is not None:
                        striker["out"] = True
                        # Record last-wicket entry
                        sc["last_wicket"] = {
                            "name":  striker["name"],
                            "runs":  striker["runs"],
                            "balls": striker["balls"],
                        }
                    text = f"OUT! Wicket falls — {sc['wickets']}/10"
                    bs["wickets"] += 1
                    # Reset partnership on wicket
                    sc["partnership_runs"]  = 0
                    sc["partnership_balls"] = 0
                    # New batter walks in as the striker
                    if m["next_batter_idx"] is not None and m["next_batter_idx"] < 11:
                        m["striker_idx"] = m["next_batter_idx"]
                        m["next_batter_idx"] += 1
                    else:
                        m["striker_idx"] = None
                    # Partnership counts this delivery too (as a ball faced by the pair)
                    sc["partnership_balls"] += 1
                else:
                    runs = int(outcome)
                    sc["runs"] += runs
                    bs["runs"] += runs
                    if runs == 0:
                        bs["dots_this_over"] += 1
                    if striker is not None:
                        striker["runs"] += runs
                        if outcome == "4": striker["fours"] += 1
                        elif outcome == "6": striker["sixes"] += 1
                    text = f"{outcome} run{'s' if runs != 1 else ''}"
                    sc["partnership_runs"]  += runs
                    sc["partnership_balls"] += 1
                    # Rotate strike on odd runs
                    if runs % 2 == 1 and m["non_striker_idx"] is not None:
                        m["striker_idx"], m["non_striker_idx"] = m["non_striker_idx"], m["striker_idx"]

                comm = {
                    "over": f"{over_idx if ball_idx else max(0, over_idx-0)}.{ball_idx if ball_idx else 0}",
                    "text": text,
                    "outcome": outcome,
                    "team": bat,
                    "score": f"{sc['runs']}/{sc['wickets']}",
                    "bowler": bowler_name,
                }
                m["commentary"].insert(0, comm)
                m["commentary"] = m["commentary"][:24]

                # Settle next_ball market bets for THIS match (fires each ball)
                await self._settle_next_ball(m, outcome)

                # If we just completed a fancy over (6/10/15) for this innings, settle those over_runs bets
                if ball_idx == 0 and over_idx in FANCY_OVERS:
                    await self._settle_over_runs(m, innings=(1 if first else 2), over_target=over_idx, actual_runs=sc["runs"])

                _recompute_odds(m)
                await self._broadcast(m["id"], "ball", {"match": self._public_match(m), "comm": comm})

            # end of over — maiden check + light pause + strike rotation
            if bs["dots_this_over"] == BALLS_PER_OVER:
                bs["maidens"] += 1
            if m["scores"][bat]["wickets"] >= MAX_WICKETS: break
            if not first and (m["scores"][bat]["runs"] >= (m["target"] or 0)): break
            # Rotate strike at the end of every completed over (unless a wicket has just changed the striker)
            if m["striker_idx"] is not None and m["non_striker_idx"] is not None:
                m["striker_idx"], m["non_striker_idx"] = m["non_striker_idx"], m["striker_idx"]

        # innings finished — any un-settled fancy over markets for this innings settle with the FINAL runs
        # (e.g. team all-out at over 4 → 6/10/15-over markets close with runs achieved).
        for ov in FANCY_OVERS:
            await self._settle_over_runs(
                m,
                innings=(1 if first else 2),
                over_target=ov,
                actual_runs=m["scores"][bat]["runs"],
                only_pending=True,
            )

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
        # Only surface the current batting pair (striker / non-striker) — full squads stay server-side
        bat = m.get("batting")
        batters = None
        if bat and m.get("striker_idx") is not None and m["phase"] in ("innings1", "innings2"):
            sq = m["squads"].get(bat, [])
            def _slim(idx):
                if idx is None or idx >= len(sq): return None
                p = sq[idx]
                return {"name": p["name"], "runs": p["runs"], "balls": p["balls"],
                        "fours": p["fours"], "sixes": p["sixes"], "out": p["out"]}
            batters = {
                "striker":     _slim(m["striker_idx"]),
                "non_striker": _slim(m["non_striker_idx"]),
            }
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
            "batters": batters,
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
        elif market == "over_runs":
            # selection format: "inn{1|2}_o{6|10|15}_{over|under}"
            parts = selection.split("_")
            if len(parts) != 3 or parts[0] not in ("inn1","inn2") or not parts[1].startswith("o") or parts[2] not in ("over","under"):
                raise HTTPException(400, "Selection must be inn{1|2}_o{6|10|15}_{over|under}")
            key = f"{parts[0]}_{parts[1]}"
            info = m["odds"]["over_runs"].get(key)
            if not info or info.get("closed") or info.get("line") is None:
                raise HTTPException(400, "Over runs market closed")
            odds = info.get(parts[2], 0)
        elif market == "next_ball":
            if selection not in NEXT_BALL_MARKET:
                raise HTTPException(400, "Selection must be 0/1/2/3/4/6/W")
            if m["phase"] not in ("innings1", "innings2"):
                raise HTTPException(400, "Next-ball market open only during innings")
            odds = m["odds"]["next_ball"].get(selection, 0)
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
        extras: Dict[str, Any] = {}
        if market == "total_runs":
            line = m["odds"]["total_runs"].get("line")
        elif market == "over_runs":
            parts = selection.split("_")
            key = f"{parts[0]}_{parts[1]}"
            info = m["odds"]["over_runs"][key]
            line = info["line"]
            extras["innings_target"] = 1 if parts[0] == "inn1" else 2
            extras["over_target"]    = int(parts[1][1:])
            extras["ou"]             = parts[2]     # "over" or "under"

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
            **extras,
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

    async def _settle_next_ball(self, m: Dict[str, Any], outcome: str):
        """Settle all pending next_ball bets on this match against `outcome`."""
        q = {"match_id": m["id"], "market": "next_ball", "status": "pending"}
        async for b in self.db.virtual_bets.find(q):
            won = (b["selection"] == outcome)
            payout = round(float(b["amount"]) * float(b["odds_taken"]), 2) if won else 0.0
            await self.db.virtual_bets.update_one({"id": b["id"]}, {"$set": {
                "status": "won" if won else "lost",
                "settled_at": iso(now_utc()),
                "payout": payout,
                "outcome": outcome,
            }})
            if won:
                await self.credit(b["user_id"], payout, "virtual_win",
                                  f"Virtual next_ball ({outcome}) win", b["id"])

    async def _settle_over_runs(self, m: Dict[str, Any], innings: int, over_target: int,
                                actual_runs: int, only_pending: bool = False):
        """Settle over_runs bets for a specific innings + over milestone."""
        q = {
            "match_id": m["id"],
            "market": "over_runs",
            "innings_target": innings,
            "over_target": over_target,
            "status": "pending",
        }
        async for b in self.db.virtual_bets.find(q):
            line = float(b.get("line", 0) or 0)
            ou   = b.get("ou", "over")
            if ou == "over":
                won = actual_runs > line
            else:
                won = actual_runs < line
            payout = round(float(b["amount"]) * float(b["odds_taken"]), 2) if won else 0.0
            await self.db.virtual_bets.update_one({"id": b["id"]}, {"$set": {
                "status": "won" if won else "lost",
                "settled_at": iso(now_utc()),
                "payout": payout,
                "runs_final": actual_runs,
            }})
            if won:
                await self.credit(b["user_id"], payout, "virtual_win",
                                  f"Virtual over_runs (inn{innings} o{over_target}) win", b["id"])


# ─────────────────────────── Router ─────────────────────────────────
class BetIn(BaseModel):
    match_id: str
    market:   str = Field(pattern=r"^(match_winner|toss_winner|total_runs|over_runs|next_ball)$")
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
        # load persisted bias mode
        global BIAS_MODE
        try:
            s = await db.settings.find_one({"key": "virtual_bias_mode"})
            if s and s.get("value") in ("normal", "aggressive", "ruthless"):
                BIAS_MODE = s["value"]
                logger.info(f"Virtual bias loaded: {BIAS_MODE}")
        except Exception as e:
            logger.warning(f"could not load virtual bias: {e}")
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

    async def _get_admin_stats():
        """Aggregate wagered / paid-out / house profit for the virtual arena."""
        rows = await db.virtual_bets.aggregate([
            {"$group": {
                "_id": {"market": "$market", "status": "$status"},
                "amount":  {"$sum": "$amount"},
                "payout":  {"$sum": "$payout"},
                "count":   {"$sum": 1},
            }}
        ]).to_list(500)
        totals = {"total_wagered": 0.0, "total_paid_out": 0.0, "count_all": 0,
                  "count_won": 0, "count_lost": 0, "count_cashed_out": 0, "count_pending": 0}
        by_market: Dict[str, Dict[str, float]] = {}
        for r in rows:
            m = r["_id"]["market"]; st = r["_id"]["status"]
            amt = float(r.get("amount", 0) or 0)
            pay = float(r.get("payout", 0) or 0) if st in ("won", "cashed_out") else 0.0
            c   = int(r.get("count", 0))
            totals["total_wagered"] += amt
            totals["total_paid_out"] += pay
            totals["count_all"] += c
            totals[f"count_{st}"] = totals.get(f"count_{st}", 0) + c
            g = by_market.setdefault(m, {"wagered": 0.0, "paid_out": 0.0, "count": 0})
            g["wagered"]  += amt
            g["paid_out"] += pay
            g["count"]    += c
        totals["total_wagered"]  = round(totals["total_wagered"], 2)
        totals["total_paid_out"] = round(totals["total_paid_out"], 2)
        totals["house_profit"]   = round(totals["total_wagered"] - totals["total_paid_out"], 2)
        for m in by_market:
            by_market[m]["wagered"]  = round(by_market[m]["wagered"], 2)
            by_market[m]["paid_out"] = round(by_market[m]["paid_out"], 2)
            by_market[m]["profit"]   = round(by_market[m]["wagered"] - by_market[m]["paid_out"], 2)
        return {"totals": totals, "by_market": by_market, "bias_mode": BIAS_MODE}

    async def _set_bias(mode: str):
        global BIAS_MODE
        mode = str(mode or "").lower().strip()
        if mode not in ("normal", "aggressive", "ruthless"):
            raise HTTPException(400, "bias_mode must be normal|aggressive|ruthless")
        BIAS_MODE = mode
        await db.settings.update_one(
            {"key": "virtual_bias_mode"},
            {"$set": {"key": "virtual_bias_mode", "value": mode}},
            upsert=True,
        )
        # Recompute odds on every active match immediately so operators see the effect
        for _m in list(engine.matches.values()):
            _recompute_odds(_m)
            await engine._broadcast(_m["id"], "state", engine._public_match(_m))
        return {"ok": True, "bias_mode": mode}

    # Expose to server.py via router attributes
    router.get_admin_stats = _get_admin_stats  # type: ignore[attr-defined]
    router.set_bias = _set_bias                # type: ignore[attr-defined]

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
