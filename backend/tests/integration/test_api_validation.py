"""Integration tests for API request validation.

These tests verify that API endpoints properly validate input
and return appropriate error responses using schema validation.
"""

import pytest

from app.schemas import ChapterDraftRequest, ContinuityReport, OutlineRequest


class TestOutlineRequestValidation:
    """Tests for OutlineRequest schema validation."""

    def test_outline_request_rejects_short_brief(self):
        """Test that brief must be at least 10 characters."""
        with pytest.raises(ValueError):
            OutlineRequest(brief="short")  # Too short

    def test_outline_request_rejects_long_brief(self):
        """Test that brief must be at most 10000 characters."""
        long_brief = "A" * 10001
        with pytest.raises(ValueError):
            OutlineRequest(brief=long_brief)

    def test_outline_request_rejects_zero_chapters(self):
        """Test that target_chapters must be at least 1."""
        with pytest.raises(ValueError):
            OutlineRequest(
                brief="A valid brief that is long enough for testing.", target_chapters=0
            )

    def test_outline_request_rejects_too_many_chapters(self):
        """Test that target_chapters must be at most 50."""
        with pytest.raises(ValueError):
            OutlineRequest(
                brief="A valid brief that is long enough for testing.", target_chapters=100
            )

    def test_outline_request_accepts_valid_input(self):
        """Test that valid input is accepted."""
        request = OutlineRequest(
            brief="A compelling story about a young hero on a quest to save their kingdom.",
            target_chapters=10,
            style_guide="Modern prose",
            genre="Fantasy",
        )
        assert request.brief.startswith("A compelling")
        assert request.target_chapters == 10

    def test_outline_request_default_values(self):
        """Test default values are applied correctly."""
        request = OutlineRequest(brief="A valid brief that meets the minimum length requirement.")
        assert request.target_chapters == 10  # Default
        assert request.style_guide is None
        assert request.genre is None


class TestChapterDraftRequestValidation:
    """Tests for ChapterDraftRequest schema validation."""

    def test_chapter_request_requires_outline(self):
        """Test that outline is required."""
        with pytest.raises(ValueError):
            ChapterDraftRequest(chapter_number=1)  # Missing outline

    def test_chapter_request_rejects_invalid_chapter_number(self):
        """Test that chapter_number must be positive."""
        with pytest.raises(ValueError):
            ChapterDraftRequest(outline="Chapter outline", chapter_number=0)

    def test_chapter_request_accepts_valid_input(self):
        """Test that valid input is accepted."""
        request = ChapterDraftRequest(
            outline="Chapter 1: The Beginning - Hero discovers their powers.",
            chapter_number=1,
            style_guide="Action-oriented",
        )
        assert request.chapter_number == 1
        assert "Beginning" in request.outline


class TestContinuityReportValidation:
    """Tests for ContinuityReport schema validation."""

    def test_continuity_report_accepts_empty_issues(self):
        """Test that empty issue lists are valid."""
        report = ContinuityReport(
            inconsistencies=[],
            suggestions=[],
            timeline_issues=[],
            character_issues=[],
            confidence_score=0.95,
        )
        assert len(report.inconsistencies) == 0
        assert report.confidence_score == 0.95

    def test_continuity_report_accepts_issues(self):
        """Test that issues can be populated."""
        report = ContinuityReport(
            inconsistencies=[{"type": "name", "description": "Character name changed"}],
            suggestions=["Fix character name in chapter 5"],
            timeline_issues=[{"chapter": 3, "issue": "Time inconsistency"}],
            character_issues=[{"character": "Hero", "issue": "Eye color change"}],
            confidence_score=0.8,
        )
        assert len(report.inconsistencies) == 1
        assert len(report.suggestions) == 1

    def test_continuity_report_score_range(self):
        """Test that confidence_score is within valid range."""
        # Should accept 0.0
        report = ContinuityReport(
            inconsistencies=[],
            suggestions=[],
            timeline_issues=[],
            character_issues=[],
            confidence_score=0.0,
        )
        assert report.confidence_score == 0.0

        # Should accept 1.0
        report = ContinuityReport(
            inconsistencies=[],
            suggestions=[],
            timeline_issues=[],
            character_issues=[],
            confidence_score=1.0,
        )
        assert report.confidence_score == 1.0
