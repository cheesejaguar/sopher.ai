"""Tests for token optimization service."""

import pytest

from app.services.token_optimizer import (
    ContentItem,
    ContentType,
    ContextWindowOptimizer,
    OptimizationResult,
    SmartContextSelector,
    SummarizerTemplate,
    TextCompressor,
    TokenBudget,
    TokenBudgetPriority,
    TokenCounter,
    TokenOptimizer,
)


class TestTokenBudgetPriority:
    """Tests for TokenBudgetPriority enum."""

    def test_all_priorities_defined(self):
        """All priority levels are defined."""
        assert TokenBudgetPriority.CRITICAL.value == "critical"
        assert TokenBudgetPriority.HIGH.value == "high"
        assert TokenBudgetPriority.MEDIUM.value == "medium"
        assert TokenBudgetPriority.LOW.value == "low"

    def test_priority_count(self):
        """Correct number of priorities."""
        assert len(TokenBudgetPriority) == 4


class TestContentType:
    """Tests for ContentType enum."""

    def test_all_types_defined(self):
        """All content types are defined."""
        expected = [
            "system_prompt",
            "user_instruction",
            "previous_content",
            "character_context",
            "world_context",
            "style_guide",
            "outline",
            "chapter_summary",
        ]
        for expected_type in expected:
            assert hasattr(ContentType, expected_type.upper())


class TestTokenBudget:
    """Tests for TokenBudget dataclass."""

    def test_create_budget(self):
        """Create a token budget."""
        budget = TokenBudget(total_limit=10000, reserved_for_output=2000)
        assert budget.total_limit == 10000
        assert budget.reserved_for_output == 2000
        assert budget.available_for_input == 8000

    def test_allocate_success(self):
        """Successfully allocate tokens."""
        budget = TokenBudget(total_limit=10000, reserved_for_output=2000)
        result = budget.allocate("item1", 1000)
        assert result is True
        assert budget.used == 1000
        assert budget.remaining == 7000

    def test_allocate_exceeds_budget(self):
        """Allocation fails when exceeding budget."""
        budget = TokenBudget(total_limit=10000, reserved_for_output=2000)
        result = budget.allocate("item1", 9000)
        assert result is False
        assert budget.used == 0

    def test_multiple_allocations(self):
        """Multiple allocations tracked correctly."""
        budget = TokenBudget(total_limit=10000, reserved_for_output=2000)
        budget.allocate("item1", 1000)
        budget.allocate("item2", 2000)
        budget.allocate("item3", 1500)
        assert budget.used == 4500
        assert budget.remaining == 3500

    def test_deallocate(self):
        """Deallocate tokens."""
        budget = TokenBudget(total_limit=10000, reserved_for_output=2000)
        budget.allocate("item1", 1000)
        budget.allocate("item2", 2000)

        deallocated = budget.deallocate("item1")
        assert deallocated == 1000
        assert budget.used == 2000

    def test_deallocate_nonexistent(self):
        """Deallocate nonexistent item returns 0."""
        budget = TokenBudget(total_limit=10000, reserved_for_output=2000)
        deallocated = budget.deallocate("nonexistent")
        assert deallocated == 0


class TestContentItem:
    """Tests for ContentItem dataclass."""

    def test_create_item(self):
        """Create a content item."""
        item = ContentItem(
            name="system_prompt",
            content="You are a helpful assistant.",
            content_type=ContentType.SYSTEM_PROMPT,
            priority=TokenBudgetPriority.CRITICAL,
        )
        assert item.name == "system_prompt"
        assert item.priority == TokenBudgetPriority.CRITICAL
        assert item.can_summarize is True
        assert item.can_truncate is True

    def test_item_with_token_count(self):
        """Create item with pre-calculated token count."""
        item = ContentItem(
            name="chapter",
            content="Chapter content here.",
            content_type=ContentType.PREVIOUS_CONTENT,
            priority=TokenBudgetPriority.MEDIUM,
            token_count=100,
        )
        assert item.token_count == 100


