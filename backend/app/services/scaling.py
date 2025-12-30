"""Horizontal scaling support for stateless service design.

This module provides utilities for horizontal scaling including:
- Stateless session management
- Shared cache coordination
- Health check endpoints
- Instance identification
"""

import asyncio
import hashlib
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

try:
    import psutil

    PSUTIL_AVAILABLE = True
except ImportError:
    psutil = None  # type: ignore
    PSUTIL_AVAILABLE = False


class HealthStatus(Enum):
    """Health status levels."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class ServiceRole(Enum):
    """Service roles in a scaled deployment."""

    API = "api"
    WORKER = "worker"
    SCHEDULER = "scheduler"
    ALL = "all"


@dataclass
class InstanceInfo:
    """Information about a service instance."""

    instance_id: str
    hostname: str
    role: ServiceRole
    started_at: datetime
    version: str = "1.0.0"
    pod_name: Optional[str] = None
    namespace: Optional[str] = None
    node_name: Optional[str] = None

    @classmethod
    def from_environment(cls, role: ServiceRole = ServiceRole.ALL) -> "InstanceInfo":
        """Create instance info from environment variables."""
        return cls(
            instance_id=os.environ.get("INSTANCE_ID", str(uuid4())[:8]),
            hostname=os.environ.get("HOSTNAME", "localhost"),
            role=role,
            started_at=datetime.utcnow(),
            version=os.environ.get("APP_VERSION", "1.0.0"),
            pod_name=os.environ.get("POD_NAME"),
            namespace=os.environ.get("POD_NAMESPACE"),
            node_name=os.environ.get("NODE_NAME"),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "instance_id": self.instance_id,
            "hostname": self.hostname,
            "role": self.role.value,
            "started_at": self.started_at.isoformat(),
            "version": self.version,
            "pod_name": self.pod_name,
            "namespace": self.namespace,
            "node_name": self.node_name,
            "uptime_seconds": (datetime.utcnow() - self.started_at).total_seconds(),
        }


@dataclass
class HealthCheck:
    """Health check result."""

    name: str
    status: HealthStatus
    message: str = ""
    latency_ms: float = 0.0
    last_check: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "status": self.status.value,
            "message": self.message,
            "latency_ms": self.latency_ms,
            "last_check": self.last_check.isoformat(),
        }


@dataclass
class HealthReport:
    """Aggregated health report."""

    status: HealthStatus
    checks: list[HealthCheck]
    instance: InstanceInfo
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "status": self.status.value,
            "checks": [c.to_dict() for c in self.checks],
            "instance": self.instance.to_dict(),
            "timestamp": self.timestamp.isoformat(),
        }


class HealthChecker:
    """Manages health checks for the service."""

    def __init__(self, instance: InstanceInfo) -> None:
        self.instance = instance
        self._checks: dict[str, Any] = {}
        self._results: dict[str, HealthCheck] = {}

    def register_check(self, name: str, check_func: Any) -> None:
        """Register a health check function."""
        self._checks[name] = check_func

    async def run_check(self, name: str) -> HealthCheck:
        """Run a single health check."""
        if name not in self._checks:
            return HealthCheck(
                name=name,
                status=HealthStatus.UNHEALTHY,
                message=f"Unknown check: {name}",
            )

        check_func = self._checks[name]
        start_time = time.time()

        try:
            result = await check_func()
            latency_ms = (time.time() - start_time) * 1000

            if isinstance(result, bool):
                status = HealthStatus.HEALTHY if result else HealthStatus.UNHEALTHY
                message = ""
            elif isinstance(result, tuple):
                status = result[0]
                message = result[1] if len(result) > 1 else ""
            else:
                status = HealthStatus.HEALTHY
                message = str(result)

            check = HealthCheck(
                name=name,
                status=status,
                message=message,
                latency_ms=latency_ms,
            )

        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            check = HealthCheck(
                name=name,
                status=HealthStatus.UNHEALTHY,
                message=str(e),
                latency_ms=latency_ms,
            )

        self._results[name] = check
        return check

    async def run_all_checks(self) -> HealthReport:
        """Run all registered health checks."""
        results = await asyncio.gather(
            *[self.run_check(name) for name in self._checks.keys()],
            return_exceptions=True,
        )

        checks = []
        for i, name in enumerate(self._checks.keys()):
            if isinstance(results[i], Exception):
                checks.append(
                    HealthCheck(
                        name=name,
                        status=HealthStatus.UNHEALTHY,
                        message=str(results[i]),
                    )
                )
            else:
                checks.append(results[i])

        # Determine overall status
        if any(c.status == HealthStatus.UNHEALTHY for c in checks):
            overall_status = HealthStatus.UNHEALTHY
        elif any(c.status == HealthStatus.DEGRADED for c in checks):
            overall_status = HealthStatus.DEGRADED
        else:
            overall_status = HealthStatus.HEALTHY

        return HealthReport(
            status=overall_status,
            checks=checks,
            instance=self.instance,
        )

    def get_cached_result(self, name: str) -> Optional[HealthCheck]:
        """Get cached health check result."""
        return self._results.get(name)


class SessionStore:
    """Abstract session store for shared session management."""

    async def get(self, session_id: str) -> Optional[dict[str, Any]]:
        """Get session data."""
        raise NotImplementedError

    async def set(self, session_id: str, data: dict[str, Any], ttl_seconds: int = 3600) -> bool:
        """Set session data with TTL."""
        raise NotImplementedError

    async def delete(self, session_id: str) -> bool:
        """Delete session."""
        raise NotImplementedError

    async def exists(self, session_id: str) -> bool:
        """Check if session exists."""
        raise NotImplementedError

    async def extend(self, session_id: str, ttl_seconds: int = 3600) -> bool:
        """Extend session TTL."""
        raise NotImplementedError


class InMemorySessionStore(SessionStore):
    """In-memory session store for development/testing."""

    def __init__(self) -> None:
        self._sessions: dict[str, tuple[dict[str, Any], datetime]] = {}
        self._lock = asyncio.Lock()

    async def get(self, session_id: str) -> Optional[dict[str, Any]]:
        """Get session data."""
        async with self._lock:
            if session_id not in self._sessions:
                return None

            data, expires_at = self._sessions[session_id]
            if datetime.utcnow() > expires_at:
                del self._sessions[session_id]
                return None

            return data

    async def set(self, session_id: str, data: dict[str, Any], ttl_seconds: int = 3600) -> bool:
        """Set session data with TTL."""
        async with self._lock:
            expires_at = datetime.utcnow() + timedelta(seconds=ttl_seconds)
            self._sessions[session_id] = (data, expires_at)
            return True

    async def delete(self, session_id: str) -> bool:
        """Delete session."""
        async with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                return True
            return False

    async def exists(self, session_id: str) -> bool:
        """Check if session exists."""
        data = await self.get(session_id)
        return data is not None

    async def extend(self, session_id: str, ttl_seconds: int = 3600) -> bool:
        """Extend session TTL."""
        async with self._lock:
            if session_id not in self._sessions:
                return False

            data, _ = self._sessions[session_id]
            expires_at = datetime.utcnow() + timedelta(seconds=ttl_seconds)
            self._sessions[session_id] = (data, expires_at)
            return True

    async def cleanup(self) -> int:
        """Clean up expired sessions."""
        async with self._lock:
            now = datetime.utcnow()
            expired = [sid for sid, (_, expires_at) in self._sessions.items() if now > expires_at]
            for sid in expired:
                del self._sessions[sid]
            return len(expired)


class RedisSessionStore(SessionStore):
    """Redis-backed session store for production use."""

    def __init__(self, redis_client: Any, prefix: str = "session:") -> None:
        self._redis = redis_client
        self._prefix = prefix

    def _key(self, session_id: str) -> str:
        """Generate Redis key for session."""
        return f"{self._prefix}{session_id}"

    async def get(self, session_id: str) -> Optional[dict[str, Any]]:
        """Get session data."""
        import json

        key = self._key(session_id)
        data = await self._redis.get(key)
        if data is None:
            return None
        return json.loads(data)

    async def set(self, session_id: str, data: dict[str, Any], ttl_seconds: int = 3600) -> bool:
        """Set session data with TTL."""
        import json

        key = self._key(session_id)
        await self._redis.setex(key, ttl_seconds, json.dumps(data))
        return True

    async def delete(self, session_id: str) -> bool:
        """Delete session."""
        key = self._key(session_id)
        result = await self._redis.delete(key)
        return result > 0

    async def exists(self, session_id: str) -> bool:
        """Check if session exists."""
        key = self._key(session_id)
        return await self._redis.exists(key) > 0

    async def extend(self, session_id: str, ttl_seconds: int = 3600) -> bool:
        """Extend session TTL."""
        key = self._key(session_id)
        return await self._redis.expire(key, ttl_seconds)


@dataclass
class DistributedLock:
    """Information about a distributed lock."""

    resource: str
    owner: str
    acquired_at: datetime
    expires_at: datetime
    token: str = field(default_factory=lambda: str(uuid4()))

    def is_expired(self) -> bool:
        """Check if lock is expired."""
        return datetime.utcnow() > self.expires_at


class LockManager:
    """Manages distributed locks for resource coordination."""

    def __init__(self, instance_id: str) -> None:
        self.instance_id = instance_id
        self._locks: dict[str, DistributedLock] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, resource: str, ttl_seconds: int = 30) -> Optional[DistributedLock]:
        """Attempt to acquire a lock on a resource."""
        async with self._lock:
            # Clean up expired locks
            now = datetime.utcnow()
            expired = [r for r, lock in self._locks.items() if lock.is_expired()]
            for r in expired:
                del self._locks[r]

            # Check if already locked
            if resource in self._locks:
                return None

            # Acquire lock
            lock = DistributedLock(
                resource=resource,
                owner=self.instance_id,
                acquired_at=now,
                expires_at=now + timedelta(seconds=ttl_seconds),
            )
            self._locks[resource] = lock
            return lock

    async def release(self, resource: str, token: str) -> bool:
        """Release a lock using its token."""
        async with self._lock:
            if resource not in self._locks:
                return False

            lock = self._locks[resource]
            if lock.token != token:
                return False

            del self._locks[resource]
            return True

    async def extend(self, resource: str, token: str, ttl_seconds: int = 30) -> bool:
        """Extend a lock's TTL."""
        async with self._lock:
            if resource not in self._locks:
                return False

            lock = self._locks[resource]
            if lock.token != token:
                return False

            lock.expires_at = datetime.utcnow() + timedelta(seconds=ttl_seconds)
            return True

    async def is_locked(self, resource: str) -> bool:
        """Check if a resource is locked."""
        async with self._lock:
            if resource not in self._locks:
                return False

            lock = self._locks[resource]
            if lock.is_expired():
                del self._locks[resource]
                return False

            return True

    async def get_lock_info(self, resource: str) -> Optional[DistributedLock]:
        """Get information about a lock."""
        async with self._lock:
            return self._locks.get(resource)


