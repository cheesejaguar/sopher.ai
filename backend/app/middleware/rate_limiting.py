"""Enhanced rate limiting middleware.

This module provides:
- Per-endpoint rate limits
- Abuse detection
- Graceful degradation
- Sliding window rate limiting
"""

import asyncio
import time
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class RateLimitTier(Enum):
    """Rate limit tiers for different user types."""

    ANONYMOUS = "anonymous"
    FREE = "free"
    BASIC = "basic"
    PRO = "pro"
    ENTERPRISE = "enterprise"
    UNLIMITED = "unlimited"


class RateLimitAction(Enum):
    """Actions to take when rate limit is exceeded."""

    BLOCK = "block"
    SLOW_DOWN = "slow_down"
    LOG_ONLY = "log_only"
    QUEUE = "queue"


@dataclass
class RateLimitConfig:
    """Configuration for rate limiting."""

    requests_per_minute: int = 60
    requests_per_hour: int = 1000
    requests_per_day: int = 10000
    burst_limit: int = 10
    burst_window_seconds: int = 1
    action: RateLimitAction = RateLimitAction.BLOCK
    slowdown_factor: float = 2.0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "requests_per_minute": self.requests_per_minute,
            "requests_per_hour": self.requests_per_hour,
            "requests_per_day": self.requests_per_day,
            "burst_limit": self.burst_limit,
            "burst_window_seconds": self.burst_window_seconds,
            "action": self.action.value,
            "slowdown_factor": self.slowdown_factor,
        }


# Default rate limits by tier
TIER_LIMITS: dict[RateLimitTier, RateLimitConfig] = {
    RateLimitTier.ANONYMOUS: RateLimitConfig(
        requests_per_minute=10,
        requests_per_hour=100,
        requests_per_day=500,
        burst_limit=3,
    ),
    RateLimitTier.FREE: RateLimitConfig(
        requests_per_minute=30,
        requests_per_hour=500,
        requests_per_day=2000,
        burst_limit=5,
    ),
    RateLimitTier.BASIC: RateLimitConfig(
        requests_per_minute=60,
        requests_per_hour=1000,
        requests_per_day=5000,
        burst_limit=10,
    ),
    RateLimitTier.PRO: RateLimitConfig(
        requests_per_minute=120,
        requests_per_hour=3000,
        requests_per_day=20000,
        burst_limit=20,
    ),
    RateLimitTier.ENTERPRISE: RateLimitConfig(
        requests_per_minute=300,
        requests_per_hour=10000,
        requests_per_day=100000,
        burst_limit=50,
    ),
    RateLimitTier.UNLIMITED: RateLimitConfig(
        requests_per_minute=1000000,
        requests_per_hour=1000000,
        requests_per_day=1000000,
        burst_limit=1000,
        action=RateLimitAction.LOG_ONLY,
    ),
}


# Endpoint-specific overrides
ENDPOINT_LIMITS: dict[str, RateLimitConfig] = {
    "/api/v1/outline/stream": RateLimitConfig(
        requests_per_minute=5,
        requests_per_hour=50,
        burst_limit=2,
    ),
    "/api/v1/chapters/*/generate/stream": RateLimitConfig(
        requests_per_minute=10,
        requests_per_hour=100,
        burst_limit=3,
    ),
    "/api/v1/export": RateLimitConfig(
        requests_per_minute=5,
        requests_per_hour=30,
        burst_limit=2,
    ),
    "/api/v1/auth/login": RateLimitConfig(
        requests_per_minute=5,
        requests_per_hour=20,
        burst_limit=3,
        action=RateLimitAction.SLOW_DOWN,
    ),
}


@dataclass
class RateLimitState:
    """State for a single client's rate limiting."""

    client_id: str
    tier: RateLimitTier = RateLimitTier.ANONYMOUS
    minute_count: int = 0
    hour_count: int = 0
    day_count: int = 0
    burst_timestamps: list[float] = field(default_factory=list)
    minute_reset: float = 0.0
    hour_reset: float = 0.0
    day_reset: float = 0.0
    is_blocked: bool = False
    blocked_until: Optional[float] = None
    abuse_score: float = 0.0
    request_history: list[float] = field(default_factory=list)

    def reset_if_needed(self) -> None:
        """Reset counters if time windows have passed."""
        now = time.time()

        if now >= self.minute_reset:
            self.minute_count = 0
            self.minute_reset = now + 60

        if now >= self.hour_reset:
            self.hour_count = 0
            self.hour_reset = now + 3600

        if now >= self.day_reset:
            self.day_count = 0
            self.day_reset = now + 86400

        # Clean old burst timestamps
        self.burst_timestamps = [t for t in self.burst_timestamps if now - t < 1]

        # Clean old request history (keep last 5 minutes)
        self.request_history = [t for t in self.request_history if now - t < 300]

        # Check if block has expired
        if self.blocked_until and now >= self.blocked_until:
            self.is_blocked = False
            self.blocked_until = None


