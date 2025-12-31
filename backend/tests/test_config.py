"""Tests for centralized configuration module.

Tests cover:
- Model lists and sets
- Model validation functions
- Default values
"""

import os
from unittest.mock import patch


class TestSupportedModels:
    """Tests for SUPPORTED_MODELS configuration."""

    def test_supported_models_not_empty(self):
        """Test that supported models list is not empty."""
        from app.config import SUPPORTED_MODELS

        assert len(SUPPORTED_MODELS) > 0

    def test_supported_models_contains_openai(self):
        """Test that OpenAI models are included."""
        from app.config import SUPPORTED_MODELS

        openai_models = [m for m in SUPPORTED_MODELS if m.startswith("gpt")]
        assert len(openai_models) >= 1

    def test_supported_models_contains_anthropic(self):
        """Test that Anthropic models are included."""
        from app.config import SUPPORTED_MODELS

        claude_models = [m for m in SUPPORTED_MODELS if "claude" in m]
        assert len(claude_models) >= 1

    def test_supported_models_contains_google(self):
        """Test that Google models are included."""
        from app.config import SUPPORTED_MODELS

        gemini_models = [m for m in SUPPORTED_MODELS if "gemini" in m]
        assert len(gemini_models) >= 1

    def test_supported_models_set_matches_list(self):
        """Test that SUPPORTED_MODELS_SET contains same models as list."""
        from app.config import SUPPORTED_MODELS, SUPPORTED_MODELS_SET

        assert set(SUPPORTED_MODELS) == SUPPORTED_MODELS_SET


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

        has_openai = any("gpt" in m for m in PRIMARY_MODELS)
        has_anthropic = any("claude" in m for m in PRIMARY_MODELS)
        has_google = any("gemini" in m for m in PRIMARY_MODELS)

        assert has_openai, "Primary models should include OpenAI"
        assert has_anthropic, "Primary models should include Anthropic"
        assert has_google, "Primary models should include Google"


class TestDefaultModel:
    """Tests for DEFAULT_MODEL configuration."""

    def test_default_model_is_valid(self):
        """Test that default model is in supported models."""
        from app.config import DEFAULT_MODEL, SUPPORTED_MODELS_SET

        assert DEFAULT_MODEL in SUPPORTED_MODELS_SET

    def test_default_model_from_env(self):
        """Test that DEFAULT_MODEL can be set via environment."""
        with patch.dict(os.environ, {"DEFAULT_MODEL": "claude-sonnet-4-20250514"}):
            # Need to reimport to pick up new env var
            import importlib

            import app.config

            importlib.reload(app.config)
            from app.config import DEFAULT_MODEL

            assert DEFAULT_MODEL == "claude-sonnet-4-20250514"

            # Restore original
            importlib.reload(app.config)


class TestIsValidModel:
    """Tests for is_valid_model function."""

    def test_valid_model_returns_true(self):
        """Test that valid models return True."""
        from app.config import SUPPORTED_MODELS, is_valid_model

        for model in SUPPORTED_MODELS:
            assert is_valid_model(model) is True

    def test_invalid_model_returns_false(self):
        """Test that invalid models return False."""
        from app.config import is_valid_model

        assert is_valid_model("invalid-model") is False
        assert is_valid_model("") is False
        assert is_valid_model("gpt-99") is False

    def test_case_sensitive(self):
        """Test that model validation is case-sensitive."""
        from app.config import is_valid_model

        # Original case should work
        assert is_valid_model("gpt-5") is True

        # Wrong case should fail
        assert is_valid_model("GPT-5") is False
        assert is_valid_model("Gpt-5") is False


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
        from app.config import SUPPORTED_MODELS, get_all_models

        result = get_all_models()
        assert len(result) == len(SUPPORTED_MODELS)

    def test_returns_copy(self):
        """Test that get_all_models returns a copy."""
        from app.config import SUPPORTED_MODELS, get_all_models

        result = get_all_models()
        result.append("test-model")

        # Original should not be modified
        assert "test-model" not in SUPPORTED_MODELS
