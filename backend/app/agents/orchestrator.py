"""Book generation pipeline orchestrator.

This module provides the BookPipeline class that orchestrates
the complete book generation process using lightweight agents.
"""

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from typing import Any, AsyncIterator

from pydantic import BaseModel, Field

from .base import Agent, AgentConfig, AgentError
from .prompts import (
    CONCEPT_SYSTEM_PROMPT,
    CONTINUITY_SYSTEM_PROMPT,
    EDITOR_SYSTEM_PROMPT,
    OUTLINE_SYSTEM_PROMPT,
    WRITER_SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)


# ============================================================================
# Pydantic Models for Structured Outputs
# ============================================================================


class BookConcept(BaseModel):
    """Expanded book concept from a brief."""

    title: str = Field(description="Working title for the book")
    genre: str = Field(description="Primary genre classification")
    themes: list[str] = Field(description="Major themes explored")
    setting: str = Field(description="Primary setting description")
    time_period: str = Field(description="When the story takes place")
    tone: str = Field(description="Emotional tone of the narrative")
    target_audience: str = Field(description="Description of ideal readers")
    unique_elements: list[str] = Field(description="Distinguishing features")
    central_conflict: str = Field(description="The core dramatic tension")


class ChapterOutline(BaseModel):
    """Outline for a single chapter."""

    number: int = Field(description="Chapter number (1-indexed)")
    title: str = Field(description="Chapter title")
    summary: str = Field(description="2-3 sentence chapter summary")
    key_events: list[str] = Field(description="Major plot points")
    characters_involved: list[str] = Field(description="Characters in this chapter")
    emotional_arc: str = Field(description="Emotional journey of the chapter")
    estimated_word_count: int = Field(description="Target word count", ge=1000, le=10000)


class BookOutline(BaseModel):
    """Complete book outline."""

    title: str = Field(description="Book title")
    chapters: list[ChapterOutline] = Field(description="Chapter outlines")
    character_summaries: dict[str, str] = Field(description="Character name to description mapping")
    plot_threads: list[str] = Field(description="Major plot threads to track")
    total_estimated_words: int = Field(description="Total estimated word count")


class Chapter(BaseModel):
    """Generated chapter content."""

    number: int = Field(description="Chapter number")
    title: str = Field(description="Chapter title")
    content: str = Field(description="Full chapter text in markdown")
    word_count: int = Field(description="Actual word count")


class EditedChapter(BaseModel):
    """Edited chapter with improvements."""

    number: int = Field(description="Chapter number")
    title: str = Field(description="Chapter title")
    content: str = Field(description="Edited chapter text")
    word_count: int = Field(description="Word count after editing")
    changes_made: list[str] = Field(description="List of significant changes")


class ContinuityIssue(BaseModel):
    """A single continuity issue."""

    type: str = Field(description="Category of inconsistency")
    severity: str = Field(description="critical/major/minor")
    location: str = Field(description="Where the issue occurs")
    description: str = Field(description="What the inconsistency is")
    suggestion: str = Field(description="How to fix it")


class ContinuityReport(BaseModel):
    """Continuity check results."""

    issues: list[ContinuityIssue] = Field(description="List of continuity issues")
    suggestions: list[str] = Field(description="General suggestions")
    consistency_score: float = Field(description="0-1 consistency rating", ge=0, le=1)


# ============================================================================
# Progress Tracking
# ============================================================================


@dataclass
class GenerationProgress:
    """Progress update for pipeline stages."""

    stage: str
    chapter: int | None
    progress: float  # 0.0 to 1.0
    message: str


# ============================================================================
# Book Pipeline
# ============================================================================


