from fastapi import APIRouter, status

from controllers.authControllers import (
    login_user as login_user_controller,
    register_user as register_user_controller,
)
from schemas.auth import UserLogin, UserRegister

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user(user: UserRegister):
    return await register_user_controller(user)


@router.post("/login", status_code=status.HTTP_200_OK)
async def login_user(user: UserLogin):
    return await login_user_controller(user)