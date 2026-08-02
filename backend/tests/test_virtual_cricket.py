"""Virtual Cricket backend tests — Phase 1."""
import os
import time
import json
import asyncio
import pytest
import requests
import websockets

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback for pytest exec context (frontend/.env not exported)
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE = ln.split("=", 1)[1].strip().rstrip("/")

ADMIN_EMAIL = "gowin365x@gmail.com"
ADMIN_PASSWORD = "Admin@AeroX2026"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def ensure_balance(auth):
    # Top up admin so we can freely bet
    r = requests.get(f"{BASE}/api/auth/me", headers=auth, timeout=10)
    assert r.status_code == 200
    me = r.json()
    if float(me.get("balance", 0)) < 500:
        requests.post(f"{BASE}/api/admin/users/adjust", headers=auth,
                      json={"user_id": me["id"], "delta": 5000, "note": "test topup"}, timeout=10)
    return True


# ────────────────── Matches listing ──────────────────
class TestMatchesList:
    def test_three_concurrent_matches(self, auth):
        r = requests.get(f"{BASE}/api/virtual/matches", headers=auth, timeout=10)
        assert r.status_code == 200
        data = r.json()
        matches = data["matches"]
        assert len(matches) == 3, f"expected 3 matches got {len(matches)}"
        for m in matches:
            assert m["phase"] in ("pre_toss", "toss", "innings1", "break", "innings2", "completed")
            assert len(m["teams"]) == 2
            for t in m["teams"]:
                assert all(k in t for k in ("short", "name", "flag", "color"))
            for t in m["teams"]:
                sc = m["scores"][t["short"]]
                assert all(k in sc for k in ("runs", "wickets", "balls", "overs_str"))
            assert set(m["odds"].keys()) >= {"match_winner", "toss_winner", "total_runs"}

    def test_get_by_id(self, auth):
        r = requests.get(f"{BASE}/api/virtual/matches", headers=auth, timeout=10)
        mid = r.json()["matches"][0]["id"]
        r2 = requests.get(f"{BASE}/api/virtual/matches/{mid}", headers=auth, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["id"] == mid

    def test_get_by_bad_id(self, auth):
        r = requests.get(f"{BASE}/api/virtual/matches/nonexistent-id", headers=auth, timeout=10)
        assert r.status_code == 404


def _pick_match_not_completed(auth, exclude_phase=("completed",)):
    r = requests.get(f"{BASE}/api/virtual/matches", headers=auth, timeout=10)
    for m in r.json()["matches"]:
        if m["phase"] not in exclude_phase:
            return m
    return r.json()["matches"][0]


# ────────────────── Match winner bet + cashout ──────────────────
class TestMatchWinnerBet:
    def test_place_mw_bet_and_appears_in_my_bets(self, auth, ensure_balance):
        # find an innings-phase match so odds > 1 and match is stable
        m = None
        for _ in range(30):
            r = requests.get(f"{BASE}/api/virtual/matches", headers=auth, timeout=10)
            for x in r.json()["matches"]:
                if x["phase"] in ("innings1", "innings2", "break"):
                    m = x
                    break
            if m: break
            time.sleep(2)
        assert m, "no innings-phase match found"
        team = m["teams"][0]["short"]
        # balance before
        bal0 = requests.get(f"{BASE}/api/auth/me", headers=auth).json()["balance"]
        r = requests.post(f"{BASE}/api/virtual/bet", headers=auth,
                          json={"match_id": m["id"], "market": "match_winner",
                                "selection": team, "amount": 20}, timeout=10)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        assert "bet_id" in j and j["odds"] > 1.0 and j["potential_payout"] > 0
        bet_id = j["bet_id"]
        bal1 = requests.get(f"{BASE}/api/auth/me", headers=auth).json()["balance"]
        assert round(bal0 - bal1, 2) == 20.0, f"wallet not debited: {bal0}->{bal1}"

        r2 = requests.get(f"{BASE}/api/virtual/my-bets", headers=auth, timeout=10)
        assert r2.status_code == 200
        found = [b for b in r2.json() if b["id"] == bet_id]
        assert found and found[0]["status"] == "pending"
        # stash for cashout test
        pytest._mw_bet = {"bet_id": bet_id, "match_id": m["id"], "amount": 20,
                          "odds_taken": j["odds"], "selection": team}

    def test_cashout_mw(self, auth):
        info = getattr(pytest, "_mw_bet", None)
        assert info, "prev test did not stash bet"
        # get current odds
        r = requests.get(f"{BASE}/api/virtual/matches/{info['match_id']}", headers=auth, timeout=10)
        if r.status_code != 200:
            pytest.skip("match ended before cashout test")
        cur_odds = r.json()["odds"]["match_winner"].get(info["selection"])
        if not cur_odds or cur_odds <= 1.0:
            pytest.skip("odds not valid for cashout")
        expected = round(info["amount"] * info["odds_taken"] / cur_odds, 2)

        bal0 = requests.get(f"{BASE}/api/auth/me", headers=auth).json()["balance"]
        c = requests.post(f"{BASE}/api/virtual/cashout", headers=auth,
                          json={"bet_id": info["bet_id"]}, timeout=10)
        if c.status_code != 200:
            # match may have completed between checks
            assert c.status_code == 400
            pytest.skip(f"cashout rejected (likely match state changed): {c.text}")
        j = c.json()
        assert j["ok"] is True
        assert "payout" in j and "odds_at_cashout" in j
        # payout roughly matches expected (allow small drift for 1-ball tick)
        assert abs(j["payout"] - expected) <= max(0.5, expected * 0.5)
        bal1 = requests.get(f"{BASE}/api/auth/me", headers=auth).json()["balance"]
        assert round(bal1 - bal0, 2) == round(j["payout"], 2)
        # bet status
        bets = requests.get(f"{BASE}/api/virtual/my-bets", headers=auth).json()
        b = [x for x in bets if x["id"] == info["bet_id"]][0]
        assert b["status"] == "cashed_out"
        assert b.get("cashout_multiplier") is not None

    def test_cashout_already_settled(self, auth):
        info = getattr(pytest, "_mw_bet", None)
        if not info: pytest.skip()
        c = requests.post(f"{BASE}/api/virtual/cashout", headers=auth,
                          json={"bet_id": info["bet_id"]}, timeout=10)
        # was cashed out (or skipped) — either way now non-pending
        assert c.status_code == 400


# ────────────────── Toss market gating ──────────────────
class TestTossMarket:
    def test_toss_bet_rejected_when_closed(self, auth, ensure_balance):
        # Any match not in pre_toss should reject
        m = _pick_match_not_completed(auth, exclude_phase=("pre_toss", "completed"))
        if m["phase"] == "pre_toss":
            pytest.skip("all matches are still pre_toss")
        team = m["teams"][0]["short"]
        r = requests.post(f"{BASE}/api/virtual/bet", headers=auth,
                          json={"match_id": m["id"], "market": "toss_winner",
                                "selection": team, "amount": 10}, timeout=10)
        assert r.status_code == 400
        assert "Toss" in r.text or "closed" in r.text.lower()


# ────────────────── Total runs market ──────────────────
class TestTotalRuns:
    def test_place_over(self, auth, ensure_balance):
        m = _pick_match_not_completed(auth)
        r = requests.post(f"{BASE}/api/virtual/bet", headers=auth,
                          json={"match_id": m["id"], "market": "total_runs",
                                "selection": "over", "amount": 10}, timeout=10)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] and j["line"] is not None
        pytest._tr_bet_id = j["bet_id"]

    def test_invalid_selection(self, auth):
        m = _pick_match_not_completed(auth)
        r = requests.post(f"{BASE}/api/virtual/bet", headers=auth,
                          json={"match_id": m["id"], "market": "total_runs",
                                "selection": "sideways", "amount": 10}, timeout=10)
        assert r.status_code == 400

    def test_cashout_on_total_runs_rejected(self, auth):
        bid = getattr(pytest, "_tr_bet_id", None)
        if not bid: pytest.skip()
        r = requests.post(f"{BASE}/api/virtual/cashout", headers=auth,
                          json={"bet_id": bid}, timeout=10)
        assert r.status_code == 400
        assert "match_winner" in r.text.lower() or "cashout" in r.text.lower()


