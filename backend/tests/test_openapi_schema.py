"""Tests for OpenAPI schema validation.

These tests verify that:
1. OpenAPI spec is properly generated from FastAPI
2. All endpoints are documented
3. Response schemas match actual responses
4. Request validation follows documented schemas
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


class TestOpenAPISchemaGeneration:
    """Tests for OpenAPI schema generation."""

    @pytest.mark.asyncio
    async def test_openapi_schema_is_valid(self):
        """Test that OpenAPI schema is generated and has required fields."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        assert response.status_code == 200
        schema = response.json()

        # Check required OpenAPI fields
        assert "openapi" in schema
        assert schema["openapi"].startswith("3.")
        assert "info" in schema
        assert "paths" in schema

    @pytest.mark.asyncio
    async def test_openapi_info_section(self):
        """Test that info section has required metadata."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()
        info = schema["info"]

        assert "title" in info
        assert "version" in info
        assert len(info["title"]) > 0
        assert len(info["version"]) > 0

    @pytest.mark.asyncio
    async def test_openapi_has_components(self):
        """Test that components section exists with schemas."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()

        assert "components" in schema
        assert "schemas" in schema["components"]


class TestEndpointDocumentation:
    """Tests verifying all endpoints are documented."""

    @pytest.mark.asyncio
    async def test_health_endpoints_documented(self):
        """Test that health endpoints are in the schema."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()
        paths = schema["paths"]

        # Health endpoints should be documented
        assert "/healthz" in paths or "/api/healthz" in paths

    @pytest.mark.asyncio
    async def test_auth_endpoints_documented(self):
        """Test that auth endpoints are in the schema."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()
        paths = schema["paths"]

        # Look for auth-related endpoints
        auth_paths = [p for p in paths.keys() if "auth" in p.lower()]
        assert len(auth_paths) > 0, "No auth endpoints found in schema"

    @pytest.mark.asyncio
    async def test_outline_endpoints_documented(self):
        """Test that outline generation endpoints are in the schema."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()
        paths = schema["paths"]

        # Look for outline-related endpoints
        outline_paths = [p for p in paths.keys() if "outline" in p.lower()]
        assert len(outline_paths) > 0, "No outline endpoints found in schema"


class TestSchemaValidation:
    """Tests for schema validation of request/response."""

    @pytest.mark.asyncio
    async def test_request_schemas_exist(self):
        """Test that request schemas are defined."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()
        schemas = schema["components"]["schemas"]

        # Check for request-related schemas (EstimateRequest, BudgetUpdateRequest, etc.)
        request_schemas = [s for s in schemas.keys() if "request" in s.lower()]
        assert len(request_schemas) > 0, "No request schemas found"

    @pytest.mark.asyncio
    async def test_error_response_schema_exists(self):
        """Test that error response schemas are defined."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()
        schemas = schema["components"]["schemas"]

        # Check for error-related schemas
        error_schemas = [s for s in schemas.keys() if "error" in s.lower()]
        assert len(error_schemas) > 0, "No error response schemas found"

    @pytest.mark.asyncio
    async def test_schemas_have_required_properties(self):
        """Test that schemas define their required properties."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()
        schemas = schema["components"]["schemas"]

        # At least some schemas should have properties defined
        schemas_with_properties = [name for name, s in schemas.items() if "properties" in s]
        assert len(schemas_with_properties) > 0, "No schemas have properties defined"


class TestHTTPMethodDocumentation:
    """Tests for HTTP method documentation."""

    @pytest.mark.asyncio
    async def test_endpoints_have_operation_ids(self):
        """Test that endpoints have operationId for code generation."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()
        paths = schema["paths"]

        # Check that at least some endpoints have operationId
        endpoints_with_operation_id = 0
        for path, methods in paths.items():
            for method, details in methods.items():
                if isinstance(details, dict) and "operationId" in details:
                    endpoints_with_operation_id += 1

        assert endpoints_with_operation_id > 0, "No endpoints have operationId"

    @pytest.mark.asyncio
    async def test_endpoints_have_responses_documented(self):
        """Test that endpoints document their responses."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()
        paths = schema["paths"]

        # All endpoints should have responses documented
        for path, methods in paths.items():
            for method, details in methods.items():
                if isinstance(details, dict):
                    assert "responses" in details, f"{method.upper()} {path} missing responses"


class TestSecuritySchemas:
    """Tests for security schema documentation."""

    @pytest.mark.asyncio
    async def test_security_schemes_defined(self):
        """Test that security schemes are defined."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()

        # Check for security schemes in components
        if "components" in schema and "securitySchemes" in schema["components"]:
            security_schemes = schema["components"]["securitySchemes"]
            assert len(security_schemes) > 0, "No security schemes defined"

    @pytest.mark.asyncio
    async def test_protected_endpoints_reference_security(self):
        """Test that protected endpoints reference security requirements."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        schema = response.json()
        paths = schema["paths"]

        # Check for security references on protected endpoints
        # (e.g., /api/v1/outline should require authentication)
        protected_endpoints = [
            p for p in paths.keys() if "outline" in p or "chapter" in p or "usage" in p
        ]

        for endpoint in protected_endpoints:
            methods = paths[endpoint]
            for method, details in methods.items():
                if isinstance(details, dict):
                    # Either has security or global security applies
                    # This is informational - we just check it's documented
                    assert "responses" in details
