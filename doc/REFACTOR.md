# Refactoring Plan: Replace CrewAI/LangChain with Custom Orchestration

## Executive Summary

This document outlines a refactoring plan to replace the CrewAI and LangChain dependencies with a thin, custom orchestration layer. This change will reduce dependencies by 50+, eliminate version compatibility issues, speed up CI/CD, and provide full control over agent behavior.

## Motivation

### Current Pain Points

1. **Dependency Hell**
   - CrewAI 0.80.0 requires specific versions of langchain, langchain-core, langchain-community, langchain-openai
   - Each LangChain release introduces breaking changes
   - Pip resolution takes 35+ minutes without optimization (uv)
   - Frequent pinning required: `langchain==0.3.25`, `langchain-core==0.3.63`, etc.

2. **Heavy Abstraction Overhead**
   - LangChain wraps simple API calls in multiple abstraction layers
   - Debugging requires understanding framework internals
   - Error messages are often obscured by framework stack traces

3. **Maintenance Burden**
   - CrewAI and LangChain release frequently with breaking changes
   - Requires constant dependency updates and testing
   - Security vulnerabilities in transitive dependencies

4. **CI/CD Impact**
   - Slow dependency resolution
   - Large Docker images
   - Complex caching requirements

### What We Actually Use

The current implementation uses CrewAI/LangChain for:
- Agent role definitions (system prompts)
- Task orchestration (sequential/parallel execution)
- LLM API calls with retry logic

All of these can be implemented in ~500 lines of focused code.

## Current Architecture

```
backend/app/agents/
├── agents.py              # CrewAI agent definitions (BookWritingAgents)
├── dialogue_enhancer.py   # Dialogue enhancement logic
├── genre_templates.py     # Genre-specific prompts
├── genres/                # Genre-specific agent behaviors
│   ├── fantasy.py
│   ├── mystery.py
│   ├── romance.py
│   └── thriller.py
├── plot_structures.py     # Plot structure templates
├── scene_generator.py     # Scene generation logic
├── style_profiles.py      # Writing style definitions
└── voice_profiles.py      # Voice/tone profiles
```

### Current Agent Definitions (agents.py)

```python
# Current CrewAI implementation
from crewai import Agent, Crew, Task

class BookWritingAgents:
    def __init__(self):
        self.concept_generator = Agent(
            role="Concept Generator",
            goal="Expand brief into rich concepts",
            backstory="...",
            llm=self.llm
        )
        # ... more agents
```

### Dependencies to Remove

From `requirements.txt`:
```
crewai==0.80.0
crewai-tools==0.17.0
langchain==0.3.25
langchain-core==0.3.63
langchain-community==0.3.21
langchain-openai==0.2.14
langchain-text-splitters==0.3.8
```

### Dependencies to Keep

```
litellm==1.53.3          # Model routing and fallbacks
instructor==1.3.3        # Structured outputs
openai>=1.58.1           # Direct API access
httpx==0.28.0            # Async HTTP client
tenacity>=8.2.3          # Retry logic
```

## Target Architecture

### New Directory Structure

```
backend/app/agents/
├── __init__.py
├── base.py               # Base Agent class
├── orchestrator.py       # BookPipeline orchestration
├── prompts/              # System prompts (extracted from current code)
│   ├── __init__.py
│   ├── concept.py
│   ├── outline.py
│   ├── writer.py
│   ├── editor.py
│   └── continuity.py
├── dialogue_enhancer.py  # Keep (minimal changes)
├── genre_templates.py    # Keep (no LangChain deps)
├── genres/               # Keep (no LangChain deps)
├── plot_structures.py    # Keep (no LangChain deps)
├── scene_generator.py    # Refactor to use base Agent
├── style_profiles.py     # Keep (no LangChain deps)
└── voice_profiles.py     # Keep (no LangChain deps)
```

### Core Implementation

#### 1. Base Agent Class (`base.py`)

