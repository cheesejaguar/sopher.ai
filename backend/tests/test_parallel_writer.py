"""Tests for parallel chapter generation service.

Tests cover:
- JobQueue management
- ChapterJob lifecycle
- Progress tracking
- Basic service functionality
"""

from uuid import uuid4

import pytest

from app.services.parallel_writer import (
    BatchProgress,
    ChapterJob,
    JobQueue,
    JobStatus,
    ParallelChapterService,
    create_parallel_writer,
)


class TestJobStatus:
    """Tests for JobStatus enum."""

    def test_all_statuses_defined(self):
        """Test that all expected statuses are defined."""
        assert JobStatus.PENDING == "pending"
        assert JobStatus.RUNNING == "running"
        assert JobStatus.COMPLETED == "completed"
        assert JobStatus.FAILED == "failed"
        assert JobStatus.CANCELLED == "cancelled"

    def test_status_is_string(self):
        """Test that status values are strings."""
        for status in JobStatus:
            assert isinstance(status.value, str)


class TestChapterJob:
    """Tests for ChapterJob dataclass."""

    def test_default_job(self):
        """Test default chapter job creation."""
        job = ChapterJob()
        assert job.id is not None
        assert job.chapter_number == 0
        assert job.status == JobStatus.PENDING
        assert job.progress == 0.0
        assert job.result is None
        assert job.error is None

    def test_job_with_values(self):
        """Test job with specific values."""
        job = ChapterJob(
            chapter_number=5,
            outline="Chapter 5 outline",
            style_guide="Third person, past tense",
        )
        assert job.chapter_number == 5
        assert job.outline == "Chapter 5 outline"
        assert job.style_guide == "Third person, past tense"

    def test_job_id_is_uuid(self):
        """Test that job ID is a UUID."""
        job = ChapterJob()
        assert isinstance(job.id, uuid4().__class__)


class TestJobQueue:
    """Tests for JobQueue."""

    def test_add_and_get_job(self):
        """Test adding and retrieving jobs."""
        queue = JobQueue(max_parallel=3)
        job = ChapterJob(chapter_number=1, outline="Outline 1")

        job_id = queue.add_job(job)

        retrieved = queue.get_job(job_id)
        assert retrieved is not None
        assert retrieved.chapter_number == 1

    def test_get_job_not_found(self):
        """Test getting non-existent job."""
        queue = JobQueue()
        assert queue.get_job(uuid4()) is None

    def test_get_all_jobs(self):
        """Test getting all jobs."""
        queue = JobQueue()
        queue.add_job(ChapterJob(chapter_number=1, outline="1"))
        queue.add_job(ChapterJob(chapter_number=2, outline="2"))
        queue.add_job(ChapterJob(chapter_number=3, outline="3"))

        all_jobs = queue.get_all_jobs()
        assert len(all_jobs) == 3

    def test_get_next_pending(self):
        """Test getting next pending job."""
        queue = JobQueue()
        queue.add_job(ChapterJob(chapter_number=1, outline="1"))
        queue.add_job(ChapterJob(chapter_number=2, outline="2"))

        next_job = queue.get_next_pending()
        assert next_job is not None
        assert next_job.chapter_number == 1

    def test_get_next_pending_empty(self):
        """Test getting next pending when queue is empty."""
        queue = JobQueue()
        assert queue.get_next_pending() is None

    @pytest.mark.asyncio
    async def test_mark_running(self):
        """Test marking job as running."""
        queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="1")
        queue.add_job(job)

        await queue.mark_running(job.id)

        assert job.status == JobStatus.RUNNING
        assert job.started_at is not None

    @pytest.mark.asyncio
    async def test_mark_completed(self):
        """Test marking job as completed."""
        queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="1")
        queue.add_job(job)
        await queue.mark_running(job.id)

        await queue.mark_completed(job.id, "Chapter content here", word_count=500)

        assert job.status == JobStatus.COMPLETED
        assert job.result == "Chapter content here"
        assert job.word_count == 500
        assert job.progress == 1.0
        assert job.completed_at is not None

    @pytest.mark.asyncio
    async def test_mark_failed(self):
        """Test marking job as failed."""
        queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="1")
        queue.add_job(job)
        await queue.mark_running(job.id)

        await queue.mark_failed(job.id, "API error")

        assert job.status == JobStatus.FAILED
        assert job.error == "API error"

    @pytest.mark.asyncio
    async def test_update_progress(self):
        """Test updating job progress."""
        queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="1")
        queue.add_job(job)

        await queue.update_progress(job.id, 0.5)
        assert job.progress == 0.5

        # Test clamping
        await queue.update_progress(job.id, 1.5)
        assert job.progress == 1.0

        await queue.update_progress(job.id, -0.5)
        assert job.progress == 0.0

    def test_can_start_new(self):
        """Test checking if new jobs can start."""
        queue = JobQueue(max_parallel=2)
        assert queue.can_start_new()

    @pytest.mark.asyncio
    async def test_can_start_new_at_limit(self):
        """Test can_start_new when at limit."""
        queue = JobQueue(max_parallel=2)

        job1 = ChapterJob(chapter_number=1, outline="1")
        job2 = ChapterJob(chapter_number=2, outline="2")
        queue.add_job(job1)
        queue.add_job(job2)

        await queue.mark_running(job1.id)
        assert queue.can_start_new()

        await queue.mark_running(job2.id)
        assert not queue.can_start_new()

    def test_cancel_pending(self):
        """Test cancelling pending jobs."""
        queue = JobQueue()
        queue.add_job(ChapterJob(chapter_number=1, outline="1"))
        queue.add_job(ChapterJob(chapter_number=2, outline="2"))

        cancelled = queue.cancel_pending()

        assert cancelled == 2
        for job in queue.get_all_jobs():
            assert job.status == JobStatus.CANCELLED


