"""Centralized configuration module for sopher.ai"""

import os
from typing import Dict, List, Set

# Anthropic Claude model family
# Format: anthropic/<model-name>
# Docs: https://docs.litellm.ai/docs/providers/anthropic
SUPPORTED_MODELS: List[str] = [
    "anthropic/claude-haiku-4.5",
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-opus-4.6",
]

# Primary models (shown in UI by default)
PRIMARY_MODELS: List[str] = [
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-opus-4.6",
    "anthropic/claude-haiku-4.5",
]

# Default model to use (can be overridden via PRIMARY_MODEL env var)
DEFAULT_MODEL: str = os.getenv("PRIMARY_MODEL", "anthropic/claude-sonnet-4.5")

# Fallback models for when primary model fails
FALLBACK_MODELS: List[str] = [
    os.getenv("SECONDARY_MODEL", "anthropic/claude-haiku-4.5"),
    os.getenv("OVERFLOW_MODEL", "anthropic/claude-opus-4.6"),
]

# Per-agent model assignments (strategic tier allocation)
# haiku: quick/simple tasks, sonnet: most tasks, opus: complex tasks
AGENT_MODEL_MAP: Dict[str, str] = {
    "concept_generator": "anthropic/claude-haiku-4.5",
    "outliner": "anthropic/claude-sonnet-4.5",
    "writer": "anthropic/claude-opus-4.6",
    "editor": "anthropic/claude-sonnet-4.5",
    "continuity_checker": "anthropic/claude-opus-4.6",
}

# Model set for quick validation
SUPPORTED_MODELS_SET: Set[str] = set(SUPPORTED_MODELS)


def is_valid_model(model: str) -> bool:
    """Check if a model is supported

    Allows any anthropic/* model for flexibility with new models
    """
    if model.startswith("anthropic/"):
        return True
    return model in SUPPORTED_MODELS_SET


def get_primary_models() -> List[str]:
    """Get the list of primary models for UI display"""
    return PRIMARY_MODELS.copy()


def get_all_models() -> List[str]:
    """Get the list of all supported models"""
    return SUPPORTED_MODELS.copy()


def get_default_model() -> str:
    """Get the default model"""
    return DEFAULT_MODEL


def get_fallback_models() -> List[str]:
    """Get fallback models for when primary fails"""
    return FALLBACK_MODELS.copy()
