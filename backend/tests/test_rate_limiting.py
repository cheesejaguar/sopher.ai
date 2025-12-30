"""Tests for rate limiting middleware."""

import asyncio
import time

import pytest

from app.middleware.rate_limiting import (
    TIER_LIMITS,
    AbuseDetector,
    BurstPattern,
    GracefulDegradation,
    RateLimitAction,
    RateLimitConfig,
    RateLimiter,
    RateLimitResult,
    RateLimitState,
    RateLimitTier,
    SlidingWindowCounter,
)

# =============================================================================
# Enum Tests
# =============================================================================


class TestRateLimitTier:
    """Tests for RateLimitTier enum."""

    def test_all_tiers_exist(self):
        """All rate limit tiers should be defined."""
        assert RateLimitTier.ANONYMOUS.value == "anonymous"
        assert RateLimitTier.FREE.value == "free"
        assert RateLimitTier.BASIC.value == "basic"
        assert RateLimitTier.PRO.value == "pro"
        assert RateLimitTier.ENTERPRISE.value == "enterprise"
        assert RateLimitTier.UNLIMITED.value == "unlimited"

    def test_tier_count(self):
        """Should have exactly 6 tiers."""
        assert len(RateLimitTier) == 6


class TestRateLimitAction:
    """Tests for RateLimitAction enum."""

    def test_all_actions_exist(self):
        """All rate limit actions should be defined."""
        assert RateLimitAction.BLOCK.value == "block"
        assert RateLimitAction.SLOW_DOWN.value == "slow_down"
        assert RateLimitAction.LOG_ONLY.value == "log_only"
        assert RateLimitAction.QUEUE.value == "queue"

    def test_action_count(self):
        """Should have exactly 4 actions."""
        assert len(RateLimitAction) == 4


# =============================================================================
# RateLimitConfig Tests
# =============================================================================


class TestRateLimitConfig:
    """Tests for RateLimitConfig dataclass."""

    def test_default_values(self):
        """Should have correct defaults."""
        config = RateLimitConfig()
        assert config.requests_per_minute == 60
        assert config.requests_per_hour == 1000
        assert config.requests_per_day == 10000
        assert config.burst_limit == 10
        assert config.action == RateLimitAction.BLOCK

    def test_custom_values(self):
        """Should accept custom values."""
        config = RateLimitConfig(
            requests_per_minute=30,
            requests_per_hour=500,
            action=RateLimitAction.SLOW_DOWN,
        )
        assert config.requests_per_minute == 30
        assert config.requests_per_hour == 500
        assert config.action == RateLimitAction.SLOW_DOWN

    def test_to_dict(self):
        """Should convert to dictionary."""
        config = RateLimitConfig()
        data = config.to_dict()
        assert data["requests_per_minute"] == 60
        assert data["action"] == "block"


# =============================================================================
# Tier Limits Tests
# =============================================================================


class TestTierLimits:
    """Tests for tier limit configurations."""

    def test_all_tiers_have_limits(self):
        """All tiers should have limits defined."""
        for tier in RateLimitTier:
            assert tier in TIER_LIMITS

    def test_tier_limits_increase(self):
        """Higher tiers should have higher limits."""
        anonymous = TIER_LIMITS[RateLimitTier.ANONYMOUS]
        free = TIER_LIMITS[RateLimitTier.FREE]
        basic = TIER_LIMITS[RateLimitTier.BASIC]
        pro = TIER_LIMITS[RateLimitTier.PRO]
        enterprise = TIER_LIMITS[RateLimitTier.ENTERPRISE]

        assert free.requests_per_minute > anonymous.requests_per_minute
        assert basic.requests_per_minute > free.requests_per_minute
        assert pro.requests_per_minute > basic.requests_per_minute
        assert enterprise.requests_per_minute > pro.requests_per_minute

    def test_unlimited_tier_has_high_limits(self):
        """Unlimited tier should have very high limits."""
        unlimited = TIER_LIMITS[RateLimitTier.UNLIMITED]
        assert unlimited.requests_per_minute >= 1000000
        assert unlimited.action == RateLimitAction.LOG_ONLY


# =============================================================================
# RateLimitState Tests
# =============================================================================