class BookPipeline:
    """
    Orchestrates the book generation process.

    Pipeline stages:
    1. Concept expansion: Brief -> Rich concept
    2. Outline generation: Concept -> Chapter outlines
    3. Chapter writing: Outlines -> Draft chapters (parallel)
    4. Editing: Draft -> Edited chapters (parallel)
    5. Continuity check: All chapters -> Consistency report

    Usage:
        pipeline = BookPipeline()

        # Generate just a concept
        concept = await pipeline.generate_concept("A mystery in Victorian London")

        # Generate full book with progress updates
        async for item in pipeline.generate_book("A mystery..."):
            if isinstance(item, GenerationProgress):
                print(f"Progress: {item.message}")
            elif isinstance(item, Chapter):
                print(f"Chapter {item.number} complete")
    """

    def __init__(
        self,
        model: str | None = None,
        fallback_models: list[str] | None = None,
    ):
        """
        Initialize the book pipeline.

        Args:
            model: Primary model to use (default: from PRIMARY_MODEL env var or gpt-4)
            fallback_models: Models to try if primary fails
        """
        self.model = model or os.getenv("PRIMARY_MODEL", "gpt-4")
        self.fallbacks = fallback_models or ["claude-sonnet-4-20250514", "gemini-2.5-pro"]

        # Initialize agents
        self._init_agents()

    def _init_agents(self) -> None:
        """Initialize all pipeline agents."""
        self.concept_agent: Agent[BookConcept] = Agent(
            AgentConfig(
                role="Concept Generator",
                system_prompt=CONCEPT_SYSTEM_PROMPT,
                model=self.model,
                temperature=0.7,
                max_tokens=4000,
                fallback_models=self.fallbacks,
            ),
            response_model=BookConcept,
        )

        self.outline_agent: Agent[BookOutline] = Agent(
            AgentConfig(
                role="Outline Creator",
                system_prompt=OUTLINE_SYSTEM_PROMPT,
                model=self.model,
                temperature=0.6,
                max_tokens=8000,
                fallback_models=self.fallbacks,
            ),
            response_model=BookOutline,
        )

        self.writer_agent: Agent[Chapter] = Agent(
            AgentConfig(
                role="Chapter Writer",
                system_prompt=WRITER_SYSTEM_PROMPT,
                model=self.model,
                temperature=0.8,  # More creative for writing
                max_tokens=8000,
                fallback_models=self.fallbacks,
            ),
            response_model=Chapter,
        )

        self.editor_agent: Agent[EditedChapter] = Agent(
            AgentConfig(
                role="Editor",
                system_prompt=EDITOR_SYSTEM_PROMPT,
                model=self.model,
                temperature=0.3,  # More precise for editing
                max_tokens=8000,
                fallback_models=self.fallbacks,
            ),
            response_model=EditedChapter,
        )

        self.continuity_agent: Agent[ContinuityReport] = Agent(
            AgentConfig(
                role="Continuity Checker",
                system_prompt=CONTINUITY_SYSTEM_PROMPT,
                model=self.model,
                temperature=0.2,  # Very precise for fact-checking
                max_tokens=6000,
                fallback_models=self.fallbacks,
            ),
            response_model=ContinuityReport,
        )

    # ========================================================================
    # Individual Stage Methods
    # ========================================================================

    async def generate_concept(self, brief: str) -> BookConcept:
        """
        Expand a brief into a rich book concept.

        Args:
            brief: Short description of the book idea

        Returns:
            Detailed book concept
        """
        logger.info("Generating concept from brief")
        return await self.concept_agent.run(
            f"Expand this book brief into a detailed concept:\n\n{brief}"
        )

    async def generate_outline(
        self,
        concept: BookConcept,
        num_chapters: int = 12,
    ) -> BookOutline:
        """
        Generate a complete book outline from a concept.

        Args:
            concept: The book concept to outline
            num_chapters: Target number of chapters

        Returns:
            Detailed chapter-by-chapter outline
        """
        logger.info(f"Generating {num_chapters}-chapter outline")
        return await self.outline_agent.run(
            f"Create a {num_chapters}-chapter outline for this book:",
            context={
                "title": concept.title,
                "genre": concept.genre,
                "themes": ", ".join(concept.themes),
                "setting": concept.setting,
                "time_period": concept.time_period,
                "tone": concept.tone,
                "central_conflict": concept.central_conflict,
                "unique_elements": ", ".join(concept.unique_elements),
            },
        )

    async def write_chapter(
        self,
        chapter_outline: ChapterOutline,
        book_context: dict[str, Any],
        previous_chapters: list[Chapter] | None = None,
    ) -> Chapter:
        """
        Write a single chapter based on its outline.

        Args:
            chapter_outline: The outline for this chapter
            book_context: Book-level context (title, genre, tone, etc.)
            previous_chapters: Previously written chapters for continuity

        Returns:
            The written chapter
        """
        logger.info(f"Writing chapter {chapter_outline.number}: {chapter_outline.title}")

        context = {
            **book_context,
            "chapter_number": chapter_outline.number,
            "chapter_title": chapter_outline.title,
            "chapter_summary": chapter_outline.summary,
            "key_events": ", ".join(chapter_outline.key_events),
            "characters": ", ".join(chapter_outline.characters_involved),
            "emotional_arc": chapter_outline.emotional_arc,
            "target_words": chapter_outline.estimated_word_count,
        }

        # Include summary of recent chapters for continuity
        if previous_chapters:
            recent = previous_chapters[-2:]  # Last 2 chapters
            context["previous_context"] = "\n".join(
                f"Chapter {c.number} ({c.title}): {c.content[:500]}..." for c in recent
            )

        return await self.writer_agent.run(
            "Write this chapter following the outline and maintaining consistency:",
            context=context,
        )

    async def write_chapters_parallel(
        self,
        outline: BookOutline,
        book_context: dict[str, Any],
        max_concurrent: int = 3,
    ) -> list[Chapter]:
        """
        Write all chapters with controlled parallelism.

        Args:
            outline: The complete book outline
            book_context: Book-level context
            max_concurrent: Maximum chapters to write simultaneously

        Returns:
            List of written chapters in order
        """
        logger.info(f"Writing {len(outline.chapters)} chapters (max {max_concurrent} concurrent)")

        semaphore = asyncio.Semaphore(max_concurrent)
        chapters: list[Chapter | None] = [None] * len(outline.chapters)

        async def write_with_semaphore(idx: int, chapter_outline: ChapterOutline) -> None:
            async with semaphore:
                # Get previously completed chapters for context
                prev = [c for c in chapters[:idx] if c is not None]
                chapter = await self.write_chapter(chapter_outline, book_context, prev)
                chapters[idx] = chapter

        # Create tasks for all chapters
        tasks = [
            write_with_semaphore(i, ch_outline) for i, ch_outline in enumerate(outline.chapters)
        ]

        # Execute all tasks
        await asyncio.gather(*tasks)

        # Filter out any None values (shouldn't happen, but for type safety)
        return [c for c in chapters if c is not None]

    async def edit_chapter(
        self,
        chapter: Chapter,
        style_guide: str = "",
    ) -> EditedChapter:
        """
        Edit a chapter for quality and consistency.

        Args:
            chapter: The chapter to edit
            style_guide: Optional style guidelines

        Returns:
            The edited chapter with change notes
        """
        logger.info(f"Editing chapter {chapter.number}: {chapter.title}")

        return await self.editor_agent.run(
            "Edit this chapter for quality, pacing, and consistency:",
            context={
                "chapter_number": chapter.number,
                "chapter_title": chapter.title,
                "content": chapter.content,
                "style_guide": style_guide or "Standard narrative style",
            },
        )

    async def check_continuity(
        self,
        chapters: list[Chapter],
    ) -> ContinuityReport:
        """
        Check continuity across all chapters.

        Args:
            chapters: All chapters to check

        Returns:
            Report of continuity issues and suggestions
        """
        logger.info(f"Checking continuity across {len(chapters)} chapters")

        # Create a summary of all chapters for the agent
        chapters_summary = "\n\n".join(
            (
                f"## Chapter {c.number}: {c.title}\n{c.content[:2000]}..."
                if len(c.content) > 2000
                else f"## Chapter {c.number}: {c.title}\n{c.content}"
            )
            for c in chapters
        )

        return await self.continuity_agent.run(
            "Check for continuity issues across these chapters:",
            context={"chapters": chapters_summary},
        )

    # ========================================================================
    # Full Pipeline Methods
    # ========================================================================

    async def generate_book(
        self,
        brief: str,
        num_chapters: int = 12,
        style_guide: str = "",
        skip_editing: bool = False,
        skip_continuity: bool = False,
    ) -> AsyncIterator[
        GenerationProgress | BookConcept | BookOutline | Chapter | EditedChapter | ContinuityReport
    ]:
        """
        Complete book generation pipeline with progress updates.

        Args:
            brief: Book concept brief
            num_chapters: Target number of chapters
            style_guide: Optional style guidelines for editing
            skip_editing: Skip the editing pass
            skip_continuity: Skip the continuity check

        Yields:
            GenerationProgress updates and completed artifacts
        """
        # Stage 1: Concept
        yield GenerationProgress("concept", None, 0.0, "Expanding brief into concept...")
        try:
            concept = await self.generate_concept(brief)
            yield GenerationProgress("concept", None, 1.0, f"Concept ready: {concept.title}")
            yield concept
        except AgentError as e:
            logger.error(f"Concept generation failed: {e}")
            raise

        # Stage 2: Outline
        yield GenerationProgress("outline", None, 0.0, "Generating chapter outlines...")
        try:
            outline = await self.generate_outline(concept, num_chapters)
            yield GenerationProgress(
                "outline", None, 1.0, f"Outline ready: {len(outline.chapters)} chapters"
            )
            yield outline
        except AgentError as e:
            logger.error(f"Outline generation failed: {e}")
            raise

        # Stage 3: Write chapters
        book_context = {
            "title": concept.title,
            "genre": concept.genre,
            "tone": concept.tone,
            "themes": ", ".join(concept.themes),
            "setting": concept.setting,
        }

        chapters: list[Chapter] = []
        for i, chapter_outline in enumerate(outline.chapters):
            progress = i / len(outline.chapters)
            yield GenerationProgress(
                "writing", i + 1, progress, f"Writing chapter {i + 1}: {chapter_outline.title}"
            )

            try:
                chapter = await self.write_chapter(chapter_outline, book_context, chapters)
                chapters.append(chapter)
                yield chapter
            except AgentError as e:
                logger.error(f"Chapter {i + 1} writing failed: {e}")
                raise

        yield GenerationProgress("writing", None, 1.0, "All chapters written")

        # Stage 4: Edit chapters (optional)
        edited_chapters: list[EditedChapter] = []
        if not skip_editing:
            for i, chapter in enumerate(chapters):
                progress = i / len(chapters)
                yield GenerationProgress(
                    "editing", i + 1, progress, f"Editing chapter {i + 1}: {chapter.title}"
                )

                try:
                    edited = await self.edit_chapter(chapter, style_guide)
                    edited_chapters.append(edited)
                    yield edited
                except AgentError as e:
                    logger.error(f"Chapter {i + 1} editing failed: {e}")
                    raise

            yield GenerationProgress("editing", None, 1.0, "All chapters edited")

        # Stage 5: Continuity check (optional)
        if not skip_continuity:
            yield GenerationProgress("continuity", None, 0.0, "Checking continuity...")
            try:
                # Use edited chapters if available, otherwise drafts
                check_chapters = (
                    [
                        Chapter(
                            number=e.number,
                            title=e.title,
                            content=e.content,
                            word_count=e.word_count,
                        )
                        for e in edited_chapters
                    ]
                    if edited_chapters
                    else chapters
                )
                report = await self.check_continuity(check_chapters)
                yield report
                yield GenerationProgress(
                    "continuity",
                    None,
                    1.0,
                    f"Continuity check complete: {len(report.issues)} issues found",
                )
            except AgentError as e:
                logger.error(f"Continuity check failed: {e}")
                raise

        yield GenerationProgress("complete", None, 1.0, "Book generation complete!")


