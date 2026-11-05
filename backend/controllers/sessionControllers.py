from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status

from models.contentModels import ContentModel
from models.sessionModels import SessionModel
from schemas.session import (
    SessionCreateRequest,
    SessionCreateResponse,
    SessionDetailResponse,
    SessionReadingCreate,
    SessionReadingResponse,
    SessionSummaryResponse,
)


def serialize_reading(document: dict) -> SessionReadingResponse:
    return SessionReadingResponse(
        position=document["position"],
        score=document["score"],
        created_at=document["created_at"],
    )


def calculate_average(readings: list[dict]) -> float | None:
    if not readings:
        return None
    return sum(item["score"] for item in readings) / len(readings)


async def create_session(payload: SessionCreateRequest, user_id: ObjectId):
    # An invalid id is "not found", not a server error (ObjectId() would raise InvalidId → 500).
    if not ObjectId.is_valid(payload.content_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found",
        )
    content_id = ObjectId(payload.content_id)
    content = await ContentModel.find_for_user(content_id, user_id)
    if content is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found",
        )

    session = await SessionModel.create(user_id, content_id)
    return SessionCreateResponse(
        id=str(session["_id"]),
        content_id=str(content_id),
        started_at=session["started_at"],
    )


async def add_reading(session_id: str, payload: SessionReadingCreate, user_id: ObjectId):
    try:
        parsed_session_id = ObjectId(session_id)
    except InvalidId as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        ) from exc

    session = await SessionModel.find_by_id(parsed_session_id, user_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    if session.get("ended_at") is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session already ended",
        )

    reading = {
        "position": payload.position,
        "score": payload.score,
        "created_at": datetime.now(timezone.utc),
    }
    result = await SessionModel.append_reading(parsed_session_id, user_id, reading)
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    return SessionReadingResponse(
        position=reading["position"],
        score=reading["score"],
        created_at=reading["created_at"],
    )


async def end_session(session_id: str, user_id: ObjectId):
    try:
        parsed_session_id = ObjectId(session_id)
    except InvalidId as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        ) from exc

    session = await SessionModel.find_by_id(parsed_session_id, user_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if session.get("ended_at") is None:
        ended_at = datetime.now(timezone.utc)
        await SessionModel.end_session(parsed_session_id, user_id, ended_at)
        session["ended_at"] = ended_at

    readings = session.get("readings") or []
    return {
        "id": str(session["_id"]),
        "started_at": session["started_at"],
        "ended_at": session["ended_at"],
        "reading_count": len(readings),
        "average_score": calculate_average(readings),
    }


async def list_sessions(user_id: ObjectId):
    sessions = await SessionModel.list_for_user(user_id)
    response = []
    for session in sessions:
        readings = session.get("readings") or []
        content = await ContentModel.find_for_user(session["content_id"], user_id)
        response.append(
            SessionSummaryResponse(
                id=str(session["_id"]),
                content_id=str(session["content_id"]),
                content_title=content["title"] if content else None,
                content_type=content.get("type") if content else None,
                started_at=session["started_at"],
                ended_at=session.get("ended_at"),
                reading_count=len(readings),
                average_score=calculate_average(readings),
            )
        )
    return response


async def get_session(session_id: str, user_id: ObjectId):
    try:
        parsed_session_id = ObjectId(session_id)
    except InvalidId as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        ) from exc

    session = await SessionModel.find_by_id(parsed_session_id, user_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    content = await ContentModel.find_for_user(session["content_id"], user_id)
    readings = session.get("readings") or []
    return SessionDetailResponse(
        id=str(session["_id"]),
        content_id=str(session["content_id"]),
        content_title=content["title"] if content else None,
        content_type=content.get("type") if content else None,
        started_at=session["started_at"],
        ended_at=session.get("ended_at"),
        reading_count=len(readings),
        average_score=calculate_average(readings),
        readings=[serialize_reading(item) for item in readings],
    )
