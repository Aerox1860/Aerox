"""Cricket In-Play integration (CricAPI / CricketData.org).

Provides a light backend proxy so the API key stays on the server and we
respect the free-tier quota (100 hits/day) via an in-memory 30s cache.
"""
import os
import time
import logging
import asyncio
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException

logger = logging.getLogger("aerox.cricket")

CRICKET_API_KEY = os.environ.get("CRICKET_API_KEY", "")
BASE = "https://api.cricapi.com/v1"

_CACHE: Dict[str, tuple[float, Any]] = {}      # key -> (expires_at_ts, payload)
_CACHE_TTL_SECS = 30
_LOCK = asyncio.Lock()


async def _fetch(path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Cached CricAPI fetch."""
    if not CRICKET_API_KEY:
        raise HTTPException(503, "Cricket API not configured on the server")
    q = {"apikey": CRICKET_API_KEY, "offset": 0, **(params or {})}
    cache_key = f"{path}?{sorted(q.items())}"
    now = time.time()
    async with _LOCK:
        hit = _CACHE.get(cache_key)
        if hit and hit[0] > now:
            return hit[1]
    async with httpx.AsyncClient(timeout=10) as cli:
        r = await cli.get(f"{BASE}/{path}", params=q)
    if r.status_code != 200:
        raise HTTPException(502, f"CricAPI HTTP {r.status_code}")
    payload = r.json()
    if payload.get("status") != "success":
        # Common cases: hits exhausted, invalid key
        msg = payload.get("reason") or payload.get("info", {}).get("s") or "CricAPI error"
        raise HTTPException(502, f"CricAPI: {msg}")
    async with _LOCK:
        _CACHE[cache_key] = (now + _CACHE_TTL_SECS, payload)
    return payload


def _short_of(team_name: str, team_info: List[Dict[str, Any]]) -> str:
    for t in team_info or []:
        if (t.get("name") or "").lower() == (team_name or "").lower():
            return t.get("shortname") or "".join([w[0] for w in team_name.split()][:3]).upper()
    return "".join([w[0] for w in (team_name or "").split()][:3]).upper()


def _flag_of(_short: str) -> str:
    # Emoji flags are hit-or-miss; return a coloured circle so the UI stays clean.
    palette = ["🟦", "🟥", "🟩", "🟨", "🟪", "🟧", "⬜", "🟫"]
    return palette[(sum(ord(c) for c in _short) % len(palette))]


def _score_for(team_name: str, scores: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Return the LATEST innings score for a team (last matching item in scores)."""
    latest = None
    for s in scores or []:
        if (s.get("inning") or "").lower().startswith((team_name or "").lower()):
            latest = s
    if not latest:
        return {}
    return {"score": int(latest.get("r", 0) or 0),
            "wickets": int(latest.get("w", 0) or 0),
            "overs": float(latest.get("o", 0) or 0)}


def _transform_match(m: Dict[str, Any]) -> Dict[str, Any]:
    """CricAPI match dict -> our frontend shape."""
    teams_list = m.get("teams") or []
    team_info  = m.get("teamInfo") or []
    scores     = m.get("score") or []
    started    = bool(m.get("matchStarted"))
    ended      = bool(m.get("matchEnded"))
    if ended:
        status = "completed"
    elif started:
        status = "live"
    else:
        status = "upcoming"

    teams = []
    for t in teams_list[:2]:
        short = _short_of(t, team_info)
        row = {"name": t, "short": short, "flag": _flag_of(short)}
        if status in ("live", "completed"):
            row.update(_score_for(t, scores))
        teams.append(row)

    # Try to guess who is batting from latest inning label
    current_batting = None
    if status == "live" and scores:
        last = scores[-1].get("inning", "")
        for t in teams:
            if last.lower().startswith(t["name"].lower()):
                current_batting = t["short"]
                break

    # Series name — first part of match name before the ", Nth Match" is the teams,
    # last chunk is the series. Fallback to full name.
    name = m.get("name") or ""
    parts = [p.strip() for p in name.split(",")]
    series = parts[-1] if len(parts) >= 2 else name

    return {
        "id":       m.get("id"),
        "series":   series,
        "format":   (m.get("matchType") or "").upper() or "T20",
        "status":   status,
        "teams":    teams,
        "venue":    m.get("venue") or "TBD",
        "startTime": m.get("dateTimeGMT") or m.get("date") or "",
        "currentBatting": current_batting,
        "matchNotes":   m.get("status") or "",
    }


def build_router() -> APIRouter:
    router = APIRouter(prefix="/api/inplay")

    @router.get("/matches")
    async def matches():
        """Live + upcoming cricket matches (merged from two CricAPI endpoints)."""
        try:
            current  = await _fetch("currentMatches")
            upcoming = await _fetch("matches")
        except HTTPException as e:
            raise e
        except Exception as e:
            logger.exception(f"cricket fetch failed: {e}")
            raise HTTPException(502, "Cricket API unavailable")
        live_rows = [_transform_match(m) for m in (current.get("data") or [])]
        live_rows = [r for r in live_rows if r["status"] == "live"]

        up_rows = [_transform_match(m) for m in (upcoming.get("data") or [])]
        up_rows = [r for r in up_rows if r["status"] == "upcoming"]
        # De-duplicate by id (in case an entry appears in both feeds)
        seen = {r["id"] for r in live_rows}
        up_rows = [r for r in up_rows if r["id"] not in seen]

        info = current.get("info", {}) or {}
        return {
            "live":     live_rows,
            "upcoming": up_rows,
            "hits":       info.get("hitsUsed"),
            "hits_limit": info.get("hitsLimit"),
            "cached_ttl_secs": _CACHE_TTL_SECS,
        }

    return router
