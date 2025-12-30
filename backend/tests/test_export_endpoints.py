"""Tests for export router endpoints."""

import pytest
from pydantic import ValidationError

from app.errors import ErrorCode
from app.routers.export import (
    BackMatterOptions,
    ExportFormat,
    ExportHistoryItem,
    ExportHistoryResponse,
    ExportJob,
    ExportPreview,
    ExportRequest,
    ExportStatus,
    FormattingOptions,
    FrontMatterOptions,
    ManuscriptStats,
    TableOfContentsOptions,
    router,
)


class TestExportFormat:
    """Tests for ExportFormat enum."""

    def test_all_formats_defined(self):
        """All expected export formats should be defined."""
        expected = {"docx", "pdf", "epub", "markdown", "text"}
        actual = {f.value for f in ExportFormat}
        assert actual == expected

    def test_format_values(self):
        """Format values should be lowercase."""
        for fmt in ExportFormat:
            assert fmt.value == fmt.value.lower()


class TestExportStatus:
    """Tests for ExportStatus enum."""

    def test_all_statuses_defined(self):
        """All expected statuses should be defined."""
        expected = {"pending", "processing", "completed", "failed"}
        actual = {s.value for s in ExportStatus}
        assert actual == expected


class TestFrontMatterOptions:
    """Tests for FrontMatterOptions schema."""

    def test_default_values(self):
        """Default values should be set correctly."""
        options = FrontMatterOptions()
        assert options.include_title_page is True
        assert options.include_copyright is True
        assert options.include_dedication is False
        assert options.dedication_text is None
        assert options.include_acknowledgments is False
        assert options.include_epigraph is False

    def test_custom_values(self):
        """Custom values should be accepted."""
        options = FrontMatterOptions(
            include_title_page=False,
            include_dedication=True,
            dedication_text="To my family",
            include_epigraph=True,
            epigraph_text="All is fair in love and war",
            epigraph_attribution="Unknown",
        )
        assert options.include_title_page is False
        assert options.include_dedication is True
        assert options.dedication_text == "To my family"
        assert options.epigraph_text == "All is fair in love and war"
        assert options.epigraph_attribution == "Unknown"

    def test_dedication_text_max_length(self):
        """Dedication text should have max length."""
        with pytest.raises(ValidationError) as exc_info:
            FrontMatterOptions(dedication_text="x" * 1001)
        assert "string_too_long" in str(exc_info.value)

    def test_epigraph_text_max_length(self):
        """Epigraph text should have max length."""
        with pytest.raises(ValidationError) as exc_info:
            FrontMatterOptions(epigraph_text="x" * 501)
        assert "string_too_long" in str(exc_info.value)


class TestBackMatterOptions:
    """Tests for BackMatterOptions schema."""

    def test_default_values(self):
        """Default values should be set correctly."""
        options = BackMatterOptions()
        assert options.include_author_bio is False
        assert options.author_bio_text is None
        assert options.include_also_by is False
        assert options.also_by_titles == []
        assert options.include_excerpt is False

    def test_custom_values(self):
        """Custom values should be accepted."""
        options = BackMatterOptions(
            include_author_bio=True,
            author_bio_text="A prolific author...",
            include_also_by=True,
            also_by_titles=["Book One", "Book Two"],
            include_excerpt=True,
            excerpt_title="Coming Soon: Book Three",
            excerpt_text="Chapter 1 preview...",
        )
        assert options.include_author_bio is True
        assert options.author_bio_text == "A prolific author..."
        assert len(options.also_by_titles) == 2
        assert options.excerpt_title == "Coming Soon: Book Three"

    def test_author_bio_max_length(self):
        """Author bio should have max length."""
        with pytest.raises(ValidationError) as exc_info:
            BackMatterOptions(author_bio_text="x" * 2001)
        assert "string_too_long" in str(exc_info.value)


