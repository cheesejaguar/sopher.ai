"""Centralized pricing logic for LLM models

OpenRouter pricing: Model cost + 5% platform fee
https://openrouter.ai/docs#pricing
"""

from typing import Any, Dict, TypedDict


class CostBreakdown(TypedDict):
    """Breakdown of costs by category"""

    chapters: float
    outline: float
    editing: float
    continuity: float


class BookCostEstimate(TypedDict):
    """Result of book cost estimation"""

    estimated_usd: float
    total_prompt_tokens: int
    total_completion_tokens: int
    breakdown: CostBreakdown
    model: str
    chapters: int


# Model pricing in USD per 1000 tokens (includes ~5% OpenRouter fee)
# Pricing based on OpenRouter rates as of 2025
MODEL_PRICING: Dict[str, Dict[str, float]] = {
    # OpenAI via OpenRouter
    "openai/chatgpt-5.2": {
        "prompt_per_1k": 0.0105,  # $10/M input
        "completion_per_1k": 0.0315,  # $30/M output
    },
    "openai/gpt-4-turbo": {
        "prompt_per_1k": 0.0105,
        "completion_per_1k": 0.0315,
    },
    "openai/gpt-4": {
        "prompt_per_1k": 0.0315,
        "completion_per_1k": 0.063,
    },
    # Anthropic via OpenRouter
    "anthropic/claude-sonnet-4.5": {
        "prompt_per_1k": 0.00315,  # $3/M input
        "completion_per_1k": 0.01575,  # $15/M output
    },
    "anthropic/claude-3-sonnet": {
        "prompt_per_1k": 0.00315,
        "completion_per_1k": 0.01575,
    },
    "anthropic/claude-3-opus": {
        "prompt_per_1k": 0.01575,
        "completion_per_1k": 0.07875,
    },
    # Google via OpenRouter
    "google/gemini-3-pro-preview": {
        "prompt_per_1k": 0.000525,  # Very competitive pricing
        "completion_per_1k": 0.00157,
    },
    "google/gemini-2.5-pro": {
        "prompt_per_1k": 0.000525,
        "completion_per_1k": 0.00157,
    },
    "google/gemini-2.5-flash": {
        "prompt_per_1k": 0.000079,
        "completion_per_1k": 0.000315,
    },
    # xAI Grok via OpenRouter
    "x-ai/grok-4.1-fast": {
        "prompt_per_1k": 0.00525,
        "completion_per_1k": 0.0157,
    },
    "x-ai/grok-3": {
        "prompt_per_1k": 0.0105,
        "completion_per_1k": 0.0315,
    },
    # DeepSeek via OpenRouter (very cost-effective)
    "deepseek/deepseek-v3.2": {
        "prompt_per_1k": 0.00029,  # $0.27/M input
        "completion_per_1k": 0.00115,  # $1.10/M output
    },
    "deepseek/deepseek-chat": {
        "prompt_per_1k": 0.00029,
        "completion_per_1k": 0.00115,
    },
}

# Default pricing for unknown models (conservative estimate)
DEFAULT_PRICING = {
    "prompt_per_1k": 0.01,
    "completion_per_1k": 0.03,
}


def normalize_model_name(model: str) -> str:
    """Normalize model name by stripping openrouter/ prefix if present."""
    if model.startswith("openrouter/"):
        return model[len("openrouter/"):]
    return model


def get_model_pricing(model: str) -> Dict[str, Any]:
    """Get pricing for a specific model"""
    # Normalize the model name (strip openrouter/ prefix)
    normalized = normalize_model_name(model)

    # Direct match
    if normalized in MODEL_PRICING:
        return MODEL_PRICING[normalized]

    # Try original name
    if model in MODEL_PRICING:
        return MODEL_PRICING[model]

    # Partial match (e.g., "openai/gpt-4-0125-preview" -> "openai/gpt-4")
    model_lower = normalized.lower()
    for known_model, pricing in MODEL_PRICING.items():
        if known_model.lower() in model_lower or model_lower in known_model.lower():
            return pricing

    # Return default pricing for unknown models
    return DEFAULT_PRICING


def calculate_cost_usd(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> float:
    """Calculate cost in USD for given token counts"""
    pricing = get_model_pricing(model)

    prompt_cost = (prompt_tokens / 1000) * pricing["prompt_per_1k"]
    completion_cost = (completion_tokens / 1000) * pricing["completion_per_1k"]

    return float(round(prompt_cost + completion_cost, 6))


def estimate_book_cost(
    model: str,
    target_chapters: int = 12,
    avg_prompt_tokens_per_chapter: int = 2000,
    avg_completion_tokens_per_chapter: int = 4000,
    include_outline: bool = True,
    include_editing: bool = True,
    include_continuity: bool = True,
) -> BookCostEstimate:
    """Estimate total cost for generating a book"""
    # Base chapter generation
    chapter_prompt_tokens = target_chapters * avg_prompt_tokens_per_chapter
    chapter_completion_tokens = target_chapters * avg_completion_tokens_per_chapter

    # Outline generation (roughly 1 chapter worth)
    outline_prompt_tokens = avg_prompt_tokens_per_chapter if include_outline else 0
    outline_completion_tokens = avg_completion_tokens_per_chapter if include_outline else 0

    # Editing pass (60% of original generation)
    edit_prompt_tokens = int(chapter_prompt_tokens * 0.6) if include_editing else 0
    edit_completion_tokens = int(chapter_completion_tokens * 0.6) if include_editing else 0

    # Continuity checking (20% of original)
    continuity_prompt_tokens = int(chapter_prompt_tokens * 0.2) if include_continuity else 0
    continuity_completion_tokens = int(chapter_completion_tokens * 0.2) if include_continuity else 0

    # Total tokens
    total_prompt_tokens = (
        chapter_prompt_tokens
        + outline_prompt_tokens
        + edit_prompt_tokens
        + continuity_prompt_tokens
    )
    total_completion_tokens = (
        chapter_completion_tokens
        + outline_completion_tokens
        + edit_completion_tokens
        + continuity_completion_tokens
    )

    # Calculate costs
    total_cost = calculate_cost_usd(model, total_prompt_tokens, total_completion_tokens)

    return {
        "estimated_usd": total_cost,
        "total_prompt_tokens": total_prompt_tokens,
        "total_completion_tokens": total_completion_tokens,
        "breakdown": {
            "chapters": calculate_cost_usd(model, chapter_prompt_tokens, chapter_completion_tokens),
            "outline": calculate_cost_usd(model, outline_prompt_tokens, outline_completion_tokens),
            "editing": calculate_cost_usd(model, edit_prompt_tokens, edit_completion_tokens),
            "continuity": calculate_cost_usd(
                model, continuity_prompt_tokens, continuity_completion_tokens
            ),
        },
        "model": model,
        "chapters": target_chapters,
    }
