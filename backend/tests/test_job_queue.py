"""Tests for job queue and worker system."""

import asyncio
from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from app.workers.job_queue import (
    Job,
    JobPriority,
    JobQueue,
    JobResult,
    JobStatus,
    JobTypes,
    JobWorker,
    WorkerPool,
    create_job,
)

# =============================================================================
# Enum Tests
# =============================================================================


class TestJobStatus:
    """Tests for JobStatus enum."""

    def test_all_statuses_exist(self):
        """All job statuses should be defined."""
        assert JobStatus.PENDING.value == "pending"
        assert JobStatus.QUEUED.value == "queued"
        assert JobStatus.RUNNING.value == "running"
        assert JobStatus.COMPLETED.value == "completed"
        assert JobStatus.FAILED.value == "failed"
        assert JobStatus.CANCELLED.value == "cancelled"
        assert JobStatus.RETRYING.value == "retrying"
        assert JobStatus.EXPIRED.value == "expired"

    def test_status_count(self):
        """Should have exactly 8 statuses."""
        assert len(JobStatus) == 8


class TestJobPriority:
    """Tests for JobPriority enum."""

    def test_all_priorities_exist(self):
        """All priorities should be defined."""
        assert JobPriority.CRITICAL.value == 0
        assert JobPriority.HIGH.value == 1
        assert JobPriority.NORMAL.value == 2
        assert JobPriority.LOW.value == 3
        assert JobPriority.BACKGROUND.value == 4

    def test_priority_count(self):
        """Should have exactly 5 priorities."""
        assert len(JobPriority) == 5

    def test_priority_comparison(self):
        """Priorities should be comparable."""
        assert JobPriority.CRITICAL < JobPriority.HIGH
        assert JobPriority.HIGH < JobPriority.NORMAL
        assert JobPriority.NORMAL < JobPriority.LOW
        assert JobPriority.LOW < JobPriority.BACKGROUND


# =============================================================================
# JobResult Tests
# =============================================================================


class TestJobResult:
    """Tests for JobResult dataclass."""

    def test_success_result(self):
        """Should create success result."""
        result = JobResult(success=True, data={"key": "value"})
        assert result.success is True
        assert result.data == {"key": "value"}
        assert result.error is None

    def test_failure_result(self):
        """Should create failure result."""
        result = JobResult(success=False, error="Something went wrong")
        assert result.success is False
        assert result.error == "Something went wrong"

    def test_with_timing(self):
        """Should include execution time."""
        result = JobResult(success=True, execution_time_ms=150.5)
        assert result.execution_time_ms == 150.5


# =============================================================================
# Job Tests
# =============================================================================


class TestJob:
    """Tests for Job dataclass."""

    def test_default_values(self):
        """Should have correct defaults."""
        job = Job(priority=JobPriority.NORMAL)
        assert job.id is not None
        assert job.priority == JobPriority.NORMAL
        assert job.status == JobStatus.PENDING
        assert job.max_retries == 3
        assert job.retry_count == 0

    def test_custom_values(self):
        """Should accept custom values."""
        job = Job(
            job_type="test_job",
            priority=JobPriority.HIGH,
            payload={"data": 123},
            tags=["important"],
        )
        assert job.job_type == "test_job"
        assert job.priority == JobPriority.HIGH
        assert job.payload == {"data": 123}
        assert "important" in job.tags

    def test_is_expired_no_expiry(self):
        """Should not be expired without expiry time."""
        job = Job(priority=JobPriority.NORMAL)
        assert job.is_expired() is False

    def test_is_expired_future(self):
        """Should not be expired with future expiry."""
        job = Job(priority=JobPriority.NORMAL, expires_at=datetime.utcnow() + timedelta(hours=1))
        assert job.is_expired() is False

    def test_is_expired_past(self):
        """Should be expired with past expiry."""
        job = Job(priority=JobPriority.NORMAL, expires_at=datetime.utcnow() - timedelta(hours=1))
        assert job.is_expired() is True

    def test_can_retry(self):
        """Should track retry availability."""
        job = Job(priority=JobPriority.NORMAL, max_retries=3, retry_count=0)
        assert job.can_retry() is True

        job.retry_count = 3
        assert job.can_retry() is False

    def test_get_retry_delay(self):
        """Should calculate exponential backoff delay."""
        job = Job(priority=JobPriority.NORMAL, retry_delay_seconds=1.0, retry_count=0)
        assert job.get_retry_delay() == 1.0

        job.retry_count = 1
        assert job.get_retry_delay() == 2.0

        job.retry_count = 2
        assert job.get_retry_delay() == 4.0

    def test_to_dict(self):
        """Should serialize to dictionary."""
        job = Job(priority=JobPriority.NORMAL, job_type="test", payload={"key": "value"})
        data = job.to_dict()
        assert "id" in data
        assert data["job_type"] == "test"
        assert data["payload"] == {"key": "value"}
        assert "created_at" in data

    def test_job_ordering(self):
        """Jobs should be ordered by priority then creation time."""
        job1 = Job(priority=JobPriority.LOW)
        job2 = Job(priority=JobPriority.HIGH)
        job3 = Job(priority=JobPriority.HIGH)

        sorted_jobs = sorted([job1, job2, job3])
        assert sorted_jobs[0].priority == JobPriority.HIGH
        assert sorted_jobs[2].priority == JobPriority.LOW


