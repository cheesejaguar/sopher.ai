"""Tests for horizontal scaling support."""

import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.services.scaling import (
    ConsistentHash,
    DistributedLock,
    HealthCheck,
    HealthChecker,
    HealthReport,
    HealthStatus,
    InMemorySessionStore,
    InstanceInfo,
    LoadBalancerConfig,
    LockManager,
    RedisSessionStore,
    ScalingService,
    ServiceRole,
)

# =============================================================================
# Enum Tests
# =============================================================================


class TestHealthStatus:
    """Tests for HealthStatus enum."""

    def test_all_statuses_exist(self):
        """All health statuses should be defined."""
        assert HealthStatus.HEALTHY.value == "healthy"
        assert HealthStatus.DEGRADED.value == "degraded"
        assert HealthStatus.UNHEALTHY.value == "unhealthy"

    def test_status_count(self):
        """Should have exactly 3 statuses."""
        assert len(HealthStatus) == 3


class TestServiceRole:
    """Tests for ServiceRole enum."""

    def test_all_roles_exist(self):
        """All service roles should be defined."""
        assert ServiceRole.API.value == "api"
        assert ServiceRole.WORKER.value == "worker"
        assert ServiceRole.SCHEDULER.value == "scheduler"
        assert ServiceRole.ALL.value == "all"

    def test_role_count(self):
        """Should have exactly 4 roles."""
        assert len(ServiceRole) == 4


# =============================================================================
# InstanceInfo Tests
# =============================================================================


class TestInstanceInfo:
    """Tests for InstanceInfo dataclass."""

    def test_creation(self):
        """Should create instance info."""
        info = InstanceInfo(
            instance_id="test-123",
            hostname="test-host",
            role=ServiceRole.API,
            started_at=datetime.utcnow(),
        )
        assert info.instance_id == "test-123"
        assert info.hostname == "test-host"
        assert info.role == ServiceRole.API

    def test_from_environment(self):
        """Should create from environment."""
        with patch.dict(
            "os.environ",
            {
                "INSTANCE_ID": "env-123",
                "HOSTNAME": "env-host",
                "APP_VERSION": "2.0.0",
            },
        ):
            info = InstanceInfo.from_environment(ServiceRole.WORKER)
            assert info.instance_id == "env-123"
            assert info.hostname == "env-host"
            assert info.role == ServiceRole.WORKER
            assert info.version == "2.0.0"

    def test_from_environment_defaults(self):
        """Should use defaults when env vars not set."""
        with patch.dict("os.environ", {}, clear=True):
            info = InstanceInfo.from_environment()
            assert info.hostname == "localhost"
            assert info.version == "1.0.0"
            assert len(info.instance_id) == 8

    def test_to_dict(self):
        """Should convert to dictionary."""
        info = InstanceInfo(
            instance_id="test-123",
            hostname="test-host",
            role=ServiceRole.API,
            started_at=datetime(2024, 1, 1, 12, 0, 0),
            version="1.0.0",
            pod_name="pod-1",
        )
        data = info.to_dict()
        assert data["instance_id"] == "test-123"
        assert data["hostname"] == "test-host"
        assert data["role"] == "api"
        assert "uptime_seconds" in data
        assert data["pod_name"] == "pod-1"


# =============================================================================
# HealthCheck Tests
# =============================================================================


class TestHealthCheck:
    """Tests for HealthCheck dataclass."""

    def test_creation(self):
        """Should create health check."""
        check = HealthCheck(
            name="test",
            status=HealthStatus.HEALTHY,
            message="All good",
            latency_ms=10.5,
        )
        assert check.name == "test"
        assert check.status == HealthStatus.HEALTHY
        assert check.message == "All good"
        assert check.latency_ms == 10.5

    def test_to_dict(self):
        """Should convert to dictionary."""
        check = HealthCheck(
            name="test",
            status=HealthStatus.DEGRADED,
            message="Warning",
            latency_ms=50.0,
        )
        data = check.to_dict()
        assert data["name"] == "test"
        assert data["status"] == "degraded"
        assert data["message"] == "Warning"
        assert data["latency_ms"] == 50.0
        assert "last_check" in data


# =============================================================================
# HealthReport Tests
# =============================================================================


