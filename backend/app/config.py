"""Centralized configuration module for sopher.ai"""

import os
from typing import List, Set

# OpenRouter model mappings
# Format: openrouter/<provider>/<model>
# Docs: https://openrouter.ai/docs and https://docs.litellm.ai/docs/providers/openrouter
OPENROUTER_MODELS: List[str] = [
    # OpenAI via OpenRouter
    "openrouter/openai/chatgpt-5.2",
    "openrouter/openai/gpt-4-turbo",
    "openrouter/openai/gpt-4",
    # Anthropic via OpenRouter
    "openrouter/anthropic/claude-sonnet-4.5",
    "openrouter/anthropic/claude-3-sonnet",
    "openrouter/anthropic/claude-3-opus",
    # Google via OpenRouter
    "openrouter/google/gemini-3-pro-preview",
    "openrouter/google/gemini-2.5-pro",
    "openrouter/google/gemini-2.5-flash",
    # xAI via OpenRouter
    "openrouter/x-ai/grok-4.1-fast",
    "openrouter/x-ai/grok-3",
    # DeepSeek via OpenRouter
    "openrouter/deepseek/deepseek-v3.2",
    "openrouter/deepseek/deepseek-chat",
]

# Primary models (shown in UI by default)
PRIMARY_MODELS: List[str] = [
    "openrouter/openai/chatgpt-5.2",
    "openrouter/anthropic/claude-sonnet-4.5",
    "openrouter/google/gemini-3-pro-preview",
    "openrouter/x-ai/grok-4.1-fast",
    "openrouter/deepseek/deepseek-v3.2",
]

# Default model to use (can be overridden via PRIMARY_MODEL env var)
DEFAULT_MODEL: str = os.getenv("PRIMARY_MODEL", "openrouter/openai/chatgpt-5.2")

# Fallback models for when primary model fails
FALLBACK_MODELS: List[str] = [
    os.getenv("SECONDARY_MODEL", "openrouter/anthropic/claude-sonnet-4.5"),
    os.getenv("OVERFLOW_MODEL", "openrouter/google/gemini-3-pro-preview"),
]

# Model set for quick validation (includes all OpenRouter models)
SUPPORTED_MODELS_SET: Set[str] = set(OPENROUTER_MODELS)


def is_valid_model(model: str) -> bool:
    """Check if a model is supported

    Allows any openrouter/* model for flexibility with new models
    """
    if model.startswith("openrouter/"):
        return True
    return model in SUPPORTED_MODELS_SET


def get_primary_models() -> List[str]:
    """Get the list of primary models for UI display"""
    return PRIMARY_MODELS.copy()


def get_all_models() -> List[str]:
    """Get the list of all supported models"""
    return OPENROUTER_MODELS.copy()


def get_default_model() -> str:
    """Get the default model"""
    return DEFAULT_MODEL


def get_fallback_models() -> List[str]:
    """Get fallback models for when primary fails"""
    return FALLBACK_MODELS.copy()
