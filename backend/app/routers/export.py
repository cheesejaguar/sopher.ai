"""
Export router for generating publication-ready manuscript exports.

Provides endpoints for:
- Generating exports in various formats (DOCX, PDF, EPUB, Markdown, plain text)
- Downloading generated exports
- Getting export status and history
"""

import logging
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.errors import ErrorCode
from app.models import Artifact, Project, Session
from app.security import TokenData, get_current_user

# Import export services to ensure they're registered
from app.services import (
    export_docx,  # noqa: F401
    export_epub,  # noqa: F401
    export_pdf,  # noqa: F401
)
from app.services.exporters.base import ExporterRegistry
from app.services.exporters.base import ExportFormat as ServiceExportFormat
from app.services.manuscript_assembly import (
    ChapterContent,
    CopyrightContent,
    DedicationContent,
    EpigraphContent,
    Manuscript,
    TitlePageContent,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/export", tags=["export"])


# ============================================================================
# In-memory export storage (temporary solution)
# In production, this would be stored in a database or cache
# ============================================================================

_export_jobs: dict[str, dict] = {}


# ============================================================================
# Helper Functions
# ============================================================================


async def get_project_outline(db: AsyncSession, project_id: UUID) -> Optional[str]:
    """Retrieve the latest outline artifact for a project.

    Following the pattern from chapters.py for consistent artifact retrieval.

    Args:
        db: Database session
        project_id: Project UUID

    Returns:
        Decoded outline content or None if not found
    """
    result = await db.execute(
        select(Artifact)
        .join(Session, Session.id == Artifact.session_id)
        .where(Session.project_id == project_id)
        .where(Artifact.kind == "outline")
        .order_by(Artifact.created_at.desc())
        .limit(1)
    )
    artifact = result.scalar_one_or_none()
    if artifact and artifact.blob:
        try:
            return artifact.blob.decode("utf-8")
        except UnicodeDecodeError:
            logger.warning(f"Failed to decode outline for project {project_id}")
            return None
    return None


async def get_all_project_artifacts(
    db: AsyncSession, project_id: UUID, kinds: Optional[list[str]] = None
) -> dict[str, list[Artifact]]:
    """Retrieve all artifacts for a project, grouped by kind.

    Useful for comprehensive export that may include outline, style guide,
    character bible, and other project content.

    Args:
        db: Database session
        project_id: Project UUID
        kinds: Optional list of artifact kinds to include (default: all)

    Returns:
        Dictionary mapping artifact kind to list of artifacts
    """
    query = (
        select(Artifact)
        .join(Session, Session.id == Artifact.session_id)
        .where(Session.project_id == project_id)
        .order_by(Artifact.created_at.desc())
    )

    if kinds:
        query = query.where(Artifact.kind.in_(kinds))

    result = await db.execute(query)
    artifacts = result.scalars().all()

    # Group by kind
    artifacts_by_kind: dict[str, list[Artifact]] = {}
    for artifact in artifacts:
        kind = artifact.kind
        if kind not in artifacts_by_kind:
            artifacts_by_kind[kind] = []
        artifacts_by_kind[kind].append(artifact)

    logger.debug(
        f"Retrieved {sum(len(v) for v in artifacts_by_kind.values())} artifacts "
        f"for project {project_id}: {list(artifacts_by_kind.keys())}"
    )

    return artifacts_by_kind


def decode_artifact_content(artifact: Artifact) -> str:
    """Safely decode artifact blob content to string.

    Args:
        artifact: The artifact to decode

    Returns:
        Decoded content string, or empty string if decoding fails
    """
    if not artifact.blob:
        return ""

    try:
        return artifact.blob.decode("utf-8")
    except UnicodeDecodeError:
        logger.warning(
            f"Failed to decode artifact {artifact.id} (kind={artifact.kind}), "
            "falling back to latin-1"
        )
        try:
            return artifact.blob.decode("latin-1")
        except Exception:
            logger.error(f"Failed to decode artifact {artifact.id} with any encoding")
            return ""


async def get_chapter_artifacts(
    db: AsyncSession, project_id: UUID, chapter_numbers: Optional[list[int]] = None
) -> list[Artifact]:
    """Retrieve chapter artifacts for a project.

    Queries the Artifact table where kind='chapter', orders by chapter_number,
    and returns the latest version of each chapter (handling regenerations).

    Args:
        db: Database session
        project_id: Project UUID
        chapter_numbers: Optional list of specific chapter numbers to include

    Returns:
        List of chapter artifacts ordered by chapter number
    """
    query = (
        select(Artifact)
        .join(Session, Session.id == Artifact.session_id)
        .where(Session.project_id == project_id)
        .where(Artifact.kind == "chapter")
        .order_by(Artifact.meta["chapter_number"].astext.cast(int))
    )

    result = await db.execute(query)
    artifacts = result.scalars().all()

    # Group by chapter number and take latest of each
    chapters_dict: dict[int, Artifact] = {}
    for artifact in artifacts:
        ch_num = artifact.meta.get("chapter_number", 0)

        # Filter by chapter_numbers if specified
        if chapter_numbers is not None and ch_num not in chapter_numbers:
            continue

        if ch_num not in chapters_dict or artifact.created_at > chapters_dict[ch_num].created_at:
            chapters_dict[ch_num] = artifact

    # Log aggregation results
    logger.debug(
        f"Aggregated {len(chapters_dict)} chapters for project {project_id} "
        f"(from {len(artifacts)} total chapter artifacts)"
    )

    return sorted(chapters_dict.values(), key=lambda a: a.meta.get("chapter_number", 0))


async def build_manuscript(
    project: Project,
    chapter_artifacts: list[Artifact],
    request: "ExportRequest",
) -> Manuscript:
    """Build a Manuscript object from project data and chapter artifacts.

    Aggregates all chapter content from artifacts, decodes blob content,
    and assembles into a complete Manuscript with front/back matter.

    Args:
        project: The project
        chapter_artifacts: List of chapter artifacts (from get_chapter_artifacts)
        request: Export request with front/back matter options

    Returns:
        Assembled Manuscript object ready for export
    """
    # Determine author name
    author_name = request.author_name
    if not author_name and project.settings:
        author_name = project.settings.get("author_name")

    # Determine title
    title = request.custom_title or project.name

    # Build chapter content from artifacts
    # Each artifact contains: kind='chapter', meta with chapter_number and title, blob with content
    chapters: list[ChapterContent] = []
    for artifact in chapter_artifacts:
        ch_num = artifact.meta.get("chapter_number", 0)
        ch_title = artifact.meta.get("title", f"Chapter {ch_num}")

        # Safely decode chapter content using helper function
        content = decode_artifact_content(artifact)

        # Log any empty chapters for debugging
        if not content:
            logger.warning(
                f"Empty content for chapter {ch_num} in project {project.id}"
            )

        chapters.append(
            ChapterContent(
                number=ch_num,
                title=ch_title,
                content=content,
                word_count=len(content.split()) if content else 0,
            )
        )

    logger.info(
        f"Built manuscript with {len(chapters)} chapters, "
        f"{sum(ch.word_count for ch in chapters)} total words"
    )

    # Build manuscript
    manuscript = Manuscript(
        title=title,
        author_name=author_name,
        chapters=chapters,
    )

    # Add front matter
    front = request.front_matter
    if front.include_title_page:
        manuscript.title_page = TitlePageContent(
            title=title,
            author_name=author_name,
        )

    if front.include_copyright:
        manuscript.copyright_page = CopyrightContent(
            author_name=author_name,
            year=datetime.now().year,
        )

    if front.include_dedication and front.dedication_text:
        manuscript.dedication = DedicationContent(text=front.dedication_text)

    if front.include_epigraph and front.epigraph_text:
        manuscript.epigraph = EpigraphContent(
            text=front.epigraph_text,
            attribution=front.epigraph_attribution,
        )

    if front.include_acknowledgments and front.acknowledgments_text:
        manuscript.acknowledgments = front.acknowledgments_text

    # Add back matter
    back = request.back_matter
    if back.include_author_bio and back.author_bio_text:
        from app.services.manuscript_assembly import AuthorBioContent

        manuscript.author_bio = AuthorBioContent(text=back.author_bio_text)

    if back.include_also_by and back.also_by_titles:
        from app.services.manuscript_assembly import AlsoByContent

        manuscript.also_by = AlsoByContent(
            author_name=author_name or "Author",
            titles=back.also_by_titles,
        )

    if back.include_excerpt and back.excerpt_text and back.excerpt_title:
        from app.services.manuscript_assembly import ExcerptContent

        manuscript.excerpt = ExcerptContent(
            book_title=back.excerpt_title,
            text=back.excerpt_text,
        )

    return manuscript


def map_export_format(format: "ExportFormat") -> ServiceExportFormat:
    """Map router ExportFormat to service ExportFormat."""
    format_map = {
        "docx": ServiceExportFormat.DOCX,
        "pdf": ServiceExportFormat.PDF,
        "epub": ServiceExportFormat.EPUB,
        "markdown": ServiceExportFormat.MARKDOWN,
        "text": ServiceExportFormat.TEXT,
    }
    return format_map.get(format.value, ServiceExportFormat.TEXT)


# ============================================================================
# Enums and Constants
# ============================================================================


class ExportFormat(str, Enum):
    """Supported export formats."""

    DOCX = "docx"
    PDF = "pdf"
    EPUB = "epub"
    MARKDOWN = "markdown"
    TEXT = "text"


class ExportStatus(str, Enum):
    """Export job status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# ============================================================================
# Request/Response Schemas
# ============================================================================


class FrontMatterOptions(BaseModel):
    """Options for front matter generation."""

    include_title_page: bool = Field(default=True)
    include_copyright: bool = Field(default=True)
    include_dedication: bool = Field(default=False)
    dedication_text: Optional[str] = Field(None, max_length=1000)
    include_acknowledgments: bool = Field(default=False)
    acknowledgments_text: Optional[str] = Field(None, max_length=5000)
    include_epigraph: bool = Field(default=False)
    epigraph_text: Optional[str] = Field(None, max_length=500)
    epigraph_attribution: Optional[str] = Field(None, max_length=200)


class BackMatterOptions(BaseModel):
    """Options for back matter generation."""

    include_author_bio: bool = Field(default=False)
    author_bio_text: Optional[str] = Field(None, max_length=2000)
    include_also_by: bool = Field(default=False)
    also_by_titles: list[str] = Field(default_factory=list)
    include_excerpt: bool = Field(default=False)
    excerpt_title: Optional[str] = Field(None, max_length=200)
    excerpt_text: Optional[str] = Field(None, max_length=10000)


class TableOfContentsOptions(BaseModel):
    """Options for table of contents."""

    include_toc: bool = Field(default=True)
    toc_title: str = Field(default="Table of Contents")
    include_page_numbers: bool = Field(default=True)
    max_depth: int = Field(default=1, ge=1, le=3)


class FormattingOptions(BaseModel):
    """Formatting options for the export."""

    font_family: str = Field(default="Times New Roman")
    font_size: int = Field(default=12, ge=8, le=24)
    line_spacing: float = Field(default=1.5, ge=1.0, le=3.0)
    paragraph_indent: float = Field(default=0.5, ge=0.0, le=2.0)
    chapter_break_style: str = Field(
        default="page_break",
        description="page_break, section_break, or ornamental",
    )
    include_drop_caps: bool = Field(default=False)
    scene_break_marker: str = Field(default="* * *")


class ExportRequest(BaseModel):
    """Request to generate an export."""

    format: ExportFormat
    front_matter: FrontMatterOptions = Field(default_factory=FrontMatterOptions)
    back_matter: BackMatterOptions = Field(default_factory=BackMatterOptions)
    toc_options: TableOfContentsOptions = Field(default_factory=TableOfContentsOptions)
    formatting: FormattingOptions = Field(default_factory=FormattingOptions)
    chapters_to_include: Optional[list[int]] = Field(
        None,
        description="Specific chapter numbers to include. None means all chapters.",
    )
    author_name: Optional[str] = Field(None, max_length=200)
    custom_title: Optional[str] = Field(None, max_length=300)


class ExportJob(BaseModel):
    """Export job status and details."""

    id: str
    project_id: str
    format: ExportFormat
    status: ExportStatus
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    file_size_bytes: Optional[int] = None
    download_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class ExportHistoryItem(BaseModel):
    """An item in export history."""

    id: str
    format: ExportFormat
    status: ExportStatus
    file_size_bytes: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class ExportHistoryResponse(BaseModel):
    """Response for export history."""

    exports: list[ExportHistoryItem]
    total: int


class ManuscriptStats(BaseModel):
    """Statistics about the manuscript."""

    total_chapters: int
    total_words: int
    total_characters: int
    estimated_pages: int
    estimated_reading_time_minutes: int
    average_chapter_length: int


class ExportPreview(BaseModel):
    """Preview information before export."""

    project_name: str
    author_name: Optional[str] = None
    chapter_count: int
    word_count: int
    estimated_pages: int
    available_formats: list[ExportFormat]
    stats: ManuscriptStats


# ============================================================================
# Endpoints
# ============================================================================


@router.post(
    "",
    response_model=ExportJob,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Generate export",
    description="Start generating an export in the specified format.",
)
async def create_export(
    project_id: UUID,
    request: ExportRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExportJob:
    """Start export generation for a project.

    This endpoint generates the export synchronously and stores the result
    for later download. Returns a job object with the export status.
    """
    # Verify project ownership
    project_result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .where(Project.user_id == current_user.user_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND.value,
                "message": f"Project {project_id} not found",
            },
        )

    # Create export job
    job_id = str(uuid4())
    now = datetime.utcnow()

    # Get the appropriate exporter
    service_format = map_export_format(request.format)
    exporter = ExporterRegistry.create(service_format)

    if not exporter:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "UNSUPPORTED_FORMAT",
                "message": f"Export format '{request.format.value}' is not supported",
            },
        )

    # Get chapter artifacts
    chapter_artifacts = await get_chapter_artifacts(
        db, project_id, request.chapters_to_include
    )

    if not chapter_artifacts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "NO_CHAPTERS",
                "message": (
                    "No chapters found for this project. "
                    "Generate chapters before exporting."
                ),
            },
        )

    # Build manuscript
    manuscript = await build_manuscript(project, chapter_artifacts, request)

    # Generate export
    try:
        export_result = exporter.export(manuscript)
    except Exception as e:
        logger.error(f"Export generation failed: {e}", exc_info=True)
        # Store failed job
        _export_jobs[job_id] = {
            "id": job_id,
            "project_id": str(project_id),
            "format": request.format,
            "status": ExportStatus.FAILED,
            "progress": 0.0,
            "error_message": str(e),
            "created_at": now,
            "completed_at": datetime.utcnow(),
        }
        return ExportJob(
            id=job_id,
            project_id=str(project_id),
            format=request.format,
            status=ExportStatus.FAILED,
            progress=0.0,
            error_message=f"Export generation failed: {str(e)}",
            created_at=now,
            completed_at=datetime.utcnow(),
        )

    if not export_result.success:
        _export_jobs[job_id] = {
            "id": job_id,
            "project_id": str(project_id),
            "format": request.format,
            "status": ExportStatus.FAILED,
            "progress": 0.0,
            "error_message": export_result.error_message,
            "created_at": now,
            "completed_at": datetime.utcnow(),
        }
        return ExportJob(
            id=job_id,
            project_id=str(project_id),
            format=request.format,
            status=ExportStatus.FAILED,
            progress=0.0,
            error_message=export_result.error_message,
            created_at=now,
            completed_at=datetime.utcnow(),
        )

    # Store successful export
    completed_at = datetime.utcnow()
    expires_at = completed_at + timedelta(hours=24)  # Exports expire after 24 hours

    _export_jobs[job_id] = {
        "id": job_id,
        "project_id": str(project_id),
        "format": request.format,
        "status": ExportStatus.COMPLETED,
        "progress": 1.0,
        "file_size_bytes": export_result.size_bytes,
        "content": export_result.content,
        "file_name": export_result.file_name,
        "mime_type": export_result.metadata.mime_type,
        "created_at": now,
        "completed_at": completed_at,
        "expires_at": expires_at,
    }

    return ExportJob(
        id=job_id,
        project_id=str(project_id),
        format=request.format,
        status=ExportStatus.COMPLETED,
        progress=1.0,
        file_size_bytes=export_result.size_bytes,
        download_url=f"/api/v1/projects/{project_id}/export/{job_id}/download",
        created_at=now,
        completed_at=completed_at,
        expires_at=expires_at,
    )


@router.get(
    "/{export_id}",
    response_model=ExportJob,
    summary="Get export status",
    description="Get the status of an export job.",
)
async def get_export_status(
    project_id: UUID,
    export_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExportJob:
    """Get the status of an export job."""
    # Verify project ownership
    project_result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .where(Project.user_id == current_user.user_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND.value,
                "message": f"Project {project_id} not found",
            },
        )

    # Look up the export job
    job = _export_jobs.get(export_id)

    if not job or job["project_id"] != str(project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": "EXPORT_NOT_FOUND",
                "message": f"Export {export_id} not found",
            },
        )

    # Check if expired
    if job.get("expires_at") and datetime.utcnow() > job["expires_at"]:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "error_code": "EXPORT_EXPIRED",
                "message": "This export has expired. Please generate a new export.",
            },
        )

    return ExportJob(
        id=job["id"],
        project_id=job["project_id"],
        format=job["format"],
        status=job["status"],
        progress=job["progress"],
        file_size_bytes=job.get("file_size_bytes"),
        download_url=f"/api/v1/projects/{project_id}/export/{export_id}/download"
        if job["status"] == ExportStatus.COMPLETED
        else None,
        error_message=job.get("error_message"),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
        expires_at=job.get("expires_at"),
    )


@router.get(
    "/{export_id}/download",
    summary="Download export",
    description="Download a completed export file.",
)
async def download_export(
    project_id: UUID,
    export_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Download a completed export."""
    # Verify project ownership
    project_result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .where(Project.user_id == current_user.user_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND.value,
                "message": f"Project {project_id} not found",
            },
        )

    # Look up the export job
    job = _export_jobs.get(export_id)

    if not job or job["project_id"] != str(project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": "EXPORT_NOT_FOUND",
                "message": f"Export {export_id} not found",
            },
        )

    # Check if export is completed
    if job["status"] != ExportStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "EXPORT_NOT_READY",
                "message": f"Export is not ready for download (status: {job['status'].value})",
            },
        )

    # Check if expired
    if job.get("expires_at") and datetime.utcnow() > job["expires_at"]:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "error_code": "EXPORT_EXPIRED",
                "message": "This export has expired. Please generate a new export.",
            },
        )

    # Get the content
    content = job.get("content")
    if not content:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error_code": "EXPORT_CONTENT_MISSING",
                "message": "Export content not found. Please regenerate the export.",
            },
        )

    file_name = job.get("file_name", f"export.{job['format'].value}")
    mime_type = job.get("mime_type", "application/octet-stream")

    return Response(
        content=content,
        media_type=mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{file_name}"',
            "Content-Length": str(len(content)),
        },
    )


