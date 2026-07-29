"""Support tickets & file upload backend tests (iteration 5)."""
import io
import os
import uuid
import struct
import zlib
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    fe = Path("/app/frontend/.env").read_text()
    for line in fe.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip()
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "gowin365x@gmail.com"
ADMIN_PASSWORD = "Admin@AeroX2026"


def _png_bytes(w=2, h=2, color=(255, 0, 0, 255)) -> bytes:
    """Minimal valid PNG (RGBA, w x h)."""
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    row = bytes(color) * w
    raw = b"".join(b"\x00" + row for _ in range(h))
    idat = zlib.compress(raw, 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_h(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["token"]


@pytest.fixture(scope="module")
def user_a(s):
    email = f"supportflow+{uuid.uuid4().hex[:8]}@aeroxtest.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test@1234", "name": "SupA"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["token"], "id": d["user"]["id"],
            "headers": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="module")
def user_b(s):
    email = f"supportflow+{uuid.uuid4().hex[:8]}@aeroxtest.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test@1234", "name": "SupB"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["token"], "id": d["user"]["id"],
            "headers": {"Authorization": f"Bearer {d['token']}"}}


# -------------------- /support/upload --------------------
class TestUpload:
    def test_upload_requires_auth(self, s):
        r = s.post(f"{API}/support/upload",
                   files={"file": ("a.png", _png_bytes(), "image/png")}, timeout=20)
        assert r.status_code in (401, 403), r.text

    def test_upload_valid_png(self, s, user_a):
        png = _png_bytes()
        r = s.post(f"{API}/support/upload", headers=user_a["headers"],
                   files={"file": ("shot.png", png, "image/png")}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d and isinstance(d["id"], str)
        assert d["size"] == len(png)
        assert d["content_type"] == "image/png"
        user_a["last_file_id"] = d["id"]

    def test_upload_rejects_non_image(self, s, user_a):
        r = s.post(f"{API}/support/upload", headers=user_a["headers"],
                   files={"file": ("bad.txt", b"hello world", "text/plain")}, timeout=20)
        assert r.status_code == 400, r.text
        assert "image" in r.text.lower() or "jpg" in r.text.lower() or "png" in r.text.lower()

    def test_upload_rejects_oversize(self, s, user_a):
        big = b"\x00" * (5 * 1024 * 1024 + 100)  # > 5MB
        r = s.post(f"{API}/support/upload", headers=user_a["headers"],
                   files={"file": ("big.png", big, "image/png")}, timeout=60)
        assert r.status_code == 400, r.text
        assert "mb" in r.text.lower() or "exceeds" in r.text.lower() or "limit" in r.text.lower()


# -------------------- /support/files/{id} --------------------
class TestDownload:
    def _upload(self, s, user):
        png = _png_bytes()
        r = s.post(f"{API}/support/upload", headers=user["headers"],
                   files={"file": ("s.png", png, "image/png")}, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()["id"], png

    def test_download_via_bearer(self, s, user_a):
        fid, png = self._upload(s, user_a)
        r = s.get(f"{API}/support/files/{fid}", headers=user_a["headers"], timeout=15)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/png")
        assert r.content == png

    def test_download_via_query_auth(self, s, user_a):
        fid, png = self._upload(s, user_a)
        tok = user_a["headers"]["Authorization"].split(" ", 1)[1]
        r = s.get(f"{API}/support/files/{fid}?auth={tok}", timeout=15)
        assert r.status_code == 200, r.text
        assert r.content == png

    def test_download_forbidden_for_other_user(self, s, user_a, user_b):
        fid, _ = self._upload(s, user_a)
        r = s.get(f"{API}/support/files/{fid}", headers=user_b["headers"], timeout=15)
        assert r.status_code == 403, r.text

    def test_download_admin_can_view(self, s, user_a, admin_h):
        fid, _ = self._upload(s, user_a)
        headers, _tok = admin_h
        r = s.get(f"{API}/support/files/{fid}", headers=headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_download_unknown_id_404(self, s, user_a):
        r = s.get(f"{API}/support/files/{uuid.uuid4()}", headers=user_a["headers"], timeout=15)
        assert r.status_code == 404, r.text

    def test_download_requires_auth(self, s, user_a):
        fid, _ = self._upload(s, user_a)
        r = s.get(f"{API}/support/files/{fid}", timeout=15)
        assert r.status_code == 401, r.text


# -------------------- Tickets create/list --------------------
class TestTickets:
    def test_create_ticket_with_screenshot(self, s, user_a):
        # upload
        up = s.post(f"{API}/support/upload", headers=user_a["headers"],
                    files={"file": ("a.png", _png_bytes(), "image/png")}, timeout=30)
        assert up.status_code == 200, up.text
        sid = up.json()["id"]
        payload = {"subject": "Deposit issue", "amount": 500.5, "message": "please help", "screenshot_id": sid}
        r = s.post(f"{API}/support/tickets", headers=user_a["headers"], json=payload, timeout=15)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["status"] == "open"
        assert t["subject"] == "Deposit issue"
        assert t["message"] == "please help"
        assert t["amount"] == 500.5
        assert t["screenshot_id"] == sid
        assert t["admin_reply"] is None
        assert t["reviewed_by"] is None
        assert t["user_id"] == user_a["id"]
        assert "id" in t
        user_a["ticket_id"] = t["id"]

    def test_create_ticket_no_screenshot(self, s, user_a):
        r = s.post(f"{API}/support/tickets", headers=user_a["headers"],
                   json={"subject": "General", "message": "no ss"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["screenshot_id"] is None
        assert r.json()["amount"] is None

    def test_create_ticket_rejects_foreign_screenshot(self, s, user_a, user_b):
        up = s.post(f"{API}/support/upload", headers=user_b["headers"],
                    files={"file": ("b.png", _png_bytes(), "image/png")}, timeout=30)
        assert up.status_code == 200, up.text
        foreign_sid = up.json()["id"]
        r = s.post(f"{API}/support/tickets", headers=user_a["headers"],
                   json={"subject": "X", "message": "steal", "screenshot_id": foreign_sid}, timeout=15)
        assert r.status_code == 400, r.text

    def test_tickets_mine_only_returns_own_sorted_desc(self, s, user_a):
        r = s.get(f"{API}/support/tickets/mine", headers=user_a["headers"], timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 2
        # all belong to user_a
        assert all(t["user_id"] == user_a["id"] for t in rows)
        # sorted desc by created_at
        times = [t["created_at"] for t in rows]
        assert times == sorted(times, reverse=True)

    def test_tickets_mine_requires_auth(self, s):
        r = s.get(f"{API}/support/tickets/mine", timeout=10)
        assert r.status_code in (401, 403)


# -------------------- Admin endpoints --------------------
@pytest.fixture(scope="class")
def seeded_ticket(s, user_a):
    """Create a ticket owned by user_a and return its id (class-scoped so it lives on same worker)."""
    up = s.post(f"{API}/support/upload", headers=user_a["headers"],
                files={"file": ("adm.png", _png_bytes(), "image/png")}, timeout=30)
    assert up.status_code == 200
    sid = up.json()["id"]
    r = s.post(f"{API}/support/tickets", headers=user_a["headers"],
               json={"subject": "Admin test", "amount": 100.0, "message": "test", "screenshot_id": sid}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["id"]


class TestAdminTickets:
    def test_admin_list_all(self, s, admin_h, seeded_ticket):
        headers, _ = admin_h
        r = s.get(f"{API}/admin/support/tickets", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        ids = [t["id"] for t in rows]
        assert seeded_ticket in ids

    def test_admin_list_status_filter(self, s, admin_h):
        headers, _ = admin_h
        r = s.get(f"{API}/admin/support/tickets?status_filter=open", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert all(t["status"] == "open" for t in rows)

    def test_admin_list_forbidden_for_user(self, s, user_a):
        r = s.get(f"{API}/admin/support/tickets", headers=user_a["headers"], timeout=15)
        assert r.status_code == 403

    def test_admin_patch_ticket(self, s, admin_h, user_a, seeded_ticket):
        headers, _ = admin_h
        r = s.patch(f"{API}/admin/support/tickets/{seeded_ticket}",
                    headers=headers,
                    json={"status": "resolved", "admin_reply": "Fixed. Thanks."}, timeout=15)
        assert r.status_code == 200, r.text
        # Now verify via admin list
        r2 = s.get(f"{API}/admin/support/tickets?status_filter=resolved", headers=headers, timeout=15)
        assert r2.status_code == 200
        match = [t for t in r2.json() if t["id"] == seeded_ticket]
        assert match, "ticket should be in resolved list"
        t = match[0]
        assert t["status"] == "resolved"
        assert t["admin_reply"] == "Fixed. Thanks."
        assert t["reviewed_by"] == ADMIN_EMAIL
        assert t["reviewed_at"] is not None

    def test_admin_patch_invalid_status(self, s, admin_h, seeded_ticket):
        headers, _ = admin_h
        r = s.patch(f"{API}/admin/support/tickets/{seeded_ticket}",
                    headers=headers, json={"status": "closed", "admin_reply": "x"}, timeout=15)
        assert r.status_code == 400

    def test_admin_patch_unknown_ticket_404(self, s, admin_h):
        headers, _ = admin_h
        r = s.patch(f"{API}/admin/support/tickets/{uuid.uuid4()}",
                    headers=headers, json={"status": "open"}, timeout=15)
        assert r.status_code == 404

    def test_admin_patch_forbidden_for_user(self, s, user_a, seeded_ticket):
        r = s.patch(f"{API}/admin/support/tickets/{seeded_ticket}",
                    headers=user_a["headers"], json={"status": "open"}, timeout=15)
        assert r.status_code == 403

    def test_user_sees_admin_reply_in_mine(self, s, user_a, seeded_ticket):
        r = s.get(f"{API}/support/tickets/mine", headers=user_a["headers"], timeout=15)
        assert r.status_code == 200
        t = [x for x in r.json() if x["id"] == seeded_ticket][0]
        assert t["status"] == "resolved"
        assert t["admin_reply"] == "Fixed. Thanks."
