"""Tests for exception handlers integration."""

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.errors import ErrorCode
from app.main import app


@pytest.fixture
def client():
    """Create test client with exception handlers."""
    return TestClient(app)


def test_validation_exception_handler():
    """Test RequestValidationError handling produces structured APIError."""
    # Create a test app with validation
    test_app = FastAPI()

    # Add middleware for request ID (needed by exception handler)
    from app.middleware import RequestIDMiddleware
    test_app.add_middleware(RequestIDMiddleware)

    # Import and register the exception handlers from main
    from app.main import validation_exception_handler

    test_app.exception_handler(RequestValidationError)(validation_exception_handler)

    class TestModel(BaseModel):
        required_field: str = Field(..., min_length=5)
        number_field: int = Field(..., gt=0)

    @test_app.post("/validate")
    async def validate_endpoint(data: TestModel):
        return {"ok": True}

    client = TestClient(test_app)

    # Test validation failure
    response = client.post("/validate", json={"required_field": "abc", "number_field": -1})

    assert response.status_code == 422

    # Check structured error response
    data = response.json()
    assert "error_id" in data
    assert data["error_code"] == ErrorCode.VALIDATION_ERROR
    assert data["message"] == "Invalid request."
    assert data["hint"] == "Check request body against schema."
    assert "details" in data
    assert "errors" in data["details"]
    assert "request_id" in data
    assert "timestamp" in data

    # Check validation details
    errors = data["details"]["errors"]
    assert len(errors) >= 2  # Should have errors for both fields


def test_http_exception_handler():
    """Test StarletteHTTPException mapping to error codes."""
    # Create test app with our exception handler
    test_app = FastAPI()

    from app.main import http_exception_handler

    test_app.exception_handler(StarletteHTTPException)(http_exception_handler)

    @test_app.get("/not-found")
    async def not_found_endpoint():
        raise StarletteHTTPException(status_code=404, detail="Resource not found")

    @test_app.get("/forbidden")
    async def forbidden_endpoint():
        raise StarletteHTTPException(status_code=403, detail="Access denied")

    @test_app.get("/method-not-allowed")
    async def method_not_allowed_endpoint():
        raise StarletteHTTPException(status_code=405, detail="Method not allowed")

    client = TestClient(test_app)

    # Test 404 mapping
    response = client.get("/not-found")
    assert response.status_code == 404
    data = response.json()
    assert data["error_code"] == ErrorCode.NOT_FOUND
    assert "Resource not found" in data["message"]

    # Test 403 mapping
    response = client.get("/forbidden")
    assert response.status_code == 403
    data = response.json()
    assert data["error_code"] == ErrorCode.FORBIDDEN
    assert "Access denied" in data["message"]

    # Test 405 mapping
    response = client.get("/method-not-allowed")
    assert response.status_code == 405
    data = response.json()
    assert data["error_code"] == ErrorCode.METHOD_NOT_ALLOWED


def test_unhandled_exception_handler():
    """Test generic Exception catch-all produces safe error response."""
    test_app = FastAPI()

    from app.main import unhandled_exception_handler

    # Add middleware for request ID (needed by exception handler)
    from app.middleware import RequestIDMiddleware
    test_app.add_middleware(RequestIDMiddleware)

    test_app.exception_handler(Exception)(unhandled_exception_handler)

    @test_app.get("/crash")
    async def crash_endpoint():
        raise ValueError("This is a dangerous internal error with secrets: api_key_123")

    client = TestClient(test_app)

    with patch("app.main.logger") as mock_logger:
        response = client.get("/crash")

    # Should return 500 with safe error message
    assert response.status_code == 500
    data = response.json()
    assert data["error_code"] == ErrorCode.INTERNAL_ERROR
    assert data["message"] == "An internal error occurred."
    assert data["hint"] == "Please try again later."

    # Should NOT expose the original error message
    assert "dangerous internal error" not in data["message"]
    assert "api_key_123" not in str(data)

    # Should log the full error for debugging
    mock_logger.error.assert_called_once()


def test_exception_handlers_integration_with_request_id():
    """Test that all exception handlers include request ID correlation."""
    test_app = FastAPI()

    # Add middleware for request ID
    from app.middleware import RequestIDMiddleware

    test_app.add_middleware(RequestIDMiddleware)

    # Add all exception handlers
    from app.main import (
        http_exception_handler,
        unhandled_exception_handler,
        validation_exception_handler,
    )

    test_app.exception_handler(RequestValidationError)(validation_exception_handler)
    test_app.exception_handler(StarletteHTTPException)(http_exception_handler)
    test_app.exception_handler(Exception)(unhandled_exception_handler)

    @test_app.get("/error")
    async def error_endpoint():
        raise StarletteHTTPException(status_code=404, detail="Not found")

    client = TestClient(test_app)

    # Make request with custom request ID
    response = client.get("/error", headers={"X-Request-ID": "test-correlation-123"})

    # Response should include request ID
    assert response.headers["X-Request-ID"] == "test-correlation-123"

    # Error body should include request ID
    data = response.json()
    assert data["request_id"] == "test-correlation-123"


@patch("app.main.MetricsTracker.track_api_request")
def test_exception_handlers_track_metrics(mock_metrics):
    """Test that exception handlers track metrics correctly."""
    test_app = FastAPI()

    from app.main import http_exception_handler

    test_app.exception_handler(StarletteHTTPException)(http_exception_handler)

    @test_app.get("/error")
    async def error_endpoint():
        raise StarletteHTTPException(status_code=404, detail="Not found")

    client = TestClient(test_app)
    client.get("/error")

    # Should track the error status code
    mock_metrics.assert_called_once_with(method="GET", endpoint="/error", status_code=404)


def test_error_response_structure_consistency():
    """Test that all exception handlers return consistent error structure."""
    test_app = FastAPI()

    from app.main import (
        http_exception_handler,
        unhandled_exception_handler,
        validation_exception_handler,
    )

    # Add middleware for request ID (needed by exception handlers)
    from app.middleware import RequestIDMiddleware
    test_app.add_middleware(RequestIDMiddleware)

    test_app.exception_handler(RequestValidationError)(validation_exception_handler)
    test_app.exception_handler(StarletteHTTPException)(http_exception_handler)
    test_app.exception_handler(Exception)(unhandled_exception_handler)

    class TestModel(BaseModel):
        field: str = Field(..., min_length=10)

    @test_app.post("/validation-error")
    async def validation_error_endpoint(data: TestModel):
        return {"ok": True}

    @test_app.get("/http-error")
    async def http_error_endpoint():
        raise StarletteHTTPException(status_code=404)

    @test_app.get("/internal-error")
    async def internal_error_endpoint():
        raise Exception("Internal error")

    client = TestClient(test_app)

    # Test all error types
    responses = [
        client.post("/validation-error", json={"field": "short"}),  # 422
        client.get("/http-error"),  # 404
        client.get("/internal-error"),  # 500
    ]

    # All should have consistent structure
    required_fields = {"error_id", "error_code", "message", "request_id", "timestamp"}

    for response in responses:
        data = response.json()

        # Check all required fields are present
        assert required_fields.issubset(set(data.keys()))

        # Check field types
        assert isinstance(data["error_id"], str)
        assert isinstance(data["error_code"], str)
        assert isinstance(data["message"], str)
        assert isinstance(data["request_id"], str)
        assert isinstance(data["timestamp"], str)

        # Optional fields should be proper types when present
        if "hint" in data:
            assert isinstance(data["hint"], str)
        if "details" in data:
            assert isinstance(data["details"], dict)
