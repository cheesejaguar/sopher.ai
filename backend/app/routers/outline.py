"""Outline generation endpoint with SSE streaming"""

import asyncio
import hashlib
import json
import logging
import os
import time
from datetime import datetime
from typing import AsyncIterator, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Request, Response, status
from litellm import acompletion
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from ..agents import BookWritingAgents
from ..cache import cache
from ..config import DEFAULT_MODEL
from ..db import get_db
from ..errors import ErrorCode, api_error
from ..metrics import MetricsTracker, active_sessions
from ..models import Artifact, Cost, Event, Project, Session, User
from ..pricing import calculate_cost_usd
from ..schemas import BookOutline, OutlineRequest, OutlineRevision
from ..security import TokenData, get_current_user

# Maximum stream duration in seconds (30 minutes default)
STREAM_TIMEOUT_SECONDS = int(os.getenv("STREAM_TIMEOUT_SECONDS", "1800"))


def check_stream_timeout(start_time: float, timeout: int = STREAM_TIMEOUT_SECONDS) -> bool:
    """Check if stream has exceeded timeout. Returns True if timed out."""
    elapsed = asyncio.get_event_loop().time() - start_time
    return elapsed > timeout


router = APIRouter(prefix="/projects/{project_id}", tags=["outline"])

logger = logging.getLogger(__name__)