@dataclass
class RateLimitResult:
    """Result of a rate limit check."""

    allowed: bool
    remaining_minute: int = 0
    remaining_hour: int = 0
    remaining_day: int = 0
    retry_after_seconds: Optional[int] = None
    reason: Optional[str] = None
    slowdown_seconds: float = 0.0

    def to_headers(self) -> dict[str, str]:
        """Convert to HTTP headers."""
        headers = {
            "X-RateLimit-Remaining-Minute": str(self.remaining_minute),
            "X-RateLimit-Remaining-Hour": str(self.remaining_hour),
            "X-RateLimit-Remaining-Day": str(self.remaining_day),
        }
        if self.retry_after_seconds:
            headers["Retry-After"] = str(self.retry_after_seconds)
        return headers


@dataclass
class AbusePattern:
    """Pattern for abuse detection."""

    name: str
    description: str
    threshold: float
    window_seconds: int
    severity: float

    def check(self, state: RateLimitState) -> float:
        """Check if pattern is detected, return severity score."""
        raise NotImplementedError


class BurstPattern(AbusePattern):
    """Detect burst request patterns."""

    def check(self, state: RateLimitState) -> float:
        """Check for burst pattern."""
        now = time.time()
        recent = [t for t in state.request_history if now - t < self.window_seconds]
        if len(recent) > self.threshold:
            return self.severity
        return 0.0


class ConstantPattern(AbusePattern):
    """Detect constant rate patterns (bot-like behavior)."""

    def check(self, state: RateLimitState) -> float:
        """Check for constant rate pattern."""
        if len(state.request_history) < 10:
            return 0.0

        # Calculate variance in request intervals
        intervals = []
        for i in range(1, len(state.request_history)):
            intervals.append(state.request_history[i] - state.request_history[i - 1])

        if not intervals:
            return 0.0

        avg = sum(intervals) / len(intervals)
        variance = sum((x - avg) ** 2 for x in intervals) / len(intervals)

        # Very low variance suggests automated requests
        if variance < self.threshold:
            return self.severity
        return 0.0


class AbuseDetector:
    """Detects abuse patterns in request behavior."""

    def __init__(self) -> None:
        self.patterns: list[AbusePattern] = [
            BurstPattern(
                name="rapid_burst",
                description="Too many requests in short window",
                threshold=20,
                window_seconds=5,
                severity=0.3,
            ),
            ConstantPattern(
                name="bot_like",
                description="Constant rate suggests automation",
                threshold=0.1,
                window_seconds=60,
                severity=0.5,
            ),
        ]

    def analyze(self, state: RateLimitState) -> tuple[float, list[str]]:
        """Analyze request patterns for abuse."""
        total_score = 0.0
        detected_patterns = []

        for pattern in self.patterns:
            score = pattern.check(state)
            if score > 0:
                total_score += score
                detected_patterns.append(pattern.name)

        return min(total_score, 1.0), detected_patterns


