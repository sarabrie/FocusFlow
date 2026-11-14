import logging
import os
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from models.authModels import RevokedTokenModel, UserModel

logger = logging.getLogger("focusflow.security")

# No hard-coded fallback: a default secret in public code would let anyone forge tokens.
# Without JWT_SECRET_KEY a random per-process secret is used, so tokens stop working after a restart.
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or secrets.token_urlsafe(48)
if not os.getenv("JWT_SECRET_KEY"):
    logger.warning("JWT_SECRET_KEY is not set; using a random secret for this process only.")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_DURATION = timedelta(hours=1)
bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(user_id: str, token_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": user_id,
            "iat": now,
            "exp": now + ACCESS_TOKEN_DURATION,
            # jti lets a single token be revoked on logout; tv invalidates every older token after a password change.
            "jti": uuid.uuid4().hex,
            "tv": token_version,
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


@dataclass
class CurrentToken:
    user_id: ObjectId
    jti: str
    expires_at: datetime


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentToken:
    if credentials is None:
        raise _unauthorized("Authentication required")

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "jti"]},
        )
        subject = payload.get("sub")
        if not isinstance(subject, str):
            raise jwt.InvalidTokenError("Token has no user subject")
        user_id = ObjectId(subject)
    except (jwt.InvalidTokenError, InvalidId):
        raise _unauthorized("Invalid or expired token") from None

    if await RevokedTokenModel.is_revoked(payload["jti"]):
        raise _unauthorized("Token has been revoked")

    user = await UserModel.find_by_id(user_id)
    if user is None:
        raise _unauthorized("User no longer exists")
    if payload.get("tv", 0) != user.get("token_version", 0):
        raise _unauthorized("Session expired, please log in again")

    return CurrentToken(
        user_id=user_id,
        jti=payload["jti"],
        expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
    )


async def get_current_user_id(token: CurrentToken = Depends(get_current_token)) -> ObjectId:
    return token.user_id
