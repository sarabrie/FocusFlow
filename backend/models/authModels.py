from datetime import datetime, timedelta, timezone

from bson import ObjectId

from database import db


class UserModel:
	@staticmethod
	async def find_by_email(email: str):
		return await db.users.find_one({"email": email})

	@staticmethod
	async def find_by_id(user_id: ObjectId):
		return await db.users.find_one({"_id": user_id}, {"_id": 1, "token_version": 1})

	@staticmethod
	async def find_with_password(user_id: ObjectId):
		return await db.users.find_one({"_id": user_id})

	@staticmethod
	async def create(email: str, password_hash: str, display_name: str):
		user_document = {
			"email": email,
			"password": password_hash,
			"display_name": display_name,
			"token_version": 0,
		}
		result = await db.users.insert_one(user_document)
		user_document["_id"] = result.inserted_id
		return user_document

	# Bumping token_version invalidates every token issued before the change.
	@staticmethod
	async def update_password(user_id: ObjectId, password_hash: str) -> int:
		user = await db.users.find_one_and_update(
			{"_id": user_id},
			{"$set": {"password": password_hash}, "$inc": {"token_version": 1}},
			projection={"token_version": 1},
			return_document=True,
		)
		return user.get("token_version", 0)

	@staticmethod
	async def delete(user_id: ObjectId):
		await db.users.delete_one({"_id": user_id})


class RevokedTokenModel:
	# A TTL index on expires_at (see main.py) removes entries once the token would have expired anyway.
	@staticmethod
	async def revoke(jti: str, expires_at: datetime):
		await db.revoked_tokens.update_one(
			{"_id": jti},
			{"$set": {"expires_at": expires_at}},
			upsert=True,
		)

	@staticmethod
	async def is_revoked(jti: str) -> bool:
		return await db.revoked_tokens.find_one({"_id": jti}, {"_id": 1}) is not None


class LoginFailureModel:
	"""Failed logins per email, kept in the database so every server instance sees the same count.

	One document per email: {_id: email, count, expires_at}. The window starts at the first failure;
	a TTL index on expires_at (see main.py) removes the document when the window ends.
	"""

	MAX_FAILURES = 5
	WINDOW = timedelta(minutes=15)

	@staticmethod
	def _now() -> datetime:
		return datetime.now(timezone.utc)

	@staticmethod
	def _aware(value: datetime) -> datetime:
		# Motor returns naive UTC datetimes by default.
		return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

	@staticmethod
	async def retry_after(email: str) -> int:
		"""Seconds until the email may try again, or 0 if it is not blocked."""
		doc = await db.login_failures.find_one({"_id": email})
		if not doc or doc.get("count", 0) < LoginFailureModel.MAX_FAILURES:
			return 0
		# The TTL monitor runs about once a minute, so an expired document may still be here.
		remaining = (LoginFailureModel._aware(doc["expires_at"]) - LoginFailureModel._now()).total_seconds()
		return max(1, int(remaining)) if remaining > 0 else 0

	@staticmethod
	async def record_failure(email: str):
		now = LoginFailureModel._now()
		# A window that already ended (but the TTL monitor hasn't removed yet) starts over.
		await db.login_failures.delete_one({"_id": email, "expires_at": {"$lte": now}})
		# $inc with upsert is atomic, so parallel requests on different instances can't skip the count.
		await db.login_failures.update_one(
			{"_id": email},
			{"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now + LoginFailureModel.WINDOW}},
			upsert=True,
		)

	@staticmethod
	async def reset(email: str):
		await db.login_failures.delete_one({"_id": email})
