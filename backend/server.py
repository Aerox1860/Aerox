from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import asyncio
import hashlib
import secrets
import random
import math
import logging
import requests
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect, status, UploadFile, File, Query, Header, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# --------------------- Setup ---------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
JWT_EXP_HOURS = 24 * 7

SIGNUP_BONUS = float(os.environ.get('SIGNUP_BONUS', '50'))
DAILY_BONUS = float(os.environ.get('DAILY_BONUS', '10'))
DEPOSIT_BONUS_PCT = float(os.environ.get('DEPOSIT_BONUS_PCT', '5'))
REFERRAL_BONUS = float(os.environ.get('REFERRAL_BONUS', '25'))
HOUSE_EDGE = float(os.environ.get('CRASH_HOUSE_EDGE', '0.03'))

# --------------------- Object Storage ---------------------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "aerox-crash"
_storage_key: Optional[str] = None
MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}


def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        _storage_key = r.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logging.getLogger("aerox").error(f"Storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if r.status_code == 403:
        # session expired — reinit and retry once
        global _storage_key
        _storage_key = None
        key = init_storage()
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    r.raise_for_status()
    return r.json()


def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code == 403:
        global _storage_key
        _storage_key = None
        key = init_storage()
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

app = FastAPI()
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("aerox")


# --------------------- Helpers ---------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def iso(dt: datetime) -> str:
    return dt.isoformat()

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": now_utc() + timedelta(hours=JWT_EXP_HOURS),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def gen_referral_code() -> str:
    return secrets.token_hex(3).upper()

def serialize(doc: dict) -> dict:
    if not doc:
        return doc
    doc = {**doc}
    doc.pop('_id', None)
    doc.pop('password_hash', None)
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc

def public_user(u: dict) -> dict:
    if not u:
        return None
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "role": u.get("role", "user"),
        "balance": round(float(u.get("balance", 0)), 2),
        "referral_code": u.get("referral_code"),
        "created_at": u["created_at"] if isinstance(u.get("created_at"), str) else iso(u["created_at"]),
        "is_blocked": u.get("is_blocked", False),
        "last_daily_bonus": u.get("last_daily_bonus"),
        "must_change_password": bool(u.get("must_change_password", False)),
    }


def gen_temp_password() -> str:
    # Readable, mixed-case + digits, no ambiguous chars (0/O/1/l/I)
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(10))


# --------------------- Auth Dependency ---------------------
async def current_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not cred or not cred.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Account blocked")
    return user

async def admin_only(user: dict = Depends(current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# --------------------- Models ---------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    name: str = Field(min_length=1, max_length=50)
    referral_code: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ChangePasswordIn(BaseModel):
    new_password: str = Field(min_length=6, max_length=100)
    confirm_password: str = Field(min_length=6, max_length=100)

class TempPasswordIn(BaseModel):
    user_id: str

class SupportTicketIn(BaseModel):
    subject: str = Field(min_length=1, max_length=100)
    amount: Optional[float] = None
    message: str = Field(min_length=1, max_length=2000)
    screenshot_id: Optional[str] = None  # id returned by /support/upload

class SupportTicketUpdateIn(BaseModel):
    status: str  # open / in_progress / resolved / rejected
    admin_reply: Optional[str] = None

class DepositIn(BaseModel):
    amount: float = Field(gt=0)
    utr: str = Field(min_length=6, max_length=32)
    upi_id: str

class ManualCreditIn(BaseModel):
    user_email: EmailStr
    amount: float = Field(gt=0)
    note: Optional[str] = None

class WithdrawIn(BaseModel):
    amount: float = Field(gt=0)
    method: str  # "upi" or "bank"
    upi_id: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None
    holder_name: Optional[str] = None

class UpiConfigIn(BaseModel):
    label: str
    upi_id: str
    qr_url: Optional[str] = None
    active: bool = True

class AdjustBalanceIn(BaseModel):
    user_id: str
    delta: float
    note: Optional[str] = None

class BlockUserIn(BaseModel):
    user_id: str
    block: bool

class BetIn(BaseModel):
    amount: float = Field(gt=0)
    auto_cashout: Optional[float] = None  # e.g. 2.0

class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=200)

class GameConfigIn(BaseModel):
    house_edge: Optional[float] = None
    paused: Optional[bool] = None


# --------------------- Startup: indexes + seed ---------------------
async def seed_admin():
    email = os.environ['ADMIN_EMAIL'].lower()
    pw = os.environ['ADMIN_PASSWORD']
    existing = await db.users.find_one({"email": email})
    if existing is None:
        u = {
            "id": str(uuid.uuid4()),
            "email": email,
            "password_hash": hash_password(pw),
            "name": "Admin",
            "role": "admin",
            "balance": 0.0,
            "referral_code": gen_referral_code(),
            "referred_by": None,
            "is_blocked": False,
            "created_at": iso(now_utc()),
            "last_daily_bonus": None,
        }
        await db.users.insert_one(u)
        logger.info(f"Seeded admin: {email}")
    elif not verify_password(pw, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pw), "role": "admin"}})
        logger.info("Admin password updated")


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("referral_code", unique=True, sparse=True)
    await db.deposits.create_index("utr", unique=True)
    await db.deposits.create_index("user_id")
    await db.deposit_attempts.create_index("created_at")
    await db.deposit_attempts.create_index("user_id")
    await db.withdrawals.create_index("user_id")
    await db.transactions.create_index("user_id")
    await db.bets.create_index("user_id")
    await db.bets.create_index("round_id")
    await db.rounds.create_index("round_id", unique=True)
    await db.chat_messages.create_index("created_at")
    await db.support_tickets.create_index("user_id")
    await db.support_tickets.create_index("created_at")
    await db.support_files.create_index("id")
    await seed_admin()
    # Init storage in background (non-blocking)
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Storage init deferred: {e}")
    # Start game loop
    asyncio.create_task(game_loop())


