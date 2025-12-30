"""Project service layer for business logic operations."""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Artifact, Cost, Project, Session, User
from app.schemas import ProjectCreate, ProjectSettings, ProjectUpdate


class ProjectServiceError(Exception):
    """Base exception for project service errors."""

    pass


class ProjectNotFoundError(ProjectServiceError):
    """Raised when a project is not found."""

    pass


class ProjectPermissionError(ProjectServiceError):
    """Raised when user doesn't have permission to access a project."""

    pass


class ProjectService:
    """Service layer for project operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_project(
        self,
        user: User,
        project_data: ProjectCreate,
    ) -> Project:
        """Create a new project for a user."""
        project = Project(
            user_id=user.id,
            name=project_data.name,
            description=project_data.description,
            brief=project_data.brief,
            genre=project_data.genre,
            target_chapters=project_data.target_chapters,
            style_guide=project_data.style_guide,
            settings=project_data.settings,
            status="draft",
        )
        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def get_project(
        self,
        project_id: UUID,
        user: User,
    ) -> Project:
        """Get a project by ID, verifying ownership."""
        project = await self._get_project_by_id(project_id)
        self._verify_ownership(project, user)
        return project

    async def list_projects(
        self,
        user: User,
        page: int = 1,
        page_size: int = 10,
        status_filter: Optional[str] = None,
    ) -> tuple[List[Project], int]:
        """List all projects for a user with pagination."""
        query = select(Project).where(Project.user_id == user.id)

        if status_filter:
            query = query.where(Project.status == status_filter)

        query = query.order_by(Project.created_at.desc())

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        result = await self.db.execute(count_query)
        total = result.scalar() or 0

        # Paginate
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await self.db.execute(query)
        projects = list(result.scalars().all())

        return projects, total

    async def update_project(
        self,
        project_id: UUID,
        user: User,
        project_data: ProjectUpdate,
    ) -> Project:
        """Update a project, verifying ownership."""
        project = await self._get_project_by_id(project_id)
        self._verify_ownership(project, user)

        # Update only provided fields
        update_data = project_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(project, field, value)

        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def delete_project(
        self,
        project_id: UUID,
        user: User,
    ) -> None:
        """Delete a project and all associated data."""
        project = await self._get_project_by_id(project_id)
        self._verify_ownership(project, user)

        # Delete is cascaded through SQLAlchemy relationships
        await self.db.delete(project)
        await self.db.commit()

    async def update_project_settings(
        self,
        project_id: UUID,
        user: User,
        settings: ProjectSettings,
    ) -> Project:
        """Update project settings with validated ProjectSettings."""
        project = await self._get_project_by_id(project_id)
        self._verify_ownership(project, user)

        # Convert ProjectSettings to dict for JSONB storage
        project.settings = settings.model_dump()
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def get_project_stats(
        self,
        project_id: UUID,
        user: User,
    ) -> dict:
        """Get statistics for a project."""
        project = await self._get_project_by_id(project_id)
        self._verify_ownership(project, user)

        # Count sessions
        session_query = select(func.count()).where(Session.project_id == project_id)
        session_result = await self.db.execute(session_query)
        session_count = session_result.scalar() or 0

        # Get session IDs for artifact/cost queries
        session_ids_query = select(Session.id).where(Session.project_id == project_id)
        session_ids_result = await self.db.execute(session_ids_query)
        session_ids = [row[0] for row in session_ids_result.fetchall()]

        artifact_count = 0
        total_cost = 0.0

        if session_ids:
            # Count artifacts
            artifact_query = select(func.count()).where(Artifact.session_id.in_(session_ids))
            artifact_result = await self.db.execute(artifact_query)
            artifact_count = artifact_result.scalar() or 0

            # Sum costs
            cost_query = select(func.sum(Cost.usd)).where(Cost.session_id.in_(session_ids))
            cost_result = await self.db.execute(cost_query)
            total_cost = float(cost_result.scalar() or 0)

        return {
            "project_id": str(project_id),
            "session_count": session_count,
            "artifact_count": artifact_count,
            "total_cost_usd": total_cost,
            "status": project.status,
        }

    async def change_project_status(
        self,
        project_id: UUID,
        user: User,
        new_status: str,
    ) -> Project:
        """Change project status with validation."""
        valid_statuses = ["draft", "in_progress", "completed"]
        if new_status not in valid_statuses:
            raise ProjectServiceError(
                f"Invalid status '{new_status}'. Must be one of: {valid_statuses}"
            )

        project = await self._get_project_by_id(project_id)
        self._verify_ownership(project, user)

        project.status = new_status
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def _get_project_by_id(self, project_id: UUID) -> Project:
        """Get a project by ID or raise NotFound."""
        query = select(Project).where(Project.id == project_id)
        result = await self.db.execute(query)
        project = result.scalar_one_or_none()

        if not project:
            raise ProjectNotFoundError(f"Project {project_id} not found")

        return project

    def _verify_ownership(self, project: Project, user: User) -> None:
        """Verify that user owns the project."""
        if project.user_id != user.id:
            raise ProjectPermissionError(
                f"User {user.id} does not have access to project {project.id}"
            )