# ────────────────── Dynamic odds ──────────────────
class TestDynamicOdds:
    def test_odds_change_over_time(self, auth):
        # find innings2 match for maximum volatility, else innings1
        m = None
        for _ in range(10):
            r = requests.get(f"{BASE}/api/virtual/matches", headers=auth, timeout=10)
            for x in r.json()["matches"]:
                if x["phase"] in ("innings1", "innings2"):
                    m = x
                    break
            if m: break
            time.sleep(2)
        assert m
        mid = m["id"]
        s1 = requests.get(f"{BASE}/api/virtual/matches/{mid}", headers=auth).json()
        o1 = json.dumps(s1["odds"]["match_winner"], sort_keys=True)
        b1 = sum(s1["scores"][t["short"]]["balls"] for t in s1["teams"])
        time.sleep(5)
        s2 = requests.get(f"{BASE}/api/virtual/matches/{mid}", headers=auth)
        if s2.status_code != 200:
            pytest.skip("match ended")
        s2 = s2.json()
        o2 = json.dumps(s2["odds"]["match_winner"], sort_keys=True)
        b2 = sum(s2["scores"][t["short"]]["balls"] for t in s2["teams"])
        # either odds changed OR at least a ball ticked
        assert (o1 != o2) or (b2 > b1), f"no ball progress and odds identical: {o1}"