async def event_generator(
    request: Request,
    project_id: UUID,
    outline_request: OutlineRequest,
    session: Session,
    db: AsyncSession,
    user: TokenData,
) -> AsyncIterator[dict]:
    """Generate SSE events for outline streaming"""

    active_sessions.inc()
    start_time = time.perf_counter()
    tokens_emitted = 0
    model = outline_request.model
    stream_start = asyncio.get_event_loop().time()

    try:
        # Check cache
        cache_key = cache.cache_key(
            "outline",
            str(project_id),
            outline_request.model,
            hashlib.md5(outline_request.brief.encode()).hexdigest(),
        )

        cached_result = await cache.get(cache_key)
        if cached_result:
            MetricsTracker.track_cache(hit=True, cache_type="outline")
            yield {
                "event": "checkpoint",
                "data": json.dumps({"source": "cache", "content": cached_result}),
            }
            yield {"event": "complete", "data": json.dumps({"cached": True, "tokens": 0})}
            return

        MetricsTracker.track_cache(hit=False, cache_type="outline")

        # Create outline generation prompt
        agents = BookWritingAgents(model=model)

        # First, generate concepts
        yield {
            "event": "checkpoint",
            "data": json.dumps({"stage": "generating_concepts", "progress": 0.1}),
        }

        concepts = await agents.generate_concepts(brief=outline_request.brief, plot_seeds=None)

        yield {
            "event": "checkpoint",
            "data": json.dumps({"stage": "concepts_complete", "progress": 0.3}),
        }

        # Stream outline generation
        with MetricsTracker.track_inference(model, "outliner", "outline_generation"):

            prompt = f"""Create a detailed {outline_request.target_chapters}-chapter book outline.

Brief: {outline_request.brief}

Style Guide: {outline_request.style_guide or 'Standard narrative structure'}

Genre: {outline_request.genre or 'General fiction'}

Concepts: {json.dumps(concepts)}

Provide a comprehensive outline with:
1. Book title and subtitle
2. Target audience and themes
3. Chapter-by-chapter breakdown including:
   - Chapter number and title
   - Key events and plot points
   - Character development
   - Scene settings
   - Emotional beats
   - Cliffhangers/hooks
   - Estimated word count (3000-5000 per chapter)

Format as structured markdown."""

            # Stream tokens from LLM
            stream = await acompletion(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
                max_tokens=4096,
                temperature=0.7,
            )

            buffer = []
            checkpoint_counter = 0

            async for chunk in stream:
                if await request.is_disconnected():
                    break

                # Check for stream timeout
                if check_stream_timeout(stream_start):
                    logger.warning(f"Stream timeout for project {project_id}")
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": "Stream timeout exceeded"}),
                    }
                    break

                choice = chunk.get("choices", [{}])[0]
                delta = choice.get("delta", {})
                content = delta.get("content", "")

                if content:
                    tokens_emitted += 1
                    buffer.append(content)

                    # Send token event
                    yield {"event": "token", "data": content}

                    # Send checkpoint every 100 tokens
                    if tokens_emitted % 100 == 0:
                        checkpoint_counter += 1
                        progress = min(0.3 + (tokens_emitted / 4000) * 0.6, 0.9)
                        yield {
                            "event": "checkpoint",
                            "data": json.dumps(
                                {
                                    "checkpoint": checkpoint_counter,
                                    "tokens": tokens_emitted,
                                    "progress": progress,
                                    "preview": "".join(buffer[-500:]),
                                }
                            ),
                        }

                # Get usage info if available
                if chunk.get("usage"):
                    usage = chunk["usage"]
                    prompt_tokens = usage.get("prompt_tokens", 0)
                    completion_tokens = usage.get("completion_tokens", 0)

                    # Track metrics
                    MetricsTracker.track_tokens(
                        model=model,
                        agent="outliner",
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                    )

                    # Calculate cost using pricing module
                    total_cost = calculate_cost_usd(model, prompt_tokens, completion_tokens)

                    MetricsTracker.track_cost(model, "outliner", total_cost)

                    # Save cost to database
                    cost_record = Cost(
                        session_id=session.id,
                        agent="outliner",
                        model=model,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        usd=total_cost,
                    )
                    db.add(cost_record)

        # Final outline
        final_outline = "".join(buffer)

        # Save to cache
        await cache.set(cache_key, final_outline, ttl=3600)

        # Save artifact to database
        artifact = Artifact(
            session_id=session.id,
            kind="outline",
            meta={
                "brief": outline_request.brief,
                "chapters": outline_request.target_chapters,
                "tokens": tokens_emitted,
            },
            blob=final_outline.encode(),
        )
        db.add(artifact)

        # Log event
        event = Event(
            session_id=session.id,
            type="outline_generated",
            payload={
                "tokens": tokens_emitted,
                "duration": time.perf_counter() - start_time,
                "model": model,
            },
        )
        db.add(event)

        await db.commit()

        # Send completion event
        yield {
            "event": "complete",
            "data": json.dumps(
                {
                    "tokens": tokens_emitted,
                    "duration": time.perf_counter() - start_time,
                    "outline_id": str(artifact.id),
                }
            ),
        }

    except Exception as e:
        MetricsTracker.track_model_error(model, type(e).__name__)
        err_response = api_error(
            ErrorCode.OUTLINE_STREAM_INIT_FAILED.value,
            "Could not start the outline stream.",
            hint="Retry in a few seconds. If it persists, check service readiness or credentials.",
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
        body_bytes = bytes(err_response.body)
        body = body_bytes.decode()
        data = json.loads(body)
        logger.error(
            f"outline stream failed: {e}",
            extra={
                "error_id": data["error_id"],
                "request_id": data["request_id"],
                "error_code": data["error_code"],
                "path": request.url.path,
                "method": request.method,
                "status": status.HTTP_500_INTERNAL_SERVER_ERROR,
            },
        )
        yield {"event": "error", "data": body}
    finally:
        active_sessions.dec()


@router.get("/outline/stream")
async def stream_outline(
    project_id: UUID,
    request: Request,
    brief: str,
    style_guide: Optional[str] = None,
    genre: Optional[str] = None,
    target_chapters: int = 10,
    model: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> Response:
    """Stream outline generation via Server-Sent Events"""

    # Check user's budget before starting with row-level locking
    # Use FOR UPDATE to prevent race conditions between concurrent requests
    user_result = await db.execute(select(User).where(User.id == user.user_id).with_for_update())
    user_record = user_result.scalar_one_or_none()

    if not user_record:
        return api_error(
            ErrorCode.OUTLINE_STREAM_INIT_FAILED.value,
            "User not found.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Get current month's usage within the same transaction
    current_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_usage_result = await db.execute(
        select(func.sum(Cost.usd))
        .join(Session, Cost.session_id == Session.id)
        .where(
            Session.user_id == user.user_id,
            Cost.created_at >= current_month,
        )
    )
    month_usage = month_usage_result.scalar() or 0

    # Check if budget exceeded (lock held until transaction commits)
    if month_usage >= user_record.monthly_budget_usd:
        return api_error(
            "BUDGET_EXCEEDED",
            f"Monthly budget of ${user_record.monthly_budget_usd} exceeded.",
            hint="Please increase your budget or wait for the next billing cycle.",
            details={
                "current_usage": float(month_usage),
                "budget": float(user_record.monthly_budget_usd),
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    # Validate brief length
    if len(brief) < 10 or len(brief) > 10000:
        MetricsTracker.track_api_request(request.method, request.url.path, 422)
        response = api_error(
            ErrorCode.OUTLINE_INVALID_PARAMETER.value,
            "Brief must be between 10 and 10000 characters.",
            hint="Ensure 'brief' is 10-10000 characters.",
            details={"field": "brief"},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
        data = json.loads(response.body)
        logger.error(
            "invalid parameter",
            extra={
                "error_id": data["error_id"],
                "request_id": data["request_id"],
                "error_code": data["error_code"],
                "path": request.url.path,
                "method": request.method,
                "status": status.HTTP_422_UNPROCESSABLE_ENTITY,
            },
        )
        return response

    # Validate target_chapters
    if target_chapters < 1 or target_chapters > 50:
        MetricsTracker.track_api_request(request.method, request.url.path, 422)
        response = api_error(
            ErrorCode.OUTLINE_INVALID_PARAMETER.value,
            "Target chapters must be between 1 and 50.",
            hint="Provide a value between 1 and 50.",
            details={"field": "target_chapters"},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
        data = json.loads(response.body)
        logger.error(
            "invalid parameter",
            extra={
                "error_id": data["error_id"],
                "request_id": data["request_id"],
                "error_code": data["error_code"],
                "path": request.url.path,
                "method": request.method,
                "status": status.HTTP_422_UNPROCESSABLE_ENTITY,
            },
        )
        return response

    # Create outline request from query parameters
    outline_request = OutlineRequest(
        brief=brief,
        style_guide=style_guide,
        genre=genre,
        target_chapters=target_chapters,
        model=model or DEFAULT_MODEL,
    )

    # Create session
    session = Session(
        project_id=project_id,
        user_id=user.user_id,
        context={
            "brief": outline_request.brief,
            "style_guide": outline_request.style_guide,
            "genre": outline_request.genre,
            "target_chapters": outline_request.target_chapters,
            "model": outline_request.model,
        },
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # Track API request
    MetricsTracker.track_api_request(request.method, request.url.path, 200)

    return EventSourceResponse(
        event_generator(
            request=request,
            project_id=project_id,
            outline_request=outline_request,
            session=session,
            db=db,
            user=user,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
        },
    )


@router.get("/outline")
async def get_outline(
    project_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> dict:
    """Get the current outline for a project."""
    # Verify project ownership
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user.user_id,
        )
    )
    project = project_result.scalar_one_or_none()

    if not project:
        MetricsTracker.track_api_request(request.method, request.url.path, 404)
        return api_error(
            ErrorCode.PROJECT_NOT_FOUND.value,
            "Project not found or access denied.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Get the latest outline artifact for this project
    outline_result = await db.execute(
        select(Artifact)
        .join(Session, Artifact.session_id == Session.id)
        .where(
            Session.project_id == project_id,
            Artifact.kind == "outline",
        )
        .order_by(Artifact.created_at.desc())
        .limit(1)
    )
    outline_artifact = outline_result.scalar_one_or_none()

    if not outline_artifact:
        MetricsTracker.track_api_request(request.method, request.url.path, 404)
        return api_error(
            "OUTLINE_NOT_FOUND",
            "No outline found for this project.",
            hint="Generate an outline first using the /outline/stream endpoint.",
            status=status.HTTP_404_NOT_FOUND,
        )

    MetricsTracker.track_api_request(request.method, request.url.path, 200)

    # Return the outline content
    return {
        "id": str(outline_artifact.id),
        "content": outline_artifact.blob.decode() if outline_artifact.blob else None,
        "meta": outline_artifact.meta,
        "created_at": outline_artifact.created_at.isoformat(),
    }


@router.put("/outline")
async def update_outline(
    project_id: UUID,
    request: Request,
    outline_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> dict:
    """Update the outline for a project.

    This endpoint allows users to manually edit the generated outline.
    The outline can be either raw markdown content or a structured BookOutline.
    """
    # Verify project ownership
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user.user_id,
        )
    )
    project = project_result.scalar_one_or_none()

    if not project:
        MetricsTracker.track_api_request(request.method, request.url.path, 404)
        return api_error(
            ErrorCode.PROJECT_NOT_FOUND.value,
            "Project not found or access denied.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Get the content from the request
    content = outline_data.get("content")
    if not content:
        MetricsTracker.track_api_request(request.method, request.url.path, 422)
        return api_error(
            ErrorCode.OUTLINE_INVALID_PARAMETER.value,
            "Outline content is required.",
            hint="Provide 'content' field with the outline text.",
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    # Try to validate as BookOutline if it's structured data
    structured_outline = None
    if isinstance(content, dict):
        try:
            structured_outline = BookOutline(**content)
            content = structured_outline.model_dump_json()
        except ValidationError as e:
            MetricsTracker.track_api_request(request.method, request.url.path, 422)
            return api_error(
                ErrorCode.OUTLINE_INVALID_PARAMETER.value,
                "Invalid outline structure.",
                hint="Ensure the outline matches the BookOutline schema.",
                details={"validation_errors": e.errors()},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

    # Get or create a session for this update
    session_result = await db.execute(
        select(Session)
        .where(Session.project_id == project_id)
        .order_by(Session.created_at.desc())
        .limit(1)
    )
    session = session_result.scalar_one_or_none()

    if not session:
        # Create a new session for this update
        session = Session(
            project_id=project_id,
            user_id=user.user_id,
            context={"action": "outline_update"},
        )
        db.add(session)
        await db.flush()

    # Create new artifact with updated content
    content_bytes = content.encode() if isinstance(content, str) else json.dumps(content).encode()
    artifact = Artifact(
        session_id=session.id,
        kind="outline",
        meta={
            "updated_by_user": True,
            "revision": True,
            "previous_artifact_id": (
                str(outline_data.get("previous_id")) if outline_data.get("previous_id") else None
            ),
        },
        blob=content_bytes,
    )
    db.add(artifact)

    # Log the update event
    event = Event(
        session_id=session.id,
        type="outline_updated",
        payload={
            "artifact_id": str(artifact.id),
            "content_length": len(content_bytes),
        },
    )
    db.add(event)

    await db.commit()
    await db.refresh(artifact)

    MetricsTracker.track_api_request(request.method, request.url.path, 200)

    return {
        "id": str(artifact.id),
        "message": "Outline updated successfully",
        "created_at": artifact.created_at.isoformat(),
    }


@router.post("/outline/revise/stream")
async def revise_outline_stream(
    project_id: UUID,
    request: Request,
    revision: OutlineRevision = Body(...),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> Response:
    """Revise an existing outline based on instructions.

    This endpoint allows AI-assisted revision of an outline while preserving
    specified chapters and making requested changes.
    """
    # Verify project ownership
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user.user_id,
        )
    )
    project = project_result.scalar_one_or_none()

    if not project:
        MetricsTracker.track_api_request(request.method, request.url.path, 404)
        return api_error(
            ErrorCode.PROJECT_NOT_FOUND.value,
            "Project not found or access denied.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Get the current outline
    outline_result = await db.execute(
        select(Artifact)
        .join(Session, Artifact.session_id == Session.id)
        .where(
            Session.project_id == project_id,
            Artifact.kind == "outline",
        )
        .order_by(Artifact.created_at.desc())
        .limit(1)
    )
    current_outline = outline_result.scalar_one_or_none()

    if not current_outline:
        MetricsTracker.track_api_request(request.method, request.url.path, 404)
        return api_error(
            "OUTLINE_NOT_FOUND",
            "No outline found to revise.",
            hint="Generate an outline first using the /outline/stream endpoint.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Create session for revision
    session = Session(
        project_id=project_id,
        user_id=user.user_id,
        context={
            "action": "outline_revision",
            "revision_instructions": revision.revision_instructions,
            "original_outline_id": str(current_outline.id),
        },
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    MetricsTracker.track_api_request(request.method, request.url.path, 200)

    return EventSourceResponse(
        revision_event_generator(
            request=request,
            project_id=project_id,
            revision=revision,
            current_outline=current_outline,
            session=session,
            db=db,
            user=user,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def revision_event_generator(
    request: Request,
    project_id: UUID,
    revision: OutlineRevision,
    current_outline: Artifact,
    session: Session,
    db: AsyncSession,
    user: TokenData,
) -> AsyncIterator[dict]:
    """Generate SSE events for outline revision streaming."""
    active_sessions.inc()
    start_time = time.perf_counter()
    tokens_emitted = 0
    model = DEFAULT_MODEL
    stream_start = asyncio.get_event_loop().time()

    try:
        yield {
            "event": "checkpoint",
            "data": json.dumps({"stage": "analyzing_outline", "progress": 0.1}),
        }

        current_content = current_outline.blob.decode() if current_outline.blob else ""

        # Build revision prompt
        chapters_to_revise_text = ""
        if revision.chapters_to_revise:
            chapters_to_revise_text = f"Focus on revising chapters: {revision.chapters_to_revise}"
        if revision.preserve_chapters:
            chapters_to_revise_text += (
                f"\nKeep these chapters unchanged: {revision.preserve_chapters}"
            )
        if revision.add_chapters:
            chapters_to_revise_text += f"\nAdd {revision.add_chapters} new chapter(s)"
        if revision.remove_chapters:
            chapters_to_revise_text += f"\nRemove chapters: {revision.remove_chapters}"

        prompt = f"""Revise the following book outline based on the instructions provided.

CURRENT OUTLINE:
{current_content}

REVISION INSTRUCTIONS:
{revision.revision_instructions}

{chapters_to_revise_text}

Please provide the complete revised outline maintaining the same format and structure.
Preserve any chapters marked as unchanged. Implement all requested changes.
Format as structured markdown."""

        yield {
            "event": "checkpoint",
            "data": json.dumps({"stage": "generating_revision", "progress": 0.2}),
        }

        with MetricsTracker.track_inference(model, "outliner", "outline_revision"):
            stream = await acompletion(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
                max_tokens=4096,
                temperature=0.7,
            )

            buffer = []
            checkpoint_counter = 0

            async for chunk in stream:
                if await request.is_disconnected():
                    break

                # Check for stream timeout
                if check_stream_timeout(stream_start):
                    logger.warning(f"Stream timeout for project {project_id}")
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": "Stream timeout exceeded"}),
                    }
                    break

                choice = chunk.get("choices", [{}])[0]
                delta = choice.get("delta", {})
                content = delta.get("content", "")

                if content:
                    tokens_emitted += 1
                    buffer.append(content)

                    yield {"event": "token", "data": content}

                    if tokens_emitted % 100 == 0:
                        checkpoint_counter += 1
                        progress = min(0.2 + (tokens_emitted / 4000) * 0.7, 0.9)
                        yield {
                            "event": "checkpoint",
                            "data": json.dumps(
                                {
                                    "checkpoint": checkpoint_counter,
                                    "tokens": tokens_emitted,
                                    "progress": progress,
                                }
                            ),
                        }

                if chunk.get("usage"):
                    usage = chunk["usage"]
                    prompt_tokens = usage.get("prompt_tokens", 0)
                    completion_tokens = usage.get("completion_tokens", 0)

                    MetricsTracker.track_tokens(
                        model=model,
                        agent="outliner",
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                    )

                    total_cost = calculate_cost_usd(model, prompt_tokens, completion_tokens)
                    MetricsTracker.track_cost(model, "outliner", total_cost)

                    cost_record = Cost(
                        session_id=session.id,
                        agent="outliner",
                        model=model,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        usd=total_cost,
                    )
                    db.add(cost_record)

        revised_outline = "".join(buffer)

        # Save revised outline artifact
        artifact = Artifact(
            session_id=session.id,
            kind="outline",
            meta={
                "revision": True,
                "original_outline_id": str(current_outline.id),
                "revision_instructions": revision.revision_instructions[:500],
                "tokens": tokens_emitted,
            },
            blob=revised_outline.encode(),
        )
        db.add(artifact)

        event = Event(
            session_id=session.id,
            type="outline_revised",
            payload={
                "tokens": tokens_emitted,
                "duration": time.perf_counter() - start_time,
                "model": model,
                "original_outline_id": str(current_outline.id),
            },
        )
        db.add(event)

        await db.commit()

        yield {
            "event": "complete",
            "data": json.dumps(
                {
                    "tokens": tokens_emitted,
                    "duration": time.perf_counter() - start_time,
                    "outline_id": str(artifact.id),
                }
            ),
        }

    except Exception as e:
        MetricsTracker.track_model_error(model, type(e).__name__)
        logger.error(f"Outline revision failed: {e}")
        yield {
            "event": "error",
            "data": json.dumps({"error": str(e), "code": "REVISION_FAILED"}),
        }
    finally:
        active_sessions.dec()
