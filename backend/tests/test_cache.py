"""Tests for Redis cache module.

Tests cover:
- Cache initialization
- Get/set operations with JSON serialization
- TTL handling
- Increment operations for rate limiting
- Cache key generation
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.cache import TTL_DEFAULT, TTL_LONG, TTL_MEDIUM, TTL_SHORT, RedisCache


class TestCacheConstants:
    """Tests for cache TTL constants."""

    def test_ttl_short_is_5_minutes(self):
        """Test TTL_SHORT is 5 minutes (300 seconds)."""
        assert TTL_SHORT == 300

    def test_ttl_medium_is_10_minutes(self):
        """Test TTL_MEDIUM is 10 minutes (600 seconds)."""
        assert TTL_MEDIUM == 600

    def test_ttl_default_is_1_hour(self):
        """Test TTL_DEFAULT is 1 hour (3600 seconds)."""
        assert TTL_DEFAULT == 3600

    def test_ttl_long_is_24_hours(self):
        """Test TTL_LONG is 24 hours (86400 seconds)."""
        assert TTL_LONG == 86400


class TestRedisCacheInit:
    """Tests for RedisCache initialization."""

    def test_default_redis_url(self):
        """Test default Redis URL."""
        with patch.dict("os.environ", {}, clear=True):
            cache = RedisCache()
            assert "localhost:6379" in cache.url

    def test_custom_redis_url(self):
        """Test custom Redis URL from environment."""
        with patch.dict("os.environ", {"REDIS_URL": "redis://custom:6380/1"}):
            cache = RedisCache()
            assert cache.url == "redis://custom:6380/1"

    def test_default_max_connections(self):
        """Test default max connections is 50."""
        with patch.dict("os.environ", {}, clear=True):
            cache = RedisCache()
            assert cache.max_connections == 50

    def test_custom_max_connections(self):
        """Test custom max connections from environment."""
        with patch.dict("os.environ", {"REDIS_MAX_CONNECTIONS": "100"}):
            cache = RedisCache()
            assert cache.max_connections == 100

    def test_redis_starts_as_none(self):
        """Test that redis connection starts as None."""
        cache = RedisCache()
        assert cache.redis is None


class TestCacheOperations:
    """Tests for cache get/set/delete operations."""

    @pytest.mark.asyncio
    async def test_get_returns_none_when_not_connected(self):
        """Test get returns None when Redis not connected."""
        cache = RedisCache()
        result = await cache.get("test-key")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_returns_json_parsed_value(self):
        """Test get returns JSON parsed value."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.get = AsyncMock(return_value='{"foo": "bar"}')

        result = await cache.get("test-key")
        assert result == {"foo": "bar"}

    @pytest.mark.asyncio
    async def test_get_returns_raw_value_on_json_error(self):
        """Test get returns raw value if JSON parsing fails."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.get = AsyncMock(return_value="not-json")

        result = await cache.get("test-key")
        assert result == "not-json"

    @pytest.mark.asyncio
    async def test_get_returns_none_for_missing_key(self):
        """Test get returns None for non-existent key."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.get = AsyncMock(return_value=None)

        result = await cache.get("missing-key")
        assert result is None

    @pytest.mark.asyncio
    async def test_set_does_nothing_when_not_connected(self):
        """Test set does nothing when Redis not connected."""
        cache = RedisCache()
        # Should not raise
        await cache.set("key", "value")

    @pytest.mark.asyncio
    async def test_set_with_ttl(self):
        """Test set with TTL uses setex."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.setex = AsyncMock()

        await cache.set("key", {"foo": "bar"}, ttl=600)

        cache.redis.setex.assert_called_once()
        call_args = cache.redis.setex.call_args
        assert call_args[0][0] == "key"
        assert call_args[0][1] == 600
        assert json.loads(call_args[0][2]) == {"foo": "bar"}

    @pytest.mark.asyncio
    async def test_set_without_ttl(self):
        """Test set without TTL uses regular set."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.set = AsyncMock()

        await cache.set("key", "value", ttl=None)

        cache.redis.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_set_string_value_not_serialized(self):
        """Test that string values are not re-serialized."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.setex = AsyncMock()

        await cache.set("key", "string-value", ttl=600)

        call_args = cache.redis.setex.call_args
        assert call_args[0][2] == "string-value"

    @pytest.mark.asyncio
    async def test_delete_when_connected(self):
        """Test delete calls Redis delete."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.delete = AsyncMock()

        await cache.delete("test-key")

        cache.redis.delete.assert_called_once_with("test-key")

    @pytest.mark.asyncio
    async def test_delete_does_nothing_when_not_connected(self):
        """Test delete does nothing when not connected."""
        cache = RedisCache()
        # Should not raise
        await cache.delete("test-key")


