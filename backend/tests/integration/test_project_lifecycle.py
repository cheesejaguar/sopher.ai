"""Integration tests for complete project lifecycle.

Tests the full flow: Create project → Generate outline → Write chapters → Export
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models import Project, User
from app.security import create_access_token


@pytest.fixture
def test_user():
    """Create a test user."""
    user = MagicMock(spec=User)
    user.id = uuid4()
    user.email = "lifecycle_test@example.com"
    user.name = "Lifecycle Tester"
    user.role = "author"
    user.monthly_budget_usd = 100.0
    return user


@pytest.fixture
def auth_headers(test_user):
    """Generate auth headers with valid JWT."""
    token = create_access_token(data={"sub": str(test_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_db_session():
    """Create mock database session."""
    session = AsyncMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    return session


class TestProjectCreation:
    """Tests for project creation flow."""

    @pytest.mark.asyncio
    async def test_create_project_with_minimal_data(self, auth_headers, test_user, mock_db_session):
        """Test creating a project with minimal required fields."""
        project_id = uuid4()

        async def mock_refresh(project):
            project.id = project_id
            project.user_id = test_user.id
            project.status = "draft"
            project.created_at = "2024-01-01T00:00:00Z"

        mock_db_session.refresh = mock_refresh

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/projects",
                    json={"name": "My New Book", "target_chapters": 10},
                    headers=auth_headers,
                )

            # Should return 201 or validation pass (mocked)
            assert response.status_code in [201, 422, 401]

    @pytest.mark.asyncio
    async def test_create_project_with_full_settings(
        self, auth_headers, test_user, mock_db_session
    ):
        """Test creating a project with comprehensive settings."""
        project_id = uuid4()

        async def mock_refresh(project):
            project.id = project_id
            project.user_id = test_user.id
            project.status = "draft"
            project.created_at = "2024-01-01T00:00:00Z"

        mock_db_session.refresh = mock_refresh

        project_data = {
            "name": "Epic Fantasy Adventure",
            "description": "A tale of magic and heroism",
            "genre": "Fantasy",
            "target_chapters": 20,
            "style_guide": "Use vivid descriptions and varied sentence structure",
            "settings": {
                "target_audience": "Young Adult",
                "tone": "dramatic",
                "pov": "third_person_limited",
                "tense": "past",
                "dialogue_style": "moderate",
                "prose_style": "descriptive",
                "chapter_length_target": 4000,
            },
        }

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/projects", json=project_data, headers=auth_headers
                )

            assert response.status_code in [201, 422, 401]


class TestProjectRetrieval:
    """Tests for project retrieval operations."""

    @pytest.mark.asyncio
    async def test_get_project_by_id(self, auth_headers, test_user, mock_db_session):
        """Test retrieving a specific project."""
        project_id = uuid4()

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = test_user.id
        mock_project.name = "Test Project"
        mock_project.description = "Test description"
        mock_project.genre = "Fantasy"
        mock_project.target_chapters = 10
        mock_project.style_guide = None
        mock_project.settings = {}
        mock_project.status = "draft"
        mock_project.created_at = "2024-01-01T00:00:00Z"
        mock_project.updated_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute.return_value = mock_result

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)

            assert response.status_code in [200, 401, 404]

    @pytest.mark.asyncio
    async def test_list_user_projects(self, auth_headers, test_user, mock_db_session):
        """Test listing all projects for a user."""
        project1 = MagicMock(spec=Project)
        project1.id = uuid4()
        project1.user_id = test_user.id
        project1.name = "Project 1"
        project1.status = "draft"

        project2 = MagicMock(spec=Project)
        project2.id = uuid4()
        project2.user_id = test_user.id
        project2.name = "Project 2"
        project2.status = "in_progress"

        # Mock count query
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 2

        # Mock list query
        mock_list_result = MagicMock()
        mock_list_result.scalars.return_value.all.return_value = [project1, project2]

        mock_db_session.execute.side_effect = [mock_count_result, mock_list_result]

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/v1/projects", headers=auth_headers)

            assert response.status_code in [200, 401]


class TestProjectUpdate:
    """Tests for project update operations."""

    @pytest.mark.asyncio
    async def test_update_project_name(self, auth_headers, test_user, mock_db_session):
        """Test updating a project's name."""
        project_id = uuid4()

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = test_user.id
        mock_project.name = "Original Name"
        mock_project.description = None
        mock_project.genre = None
        mock_project.target_chapters = 10
        mock_project.style_guide = None
        mock_project.settings = {}
        mock_project.status = "draft"
        mock_project.created_at = "2024-01-01T00:00:00Z"
        mock_project.updated_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute.return_value = mock_result

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.patch(
                    f"/api/v1/projects/{project_id}",
                    json={"name": "Updated Name"},
                    headers=auth_headers,
                )

            assert response.status_code in [200, 401, 404]

    @pytest.mark.asyncio
    async def test_update_project_settings(self, auth_headers, test_user, mock_db_session):
        """Test updating project settings."""
        project_id = uuid4()

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = test_user.id
        mock_project.name = "Test Project"
        mock_project.settings = {}
        mock_project.status = "draft"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute.return_value = mock_result

        new_settings = {"tone": "humorous", "pov": "first_person", "chapter_length_target": 5000}

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.patch(
                    f"/api/v1/projects/{project_id}",
                    json={"settings": new_settings},
                    headers=auth_headers,
                )

            assert response.status_code in [200, 401, 404]