class TestBatchProgress:
    """Tests for BatchProgress."""

    def test_empty_progress(self):
        """Test progress for empty queue."""
        queue = JobQueue()
        progress = queue.get_progress()

        assert progress.total_chapters == 0
        assert progress.overall_progress == 1.0

    @pytest.mark.asyncio
    async def test_progress_calculation(self):
        """Test progress calculation."""
        queue = JobQueue()
        job1 = ChapterJob(chapter_number=1, outline="1")
        job2 = ChapterJob(chapter_number=2, outline="2")
        queue.add_job(job1)
        queue.add_job(job2)

        await queue.mark_running(job1.id)
        await queue.mark_completed(job1.id, "Content", 1000)

        progress = queue.get_progress()

        assert progress.total_chapters == 2
        assert progress.completed_chapters == 1
        assert progress.in_progress_chapters == 0
        assert progress.overall_progress == 0.5
        assert progress.word_count_total == 1000

    def test_batch_progress_dataclass(self):
        """Test BatchProgress dataclass fields."""
        progress = BatchProgress(
            total_chapters=10,
            completed_chapters=5,
            failed_chapters=1,
            in_progress_chapters=2,
            overall_progress=0.5,
            estimated_remaining_seconds=60.0,
            word_count_total=15000,
        )

        assert progress.total_chapters == 10
        assert progress.completed_chapters == 5
        assert progress.failed_chapters == 1
        assert progress.in_progress_chapters == 2
        assert progress.overall_progress == 0.5
        assert progress.estimated_remaining_seconds == 60.0
        assert progress.word_count_total == 15000


class TestParallelChapterService:
    """Tests for ParallelChapterService basic functionality."""

    @pytest.fixture
    def mock_generator(self):
        """Create a mock chapter generator."""

        async def generator(
            chapter_num: int,
            outline: str,
            style_guide: str,
            char_bible: dict,
            prev_chapters: list[str],
        ) -> str:
            return f"Generated content for chapter {chapter_num}"

        return generator

    def test_service_creation(self, mock_generator):
        """Test creating a parallel chapter service."""
        service = ParallelChapterService(
            generator=mock_generator,
            max_parallel=3,
        )

        assert service.max_parallel == 3
        assert service.retry_on_failure

    def test_service_with_options(self, mock_generator):
        """Test service with custom options."""
        service = ParallelChapterService(
            generator=mock_generator,
            max_parallel=5,
            retry_on_failure=False,
            max_retries=5,
        )

        assert service.max_parallel == 5
        assert not service.retry_on_failure
        assert service.max_retries == 5

    def test_set_progress_callback(self, mock_generator):
        """Test setting progress callback."""
        service = ParallelChapterService(generator=mock_generator)
        callback_results = []

        result = service.set_progress_callback(lambda p: callback_results.append(p))

        assert service._progress_callback is not None
        assert result is service  # Returns self for chaining

    def test_get_current_progress_no_queue(self, mock_generator):
        """Test getting progress when no queue exists."""
        service = ParallelChapterService(generator=mock_generator)
        assert service.get_current_progress() is None

    def test_cancel_no_queue(self, mock_generator):
        """Test cancelling when no queue exists."""
        service = ParallelChapterService(generator=mock_generator)
        assert service.cancel() == 0


class TestCreateParallelWriter:
    """Tests for factory function."""

    def test_creates_service(self):
        """Test factory creates service."""

        async def dummy_gen(*args) -> str:
            return "Content"

        service = create_parallel_writer(
            generator=dummy_gen,
            max_parallel=5,
        )

        assert isinstance(service, ParallelChapterService)
        assert service.max_parallel == 5

    def test_default_max_parallel(self):
        """Test default max_parallel value."""

        async def dummy_gen(*args) -> str:
            return "Content"

        service = create_parallel_writer(generator=dummy_gen)
        assert service.max_parallel == 3


class TestJobQueueMaxParallel:
    """Tests for max_parallel configuration."""

    def test_default_max_parallel(self):
        """Test default max_parallel."""
        queue = JobQueue()
        assert queue.max_parallel == 3

    def test_custom_max_parallel(self):
        """Test custom max_parallel."""
        queue = JobQueue(max_parallel=10)
        assert queue.max_parallel == 10


class TestChapterJobProgress:
    """Tests for chapter job progress tracking."""

    def test_initial_progress(self):
        """Test initial progress is zero."""
        job = ChapterJob(chapter_number=1, outline="Test")
        assert job.progress == 0.0

    def test_completed_progress(self):
        """Test completed job has full progress."""
        job = ChapterJob(
            chapter_number=1,
            outline="Test",
            status=JobStatus.COMPLETED,
            progress=1.0,
        )
        assert job.progress == 1.0


class TestJobStatusTransitions:
    """Tests for job status transitions."""

    @pytest.mark.asyncio
    async def test_pending_to_running(self):
        """Test transition from pending to running."""
        queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="Test")
        queue.add_job(job)

        assert job.status == JobStatus.PENDING
        await queue.mark_running(job.id)
        assert job.status == JobStatus.RUNNING

    @pytest.mark.asyncio
    async def test_running_to_completed(self):
        """Test transition from running to completed."""
        queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="Test")
        queue.add_job(job)
        await queue.mark_running(job.id)

        assert job.status == JobStatus.RUNNING
        await queue.mark_completed(job.id, "Result")
        assert job.status == JobStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_running_to_failed(self):
        """Test transition from running to failed."""
        queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="Test")
        queue.add_job(job)
        await queue.mark_running(job.id)

        assert job.status == JobStatus.RUNNING
        await queue.mark_failed(job.id, "Error message")
        assert job.status == JobStatus.FAILED
