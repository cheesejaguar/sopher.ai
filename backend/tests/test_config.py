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

    def test_supported_models_contains_haiku(self):
        """Test that Anthropic Haiku model is included."""
        from app.config import SUPPORTED_MODELS

        haiku_models = [m for m in SUPPORTED_MODELS if "haiku" in m]
        assert len(haiku_models) >= 1

    def test_supported_models_contains_sonnet(self):
        """Test that Anthropic Sonnet model is included."""
        from app.config import SUPPORTED_MODELS

        sonnet_models = [m for m in SUPPORTED_MODELS if "sonnet" in m]
        assert len(sonnet_models) >= 1

    def test_supported_models_contains_opus(self):
        """Test that Anthropic Opus model is included."""
        from app.config import SUPPORTED_MODELS

        opus_models = [m for m in SUPPORTED_MODELS if "opus" in m]
        assert len(opus_models) >= 1

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

    def test_primary_models_are_anthropic(self):
        """Test that primary models are all Anthropic models."""
        from app.config import PRIMARY_MODELS

        has_anthropic = all("anthropic/" in m for m in PRIMARY_MODELS)

        assert has_anthropic, "Primary models should all be Anthropic models"


class TestDefaultModel:
    """Tests for DEFAULT_MODEL configuration."""

    def test_default_model_is_valid(self):
        """Test that default model is valid (starts with anthropic/)."""
        from app.config import DEFAULT_MODEL, is_valid_model

        # DEFAULT_MODEL is set from PRIMARY_MODEL env var or defaults
        # In test environment it might be set to anthropic/claude-sonnet-4.5
        assert is_valid_model(DEFAULT_MODEL), f"DEFAULT_MODEL {DEFAULT_MODEL} is not valid"

    def test_default_model_from_env(self):
        """Test that DEFAULT_MODEL can be set via environment."""
        with patch.dict(os.environ, {"PRIMARY_MODEL": "anthropic/claude-sonnet-4.5"}):
            # Need to reimport to pick up new env var
            import importlib

            import app.config

            importlib.reload(app.config)
            from app.config import DEFAULT_MODEL

            assert DEFAULT_MODEL == "anthropic/claude-sonnet-4.5"

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

    def test_anthropic_prefix_always_valid(self):
        """Test that any anthropic/ prefixed model is considered valid."""
        from app.config import is_valid_model

        # Any anthropic model should be valid for flexibility
        assert is_valid_model("anthropic/claude-sonnet-4.5") is True
        assert is_valid_model("anthropic/some-new-model/new-model") is True


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