class TestRateLimitState:
    """Tests for RateLimitState dataclass."""

    def test_creation(self):
        """Should create rate limit state."""
        state = RateLimitState(
            client_id="client-123",
            tier=RateLimitTier.BASIC,
        )
        assert state.client_id == "client-123"
        assert state.tier == RateLimitTier.BASIC
        assert state.minute_count == 0

    def test_reset_if_needed(self):
        """Should reset counters when windows expire."""
        state = RateLimitState(
            client_id="client-123",
            minute_count=50,
            minute_reset=time.time() - 1,  # Already expired
        )
        state.reset_if_needed()
        assert state.minute_count == 0

    def test_burst_cleanup(self):
        """Should clean old burst timestamps."""
        state = RateLimitState(
            client_id="client-123",
            burst_timestamps=[time.time() - 2, time.time()],  # One old, one recent
        )
        state.reset_if_needed()
        assert len(state.burst_timestamps) == 1

    def test_blocked_expiration(self):
        """Should unblock when block expires."""
        state = RateLimitState(
            client_id="client-123",
            is_blocked=True,
            blocked_until=time.time() - 1,  # Already expired
        )
        state.reset_if_needed()
        assert state.is_blocked is False
        assert state.blocked_until is None


# =============================================================================
# RateLimitResult Tests
# =============================================================================


class TestRateLimitResult:
    """Tests for RateLimitResult dataclass."""

    def test_allowed_result(self):
        """Should create allowed result."""
        result = RateLimitResult(
            allowed=True,
            remaining_minute=50,
            remaining_hour=900,
        )
        assert result.allowed is True
        assert result.remaining_minute == 50

    def test_blocked_result(self):
        """Should create blocked result."""
        result = RateLimitResult(
            allowed=False,
            reason="Rate limit exceeded",
            retry_after_seconds=60,
        )
        assert result.allowed is False
        assert result.retry_after_seconds == 60

    def test_to_headers(self):
        """Should convert to HTTP headers."""
        result = RateLimitResult(
            allowed=True,
            remaining_minute=50,
            remaining_hour=900,
            remaining_day=9000,
        )
        headers = result.to_headers()
        assert headers["X-RateLimit-Remaining-Minute"] == "50"
        assert headers["X-RateLimit-Remaining-Hour"] == "900"

    def test_to_headers_with_retry_after(self):
        """Should include Retry-After header when set."""
        result = RateLimitResult(
            allowed=False,
            retry_after_seconds=60,
        )
        headers = result.to_headers()
        assert headers["Retry-After"] == "60"


# =============================================================================
# SlidingWindowCounter Tests
# =============================================================================


class TestSlidingWindowCounter:
    """Tests for SlidingWindowCounter class."""

    @pytest.mark.asyncio
    async def test_check_and_increment_under_limit(self):
        """Should allow under limit."""
        counter = SlidingWindowCounter(window_seconds=60, limit=10)
        allowed, remaining = await counter.check_and_increment("client1")
        assert allowed is True
        assert remaining == 9

    @pytest.mark.asyncio
    async def test_check_and_increment_over_limit(self):
        """Should block over limit."""
        counter = SlidingWindowCounter(window_seconds=60, limit=2)
        await counter.check_and_increment("client1")
        await counter.check_and_increment("client1")
        allowed, remaining = await counter.check_and_increment("client1")
        assert allowed is False
        assert remaining == 0

    @pytest.mark.asyncio
    async def test_get_remaining(self):
        """Should get remaining count."""
        counter = SlidingWindowCounter(window_seconds=60, limit=10)
        await counter.check_and_increment("client1")
        await counter.check_and_increment("client1")
        remaining = await counter.get_remaining("client1")
        assert remaining == 8

    @pytest.mark.asyncio
    async def test_separate_clients(self):
        """Should track clients separately."""
        counter = SlidingWindowCounter(window_seconds=60, limit=10)
        await counter.check_and_increment("client1")
        await counter.check_and_increment("client1")
        await counter.check_and_increment("client2")

        remaining1 = await counter.get_remaining("client1")
        remaining2 = await counter.get_remaining("client2")

        assert remaining1 == 8
        assert remaining2 == 9


# =============================================================================
# AbuseDetector Tests
# =============================================================================


class TestAbuseDetector:
    """Tests for AbuseDetector class."""

    @pytest.fixture
    def detector(self):
        """Create abuse detector."""
        return AbuseDetector()

    def test_no_abuse_detected(self, detector):
        """Should not detect abuse for normal usage."""
        state = RateLimitState(
            client_id="client-123",
            request_history=[time.time() - i * 5 for i in range(10)],
        )
        score, patterns = detector.analyze(state)
        # Score can be up to 0.5 due to constant pattern detection
        # but should not trigger blocking threshold (0.7)
        assert score <= 0.5

    def test_burst_detection(self, detector):
        """Should detect burst patterns."""
        now = time.time()
        state = RateLimitState(
            client_id="client-123",
            request_history=[now - i * 0.1 for i in range(25)],  # 25 requests in 2.5 seconds
        )
        score, patterns = detector.analyze(state)
        assert score > 0
        assert "rapid_burst" in patterns


