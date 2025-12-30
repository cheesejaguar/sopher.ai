"""Tests for project service layer."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import Project, User
from app.schemas import ProjectCreate, ProjectSettings, ProjectUpdate
from app.services.project_service import (
    ProjectNotFoundError,
    ProjectPermissionError,
    ProjectService,
    ProjectServiceError,
)


@pytest.fixture
def mock_user():
    """Create a mock user."""
    user = MagicMock(spec=User)
    user.id = uuid4()
    user.email = "test@example.com"
    return user


@pytest.fixture
def mock_project(mock_user):
    """Create a mock project."""
    project = MagicMock(spec=Project)
    project.id = uuid4()
    project.user_id = mock_user.id
    project.name = "Test Project"
    project.description = "Test Description"
    project.brief = "Test brief for the book"
    project.genre = "Fantasy"
    project.target_chapters = 10
    project.style_guide = None
    project.settings = {}
    project.status = "draft"
    return project


@pytest.fixture
def mock_db():
    """Create a mock database session."""
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.delete = AsyncMock()
    db.execute = AsyncMock()
    return db


class TestProjectServiceCreate:
    """Tests for project creation."""

    @pytest.mark.asyncio
    async def test_create_project_success(self, mock_db, mock_user):
        """Test successful project creation."""
        service = ProjectService(mock_db)

        project_data = ProjectCreate(
            name="My New Book",
            description="A thrilling adventure",
            genre="Fantasy",
            target_chapters=12,
        )

        # Mock refresh to set attributes
        async def mock_refresh(project):
            project.id = uuid4()
            project.status = "draft"

        mock_db.refresh = mock_refresh

        result = await service.create_project(mock_user, project_data)

        assert result.name == "My New Book"
        assert mock_db.add.called
        assert mock_db.commit.called

    @pytest.mark.asyncio
    async def test_create_project_with_settings(self, mock_db, mock_user):
        """Test project creation with custom settings."""
        service = ProjectService(mock_db)

        project_data = ProjectCreate(
            name="Custom Book",
            settings={"custom_key": "custom_value"},
        )

        async def mock_refresh(project):
            project.id = uuid4()
            project.status = "draft"

        mock_db.refresh = mock_refresh

        result = await service.create_project(mock_user, project_data)

        assert result.settings == {"custom_key": "custom_value"}


class TestProjectServiceGet:
    """Tests for getting projects."""

    @pytest.mark.asyncio
    async def test_get_project_success(self, mock_db, mock_user, mock_project):
        """Test successful project retrieval."""
        service = ProjectService(mock_db)

        # Mock execute to return the project
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db.execute.return_value = mock_result

        result = await service.get_project(mock_project.id, mock_user)

        assert result.id == mock_project.id
        assert result.name == mock_project.name

    @pytest.mark.asyncio
    async def test_get_project_not_found(self, mock_db, mock_user):
        """Test project not found error."""
        service = ProjectService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        with pytest.raises(ProjectNotFoundError):
            await service.get_project(uuid4(), mock_user)

    @pytest.mark.asyncio
    async def test_get_project_permission_denied(self, mock_db, mock_user, mock_project):
        """Test permission denied when user doesn't own project."""
        service = ProjectService(mock_db)

        # Create a different user
        other_user = MagicMock(spec=User)
        other_user.id = uuid4()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db.execute.return_value = mock_result

        with pytest.raises(ProjectPermissionError):
            await service.get_project(mock_project.id, other_user)


class TestProjectServiceList:
    """Tests for listing projects."""

    @pytest.mark.asyncio
    async def test_list_projects_success(self, mock_db, mock_user, mock_project):
        """Test successful project listing."""
        service = ProjectService(mock_db)

        # Mock count query
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 1

        # Mock list query
        mock_list_result = MagicMock()
        mock_list_result.scalars.return_value.all.return_value = [mock_project]

        mock_db.execute.side_effect = [mock_count_result, mock_list_result]

        projects, total = await service.list_projects(mock_user)

        assert total == 1
        assert len(projects) == 1
        assert projects[0].id == mock_project.id

    @pytest.mark.asyncio
    async def test_list_projects_with_status_filter(self, mock_db, mock_user):
        """Test project listing with status filter."""
        service = ProjectService(mock_db)

        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 0

        mock_list_result = MagicMock()
        mock_list_result.scalars.return_value.all.return_value = []

        mock_db.execute.side_effect = [mock_count_result, mock_list_result]

        projects, total = await service.list_projects(mock_user, status_filter="completed")

        assert total == 0
        assert len(projects) == 0

    @pytest.mark.asyncio
    async def test_list_projects_pagination(self, mock_db, mock_user):
        """Test project listing with pagination."""
        service = ProjectService(mock_db)

        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 25

        mock_list_result = MagicMock()
        mock_list_result.scalars.return_value.all.return_value = []

        mock_db.execute.side_effect = [mock_count_result, mock_list_result]

        projects, total = await service.list_projects(mock_user, page=2, page_size=10)

        assert total == 25
        # Verify pagination was applied (offset would be 10)


