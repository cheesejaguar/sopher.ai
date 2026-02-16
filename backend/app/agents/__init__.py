"""AI agents for book writing workflow.

This module provides lightweight agents for book generation,
using direct LiteLLM calls and team-based orchestration.

Main classes:
- TeamLead: Team-based orchestrator with task tracking and inter-agent messaging
- TeamAgent: Team-aware agent wrapper with context optimization
- BookPipeline: Individual stage methods for book generation
- Agent: Base agent class for LLM interactions

Example usage:
    from app.agents import TeamLead, BookPipeline

    # Team-based execution (recommended):
    pipeline = BookPipeline()
    lead = TeamLead(pipeline, task_manager, message_bus, ...)
    async for event in lead.run_team(run_id, brief):
        print(event)

    # Direct stage execution:
    pipeline = BookPipeline()
    concept = await pipeline.generate_concept("A mystery novel")
"""

from .base import Agent, AgentAPIError, AgentConfig, AgentError, AgentResponseError, SimpleAgent
from .context_manager import ContextManager
from .orchestrator import (
    BookConcept,
    BookOutline,
    BookPipeline,
    Chapter,
    ChapterOutline,
    ContinuityIssue,
    ContinuityReport,
    EditedChapter,
    GenerationProgress,
)
from .team_agent import TeamAgent, TeamAgentConfig
from .team_lead import TeamLead, TeamProgressEvent

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
    # Team agents
    "TeamLead",
    "TeamAgent",
    "TeamAgentConfig",
    "TeamProgressEvent",
    "ContextManager",
    # Models
    "BookConcept",
    "BookOutline",
    "ChapterOutline",
    "Chapter",
    "EditedChapter",
    "ContinuityIssue",
    "ContinuityReport",
]
