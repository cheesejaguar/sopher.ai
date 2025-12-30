"""Tests for the editing router endpoints."""

import pytest
from pydantic import ValidationError

from app.routers.editing import (
    ApplySuggestionRequest,
    ApplySuggestionResponse,
    EditRequest,
    EditSuggestion,
    EditSuggestionsResponse,
    ProofreadRequest,
)


class TestEditRequestSchema:
    """Tests for EditRequest schema validation."""

    def test_default_values(self):
        """Test default values are set correctly."""
        request = EditRequest()
        assert request.edit_type == "structural"
        assert request.focus_areas is None
        assert request.preserve_voice is True
        assert request.aggressiveness == "moderate"

    def test_custom_values(self):
        """Test custom values are accepted."""
        request = EditRequest(
            edit_type="line",
            focus_areas=["dialogue", "pacing"],
            preserve_voice=False,
            aggressiveness="heavy",
        )
        assert request.edit_type == "line"
        assert request.focus_areas == ["dialogue", "pacing"]
        assert request.preserve_voice is False
        assert request.aggressiveness == "heavy"

    def test_valid_edit_types(self):
        """Test various edit types are accepted."""
        for edit_type in ["structural", "line", "copy", "proofread"]:
            request = EditRequest(edit_type=edit_type)
            assert request.edit_type == edit_type

    def test_valid_aggressiveness_levels(self):
        """Test various aggressiveness levels are accepted."""
        for level in ["light", "moderate", "heavy"]:
            request = EditRequest(aggressiveness=level)
            assert request.aggressiveness == level


class TestProofreadRequestSchema:
    """Tests for ProofreadRequest schema validation."""

    def test_default_values(self):
        """Test default values are set correctly."""
        request = ProofreadRequest()
        assert request.check_grammar is True
        assert request.check_spelling is True
        assert request.check_punctuation is True
        assert request.check_formatting is True
        assert request.style_guide is None

    def test_custom_values(self):
        """Test custom values are accepted."""
        request = ProofreadRequest(
            check_grammar=False,
            check_spelling=True,
            check_punctuation=False,
            check_formatting=True,
            style_guide="chicago",
        )
        assert request.check_grammar is False
        assert request.check_spelling is True
        assert request.check_punctuation is False
        assert request.check_formatting is True
        assert request.style_guide == "chicago"

    def test_all_checks_disabled(self):
        """Test all checks can be disabled."""
        request = ProofreadRequest(
            check_grammar=False,
            check_spelling=False,
            check_punctuation=False,
            check_formatting=False,
        )
        assert request.check_grammar is False
        assert request.check_spelling is False
        assert request.check_punctuation is False
        assert request.check_formatting is False


class TestEditSuggestionSchema:
    """Tests for EditSuggestion schema validation."""

    def test_valid_suggestion(self):
        """Test valid suggestion creation."""
        suggestion = EditSuggestion(
            id="sugg-001",
            suggestion_type="grammar",
            severity="warning",
            original_text="Their going",
            suggested_text="They're going",
            start_position=100,
            end_position=112,
            explanation="Use 'they're' (contraction) instead of 'their' (possessive)",
            confidence=0.95,
        )
        assert suggestion.id == "sugg-001"
        assert suggestion.suggestion_type == "grammar"
        assert suggestion.severity == "warning"
        assert suggestion.confidence == 0.95

    def test_confidence_bounds(self):
        """Test confidence score validation."""
        # Valid confidence at boundaries
        suggestion = EditSuggestion(
            id="s1",
            suggestion_type="spelling",
            severity="error",
            original_text="teh",
            suggested_text="the",
            start_position=0,
            end_position=3,
            explanation="Spelling error",
            confidence=0.0,
        )
        assert suggestion.confidence == 0.0

        suggestion = EditSuggestion(
            id="s2",
            suggestion_type="spelling",
            severity="error",
            original_text="teh",
            suggested_text="the",
            start_position=0,
            end_position=3,
            explanation="Spelling error",
            confidence=1.0,
        )
        assert suggestion.confidence == 1.0

    def test_invalid_confidence_too_high(self):
        """Test confidence score rejects values > 1."""
        with pytest.raises(ValidationError):
            EditSuggestion(
                id="s1",
                suggestion_type="spelling",
                severity="error",
                original_text="teh",
                suggested_text="the",
                start_position=0,
                end_position=3,
                explanation="Spelling error",
                confidence=1.5,
            )

    def test_invalid_confidence_negative(self):
        """Test confidence score rejects negative values."""
        with pytest.raises(ValidationError):
            EditSuggestion(
                id="s1",
                suggestion_type="spelling",
                severity="error",
                original_text="teh",
                suggested_text="the",
                start_position=0,
                end_position=3,
                explanation="Spelling error",
                confidence=-0.1,
            )


