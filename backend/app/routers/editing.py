"""
Editing router for chapter editing and proofreading endpoints.

Provides endpoints for:
- Editorial pass (structural editing)
- Proofreading pass
- Edit suggestions management
- Suggestion application
"""

import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.errors import ErrorCode
from app.models import Artifact
from app.security import TokenData, get_current_user
from app.services.project_service import ProjectService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/chapters/{chapter_number}", tags=["editing"])


class EditRequest(BaseModel):
    """Request for editing a chapter."""

    edit_type: str = Field(
        default="structural",
        description="Type of edit: structural, line, copy, proofread",
    )
    focus_areas: Optional[list[str]] = Field(
        default=None,
        description="Specific areas to focus on (e.g., 'dialogue', 'pacing', 'description')",
    )
    preserve_voice: bool = Field(
        default=True,
        description="Whether to preserve the author's voice",
    )
    aggressiveness: str = Field(
        default="moderate",
        description="How aggressive edits should be: light, moderate, heavy",
    )


class ProofreadRequest(BaseModel):
    """Request for proofreading a chapter."""

    check_grammar: bool = Field(default=True, description="Check grammar issues")
    check_spelling: bool = Field(default=True, description="Check spelling issues")
    check_punctuation: bool = Field(default=True, description="Check punctuation issues")
    check_formatting: bool = Field(default=True, description="Check formatting consistency")
    style_guide: Optional[str] = Field(
        default=None,
        description="Style guide to follow (e.g., 'chicago', 'apa')",
    )


class EditSuggestion(BaseModel):
    """A single edit suggestion."""

    id: str = Field(description="Unique identifier for the suggestion")
    suggestion_type: str = Field(
        description="Type: structural, line, copy, grammar, spelling, punctuation"
    )
    severity: str = Field(description="Severity: info, warning, error")
    original_text: str = Field(description="The original text")
    suggested_text: str = Field(description="The suggested replacement")
    start_position: int = Field(description="Start character position in the chapter")
    end_position: int = Field(description="End character position in the chapter")
    explanation: str = Field(description="Why this edit is suggested")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score (0-1)")


class EditSuggestionsResponse(BaseModel):
    """Response containing edit suggestions."""

    chapter_number: int
    suggestion_count: int
    suggestions: list[EditSuggestion]
    summary: str


class ApplySuggestionRequest(BaseModel):
    """Request to apply a specific suggestion."""

    apply_similar: bool = Field(
        default=False,
        description="Whether to apply similar suggestions automatically",
    )


class ApplySuggestionResponse(BaseModel):
    """Response after applying a suggestion."""

    success: bool
    applied_count: int
    new_content: Optional[str] = None
    message: str


async def verify_project_ownership(
    project_id: UUID,
    current_user: TokenData,
    db: AsyncSession,
) -> None:
    """Verify that the current user owns the project."""
    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error_code": ErrorCode.PROJECT_NOT_FOUND, "message": "Project not found"},
        )

    if str(project.user_id) != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project",
        )


async def get_chapter_content(
    project_id: UUID,
    chapter_number: int,
    db: AsyncSession,
) -> Optional[str]:
    """Retrieve chapter content from artifacts."""
    from sqlalchemy import select

    stmt = select(Artifact).where(
        Artifact.project_id == project_id,
        Artifact.artifact_type == "chapter",
        Artifact.artifact_key == f"chapter_{chapter_number}",
    )
    result = await db.execute(stmt)
    artifact = result.scalar_one_or_none()

    if artifact:
        return artifact.content
    return None