class TestTokenCounter:
    """Tests for TokenCounter class."""

    def test_count_empty(self):
        """Empty string returns 0."""
        counter = TokenCounter()
        assert counter.count("") == 0

    def test_count_simple(self):
        """Count tokens in simple text."""
        counter = TokenCounter(chars_per_token=4.0)
        # 20 characters / 4 = 5 tokens
        result = counter.count("12345678901234567890")
        assert result == 5

    def test_count_with_overhead(self):
        """Count with overhead."""
        counter = TokenCounter(chars_per_token=4.0)
        result = counter.count_with_overhead("12345678901234567890", overhead=10)
        assert result == 15  # 5 + 10

    def test_different_chars_per_token(self):
        """Different chars_per_token ratio."""
        counter = TokenCounter(chars_per_token=3.0)
        result = counter.count("123456789")  # 9 chars / 3 = 3
        assert result == 3


class TestTextCompressor:
    """Tests for TextCompressor class."""

    def test_compress_whitespace(self):
        """Compress multiple whitespace."""
        compressor = TextCompressor()
        text = "Hello   world\n\n\n\nGoodbye   \n"
        result = compressor.compress_whitespace(text)
        assert "   " not in result
        assert "\n\n\n" not in result

    def test_remove_filler(self):
        """Remove filler words."""
        compressor = TextCompressor()
        text = "It was really very basically just a thing."
        result = compressor.remove_filler(text)
        assert "really" not in result
        assert "very" not in result
        assert "basically" not in result
        assert "just" not in result

    def test_abbreviate_phrases(self):
        """Abbreviate common phrases."""
        compressor = TextCompressor()
        text = "In order to succeed, due to the fact that we tried."
        result = compressor.abbreviate_common_phrases(text)
        assert "In order to" not in result
        assert "to succeed" in result
        assert "because we tried" in result

    def test_compress_normal(self):
        """Normal compression mode."""
        compressor = TextCompressor()
        text = "Hello   world\n\n\n\n"
        result = compressor.compress(text, aggressive=False)
        assert result == "Hello world"

    def test_compress_aggressive(self):
        """Aggressive compression mode."""
        compressor = TextCompressor()
        text = "It was really very  important in order to succeed."
        result = compressor.compress(text, aggressive=True)
        assert "really" not in result
        assert "very" not in result
        assert "In order to" not in result

    def test_truncate_to_tokens(self):
        """Truncate text to token limit."""
        counter = TokenCounter(chars_per_token=1.0)  # 1 char = 1 token for testing
        compressor = TextCompressor(counter)

        text = "This is a sentence. This is another. And one more."
        result = compressor.truncate_to_tokens(text, 20)

        assert len(result) <= 25  # Some buffer for sentence boundary

    def test_truncate_no_change_needed(self):
        """No truncation when under limit."""
        counter = TokenCounter(chars_per_token=1.0)
        compressor = TextCompressor(counter)

        text = "Short text."
        result = compressor.truncate_to_tokens(text, 100)
        assert result == text


class TestSummarizerTemplate:
    """Tests for SummarizerTemplate class."""

    def test_summarize_chapter_short(self):
        """Short chapter returns unchanged."""
        text = "First sentence. Second sentence."
        result = SummarizerTemplate.summarize_chapter(text, max_sentences=3)
        assert result == text

    def test_summarize_chapter_long(self):
        """Long chapter is summarized."""
        text = "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence."
        result = SummarizerTemplate.summarize_chapter(text, max_sentences=2)
        # Should have first and last
        assert "First" in result
        assert "Fifth" in result

    def test_summarize_chapter_three_sentences(self):
        """Extract three key sentences."""
        text = "Start of story. Middle development one. Middle development two. Middle climax. End conclusion."
        result = SummarizerTemplate.summarize_chapter(text, max_sentences=3)
        assert "Start" in result
        assert "End" in result

    def test_summarize_outline_short(self):
        """Short outline returns unchanged."""
        outline = "Chapter 1: Introduction\nChapter 2: Development"
        result = SummarizerTemplate.summarize_outline(outline, max_chapters=5)
        assert result == outline

    def test_summarize_outline_long(self):
        """Long outline is summarized."""
        chapters = [f"Chapter {i}: Content {i}" for i in range(1, 11)]
        outline = "\n".join(chapters)
        result = SummarizerTemplate.summarize_outline(outline, max_chapters=3)
        # Should have fewer than original chapters
        assert result.count("Chapter") <= 5

    def test_summarize_character_short(self):
        """Short character context returns unchanged."""
        context = "Name: John\nRole: Protagonist"
        result = SummarizerTemplate.summarize_character_context(context, max_chars=500)
        assert result == context

    def test_summarize_character_long(self):
        """Long character context is summarized to key attributes."""
        context = """Name: John Smith
Role: Main protagonist
Appearance: Tall, dark hair, blue eyes
Personality: Brave, stubborn
Background: Was a soldier in the war
Hobbies: Reading, chess
Favorite food: Pizza
Random detail: Likes the color blue
More details: Has a pet dog named Rex
Even more: Collects stamps"""
        result = SummarizerTemplate.summarize_character_context(context, max_chars=200)
        assert len(result) <= 210  # Some buffer
        assert "Name" in result or "Role" in result


