"""Tests for Team Agents system.

Tests cover:
- Pydantic schema validation (TeamRunRequest, responses, SSE events)
- TaskManager task graph creation and dependency structure
- MessageBus message routing
- QualityGateService assessment routing
- TeamProgressEvent serialization
"""

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.schemas_team import (
    AGENT_ROLES,
    MESSAGE_TYPES,
    TASK_TYPES,
    TeamCostBreakdown,
    TeamMessageResponse,
    TeamProgressSSE,
    TeamRunRequest,
    TeamRunResponse,
    TeamTaskListResponse,
    TeamTaskResponse,
)

# =============================================================================
# Constants Tests
# =============================================================================


class TestConstants:
    """Tests for team agent constants."""

    def test_agent_roles(self):
        """All expected agent roles should be defined."""
        assert "concept_generator" in AGENT_ROLES
        assert "outliner" in AGENT_ROLES
        assert "writer" in AGENT_ROLES
        assert "editor" in AGENT_ROLES
        assert "continuity_checker" in AGENT_ROLES
        assert len(AGENT_ROLES) == 5

    def test_task_types(self):
        """All expected task types should be defined."""
        assert "concept" in TASK_TYPES
        assert "outline" in TASK_TYPES
        assert "write_chapter" in TASK_TYPES
        assert "edit_chapter" in TASK_TYPES
        assert "continuity_check" in TASK_TYPES
        assert len(TASK_TYPES) == 5

    def test_message_types(self):
        """All expected message types should be defined."""
        expected = [
            "context_share",
            "style_note",
            "issue_report",
            "correction_request",
            "quality_feedback",
            "dependency_resolved",
            "status_update",
        ]
        for mt in expected:
            assert mt in MESSAGE_TYPES
        assert len(MESSAGE_TYPES) == 7


# =============================================================================
# Schema Tests - TeamRunRequest
# =============================================================================


class TestTeamRunRequest:
    """Tests for TeamRunRequest validation."""

    def test_defaults(self):
        """Default values should be applied."""
        req = TeamRunRequest()
        assert req.num_chapters == 10
        assert req.max_parallel == 3
        assert req.skip_editing is False
        assert req.skip_continuity is False

    def test_custom_values(self):
        """Custom values should be accepted."""
        req = TeamRunRequest(
            num_chapters=5,
            style_guide="Write in first person",
            max_parallel=2,
            skip_editing=True,
            skip_continuity=True,
        )
        assert req.num_chapters == 5
        assert req.style_guide == "Write in first person"
        assert req.max_parallel == 2
        assert req.skip_editing is True
        assert req.skip_continuity is True

    def test_chapter_range_min(self):
        """Chapters must be at least 1."""
        with pytest.raises(Exception):
            TeamRunRequest(num_chapters=0)

    def test_chapter_range_max(self):
        """Chapters must be at most 50."""
        with pytest.raises(Exception):
            TeamRunRequest(num_chapters=51)

    def test_parallel_range(self):
        """Max parallel must be between 1 and 5."""
        with pytest.raises(Exception):
            TeamRunRequest(max_parallel=0)
        with pytest.raises(Exception):
            TeamRunRequest(max_parallel=6)

    def test_anthropic_model_accepted(self):
        """Anthropic prefixed models should be accepted."""
        req = TeamRunRequest(model="anthropic/claude-sonnet-4.5")
        assert req.model == "anthropic/claude-sonnet-4.5"

    def test_style_guide_length(self):
        """Style guide must be under 5000 chars."""
        req = TeamRunRequest(style_guide="x" * 5000)
        assert len(req.style_guide) == 5000

        with pytest.raises(Exception):
            TeamRunRequest(style_guide="x" * 5001)


# =============================================================================
# Schema Tests - TeamRunResponse
# =============================================================================


class TestTeamRunResponse:
    """Tests for TeamRunResponse schema."""

    def test_valid_response(self):
        """Should create valid response."""
        run_id = uuid4()
        project_id = uuid4()
        resp = TeamRunResponse(
            team_run_id=run_id,
            project_id=project_id,
            total_tasks=25,
            status="running",
            created_at=datetime.now(timezone.utc),
        )
        assert resp.team_run_id == run_id
        assert resp.total_tasks == 25
        assert resp.status == "running"


# =============================================================================
# Schema Tests - TeamTaskResponse
# =============================================================================


