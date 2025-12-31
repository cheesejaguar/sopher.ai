"""Tests for parallel chapter generation endpoint.

Tests cover:
- Schema validation
- Endpoint routing
- Progress event streaming
- Error handling
"""

from uuid import uuid4

import pytest

from app.schemas import (
    ChapterJobStatus,
    ChapterOutlineItem,
    ParallelChapterRequest,
    ParallelGenerationProgress,
    ParallelGenerationResult,
)


class TestChapterOutlineItemSchema:
    """Tests for ChapterOutlineItem schema."""

    def test_valid_outline_item(self):
        """Test creating a valid outline item."""
        item = ChapterOutlineItem(
            chapter_number=1,
            title="The Beginning",
            outline="The hero sets out on their journey through the enchanted forest.",
        )
        assert item.chapter_number == 1
        assert item.title == "The Beginning"
        assert "hero" in item.outline

    def test_outline_item_without_title(self):
        """Test outline item without optional title."""
        item = ChapterOutlineItem(
            chapter_number=5,
            outline="The hero faces their greatest challenge yet in the dark dungeon.",
        )
        assert item.chapter_number == 5
        assert item.title is None

    def test_outline_item_minimum_outline_length(self):
        """Test that outline must meet minimum length."""
        with pytest.raises(ValueError):
            ChapterOutlineItem(
                chapter_number=1,
                outline="Too short",  # Less than 10 chars
            )

    def test_outline_item_chapter_number_positive(self):
        """Test that chapter number must be positive."""
        with pytest.raises(ValueError):
            ChapterOutlineItem(
                chapter_number=0,
                outline="This is a valid outline with enough characters.",
            )


class TestParallelChapterRequestSchema:
    """Tests for ParallelChapterRequest schema."""

    def test_valid_parallel_request(self):
        """Test creating a valid parallel request."""
        request = ParallelChapterRequest(
            chapter_outlines=[
                ChapterOutlineItem(chapter_number=1, outline="Chapter 1 outline text here."),
                ChapterOutlineItem(chapter_number=2, outline="Chapter 2 outline text here."),
            ],
            style_guide="Write in a fantasy style",
            max_parallel=3,
        )
        assert len(request.chapter_outlines) == 2
        assert request.max_parallel == 3

    def test_parallel_request_default_max_parallel(self):
        """Test default max_parallel value."""
        request = ParallelChapterRequest(
            chapter_outlines=[
                ChapterOutlineItem(chapter_number=1, outline="Chapter 1 outline text here."),
            ],
        )
        assert request.max_parallel == 3

    def test_parallel_request_max_parallel_limits(self):
        """Test max_parallel limits (1-5)."""
        # Valid max
        request = ParallelChapterRequest(
            chapter_outlines=[
                ChapterOutlineItem(chapter_number=1, outline="Chapter 1 outline text here."),
            ],
            max_parallel=5,
        )
        assert request.max_parallel == 5

        # Max too high
        with pytest.raises(ValueError):
            ParallelChapterRequest(
                chapter_outlines=[
                    ChapterOutlineItem(chapter_number=1, outline="Chapter 1 outline text here."),
                ],
                max_parallel=6,
            )

        # Max too low
        with pytest.raises(ValueError):
            ParallelChapterRequest(
                chapter_outlines=[
                    ChapterOutlineItem(chapter_number=1, outline="Chapter 1 outline text here."),
                ],
                max_parallel=0,
            )

    def test_parallel_request_empty_outlines(self):
        """Test that at least one outline is required."""
        with pytest.raises(ValueError):
            ParallelChapterRequest(
                chapter_outlines=[],
            )

    def test_parallel_request_max_outlines(self):
        """Test maximum number of outlines (20)."""
        # 20 outlines should work
        outlines = [
            ChapterOutlineItem(chapter_number=i, outline=f"Chapter {i} outline text here.")
            for i in range(1, 21)
        ]
        request = ParallelChapterRequest(chapter_outlines=outlines)
        assert len(request.chapter_outlines) == 20

        # 21 outlines should fail
        outlines_too_many = [
            ChapterOutlineItem(chapter_number=i, outline=f"Chapter {i} outline text here.")
            for i in range(1, 22)
        ]
        with pytest.raises(ValueError):
            ParallelChapterRequest(chapter_outlines=outlines_too_many)


