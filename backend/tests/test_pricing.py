"""Tests for pricing module - LLM cost calculations.

Tests cover:
- Model pricing lookups
- Cost calculations for different models
- Book cost estimation
- Edge cases and unknown models
"""

from app.pricing import (
    DEFAULT_PRICING,
    MODEL_PRICING,
    calculate_cost_usd,
    estimate_book_cost,
    get_model_pricing,
)


class TestGetModelPricing:
    """Tests for get_model_pricing function."""

    def test_known_model_pricing(self):
        """Test pricing lookup for known models."""
        # OpenAI chatgpt-5.2 pricing via OpenRouter
        pricing = get_model_pricing("openrouter/openai/chatgpt-5.2")

        assert "prompt_per_1k" in pricing
        assert "completion_per_1k" in pricing
        assert pricing["prompt_per_1k"] == 0.0105
        assert pricing["completion_per_1k"] == 0.0315

    def test_claude_model_pricing(self):
        """Test pricing lookup for Claude models."""
        pricing = get_model_pricing("openrouter/anthropic/claude-sonnet-4.5")

        assert pricing["prompt_per_1k"] == 0.00315
        assert pricing["completion_per_1k"] == 0.01575

    def test_gemini_model_pricing(self):
        """Test pricing lookup for Gemini models."""
        pricing = get_model_pricing("openrouter/google/gemini-2.5-pro")

        assert pricing["prompt_per_1k"] == 0.000525
        assert pricing["completion_per_1k"] == 0.00157

    def test_unknown_model_returns_default(self):
        """Test that unknown models return default pricing."""
        pricing = get_model_pricing("unknown-model-xyz")

        assert pricing == DEFAULT_PRICING
        assert pricing["prompt_per_1k"] == 0.01
        assert pricing["completion_per_1k"] == 0.03

    def test_partial_match_gpt4_variant(self):
        """Test partial matching for GPT-4 variants."""
        pricing = get_model_pricing("openrouter/openai/gpt-4-0125-preview")

        # Should match gpt-4 pricing
        assert "prompt_per_1k" in pricing

    def test_all_known_models_have_pricing(self):
        """Test that all models in MODEL_PRICING have valid pricing."""
        for model, pricing in MODEL_PRICING.items():
            assert "prompt_per_1k" in pricing, f"{model} missing prompt_per_1k"
            assert "completion_per_1k" in pricing, f"{model} missing completion_per_1k"
            assert pricing["prompt_per_1k"] > 0, f"{model} has zero prompt price"
            assert pricing["completion_per_1k"] > 0, f"{model} has zero completion price"


class TestCalculateCostUSD:
    """Tests for calculate_cost_usd function."""

    def test_zero_tokens(self):
        """Test cost calculation with zero tokens."""
        cost = calculate_cost_usd("openrouter/openai/chatgpt-5.2", 0, 0)
        assert cost == 0.0

    def test_simple_calculation(self):
        """Test simple cost calculation."""
        # chatgpt-5.2: $0.0105/1k prompt, $0.0315/1k completion
        # 1000 prompt tokens = $0.0105
        # 1000 completion tokens = $0.0315
        # Total = $0.042
        cost = calculate_cost_usd("openrouter/openai/chatgpt-5.2", 1000, 1000)
        assert cost == 0.042

    def test_fractional_tokens(self):
        """Test cost calculation with fractional token counts."""
        # 500 prompt tokens = $0.00525
        # 500 completion tokens = $0.01575
        # Total = $0.021
        cost = calculate_cost_usd("openrouter/openai/chatgpt-5.2", 500, 500)
        assert cost == 0.021

    def test_large_token_counts(self):
        """Test cost calculation with large token counts."""
        # chatgpt-5.2 pricing
        # 100k prompt tokens at $0.0105/1k = $1.05
        # 50k completion tokens at $0.0315/1k = $1.575
        # Total = $2.625
        cost = calculate_cost_usd("openrouter/openai/chatgpt-5.2", 100000, 50000)
        assert cost == 2.625

    def test_deepseek_very_cheap(self):
        """Test that DeepSeek is very cheap."""
        # DeepSeek: $0.00029/1k prompt, $0.00115/1k completion
        cost = calculate_cost_usd("openrouter/deepseek/deepseek-chat", 1000, 1000)
        expected = 0.00029 + 0.00115
        assert abs(cost - expected) < 0.0001

    def test_opus_expensive(self):
        """Test that Opus is expensive."""
        # Claude Opus: $0.01575/1k prompt, $0.07875/1k completion
        cost = calculate_cost_usd("openrouter/anthropic/claude-3-opus", 1000, 1000)
        expected = 0.01575 + 0.07875
        assert abs(cost - expected) < 0.0001

    def test_cost_rounding(self):
        """Test that costs are rounded appropriately."""
        cost = calculate_cost_usd("openrouter/openai/chatgpt-5.2", 1, 1)
        # Very small cost should still be precise
        assert isinstance(cost, float)
        assert cost > 0

    def test_unknown_model_uses_default(self):
        """Test that unknown model uses default pricing."""
        cost = calculate_cost_usd("unknown-model", 1000, 1000)
        # Default: $0.01/1k prompt + $0.03/1k completion = $0.04
        assert cost == 0.04


