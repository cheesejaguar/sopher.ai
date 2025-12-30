"""Utilities for standardized API errors."""

from __future__ import annotations

from contextvars import ContextVar
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Optional
from uuid import uuid4

from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Context variable to store request ID
request_id_ctx_var: ContextVar[str] = ContextVar("request_id", default="")


class ErrorCode(str, Enum):
    """Common API error codes."""

    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"
    HTTP_ERROR = "HTTP_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    OUTLINE_INVALID_PARAMETER = "OUTLINE_INVALID_PARAMETER"
    OUTLINE_STREAM_INIT_FAILED = "OUTLINE_STREAM_INIT_FAILED"
    PROJECT_NOT_FOUND = "PROJECT_NOT_FOUND"
    OUTLINE_NOT_FOUND = "OUTLINE_NOT_FOUND"
    CHAPTER_NOT_FOUND = "CHAPTER_NOT_FOUND"
    CHAPTER_GENERATION_FAILED = "CHAPTER_GENERATION_FAILED"
    CHAPTER_INVALID_NUMBER = "CHAPTER_INVALID_NUMBER"
    OUTLINE_REQUIRED = "OUTLINE_REQUIRED"
    SUGGESTION_NOT_FOUND = "SUGGESTION_NOT_FOUND"
    CONTINUITY_ISSUE_NOT_FOUND = "CONTINUITY_ISSUE_NOT_FOUND"
    CONTINUITY_CHECK_FAILED = "CONTINUITY_CHECK_FAILED"
    CHARACTER_NOT_FOUND = "CHARACTER_NOT_FOUND"
    TIMELINE_EVENT_NOT_FOUND = "TIMELINE_EVENT_NOT_FOUND"
    WORLD_RULE_NOT_FOUND = "WORLD_RULE_NOT_FOUND"
    EXPORT_NOT_FOUND = "EXPORT_NOT_FOUND"
    EXPORT_GENERATION_FAILED = "EXPORT_GENERATION_FAILED"
    EXPORT_FORMAT_NOT_SUPPORTED = "EXPORT_FORMAT_NOT_SUPPORTED"
    MANUSCRIPT_ASSEMBLY_FAILED = "MANUSCRIPT_ASSEMBLY_FAILED"


class APIError(BaseModel):
    """Pydantic model for API error responses."""

    error_id: str
    error_code: str
    message: str
    hint: Optional[str] = None
    details: Optional[Dict[str, object]] = None
    request_id: str
    timestamp: str


def generate_error_id() -> str:
    """Generate a UUIDv4 error ID."""

    return str(uuid4())


def api_error(
    code: str,
    message: str,
    *,
    hint: str | None = None,
    details: Dict[str, object] | None = None,
    status: int = 400,
) -> JSONResponse:
    """Create a standardized API error response."""

    error = APIError(
        error_id=generate_error_id(),
        error_code=code,
        message=message,
        hint=hint,
        details=details,
        request_id=request_id_ctx_var.get(),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    return JSONResponse(status_code=status, content=error.model_dump())
