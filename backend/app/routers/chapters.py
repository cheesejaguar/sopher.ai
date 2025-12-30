"""Chapter generation endpoints with SSE streaming"""

import hashlib
import json
import logging
import time
from typing import AsyncIterator, Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Request, Response, status
from litellm import acompletion
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from ..cache import cache
from ..db import get_db
from ..errors import ErrorCode, api_error
from ..metrics import MetricsTracker, active_sessions
from ..models import Artifact, Cost, Event, Project, Session, User
from ..pricing import calculate_cost_usd
from ..schemas import ChapterDraftRequest
from ..security import TokenData, get_current_user

router = APIRouter(prefix="/projects/{project_id}", tags=["chapters"])

logger = logging.getLogger(__name__)


# --- Error Codes ---
class ChapterErrorCode:
    """Chapter-specific error codes"""

    CHAPTER_NOT_FOUND = "CHAPTER_NOT_FOUND"
    CHAPTER_GENERATION_FAILED = "CHAPTER_GENERATION_FAILED"
    CHAPTER_INVALID_NUMBER = "CHAPTER_INVALID_NUMBER"
    OUTLINE_REQUIRED = "OUTLINE_REQUIRED"


# --- Helper Functions ---


async def get_project_outline(db: AsyncSession, project_id: UUID) -> Optional[str]:
    """Retrieve the latest outline artifact for a project"""
    result = await db.execute(
        select(Artifact)
        .join(Session, Session.id == Artifact.session_id)
        .where(Session.project_id == project_id)
        .where(Artifact.kind == "outline")
        .order_by(Artifact.created_at.desc())
        .limit(1)
    )
    artifact = result.scalar_one_or_none()
    if artifact and artifact.blob:
        return artifact.blob.decode("utf-8")
    return None


