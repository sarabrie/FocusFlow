from bson import ObjectId
from fastapi import HTTPException, Response, status

from models.contentModels import AttentionScoreModel, ContentModel
from schemas.content import (
	AttentionScoreCreate,
	AttentionScoreResponse,
	ContentCreate,
	ContentResponse,
)


def serialize_content(document: dict) -> ContentResponse:
	return ContentResponse(
		id=str(document["_id"]),
		type=document["type"],
		title=document["title"],
		source=document["source"],
		created_at=document["created_at"],
	)


def parse_content_id(content_id: str) -> ObjectId:
	if not ObjectId.is_valid(content_id):
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Content not found",
		)
	return ObjectId(content_id)


async def create_content(content: ContentCreate, user_id: ObjectId):
	document = await ContentModel.create(content.model_dump(), user_id)
	return serialize_content(document)


async def list_content(user_id: ObjectId) -> list[ContentResponse]:
	documents = await ContentModel.list_for_user(user_id)
	return [serialize_content(document) for document in documents]


async def get_content(content_id: str, user_id: ObjectId) -> ContentResponse:
	document = await ContentModel.find_for_user(parse_content_id(content_id), user_id)
	if document is None:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Content not found",
		)
	return serialize_content(document)


async def delete_content(content_id: str, user_id: ObjectId) -> Response:
	deleted = await ContentModel.delete_for_user(parse_content_id(content_id), user_id)
	if not deleted:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Content not found",
		)
	return Response(status_code=status.HTTP_204_NO_CONTENT)


async def save_attention_score(
	content_id: str,
	score_data: AttentionScoreCreate,
	user_id: ObjectId,
) -> AttentionScoreResponse:
	parsed_content_id = parse_content_id(content_id)
	content_exists = await ContentModel.exists_for_user(parsed_content_id, user_id)
	if not content_exists:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Content not found",
		)

	document = await AttentionScoreModel.create(
		parsed_content_id, user_id, score_data.score
	)
	return AttentionScoreResponse(
		id=str(document["_id"]),
		content_id=content_id,
		score=score_data.score,
		created_at=document["created_at"],
	)
