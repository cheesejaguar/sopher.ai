"""Tests for usage and budget tracking endpoints.

Tests cover:
- Get usage statistics
- Update budget
- Cost estimation
- Error handling
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.routers.usage import (
    BudgetUpdateRequest,
    EstimateRequest,
    EstimateResponse,
    UsageResponse,
    estimate_cost,
    get_usage,
    update_budget,
)
from app.security import TokenData


class TestUsageSchemas:
    """Tests for usage-related Pydantic schemas."""

    def test_usage_response_model(self):
        """Test UsageResponse schema."""
        response = UsageResponse(
            total_usd=100.0,
            month_usd=25.0,
            monthly_budget_usd=50.0,
            remaining_budget_usd=25.0,
            by_agent={"writer": 10.0, "editor": 15.0},
            by_model={"gpt-5": 20.0, "claude": 5.0},
        )
        assert response.total_usd == 100.0
        assert response.month_usd == 25.0
        assert response.remaining_budget_usd == 25.0

    def test_budget_update_request_validation(self):
        """Test BudgetUpdateRequest schema validation."""
        # Valid budget
        request = BudgetUpdateRequest(monthly_budget_usd=500.0)
        assert request.monthly_budget_usd == 500.0

    def test_budget_update_request_min_validation(self):
        """Test budget minimum validation."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            BudgetUpdateRequest(monthly_budget_usd=-1.0)

    def test_budget_update_request_max_validation(self):
        """Test budget maximum validation."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            BudgetUpdateRequest(monthly_budget_usd=10001.0)

    def test_estimate_request_defaults(self):
        """Test EstimateRequest default values."""
        request = EstimateRequest()
        # Default model is now openrouter/openai/chatgpt-5.2
        assert request.model.startswith("openrouter/")
        assert request.target_chapters == 12
        assert request.avg_prompt_tokens == 2000
        assert request.avg_completion_tokens == 4000

    def test_estimate_request_custom_values(self):
        """Test EstimateRequest with custom values."""
        request = EstimateRequest(
            model="openrouter/anthropic/claude-sonnet-4.5",
            target_chapters=20,
            avg_prompt_tokens=3000,
            avg_completion_tokens=5000,
        )
        assert request.model == "openrouter/anthropic/claude-sonnet-4.5"
        assert request.target_chapters == 20

    def test_estimate_response_model(self):
        """Test EstimateResponse schema."""
        response = EstimateResponse(
            estimated_usd=10.50,
            total_prompt_tokens=24000,
            total_completion_tokens=48000,
            breakdown={"prompt": 2.40, "completion": 8.10},
            model="gpt-5",
            chapters=12,
        )
        assert response.estimated_usd == 10.50
        assert response.chapters == 12


class TestGetUsage:
    """Tests for GET /users/me/usage endpoint."""

    @pytest.mark.asyncio
    async def test_get_usage_invalid_user_id(self):
        """Test get_usage with invalid user ID format."""
        from fastapi import HTTPException

        mock_db = AsyncMock()
        token_data = TokenData(user_id="invalid-uuid")

        with pytest.raises(HTTPException) as exc_info:
            await get_usage(current_user=token_data, db=mock_db)

        assert exc_info.value.status_code == 400
        assert "Invalid user ID" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_get_usage_user_not_found(self):
        """Test get_usage when user not found."""
        from fastapi import HTTPException

        mock_db = AsyncMock()
        user_id = str(uuid4())
        token_data = TokenData(user_id=user_id)

        # Mock user query returning None
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await get_usage(current_user=token_data, db=mock_db)

        assert exc_info.value.status_code == 404
        assert "User not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_get_usage_success(self):
        """Test successful get_usage."""
        mock_db = AsyncMock()
        user_id = str(uuid4())
        token_data = TokenData(user_id=user_id)

        # Mock user
        mock_user = MagicMock()
        mock_user.monthly_budget_usd = 100.0

        # Mock user query
        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_user

        # Mock total query
        mock_total_result = MagicMock()
        mock_total_result.scalar.return_value = 50.0

        # Mock month query
        mock_month_result = MagicMock()
        mock_month_result.scalar.return_value = 25.0

        # Mock agent query
        mock_agent_result = MagicMock()
        mock_agent_result.__iter__ = lambda self: iter([("writer", 10.0), ("editor", 15.0)])

        # Mock model query
        mock_model_result = MagicMock()
        mock_model_result.__iter__ = lambda self: iter([("gpt-5", 20.0), ("claude", 5.0)])

        # Set up side effects for multiple execute calls
        mock_db.execute = AsyncMock(
            side_effect=[
                mock_user_result,
                mock_total_result,
                mock_month_result,
                mock_agent_result,
                mock_model_result,
            ]
        )

        result = await get_usage(current_user=token_data, db=mock_db)

        assert result.total_usd == 50.0
        assert result.month_usd == 25.0
        assert result.monthly_budget_usd == 100.0
        assert result.remaining_budget_usd == 75.0


class TestUpdateBudget:
    """Tests for POST /users/me/budget endpoint."""

    @pytest.mark.asyncio
    async def test_update_budget_invalid_user_id(self):
        """Test update_budget with invalid user ID format."""
        from fastapi import HTTPException

        mock_db = AsyncMock()
        token_data = TokenData(user_id="invalid-uuid")
        request = BudgetUpdateRequest(monthly_budget_usd=200.0)

        with pytest.raises(HTTPException) as exc_info:
            await update_budget(request=request, current_user=token_data, db=mock_db)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_update_budget_user_not_found(self):
        """Test update_budget when user not found."""
        from fastapi import HTTPException

        mock_db = AsyncMock()
        user_id = str(uuid4())
        token_data = TokenData(user_id=user_id)
        request = BudgetUpdateRequest(monthly_budget_usd=200.0)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await update_budget(request=request, current_user=token_data, db=mock_db)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_update_budget_success(self):
        """Test successful budget update."""
        mock_db = AsyncMock()
        user_id = str(uuid4())
        token_data = TokenData(user_id=user_id)
        request = BudgetUpdateRequest(monthly_budget_usd=200.0)

        mock_user = MagicMock()
        mock_user.monthly_budget_usd = 200.0

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()

        result = await update_budget(request=request, current_user=token_data, db=mock_db)

        assert result["monthly_budget_usd"] == 200.0
        mock_db.commit.assert_called_once()


class TestEstimateCost:
    """Tests for POST /users/me/estimate endpoint."""

    @pytest.mark.asyncio
    async def test_estimate_cost_default_values(self):
        """Test estimate_cost with default values."""
        from unittest.mock import patch

        token_data = TokenData(user_id=str(uuid4()))
        request = EstimateRequest()

        mock_estimate = {
            "estimated_usd": 10.50,
            "total_prompt_tokens": 24000,
            "total_completion_tokens": 48000,
            "breakdown": {"prompt": 2.40, "completion": 8.10},
            "model": "gpt-5",
            "chapters": 12,
        }

        with patch("app.routers.usage.estimate_book_cost", return_value=mock_estimate):
            result = await estimate_cost(request=request, current_user=token_data)

        assert result.estimated_usd == 10.50
        assert result.model == "gpt-5"
        assert result.chapters == 12

    @pytest.mark.asyncio
    async def test_estimate_cost_custom_values(self):
        """Test estimate_cost with custom values."""
        from unittest.mock import patch

        token_data = TokenData(user_id=str(uuid4()))
        request = EstimateRequest(
            model="claude-sonnet-4-20250514",
            target_chapters=20,
            avg_prompt_tokens=3000,
            avg_completion_tokens=5000,
        )

        mock_estimate = {
            "estimated_usd": 25.00,
            "total_prompt_tokens": 60000,
            "total_completion_tokens": 100000,
            "breakdown": {"prompt": 10.00, "completion": 15.00},
            "model": "claude-sonnet-4-20250514",
            "chapters": 20,
        }

        with patch("app.routers.usage.estimate_book_cost", return_value=mock_estimate):
            result = await estimate_cost(request=request, current_user=token_data)

        assert result.estimated_usd == 25.00
        assert result.model == "claude-sonnet-4-20250514"
        assert result.chapters == 20
        assert result.total_prompt_tokens == 60000