class ConsistentHash:
    """Consistent hashing for request routing."""

    def __init__(self, nodes: list[str], replicas: int = 100) -> None:
        self.replicas = replicas
        self._ring: dict[int, str] = {}
        self._sorted_keys: list[int] = []

        for node in nodes:
            self.add_node(node)

    def _hash(self, key: str) -> int:
        """Hash a key to an integer."""
        return int(hashlib.md5(key.encode()).hexdigest(), 16)

    def add_node(self, node: str) -> None:
        """Add a node to the ring."""
        for i in range(self.replicas):
            key = self._hash(f"{node}:{i}")
            self._ring[key] = node

        self._sorted_keys = sorted(self._ring.keys())

    def remove_node(self, node: str) -> None:
        """Remove a node from the ring."""
        for i in range(self.replicas):
            key = self._hash(f"{node}:{i}")
            if key in self._ring:
                del self._ring[key]

        self._sorted_keys = sorted(self._ring.keys())

    def get_node(self, key: str) -> Optional[str]:
        """Get the node responsible for a key."""
        if not self._ring:
            return None

        hash_key = self._hash(key)

        # Find the first node with hash >= key hash
        for ring_key in self._sorted_keys:
            if ring_key >= hash_key:
                return self._ring[ring_key]

        # Wrap around to first node
        return self._ring[self._sorted_keys[0]]

    def get_nodes(self, key: str, count: int = 1) -> list[str]:
        """Get multiple nodes for replication."""
        if not self._ring:
            return []

        hash_key = self._hash(key)
        nodes = []
        seen = set()

        # Find starting position
        start_idx = 0
        for i, ring_key in enumerate(self._sorted_keys):
            if ring_key >= hash_key:
                start_idx = i
                break

        # Collect unique nodes
        for i in range(len(self._sorted_keys)):
            idx = (start_idx + i) % len(self._sorted_keys)
            node = self._ring[self._sorted_keys[idx]]
            if node not in seen:
                nodes.append(node)
                seen.add(node)
            if len(nodes) >= count:
                break

        return nodes


