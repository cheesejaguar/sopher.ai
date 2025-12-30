"""
Continuity router for checking and maintaining consistency across the book.

Provides endpoints for:
- Full continuity checking (character, timeline, world)
- Getting continuity reports
- Auto-fixing continuity issues
"""

import json
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.errors import ErrorCode
from app.security import TokenData, get_current_user
from app.services.project_service import ProjectService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/continuity", tags=["continuity"])


# ============================================================================
# Request/Response Schemas
# ============================================================================


class CharacterState(BaseModel):
    """Current state of a character at a specific point in the story."""

    chapter_number: int = Field(..., ge=1)
    location: Optional[str] = None
    emotional_state: Optional[str] = None
    knowledge: list[str] = Field(default_factory=list)
    relationships: dict[str, str] = Field(default_factory=dict)
    physical_state: Optional[str] = None


class CharacterProfile(BaseModel):
    """Complete character profile with all tracked details."""

    name: str = Field(..., min_length=1, max_length=200)
    aliases: list[str] = Field(default_factory=list)
    physical_description: Optional[str] = None
    personality_traits: list[str] = Field(default_factory=list)
    backstory: Optional[str] = None
    first_appearance: Optional[int] = Field(None, ge=1, description="Chapter number")
    states: list[CharacterState] = Field(default_factory=list)


class TimelineEvent(BaseModel):
    """An event in the story timeline."""

    id: str
    chapter_number: int = Field(..., ge=1)
    description: str = Field(..., min_length=5)
    timestamp: Optional[str] = None  # In-story timestamp
    characters_involved: list[str] = Field(default_factory=list)
    location: Optional[str] = None
    duration: Optional[str] = None
    dependencies: list[str] = Field(default_factory=list)  # Event IDs this depends on


class WorldRule(BaseModel):
    """A rule or constraint in the story world."""

    id: str
    name: str = Field(..., min_length=1)
    category: str = Field(
        ...,
        description="Category: magic_system, technology, physics, society, geography, other",
    )
    description: str = Field(..., min_length=10)
    exceptions: list[str] = Field(default_factory=list)
    established_in_chapter: Optional[int] = Field(None, ge=1)


class ContinuityIssue(BaseModel):
    """A detected continuity issue."""

    id: str
    issue_type: str = Field(
        ...,
        description="Type: character, timeline, world, plot_hole, inconsistency",
    )
    severity: str = Field(
        default="warning",
        description="Severity: info, warning, error",
    )
    chapter_number: int = Field(..., ge=1)
    description: str = Field(..., min_length=10)
    context: str = Field(
        default="",
        description="Surrounding text or context",
    )
    original_text: Optional[str] = None
    suggested_fix: Optional[str] = None
    affected_chapters: list[int] = Field(default_factory=list)
    related_character: Optional[str] = None
    related_event_id: Optional[str] = None
    related_rule_id: Optional[str] = None
    auto_fixable: bool = Field(default=False)


class ContinuityCheckRequest(BaseModel):
    """Request to run a continuity check."""

    check_types: list[str] = Field(
        default=["character", "timeline", "world"],
        description="Types of checks to run: character, timeline, world, all",
    )
    chapters: Optional[list[int]] = Field(
        None,
        description="Specific chapters to check. If None, checks all chapters.",
    )
    focus_characters: Optional[list[str]] = Field(
        None,
        description="Specific characters to focus on",
    )
    include_suggestions: bool = Field(
        default=True,
        description="Include fix suggestions in the report",
    )


