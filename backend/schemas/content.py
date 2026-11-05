from datetime import datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, model_validator

MAX_URL_LENGTH = 2048
MAX_TEXT_LENGTH = 50_000


class ContentCreate(BaseModel):
    type: Literal["link", "text"]
    title: str = Field(min_length=1, max_length=200)
    source: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)

    # Links are rendered as <a href>, so only http(s) is allowed: "javascript:" or "data:" URLs would run code on click.
    @model_validator(mode="after")
    def validate_source(self):
        self.title = self.title.strip()
        self.source = self.source.strip()
        if not self.title or not self.source:
            raise ValueError("כותרת ותוכן הם שדות חובה")
        if self.type == "link":
            parsed = urlparse(self.source)
            if len(self.source) > MAX_URL_LENGTH:
                raise ValueError("הקישור ארוך מדי")
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                raise ValueError("קישור חייב להתחיל ב-http:// או https://")
        return self


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
