"""Centralized configuration module for sopher.ai"""

import os
from typing import List, Set

# Supported LLM models - add new models here
SUPPORTED_MODELS: List[str] = [
    # OpenAI
    "gpt-5",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
    # Anthropic Claude
    "claude-sonnet-4-20250514",
    "claude-3-sonnet-20240229",
    "claude-3-opus-20240229",
    "claude-3-haiku-20240307",
    # Google Gemini
    "gemini-2.5-pro",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
]

# Primary models (shown in UI by default)
PRIMARY_MODELS: List[str] = [
    "gpt-5",
    "claude-sonnet-4-20250514",
    "gemini-2.5-pro",
]

# Default model to use
DEFAULT_MODEL: str = os.getenv("DEFAULT_MODEL", "gpt-5")

# Model set for quick validation
SUPPORTED_MODELS_SET: Set[str] = set(SUPPORTED_MODELS)


def is_valid_model(model: str) -> bool:
    """Check if a model is supported"""
    return model in SUPPORTED_MODELS_SET


def get_primary_models() -> List[str]:
    """Get the list of primary models for UI display"""
    return PRIMARY_MODELS.copy()


def get_all_models() -> List[str]:
    """Get the list of all supported models"""
    return SUPPORTED_MODELS.copy()