# ============================================================================
# Legacy Compatibility Layer
# ============================================================================


class BookWritingAgents:
    """
    Legacy compatibility wrapper for the old CrewAI-based interface.

    This class provides the same interface as the old BookWritingAgents
    class but uses the new lightweight pipeline internally.

    Usage:
        agents = BookWritingAgents()
        concepts = await agents.generate_concepts("A mystery novel")
        outline = await agents.create_outline(brief, concepts)
        chapter = await agents.write_chapter(1, outline_str, style_guide)
    """

    def __init__(self, model: str | None = None):
        """Initialize with optional model override."""
        self.pipeline = BookPipeline(model=model)
        self.model = self.pipeline.model

    async def generate_concepts(
        self,
        brief: str,
        plot_seeds: list[str] | None = None,
    ) -> dict[str, Any]:
        """Generate rich concepts from brief and seeds."""
        full_brief = brief
        if plot_seeds:
            full_brief += f"\n\nPlot seeds to incorporate: {', '.join(plot_seeds)}"

        concept = await self.pipeline.generate_concept(full_brief)
        return {"concepts": concept.model_dump()}

    async def create_outline(
        self,
        brief: str,
        concepts: dict[str, Any],
        target_chapters: int = 10,
        style_guide: str | None = None,
    ) -> dict[str, Any]:
        """Create detailed chapter-by-chapter outline."""
        # Reconstruct concept from dict
        concept_data = concepts.get("concepts", concepts)
        if isinstance(concept_data, dict):
            concept = BookConcept.model_validate(concept_data)
        else:
            # Fallback: generate a new concept
            concept = await self.pipeline.generate_concept(brief)

        outline = await self.pipeline.generate_outline(concept, target_chapters)
        return {"outline": outline.model_dump()}

    async def write_chapter(
        self,
        chapter_number: int,
        outline: str,
        style_guide: str,
        character_bible: dict[str, Any] | None = None,
        previous_chapters: list[str] | None = None,
    ) -> str:
        """Write a single chapter based on outline."""
        # Parse outline if it's a string
        if isinstance(outline, str):
            try:
                outline_data = json.loads(outline)
            except json.JSONDecodeError:
                outline_data = {"summary": outline}
        else:
            outline_data = outline

        # Create a chapter outline
        chapter_outline = ChapterOutline(
            number=chapter_number,
            title=outline_data.get("title", f"Chapter {chapter_number}"),
            summary=outline_data.get("summary", ""),
            key_events=outline_data.get("key_events", []),
            characters_involved=outline_data.get("characters_involved", []),
            emotional_arc=outline_data.get("emotional_arc", ""),
            estimated_word_count=outline_data.get("estimated_word_count", 4000),
        )

        book_context = {
            "style_guide": style_guide,
        }
        if character_bible:
            book_context["character_bible"] = json.dumps(character_bible)

        # Convert previous chapters to Chapter objects
        prev_chapters = None
        if previous_chapters:
            prev_chapters = [
                Chapter(
                    number=i + 1,
                    title=f"Chapter {i + 1}",
                    content=content,
                    word_count=len(content.split()),
                )
                for i, content in enumerate(previous_chapters)
            ]

        chapter = await self.pipeline.write_chapter(chapter_outline, book_context, prev_chapters)
        return chapter.content

    async def edit_content(
        self,
        content: str,
        edit_type: str = "structural",
        instructions: str | None = None,
    ) -> str:
        """Edit content for structure, clarity, and impact."""
        chapter = Chapter(
            number=1,
            title="Content",
            content=content,
            word_count=len(content.split()),
        )

        style_guide = f"Edit type: {edit_type}"
        if instructions:
            style_guide += f"\nInstructions: {instructions}"

        edited = await self.pipeline.edit_chapter(chapter, style_guide)
        return edited.content

    async def check_continuity(
        self,
        chapters: list[str],
        character_bible: dict[str, Any] | None = None,
        timeline: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Check for continuity errors across chapters."""
        chapter_objects = [
            Chapter(
                number=i + 1,
                title=f"Chapter {i + 1}",
                content=content,
                word_count=len(content.split()),
            )
            for i, content in enumerate(chapters)
        ]

        report = await self.pipeline.check_continuity(chapter_objects)

        return {
            "inconsistencies": [issue.model_dump() for issue in report.issues],
            "suggestions": report.suggestions,
            "confidence_score": report.consistency_score,
        }


class ParallelChapterWriter:
    """
    Legacy compatibility wrapper for parallel chapter writing.

    Usage:
        writer = ParallelChapterWriter(BookWritingAgents())
        chapters = await writer.write_chapters_parallel(outline, style_guide)
    """

    def __init__(self, agents: BookWritingAgents):
        """Initialize with agents instance."""
        self.agents = agents
        self.pipeline = agents.pipeline

    async def write_chapters_parallel(
        self,
        outline: dict[str, Any],
        style_guide: str,
        character_bible: dict[str, Any] | None = None,
        max_parallel: int = 3,
    ) -> list[str]:
        """Write multiple chapters in parallel."""
        # Extract chapter outlines
        chapters_data = outline.get("outline", outline).get("chapters", [])

        chapter_outlines = [
            ChapterOutline(
                number=ch.get("number", i + 1),
                title=ch.get("title", f"Chapter {i + 1}"),
                summary=ch.get("summary", ""),
                key_events=ch.get("key_events", []),
                characters_involved=ch.get("characters_involved", []),
                emotional_arc=ch.get("emotional_arc", ""),
                estimated_word_count=ch.get("estimated_word_count", 4000),
            )
            for i, ch in enumerate(chapters_data)
        ]

        # Create a book outline
        book_outline = BookOutline(
            title=outline.get("title", "Untitled"),
            chapters=chapter_outlines,
            character_summaries=character_bible or {},
            plot_threads=[],
            total_estimated_words=sum(ch.estimated_word_count for ch in chapter_outlines),
        )

        book_context = {
            "style_guide": style_guide,
        }
        if character_bible:
            book_context["character_bible"] = json.dumps(character_bible)

        chapters = await self.pipeline.write_chapters_parallel(
            book_outline, book_context, max_parallel
        )

        return [ch.content for ch in chapters]