@app.on_event("shutdown")
async def shutdown():
    client.close()


# --------------------- Transactions helper ---------------------
async def add_transaction(user_id: str, ttype: str, amount: float, note: str = "", ref: Optional[str] = None):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": ttype,  # deposit, withdraw, bet, cashout, bonus, adjust, referral
        "amount": round(float(amount), 2),
        "note": note,
        "ref": ref,
        "created_at": iso(now_utc()),
    }
    await db.transactions.insert_one(doc)
    return doc


async def credit(user_id: str, amount: float, ttype: str, note: str = "", ref: Optional[str] = None):
    await db.users.update_one({"id": user_id}, {"$inc": {"balance": round(float(amount), 2)}})
    await add_transaction(user_id, ttype, amount, note, ref)

async def debit(user_id: str, amount: float, ttype: str, note: str = "", ref: Optional[str] = None):
    await db.users.update_one({"id": user_id}, {"$inc": {"balance": -round(float(amount), 2)}})
    await add_transaction(user_id, ttype, -amount, note, ref)


# --------------------- AUTH ---------------------
@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    referred_by = None
    if body.referral_code:
        ref = await db.users.find_one({"referral_code": body.referral_code.upper()})
        if ref:
            referred_by = ref["id"]

    uid = str(uuid.uuid4())
    user = {
        "id": uid,
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": "user",
        "balance": SIGNUP_BONUS,
        "referral_code": gen_referral_code(),
        "referred_by": referred_by,
        "is_blocked": False,
        "created_at": iso(now_utc()),
        "last_daily_bonus": None,
    }
    await db.users.insert_one(user)
    await add_transaction(uid, "bonus", SIGNUP_BONUS, "Signup bonus")

    # Referral bonus for referrer
    if referred_by:
        await credit(referred_by, REFERRAL_BONUS, "referral", f"Referral: {email}", uid)

    token = make_token(uid, "user")
    return {"token": token, "user": public_user(user)}


@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Account blocked")

    used_temp = False
    if verify_password(body.password, user["password_hash"]):
        pass  # normal login
    elif user.get("temp_password_hash"):
        # check temp password + expiry
        exp = user.get("temp_password_expires_at")
        expired = False
        if exp:
            try:
                exp_dt = datetime.fromisoformat(exp) if isinstance(exp, str) else exp
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                if exp_dt < now_utc():
                    expired = True
            except Exception:
                pass
        if expired:
            raise HTTPException(status_code=401, detail="Temporary password has expired. Ask admin for a new one.")
        if not verify_password(body.password, user["temp_password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        used_temp = True
    else:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    updates = {}
    if used_temp:
        # Clear temp password; force change on next screen
        updates["temp_password_hash"] = None
        updates["temp_password_expires_at"] = None
        updates["must_change_password"] = True
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
        user.update(updates)

    token = make_token(user["id"], user.get("role", "user"))
    return {"token": token, "user": public_user(user), "used_temp_password": used_temp}


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user: dict = Depends(current_user)):
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    # Prevent reusing the same password
    if verify_password(body.new_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="New password must be different from your previous one")
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "password_hash": hash_password(body.new_password),
        "must_change_password": False,
        "temp_password_hash": None,
        "temp_password_expires_at": None,
    }})
    updated = await db.users.find_one({"id": user["id"]})
    return {"ok": True, "user": public_user(updated)}


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return public_user(user)


@api.post("/auth/daily-bonus")
async def claim_daily_bonus(user: dict = Depends(current_user)):
    last = user.get("last_daily_bonus")
    if last:
        last_dt = datetime.fromisoformat(last) if isinstance(last, str) else last
        if (now_utc() - last_dt.replace(tzinfo=timezone.utc)).total_seconds() < 24 * 3600:
            raise HTTPException(status_code=400, detail="Daily bonus already claimed")
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_daily_bonus": iso(now_utc())}})
    await credit(user["id"], DAILY_BONUS, "bonus", "Daily bonus")
    updated = await db.users.find_one({"id": user["id"]})
    return {"ok": True, "user": public_user(updated)}