class TestHealthReport:
    """Tests for HealthReport dataclass."""

    def test_creation(self):
        """Should create health report."""
        instance = InstanceInfo(
            instance_id="test",
            hostname="host",
            role=ServiceRole.API,
            started_at=datetime.utcnow(),
        )
        checks = [
            HealthCheck(name="check1", status=HealthStatus.HEALTHY),
            HealthCheck(name="check2", status=HealthStatus.HEALTHY),
        ]
        report = HealthReport(
            status=HealthStatus.HEALTHY,
            checks=checks,
            instance=instance,
        )
        assert report.status == HealthStatus.HEALTHY
        assert len(report.checks) == 2

    def test_to_dict(self):
        """Should convert to dictionary."""
        instance = InstanceInfo(
            instance_id="test",
            hostname="host",
            role=ServiceRole.API,
            started_at=datetime.utcnow(),
        )
        report = HealthReport(
            status=HealthStatus.HEALTHY,
            checks=[],
            instance=instance,
        )
        data = report.to_dict()
        assert data["status"] == "healthy"
        assert "checks" in data
        assert "instance" in data
        assert "timestamp" in data


# =============================================================================
# HealthChecker Tests
# =============================================================================


class TestHealthChecker:
    """Tests for HealthChecker class."""

    @pytest.fixture
    def instance(self):
        """Create instance info."""
        return InstanceInfo(
            instance_id="test",
            hostname="host",
            role=ServiceRole.API,
            started_at=datetime.utcnow(),
        )

    @pytest.fixture
    def checker(self, instance):
        """Create health checker."""
        return HealthChecker(instance)

    def test_register_check(self, checker):
        """Should register check."""

        async def check():
            return True

        checker.register_check("test", check)
        assert "test" in checker._checks

    @pytest.mark.asyncio
    async def test_run_check_success(self, checker):
        """Should run check successfully."""

        async def check():
            return True

        checker.register_check("test", check)
        result = await checker.run_check("test")
        assert result.name == "test"
        assert result.status == HealthStatus.HEALTHY

    @pytest.mark.asyncio
    async def test_run_check_failure(self, checker):
        """Should handle check failure."""

        async def check():
            return False

        checker.register_check("test", check)
        result = await checker.run_check("test")
        assert result.status == HealthStatus.UNHEALTHY

    @pytest.mark.asyncio
    async def test_run_check_with_tuple(self, checker):
        """Should handle tuple return value."""

        async def check():
            return (HealthStatus.DEGRADED, "Warning message")

        checker.register_check("test", check)
        result = await checker.run_check("test")
        assert result.status == HealthStatus.DEGRADED
        assert result.message == "Warning message"

    @pytest.mark.asyncio
    async def test_run_check_exception(self, checker):
        """Should handle check exception."""

        async def check():
            raise ValueError("Check failed")

        checker.register_check("test", check)
        result = await checker.run_check("test")
        assert result.status == HealthStatus.UNHEALTHY
        assert "Check failed" in result.message

    @pytest.mark.asyncio
    async def test_run_check_unknown(self, checker):
        """Should handle unknown check."""
        result = await checker.run_check("unknown")
        assert result.status == HealthStatus.UNHEALTHY
        assert "Unknown check" in result.message

    @pytest.mark.asyncio
    async def test_run_check_with_string_result(self, checker):
        """Should handle string return value (else branch)."""

        async def check():
            return "Custom status message"

        checker.register_check("test", check)
        result = await checker.run_check("test")
        assert result.status == HealthStatus.HEALTHY
        assert result.message == "Custom status message"

    @pytest.mark.asyncio
    async def test_run_check_with_custom_object(self, checker):
        """Should handle custom object return value (else branch)."""

        class CustomResult:
            def __str__(self):
                return "Custom object result"

        async def check():
            return CustomResult()

        checker.register_check("test", check)
        result = await checker.run_check("test")
        assert result.status == HealthStatus.HEALTHY
        assert result.message == "Custom object result"

    @pytest.mark.asyncio
    async def test_run_all_checks(self, checker):
        """Should run all checks."""

        async def check1():
            return True

        async def check2():
            return True

        checker.register_check("check1", check1)
        checker.register_check("check2", check2)

        report = await checker.run_all_checks()
        assert report.status == HealthStatus.HEALTHY
        assert len(report.checks) == 2

    @pytest.mark.asyncio
    async def test_run_all_checks_degraded(self, checker):
        """Should report degraded status."""

        async def healthy():
            return True

        async def degraded():
            return (HealthStatus.DEGRADED, "Slow")

        checker.register_check("healthy", healthy)
        checker.register_check("degraded", degraded)

        report = await checker.run_all_checks()
        assert report.status == HealthStatus.DEGRADED

    @pytest.mark.asyncio
    async def test_run_all_checks_unhealthy(self, checker):
        """Should report unhealthy status."""

        async def healthy():
            return True

        async def unhealthy():
            return False

        checker.register_check("healthy", healthy)
        checker.register_check("unhealthy", unhealthy)

        report = await checker.run_all_checks()
        assert report.status == HealthStatus.UNHEALTHY

    def test_get_cached_result(self, checker):
        """Should get cached result."""
        assert checker.get_cached_result("test") is None


