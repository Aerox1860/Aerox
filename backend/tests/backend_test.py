"""AeroX Crash — Backend E2E tests.

Covers: auth, wallet, upi admin CRUD, deposits (dup UTR), withdrawals, referrals,
daily bonus, game state/bet/cashout, leaderboard, chat, admin dashboard,
block/adjust, admin game pause, non-admin 403.
"""
import os
import os
import time
import uuid
import requests
import pytest
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    # fall back to reading frontend env
    fe = Path("/app/frontend/.env").read_text()
    for line in fe.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip()
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "gowin365x@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@AeroX2026")


def _uniq(prefix="TEST"):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def user_ctx(s):
    """Register a fresh user with signup bonus."""
    email = f"{_uniq('user')}@aeroxtest.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "Test@1234", "name": "TestUser"
    }, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "token": data["token"],
        "user": data["user"],
        "email": email,
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }


# ---------------- Health ----------------
def test_health(s):
    r = s.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d.get("app") == "AeroX Crash"
    assert d.get("status") == "ok"


# ---------------- Auth ----------------
def test_register_signup_bonus_and_me(user_ctx, s):
    assert user_ctx["user"]["balance"] == 50.0
    r = s.get(f"{API}/auth/me", headers=user_ctx["headers"], timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == user_ctx["email"]
    assert body["balance"] == 50.0
    assert body["role"] == "user"
    assert body.get("referral_code")


def test_login_wrong_password(s, user_ctx):
    r = s.post(f"{API}/auth/login", json={"email": user_ctx["email"], "password": "WrongPass!"}, timeout=10)
    assert r.status_code == 401


def test_login_correct(s, user_ctx):
    r = s.post(f"{API}/auth/login", json={"email": user_ctx["email"], "password": "Test@1234"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["token"]


def test_admin_login(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 10


# ---------------- Wallet ----------------
def test_wallet_balance_and_txn(s, user_ctx):
    r = s.get(f"{API}/wallet/balance", headers=user_ctx["headers"], timeout=10)
    assert r.status_code == 200
    assert r.json()["balance"] == 50.0
    r = s.get(f"{API}/wallet/transactions", headers=user_ctx["headers"], timeout=10)
    assert r.status_code == 200
    txns = r.json()
    assert any(t["type"] == "bonus" and float(t["amount"]) == 50.0 for t in txns), txns


# ---------------- UPI admin CRUD ----------------
@pytest.fixture(scope="session")
def created_upi(s, admin_h):
    payload = {"label": _uniq("UPI"), "upi_id": "test@bank", "active": True}
    r = s.post(f"{API}/admin/upi", json=payload, headers=admin_h, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()


def test_upi_admin_create_and_list(s, admin_h, created_upi, user_ctx):
    r = s.get(f"{API}/admin/upi", headers=admin_h, timeout=10)
    assert r.status_code == 200
    assert any(u["id"] == created_upi["id"] for u in r.json())
    # public list (requires auth per code)
    r2 = s.get(f"{API}/upi", headers=user_ctx["headers"], timeout=10)
    assert r2.status_code == 200
    assert any(u["upi_id"] == "test@bank" for u in r2.json())


# ---------------- Deposits ----------------
def test_deposit_flow_duplicate_and_approve(s, user_ctx, admin_h):
    utr = _uniq("UTR")
    r = s.post(f"{API}/deposits", json={"amount": 200, "utr": utr, "upi_id": "test@bank"},
               headers=user_ctx["headers"], timeout=10)
    assert r.status_code == 200, r.text
    dep = r.json()
    dep_id = dep["id"]
    # duplicate
    r2 = s.post(f"{API}/deposits", json={"amount": 200, "utr": utr, "upi_id": "test@bank"},
                headers=user_ctx["headers"], timeout=10)
    assert r2.status_code == 400
    # admin sees pending
    r3 = s.get(f"{API}/admin/deposits?status_filter=pending", headers=admin_h, timeout=10)
    assert r3.status_code == 200
    assert any(d["id"] == dep_id for d in r3.json())
    # get balance before
    bal_before = s.get(f"{API}/wallet/balance", headers=user_ctx["headers"]).json()["balance"]
    # approve
    r4 = s.post(f"{API}/admin/deposits/{dep_id}/approve", headers=admin_h, timeout=10)
    assert r4.status_code == 200
    bal_after = s.get(f"{API}/wallet/balance", headers=user_ctx["headers"]).json()["balance"]
    # 200 + 5% bonus = 210
    assert round(bal_after - bal_before, 2) == 210.0, (bal_before, bal_after)


# ---------------- Withdrawals ----------------
def test_withdraw_min_and_insufficient_and_reject_refund(s, user_ctx, admin_h):
    h = user_ctx["headers"]
    # < 100 rejected
    r = s.post(f"{API}/withdrawals", json={"amount": 50, "method": "upi", "upi_id": "u@bank"}, headers=h, timeout=10)
    assert r.status_code == 400
    # Insufficient (huge amount)
    r = s.post(f"{API}/withdrawals", json={"amount": 999999, "method": "upi", "upi_id": "u@bank"}, headers=h, timeout=10)
    assert r.status_code == 400
    # valid
    bal_before = s.get(f"{API}/wallet/balance", headers=h).json()["balance"]
    r = s.post(f"{API}/withdrawals", json={"amount": 100, "method": "upi", "upi_id": "u@bank"}, headers=h, timeout=10)
    assert r.status_code == 200, r.text
    wid = r.json()["id"]
    bal_after = s.get(f"{API}/wallet/balance", headers=h).json()["balance"]
    assert round(bal_before - bal_after, 2) == 100.0
    # admin reject → refund
    r2 = s.post(f"{API}/admin/withdrawals/{wid}/reject", headers=admin_h, timeout=10)
    assert r2.status_code == 200
    bal_refunded = s.get(f"{API}/wallet/balance", headers=h).json()["balance"]
    assert round(bal_refunded - bal_after, 2) == 100.0


def test_withdraw_approve_paid_no_refund(s, user_ctx, admin_h):
    h = user_ctx["headers"]
    r = s.post(f"{API}/withdrawals", json={"amount": 100, "method": "upi", "upi_id": "u@bank"}, headers=h, timeout=10)
    assert r.status_code == 200
    wid = r.json()["id"]
    bal_after_deb = s.get(f"{API}/wallet/balance", headers=h).json()["balance"]
    r2 = s.post(f"{API}/admin/withdrawals/{wid}/approve", headers=admin_h, timeout=10)
    assert r2.status_code == 200
    bal_now = s.get(f"{API}/wallet/balance", headers=h).json()["balance"]
    assert bal_now == bal_after_deb  # no refund


# ---------------- Referrals ----------------
def test_referrals_credit(s, user_ctx):
    referrer_code = user_ctx["user"]["referral_code"]
    email2 = f"{_uniq('ref')}@aeroxtest.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email2, "password": "Test@1234", "name": "Ref2", "referral_code": referrer_code
    }, timeout=10)
    assert r.status_code == 200, r.text
    time.sleep(0.5)
    r2 = s.get(f"{API}/referrals/mine", headers=user_ctx["headers"], timeout=10)
    assert r2.status_code == 200
    d = r2.json()
    assert d["code"] == referrer_code
    assert d["count"] >= 1
    assert d["earnings"] >= 25.0


# ---------------- Daily bonus ----------------
def test_daily_bonus_once(s):
    # Fresh user to isolate
    email = f"{_uniq('db')}@aeroxtest.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test@1234", "name": "DB"}, timeout=10)
    token = r.json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    r1 = s.post(f"{API}/auth/daily-bonus", headers=h, timeout=10)
    assert r1.status_code == 200
    assert r1.json()["user"]["balance"] == 60.0
    r2 = s.post(f"{API}/auth/daily-bonus", headers=h, timeout=10)
    assert r2.status_code == 400


# ---------------- Game engine ----------------
def test_game_state(s):
    r = s.get(f"{API}/game/state", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["status"] in ("waiting", "flying", "crashed", "idle")


def _wait_for_status(s, target, timeout=25):
    end = time.time() + timeout
    while time.time() < end:
        st = s.get(f"{API}/game/state", timeout=5).json()
        if st["status"] == target:
            return st
        time.sleep(0.3)
    return None


def test_game_bet_and_cashout_or_lost(s, user_ctx):
    h = user_ctx["headers"]
    # Ensure user has some balance
    bal = s.get(f"{API}/wallet/balance", headers=h).json()["balance"]
    if bal < 10:
        pytest.skip("insufficient balance for game test")
    # Wait for waiting phase
    st = _wait_for_status(s, "waiting", timeout=30)
    assert st, "never reached waiting"
    r = s.post(f"{API}/game/bet", json={"amount": 10}, headers=h, timeout=10)
    # If we caught the tail of waiting, betting might close — retry once
    if r.status_code == 400 and "closed" in r.text.lower():
        _wait_for_status(s, "crashed", timeout=20)
        _wait_for_status(s, "waiting", timeout=30)
        r = s.post(f"{API}/game/bet", json={"amount": 10}, headers=h, timeout=10)
    assert r.status_code == 200, r.text
    bet = r.json()
    assert bet["status"] == "active"

    # Wait for flying
    st = _wait_for_status(s, "flying", timeout=15)
    assert st, "never reached flying"

    # Try cashout
    r = s.post(f"{API}/game/cashout", headers=h, timeout=10)
    if r.status_code == 200:
        assert r.json()["status"] == "cashed_out"
    else:
        # Crashed before we could cash out — verify bet is lost eventually
        _wait_for_status(s, "crashed", timeout=15)
        time.sleep(1)
        mine = s.get(f"{API}/game/bets/mine", headers=h, timeout=10).json()
        assert mine and mine[0]["status"] in ("lost", "cashed_out")


def test_game_history(s):
    r = s.get(f"{API}/game/history?limit=5", timeout=10)
    assert r.status_code == 200
    # may be empty on very fresh DB but should be list
    assert isinstance(r.json(), list)


# ---------------- Leaderboard ----------------
@pytest.mark.parametrize("period", ["daily", "weekly", "all"])
def test_leaderboard(s, period):
    r = s.get(f"{API}/leaderboard?period={period}", timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------- Chat ----------------
def test_chat(s, user_ctx):
    msg = f"hello {_uniq('m')}"
    r = s.post(f"{API}/chat", json={"message": msg}, headers=user_ctx["headers"], timeout=10)
    assert r.status_code == 200
    r2 = s.get(f"{API}/chat/recent", timeout=10)
    assert r2.status_code == 200
    assert any(m["message"] == msg for m in r2.json())


# ---------------- Admin ops ----------------
def test_admin_dashboard(s, admin_h):
    r = s.get(f"{API}/admin/dashboard", headers=admin_h, timeout=10)
    assert r.status_code == 200
    d = r.json()
    for k in ["total_users", "pending_deposits", "pending_withdrawals", "current_round"]:
        assert k in d


def test_admin_block_unblock_and_adjust(s, admin_h):
    # fresh user
    email = f"{_uniq('adm')}@aeroxtest.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test@1234", "name": "AdmT"}, timeout=10)
    uid = r.json()["user"]["id"]
    token = r.json()["token"]
    # block
    r1 = s.post(f"{API}/admin/users/block", json={"user_id": uid, "block": True}, headers=admin_h, timeout=10)
    assert r1.status_code == 200
    r2 = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert r2.status_code == 403
    # unblock
    s.post(f"{API}/admin/users/block", json={"user_id": uid, "block": False}, headers=admin_h, timeout=10)
    r3 = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert r3.status_code == 200
    # adjust +100
    r4 = s.post(f"{API}/admin/users/adjust", json={"user_id": uid, "delta": 100, "note": "TEST"},
                headers=admin_h, timeout=10)
    assert r4.status_code == 200
    bal = s.get(f"{API}/wallet/balance", headers={"Authorization": f"Bearer {token}"}).json()["balance"]
    assert bal >= 150.0


def test_admin_game_pause_resume(s, admin_h):
    r = s.post(f"{API}/admin/game/config", json={"paused": True}, headers=admin_h, timeout=10)
    assert r.status_code == 200
    assert r.json()["paused"] is True
    r2 = s.post(f"{API}/admin/game/config", json={"paused": False}, headers=admin_h, timeout=10)
    assert r2.status_code == 200
    assert r2.json()["paused"] is False


def test_non_admin_forbidden(s, user_ctx):
    for path in ["/admin/dashboard", "/admin/users", "/admin/deposits", "/admin/withdrawals", "/admin/upi"]:
        r = s.get(f"{API}{path}", headers=user_ctx["headers"], timeout=10)
        assert r.status_code == 403, f"{path} => {r.status_code}"
