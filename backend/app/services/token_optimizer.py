"""Token usage optimization for LLM generation.

This module provides utilities for:
- Context window optimization
- Prompt compression
- Smart context selection
- Token counting and budgeting
"""

import re
from dataclasses import dataclass, field
from enum import Enum


class TokenBudgetPriority(Enum):
    """Priority levels for content in token budget allocation."""

    CRITICAL = "critical"  # Must include (e.g., user instructions)
    HIGH = "high"  # Important context
    MEDIUM = "medium"  # Helpful but can be summarized
    LOW = "low"  # Nice to have, can be truncated/removed


class ContentType(Enum):
    """Types of content for context management."""

    SYSTEM_PROMPT = "system_prompt"
    USER_INSTRUCTION = "user_instruction"
    PREVIOUS_CONTENT = "previous_content"
    CHARACTER_CONTEXT = "character_context"
    WORLD_CONTEXT = "world_context"
    STYLE_GUIDE = "style_guide"
    OUTLINE = "outline"
    CHAPTER_SUMMARY = "chapter_summary"


@dataclass
class TokenBudget:
    """Token budget allocation for a generation request."""

    total_limit: int
    reserved_for_output: int
    allocated: dict[str, int] = field(default_factory=dict)

    @property
    def available_for_input(self) -> int:
        """Tokens available for input context."""
        return self.total_limit - self.reserved_for_output

    @property
    def used(self) -> int:
        """Total tokens currently allocated."""
        return sum(self.allocated.values())

    @property
    def remaining(self) -> int:
        """Remaining tokens for input."""
        return self.available_for_input - self.used

    def allocate(self, name: str, tokens: int) -> bool:
        """Allocate tokens for a content item. Returns True if successful."""
        if tokens <= self.remaining:
            self.allocated[name] = tokens
            return True
        return False

    def deallocate(self, name: str) -> int:
        """Deallocate tokens for a content item. Returns deallocated amount."""
        return self.allocated.pop(name, 0)


@dataclass
class ContentItem:
    """A piece of content for the context window."""

    name: str
    content: str
    content_type: ContentType
    priority: TokenBudgetPriority
    token_count: int = 0
    can_summarize: bool = True
    can_truncate: bool = True
    minimum_tokens: int = 0  # Minimum if summarized


class TokenCounter:
    """Estimates token counts for text."""

    def __init__(self, chars_per_token: float = 4.0):
        """Initialize with average characters per token.

        Default of 4.0 is a reasonable approximation for English text.
        Use 3.5 for code-heavy content or 4.5 for prose.
        """
        self.chars_per_token = chars_per_token

    def count(self, text: str) -> int:
        """Estimate token count for text."""
        if not text:
            return 0
        return int(len(text) / self.chars_per_token)

    def count_with_overhead(self, text: str, overhead: int = 10) -> int:
        """Count tokens with safety overhead for formatting."""
        return self.count(text) + overhead


