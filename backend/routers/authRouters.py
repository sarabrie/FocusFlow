from fastapi import APIRouter, Depends, status

from controllers.authControllers import (
    change_password as change_password_controller,
    delete_account as delete_account_controller,
    login_user as login_user_controller,
    logout_user as logout_user_controller,
    register_user as register_user_controller,
)
from schemas.auth import AccountDelete, PasswordChange, UserLogin, UserRegister
from security import CurrentToken, get_current_token

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user(user: UserRegister):
    return await register_user_controller(user)


@router.post("/login", status_code=status.HTTP_200_OK)
async def login_user(user: UserLogin):
    return await login_user_controller(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_user(token: CurrentToken = Depends(get_current_token)):
    return await logout_user_controller(token)


@router.post("/password", status_code=status.HTTP_200_OK)
async def change_password(payload: PasswordChange, token: CurrentToken = Depends(get_current_token)):
    return await change_password_controller(payload, token)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(payload: AccountDelete, token: CurrentToken = Depends(get_current_token)):
    return await delete_account_controller(payload, token)