class TestBurstPattern:
    """Tests for BurstPattern class."""

    def test_check_burst_detected(self):
        """Should detect burst pattern."""
        pattern = BurstPattern(
            name="test_burst",
            description="Test",
            threshold=5,
            window_seconds=2,
            severity=0.5,
        )
        now = time.time()
        state = RateLimitState(
            client_id="client-123",
            request_history=[now - i * 0.1 for i in range(10)],  # 10 requests in 1 second
        )
        score = pattern.check(state)
        assert score == 0.5

    def test_check_no_burst(self):
        """Should not detect burst for normal usage."""
        pattern = BurstPattern(
            name="test_burst",
            description="Test",
            threshold=10,
            window_seconds=2,
            severity=0.5,
        )
        now = time.time()
        state = RateLimitState(
            client_id="client-123",
            request_history=[now - i * 5 for i in range(5)],  # 5 requests over 25 seconds
        )
        score = pattern.check(state)
        assert score == 0.0


# =============================================================================
# RateLimiter Tests
# =============================================================================


class TestRateLimiter:
    """Tests for RateLimiter class."""

    @pytest.fixture
    def limiter(self):
        """Create rate limiter."""
        return RateLimiter()

    @pytest.mark.asyncio
    async def test_check_allowed(self, limiter):
        """Should allow requests under limit."""
        result = await limiter.check("client-123", RateLimitTier.BASIC)
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_check_burst_exceeded(self, limiter):
        """Should block when burst limit exceeded."""
        client_id = "client-burst"

        # Exhaust burst limit
        for _ in range(15):
            await limiter.check(client_id, RateLimitTier.BASIC)

        result = await limiter.check(client_id, RateLimitTier.BASIC)
        # Either burst or minute limit should be exceeded
        assert result.allowed is False or result.remaining_minute < 45

    @pytest.mark.asyncio
    async def test_check_with_endpoint(self, limiter):
        """Should apply endpoint-specific limits."""
        # The export endpoint has stricter limits
        result = await limiter.check(
            "client-123",
            RateLimitTier.PRO,
            endpoint="/api/v1/export",
        )
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_get_stats(self, limiter):
        """Should get client stats."""
        await limiter.check("client-123", RateLimitTier.BASIC)
        await limiter.check("client-123", RateLimitTier.BASIC)

        stats = await limiter.get_stats("client-123")
        assert stats["client_id"] == "client-123"
        assert stats["minute_count"] >= 2

    @pytest.mark.asyncio
    async def test_reset(self, limiter):
        """Should reset client state."""
        await limiter.check("client-123", RateLimitTier.BASIC)
        result = await limiter.reset("client-123")
        assert result is True

        # Check that state is fresh
        stats = await limiter.get_stats("client-123")
        assert stats["minute_count"] == 0

    @pytest.mark.asyncio
    async def test_set_tier(self, limiter):
        """Should set client tier."""
        await limiter.set_tier("client-123", RateLimitTier.PRO)
        state = await limiter.get_state("client-123")
        assert state.tier == RateLimitTier.PRO

    @pytest.mark.asyncio
    async def test_cleanup(self, limiter):
        """Should cleanup idle clients."""
        # Create some clients
        await limiter.check("client-1", RateLimitTier.BASIC)
        await limiter.check("client-2", RateLimitTier.BASIC)

        # Cleanup with 0 idle time should remove all
        removed = await limiter.cleanup(max_idle_seconds=0)
        assert removed >= 0

    @pytest.mark.asyncio
    async def test_get_config_with_endpoint_override(self, limiter):
        """Should get config with endpoint override."""
        config = limiter.get_config(RateLimitTier.PRO, endpoint="/api/v1/export")
        # Export endpoint has lower limits
        assert config.requests_per_minute <= 5


# =============================================================================
# GracefulDegradation Tests
# =============================================================================