class TextCompressor:
    """Compresses text while preserving key information."""

    def __init__(self, token_counter: TokenCounter | None = None):
        self.counter = token_counter or TokenCounter()

    def compress_whitespace(self, text: str) -> str:
        """Remove excessive whitespace."""
        # Collapse multiple spaces
        text = re.sub(r" {2,}", " ", text)
        # Collapse multiple newlines
        text = re.sub(r"\n{3,}", "\n\n", text)
        # Remove trailing whitespace
        text = re.sub(r"[ \t]+\n", "\n", text)
        return text.strip()

    def remove_filler(self, text: str) -> str:
        """Remove common filler words and phrases."""
        fillers = [
            r"\bvery\b",
            r"\breally\b",
            r"\bactually\b",
            r"\bbasically\b",
            r"\bjust\b",
            r"\bkind of\b",
            r"\bsort of\b",
            r"\byou know\b",
            r"\bI mean\b",
            r"\blike\b(?=\s)",  # Only standalone "like"
        ]
        for filler in fillers:
            text = re.sub(filler, "", text, flags=re.IGNORECASE)
        # Clean up double spaces created by removal
        text = re.sub(r" {2,}", " ", text)
        return text.strip()

    def abbreviate_common_phrases(self, text: str) -> str:
        """Replace common phrases with shorter versions."""
        replacements = [
            (r"in order to", "to"),
            (r"due to the fact that", "because"),
            (r"at this point in time", "now"),
            (r"in the event that", "if"),
            (r"with regard to", "about"),
            (r"in terms of", "regarding"),
            (r"a large number of", "many"),
            (r"a small number of", "few"),
            (r"the majority of", "most"),
            (r"in spite of", "despite"),
        ]
        for pattern, replacement in replacements:
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        return text

    def compress(self, text: str, aggressive: bool = False) -> str:
        """Apply compression techniques to text."""
        text = self.compress_whitespace(text)
        if aggressive:
            text = self.remove_filler(text)
            text = self.abbreviate_common_phrases(text)
        return text

    def truncate_to_tokens(self, text: str, max_tokens: int) -> str:
        """Truncate text to approximately max_tokens."""
        if self.counter.count(text) <= max_tokens:
            return text

        # Estimate character limit
        char_limit = int(max_tokens * self.counter.chars_per_token)

        # Try to truncate at sentence boundary
        truncated = text[:char_limit]
        last_period = truncated.rfind(".")
        last_newline = truncated.rfind("\n")

        boundary = max(last_period, last_newline)
        if boundary > char_limit * 0.7:  # Only use boundary if it's not too far back
            truncated = truncated[: boundary + 1]

        return truncated.strip()


class SummarizerTemplate:
    """Templates for summarizing different content types."""

    @staticmethod
    def summarize_chapter(content: str, max_sentences: int = 3) -> str:
        """Extract key sentences from a chapter."""
        sentences = re.split(r"[.!?]+", content)
        sentences = [s.strip() for s in sentences if s.strip()]

        if len(sentences) <= max_sentences:
            return content

        # Take first sentence (usually establishes scene)
        # and last sentences (usually the important conclusion)
        if max_sentences == 1:
            return sentences[0] + "."
        elif max_sentences == 2:
            return sentences[0] + ". " + sentences[-1] + "."
        else:
            middle_idx = len(sentences) // 2
            return sentences[0] + ". " + sentences[middle_idx] + ". " + sentences[-1] + "."

    @staticmethod
    def summarize_outline(outline: str, max_chapters: int = 5) -> str:
        """Summarize an outline to key chapters only."""
        chapters = re.split(r"(?=Chapter \d+|#{1,3}\s)", outline)
        chapters = [c.strip() for c in chapters if c.strip()]

        if len(chapters) <= max_chapters:
            return outline

        # Keep first, last, and evenly distributed middle chapters
        indices = [0]
        if max_chapters > 2:
            step = len(chapters) // (max_chapters - 1)
            for i in range(1, max_chapters - 1):
                indices.append(i * step)
        indices.append(len(chapters) - 1)

        selected = [chapters[i] for i in sorted(set(indices))]
        return "\n\n".join(selected)

    @staticmethod
    def summarize_character_context(context: str, max_chars: int = 500) -> str:
        """Summarize character context to essential attributes."""
        if len(context) <= max_chars:
            return context

        # Extract key attribute lines
        lines = context.split("\n")
        key_patterns = [
            r"name",
            r"role",
            r"appearance",
            r"personality",
            r"motivation",
            r"relationship",
        ]

        key_lines = []
        for line in lines:
            if any(re.search(p, line, re.IGNORECASE) for p in key_patterns):
                key_lines.append(line.strip())

        result = "\n".join(key_lines[:10])
        if len(result) > max_chars:
            return result[:max_chars] + "..."
        return result