class TestEditSuggestionsResponseSchema:
    """Tests for EditSuggestionsResponse schema validation."""

    def test_empty_suggestions(self):
        """Test response with no suggestions."""
        response = EditSuggestionsResponse(
            chapter_number=1,
            suggestion_count=0,
            suggestions=[],
            summary="No issues found.",
        )
        assert response.chapter_number == 1
        assert response.suggestion_count == 0
        assert len(response.suggestions) == 0

    def test_multiple_suggestions(self):
        """Test response with multiple suggestions."""
        suggestions = [
            EditSuggestion(
                id="s1",
                suggestion_type="grammar",
                severity="warning",
                original_text="text1",
                suggested_text="text1_fixed",
                start_position=0,
                end_position=5,
                explanation="Fix 1",
                confidence=0.9,
            ),
            EditSuggestion(
                id="s2",
                suggestion_type="spelling",
                severity="error",
                original_text="text2",
                suggested_text="text2_fixed",
                start_position=10,
                end_position=15,
                explanation="Fix 2",
                confidence=0.95,
            ),
        ]
        response = EditSuggestionsResponse(
            chapter_number=3,
            suggestion_count=2,
            suggestions=suggestions,
            summary="Found 2 issues.",
        )
        assert response.chapter_number == 3
        assert response.suggestion_count == 2
        assert len(response.suggestions) == 2


class TestApplySuggestionSchemas:
    """Tests for suggestion application schemas."""

    def test_apply_request_defaults(self):
        """Test ApplySuggestionRequest default values."""
        request = ApplySuggestionRequest()
        assert request.apply_similar is False

    def test_apply_request_custom(self):
        """Test ApplySuggestionRequest with custom values."""
        request = ApplySuggestionRequest(apply_similar=True)
        assert request.apply_similar is True

    def test_apply_response_success(self):
        """Test ApplySuggestionResponse for success."""
        response = ApplySuggestionResponse(
            success=True,
            applied_count=1,
            new_content="Updated content here",
            message="Suggestion applied successfully",
        )
        assert response.success is True
        assert response.applied_count == 1
        assert response.new_content == "Updated content here"

    def test_apply_response_failure(self):
        """Test ApplySuggestionResponse for failure."""
        response = ApplySuggestionResponse(
            success=False,
            applied_count=0,
            message="Suggestion not found",
        )
        assert response.success is False
        assert response.applied_count == 0
        assert response.new_content is None


class TestEditingRouterRegistration:
    """Tests for router registration and OpenAPI documentation."""

    def test_router_exists(self):
        """Test editing router is properly defined."""
        from app.routers.editing import router

        assert router is not None
        assert router.prefix == "/projects/{project_id}/chapters/{chapter_number}"
        assert "editing" in router.tags

    def test_edit_stream_endpoint_exists(self):
        """Test edit stream endpoint is registered."""
        from app.routers.editing import router

        routes = [r.path for r in router.routes]
        # Path includes prefix, so it's the full path
        assert any("/edit/stream" in route for route in routes)

    def test_proofread_stream_endpoint_exists(self):
        """Test proofread stream endpoint is registered."""
        from app.routers.editing import router

        routes = [r.path for r in router.routes]
        assert any("/proofread/stream" in route for route in routes)

    def test_suggestions_endpoint_exists(self):
        """Test suggestions endpoint is registered."""
        from app.routers.editing import router

        routes = [r.path for r in router.routes]
        assert any(route.endswith("/suggestions") for route in routes)

    def test_apply_suggestion_endpoint_exists(self):
        """Test apply suggestion endpoint is registered."""
        from app.routers.editing import router

        routes = [r.path for r in router.routes]
        assert any("/suggestions/{suggestion_id}/apply" in route for route in routes)

    def test_reject_suggestion_endpoint_exists(self):
        """Test reject suggestion endpoint is registered."""
        from app.routers.editing import router

        routes = [r.path for r in router.routes]
        assert any("/suggestions/{suggestion_id}/reject" in route for route in routes)

    def test_edit_history_endpoint_exists(self):
        """Test edit history endpoint is registered."""
        from app.routers.editing import router

        routes = [r.path for r in router.routes]
        assert any("/edit-history" in route for route in routes)