# =============================================================================
# JobQueue Tests
# =============================================================================


class TestJobQueue:
    """Tests for JobQueue class."""

    @pytest.fixture
    def queue(self):
        """Create a JobQueue instance."""
        return JobQueue()

    @pytest.mark.asyncio
    async def test_enqueue_and_dequeue(self, queue):
        """Should enqueue and dequeue jobs."""
        job = Job(priority=JobPriority.NORMAL, job_type="test")
        result = await queue.enqueue(job)
        assert result is True
        assert job.status == JobStatus.QUEUED

        dequeued = await queue.dequeue()
        assert dequeued.id == job.id
        assert dequeued.status == JobStatus.RUNNING

    @pytest.mark.asyncio
    async def test_priority_ordering(self, queue):
        """Should dequeue by priority."""
        low = Job(job_type="low", priority=JobPriority.LOW)
        high = Job(job_type="high", priority=JobPriority.HIGH)
        critical = Job(job_type="critical", priority=JobPriority.CRITICAL)

        await queue.enqueue(low)
        await queue.enqueue(high)
        await queue.enqueue(critical)

        first = await queue.dequeue()
        assert first.job_type == "critical"

        second = await queue.dequeue()
        assert second.job_type == "high"

        third = await queue.dequeue()
        assert third.job_type == "low"

    @pytest.mark.asyncio
    async def test_dequeue_empty(self, queue):
        """Should return None when queue is empty."""
        result = await queue.dequeue()
        assert result is None

    @pytest.mark.asyncio
    async def test_max_size(self):
        """Should respect max size."""
        queue = JobQueue(max_size=5)

        for i in range(5):
            result = await queue.enqueue(Job(priority=JobPriority.NORMAL, job_type=f"job-{i}"))
            assert result is True

        # Should fail when full
        result = await queue.enqueue(Job(priority=JobPriority.NORMAL, job_type="overflow"))
        assert result is False

    @pytest.mark.asyncio
    async def test_get_job(self, queue):
        """Should get job by ID."""
        job = Job(priority=JobPriority.NORMAL, job_type="test")
        await queue.enqueue(job)

        retrieved = await queue.get(job.id)
        assert retrieved.id == job.id

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, queue):
        """Should return None for nonexistent job."""
        result = await queue.get(uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_cancel_job(self, queue):
        """Should cancel a job."""
        job = Job(priority=JobPriority.NORMAL, job_type="test")
        await queue.enqueue(job)

        result = await queue.cancel(job.id)
        assert result is True
        assert job.status == JobStatus.CANCELLED

        # Dequeue should skip cancelled jobs
        dequeued = await queue.dequeue()
        assert dequeued is None

    @pytest.mark.asyncio
    async def test_cancel_completed_job(self, queue):
        """Should not cancel completed jobs."""
        job = Job(priority=JobPriority.NORMAL, job_type="test")
        await queue.enqueue(job)
        await queue.dequeue()
        await queue.complete(job.id, JobResult(success=True))

        result = await queue.cancel(job.id)
        assert result is False

    @pytest.mark.asyncio
    async def test_complete_success(self, queue):
        """Should complete a job successfully."""
        job = Job(priority=JobPriority.NORMAL, job_type="test")
        await queue.enqueue(job)
        await queue.dequeue()

        result = JobResult(success=True, data="done")
        await queue.complete(job.id, result)

        assert job.status == JobStatus.COMPLETED
        assert job.completed_at is not None

    @pytest.mark.asyncio
    async def test_complete_failure_with_retry(self, queue):
        """Should mark for retry on failure."""
        job = Job(priority=JobPriority.NORMAL, job_type="test", max_retries=3)
        await queue.enqueue(job)
        await queue.dequeue()

        result = JobResult(success=False, error="Failed")
        await queue.complete(job.id, result)

        assert job.status == JobStatus.RETRYING

    @pytest.mark.asyncio
    async def test_complete_failure_no_retry(self, queue):
        """Should fail permanently when retries exhausted."""
        job = Job(priority=JobPriority.NORMAL, job_type="test", max_retries=0)
        await queue.enqueue(job)
        await queue.dequeue()

        result = JobResult(success=False, error="Failed")
        await queue.complete(job.id, result)

        assert job.status == JobStatus.FAILED

    @pytest.mark.asyncio
    async def test_retry_job(self, queue):
        """Should re-enqueue job for retry."""
        job = Job(priority=JobPriority.NORMAL, job_type="test", max_retries=3)
        await queue.enqueue(job)
        await queue.dequeue()

        result = await queue.retry(job.id)
        assert result is True
        assert job.retry_count == 1
        assert job.status == JobStatus.QUEUED

    @pytest.mark.asyncio
    async def test_retry_exhausted(self, queue):
        """Should not retry when exhausted."""
        job = Job(priority=JobPriority.NORMAL, job_type="test", max_retries=1, retry_count=1)
        await queue.enqueue(job)

        result = await queue.retry(job.id)
        assert result is False

    @pytest.mark.asyncio
    async def test_get_by_status(self, queue):
        """Should get jobs by status."""
        job1 = Job(priority=JobPriority.NORMAL, job_type="test1")
        job2 = Job(priority=JobPriority.NORMAL, job_type="test2")

        await queue.enqueue(job1)
        await queue.enqueue(job2)
        await queue.dequeue()  # Makes job1 running

        queued = await queue.get_by_status(JobStatus.QUEUED)
        running = await queue.get_by_status(JobStatus.RUNNING)

        assert len(queued) == 1
        assert len(running) == 1

    @pytest.mark.asyncio
    async def test_get_by_type(self, queue):
        """Should get jobs by type."""
        job1 = Job(priority=JobPriority.NORMAL, job_type="type_a")
        job2 = Job(priority=JobPriority.NORMAL, job_type="type_a")
        job3 = Job(priority=JobPriority.NORMAL, job_type="type_b")

        await queue.enqueue(job1)
        await queue.enqueue(job2)
        await queue.enqueue(job3)

        type_a = await queue.get_by_type("type_a")
        assert len(type_a) == 2

    @pytest.mark.asyncio
    async def test_size(self, queue):
        """Should return queue size."""
        for i in range(5):
            await queue.enqueue(Job(priority=JobPriority.NORMAL, job_type=f"job-{i}"))

        size = await queue.size()
        assert size == 5

    @pytest.mark.asyncio
    async def test_stats(self, queue):
        """Should return queue statistics."""
        job1 = Job(priority=JobPriority.NORMAL, job_type="test1")
        job2 = Job(priority=JobPriority.NORMAL, job_type="test2")

        await queue.enqueue(job1)
        await queue.enqueue(job2)
        await queue.dequeue()
        await queue.complete(job1.id, JobResult(success=True))

        stats = await queue.stats()
        assert stats["queued"] == 1
        assert stats["completed"] == 1

    @pytest.mark.asyncio
    async def test_cancel_nonexistent(self, queue):
        """Should return False when cancelling nonexistent job."""
        result = await queue.cancel(uuid4())
        assert result is False

    @pytest.mark.asyncio
    async def test_complete_nonexistent(self, queue):
        """Should return False when completing nonexistent job."""
        result = await queue.complete(uuid4(), JobResult(success=True))
        assert result is False

    @pytest.mark.asyncio
    async def test_retry_nonexistent(self, queue):
        """Should return False when retrying nonexistent job."""
        result = await queue.retry(uuid4())
        assert result is False

    @pytest.mark.asyncio
    async def test_total_jobs(self, queue):
        """Should return total number of tracked jobs."""
        # Initially empty
        total = await queue.total_jobs()
        assert total == 0

        # Add some jobs
        for i in range(3):
            await queue.enqueue(Job(priority=JobPriority.NORMAL, job_type=f"job-{i}"))

        total = await queue.total_jobs()
        assert total == 3

    @pytest.mark.asyncio
    async def test_cleanup(self, queue):
        """Should clean up old completed jobs."""
        job = Job(priority=JobPriority.NORMAL, job_type="test")
        await queue.enqueue(job)
        await queue.dequeue()
        await queue.complete(job.id, JobResult(success=True))

        # Set completed time to past
        job.completed_at = datetime.utcnow() - timedelta(hours=48)

        removed = await queue.cleanup(max_age_hours=24)
        assert removed == 1

    @pytest.mark.asyncio
    async def test_expired_job_skipped(self, queue):
        """Should skip expired jobs during dequeue."""
        expired = Job(
            priority=JobPriority.NORMAL,
            job_type="expired",
            expires_at=datetime.utcnow() - timedelta(hours=1),
        )
        valid = Job(priority=JobPriority.NORMAL, job_type="valid")

        await queue.enqueue(expired)
        await queue.enqueue(valid)

        dequeued = await queue.dequeue()
        assert dequeued.job_type == "valid"
        assert expired.status == JobStatus.EXPIRED


# =============================================================================
# JobWorker Tests
# =============================================================================


class TestJobWorker:
    """Tests for JobWorker class."""

    @pytest.fixture
    def queue(self):
        """Create a JobQueue instance."""
        return JobQueue()

    @pytest.fixture
    def worker(self, queue):
        """Create a JobWorker instance."""
        return JobWorker("worker-1", queue)

    def test_register_handler(self, worker):
        """Should register handlers."""

        async def handler(payload):
            return "done"

        worker.register_handler("test_job", handler)
        assert "test_job" in worker.handlers

    @pytest.mark.asyncio
    async def test_process_success(self, queue, worker):
        """Should process job successfully."""

        async def handler(payload):
            return payload.get("value", 0) * 2

        worker.register_handler("double", handler)

        job = Job(priority=JobPriority.NORMAL, job_type="double", payload={"value": 5})
        await queue.enqueue(job)

        dequeued = await queue.dequeue()
        await worker._process_job(dequeued)

        assert job.status == JobStatus.COMPLETED
        assert job.result.success is True
        assert job.result.data == 10

    @pytest.mark.asyncio
    async def test_process_failure(self, queue, worker):
        """Should handle job failure."""

        async def handler(payload):
            raise ValueError("Failed!")

        worker.register_handler("failing", handler)

        job = Job(priority=JobPriority.NORMAL, job_type="failing", max_retries=0)
        await queue.enqueue(job)

        dequeued = await queue.dequeue()
        await worker._process_job(dequeued)

        assert job.status == JobStatus.FAILED
        assert "Failed!" in job.result.error

    @pytest.mark.asyncio
    async def test_process_no_handler(self, queue, worker):
        """Should fail for missing handler."""
        job = Job(priority=JobPriority.NORMAL, job_type="unknown", max_retries=0)
        await queue.enqueue(job)

        dequeued = await queue.dequeue()
        await worker._process_job(dequeued)

        assert job.status == JobStatus.FAILED
        assert "No handler" in job.result.error

    @pytest.mark.asyncio
    async def test_process_timeout(self, queue, worker):
        """Should handle timeouts."""

        async def slow_handler(payload):
            await asyncio.sleep(10)
            return "done"

        worker.register_handler("slow", slow_handler)

        job = Job(priority=JobPriority.NORMAL, job_type="slow", timeout_seconds=0.1, max_retries=0)
        await queue.enqueue(job)

        dequeued = await queue.dequeue()
        await worker._process_job(dequeued)

        assert job.status == JobStatus.FAILED
        assert "timed out" in job.result.error

    def test_get_stats(self, worker):
        """Should return worker stats."""
        stats = worker.get_stats()
        assert stats["worker_id"] == "worker-1"
        assert stats["running"] is False
        assert stats["jobs_processed"] == 0


# =============================================================================
# WorkerPool Tests
# =============================================================================


class TestWorkerPool:
    """Tests for WorkerPool class."""

    @pytest.fixture
    def queue(self):
        """Create a JobQueue instance."""
        return JobQueue()

    @pytest.fixture
    def pool(self, queue):
        """Create a WorkerPool instance."""
        return WorkerPool(queue, num_workers=2)

    def test_register_handler(self, pool):
        """Should register handlers for all workers."""

        async def handler(payload):
            return "done"

        pool.register_handler("test", handler)
        assert "test" in pool.handlers

    @pytest.mark.asyncio
    async def test_submit(self, pool):
        """Should submit jobs to queue."""
        job = Job(priority=JobPriority.NORMAL, job_type="test")
        result = await pool.submit(job)
        assert result is True

    @pytest.mark.asyncio
    async def test_start_and_stop(self, pool):
        """Should start and stop workers."""
        await pool.start()
        assert pool._running is True
        assert len(pool._workers) == 2

        await pool.stop()
        assert pool._running is False
        assert len(pool._workers) == 0

    @pytest.mark.asyncio
    async def test_submit_and_wait(self, queue):
        """Should submit and wait for result."""
        pool = WorkerPool(queue, num_workers=1)

        async def handler(payload):
            return payload["value"] * 2

        pool.register_handler("double", handler)

        await pool.start()
        try:
            job = Job(priority=JobPriority.NORMAL, job_type="double", payload={"value": 21})
            result = await pool.submit_and_wait(job, timeout=5.0)

            assert result is not None
            assert result.success is True
            assert result.data == 42
        finally:
            await pool.stop()

    def test_get_stats(self, pool):
        """Should return pool stats."""
        stats = pool.get_stats()
        assert stats["num_workers"] == 2
        assert stats["running"] is False


# =============================================================================
# Factory Tests
# =============================================================================


class TestJobFactory:
    """Tests for job factory functions."""

    def test_create_job(self):
        """Should create jobs with factory."""
        job = create_job(
            job_type=JobTypes.CHAPTER_GENERATION,
            payload={"chapter": 1},
            priority=JobPriority.HIGH,
            tags=["urgent"],
        )

        assert job.job_type == JobTypes.CHAPTER_GENERATION
        assert job.priority == JobPriority.HIGH
        assert job.payload == {"chapter": 1}
        assert "urgent" in job.tags


class TestJobTypes:
    """Tests for JobTypes constants."""

    def test_job_types_defined(self):
        """All job types should be defined."""
        assert JobTypes.CHAPTER_GENERATION == "chapter_generation"
        assert JobTypes.CHAPTER_EDITING == "chapter_editing"
        assert JobTypes.CONTINUITY_CHECK == "continuity_check"
        assert JobTypes.EXPORT_MANUSCRIPT == "export_manuscript"
        assert JobTypes.OUTLINE_GENERATION == "outline_generation"
        assert JobTypes.QUALITY_CHECK == "quality_check"


# =============================================================================
# Integration Tests
# =============================================================================


class TestJobQueueIntegration:
    """Integration tests for job queue system."""

    @pytest.mark.asyncio
    async def test_concurrent_processing(self):
        """Should process jobs concurrently."""
        queue = JobQueue()
        pool = WorkerPool(queue, num_workers=4)
        results = []

        async def handler(payload):
            await asyncio.sleep(0.1)  # Simulate work
            results.append(payload["id"])
            return payload["id"]

        pool.register_handler("test", handler)

        # Enqueue multiple jobs
        for i in range(8):
            await pool.submit(Job(priority=JobPriority.NORMAL, job_type="test", payload={"id": i}))

        await pool.start()
        await asyncio.sleep(0.5)  # Wait for processing
        await pool.stop()

        assert len(results) == 8

    @pytest.mark.asyncio
    async def test_retry_mechanism(self):
        """Should retry failed jobs."""
        queue = JobQueue()
        pool = WorkerPool(queue, num_workers=1)
        attempts = [0]

        async def flaky_handler(payload):
            attempts[0] += 1
            if attempts[0] < 3:
                raise ValueError("Temporary failure")
            return "success"

        pool.register_handler("flaky", flaky_handler)

        job = Job(
            priority=JobPriority.NORMAL,
            job_type="flaky",
            max_retries=3,
            retry_delay_seconds=0.1,
        )

        await pool.start()
        result = await pool.submit_and_wait(job, timeout=5.0)
        await pool.stop()

        assert result is not None
        assert result.success is True
        assert attempts[0] == 3

    @pytest.mark.asyncio
    async def test_priority_processing(self):
        """Should process by priority."""
        queue = JobQueue()
        pool = WorkerPool(queue, num_workers=1)
        order = []

        async def handler(payload):
            order.append(payload["name"])
            return payload["name"]

        pool.register_handler("ordered", handler)

        # Enqueue in reverse priority order
        await pool.submit(
            Job(job_type="ordered", payload={"name": "low"}, priority=JobPriority.LOW)
        )
        await pool.submit(
            Job(job_type="ordered", payload={"name": "high"}, priority=JobPriority.HIGH)
        )
        await pool.submit(
            Job(job_type="ordered", payload={"name": "critical"}, priority=JobPriority.CRITICAL)
        )

        await pool.start()
        await asyncio.sleep(0.5)
        await pool.stop()

        # Should process in priority order
        assert order == ["critical", "high", "low"]
