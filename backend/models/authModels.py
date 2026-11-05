from datetime import datetime

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