class TestChapterJobStatusSchema:
    """Tests for ChapterJobStatus schema."""

    def test_valid_job_status(self):
        """Test creating a valid job status."""
        status = ChapterJobStatus(
            job_id=uuid4(),
            chapter_number=1,
            status="running",
            progress=0.5,
            word_count=1500,
        )
        assert status.chapter_number == 1
        assert status.status == "running"
        assert status.progress == 0.5

    def test_job_status_all_statuses(self):
        """Test all valid status values."""
        for status_val in ["pending", "running", "completed", "failed", "cancelled"]:
            status = ChapterJobStatus(
                job_id=uuid4(),
                chapter_number=1,
                status=status_val,
                progress=0.0,
            )
            assert status.status == status_val

    def test_job_status_with_error(self):
        """Test job status with error message."""
        status = ChapterJobStatus(
            job_id=uuid4(),
            chapter_number=3,
            status="failed",
            progress=0.2,
            error="LLM rate limit exceeded",
        )
        assert status.error == "LLM rate limit exceeded"

    def test_job_status_progress_bounds(self):
        """Test progress value bounds."""
        # Valid bounds
        status = ChapterJobStatus(
            job_id=uuid4(),
            chapter_number=1,
            status="running",
            progress=0.0,
        )
        assert status.progress == 0.0

        status = ChapterJobStatus(
            job_id=uuid4(),
            chapter_number=1,
            status="completed",
            progress=1.0,
        )
        assert status.progress == 1.0

        # Invalid progress
        with pytest.raises(ValueError):
            ChapterJobStatus(
                job_id=uuid4(),
                chapter_number=1,
                status="running",
                progress=1.5,
            )


class TestParallelGenerationProgressSchema:
    """Tests for ParallelGenerationProgress schema."""

    def test_valid_progress(self):
        """Test creating valid progress object."""
        progress = ParallelGenerationProgress(
            batch_id=uuid4(),
            total_chapters=5,
            completed_chapters=2,
            failed_chapters=0,
            in_progress_chapters=2,
            overall_progress=0.4,
            word_count_total=6000,
            jobs=[
                ChapterJobStatus(
                    job_id=uuid4(),
                    chapter_number=1,
                    status="completed",
                    progress=1.0,
                    word_count=3000,
                ),
                ChapterJobStatus(
                    job_id=uuid4(),
                    chapter_number=2,
                    status="completed",
                    progress=1.0,
                    word_count=3000,
                ),
            ],
        )
        assert progress.total_chapters == 5
        assert progress.completed_chapters == 2
        assert len(progress.jobs) == 2

    def test_progress_with_estimated_time(self):
        """Test progress with estimated remaining time."""
        progress = ParallelGenerationProgress(
            batch_id=uuid4(),
            total_chapters=10,
            completed_chapters=5,
            failed_chapters=0,
            in_progress_chapters=3,
            overall_progress=0.5,
            estimated_remaining_seconds=120.5,
            jobs=[],
        )
        assert progress.estimated_remaining_seconds == 120.5


class TestParallelGenerationResultSchema:
    """Tests for ParallelGenerationResult schema."""

    def test_valid_result(self):
        """Test creating valid result object."""
        result = ParallelGenerationResult(
            batch_id=uuid4(),
            total_chapters=3,
            completed_chapters=2,
            failed_chapters=1,
            chapters=[
                {"chapter_number": 1, "content": "Chapter 1...", "word_count": 3000, "error": None},
                {"chapter_number": 2, "content": "Chapter 2...", "word_count": 2800, "error": None},
                {"chapter_number": 3, "content": None, "word_count": 0, "error": "Generation failed"},
            ],
            total_word_count=5800,
            duration_seconds=45.5,
        )
        assert result.total_chapters == 3
        assert result.completed_chapters == 2
        assert result.failed_chapters == 1
        assert result.total_word_count == 5800
        assert result.duration_seconds == 45.5


