"""Parallel chapter generation service with job tracking and progress monitoring.

This service orchestrates parallel chapter generation with:
- Job queue management
- Progress tracking across parallel jobs
- Configurable concurrency limits
- Error handling and retry logic
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine, Optional
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """Status of a generation job."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ChapterJob:
    """Represents a single chapter generation job."""

    id: UUID = field(default_factory=uuid4)
    chapter_number: int = 0
    outline: str = ""
    style_guide: Optional[str] = None
    status: JobStatus = JobStatus.PENDING
    progress: float = 0.0
    result: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    word_count: int = 0


@dataclass
class BatchProgress:
    """Progress information for a batch of chapters."""

    total_chapters: int
    completed_chapters: int
    failed_chapters: int
    in_progress_chapters: int
    overall_progress: float
    estimated_remaining_seconds: Optional[float] = None
    word_count_total: int = 0


class JobQueue:
    """Manages a queue of chapter generation jobs."""

    def __init__(self, max_parallel: int = 3):
        self.max_parallel = max_parallel
        self._jobs: dict[UUID, ChapterJob] = {}
        self._queue: list[UUID] = []
        self._running: set[UUID] = set()
        self._lock = asyncio.Lock()

    def add_job(self, job: ChapterJob) -> UUID:
        """Add a job to the queue."""
        self._jobs[job.id] = job
        self._queue.append(job.id)
        return job.id

    def get_job(self, job_id: UUID) -> Optional[ChapterJob]:
        """Get a job by ID."""
        return self._jobs.get(job_id)

    def get_all_jobs(self) -> list[ChapterJob]:
        """Get all jobs in the queue."""
        return list(self._jobs.values())

    def get_next_pending(self) -> Optional[ChapterJob]:
        """Get the next pending job."""
        for job_id in self._queue:
            job = self._jobs.get(job_id)
            if job and job.status == JobStatus.PENDING:
                return job
        return None

    async def mark_running(self, job_id: UUID) -> None:
        """Mark a job as running."""
        async with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.status = JobStatus.RUNNING
                job.started_at = datetime.utcnow()
                self._running.add(job_id)

    async def mark_completed(self, job_id: UUID, result: str, word_count: int = 0) -> None:
        """Mark a job as completed."""
        async with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.status = JobStatus.COMPLETED
                job.result = result
                job.word_count = word_count
                job.progress = 1.0
                job.completed_at = datetime.utcnow()
                self._running.discard(job_id)

    async def mark_failed(self, job_id: UUID, error: str) -> None:
        """Mark a job as failed."""
        async with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.status = JobStatus.FAILED
                job.error = error
                job.completed_at = datetime.utcnow()
                self._running.discard(job_id)

    async def update_progress(self, job_id: UUID, progress: float) -> None:
        """Update job progress (0.0 to 1.0)."""
        async with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.progress = max(0.0, min(1.0, progress))

    def can_start_new(self) -> bool:
        """Check if we can start a new job."""
        return len(self._running) < self.max_parallel

    def get_progress(self) -> BatchProgress:
        """Get overall batch progress."""
        jobs = list(self._jobs.values())
        total = len(jobs)

        if total == 0:
            return BatchProgress(
                total_chapters=0,
                completed_chapters=0,
                failed_chapters=0,
                in_progress_chapters=0,
                overall_progress=1.0,
            )

        completed = sum(1 for j in jobs if j.status == JobStatus.COMPLETED)
        failed = sum(1 for j in jobs if j.status == JobStatus.FAILED)
        in_progress = sum(1 for j in jobs if j.status == JobStatus.RUNNING)
        word_count = sum(j.word_count for j in jobs)

        # Calculate overall progress
        progress_sum = sum(j.progress for j in jobs)
        overall = progress_sum / total

        # Estimate remaining time based on completed jobs
        estimated_remaining = None
        if completed > 0:
            completed_jobs = [j for j in jobs if j.status == JobStatus.COMPLETED]
            if completed_jobs:
                avg_duration = sum(
                    (j.completed_at - j.started_at).total_seconds()
                    for j in completed_jobs
                    if j.started_at and j.completed_at
                ) / len(completed_jobs)
                remaining = total - completed - failed
                estimated_remaining = avg_duration * remaining / max(1, self.max_parallel)

        return BatchProgress(
            total_chapters=total,
            completed_chapters=completed,
            failed_chapters=failed,
            in_progress_chapters=in_progress,
            overall_progress=overall,
            estimated_remaining_seconds=estimated_remaining,
            word_count_total=word_count,
        )

    def cancel_pending(self) -> int:
        """Cancel all pending jobs. Returns count of cancelled jobs."""
        cancelled = 0
        for job in self._jobs.values():
            if job.status == JobStatus.PENDING:
                job.status = JobStatus.CANCELLED
                cancelled += 1
        return cancelled


# Type alias for chapter generator function
ChapterGenerator = Callable[
    [int, str, Optional[str], Optional[dict], Optional[list[str]]],
    Coroutine[Any, Any, str],
]