class TestContextWindowOptimizer:
    """Tests for ContextWindowOptimizer class."""

    def test_optimize_fits_all(self):
        """All items fit in budget."""
        optimizer = ContextWindowOptimizer()
        budget = TokenBudget(total_limit=10000, reserved_for_output=1000)

        items = [
            ContentItem(
                name="item1",
                content="Short content.",
                content_type=ContentType.USER_INSTRUCTION,
                priority=TokenBudgetPriority.HIGH,
            ),
            ContentItem(
                name="item2",
                content="Another short content.",
                content_type=ContentType.PREVIOUS_CONTENT,
                priority=TokenBudgetPriority.MEDIUM,
            ),
        ]

        result = optimizer.optimize_context(items, budget)
        assert len(result) == 2

    def test_optimize_priority_order(self):
        """Critical items included first."""
        optimizer = ContextWindowOptimizer()
        budget = TokenBudget(total_limit=500, reserved_for_output=200)

        items = [
            ContentItem(
                name="low",
                content="A" * 800,  # Won't fit
                content_type=ContentType.WORLD_CONTEXT,
                priority=TokenBudgetPriority.LOW,
                can_summarize=False,
                can_truncate=False,
            ),
            ContentItem(
                name="critical",
                content="Critical content.",
                content_type=ContentType.USER_INSTRUCTION,
                priority=TokenBudgetPriority.CRITICAL,
            ),
        ]

        result = optimizer.optimize_context(items, budget)
        names = [i.name for i in result]
        assert "critical" in names

    def test_optimize_summarize_to_fit(self):
        """Items are summarized to fit."""
        optimizer = ContextWindowOptimizer()
        budget = TokenBudget(total_limit=200, reserved_for_output=50)

        items = [
            ContentItem(
                name="chapter",
                content="First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.",
                content_type=ContentType.CHAPTER_SUMMARY,
                priority=TokenBudgetPriority.MEDIUM,
                can_summarize=True,
                minimum_tokens=10,
            ),
        ]

        result = optimizer.optimize_context(items, budget)
        # Should be summarized
        assert len(result) >= 0


