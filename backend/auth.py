"""auth.py — password hashing, JWT, current-user dependency, and RBAC."""

import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "720"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Role hierarchy — higher number = more power.
ROLE_RANK = {"viewer": 1, "staff": 2, "accountant": 3, "admin": 4}


def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return pwd_context.verify(raw, hashed)


def create_access_token(user_id: str, company_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "company_id": str(company_id), "role": role, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


class CurrentUser(BaseModel):
    user_id: str
    company_id: str
    role: str


async def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    err = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        uid, cid, role = payload.get("sub"), payload.get("company_id"), payload.get("role")
        if not uid or not cid:
            raise err
    except JWTError:
        raise err
    return CurrentUser(user_id=uid, company_id=cid, role=role or "viewer")


def require_role(minimum: str):
    """Dependency factory: require at least `minimum` role.
    Usage:  Depends(require_role("accountant"))"""
    needed = ROLE_RANK.get(minimum, 99)

    async def checker(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if ROLE_RANK.get(current.role, 0) < needed:
            raise HTTPException(403, f"Requires '{minimum}' role or higher")
        return current

    return checker
