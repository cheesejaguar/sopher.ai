"""Tests for projects API endpoints."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.db import get_db
from app.main import app
from app.models import User
from app.security import get_current_user


@pytest.fixture
def mock_user():
    """Create a mock authenticated user."""
    user = MagicMock(spec=User)
    user.id = uuid4()
    user.email = "test@example.com"
    user.name = "Test User"
    user.role = "author"
    user.monthly_budget_usd = 100.0
    return user


@pytest.fixture
def mock_db_session():
    """Create a mock database session."""
    session = AsyncMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    return session


@pytest.fixture
async def authenticated_client(mock_user, mock_db_session):
    """Create an authenticated async test client."""

    # Create an async generator for the db dependency
    async def override_get_db():
        yield mock_db_session

    # Override dependencies
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = override_get_db

    mock_cache = AsyncMock()
    mock_cache.redis = AsyncMock()
    mock_cache.redis.ping = AsyncMock()

    with (
        patch("app.main.init_db", new_callable=AsyncMock),
        patch("app.main.close_db", new_callable=AsyncMock),
        patch("app.main.cache", mock_cache),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    # Clean up
    app.dependency_overrides.clear()


@pytest.fixture
async def unauthenticated_client():
    """Create an unauthenticated async test client."""
    # Clear any existing overrides
    app.dependency_overrides.clear()

    mock_cache = AsyncMock()
    mock_cache.redis = AsyncMock()
    mock_cache.redis.ping = AsyncMock()

    with (
        patch("app.main.init_db", new_callable=AsyncMock),
        patch("app.main.close_db", new_callable=AsyncMock),
        patch("app.main.cache", mock_cache),
        patch("app.db.engine", new_callable=AsyncMock),
        patch("app.db.AsyncSessionLocal", new_callable=AsyncMock),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


class TestCreateProject:
    """Tests for POST /api/v1/projects"""

    @pytest.mark.asyncio
    async def test_create_project_requires_auth(self, unauthenticated_client):
        """Test that project creation requires authentication."""
        response = await unauthenticated_client.post(
            "/api/v1/projects",
            json={"name": "Test Book"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_create_project_validates_name_empty(self, authenticated_client):
        """Test that empty project name is rejected."""
        response = await authenticated_client.post(
            "/api/v1/projects",
            json={"name": ""},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_project_validates_name_too_long(self, authenticated_client):
        """Test that overly long project name is rejected."""
        response = await authenticated_client.post(
            "/api/v1/projects",
            json={"name": "x" * 201},
        )
        assert response.status_code == 422


class TestListProjects:
    """Tests for GET /api/v1/projects"""

    @pytest.mark.asyncio
    async def test_list_projects_requires_auth(self, unauthenticated_client):
        """Test that listing projects requires authentication."""
        response = await unauthenticated_client.get("/api/v1/projects")
        assert response.status_code == 401


class TestGetProject:
    """Tests for GET /api/v1/projects/{project_id}"""

    @pytest.mark.asyncio
    async def test_get_project_requires_auth(self, unauthenticated_client):
        """Test that getting a project requires authentication."""
        project_id = uuid4()
        response = await unauthenticated_client.get(f"/api/v1/projects/{project_id}")
        assert response.status_code == 401


class TestUpdateProject:
    """Tests for PATCH /api/v1/projects/{project_id}"""

    @pytest.mark.asyncio
    async def test_update_project_requires_auth(self, unauthenticated_client):
        """Test that updating a project requires authentication."""
        project_id = uuid4()
        response = await unauthenticated_client.patch(
            f"/api/v1/projects/{project_id}",
            json={"name": "Updated Name"},
        )
        assert response.status_code == 401


class TestDeleteProject:
    """Tests for DELETE /api/v1/projects/{project_id}"""

    @pytest.mark.asyncio
    async def test_delete_project_requires_auth(self, unauthenticated_client):
        """Test that deleting a project requires authentication."""
        project_id = uuid4()
        response = await unauthenticated_client.delete(f"/api/v1/projects/{project_id}")
        assert response.status_code == 401


class TestProjectSchemaValidation:
    """Tests for project request schema validation."""

    @pytest.mark.asyncio
    async def test_project_brief_min_length(self, authenticated_client):
        """Test that brief has minimum length validation."""
        response = await authenticated_client.post(
            "/api/v1/projects",
            json={
                "name": "Test Book",
                "brief": "short",  # Less than 10 characters
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_project_target_chapters_below_min(self, authenticated_client):
        """Test that target_chapters minimum is validated."""
        response = await authenticated_client.post(
            "/api/v1/projects",
            json={
                "name": "Test Book",
                "target_chapters": 0,  # Should be at least 1
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_project_target_chapters_above_max(self, authenticated_client):
        """Test that target_chapters maximum is validated."""
        response = await authenticated_client.post(
            "/api/v1/projects",
            json={
                "name": "Test Book",
                "target_chapters": 100,  # Should be at most 50
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_project_description_max_length(self, authenticated_client):
        """Test that description has maximum length validation."""
        response = await authenticated_client.post(
            "/api/v1/projects",
            json={
                "name": "Test Book",
                "description": "x" * 2001,  # Max is 2000
            },
        )
        assert response.status_code == 422


class TestProjectEndpointDocumentation:
    """Tests verifying project endpoints are properly documented."""

    @pytest.mark.asyncio
    async def test_projects_endpoints_in_openapi(self, unauthenticated_client):
        """Test that project endpoints appear in OpenAPI schema."""
        response = await unauthenticated_client.get("/openapi.json")
        assert response.status_code == 200

        schema = response.json()
        paths = schema["paths"]

        # Check for project endpoints
        project_paths = [p for p in paths.keys() if "projects" in p]
        assert len(project_paths) > 0, "No project endpoints found in OpenAPI schema"

        # Verify CRUD endpoints exist
        assert "/api/v1/projects" in paths
        assert "/api/v1/projects/{project_id}" in paths