# --------------------- WALLET ---------------------
@api.get("/wallet/balance")
async def get_balance(user: dict = Depends(current_user)):
    fresh = await db.users.find_one({"id": user["id"]})
    return {"balance": round(float(fresh.get("balance", 0)), 2)}


@api.get("/wallet/transactions")
async def get_transactions(user: dict = Depends(current_user), limit: int = 50):
    docs = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return docs


# --------------------- UPI CONFIG ---------------------
@api.get("/upi")
async def list_upi(user: dict = Depends(current_user)):
    docs = await db.upi_configs.find({"active": True}, {"_id": 0}).to_list(50)
    return docs


@api.get("/admin/upi")
async def admin_list_upi(_: dict = Depends(admin_only)):
    docs = await db.upi_configs.find({}, {"_id": 0}).to_list(100)
    return docs


@api.post("/admin/upi")
async def admin_create_upi(body: UpiConfigIn, _: dict = Depends(admin_only)):
    doc = {
        "id": str(uuid.uuid4()),
        "label": body.label,
        "upi_id": body.upi_id,
        "qr_url": body.qr_url,
        "active": body.active,
        "created_at": iso(now_utc()),
    }
    await db.upi_configs.insert_one(doc)
    return serialize(doc)


@api.patch("/admin/upi/{upi_id}")
async def admin_update_upi(upi_id: str, body: UpiConfigIn, _: dict = Depends(admin_only)):
    upd = {"label": body.label, "upi_id": body.upi_id, "qr_url": body.qr_url, "active": body.active}
    await db.upi_configs.update_one({"id": upi_id}, {"$set": upd})
    return {"ok": True}


@api.delete("/admin/upi/{upi_id}")
async def admin_delete_upi(upi_id: str, _: dict = Depends(admin_only)):
    await db.upi_configs.delete_one({"id": upi_id})
    return {"ok": True}


# --------------------- DEPOSITS ---------------------
@api.post("/deposits")
async def create_deposit(body: DepositIn, user: dict = Depends(current_user)):
    # Check UTR unique
    utr = body.utr.strip().upper()
    exists = await db.deposits.find_one({"utr": utr})
    if exists:
        # Log the attempt for admin visibility
        await db.deposit_attempts.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "user_email": user["email"],
            "user_name": user.get("name", ""),
            "utr": utr,
            "amount": round(float(body.amount), 2),
            "original_deposit_id": exists["id"],
            "original_user_id": exists["user_id"],
            "original_user_email": exists.get("user_email"),
            "original_user_name": exists.get("user_name"),
            "original_status": exists.get("status"),
            "same_user": exists["user_id"] == user["id"],
            "created_at": iso(now_utc()),
        })
        if exists["user_id"] == user["id"]:
            raise HTTPException(status_code=400, detail="You have already submitted this UTR")
        raise HTTPException(status_code=400, detail=f"This UTR is already registered to another account")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_email": user["email"],
        "user_name": user.get("name", ""),
        "amount": round(float(body.amount), 2),
        "utr": utr,
        "upi_id": body.upi_id,
        "status": "pending",  # pending, approved, rejected
        "admin_note": None,
        "created_at": iso(now_utc()),
        "reviewed_at": None,
        "manual": False,
    }
    try:
        await db.deposits.insert_one(dict(doc))
    except Exception:
        raise HTTPException(status_code=400, detail="This UTR has already been submitted")
    return serialize(doc)


@api.get("/deposits/mine")
async def my_deposits(user: dict = Depends(current_user)):
    docs = await db.deposits.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@api.get("/admin/deposits")
async def admin_list_deposits(status_filter: Optional[str] = None, _: dict = Depends(admin_only)):
    q = {}
    if status_filter:
        q["status"] = status_filter
    docs = await db.deposits.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api.get("/admin/deposit-attempts")
async def admin_deposit_attempts(_: dict = Depends(admin_only), limit: int = 200):
    docs = await db.deposit_attempts.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return docs


@api.post("/admin/deposits/manual")
async def admin_manual_credit(body: ManualCreditIn, admin: dict = Depends(admin_only)):
    target = await db.users.find_one({"email": body.user_email.lower()})
    if not target:
        raise HTTPException(status_code=404, detail="User not found with that email")
    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot credit admin accounts")
    amount = round(float(body.amount), 2)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": target["id"],
        "user_email": target["email"],
        "user_name": target.get("name", ""),
        "amount": amount,
        "utr": f"MANUAL-{uuid.uuid4().hex[:10].upper()}",
        "upi_id": "MANUAL",
        "status": "approved",
        "admin_note": body.note or f"Manual credit by {admin['email']}",
        "created_at": iso(now_utc()),
        "reviewed_at": iso(now_utc()),
        "manual": True,
    }
    await db.deposits.insert_one(dict(doc))
    await credit(target["id"], amount, "deposit", doc["admin_note"], doc["id"])
    return serialize(doc)


