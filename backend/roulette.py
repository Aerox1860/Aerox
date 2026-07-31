"""AeroX Casino — Roulette engine.

European single-zero roulette with the exact physical wheel sequence:
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26

Bet types & profit ratios (per user spec):
    straight_N       -> profit = bet * 35
    red / black      -> profit = bet * 1
    even / odd       -> profit = bet * 1
    low (1-18)       -> profit = bet * 1
    high (19-36)     -> profit = bet * 1
    dozen_1..3       -> profit = bet * 3
    On result = 0, only straight_0 wins. All outside bets lose.
"""
from __future__ import annotations
import asyncio
import secrets
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

logger = logging.getLogger("roulette")

WHEEL_ORDER: List[int] = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]
RED = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
BLACK = {2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35}

# --- Allowed multi-number bets on the European table ---
# Splits: 0-adjacencies + vertical (in-column) + horizontal (between-column, same-row)
def _build_allowed_splits() -> set:
    splits = {(0, 1), (0, 2), (0, 3)}
    # 1..36 laid out in 3 rows × 12 columns:  row_bot(1) = 3k-2, row_mid(2) = 3k-1, row_top(3) = 3k
    for k in range(1, 13):
        col = [3 * k - 2, 3 * k - 1, 3 * k]
        splits.add((col[0], col[1]))
        splits.add((col[1], col[2]))
    for k in range(1, 12):
        splits.add((3 * k - 2, 3 * (k + 1) - 2))  # row bot: 1-4, 4-7 ...
        splits.add((3 * k - 1, 3 * (k + 1) - 1))  # row mid: 2-5, 5-8 ...
        splits.add((3 * k,     3 * (k + 1)))      # row top: 3-6, 6-9 ...
    return splits


ALLOWED_SPLITS: set = _build_allowed_splits()


def _build_allowed_streets() -> set:
    # All 12 in-column streets (1,2,3 | 4,5,6 | ... | 34,35,36) PLUS both 0-trios.
    streets = {(0, 1, 2), (0, 2, 3)}
    for k in range(1, 13):
        streets.add((3 * k - 2, 3 * k - 1, 3 * k))
    return streets


ALLOWED_STREETS: set = _build_allowed_streets()


def _build_allowed_six_lines() -> set:
    # 11 six-line bets spanning two adjacent 3-number columns.
    six = set()
    for k in range(1, 12):
        six.add((
            3 * k - 2, 3 * k - 1, 3 * k,
            3 * (k + 1) - 2, 3 * (k + 1) - 1, 3 * (k + 1),
        ))
    return six


ALLOWED_SIX_LINES: set = _build_allowed_six_lines()


def _build_allowed_corners() -> set:
    corners = set()
    for k in range(1, 12):
        # bottom+mid two adjacent columns → e.g. (1,2,4,5)
        corners.add((3 * k - 2, 3 * k - 1, 3 * (k + 1) - 2, 3 * (k + 1) - 1))
        # mid+top two adjacent columns → e.g. (2,3,5,6)
        corners.add((3 * k - 1, 3 * k,     3 * (k + 1) - 1, 3 * (k + 1)))
    return corners


ALLOWED_CORNERS: set = _build_allowed_corners()

BETTING_SECS = 20
SPIN_SECS = 10
RESULT_SECS = 1
MIN_BET = 10.0
MAX_BET = 200000.0

VALID_OUTSIDE = {"red", "black", "even", "odd", "low", "high",
                 "dozen_1", "dozen_2", "dozen_3",
                 "column_1", "column_2", "column_3"}


