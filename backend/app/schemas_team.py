"""Pydantic schemas for Team Agents API request/response."""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .config import DEFAULT_MODEL, SUPPORTED_MODELS_SET

# ============================================================================
# Agent Role Constants
# ============================================================================

AGENT_ROLES = [
    "concept_generator",
    "outliner",
    "writer",
    "editor",
    "continuity_checker",
]

TASK_TYPES = [
    "concept",
    "outline",
    "write_chapter",
    "edit_chapter",
    "continuity_check",
]

MESSAGE_TYPES = [
    "context_share",
    "style_note",
    "issue_report",
    "correction_request",
    "quality_feedback",
    "dependency_resolved",
    "status_update",
]


# ============================================================================
# Request Schemas
# ============================================================================


class TeamRunRequest(BaseModel):
    """Request to start a team agent run."""

    num_chapters: int = Field(default=10, ge=1, le=50)
    style_guide: Optional[str] = Field(None, max_length=5000)
    max_parallel: int = Field(
        default=3, ge=1, le=5, description="Maximum concurrent writer/editor agents"
    )
    skip_editing: bool = False
    skip_continuity: bool = False
    model: str = Field(default=DEFAULT_MODEL, description="Primary LLM model to use")

    @field_validator("model")
    @classmethod
    def validate_model(cls, v: str) -> str:
        """Validate that the model is supported."""
        if v.startswith("openrouter/"):
            return v
        if v not in SUPPORTED_MODELS_SET:
            supported = sorted(SUPPORTED_MODELS_SET)
            raise ValueError(f"Unsupported model: {v}. Supported models: {supported}")
        return v


# ============================================================================
# Response Schemas
# ============================================================================


class TeamRunResponse(BaseModel):
    """Response after starting a team run."""

    model_config = ConfigDict(from_attributes=True)

    team_run_id: UUID
    project_id: UUID
    total_tasks: int
    status: str
    created_at: datetime


class TeamTaskResponse(BaseModel):
    """Response for a single team task."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    task_type: str
    title: str
    description: Optional[str] = None
    status: str
    assigned_agent: Optional[str] = None
    chapter_number: Optional[int] = None
    dependencies: List[str] = Field(default_factory=list)
    quality_score: Optional[float] = None
    retry_count: int = 0
    claimed_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


class TeamTaskListResponse(BaseModel):
    """Response for listing all tasks in a team run."""

    team_run_id: UUID
    tasks: List[TeamTaskResponse]
    total: int
    completed: int
    failed: int
    in_progress: int


class TeamMessageResponse(BaseModel):
    """Response for a single inter-agent message."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    from_agent: str
    to_agent: Optional[str] = None
    message_type: str
    content: Dict[str, Any]
    task_id: Optional[UUID] = None
    created_at: datetime


class TeamMessageListResponse(BaseModel):
    """Response for listing messages."""

    team_run_id: UUID
    messages: List[TeamMessageResponse]
    total: int


class TeamCostBreakdown(BaseModel):
    """Cost breakdown for a team run."""

    team_run_id: UUID
    total_usd: float
    total_tokens: int
    by_agent: Dict[str, Dict[str, Any]]
    by_task: List[Dict[str, Any]]


# ============================================================================
# SSE Event Schemas
# ============================================================================


class TeamProgressSSE(BaseModel):
    """SSE event for team progress streaming."""

    event_type: Literal[
        "team_started",
        "task_claimed",
        "task_in_progress",
        "task_completed",
        "task_failed",
        "task_retry",
        "task_unblocked",
        "progress_update",
        "message_sent",
        "team_completed",
        "team_failed",
        "error",
    ]
    team_run_id: Optional[str] = None
    task_id: Optional[str] = None
    agent: Optional[str] = None
    chapter_number: Optional[int] = None
    progress: Optional[float] = Field(None, ge=0.0, le=1.0)
    total_tasks: Optional[int] = None
    completed_tasks: Optional[int] = None
    failed_tasks: Optional[int] = None
    quality_score: Optional[float] = None
    error: Optional[str] = None
    message: Optional[str] = None
