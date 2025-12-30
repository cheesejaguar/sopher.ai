"""AI agents for book writing workflow.

This module provides lightweight agents for book generation,
replacing the heavy CrewAI/LangChain dependencies with direct
LiteLLM calls and custom orchestration.

Main classes:
- BookPipeline: Complete book generation orchestrator
- Agent: Base agent class for LLM interactions
- BookWritingAgents: Legacy compatibility wrapper

Example usage:
    from app.agents import BookPipeline

    pipeline = BookPipeline()
    async for item in pipeline.generate_book("A mystery novel"):
        print(item)
"""

from .base import Agent, AgentAPIError, AgentConfig, AgentError, AgentResponseError, SimpleAgent
from .orchestrator import (
    BookConcept,
    BookOutline,
    BookPipeline,
    BookWritingAgents,
    Chapter,
    ChapterOutline,
    ContinuityIssue,
    ContinuityReport,
    EditedChapter,
    GenerationProgress,
    ParallelChapterWriter,
)

__all__ = [
    # Core classes
    "Agent",
    "AgentConfig",
    "SimpleAgent",
    # Exceptions
    "AgentError",
    "AgentAPIError",
    "AgentResponseError",
    # Pipeline
    "BookPipeline",
    "GenerationProgress",
    # Models
    "BookConcept",
    "BookOutline",
    "ChapterOutline",
    "Chapter",
    "EditedChapter",
    "ContinuityIssue",
    "ContinuityReport",
    # Legacy compatibility
    "BookWritingAgents",
    "ParallelChapterWriter",
]