def color_of(n: int) -> str:
    if n == 0:
        return "green"
    return "red" if n in RED else "black"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def is_winner(bet_type: str, number: int) -> bool:
    if bet_type.startswith("straight_"):
        try:
            return int(bet_type.split("_", 1)[1]) == number
        except (ValueError, IndexError):
            return False
    if bet_type.startswith("split_"):
        try:
            parts = tuple(sorted(int(x) for x in bet_type.split("_")[1:]))
            return len(parts) == 2 and parts in ALLOWED_SPLITS and number in parts
        except ValueError:
            return False
    if bet_type.startswith("street_"):
        try:
            parts = tuple(sorted(int(x) for x in bet_type.split("_")[1:]))
            return len(parts) == 3 and parts in ALLOWED_STREETS and number in parts
        except ValueError:
            return False
    if bet_type.startswith("corner_"):
        try:
            parts = tuple(sorted(int(x) for x in bet_type.split("_")[1:]))
            return len(parts) == 4 and parts in ALLOWED_CORNERS and number in parts
        except ValueError:
            return False
    if bet_type.startswith("six_line_"):
        try:
            parts = tuple(sorted(int(x) for x in bet_type.split("_")[2:]))
            return len(parts) == 6 and parts in ALLOWED_SIX_LINES and number in parts
        except ValueError:
            return False
    if number == 0:
        return False  # all outside bets lose on zero
    if bet_type == "red":
        return number in RED
    if bet_type == "black":
        return number in BLACK
    if bet_type == "even":
        return number % 2 == 0
    if bet_type == "odd":
        return number % 2 == 1
    if bet_type == "low":
        return 1 <= number <= 18
    if bet_type == "high":
        return 19 <= number <= 36
    if bet_type == "dozen_1":
        return 1 <= number <= 12
    if bet_type == "dozen_2":
        return 13 <= number <= 24
    if bet_type == "dozen_3":
        return 25 <= number <= 36
    if bet_type == "column_1":  # bottom row on horizontal table = leftmost in vertical layout: 1,4,7,...,34
        return number % 3 == 1
    if bet_type == "column_2":  # middle row/column: 2,5,8,...,35
        return number % 3 == 2
    if bet_type == "column_3":  # top row/right column: 3,6,9,...,36
        return number % 3 == 0
    return False


def profit_multiplier(bet_type: str) -> int:
    if bet_type.startswith("straight_"):
        return 35
    if bet_type.startswith("split_"):
        return 17
    if bet_type.startswith("street_"):
        return 11
    if bet_type.startswith("corner_"):
        return 8
    if bet_type.startswith("six_line_"):
        return 5
    if bet_type in ("column_1", "column_2", "column_3",
                    "dozen_1", "dozen_2", "dozen_3"):
        # Standard European roulette: both columns and dozens pay 2:1
        return 2
    return 1  # red/black/even/odd/low/high


def validate_bet_type(bet_type: str) -> bool:
    if bet_type in VALID_OUTSIDE:
        return True
    if bet_type.startswith("straight_"):
        try:
            n = int(bet_type.split("_", 1)[1])
            return 0 <= n <= 36
        except (ValueError, IndexError):
            return False
    if bet_type.startswith("split_"):
        try:
            parts = tuple(sorted(int(x) for x in bet_type.split("_")[1:]))
            return len(parts) == 2 and parts in ALLOWED_SPLITS
        except ValueError:
            return False
    if bet_type.startswith("street_"):
        try:
            parts = tuple(sorted(int(x) for x in bet_type.split("_")[1:]))
            return len(parts) == 3 and parts in ALLOWED_STREETS
        except ValueError:
            return False
    if bet_type.startswith("corner_"):
        try:
            parts = tuple(sorted(int(x) for x in bet_type.split("_")[1:]))
            return len(parts) == 4 and parts in ALLOWED_CORNERS
        except ValueError:
            return False
    if bet_type.startswith("six_line_"):
        try:
            parts = tuple(sorted(int(x) for x in bet_type.split("_")[2:]))
            return len(parts) == 6 and parts in ALLOWED_SIX_LINES
        except ValueError:
            return False
    return False


# --------------- Global engine state ---------------
STATE: Dict[str, Any] = {
    "phase": "betting",        # betting | spinning | result
    "round_id": "",
    "phase_end": iso(now_utc()),
    "result_number": None,      # int during spinning/result phases
    "history": [],              # last 30 results (newest first)
    "winners": [],              # last round's winners: [{name, amount, bet_type}]
}


class BetIn(BaseModel):
    bet_type: str = Field(min_length=1, max_length=32)
    amount: float = Field(gt=0)