# ────────────────── WebSocket ──────────────────
class TestWebSocket:
    def test_ws_receives_state_and_ball(self, auth):
        m = None
        for _ in range(15):
            r = requests.get(f"{BASE}/api/virtual/matches", headers=auth, timeout=10)
            for x in r.json()["matches"]:
                if x["phase"] in ("innings1", "innings2"):
                    m = x; break
            if m: break
            time.sleep(2)
        assert m
        ws_url = BASE.replace("https://", "wss://").replace("http://", "ws://") + f"/api/virtual/ws/{m['id']}"

        async def run():
            async with websockets.connect(ws_url, ping_interval=None, open_timeout=10) as ws:
                first = json.loads(await asyncio.wait_for(ws.recv(), timeout=8))
                assert first["type"] == "state"
                # wait up to 8s for a ball
                got_ball = False
                deadline = time.time() + 10
                while time.time() < deadline:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=6))
                    if msg["type"] == "ball":
                        got_ball = True
                        break
                assert got_ball, "no ball msg received"
        asyncio.run(run())


# ────────────────── Regression ──────────────────
class TestRegression:
    def test_admin_login(self):
        # Skipped: fresh login here invalidates the module-scoped token (single-session).
        pytest.skip("covered by module fixture — fresh login would break single-session token")

    def test_admin_games_status(self, auth):
        r = requests.get(f"{BASE}/api/admin/games/status", headers=auth, timeout=10)
        assert r.status_code == 200
        j = r.json()
        for k in ("crash_live", "roulette_live", "bias_mode"):
            assert k in j, f"missing {k}"

    def test_inplay(self, auth):
        r = requests.get(f"{BASE}/api/inplay/matches", headers=auth, timeout=15)
        if r.status_code == 502:
            pytest.skip("CricAPI upstream blocked/rate-limited (502 at edge)")
        assert r.status_code == 200
        j = r.json()
        assert "live" in j and "upcoming" in j