# =============================================================================
# InMemorySessionStore Tests
# =============================================================================


class TestInMemorySessionStore:
    """Tests for InMemorySessionStore class."""

    @pytest.fixture
    def store(self):
        """Create session store."""
        return InMemorySessionStore()

    @pytest.mark.asyncio
    async def test_set_and_get(self, store):
        """Should set and get session."""
        await store.set("session1", {"user": "test"})
        data = await store.get("session1")
        assert data == {"user": "test"}

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, store):
        """Should return None for nonexistent session."""
        data = await store.get("nonexistent")
        assert data is None

    @pytest.mark.asyncio
    async def test_get_expired(self, store):
        """Should return None for expired session."""
        await store.set("session1", {"user": "test"}, ttl_seconds=0)
        await asyncio.sleep(0.1)
        data = await store.get("session1")
        assert data is None

    @pytest.mark.asyncio
    async def test_delete(self, store):
        """Should delete session."""
        await store.set("session1", {"user": "test"})
        result = await store.delete("session1")
        assert result is True
        data = await store.get("session1")
        assert data is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, store):
        """Should return False for nonexistent session."""
        result = await store.delete("nonexistent")
        assert result is False

    @pytest.mark.asyncio
    async def test_exists(self, store):
        """Should check if session exists."""
        await store.set("session1", {"user": "test"})
        assert await store.exists("session1") is True
        assert await store.exists("nonexistent") is False

    @pytest.mark.asyncio
    async def test_extend(self, store):
        """Should extend session TTL."""
        await store.set("session1", {"user": "test"}, ttl_seconds=1)
        result = await store.extend("session1", ttl_seconds=3600)
        assert result is True

    @pytest.mark.asyncio
    async def test_extend_nonexistent(self, store):
        """Should return False for nonexistent session."""
        result = await store.extend("nonexistent")
        assert result is False

    @pytest.mark.asyncio
    async def test_cleanup(self, store):
        """Should cleanup expired sessions."""
        await store.set("session1", {"user": "test"}, ttl_seconds=0)
        await store.set("session2", {"user": "test2"}, ttl_seconds=3600)
        await asyncio.sleep(0.1)
        removed = await store.cleanup()
        assert removed == 1
        assert await store.exists("session1") is False
        assert await store.exists("session2") is True


# =============================================================================
# RedisSessionStore Tests
# =============================================================================


class TestRedisSessionStore:
    """Tests for RedisSessionStore class."""

    @pytest.fixture
    def mock_redis(self):
        """Create mock Redis client."""
        redis = AsyncMock()
        redis.get = AsyncMock(return_value=None)
        redis.setex = AsyncMock()
        redis.delete = AsyncMock(return_value=1)
        redis.exists = AsyncMock(return_value=1)
        redis.expire = AsyncMock(return_value=True)
        return redis

    @pytest.fixture
    def store(self, mock_redis):
        """Create Redis session store."""
        return RedisSessionStore(mock_redis)

    @pytest.mark.asyncio
    async def test_get(self, store, mock_redis):
        """Should get session from Redis."""
        mock_redis.get.return_value = '{"user": "test"}'
        data = await store.get("session1")
        assert data == {"user": "test"}
        mock_redis.get.assert_called_with("session:session1")

    @pytest.mark.asyncio
    async def test_get_none(self, store, mock_redis):
        """Should return None when not found."""
        mock_redis.get.return_value = None
        data = await store.get("session1")
        assert data is None

    @pytest.mark.asyncio
    async def test_set(self, store, mock_redis):
        """Should set session in Redis."""
        await store.set("session1", {"user": "test"}, ttl_seconds=3600)
        mock_redis.setex.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete(self, store, mock_redis):
        """Should delete session from Redis."""
        result = await store.delete("session1")
        assert result is True
        mock_redis.delete.assert_called_with("session:session1")

    @pytest.mark.asyncio
    async def test_exists(self, store, mock_redis):
        """Should check if session exists in Redis."""
        result = await store.exists("session1")
        assert result is True
        mock_redis.exists.assert_called_with("session:session1")

    @pytest.mark.asyncio
    async def test_extend(self, store, mock_redis):
        """Should extend session TTL in Redis."""
        result = await store.extend("session1", ttl_seconds=3600)
        assert result is True
        mock_redis.expire.assert_called_with("session:session1", 3600)