```python
"""Base agent implementation using LiteLLM."""

import asyncio
from dataclasses import dataclass
from typing import Any, Optional, TypeVar, Generic
import litellm
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential

T = TypeVar("T", bound=BaseModel)


@dataclass
class AgentConfig:
    """Configuration for an agent."""
    role: str
    system_prompt: str
    model: str = "gpt-4"
    temperature: float = 0.7
    max_tokens: int = 4000
    fallback_models: list[str] | None = None


class Agent(Generic[T]):
    """
    Base agent that wraps LLM calls with structured output support.

    Usage:
        agent = Agent(config, response_model=ChapterOutline)
        result = await agent.run("Write an outline for chapter 1")
    """

    def __init__(
        self,
        config: AgentConfig,
        response_model: type[T] | None = None,
    ):
        self.config = config
        self.response_model = response_model
        self._setup_litellm()

    def _setup_litellm(self) -> None:
        """Configure LiteLLM with fallbacks."""
        if self.config.fallback_models:
            litellm.set_verbose = False
            # Fallbacks are handled per-request

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
    )
    async def run(
        self,
        task: str,
        context: dict[str, Any] | None = None,
        **kwargs,
    ) -> T | str:
        """
        Execute the agent's task.

        Args:
            task: The task description/prompt
            context: Optional context dict to include in the prompt
            **kwargs: Additional arguments passed to LiteLLM

        Returns:
            Structured response if response_model is set, else raw string
        """
        messages = self._build_messages(task, context)

        try:
            response = await litellm.acompletion(
                model=self.config.model,
                messages=messages,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                fallbacks=self.config.fallback_models,
                **kwargs,
            )

            content = response.choices[0].message.content

            if self.response_model:
                return self._parse_response(content)
            return content

        except Exception as e:
            # Log error and re-raise for retry
            raise

    async def stream(
        self,
        task: str,
        context: dict[str, Any] | None = None,
        **kwargs,
    ):
        """
        Stream the agent's response.

        Yields:
            Content chunks as they arrive
        """
        messages = self._build_messages(task, context)

        response = await litellm.acompletion(
            model=self.config.model,
            messages=messages,
            temperature=self.config.temperature,
            max_tokens=self.config.max_tokens,
            stream=True,
            **kwargs,
        )

        async for chunk in response:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    def _build_messages(
        self,
        task: str,
        context: dict[str, Any] | None = None,
    ) -> list[dict[str, str]]:
        """Build the message list for the LLM."""
        system_prompt = self.config.system_prompt

        if context:
            context_str = "\n".join(f"{k}: {v}" for k, v in context.items())
            user_content = f"Context:\n{context_str}\n\nTask:\n{task}"
        else:
            user_content = task

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

    def _parse_response(self, content: str) -> T:
        """Parse response into structured model using Instructor pattern."""
        import instructor
        import json

        # Try to extract JSON from response
        try:
            # Handle markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            data = json.loads(content.strip())
            return self.response_model.model_validate(data)
        except (json.JSONDecodeError, IndexError):
            # Fallback: try to parse as-is
            return self.response_model.model_validate_json(content)
```

#### 2. Book Pipeline Orchestrator (`orchestrator.py`)

