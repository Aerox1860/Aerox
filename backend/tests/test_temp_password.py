"""Tests for admin-initiated temporary password reset feature."""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aerox-wallet.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "gowin365x@gmail.com"
ADMIN_PASSWORD = "Admin@AeroX2026"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def admin_user_id(admin_headers):
    r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    return r.json()["id"]


def _register_user():
    email = f"tempflow+{uuid.uuid4().hex[:8]}@aeroxtest.com"
    password = "OldPass1"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "TempFlow"}, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return email, password, data["user"]["id"], data["token"]


@pytest.fixture
def fresh_user():
    return _register_user()


# ---------- Backend: temp password generation ----------

def test_admin_generate_temp_password_success(admin_headers, fresh_user):
    email, old_pw, uid, _ = fresh_user
    r = requests.post(f"{API}/admin/users/temp-password", headers=admin_headers, json={"user_id": uid}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["user_id"] == uid
    assert data["user_email"] == email
    assert "temp_password" in data and isinstance(data["temp_password"], str)
    assert len(data["temp_password"]) == 10
    # expires ~48h ahead
    exp_dt = datetime.fromisoformat(data["expires_at"])
    if exp_dt.tzinfo is None:
        exp_dt = exp_dt.replace(tzinfo=timezone.utc)
    diff = (exp_dt - datetime.now(timezone.utc)).total_seconds()
    assert 47 * 3600 <= diff <= 49 * 3600, f"expires_at not ~48h ahead: {diff}s"


def test_admin_generate_temp_password_on_admin_returns_400(admin_headers, admin_user_id):
    r = requests.post(f"{API}/admin/users/temp-password", headers=admin_headers, json={"user_id": admin_user_id}, timeout=15)
    assert r.status_code == 400
    assert "admin" in r.json().get("detail", "").lower()


def test_admin_generate_temp_password_non_admin_forbidden(fresh_user):
    _, _, uid, user_token = fresh_user
    r = requests.post(
        f"{API}/admin/users/temp-password",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"user_id": uid},
        timeout=15,
    )
    assert r.status_code == 403


def test_admin_generate_temp_password_unknown_user_404(admin_headers):
    r = requests.post(f"{API}/admin/users/temp-password", headers=admin_headers, json={"user_id": "nonexistent-" + uuid.uuid4().hex}, timeout=15)
    assert r.status_code == 404


# ---------- Backend: login with temp password ----------

def test_login_with_temp_password_success_and_must_change(admin_headers, fresh_user):
    email, old_pw, uid, _ = fresh_user
    r = requests.post(f"{API}/admin/users/temp-password", headers=admin_headers, json={"user_id": uid}, timeout=15)
    temp = r.json()["temp_password"]
    # login
    r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": temp}, timeout=15)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data.get("used_temp_password") is True
    assert data["user"].get("must_change_password") is True
    assert "token" in data


def test_regular_password_still_works_after_temp_generated(admin_headers, fresh_user):
    email, old_pw, uid, _ = fresh_user
    requests.post(f"{API}/admin/users/temp-password", headers=admin_headers, json={"user_id": uid}, timeout=15)
    # login with old password should still work
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": old_pw}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("used_temp_password") in (False, None)


# ---------- Backend: change password ----------

def test_change_password_full_flow(admin_headers, fresh_user):
    email, old_pw, uid, _ = fresh_user
    r = requests.post(f"{API}/admin/users/temp-password", headers=admin_headers, json={"user_id": uid}, timeout=15)
    temp = r.json()["temp_password"]
    r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": temp}, timeout=15)
    token = r2.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # mismatch
    r_m = requests.post(f"{API}/auth/change-password", headers=headers, json={"new_password": "NewPass1", "confirm_password": "NewPass2"}, timeout=15)
    assert r_m.status_code == 400
    assert "do not match" in r_m.json()["detail"].lower()

    # same as old (old_pw is user's current password since temp doesn't replace it)
    r_same = requests.post(f"{API}/auth/change-password", headers=headers, json={"new_password": old_pw, "confirm_password": old_pw}, timeout=15)
    assert r_same.status_code == 400
    assert "different" in r_same.json()["detail"].lower()

    # short (<6) -> pydantic 422
    r_short = requests.post(f"{API}/auth/change-password", headers=headers, json={"new_password": "abc", "confirm_password": "abc"}, timeout=15)
    assert r_short.status_code == 422

    # success
    new_pw = "BrandNew1"
    r_ok = requests.post(f"{API}/auth/change-password", headers=headers, json={"new_password": new_pw, "confirm_password": new_pw}, timeout=15)
    assert r_ok.status_code == 200, r_ok.text
    body = r_ok.json()
    assert body["ok"] is True
    assert body["user"]["must_change_password"] is False

    # old pw now fails
    r_old = requests.post(f"{API}/auth/login", json={"email": email, "password": old_pw}, timeout=15)
    assert r_old.status_code == 401

    # new pw works
    r_new = requests.post(f"{API}/auth/login", json={"email": email, "password": new_pw}, timeout=15)
    assert r_new.status_code == 200

    # temp pw fails
    r_temp = requests.post(f"{API}/auth/login", json={"email": email, "password": temp}, timeout=15)
    assert r_temp.status_code == 401


# ---------- Backend: regenerating temp password ----------

def test_regenerating_temp_invalidates_previous(admin_headers, fresh_user):
    email, _, uid, _ = fresh_user
    r1 = requests.post(f"{API}/admin/users/temp-password", headers=admin_headers, json={"user_id": uid}, timeout=15)
    temp1 = r1.json()["temp_password"]
    r2 = requests.post(f"{API}/admin/users/temp-password", headers=admin_headers, json={"user_id": uid}, timeout=15)
    temp2 = r2.json()["temp_password"]
    assert temp1 != temp2
    # login with temp1 fails
    r_l1 = requests.post(f"{API}/auth/login", json={"email": email, "password": temp1}, timeout=15)
    assert r_l1.status_code == 401
    # login with temp2 succeeds
    r_l2 = requests.post(f"{API}/auth/login", json={"email": email, "password": temp2}, timeout=15)
    assert r_l2.status_code == 200


# ---------- Backend: expiry ----------

def test_expired_temp_password_returns_401(admin_headers, fresh_user):
    email, _, uid, _ = fresh_user
    r = requests.post(f"{API}/admin/users/temp-password", headers=admin_headers, json={"user_id": uid}, timeout=15)
    temp = r.json()["temp_password"]
    # simulate expiry via direct mongo update
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio

    async def _expire():
        client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = client[os.environ.get("DB_NAME", "test_database")]
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        await db.users.update_one({"id": uid}, {"$set": {"temp_password_expires_at": past}})
        client.close()

    # load backend env
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    asyncio.run(_expire())

    r_l = requests.post(f"{API}/auth/login", json={"email": email, "password": temp}, timeout=15)
    assert r_l.status_code == 401
    assert "expired" in r_l.json()["detail"].lower()


# ---------- Backend: admin users list ----------

def test_admin_users_list_has_temp_password_flag(admin_headers, fresh_user):
    email, _, uid, _ = fresh_user
    r = requests.post(f"{API}/admin/users/temp-password", headers=admin_headers, json={"user_id": uid}, timeout=15)
    assert r.status_code == 200

    r_l = requests.get(f"{API}/admin/users", headers=admin_headers, timeout=15)
    assert r_l.status_code == 200
    users = r_l.json()
    match = [u for u in users if u.get("id") == uid]
    assert len(match) == 1
    u = match[0]
    assert u.get("has_temp_password") is True
    assert "temp_password_hash" not in u
    assert "password_hash" not in u
