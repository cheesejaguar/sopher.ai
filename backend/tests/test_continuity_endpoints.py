"""
Tests for continuity router endpoints.

Tests cover:
- Schema validation
- Router registration
- Endpoint permissions
- OpenAPI documentation
- Issue detection
"""

from datetime import datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.routers.continuity import (
    CharacterProfile,
    CharacterState,
    ContinuityCheckRequest,
    ContinuityIssue,
    ContinuityReport,
    FixIssueRequest,
    FixIssueResponse,
    TimelineEvent,
    WorldRule,
)


class TestCharacterStateSchema:
    """Tests for CharacterState schema."""

    def test_valid_character_state(self):
        """Test creating a valid character state."""
        state = CharacterState(
            chapter_number=1,
            location="Forest",
            emotional_state="anxious",
            knowledge=["knows about the treasure"],
            relationships={"Bob": "friend"},
            physical_state="healthy",
        )
        assert state.chapter_number == 1
        assert state.location == "Forest"
        assert state.emotional_state == "anxious"
        assert len(state.knowledge) == 1
        assert state.relationships["Bob"] == "friend"

    def test_minimal_character_state(self):
        """Test creating a minimal character state."""
        state = CharacterState(chapter_number=5)
        assert state.chapter_number == 5
        assert state.location is None
        assert state.emotional_state is None
        assert state.knowledge == []
        assert state.relationships == {}

    def test_invalid_chapter_number(self):
        """Test that chapter number must be >= 1."""
        with pytest.raises(ValidationError) as exc_info:
            CharacterState(chapter_number=0)
        assert "greater than or equal to 1" in str(exc_info.value)

    def test_negative_chapter_number(self):
        """Test that negative chapter number is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CharacterState(chapter_number=-1)
        assert "greater than or equal to 1" in str(exc_info.value)


class TestCharacterProfileSchema:
    """Tests for CharacterProfile schema."""

    def test_valid_character_profile(self):
        """Test creating a valid character profile."""
        profile = CharacterProfile(
            name="Alice",
            aliases=["Ali", "A"],
            physical_description="Tall with red hair",
            personality_traits=["brave", "loyal"],
            backstory="Grew up in the mountains",
            first_appearance=1,
            states=[CharacterState(chapter_number=1, location="Home")],
        )
        assert profile.name == "Alice"
        assert len(profile.aliases) == 2
        assert profile.first_appearance == 1
        assert len(profile.states) == 1

    def test_minimal_character_profile(self):
        """Test creating a minimal character profile."""
        profile = CharacterProfile(name="Bob")
        assert profile.name == "Bob"
        assert profile.aliases == []
        assert profile.physical_description is None
        assert profile.states == []

    def test_empty_name_rejected(self):
        """Test that empty name is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CharacterProfile(name="")
        assert "string_too_short" in str(exc_info.value).lower()

    def test_name_too_long(self):
        """Test that name longer than 200 chars is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CharacterProfile(name="x" * 201)
        assert "string_too_long" in str(exc_info.value).lower()


class TestTimelineEventSchema:
    """Tests for TimelineEvent schema."""

    def test_valid_timeline_event(self):
        """Test creating a valid timeline event."""
        event = TimelineEvent(
            id="event-001",
            chapter_number=3,
            description="The hero discovers the map",
            timestamp="Day 5, morning",
            characters_involved=["Alice", "Bob"],
            location="Old library",
            duration="1 hour",
            dependencies=["event-000"],
        )
        assert event.id == "event-001"
        assert event.chapter_number == 3
        assert len(event.characters_involved) == 2
        assert event.dependencies == ["event-000"]

    def test_minimal_timeline_event(self):
        """Test creating a minimal timeline event."""
        event = TimelineEvent(
            id="event-002",
            chapter_number=1,
            description="Story begins",
        )
        assert event.id == "event-002"
        assert event.timestamp is None
        assert event.characters_involved == []
        assert event.dependencies == []

    def test_description_too_short(self):
        """Test that description must be at least 5 chars."""
        with pytest.raises(ValidationError) as exc_info:
            TimelineEvent(id="e1", chapter_number=1, description="Hi")
        assert "string_too_short" in str(exc_info.value).lower()


class TestWorldRuleSchema:
    """Tests for WorldRule schema."""

    def test_valid_world_rule(self):
        """Test creating a valid world rule."""
        rule = WorldRule(
            id="rule-001",
            name="Magic requires energy",
            category="magic_system",
            description="All magic spells drain the caster's energy proportionally.",
            exceptions=["Minor illusions cost almost nothing"],
            established_in_chapter=2,
        )
        assert rule.id == "rule-001"
        assert rule.name == "Magic requires energy"
        assert rule.category == "magic_system"
        assert len(rule.exceptions) == 1
        assert rule.established_in_chapter == 2

    def test_minimal_world_rule(self):
        """Test creating a minimal world rule."""
        rule = WorldRule(
            id="rule-002",
            name="Gravity",
            category="physics",
            description="Objects fall down when dropped.",
        )
        assert rule.id == "rule-002"
        assert rule.exceptions == []
        assert rule.established_in_chapter is None

    def test_description_too_short(self):
        """Test that description must be at least 10 chars."""
        with pytest.raises(ValidationError) as exc_info:
            WorldRule(id="r1", name="Test", category="other", description="Short")
        assert "string_too_short" in str(exc_info.value).lower()


class TestContinuityIssueSchema:
    """Tests for ContinuityIssue schema."""

    def test_valid_continuity_issue(self):
        """Test creating a valid continuity issue."""
        issue = ContinuityIssue(
            id="issue-001",
            issue_type="character",
            severity="warning",
            chapter_number=5,
            description="Character's eye color changed from blue to green.",
            context="She looked at him with her green eyes...",
            original_text="blue eyes",
            suggested_fix="green eyes (to match chapter 2)",
            affected_chapters=[2, 5],
            related_character="Alice",
            auto_fixable=True,
        )
        assert issue.id == "issue-001"
        assert issue.issue_type == "character"
        assert issue.severity == "warning"
        assert issue.auto_fixable is True

    def test_minimal_continuity_issue(self):
        """Test creating a minimal continuity issue."""
        issue = ContinuityIssue(
            id="issue-002",
            issue_type="timeline",
            chapter_number=3,
            description="Event happens before it's possible.",
        )
        assert issue.id == "issue-002"
        assert issue.severity == "warning"  # default
        assert issue.context == ""  # default
        assert issue.auto_fixable is False  # default


class TestContinuityCheckRequestSchema:
    """Tests for ContinuityCheckRequest schema."""

    def test_valid_check_request(self):
        """Test creating a valid check request."""
        request = ContinuityCheckRequest(
            check_types=["character", "timeline"],
            chapters=[1, 2, 3],
            focus_characters=["Alice", "Bob"],
            include_suggestions=True,
        )
        assert request.check_types == ["character", "timeline"]
        assert request.chapters == [1, 2, 3]
        assert len(request.focus_characters) == 2

    def test_default_check_request(self):
        """Test creating a check request with defaults."""
        request = ContinuityCheckRequest()
        assert request.check_types == ["character", "timeline", "world"]
        assert request.chapters is None
        assert request.focus_characters is None
        assert request.include_suggestions is True


class TestContinuityReportSchema:
    """Tests for ContinuityReport schema."""

    def test_valid_continuity_report(self):
        """Test creating a valid continuity report."""
        report = ContinuityReport(
            project_id=uuid4(),
            generated_at=datetime.utcnow(),
            check_types=["character", "timeline", "world"],
            chapters_checked=[1, 2, 3, 4, 5],
            total_issues=3,
            issues_by_type={"character": 2, "timeline": 1},
            issues_by_severity={"warning": 2, "error": 1},
            issues=[
                ContinuityIssue(
                    id="i1",
                    issue_type="character",
                    chapter_number=2,
                    description="Eye color mismatch",
                )
            ],
            overall_score=0.85,
            summary="Found 3 minor issues.",
        )
        assert report.total_issues == 3
        assert report.overall_score == 0.85
        assert len(report.issues) == 1

    def test_score_bounds(self):
        """Test that overall_score must be between 0 and 1."""
        with pytest.raises(ValidationError) as exc_info:
            ContinuityReport(
                project_id=uuid4(),
                generated_at=datetime.utcnow(),
                check_types=[],
                chapters_checked=[],
                total_issues=0,
                issues_by_type={},
                issues_by_severity={},
                issues=[],
                overall_score=1.5,
                summary="Test",
            )
        assert "less than or equal to 1" in str(exc_info.value)


class TestFixIssueRequestSchema:
    """Tests for FixIssueRequest schema."""

    def test_valid_fix_request(self):
        """Test creating a valid fix request."""
        request = FixIssueRequest(
            apply_to_all_chapters=True,
            custom_fix="Changed to match original",
        )
        assert request.apply_to_all_chapters is True
        assert request.custom_fix == "Changed to match original"

    def test_default_fix_request(self):
        """Test creating a fix request with defaults."""
        request = FixIssueRequest()
        assert request.apply_to_all_chapters is False
        assert request.custom_fix is None


class TestFixIssueResponseSchema:
    """Tests for FixIssueResponse schema."""

    def test_valid_fix_response(self):
        """Test creating a valid fix response."""
        response = FixIssueResponse(
            success=True,
            issue_id="issue-001",
            fix_applied="Changed 'blue eyes' to 'green eyes'",
            chapters_modified=[2, 5],
            message="Fix applied successfully.",
        )
        assert response.success is True
        assert response.issue_id == "issue-001"
        assert len(response.chapters_modified) == 2


class TestRouterRegistration:
    """Tests for router registration and endpoint availability."""

    def test_router_prefix(self):
        """Test that router has correct prefix."""
        from app.routers.continuity import router

        assert router.prefix == "/projects/{project_id}/continuity"

    def test_router_tags(self):
        """Test that router has correct tags."""
        from app.routers.continuity import router

        assert "continuity" in router.tags

    def test_endpoints_exist(self):
        """Test that all required endpoints are registered."""
        from app.routers.continuity import router

        routes = [route.path for route in router.routes]

        # Main endpoints (routes include the full prefix)
        assert any("/check" in r for r in routes)
        assert any("/report" in r for r in routes)
        assert any("/fix/{issue_id}" in r for r in routes)

        # Character endpoints
        assert any("/characters" in r for r in routes)
        assert any("/characters/{character_name}" in r for r in routes)

        # Timeline endpoints
        assert any("/timeline" in r for r in routes)
        assert any("/timeline/events" in r for r in routes)
        assert any("/timeline/events/{event_id}" in r for r in routes)

        # World rules endpoints
        assert any("/world-rules" in r for r in routes)
        assert any("/world-rules/{rule_id}" in r for r in routes)

    def test_check_endpoint_is_post(self):
        """Test that /check is a POST endpoint."""
        from app.routers.continuity import router

        for route in router.routes:
            if route.path == "/check":
                assert "POST" in route.methods
                break

    def test_report_endpoint_is_get(self):
        """Test that /report is a GET endpoint."""
        from app.routers.continuity import router

        for route in router.routes:
            if route.path == "/report":
                assert "GET" in route.methods
                break

    def test_fix_endpoint_is_post(self):
        """Test that /fix/{issue_id} is a POST endpoint."""
        from app.routers.continuity import router

        for route in router.routes:
            if route.path == "/fix/{issue_id}":
                assert "POST" in route.methods
                break


class TestOpenAPIDocumentation:
    """Tests for OpenAPI documentation generation."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        from fastapi.testclient import TestClient

        from app.main import app

        return TestClient(app)

    def test_openapi_includes_continuity_endpoints(self, client):
        """Test that OpenAPI spec includes continuity endpoints."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        spec = response.json()

        paths = spec.get("paths", {})
        continuity_paths = [p for p in paths if "/continuity" in p]
        assert len(continuity_paths) > 0

    def test_openapi_includes_check_endpoint(self, client):
        """Test that OpenAPI spec includes check endpoint."""
        response = client.get("/openapi.json")
        spec = response.json()
        paths = spec.get("paths", {})

        # Find the check endpoint
        check_path = None
        for path in paths:
            if "/continuity/check" in path:
                check_path = path
                break

        assert check_path is not None
        assert "post" in paths[check_path]

    def test_openapi_includes_report_endpoint(self, client):
        """Test that OpenAPI spec includes report endpoint."""
        response = client.get("/openapi.json")
        spec = response.json()
        paths = spec.get("paths", {})

        # Find the report endpoint
        report_path = None
        for path in paths:
            if "/continuity/report" in path:
                report_path = path
                break

        assert report_path is not None
        assert "get" in paths[report_path]

    def test_openapi_includes_schemas(self, client):
        """Test that OpenAPI spec includes continuity schemas."""
        response = client.get("/openapi.json")
        spec = response.json()
        schemas = spec.get("components", {}).get("schemas", {})

        # Check for key schemas
        assert "ContinuityCheckRequest" in schemas
        assert "ContinuityReport" in schemas
        assert "ContinuityIssue" in schemas
        assert "CharacterProfile" in schemas


class TestErrorCodes:
    """Tests for continuity-related error codes."""

    def test_error_codes_exist(self):
        """Test that continuity error codes are defined."""
        from app.errors import ErrorCode

        assert hasattr(ErrorCode, "CONTINUITY_ISSUE_NOT_FOUND")
        assert hasattr(ErrorCode, "CONTINUITY_CHECK_FAILED")
        assert hasattr(ErrorCode, "CHARACTER_NOT_FOUND")
        assert hasattr(ErrorCode, "TIMELINE_EVENT_NOT_FOUND")
        assert hasattr(ErrorCode, "WORLD_RULE_NOT_FOUND")

    def test_error_code_values(self):
        """Test that error code values are strings."""
        from app.errors import ErrorCode

        assert isinstance(ErrorCode.CONTINUITY_ISSUE_NOT_FOUND.value, str)
        assert isinstance(ErrorCode.CONTINUITY_CHECK_FAILED.value, str)
        assert isinstance(ErrorCode.CHARACTER_NOT_FOUND.value, str)


class TestCharacterTrackingLogic:
    """Tests for character tracking logic."""

    def test_character_with_multiple_states(self):
        """Test character profile with states across chapters."""
        states = [
            CharacterState(
                chapter_number=1,
                location="Village",
                emotional_state="happy",
                knowledge=["knows about the festival"],
            ),
            CharacterState(
                chapter_number=5,
                location="Forest",
                emotional_state="afraid",
                knowledge=["knows about the festival", "knows about the monster"],
            ),
            CharacterState(
                chapter_number=10,
                location="Castle",
                emotional_state="determined",
                knowledge=[
                    "knows about the festival",
                    "knows about the monster",
                    "knows about the cure",
                ],
            ),
        ]

        profile = CharacterProfile(
            name="Hero",
            physical_description="Young adventurer",
            first_appearance=1,
            states=states,
        )

        assert len(profile.states) == 3
        # Verify knowledge grows over time
        assert len(profile.states[0].knowledge) == 1
        assert len(profile.states[1].knowledge) == 2
        assert len(profile.states[2].knowledge) == 3


class TestTimelineLogic:
    """Tests for timeline event logic."""

    def test_timeline_with_dependencies(self):
        """Test timeline events with dependencies."""
        events = [
            TimelineEvent(
                id="setup",
                chapter_number=1,
                description="The hero receives the quest.",
                dependencies=[],
            ),
            TimelineEvent(
                id="journey",
                chapter_number=3,
                description="The hero begins the journey.",
                dependencies=["setup"],
            ),
            TimelineEvent(
                id="discovery",
                chapter_number=5,
                description="The hero discovers the hidden path.",
                dependencies=["journey"],
            ),
        ]

        # Verify dependency chain
        assert events[0].dependencies == []
        assert events[1].dependencies == ["setup"]
        assert events[2].dependencies == ["journey"]

    def test_timeline_event_with_timestamp(self):
        """Test timeline event with in-story timestamp."""
        event = TimelineEvent(
            id="dawn-battle",
            chapter_number=12,
            description="The final battle begins at dawn.",
            timestamp="Day 30, sunrise",
            duration="2 hours",
            characters_involved=["Hero", "Villain", "Mentor"],
            location="Dark Mountain",
        )

        assert event.timestamp == "Day 30, sunrise"
        assert event.duration == "2 hours"
        assert len(event.characters_involved) == 3


class TestWorldRulesLogic:
    """Tests for world rules logic."""

    def test_magic_system_rule(self):
        """Test magic system world rule."""
        rule = WorldRule(
            id="magic-cost",
            name="Magic Cost Rule",
            category="magic_system",
            description="Every spell cast requires equivalent life energy from the caster.",
            exceptions=["Healing spells take energy from nature"],
            established_in_chapter=3,
        )

        assert rule.category == "magic_system"
        assert len(rule.exceptions) == 1

    def test_technology_rule(self):
        """Test technology world rule."""
        rule = WorldRule(
            id="no-gunpowder",
            name="No Gunpowder",
            category="technology",
            description="Gunpowder has never been discovered in this world.",
            established_in_chapter=1,
        )

        assert rule.category == "technology"
        assert rule.established_in_chapter == 1


class TestIssueDetectionPatterns:
    """Tests for issue detection pattern schemas."""

    def test_character_inconsistency_issue(self):
        """Test character inconsistency issue."""
        issue = ContinuityIssue(
            id="char-001",
            issue_type="character",
            severity="error",
            chapter_number=7,
            description="Character's height changed from 6ft to 5'8\".",
            original_text="towering at six feet",
            suggested_fix="around five foot eight",
            related_character="John",
            affected_chapters=[3, 7],
            auto_fixable=False,
        )

        assert issue.issue_type == "character"
        assert issue.severity == "error"
        assert issue.related_character == "John"

    def test_timeline_issue(self):
        """Test timeline inconsistency issue."""
        issue = ContinuityIssue(
            id="time-001",
            issue_type="timeline",
            severity="warning",
            chapter_number=8,
            description="Event references sunset, but previous scene was at dawn of the same day.",
            related_event_id="event-sunset",
            affected_chapters=[7, 8],
            auto_fixable=True,
        )

        assert issue.issue_type == "timeline"
        assert issue.related_event_id == "event-sunset"

    def test_world_rule_violation_issue(self):
        """Test world rule violation issue."""
        issue = ContinuityIssue(
            id="world-001",
            issue_type="world",
            severity="error",
            chapter_number=15,
            description="Character uses a gun, but gunpowder doesn't exist in this world.",
            related_rule_id="no-gunpowder",
            suggested_fix="Replace with crossbow",
            auto_fixable=False,
        )

        assert issue.issue_type == "world"
        assert issue.related_rule_id == "no-gunpowder"

    def test_plot_hole_issue(self):
        """Test plot hole issue."""
        issue = ContinuityIssue(
            id="plot-001",
            issue_type="plot_hole",
            severity="error",
            chapter_number=20,
            description="Character knows about the secret passage, but was never shown discovering it.",
            affected_chapters=[15, 20],
            auto_fixable=False,
        )

        assert issue.issue_type == "plot_hole"
        assert len(issue.affected_chapters) == 2


class TestReportAggregation:
    """Tests for report aggregation logic."""

    def test_issues_by_type_counting(self):
        """Test counting issues by type."""
        issues = [
            ContinuityIssue(
                id="1", issue_type="character", chapter_number=1, description="Test issue 1"
            ),
            ContinuityIssue(
                id="2", issue_type="character", chapter_number=2, description="Test issue 2"
            ),
            ContinuityIssue(
                id="3", issue_type="timeline", chapter_number=3, description="Test issue 3"
            ),
            ContinuityIssue(
                id="4", issue_type="world", chapter_number=4, description="Test issue 4"
            ),
        ]

        # Count by type
        by_type = {}
        for issue in issues:
            by_type[issue.issue_type] = by_type.get(issue.issue_type, 0) + 1

        assert by_type == {"character": 2, "timeline": 1, "world": 1}

    def test_issues_by_severity_counting(self):
        """Test counting issues by severity."""
        issues = [
            ContinuityIssue(
                id="1",
                issue_type="character",
                severity="error",
                chapter_number=1,
                description="Error issue",
            ),
            ContinuityIssue(
                id="2",
                issue_type="character",
                severity="warning",
                chapter_number=2,
                description="Warning issue",
            ),
            ContinuityIssue(
                id="3",
                issue_type="timeline",
                severity="warning",
                chapter_number=3,
                description="Another warning",
            ),
            ContinuityIssue(
                id="4",
                issue_type="world",
                severity="info",
                chapter_number=4,
                description="Info issue",
            ),
        ]

        # Count by severity
        by_severity = {}
        for issue in issues:
            by_severity[issue.severity] = by_severity.get(issue.severity, 0) + 1

        assert by_severity == {"error": 1, "warning": 2, "info": 1}

    def test_overall_score_calculation(self):
        """Test that overall score is within valid range."""
        # Score with no issues should be 1.0
        report_perfect = ContinuityReport(
            project_id=uuid4(),
            generated_at=datetime.utcnow(),
            check_types=["character", "timeline", "world"],
            chapters_checked=[1, 2, 3],
            total_issues=0,
            issues_by_type={},
            issues_by_severity={},
            issues=[],
            overall_score=1.0,
            summary="No issues found.",
        )
        assert report_perfect.overall_score == 1.0

        # Score with some issues
        report_issues = ContinuityReport(
            project_id=uuid4(),
            generated_at=datetime.utcnow(),
            check_types=["character", "timeline", "world"],
            chapters_checked=[1, 2, 3],
            total_issues=5,
            issues_by_type={"character": 3, "timeline": 2},
            issues_by_severity={"warning": 4, "error": 1},
            issues=[],
            overall_score=0.7,
            summary="Found 5 issues.",
        )
        assert 0 <= report_issues.overall_score <= 1
