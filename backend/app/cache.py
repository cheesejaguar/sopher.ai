"""Redis cache for responses and rate limiting"""

import json
import os
from typing import Any, Optional

import redis.asyncio as redis_async
from redis.asyncio import Redis

# TTL constants (in seconds)
TTL_DEFAULT = 3600  # 1 hour
TTL_SHORT = 300  # 5 minutes
TTL_MEDIUM = 600  # 10 minutes
TTL_LONG = 86400  # 24 hours


class RedisCache:
    """Redis cache wrapper with JSON serialization"""

    def __init__(self):
        self.redis: Optional[Redis] = None
        self.url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        # Configurable connection pool size
        self.max_connections = int(os.getenv("REDIS_MAX_CONNECTIONS", "50"))

    async def connect(self) -> None:
        """Connect to Redis"""
        self.redis = await redis_async.from_url(
            self.url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=self.max_connections,
        )
        # Verify connection with ping
        if self.redis:
            await self.redis.ping()  # type: ignore[misc]

    async def disconnect(self) -> None:
        """Disconnect from Redis"""
        if self.redis:
            await self.redis.close()

    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if not self.redis:
            return None

        value = await self.redis.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = TTL_DEFAULT) -> None:
        """Set value in cache with optional TTL"""
        if not self.redis:
            return

        if not isinstance(value, str):
            value = json.dumps(value)

        if ttl:
            await self.redis.setex(key, ttl, value)
        else:
            await self.redis.set(key, value)

    async def delete(self, key: str) -> None:
        """Delete key from cache"""
        if self.redis:
            await self.redis.delete(key)

    async def increment(self, key: str, amount: int = 1, ttl: Optional[int] = None) -> int:
        """Increment counter, useful for rate limiting"""
        if not self.redis:
            return 0

        value = await self.redis.incrby(key, amount)
        if ttl and value == amount:  # First increment
            await self.redis.expire(key, ttl)
        return int(value)

    async def get_ttl(self, key: str) -> int:
        """Get TTL for a key"""
        if not self.redis:
            return -1
        result = await self.redis.ttl(key)
        return int(result)

    def cache_key(self, prefix: str, *args) -> str:
        """Generate cache key from prefix and arguments"""
        parts = [prefix] + [str(arg) for arg in args if arg is not None]
        return ":".join(parts)


# Global cache instance
cache = RedisCache()
