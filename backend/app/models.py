"""Database models for sopher.ai"""

from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, LargeBinary, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class User(Base):
    """User represents an authenticated user"""

    __tablename__ = "users"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(Text, nullable=False, unique=True, index=True)
    name = Column(Text)
    picture = Column(Text)
    provider = Column(Text, nullable=False, default="google")  # Currently only Google
    provider_sub = Column(Text, nullable=False, unique=True)  # Google 'sub' claim
    role = Column(Text, nullable=False, default="author")
    monthly_budget_usd = Column(Numeric(10, 2), default=100.00)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Project(Base):
    """Project represents a book writing project"""

    __tablename__ = "projects"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(Text, nullable=False)
    description = Column(Text)
    brief = Column(Text)  # The creative brief for the book
    genre = Column(Text)
    target_chapters = Column(Integer, default=10)
    style_guide = Column(Text)
    settings = Column(JSONB, default={})
    status = Column(Text, default="draft")  # draft, in_progress, completed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")
    sessions = relationship("Session", back_populates="project", cascade="all, delete-orphan")

    __table_args__ = (Index("idx_project_user_id", "user_id"),)


class Session(Base):
    """Session represents a writing session within a project"""

    __tablename__ = "sessions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    project_id = Column(PGUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    context = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="sessions")
    user = relationship("User")
    events = relationship("Event", back_populates="session", cascade="all, delete-orphan")
    artifacts = relationship("Artifact", back_populates="session", cascade="all, delete-orphan")
    costs = relationship("Cost", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_session_project_created", "project_id", "created_at"),
        Index("idx_session_user_id", "user_id"),
    )