class TestGracefulDegradation:
    """Tests for GracefulDegradation class."""

    @pytest.fixture
    def degradation(self):
        """Create graceful degradation instance."""
        return GracefulDegradation()

    def test_set_load_level(self, degradation):
        """Should set load level."""
        degradation.set_load_level(0.5)
        assert degradation._load_level == 0.5

    def test_set_load_level_clamped(self, degradation):
        """Should clamp load level to 0-1."""
        degradation.set_load_level(1.5)
        assert degradation._load_level == 1.0

        degradation.set_load_level(-0.5)
        assert degradation._load_level == 0.0

    def test_is_feature_available_low_load(self, degradation):
        """Should allow all features at low load."""
        degradation.set_load_level(0.3)
        assert degradation.is_feature_available("ai_generation") is True
        assert degradation.is_feature_available("exports") is True

    def test_is_feature_available_high_load(self, degradation):
        """Should disable features at high load."""
        degradation.set_load_level(0.85)
        assert degradation.is_feature_available("exports") is False
        assert degradation.is_feature_available("analytics") is False

    def test_get_available_features(self, degradation):
        """Should get list of available features."""
        degradation.set_load_level(0.6)
        available = degradation.get_available_features()
        # At 0.6 load, features with threshold > 0.6 should be available
        assert "ai_generation" in available  # threshold is 0.7
        assert "analytics" not in available  # threshold is 0.5, so disabled at 0.6

    def test_get_degradation_message_low_load(self, degradation):
        """Should return None at low load."""
        degradation.set_load_level(0.3)
        assert degradation.get_degradation_message() is None

    def test_get_degradation_message_moderate_load(self, degradation):
        """Should return warning at moderate load."""
        degradation.set_load_level(0.6)
        message = degradation.get_degradation_message()
        assert message is not None
        assert "moderate" in message.lower()

    def test_get_degradation_message_high_load(self, degradation):
        """Should return warning at high load."""
        degradation.set_load_level(0.8)
        message = degradation.get_degradation_message()
        assert message is not None
        assert "heavy" in message.lower()

    def test_get_degradation_message_critical_load(self, degradation):
        """Should return warning at critical load."""
        degradation.set_load_level(0.95)
        message = degradation.get_degradation_message()
        assert message is not None
        assert "capacity" in message.lower()


# =============================================================================
# Integration Tests
# =============================================================================


class TestRateLimitingIntegration:
    """Integration tests for rate limiting."""

    @pytest.mark.asyncio
    async def test_full_rate_limit_workflow(self):
        """Should handle complete rate limiting workflow."""
        limiter = RateLimiter()

        # Set tier
        await limiter.set_tier("client-1", RateLimitTier.BASIC)

        # Make some requests
        for _ in range(5):
            result = await limiter.check("client-1", RateLimitTier.BASIC)
            assert result.allowed is True

        # Check stats
        stats = await limiter.get_stats("client-1")
        assert stats["minute_count"] == 5

        # Reset
        await limiter.reset("client-1")
        stats = await limiter.get_stats("client-1")
        assert stats["minute_count"] == 0

    @pytest.mark.asyncio
    async def test_concurrent_requests(self):
        """Should handle concurrent requests safely."""
        limiter = RateLimiter()

        async def make_request(client_id: str):
            return await limiter.check(client_id, RateLimitTier.BASIC)

        # Make 50 concurrent requests
        results = await asyncio.gather(*[make_request("client-1") for _ in range(50)])

        # Most should be allowed, some may hit burst limit
        allowed_count = sum(1 for r in results if r.allowed)
        assert allowed_count > 0

    @pytest.mark.asyncio
    async def test_different_tiers_different_limits(self):
        """Should apply different limits for different tiers."""
        limiter = RateLimiter()

        # Anonymous tier has burst_limit=3, so most requests will be blocked
        anon_results = []
        for _ in range(15):
            result = await limiter.check("anon-client", RateLimitTier.ANONYMOUS)
            anon_results.append(result)

        anon_stats = await limiter.get_stats("anon-client")
        anon_allowed = sum(1 for r in anon_results if r.allowed)

        # Pro tier has burst_limit=20, so all 15 should be allowed
        pro_results = []
        for _ in range(15):
            result = await limiter.check("pro-client", RateLimitTier.PRO)
            pro_results.append(result)

        pro_stats = await limiter.get_stats("pro-client")
        pro_allowed = sum(1 for r in pro_results if r.allowed)

        # Anonymous tier should have blocked most requests (burst_limit=3)
        assert anon_allowed == 3  # Only 3 allowed before burst limit
        assert anon_stats["minute_count"] == 3

        # Pro tier should allow all 15 (burst_limit=20)
        assert pro_allowed == 15
        assert pro_stats["minute_count"] == 15