async def get_chapter_artifact(
    db: AsyncSession, project_id: UUID, chapter_number: int
) -> Optional[Artifact]:
    """Retrieve a specific chapter artifact"""
    result = await db.execute(
        select(Artifact)
        .join(Session, Session.id == Artifact.session_id)
        .where(Session.project_id == project_id)
        .where(Artifact.kind == "chapter")
        .where(Artifact.meta["chapter_number"].astext.cast(int) == chapter_number)
        .order_by(Artifact.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_previous_chapters(
    db: AsyncSession, project_id: UUID, up_to_chapter: int, limit: int = 2
) -> list[str]:
    """Get previous chapter content for context"""
    chapters = []
    for ch_num in range(max(1, up_to_chapter - limit), up_to_chapter):
        artifact = await get_chapter_artifact(db, project_id, ch_num)
        if artifact and artifact.blob:
            chapters.append(artifact.blob.decode("utf-8"))
    return chapters


# --- Chapter Generation Event Generator ---


async def chapter_event_generator(
    request: Request,
    project_id: UUID,
    chapter_number: int,
    outline: str,
    style_guide: Optional[str],
    character_bible: Optional[dict],
    previous_chapters: list[str],
    session: Session,
    db: AsyncSession,
    user: TokenData,
    model: str = "gpt-4o",
) -> AsyncIterator[dict]:
    """Generate SSE events for chapter streaming"""

    active_sessions.inc()
    start_time = time.perf_counter()
    tokens_emitted = 0

    try:
        # Check cache
        cache_key = cache.cache_key(
            "chapter",
            str(project_id),
            str(chapter_number),
            hashlib.md5(outline.encode()).hexdigest()[:16],
        )

        cached_result = await cache.get(cache_key)
        if cached_result:
            MetricsTracker.track_cache(hit=True, cache_type="chapter")
            yield {
                "event": "checkpoint",
                "data": json.dumps({"source": "cache", "content": cached_result}),
            }
            yield {"event": "complete", "data": json.dumps({"cached": True, "tokens": 0})}
            return

        MetricsTracker.track_cache(hit=False, cache_type="chapter")

        # Build context from previous chapters
        context = ""
        if previous_chapters:
            recent = previous_chapters[-2:] if len(previous_chapters) > 1 else previous_chapters
            # Use last 500 chars of each chapter for context
            context = f"\n\nPrevious chapters for context:\n{'...'.join(c[-500:] for c in recent)}"

        yield {
            "event": "checkpoint",
            "data": json.dumps({"stage": "preparing", "progress": 0.1}),
        }

        # Build the chapter generation prompt
        char_bible_str = json.dumps(character_bible) if character_bible else "Not provided"
        prompt = f"""Write Chapter {chapter_number} following this outline:

{outline}

Style Guide: {style_guide or 'Standard narrative prose'}

Character Bible: {char_bible_str}
{context}

Requirements:
1. Match the style guide precisely
2. Maintain character consistency
3. Create vivid scenes and engaging dialogue
4. End with a compelling hook for the next chapter
5. Target 3000-5000 words
6. Use markdown formatting for structure

Begin writing the chapter now:"""

        yield {
            "event": "checkpoint",
            "data": json.dumps({"stage": "generating", "progress": 0.2}),
        }

        # Stream chapter generation
        buffer: list[str] = []

        with MetricsTracker.track_inference(model, "writer", "chapter_generation"):
            response = await acompletion(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a talented fiction writer who creates vivid, engaging prose.",
                    },
                    {"role": "user", "content": prompt},
                ],
                stream=True,
            )

            async for chunk in response:
                if await request.is_disconnected():
                    break

                if hasattr(chunk, "choices") and chunk.choices:
                    content = chunk.choices[0].delta.content or ""
                    if content:
                        buffer.append(content)
                        tokens_emitted += 1
                        yield {"event": "token", "data": content}

                        # Progress updates every 500 tokens
                        if tokens_emitted % 500 == 0:
                            progress = min(0.9, 0.2 + (tokens_emitted / 5000) * 0.7)
                            yield {
                                "event": "checkpoint",
                                "data": json.dumps(
                                    {
                                        "stage": "writing",
                                        "progress": progress,
                                        "tokens": tokens_emitted,
                                    }
                                ),
                            }

            # Calculate and track costs
            prompt_tokens = len(prompt.split())
            completion_tokens = tokens_emitted
            total_cost = calculate_cost_usd(model, prompt_tokens, completion_tokens)

            MetricsTracker.track_tokens(model, prompt_tokens, completion_tokens, total_cost)

            if session:
                cost_record = Cost(
                    session_id=session.id,
                    model=model,
                    agent="writer",
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    usd=total_cost,
                )
                db.add(cost_record)

        # Final chapter content
        final_chapter = "".join(buffer)

        # Save to cache
        await cache.set(cache_key, final_chapter, ttl=3600)

        # Save artifact to database
        artifact = Artifact(
            session_id=session.id,
            kind="chapter",
            meta={
                "chapter_number": chapter_number,
                "tokens": tokens_emitted,
                "model": model,
            },
            blob=final_chapter.encode(),
        )
        db.add(artifact)

        # Log event
        event = Event(
            session_id=session.id,
            type="chapter_generated",
            payload={
                "chapter_number": chapter_number,
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
                    "chapter_id": str(artifact.id),
                    "word_count": len(final_chapter.split()),
                }
            ),
        }

    except Exception as e:
        MetricsTracker.track_model_error(model, type(e).__name__)
        logger.error(f"Chapter generation failed: {e}")
        yield {
            "event": "error",
            "data": json.dumps(
                {
                    "error_code": ChapterErrorCode.CHAPTER_GENERATION_FAILED,
                    "message": str(e),
                }
            ),
        }
    finally:
        active_sessions.dec()


# --- Endpoints ---