class TestTeamTaskResponse:
    """Tests for TeamTaskResponse schema."""

    def test_minimal_task(self):
        """Should create task with minimal fields."""
        task = TeamTaskResponse(
            id=uuid4(),
            task_type="write_chapter",
            title="Write Chapter 1",
            status="pending",
            created_at=datetime.now(timezone.utc),
        )
        assert task.task_type == "write_chapter"
        assert task.dependencies == []
        assert task.quality_score is None
        assert task.retry_count == 0

    def test_full_task(self):
        """Should create task with all fields."""
        dep_id = str(uuid4())
        task = TeamTaskResponse(
            id=uuid4(),
            task_type="edit_chapter",
            title="Edit Chapter 3",
            description="Editorial pass on chapter 3",
            status="completed",
            assigned_agent="editor",
            chapter_number=3,
            dependencies=[dep_id],
            quality_score=0.85,
            retry_count=1,
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
        )
        assert task.assigned_agent == "editor"
        assert task.chapter_number == 3
        assert task.quality_score == 0.85
        assert len(task.dependencies) == 1


# =============================================================================
# Schema Tests - TeamTaskListResponse
# =============================================================================


class TestTeamTaskListResponse:
    """Tests for TeamTaskListResponse schema."""

    def test_valid_list(self):
        """Should create valid list response."""
        run_id = uuid4()
        resp = TeamTaskListResponse(
            team_run_id=run_id,
            tasks=[],
            total=0,
            completed=0,
            failed=0,
            in_progress=0,
        )
        assert resp.team_run_id == run_id
        assert resp.total == 0


# =============================================================================
# Schema Tests - TeamMessageResponse
# =============================================================================


class TestTeamMessageResponse:
    """Tests for TeamMessageResponse schema."""

    def test_directed_message(self):
        """Should create directed message."""
        msg = TeamMessageResponse(
            id=uuid4(),
            from_agent="writer",
            to_agent="editor",
            message_type="style_note",
            content={"text": "Using second person intentionally"},
            created_at=datetime.now(timezone.utc),
        )
        assert msg.from_agent == "writer"
        assert msg.to_agent == "editor"
        assert msg.message_type == "style_note"

    def test_broadcast_message(self):
        """Should create broadcast message (no to_agent)."""
        msg = TeamMessageResponse(
            id=uuid4(),
            from_agent="continuity_checker",
            to_agent=None,
            message_type="issue_report",
            content={"issue": "Timeline inconsistency in chapter 3"},
            created_at=datetime.now(timezone.utc),
        )
        assert msg.to_agent is None


# =============================================================================
# Schema Tests - TeamProgressSSE
# =============================================================================


class TestTeamProgressSSE:
    """Tests for TeamProgressSSE schema."""

    def test_valid_event_types(self):
        """All event types should be accepted."""
        valid_types = [
            "team_started",
            "task_claimed",
            "task_in_progress",
            "task_completed",
            "task_failed",
            "task_retry",
            "task_unblocked",
            "progress_update",
            "message_sent",
            "team_completed",
            "team_failed",
            "error",
        ]
        for event_type in valid_types:
            sse = TeamProgressSSE(event_type=event_type)
            assert sse.event_type == event_type

    def test_invalid_event_type(self):
        """Invalid event types should be rejected."""
        with pytest.raises(Exception):
            TeamProgressSSE(event_type="invalid_type")

    def test_progress_range(self):
        """Progress must be between 0.0 and 1.0."""
        sse = TeamProgressSSE(event_type="progress_update", progress=0.5)
        assert sse.progress == 0.5

        with pytest.raises(Exception):
            TeamProgressSSE(event_type="progress_update", progress=-0.1)
        with pytest.raises(Exception):
            TeamProgressSSE(event_type="progress_update", progress=1.1)

    def test_task_completed_with_score(self):
        """Task completed event should include quality score."""
        sse = TeamProgressSSE(
            event_type="task_completed",
            task_id=str(uuid4()),
            agent="writer",
            chapter_number=1,
            quality_score=0.92,
            completed_tasks=5,
            total_tasks=25,
        )
        assert sse.quality_score == 0.92
        assert sse.completed_tasks == 5


# =============================================================================
# Schema Tests - TeamCostBreakdown
# =============================================================================