class TestTableOfContentsOptions:
    """Tests for TableOfContentsOptions schema."""

    def test_default_values(self):
        """Default values should be set correctly."""
        options = TableOfContentsOptions()
        assert options.include_toc is True
        assert options.toc_title == "Table of Contents"
        assert options.include_page_numbers is True
        assert options.max_depth == 1

    def test_custom_values(self):
        """Custom values should be accepted."""
        options = TableOfContentsOptions(
            include_toc=True,
            toc_title="Contents",
            include_page_numbers=False,
            max_depth=2,
        )
        assert options.toc_title == "Contents"
        assert options.include_page_numbers is False
        assert options.max_depth == 2

    def test_max_depth_validation(self):
        """Max depth should be between 1 and 3."""
        with pytest.raises(ValidationError) as exc_info:
            TableOfContentsOptions(max_depth=0)
        assert "greater_than_equal" in str(exc_info.value)

        with pytest.raises(ValidationError) as exc_info:
            TableOfContentsOptions(max_depth=4)
        assert "less_than_equal" in str(exc_info.value)


class TestFormattingOptions:
    """Tests for FormattingOptions schema."""

    def test_default_values(self):
        """Default values should be set correctly."""
        options = FormattingOptions()
        assert options.font_family == "Times New Roman"
        assert options.font_size == 12
        assert options.line_spacing == 1.5
        assert options.paragraph_indent == 0.5
        assert options.chapter_break_style == "page_break"
        assert options.include_drop_caps is False
        assert options.scene_break_marker == "* * *"

    def test_custom_values(self):
        """Custom values should be accepted."""
        options = FormattingOptions(
            font_family="Georgia",
            font_size=14,
            line_spacing=2.0,
            paragraph_indent=0.25,
            chapter_break_style="ornamental",
            include_drop_caps=True,
            scene_break_marker="---",
        )
        assert options.font_family == "Georgia"
        assert options.font_size == 14
        assert options.line_spacing == 2.0
        assert options.include_drop_caps is True

    def test_font_size_validation(self):
        """Font size should be between 8 and 24."""
        with pytest.raises(ValidationError) as exc_info:
            FormattingOptions(font_size=7)
        assert "greater_than_equal" in str(exc_info.value)

        with pytest.raises(ValidationError) as exc_info:
            FormattingOptions(font_size=25)
        assert "less_than_equal" in str(exc_info.value)

    def test_line_spacing_validation(self):
        """Line spacing should be between 1.0 and 3.0."""
        with pytest.raises(ValidationError) as exc_info:
            FormattingOptions(line_spacing=0.5)
        assert "greater_than_equal" in str(exc_info.value)

        with pytest.raises(ValidationError) as exc_info:
            FormattingOptions(line_spacing=3.5)
        assert "less_than_equal" in str(exc_info.value)


class TestExportRequest:
    """Tests for ExportRequest schema."""

    def test_minimal_request(self):
        """Minimal request with just format should work."""
        request = ExportRequest(format=ExportFormat.DOCX)
        assert request.format == ExportFormat.DOCX
        assert isinstance(request.front_matter, FrontMatterOptions)
        assert isinstance(request.back_matter, BackMatterOptions)
        assert request.chapters_to_include is None

    def test_full_request(self):
        """Full request with all options should work."""
        request = ExportRequest(
            format=ExportFormat.EPUB,
            front_matter=FrontMatterOptions(
                include_dedication=True,
                dedication_text="To readers everywhere",
            ),
            back_matter=BackMatterOptions(
                include_author_bio=True,
                author_bio_text="Author bio here",
            ),
            toc_options=TableOfContentsOptions(
                toc_title="Chapters",
            ),
            formatting=FormattingOptions(
                font_family="Georgia",
            ),
            chapters_to_include=[1, 2, 3],
            author_name="Jane Doe",
            custom_title="My Book Title",
        )
        assert request.format == ExportFormat.EPUB
        assert request.front_matter.include_dedication is True
        assert request.back_matter.include_author_bio is True
        assert request.chapters_to_include == [1, 2, 3]
        assert request.author_name == "Jane Doe"
        assert request.custom_title == "My Book Title"

    def test_all_formats_accepted(self):
        """All export formats should be accepted."""
        for fmt in ExportFormat:
            request = ExportRequest(format=fmt)
            assert request.format == fmt