```python
"""Book generation pipeline orchestrator."""

import asyncio
from dataclasses import dataclass
from typing import AsyncIterator

from pydantic import BaseModel

from .base import Agent, AgentConfig
from .prompts import (
    CONCEPT_SYSTEM_PROMPT,
    OUTLINE_SYSTEM_PROMPT,
    WRITER_SYSTEM_PROMPT,
    EDITOR_SYSTEM_PROMPT,
    CONTINUITY_SYSTEM_PROMPT,
)


# Structured output models
class BookConcept(BaseModel):
    """Expanded book concept from brief."""
    title: str
    genre: str
    themes: list[str]
    setting: str
    time_period: str
    tone: str
    target_audience: str
    unique_elements: list[str]
    central_conflict: str


class ChapterOutline(BaseModel):
    """Outline for a single chapter."""
    number: int
    title: str
    summary: str
    key_events: list[str]
    characters_involved: list[str]
    emotional_arc: str
    estimated_word_count: int


class BookOutline(BaseModel):
    """Complete book outline."""
    title: str
    chapters: list[ChapterOutline]
    character_summaries: dict[str, str]
    plot_threads: list[str]
    total_estimated_words: int


class Chapter(BaseModel):
    """Generated chapter content."""
    number: int
    title: str
    content: str
    word_count: int


class EditedChapter(BaseModel):
    """Edited chapter with improvements."""
    number: int
    title: str
    content: str
    word_count: int
    changes_made: list[str]


class ContinuityReport(BaseModel):
    """Continuity check results."""
    issues: list[dict]
    suggestions: list[str]
    consistency_score: float


@dataclass
class GenerationProgress:
    """Progress update for streaming."""
    stage: str
    chapter: int | None
    progress: float
    message: str


class BookPipeline:
    """
    Orchestrates the book generation process.

    Pipeline stages:
    1. Concept expansion: Brief -> Rich concept
    2. Outline generation: Concept -> Chapter outlines
    3. Chapter writing: Outlines -> Draft chapters (parallel)
    4. Editing: Draft -> Edited chapters (parallel)
    5. Continuity check: All chapters -> Consistency report
    """

    def __init__(
        self,
        model: str = "gpt-4",
        fallback_models: list[str] | None = None,
    ):
        self.model = model
        self.fallbacks = fallback_models or ["claude-sonnet-4-20250514", "gemini-2.5-pro"]

        # Initialize agents
        self.concept_agent = Agent[BookConcept](
            AgentConfig(
                role="Concept Generator",
                system_prompt=CONCEPT_SYSTEM_PROMPT,
                model=model,
                fallback_models=self.fallbacks,
            ),
            response_model=BookConcept,
        )

        self.outline_agent = Agent[BookOutline](
            AgentConfig(
                role="Outline Creator",
                system_prompt=OUTLINE_SYSTEM_PROMPT,
                model=model,
                fallback_models=self.fallbacks,
            ),
            response_model=BookOutline,
        )

        self.writer_agent = Agent[Chapter](
            AgentConfig(
                role="Chapter Writer",
                system_prompt=WRITER_SYSTEM_PROMPT,
                model=model,
                temperature=0.8,  # More creative for writing
                max_tokens=8000,
                fallback_models=self.fallbacks,
            ),
            response_model=Chapter,
        )

        self.editor_agent = Agent[EditedChapter](
            AgentConfig(
                role="Editor",
                system_prompt=EDITOR_SYSTEM_PROMPT,
                model=model,
                temperature=0.3,  # More precise for editing
                fallback_models=self.fallbacks,
            ),
            response_model=EditedChapter,
        )

        self.continuity_agent = Agent[ContinuityReport](
            AgentConfig(
                role="Continuity Checker",
                system_prompt=CONTINUITY_SYSTEM_PROMPT,
                model=model,
                temperature=0.2,
                fallback_models=self.fallbacks,
            ),
            response_model=ContinuityReport,
        )

    async def generate_concept(self, brief: str) -> BookConcept:
        """Expand a brief into a rich book concept."""
        return await self.concept_agent.run(
            f"Expand this book brief into a detailed concept:\n\n{brief}"
        )

    async def generate_outline(
        self,
        concept: BookConcept,
        num_chapters: int = 12,
    ) -> BookOutline:
        """Generate a complete book outline from a concept."""
        return await self.outline_agent.run(
            f"Create a {num_chapters}-chapter outline for this book:",
            context={
                "title": concept.title,
                "genre": concept.genre,
                "themes": ", ".join(concept.themes),
                "setting": concept.setting,
                "central_conflict": concept.central_conflict,
            },
        )

    async def write_chapter(
        self,
        chapter_outline: ChapterOutline,
        book_context: dict,
        previous_chapters: list[Chapter] | None = None,
    ) -> Chapter:
        """Write a single chapter based on its outline."""
        context = {
            **book_context,
            "chapter_number": chapter_outline.number,
            "chapter_title": chapter_outline.title,
            "chapter_summary": chapter_outline.summary,
            "key_events": ", ".join(chapter_outline.key_events),
            "target_words": chapter_outline.estimated_word_count,
        }

        if previous_chapters:
            # Include summary of recent chapters for continuity
            recent = previous_chapters[-2:]  # Last 2 chapters
            context["previous_context"] = "\n".join(
                f"Chapter {c.number}: {c.title}" for c in recent
            )

        return await self.writer_agent.run(
            "Write this chapter following the outline and maintaining consistency:",
            context=context,
        )

    async def write_chapters_parallel(
        self,
        outline: BookOutline,
        book_context: dict,
        max_concurrent: int = 3,
    ) -> list[Chapter]:
        """Write all chapters with controlled parallelism."""
        semaphore = asyncio.Semaphore(max_concurrent)
        chapters: list[Chapter] = []

        async def write_with_semaphore(chapter_outline: ChapterOutline) -> Chapter:
            async with semaphore:
                # Pass previously completed chapters for context
                return await self.write_chapter(
                    chapter_outline,
                    book_context,
                    previous_chapters=chapters.copy(),
                )

        # Write chapters in order but with parallelism
        tasks = [
            write_with_semaphore(ch_outline)
            for ch_outline in outline.chapters
        ]

        # Gather results maintaining order
        chapters = await asyncio.gather(*tasks)
        return list(chapters)

    async def edit_chapter(self, chapter: Chapter, style_guide: str) -> EditedChapter:
        """Edit a chapter for quality and consistency."""
        return await self.editor_agent.run(
            "Edit this chapter for quality, pacing, and consistency:",
            context={
                "chapter_number": chapter.number,
                "chapter_title": chapter.title,
                "content": chapter.content,
                "style_guide": style_guide,
            },
        )

    async def check_continuity(self, chapters: list[Chapter]) -> ContinuityReport:
        """Check continuity across all chapters."""
        chapters_summary = "\n\n".join(
            f"## Chapter {c.number}: {c.title}\n{c.content[:1000]}..."
            for c in chapters
        )

        return await self.continuity_agent.run(
            "Check for continuity issues across these chapters:",
            context={"chapters": chapters_summary},
        )

    async def generate_book(
        self,
        brief: str,
        num_chapters: int = 12,
        style_guide: str = "",
    ) -> AsyncIterator[GenerationProgress | Chapter | EditedChapter | ContinuityReport]:
        """
        Complete book generation pipeline with progress updates.

        Yields:
            GenerationProgress updates and completed artifacts
        """
        # Stage 1: Concept
        yield GenerationProgress("concept", None, 0.0, "Expanding brief into concept...")
        concept = await self.generate_concept(brief)
        yield GenerationProgress("concept", None, 1.0, f"Concept ready: {concept.title}")

        # Stage 2: Outline
        yield GenerationProgress("outline", None, 0.0, "Generating chapter outlines...")
        outline = await self.generate_outline(concept, num_chapters)
        yield GenerationProgress("outline", None, 1.0, f"Outline ready: {len(outline.chapters)} chapters")

        # Stage 3: Write chapters
        book_context = {
            "title": concept.title,
            "genre": concept.genre,
            "tone": concept.tone,
            "themes": ", ".join(concept.themes),
        }

        chapters = []
        for i, chapter_outline in enumerate(outline.chapters):
            progress = i / len(outline.chapters)
            yield GenerationProgress("writing", i + 1, progress, f"Writing chapter {i + 1}...")

            chapter = await self.write_chapter(chapter_outline, book_context, chapters)
            chapters.append(chapter)
            yield chapter

        yield GenerationProgress("writing", None, 1.0, "All chapters written")

        # Stage 4: Edit chapters
        edited_chapters = []
        for i, chapter in enumerate(chapters):
            progress = i / len(chapters)
            yield GenerationProgress("editing", i + 1, progress, f"Editing chapter {i + 1}...")

            edited = await self.edit_chapter(chapter, style_guide)
            edited_chapters.append(edited)
            yield edited

        yield GenerationProgress("editing", None, 1.0, "All chapters edited")

        # Stage 5: Continuity check
        yield GenerationProgress("continuity", None, 0.0, "Checking continuity...")
        report = await self.check_continuity(
            [Chapter(number=e.number, title=e.title, content=e.content, word_count=e.word_count)
             for e in edited_chapters]
        )
        yield report
        yield GenerationProgress("continuity", None, 1.0, "Continuity check complete")
```