class TestCreateChapterGenerator:
    """Tests for _create_chapter_generator helper."""

    def test_generator_function_created(self):
        """Test that generator function is created correctly."""
        from app.routers.chapters import _create_chapter_generator

        generator = _create_chapter_generator("gpt-4o", "## Content Guidelines\n...")
        assert callable(generator)

    def test_generator_is_async(self):
        """Test that generator is an async function."""
        import asyncio

        from app.routers.chapters import _create_chapter_generator

        generator = _create_chapter_generator("gpt-4o", "")
        assert asyncio.iscoroutinefunction(generator)


class TestParallelEndpointExists:
    """Tests to verify the endpoint is properly registered."""

    def test_endpoint_in_router(self):
        """Test that parallel endpoint is registered in router."""
        from app.routers.chapters import router

        routes = [route.path for route in router.routes]
        assert any("parallel" in path for path in routes)

    def test_endpoint_method_post(self):
        """Test that endpoint uses POST method."""
        from app.routers.chapters import router

        for route in router.routes:
            if "parallel" in route.path:
                assert "POST" in route.methods


class TestJobStatusValues:
    """Tests for job status literal values."""

    def test_invalid_status_rejected(self):
        """Test that invalid status values are rejected."""
        with pytest.raises(ValueError):
            ChapterJobStatus(
                job_id=uuid4(),
                chapter_number=1,
                status="invalid_status",
                progress=0.0,
            )

    def test_progress_exactly_zero(self):
        """Test progress value of exactly zero."""
        status = ChapterJobStatus(
            job_id=uuid4(),
            chapter_number=1,
            status="pending",
            progress=0.0,
        )
        assert status.progress == 0.0

    def test_progress_exactly_one(self):
        """Test progress value of exactly one."""
        status = ChapterJobStatus(
            job_id=uuid4(),
            chapter_number=1,
            status="completed",
            progress=1.0,
        )
        assert status.progress == 1.0


class TestProgressSchemaEdgeCases:
    """Edge case tests for progress schema."""

    def test_zero_total_chapters(self):
        """Test progress with empty jobs list."""
        progress = ParallelGenerationProgress(
            batch_id=uuid4(),
            total_chapters=0,
            completed_chapters=0,
            failed_chapters=0,
            in_progress_chapters=0,
            overall_progress=1.0,
            jobs=[],
        )
        assert progress.total_chapters == 0
        assert progress.overall_progress == 1.0

    def test_all_failed_chapters(self):
        """Test progress when all chapters failed."""
        progress = ParallelGenerationProgress(
            batch_id=uuid4(),
            total_chapters=3,
            completed_chapters=0,
            failed_chapters=3,
            in_progress_chapters=0,
            overall_progress=0.0,
            jobs=[
                ChapterJobStatus(
                    job_id=uuid4(),
                    chapter_number=i,
                    status="failed",
                    progress=0.0,
                    error="Generation error",
                )
                for i in range(1, 4)
            ],
        )
        assert progress.failed_chapters == 3
        assert progress.completed_chapters == 0

    def test_no_estimated_time(self):
        """Test progress without estimated remaining time."""
        progress = ParallelGenerationProgress(
            batch_id=uuid4(),
            total_chapters=5,
            completed_chapters=0,
            failed_chapters=0,
            in_progress_chapters=1,
            overall_progress=0.1,
            estimated_remaining_seconds=None,
            jobs=[],
        )
        assert progress.estimated_remaining_seconds is None


