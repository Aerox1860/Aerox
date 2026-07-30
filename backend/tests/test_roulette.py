"""Backend tests for AeroX Roulette engine."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aerox-wallet.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EXPECTED_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
                  10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
RED_SET = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}

USER_EMAIL = "testuser@aerox.com"
USER_PASS = "Test@1234"
ADMIN_EMAIL = "gowin365x@gmail.com"
ADMIN_PASS = "Admin@AeroX2026"


@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASS}, timeout=15)
    if r.status_code != 200:
        # try register
        rr = requests.post(f"{API}/auth/register", json={"email": USER_EMAIL, "password": USER_PASS, "name": "Test User"}, timeout=15)
        assert rr.status_code in (200, 201), f"register failed: {rr.status_code} {rr.text}"
        return rr.json()["token"]
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.text}"
    return r.json()["token"]


def get_balance(token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 200
    return float(r.json().get("balance", 0))


def ensure_balance(user_token, admin_token, min_amount=1000):
    bal = get_balance(user_token)
    if bal < min_amount:
        r = requests.post(
            f"{API}/admin/deposits/manual",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"user_email": USER_EMAIL, "amount": float(min_amount * 2), "note": "test top-up"},
            timeout=15,
        )
        assert r.status_code in (200, 201), f"admin credit failed: {r.status_code} {r.text}"


def get_state():
    r = requests.get(f"{API}/roulette/state", timeout=15)
    assert r.status_code == 200
    return r.json()


def wait_for_phase(target, timeout=45):
    deadline = time.time() + timeout
    while time.time() < deadline:
        s = get_state()
        if s["phase"] == target:
            return s
        time.sleep(0.5)
    raise TimeoutError(f"phase {target} not reached")


# ---------- State ----------
class TestState:
    def test_state_shape_and_wheel_order(self):
        s = get_state()
        for k in ["phase", "round_id", "phase_end", "result_number", "history", "wheel_order", "min_bet", "max_bet"]:
            assert k in s, f"missing key {k}"
        assert s["wheel_order"] == EXPECTED_WHEEL
        assert s["min_bet"] == 10
        assert s["phase"] in ("betting", "spinning", "result")


# ---------- Auth ----------
class TestAuth:
    def test_bet_requires_auth(self):
        r = requests.post(f"{API}/roulette/bet", json={"bet_type": "red", "amount": 50}, timeout=15)
        assert r.status_code in (401, 403), f"got {r.status_code}"


# ---------- Validation ----------
class TestValidation:
    def test_invalid_bet_type_foo(self, user_token, admin_token):
        ensure_balance(user_token, admin_token)
        wait_for_phase("betting")
        r = requests.post(f"{API}/roulette/bet",
                          headers={"Authorization": f"Bearer {user_token}"},
                          json={"bet_type": "foo", "amount": 50}, timeout=15)
        assert r.status_code == 400

    def test_invalid_bet_type_straight_99(self, user_token):
        wait_for_phase("betting")
        r = requests.post(f"{API}/roulette/bet",
                          headers={"Authorization": f"Bearer {user_token}"},
                          json={"bet_type": "straight_99", "amount": 50}, timeout=15)
        assert r.status_code == 400

    def test_invalid_bet_type_straight_neg(self, user_token):
        wait_for_phase("betting")
        r = requests.post(f"{API}/roulette/bet",
                          headers={"Authorization": f"Bearer {user_token}"},
                          json={"bet_type": "straight_-1", "amount": 50}, timeout=15)
        assert r.status_code == 400

    def test_min_bet_rejected(self, user_token):
        wait_for_phase("betting")
        r = requests.post(f"{API}/roulette/bet",
                          headers={"Authorization": f"Bearer {user_token}"},
                          json={"bet_type": "red", "amount": 5}, timeout=15)
        assert r.status_code == 400
        assert "Minimum" in r.text or "minimum" in r.text.lower()


# ---------- Successful bet + balance ----------
class TestBetPlacement:
    def test_place_red_bet_debits(self, user_token, admin_token):
        ensure_balance(user_token, admin_token, 500)
        wait_for_phase("betting")
        # ensure enough time left in betting phase
        s = get_state()
        # if phase_end too close, wait for next betting
        bal_before = get_balance(user_token)
        r = requests.post(f"{API}/roulette/bet",
                          headers={"Authorization": f"Bearer {user_token}"},
                          json={"bet_type": "red", "amount": 50}, timeout=15)
        if r.status_code == 400 and "closed" in r.text.lower():
            wait_for_phase("betting")
            bal_before = get_balance(user_token)
            r = requests.post(f"{API}/roulette/bet",
                              headers={"Authorization": f"Bearer {user_token}"},
                              json={"bet_type": "red", "amount": 50}, timeout=15)
        assert r.status_code == 200, f"got {r.status_code} {r.text}"
        data = r.json()
        assert data["ok"] is True
        assert "bet_id" in data
        assert "balance" in data
        assert abs(float(data["balance"]) - (bal_before - 50)) < 0.01

    def test_insufficient_balance(self, user_token):
        wait_for_phase("betting")
        bal = get_balance(user_token)
        r = requests.post(f"{API}/roulette/bet",
                          headers={"Authorization": f"Bearer {user_token}"},
                          json={"bet_type": "red", "amount": bal + 10_000_000}, timeout=15)
        # amount may exceed MAX_BET; endpoint returns 400 in both cases; check message
        assert r.status_code == 400


# ---------- Betting closed ----------
class TestBettingClosed:
    def test_bet_rejected_during_spinning(self, user_token):
        # wait for spinning phase
        s = wait_for_phase("spinning", timeout=60)
        r = requests.post(f"{API}/roulette/bet",
                          headers={"Authorization": f"Bearer {user_token}"},
                          json={"bet_type": "red", "amount": 50}, timeout=15)
        assert r.status_code == 400
        assert "closed" in r.text.lower()


# ---------- History ----------
class TestHistory:
    def test_history_endpoint(self):
        r = requests.get(f"{API}/roulette/history", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "history" in data
        assert isinstance(data["history"], list)

    def test_history_colors_correct(self):
        # wait until at least one result exists
        deadline = time.time() + 70
        hist = []
        while time.time() < deadline:
            hist = requests.get(f"{API}/roulette/history", timeout=15).json()["history"]
            if hist:
                break
            time.sleep(2)
        assert hist, "no history entries even after waiting"
        for h in hist:
            n = h["number"]
            expected = "green" if n == 0 else ("red" if n in RED_SET else "black")
            assert h["color"] == expected, f"num {n} color {h['color']} != {expected}"
            for k in ["round_id", "number", "color", "at"]:
                assert k in h


# ---------- Round timing ----------
class TestTiming:
    def test_betting_phase_duration(self):
        # Wait until phase transitions to betting fresh
        prev_phase = get_state()["phase"]
        # detect any transition into 'betting'
        deadline = time.time() + 60
        while time.time() < deadline:
            s = get_state()
            if s["phase"] == "betting" and prev_phase != "betting":
                start = time.time()
                # wait for transition out
                while time.time() - start < 40:
                    s2 = get_state()
                    if s2["phase"] != "betting":
                        dur = time.time() - start
                        assert 15 <= dur <= 25, f"betting duration {dur}s not in [15,25]"
                        return
                    time.sleep(0.5)
            prev_phase = s["phase"]
            time.sleep(0.5)
        pytest.skip("could not observe betting transition")


# ---------- Full round settlement ----------
class TestFullRound:
    def test_full_round_settlement(self, user_token, admin_token):
        ensure_balance(user_token, admin_token, 500)
        # Wait for a fresh betting phase
        # Ensure at least 10s remaining by re-entering betting phase
        # Wait for spinning, then betting to have full 20s
        wait_for_phase("spinning", timeout=60)
        s = wait_for_phase("betting", timeout=40)
        round_id = s["round_id"]
        headers = {"Authorization": f"Bearer {user_token}"}
        bal_before = get_balance(user_token)

        placed = []
        for bt, amt in [("straight_17", 20), ("red", 30), ("dozen_2", 40)]:
            r = requests.post(f"{API}/roulette/bet", headers=headers,
                              json={"bet_type": bt, "amount": amt}, timeout=15)
            assert r.status_code == 200, f"bet {bt} failed: {r.text}"
            placed.append((bt, amt))

        total_stake = sum(a for _, a in placed)
        bal_after_bets = get_balance(user_token)
        assert abs(bal_after_bets - (bal_before - total_stake)) < 0.01

        # Wait for spinning then result then next betting (settled)
        wait_for_phase("spinning", timeout=40)
        # get the result number that engine will land on
        # wait through spinning->result
        wait_for_phase("result", timeout=20)
        result_num = get_state()["result_number"]
        assert isinstance(result_num, int)
        # Wait a bit for settlement to actually run before result phase ends (already settled)
        time.sleep(2)

        # Now check my-bets recent
        r = requests.get(f"{API}/roulette/my-bets", headers=headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        recent = data.get("recent", [])
        # Find our just-settled bets
        our = [b for b in recent if b.get("round_id") == round_id]
        assert len(our) == 3, f"expected 3 settled bets, got {len(our)}: {our}"

        # Compute expected payouts
        def expected_payout(bt, amt, num):
            from_win = False
            if bt.startswith("straight_"):
                from_win = int(bt.split("_")[1]) == num
                mult = 35
            elif bt == "red":
                from_win = num != 0 and num in RED_SET
                mult = 1
            elif bt == "dozen_2":
                from_win = 13 <= num <= 24
                mult = 3
            else:
                mult = 1
            return (amt * (mult + 1)) if from_win else 0.0

        total_credit = 0.0
        for b in our:
            exp = expected_payout(b["bet_type"], b["amount"], result_num)
            assert b["status"] == ("won" if exp > 0 else "lost")
            assert abs(float(b.get("payout", 0)) - exp) < 0.01, \
                f"payout mismatch for {b['bet_type']}: got {b.get('payout')} exp {exp}"
            total_credit += exp

        # Balance verification: bal_before - total_stake + total_credit
        bal_final = get_balance(user_token)
        expected_final = bal_before - total_stake + total_credit
        assert abs(bal_final - expected_final) < 0.01, \
            f"final balance {bal_final} != expected {expected_final} (result={result_num})"


# ---------- Regression ----------
class TestRegression:
    def test_game_state_still_works(self):
        r = requests.get(f"{API}/game/state", timeout=15)
        assert r.status_code == 200

    def test_auth_me_still_works(self, user_token):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {user_token}"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("email") == USER_EMAIL
