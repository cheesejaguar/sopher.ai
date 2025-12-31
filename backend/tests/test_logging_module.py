"""Tests for logging module.

Tests cover:
- GCPJSONFormatter
- Severity mapping
- Context variables
"""

import logging


class TestSeverityFromLevel:
    """Tests for severity_from_level function."""

    def test_critical_level(self):
        """Test CRITICAL severity."""
        from app.logging import severity_from_level

        assert severity_from_level(logging.CRITICAL) == "CRITICAL"

    def test_error_level(self):
        """Test ERROR severity."""
        from app.logging import severity_from_level

        assert severity_from_level(logging.ERROR) == "ERROR"

    def test_warning_level(self):
        """Test WARNING severity."""
        from app.logging import severity_from_level

        assert severity_from_level(logging.WARNING) == "WARNING"

    def test_info_level(self):
        """Test INFO severity."""
        from app.logging import severity_from_level

        assert severity_from_level(logging.INFO) == "INFO"

    def test_debug_level(self):
        """Test DEBUG severity."""
        from app.logging import severity_from_level

        assert severity_from_level(logging.DEBUG) == "DEBUG"

    def test_notset_level(self):
        """Test NOTSET severity maps to DEBUG."""
        from app.logging import severity_from_level

        assert severity_from_level(logging.NOTSET) == "DEBUG"


class TestGCPJSONFormatter:
    """Tests for GCPJSONFormatter."""

    def test_formatter_creation(self):
        """Test creating formatter."""
        from app.logging import GCPJSONFormatter

        formatter = GCPJSONFormatter(service_name="test-service")
        assert formatter.service_name == "test-service"

    def test_formatter_with_version(self):
        """Test formatter with version."""
        from app.logging import GCPJSONFormatter

        formatter = GCPJSONFormatter(
            service_name="test-service",
            service_version="1.0.0",
        )
        assert formatter.service_version == "1.0.0"

    def test_format_basic_record(self):
        """Test formatting a basic log record."""
        import json

        from app.logging import GCPJSONFormatter

        formatter = GCPJSONFormatter()
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="test.py",
            lineno=10,
            msg="Test message",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)
        parsed = json.loads(output)

        assert parsed["message"] == "Test message"
        assert parsed["severity"] == "INFO"
        assert parsed["logger"] == "test.logger"
        assert parsed["lineno"] == 10

    def test_format_with_labels(self):
        """Test formatting includes labels."""
        import json

        from app.logging import GCPJSONFormatter

        formatter = GCPJSONFormatter(
            service_name="my-service",
            service_version="2.0.0",
        )
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="Test",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)
        parsed = json.loads(output)

        assert "labels" in parsed
        assert parsed["labels"]["service"] == "my-service"
        assert parsed["labels"]["version"] == "2.0.0"

    def test_format_with_request_id(self):
        """Test formatting with request_id attribute."""
        import json

        from app.logging import GCPJSONFormatter

        formatter = GCPJSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="Test",
            args=(),
            exc_info=None,
        )
        record.request_id = "req-12345"

        output = formatter.format(record)
        parsed = json.loads(output)

        assert parsed["request_id"] == "req-12345"

    def test_format_with_http_request(self):
        """Test formatting with http_request attribute."""
        import json

        from app.logging import GCPJSONFormatter

        formatter = GCPJSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="Test",
            args=(),
            exc_info=None,
        )
        record.http_request = {"method": "GET", "url": "/api/test"}

        output = formatter.format(record)
        parsed = json.loads(output)

        assert "httpRequest" in parsed
        assert parsed["httpRequest"]["method"] == "GET"

    def test_format_with_span_id(self):
        """Test formatting with span_id attribute."""
        import json

        from app.logging import GCPJSONFormatter

        formatter = GCPJSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="Test",
            args=(),
            exc_info=None,
        )
        record.span_id = "span-67890"

        output = formatter.format(record)
        parsed = json.loads(output)

        assert parsed["logging.googleapis.com/spanId"] == "span-67890"


class TestContextVariables:
    """Tests for context variables."""

    def test_request_id_var(self):
        """Test request_id context variable."""
        from app.logging import request_id_var

        assert request_id_var.get() is None

        token = request_id_var.set("test-request-id")
        assert request_id_var.get() == "test-request-id"
        request_id_var.reset(token)

    def test_trace_id_var(self):
        """Test trace_id context variable."""
        from app.logging import trace_id_var

        assert trace_id_var.get() is None

        token = trace_id_var.set("test-trace-id")
        assert trace_id_var.get() == "test-trace-id"
        trace_id_var.reset(token)

    def test_span_id_var(self):
        """Test span_id context variable."""
        from app.logging import span_id_var

        assert span_id_var.get() is None

        token = span_id_var.set("test-span-id")
        assert span_id_var.get() == "test-span-id"
        span_id_var.reset(token)

    def test_http_request_var(self):
        """Test http_request context variable."""
        from app.logging import http_request_var

        assert http_request_var.get() is None

        token = http_request_var.set({"method": "POST", "url": "/test"})
        assert http_request_var.get() == {"method": "POST", "url": "/test"}
        http_request_var.reset(token)


class TestParseTraceContext:
    """Tests for parse_trace_context function."""

    def test_parse_empty_header(self):
        """Test parsing empty header returns None, None."""
        from app.logging import parse_trace_context

        trace_id, span_id = parse_trace_context("")
        assert trace_id is None
        assert span_id is None

    def test_parse_none_header(self):
        """Test parsing None header returns None, None."""
        from app.logging import parse_trace_context

        trace_id, span_id = parse_trace_context(None)
        assert trace_id is None
        assert span_id is None

    def test_parse_valid_header(self):
        """Test parsing valid header."""
        from app.logging import parse_trace_context

        trace_id, span_id = parse_trace_context("trace123/span456;o=1")
        assert trace_id == "trace123"
        assert span_id == "span456"


class TestSetupLogging:
    """Tests for setup_logging function."""

    def test_setup_logging_text_format(self):
        """Test setup with text (non-JSON) format."""
        import importlib
        import os
        from unittest.mock import patch

        with patch.dict(os.environ, {"LOG_JSON": "false"}, clear=False):
            # Need to reimport to apply the env change
            import app.logging as app_logging

            importlib.reload(app_logging)
            logger = app_logging.setup_logging()
            assert logger is not None


class TestGCPJSONFormatterWithTraceId:
    """Tests for GCPJSONFormatter with trace_id and gcp_project."""

    def test_format_with_trace_id_and_project(self):
        """Test formatting with trace_id when GCP_PROJECT env is set."""
        import json
        import os
        from unittest.mock import patch

        from app.logging import GCPJSONFormatter

        # Need to reimport after patching the env
        with patch.dict(os.environ, {"GCP_PROJECT": "my-project"}):
            # Create formatter while env is set
            formatter = GCPJSONFormatter()
            formatter.gcp_project = "my-project"  # Set directly for this test

            record = logging.LogRecord(
                name="test",
                level=logging.INFO,
                pathname="test.py",
                lineno=1,
                msg="Test",
                args=(),
                exc_info=None,
            )
            record.trace_id = "abc123"

            output = formatter.format(record)
            parsed = json.loads(output)

            assert "logging.googleapis.com/trace" in parsed
            assert "projects/my-project/traces/abc123" in parsed["logging.googleapis.com/trace"]
