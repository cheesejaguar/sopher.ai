"""
Export router for generating publication-ready manuscript exports.

Provides endpoints for:
- Generating exports in various formats (DOCX, PDF, EPUB, Markdown, plain text)
- Downloading generated exports
- Getting export status and history
"""

import logging
from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.errors import ErrorCode
from app.security import TokenData, get_current_user
from app.services.project_service import ProjectService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/export", tags=["export"])


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
    """Start export generation for a project."""
    # Verify project ownership
    project_service = ProjectService(db)
    project = await project_service.get_project(project_id, UUID(current_user.sub))

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND,
                "message": f"Project {project_id} not found",
            },
        )

    # Create export job
    job_id = str(uuid4())
    now = datetime.utcnow()

    # In a real implementation, this would queue the job for processing
    # For now, return a pending job
    return ExportJob(
        id=job_id,
        project_id=str(project_id),
        format=request.format,
        status=ExportStatus.PENDING,
        progress=0.0,
        created_at=now,
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
    project_service = ProjectService(db)
    project = await project_service.get_project(project_id, UUID(current_user.sub))

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND,
                "message": f"Project {project_id} not found",
            },
        )

    # In a real implementation, this would look up the job
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "error_code": ErrorCode.EXPORT_NOT_FOUND,
            "message": f"Export {export_id} not found",
        },
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
) -> StreamingResponse:
    """Download a completed export."""
    # Verify project ownership
    project_service = ProjectService(db)
    project = await project_service.get_project(project_id, UUID(current_user.sub))

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND,
                "message": f"Project {project_id} not found",
            },
        )

    # In a real implementation, this would stream the file
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "error_code": ErrorCode.EXPORT_NOT_FOUND,
            "message": f"Export {export_id} not found",
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
    project_service = ProjectService(db)
    project = await project_service.get_project(project_id, UUID(current_user.sub))

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND,
                "message": f"Project {project_id} not found",
            },
        )

    # In a real implementation, this would delete/cancel the job
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "error_code": ErrorCode.EXPORT_NOT_FOUND,
            "message": f"Export {export_id} not found",
        },
    )


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
    project_service = ProjectService(db)
    project = await project_service.get_project(project_id, UUID(current_user.sub))

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND,
                "message": f"Project {project_id} not found",
            },
        )

    # Return empty history for now
    return ExportHistoryResponse(exports=[], total=0)


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
    project_service = ProjectService(db)
    project = await project_service.get_project(project_id, UUID(current_user.sub))

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": ErrorCode.PROJECT_NOT_FOUND,
                "message": f"Project {project_id} not found",
            },
        )

    # In a real implementation, this would calculate actual stats
    # For now, return placeholder data
    return ExportPreview(
        project_name=project.name,
        author_name=None,
        chapter_count=project.target_chapters,
        word_count=0,
        estimated_pages=0,
        available_formats=list(ExportFormat),
        stats=ManuscriptStats(
            total_chapters=project.target_chapters,
            total_words=0,
            total_characters=0,
            estimated_pages=0,
            estimated_reading_time_minutes=0,
            average_chapter_length=0,
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
