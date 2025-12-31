"""Tests for metrics module.

Tests cover:
- MetricsTracker methods
- Metrics endpoint
- Health metrics endpoint
"""

import pytest


class TestMetricsTracker:
    """Tests for MetricsTracker class."""

    def test_track_inference_context_manager(self):
        """Test track_inference returns a context manager."""
        from app.metrics import MetricsTracker

        timer = MetricsTracker.track_inference("gpt-4", "writer", "generate")
        assert hasattr(timer, "__enter__")
        assert hasattr(timer, "__exit__")

        # Use the context manager
        with timer:
            pass  # Timer runs

    def test_track_tokens(self):
        """Test tracking token usage."""
        from app.metrics import MetricsTracker

        # This should not raise
        MetricsTracker.track_tokens(
            model="gpt-4",
            agent="writer",
            prompt_tokens=100,
            completion_tokens=500,
        )

    def test_track_cost(self):
        """Test tracking cost."""
        from app.metrics import MetricsTracker

        # This should not raise
        MetricsTracker.track_cost(
            model="gpt-4",
            agent="writer",
            cost_usd=0.05,
        )

    def test_track_cache_hit(self):
        """Test tracking cache hit."""
        from app.metrics import MetricsTracker

        MetricsTracker.track_cache(hit=True, cache_type="response")

    def test_track_cache_miss(self):
        """Test tracking cache miss."""
        from app.metrics import MetricsTracker

        MetricsTracker.track_cache(hit=False, cache_type="response")

    def test_track_api_request(self):
        """Test tracking API request."""
        from app.metrics import MetricsTracker

        MetricsTracker.track_api_request(
            method="GET",
            endpoint="/api/v1/projects",
            status_code=200,
        )

    def test_track_model_error(self):
        """Test tracking model errors."""
        from app.metrics import MetricsTracker

        MetricsTracker.track_model_error(
            model="gpt-4",
            error_type="rate_limit",
        )


class TestMetricsEndpoint:
    """Tests for metrics endpoint."""

    @pytest.mark.asyncio
    async def test_get_metrics(self):
        """Test getting Prometheus metrics."""
        from app.metrics import get_metrics

        response = await get_metrics()
        assert response.status_code == 200
        assert "text/plain" in response.media_type

    @pytest.mark.asyncio
    async def test_health_metrics(self):
        """Test health metrics endpoint."""
        from app.metrics import health_metrics

        result = await health_metrics()
        assert "status" in result
        assert result["status"] == "healthy"
        assert "active_sessions" in result
        assert "websocket_connections" in result


class TestMetricsGauges:
    """Tests for metric gauge operations."""

    def test_active_sessions_gauge(self):
        """Test active sessions gauge."""
        from app.metrics import active_sessions

        # Set to a known value
        active_sessions.set(5)
        assert active_sessions._value.get() == 5

        # Increment
        active_sessions.inc()
        assert active_sessions._value.get() == 6

        # Decrement
        active_sessions.dec()
        assert active_sessions._value.get() == 5

    def test_websocket_connections_gauge(self):
        """Test websocket connections gauge."""
        from app.metrics import websocket_connections

        websocket_connections.set(3)
        assert websocket_connections._value.get() == 3


class TestMetricsCounters:
    """Tests for metric counter operations."""

    def test_budget_exceeded_counter(self):
        """Test budget exceeded counter."""
        from app.metrics import budget_exceeded

        # Get initial value (may be from previous tests)
        initial = budget_exceeded.labels(project_id="test-project")._value.get()

        # Increment
        budget_exceeded.labels(project_id="test-project").inc()
        assert budget_exceeded.labels(project_id="test-project")._value.get() == initial + 1


class TestMetricsRegistry:
    """Tests for metrics registry configuration."""

    def test_registry_exists(self):
        """Test that registry is properly configured."""
        from app.metrics import registry

        assert registry is not None

    def test_all_metrics_registered(self):
        """Test that all metrics are registered."""
        from app.metrics import (
            api_request_duration,
            api_requests,
            cache_hits,
            cache_misses,
            llm_cost_usd,
            llm_inference_seconds,
            llm_tokens_total,
            model_errors,
        )

        # All metrics should have their describe method working
        assert len(list(llm_inference_seconds.describe())) > 0
        assert len(list(llm_tokens_total.describe())) > 0
        assert len(list(llm_cost_usd.describe())) > 0
        assert len(list(cache_hits.describe())) > 0
        assert len(list(cache_misses.describe())) > 0
        assert len(list(api_requests.describe())) > 0
        assert len(list(api_request_duration.describe())) > 0
        assert len(list(model_errors.describe())) > 0
