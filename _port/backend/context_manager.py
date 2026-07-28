"""Context Manager for smart context windowing.

Manages shared context between agents with token-budget-aware loading.
Each agent role has different context needs, and this module ensures
agents receive the most relevant information within their token budget.
"""

import json
import logging
from enum import IntEnum
from typing import Any, Optional
from uuid import UUID

from ..cache import RedisCache

logger = logging.getLogger(__name__)

# Redis key TTL for team context (4 hours)
TEAM_TTL = 14400

# Approximate tokens per character ratio (conservative estimate)
CHARS_PER_TOKEN = 4


class ContextPriority(IntEnum):
    """Priority levels for context items."""

    CRITICAL = 0  # Must include, never truncate
    HIGH = 1  # Include if space allows
    MEDIUM = 2  # Include summarized if needed
    LOW = 3  # Include only if plenty of space


# Role-specific context requirements: (context_key, priority)
ROLE_CONTEXT_MAP: dict[str, list[tuple[str, ContextPriority]]] = {
    "concept_generator": [
        ("brief", ContextPriority.CRITICAL),
        ("settings", ContextPriority.HIGH),
        ("writing_influences", ContextPriority.MEDIUM),
    ],
    "outliner": [
        ("concept", ContextPriority.CRITICAL),
        ("brief", ContextPriority.CRITICAL),
        ("character_profiles", ContextPriority.HIGH),
        ("world_building", ContextPriority.HIGH),
        ("style_guide", ContextPriority.MEDIUM),
    ],
    "writer": [
        ("chapter_outline", ContextPriority.CRITICAL),
        ("style_guide", ContextPriority.CRITICAL),
        ("prev_chapter_summaries", ContextPriority.HIGH),
        ("character_bible", ContextPriority.HIGH),
        ("agent_style_notes", ContextPriority.MEDIUM),
        ("agent_messages", ContextPriority.MEDIUM),
    ],
    "editor": [
        ("chapter_content", ContextPriority.CRITICAL),
        ("style_guide", ContextPriority.CRITICAL),
        ("writer_style_notes", ContextPriority.HIGH),
        ("chapter_outline", ContextPriority.MEDIUM),
        ("agent_messages", ContextPriority.MEDIUM),
    ],
    "continuity_checker": [
        ("all_chapter_summaries", ContextPriority.CRITICAL),
        ("character_bible", ContextPriority.HIGH),
        ("timeline", ContextPriority.HIGH),
        ("full_chapters_sampled", ContextPriority.MEDIUM),
        ("style_guide", ContextPriority.LOW),
    ],
}


