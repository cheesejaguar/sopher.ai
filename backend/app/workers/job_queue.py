"""Job queue system for background processing.

This module provides a priority-based job queue with worker pools
for handling background tasks like chapter generation, editing, and exports.
"""

import asyncio
import heapq
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Optional
from uuid import UUID, uuid4


class JobStatus(Enum):
    """Status of a job in the queue."""

    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"
    EXPIRED = "expired"


class JobPriority(Enum):
    """Priority levels for job scheduling."""

    CRITICAL = 0
    HIGH = 1
    NORMAL = 2
    LOW = 3
    BACKGROUND = 4

    def __lt__(self, other: "JobPriority") -> bool:
        """Allow priority comparison for heap operations."""
        return self.value < other.value


@dataclass
class JobResult:
    """Result of a job execution."""

    success: bool
    data: Any = None
    error: Optional[str] = None
    execution_time_ms: float = 0.0
    retries: int = 0


@dataclass(order=True)
class Job:
    """A job to be processed by a worker."""

    # Fields used for ordering (priority queue)
    priority: JobPriority = field(compare=True)
    created_at: datetime = field(compare=True, default_factory=datetime.utcnow)

    # Non-comparison fields
    id: UUID = field(compare=False, default_factory=uuid4)
    job_type: str = field(compare=False, default="")
    payload: dict[str, Any] = field(compare=False, default_factory=dict)
    status: JobStatus = field(compare=False, default=JobStatus.PENDING)
    result: Optional[JobResult] = field(compare=False, default=None)
    max_retries: int = field(compare=False, default=3)
    retry_count: int = field(compare=False, default=0)
    retry_delay_seconds: float = field(compare=False, default=5.0)
    timeout_seconds: float = field(compare=False, default=300.0)
    expires_at: Optional[datetime] = field(compare=False, default=None)
    started_at: Optional[datetime] = field(compare=False, default=None)
    completed_at: Optional[datetime] = field(compare=False, default=None)
    worker_id: Optional[str] = field(compare=False, default=None)
    tags: list[str] = field(compare=False, default_factory=list)
    metadata: dict[str, Any] = field(compare=False, default_factory=dict)

    def is_expired(self) -> bool:
        """Check if the job has expired."""
        if not self.expires_at:
            return False
        return datetime.utcnow() > self.expires_at

    def can_retry(self) -> bool:
        """Check if the job can be retried."""
        return self.retry_count < self.max_retries

    def get_retry_delay(self) -> float:
        """Get the delay before next retry with exponential backoff."""
        return self.retry_delay_seconds * (2**self.retry_count)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "id": str(self.id),
            "job_type": self.job_type,
            "priority": self.priority.name,
            "status": self.status.value,
            "payload": self.payload,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "tags": self.tags,
        }


