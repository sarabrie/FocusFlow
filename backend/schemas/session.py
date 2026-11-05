from datetime import datetime

from pydantic import BaseModel, Field


class SessionCreateRequest(BaseModel):
    content_id: str


class SessionCreateResponse(BaseModel):
    id: str
    content_id: str
    started_at: datetime


class SessionReadingCreate(BaseModel):
    position: float = Field(ge=0)
    score: float = Field(ge=0, le=1)


class SessionReadingResponse(BaseModel):
    position: float
    score: float
    created_at: datetime


class SessionSummaryResponse(BaseModel):
    id: str
    content_id: str
    content_title: str | None = None
    content_type: str | None = None
    started_at: datetime
    ended_at: datetime | None = None
    reading_count: int
    average_score: float | None = None


class SessionDetailResponse(SessionSummaryResponse):
    readings: list[SessionReadingResponse]