class ContextWindowOptimizer:
    """Optimizes content for the context window."""

    def __init__(
        self,
        token_counter: TokenCounter | None = None,
        compressor: TextCompressor | None = None,
    ):
        self.counter = token_counter or TokenCounter()
        self.compressor = compressor or TextCompressor(self.counter)
        self.summarizer = SummarizerTemplate()

    def optimize_context(
        self,
        items: list[ContentItem],
        budget: TokenBudget,
    ) -> list[ContentItem]:
        """Optimize content items to fit within token budget.

        Returns items that fit, potentially summarized or truncated.
        """
        # Sort by priority (critical first)
        priority_order = {
            TokenBudgetPriority.CRITICAL: 0,
            TokenBudgetPriority.HIGH: 1,
            TokenBudgetPriority.MEDIUM: 2,
            TokenBudgetPriority.LOW: 3,
        }
        sorted_items = sorted(items, key=lambda x: priority_order[x.priority])

        result = []
        for item in sorted_items:
            # Update token count after compression
            compressed = self.compressor.compress(item.content)
            item.content = compressed
            item.token_count = self.counter.count(compressed)

            if budget.allocate(item.name, item.token_count):
                result.append(item)
            elif item.priority == TokenBudgetPriority.CRITICAL:
                # Critical items must be included - truncate if needed
                available = budget.remaining
                if available > item.minimum_tokens:
                    truncated = self.compressor.truncate_to_tokens(item.content, available)
                    item.content = truncated
                    item.token_count = self.counter.count(truncated)
                    budget.allocate(item.name, item.token_count)
                    result.append(item)
            elif item.can_summarize and budget.remaining > item.minimum_tokens:
                # Try summarizing
                summarized = self._summarize_item(item, budget.remaining)
                if summarized:
                    item.content = summarized
                    item.token_count = self.counter.count(summarized)
                    budget.allocate(item.name, item.token_count)
                    result.append(item)
            elif item.can_truncate and budget.remaining > item.minimum_tokens:
                # Try truncating
                truncated = self.compressor.truncate_to_tokens(item.content, budget.remaining)
                item.content = truncated
                item.token_count = self.counter.count(truncated)
                budget.allocate(item.name, item.token_count)
                result.append(item)

        return result

    def _summarize_item(self, item: ContentItem, max_tokens: int) -> str | None:
        """Summarize an item based on its content type."""
        if item.content_type == ContentType.CHAPTER_SUMMARY:
            return self.summarizer.summarize_chapter(item.content, max_sentences=2)
        elif item.content_type == ContentType.PREVIOUS_CONTENT:
            return self.summarizer.summarize_chapter(item.content, max_sentences=3)
        elif item.content_type == ContentType.OUTLINE:
            return self.summarizer.summarize_outline(item.content, max_chapters=3)
        elif item.content_type == ContentType.CHARACTER_CONTEXT:
            char_limit = int(max_tokens * self.counter.chars_per_token)
            return self.summarizer.summarize_character_context(item.content, max_chars=char_limit)
        else:
            # Default: truncate
            return self.compressor.truncate_to_tokens(item.content, max_tokens)