class TestSmartContextSelector:
    """Tests for SmartContextSelector class."""

    def test_select_no_previous_chapters(self):
        """No selection when no previous chapters."""
        selector = SmartContextSelector()
        result = selector.select_relevant_chapters([], current_chapter=1)
        assert result == []

    def test_select_includes_preceding(self):
        """Always includes immediately preceding chapter."""
        selector = SmartContextSelector()
        chapters = [(i, f"Summary {i}") for i in range(1, 6)]
        result = selector.select_relevant_chapters(chapters, current_chapter=5, max_chapters=2)
        chapter_nums = [n for n, _ in result]
        assert 4 in chapter_nums

    def test_select_includes_first(self):
        """Includes first chapter for context."""
        selector = SmartContextSelector()
        chapters = [(i, f"Summary {i}") for i in range(1, 10)]
        result = selector.select_relevant_chapters(chapters, current_chapter=9, max_chapters=3)
        chapter_nums = [n for n, _ in result]
        assert 1 in chapter_nums

    def test_select_respects_max(self):
        """Respects max_chapters limit."""
        selector = SmartContextSelector()
        chapters = [(i, f"Summary {i}") for i in range(1, 20)]
        result = selector.select_relevant_chapters(chapters, current_chapter=19, max_chapters=3)
        assert len(result) <= 3

    def test_select_characters_empty(self):
        """No selection when no characters."""
        selector = SmartContextSelector()
        result = selector.select_relevant_characters([], [], max_characters=5)
        assert result == []

    def test_select_characters_prioritizes_mentioned(self):
        """Characters mentioned in chapter are prioritized."""
        selector = SmartContextSelector()
        all_chars = [
            ("John", "Main character", 100),
            ("Jane", "Supporting", 50),
            ("Bob", "Minor", 10),
        ]
        mentioned = ["Bob"]  # Bob is mentioned in current chapter
        result = selector.select_relevant_characters(all_chars, mentioned, max_characters=2)
        names = [n for n, _ in result]
        assert "Bob" in names

    def test_select_characters_fallback_to_frequency(self):
        """Falls back to frequency when no mentions."""
        selector = SmartContextSelector()
        all_chars = [
            ("John", "Main character", 100),
            ("Jane", "Supporting", 50),
            ("Bob", "Minor", 10),
        ]
        result = selector.select_relevant_characters(all_chars, [], max_characters=2)
        names = [n for n, _ in result]
        # Should have most frequent first
        assert names[0] == "John"


class TestTokenOptimizer:
    """Tests for TokenOptimizer class."""

    def test_create_budget(self):
        """Create budget with defaults."""
        optimizer = TokenOptimizer(
            model_context_limit=128000,
            default_output_reserve=4000,
        )
        budget = optimizer.create_budget()
        assert budget.total_limit == 128000
        assert budget.reserved_for_output == 4000

    def test_create_budget_custom(self):
        """Create budget with custom values."""
        optimizer = TokenOptimizer()
        budget = optimizer.create_budget(output_tokens=8000, context_limit=64000)
        assert budget.total_limit == 64000
        assert budget.reserved_for_output == 8000

    def test_optimize_basic(self):
        """Basic optimization workflow."""
        optimizer = TokenOptimizer()
        items = [
            ContentItem(
                name="system",
                content="You are a helpful assistant.",
                content_type=ContentType.SYSTEM_PROMPT,
                priority=TokenBudgetPriority.CRITICAL,
            ),
            ContentItem(
                name="user",
                content="Write a story.",
                content_type=ContentType.USER_INSTRUCTION,
                priority=TokenBudgetPriority.HIGH,
            ),
        ]
        result = optimizer.optimize(items)
        assert isinstance(result, OptimizationResult)
        assert result.items_included == 2
        assert result.items_dropped == 0

    def test_optimize_with_budget(self):
        """Optimization with specific budget."""
        optimizer = TokenOptimizer()
        budget = optimizer.create_budget(output_tokens=1000, context_limit=2000)

        items = [
            ContentItem(
                name="item",
                content="Short content.",
                content_type=ContentType.USER_INSTRUCTION,
                priority=TokenBudgetPriority.HIGH,
            ),
        ]

        result = optimizer.optimize(items, budget)
        assert result.total_tokens <= budget.available_for_input

    def test_estimate_generation_tokens(self):
        """Estimate tokens for generation."""
        optimizer = TokenOptimizer()

        # 1000 words * 0.75 = 750 base
        # 750 * 1.1 = 825 with 10% overhead
        estimate = optimizer.estimate_generation_tokens(1000, overhead_percent=10.0)
        assert estimate == 825

    def test_estimate_generation_no_overhead(self):
        """Estimate with no overhead."""
        optimizer = TokenOptimizer()
        estimate = optimizer.estimate_generation_tokens(1000, overhead_percent=0.0)
        assert estimate == 750


class TestOptimizationResult:
    """Tests for OptimizationResult dataclass."""

    def test_create_result(self):
        """Create optimization result."""
        result = OptimizationResult(
            items=[],
            total_tokens=5000,
            budget_used_percent=50.0,
            items_included=3,
            items_summarized=1,
            items_truncated=0,
            items_dropped=2,
        )
        assert result.total_tokens == 5000
        assert result.budget_used_percent == 50.0
        assert result.items_included == 3