@router.post("/chapters/{chapter_number}/generate/stream")
async def stream_chapter_generation(
    project_id: UUID,
    chapter_number: int,
    request: Request,
    body: ChapterDraftRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> Response:
    """Stream chapter generation via Server-Sent Events

    Generates a chapter based on the provided outline and context.
    """

    if chapter_number < 1:
        return api_error(
            ChapterErrorCode.CHAPTER_INVALID_NUMBER,
            "Chapter number must be at least 1.",
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Verify project exists and user has access
    project_result = await db.execute(
        select(Project).where(Project.id == project_id).where(Project.user_id == user.user_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        return api_error(
            ErrorCode.PROJECT_NOT_FOUND.value,
            "Project not found or you don't have access.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Check user's budget
    user_result = await db.execute(select(User).where(User.id == user.user_id))
    user_record = user_result.scalar_one_or_none()

    if not user_record:
        return api_error(
            ErrorCode.NOT_FOUND.value,
            "User not found.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Create or retrieve session
    session_result = await db.execute(
        select(Session)
        .where(Session.project_id == project_id)
        .where(Session.ended_at.is_(None))
        .order_by(Session.started_at.desc())
        .limit(1)
    )
    session = session_result.scalar_one_or_none()

    if not session:
        session = Session(project_id=project_id)
        db.add(session)
        await db.flush()

    # Get previous chapters for context
    previous_chapters = body.previous_chapters or await get_previous_chapters(
        db, project_id, chapter_number
    )

    return EventSourceResponse(
        chapter_event_generator(
            request=request,
            project_id=project_id,
            chapter_number=chapter_number,
            outline=body.outline,
            style_guide=body.style_guide,
            character_bible=body.character_bible,
            previous_chapters=previous_chapters,
            session=session,
            db=db,
            user=user,
        )
    )


@router.get("/chapters/{chapter_number}")
async def get_chapter(
    project_id: UUID,
    chapter_number: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> Response:
    """Get a specific chapter's content"""

    if chapter_number < 1:
        return api_error(
            ChapterErrorCode.CHAPTER_INVALID_NUMBER,
            "Chapter number must be at least 1.",
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Verify project access
    project_result = await db.execute(
        select(Project).where(Project.id == project_id).where(Project.user_id == user.user_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        return api_error(
            ErrorCode.PROJECT_NOT_FOUND.value,
            "Project not found or you don't have access.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Get chapter artifact
    artifact = await get_chapter_artifact(db, project_id, chapter_number)

    if not artifact:
        return api_error(
            ChapterErrorCode.CHAPTER_NOT_FOUND,
            f"Chapter {chapter_number} not found.",
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(
        content=json.dumps(
            {
                "chapter_number": chapter_number,
                "content": artifact.blob.decode("utf-8") if artifact.blob else "",
                "created_at": artifact.created_at.isoformat() if artifact.created_at else None,
                "meta": artifact.meta,
            }
        ),
        media_type="application/json",
    )


@router.put("/chapters/{chapter_number}")
async def update_chapter(
    project_id: UUID,
    chapter_number: int,
    content: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> Response:
    """Update a chapter's content manually"""

    if chapter_number < 1:
        return api_error(
            ChapterErrorCode.CHAPTER_INVALID_NUMBER,
            "Chapter number must be at least 1.",
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Verify project access
    project_result = await db.execute(
        select(Project).where(Project.id == project_id).where(Project.user_id == user.user_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        return api_error(
            ErrorCode.PROJECT_NOT_FOUND.value,
            "Project not found or you don't have access.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Get or create session
    session_result = await db.execute(
        select(Session)
        .where(Session.project_id == project_id)
        .where(Session.ended_at.is_(None))
        .order_by(Session.started_at.desc())
        .limit(1)
    )
    session = session_result.scalar_one_or_none()

    if not session:
        session = Session(project_id=project_id)
        db.add(session)
        await db.flush()

    # Create new artifact (we keep history by creating new artifacts)
    artifact = Artifact(
        session_id=session.id,
        kind="chapter",
        meta={
            "chapter_number": chapter_number,
            "manual_edit": True,
        },
        blob=content.encode(),
    )
    db.add(artifact)

    # Log event
    event = Event(
        session_id=session.id,
        type="chapter_updated",
        payload={
            "chapter_number": chapter_number,
            "word_count": len(content.split()),
        },
    )
    db.add(event)

    await db.commit()

    # Invalidate cache
    cache_key = cache.cache_key(
        "chapter",
        str(project_id),
        str(chapter_number),
    )
    await cache.delete(cache_key)

    return Response(
        content=json.dumps(
            {
                "chapter_number": chapter_number,
                "artifact_id": str(artifact.id),
                "updated": True,
            }
        ),
        media_type="application/json",
    )


@router.post("/chapters/{chapter_number}/regenerate/stream")
async def stream_chapter_regeneration(
    project_id: UUID,
    chapter_number: int,
    request: Request,
    instructions: Optional[str] = Body(None),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> Response:
    """Regenerate a chapter with optional additional instructions

    Uses the project's outline and previous chapters for context.
    """

    if chapter_number < 1:
        return api_error(
            ChapterErrorCode.CHAPTER_INVALID_NUMBER,
            "Chapter number must be at least 1.",
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Verify project access
    project_result = await db.execute(
        select(Project).where(Project.id == project_id).where(Project.user_id == user.user_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        return api_error(
            ErrorCode.PROJECT_NOT_FOUND.value,
            "Project not found or you don't have access.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Get project outline
    outline = await get_project_outline(db, project_id)
    if not outline:
        return api_error(
            ChapterErrorCode.OUTLINE_REQUIRED,
            "No outline found for this project. Generate an outline first.",
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Get or create session
    session_result = await db.execute(
        select(Session)
        .where(Session.project_id == project_id)
        .where(Session.ended_at.is_(None))
        .order_by(Session.started_at.desc())
        .limit(1)
    )
    session = session_result.scalar_one_or_none()

    if not session:
        session = Session(project_id=project_id)
        db.add(session)
        await db.flush()

    # Get previous chapters
    previous_chapters = await get_previous_chapters(db, project_id, chapter_number)

    # Modify outline with additional instructions if provided
    modified_outline = outline
    if instructions:
        modified_outline = f"{outline}\n\nAdditional instructions for this chapter:\n{instructions}"

    # Invalidate cache before regenerating
    cache_key = cache.cache_key(
        "chapter",
        str(project_id),
        str(chapter_number),
    )
    await cache.delete(cache_key)

    return EventSourceResponse(
        chapter_event_generator(
            request=request,
            project_id=project_id,
            chapter_number=chapter_number,
            outline=modified_outline,
            style_guide=project.settings.get("style_guide") if project.settings else None,
            character_bible=project.settings.get("character_bible") if project.settings else None,
            previous_chapters=previous_chapters,
            session=session,
            db=db,
            user=user,
        )
    )


@router.get("/chapters")
async def list_chapters(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> Response:
    """List all chapters for a project"""

    # Verify project access
    project_result = await db.execute(
        select(Project).where(Project.id == project_id).where(Project.user_id == user.user_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        return api_error(
            ErrorCode.PROJECT_NOT_FOUND.value,
            "Project not found or you don't have access.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Get all chapter artifacts
    result = await db.execute(
        select(Artifact)
        .join(Session, Session.id == Artifact.session_id)
        .where(Session.project_id == project_id)
        .where(Artifact.kind == "chapter")
        .order_by(Artifact.meta["chapter_number"].astext.cast(int))
    )
    artifacts = result.scalars().all()

    # Group by chapter number (take latest of each)
    chapters_dict: dict[int, dict] = {}
    for artifact in artifacts:
        ch_num = artifact.meta.get("chapter_number", 0)
        if ch_num not in chapters_dict or artifact.created_at > chapters_dict[ch_num]["created_at"]:
            chapters_dict[ch_num] = {
                "chapter_number": ch_num,
                "artifact_id": str(artifact.id),
                "created_at": artifact.created_at,
                "word_count": len(artifact.blob.decode("utf-8").split()) if artifact.blob else 0,
                "meta": artifact.meta,
            }

    chapters = [
        {**v, "created_at": v["created_at"].isoformat() if v["created_at"] else None}
        for v in sorted(chapters_dict.values(), key=lambda x: x["chapter_number"])
    ]

    return Response(
        content=json.dumps({"chapters": chapters, "total": len(chapters)}),
        media_type="application/json",
    )