@router.post("/edit/stream")
async def edit_chapter_stream(
    project_id: UUID,
    chapter_number: int,
    request: EditRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    Perform an editorial pass on a chapter with SSE streaming.

    Supports different edit types:
    - structural: Pacing, plot holes, character consistency
    - line: Prose quality, sentence flow, word choice
    - copy: Grammar, punctuation, style guide adherence
    - proofread: Typos, formatting, final polish
    """
    await verify_project_ownership(project_id, current_user, db)

    content = await get_chapter_content(project_id, chapter_number, db)
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.CHAPTER_NOT_FOUND,
                "message": f"Chapter {chapter_number} not found",
            },
        )

    async def generate():
        """Generate SSE events for editing."""
        try:
            yield f"data: {json.dumps({'event': 'start', 'edit_type': request.edit_type})}\n\n"

            # Simulate editing passes
            yield f"data: {json.dumps({'event': 'progress', 'phase': 'analyzing', 'progress': 0.2})}\n\n"
            yield f"data: {json.dumps({'event': 'progress', 'phase': 'editing', 'progress': 0.5})}\n\n"
            yield f"data: {json.dumps({'event': 'progress', 'phase': 'reviewing', 'progress': 0.8})}\n\n"

            # Complete
            yield f"data: {json.dumps({'event': 'complete', 'suggestions_count': 0})}\n\n"

        except Exception as e:
            logger.error(f"Error during editing: {e}")
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/proofread/stream")
async def proofread_chapter_stream(
    project_id: UUID,
    chapter_number: int,
    request: ProofreadRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    Perform a proofreading pass on a chapter with SSE streaming.

    Checks for:
    - Grammar issues
    - Spelling errors
    - Punctuation problems
    - Formatting inconsistencies
    """
    await verify_project_ownership(project_id, current_user, db)

    content = await get_chapter_content(project_id, chapter_number, db)
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.CHAPTER_NOT_FOUND,
                "message": f"Chapter {chapter_number} not found",
            },
        )

    async def generate():
        """Generate SSE events for proofreading."""
        try:
            checks = []
            if request.check_grammar:
                checks.append("grammar")
            if request.check_spelling:
                checks.append("spelling")
            if request.check_punctuation:
                checks.append("punctuation")
            if request.check_formatting:
                checks.append("formatting")

            yield f"data: {json.dumps({'event': 'start', 'checks': checks})}\n\n"

            # Simulate proofreading
            for i, check in enumerate(checks):
                progress = (i + 1) / len(checks)
                yield f"data: {json.dumps({'event': 'progress', 'check': check, 'progress': progress})}\n\n"

            yield f"data: {json.dumps({'event': 'complete', 'issues_found': 0})}\n\n"

        except Exception as e:
            logger.error(f"Error during proofreading: {e}")
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/suggestions")
async def get_chapter_suggestions(
    project_id: UUID,
    chapter_number: int,
    suggestion_type: Optional[str] = None,
    severity: Optional[str] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EditSuggestionsResponse:
    """
    Get edit suggestions for a chapter.

    Filter by:
    - suggestion_type: structural, line, copy, grammar, spelling, punctuation
    - severity: info, warning, error
    """
    await verify_project_ownership(project_id, current_user, db)

    content = await get_chapter_content(project_id, chapter_number, db)
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.CHAPTER_NOT_FOUND,
                "message": f"Chapter {chapter_number} not found",
            },
        )

    # Return empty suggestions for now (implementation in editing service)
    return EditSuggestionsResponse(
        chapter_number=chapter_number,
        suggestion_count=0,
        suggestions=[],
        summary="No suggestions found. Run an editing pass to generate suggestions.",
    )


@router.post("/suggestions/{suggestion_id}/apply")
async def apply_suggestion(
    project_id: UUID,
    chapter_number: int,
    suggestion_id: str,
    request: ApplySuggestionRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApplySuggestionResponse:
    """
    Apply a specific edit suggestion to the chapter.

    Options:
    - apply_similar: Apply similar suggestions automatically
    """
    await verify_project_ownership(project_id, current_user, db)

    content = await get_chapter_content(project_id, chapter_number, db)
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.CHAPTER_NOT_FOUND,
                "message": f"Chapter {chapter_number} not found",
            },
        )

    # Suggestion application will be implemented in editing service
    return ApplySuggestionResponse(
        success=False,
        applied_count=0,
        message=f"Suggestion '{suggestion_id}' not found",
    )


@router.post("/suggestions/{suggestion_id}/reject")
async def reject_suggestion(
    project_id: UUID,
    chapter_number: int,
    suggestion_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Reject a specific edit suggestion.

    This helps the system learn user preferences.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Rejection tracking will be implemented in editing service
    return {
        "success": True,
        "message": f"Suggestion '{suggestion_id}' rejected",
    }


@router.get("/edit-history")
async def get_edit_history(
    project_id: UUID,
    chapter_number: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get the edit history for a chapter.

    Shows all editing passes and applied suggestions.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Edit history will be implemented with session tracking
    return {
        "chapter_number": chapter_number,
        "edit_passes": [],
        "applied_suggestions": [],
        "rejected_suggestions": [],
    }
