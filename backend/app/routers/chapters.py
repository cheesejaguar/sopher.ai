"""Chapter generation endpoints with SSE streaming"""

import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime
from typing import Any, AsyncIterator, Callable, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, Path, Request, Response, status
from litellm import acompletion
from sqlalchemy import Integer, select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from ..cache import cache
from ..config import DEFAULT_MODEL
from ..db import get_db
from ..errors import ErrorCode, api_error
from ..metrics import MetricsTracker, active_sessions
from ..models import Artifact, Cost, Event, Project, Session, User
from ..pricing import calculate_cost_usd
from ..schemas import (
    ChapterDraftRequest,
    ChapterJobStatus,
    ChapterOutlineItem,
    ChapterRegenerateRequest,
    ParallelChapterRequest,
    ParallelGenerationProgress,
    ParallelGenerationResult,
    ProjectSettings,
)
from ..security import TokenData, get_current_user
from ..services.content_filter import build_content_filter_prompt
from ..services.parallel_writer import (
    BatchProgress,
    JobStatus,
    ParallelChapterService,
)

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
        .where(Artifact.meta["chapter_number"].astext.cast(Integer) == chapter_number)
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
    project_settings: Optional[ProjectSettings] = None,
    model: str | None = None,  # Uses DEFAULT_MODEL from config if not specified
) -> AsyncIterator[dict]:
    """Generate SSE events for chapter streaming

    Args:
        request: The incoming request
        project_id: UUID of the project
        chapter_number: The chapter number to generate
        outline: The chapter outline
        style_guide: Optional style guide
        character_bible: Optional character bible dict
        previous_chapters: List of previous chapter content for context
        session: The database session record
        db: The async database session
        user: The authenticated user's token data
        project_settings: Optional project settings for content filtering
        model: The LLM model to use (defaults to DEFAULT_MODEL from config)
    """
    # Use default model if not specified
    model = model or DEFAULT_MODEL

    logger.info(f"[ChapterGen] Starting chapter {chapter_number} generation with model: {model}")
    logger.info(f"[ChapterGen] Outline length: {len(outline)} chars")

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
        logger.info(f"[ChapterGen] Cache key: {cache_key}")

        cached_result = await cache.get(cache_key)
        if cached_result:
            logger.info("[ChapterGen] Cache HIT - returning cached content")
            MetricsTracker.track_cache(hit=True, cache_type="chapter")
            yield {
                "event": "checkpoint",
                "data": json.dumps({"source": "cache", "content": cached_result}),
            }
            yield {"event": "complete", "data": json.dumps({"cached": True, "tokens": 0})}
            return

        MetricsTracker.track_cache(hit=False, cache_type="chapter")
        logger.info("[ChapterGen] Cache MISS - will generate new content")

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

        # Build content filtering guidelines
        content_guidelines = build_content_filter_prompt(project_settings)

        # Build the chapter generation prompt
        char_bible_str = json.dumps(character_bible) if character_bible else "Not provided"
        prompt = f"""Write Chapter {chapter_number} following this outline:

{outline}

Style Guide: {style_guide or 'Standard narrative prose'}

Character Bible: {char_bible_str}
{context}

{content_guidelines}

Requirements:
1. Match the style guide precisely
2. Maintain character consistency
3. Create vivid scenes and engaging dialogue
4. End with a compelling hook for the next chapter
5. Target 3000-5000 words
6. Use markdown formatting for structure
7. STRICTLY follow all content guidelines above

Begin writing the chapter now:"""

        yield {
            "event": "checkpoint",
            "data": json.dumps({"stage": "generating", "progress": 0.2}),
        }

        # Stream chapter generation
        buffer: list[str] = []
        logger.info(f"[ChapterGen] Starting LLM call to model: {model}")

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

            logger.info("[ChapterGen] Got response object, starting to iterate chunks")
            chunk_count = 0
            async for chunk in response:
                chunk_count += 1
                if chunk_count == 1:
                    logger.info(f"[ChapterGen] First chunk received: {type(chunk)}")
                if await request.is_disconnected():
                    logger.warning(f"[ChapterGen] Client disconnected after {chunk_count} chunks")
                    break

                if hasattr(chunk, "choices") and chunk.choices:
                    content = chunk.choices[0].delta.content or ""
                    if content:
                        buffer.append(content)
                        tokens_emitted += 1
                        # JSON-encode token to preserve whitespace exactly
                        yield {"event": "token", "data": json.dumps(content)}
                        if tokens_emitted == 1:
                            logger.info(f"[ChapterGen] First token emitted: {repr(content)}")

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

            logger.info(f"[ChapterGen] Streaming complete. Chunks: {chunk_count}, Tokens emitted: {tokens_emitted}")

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
        # Log full error details server-side but return generic message to client
        logger.error(f"Chapter generation failed: {e}", exc_info=True)
        yield {
            "event": "error",
            "data": json.dumps(
                {
                    "error_code": ChapterErrorCode.CHAPTER_GENERATION_FAILED,
                    "message": "Chapter generation failed. Please try again.",
                }
            ),
        }
    finally:
        active_sessions.dec()


