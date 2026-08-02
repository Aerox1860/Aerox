"""Virtual Cricket backend tests — T20 rework (iteration 16).

Covers:
- 3 concurrent matches, slot 0 domestic + 1/2 international
- tour filter query param
- phase enum & schedule metadata (toss_at/play_at/format=T20)
- toss_winner market gating (pre_match only)
- match_winner bet + cashout + wallet
- Commentary filter: only current + previous over (+ non-ball notes)
- Regression: admin login / games status / inplay
"""
import os
import time
import json
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE = ln.split("=", 1)[1].strip().rstrip("/")

ADMIN_EMAIL = "gowin365x@gmail.com"
ADMIN_PASSWORD = "Admin@AeroX2026"

VALID_PHASES = {"pre_match", "toss", "lineup", "innings1", "break", "innings2", "completed"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def ensure_balance(auth):
    r = requests.get(f"{BASE}/api/auth/me", headers=auth, timeout=10)
    assert r.status_code == 200
    me = r.json()
    if float(me.get("balance", 0)) < 500:
        requests.post(f"{BASE}/api/admin/users/adjust", headers=auth,
                      json={"user_id": me["id"], "delta": 5000, "note": "test topup"},
                      timeout=10)
    return True


def _all_matches(auth):
    r = requests.get(f"{BASE}/api/virtual/matches", headers=auth, timeout=10)
    assert r.status_code == 200
    return r.json()["matches"]


def _pick(auth, phase_in=None, phase_not_in=None):
    for m in _all_matches(auth):
        if phase_in and m["phase"] not in phase_in: continue
        if phase_not_in and m["phase"] in phase_not_in: continue
        return m
    return None


# ────────────────── Matches listing ──────────────────
class TestMatchesList:
    def test_three_concurrent(self, auth):
        matches = _all_matches(auth)
        assert len(matches) == 3, f"expected 3 matches got {len(matches)}"
        for m in matches:
            assert m["phase"] in VALID_PHASES, f"unexpected phase {m['phase']}"
            assert m["format"] == "T20", f"format should be T20 got {m['format']}"
            assert m.get("toss_at"), "toss_at missing"
            assert m.get("play_at"), "play_at missing"
            assert m.get("tour_type") in ("international", "domestic")
            assert m.get("league")
            assert len(m["teams"]) == 2
            for t in m["teams"]:
                assert all(k in t for k in ("short", "name", "flag", "color"))
            assert set(m["odds"].keys()) >= {"match_winner", "toss_winner", "total_runs"}

    def test_tour_type_rotation(self, auth):
        matches = _all_matches(auth)
        tour_types = [m["tour_type"] for m in matches]
        assert "international" in tour_types, "no international match found"
        assert "domestic" in tour_types, "no domestic match found"

    def test_tour_filter_international(self, auth):
        r = requests.get(f"{BASE}/api/virtual/matches?tour=international",
                         headers=auth, timeout=10)
        assert r.status_code == 200
        for m in r.json()["matches"]:
            assert m["tour_type"] == "international"

    def test_tour_filter_domestic(self, auth):
        r = requests.get(f"{BASE}/api/virtual/matches?tour=domestic",
                         headers=auth, timeout=10)
        assert r.status_code == 200
        for m in r.json()["matches"]:
            assert m["tour_type"] == "domestic"

    def test_tour_filter_invalid_returns_all(self, auth):
        r = requests.get(f"{BASE}/api/virtual/matches?tour=garbage",
                         headers=auth, timeout=10)
        assert r.status_code == 200
        assert len(r.json()["matches"]) == 3

    def test_get_by_id(self, auth):
        m = _all_matches(auth)[0]
        r2 = requests.get(f"{BASE}/api/virtual/matches/{m['id']}", headers=auth, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["id"] == m["id"]

    def test_get_by_bad_id(self, auth):
        r = requests.get(f"{BASE}/api/virtual/matches/nonexistent-id",
                         headers=auth, timeout=10)
        assert r.status_code == 404


# ────────────────── Toss market gating ──────────────────
class TestTossMarketGating:
    def test_toss_bet_allowed_in_pre_match(self, auth, ensure_balance):
        m = _pick(auth, phase_in=("pre_match",))
        if not m:
            pytest.skip("no pre_match match right now")
        team = m["teams"][0]["short"]
        r = requests.post(f"{BASE}/api/virtual/bet", headers=auth,
                          json={"match_id": m["id"], "market": "toss_winner",
                                "selection": team, "amount": 10}, timeout=10)
        assert r.status_code == 200, f"toss bet in pre_match should be accepted: {r.text}"
        assert r.json()["ok"] is True

    def test_toss_bet_rejected_when_not_pre_match(self, auth, ensure_balance):
        m = _pick(auth, phase_not_in=("pre_match", "completed"))
        if not m:
            pytest.skip("no non-pre_match match right now")
        team = m["teams"][0]["short"]
        r = requests.post(f"{BASE}/api/virtual/bet", headers=auth,
                          json={"match_id": m["id"], "market": "toss_winner",
                                "selection": team, "amount": 10}, timeout=10)
        assert r.status_code == 400, r.text
        assert "toss" in r.text.lower() and "closed" in r.text.lower()


# ────────────────── Match winner bet + cashout ──────────────────
class TestMatchWinnerBet:
    def test_place_mw_bet(self, auth, ensure_balance):
        # find innings-phase match so odds > 1 and match is stable
        m = None
        for _ in range(20):
            m = _pick(auth, phase_in=("innings1", "innings2", "break"))
            if m: break
            time.sleep(3)
        if not m:
            pytest.skip("no innings-phase match available")
        team = m["teams"][0]["short"]
        bal0 = requests.get(f"{BASE}/api/auth/me", headers=auth).json()["balance"]
        r = requests.post(f"{BASE}/api/virtual/bet", headers=auth,
                          json={"match_id": m["id"], "market": "match_winner",
                                "selection": team, "amount": 20}, timeout=10)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        assert "bet_id" in j and j["odds"] > 1.0 and j["potential_payout"] > 0
        bal1 = requests.get(f"{BASE}/api/auth/me", headers=auth).json()["balance"]
        assert round(bal0 - bal1, 2) == 20.0, f"wallet not debited: {bal0}->{bal1}"

        # my-bets shows pending
        bets = requests.get(f"{BASE}/api/virtual/my-bets", headers=auth, timeout=10).json()
        found = [b for b in bets if b["id"] == j["bet_id"]]
        assert found and found[0]["status"] == "pending"

        pytest._mw_bet = {"bet_id": j["bet_id"], "match_id": m["id"], "amount": 20,
                          "odds_taken": j["odds"], "selection": team}

    def test_cashout_mw(self, auth):
        info = getattr(pytest, "_mw_bet", None)
        if not info:
            pytest.skip("prev test did not stash bet")
        r = requests.get(f"{BASE}/api/virtual/matches/{info['match_id']}",
                         headers=auth, timeout=10)
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
            assert c.status_code == 400
            pytest.skip(f"cashout rejected (state changed): {c.text}")
        j = c.json()
        assert j["ok"] is True
        assert abs(j["payout"] - expected) <= max(0.5, expected * 0.5)
        bal1 = requests.get(f"{BASE}/api/auth/me", headers=auth).json()["balance"]
        assert round(bal1 - bal0, 2) == round(j["payout"], 2)
        bets = requests.get(f"{BASE}/api/virtual/my-bets", headers=auth).json()
        b = [x for x in bets if x["id"] == info["bet_id"]][0]
        assert b["status"] == "cashed_out"


# ────────────────── Commentary filter ──────────────────
class TestCommentaryFilter:
    def test_only_current_and_previous_over(self, auth):
        m = None
        for _ in range(20):
            m = _pick(auth, phase_in=("innings1", "innings2"))
            if m and len(m.get("commentary", [])) > 0:
                # need some balls bowled
                bat = m.get("batting")
                if bat and m["scores"][bat]["balls"] >= 1:
                    break
            time.sleep(3)
        if not m or not m.get("batting"):
            pytest.skip("no innings match with commentary available")

        # refetch to get fresh
        r = requests.get(f"{BASE}/api/virtual/matches/{m['id']}", headers=auth, timeout=10)
        if r.status_code != 200:
            pytest.skip("match ended")
        data = r.json()
        bat = data["batting"]
        balls = data["scores"][bat]["balls"]
        current_over = balls // 6
        allowed = {current_over, max(0, current_over - 1)}
        for c in data.get("commentary", []):
            ov = str(c.get("over", ""))
            if ov.startswith("-") or ov == "":
                continue  # non-ball notes allowed
            try:
                ov_idx = int(ov.split(".")[0])
            except ValueError:
                continue
            assert ov_idx in allowed, (
                f"commentary contains over {ov_idx} but current={current_over}; "
                f"allowed={allowed}"
            )


# ────────────────── Regression ──────────────────
class TestRegression:
    def test_admin_games_status(self, auth):
        r = requests.get(f"{BASE}/api/admin/games/status", headers=auth, timeout=10)
        assert r.status_code == 200
        j = r.json()
        for k in ("crash_live", "roulette_live", "bias_mode"):
            assert k in j

    def test_inplay(self, auth):
        r = requests.get(f"{BASE}/api/inplay/matches", headers=auth, timeout=15)
        if r.status_code == 502:
            pytest.skip("CricAPI upstream blocked (502)")
        assert r.status_code == 200
        j = r.json()
        assert "live" in j and "upcoming" in j