class JobQueue:
    """Priority queue for jobs with persistence support."""

    def __init__(self, max_size: int = 10000) -> None:
        self._heap: list[Job] = []
        self._jobs: dict[UUID, Job] = {}
        self._by_type: dict[str, list[UUID]] = {}
        self._by_status: dict[JobStatus, set[UUID]] = {s: set() for s in JobStatus}
        self._max_size = max_size
        self._lock = asyncio.Lock()

    async def enqueue(self, job: Job) -> bool:
        """Add a job to the queue."""
        async with self._lock:
            if len(self._jobs) >= self._max_size:
                return False

            job.status = JobStatus.QUEUED
            heapq.heappush(self._heap, job)
            self._jobs[job.id] = job
            self._by_type.setdefault(job.job_type, []).append(job.id)
            self._by_status[JobStatus.QUEUED].add(job.id)
            return True

    async def dequeue(self) -> Optional[Job]:
        """Get the next job from the queue."""
        async with self._lock:
            while self._heap:
                job = heapq.heappop(self._heap)

                # Skip cancelled or expired jobs
                if job.status == JobStatus.CANCELLED:
                    continue
                if job.is_expired():
                    self._update_status(job, JobStatus.EXPIRED)
                    continue

                self._update_status(job, JobStatus.RUNNING)
                job.started_at = datetime.utcnow()
                return job
            return None

    async def get(self, job_id: UUID) -> Optional[Job]:
        """Get a job by ID."""
        async with self._lock:
            return self._jobs.get(job_id)

    async def cancel(self, job_id: UUID) -> bool:
        """Cancel a job."""
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            if job.status in {JobStatus.COMPLETED, JobStatus.FAILED}:
                return False
            self._update_status(job, JobStatus.CANCELLED)
            return True

    async def complete(self, job_id: UUID, result: JobResult) -> bool:
        """Mark a job as completed."""
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            job.result = result
            job.completed_at = datetime.utcnow()
            if result.success:
                self._update_status(job, JobStatus.COMPLETED)
            else:
                if job.can_retry():
                    self._update_status(job, JobStatus.RETRYING)
                else:
                    self._update_status(job, JobStatus.FAILED)
            return True

    async def retry(self, job_id: UUID) -> bool:
        """Re-enqueue a job for retry."""
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            if not job.can_retry():
                return False

            job.retry_count += 1
            job.started_at = None
            job.worker_id = None
            self._update_status(job, JobStatus.QUEUED)
            heapq.heappush(self._heap, job)
            return True

    async def get_by_status(self, status: JobStatus) -> list[Job]:
        """Get all jobs with a specific status."""
        async with self._lock:
            job_ids = self._by_status.get(status, set())
            return [self._jobs[jid] for jid in job_ids if jid in self._jobs]

    async def get_by_type(self, job_type: str) -> list[Job]:
        """Get all jobs of a specific type."""
        async with self._lock:
            job_ids = self._by_type.get(job_type, [])
            return [self._jobs[jid] for jid in job_ids if jid in self._jobs]

    async def size(self) -> int:
        """Get the number of jobs in the queue."""
        async with self._lock:
            return len(self._by_status[JobStatus.QUEUED])

    async def total_jobs(self) -> int:
        """Get total number of tracked jobs."""
        async with self._lock:
            return len(self._jobs)

    async def stats(self) -> dict[str, int]:
        """Get queue statistics."""
        async with self._lock:
            return {status.value: len(job_ids) for status, job_ids in self._by_status.items()}

    async def cleanup(self, max_age_hours: int = 24) -> int:
        """Remove old completed/failed jobs."""
        async with self._lock:
            cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
            to_remove = []

            for job_id, job in self._jobs.items():
                if job.status in {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}:
                    if job.completed_at and job.completed_at < cutoff:
                        to_remove.append(job_id)

            for job_id in to_remove:
                job = self._jobs.pop(job_id)
                self._by_status[job.status].discard(job_id)
                if job.job_type in self._by_type:
                    self._by_type[job.job_type] = [
                        jid for jid in self._by_type[job.job_type] if jid != job_id
                    ]

            return len(to_remove)

    def _update_status(self, job: Job, new_status: JobStatus) -> None:
        """Update job status and tracking."""
        self._by_status[job.status].discard(job.id)
        job.status = new_status
        self._by_status[new_status].add(job.id)


class JobWorker:
    """Worker that processes jobs from a queue."""

    def __init__(
        self,
        worker_id: str,
        queue: JobQueue,
        handlers: Optional[dict[str, Callable]] = None,
    ) -> None:
        self.worker_id = worker_id
        self.queue = queue
        self.handlers = handlers or {}
        self._running = False
        self._current_job: Optional[Job] = None
        self._jobs_processed = 0
        self._jobs_failed = 0

    def register_handler(self, job_type: str, handler: Callable) -> None:
        """Register a handler for a job type."""
        self.handlers[job_type] = handler

    async def start(self) -> None:
        """Start the worker loop."""
        self._running = True
        while self._running:
            job = await self.queue.dequeue()
            if job:
                await self._process_job(job)
            else:
                await asyncio.sleep(0.1)  # Prevent busy waiting

    async def stop(self) -> None:
        """Stop the worker."""
        self._running = False

    async def _process_job(self, job: Job) -> None:
        """Process a single job."""
        self._current_job = job
        job.worker_id = self.worker_id
        start_time = time.time()

        try:
            handler = self.handlers.get(job.job_type)
            if not handler:
                raise ValueError(f"No handler for job type: {job.job_type}")

            # Run with timeout
            result = await asyncio.wait_for(
                handler(job.payload),
                timeout=job.timeout_seconds,
            )

            execution_time = (time.time() - start_time) * 1000
            job_result = JobResult(
                success=True,
                data=result,
                execution_time_ms=execution_time,
                retries=job.retry_count,
            )
            await self.queue.complete(job.id, job_result)
            self._jobs_processed += 1

        except asyncio.TimeoutError:
            execution_time = (time.time() - start_time) * 1000
            job_result = JobResult(
                success=False,
                error="Job timed out",
                execution_time_ms=execution_time,
                retries=job.retry_count,
            )
            await self.queue.complete(job.id, job_result)
            self._jobs_failed += 1

            if job.can_retry():
                await asyncio.sleep(job.get_retry_delay())
                await self.queue.retry(job.id)

        except Exception as e:
            execution_time = (time.time() - start_time) * 1000
            job_result = JobResult(
                success=False,
                error=str(e),
                execution_time_ms=execution_time,
                retries=job.retry_count,
            )
            await self.queue.complete(job.id, job_result)
            self._jobs_failed += 1

            if job.can_retry():
                await asyncio.sleep(job.get_retry_delay())
                await self.queue.retry(job.id)

        finally:
            self._current_job = None

    @property
    def is_busy(self) -> bool:
        """Check if worker is currently processing a job."""
        return self._current_job is not None

    def get_stats(self) -> dict[str, Any]:
        """Get worker statistics."""
        return {
            "worker_id": self.worker_id,
            "running": self._running,
            "busy": self.is_busy,
            "jobs_processed": self._jobs_processed,
            "jobs_failed": self._jobs_failed,
            "current_job": str(self._current_job.id) if self._current_job else None,
        }


