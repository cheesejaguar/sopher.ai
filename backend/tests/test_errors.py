"""Tests for standardized API error utilities."""

import json
from datetime import datetime
from unittest.mock import patch
from uuid import UUID

from fastapi.responses import JSONResponse

from app.errors import ErrorCode, api_error, generate_error_id, request_id_ctx_var


def test_generate_error_id_produces_uuid4():
    """generate_error_id should return a valid UUID4 string."""
    eid = generate_error_id()
    uuid_obj = UUID(eid, version=4)
    assert str(uuid_obj) == eid


def test_api_error_builds_response_with_context():
    """api_error should include request context and structured fields."""
    request_id_ctx_var.set("req-test-123")
    fixed_id = "00000000-0000-4000-8000-000000000000"
    with patch("app.errors.generate_error_id", return_value=fixed_id):
        response = api_error(
            ErrorCode.NOT_FOUND,
            "Resource missing",
            hint="Verify resource identifier",
            details={"item": "value"},
            status=404,
        )
    assert isinstance(response, JSONResponse)
    assert response.status_code == 404
    payload = json.loads(response.body)
    assert payload["error_id"] == fixed_id
    assert payload["error_code"] == ErrorCode.NOT_FOUND
    assert payload["message"] == "Resource missing"
    assert payload["hint"] == "Verify resource identifier"
    assert payload["details"] == {"item": "value"}
    assert payload["request_id"] == "req-test-123"
    # timestamp is ISO8601
    datetime.fromisoformat(payload["timestamp"])


def test_api_error_without_optional_fields():
    """api_error should work without optional fields."""
    request_id_ctx_var.set("")
    response = api_error(
        ErrorCode.VALIDATION_ERROR,
        "Validation failed",
    )
    assert isinstance(response, JSONResponse)
    assert response.status_code == 400  # Default status
    payload = json.loads(response.body)
    assert payload["error_code"] == ErrorCode.VALIDATION_ERROR
    assert payload["message"] == "Validation failed"
    assert payload["hint"] is None
    assert payload["details"] is None


def test_api_error_default_status_is_400():
    """api_error should default to 400 status code."""
    response = api_error(ErrorCode.VALIDATION_ERROR, "Bad request")
    assert response.status_code == 400


def test_api_error_with_string_error_code():
    """api_error should accept string error codes."""
    response = api_error("CUSTOM_ERROR_CODE", "Custom error")
    payload = json.loads(response.body)
    assert payload["error_code"] == "CUSTOM_ERROR_CODE"


class TestErrorCodes:
    """Tests for ErrorCode enum."""

    def test_validation_error_code(self):
        """Test VALIDATION_ERROR code."""
        assert ErrorCode.VALIDATION_ERROR == "VALIDATION_ERROR"

    def test_not_found_code(self):
        """Test NOT_FOUND code."""
        assert ErrorCode.NOT_FOUND == "NOT_FOUND"

    def test_unauthorized_code(self):
        """Test UNAUTHORIZED code."""
        assert ErrorCode.UNAUTHORIZED == "UNAUTHORIZED"

    def test_forbidden_code(self):
        """Test FORBIDDEN code."""
        assert ErrorCode.FORBIDDEN == "FORBIDDEN"

    def test_internal_error_code(self):
        """Test INTERNAL_ERROR code."""
        assert ErrorCode.INTERNAL_ERROR == "INTERNAL_ERROR"

    def test_project_not_found_code(self):
        """Test PROJECT_NOT_FOUND code."""
        assert ErrorCode.PROJECT_NOT_FOUND == "PROJECT_NOT_FOUND"

    def test_chapter_not_found_code(self):
        """Test CHAPTER_NOT_FOUND code."""
        assert ErrorCode.CHAPTER_NOT_FOUND == "CHAPTER_NOT_FOUND"

    def test_outline_required_code(self):
        """Test OUTLINE_REQUIRED code."""
        assert ErrorCode.OUTLINE_REQUIRED == "OUTLINE_REQUIRED"

    def test_export_format_not_supported_code(self):
        """Test EXPORT_FORMAT_NOT_SUPPORTED code."""
        assert ErrorCode.EXPORT_FORMAT_NOT_SUPPORTED == "EXPORT_FORMAT_NOT_SUPPORTED"

    def test_all_error_codes_are_strings(self):
        """Test all error codes are strings."""
        for code in ErrorCode:
            assert isinstance(code.value, str)

    def test_error_code_enum_count(self):
        """Test we have expected number of error codes."""
        # At least 20 error codes defined
        assert len(ErrorCode) >= 20


class TestAPIErrorModel:
    """Tests for APIError Pydantic model."""

    def test_api_error_model_creation(self):
        """Test APIError model creation."""
        from app.errors import APIError

        error = APIError(
            error_id="test-id",
            error_code="TEST_CODE",
            message="Test message",
            request_id="req-123",
            timestamp="2025-12-30T10:00:00Z",
        )
        assert error.error_id == "test-id"
        assert error.error_code == "TEST_CODE"
        assert error.message == "Test message"
        assert error.hint is None
        assert error.details is None

    def test_api_error_model_with_all_fields(self):
        """Test APIError model with all fields."""
        from app.errors import APIError

        error = APIError(
            error_id="test-id",
            error_code="TEST_CODE",
            message="Test message",
            hint="A helpful hint",
            details={"key": "value"},
            request_id="req-123",
            timestamp="2025-12-30T10:00:00Z",
        )
        assert error.hint == "A helpful hint"
        assert error.details == {"key": "value"}

    def test_api_error_model_dump(self):
        """Test APIError model serialization."""
        from app.errors import APIError

        error = APIError(
            error_id="test-id",
            error_code="TEST_CODE",
            message="Test message",
            request_id="req-123",
            timestamp="2025-12-30T10:00:00Z",
        )
        data = error.model_dump()
        assert "error_id" in data
        assert "error_code" in data
        assert "message" in data


class TestRequestIdContext:
    """Tests for request ID context variable."""

    def test_request_id_default_is_empty(self):
        """Test request ID default value."""
        from app.errors import request_id_ctx_var

        # Reset the context
        token = request_id_ctx_var.set("")
        try:
            assert request_id_ctx_var.get() == ""
        finally:
            request_id_ctx_var.reset(token)

    def test_request_id_can_be_set(self):
        """Test setting request ID."""
        from app.errors import request_id_ctx_var

        token = request_id_ctx_var.set("test-request-id")
        try:
            assert request_id_ctx_var.get() == "test-request-id"
        finally:
            request_id_ctx_var.reset(token)

    def test_api_error_includes_request_id_from_context(self):
        """Test api_error includes request ID from context."""
        from app.errors import api_error, request_id_ctx_var

        token = request_id_ctx_var.set("context-request-id")
        try:
            response = api_error(ErrorCode.NOT_FOUND, "Not found")
            payload = json.loads(response.body)
            assert payload["request_id"] == "context-request-id"
        finally:
            request_id_ctx_var.reset(token)