def build_router(db, credit_fn, debit_fn, current_user_dep, is_enabled_fn=None):
    """Attach roulette routes and start the round loop.

    db                : Motor async DB
    credit_fn         : async (user_id, amount, ttype, note, ref) -> None
    debit_fn          : async (user_id, amount, ttype, note, ref) -> None
    current_user_dep  : FastAPI dependency callable that resolves the current user
    is_enabled_fn     : optional callable() -> bool. When it returns False the
                        round loop pauses and bets are rejected (maintenance).
    """
    router = APIRouter(prefix="/api/roulette")

    def _enabled() -> bool:
        try:
            return True if is_enabled_fn is None else bool(is_enabled_fn())
        except Exception:
            return True

    async def _round_loop():
        await asyncio.sleep(1)  # let app boot
        while True:
            try:
                if not _enabled():
                    await asyncio.sleep(2)
                    continue
                await _run_one_round()
            except Exception as e:  # noqa: BLE001
                logger.exception(f"roulette round crashed: {e}")
                await asyncio.sleep(2)

    async def _cleanup_loop():
        """Every hour, delete roulette bets & transactions older than 24 hours."""
        await asyncio.sleep(30)  # let app boot
        while True:
            try:
                from datetime import timedelta
                cutoff = iso(now_utc() - timedelta(hours=24))
                r1 = await db.roulette_bets.delete_many({"created_at": {"$lt": cutoff}})
                r2 = await db.transactions.delete_many({
                    "type": {"$in": ["roulette_bet", "roulette_win", "roulette_refund"]},
                    "created_at": {"$lt": cutoff},
                })
                r3 = await db.roulette_rounds.delete_many({"started_at": {"$lt": cutoff}})
                if r1.deleted_count or r2.deleted_count or r3.deleted_count:
                    logger.info(
                        f"roulette cleanup: {r1.deleted_count} bets, "
                        f"{r2.deleted_count} txns, {r3.deleted_count} rounds pruned (>24h)"
                    )
            except Exception as e:  # noqa: BLE001
                logger.exception(f"roulette cleanup failed: {e}")
            await asyncio.sleep(60 * 60)  # every hour

    async def _combined_loop():
        # Fire-and-forget the cleanup loop alongside the game round loop.
        asyncio.create_task(_cleanup_loop())
        await _round_loop()

    async def _run_one_round():
        round_id = str(uuid.uuid4())
        # ---- Betting phase ----
        end = now_utc().timestamp() + BETTING_SECS
        STATE["phase"] = "betting"
        STATE["round_id"] = round_id
        STATE["phase_end"] = iso(datetime.fromtimestamp(end, tz=timezone.utc))
        STATE["result_number"] = None
        await db.roulette_rounds.insert_one({
            "id": round_id,
            "started_at": iso(now_utc()),
            "status": "betting",
        })
        await asyncio.sleep(BETTING_SECS)

        # ---- Determine result (random 0..36) ----
        result = secrets.randbelow(37)

        # ---- Spinning phase (broadcast result so wheel can animate) ----
        end = now_utc().timestamp() + SPIN_SECS
        STATE["phase"] = "spinning"
        STATE["phase_end"] = iso(datetime.fromtimestamp(end, tz=timezone.utc))
        STATE["result_number"] = result
        await asyncio.sleep(SPIN_SECS)

        # ---- Settle bets ----
        await _settle_round(round_id, result)

        # ---- Result phase ----
        end = now_utc().timestamp() + RESULT_SECS
        STATE["phase"] = "result"
        STATE["phase_end"] = iso(datetime.fromtimestamp(end, tz=timezone.utc))
        entry = {"round_id": round_id, "number": result,
                 "color": color_of(result), "at": iso(now_utc())}
        STATE["history"] = ([entry] + STATE["history"])[:30]
        await db.roulette_rounds.update_one(
            {"id": round_id},
            {"$set": {"result": result, "color": color_of(result),
                       "settled_at": iso(now_utc()), "status": "settled"}},
        )
        await asyncio.sleep(RESULT_SECS)

    async def _settle_round(round_id: str, result: int):
        winners_agg: Dict[str, Dict[str, Any]] = {}   # user_id -> {name, amount, top_bet_type}
        cursor = db.roulette_bets.find({"round_id": round_id, "status": "pending"})
        async for bet in cursor:
            won = is_winner(bet["bet_type"], result)
            payout = 0.0
            if won:
                mult = profit_multiplier(bet["bet_type"])
                payout = float(bet["amount"]) * (mult + 1)  # stake + profit
                await credit_fn(bet["user_id"], payout, "roulette_win",
                                f"Roulette win {bet['bet_type']} on {result}",
                                round_id)
                # Aggregate for winners ticker
                agg = winners_agg.setdefault(bet["user_id"], {"amount": 0.0, "top_bet_type": bet["bet_type"], "top_mult": 0})
                agg["amount"] += payout
                if mult > agg["top_mult"]:
                    agg["top_mult"] = mult
                    agg["top_bet_type"] = bet["bet_type"]
            await db.roulette_bets.update_one(
                {"id": bet["id"]},
                {"$set": {"status": "won" if won else "lost",
                           "result_number": result,
                           "payout": round(payout, 2),
                           "settled_at": iso(now_utc())}},
            )
        # Enrich with user names & publish in STATE for the winners ticker
        winners_list = []
        for uid, agg in winners_agg.items():
            u = await db.users.find_one({"id": uid}, {"name": 1, "email": 1})
            display = (u or {}).get("name") or ((u or {}).get("email") or "Player").split("@")[0]
            winners_list.append({
                "name": display,
                "amount": round(agg["amount"], 2),
                "bet_type": agg["top_bet_type"],
                "round_id": round_id,
                "number": result,
            })
        # sort by amount desc so biggest wins float to top
        winners_list.sort(key=lambda w: -w["amount"])
        STATE["winners"] = winners_list[:20]

    # ---------- Routes ----------
    @router.get("/state")
    async def get_state():
        return {
            "phase": STATE["phase"],
            "round_id": STATE["round_id"],
            "phase_end": STATE["phase_end"],
            "result_number": STATE["result_number"],
            "history": STATE["history"],
            "winners": STATE.get("winners", []),
            "wheel_order": WHEEL_ORDER,
            "min_bet": MIN_BET,
            "max_bet": MAX_BET,
            "enabled": _enabled(),
            "server_time": iso(now_utc()),
        }

    @router.post("/bet")
    async def place_bet(body: BetIn, user: dict = Depends(current_user_dep)):
        if not _enabled():
            raise HTTPException(503, "Roulette is under maintenance")
        if STATE["phase"] != "betting":
            raise HTTPException(400, "Betting is closed for this round")
        if not validate_bet_type(body.bet_type):
            raise HTTPException(400, "Invalid bet type")
        if body.amount < MIN_BET:
            raise HTTPException(400, f"Minimum bet is ₹{int(MIN_BET)}")
        if body.amount > MAX_BET:
            raise HTTPException(400, f"Maximum bet is ₹{int(MAX_BET)}")

        # Refresh balance
        user_doc = await db.users.find_one({"id": user["id"]})
        if not user_doc or float(user_doc.get("balance", 0)) < body.amount:
            raise HTTPException(400, "Insufficient balance")

        round_id = STATE["round_id"]
        bet_id = str(uuid.uuid4())
        await debit_fn(user["id"], body.amount, "roulette_bet",
                       f"Roulette bet {body.bet_type}", round_id)
        await db.roulette_bets.insert_one({
            "id": bet_id,
            "user_id": user["id"],
            "round_id": round_id,
            "bet_type": body.bet_type,
            "amount": round(float(body.amount), 2),
            "status": "pending",
            "created_at": iso(now_utc()),
        })
        # Return updated balance
        u = await db.users.find_one({"id": user["id"]})
        return {"ok": True, "bet_id": bet_id, "balance": u.get("balance", 0)}

    @router.get("/my-bets")
    async def my_bets(user: dict = Depends(current_user_dep)):
        # Current-round bets + last 20 settled
        cur = await db.roulette_bets.find(
            {"user_id": user["id"], "round_id": STATE["round_id"]}
        ).to_list(length=100)
        recent = await db.roulette_bets.find(
            {"user_id": user["id"], "status": {"$in": ["won", "lost"]}}
        ).sort("created_at", -1).to_list(length=20)
        for b in cur + recent:
            b.pop("_id", None)
        return {"current": cur, "recent": recent}

    @router.delete("/bet/{bet_id}")
    async def remove_bet(bet_id: str, user: dict = Depends(current_user_dep)):
        """Remove a bet during the betting phase and refund the stake."""
        if STATE["phase"] != "betting":
            raise HTTPException(400, "Betting is closed — bets cannot be removed")
        bet = await db.roulette_bets.find_one({"id": bet_id})
        if not bet:
            raise HTTPException(404, "Bet not found")
        if bet["user_id"] != user["id"]:
            raise HTTPException(403, "Not your bet")
        if bet["round_id"] != STATE["round_id"]:
            raise HTTPException(400, "Bet is not in the current round")
        if bet["status"] != "pending":
            raise HTTPException(400, "Bet cannot be removed anymore")
        # Refund the stake and delete the bet
        await credit_fn(user["id"], float(bet["amount"]), "roulette_refund",
                        f"Roulette bet removed ({bet['bet_type']})", bet["round_id"])
        await db.roulette_bets.delete_one({"id": bet_id})
        u = await db.users.find_one({"id": user["id"]})
        return {"ok": True, "refunded": bet["amount"], "balance": u.get("balance", 0)}

    @router.get("/my-history")
    async def my_history(user: dict = Depends(current_user_dep), hours: int = 24):
        """Return this user's roulette bets settled in the last N hours (default 24)."""
        from datetime import timedelta
        cutoff = iso(now_utc() - timedelta(hours=max(1, min(hours, 24))))
        rows = await db.roulette_bets.find(
            {"user_id": user["id"], "created_at": {"$gte": cutoff}},
            {"_id": 0},
        ).sort("created_at", -1).to_list(length=500)
        return {"history": rows, "hours": hours}

    @router.get("/history")
    async def history():
        return {"history": STATE["history"]}

    return router, _combined_loop