# =============================================================================
# DistributedLock Tests
# =============================================================================


class TestDistributedLock:
    """Tests for DistributedLock dataclass."""

    def test_creation(self):
        """Should create distributed lock."""
        lock = DistributedLock(
            resource="resource1",
            owner="owner1",
            acquired_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(seconds=30),
        )
        assert lock.resource == "resource1"
        assert lock.owner == "owner1"
        assert lock.token is not None

    def test_is_expired_false(self):
        """Should return False when not expired."""
        lock = DistributedLock(
            resource="resource1",
            owner="owner1",
            acquired_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(seconds=30),
        )
        assert lock.is_expired() is False

    def test_is_expired_true(self):
        """Should return True when expired."""
        lock = DistributedLock(
            resource="resource1",
            owner="owner1",
            acquired_at=datetime.utcnow() - timedelta(seconds=60),
            expires_at=datetime.utcnow() - timedelta(seconds=30),
        )
        assert lock.is_expired() is True


# =============================================================================
# LockManager Tests
# =============================================================================


class TestLockManager:
    """Tests for LockManager class."""

    @pytest.fixture
    def manager(self):
        """Create lock manager."""
        return LockManager("instance-1")

    @pytest.mark.asyncio
    async def test_acquire(self, manager):
        """Should acquire lock."""
        lock = await manager.acquire("resource1")
        assert lock is not None
        assert lock.resource == "resource1"
        assert lock.owner == "instance-1"

    @pytest.mark.asyncio
    async def test_acquire_already_locked(self, manager):
        """Should fail to acquire already locked resource."""
        await manager.acquire("resource1")
        lock2 = await manager.acquire("resource1")
        assert lock2 is None

    @pytest.mark.asyncio
    async def test_release(self, manager):
        """Should release lock."""
        lock = await manager.acquire("resource1")
        result = await manager.release("resource1", lock.token)
        assert result is True

    @pytest.mark.asyncio
    async def test_release_wrong_token(self, manager):
        """Should fail to release with wrong token."""
        await manager.acquire("resource1")
        result = await manager.release("resource1", "wrong-token")
        assert result is False

    @pytest.mark.asyncio
    async def test_release_nonexistent(self, manager):
        """Should fail to release nonexistent lock."""
        result = await manager.release("resource1", "token")
        assert result is False

    @pytest.mark.asyncio
    async def test_extend(self, manager):
        """Should extend lock TTL."""
        lock = await manager.acquire("resource1", ttl_seconds=10)
        result = await manager.extend("resource1", lock.token, ttl_seconds=30)
        assert result is True

    @pytest.mark.asyncio
    async def test_extend_wrong_token(self, manager):
        """Should fail to extend with wrong token."""
        await manager.acquire("resource1")
        result = await manager.extend("resource1", "wrong-token")
        assert result is False

    @pytest.mark.asyncio
    async def test_is_locked(self, manager):
        """Should check if resource is locked."""
        assert await manager.is_locked("resource1") is False
        await manager.acquire("resource1")
        assert await manager.is_locked("resource1") is True

    @pytest.mark.asyncio
    async def test_is_locked_expired(self, manager):
        """Should return False for expired lock."""
        await manager.acquire("resource1", ttl_seconds=0)
        await asyncio.sleep(0.1)
        assert await manager.is_locked("resource1") is False

    @pytest.mark.asyncio
    async def test_get_lock_info(self, manager):
        """Should get lock info."""
        await manager.acquire("resource1")
        info = await manager.get_lock_info("resource1")
        assert info is not None
        assert info.resource == "resource1"

    @pytest.mark.asyncio
    async def test_get_lock_info_nonexistent(self, manager):
        """Should return None for nonexistent lock."""
        info = await manager.get_lock_info("resource1")
        assert info is None


# =============================================================================
# ConsistentHash Tests
# =============================================================================