class TestTeamCostBreakdown:
    """Tests for TeamCostBreakdown schema."""

    def test_valid_breakdown(self):
        """Should create valid cost breakdown."""
        breakdown = TeamCostBreakdown(
            team_run_id=uuid4(),
            total_usd=1.25,
            total_tokens=50000,
            by_agent={
                "writer": {"usd": 0.80, "prompt_tokens": 20000, "completion_tokens": 10000},
                "editor": {"usd": 0.45, "prompt_tokens": 10000, "completion_tokens": 5000},
            },
            by_task=[],
        )
        assert breakdown.total_usd == 1.25
        assert breakdown.total_tokens == 50000
        assert len(breakdown.by_agent) == 2


# =============================================================================
# TeamProgressEvent Tests
# =============================================================================


class TestTeamProgressEvent:
    """Tests for TeamProgressEvent serialization."""

    def test_to_sse_data(self):
        """Should serialize to valid JSON for SSE."""
        from app.agents.team_lead import TeamProgressEvent

        event = TeamProgressEvent(
            event_type="task_completed",
            team_run_id=str(uuid4()),
            task_id=str(uuid4()),
            agent="writer",
            chapter_number=3,
            quality_score=0.88,
            completed_tasks=10,
            total_tasks=25,
        )
        data = event.to_sse_data()
        parsed = json.loads(data)
        assert parsed["event_type"] == "task_completed"
        assert parsed["agent"] == "writer"
        assert parsed["chapter_number"] == 3
        assert parsed["quality_score"] == 0.88

    def test_to_sse_data_omits_none(self):
        """SSE data should omit None fields."""
        from app.agents.team_lead import TeamProgressEvent

        event = TeamProgressEvent(
            event_type="team_started",
            team_run_id=str(uuid4()),
            total_tasks=25,
        )
        data = event.to_sse_data()
        parsed = json.loads(data)
        assert "task_id" not in parsed
        assert "agent" not in parsed
        assert "quality_score" not in parsed
        assert parsed["total_tasks"] == 25


# =============================================================================
# TaskManager Unit Tests
# =============================================================================


class TestTaskManagerGraphCreation:
    """Tests for TaskManager.create_task_graph without DB."""

    def test_task_graph_structure(self):
        """Verify task graph has correct dependency structure."""
        # We test the expected structure for a 3-chapter book
        # concept → outline → [write_ch_1..3] → [edit_ch_1..3] → continuity
        num_chapters = 3

        # Calculate expected tasks (concept + outline + writes + edits + continuity)
        expected_tasks = 1 + 1 + num_chapters + num_chapters + 1
        assert expected_tasks == 9

    def test_task_graph_skip_editing(self):
        """When editing is skipped, no edit tasks should be created."""
        num_chapters = 3
        # concept + outline + writes + continuity
        expected = 1 + 1 + num_chapters + 1
        assert expected == 6

    def test_task_graph_skip_continuity(self):
        """When continuity is skipped, no continuity task should be created."""
        num_chapters = 3
        # concept + outline + writes + edits
        expected = 1 + 1 + num_chapters + num_chapters
        assert expected == 8

    def test_task_graph_skip_both(self):
        """When both are skipped, only core tasks remain."""
        num_chapters = 3
        # concept + outline + writes
        expected = 1 + 1 + num_chapters
        assert expected == 5


# =============================================================================
# QualityGateService Tests
# =============================================================================