class Event(Base):
    """Event represents an action or state change in the system"""

    __tablename__ = "events"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id = Column(PGUUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    type = Column(Text, nullable=False)  # outline_start, chapter_draft, edit, etc.
    payload = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("Session", back_populates="events")

    __table_args__ = (Index("idx_event_session_created", "session_id", "created_at"),)


class Artifact(Base):
    """Artifact represents generated content (outlines, chapters, etc.)"""

    __tablename__ = "artifacts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id = Column(PGUUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    kind = Column(Text, nullable=False)  # outline, chapter, manuscript, etc.
    path = Column(Text)  # storage path if applicable
    meta = Column(JSONB, default={})
    blob = Column(LargeBinary)  # for small content, larger goes to object storage
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("Session", back_populates="artifacts")

    __table_args__ = (Index("idx_artifact_session_kind", "session_id", "kind"),)


class Cost(Base):
    """Cost tracks token usage and costs per agent/session"""

    __tablename__ = "costs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id = Column(PGUUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    agent = Column(Text, nullable=False)  # writer, editor, etc.
    model = Column(Text)  # anthropic/claude-sonnet-4.5, anthropic/claude-opus-4.6, etc.
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    usd = Column(Numeric(10, 6), default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("Session", back_populates="costs")

    __table_args__ = (
        Index("idx_cost_session_created", "session_id", "created_at"),
        Index("idx_cost_agent", "agent"),
    )


class Suggestion(Base):
    """Suggestion tracks edit suggestions for chapters"""

    __tablename__ = "suggestions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    project_id = Column(PGUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    chapter_number = Column(Integer, nullable=False)
    pass_type = Column(Text, nullable=False)  # structural, line, copy, proofread
    suggestion_type = Column(Text, nullable=False)  # pacing, grammar, spelling, etc.
    severity = Column(Text, nullable=False, default="info")  # info, warning, error
    original_text = Column(Text, default="")
    suggested_text = Column(Text, default="")
    start_position = Column(Integer, default=0)
    end_position = Column(Integer, default=0)
    explanation = Column(Text, nullable=False)
    confidence = Column(Numeric(3, 2), default=0.5)
    status = Column(Text, default="pending")  # pending, applied, rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship("Project")

    __table_args__ = (
        Index("idx_suggestion_project_chapter", "project_id", "chapter_number"),
        Index("idx_suggestion_status", "status"),
    )


class EditHistory(Base):
    """EditHistory tracks editing sessions for chapters"""

    __tablename__ = "edit_history"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    project_id = Column(PGUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    chapter_number = Column(Integer, nullable=False)
    pass_type = Column(Text, nullable=False)  # structural, line, copy, proofread
    suggestions_generated = Column(Integer, default=0)
    suggestions_applied = Column(Integer, default=0)
    suggestions_rejected = Column(Integer, default=0)
    content_before = Column(Text)  # Original content before edits
    content_after = Column(Text)  # Content after edits applied
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project")

    __table_args__ = (Index("idx_edit_history_project_chapter", "project_id", "chapter_number"),)


# ============================================================================
# Team Agents Models
# ============================================================================


class TeamRun(Base):
    """Represents a single team agent execution run for a project."""

    __tablename__ = "team_runs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    project_id = Column(PGUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    session_id = Column(PGUUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    status = Column(Text, nullable=False, default="pending")
    # pending, running, paused, completed, failed, cancelled
    config = Column(JSONB, default={})
    # Stores: max_parallel, skip_editing, skip_continuity, num_chapters, etc.
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project")
    session = relationship("Session")
    tasks = relationship("TeamTask", back_populates="team_run", cascade="all, delete-orphan")
    messages = relationship(
        "TeamMessage",
        back_populates="team_run",
        cascade="all, delete-orphan",
        foreign_keys="TeamMessage.team_run_id",
    )

    __table_args__ = (
        Index("idx_team_run_project", "project_id"),
        Index("idx_team_run_status", "status"),
    )


class TeamTask(Base):
    """A single task in a team run's shared task list."""

    __tablename__ = "team_tasks"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    team_run_id = Column(PGUUID(as_uuid=True), ForeignKey("team_runs.id"), nullable=False)
    task_type = Column(Text, nullable=False)
    # concept, outline, write_chapter, edit_chapter, continuity_check
    title = Column(Text, nullable=False)
    description = Column(Text)
    status = Column(Text, nullable=False, default="pending")
    # pending, blocked, ready, claimed, in_progress, completed, failed
    assigned_agent = Column(Text)
    # concept_generator, outliner, writer, editor, continuity_checker
    priority = Column(Integer, default=0)  # Higher = more urgent
    chapter_number = Column(Integer)  # NULL for non-chapter tasks
    dependencies = Column(JSONB, default=[])
    # List of task UUIDs that must complete before this task is ready
    input_context = Column(JSONB, default={})
    # Context provided to the agent (compressed/summarized)
    output_result = Column(JSONB, default={})
    # Result after completion (artifact_id, summary, metadata)
    quality_score = Column(Numeric(3, 2))
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=2)
    claimed_at = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    team_run = relationship("TeamRun", back_populates="tasks")
    task_messages = relationship("TeamMessage", back_populates="task", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_team_task_run_status", "team_run_id", "status"),
        Index("idx_team_task_type", "task_type"),
        Index("idx_team_task_chapter", "team_run_id", "chapter_number"),
    )


class TeamMessage(Base):
    """Message between agents in a team run."""

    __tablename__ = "team_messages"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    team_run_id = Column(PGUUID(as_uuid=True), ForeignKey("team_runs.id"), nullable=False)
    task_id = Column(PGUUID(as_uuid=True), ForeignKey("team_tasks.id"), nullable=True)
    # NULL for broadcast messages not tied to a specific task
    from_agent = Column(Text, nullable=False)
    # team_lead, concept_generator, outliner, writer, editor, continuity_checker
    to_agent = Column(Text)
    # NULL = broadcast to all agents; otherwise target agent role
    message_type = Column(Text, nullable=False)
    # context_share, style_note, issue_report, correction_request,
    # quality_feedback, dependency_resolved, status_update
    content = Column(JSONB, nullable=False)
    # Structured content: {"summary": "...", "details": {...}, "priority": "high"}
    read_by = Column(JSONB, default=[])
    # List of agent roles that have consumed this message
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    team_run = relationship("TeamRun", back_populates="messages")
    task = relationship("TeamTask", back_populates="task_messages")

    __table_args__ = (
        Index("idx_team_message_run_agent", "team_run_id", "to_agent"),
        Index("idx_team_message_run_created", "team_run_id", "created_at"),
    )
