from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId

from database import db


class SessionModel:
    @staticmethod
    async def create(user_id: ObjectId, content_id: ObjectId):
        document = {
            "user_id": user_id,
            "content_id": content_id,
            "started_at": datetime.now(timezone.utc),
            "ended_at": None,
            "readings": [],
        }
        result = await db.sessions.insert_one(document)
        document["_id"] = result.inserted_id
        return document

    @staticmethod
    async def find_by_id(session_id: ObjectId, user_id: ObjectId):
        return await db.sessions.find_one({"_id": session_id, "user_id": user_id})

    @staticmethod
    async def list_for_user(user_id: ObjectId):
        cursor = db.sessions.find({"user_id": user_id}).sort("started_at", -1)
        return [document async for document in cursor]

    @staticmethod
    async def append_reading(session_id: ObjectId, user_id: ObjectId, reading: dict):
        return await db.sessions.update_one(
            {"_id": session_id, "user_id": user_id, "ended_at": None},
            {"$push": {"readings": reading}},
        )

    @staticmethod
    async def end_session(session_id: ObjectId, user_id: ObjectId, ended_at: datetime):
        return await db.sessions.update_one(
            {"_id": session_id, "user_id": user_id},
            {"$set": {"ended_at": ended_at}},
        )

    @staticmethod
    async def delete_for_user(user_id: ObjectId):
        await db.sessions.delete_many({"user_id": user_id})

    @staticmethod
    async def delete_for_content(content_id: ObjectId, user_id: ObjectId):
        await db.sessions.delete_many({"content_id": content_id, "user_id": user_id})

    @staticmethod
    async def parse_id(session_id: str):
        if not ObjectId.is_valid(session_id):
            raise InvalidId(f"Invalid session id: {session_id}")
        return ObjectId(session_id)