# --- Endpoints ---


@router.post("/chapters/{chapter_number}/generate/stream")
async def stream_chapter_generation(
    request: Request,
    project_id: UUID,
    chapter_number: int = Path(..., ge=1, description="Chapter number (must be >= 1)"),
    body: ChapterDraftRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> Response:
    """Stream chapter generation via Server-Sent Events

    Generates a chapter based on the provided outline and context.
    """
    # Note: chapter_number validation now handled by Path(ge=1)
    if chapter_number < 1:  # Keep for safety, but Path validation handles this
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

    # Check user's budget with row-level locking to prevent race conditions
    user_result = await db.execute(select(User).where(User.id == user.user_id).with_for_update())
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
        .where(Session.user_id == user.user_id)
        .order_by(Session.created_at.desc())
        .limit(1)
    )
    session = session_result.scalar_one_or_none()

    if not session:
        session = Session(project_id=project_id, user_id=user.user_id)
        db.add(session)
        await db.flush()

    # Get previous chapters for context
    previous_chapters = body.previous_chapters or await get_previous_chapters(
        db, project_id, chapter_number
    )

    # Get project settings for content filtering
    project_settings = None
    if project.settings:
        try:
            project_settings = ProjectSettings(**project.settings)
        except Exception as e:
            logger.warning(f"Failed to parse project settings: {e}")

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
            project_settings=project_settings,
        )
    )


@router.get("/chapters/{chapter_number}")
async def get_chapter(
    project_id: UUID,
    chapter_number: int = Path(..., ge=1, description="Chapter number (must be >= 1)"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> Response:
    """Get a specific chapter's content"""
    # Note: chapter_number validation handled by Path(ge=1)
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
    chapter_number: int = Path(..., ge=1, description="Chapter number (must be >= 1)"),
    content: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> Response:
    """Update a chapter's content manually"""
    # Note: chapter_number validation handled by Path(ge=1)
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
        .where(Session.user_id == user.user_id)
        .order_by(Session.created_at.desc())
        .limit(1)
    )
    session = session_result.scalar_one_or_none()

    if not session:
        session = Session(project_id=project_id, user_id=user.user_id)
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


@router.delete("/chapters/{chapter_number}")
async def delete_chapter(
    project_id: UUID,
    chapter_number: int = Path(..., ge=1, description="Chapter number (must be >= 1)"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> Response:
    """Delete a chapter from the project"""
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

    # Find all chapter artifacts with this number (there may be multiple versions)
    result = await db.execute(
        select(Artifact)
        .join(Session, Session.id == Artifact.session_id)
        .where(Session.project_id == project_id)
        .where(Artifact.kind == "chapter")
        .where(Artifact.meta["chapter_number"].astext.cast(Integer) == chapter_number)
    )
    artifacts = result.scalars().all()

    if not artifacts:
        return api_error(
            ChapterErrorCode.CHAPTER_NOT_FOUND,
            f"Chapter {chapter_number} not found.",
            status=status.HTTP_404_NOT_FOUND,
        )

    # Delete all versions of this chapter
    deleted_count = 0
    for artifact in artifacts:
        await db.delete(artifact)
        deleted_count += 1

    # Log deletion event
    session_result = await db.execute(
        select(Session)
        .where(Session.project_id == project_id)
        .where(Session.user_id == user.user_id)
        .order_by(Session.created_at.desc())
        .limit(1)
    )
    session = session_result.scalar_one_or_none()

    if session:
        event = Event(
            session_id=session.id,
            type="chapter_deleted",
            payload={
                "chapter_number": chapter_number,
                "artifacts_deleted": deleted_count,
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
                "deleted": True,
                "artifacts_deleted": deleted_count,
            }
        ),
        media_type="application/json",
    )


@router.post("/chapters/{chapter_number}/regenerate/stream")
async def stream_chapter_regeneration(
    request: Request,
    project_id: UUID,
    chapter_number: int = Path(..., ge=1, description="Chapter number (must be >= 1)"),
    body: ChapterRegenerateRequest = Body(default_factory=ChapterRegenerateRequest),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> Response:
    """Regenerate a chapter with optional additional instructions

    Uses the project's outline and previous chapters for context.
    """
    instructions = body.instructions

    # Note: chapter_number validation handled by Path(ge=1)
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
        .where(Session.user_id == user.user_id)
        .order_by(Session.created_at.desc())
        .limit(1)
    )
    session = session_result.scalar_one_or_none()

    if not session:
        session = Session(project_id=project_id, user_id=user.user_id)
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

    # Get project settings for content filtering
    project_settings = None
    if project.settings:
        try:
            project_settings = ProjectSettings(**project.settings)
        except Exception as e:
            logger.warning(f"Failed to parse project settings for regeneration: {e}")

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
            project_settings=project_settings,
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
        .order_by(Artifact.meta["chapter_number"].astext.cast(Integer))
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


# --- Parallel Chapter Generation ---


def _create_chapter_generator(
    model: str,
    content_guidelines: str,
) -> Callable[..., Any]:
    """Create a chapter generator function for the parallel writer service."""

    async def generate_chapter(
        chapter_number: int,
        outline: str,
        style_guide: str | None,
        character_bible: dict | None,
        previous_chapters: list[str] | None,
    ) -> str:
        """Generate a single chapter using LLM."""
        # Build context from previous chapters
        context = ""
        if previous_chapters:
            recent = previous_chapters[-2:] if len(previous_chapters) > 1 else previous_chapters
            context = f"\n\nPrevious chapters for context:\n{'...'.join(c[-500:] for c in recent)}"

        char_bible_str = json.dumps(character_bible) if character_bible else "Not provided"
        prompt = f"""Write Chapter {chapter_number} following this outline:

{outline}

Style Guide: {style_guide or 'Standard narrative prose'}

Character Bible: {char_bible_str}
{context}

{content_guidelines}

Requirements:
1. Match the style guide precisely
2. Maintain character consistency
3. Create vivid scenes and engaging dialogue
4. End with a compelling hook for the next chapter
5. Target 3000-5000 words
6. Use markdown formatting for structure
7. STRICTLY follow all content guidelines above

Begin writing the chapter now:"""

        response = await acompletion(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a talented fiction writer who creates vivid, engaging prose.",
                },
                {"role": "user", "content": prompt},
            ],
            stream=False,
        )

        return response.choices[0].message.content or ""

    return generate_chapter