class TestEstimateBookCost:
    """Tests for estimate_book_cost function."""

    def test_basic_estimate(self):
        """Test basic book cost estimation."""
        estimate = estimate_book_cost(
            model="openrouter/openai/chatgpt-5.2",
            target_chapters=10,
            avg_prompt_tokens_per_chapter=2000,
            avg_completion_tokens_per_chapter=4000,
        )

        assert "estimated_usd" in estimate
        assert "total_prompt_tokens" in estimate
        assert "total_completion_tokens" in estimate
        assert "breakdown" in estimate
        assert "model" in estimate
        assert "chapters" in estimate

        assert estimate["model"] == "openrouter/openai/chatgpt-5.2"
        assert estimate["chapters"] == 10

    def test_estimate_breakdown(self):
        """Test that breakdown contains expected categories."""
        estimate = estimate_book_cost("openrouter/openai/chatgpt-5.2", target_chapters=12)

        breakdown = estimate["breakdown"]
        assert "chapters" in breakdown
        assert "outline" in breakdown
        assert "editing" in breakdown
        assert "continuity" in breakdown

    def test_estimate_without_optional_features(self):
        """Test estimate with optional features disabled."""
        estimate = estimate_book_cost(
            "openrouter/openai/chatgpt-5.2",
            target_chapters=10,
            include_outline=False,
            include_editing=False,
            include_continuity=False,
        )

        breakdown = estimate["breakdown"]
        assert breakdown["outline"] == 0
        assert breakdown["editing"] == 0
        assert breakdown["continuity"] == 0

    def test_estimate_token_totals(self):
        """Test that token totals are calculated correctly."""
        estimate = estimate_book_cost(
            "openrouter/openai/chatgpt-5.2",
            target_chapters=10,
            avg_prompt_tokens_per_chapter=2000,
            avg_completion_tokens_per_chapter=4000,
            include_outline=False,
            include_editing=False,
            include_continuity=False,
        )

        # Without optional features, just chapter tokens
        assert estimate["total_prompt_tokens"] == 10 * 2000
        assert estimate["total_completion_tokens"] == 10 * 4000

    def test_estimate_with_outline(self):
        """Test that outline adds appropriate tokens."""
        base = estimate_book_cost(
            "openrouter/openai/chatgpt-5.2", target_chapters=10, include_outline=False
        )
        with_outline = estimate_book_cost(
            "openrouter/openai/chatgpt-5.2", target_chapters=10, include_outline=True
        )

        assert with_outline["total_prompt_tokens"] > base["total_prompt_tokens"]
        assert with_outline["total_completion_tokens"] > base["total_completion_tokens"]

    def test_estimate_with_editing(self):
        """Test that editing adds 60% of original tokens."""
        # Editing is 60% of original generation
        base = estimate_book_cost(
            "openrouter/openai/chatgpt-5.2",
            target_chapters=10,
            include_outline=False,
            include_editing=False,
            include_continuity=False,
        )
        with_editing = estimate_book_cost(
            "openrouter/openai/chatgpt-5.2",
            target_chapters=10,
            include_outline=False,
            include_editing=True,
            include_continuity=False,
        )

        # Editing adds 60% more tokens
        expected_prompt = base["total_prompt_tokens"] * 1.6
        assert with_editing["total_prompt_tokens"] == int(expected_prompt)

    def test_estimate_total_cost_increases_with_chapters(self):
        """Test that cost scales with chapter count."""
        small = estimate_book_cost("openrouter/openai/chatgpt-5.2", target_chapters=5)
        large = estimate_book_cost("openrouter/openai/chatgpt-5.2", target_chapters=20)

        assert large["estimated_usd"] > small["estimated_usd"]
        # Should be roughly proportional
        ratio = large["chapters"] / small["chapters"]
        cost_ratio = large["estimated_usd"] / small["estimated_usd"]
        assert 0.8 * ratio < cost_ratio < 1.2 * ratio

    def test_different_models_different_costs(self):
        """Test that different models have different costs."""
        gpt5 = estimate_book_cost("openrouter/openai/chatgpt-5.2", target_chapters=10)
        deepseek = estimate_book_cost("openrouter/deepseek/deepseek-chat", target_chapters=10)

        # DeepSeek should be much cheaper
        assert deepseek["estimated_usd"] < gpt5["estimated_usd"]

    def test_estimate_returns_typed_dict(self):
        """Test that estimate returns properly typed result."""
        estimate = estimate_book_cost("openrouter/openai/chatgpt-5.2", target_chapters=10)

        assert isinstance(estimate["estimated_usd"], float)
        assert isinstance(estimate["total_prompt_tokens"], int)
        assert isinstance(estimate["total_completion_tokens"], int)
        assert isinstance(estimate["breakdown"], dict)
        assert isinstance(estimate["model"], str)
        assert isinstance(estimate["chapters"], int)


class TestPricingConsistency:
    """Tests for pricing data consistency."""

    def test_prompt_cheaper_than_completion(self):
        """Test that prompt tokens are generally cheaper than completion."""
        for model, pricing in MODEL_PRICING.items():
            # For all models, prompt should be cheaper or equal
            assert (
                pricing["prompt_per_1k"] <= pricing["completion_per_1k"]
            ), f"{model}: prompt not cheaper than completion"

    def test_pricing_values_reasonable(self):
        """Test that pricing values are within reasonable bounds."""
        for model, pricing in MODEL_PRICING.items():
            # No model should cost more than $1 per 1k tokens
            assert pricing["prompt_per_1k"] < 1.0
            assert pricing["completion_per_1k"] < 1.0

            # No model should be free
            assert pricing["prompt_per_1k"] > 0
            assert pricing["completion_per_1k"] > 0