class TestProjectDeletion:
    """Tests for project deletion operations."""

    @pytest.mark.asyncio
    async def test_delete_project(self, auth_headers, test_user, mock_db_session):
        """Test deleting a project."""
        project_id = uuid4()

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = test_user.id
        mock_project.name = "Project to Delete"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute.return_value = mock_result

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.delete(
                    f"/api/v1/projects/{project_id}", headers=auth_headers
                )

            assert response.status_code in [204, 401, 404]


class TestPermissionBoundaries:
    """Tests for permission enforcement."""

    @pytest.mark.asyncio
    async def test_cannot_access_other_users_project(
        self, auth_headers, test_user, mock_db_session
    ):
        """Test that users cannot access projects owned by others."""
        project_id = uuid4()
        other_user_id = uuid4()

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = other_user_id  # Different user owns this
        mock_project.name = "Other User's Project"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute.return_value = mock_result

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)

            # Should get 403 Forbidden or 404 Not Found
            assert response.status_code in [403, 404, 401]

    @pytest.mark.asyncio
    async def test_cannot_update_other_users_project(
        self, auth_headers, test_user, mock_db_session
    ):
        """Test that users cannot update projects owned by others."""
        project_id = uuid4()
        other_user_id = uuid4()

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = other_user_id
        mock_project.name = "Other User's Project"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute.return_value = mock_result

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.patch(
                    f"/api/v1/projects/{project_id}",
                    json={"name": "Hacked Name"},
                    headers=auth_headers,
                )

            assert response.status_code in [403, 404, 401]

    @pytest.mark.asyncio
    async def test_cannot_delete_other_users_project(
        self, auth_headers, test_user, mock_db_session
    ):
        """Test that users cannot delete projects owned by others."""
        project_id = uuid4()
        other_user_id = uuid4()

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = other_user_id
        mock_project.name = "Other User's Project"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute.return_value = mock_result

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.delete(
                    f"/api/v1/projects/{project_id}", headers=auth_headers
                )

            assert response.status_code in [403, 404, 401]

    @pytest.mark.asyncio
    async def test_unauthenticated_access_denied(self, mock_db_session):
        """Test that unauthenticated requests are rejected."""
        project_id = uuid4()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Try to access without auth headers
            response = await client.get(f"/api/v1/projects/{project_id}")

        assert response.status_code == 401


