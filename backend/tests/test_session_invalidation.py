"""Tests for single-session enforcement (concurrent login prevention).

Every login/register rotates user.session_id. Old tokens must be rejected with
401 detail starting with 'SESSION_INVALIDATED'.
"""
import os
import uuid
import base64
import json
import requests
import pytest
from pathlib import Path

BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip()
API = f"{BASE.rstrip('/')}/api"

ADMIN_EMAIL = "gowin365x@gmail.com"
ADMIN_PASSWORD = "Admin@AeroX2026"


def _decode_jwt_payload(tok: str) -> dict:
    part = tok.split(".")[1]
    part += "=" * (-len(part) % 4)
    return json.loads(base64.urlsafe_b64decode(part.encode()).decode())


def _uniq():
    return f"TEST_sess_{uuid.uuid4().hex[:8]}@aeroxtest.com"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# --- Register returns token with sid claim, /me works ---
def test_register_returns_sid_and_me_works(s):
    email = _uniq()
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": "Test@1234", "name": "Sess", "age_confirmed": True, "policy_agreed": True}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    payload = _decode_jwt_payload(tok)
    assert "sid" in payload and payload["sid"], f"sid missing in payload: {payload}"
    me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert me.status_code == 200
    assert me.json()["email"].lower() == email.lower()


# --- Duplicate register rejected ---
def test_duplicate_register_rejected(s):
    email = _uniq()
    r1 = s.post(f"{API}/auth/register",
                json={"email": email, "password": "Test@1234", "name": "Dup", "age_confirmed": True, "policy_agreed": True}, timeout=15)
    assert r1.status_code == 200
    r2 = s.post(f"{API}/auth/register",
                json={"email": email, "password": "Test@1234", "name": "Dup", "age_confirmed": True, "policy_agreed": True}, timeout=15)
    assert r2.status_code in (400, 409), r2.text


# --- USER: second login invalidates first token with SESSION_INVALIDATED ---
def test_user_second_login_invalidates_first_token(s):
    email = _uniq()
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": "Test@1234", "name": "U", "age_confirmed": True, "policy_agreed": True}, timeout=15)
    assert r.status_code == 200
    first_tok = r.json()["token"]

    # first token works
    me1 = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {first_tok}"}, timeout=10)
    assert me1.status_code == 200

    # login again -> rotate sid
    r2 = s.post(f"{API}/auth/login", json={"email": email, "password": "Test@1234"}, timeout=15)
    assert r2.status_code == 200
    second_tok = r2.json()["token"]
    assert second_tok != first_tok

    p1 = _decode_jwt_payload(first_tok)
    p2 = _decode_jwt_payload(second_tok)
    assert p1["sid"] != p2["sid"], "sid must rotate on subsequent login"

    # first token now returns 401 SESSION_INVALIDATED
    me_old = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {first_tok}"}, timeout=10)
    assert me_old.status_code == 401, me_old.text
    detail = me_old.json().get("detail", "")
    assert detail.startswith("SESSION_INVALIDATED"), f"detail must start with SESSION_INVALIDATED: {detail!r}"

    # newest token still works
    me_new = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {second_tok}"}, timeout=10)
    assert me_new.status_code == 200


# --- ADMIN: same behavior on admin routes ---
def test_admin_second_login_invalidates_first_on_admin_routes(s):
    r1 = s.post(f"{API}/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r1.status_code == 200, r1.text
    tok_a = r1.json()["token"]
    assert r1.json()["user"]["role"] == "admin"

    # admin route works with tok_a
    d = s.get(f"{API}/admin/dashboard", headers={"Authorization": f"Bearer {tok_a}"}, timeout=10)
    assert d.status_code == 200

    # login again from another "device"
    r2 = s.post(f"{API}/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r2.status_code == 200
    tok_b = r2.json()["token"]
    assert tok_a != tok_b

    # tok_a on /admin/dashboard -> 401 SESSION_INVALIDATED
    d_old = s.get(f"{API}/admin/dashboard", headers={"Authorization": f"Bearer {tok_a}"}, timeout=10)
    assert d_old.status_code == 401
    assert d_old.json().get("detail", "").startswith("SESSION_INVALIDATED")

    # also /admin/games/status
    gs_old = s.get(f"{API}/admin/games/status", headers={"Authorization": f"Bearer {tok_a}"}, timeout=10)
    assert gs_old.status_code == 401
    assert gs_old.json().get("detail", "").startswith("SESSION_INVALIDATED")

    # tok_b works
    d_new = s.get(f"{API}/admin/dashboard", headers={"Authorization": f"Bearer {tok_b}"}, timeout=10)
    assert d_new.status_code == 200

    # store admin tok_b for regression tests
    pytest.admin_tok = tok_b


# --- Regression: crash bias + maintenance toggles still work ---
def test_admin_game_config_bias_and_status(s):
    tok = getattr(pytest, "admin_tok", None)
    if not tok:
        r = s.post(f"{API}/auth/login",
                   json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    r = s.post(f"{API}/admin/game/config", json={"bias_mode": "aggressive"}, headers=h, timeout=10)
    assert r.status_code == 200, r.text
    # verify status reflects it
    r2 = s.get(f"{API}/admin/games/status", headers=h, timeout=10)
    assert r2.status_code == 200
    body = r2.json()
    # bias_mode may be nested — accept either
    txt = json.dumps(body)
    assert "aggressive" in txt, f"bias_mode not reflected: {body}"


def test_admin_games_toggle_roulette(s):
    tok = getattr(pytest, "admin_tok", None)
    if not tok:
        r = s.post(f"{API}/auth/login",
                   json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    # off
    r = s.post(f"{API}/admin/games/toggle",
               json={"game": "roulette", "enabled": False}, headers=h, timeout=10)
    assert r.status_code == 200, r.text
    # on
    r = s.post(f"{API}/admin/games/toggle",
               json={"game": "roulette", "enabled": True}, headers=h, timeout=10)
    assert r.status_code == 200, r.text


# --- Cleanup: reset backend state at end of module ---
def test_zzz_reset_state(s):
    tok = getattr(pytest, "admin_tok", None)
    if not tok:
        r = s.post(f"{API}/auth/login",
                   json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    r = s.post(f"{API}/admin/game/config",
               json={"bias_mode": "normal", "house_edge": 0.03, "paused": False},
               headers=h, timeout=10)
    assert r.status_code == 200, r.text
    s.post(f"{API}/admin/games/toggle", json={"game": "roulette", "enabled": True}, headers=h, timeout=10)
    s.post(f"{API}/admin/games/toggle", json={"game": "crash", "enabled": True}, headers=h, timeout=10)
