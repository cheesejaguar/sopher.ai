"""
Tests for suggestion tracking service.

Tests cover:
- SuggestionService CRUD operations
- EditHistoryService operations
- UserPreferenceLearner functionality
- SuggestionStats and SuggestionFilter dataclasses
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import EditHistory, Suggestion
from app.services.suggestion_service import (
    EditHistoryService,
    SuggestionFilter,
    SuggestionService,
    SuggestionStats,
    UserPreferenceLearner,
)

# =============================================================================
# SuggestionStats Tests
# =============================================================================


class TestSuggestionStats:
    """Tests for SuggestionStats dataclass."""

    def test_default_values(self):
        """Test default values are set correctly."""
        stats = SuggestionStats()
        assert stats.total == 0
        assert stats.pending == 0
        assert stats.applied == 0
        assert stats.rejected == 0
        assert stats.by_severity == {"info": 0, "warning": 0, "error": 0}
        assert stats.by_pass_type == {"structural": 0, "line": 0, "copy": 0, "proofread": 0}
        assert stats.by_suggestion_type == {}

    def test_custom_values(self):
        """Test custom values are preserved."""
        stats = SuggestionStats(
            total=100,
            pending=50,
            applied=30,
            rejected=20,
            by_severity={"info": 40, "warning": 35, "error": 25},
            by_pass_type={"structural": 25, "line": 25, "copy": 25, "proofread": 25},
            by_suggestion_type={"grammar": 50, "spelling": 50},
        )
        assert stats.total == 100
        assert stats.pending == 50
        assert stats.applied == 30
        assert stats.rejected == 20
        assert stats.by_severity["warning"] == 35
        assert stats.by_pass_type["line"] == 25
        assert stats.by_suggestion_type["grammar"] == 50

    def test_to_dict(self):
        """Test conversion to dictionary."""
        stats = SuggestionStats(total=10, pending=5, applied=3, rejected=2)
        result = stats.to_dict()

        assert isinstance(result, dict)
        assert result["total"] == 10
        assert result["pending"] == 5
        assert result["applied"] == 3
        assert result["rejected"] == 2
        assert "by_severity" in result
        assert "by_pass_type" in result
        assert "by_suggestion_type" in result

    def test_post_init_none_values(self):
        """Test __post_init__ handles None values."""
        stats = SuggestionStats(by_severity=None, by_pass_type=None, by_suggestion_type=None)
        assert stats.by_severity == {"info": 0, "warning": 0, "error": 0}
        assert stats.by_pass_type == {"structural": 0, "line": 0, "copy": 0, "proofread": 0}
        assert stats.by_suggestion_type == {}


# =============================================================================
# SuggestionFilter Tests
# =============================================================================


class TestSuggestionFilter:
    """Tests for SuggestionFilter dataclass."""

    def test_default_values(self):
        """Test all default values are None."""
        filter = SuggestionFilter()
        assert filter.chapter_number is None
        assert filter.pass_type is None
        assert filter.suggestion_type is None
        assert filter.severity is None
        assert filter.status is None
        assert filter.min_confidence is None

    def test_custom_values(self):
        """Test custom filter values."""
        filter = SuggestionFilter(
            chapter_number=5,
            pass_type="line",
            suggestion_type="grammar",
            severity="warning",
            status="pending",
            min_confidence=0.8,
        )
        assert filter.chapter_number == 5
        assert filter.pass_type == "line"
        assert filter.suggestion_type == "grammar"
        assert filter.severity == "warning"
        assert filter.status == "pending"
        assert filter.min_confidence == 0.8


# =============================================================================
# SuggestionService Tests
# =============================================================================


class TestSuggestionService:
    """Tests for SuggestionService."""

    @pytest.fixture
    def mock_db(self):
        """Create a mock database session."""
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.delete = AsyncMock()
        db.execute = AsyncMock()
        return db

    @pytest.fixture
    def service(self, mock_db):
        """Create a SuggestionService instance."""
        return SuggestionService(mock_db)

    @pytest.fixture
    def sample_project_id(self):
        """Sample project UUID."""
        return uuid4()

    @pytest.fixture
    def sample_suggestion_id(self):
        """Sample suggestion UUID."""
        return uuid4()

    # -------------------------------------------------------------------------
    # create_suggestion tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_create_suggestion_basic(self, service, mock_db, sample_project_id):
        """Test creating a basic suggestion."""
        await service.create_suggestion(
            project_id=sample_project_id,
            chapter_number=1,
            pass_type="line",
            suggestion_type="grammar",
            explanation="Missing comma",
        )

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_suggestion_all_fields(self, service, mock_db, sample_project_id):
        """Test creating a suggestion with all fields."""
        await service.create_suggestion(
            project_id=sample_project_id,
            chapter_number=5,
            pass_type="copy",
            suggestion_type="passive_voice",
            explanation="Consider active voice",
            severity="warning",
            original_text="was written",
            suggested_text="wrote",
            start_position=100,
            end_position=111,
            confidence=0.9,
        )

        mock_db.add.assert_called_once()
        added_suggestion = mock_db.add.call_args[0][0]
        assert added_suggestion.project_id == sample_project_id
        assert added_suggestion.chapter_number == 5
        assert added_suggestion.pass_type == "copy"
        assert added_suggestion.suggestion_type == "passive_voice"
        assert added_suggestion.severity == "warning"
        assert added_suggestion.original_text == "was written"
        assert added_suggestion.suggested_text == "wrote"
        assert added_suggestion.start_position == 100
        assert added_suggestion.end_position == 111
        assert float(added_suggestion.confidence) == 0.9
        assert added_suggestion.status == "pending"

    @pytest.mark.asyncio
    async def test_create_suggestion_default_values(self, service, mock_db, sample_project_id):
        """Test suggestion defaults are applied."""
        await service.create_suggestion(
            project_id=sample_project_id,
            chapter_number=1,
            pass_type="proofread",
            suggestion_type="typo",
            explanation="Typo found",
        )

        added_suggestion = mock_db.add.call_args[0][0]
        assert added_suggestion.severity == "info"
        assert added_suggestion.original_text == ""
        assert added_suggestion.suggested_text == ""
        assert added_suggestion.start_position == 0
        assert added_suggestion.end_position == 0
        assert float(added_suggestion.confidence) == 0.5
        assert added_suggestion.status == "pending"

    # -------------------------------------------------------------------------
    # get_suggestion tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_get_suggestion_found(self, service, mock_db, sample_suggestion_id):
        """Test getting an existing suggestion."""
        mock_suggestion = MagicMock(spec=Suggestion)
        mock_suggestion.id = sample_suggestion_id
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_suggestion
        mock_db.execute.return_value = mock_result

        result = await service.get_suggestion(sample_suggestion_id)

        assert result == mock_suggestion
        mock_db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_suggestion_not_found(self, service, mock_db, sample_suggestion_id):
        """Test getting a non-existent suggestion."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        result = await service.get_suggestion(sample_suggestion_id)

        assert result is None

    # -------------------------------------------------------------------------
    # get_suggestions tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_get_suggestions_no_filter(self, service, mock_db, sample_project_id):
        """Test getting suggestions without filters."""
        mock_suggestions = [MagicMock(spec=Suggestion) for _ in range(3)]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_suggestions
        mock_db.execute.return_value = mock_result

        result = await service.get_suggestions(sample_project_id)

        assert len(result) == 3
        mock_db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_suggestions_with_filters(self, service, mock_db, sample_project_id):
        """Test getting suggestions with filters."""
        filters = SuggestionFilter(
            chapter_number=1,
            pass_type="line",
            suggestion_type="grammar",
            severity="warning",
            status="pending",
            min_confidence=0.7,
        )
        mock_suggestions = [MagicMock(spec=Suggestion)]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_suggestions
        mock_db.execute.return_value = mock_result

        result = await service.get_suggestions(sample_project_id, filters=filters)

        assert len(result) == 1
        mock_db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_suggestions_with_pagination(self, service, mock_db, sample_project_id):
        """Test getting suggestions with pagination."""
        mock_suggestions = [MagicMock(spec=Suggestion) for _ in range(5)]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_suggestions
        mock_db.execute.return_value = mock_result

        result = await service.get_suggestions(
            sample_project_id,
            limit=5,
            offset=10,
        )

        assert len(result) == 5

    @pytest.mark.asyncio
    async def test_get_suggestions_empty(self, service, mock_db, sample_project_id):
        """Test getting suggestions when none exist."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        result = await service.get_suggestions(sample_project_id)

        assert result == []

    # -------------------------------------------------------------------------
    # apply_suggestion tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_apply_suggestion_success(self, service, mock_db, sample_suggestion_id):
        """Test successfully applying a suggestion."""
        mock_suggestion = MagicMock(spec=Suggestion)
        mock_suggestion.status = "pending"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_suggestion
        mock_db.execute.return_value = mock_result

        success, message = await service.apply_suggestion(sample_suggestion_id)

        assert success is True
        assert message == "Suggestion applied"
        assert mock_suggestion.status == "applied"
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_apply_suggestion_not_found(self, service, mock_db, sample_suggestion_id):
        """Test applying a non-existent suggestion."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        success, message = await service.apply_suggestion(sample_suggestion_id)

        assert success is False
        assert message == "Suggestion not found"

    @pytest.mark.asyncio
    async def test_apply_suggestion_already_applied(self, service, mock_db, sample_suggestion_id):
        """Test applying an already applied suggestion."""
        mock_suggestion = MagicMock(spec=Suggestion)
        mock_suggestion.status = "applied"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_suggestion
        mock_db.execute.return_value = mock_result

        success, message = await service.apply_suggestion(sample_suggestion_id)

        assert success is False
        assert message == "Suggestion already applied"

    @pytest.mark.asyncio
    async def test_apply_suggestion_rejected(self, service, mock_db, sample_suggestion_id):
        """Test applying a rejected suggestion."""
        mock_suggestion = MagicMock(spec=Suggestion)
        mock_suggestion.status = "rejected"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_suggestion
        mock_db.execute.return_value = mock_result

        success, message = await service.apply_suggestion(sample_suggestion_id)

        assert success is False
        assert message == "Cannot apply rejected suggestion"

    # -------------------------------------------------------------------------
    # reject_suggestion tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_reject_suggestion_success(self, service, mock_db, sample_suggestion_id):
        """Test successfully rejecting a suggestion."""
        mock_suggestion = MagicMock(spec=Suggestion)
        mock_suggestion.status = "pending"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_suggestion
        mock_db.execute.return_value = mock_result

        success, message = await service.reject_suggestion(sample_suggestion_id)

        assert success is True
        assert message == "Suggestion rejected"
        assert mock_suggestion.status == "rejected"
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_reject_suggestion_not_found(self, service, mock_db, sample_suggestion_id):
        """Test rejecting a non-existent suggestion."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        success, message = await service.reject_suggestion(sample_suggestion_id)

        assert success is False
        assert message == "Suggestion not found"

    @pytest.mark.asyncio
    async def test_reject_suggestion_already_rejected(self, service, mock_db, sample_suggestion_id):
        """Test rejecting an already rejected suggestion."""
        mock_suggestion = MagicMock(spec=Suggestion)
        mock_suggestion.status = "rejected"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_suggestion
        mock_db.execute.return_value = mock_result

        success, message = await service.reject_suggestion(sample_suggestion_id)

        assert success is False
        assert message == "Suggestion already rejected"

    @pytest.mark.asyncio
    async def test_reject_suggestion_applied(self, service, mock_db, sample_suggestion_id):
        """Test rejecting an applied suggestion."""
        mock_suggestion = MagicMock(spec=Suggestion)
        mock_suggestion.status = "applied"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_suggestion
        mock_db.execute.return_value = mock_result

        success, message = await service.reject_suggestion(sample_suggestion_id)

        assert success is False
        assert message == "Cannot reject applied suggestion"

    # -------------------------------------------------------------------------
    # delete_suggestion tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_delete_suggestion_success(self, service, mock_db, sample_suggestion_id):
        """Test successfully deleting a suggestion."""
        mock_suggestion = MagicMock(spec=Suggestion)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_suggestion
        mock_db.execute.return_value = mock_result

        result = await service.delete_suggestion(sample_suggestion_id)

        assert result is True
        mock_db.delete.assert_called_once_with(mock_suggestion)
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_suggestion_not_found(self, service, mock_db, sample_suggestion_id):
        """Test deleting a non-existent suggestion."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        result = await service.delete_suggestion(sample_suggestion_id)

        assert result is False
        mock_db.delete.assert_not_called()

    # -------------------------------------------------------------------------
    # get_stats tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_get_stats_basic(self, service, mock_db, sample_project_id):
        """Test getting basic statistics."""
        # Mock total count
        mock_total_result = MagicMock()
        mock_total_result.scalar.return_value = 100

        # Mock status counts
        mock_status_result = MagicMock()
        mock_status_result.all.return_value = [
            ("pending", 50),
            ("applied", 30),
            ("rejected", 20),
        ]

        # Mock severity counts
        mock_severity_result = MagicMock()
        mock_severity_result.all.return_value = [
            ("info", 40),
            ("warning", 35),
            ("error", 25),
        ]

        # Mock pass type counts
        mock_pass_result = MagicMock()
        mock_pass_result.all.return_value = [
            ("structural", 25),
            ("line", 25),
            ("copy", 25),
            ("proofread", 25),
        ]

        # Mock suggestion type counts
        mock_type_result = MagicMock()
        mock_type_result.all.return_value = [
            ("grammar", 50),
            ("spelling", 50),
        ]

        mock_db.execute.side_effect = [
            mock_total_result,
            mock_status_result,
            mock_severity_result,
            mock_pass_result,
            mock_type_result,
        ]

        stats = await service.get_stats(sample_project_id)

        assert stats.total == 100
        assert stats.pending == 50
        assert stats.applied == 30
        assert stats.rejected == 20
        assert stats.by_severity["info"] == 40
        assert stats.by_severity["warning"] == 35
        assert stats.by_severity["error"] == 25
        assert stats.by_pass_type["structural"] == 25
        assert stats.by_suggestion_type["grammar"] == 50

    @pytest.mark.asyncio
    async def test_get_stats_with_chapter_filter(self, service, mock_db, sample_project_id):
        """Test getting statistics for a specific chapter."""
        mock_total_result = MagicMock()
        mock_total_result.scalar.return_value = 10

        mock_status_result = MagicMock()
        mock_status_result.all.return_value = [("pending", 10)]

        mock_severity_result = MagicMock()
        mock_severity_result.all.return_value = [("info", 10)]

        mock_pass_result = MagicMock()
        mock_pass_result.all.return_value = [("line", 10)]

        mock_type_result = MagicMock()
        mock_type_result.all.return_value = [("grammar", 10)]

        mock_db.execute.side_effect = [
            mock_total_result,
            mock_status_result,
            mock_severity_result,
            mock_pass_result,
            mock_type_result,
        ]

        stats = await service.get_stats(sample_project_id, chapter_number=1)

        assert stats.total == 10
        assert mock_db.execute.call_count == 5

    @pytest.mark.asyncio
    async def test_get_stats_empty(self, service, mock_db, sample_project_id):
        """Test getting statistics when no suggestions exist."""
        mock_total_result = MagicMock()
        mock_total_result.scalar.return_value = 0

        mock_status_result = MagicMock()
        mock_status_result.all.return_value = []

        mock_severity_result = MagicMock()
        mock_severity_result.all.return_value = []

        mock_pass_result = MagicMock()
        mock_pass_result.all.return_value = []

        mock_type_result = MagicMock()
        mock_type_result.all.return_value = []

        mock_db.execute.side_effect = [
            mock_total_result,
            mock_status_result,
            mock_severity_result,
            mock_pass_result,
            mock_type_result,
        ]

        stats = await service.get_stats(sample_project_id)

        assert stats.total == 0
        assert stats.pending == 0
        assert stats.applied == 0
        assert stats.rejected == 0

    # -------------------------------------------------------------------------
    # bulk_create_suggestions tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_bulk_create_suggestions(self, service, mock_db, sample_project_id):
        """Test bulk creating suggestions."""
        suggestions_data = [
            {
                "pass_type": "line",
                "suggestion_type": "grammar",
                "explanation": "Missing comma",
            },
            {
                "pass_type": "copy",
                "suggestion_type": "passive_voice",
                "severity": "warning",
                "explanation": "Use active voice",
            },
        ]

        result = await service.bulk_create_suggestions(
            sample_project_id,
            chapter_number=1,
            suggestions=suggestions_data,
        )

        assert len(result) == 2
        assert mock_db.add.call_count == 2
        mock_db.commit.assert_called_once()
        assert mock_db.refresh.call_count == 2

    @pytest.mark.asyncio
    async def test_bulk_create_suggestions_empty(self, service, mock_db, sample_project_id):
        """Test bulk creating with empty list."""
        result = await service.bulk_create_suggestions(
            sample_project_id,
            chapter_number=1,
            suggestions=[],
        )

        assert result == []
        mock_db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_bulk_create_suggestions_defaults(self, service, mock_db, sample_project_id):
        """Test bulk create applies default values."""
        suggestions_data = [
            {"explanation": "Test suggestion"},  # Minimal data
        ]

        await service.bulk_create_suggestions(
            sample_project_id,
            chapter_number=1,
            suggestions=suggestions_data,
        )

        added_suggestion = mock_db.add.call_args[0][0]
        assert added_suggestion.pass_type == ""
        assert added_suggestion.suggestion_type == ""
        assert added_suggestion.severity == "info"
        assert float(added_suggestion.confidence) == 0.5
        assert added_suggestion.status == "pending"

    # -------------------------------------------------------------------------
    # clear_chapter_suggestions tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_clear_chapter_suggestions(self, service, mock_db, sample_project_id):
        """Test clearing all suggestions for a chapter."""
        mock_suggestions = [MagicMock(spec=Suggestion) for _ in range(5)]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_suggestions
        mock_db.execute.return_value = mock_result

        count = await service.clear_chapter_suggestions(sample_project_id, chapter_number=1)

        assert count == 5
        assert mock_db.delete.call_count == 5
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_clear_chapter_suggestions_with_pass_type(
        self, service, mock_db, sample_project_id
    ):
        """Test clearing suggestions filtered by pass type."""
        mock_suggestions = [MagicMock(spec=Suggestion) for _ in range(2)]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_suggestions
        mock_db.execute.return_value = mock_result

        count = await service.clear_chapter_suggestions(
            sample_project_id,
            chapter_number=1,
            pass_type="line",
        )

        assert count == 2

    @pytest.mark.asyncio
    async def test_clear_chapter_suggestions_empty(self, service, mock_db, sample_project_id):
        """Test clearing when no suggestions exist."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        count = await service.clear_chapter_suggestions(sample_project_id, chapter_number=1)

        assert count == 0
        mock_db.delete.assert_not_called()


# =============================================================================
# EditHistoryService Tests
# =============================================================================


class TestEditHistoryService:
    """Tests for EditHistoryService."""

    @pytest.fixture
    def mock_db(self):
        """Create a mock database session."""
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock()
        return db

    @pytest.fixture
    def service(self, mock_db):
        """Create an EditHistoryService instance."""
        return EditHistoryService(mock_db)

    @pytest.fixture
    def sample_project_id(self):
        """Sample project UUID."""
        return uuid4()

    # -------------------------------------------------------------------------
    # create_history_entry tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_create_history_entry_basic(self, service, mock_db, sample_project_id):
        """Test creating a basic history entry."""
        await service.create_history_entry(
            project_id=sample_project_id,
            chapter_number=1,
            pass_type="line",
        )

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_history_entry_all_fields(self, service, mock_db, sample_project_id):
        """Test creating a history entry with all fields."""
        await service.create_history_entry(
            project_id=sample_project_id,
            chapter_number=5,
            pass_type="structural",
            suggestions_generated=10,
            suggestions_applied=7,
            suggestions_rejected=3,
            content_before="Original text",
            content_after="Edited text",
        )

        added_entry = mock_db.add.call_args[0][0]
        assert added_entry.project_id == sample_project_id
        assert added_entry.chapter_number == 5
        assert added_entry.pass_type == "structural"
        assert added_entry.suggestions_generated == 10
        assert added_entry.suggestions_applied == 7
        assert added_entry.suggestions_rejected == 3
        assert added_entry.content_before == "Original text"
        assert added_entry.content_after == "Edited text"

    # -------------------------------------------------------------------------
    # get_history tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_get_history_no_filter(self, service, mock_db, sample_project_id):
        """Test getting history without filters."""
        mock_entries = [MagicMock(spec=EditHistory) for _ in range(3)]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_entries
        mock_db.execute.return_value = mock_result

        result = await service.get_history(sample_project_id)

        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_get_history_with_chapter_filter(self, service, mock_db, sample_project_id):
        """Test getting history for a specific chapter."""
        mock_entries = [MagicMock(spec=EditHistory)]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_entries
        mock_db.execute.return_value = mock_result

        result = await service.get_history(sample_project_id, chapter_number=1)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_get_history_with_pass_type_filter(self, service, mock_db, sample_project_id):
        """Test getting history filtered by pass type."""
        mock_entries = [MagicMock(spec=EditHistory) for _ in range(2)]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_entries
        mock_db.execute.return_value = mock_result

        result = await service.get_history(sample_project_id, pass_type="line")

        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_get_history_with_limit(self, service, mock_db, sample_project_id):
        """Test getting history with custom limit."""
        mock_entries = [MagicMock(spec=EditHistory) for _ in range(10)]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_entries
        mock_db.execute.return_value = mock_result

        result = await service.get_history(sample_project_id, limit=10)

        assert len(result) == 10

    @pytest.mark.asyncio
    async def test_get_history_empty(self, service, mock_db, sample_project_id):
        """Test getting history when none exists."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        result = await service.get_history(sample_project_id)

        assert result == []

    # -------------------------------------------------------------------------
    # get_latest_entry tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_get_latest_entry_found(self, service, mock_db, sample_project_id):
        """Test getting the latest entry."""
        mock_entry = MagicMock(spec=EditHistory)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_entry
        mock_db.execute.return_value = mock_result

        result = await service.get_latest_entry(sample_project_id, chapter_number=1)

        assert result == mock_entry

    @pytest.mark.asyncio
    async def test_get_latest_entry_not_found(self, service, mock_db, sample_project_id):
        """Test getting latest entry when none exists."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        result = await service.get_latest_entry(sample_project_id, chapter_number=1)

        assert result is None

    @pytest.mark.asyncio
    async def test_get_latest_entry_with_pass_type(self, service, mock_db, sample_project_id):
        """Test getting latest entry filtered by pass type."""
        mock_entry = MagicMock(spec=EditHistory)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_entry
        mock_db.execute.return_value = mock_result

        result = await service.get_latest_entry(
            sample_project_id,
            chapter_number=1,
            pass_type="structural",
        )

        assert result == mock_entry

    # -------------------------------------------------------------------------
    # get_summary tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_get_summary_basic(self, service, mock_db, sample_project_id):
        """Test getting edit history summary."""
        # Mock total passes count
        mock_total_result = MagicMock()
        mock_total_result.scalar.return_value = 20

        # Mock sum of suggestions
        mock_sum_result = MagicMock()
        mock_sum_result.one.return_value = (100, 70, 30)  # generated, applied, rejected

        # Mock pass type counts
        mock_pass_result = MagicMock()
        mock_pass_result.all.return_value = [
            ("structural", 5),
            ("line", 5),
            ("copy", 5),
            ("proofread", 5),
        ]

        mock_db.execute.side_effect = [
            mock_total_result,
            mock_sum_result,
            mock_pass_result,
        ]

        result = await service.get_summary(sample_project_id)

        assert result["total_passes"] == 20
        assert result["total_suggestions_generated"] == 100
        assert result["total_suggestions_applied"] == 70
        assert result["total_suggestions_rejected"] == 30
        assert result["passes_by_type"]["structural"] == 5

    @pytest.mark.asyncio
    async def test_get_summary_with_chapter(self, service, mock_db, sample_project_id):
        """Test getting summary for a specific chapter."""
        mock_total_result = MagicMock()
        mock_total_result.scalar.return_value = 4

        mock_sum_result = MagicMock()
        mock_sum_result.one.return_value = (20, 15, 5)

        mock_pass_result = MagicMock()
        mock_pass_result.all.return_value = [("line", 4)]

        mock_db.execute.side_effect = [
            mock_total_result,
            mock_sum_result,
            mock_pass_result,
        ]

        result = await service.get_summary(sample_project_id, chapter_number=1)

        assert result["total_passes"] == 4
        assert result["total_suggestions_generated"] == 20

    @pytest.mark.asyncio
    async def test_get_summary_empty(self, service, mock_db, sample_project_id):
        """Test getting summary when no history exists."""
        mock_total_result = MagicMock()
        mock_total_result.scalar.return_value = 0

        mock_sum_result = MagicMock()
        mock_sum_result.one.return_value = (None, None, None)

        mock_pass_result = MagicMock()
        mock_pass_result.all.return_value = []

        mock_db.execute.side_effect = [
            mock_total_result,
            mock_sum_result,
            mock_pass_result,
        ]

        result = await service.get_summary(sample_project_id)

        assert result["total_passes"] == 0
        assert result["total_suggestions_generated"] == 0
        assert result["total_suggestions_applied"] == 0
        assert result["total_suggestions_rejected"] == 0
        assert result["passes_by_type"] == {}


# =============================================================================
# UserPreferenceLearner Tests
# =============================================================================


class TestUserPreferenceLearner:
    """Tests for UserPreferenceLearner."""

    @pytest.fixture
    def mock_db(self):
        """Create a mock database session."""
        db = AsyncMock()
        db.execute = AsyncMock()
        return db

    @pytest.fixture
    def learner(self, mock_db):
        """Create a UserPreferenceLearner instance."""
        return UserPreferenceLearner(mock_db)

    @pytest.fixture
    def sample_project_id(self):
        """Sample project UUID."""
        return uuid4()

    # -------------------------------------------------------------------------
    # get_acceptance_rate tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_get_acceptance_rate_high(self, learner, mock_db, sample_project_id):
        """Test acceptance rate calculation with high acceptance."""
        # Mock applied count
        mock_applied_result = MagicMock()
        mock_applied_result.scalar.return_value = 80

        # Mock rejected count
        mock_rejected_result = MagicMock()
        mock_rejected_result.scalar.return_value = 20

        mock_db.execute.side_effect = [mock_applied_result, mock_rejected_result]

        rate = await learner.get_acceptance_rate(sample_project_id)

        assert rate == 0.8  # 80 / (80 + 20)

    @pytest.mark.asyncio
    async def test_get_acceptance_rate_low(self, learner, mock_db, sample_project_id):
        """Test acceptance rate calculation with low acceptance."""
        mock_applied_result = MagicMock()
        mock_applied_result.scalar.return_value = 10

        mock_rejected_result = MagicMock()
        mock_rejected_result.scalar.return_value = 90

        mock_db.execute.side_effect = [mock_applied_result, mock_rejected_result]

        rate = await learner.get_acceptance_rate(sample_project_id)

        assert rate == 0.1  # 10 / (10 + 90)

    @pytest.mark.asyncio
    async def test_get_acceptance_rate_no_data(self, learner, mock_db, sample_project_id):
        """Test acceptance rate with no data returns default."""
        mock_applied_result = MagicMock()
        mock_applied_result.scalar.return_value = 0

        mock_rejected_result = MagicMock()
        mock_rejected_result.scalar.return_value = 0

        mock_db.execute.side_effect = [mock_applied_result, mock_rejected_result]

        rate = await learner.get_acceptance_rate(sample_project_id)

        assert rate == 0.5  # Default when no data

    @pytest.mark.asyncio
    async def test_get_acceptance_rate_with_suggestion_type(
        self, learner, mock_db, sample_project_id
    ):
        """Test acceptance rate filtered by suggestion type."""
        mock_applied_result = MagicMock()
        mock_applied_result.scalar.return_value = 50

        mock_rejected_result = MagicMock()
        mock_rejected_result.scalar.return_value = 50

        mock_db.execute.side_effect = [mock_applied_result, mock_rejected_result]

        rate = await learner.get_acceptance_rate(
            sample_project_id,
            suggestion_type="grammar",
        )

        assert rate == 0.5

    @pytest.mark.asyncio
    async def test_get_acceptance_rate_with_pass_type(self, learner, mock_db, sample_project_id):
        """Test acceptance rate filtered by pass type."""
        mock_applied_result = MagicMock()
        mock_applied_result.scalar.return_value = 60

        mock_rejected_result = MagicMock()
        mock_rejected_result.scalar.return_value = 40

        mock_db.execute.side_effect = [mock_applied_result, mock_rejected_result]

        rate = await learner.get_acceptance_rate(
            sample_project_id,
            pass_type="line",
        )

        assert rate == 0.6

    # -------------------------------------------------------------------------
    # get_preference_profile tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_get_preference_profile(self, learner, mock_db, sample_project_id):
        """Test getting full preference profile."""
        # Mock suggestion type rates
        mock_type_result = MagicMock()
        mock_type_result.all.return_value = [
            ("grammar", 80, 20),  # type, applied, rejected
            ("spelling", 90, 10),
            ("pacing", 30, 70),
        ]

        # Mock severity rates
        mock_severity_result = MagicMock()
        mock_severity_result.all.return_value = [
            ("info", 50, 50),
            ("warning", 70, 30),
            ("error", 95, 5),
        ]

        mock_db.execute.side_effect = [mock_type_result, mock_severity_result]

        profile = await learner.get_preference_profile(sample_project_id)

        assert "by_suggestion_type" in profile
        assert "by_severity" in profile

        # Check suggestion type rates
        assert profile["by_suggestion_type"]["grammar"]["applied"] == 80
        assert profile["by_suggestion_type"]["grammar"]["rejected"] == 20
        assert profile["by_suggestion_type"]["grammar"]["acceptance_rate"] == 0.8

        assert profile["by_suggestion_type"]["spelling"]["acceptance_rate"] == 0.9
        assert profile["by_suggestion_type"]["pacing"]["acceptance_rate"] == 0.3

        # Check severity rates
        assert profile["by_severity"]["info"]["acceptance_rate"] == 0.5
        assert profile["by_severity"]["warning"]["acceptance_rate"] == 0.7
        assert profile["by_severity"]["error"]["acceptance_rate"] == 0.95

    @pytest.mark.asyncio
    async def test_get_preference_profile_empty(self, learner, mock_db, sample_project_id):
        """Test preference profile with no data."""
        mock_type_result = MagicMock()
        mock_type_result.all.return_value = []

        mock_severity_result = MagicMock()
        mock_severity_result.all.return_value = []

        mock_db.execute.side_effect = [mock_type_result, mock_severity_result]

        profile = await learner.get_preference_profile(sample_project_id)

        assert profile["by_suggestion_type"] == {}
        assert profile["by_severity"] == {}

    @pytest.mark.asyncio
    async def test_get_preference_profile_skips_zero_total(
        self, learner, mock_db, sample_project_id
    ):
        """Test preference profile skips entries with zero total."""
        mock_type_result = MagicMock()
        mock_type_result.all.return_value = [
            ("grammar", 0, 0),  # Should be skipped
            ("spelling", 90, 10),  # Should be included
        ]

        mock_severity_result = MagicMock()
        mock_severity_result.all.return_value = []

        mock_db.execute.side_effect = [mock_type_result, mock_severity_result]

        profile = await learner.get_preference_profile(sample_project_id)

        assert "grammar" not in profile["by_suggestion_type"]
        assert "spelling" in profile["by_suggestion_type"]

    # -------------------------------------------------------------------------
    # should_show_suggestion tests
    # -------------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_should_show_high_acceptance_low_confidence(
        self, learner, mock_db, sample_project_id
    ):
        """Test showing suggestion with high acceptance rate and low confidence."""
        # Acceptance rate = 0.8 (high), so threshold is 0.5
        mock_applied_result = MagicMock()
        mock_applied_result.scalar.return_value = 80
        mock_rejected_result = MagicMock()
        mock_rejected_result.scalar.return_value = 20
        mock_db.execute.side_effect = [mock_applied_result, mock_rejected_result]

        result = await learner.should_show_suggestion(
            sample_project_id,
            suggestion_type="grammar",
            confidence=0.6,
        )

        assert result is True  # 0.6 >= 0.5 threshold

    @pytest.mark.asyncio
    async def test_should_show_medium_acceptance_medium_confidence(
        self, learner, mock_db, sample_project_id
    ):
        """Test showing suggestion with medium acceptance rate."""
        # Acceptance rate = 0.4 (medium), so threshold is 0.7
        mock_applied_result = MagicMock()
        mock_applied_result.scalar.return_value = 40
        mock_rejected_result = MagicMock()
        mock_rejected_result.scalar.return_value = 60
        mock_db.execute.side_effect = [mock_applied_result, mock_rejected_result]

        # 0.65 < 0.7 threshold
        result = await learner.should_show_suggestion(
            sample_project_id,
            suggestion_type="pacing",
            confidence=0.65,
        )

        assert result is False

    @pytest.mark.asyncio
    async def test_should_show_medium_acceptance_high_confidence(
        self, learner, mock_db, sample_project_id
    ):
        """Test showing suggestion with medium acceptance and high confidence."""
        # Acceptance rate = 0.4 (medium), threshold is 0.7
        mock_applied_result = MagicMock()
        mock_applied_result.scalar.return_value = 40
        mock_rejected_result = MagicMock()
        mock_rejected_result.scalar.return_value = 60
        mock_db.execute.side_effect = [mock_applied_result, mock_rejected_result]

        result = await learner.should_show_suggestion(
            sample_project_id,
            suggestion_type="pacing",
            confidence=0.75,
        )

        assert result is True  # 0.75 >= 0.7 threshold

    @pytest.mark.asyncio
    async def test_should_show_low_acceptance_requires_very_high_confidence(
        self, learner, mock_db, sample_project_id
    ):
        """Test low acceptance rate requires very high confidence."""
        # Acceptance rate = 0.2 (low), threshold is 0.9
        mock_applied_result = MagicMock()
        mock_applied_result.scalar.return_value = 20
        mock_rejected_result = MagicMock()
        mock_rejected_result.scalar.return_value = 80
        mock_db.execute.side_effect = [mock_applied_result, mock_rejected_result]

        result = await learner.should_show_suggestion(
            sample_project_id,
            suggestion_type="style",
            confidence=0.85,
        )

        assert result is False  # 0.85 < 0.9 threshold

    @pytest.mark.asyncio
    async def test_should_show_low_acceptance_very_high_confidence(
        self, learner, mock_db, sample_project_id
    ):
        """Test low acceptance rate with very high confidence passes."""
        # Acceptance rate = 0.2 (low), threshold is 0.9
        mock_applied_result = MagicMock()
        mock_applied_result.scalar.return_value = 20
        mock_rejected_result = MagicMock()
        mock_rejected_result.scalar.return_value = 80
        mock_db.execute.side_effect = [mock_applied_result, mock_rejected_result]

        result = await learner.should_show_suggestion(
            sample_project_id,
            suggestion_type="style",
            confidence=0.95,
        )

        assert result is True  # 0.95 >= 0.9 threshold

    @pytest.mark.asyncio
    async def test_should_show_no_data_uses_default(self, learner, mock_db, sample_project_id):
        """Test no data uses default 50% acceptance rate."""
        # No data = 0.5 acceptance rate, threshold is 0.5
        mock_applied_result = MagicMock()
        mock_applied_result.scalar.return_value = 0
        mock_rejected_result = MagicMock()
        mock_rejected_result.scalar.return_value = 0
        mock_db.execute.side_effect = [mock_applied_result, mock_rejected_result]

        result = await learner.should_show_suggestion(
            sample_project_id,
            suggestion_type="new_type",
            confidence=0.5,
        )

        assert result is True  # 0.5 >= 0.5 threshold
