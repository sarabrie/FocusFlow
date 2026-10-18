from bson import ObjectId
from fastapi import APIRouter, Depends, status

from controllers.contentControllers import (
    create_content as create_content_controller,
    delete_content as delete_content_controller,
    get_content as get_content_controller,
    list_content as list_content_controller,
    save_attention_score as save_attention_score_controller,
)
from schemas.content import (
    AttentionScoreCreate,
    AttentionScoreResponse,
    ContentCreate,
    ContentResponse,
)
from security import get_current_user_id

router = APIRouter(prefix="/api/content", tags=["Content"])


@router.post("", response_model=ContentResponse, status_code=status.HTTP_201_CREATED)
async def create_content(
    content: ContentCreate,
    user_id: ObjectId = Depends(get_current_user_id),
):
    return await create_content_controller(content, user_id)


@router.get("", response_model=list[ContentResponse])
async def list_content(user_id: ObjectId = Depends(get_current_user_id)):
    return await list_content_controller(user_id)


@router.get("/{content_id}", response_model=ContentResponse)
async def get_content(
    content_id: str,
    user_id: ObjectId = Depends(get_current_user_id),
):
    return await get_content_controller(content_id, user_id)


@router.delete("/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content(
    content_id: str,
    user_id: ObjectId = Depends(get_current_user_id),
):
    return await delete_content_controller(content_id, user_id)


@router.post(
    "/{content_id}/attention",
    response_model=AttentionScoreResponse,
    status_code=status.HTTP_201_CREATED,
)
async def save_attention_score(
    content_id: str,
    score_data: AttentionScoreCreate,
    user_id: ObjectId = Depends(get_current_user_id),
):
    return await save_attention_score_controller(content_id, score_data, user_id)