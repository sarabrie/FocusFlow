from bson import ObjectId

from database import db


class UserModel:
	@staticmethod
	async def find_by_email(email: str):
		return await db.users.find_one({"email": email})

	@staticmethod
	async def find_by_id(user_id: ObjectId):
		return await db.users.find_one({"_id": user_id}, {"_id": 1})

	@staticmethod
	async def create(email: str, password_hash: str, display_name: str):
		user_document = {
			"email": email,
			"password": password_hash,
			"display_name": display_name,
		}
		result = await db.users.insert_one(user_document)
		user_document["_id"] = result.inserted_id
		return user_document
