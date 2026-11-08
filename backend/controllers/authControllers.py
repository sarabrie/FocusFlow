from fastapi import HTTPException, Response, status
from passlib.context import CryptContext
from pymongo.errors import DuplicateKeyError

from models.authModels import RevokedTokenModel, UserModel
from models.contentModels import AttentionScoreModel, ContentModel
from models.sessionModels import SessionModel
from schemas.auth import AccountDelete, PasswordChange, UserLogin, UserRegister
from security import CurrentToken, create_access_token, login_limiter

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# Verified when the email doesn't exist, so a missing account takes as long as a wrong password
# and response time doesn't reveal which emails are registered.
DUMMY_HASH = pwd_context.hash("focusflow-timing-equalizer-1")


async def register_user(user: UserRegister):
	existing_user = await UserModel.find_by_email(user.email.lower())
	if existing_user:
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="Email already registered",
		)

	hashed_password = pwd_context.hash(user.password)
	try:
		user_data = await UserModel.create(
			user.email.lower(), hashed_password, user.display_name
		)
	except DuplicateKeyError:
		# Two simultaneous registrations; the unique index on email rejects the second.
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="Email already registered",
		) from None

	return {
		"id": str(user_data["_id"]),
		"email": user_data["email"],
		"display_name": user_data["display_name"],
	}


async def login_user(user: UserLogin):
	email = user.email.lower()
	retry_after = await login_limiter.retry_after(email)
	if retry_after:
		raise HTTPException(
			status_code=status.HTTP_429_TOO_MANY_REQUESTS,
			detail=f"יותר מדי ניסיונות התחברות. נסו שוב בעוד {max(1, retry_after // 60)} דקות.",
			headers={"Retry-After": str(retry_after)},
		)

	db_user = await UserModel.find_by_email(email)
	password_ok = pwd_context.verify(user.password, db_user["password"] if db_user else DUMMY_HASH)
	if not db_user or not password_ok:
		await login_limiter.record_failure(email)
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Invalid email or password",
		)

	await login_limiter.reset(email)
	return {
		"id": str(db_user["_id"]),
		"email": db_user["email"],
		"display_name": db_user["display_name"],
		"access_token": create_access_token(str(db_user["_id"]), db_user.get("token_version", 0)),
		"token_type": "bearer",
	}


async def logout_user(token: CurrentToken) -> Response:
	await RevokedTokenModel.revoke(token.jti, token.expires_at)
	return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _verify_password(token: CurrentToken, password: str) -> dict:
	db_user = await UserModel.find_with_password(token.user_id)
	if not db_user or not pwd_context.verify(password, db_user["password"]):
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="הסיסמה הנוכחית שגויה",
		)
	return db_user


async def change_password(payload: PasswordChange, token: CurrentToken):
	await _verify_password(token, payload.current_password)
	token_version = await UserModel.update_password(token.user_id, pwd_context.hash(payload.new_password))
	# Older tokens (other devices) are now invalid; this device gets a fresh one.
	return {"access_token": create_access_token(str(token.user_id), token_version), "token_type": "bearer"}


async def delete_account(payload: AccountDelete, token: CurrentToken) -> Response:
	await _verify_password(token, payload.password)
	await SessionModel.delete_for_user(token.user_id)
	await AttentionScoreModel.delete_for_user(token.user_id)
	await ContentModel.delete_all_for_user(token.user_id)
	await UserModel.delete(token.user_id)
	await RevokedTokenModel.revoke(token.jti, token.expires_at)
	return Response(status_code=status.HTTP_204_NO_CONTENT)