@dataclass
class LoadBalancerConfig:
    """Configuration for load balancer health checks."""

    health_path: str = "/healthz"
    ready_path: str = "/readyz"
    live_path: str = "/livez"
    check_interval_seconds: int = 10
    timeout_seconds: int = 5
    success_threshold: int = 1
    failure_threshold: int = 3

    def to_k8s_probe(self, probe_type: str) -> dict[str, Any]:
        """Convert to Kubernetes probe configuration."""
        path = {
            "liveness": self.live_path,
            "readiness": self.ready_path,
        }.get(probe_type, self.health_path)

        return {
            "httpGet": {
                "path": path,
                "port": 8000,
            },
            "initialDelaySeconds": 10,
            "periodSeconds": self.check_interval_seconds,
            "timeoutSeconds": self.timeout_seconds,
            "successThreshold": self.success_threshold,
            "failureThreshold": self.failure_threshold,
        }


class ScalingService:
    """Main service for horizontal scaling support."""

    def __init__(
        self,
        instance: Optional[InstanceInfo] = None,
        session_store: Optional[SessionStore] = None,
    ) -> None:
        self.instance = instance or InstanceInfo.from_environment()
        self.session_store = session_store or InMemorySessionStore()
        self.health_checker = HealthChecker(self.instance)
        self.lock_manager = LockManager(self.instance.instance_id)
        self.lb_config = LoadBalancerConfig()

        # Register default health checks
        self._register_default_checks()

    def _register_default_checks(self) -> None:
        """Register default health checks."""
        if not PSUTIL_AVAILABLE:
            return

        async def memory_check() -> tuple[HealthStatus, str]:
            """Check memory usage."""
            memory = psutil.virtual_memory()
            if memory.percent > 90:
                return HealthStatus.UNHEALTHY, f"Memory usage: {memory.percent}%"
            elif memory.percent > 80:
                return HealthStatus.DEGRADED, f"Memory usage: {memory.percent}%"
            return HealthStatus.HEALTHY, f"Memory usage: {memory.percent}%"

        async def disk_check() -> tuple[HealthStatus, str]:
            """Check disk usage."""
            disk = psutil.disk_usage("/")
            if disk.percent > 90:
                return HealthStatus.UNHEALTHY, f"Disk usage: {disk.percent}%"
            elif disk.percent > 80:
                return HealthStatus.DEGRADED, f"Disk usage: {disk.percent}%"
            return HealthStatus.HEALTHY, f"Disk usage: {disk.percent}%"

        self.health_checker.register_check("memory", memory_check)
        self.health_checker.register_check("disk", disk_check)

    def register_database_check(self, db_func: Any) -> None:
        """Register a database health check."""
        self.health_checker.register_check("database", db_func)

    def register_redis_check(self, redis_func: Any) -> None:
        """Register a Redis health check."""
        self.health_checker.register_check("redis", redis_func)

    def register_custom_check(self, name: str, check_func: Any) -> None:
        """Register a custom health check."""
        self.health_checker.register_check(name, check_func)

    async def get_health(self) -> HealthReport:
        """Get full health report."""
        return await self.health_checker.run_all_checks()

    async def is_ready(self) -> bool:
        """Check if service is ready to accept traffic."""
        report = await self.health_checker.run_all_checks()
        return report.status != HealthStatus.UNHEALTHY

    async def is_live(self) -> bool:
        """Check if service is alive."""
        # Basic liveness check - just verify the service can respond
        return True

    def get_instance_info(self) -> dict[str, Any]:
        """Get information about this instance."""
        return self.instance.to_dict()

    def get_lb_config(self) -> LoadBalancerConfig:
        """Get load balancer configuration."""
        return self.lb_config
