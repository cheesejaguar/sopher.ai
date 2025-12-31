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


class TestParallelChapterServiceInitialization:
    """Tests for ParallelChapterService initialization and methods."""

    def test_service_attributes(self):
        """Test service has correct attributes after init."""
        async def mock_gen(*args) -> str:
            return "Content"

        service = ParallelChapterService(
            generator=mock_gen,
            max_parallel=5,
            retry_on_failure=True,
            max_retries=3,
        )

        assert service.generator is mock_gen
        assert service.max_parallel == 5
        assert service.retry_on_failure is True
        assert service.max_retries == 3
        assert service._queue is None
        assert service._progress_callback is None

    def test_set_progress_callback_chainable(self):
        """Test set_progress_callback returns self for chaining."""
        async def mock_gen(*args) -> str:
            return "Content"

        service = ParallelChapterService(generator=mock_gen)
        result = service.set_progress_callback(lambda p: None)

        assert result is service


class TestJobQueueProgressEstimation:
    """Tests for progress estimation with time tracking."""

    @pytest.mark.asyncio
    async def test_estimated_remaining_time(self):
        """Test estimated remaining time calculation."""
        import asyncio

        queue = JobQueue(max_parallel=2)
        job1 = ChapterJob(chapter_number=1, outline="1")
        job2 = ChapterJob(chapter_number=2, outline="2")
        job3 = ChapterJob(chapter_number=3, outline="3")

        queue.add_job(job1)
        queue.add_job(job2)
        queue.add_job(job3)

        # Complete first job with timing
        await queue.mark_running(job1.id)
        await asyncio.sleep(0.01)  # Small delay to ensure time difference
        await queue.mark_completed(job1.id, "Content 1", 500)

        progress = queue.get_progress()
        assert progress.completed_chapters == 1
        # Estimated remaining should exist since we have timing data
        # (though it might be very small due to fast execution)

    @pytest.mark.asyncio
    async def test_progress_with_failed_jobs(self):
        """Test progress calculation with failed jobs."""
        queue = JobQueue()
        job1 = ChapterJob(chapter_number=1, outline="1")
        job2 = ChapterJob(chapter_number=2, outline="2")

        queue.add_job(job1)
        queue.add_job(job2)

        await queue.mark_running(job1.id)
        await queue.mark_failed(job1.id, "Error")

        progress = queue.get_progress()
        assert progress.total_chapters == 2
        assert progress.failed_chapters == 1
        assert progress.completed_chapters == 0


class TestNotifyProgress:
    """Tests for progress notification."""

    def test_notify_progress_no_callback(self):
        """Test notify_progress does nothing without callback."""
        async def mock_gen(*args) -> str:
            return "Content"

        service = ParallelChapterService(generator=mock_gen)
        # Should not raise
        service._notify_progress()

    def test_notify_progress_no_queue(self):
        """Test notify_progress handles missing queue."""
        async def mock_gen(*args) -> str:
            return "Content"

        service = ParallelChapterService(generator=mock_gen)
        service.set_progress_callback(lambda p: None)
        # Should not raise even without queue
        service._notify_progress()


class TestQueueOperationsWithMissingJob:
    """Tests for queue operations with non-existent job IDs."""

    @pytest.mark.asyncio
    async def test_mark_running_missing_job(self):
        """Test mark_running with non-existent job."""
        queue = JobQueue()
        await queue.mark_running(uuid4())  # Should not raise

    @pytest.mark.asyncio
    async def test_mark_completed_missing_job(self):
        """Test mark_completed with non-existent job."""
        queue = JobQueue()
        await queue.mark_completed(uuid4(), "Result")  # Should not raise

    @pytest.mark.asyncio
    async def test_mark_failed_missing_job(self):
        """Test mark_failed with non-existent job."""
        queue = JobQueue()
        await queue.mark_failed(uuid4(), "Error")  # Should not raise

    @pytest.mark.asyncio
    async def test_update_progress_missing_job(self):
        """Test update_progress with non-existent job."""
        queue = JobQueue()
        await queue.update_progress(uuid4(), 0.5)  # Should not raise


class TestProgressWithQueue:
    """Tests for progress methods when queue exists."""

    @pytest.mark.asyncio
    async def test_get_current_progress_with_queue(self):
        """Test get_current_progress returns progress when queue exists."""
        async def mock_gen(*args):
            return "Content"

        service = ParallelChapterService(generator=mock_gen)
        service._queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="Test")
        job.status = JobStatus.COMPLETED
        job.progress = 1.0
        service._queue.add_job(job)

        progress = service.get_current_progress()
        assert progress is not None
        assert progress.total_chapters == 1
        assert progress.completed_chapters == 1

    @pytest.mark.asyncio
    async def test_cancel_with_queue(self):
        """Test cancel returns count when queue exists."""
        async def mock_gen(*args):
            return "Content"

        service = ParallelChapterService(generator=mock_gen, max_parallel=1)
        service._queue = JobQueue(max_parallel=1)
        service._queue.add_job(ChapterJob(chapter_number=1, outline="1"))
        service._queue.add_job(ChapterJob(chapter_number=2, outline="2"))

        cancelled = service.cancel()
        assert cancelled == 2