class SlidingWindowCounter:
    """Sliding window rate limiting implementation."""

    def __init__(self, window_seconds: int, limit: int) -> None:
        self.window_seconds = window_seconds
        self.limit = limit
        self._buckets: dict[str, list[tuple[float, int]]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def check_and_increment(self, key: str, count: int = 1) -> tuple[bool, int]:
        """Check if under limit and increment counter."""
        async with self._lock:
            now = time.time()
            cutoff = now - self.window_seconds

            # Clean old buckets
            self._buckets[key] = [(ts, c) for ts, c in self._buckets[key] if ts > cutoff]

            # Calculate current count
            current = sum(c for _, c in self._buckets[key])

            if current + count > self.limit:
                return False, self.limit - current

            # Add new count
            self._buckets[key].append((now, count))
            return True, self.limit - current - count

    async def get_remaining(self, key: str) -> int:
        """Get remaining requests in window."""
        async with self._lock:
            now = time.time()
            cutoff = now - self.window_seconds

            self._buckets[key] = [(ts, c) for ts, c in self._buckets[key] if ts > cutoff]

            current = sum(c for _, c in self._buckets[key])
            return max(0, self.limit - current)


class RateLimiter:
    """Main rate limiting service."""

    def __init__(self) -> None:
        self._states: dict[str, RateLimitState] = {}
        self._lock = asyncio.Lock()
        self._abuse_detector = AbuseDetector()
        self._minute_counters: dict[str, SlidingWindowCounter] = {}
        self._hour_counters: dict[str, SlidingWindowCounter] = {}

    async def get_state(self, client_id: str) -> RateLimitState:
        """Get or create state for a client."""
        async with self._lock:
            if client_id not in self._states:
                self._states[client_id] = RateLimitState(
                    client_id=client_id,
                    minute_reset=time.time() + 60,
                    hour_reset=time.time() + 3600,
                    day_reset=time.time() + 86400,
                )
            return self._states[client_id]

    def get_config(self, tier: RateLimitTier, endpoint: Optional[str] = None) -> RateLimitConfig:
        """Get rate limit config for tier and optional endpoint."""
        # Start with tier config
        config = TIER_LIMITS.get(tier, TIER_LIMITS[RateLimitTier.ANONYMOUS])

        # Check for endpoint-specific overrides
        if endpoint:
            for pattern, endpoint_config in ENDPOINT_LIMITS.items():
                if self._match_endpoint(endpoint, pattern):
                    # Use the more restrictive limits
                    return RateLimitConfig(
                        requests_per_minute=min(
                            config.requests_per_minute,
                            endpoint_config.requests_per_minute,
                        ),
                        requests_per_hour=min(
                            config.requests_per_hour,
                            endpoint_config.requests_per_hour,
                        ),
                        requests_per_day=min(
                            config.requests_per_day,
                            endpoint_config.requests_per_day,
                        ),
                        burst_limit=min(
                            config.burst_limit,
                            endpoint_config.burst_limit,
                        ),
                        action=endpoint_config.action,
                    )

        return config

    def _match_endpoint(self, endpoint: str, pattern: str) -> bool:
        """Match endpoint against pattern with wildcards."""
        import fnmatch

        return fnmatch.fnmatch(endpoint, pattern)

    async def check(
        self,
        client_id: str,
        tier: RateLimitTier = RateLimitTier.ANONYMOUS,
        endpoint: Optional[str] = None,
    ) -> RateLimitResult:
        """Check if request is allowed."""
        state = await self.get_state(client_id)
        state.reset_if_needed()
        config = self.get_config(tier, endpoint)

        # Record request timestamp
        state.request_history.append(time.time())

        # Check if currently blocked
        if state.is_blocked:
            retry_after = int(state.blocked_until - time.time()) if state.blocked_until else 60
            return RateLimitResult(
                allowed=False,
                reason="Client is temporarily blocked",
                retry_after_seconds=max(1, retry_after),
            )

        # Check burst limit
        state.burst_timestamps.append(time.time())
        if len(state.burst_timestamps) > config.burst_limit:
            return RateLimitResult(
                allowed=False,
                reason="Burst limit exceeded",
                retry_after_seconds=config.burst_window_seconds,
            )

        # Check minute limit
        state.minute_count += 1
        if state.minute_count > config.requests_per_minute:
            return self._handle_limit_exceeded(
                state, config, "minute", int(state.minute_reset - time.time())
            )

        # Check hour limit
        state.hour_count += 1
        if state.hour_count > config.requests_per_hour:
            return self._handle_limit_exceeded(
                state, config, "hour", int(state.hour_reset - time.time())
            )

        # Check day limit
        state.day_count += 1
        if state.day_count > config.requests_per_day:
            return self._handle_limit_exceeded(
                state, config, "day", int(state.day_reset - time.time())
            )

        # Check for abuse patterns
        abuse_score, patterns = self._abuse_detector.analyze(state)
        state.abuse_score = abuse_score

        if abuse_score > 0.7:
            # Block for increasing duration based on abuse score
            block_duration = int(60 * abuse_score * 10)
            state.is_blocked = True
            state.blocked_until = time.time() + block_duration
            return RateLimitResult(
                allowed=False,
                reason=f"Abuse detected: {', '.join(patterns)}",
                retry_after_seconds=block_duration,
            )

        # Calculate slowdown if needed
        slowdown = 0.0
        if abuse_score > 0.3:
            slowdown = abuse_score * config.slowdown_factor

        return RateLimitResult(
            allowed=True,
            remaining_minute=config.requests_per_minute - state.minute_count,
            remaining_hour=config.requests_per_hour - state.hour_count,
            remaining_day=config.requests_per_day - state.day_count,
            slowdown_seconds=slowdown,
        )

    def _handle_limit_exceeded(
        self,
        state: RateLimitState,
        config: RateLimitConfig,
        period: str,
        retry_after: int,
    ) -> RateLimitResult:
        """Handle rate limit exceeded."""
        if config.action == RateLimitAction.BLOCK:
            return RateLimitResult(
                allowed=False,
                reason=f"{period} rate limit exceeded",
                retry_after_seconds=max(1, retry_after),
            )
        elif config.action == RateLimitAction.SLOW_DOWN:
            return RateLimitResult(
                allowed=True,
                reason=f"{period} rate limit exceeded, slowing down",
                slowdown_seconds=config.slowdown_factor,
            )
        elif config.action == RateLimitAction.LOG_ONLY:
            return RateLimitResult(
                allowed=True,
                reason=f"{period} rate limit exceeded, logged only",
            )
        else:
            return RateLimitResult(
                allowed=False,
                reason=f"{period} rate limit exceeded",
                retry_after_seconds=max(1, retry_after),
            )

    async def get_stats(self, client_id: str) -> dict[str, Any]:
        """Get rate limiting stats for a client."""
        state = await self.get_state(client_id)
        state.reset_if_needed()

        return {
            "client_id": client_id,
            "tier": state.tier.value,
            "minute_count": state.minute_count,
            "hour_count": state.hour_count,
            "day_count": state.day_count,
            "is_blocked": state.is_blocked,
            "blocked_until": state.blocked_until,
            "abuse_score": state.abuse_score,
            "recent_requests": len(state.request_history),
        }

    async def reset(self, client_id: str) -> bool:
        """Reset rate limits for a client."""
        async with self._lock:
            if client_id in self._states:
                del self._states[client_id]
                return True
            return False

    async def set_tier(self, client_id: str, tier: RateLimitTier) -> None:
        """Set the rate limit tier for a client."""
        state = await self.get_state(client_id)
        state.tier = tier

    async def cleanup(self, max_idle_seconds: int = 3600) -> int:
        """Clean up idle client states."""
        async with self._lock:
            now = time.time()
            to_remove = []

            for client_id, state in self._states.items():
                if not state.request_history:
                    to_remove.append(client_id)
                elif now - state.request_history[-1] > max_idle_seconds:
                    to_remove.append(client_id)

            for client_id in to_remove:
                del self._states[client_id]

            return len(to_remove)


class GracefulDegradation:
    """Handles graceful degradation under load."""

    def __init__(self) -> None:
        self._load_level: float = 0.0
        self._feature_thresholds: dict[str, float] = {
            "ai_generation": 0.7,
            "exports": 0.8,
            "analytics": 0.5,
            "real_time": 0.9,
        }

    def set_load_level(self, level: float) -> None:
        """Set current load level (0-1)."""
        self._load_level = max(0.0, min(1.0, level))

    def is_feature_available(self, feature: str) -> bool:
        """Check if a feature is available at current load."""
        threshold = self._feature_thresholds.get(feature, 1.0)
        return self._load_level < threshold

    def get_available_features(self) -> list[str]:
        """Get list of currently available features."""
        return [
            feature
            for feature, threshold in self._feature_thresholds.items()
            if self._load_level < threshold
        ]

    def get_degradation_message(self) -> Optional[str]:
        """Get message about current degradation state."""
        if self._load_level < 0.5:
            return None
        elif self._load_level < 0.7:
            return "System is under moderate load. Some features may be slower."
        elif self._load_level < 0.9:
            return "System is under heavy load. Non-essential features are disabled."
        else:
            return "System is at capacity. Only essential operations are available."


# Global instances
rate_limiter = RateLimiter()
graceful_degradation = GracefulDegradation()
