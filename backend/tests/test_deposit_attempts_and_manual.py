"""AeroX Crash — Iteration 3 tests.

Covers new features:
- Duplicate UTR detection (same-user and cross-user) + deposit_attempts logging
- GET /api/admin/deposit-attempts (admin auth + shape)
- POST /api/admin/deposits/manual (credit + txn + list visibility + errors)
- 403 non-admin regression on new endpoints
- Regression on existing GET /api/admin/deposits filters + approve
"""
import os
import os
import uuid
import time
import requests
import pytest
from pathlib import Path

BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip()
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "gowin365x@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@AeroX2026")


def _u(p="T"):
    return f"{p}{uuid.uuid4().hex[:8].upper()}"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_h(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _register(s, email=None):
    email = email or f"dup{_u('u').lower()}@aeroxtest.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test@1234", "name": "Dup"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["token"], "user": d["user"],
            "h": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="module")
def userA(s):
    return _register(s)


@pytest.fixture(scope="module")
def userB(s):
    return _register(s)


@pytest.fixture(scope="module")
def upi_id(s, admin_h):
    # ensure at least one UPI exists
    r = s.get(f"{API}/admin/upi", headers=admin_h, timeout=10)
    lst = r.json() if r.status_code == 200 else []
    for u in lst:
        if u.get("active"):
            return u["upi_id"]
    # else create one
    r = s.post(f"{API}/admin/upi", json={"label": _u("UPI"), "upi_id": "test@bank", "active": True},
               headers=admin_h, timeout=10)
    return r.json()["upi_id"]