@router.delete(
    "/{export_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel or delete export",
    description="Cancel a pending export or delete a completed export.",
)
async def delete_export(
    project_id: UUID,
    export_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Cancel or delete an export."""
    # Verify project ownership
    project_result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .where(Project.user_id == current_user.user_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND.value,
                "message": f"Project {project_id} not found",
            },
        )

    # Look up the export job
    job = _export_jobs.get(export_id)

    if not job or job["project_id"] != str(project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": "EXPORT_NOT_FOUND",
                "message": f"Export {export_id} not found",
            },
        )

    # Delete the export
    del _export_jobs[export_id]


@router.get(
    "",
    response_model=ExportHistoryResponse,
    summary="Get export history",
    description="Get the export history for a project.",
)
async def get_export_history(
    project_id: UUID,
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExportHistoryResponse:
    """Get export history for a project."""
    # Verify project ownership
    project_result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .where(Project.user_id == current_user.user_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND.value,
                "message": f"Project {project_id} not found",
            },
        )

    # Get exports for this project
    project_exports = [
        job for job in _export_jobs.values()
        if job["project_id"] == str(project_id)
    ]

    # Sort by created_at descending
    project_exports.sort(key=lambda x: x["created_at"], reverse=True)

    # Apply pagination
    total = len(project_exports)
    paginated = project_exports[offset : offset + limit]

    # Convert to response format
    exports = [
        ExportHistoryItem(
            id=job["id"],
            format=job["format"],
            status=job["status"],
            file_size_bytes=job.get("file_size_bytes"),
            created_at=job["created_at"],
            completed_at=job.get("completed_at"),
        )
        for job in paginated
    ]

    return ExportHistoryResponse(exports=exports, total=total)


@router.get(
    "/preview",
    response_model=ExportPreview,
    summary="Get export preview",
    description="Get a preview of what the export will contain.",
)
async def get_export_preview(
    project_id: UUID,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExportPreview:
    """Get a preview of the manuscript for export."""
    # Verify project ownership
    project_result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .where(Project.user_id == current_user.user_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND.value,
                "message": f"Project {project_id} not found",
            },
        )

    # Get chapter artifacts to calculate actual stats
    chapter_artifacts = await get_chapter_artifacts(db, project_id)

    # Calculate statistics by aggregating chapter content
    total_chapters = len(chapter_artifacts)
    total_words = 0
    total_characters = 0

    for artifact in chapter_artifacts:
        # Use decode_artifact_content for safe decoding
        content = decode_artifact_content(artifact)
        if content:
            total_words += len(content.split())
            total_characters += len(content)

    # Estimate pages (assuming ~250 words per page)
    words_per_page = 250
    estimated_pages = max(1, total_words // words_per_page) if total_words > 0 else 0

    # Estimate reading time (assuming ~250 words per minute)
    words_per_minute = 250
    reading_time_minutes = max(1, total_words // words_per_minute) if total_words > 0 else 0

    # Average chapter length
    avg_chapter_length = total_words // total_chapters if total_chapters > 0 else 0

    # Get author name from project settings
    author_name = project.settings.get("author_name") if project.settings else None

    # Get available formats from registry
    available_formats = [
        ExportFormat(f.value)
        for f in ExporterRegistry.available_formats()
        if f.value in [e.value for e in ExportFormat]
    ]

    return ExportPreview(
        project_name=project.name,
        author_name=author_name,
        chapter_count=total_chapters,
        word_count=total_words,
        estimated_pages=estimated_pages,
        available_formats=available_formats if available_formats else list(ExportFormat),
        stats=ManuscriptStats(
            total_chapters=total_chapters,
            total_words=total_words,
            total_characters=total_characters,
            estimated_pages=estimated_pages,
            estimated_reading_time_minutes=reading_time_minutes,
            average_chapter_length=avg_chapter_length,
        ),
    )


@router.get(
    "/formats",
    response_model=list[dict],
    summary="Get available formats",
    description="Get list of available export formats with descriptions.",
)
async def get_available_formats() -> list[dict]:
    """Get available export formats."""
    return [
        {
            "format": ExportFormat.DOCX.value,
            "name": "Microsoft Word",
            "extension": ".docx",
            "description": "Word document with full formatting support",
            "features": ["styles", "headers", "footers", "page_numbers"],
        },
        {
            "format": ExportFormat.PDF.value,
            "name": "PDF",
            "extension": ".pdf",
            "description": "Portable Document Format for print-ready output",
            "features": ["print_quality", "embedded_fonts", "fixed_layout"],
        },
        {
            "format": ExportFormat.EPUB.value,
            "name": "EPUB",
            "extension": ".epub",
            "description": "E-book format for digital readers",
            "features": ["responsive", "metadata", "cover_image", "toc"],
        },
        {
            "format": ExportFormat.MARKDOWN.value,
            "name": "Markdown",
            "extension": ".md",
            "description": "Clean, portable text format",
            "features": ["simple", "portable", "version_control_friendly"],
        },
        {
            "format": ExportFormat.TEXT.value,
            "name": "Plain Text",
            "extension": ".txt",
            "description": "Simple text without formatting",
            "features": ["universal", "simple", "small_size"],
        },
    ]