class TestExportJob:
    """Tests for ExportJob schema."""

    def test_minimal_job(self):
        """Minimal job should work."""
        from datetime import datetime

        job = ExportJob(
            id="job-123",
            project_id="project-456",
            format=ExportFormat.PDF,
            status=ExportStatus.PENDING,
            created_at=datetime.utcnow(),
        )
        assert job.id == "job-123"
        assert job.status == ExportStatus.PENDING
        assert job.progress == 0.0
        assert job.file_size_bytes is None
        assert job.download_url is None

    def test_completed_job(self):
        """Completed job with all fields should work."""
        from datetime import datetime, timedelta

        now = datetime.utcnow()
        job = ExportJob(
            id="job-123",
            project_id="project-456",
            format=ExportFormat.PDF,
            status=ExportStatus.COMPLETED,
            progress=1.0,
            file_size_bytes=1024000,
            download_url="/api/v1/projects/project-456/export/job-123/download",
            created_at=now - timedelta(minutes=5),
            completed_at=now,
            expires_at=now + timedelta(days=7),
        )
        assert job.status == ExportStatus.COMPLETED
        assert job.progress == 1.0
        assert job.file_size_bytes == 1024000
        assert job.completed_at is not None

    def test_failed_job(self):
        """Failed job with error message should work."""
        from datetime import datetime

        job = ExportJob(
            id="job-123",
            project_id="project-456",
            format=ExportFormat.EPUB,
            status=ExportStatus.FAILED,
            progress=0.5,
            error_message="Failed to generate EPUB",
            created_at=datetime.utcnow(),
        )
        assert job.status == ExportStatus.FAILED
        assert job.error_message == "Failed to generate EPUB"

    def test_progress_validation(self):
        """Progress should be between 0 and 1."""
        from datetime import datetime

        with pytest.raises(ValidationError) as exc_info:
            ExportJob(
                id="job-123",
                project_id="project-456",
                format=ExportFormat.PDF,
                status=ExportStatus.PROCESSING,
                progress=-0.1,
                created_at=datetime.utcnow(),
            )
        assert "greater_than_equal" in str(exc_info.value)

        with pytest.raises(ValidationError) as exc_info:
            ExportJob(
                id="job-123",
                project_id="project-456",
                format=ExportFormat.PDF,
                status=ExportStatus.PROCESSING,
                progress=1.5,
                created_at=datetime.utcnow(),
            )
        assert "less_than_equal" in str(exc_info.value)