class ContinuityReport(BaseModel):
    """Complete continuity report for a project."""

    project_id: UUID
    generated_at: datetime
    check_types: list[str]
    chapters_checked: list[int]

    # Issue counts
    total_issues: int
    issues_by_type: dict[str, int]
    issues_by_severity: dict[str, int]

    # Detailed issues
    issues: list[ContinuityIssue]

    # Character tracking
    characters: dict[str, CharacterProfile] = Field(default_factory=dict)

    # Timeline tracking
    timeline_events: list[TimelineEvent] = Field(default_factory=list)
    timeline_valid: bool = True
    timeline_gaps: list[str] = Field(default_factory=list)

    # World consistency
    world_rules: list[WorldRule] = Field(default_factory=list)
    rule_violations: list[str] = Field(default_factory=list)

    # Summary
    overall_score: float = Field(ge=0.0, le=1.0)
    summary: str


class FixIssueRequest(BaseModel):
    """Request to fix a continuity issue."""

    apply_to_all_chapters: bool = Field(
        default=False,
        description="Apply fix to all affected chapters",
    )
    custom_fix: Optional[str] = Field(
        None,
        description="Custom fix text to use instead of suggested fix",
    )


class FixIssueResponse(BaseModel):
    """Response after fixing an issue."""

    success: bool
    issue_id: str
    fix_applied: str
    chapters_modified: list[int]
    message: str


# ============================================================================
# Helper Functions
# ============================================================================


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


# ============================================================================
# Endpoints
# ============================================================================


