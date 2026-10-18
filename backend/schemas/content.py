from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ContentCreate(BaseModel):
    type: Literal["link", "text"]
    title: str = Field(min_length=1, max_length=200)
    source: str = Field(min_length=1)


class ContentResponse(BaseModel):
    id: str
    type: Literal["link", "text"]
    title: str
    source: str
    created_at: datetime


class AttentionScoreCreate(BaseModel):
    score: float = Field(ge=0, le=100)


class AttentionScoreResponse(BaseModel):
    id: str
    content_id: str
    score: float
    created_at: datetime