class TestExportHistoryItem:
    """Tests for ExportHistoryItem schema."""

    def test_history_item(self):
        """History item should work correctly."""
        from datetime import datetime

        item = ExportHistoryItem(
            id="export-1",
            format=ExportFormat.DOCX,
            status=ExportStatus.COMPLETED,
            file_size_bytes=512000,
            created_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        assert item.id == "export-1"
        assert item.format == ExportFormat.DOCX
        assert item.file_size_bytes == 512000


class TestExportHistoryResponse:
    """Tests for ExportHistoryResponse schema."""

    def test_empty_history(self):
        """Empty history should work."""
        response = ExportHistoryResponse(exports=[], total=0)
        assert len(response.exports) == 0
        assert response.total == 0

    def test_history_with_items(self):
        """History with items should work."""
        from datetime import datetime

        items = [
            ExportHistoryItem(
                id="export-1",
                format=ExportFormat.DOCX,
                status=ExportStatus.COMPLETED,
                created_at=datetime.utcnow(),
            ),
            ExportHistoryItem(
                id="export-2",
                format=ExportFormat.PDF,
                status=ExportStatus.FAILED,
                created_at=datetime.utcnow(),
            ),
        ]
        response = ExportHistoryResponse(exports=items, total=2)
        assert len(response.exports) == 2
        assert response.total == 2


class TestManuscriptStats:
    """Tests for ManuscriptStats schema."""

    def test_stats(self):
        """Stats should work correctly."""
        stats = ManuscriptStats(
            total_chapters=20,
            total_words=80000,
            total_characters=450000,
            estimated_pages=320,
            estimated_reading_time_minutes=400,
            average_chapter_length=4000,
        )
        assert stats.total_chapters == 20
        assert stats.total_words == 80000
        assert stats.estimated_pages == 320


class TestExportPreview:
    """Tests for ExportPreview schema."""

    def test_preview(self):
        """Preview should work correctly."""
        stats = ManuscriptStats(
            total_chapters=10,
            total_words=50000,
            total_characters=250000,
            estimated_pages=200,
            estimated_reading_time_minutes=250,
            average_chapter_length=5000,
        )
        preview = ExportPreview(
            project_name="My Novel",
            author_name="John Smith",
            chapter_count=10,
            word_count=50000,
            estimated_pages=200,
            available_formats=[ExportFormat.DOCX, ExportFormat.PDF],
            stats=stats,
        )
        assert preview.project_name == "My Novel"
        assert preview.author_name == "John Smith"
        assert len(preview.available_formats) == 2


class TestRouterRegistration:
    """Tests for router registration."""

    def test_router_has_prefix(self):
        """Router should have correct prefix."""
        assert router.prefix == "/projects/{project_id}/export"

    def test_router_has_tags(self):
        """Router should have export tag."""
        assert "export" in router.tags

    def test_routes_registered(self):
        """All expected routes should be registered."""
        routes = [r.path for r in router.routes]
        expected_routes = [
            "/projects/{project_id}/export",
            "/projects/{project_id}/export/{export_id}",
            "/projects/{project_id}/export/{export_id}/download",
            "/projects/{project_id}/export",
            "/projects/{project_id}/export/preview",
            "/projects/{project_id}/export/formats",
        ]
        for expected in expected_routes:
            assert any(expected in r for r in routes), f"Route {expected} not found"


class TestOpenAPIDocumentation:
    """Tests for OpenAPI documentation."""

    def test_create_export_has_summary(self):
        """Create export endpoint should have summary."""
        route = next(r for r in router.routes if hasattr(r, "name") and r.name == "create_export")
        assert route.summary is not None

    def test_get_export_status_has_summary(self):
        """Get export status endpoint should have summary."""
        route = next(
            r for r in router.routes if hasattr(r, "name") and r.name == "get_export_status"
        )
        assert route.summary is not None

    def test_download_export_has_summary(self):
        """Download export endpoint should have summary."""
        route = next(r for r in router.routes if hasattr(r, "name") and r.name == "download_export")
        assert route.summary is not None

    def test_get_export_history_has_summary(self):
        """Get export history endpoint should have summary."""
        route = next(
            r for r in router.routes if hasattr(r, "name") and r.name == "get_export_history"
        )
        assert route.summary is not None

    def test_get_export_preview_has_summary(self):
        """Get export preview endpoint should have summary."""
        route = next(
            r for r in router.routes if hasattr(r, "name") and r.name == "get_export_preview"
        )
        assert route.summary is not None

    def test_get_available_formats_has_summary(self):
        """Get available formats endpoint should have summary."""
        route = next(
            r for r in router.routes if hasattr(r, "name") and r.name == "get_available_formats"
        )
        assert route.summary is not None


class TestErrorCodes:
    """Tests for error codes."""

    def test_export_error_codes_defined(self):
        """Export-related error codes should be defined."""
        assert hasattr(ErrorCode, "EXPORT_NOT_FOUND")
        assert hasattr(ErrorCode, "EXPORT_GENERATION_FAILED")
        assert hasattr(ErrorCode, "EXPORT_FORMAT_NOT_SUPPORTED")
        assert hasattr(ErrorCode, "MANUSCRIPT_ASSEMBLY_FAILED")


class TestChapterInclusion:
    """Tests for chapter inclusion options."""

    def test_include_all_chapters(self):
        """None means include all chapters."""
        request = ExportRequest(format=ExportFormat.DOCX)
        assert request.chapters_to_include is None

    def test_include_specific_chapters(self):
        """Specific chapters can be included."""
        request = ExportRequest(
            format=ExportFormat.DOCX,
            chapters_to_include=[1, 3, 5],
        )
        assert request.chapters_to_include == [1, 3, 5]

    def test_include_single_chapter(self):
        """Single chapter can be exported."""
        request = ExportRequest(
            format=ExportFormat.PDF,
            chapters_to_include=[5],
        )
        assert request.chapters_to_include == [5]


class TestFormatDescriptions:
    """Tests for format descriptions endpoint."""

    @pytest.mark.asyncio
    async def test_format_descriptions_content(self):
        """Format descriptions should contain expected fields."""
        from app.routers.export import get_available_formats

        formats = await get_available_formats()
        assert len(formats) == 5

        for fmt in formats:
            assert "format" in fmt
            assert "name" in fmt
            assert "extension" in fmt
            assert "description" in fmt
            assert "features" in fmt

    @pytest.mark.asyncio
    async def test_all_formats_have_descriptions(self):
        """All formats should have descriptions."""
        from app.routers.export import get_available_formats

        formats = await get_available_formats()
        format_values = {f["format"] for f in formats}

        for export_format in ExportFormat:
            assert export_format.value in format_values


class TestExportJobLifecycle:
    """Tests for export job lifecycle."""

    def test_job_starts_pending(self):
        """New jobs should start in pending status."""
        from datetime import datetime

        job = ExportJob(
            id="new-job",
            project_id="project-1",
            format=ExportFormat.DOCX,
            status=ExportStatus.PENDING,
            created_at=datetime.utcnow(),
        )
        assert job.status == ExportStatus.PENDING
        assert job.progress == 0.0

    def test_job_processing(self):
        """Processing jobs should have partial progress."""
        from datetime import datetime

        job = ExportJob(
            id="processing-job",
            project_id="project-1",
            format=ExportFormat.PDF,
            status=ExportStatus.PROCESSING,
            progress=0.5,
            created_at=datetime.utcnow(),
        )
        assert job.status == ExportStatus.PROCESSING
        assert job.progress == 0.5

    def test_job_completed(self):
        """Completed jobs should have all completion fields."""
        from datetime import datetime, timedelta

        now = datetime.utcnow()
        job = ExportJob(
            id="completed-job",
            project_id="project-1",
            format=ExportFormat.EPUB,
            status=ExportStatus.COMPLETED,
            progress=1.0,
            file_size_bytes=2048000,
            download_url="/download/completed-job",
            created_at=now - timedelta(seconds=30),
            completed_at=now,
            expires_at=now + timedelta(days=7),
        )
        assert job.status == ExportStatus.COMPLETED
        assert job.progress == 1.0
        assert job.download_url is not None
        assert job.completed_at is not None
        assert job.expires_at is not None

    def test_job_failed(self):
        """Failed jobs should have error message."""
        from datetime import datetime

        job = ExportJob(
            id="failed-job",
            project_id="project-1",
            format=ExportFormat.PDF,
            status=ExportStatus.FAILED,
            error_message="Out of memory",
            created_at=datetime.utcnow(),
        )
        assert job.status == ExportStatus.FAILED
        assert job.error_message is not None


class TestFormattingCustomization:
    """Tests for formatting customization options."""

    def test_chapter_break_styles(self):
        """Different chapter break styles should be accepted."""
        styles = ["page_break", "section_break", "ornamental"]
        for style in styles:
            options = FormattingOptions(chapter_break_style=style)
            assert options.chapter_break_style == style

    def test_scene_break_markers(self):
        """Different scene break markers should be accepted."""
        markers = ["* * *", "---", "~", "• • •"]
        for marker in markers:
            options = FormattingOptions(scene_break_marker=marker)
            assert options.scene_break_marker == marker

    def test_font_families(self):
        """Different font families should be accepted."""
        fonts = ["Times New Roman", "Georgia", "Garamond", "Arial"]
        for font in fonts:
            options = FormattingOptions(font_family=font)
            assert options.font_family == font


class TestIntegration:
    """Integration tests for export functionality."""

    def test_export_request_serialization(self):
        """Export request should serialize correctly."""
        request = ExportRequest(
            format=ExportFormat.EPUB,
            front_matter=FrontMatterOptions(include_dedication=True),
            chapters_to_include=[1, 2, 3],
        )
        data = request.model_dump()
        assert data["format"] == "epub"
        assert data["front_matter"]["include_dedication"] is True
        assert data["chapters_to_include"] == [1, 2, 3]

    def test_export_request_deserialization(self):
        """Export request should deserialize correctly."""
        data = {
            "format": "pdf",
            "front_matter": {"include_title_page": True},
            "formatting": {"font_size": 14},
        }
        request = ExportRequest(**data)
        assert request.format == ExportFormat.PDF
        assert request.formatting.font_size == 14
