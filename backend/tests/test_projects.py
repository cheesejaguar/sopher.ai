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
    test_user_id = uuid4()
    user.id = test_user_id
    user.user_id = test_user_id  # API routes use user_id attribute
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


class TestProjectCRUDOperations:
    """Tests for successful CRUD operations on projects."""

    @pytest.mark.asyncio
    async def test_create_project_success(self, mock_user, mock_db_session):
        """Test successful project creation."""
        from datetime import datetime, timezone

        from app.routers.projects import create_project
        from app.schemas import ProjectCreate

        # Create project data
        project_data = ProjectCreate(
            name="My Fantasy Book",
            description="A story about dragons",
            brief="A young wizard discovers they have the power to talk to dragons.",
            genre="fantasy",
            target_chapters=12,
        )

        # Mock the database refresh to set all required fields
        async def mock_refresh(obj):
            obj.id = uuid4()
            obj.created_at = datetime.now(timezone.utc)
            obj.updated_at = datetime.now(timezone.utc)

        mock_db_session.refresh = mock_refresh

        # Call the endpoint function directly
        result = await create_project(
            project_data=project_data,
            current_user=mock_user,
            db=mock_db_session,
        )

        # Verify the result
        assert result.name == "My Fantasy Book"
        assert result.genre == "fantasy"
        assert mock_db_session.add.called
        assert mock_db_session.commit.called

    @pytest.mark.asyncio
    async def test_list_projects_success(self, mock_user, mock_db_session):
        """Test successful project listing."""
        from datetime import datetime, timezone

        from app.models import Project
        from app.routers.projects import list_projects

        # Create mock projects with all required fields
        mock_project = MagicMock(spec=Project)
        mock_project.id = uuid4()
        mock_project.user_id = mock_user.id
        mock_project.name = "Test Project"
        mock_project.description = "A test project"
        mock_project.brief = None
        mock_project.genre = "fiction"
        mock_project.target_chapters = 10
        mock_project.style_guide = None
        mock_project.settings = {}
        mock_project.status = "draft"
        mock_project.created_at = datetime.now(timezone.utc)
        mock_project.updated_at = datetime.now(timezone.utc)

        # Set up mock responses
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 1

        mock_list_result = MagicMock()
        mock_list_result.scalars.return_value.all.return_value = [mock_project]

        mock_db_session.execute = AsyncMock(side_effect=[mock_count_result, mock_list_result])

        # Call the endpoint
        result = await list_projects(
            page=1,
            page_size=10,
            status_filter=None,
            current_user=mock_user,
            db=mock_db_session,
        )

        # Verify the result
        assert result.total == 1
        assert result.page == 1
        assert len(result.projects) == 1
        assert result.projects[0].name == "Test Project"

    @pytest.mark.asyncio
    async def test_list_projects_with_status_filter(self, mock_user, mock_db_session):
        """Test project listing with status filter."""
        from app.routers.projects import list_projects

        # Set up mock responses for empty result
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 0

        mock_list_result = MagicMock()
        mock_list_result.scalars.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(side_effect=[mock_count_result, mock_list_result])

        # Call the endpoint with status filter
        result = await list_projects(
            page=1,
            page_size=10,
            status_filter="completed",
            current_user=mock_user,
            db=mock_db_session,
        )

        # Verify the result
        assert result.total == 0
        assert len(result.projects) == 0

    @pytest.mark.asyncio
    async def test_get_project_success(self, mock_user, mock_db_session):
        """Test successful project retrieval."""
        from datetime import datetime, timezone

        from app.models import Project
        from app.routers.projects import get_project

        # Create a mock project with all required fields
        project_id = uuid4()
        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = mock_user.id
        mock_project.name = "Test Project"
        mock_project.description = "A test project"
        mock_project.brief = None
        mock_project.genre = "fiction"
        mock_project.target_chapters = 10
        mock_project.style_guide = None
        mock_project.settings = {}
        mock_project.status = "draft"
        mock_project.created_at = datetime.now(timezone.utc)
        mock_project.updated_at = datetime.now(timezone.utc)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        # Call the endpoint
        result = await get_project(
            project_id=project_id,
            current_user=mock_user,
            db=mock_db_session,
        )

        # Verify the result
        assert result.id == project_id
        assert result.name == "Test Project"

    @pytest.mark.asyncio
    async def test_get_project_not_found(self, mock_user, mock_db_session):
        """Test project retrieval when project doesn't exist."""
        from fastapi import HTTPException

        from app.routers.projects import get_project

        project_id = uuid4()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        # Call the endpoint - should raise HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await get_project(
                project_id=project_id,
                current_user=mock_user,
                db=mock_db_session,
            )

        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_update_project_success(self, mock_user, mock_db_session):
        """Test successful project update."""
        from datetime import datetime, timezone

        from app.models import Project
        from app.routers.projects import update_project
        from app.schemas import ProjectUpdate

        # Create a mock project with all required fields
        project_id = uuid4()
        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = mock_user.id
        mock_project.name = "Test Project"
        mock_project.description = "A test project"
        mock_project.brief = None
        mock_project.genre = "fiction"
        mock_project.target_chapters = 10
        mock_project.style_guide = None
        mock_project.settings = {}
        mock_project.status = "draft"
        mock_project.created_at = datetime.now(timezone.utc)
        mock_project.updated_at = datetime.now(timezone.utc)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        # Mock refresh to update the object
        async def mock_refresh(obj):
            obj.updated_at = datetime.now(timezone.utc)

        mock_db_session.refresh = mock_refresh

        # Create update data
        update_data = ProjectUpdate(name="Updated Project Name")

        # Call the endpoint
        await update_project(
            project_id=project_id,
            project_data=update_data,
            current_user=mock_user,
            db=mock_db_session,
        )

        # Verify the result
        assert mock_db_session.commit.called

    @pytest.mark.asyncio
    async def test_update_project_not_found(self, mock_user, mock_db_session):
        """Test project update when project doesn't exist."""
        from fastapi import HTTPException

        from app.routers.projects import update_project
        from app.schemas import ProjectUpdate

        project_id = uuid4()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        update_data = ProjectUpdate(name="Updated Name")

        # Call the endpoint - should raise HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await update_project(
                project_id=project_id,
                project_data=update_data,
                current_user=mock_user,
                db=mock_db_session,
            )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_project_success(self, mock_user, mock_db_session):
        """Test successful project deletion."""
        from app.models import Project
        from app.routers.projects import delete_project

        # Create a mock project
        project_id = uuid4()
        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = mock_user.id

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        # Call the endpoint
        await delete_project(
            project_id=project_id,
            current_user=mock_user,
            db=mock_db_session,
        )

        # Verify deletion was called
        mock_db_session.delete.assert_called_with(mock_project)
        assert mock_db_session.commit.called

    @pytest.mark.asyncio
    async def test_delete_project_not_found(self, mock_user, mock_db_session):
        """Test project deletion when project doesn't exist."""
        from fastapi import HTTPException

        from app.routers.projects import delete_project

        project_id = uuid4()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        # Call the endpoint - should raise HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await delete_project(
                project_id=project_id,
                current_user=mock_user,
                db=mock_db_session,
            )

        assert exc_info.value.status_code == 404
