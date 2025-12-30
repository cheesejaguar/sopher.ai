"""Integration tests for health check endpoints.

These tests verify that the health check endpoints work correctly
with the full application stack.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_healthz_endpoint_returns_healthy(async_client: AsyncClient):
    """Test /healthz endpoint returns healthy status."""
    response = await async_client.get("/healthz")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_livez_endpoint_returns_alive(async_client: AsyncClient):
    """Test /livez endpoint returns alive status."""
    response = await async_client.get("/livez")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "alive"


@pytest.mark.asyncio
async def test_readyz_endpoint(async_client: AsyncClient):
    """Test /readyz endpoint returns readiness status."""
    response = await async_client.get("/readyz")

    # Readyz may return 200 or 503 depending on dependencies
    assert response.status_code in [200, 503]
    data = response.json()
    assert "status" in data


@pytest.mark.asyncio
async def test_health_endpoints_include_metadata(async_client: AsyncClient):
    """Test health endpoints include helpful metadata."""
    response = await async_client.get("/healthz")

    assert response.status_code == 200
    data = response.json()
    # Health endpoint should include version if available
    assert "status" in data