#### 3. System Prompts (`prompts/__init__.py`)

```python
"""System prompts for book generation agents."""

CONCEPT_SYSTEM_PROMPT = """You are an expert book concept developer. Your role is to take a brief
book idea and expand it into a rich, detailed concept that will guide the entire writing process.

When given a brief, you should:
1. Identify the core themes and expand on them
2. Define the setting in vivid detail
3. Establish the tone and voice
4. Identify the target audience
5. Develop the central conflict
6. Suggest unique elements that will make this book stand out

Always respond with a valid JSON object matching the BookConcept schema."""


OUTLINE_SYSTEM_PROMPT = """You are an expert book outliner and story architect. Your role is to
create detailed, well-structured chapter outlines that will guide the writing process.

When creating an outline:
1. Ensure proper story structure (setup, confrontation, resolution)
2. Balance pacing across chapters
3. Create compelling chapter hooks and cliffhangers
4. Track character arcs through the chapters
5. Weave in subplots naturally
6. Estimate realistic word counts per chapter

Always respond with a valid JSON object matching the BookOutline schema."""


WRITER_SYSTEM_PROMPT = """You are a skilled fiction writer. Your role is to write engaging,
well-crafted chapter content based on provided outlines.

When writing:
1. Follow the chapter outline faithfully
2. Maintain consistent voice and tone throughout
3. Show, don't tell - use vivid sensory details
4. Create natural dialogue that reveals character
5. Build tension and maintain pacing
6. End chapters with hooks that encourage continued reading
7. Match the target word count closely

Always respond with a valid JSON object matching the Chapter schema."""


EDITOR_SYSTEM_PROMPT = """You are an expert fiction editor. Your role is to refine and improve
written chapters while preserving the author's voice.

When editing:
1. Fix grammatical and spelling errors
2. Improve sentence flow and readability
3. Enhance descriptions and sensory details
4. Tighten dialogue for authenticity
5. Ensure consistent pacing
6. Remove redundancies and filler
7. Strengthen chapter openings and endings

Document all significant changes made.

Always respond with a valid JSON object matching the EditedChapter schema."""


CONTINUITY_SYSTEM_PROMPT = """You are a continuity editor specializing in fiction. Your role is to
identify inconsistencies across chapters and ensure the story maintains internal logic.

Check for:
1. Character consistency (appearance, personality, knowledge)
2. Timeline consistency (events in proper order, realistic durations)
3. Setting consistency (locations described consistently)
4. Plot consistency (no contradictions or forgotten threads)
5. Factual consistency (details match across chapters)

Rate overall consistency and provide specific suggestions for fixes.

Always respond with a valid JSON object matching the ContinuityReport schema."""
```