class TestConsistentHash:
    """Tests for ConsistentHash class."""

    def test_creation(self):
        """Should create consistent hash."""
        ch = ConsistentHash(["node1", "node2", "node3"])
        assert len(ch._ring) > 0

    def test_get_node(self):
        """Should get node for key."""
        ch = ConsistentHash(["node1", "node2", "node3"])
        node = ch.get_node("key1")
        assert node in ["node1", "node2", "node3"]

    def test_get_node_consistent(self):
        """Should return same node for same key."""
        ch = ConsistentHash(["node1", "node2", "node3"])
        node1 = ch.get_node("key1")
        node2 = ch.get_node("key1")
        assert node1 == node2

    def test_get_node_empty(self):
        """Should return None for empty ring."""
        ch = ConsistentHash([])
        node = ch.get_node("key1")
        assert node is None

    def test_add_node(self):
        """Should add node to ring."""
        ch = ConsistentHash(["node1"])
        initial_size = len(ch._ring)
        ch.add_node("node2")
        assert len(ch._ring) > initial_size

    def test_remove_node(self):
        """Should remove node from ring."""
        ch = ConsistentHash(["node1", "node2"])
        initial_size = len(ch._ring)
        ch.remove_node("node1")
        assert len(ch._ring) < initial_size

    def test_get_nodes(self):
        """Should get multiple nodes for key."""
        ch = ConsistentHash(["node1", "node2", "node3"])
        nodes = ch.get_nodes("key1", count=2)
        assert len(nodes) == 2
        assert len(set(nodes)) == 2  # All unique

    def test_get_nodes_more_than_available(self):
        """Should return all nodes when count exceeds available."""
        ch = ConsistentHash(["node1", "node2"])
        nodes = ch.get_nodes("key1", count=5)
        assert len(nodes) == 2


# =============================================================================
# LoadBalancerConfig Tests
# =============================================================================


class TestLoadBalancerConfig:
    """Tests for LoadBalancerConfig dataclass."""

    def test_defaults(self):
        """Should have correct defaults."""
        config = LoadBalancerConfig()
        assert config.health_path == "/healthz"
        assert config.ready_path == "/readyz"
        assert config.live_path == "/livez"
        assert config.check_interval_seconds == 10

    def test_to_k8s_probe_liveness(self):
        """Should generate liveness probe config."""
        config = LoadBalancerConfig()
        probe = config.to_k8s_probe("liveness")
        assert probe["httpGet"]["path"] == "/livez"
        assert "periodSeconds" in probe

    def test_to_k8s_probe_readiness(self):
        """Should generate readiness probe config."""
        config = LoadBalancerConfig()
        probe = config.to_k8s_probe("readiness")
        assert probe["httpGet"]["path"] == "/readyz"


# =============================================================================
# ScalingService Tests
# =============================================================================


class TestScalingService:
    """Tests for ScalingService class."""

    @pytest.fixture
    def service(self):
        """Create scaling service."""
        return ScalingService()

    def test_creation(self, service):
        """Should create scaling service."""
        assert service.instance is not None
        assert service.session_store is not None
        assert service.health_checker is not None
        assert service.lock_manager is not None

    def test_creation_with_custom_components(self):
        """Should create with custom components."""
        instance = InstanceInfo(
            instance_id="custom",
            hostname="custom-host",
            role=ServiceRole.WORKER,
            started_at=datetime.utcnow(),
        )
        store = InMemorySessionStore()
        service = ScalingService(instance=instance, session_store=store)
        assert service.instance.instance_id == "custom"

    @pytest.mark.asyncio
    async def test_get_health(self, service):
        """Should get health report."""

        # Add a simple check that always passes
        async def simple_check():
            return True

        service.register_custom_check("simple", simple_check)
        report = await service.get_health()
        # Should have at least the simple check
        assert len(report.checks) >= 1

    @pytest.mark.asyncio
    async def test_is_ready(self, service):
        """Should check readiness."""

        async def always_healthy():
            return True

        service.register_custom_check("test", always_healthy)
        result = await service.is_ready()
        assert result is True

    @pytest.mark.asyncio
    async def test_is_live(self, service):
        """Should check liveness."""
        result = await service.is_live()
        assert result is True

    def test_get_instance_info(self, service):
        """Should get instance info."""
        info = service.get_instance_info()
        assert "instance_id" in info
        assert "hostname" in info

    def test_get_lb_config(self, service):
        """Should get load balancer config."""
        config = service.get_lb_config()
        assert config.health_path == "/healthz"

    def test_register_database_check(self, service):
        """Should register database check."""

        async def db_check():
            return True

        service.register_database_check(db_check)
        assert "database" in service.health_checker._checks

    def test_register_redis_check(self, service):
        """Should register Redis check."""

        async def redis_check():
            return True

        service.register_redis_check(redis_check)
        assert "redis" in service.health_checker._checks

    def test_register_custom_check(self, service):
        """Should register custom check."""

        async def custom_check():
            return True

        service.register_custom_check("custom", custom_check)
        assert "custom" in service.health_checker._checks