class TestOpenAPIDocumentation:
    """Tests for OpenAPI schema documentation."""

    @pytest.fixture
    def client(self):
        """Create a test client."""
        from fastapi.testclient import TestClient

        from app.main import app

        return TestClient(app)

    @pytest.fixture
    def openapi_schema(self, client):
        """Get OpenAPI schema from test client."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        return response.json()

    def test_edit_stream_in_openapi(self, openapi_schema):
        """Test edit stream endpoint is documented."""
        paths = openapi_schema.get("paths", {})
        edit_path = "/api/v1/projects/{project_id}/chapters/{chapter_number}/edit/stream"
        assert edit_path in paths
        assert "post" in paths[edit_path]

    def test_proofread_stream_in_openapi(self, openapi_schema):
        """Test proofread stream endpoint is documented."""
        paths = openapi_schema.get("paths", {})
        proofread_path = "/api/v1/projects/{project_id}/chapters/{chapter_number}/proofread/stream"
        assert proofread_path in paths
        assert "post" in paths[proofread_path]

    def test_suggestions_in_openapi(self, openapi_schema):
        """Test suggestions endpoint is documented."""
        paths = openapi_schema.get("paths", {})
        suggestions_path = "/api/v1/projects/{project_id}/chapters/{chapter_number}/suggestions"
        assert suggestions_path in paths
        assert "get" in paths[suggestions_path]

    def test_edit_request_schema_in_openapi(self, openapi_schema):
        """Test EditRequest schema is documented."""
        schemas = openapi_schema.get("components", {}).get("schemas", {})
        assert "EditRequest" in schemas
        edit_schema = schemas["EditRequest"]
        assert "edit_type" in edit_schema.get("properties", {})
        assert "focus_areas" in edit_schema.get("properties", {})
        assert "preserve_voice" in edit_schema.get("properties", {})
        assert "aggressiveness" in edit_schema.get("properties", {})

    def test_proofread_request_schema_in_openapi(self, openapi_schema):
        """Test ProofreadRequest schema is documented."""
        schemas = openapi_schema.get("components", {}).get("schemas", {})
        assert "ProofreadRequest" in schemas
        proofread_schema = schemas["ProofreadRequest"]
        assert "check_grammar" in proofread_schema.get("properties", {})
        assert "check_spelling" in proofread_schema.get("properties", {})
        assert "check_punctuation" in proofread_schema.get("properties", {})
        assert "check_formatting" in proofread_schema.get("properties", {})

    def test_edit_suggestion_schema_in_openapi(self, openapi_schema):
        """Test EditSuggestion schema is documented."""
        schemas = openapi_schema.get("components", {}).get("schemas", {})
        assert "EditSuggestion" in schemas
        suggestion_schema = schemas["EditSuggestion"]
        props = suggestion_schema.get("properties", {})
        assert "id" in props
        assert "suggestion_type" in props
        assert "severity" in props
        assert "original_text" in props
        assert "suggested_text" in props
        assert "start_position" in props
        assert "end_position" in props
        assert "explanation" in props
        assert "confidence" in props


class TestEditTypeCoverage:
    """Tests for edit type coverage."""

    def test_structural_edit_type(self):
        """Test structural edit type description."""
        request = EditRequest(edit_type="structural")
        # Structural: Pacing, plot holes, character consistency
        assert request.edit_type == "structural"

    def test_line_edit_type(self):
        """Test line edit type description."""
        request = EditRequest(edit_type="line")
        # Line: Prose quality, sentence flow, word choice
        assert request.edit_type == "line"

    def test_copy_edit_type(self):
        """Test copy edit type description."""
        request = EditRequest(edit_type="copy")
        # Copy: Grammar, punctuation, style guide adherence
        assert request.edit_type == "copy"

    def test_proofread_edit_type(self):
        """Test proofread edit type description."""
        request = EditRequest(edit_type="proofread")
        # Proofread: Typos, formatting, final polish
        assert request.edit_type == "proofread"


class TestSeverityLevels:
    """Tests for suggestion severity levels."""

    def test_info_severity(self):
        """Test info severity level."""
        suggestion = EditSuggestion(
            id="s1",
            suggestion_type="style",
            severity="info",
            original_text="very unique",
            suggested_text="unique",
            start_position=0,
            end_position=11,
            explanation="'Unique' doesn't need a modifier",
            confidence=0.7,
        )
        assert suggestion.severity == "info"

    def test_warning_severity(self):
        """Test warning severity level."""
        suggestion = EditSuggestion(
            id="s2",
            suggestion_type="grammar",
            severity="warning",
            original_text="data is",
            suggested_text="data are",
            start_position=0,
            end_position=7,
            explanation="'Data' is plural in formal writing",
            confidence=0.6,
        )
        assert suggestion.severity == "warning"

    def test_error_severity(self):
        """Test error severity level."""
        suggestion = EditSuggestion(
            id="s3",
            suggestion_type="spelling",
            severity="error",
            original_text="recieve",
            suggested_text="receive",
            start_position=0,
            end_position=7,
            explanation="Spelling error: 'i' before 'e' except after 'c'",
            confidence=0.99,
        )
        assert suggestion.severity == "error"


class TestSuggestionTypes:
    """Tests for different suggestion types."""

    @pytest.mark.parametrize(
        "suggestion_type",
        ["structural", "line", "copy", "grammar", "spelling", "punctuation"],
    )
    def test_valid_suggestion_types(self, suggestion_type):
        """Test all valid suggestion types are accepted."""
        suggestion = EditSuggestion(
            id="s1",
            suggestion_type=suggestion_type,
            severity="info",
            original_text="original",
            suggested_text="suggested",
            start_position=0,
            end_position=8,
            explanation="Test suggestion",
            confidence=0.8,
        )
        assert suggestion.suggestion_type == suggestion_type


class TestFocusAreas:
    """Tests for edit focus areas."""

    def test_single_focus_area(self):
        """Test single focus area."""
        request = EditRequest(focus_areas=["dialogue"])
        assert request.focus_areas == ["dialogue"]

    def test_multiple_focus_areas(self):
        """Test multiple focus areas."""
        request = EditRequest(focus_areas=["dialogue", "pacing", "description", "character_voice"])
        assert len(request.focus_areas) == 4

    def test_empty_focus_areas(self):
        """Test empty focus areas list."""
        request = EditRequest(focus_areas=[])
        assert request.focus_areas == []


class TestPositionTracking:
    """Tests for text position tracking in suggestions."""

    def test_valid_positions(self):
        """Test valid start and end positions."""
        suggestion = EditSuggestion(
            id="s1",
            suggestion_type="grammar",
            severity="warning",
            original_text="test",
            suggested_text="test",
            start_position=0,
            end_position=4,
            explanation="Test",
            confidence=0.9,
        )
        assert suggestion.start_position == 0
        assert suggestion.end_position == 4

    def test_large_positions(self):
        """Test large position values for long documents."""
        suggestion = EditSuggestion(
            id="s1",
            suggestion_type="grammar",
            severity="warning",
            original_text="test",
            suggested_text="test",
            start_position=50000,
            end_position=50004,
            explanation="Late in document",
            confidence=0.9,
        )
        assert suggestion.start_position == 50000
        assert suggestion.end_position == 50004