## Migration Plan

### Phase 1: Create New Implementation (Week 1)

1. Create `backend/app/agents/base.py` with Agent class
2. Create `backend/app/agents/orchestrator.py` with BookPipeline
3. Create `backend/app/agents/prompts/` directory with system prompts
4. Write unit tests for new implementation

### Phase 2: Parallel Running (Week 2)

1. Add feature flag to switch between old and new implementations
2. Run both implementations in staging environment
3. Compare outputs for quality
4. Measure performance differences

### Phase 3: Integration (Week 3)

1. Update routers to use new BookPipeline
2. Migrate streaming endpoints
3. Update cost tracking integration
4. Update progress reporting

### Phase 4: Cleanup (Week 4)

1. Remove CrewAI/LangChain dependencies from requirements.txt
2. Remove old agents.py implementation
3. Update documentation
4. Update CI/CD pipeline

## Testing Strategy

### Unit Tests

```python
# tests/test_agents/test_base.py
import pytest
from unittest.mock import AsyncMock, patch
from app.agents.base import Agent, AgentConfig


@pytest.fixture
def mock_litellm():
    with patch("app.agents.base.litellm") as mock:
        mock.acompletion = AsyncMock(return_value=MockResponse("Test response"))
        yield mock


class TestAgent:
    async def test_run_returns_string_without_model(self, mock_litellm):
        agent = Agent(AgentConfig(role="test", system_prompt="You are a test agent"))
        result = await agent.run("Test task")
        assert result == "Test response"

    async def test_run_returns_model_with_response_model(self, mock_litellm):
        mock_litellm.acompletion.return_value = MockResponse('{"title": "Test"}')
        agent = Agent(
            AgentConfig(role="test", system_prompt="Test"),
            response_model=BookConcept
        )
        result = await agent.run("Test")
        assert isinstance(result, BookConcept)
```

