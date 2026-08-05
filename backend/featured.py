"""Featured matches (admin-managed) shown on the player lobby carousel.

Admin creates a match with:
  • Team 1 name, Team 2 name
  • Match time (ISO string)
  • Sport (cricket / football / horse_racing / other)
  • Optional custom player list per team
  • Odds: back/lay for team 1, team 2, draw (all optional)
  • is_live flag — when True, the match appears on the player lobby

Player endpoint returns only `is_live=True` matches, newest first.

Storage: MongoDB collection `featured_matches`.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field


# ── DB ────────────────────────────────────────────────────────────
_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]
COL = db.featured_matches


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()

def _now_iso() -> str:
    return _iso(datetime.now(timezone.utc))


# ── Schemas ───────────────────────────────────────────────────────
class MatchIn(BaseModel):
    sport: str = Field(pattern=r"^(cricket|football|horse_racing|other)$", default="cricket")
    team1_name: str
    team2_name: str
    match_time: Optional[str] = None    # ISO string
    team1_players: List[str] = Field(default_factory=list)
    team2_players: List[str] = Field(default_factory=list)
    # Odds — 3-column layout in reference image (MO=match odds, BM=bookmaker, F=fancy)
    odds_team1_back: Optional[float] = None
    odds_team1_lay:  Optional[float] = None
    odds_team2_back: Optional[float] = None
    odds_team2_lay:  Optional[float] = None
    odds_draw:       Optional[float] = None
    is_live: bool = True
    rain_delay: bool = False
    tournament: Optional[str] = None    # e.g. "IPL 2026"


class MatchOut(BaseModel):
    id: str
    sport: str
    team1_name: str
    team2_name: str
    match_time: Optional[str]
    team1_players: List[str]
    team2_players: List[str]
    odds_team1_back: Optional[float]
    odds_team1_lay:  Optional[float]
    odds_team2_back: Optional[float]
    odds_team2_lay:  Optional[float]
    odds_draw:       Optional[float]
    is_live: bool
    rain_delay: bool = False
    tournament: Optional[str]
    created_at: str
    updated_at: str


def _row_to_out(r: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: r.get(k) for k in MatchOut.model_fields.keys()}
    # Boolean defaults — coerce missing/None values so pydantic validates OK.
    out["is_live"]    = bool(out.get("is_live"))
    out["rain_delay"] = bool(out.get("rain_delay"))
    return out


# ── Router: /api/featured/... and /api/admin/featured/... ────────
router = APIRouter()


def _require_admin(admin_only_dep):
    """Curried helper — we can't import admin_only from server.py without a
    circular import, so caller injects it at wire-up time (see server.py).
    """
    return admin_only_dep


def make_public_router(current_user_dep, admin_only_dep) -> APIRouter:
    """Wire up all routes with the app's auth dependencies."""
    r = APIRouter()

    # ── Player: list live featured matches ───────────────────────
    @r.get("/featured/matches", response_model=List[MatchOut])
    async def list_public():
        cursor = COL.find({"is_live": True}).sort("created_at", -1).limit(50)
        return [_row_to_out(row) async for row in cursor]

    # ── Admin: full CRUD ──────────────────────────────────────────
    @r.get("/admin/featured/matches", response_model=List[MatchOut])
    async def admin_list(_: dict = Depends(admin_only_dep)):
        cursor = COL.find({}).sort("created_at", -1).limit(200)
        return [_row_to_out(row) async for row in cursor]

    @r.post("/admin/featured/matches", response_model=MatchOut)
    async def admin_create(body: MatchIn, _: dict = Depends(admin_only_dep)):
        now = _now_iso()
        doc = {
            "id": str(uuid.uuid4()),
            **body.model_dump(),
            "created_at": now,
            "updated_at": now,
        }
        await COL.insert_one(doc)
        return _row_to_out(doc)

    @r.put("/admin/featured/matches/{match_id}", response_model=MatchOut)
    async def admin_update(match_id: str, body: MatchIn, _: dict = Depends(admin_only_dep)):
        upd = {**body.model_dump(), "updated_at": _now_iso()}
        res = await COL.find_one_and_update(
            {"id": match_id}, {"$set": upd}, return_document=True
        )
        if not res:
            raise HTTPException(404, "Match not found")
        return _row_to_out(res)

    @r.delete("/admin/featured/matches/{match_id}")
    async def admin_delete(match_id: str, _: dict = Depends(admin_only_dep)):
        r_ = await COL.delete_one({"id": match_id})
        if r_.deleted_count == 0:
            raise HTTPException(404, "Match not found")
        return {"ok": True}

    @r.post("/admin/featured/matches/{match_id}/toggle-live")
    async def admin_toggle(match_id: str, _: dict = Depends(admin_only_dep)):
        row = await COL.find_one({"id": match_id})
        if not row:
            raise HTTPException(404, "Match not found")
        new_live = not row.get("is_live", False)
        await COL.update_one({"id": match_id}, {"$set": {"is_live": new_live, "updated_at": _now_iso()}})
        row["is_live"] = new_live
        return _row_to_out(row)

    @r.post("/admin/featured/matches/{match_id}/toggle-rain")
    async def admin_toggle_rain(match_id: str, _: dict = Depends(admin_only_dep)):
        row = await COL.find_one({"id": match_id})
        if not row:
            raise HTTPException(404, "Match not found")
        new_rain = not row.get("rain_delay", False)
        await COL.update_one({"id": match_id}, {"$set": {"rain_delay": new_rain, "updated_at": _now_iso()}})
        row["rain_delay"] = new_rain
        return _row_to_out(row)

    return r