async def parallel_generation_event_generator(
    request: Request,
    project_id: UUID,
    batch_id: UUID,
    chapter_outlines: list[ChapterOutlineItem],
    style_guide: str | None,
    character_bible: dict | None,
    max_parallel: int,
    project_settings: ProjectSettings | None,
    session: Session,
    db: AsyncSession,
    user: TokenData,
    model: str | None = None,  # Uses DEFAULT_MODEL from config if not specified
) -> AsyncIterator[dict]:
    """Generate SSE events for parallel chapter generation."""
    # Use default model if not specified
    model = model or DEFAULT_MODEL

    active_sessions.inc()
    start_time = time.perf_counter()

    try:
        # Build content filtering guidelines
        content_guidelines = build_content_filter_prompt(project_settings)

        # Create the chapter generator
        generator = _create_chapter_generator(model, content_guidelines)

        # Create parallel service
        service = ParallelChapterService(
            generator=generator,
            max_parallel=max_parallel,
            retry_on_failure=True,
            max_retries=2,
        )

        # Convert outline items to the format expected by the service
        outlines_for_service: list[dict[str, Any]] = [
            {"chapter_number": item.chapter_number, "outline": item.outline, "title": item.title}
            for item in chapter_outlines
        ]

        # Track progress via callback
        last_progress: BatchProgress | None = None

        def progress_callback(progress: BatchProgress) -> None:
            nonlocal last_progress
            last_progress = progress

        service.set_progress_callback(progress_callback)

        # Start generation in a background task
        generation_task = asyncio.create_task(
            service.generate_chapters(
                chapter_outlines=[item["outline"] for item in outlines_for_service],
                style_guide=style_guide,
                character_bible=character_bible,
                start_chapter=min(item.chapter_number for item in chapter_outlines),
            )
        )

        # Stream progress updates
        yield {
            "event": "started",
            "data": json.dumps(
                {
                    "batch_id": str(batch_id),
                    "total_chapters": len(chapter_outlines),
                    "max_parallel": max_parallel,
                }
            ),
        }

        while not generation_task.done():
            if await request.is_disconnected():
                service.cancel()
                generation_task.cancel()
                break

            # Get current progress
            current_progress = service.get_current_progress()
            if current_progress:
                jobs = service._queue.get_all_jobs() if service._queue else []
                job_statuses = [
                    ChapterJobStatus(
                        job_id=job.id,
                        chapter_number=job.chapter_number,
                        status=job.status.value,
                        progress=job.progress,
                        word_count=job.word_count,
                        error=job.error,
                    ).model_dump()
                    for job in jobs
                ]

                progress_data = ParallelGenerationProgress(
                    batch_id=batch_id,
                    total_chapters=current_progress.total_chapters,
                    completed_chapters=current_progress.completed_chapters,
                    failed_chapters=current_progress.failed_chapters,
                    in_progress_chapters=current_progress.in_progress_chapters,
                    overall_progress=current_progress.overall_progress,
                    estimated_remaining_seconds=current_progress.estimated_remaining_seconds,
                    word_count_total=current_progress.word_count_total,
                    jobs=job_statuses,
                ).model_dump()

                # Convert UUIDs to strings for JSON serialization
                progress_data["batch_id"] = str(progress_data["batch_id"])
                for job in progress_data["jobs"]:
                    job["job_id"] = str(job["job_id"])

                yield {
                    "event": "progress",
                    "data": json.dumps(progress_data),
                }

            await asyncio.sleep(1)  # Update every second

        # Get final results
        try:
            completed_jobs = await generation_task
        except asyncio.CancelledError:
            yield {
                "event": "cancelled",
                "data": json.dumps({"batch_id": str(batch_id)}),
            }
            return

        duration = time.perf_counter() - start_time

        # Save completed chapters as artifacts
        chapters_result = []
        for job in completed_jobs:
            chapter_data = {
                "chapter_number": job.chapter_number,
                "status": job.status.value,
                "word_count": job.word_count,
                "error": job.error,
            }

            if job.status == JobStatus.COMPLETED and job.result:
                # Save as artifact
                artifact = Artifact(
                    session_id=session.id,
                    kind="chapter",
                    blob=job.result.encode("utf-8"),
                    meta={
                        "chapter_number": job.chapter_number,
                        "word_count": job.word_count,
                        "batch_id": str(batch_id),
                        "generated_at": datetime.utcnow().isoformat(),
                    },
                )
                db.add(artifact)
                chapter_data["content"] = job.result
                chapter_data["artifact_id"] = str(artifact.id)

            chapters_result.append(chapter_data)

        await db.commit()

        # Calculate totals
        total_word_count = sum(job.word_count for job in completed_jobs)
        completed_count = sum(1 for job in completed_jobs if job.status == JobStatus.COMPLETED)
        failed_count = sum(1 for job in completed_jobs if job.status == JobStatus.FAILED)

        result = ParallelGenerationResult(
            batch_id=batch_id,
            total_chapters=len(completed_jobs),
            completed_chapters=completed_count,
            failed_chapters=failed_count,
            chapters=chapters_result,
            total_word_count=total_word_count,
            duration_seconds=duration,
        ).model_dump()

        result["batch_id"] = str(result["batch_id"])

        yield {
            "event": "complete",
            "data": json.dumps(result),
        }

    except Exception as e:
        logger.error(f"Parallel generation failed: {e}", exc_info=True)
        yield {
            "event": "error",
            "data": json.dumps(
                {
                    "error_code": ChapterErrorCode.CHAPTER_GENERATION_FAILED,
                    "message": f"Parallel generation failed: {str(e)}",
                    "batch_id": str(batch_id),
                }
            ),
        }
    finally:
        active_sessions.dec()