# ---- 1. Fresh UTR deposit succeeds ----
def test_fresh_utr_deposit_succeeds(s, userA, upi_id):
    utr = _u("UTR")
    r = s.post(f"{API}/deposits", json={"amount": 250, "utr": utr, "upi_id": upi_id},
               headers=userA["h"], timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["utr"] == utr.upper()
    assert d["status"] == "pending"
    # stash on userA
    userA["fresh_utr"] = utr.upper()
    userA["fresh_dep_id"] = d["id"]


# ---- 2. Same-user duplicate UTR -> 400 with specific message + attempt logged ----
def test_duplicate_utr_same_user(s, userA, admin_h, upi_id):
    utr = userA["fresh_utr"]
    r = s.post(f"{API}/deposits", json={"amount": 250, "utr": utr, "upi_id": upi_id},
               headers=userA["h"], timeout=15)
    assert r.status_code == 400
    assert r.json().get("detail") == "You have already submitted this UTR"

    # Check attempt logged via admin endpoint
    ra = s.get(f"{API}/admin/deposit-attempts", headers=admin_h, timeout=15)
    assert ra.status_code == 200
    rows = ra.json()
    match = [x for x in rows if x.get("utr") == utr and x.get("user_id") == userA["user"]["id"]]
    assert match, f"No attempt logged for same-user dup {utr}"
    m = match[0]
    assert m.get("same_user") is True
    assert m.get("user_email") == userA["email"]
    assert m.get("original_user_id") == userA["user"]["id"]
    assert m.get("amount") == 250.0


# ---- 3. Cross-user duplicate UTR ----
def test_duplicate_utr_cross_user(s, userA, userB, admin_h, upi_id):
    utr = userA["fresh_utr"]
    r = s.post(f"{API}/deposits", json={"amount": 400, "utr": utr, "upi_id": upi_id},
               headers=userB["h"], timeout=15)
    assert r.status_code == 400
    assert r.json().get("detail") == "This UTR is already registered to another account"

    ra = s.get(f"{API}/admin/deposit-attempts", headers=admin_h, timeout=15)
    assert ra.status_code == 200
    rows = ra.json()
    match = [x for x in rows if x.get("utr") == utr and x.get("user_id") == userB["user"]["id"]]
    assert match, "No cross-user attempt logged"
    m = match[0]
    assert m.get("same_user") is False
    assert m.get("original_user_email") == userA["email"]
    assert m.get("user_email") == userB["email"]
    assert m.get("amount") == 400.0


# ---- 4. deposit-attempts sorted desc ----
def test_deposit_attempts_sorted_desc(s, admin_h):
    r = s.get(f"{API}/admin/deposit-attempts", headers=admin_h, timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    if len(rows) >= 2:
        assert rows[0]["created_at"] >= rows[1]["created_at"]
    # ensure no _id leaked
    for row in rows[:5]:
        assert "_id" not in row


# ---- 5. Non-admin 403 on deposit-attempts ----
def test_deposit_attempts_requires_admin(s, userA):
    r = s.get(f"{API}/admin/deposit-attempts", headers=userA["h"], timeout=10)
    assert r.status_code == 403


# ---- 6. Manual credit success ----
def test_manual_credit_credits_user(s, admin_h, userB):
    bal_before = s.get(f"{API}/wallet/balance", headers=userB["h"], timeout=10).json()["balance"]
    body = {"user_email": userB["email"], "amount": 175.5, "note": "TEST_MANUAL_NET_ISSUE"}
    r = s.post(f"{API}/admin/deposits/manual", json=body, headers=admin_h, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "approved"
    assert d["manual"] is True
    assert d["utr"].startswith("MANUAL-")
    assert d["amount"] == 175.5

    # Balance credited
    bal_after = s.get(f"{API}/wallet/balance", headers=userB["h"], timeout=10).json()["balance"]
    assert round(bal_after - bal_before, 2) == 175.5

    # Transaction with note (type=deposit)
    txns = s.get(f"{API}/wallet/transactions", headers=userB["h"], timeout=10).json()
    hit = [t for t in txns if t.get("ref") == d["id"]]
    assert hit, "No txn linked to manual deposit id"
    assert hit[0]["type"] == "deposit"
    assert "TEST_MANUAL_NET_ISSUE" in (hit[0].get("note") or "")
    assert float(hit[0]["amount"]) == 175.5

    # Visible in approved list with manual=True
    lst = s.get(f"{API}/admin/deposits?status_filter=approved", headers=admin_h, timeout=15).json()
    m = [x for x in lst if x.get("id") == d["id"]]
    assert m and m[0].get("manual") is True and m[0].get("utr", "").startswith("MANUAL-")


# ---- 7. Manual credit unknown email 404 ----
def test_manual_credit_unknown_email(s, admin_h):
    r = s.post(f"{API}/admin/deposits/manual",
               json={"user_email": f"nope{_u().lower()}@example.com", "amount": 10, "note": "x"},
               headers=admin_h, timeout=10)
    assert r.status_code == 404
    assert "not found" in r.json().get("detail", "").lower()


# ---- 8. Manual credit admin email 400 ----
def test_manual_credit_admin_target(s, admin_h):
    r = s.post(f"{API}/admin/deposits/manual",
               json={"user_email": ADMIN_EMAIL, "amount": 10, "note": "x"},
               headers=admin_h, timeout=10)
    assert r.status_code == 400
    assert "admin" in r.json().get("detail", "").lower()


# ---- 9. Manual credit non-admin 403 ----
def test_manual_credit_non_admin(s, userA, userB):
    r = s.post(f"{API}/admin/deposits/manual",
               json={"user_email": userB["email"], "amount": 10, "note": "x"},
               headers=userA["h"], timeout=10)
    assert r.status_code == 403


# ---- 10. Regression: approve pending deposit credits with bonus ----
def test_regression_approve_pending(s, userA, admin_h, upi_id):
    utr = _u("UTRR")
    r = s.post(f"{API}/deposits", json={"amount": 200, "utr": utr, "upi_id": upi_id},
               headers=userA["h"], timeout=15)
    assert r.status_code == 200
    dep_id = r.json()["id"]
    bal_before = s.get(f"{API}/wallet/balance", headers=userA["h"]).json()["balance"]
    ra = s.post(f"{API}/admin/deposits/{dep_id}/approve", headers=admin_h, timeout=15)
    assert ra.status_code == 200
    bal_after = s.get(f"{API}/wallet/balance", headers=userA["h"]).json()["balance"]
    # 200 + 5% bonus
    assert round(bal_after - bal_before, 2) == 210.0


# ---- 11. Regression: rejected filter works ----
def test_regression_reject_filter(s, userA, admin_h, upi_id):
    utr = _u("UTRJ")
    r = s.post(f"{API}/deposits", json={"amount": 150, "utr": utr, "upi_id": upi_id},
               headers=userA["h"], timeout=15)
    assert r.status_code == 200
    dep_id = r.json()["id"]
    bal_before = s.get(f"{API}/wallet/balance", headers=userA["h"]).json()["balance"]
    rj = s.post(f"{API}/admin/deposits/{dep_id}/reject", headers=admin_h, timeout=15)
    assert rj.status_code == 200
    bal_after = s.get(f"{API}/wallet/balance", headers=userA["h"]).json()["balance"]
    assert bal_after == bal_before  # no refund on reject for deposits
    # appears in rejected list
    lst = s.get(f"{API}/admin/deposits?status_filter=rejected", headers=admin_h, timeout=15).json()
    assert any(x["id"] == dep_id for x in lst)