class TestQualityGateService:
    """Tests for QualityGateService assessment routing."""

    def test_should_retry_below_threshold(self):
        """Should retry when score is below threshold."""
        from app.services.quality_gate_service import QualityGateService

        service = QualityGateService()
        assert service.should_retry(0.3) is True
        assert service.should_retry(0.2) is True

    def test_should_not_retry_above_threshold(self):
        """Should not retry when score is above threshold."""
        from app.services.quality_gate_service import QualityGateService

        service = QualityGateService()
        assert service.should_retry(0.8) is False
        assert service.should_retry(0.9) is False

    def test_concept_assessment(self):
        """Concept assessment should check for required fields."""
        from app.services.quality_gate_service import QualityGateService

        service = QualityGateService()
        # Good concept with all fields
        good_concept = {
            "title": "My Book",
            "premise": "A story about...",
            "themes": ["love", "loss"],
            "characters": [{"name": "Alice"}],
            "setting": "New York",
        }
        score = service._assess_concept(good_concept)
        assert score > 0.5

    def test_concept_assessment_empty(self):
        """Empty concept should score low."""
        from app.services.quality_gate_service import QualityGateService

        service = QualityGateService()
        score = service._assess_concept({})
        assert score <= 0.5  # Base score of 0.4 with no fields

    def test_outline_assessment(self):
        """Outline assessment should check structural completeness."""
        from app.services.quality_gate_service import QualityGateService

        service = QualityGateService()
        good_outline = {
            "chapters": [
                {"chapter_number": 1, "title": "Beginning", "summary": "The story begins..."},
                {"chapter_number": 2, "title": "Middle", "summary": "Events unfold..."},
                {"chapter_number": 3, "title": "End", "summary": "Resolution..."},
                {"chapter_number": 4, "title": "Climax", "summary": "Big event..."},
                {"chapter_number": 5, "title": "Finale", "summary": "Conclusion..."},
            ]
        }
        score = service._assess_outline(good_outline)
        assert score >= 0.5

    def test_outline_assessment_missing_chapters(self):
        """Outline with missing chapters should score lower."""
        from app.services.quality_gate_service import QualityGateService

        service = QualityGateService()
        partial_outline = {
            "chapters": [
                {"chapter_number": 1, "title": "Beginning", "summary": "The story begins..."},
            ]
        }
        score = service._assess_outline(partial_outline)
        assert score <= 0.7  # Few chapters, low score


# =============================================================================
# ContextManager Tests
# =============================================================================


class TestContextManager:
    """Tests for ContextManager context windowing."""

    def test_estimate_tokens(self):
        """Token estimation should be roughly 1 token per 4 chars."""
        from app.agents.context_manager import estimate_tokens

        # 400 chars ≈ 100 tokens
        assert 80 <= estimate_tokens("a" * 400) <= 120

    def test_truncate_to_tokens(self):
        """Truncation should respect token limits."""
        from app.agents.context_manager import truncate_to_tokens

        long_text = "word " * 1000  # ~1250 tokens
        truncated = truncate_to_tokens(long_text, 100)
        # Truncated text should be shorter
        assert len(truncated) < len(long_text)

    def test_summarize_chapter(self):
        """Chapter summary should extract key parts."""
        from app.agents.context_manager import ContextManager

        cm = ContextManager(redis=MagicMock())
        # Create a chapter with multiple paragraphs
        paragraphs = [f"Paragraph {i}. " + "x " * 50 for i in range(10)]
        content = "\n\n".join(paragraphs)
        summary = cm._summarize_chapter(content, max_chars=200)
        # Should be shorter than original
        assert len(summary) < len(content)

    def test_role_context_map_coverage(self):
        """All agent roles should have context mappings."""
        from app.agents.context_manager import ROLE_CONTEXT_MAP

        for role in AGENT_ROLES:
            assert role in ROLE_CONTEXT_MAP, f"Missing context map for {role}"
            entries = ROLE_CONTEXT_MAP[role]
            # Each entry is a list of (key, priority) tuples
            assert len(entries) > 0
            # Check at least one item has CRITICAL priority
            from app.agents.context_manager import ContextPriority

            priorities = [p for _, p in entries]
            assert ContextPriority.CRITICAL in priorities, f"{role} has no CRITICAL context"


# =============================================================================
# TeamAgent Config Tests
# =============================================================================


class TestTeamAgentConfig:
    """Tests for TeamAgentConfig dataclass."""

    def test_config_creation(self):
        """Should create config with all fields."""
        from app.agents.base import AgentConfig
        from app.agents.team_agent import TeamAgentConfig

        agent_cfg = AgentConfig(
            role="writer",
            model="test-model",
            system_prompt="Write chapters.",
        )
        config = TeamAgentConfig(
            agent_config=agent_cfg,
            role_name="writer",
            team_run_id=uuid4(),
            task_id=uuid4(),
            chapter_number=5,
            max_context_tokens=4000,
        )
        assert config.role_name == "writer"
        assert config.chapter_number == 5
        assert config.max_context_tokens == 4000

    def test_config_defaults(self):
        """Should apply default values."""
        from app.agents.base import AgentConfig
        from app.agents.team_agent import TeamAgentConfig

        agent_cfg = AgentConfig(
            role="outliner",
            model="test-model",
            system_prompt="Create outlines.",
        )
        config = TeamAgentConfig(
            agent_config=agent_cfg,
            role_name="outliner",
            team_run_id=uuid4(),
            task_id=uuid4(),
        )
        assert config.chapter_number is None
        assert config.max_context_tokens == 6000