class SmartContextSelector:
    """Intelligently selects context based on relevance."""

    def __init__(self, token_counter: TokenCounter | None = None):
        self.counter = token_counter or TokenCounter()

    def select_relevant_chapters(
        self,
        all_chapters: list[tuple[int, str]],  # (chapter_num, summary)
        current_chapter: int,
        max_chapters: int = 3,
    ) -> list[tuple[int, str]]:
        """Select most relevant previous chapters for context.

        Prioritizes:
        1. Immediately preceding chapter
        2. First chapter (establishes story)
        3. Chapters with high relevance (if detectable)
        """
        if not all_chapters or current_chapter <= 1:
            return []

        # Filter to chapters before current
        previous = [(n, s) for n, s in all_chapters if n < current_chapter]
        if not previous:
            return []

        if len(previous) <= max_chapters:
            return previous

        selected = []

        # Always include immediately preceding chapter
        preceding = [(n, s) for n, s in previous if n == current_chapter - 1]
        if preceding:
            selected.append(preceding[0])

        # Include first chapter for story foundation
        first = [(n, s) for n, s in previous if n == 1]
        if first and first[0] not in selected:
            selected.append(first[0])

        # Fill remaining slots with evenly distributed chapters
        remaining_slots = max_chapters - len(selected)
        if remaining_slots > 0:
            remaining = [c for c in previous if c not in selected]
            if remaining:
                step = max(1, len(remaining) // remaining_slots)
                for i in range(0, len(remaining), step):
                    if len(selected) < max_chapters:
                        selected.append(remaining[i])

        return sorted(selected, key=lambda x: x[0])

    def select_relevant_characters(
        self,
        all_characters: list[tuple[str, str, int]],  # (name, info, mention_count)
        chapter_mentions: list[str],  # Characters mentioned in current chapter outline
        max_characters: int = 5,
    ) -> list[tuple[str, str]]:
        """Select most relevant characters for context.

        Prioritizes:
        1. Characters mentioned in current chapter
        2. Most frequently mentioned characters overall
        """
        if not all_characters:
            return []

        # Score characters
        scored = []
        for name, info, count in all_characters:
            score = count  # Base score from overall mentions
            if name.lower() in [m.lower() for m in chapter_mentions]:
                score += 1000  # Big boost for current chapter mentions
            scored.append((name, info, score))

        # Sort by score (descending) and take top N
        scored.sort(key=lambda x: x[2], reverse=True)
        return [(name, info) for name, info, _ in scored[:max_characters]]


@dataclass
class OptimizationResult:
    """Result of context optimization."""

    items: list[ContentItem]
    total_tokens: int
    budget_used_percent: float
    items_included: int
    items_summarized: int
    items_truncated: int
    items_dropped: int


class TokenOptimizer:
    """Main optimizer for token usage in generation requests."""

    def __init__(
        self,
        model_context_limit: int = 128000,
        default_output_reserve: int = 4000,
        chars_per_token: float = 4.0,
    ):
        self.model_context_limit = model_context_limit
        self.default_output_reserve = default_output_reserve
        self.counter = TokenCounter(chars_per_token)
        self.compressor = TextCompressor(self.counter)
        self.context_optimizer = ContextWindowOptimizer(self.counter, self.compressor)
        self.context_selector = SmartContextSelector(self.counter)

    def create_budget(
        self,
        output_tokens: int | None = None,
        context_limit: int | None = None,
    ) -> TokenBudget:
        """Create a token budget for a generation request."""
        return TokenBudget(
            total_limit=context_limit or self.model_context_limit,
            reserved_for_output=output_tokens or self.default_output_reserve,
        )

    def optimize(
        self,
        items: list[ContentItem],
        budget: TokenBudget | None = None,
    ) -> OptimizationResult:
        """Optimize content items to fit within token budget."""
        if budget is None:
            budget = self.create_budget()

        # Count original items
        original_count = len(items)
        original_tokens = sum(self.counter.count(i.content) for i in items)

        # Optimize
        optimized = self.context_optimizer.optimize_context(items, budget)

        # Calculate statistics
        included = len(optimized)
        dropped = original_count - included
        summarized = sum(
            1
            for i in optimized
            if self.counter.count(i.content) < original_tokens // max(1, original_count) * 0.5
        )
        truncated = sum(1 for i in optimized if i.content.endswith("..."))

        return OptimizationResult(
            items=optimized,
            total_tokens=budget.used,
            budget_used_percent=(
                budget.used / budget.available_for_input * 100
                if budget.available_for_input > 0
                else 0
            ),
            items_included=included,
            items_summarized=summarized,
            items_truncated=truncated,
            items_dropped=dropped,
        )

    def estimate_generation_tokens(
        self,
        target_word_count: int,
        overhead_percent: float = 10.0,
    ) -> int:
        """Estimate tokens needed for generating content.

        Assumes approximately 0.75 tokens per word (words are longer than tokens on average).
        """
        base_tokens = int(target_word_count * 0.75)
        overhead = int(base_tokens * overhead_percent / 100)
        return base_tokens + overhead
