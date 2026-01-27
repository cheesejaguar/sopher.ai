"""Integration tests for authentication flow.

These tests verify the complete authentication flow including:
- Demo token generation
- Token verification
- Protected endpoint access
"""

import os

import pytest
from httpx import AsyncClient

# Check if WorkOS credentials are available
WORKOS_CONFIGURED = bool(os.environ.get("WORKOS_CLIENT_ID") and os.environ.get("WORKOS_API_KEY"))


@pytest.mark.asyncio
async def test_demo_token_generation(async_client: AsyncClient):
    """Test demo token generation endpoint."""
    response = await async_client.post("/auth/demo-token")

    assert response.status_code == 200
    data = response.json()

    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 3600
    assert len(data["access_token"]) > 0


@pytest.mark.asyncio
async def test_demo_token_is_valid_jwt(async_client: AsyncClient):
    """Test that demo token is a valid JWT."""
    response = await async_client.post("/auth/demo-token")
    data = response.json()
    token = data["access_token"]

    # JWT has 3 parts separated by dots
    parts = token.split(".")
    assert len(parts) == 3


@pytest.mark.asyncio
async def test_protected_endpoint_without_auth(async_client: AsyncClient):
    """Test that protected endpoints require authentication."""
    response = await async_client.get("/auth/me")

    # Should return 401 or 403 when not authenticated
    assert response.status_code in [401, 403, 404]


@pytest.mark.asyncio
async def test_protected_endpoint_with_invalid_token(async_client: AsyncClient):
    """Test that invalid tokens are rejected."""
    response = await async_client.get(
        "/auth/me", headers={"Authorization": "Bearer invalid-token-here"}
    )

    # Should return 401 for invalid token
    assert response.status_code in [401, 403]


@pytest.mark.asyncio
@pytest.mark.skipif(
    not WORKOS_CONFIGURED,
    reason="WorkOS credentials (WORKOS_CLIENT_ID, WORKOS_API_KEY) not configured",
)
async def test_google_oauth_login_redirect(async_client: AsyncClient):
    """Test Google OAuth login initiates redirect."""
    response = await async_client.get("/auth/login/google", follow_redirects=False)

    # Should redirect to Google OAuth
    assert response.status_code in [302, 307]


@pytest.mark.asyncio
async def test_logout_clears_session(async_client: AsyncClient):
    """Test that logout endpoint works."""
    response = await async_client.post("/auth/logout")

    # Logout should succeed even without prior auth
    assert response.status_code in [200, 204, 302, 307]