@api.post("/admin/deposits/{dep_id}/approve")
async def admin_approve_deposit(dep_id: str, admin: dict = Depends(admin_only)):
    dep = await db.deposits.find_one({"id": dep_id})
    if not dep:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if dep["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already reviewed")
    amount = float(dep["amount"])
    bonus = round(amount * DEPOSIT_BONUS_PCT / 100.0, 2)
    await db.deposits.update_one({"id": dep_id}, {"$set": {"status": "approved", "reviewed_at": iso(now_utc())}})
    await credit(dep["user_id"], amount, "deposit", f"Deposit approved (UTR {dep['utr']})", dep_id)
    if bonus > 0:
        await credit(dep["user_id"], bonus, "bonus", f"{DEPOSIT_BONUS_PCT}% deposit bonus", dep_id)
    return {"ok": True}


@api.post("/admin/deposits/{dep_id}/reject")
async def admin_reject_deposit(dep_id: str, admin: dict = Depends(admin_only)):
    dep = await db.deposits.find_one({"id": dep_id})
    if not dep:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if dep["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already reviewed")
    await db.deposits.update_one({"id": dep_id}, {"$set": {"status": "rejected", "reviewed_at": iso(now_utc())}})
    return {"ok": True}


# --------------------- WITHDRAWALS ---------------------
@api.post("/withdrawals")
async def create_withdrawal(body: WithdrawIn, user: dict = Depends(current_user)):
    amount = round(float(body.amount), 2)
    if amount < 100:
        raise HTTPException(status_code=400, detail="Minimum withdrawal is ₹100")
    fresh = await db.users.find_one({"id": user["id"]})
    if float(fresh.get("balance", 0)) < amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    if body.method == "upi" and not body.upi_id:
        raise HTTPException(status_code=400, detail="UPI ID required")
    if body.method == "bank" and not (body.account_number and body.ifsc and body.holder_name):
        raise HTTPException(status_code=400, detail="Bank details required")

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_email": user["email"],
        "user_name": user.get("name", ""),
        "amount": amount,
        "method": body.method,
        "upi_id": body.upi_id,
        "bank_name": body.bank_name,
        "account_number": body.account_number,
        "ifsc": body.ifsc,
        "holder_name": body.holder_name,
        "status": "pending",
        "admin_note": None,
        "created_at": iso(now_utc()),
        "reviewed_at": None,
    }
    await db.withdrawals.insert_one(doc)
    # Lock the amount immediately
    await debit(user["id"], amount, "withdraw", "Withdrawal requested (locked)", doc["id"])
    return serialize(doc)


@api.get("/withdrawals/mine")
async def my_withdrawals(user: dict = Depends(current_user)):
    docs = await db.withdrawals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@api.get("/admin/withdrawals")
async def admin_list_withdrawals(status_filter: Optional[str] = None, _: dict = Depends(admin_only)):
    q = {}
    if status_filter:
        q["status"] = status_filter
    docs = await db.withdrawals.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api.post("/admin/withdrawals/{wid}/approve")
async def admin_approve_withdrawal(wid: str, _: dict = Depends(admin_only)):
    w = await db.withdrawals.find_one({"id": wid})
    if not w:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already reviewed")
    await db.withdrawals.update_one({"id": wid}, {"$set": {"status": "paid", "reviewed_at": iso(now_utc())}})
    return {"ok": True}


@api.post("/admin/withdrawals/{wid}/reject")
async def admin_reject_withdrawal(wid: str, _: dict = Depends(admin_only)):
    w = await db.withdrawals.find_one({"id": wid})
    if not w:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already reviewed")
    await db.withdrawals.update_one({"id": wid}, {"$set": {"status": "rejected", "reviewed_at": iso(now_utc())}})
    # Refund
    await credit(w["user_id"], float(w["amount"]), "withdraw", "Withdrawal rejected — refund", wid)
    return {"ok": True}


# --------------------- REFERRALS ---------------------
@api.get("/referrals/mine")
async def my_referrals(user: dict = Depends(current_user)):
    refs = await db.users.find({"referred_by": user["id"]}, {"_id": 0, "id": 1, "email": 1, "name": 1, "created_at": 1}).to_list(100)
    # earnings
    earn_txns = await db.transactions.find({"user_id": user["id"], "type": "referral"}, {"_id": 0}).to_list(500)
    total = sum(float(t["amount"]) for t in earn_txns)
    return {
        "code": user["referral_code"],
        "count": len(refs),
        "earnings": round(total, 2),
        "referrals": refs,
    }