class WorkerPool:
    """Pool of workers for parallel job processing."""

    def __init__(
        self,
        queue: JobQueue,
        num_workers: int = 4,
        handlers: Optional[dict[str, Callable]] = None,
    ) -> None:
        self.queue = queue
        self.num_workers = num_workers
        self.handlers = handlers or {}
        self._workers: list[JobWorker] = []
        self._tasks: list[asyncio.Task] = []
        self._running = False

    def register_handler(self, job_type: str, handler: Callable) -> None:
        """Register a handler for all workers."""
        self.handlers[job_type] = handler
        for worker in self._workers:
            worker.register_handler(job_type, handler)

    async def start(self) -> None:
        """Start all workers in the pool."""
        self._running = True

        for i in range(self.num_workers):
            worker = JobWorker(
                worker_id=f"worker-{i}",
                queue=self.queue,
                handlers=self.handlers.copy(),
            )
            self._workers.append(worker)
            task = asyncio.create_task(worker.start())
            self._tasks.append(task)

    async def stop(self) -> None:
        """Stop all workers in the pool."""
        self._running = False

        for worker in self._workers:
            await worker.stop()

        # Cancel all worker tasks
        for task in self._tasks:
            task.cancel()

        # Wait for tasks to complete
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

        self._workers = []
        self._tasks = []

    async def submit(self, job: Job) -> bool:
        """Submit a job to the queue."""
        return await self.queue.enqueue(job)

    async def submit_and_wait(self, job: Job, timeout: float = 300.0) -> Optional[JobResult]:
        """Submit a job and wait for completion."""
        if not await self.submit(job):
            return None

        start = time.time()
        while time.time() - start < timeout:
            current_job = await self.queue.get(job.id)
            if current_job and current_job.status in {
                JobStatus.COMPLETED,
                JobStatus.FAILED,
                JobStatus.CANCELLED,
            }:
                return current_job.result
            await asyncio.sleep(0.1)

        return None

    @property
    def active_workers(self) -> int:
        """Get number of active workers."""
        return sum(1 for w in self._workers if w.is_busy)

    @property
    def idle_workers(self) -> int:
        """Get number of idle workers."""
        return sum(1 for w in self._workers if not w.is_busy)

    def get_stats(self) -> dict[str, Any]:
        """Get pool statistics."""
        worker_stats = [w.get_stats() for w in self._workers]
        total_processed = sum(w.get_stats()["jobs_processed"] for w in self._workers)
        total_failed = sum(w.get_stats()["jobs_failed"] for w in self._workers)

        return {
            "running": self._running,
            "num_workers": self.num_workers,
            "active_workers": self.active_workers,
            "idle_workers": self.idle_workers,
            "total_processed": total_processed,
            "total_failed": total_failed,
            "workers": worker_stats,
        }


# Pre-defined job types
class JobTypes:
    """Standard job type constants."""

    CHAPTER_GENERATION = "chapter_generation"
    CHAPTER_EDITING = "chapter_editing"
    CONTINUITY_CHECK = "continuity_check"
    EXPORT_MANUSCRIPT = "export_manuscript"
    OUTLINE_GENERATION = "outline_generation"
    QUALITY_CHECK = "quality_check"


def create_job(
    job_type: str,
    payload: dict[str, Any],
    priority: JobPriority = JobPriority.NORMAL,
    **kwargs: Any,
) -> Job:
    """Factory function to create a job."""
    return Job(
        job_type=job_type,
        payload=payload,
        priority=priority,
        **kwargs,
    )