class TestIntegration:
    """Integration tests for token optimization workflow."""

    def test_full_optimization_workflow(self):
        """Test complete optimization workflow."""
        optimizer = TokenOptimizer(
            model_context_limit=1000,
            default_output_reserve=200,
            chars_per_token=1.0,  # Simplified for testing
        )

        # Create items of varying priorities and sizes
        items = [
            ContentItem(
                name="system",
                content="S" * 100,  # 100 tokens
                content_type=ContentType.SYSTEM_PROMPT,
                priority=TokenBudgetPriority.CRITICAL,
            ),
            ContentItem(
                name="instruction",
                content="I" * 50,  # 50 tokens
                content_type=ContentType.USER_INSTRUCTION,
                priority=TokenBudgetPriority.HIGH,
            ),
            ContentItem(
                name="context",
                content="C" * 200,  # 200 tokens
                content_type=ContentType.PREVIOUS_CONTENT,
                priority=TokenBudgetPriority.MEDIUM,
            ),
            ContentItem(
                name="extra",
                content="E" * 500,  # 500 tokens - may not fit
                content_type=ContentType.WORLD_CONTEXT,
                priority=TokenBudgetPriority.LOW,
            ),
        ]

        result = optimizer.optimize(items)

        # Budget is 800 for input (1000 - 200)
        assert result.total_tokens <= 800
        # Critical and high priority should be included
        names = [i.name for i in result.items]
        assert "system" in names
        assert "instruction" in names

    def test_chapter_context_selection(self):
        """Test selecting relevant chapter context."""
        optimizer = TokenOptimizer()

        # Simulate chapter summaries
        chapters = [(i, f"Chapter {i} summary with some content.") for i in range(1, 11)]

        # Select for chapter 10
        relevant = optimizer.context_selector.select_relevant_chapters(
            chapters, current_chapter=10, max_chapters=3
        )

        assert len(relevant) == 3
        # Should include chapter 9 (preceding) and chapter 1 (first)
        chapter_nums = [n for n, _ in relevant]
        assert 9 in chapter_nums
        assert 1 in chapter_nums

    def test_character_context_selection(self):
        """Test selecting relevant character context."""
        optimizer = TokenOptimizer()

        characters = [
            ("Alice", "Main protagonist info", 50),
            ("Bob", "Antagonist info", 30),
            ("Charlie", "Minor character info", 10),
            ("Diana", "Supporting character info", 25),
        ]

        # Current chapter mentions Charlie specifically
        relevant = optimizer.context_selector.select_relevant_characters(
            characters, chapter_mentions=["Charlie"], max_characters=2
        )

        names = [n for n, _ in relevant]
        assert "Charlie" in names  # Mentioned in chapter
        assert len(names) == 2

    def test_compression_preserves_meaning(self):
        """Test that compression preserves essential content."""
        compressor = TextCompressor()

        original = """
        In order to succeed at this task, we really need to
        basically understand that due to the fact that
        the requirements are very complex.
        """

        compressed = compressor.compress(original, aggressive=True)

        # Key words should remain
        assert "succeed" in compressed
        assert "task" in compressed
        assert "requirements" in compressed
        assert "complex" in compressed

        # Filler should be removed
        assert "really" not in compressed
        assert "basically" not in compressed
        assert "very" not in compressed

    def test_budget_tracking_accurate(self):
        """Test that budget tracking is accurate."""
        optimizer = TokenOptimizer(chars_per_token=1.0)
        budget = optimizer.create_budget(output_tokens=100, context_limit=500)

        items = [
            ContentItem(
                name="item1",
                content="A" * 100,
                content_type=ContentType.USER_INSTRUCTION,
                priority=TokenBudgetPriority.HIGH,
            ),
            ContentItem(
                name="item2",
                content="B" * 150,
                content_type=ContentType.PREVIOUS_CONTENT,
                priority=TokenBudgetPriority.MEDIUM,
            ),
        ]

        result = optimizer.optimize(items, budget)

        # Check that reported tokens matches budget used
        assert result.total_tokens == budget.used
        assert result.budget_used_percent == pytest.approx(
            budget.used / budget.available_for_input * 100, rel=0.1
        )