@router.post("/chapters/generate/parallel/stream")
async def stream_parallel_chapter_generation(
    request: Request,
    project_id: UUID,
    body: ParallelChapterRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user),
) -> Response:
    """Generate multiple chapters in parallel via Server-Sent Events.

    Streams progress updates for each chapter and returns all completed chapters.

    Args:
        project_id: UUID of the project
        body: ParallelChapterRequest with chapter outlines and settings

    Returns:
        SSE stream with progress events and final results
    """
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

    # Create or retrieve session
    session_result = await db.execute(
        select(Session)
        .where(Session.project_id == project_id)
        .where(Session.user_id == user.user_id)
        .order_by(Session.created_at.desc())
        .limit(1)
    )
    session = session_result.scalar_one_or_none()

    if not session:
        session = Session(project_id=project_id, user_id=user.user_id)
        db.add(session)
        await db.flush()

    # Get project settings for content filtering
    project_settings = None
    if project.settings:
        try:
            project_settings = ProjectSettings(**project.settings)
        except Exception as e:
            logger.warning(f"Failed to parse project settings: {e}")

    # Generate batch ID
    batch_id = uuid4()

    return EventSourceResponse(
        parallel_generation_event_generator(
            request=request,
            project_id=project_id,
            batch_id=batch_id,
            chapter_outlines=body.chapter_outlines,
            style_guide=body.style_guide,
            character_bible=body.character_bible,
            max_parallel=body.max_parallel,
            project_settings=project_settings,
            session=session,
            db=db,
            user=user,
        )
    )
