from fastapi import HTTPException, status
from passlib.context import CryptContext

from models.authModels import UserModel
from schemas.auth import UserLogin, UserRegister
from security import create_access_token

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def register_user(user: UserRegister):
	existing_user = await UserModel.find_by_email(user.email.lower())
	if existing_user:
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="Email already registered",
		)

	hashed_password = pwd_context.hash(user.password)
	user_data = await UserModel.create(
		user.email.lower(), hashed_password, user.display_name
	)

	return {
		"id": str(user_data["_id"]),
		"email": user_data["email"],
		"display_name": user_data["display_name"],
	}


async def login_user(user: UserLogin):
	db_user = await UserModel.find_by_email(user.email.lower())
	if not db_user or not pwd_context.verify(user.password, db_user["password"]):
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Invalid email or password",
		)

	return {
		"id": str(db_user["_id"]),
		"email": db_user["email"],
		"display_name": db_user["display_name"],
		"access_token": create_access_token(str(db_user["_id"])),
		"token_type": "bearer",
	}
