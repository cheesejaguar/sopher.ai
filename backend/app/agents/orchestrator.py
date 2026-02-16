"""Book generation pipeline orchestrator.

This module provides the BookPipeline class that orchestrates
the complete book generation process using lightweight agents.
"""

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from .base import Agent, AgentConfig
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

    # Note: The sequential generate_book() method and legacy wrappers
    # (BookWritingAgents, ParallelChapterWriter) have been removed.
    # Use TeamLead.run_team() from app.agents.team_lead for full pipeline execution.
    # Individual stage methods above remain available for direct use.