# --------------------- LEADERBOARD ---------------------
@api.get("/leaderboard")
async def leaderboard(period: str = "daily"):
    now = now_utc()
    if period == "daily":
        since = now - timedelta(days=1)
    elif period == "weekly":
        since = now - timedelta(days=7)
    else:
        since = datetime(2000, 1, 1, tzinfo=timezone.utc)
    since_iso = iso(since)
    pipeline = [
        {"$match": {"created_at": {"$gte": since_iso}, "status": {"$in": ["cashed_out", "lost"]}}},
        {"$group": {
            "_id": "$user_id",
            "user_name": {"$first": "$user_name"},
            "profit": {"$sum": "$profit"},
            "bets": {"$sum": 1},
        }},
        {"$sort": {"profit": -1}},
        {"$limit": 25},
    ]
    docs = await db.bets.aggregate(pipeline).to_list(25)
    for d in docs:
        d["user_id"] = d.pop("_id")
        d["profit"] = round(float(d["profit"]), 2)
    return docs


# --------------------- CHAT ---------------------
@api.get("/chat/recent")
async def recent_chat(limit: int = 50):
    docs = await db.chat_messages.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return list(reversed(docs))


@api.post("/chat")
async def post_chat(body: ChatIn, user: dict = Depends(current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user.get("name", "Player"),
        "role": user.get("role", "user"),
        "message": body.message.strip(),
        "created_at": iso(now_utc()),
    }
    await db.chat_messages.insert_one(doc)
    await hub.broadcast({"type": "chat", "data": serialize(doc)})
    return serialize(doc)


@api.delete("/admin/chat/{msg_id}")
async def admin_delete_chat(msg_id: str, _: dict = Depends(admin_only)):
    await db.chat_messages.delete_one({"id": msg_id})
    return {"ok": True}


# --------------------- ADMIN ---------------------
@api.get("/admin/dashboard")
async def admin_dashboard(_: dict = Depends(admin_only)):
    total_users = await db.users.count_documents({"role": "user"})
    blocked = await db.users.count_documents({"is_blocked": True})
    pending_deposits = await db.deposits.count_documents({"status": "pending"})
    pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})
    total_deposits = await db.deposits.aggregate([
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "s": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_withdrawals = await db.withdrawals.aggregate([
        {"$match": {"status": "paid"}},
        {"$group": {"_id": None, "s": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_bets = await db.bets.count_documents({})
    return {
        "total_users": total_users,
        "blocked_users": blocked,
        "pending_deposits": pending_deposits,
        "pending_withdrawals": pending_withdrawals,
        "total_deposits": round(float(total_deposits[0]["s"]) if total_deposits else 0, 2),
        "total_withdrawals": round(float(total_withdrawals[0]["s"]) if total_withdrawals else 0, 2),
        "total_bets": total_bets,
        "current_round": {
            "round_id": game_state.get("round_id"),
            "status": game_state.get("status"),
            "multiplier": round(game_state.get("multiplier", 1.0), 2),
            "players": len(game_state.get("bets", {})),
        },
        "paused": game_state.get("paused", False),
    }


@api.get("/admin/users")
async def admin_users(search: Optional[str] = None, _: dict = Depends(admin_only)):
    q = {}
    if search:
        q = {"$or": [{"email": {"$regex": search, "$options": "i"}}, {"name": {"$regex": search, "$options": "i"}}]}
    docs = await db.users.find(q, {"_id": 0, "password_hash": 0, "temp_password_hash": 0}).sort("created_at", -1).limit(200).to_list(200)
    for d in docs:
        d["has_temp_password"] = bool(d.get("temp_password_expires_at"))
    return docs


@api.post("/admin/users/block")
async def admin_block_user(body: BlockUserIn, _: dict = Depends(admin_only)):
    await db.users.update_one({"id": body.user_id}, {"$set": {"is_blocked": body.block}})
    return {"ok": True}


@api.post("/admin/users/adjust")
async def admin_adjust(body: AdjustBalanceIn, _: dict = Depends(admin_only)):
    u = await db.users.find_one({"id": body.user_id})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if body.delta >= 0:
        await credit(body.user_id, body.delta, "adjust", body.note or "Admin credit")
    else:
        await debit(body.user_id, -body.delta, "adjust", body.note or "Admin debit")
    return {"ok": True}


@api.post("/admin/users/temp-password")
async def admin_temp_password(body: TempPasswordIn, admin: dict = Depends(admin_only)):
    u = await db.users.find_one({"id": body.user_id})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot generate temp password for admin accounts")
    temp_plain = gen_temp_password()
    expires = now_utc() + timedelta(hours=48)
    await db.users.update_one({"id": body.user_id}, {"$set": {
        "temp_password_hash": hash_password(temp_plain),
        "temp_password_expires_at": iso(expires),
        "must_change_password": False,  # will be set to True upon temp-login
    }})
    logger.info(f"Admin {admin['email']} generated temp password for user {u['email']}")
    return {
        "ok": True,
        "user_id": body.user_id,
        "user_email": u["email"],
        "temp_password": temp_plain,
        "expires_at": iso(expires),
    }


@api.post("/admin/game/config")
async def admin_game_config(body: GameConfigIn, _: dict = Depends(admin_only)):
    global HOUSE_EDGE
    if body.house_edge is not None:
        HOUSE_EDGE = float(body.house_edge)
    if body.paused is not None:
        game_state["paused"] = bool(body.paused)
    return {"house_edge": HOUSE_EDGE, "paused": game_state.get("paused", False)}


@api.get("/admin/reports")
async def admin_reports(_: dict = Depends(admin_only)):
    # Recent rounds
    rounds = await db.rounds.find({}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    # Top winners
    winners = await db.bets.aggregate([
        {"$match": {"status": "cashed_out"}},
        {"$group": {"_id": "$user_id", "user_name": {"$first": "$user_name"}, "total": {"$sum": "$profit"}}},
        {"$sort": {"total": -1}},
        {"$limit": 10},
    ]).to_list(10)
    for w in winners:
        w["user_id"] = w.pop("_id")
        w["total"] = round(float(w["total"]), 2)
    return {"rounds": rounds, "top_winners": winners}


# --------------------- GAME ENGINE (Crash) ---------------------
game_state: Dict[str, Any] = {
    "round_id": None,
    "status": "idle",  # waiting, flying, crashed
    "multiplier": 1.0,
    "crash_at": 1.0,
    "bets": {},  # user_id -> bet dict
    "started_at": None,
    "server_seed": None,
    "server_seed_hash": None,
    "client_seed": None,
    "history": [],  # recent crash points (last 20)
    "paused": False,
}


class Hub:
    def __init__(self):
        self.clients: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.clients.append(ws)

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            if ws in self.clients:
                self.clients.remove(ws)

    async def broadcast(self, msg: dict):
        dead = []
        for c in list(self.clients):
            try:
                await c.send_json(msg)
            except Exception:
                dead.append(c)
        for d in dead:
            await self.disconnect(d)


hub = Hub()


def compute_crash_point(server_seed: str, client_seed: str, house_edge: float) -> float:
    # Provably-fair crash: hash server_seed:client_seed, use first 8 hex chars
    h = hashlib.sha256(f"{server_seed}:{client_seed}".encode()).hexdigest()
    n = int(h[:13], 16)  # 52-bit int
    # Bust check
    # 1% instant bust chance based on hash
    if (int(h[13:15], 16) % 33) == 0:
        return 1.00
    # Compute multiplier: (100 - houseEdge*100) / (1 - r) style
    e = 2 ** 52
    return max(1.0, math.floor((100 * e - n) / (e - n)) / 100)


async def game_loop():
    logger.info("Game loop started")
    while True:
        try:
            if game_state.get("paused"):
                await asyncio.sleep(2)
                continue
            await run_one_round()
        except Exception as e:
            logger.exception(f"Game loop error: {e}")
            await asyncio.sleep(3)


async def run_one_round():
    # Prep round
    server_seed = secrets.token_hex(16)
    server_seed_hash = hashlib.sha256(server_seed.encode()).hexdigest()
    client_seed = secrets.token_hex(8)
    crash_at = compute_crash_point(server_seed, client_seed, HOUSE_EDGE)
    round_id = str(uuid.uuid4())

    game_state.update({
        "round_id": round_id,
        "status": "waiting",
        "multiplier": 1.0,
        "crash_at": crash_at,
        "bets": {},
        "started_at": None,
        "server_seed": server_seed,
        "server_seed_hash": server_seed_hash,
        "client_seed": client_seed,
    })

    # Persist round intent
    await db.rounds.insert_one({
        "id": round_id,
        "round_id": round_id,
        "server_seed_hash": server_seed_hash,
        "client_seed": client_seed,
        "crash_at": crash_at,
        "server_seed": None,  # revealed after crash
        "status": "waiting",
        "created_at": iso(now_utc()),
    })

    # Waiting phase — 8s
    for i in range(8, 0, -1):
        await hub.broadcast({
            "type": "state",
            "data": {
                "round_id": round_id,
                "status": "waiting",
                "countdown": i,
                "multiplier": 1.0,
                "server_seed_hash": server_seed_hash,
                "history": game_state.get("history", [])[-20:],
                "players": len(game_state["bets"]),
                "bets": list(game_state["bets"].values()),
            }
        })
        await asyncio.sleep(1)

    # Flying phase
    game_state["status"] = "flying"
    game_state["started_at"] = now_utc()
    start = now_utc()
    # Growth: multiplier = 1.0024^(elapsed_ms/100)  ish. simpler: exp growth
    while True:
        elapsed = (now_utc() - start).total_seconds()
        m = round(pow(1.06, elapsed), 2)
        if m < 1.0:
            m = 1.0
        if m >= crash_at:
            m = crash_at
        game_state["multiplier"] = m
        # Auto-cashout
        for uid, bet in list(game_state["bets"].items()):
            if bet["status"] == "active" and bet.get("auto_cashout") and m >= bet["auto_cashout"]:
                await _cashout(uid, forced_multiplier=bet["auto_cashout"])
        await hub.broadcast({
            "type": "state",
            "data": {
                "round_id": round_id,
                "status": "flying",
                "multiplier": m,
                "bets": list(game_state["bets"].values()),
                "players": len(game_state["bets"]),
            }
        })
        if m >= crash_at:
            break
        await asyncio.sleep(0.1)

    # Crashed
    game_state["status"] = "crashed"
    game_state["multiplier"] = crash_at
    # Mark all active bets as lost
    for uid, bet in list(game_state["bets"].items()):
        if bet["status"] == "active":
            bet["status"] = "lost"
            bet["cashout_multiplier"] = None
            bet["profit"] = -float(bet["amount"])
            await db.bets.update_one({"id": bet["id"]}, {"$set": {
                "status": "lost", "profit": bet["profit"], "cashout_multiplier": None,
                "settled_at": iso(now_utc())
            }})

    # Update round doc
    await db.rounds.update_one({"round_id": round_id}, {"$set": {
        "status": "crashed",
        "server_seed": server_seed,
        "crashed_at": iso(now_utc()),
    }})
    game_state.setdefault("history", []).append({"round_id": round_id, "crash_at": crash_at, "ts": iso(now_utc())})
    game_state["history"] = game_state["history"][-30:]

    await hub.broadcast({
        "type": "crashed",
        "data": {
            "round_id": round_id,
            "crash_at": crash_at,
            "server_seed": server_seed,
            "server_seed_hash": server_seed_hash,
            "history": game_state["history"][-20:],
        }
    })
    await asyncio.sleep(4)


async def _cashout(user_id: str, forced_multiplier: Optional[float] = None) -> Optional[dict]:
    bet = game_state["bets"].get(user_id)
    if not bet or bet["status"] != "active":
        return None
    m = forced_multiplier if forced_multiplier else game_state["multiplier"]
    if game_state["status"] != "flying":
        return None
    win = round(float(bet["amount"]) * float(m), 2)
    profit = round(win - float(bet["amount"]), 2)
    bet["status"] = "cashed_out"
    bet["cashout_multiplier"] = float(m)
    bet["profit"] = profit
    # credit user with the payout (bet was already debited when placed)
    await credit(user_id, win, "cashout", f"Cashout {m}x", bet["id"])
    await db.bets.update_one({"id": bet["id"]}, {"$set": {
        "status": "cashed_out", "cashout_multiplier": float(m), "profit": profit,
        "settled_at": iso(now_utc())
    }})
    await hub.broadcast({"type": "cashout", "data": {"user_name": bet["user_name"], "multiplier": float(m), "profit": profit, "user_id": user_id}})
    return bet


# --------------------- GAME API ---------------------
@api.get("/game/state")
async def game_state_api():
    return {
        "round_id": game_state.get("round_id"),
        "status": game_state.get("status"),
        "multiplier": round(game_state.get("multiplier", 1.0), 2),
        "server_seed_hash": game_state.get("server_seed_hash"),
        "history": game_state.get("history", [])[-20:],
        "bets": list(game_state["bets"].values()),
        "paused": game_state.get("paused", False),
    }


@api.post("/game/bet")
async def place_bet(body: BetIn, user: dict = Depends(current_user)):
    if game_state["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Betting is closed")
    if user["id"] in game_state["bets"]:
        raise HTTPException(status_code=400, detail="You already placed a bet this round")
    amount = round(float(body.amount), 2)
    if amount < 10:
        raise HTTPException(status_code=400, detail="Minimum bet is ₹10")
    fresh = await db.users.find_one({"id": user["id"]})
    if float(fresh.get("balance", 0)) < amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    if body.auto_cashout is not None and body.auto_cashout <= 1.01:
        raise HTTPException(status_code=400, detail="Auto cashout must be > 1.01x")

    bet = {
        "id": str(uuid.uuid4()),
        "round_id": game_state["round_id"],
        "user_id": user["id"],
        "user_name": user.get("name", "Player"),
        "amount": amount,
        "auto_cashout": float(body.auto_cashout) if body.auto_cashout else None,
        "status": "active",  # active, cashed_out, lost
        "cashout_multiplier": None,
        "profit": 0.0,
        "created_at": iso(now_utc()),
        "settled_at": None,
    }
    await debit(user["id"], amount, "bet", f"Bet placed round {game_state['round_id'][:8]}", bet["id"])
    await db.bets.insert_one(dict(bet))
    game_state["bets"][user["id"]] = bet
    await hub.broadcast({"type": "bet", "data": {"user_name": bet["user_name"], "amount": amount, "user_id": user["id"]}})
    return serialize(bet)


@api.post("/game/cashout")
async def cashout_api(user: dict = Depends(current_user)):
    if game_state["status"] != "flying":
        raise HTTPException(status_code=400, detail="Cashout not available")
    result = await _cashout(user["id"])
    if not result:
        raise HTTPException(status_code=400, detail="No active bet")
    return result


@api.get("/game/bets/mine")
async def my_bets(user: dict = Depends(current_user), limit: int = 50):
    docs = await db.bets.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return docs


@api.get("/game/history")
async def game_history(limit: int = 20):
    docs = await db.rounds.find({"status": "crashed"}, {"_id": 0, "round_id": 1, "crash_at": 1, "created_at": 1, "server_seed": 1, "server_seed_hash": 1}).sort("created_at", -1).limit(limit).to_list(limit)
    return docs


# --------------------- WebSocket ---------------------
@app.websocket("/api/ws")
async def ws_endpoint(ws: WebSocket):
    await hub.connect(ws)
    try:
        # send initial state
        await ws.send_json({
            "type": "state",
            "data": {
                "round_id": game_state.get("round_id"),
                "status": game_state.get("status"),
                "multiplier": round(game_state.get("multiplier", 1.0), 2),
                "server_seed_hash": game_state.get("server_seed_hash"),
                "history": game_state.get("history", [])[-20:],
                "bets": list(game_state["bets"].values()),
                "players": len(game_state["bets"]),
            }
        })
        while True:
            # keep connection alive; ignore incoming
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                try:
                    await ws.send_json({"type": "ping"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await hub.disconnect(ws)


# --------------------- SUPPORT TICKETS ---------------------
MAX_UPLOAD_MB = 5


@api.post("/support/upload")
async def upload_support_file(file: UploadFile = File(...), user: dict = Depends(current_user)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        raise HTTPException(status_code=400, detail="Only JPG/PNG/GIF/WEBP images are allowed")
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_UPLOAD_MB}MB limit")
    ct = MIME_TYPES.get(ext, file.content_type or "application/octet-stream")
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/support/{user['id']}/{file_id}.{ext}"
    try:
        result = put_object(path, data, ct)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")
    rec = {
        "id": file_id,
        "user_id": user["id"],
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": ct,
        "size": len(data),
        "is_deleted": False,
        "created_at": iso(now_utc()),
    }
    await db.support_files.insert_one(dict(rec))
    return {"id": file_id, "size": len(data), "content_type": ct}


@api.get("/support/files/{file_id}")
async def download_support_file(file_id: str, auth: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    # Manual auth check (supports both Authorization header and ?auth=<token> query param for <img>)
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    caller = await db.users.find_one({"id": payload["sub"]})
    if not caller:
        raise HTTPException(status_code=401, detail="User not found")

    rec = await db.support_files.find_one({"id": file_id, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    # Only owner or admin can view
    if caller.get("role") != "admin" and caller["id"] != rec["user_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    data, ct = get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type", ct))


@api.post("/support/tickets")
async def create_support_ticket(body: SupportTicketIn, user: dict = Depends(current_user)):
    # If a screenshot_id was provided, verify it belongs to this user
    if body.screenshot_id:
        f = await db.support_files.find_one({"id": body.screenshot_id, "user_id": user["id"], "is_deleted": False})
        if not f:
            raise HTTPException(status_code=400, detail="Attached screenshot not found")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_email": user["email"],
        "user_name": user.get("name", ""),
        "subject": body.subject.strip(),
        "amount": round(float(body.amount), 2) if body.amount is not None else None,
        "message": body.message.strip(),
        "screenshot_id": body.screenshot_id,
        "status": "open",  # open / in_progress / resolved / rejected
        "admin_reply": None,
        "reviewed_by": None,
        "reviewed_at": None,
        "created_at": iso(now_utc()),
    }
    await db.support_tickets.insert_one(dict(doc))
    return serialize(doc)


@api.get("/support/tickets/mine")
async def my_tickets(user: dict = Depends(current_user)):
    docs = await db.support_tickets.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@api.get("/admin/support/tickets")
async def admin_list_tickets(status_filter: Optional[str] = None, _: dict = Depends(admin_only)):
    q = {}
    if status_filter:
        q["status"] = status_filter
    docs = await db.support_tickets.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api.patch("/admin/support/tickets/{ticket_id}")
async def admin_update_ticket(ticket_id: str, body: SupportTicketUpdateIn, admin: dict = Depends(admin_only)):
    if body.status not in ("open", "in_progress", "resolved", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")
    tkt = await db.support_tickets.find_one({"id": ticket_id})
    if not tkt:
        raise HTTPException(status_code=404, detail="Ticket not found")
    await db.support_tickets.update_one({"id": ticket_id}, {"$set": {
        "status": body.status,
        "admin_reply": body.admin_reply,
        "reviewed_by": admin["email"],
        "reviewed_at": iso(now_utc()),
    }})
    return {"ok": True}


# --------------------- Root ---------------------
@api.get("/")
async def root():
    return {"app": "AeroX Crash", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
