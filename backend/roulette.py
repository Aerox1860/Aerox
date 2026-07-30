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

BETTING_SECS = 20
SPIN_SECS = 10
RESULT_SECS = 1
MIN_BET = 10.0
MAX_BET = 200000.0

VALID_OUTSIDE = {"red", "black", "even", "odd", "low", "high",
                 "dozen_1", "dozen_2", "dozen_3"}


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
    return False


def profit_multiplier(bet_type: str) -> int:
    if bet_type.startswith("straight_"):
        return 35
    if bet_type in ("dozen_1", "dozen_2", "dozen_3"):
        return 3
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
    return False


# --------------- Global engine state ---------------
STATE: Dict[str, Any] = {
    "phase": "betting",        # betting | spinning | result
    "round_id": "",
    "phase_end": iso(now_utc()),
    "result_number": None,      # int during spinning/result phases
    "history": [],              # last 30 results (newest first)
}


class BetIn(BaseModel):
    bet_type: str = Field(min_length=1, max_length=20)
    amount: float = Field(gt=0)


def build_router(db, credit_fn, debit_fn):
    """Attach roulette routes and start the round loop.

    db          : Motor async DB
    credit_fn   : async (user_id, amount, ttype, note, ref) -> None
    debit_fn    : async (user_id, amount, ttype, note, ref) -> None
    """
    from server import current_user  # local import to avoid cycles

    router = APIRouter(prefix="/api/roulette")

    async def _round_loop():
        await asyncio.sleep(1)  # let app boot
        while True:
            try:
                await _run_one_round()
            except Exception as e:  # noqa: BLE001
                logger.exception(f"roulette round crashed: {e}")
                await asyncio.sleep(2)

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
            await db.roulette_bets.update_one(
                {"id": bet["id"]},
                {"$set": {"status": "won" if won else "lost",
                           "result_number": result,
                           "payout": round(payout, 2),
                           "settled_at": iso(now_utc())}},
            )

    # ---------- Routes ----------
    @router.get("/state")
    async def get_state():
        return {
            "phase": STATE["phase"],
            "round_id": STATE["round_id"],
            "phase_end": STATE["phase_end"],
            "result_number": STATE["result_number"],
            "history": STATE["history"],
            "wheel_order": WHEEL_ORDER,
            "min_bet": MIN_BET,
            "max_bet": MAX_BET,
            "server_time": iso(now_utc()),
        }

    @router.post("/bet")
    async def place_bet(body: BetIn, user: dict = Depends(current_user)):
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
    async def my_bets(user: dict = Depends(current_user)):
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

    @router.get("/history")
    async def history():
        return {"history": STATE["history"]}

    return router, _round_loop