class TestProjectServiceUpdate:
    """Tests for updating projects."""

    @pytest.mark.asyncio
    async def test_update_project_success(self, mock_db, mock_user, mock_project):
        """Test successful project update."""
        service = ProjectService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db.execute.return_value = mock_result

        update_data = ProjectUpdate(name="Updated Name")

        result = await service.update_project(mock_project.id, mock_user, update_data)

        assert mock_db.commit.called
        assert result.name == "Updated Name"

    @pytest.mark.asyncio
    async def test_update_project_partial(self, mock_db, mock_user, mock_project):
        """Test partial project update."""
        service = ProjectService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db.execute.return_value = mock_result

        update_data = ProjectUpdate(genre="Science Fiction")

        result = await service.update_project(mock_project.id, mock_user, update_data)

        assert result.genre == "Science Fiction"
        # Original name should be unchanged
        assert result.name == "Test Project"


class TestProjectServiceDelete:
    """Tests for deleting projects."""

    @pytest.mark.asyncio
    async def test_delete_project_success(self, mock_db, mock_user, mock_project):
        """Test successful project deletion."""
        service = ProjectService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db.execute.return_value = mock_result

        await service.delete_project(mock_project.id, mock_user)

        assert mock_db.delete.called
        assert mock_db.commit.called

    @pytest.mark.asyncio
    async def test_delete_project_not_found(self, mock_db, mock_user):
        """Test delete on non-existent project."""
        service = ProjectService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        with pytest.raises(ProjectNotFoundError):
            await service.delete_project(uuid4(), mock_user)


class TestProjectServiceSettings:
    """Tests for project settings operations."""

    @pytest.mark.asyncio
    async def test_update_project_settings(self, mock_db, mock_user, mock_project):
        """Test updating project settings with ProjectSettings schema."""
        service = ProjectService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db.execute.return_value = mock_result

        settings = ProjectSettings(
            tone="humorous",
            pov="first_person",
            chapter_length_target=4000,
        )

        result = await service.update_project_settings(mock_project.id, mock_user, settings)

        assert mock_db.commit.called
        assert result.settings["tone"] == "humorous"
        assert result.settings["pov"] == "first_person"


class TestProjectServiceStats:
    """Tests for project statistics."""

    @pytest.mark.asyncio
    async def test_get_project_stats(self, mock_db, mock_user, mock_project):
        """Test getting project statistics."""
        service = ProjectService(mock_db)

        # Mock project query
        mock_project_result = MagicMock()
        mock_project_result.scalar_one_or_none.return_value = mock_project

        # Mock session count
        mock_session_count = MagicMock()
        mock_session_count.scalar.return_value = 3

        # Mock session IDs
        mock_session_ids = MagicMock()
        mock_session_ids.fetchall.return_value = [(uuid4(),), (uuid4(),), (uuid4(),)]

        # Mock artifact count
        mock_artifact_count = MagicMock()
        mock_artifact_count.scalar.return_value = 10

        # Mock cost sum
        mock_cost_sum = MagicMock()
        mock_cost_sum.scalar.return_value = 5.50

        mock_db.execute.side_effect = [
            mock_project_result,
            mock_session_count,
            mock_session_ids,
            mock_artifact_count,
            mock_cost_sum,
        ]

        stats = await service.get_project_stats(mock_project.id, mock_user)

        assert stats["session_count"] == 3
        assert stats["artifact_count"] == 10
        assert stats["total_cost_usd"] == 5.50
        assert stats["status"] == "draft"


class TestProjectServiceStatus:
    """Tests for project status changes."""

    @pytest.mark.asyncio
    async def test_change_project_status_success(self, mock_db, mock_user, mock_project):
        """Test successful status change."""
        service = ProjectService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db.execute.return_value = mock_result

        result = await service.change_project_status(mock_project.id, mock_user, "in_progress")

        assert result.status == "in_progress"
        assert mock_db.commit.called

    @pytest.mark.asyncio
    async def test_change_project_status_invalid(self, mock_db, mock_user, mock_project):
        """Test invalid status change."""
        service = ProjectService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db.execute.return_value = mock_result

        with pytest.raises(ProjectServiceError) as exc_info:
            await service.change_project_status(mock_project.id, mock_user, "invalid_status")

        assert "Invalid status" in str(exc_info.value)


class TestProjectServicePermissions:
    """Tests for permission checking."""

    @pytest.mark.asyncio
    async def test_verify_ownership_success(self, mock_db, mock_user, mock_project):
        """Test ownership verification passes for owner."""
        service = ProjectService(mock_db)

        # Should not raise
        service._verify_ownership(mock_project, mock_user)

    @pytest.mark.asyncio
    async def test_verify_ownership_failure(self, mock_db, mock_project):
        """Test ownership verification fails for non-owner."""
        service = ProjectService(mock_db)

        other_user = MagicMock(spec=User)
        other_user.id = uuid4()

        with pytest.raises(ProjectPermissionError):
            service._verify_ownership(mock_project, other_user)