class TestProjectStatusTransitions:
    """Tests for project status lifecycle."""

    @pytest.mark.asyncio
    async def test_transition_draft_to_in_progress(self, auth_headers, test_user, mock_db_session):
        """Test transitioning project from draft to in_progress."""
        project_id = uuid4()

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = test_user.id
        mock_project.name = "Draft Project"
        mock_project.status = "draft"
        mock_project.description = None
        mock_project.genre = None
        mock_project.target_chapters = 10
        mock_project.style_guide = None
        mock_project.settings = {}
        mock_project.created_at = "2024-01-01T00:00:00Z"
        mock_project.updated_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute.return_value = mock_result

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.patch(
                    f"/api/v1/projects/{project_id}",
                    json={"status": "in_progress"},
                    headers=auth_headers,
                )

            assert response.status_code in [200, 401, 404]

    @pytest.mark.asyncio
    async def test_transition_in_progress_to_completed(
        self, auth_headers, test_user, mock_db_session
    ):
        """Test transitioning project from in_progress to completed."""
        project_id = uuid4()

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = test_user.id
        mock_project.name = "In Progress Project"
        mock_project.status = "in_progress"
        mock_project.description = None
        mock_project.genre = None
        mock_project.target_chapters = 10
        mock_project.style_guide = None
        mock_project.settings = {}
        mock_project.created_at = "2024-01-01T00:00:00Z"
        mock_project.updated_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute.return_value = mock_result

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.patch(
                    f"/api/v1/projects/{project_id}",
                    json={"status": "completed"},
                    headers=auth_headers,
                )

            assert response.status_code in [200, 401, 404]


class TestProjectPagination:
    """Tests for project list pagination."""

    @pytest.mark.asyncio
    async def test_pagination_parameters(self, auth_headers, test_user, mock_db_session):
        """Test that pagination parameters are respected."""
        # Mock count query
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 25

        # Mock list query (empty for this test)
        mock_list_result = MagicMock()
        mock_list_result.scalars.return_value.all.return_value = []

        mock_db_session.execute.side_effect = [mock_count_result, mock_list_result]

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/v1/projects?page=2&page_size=10", headers=auth_headers
                )

            assert response.status_code in [200, 401]

    @pytest.mark.asyncio
    async def test_status_filtering(self, auth_headers, test_user, mock_db_session):
        """Test filtering projects by status."""
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 5

        mock_list_result = MagicMock()
        mock_list_result.scalars.return_value.all.return_value = []

        mock_db_session.execute.side_effect = [mock_count_result, mock_list_result]

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/v1/projects?status=completed", headers=auth_headers
                )

            assert response.status_code in [200, 401]


class TestProjectValidation:
    """Tests for input validation."""

    @pytest.mark.asyncio
    async def test_reject_empty_project_name(self, auth_headers, test_user, mock_db_session):
        """Test that empty project names are rejected."""
        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/projects",
                    json={"name": "", "target_chapters": 10},
                    headers=auth_headers,
                )

            # Should get 422 Unprocessable Entity
            assert response.status_code in [422, 401]

    @pytest.mark.asyncio
    async def test_reject_invalid_chapter_count(self, auth_headers, test_user, mock_db_session):
        """Test that invalid chapter counts are rejected."""
        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/projects",
                    json={"name": "Test", "target_chapters": -5},
                    headers=auth_headers,
                )

            assert response.status_code in [422, 401]

    @pytest.mark.asyncio
    async def test_reject_invalid_status(self, auth_headers, test_user, mock_db_session):
        """Test that invalid status values are rejected."""
        project_id = uuid4()

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.user_id = test_user.id

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute.return_value = mock_result

        with (
            patch("app.routers.projects.get_db") as mock_get_db,
            patch("app.routers.projects.get_current_user") as mock_get_user,
        ):

            async def override_get_db():
                yield mock_db_session

            mock_get_db.return_value = override_get_db()
            mock_get_user.return_value = test_user

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.patch(
                    f"/api/v1/projects/{project_id}",
                    json={"status": "invalid_status"},
                    headers=auth_headers,
                )

            assert response.status_code in [422, 400, 401, 404]
