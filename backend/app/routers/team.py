"""Team Agents API endpoints.

Provides endpoints for starting, monitoring, and controlling
team agent runs for book generation.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from ..agents.config_loader import ConfigLoader
from ..agents.context_manager import ContextManager
from ..agents.orchestrator import BookPipeline
from ..agents.team_lead import TeamLead
from ..cache import cache
from ..db import get_db
from ..models import Cost, Project, Session, TeamRun, TeamTask
from ..schemas_team import (
    TeamMessageListResponse,
    TeamMessageResponse,
    TeamRunRequest,
    TeamRunResponse,
    TeamTaskListResponse,
    TeamTaskResponse,
)
from ..security import TokenData, get_current_user
from ..services.message_bus import MessageBus
from ..services.quality_gate_service import QualityGateService
from ..services.task_manager import TaskManager

router = APIRouter(prefix="/projects/{project_id}/team", tags=["team"])

logger = logging.getLogger(__name__)


def _sanitize_log(value: object, max_len: int = 200) -> str:
    """Sanitize a value for safe logging (prevent log injection)."""
    s = str(value).replace("\n", "\\n").replace("\r", "\\r")
    if len(s) > max_len:
        return s[:max_len] + "..."
    return s


@router.post("/start", response_model=TeamRunResponse, status_code=status.HTTP_201_CREATED)
async def start_team_run(
    project_id: UUID,
    request_body: TeamRunRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
):
    """Start a new team agent run for a project.

    Creates a TeamRun, builds the task dependency graph, and begins
    background execution. Use the SSE stream endpoint to monitor progress.
    """
    # Verify project exists and belongs to user
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == UUID(user.user_id),
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error_code": "PROJECT_NOT_FOUND", "message": "Project not found"},
        )

    if not project.brief:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error_code": "MISSING_BRIEF",
                "message": "Project must have a brief before starting team generation",
            },
        )

    # Sanitize style_guide input (strip control characters)
    sanitized_style_guide = request_body.style_guide
    if sanitized_style_guide:
        sanitized_style_guide = sanitized_style_guide.strip()

    # Create a session for this run
    session = Session(
        id=uuid4(),
        project_id=project_id,
        user_id=UUID(user.user_id),
        context={"team_run": True},
    )
    db.add(session)

    # Create the team run
    team_run = TeamRun(
        id=uuid4(),
        project_id=project_id,
        session_id=session.id,
        status="pending",
        config={
            "num_chapters": request_body.num_chapters,
            "style_guide": sanitized_style_guide,
            "max_parallel": request_body.max_parallel,
            "skip_editing": request_body.skip_editing,
            "skip_continuity": request_body.skip_continuity,
            "model": request_body.model,
        },
    )
    db.add(team_run)

    # Initialize services and create task graph
    task_manager = TaskManager(db, cache)
    tasks = await task_manager.create_task_graph(
        team_run.id,
        team_run.config,
    )

    team_run.status = "running"
    team_run.started_at = datetime.now(timezone.utc)
    await db.commit()

    return TeamRunResponse(
        team_run_id=team_run.id,
        project_id=project_id,
        total_tasks=len(tasks),
        status="running",
        created_at=team_run.created_at,
    )


@router.get("/{run_id}/stream")
async def stream_team_progress(
    project_id: UUID,
    run_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
):
    """SSE stream of team progress events.

    Connects to the running team and streams progress events in real-time.
    Events include task claims, completions, failures, retries, and overall progress.
    """
    # Verify run exists
    result = await db.execute(
        select(TeamRun).where(
            TeamRun.id == run_id,
            TeamRun.project_id == project_id,
        )
    )
    team_run = result.scalar_one_or_none()
    if not team_run:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error_code": "RUN_NOT_FOUND", "message": "Team run not found"},
        )

    # Verify project belongs to user
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == UUID(user.user_id),
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error_code": "PROJECT_NOT_FOUND", "message": "Project not found"},
        )

    async def event_generator() -> AsyncIterator[dict]:
        """Generate SSE events from the team lead execution."""
        # Initialize all services
        task_manager = TaskManager(db, cache)
        message_bus = MessageBus(db, cache)
        context_manager = ContextManager(cache)
        quality_gate = QualityGateService()
        # Load agent definitions and skills from .claude/ directories
        project_root = str(Path(__file__).parent.parent.parent.parent)
        config_loader = ConfigLoader(project_root=project_root)
        pipeline = BookPipeline(
            model=team_run.config.get("model"),
            config_loader=config_loader,
        )

        team_lead = TeamLead(
            pipeline=pipeline,
            task_manager=task_manager,
            message_bus=message_bus,
            context_manager=context_manager,
            quality_gate=quality_gate,
            db=db,
            redis=cache,
        )

        config = team_run.config or {}
        try:
            async for event in team_lead.run_team(
                team_run_id=run_id,
                brief=project.brief or "",
                num_chapters=config.get("num_chapters", 10),
                style_guide=config.get("style_guide", ""),
                max_parallel=config.get("max_parallel", 3),
                skip_editing=config.get("skip_editing", False),
                skip_continuity=config.get("skip_continuity", False),
            ):
                if await request.is_disconnected():
                    logger.info(f"Client disconnected from team stream {_sanitize_log(run_id)}")
                    break

                yield {
                    "event": event.event_type,
                    "data": event.to_sse_data(),
                }

            # Mark run as completed
            stmt = (
                update(TeamRun)
                .where(TeamRun.id == run_id)
                .values(status="completed", completed_at=datetime.now(timezone.utc))
            )
            await db.execute(stmt)
            await db.commit()

        except Exception as e:
            logger.error(f"Team stream error for run {run_id}: {_sanitize_log(e)}")
            yield {
                "event": "error",
                "data": json.dumps({"error": _sanitize_log(e)}),
            }
            # Mark run as failed
            stmt = (
                update(TeamRun)
                .where(TeamRun.id == run_id)
                .values(status="failed", completed_at=datetime.now(timezone.utc))
            )
            await db.execute(stmt)
            await db.commit()

        finally:
            # Cleanup
            try:
                await team_lead.cleanup(run_id)
            except Exception as cleanup_err:
                logger.warning(f"Cleanup error for run {run_id}: {_sanitize_log(cleanup_err)}")

    return EventSourceResponse(
        event_generator(),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{run_id}/tasks", response_model=TeamTaskListResponse)
async def get_team_tasks(
    project_id: UUID,
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
):
    """Get all tasks for a team run with their current status."""
    # Verify access
    result = await db.execute(
        select(TeamRun).where(
            TeamRun.id == run_id,
            TeamRun.project_id == project_id,
        )
    )
    team_run = result.scalar_one_or_none()
    if not team_run:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error_code": "RUN_NOT_FOUND", "message": "Team run not found"},
        )

    task_manager = TaskManager(db, cache)
    tasks = await task_manager.get_all_tasks(run_id)
    progress = await task_manager.get_run_progress(run_id)

    task_responses = [
        TeamTaskResponse(
            id=t.id,
            task_type=t.task_type,
            title=t.title,
            description=t.description,
            status=t.status,
            assigned_agent=t.assigned_agent,
            chapter_number=t.chapter_number,
            dependencies=[str(d) for d in (list(t.dependencies) if t.dependencies else [])],
            quality_score=float(t.quality_score) if t.quality_score else None,
            retry_count=t.retry_count or 0,
            claimed_at=t.claimed_at,
            started_at=t.started_at,
            completed_at=t.completed_at,
            created_at=t.created_at,
        )
        for t in tasks
    ]

    return TeamTaskListResponse(
        team_run_id=run_id,
        tasks=task_responses,
        total=progress["total"],
        completed=progress["completed"],
        failed=progress["failed"],
        in_progress=progress.get("in_progress", 0),
    )


@router.get("/{run_id}/messages", response_model=TeamMessageListResponse)
async def get_team_messages(
    project_id: UUID,
    run_id: UUID,
    from_agent: Optional[str] = Query(None),
    to_agent: Optional[str] = Query(None),
    message_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
):
    """Get inter-agent messages for a team run with optional filters."""
    # Verify access
    result = await db.execute(
        select(TeamRun).where(
            TeamRun.id == run_id,
            TeamRun.project_id == project_id,
        )
    )
    if not result.scalar_one_or_none():
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error_code": "RUN_NOT_FOUND", "message": "Team run not found"},
        )

    message_bus = MessageBus(db, cache)
    messages, total = await message_bus.get_messages(
        team_run_id=run_id,
        from_agent=from_agent,
        to_agent=to_agent,
        message_type=message_type,
        limit=limit,
        offset=offset,
    )

    return TeamMessageListResponse(
        team_run_id=run_id,
        messages=[
            TeamMessageResponse(
                id=m.id,
                from_agent=m.from_agent,
                to_agent=m.to_agent,
                message_type=m.message_type,
                content=m.content,
                task_id=m.task_id,
                created_at=m.created_at,
            )
            for m in messages
        ],
        total=total,
    )


@router.post("/{run_id}/pause")
async def pause_team_run(
    project_id: UUID,
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
):
    """Pause a running team. Currently running tasks will complete but no new tasks start."""
    result = await db.execute(
        select(TeamRun).where(
            TeamRun.id == run_id,
            TeamRun.project_id == project_id,
        )
    )
    team_run = result.scalar_one_or_none()
    if not team_run:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error_code": "RUN_NOT_FOUND", "message": "Team run not found"},
        )

    if team_run.status != "running":
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error_code": "INVALID_STATE", "message": "Run is not currently running"},
        )

    team_run.status = "paused"
    state_key = f"team:{run_id}:state"
    await cache.redis.hset(state_key, "status", "paused")  # type: ignore[misc]
    await db.commit()

    return {"status": "paused", "team_run_id": str(run_id)}


@router.post("/{run_id}/resume")
async def resume_team_run(
    project_id: UUID,
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
):
    """Resume a paused team run."""
    result = await db.execute(
        select(TeamRun).where(
            TeamRun.id == run_id,
            TeamRun.project_id == project_id,
        )
    )
    team_run = result.scalar_one_or_none()
    if not team_run:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error_code": "RUN_NOT_FOUND", "message": "Team run not found"},
        )

    if team_run.status != "paused":
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error_code": "INVALID_STATE", "message": "Run is not paused"},
        )

    team_run.status = "running"
    state_key = f"team:{run_id}:state"
    await cache.redis.hset(state_key, "status", "running")  # type: ignore[misc]
    await db.commit()

    return {"status": "running", "team_run_id": str(run_id)}


@router.post("/{run_id}/cancel")
async def cancel_team_run(
    project_id: UUID,
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
):
    """Cancel a team run. Running tasks will complete but pending tasks are cancelled."""
    result = await db.execute(
        select(TeamRun).where(
            TeamRun.id == run_id,
            TeamRun.project_id == project_id,
        )
    )
    team_run = result.scalar_one_or_none()
    if not team_run:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error_code": "RUN_NOT_FOUND", "message": "Team run not found"},
        )

    if team_run.status in ("completed", "cancelled", "failed"):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error_code": "INVALID_STATE", "message": f"Run is already {team_run.status}"},
        )

    # Cancel all pending/blocked/ready tasks
    stmt = (
        update(TeamTask)
        .where(
            TeamTask.team_run_id == run_id,
            TeamTask.status.in_(["pending", "blocked", "ready"]),
        )
        .values(status="failed", output_result={"error": "Run cancelled"})
    )
    await db.execute(stmt)

    team_run.status = "cancelled"
    team_run.completed_at = datetime.now(timezone.utc)
    state_key = f"team:{run_id}:state"
    await cache.redis.hset(state_key, "status", "cancelled")  # type: ignore[misc]
    await db.commit()

    return {"status": "cancelled", "team_run_id": str(run_id)}


@router.get("/{run_id}/costs")
async def get_team_costs(
    project_id: UUID,
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
):
    """Get cost breakdown for a team run by agent and task."""
    result = await db.execute(
        select(TeamRun).where(
            TeamRun.id == run_id,
            TeamRun.project_id == project_id,
        )
    )
    team_run = result.scalar_one_or_none()
    if not team_run:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error_code": "RUN_NOT_FOUND", "message": "Team run not found"},
        )

    # Get costs for the session associated with this run
    cost_result = await db.execute(select(Cost).where(Cost.session_id == team_run.session_id))
    costs = cost_result.scalars().all()

    # Aggregate by agent
    by_agent: dict[str, dict] = {}
    total_usd = 0.0
    total_tokens = 0

    for cost in costs:
        agent = cost.agent or "unknown"
        if agent not in by_agent:
            by_agent[agent] = {"usd": 0.0, "prompt_tokens": 0, "completion_tokens": 0}
        by_agent[agent]["usd"] += float(cost.usd or 0)
        by_agent[agent]["prompt_tokens"] += cost.prompt_tokens or 0
        by_agent[agent]["completion_tokens"] += cost.completion_tokens or 0
        total_usd += float(cost.usd or 0)
        total_tokens += (cost.prompt_tokens or 0) + (cost.completion_tokens or 0)

    return {
        "team_run_id": str(run_id),
        "total_usd": total_usd,
        "total_tokens": total_tokens,
        "by_agent": by_agent,
    }