class TestCacheIncrement:
    """Tests for cache increment operation (rate limiting)."""

    @pytest.mark.asyncio
    async def test_increment_returns_zero_when_not_connected(self):
        """Test increment returns 0 when Redis not connected."""
        cache = RedisCache()
        result = await cache.increment("counter")
        assert result == 0

    @pytest.mark.asyncio
    async def test_increment_calls_incrby(self):
        """Test increment calls incrby."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.incrby = AsyncMock(return_value=5)

        result = await cache.increment("counter", amount=3)

        assert result == 5
        cache.redis.incrby.assert_called_once_with("counter", 3)

    @pytest.mark.asyncio
    async def test_increment_sets_ttl_on_first_increment(self):
        """Test that TTL is set on first increment (value == amount)."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.incrby = AsyncMock(return_value=1)  # First increment
        cache.redis.expire = AsyncMock()

        await cache.increment("counter", amount=1, ttl=60)

        cache.redis.expire.assert_called_once_with("counter", 60)

    @pytest.mark.asyncio
    async def test_increment_does_not_reset_ttl_on_subsequent_increments(self):
        """Test that TTL is not reset on subsequent increments."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.incrby = AsyncMock(return_value=5)  # Not first increment
        cache.redis.expire = AsyncMock()

        await cache.increment("counter", amount=1, ttl=60)

        cache.redis.expire.assert_not_called()


class TestCacheGetTTL:
    """Tests for cache TTL retrieval."""

    @pytest.mark.asyncio
    async def test_get_ttl_returns_negative_when_not_connected(self):
        """Test get_ttl returns -1 when not connected."""
        cache = RedisCache()
        result = await cache.get_ttl("key")
        assert result == -1

    @pytest.mark.asyncio
    async def test_get_ttl_returns_ttl_value(self):
        """Test get_ttl returns TTL value from Redis."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.ttl = AsyncMock(return_value=300)

        result = await cache.get_ttl("key")

        assert result == 300
        cache.redis.ttl.assert_called_once_with("key")


class TestCacheKey:
    """Tests for cache key generation."""

    def test_cache_key_with_single_arg(self):
        """Test cache key with single argument."""
        cache = RedisCache()
        key = cache.cache_key("prefix", "arg1")
        assert key == "prefix:arg1"

    def test_cache_key_with_multiple_args(self):
        """Test cache key with multiple arguments."""
        cache = RedisCache()
        key = cache.cache_key("prefix", "arg1", "arg2", "arg3")
        assert key == "prefix:arg1:arg2:arg3"

    def test_cache_key_ignores_none_values(self):
        """Test cache key ignores None values."""
        cache = RedisCache()
        key = cache.cache_key("prefix", "arg1", None, "arg3")
        assert key == "prefix:arg1:arg3"

    def test_cache_key_converts_to_string(self):
        """Test cache key converts non-string args to strings."""
        cache = RedisCache()
        key = cache.cache_key("prefix", 123, True)
        assert key == "prefix:123:True"

    def test_cache_key_prefix_only(self):
        """Test cache key with prefix only."""
        cache = RedisCache()
        key = cache.cache_key("prefix")
        assert key == "prefix"


class TestCacheConnection:
    """Tests for cache connect/disconnect."""

    @pytest.mark.asyncio
    async def test_connect_creates_redis_connection(self):
        """Test connect creates Redis connection."""
        cache = RedisCache()

        mock_redis = AsyncMock()
        mock_redis.ping = AsyncMock()

        # redis_async.from_url is an awaitable that returns the redis instance
        with patch("app.cache.redis_async.from_url", new_callable=AsyncMock) as mock_from_url:
            mock_from_url.return_value = mock_redis

            await cache.connect()

            mock_from_url.assert_called_once()
            assert cache.redis == mock_redis
            mock_redis.ping.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect_closes_connection(self):
        """Test disconnect closes Redis connection."""
        cache = RedisCache()
        cache.redis = AsyncMock()
        cache.redis.close = AsyncMock()

        await cache.disconnect()

        cache.redis.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect_does_nothing_when_not_connected(self):
        """Test disconnect does nothing when not connected."""
        cache = RedisCache()
        # Should not raise
        await cache.disconnect()