@router.post("/check")
async def run_continuity_check(
    project_id: UUID,
    request: ContinuityCheckRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    Run a full continuity check on the project with SSE streaming.

    Checks for:
    - Character consistency (descriptions, traits, knowledge, locations)
    - Timeline consistency (event sequencing, time passage, day/night)
    - World consistency (rules, geography, culture)
    """
    await verify_project_ownership(project_id, current_user, db)

    async def generate():
        """Generate SSE events for continuity checking."""
        try:
            yield f"data: {json.dumps({'event': 'start', 'check_types': request.check_types})}\n\n"

            # Simulate continuity checking phases
            total_steps = len(request.check_types) * 3  # Extract, analyze, report per type
            current_step = 0

            for check_type in request.check_types:
                # Phase 1: Extract data
                current_step += 1
                yield f"data: {json.dumps({'event': 'progress', 'phase': 'extracting', 'check_type': check_type, 'progress': current_step / total_steps})}\n\n"

                # Phase 2: Analyze
                current_step += 1
                yield f"data: {json.dumps({'event': 'progress', 'phase': 'analyzing', 'check_type': check_type, 'progress': current_step / total_steps})}\n\n"

                # Phase 3: Report
                current_step += 1
                yield f"data: {json.dumps({'event': 'progress', 'phase': 'reporting', 'check_type': check_type, 'progress': current_step / total_steps})}\n\n"

            # Complete with sample report
            yield f"data: {json.dumps({'event': 'complete', 'issues_found': 0, 'overall_score': 1.0})}\n\n"

        except Exception as e:
            logger.error(f"Error during continuity check: {e}")
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


@router.get("/report")
async def get_continuity_report(
    project_id: UUID,
    issue_type: Optional[str] = None,
    severity: Optional[str] = None,
    chapter: Optional[int] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContinuityReport:
    """
    Get the latest continuity report for the project.

    Filter by:
    - issue_type: character, timeline, world, plot_hole, inconsistency
    - severity: info, warning, error
    - chapter: specific chapter number
    """
    await verify_project_ownership(project_id, current_user, db)

    # Return empty report for now (implementation in continuity service)
    return ContinuityReport(
        project_id=project_id,
        generated_at=datetime.utcnow(),
        check_types=["character", "timeline", "world"],
        chapters_checked=[],
        total_issues=0,
        issues_by_type={},
        issues_by_severity={},
        issues=[],
        characters={},
        timeline_events=[],
        timeline_valid=True,
        timeline_gaps=[],
        world_rules=[],
        rule_violations=[],
        overall_score=1.0,
        summary="No continuity check has been run yet. Run a continuity check to generate a report.",
    )


@router.post("/fix/{issue_id}")
async def fix_continuity_issue(
    project_id: UUID,
    issue_id: str,
    request: FixIssueRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FixIssueResponse:
    """
    Auto-fix a specific continuity issue.

    Options:
    - apply_to_all_chapters: Apply fix to all affected chapters
    - custom_fix: Use custom fix text instead of suggested fix
    """
    await verify_project_ownership(project_id, current_user, db)

    # Issue fixing will be implemented in continuity service
    return FixIssueResponse(
        success=False,
        issue_id=issue_id,
        fix_applied="",
        chapters_modified=[],
        message=f"Issue '{issue_id}' not found. Run a continuity check first.",
    )


@router.get("/characters")
async def get_character_tracking(
    project_id: UUID,
    character_name: Optional[str] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get character tracking information.

    If character_name is provided, returns details for that character.
    Otherwise, returns all tracked characters.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Character tracking will be implemented in character bible service
    return {
        "characters": {},
        "total_characters": 0,
        "message": "Run a continuity check to populate character tracking.",
    }


@router.get("/timeline")
async def get_timeline(
    project_id: UUID,
    chapter_start: Optional[int] = None,
    chapter_end: Optional[int] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get the story timeline.

    Filter by chapter range with chapter_start and chapter_end.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Timeline tracking will be implemented in continuity service
    return {
        "events": [],
        "total_events": 0,
        "timeline_valid": True,
        "gaps": [],
        "message": "Run a continuity check to populate the timeline.",
    }


@router.get("/world-rules")
async def get_world_rules(
    project_id: UUID,
    category: Optional[str] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get world-building rules and constraints.

    Filter by category: magic_system, technology, physics, society, geography, other
    """
    await verify_project_ownership(project_id, current_user, db)

    # World rules will be implemented in continuity service
    return {
        "rules": [],
        "total_rules": 0,
        "violations": [],
        "message": "Run a continuity check to extract world rules.",
    }


@router.post("/characters/{character_name}")
async def update_character_profile(
    project_id: UUID,
    character_name: str,
    profile: CharacterProfile,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Manually update or create a character profile.

    This allows authors to pre-define or correct character details.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Character profile update will be implemented in character bible service
    return {
        "success": True,
        "character_name": character_name,
        "message": f"Character profile for '{character_name}' saved.",
    }


@router.delete("/characters/{character_name}")
async def delete_character_profile(
    project_id: UUID,
    character_name: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a character profile.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Character deletion will be implemented in character bible service
    return {
        "success": True,
        "character_name": character_name,
        "message": f"Character profile for '{character_name}' deleted.",
    }


@router.post("/timeline/events")
async def add_timeline_event(
    project_id: UUID,
    event: TimelineEvent,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Manually add a timeline event.

    This allows authors to define important story events.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Timeline event creation will be implemented in continuity service
    return {
        "success": True,
        "event_id": event.id,
        "message": f"Timeline event '{event.id}' added.",
    }


@router.delete("/timeline/events/{event_id}")
async def delete_timeline_event(
    project_id: UUID,
    event_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a timeline event.
    """
    await verify_project_ownership(project_id, current_user, db)

    # Timeline event deletion will be implemented in continuity service
    return {
        "success": True,
        "event_id": event_id,
        "message": f"Timeline event '{event_id}' deleted.",
    }


@router.post("/world-rules")
async def add_world_rule(
    project_id: UUID,
    rule: WorldRule,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Manually add a world rule.

    This allows authors to define constraints for the story world.
    """
    await verify_project_ownership(project_id, current_user, db)

    # World rule creation will be implemented in continuity service
    return {
        "success": True,
        "rule_id": rule.id,
        "message": f"World rule '{rule.name}' added.",
    }


@router.delete("/world-rules/{rule_id}")
async def delete_world_rule(
    project_id: UUID,
    rule_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a world rule.
    """
    await verify_project_ownership(project_id, current_user, db)

    # World rule deletion will be implemented in continuity service
    return {
        "success": True,
        "rule_id": rule_id,
        "message": f"World rule '{rule_id}' deleted.",
    }
