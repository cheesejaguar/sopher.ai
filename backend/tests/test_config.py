"""Tests for centralized configuration module.

Tests cover:
- Model lists and sets
- Model validation functions
- Default values
"""

import os
from unittest.mock import patch


class TestSupportedModels:
    """Tests for OPENROUTER_MODELS configuration."""

    def test_supported_models_not_empty(self):
        """Test that supported models list is not empty."""
        from app.config import OPENROUTER_MODELS

        assert len(OPENROUTER_MODELS) > 0

    def test_supported_models_contains_openai(self):
        """Test that OpenAI models are included."""
        from app.config import OPENROUTER_MODELS

        openai_models = [m for m in OPENROUTER_MODELS if "openai" in m]
        assert len(openai_models) >= 1

    def test_supported_models_contains_anthropic(self):
        """Test that Anthropic models are included."""
        from app.config import OPENROUTER_MODELS

        claude_models = [m for m in OPENROUTER_MODELS if "claude" in m]
        assert len(claude_models) >= 1

    def test_supported_models_contains_google(self):
        """Test that Google models are included."""
        from app.config import OPENROUTER_MODELS

        gemini_models = [m for m in OPENROUTER_MODELS if "gemini" in m]
        assert len(gemini_models) >= 1

    def test_supported_models_set_matches_list(self):
        """Test that SUPPORTED_MODELS_SET contains same models as list."""
        from app.config import OPENROUTER_MODELS, SUPPORTED_MODELS_SET

        assert set(OPENROUTER_MODELS) == SUPPORTED_MODELS_SET


class TestPrimaryModels:
    """Tests for PRIMARY_MODELS configuration."""

    def test_primary_models_not_empty(self):
        """Test that primary models list is not empty."""
        from app.config import PRIMARY_MODELS

        assert len(PRIMARY_MODELS) > 0

    def test_primary_models_subset_of_supported(self):
        """Test that primary models are a subset of supported models."""
        from app.config import PRIMARY_MODELS, SUPPORTED_MODELS_SET

        for model in PRIMARY_MODELS:
            assert model in SUPPORTED_MODELS_SET, f"{model} not in supported models"

    def test_primary_models_include_each_provider(self):
        """Test that primary models include one from each provider."""
        from app.config import PRIMARY_MODELS

        has_openai = any("openai" in m for m in PRIMARY_MODELS)
        has_anthropic = any("claude" in m for m in PRIMARY_MODELS)
        has_google = any("gemini" in m for m in PRIMARY_MODELS)

        assert has_openai, "Primary models should include OpenAI"
        assert has_anthropic, "Primary models should include Anthropic"
        assert has_google, "Primary models should include Google"


class TestDefaultModel:
    """Tests for DEFAULT_MODEL configuration."""

    def test_default_model_is_valid(self):
        """Test that default model is valid (starts with openrouter/)."""
        from app.config import DEFAULT_MODEL, is_valid_model

        # DEFAULT_MODEL is set from PRIMARY_MODEL env var or defaults
        # In test environment it might be set to openrouter/openai/gpt-5.2
        assert is_valid_model(DEFAULT_MODEL), f"DEFAULT_MODEL {DEFAULT_MODEL} is not valid"

    def test_default_model_from_env(self):
        """Test that DEFAULT_MODEL can be set via environment."""
        with patch.dict(os.environ, {"PRIMARY_MODEL": "openrouter/anthropic/claude-sonnet-4.5"}):
            # Need to reimport to pick up new env var
            import importlib

            import app.config

            importlib.reload(app.config)
            from app.config import DEFAULT_MODEL

            assert DEFAULT_MODEL == "openrouter/anthropic/claude-sonnet-4.5"

            # Restore original
            importlib.reload(app.config)


class TestIsValidModel:
    """Tests for is_valid_model function."""

    def test_valid_model_returns_true(self):
        """Test that valid models return True."""
        from app.config import OPENROUTER_MODELS, is_valid_model

        for model in OPENROUTER_MODELS:
            assert is_valid_model(model) is True

    def test_invalid_model_returns_false(self):
        """Test that invalid models return False."""
        from app.config import is_valid_model

        assert is_valid_model("invalid-model") is False
        assert is_valid_model("") is False
        assert is_valid_model("gpt-99") is False

    def test_openrouter_prefix_always_valid(self):
        """Test that any openrouter/ prefixed model is considered valid."""
        from app.config import is_valid_model

        # Any openrouter model should be valid for flexibility
        assert is_valid_model("openrouter/openai/gpt-5") is True
        assert is_valid_model("openrouter/some-new-provider/new-model") is True


class TestGetPrimaryModels:
    """Tests for get_primary_models function."""

    def test_returns_list(self):
        """Test that get_primary_models returns a list."""
        from app.config import get_primary_models

        result = get_primary_models()
        assert isinstance(result, list)

    def test_returns_copy(self):
        """Test that get_primary_models returns a copy."""
        from app.config import PRIMARY_MODELS, get_primary_models

        result = get_primary_models()
        result.append("test-model")

        # Original should not be modified
        assert "test-model" not in PRIMARY_MODELS


class TestGetAllModels:
    """Tests for get_all_models function."""

    def test_returns_list(self):
        """Test that get_all_models returns a list."""
        from app.config import get_all_models

        result = get_all_models()
        assert isinstance(result, list)

    def test_returns_all_supported(self):
        """Test that get_all_models returns all supported models."""
        from app.config import OPENROUTER_MODELS, get_all_models

        result = get_all_models()
        assert len(result) == len(OPENROUTER_MODELS)

    def test_returns_copy(self):
        """Test that get_all_models returns a copy."""
        from app.config import OPENROUTER_MODELS, get_all_models

        result = get_all_models()
        result.append("test-model")

        # Original should not be modified
        assert "test-model" not in OPENROUTER_MODELS