class TestResultSchemaEdgeCases:
    """Edge case tests for result schema."""

    def test_all_successful_result(self):
        """Test result when all chapters succeed."""
        result = ParallelGenerationResult(
            batch_id=uuid4(),
            total_chapters=5,
            completed_chapters=5,
            failed_chapters=0,
            chapters=[
                {"chapter_number": i, "content": f"Content {i}", "word_count": 3000, "error": None}
                for i in range(1, 6)
            ],
            total_word_count=15000,
            duration_seconds=120.0,
        )
        assert result.completed_chapters == result.total_chapters
        assert result.failed_chapters == 0

    def test_mixed_results(self):
        """Test result with mixed success and failure."""
        result = ParallelGenerationResult(
            batch_id=uuid4(),
            total_chapters=4,
            completed_chapters=2,
            failed_chapters=2,
            chapters=[
                {"chapter_number": 1, "content": "Content 1", "word_count": 3000, "error": None},
                {"chapter_number": 2, "content": None, "word_count": 0, "error": "API error"},
                {"chapter_number": 3, "content": "Content 3", "word_count": 2500, "error": None},
                {"chapter_number": 4, "content": None, "word_count": 0, "error": "Timeout"},
            ],
            total_word_count=5500,
            duration_seconds=90.5,
        )
        assert result.completed_chapters == 2
        assert result.failed_chapters == 2

    def test_zero_duration(self):
        """Test result with very fast generation."""
        result = ParallelGenerationResult(
            batch_id=uuid4(),
            total_chapters=1,
            completed_chapters=1,
            failed_chapters=0,
            chapters=[{"chapter_number": 1, "content": "Quick", "word_count": 1, "error": None}],
            total_word_count=1,
            duration_seconds=0.01,
        )
        assert result.duration_seconds == 0.01


class TestEdgeCases:
    """Edge case tests for parallel generation."""

    def test_single_chapter_parallel(self):
        """Test parallel request with single chapter."""
        request = ParallelChapterRequest(
            chapter_outlines=[
                ChapterOutlineItem(chapter_number=1, outline="Single chapter outline here."),
            ],
            max_parallel=1,
        )
        assert len(request.chapter_outlines) == 1

    def test_many_chapters_parallel(self):
        """Test parallel request with many chapters."""
        outlines = [
            ChapterOutlineItem(chapter_number=i, outline=f"Chapter {i}: Detailed outline text.")
            for i in range(1, 11)
        ]
        request = ParallelChapterRequest(
            chapter_outlines=outlines,
            max_parallel=5,
        )
        assert len(request.chapter_outlines) == 10

    def test_non_sequential_chapter_numbers(self):
        """Test with non-sequential chapter numbers."""
        request = ParallelChapterRequest(
            chapter_outlines=[
                ChapterOutlineItem(chapter_number=1, outline="Chapter 1 outline text."),
                ChapterOutlineItem(chapter_number=5, outline="Chapter 5 outline text."),
                ChapterOutlineItem(chapter_number=10, outline="Chapter 10 outline text."),
            ],
        )
        assert request.chapter_outlines[0].chapter_number == 1
        assert request.chapter_outlines[1].chapter_number == 5
        assert request.chapter_outlines[2].chapter_number == 10

    def test_character_bible_optional(self):
        """Test that character_bible is optional."""
        request = ParallelChapterRequest(
            chapter_outlines=[
                ChapterOutlineItem(chapter_number=1, outline="Chapter 1 outline text."),
            ],
            character_bible=None,
        )
        assert request.character_bible is None

    def test_style_guide_optional(self):
        """Test that style_guide is optional."""
        request = ParallelChapterRequest(
            chapter_outlines=[
                ChapterOutlineItem(chapter_number=1, outline="Chapter 1 outline text."),
            ],
            style_guide=None,
        )
        assert request.style_guide is None

    def test_request_with_all_fields(self):
        """Test request with all optional fields populated."""
        request = ParallelChapterRequest(
            chapter_outlines=[
                ChapterOutlineItem(
                    chapter_number=1,
                    title="The Beginning",
                    outline="The hero sets out on their epic journey.",
                ),
                ChapterOutlineItem(
                    chapter_number=2,
                    title="The Challenge",
                    outline="The hero faces their first major obstacle.",
                ),
            ],
            style_guide="Write in an epic fantasy style with rich descriptions.",
            character_bible={
                "hero": {"name": "Alaric", "traits": ["brave", "kind"]},
                "mentor": {"name": "Gandor", "traits": ["wise", "mysterious"]},
            },
            max_parallel=2,
        )
        assert request.style_guide is not None
        assert request.character_bible is not None
        assert len(request.character_bible) == 2
