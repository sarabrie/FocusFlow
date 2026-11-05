from bson import ObjectId
from fastapi import APIRouter, Depends, status

from controllers.sessionControllers import (
    add_reading as add_reading_controller,
    create_session as create_session_controller,
    end_session as end_session_controller,
    get_session as get_session_controller,
    list_sessions as list_sessions_controller,
)
from schemas.session import (
    SessionCreateRequest,
    SessionCreateResponse,
    SessionDetailResponse,
    SessionReadingCreate,
    SessionReadingResponse,
    SessionSummaryResponse,
)
from security import get_current_user_id

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


@router.post("", response_model=SessionCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: SessionCreateRequest,
    user_id: ObjectId = Depends(get_current_user_id),
):
    return await create_session_controller(payload, user_id)


@router.post("/{session_id}/readings", response_model=SessionReadingResponse, status_code=status.HTTP_201_CREATED)
async def add_reading(
    session_id: str,
    payload: SessionReadingCreate,
    user_id: ObjectId = Depends(get_current_user_id),
):
    return await add_reading_controller(session_id, payload, user_id)


@router.post("/{session_id}/end", response_model=dict)
async def end_session(
    session_id: str,
    user_id: ObjectId = Depends(get_current_user_id),
):
    return await end_session_controller(session_id, user_id)


@router.get("", response_model=list[SessionSummaryResponse])
async def list_sessions(user_id: ObjectId = Depends(get_current_user_id)):
    return await list_sessions_controller(user_id)


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(
    session_id: str,
    user_id: ObjectId = Depends(get_current_user_id),
):
    return await get_session_controller(session_id, user_id)