### Integration Tests

```python
# tests/test_agents/test_orchestrator.py
@pytest.mark.integration
async def test_full_pipeline():
    pipeline = BookPipeline(model="gpt-3.5-turbo")  # Cheaper for tests

    brief = "A mystery novel set in Victorian London"

    results = []
    async for item in pipeline.generate_book(brief, num_chapters=3):
        results.append(item)

    # Check we got expected artifacts
    chapters = [r for r in results if isinstance(r, Chapter)]
    assert len(chapters) == 3
```

## Performance Expectations

### Before (CrewAI/LangChain)

- Dependencies: 150+ packages
- Docker image size: ~2GB
- pip install time: 35+ minutes (without cache)
- Import time: 3-5 seconds (lazy loading helps)

### After (Custom Implementation)

- Dependencies: ~30 packages
- Docker image size: ~800MB (estimated)
- pip install time: 2-3 minutes
- Import time: <1 second

## Risk Mitigation

1. **Quality Regression**: Run parallel comparison before cutover
2. **Missing Features**: Document all CrewAI features used, ensure coverage
3. **Streaming Issues**: Extensive testing of SSE endpoints
4. **Error Handling**: Implement robust retry and fallback logic

## Success Criteria

- [ ] All existing tests pass with new implementation
- [ ] API response quality is equivalent or better
- [ ] CI/CD pipeline runs 50%+ faster
- [ ] Docker images are 40%+ smaller
- [ ] No CrewAI/LangChain imports remain in codebase
- [ ] Documentation updated

## Rollback Plan

If issues arise after deployment:

1. Revert to previous Docker image tag
2. Re-add CrewAI/LangChain dependencies if needed
3. Feature flag allows instant rollback without code changes

## Appendix: Files to Modify

### Files to Delete
- `backend/app/agents/agents.py` (after migration complete)

### Files to Create
- `backend/app/agents/base.py`
- `backend/app/agents/orchestrator.py`
- `backend/app/agents/prompts/__init__.py`
- `backend/app/agents/prompts/concept.py`
- `backend/app/agents/prompts/outline.py`
- `backend/app/agents/prompts/writer.py`
- `backend/app/agents/prompts/editor.py`
- `backend/app/agents/prompts/continuity.py`
- `backend/tests/test_agents/test_base.py`
- `backend/tests/test_agents/test_orchestrator.py`

### Files to Modify
- `backend/requirements.txt` (remove CrewAI/LangChain)
- `backend/pyproject.toml` (remove CrewAI/LangChain)
- `backend/app/routers/outline.py` (use new pipeline)
- `backend/app/routers/chapters.py` (use new pipeline)
- `backend/Dockerfile` (smaller image)

### Dependencies to Remove from requirements.txt
```diff
- crewai==0.80.0
- crewai-tools==0.17.0
- langchain==0.3.25
- langchain-core==0.3.63
- langchain-community==0.3.21
- langchain-openai==0.2.14
- langchain-text-splitters==0.3.8
```