def estimate_tokens(text: str) -> int:
    """Estimate token count from text length."""
    return max(1, len(text) // CHARS_PER_TOKEN)


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    """Truncate text to approximately fit within a token budget."""
    max_chars = max_tokens * CHARS_PER_TOKEN
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n[...truncated]"


class ContextManager:
    """Manages shared context with token-budget-aware loading.

    Provides:
    - Per-role context loading with priority-based allocation
    - Shared context storage and retrieval via Redis
    - Summarization/truncation for context that exceeds budgets
    - Result publishing for downstream agents
    """

    def __init__(self, redis: RedisCache):
        self.redis = redis

    async def store_context(
        self,
        team_run_id: UUID,
        context_key: str,
        content: Any,
        ttl: int = TEAM_TTL,
    ) -> None:
        """Store a context item in Redis for the team.

        Args:
            team_run_id: The team run ID.
            context_key: Key identifying the context type.
            content: Content to store (will be JSON-serialized).
            ttl: Time-to-live in seconds.
        """
        redis_key = f"team:{team_run_id}:context:{context_key}"
        if isinstance(content, str):
            await self.redis.redis.set(redis_key, content, ex=ttl)
        else:
            await self.redis.redis.set(redis_key, json.dumps(content), ex=ttl)

    async def get_context(
        self,
        team_run_id: UUID,
        context_key: str,
    ) -> Optional[Any]:
        """Retrieve a context item from Redis.

        Args:
            team_run_id: The team run ID.
            context_key: Key identifying the context type.

        Returns:
            The stored content, or None if not found.
        """
        redis_key = f"team:{team_run_id}:context:{context_key}"
        raw = await self.redis.redis.get(redis_key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return raw

    async def load_context_for_role(
        self,
        team_run_id: UUID,
        role: str,
        max_tokens: int = 6000,
        extra_context: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Load context for a specific agent role within token budget.

        Loads context items by priority. Critical items are always included.
        High/medium items are included if space allows, with summarization
        applied to lower-priority items when needed.

        Args:
            team_run_id: The team run ID.
            role: Agent role name.
            max_tokens: Maximum token budget for context.
            extra_context: Additional context to merge (e.g., task-specific input).

        Returns:
            Dict of context key -> content, within the token budget.
        """
        context: dict[str, Any] = {}
        tokens_used = 0

        # Start with any extra context
        if extra_context:
            for key, value in extra_context.items():
                value_str = json.dumps(value) if not isinstance(value, str) else value
                token_cost = estimate_tokens(value_str)
                if tokens_used + token_cost <= max_tokens:
                    context[key] = value
                    tokens_used += token_cost

        # Load role-specific context by priority
        role_items = ROLE_CONTEXT_MAP.get(role, [])
        for context_key, priority in role_items:
            remaining = max_tokens - tokens_used
            if remaining <= 100:
                break  # No meaningful space left

            content = await self.get_context(team_run_id, context_key)
            if content is None:
                continue

            content_str = json.dumps(content) if not isinstance(content, str) else content
            token_cost = estimate_tokens(content_str)

            if token_cost <= remaining:
                # Fits within budget
                context[context_key] = content
                tokens_used += token_cost
            elif priority == ContextPriority.CRITICAL:
                # Must include critical context, truncate if necessary
                truncated = truncate_to_tokens(content_str, remaining)
                context[context_key] = truncated
                tokens_used += estimate_tokens(truncated)
            elif priority in (ContextPriority.MEDIUM, ContextPriority.LOW):
                # Summarize to fit
                summary_budget = min(remaining // 2, 500)
                if summary_budget > 50:
                    summarized = self._summarize(content_str, summary_budget)
                    context[context_key] = summarized
                    tokens_used += estimate_tokens(summarized)
            elif priority == ContextPriority.HIGH:
                # Truncate high-priority to fit
                truncated = truncate_to_tokens(content_str, remaining)
                context[context_key] = truncated
                tokens_used += estimate_tokens(truncated)

        logger.debug(
            f"Loaded context for {role}: {tokens_used}/{max_tokens} tokens, "
            f"{len(context)} items"
        )
        return context

    async def publish_result(
        self,
        team_run_id: UUID,
        role: str,
        task_type: str,
        result: Any,
        chapter_number: Optional[int] = None,
    ) -> None:
        """Publish an agent's result to shared context for other agents.

        Stores a compressed summary in Redis. Different result types
        are stored under different context keys.

        Args:
            team_run_id: The team run ID.
            role: Agent role that produced the result.
            task_type: The task type (concept, outline, write_chapter, etc.)
            result: The result object or string.
            chapter_number: Chapter number if applicable.
        """
        if task_type == "concept":
            # Store full concept for outliner
            await self.store_context(team_run_id, "concept", result)

        elif task_type == "outline":
            # Store full outline and extract character/plot info
            await self.store_context(team_run_id, "outline", result)

            # Extract character bible from outline if available
            if isinstance(result, dict):
                chars = result.get("character_summaries", {})
                if chars:
                    await self.store_context(team_run_id, "character_bible", chars)

        elif task_type == "write_chapter" and chapter_number is not None:
            # Store full chapter content for the editor
            content = result if isinstance(result, str) else str(result)
            content_key = f"chapter_content:{chapter_number}"
            await self.store_context(team_run_id, content_key, content)

            # Store summary for other agents (continuity, etc.)
            summary = self._summarize_chapter(content)
            ch_key = f"chapter_summary:{chapter_number}"
            await self.store_context(team_run_id, ch_key, summary)

            # Update aggregated chapter summaries
            await self._update_all_chapter_summaries(team_run_id, chapter_number, summary)

        elif task_type == "edit_chapter" and chapter_number is not None:
            # Store full edited content
            content = result if isinstance(result, str) else str(result)
            content_key = f"chapter_content:{chapter_number}"
            await self.store_context(team_run_id, content_key, content)

            # Update summary with edited version
            summary = self._summarize_chapter(content)
            ch_key = f"chapter_summary:{chapter_number}"
            await self.store_context(team_run_id, ch_key, summary)
            await self._update_all_chapter_summaries(team_run_id, chapter_number, summary)

        elif task_type == "continuity_check":
            await self.store_context(team_run_id, "continuity_report", result)

    async def store_chapter_outline(
        self,
        team_run_id: UUID,
        chapter_number: int,
        outline_data: dict[str, Any],
    ) -> None:
        """Store a single chapter's outline for the writer agent.

        Args:
            team_run_id: The team run ID.
            chapter_number: The chapter number.
            outline_data: The chapter outline data.
        """
        key = f"chapter_outline:{chapter_number}"
        await self.store_context(team_run_id, key, outline_data)

    async def store_chapter_content(
        self,
        team_run_id: UUID,
        chapter_number: int,
        content: str,
    ) -> None:
        """Store chapter content for the editor agent.

        Args:
            team_run_id: The team run ID.
            chapter_number: The chapter number.
            content: The chapter text content.
        """
        key = f"chapter_content:{chapter_number}"
        await self.store_context(team_run_id, key, content)

    async def get_previous_chapter_summaries(
        self,
        team_run_id: UUID,
        current_chapter: int,
        count: int = 2,
    ) -> Optional[str]:
        """Get summaries of previous chapters for continuity.

        Args:
            team_run_id: The team run ID.
            current_chapter: The current chapter being written.
            count: Number of previous chapter summaries to retrieve.

        Returns:
            Combined summary string, or None if no previous chapters.
        """
        summaries = []
        for ch_num in range(max(1, current_chapter - count), current_chapter):
            ch_key = f"chapter_summary:{ch_num}"
            summary = await self.get_context(team_run_id, ch_key)
            if summary:
                summaries.append(f"Chapter {ch_num}: {summary}")

        if summaries:
            return "\n\n".join(summaries)
        return None

    async def cleanup(self, team_run_id: UUID) -> None:
        """Clean up all Redis context keys for a team run.

        Args:
            team_run_id: The team run ID.
        """
        pattern = f"team:{team_run_id}:context:*"
        cursor = 0
        while True:
            cursor, keys = await self.redis.redis.scan(cursor, match=pattern, count=100)
            if keys:
                await self.redis.redis.delete(*keys)
            if cursor == 0:
                break
        logger.info(f"Cleaned up context for run {team_run_id}")

    def _summarize(self, content: str, max_tokens: int) -> str:
        """Compress content to fit within a token budget.

        Extracts key sections and truncates the rest.

        Args:
            content: Full content string.
            max_tokens: Target token budget.

        Returns:
            Summarized content.
        """
        max_chars = max_tokens * CHARS_PER_TOKEN
        if len(content) <= max_chars:
            return content

        # Take beginning and end
        half = max_chars // 2
        return content[:half] + "\n[...]\n" + content[-half:]

    def _summarize_chapter(self, content: str, max_chars: int = 1000) -> str:
        """Summarize a chapter for context sharing.

        Extracts first paragraph and last paragraph.

        Args:
            content: Full chapter text.
            max_chars: Maximum character count for summary.

        Returns:
            Chapter summary string.
        """
        if len(content) <= max_chars:
            return content

        paragraphs = content.split("\n\n")
        paragraphs = [p.strip() for p in paragraphs if p.strip()]

        if len(paragraphs) <= 2:
            return content[:max_chars]

        first = paragraphs[0]
        last = paragraphs[-1]
        budget_per = max_chars // 2

        return first[:budget_per] + "\n[...]\n" + last[:budget_per]

    async def _update_all_chapter_summaries(
        self,
        team_run_id: UUID,
        chapter_number: int,
        summary: str,
    ) -> None:
        """Update the aggregated 'all_chapter_summaries' context.

        Used by the continuity checker to see all chapters at once.

        Args:
            team_run_id: The team run ID.
            chapter_number: The chapter number that was updated.
            summary: The chapter summary.
        """
        all_key = "all_chapter_summaries"
        existing = await self.get_context(team_run_id, all_key)

        if existing and isinstance(existing, dict):
            existing[str(chapter_number)] = summary
        else:
            existing = {str(chapter_number): summary}

        await self.store_context(team_run_id, all_key, existing)