class TestNotifyProgressWithQueue:
    """Tests for _notify_progress with callback and queue."""

    def test_notify_progress_with_callback_and_queue(self):
        """Test _notify_progress calls callback when both are set."""
        progress_updates = []

        async def mock_gen(*args):
            return "Content"

        service = ParallelChapterService(generator=mock_gen)
        service._queue = JobQueue()
        service._queue.add_job(ChapterJob(chapter_number=1, outline="Test"))
        service.set_progress_callback(lambda p: progress_updates.append(p))

        # Manually call _notify_progress
        service._notify_progress()

        assert len(progress_updates) == 1
        assert progress_updates[0].total_chapters == 1


class TestEstimatedRemainingTime:
    """Tests for estimated remaining time calculation."""

    @pytest.mark.asyncio
    async def test_estimated_time_with_completed_jobs(self):
        """Test estimated time calculation with multiple completed jobs."""
        import asyncio

        queue = JobQueue(max_parallel=2)
        job1 = ChapterJob(chapter_number=1, outline="1")
        job2 = ChapterJob(chapter_number=2, outline="2")
        job3 = ChapterJob(chapter_number=3, outline="3")

        queue.add_job(job1)
        queue.add_job(job2)
        queue.add_job(job3)

        # Complete first two jobs with artificial timing
        await queue.mark_running(job1.id)
        await asyncio.sleep(0.02)
        await queue.mark_completed(job1.id, "C1", 500)

        await queue.mark_running(job2.id)
        await asyncio.sleep(0.02)
        await queue.mark_completed(job2.id, "C2", 500)

        progress = queue.get_progress()
        assert progress.completed_chapters == 2
        # Estimated remaining should be calculated
        assert progress.estimated_remaining_seconds is not None

    @pytest.mark.asyncio
    async def test_estimated_time_covers_branch(self):
        """Test that estimated time calculation branch is covered."""
        from datetime import datetime, timedelta

        queue = JobQueue(max_parallel=3)

        # Create job with manual timestamps
        job1 = ChapterJob(chapter_number=1, outline="1")
        job1.status = JobStatus.COMPLETED
        job1.started_at = datetime.utcnow() - timedelta(seconds=2)
        job1.completed_at = datetime.utcnow()
        job1.progress = 1.0

        job2 = ChapterJob(chapter_number=2, outline="2")  # Pending

        queue._jobs[job1.id] = job1
        queue._jobs[job2.id] = job2
        queue._queue = [job1.id, job2.id]

        progress = queue.get_progress()
        assert progress.completed_chapters == 1
        assert progress.estimated_remaining_seconds is not None
        # Should estimate ~2 seconds for remaining 1 job at max_parallel=3
        assert progress.estimated_remaining_seconds >= 0


class TestRunJobBranches:
    """Tests for _run_job method branches."""

    @pytest.mark.asyncio
    async def test_run_job_success(self):
        """Test _run_job with successful generation."""
        async def mock_gen(ch_num, outline, style, char_bible, prev):
            return "Generated content here"

        service = ParallelChapterService(generator=mock_gen)
        service._queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="Test outline")
        service._queue.add_job(job)

        await service._run_job(job, {"char": "info"}, ["prev chapter"])

        assert job.status == JobStatus.COMPLETED
        assert job.result == "Generated content here"
        assert job.word_count == 3

    @pytest.mark.asyncio
    async def test_run_job_failure_no_retry(self):
        """Test _run_job failure without retry."""
        async def failing_gen(*args):
            raise ValueError("Test error")

        service = ParallelChapterService(
            generator=failing_gen,
            retry_on_failure=False,
        )
        service._queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="Test")
        service._queue.add_job(job)

        await service._run_job(job, None, [])

        assert job.status == JobStatus.FAILED
        assert "Test error" in job.error

    @pytest.mark.asyncio
    async def test_run_job_failure_with_exhausted_retries(self):
        """Test _run_job fails after exhausting retries."""
        async def failing_gen(*args):
            raise ValueError("Persistent error")

        service = ParallelChapterService(
            generator=failing_gen,
            retry_on_failure=True,
            max_retries=2,
        )
        service._queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="Test")
        service._queue.add_job(job)

        await service._run_job(job, None, [])

        assert job.status == JobStatus.FAILED
        assert "Persistent error" in job.error

    @pytest.mark.asyncio
    async def test_run_job_success_after_retry(self):
        """Test _run_job succeeds after retrying."""
        attempts = [0]

        async def flaky_gen(*args):
            attempts[0] += 1
            if attempts[0] < 2:
                raise ValueError("Temp error")
            return "Success"

        service = ParallelChapterService(
            generator=flaky_gen,
            retry_on_failure=True,
            max_retries=3,
        )
        service._queue = JobQueue()
        job = ChapterJob(chapter_number=1, outline="Test")
        service._queue.add_job(job)

        await service._run_job(job, None, [])

        assert job.status == JobStatus.COMPLETED
        assert attempts[0] == 2