# =============================================================================
# Integration Tests
# =============================================================================


class TestScalingIntegration:
    """Integration tests for scaling system."""

    @pytest.mark.asyncio
    async def test_full_session_workflow(self):
        """Should handle complete session workflow."""
        service = ScalingService()

        # Create session
        await service.session_store.set(
            "session1",
            {"user_id": "user1", "data": "test"},
            ttl_seconds=3600,
        )

        # Verify session
        data = await service.session_store.get("session1")
        assert data["user_id"] == "user1"

        # Extend session
        result = await service.session_store.extend("session1", ttl_seconds=7200)
        assert result is True

        # Delete session
        result = await service.session_store.delete("session1")
        assert result is True

        # Verify deleted
        data = await service.session_store.get("session1")
        assert data is None

    @pytest.mark.asyncio
    async def test_lock_workflow(self):
        """Should handle complete lock workflow."""
        service = ScalingService()

        # Acquire lock
        lock = await service.lock_manager.acquire("resource1", ttl_seconds=30)
        assert lock is not None

        # Verify locked
        is_locked = await service.lock_manager.is_locked("resource1")
        assert is_locked is True

        # Extend lock
        result = await service.lock_manager.extend("resource1", lock.token, ttl_seconds=60)
        assert result is True

        # Release lock
        result = await service.lock_manager.release("resource1", lock.token)
        assert result is True

        # Verify unlocked
        is_locked = await service.lock_manager.is_locked("resource1")
        assert is_locked is False

    @pytest.mark.asyncio
    async def test_health_check_workflow(self):
        """Should handle complete health check workflow."""
        service = ScalingService()

        # Register custom check
        async def custom_check():
            return (HealthStatus.HEALTHY, "Custom check passed")

        service.register_custom_check("custom", custom_check)

        report = await service.get_health()
        # Should have at least the custom check
        assert len(report.checks) >= 1

        # Verify custom check ran
        custom_check_result = next(
            (c for c in report.checks if c.name == "custom"),
            None,
        )
        assert custom_check_result is not None
        assert custom_check_result.status == HealthStatus.HEALTHY

    def test_consistent_hash_distribution(self):
        """Should distribute keys across nodes."""
        ch = ConsistentHash(["node1", "node2", "node3"], replicas=100)

        distribution = {"node1": 0, "node2": 0, "node3": 0}
        for i in range(1000):
            node = ch.get_node(f"key{i}")
            distribution[node] += 1

        # Each node should get at least 200 keys (20%)
        for node, count in distribution.items():
            assert count > 200, f"{node} got only {count} keys"

    @pytest.mark.asyncio
    async def test_concurrent_session_access(self):
        """Should handle concurrent session access."""
        service = ScalingService()

        async def set_session(i: int):
            await service.session_store.set(f"session{i}", {"data": i})

        async def get_session(i: int):
            return await service.session_store.get(f"session{i}")

        # Set 100 sessions concurrently
        await asyncio.gather(*[set_session(i) for i in range(100)])

        # Get all sessions concurrently
        results = await asyncio.gather(*[get_session(i) for i in range(100)])

        # Verify all sessions exist
        for i, result in enumerate(results):
            assert result == {"data": i}

    @pytest.mark.asyncio
    async def test_concurrent_lock_acquisition(self):
        """Should handle concurrent lock acquisition."""
        service = ScalingService()

        async def try_acquire(name: str) -> bool:
            lock = await service.lock_manager.acquire("shared-resource")
            if lock:
                await asyncio.sleep(0.01)
                await service.lock_manager.release("shared-resource", lock.token)
                return True
            return False

        # Try to acquire lock concurrently
        results = await asyncio.gather(*[try_acquire(f"worker{i}") for i in range(10)])

        # At least one should succeed
        assert any(results)
