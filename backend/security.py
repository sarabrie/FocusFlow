import os
from datetime import datetime, timedelta, timezone

import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from models.authModels import UserModel

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "focusflow-local-development-only")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_DURATION = timedelta(hours=1)
bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(user_id: str) -> str:
    expires_at = datetime.now(timezone.utc) + ACCESS_TOKEN_DURATION
    return jwt.encode(
        {"sub": user_id, "exp": expires_at},
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> ObjectId:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
        subject = payload.get("sub")
        if not isinstance(subject, str):
            raise jwt.InvalidTokenError("Token has no user subject")
        user_id = ObjectId(subject)
    except (jwt.InvalidTokenError, InvalidId):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user_exists = await UserModel.find_by_id(user_id)
    if user_exists is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_id