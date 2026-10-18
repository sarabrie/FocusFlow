from datetime import datetime, timezone

from bson import ObjectId

from database import db


class ContentModel:
	@staticmethod
	async def create(content_data: dict, user_id: ObjectId):
		document = {
			**content_data,
			"user_id": user_id,
			"created_at": datetime.now(timezone.utc),
		}
		result = await db.contents.insert_one(document)
		document["_id"] = result.inserted_id
		return document

	@staticmethod
	async def list_for_user(user_id: ObjectId):
		cursor = db.contents.find({"user_id": user_id}).sort("created_at", -1)
		return [document async for document in cursor]

	@staticmethod
	async def find_for_user(content_id: ObjectId, user_id: ObjectId):
		return await db.contents.find_one(
			{"_id": content_id, "user_id": user_id}
		)

	@staticmethod
	async def exists_for_user(content_id: ObjectId, user_id: ObjectId) -> bool:
		document = await db.contents.find_one(
			{"_id": content_id, "user_id": user_id},
			{"_id": 1},
		)
		return document is not None

	@staticmethod
	async def delete_for_user(content_id: ObjectId, user_id: ObjectId) -> bool:
		result = await db.contents.delete_one(
			{"_id": content_id, "user_id": user_id}
		)
		return result.deleted_count > 0


class AttentionScoreModel:
	@staticmethod
	async def create(content_id: ObjectId, user_id: ObjectId, score: float):
		document = {
			"content_id": content_id,
			"user_id": user_id,
			"score": score,
			"created_at": datetime.now(timezone.utc),
		}
		result = await db.attention_scores.insert_one(document)
		document["_id"] = result.inserted_id
		return document