class ParallelChapterService:
    """Orchestrate parallel chapter generation with progress tracking."""

    def __init__(
        self,
        generator: ChapterGenerator,
        max_parallel: int = 3,
        retry_on_failure: bool = True,
        max_retries: int = 2,
    ):
        """
        Initialize parallel chapter service.

        Args:
            generator: Async function to generate a single chapter
            max_parallel: Maximum concurrent chapters
            retry_on_failure: Whether to retry failed jobs
            max_retries: Maximum retry attempts
        """
        self.generator = generator
        self.max_parallel = max_parallel
        self.retry_on_failure = retry_on_failure
        self.max_retries = max_retries
        self._queue: Optional[JobQueue] = None
        self._progress_callback: Optional[Callable[[BatchProgress], None]] = None

    def set_progress_callback(
        self, callback: Callable[[BatchProgress], None]
    ) -> "ParallelChapterService":
        """Set a callback for progress updates."""
        self._progress_callback = callback
        return self

    def _notify_progress(self) -> None:
        """Notify progress callback if set."""
        if self._progress_callback and self._queue:
            self._progress_callback(self._queue.get_progress())

    async def _run_job(
        self,
        job: ChapterJob,
        character_bible: Optional[dict],
        previous_chapters: list[str],
    ) -> None:
        """Run a single chapter generation job."""
        await self._queue.mark_running(job.id)
        self._notify_progress()

        retries = 0
        while retries <= self.max_retries:
            try:
                # Generate the chapter
                result = await self.generator(
                    job.chapter_number,
                    job.outline,
                    job.style_guide,
                    character_bible,
                    previous_chapters,
                )

                word_count = len(result.split())
                await self._queue.mark_completed(job.id, result, word_count)
                self._notify_progress()
                return

            except Exception as e:
                retries += 1
                if retries > self.max_retries or not self.retry_on_failure:
                    await self._queue.mark_failed(job.id, str(e))
                    self._notify_progress()
                    logger.error(f"Chapter {job.chapter_number} generation failed: {e}")
                    return
                else:
                    logger.warning(
                        f"Chapter {job.chapter_number} retry {retries}/{self.max_retries}"
                    )
                    await asyncio.sleep(1)  # Brief delay before retry

    async def generate_chapters(
        self,
        chapter_outlines: list[dict],
        style_guide: Optional[str] = None,
        character_bible: Optional[dict] = None,
        start_chapter: int = 1,
    ) -> list[ChapterJob]:
        """
        Generate multiple chapters in parallel.

        Args:
            chapter_outlines: List of outline dicts for each chapter
            style_guide: Style guide for all chapters
            character_bible: Character information
            start_chapter: Starting chapter number

        Returns:
            List of completed ChapterJob objects
        """
        self._queue = JobQueue(max_parallel=self.max_parallel)

        # Create jobs for each chapter
        for i, outline in enumerate(chapter_outlines):
            job = ChapterJob(
                chapter_number=start_chapter + i,
                outline=str(outline) if isinstance(outline, dict) else outline,
                style_guide=style_guide,
            )
            self._queue.add_job(job)

        # Track completed chapters for context
        completed_chapters: list[str] = []

        # Track all running tasks
        running_tasks: set[asyncio.Task] = set()

        # Process chapters with controlled parallelism
        while True:
            # Check if all jobs are done
            progress = self._queue.get_progress()
            if progress.completed_chapters + progress.failed_chapters >= progress.total_chapters:
                break

            # Start new jobs if capacity available
            while self._queue.can_start_new():
                job = self._queue.get_next_pending()
                if not job:
                    break

                # Get previous chapters for context (last 2)
                prev_context = completed_chapters[-2:] if completed_chapters else None

                task = asyncio.create_task(self._run_job(job, character_bible, prev_context or []))
                running_tasks.add(task)

            if not running_tasks:
                # No tasks running and none to start - we're done
                break

            # Wait for at least one task to complete
            done, running_tasks = await asyncio.wait(
                running_tasks, return_when=asyncio.FIRST_COMPLETED
            )

            # Collect completed results for context
            for job in self._queue.get_all_jobs():
                if job.status == JobStatus.COMPLETED and job.result:
                    if job.result not in completed_chapters:
                        completed_chapters.append(job.result)

        return self._queue.get_all_jobs()

    def get_current_progress(self) -> Optional[BatchProgress]:
        """Get current batch progress."""
        if self._queue:
            return self._queue.get_progress()
        return None

    def cancel(self) -> int:
        """Cancel pending jobs. Returns count of cancelled jobs."""
        if self._queue:
            return self._queue.cancel_pending()
        return 0


def create_parallel_writer(
    generator: ChapterGenerator,
    max_parallel: int = 3,
) -> ParallelChapterService:
    """Factory function to create a parallel writer service."""
    return ParallelChapterService(
        generator=generator,
        max_parallel=max_parallel,
    )
