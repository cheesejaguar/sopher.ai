"""Base exporter class for manuscript exports."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

from app.services.manuscript_assembly import Manuscript


class ExportFormat(str, Enum):
    """Supported export formats."""

    DOCX = "docx"
    PDF = "pdf"
    EPUB = "epub"
    MARKDOWN = "markdown"
    TEXT = "text"


@dataclass
class ExportMetadata:
    """Metadata for an export."""

    title: str
    author: Optional[str] = None
    format: ExportFormat = ExportFormat.TEXT
    created_at: datetime = field(default_factory=datetime.utcnow)
    word_count: int = 0
    chapter_count: int = 0
    file_extension: str = ".txt"
    mime_type: str = "text/plain"


@dataclass
class ExportResult:
    """Result of an export operation."""

    success: bool
    content: bytes
    metadata: ExportMetadata
    error_message: Optional[str] = None
    file_name: Optional[str] = None

    @property
    def size_bytes(self) -> int:
        """Get the size of the exported content in bytes."""
        return len(self.content)


class BaseExporter(ABC):
    """Abstract base class for manuscript exporters."""

    format: ExportFormat = ExportFormat.TEXT
    file_extension: str = ".txt"
    mime_type: str = "text/plain"

    @abstractmethod
    def export(self, manuscript: Manuscript) -> ExportResult:
        """
        Export the manuscript to the target format.

        Args:
            manuscript: The manuscript to export.

        Returns:
            ExportResult with the exported content and metadata.
        """
        pass

    def _create_metadata(self, manuscript: Manuscript) -> ExportMetadata:
        """Create metadata for the export."""
        return ExportMetadata(
            title=manuscript.title,
            author=manuscript.author_name,
            format=self.format,
            word_count=manuscript.total_words,
            chapter_count=manuscript.total_chapters,
            file_extension=self.file_extension,
            mime_type=self.mime_type,
        )

    def _create_file_name(self, manuscript: Manuscript) -> str:
        """Create a sanitized file name for the export."""
        # Sanitize title for file name
        safe_title = "".join(
            c for c in manuscript.title if c.isalnum() or c in (" ", "-", "_")
        ).strip()
        safe_title = safe_title.replace(" ", "_")

        if not safe_title:
            safe_title = "manuscript"

        return f"{safe_title}{self.file_extension}"

    def _success_result(
        self,
        content: bytes,
        manuscript: Manuscript,
    ) -> ExportResult:
        """Create a successful export result."""
        return ExportResult(
            success=True,
            content=content,
            metadata=self._create_metadata(manuscript),
            file_name=self._create_file_name(manuscript),
        )

    def _error_result(
        self,
        error: str,
        manuscript: Manuscript,
    ) -> ExportResult:
        """Create a failed export result."""
        return ExportResult(
            success=False,
            content=b"",
            metadata=self._create_metadata(manuscript),
            error_message=error,
        )


class ExporterRegistry:
    """Registry for available exporters."""

    _exporters: dict[ExportFormat, type[BaseExporter]] = {}

    @classmethod
    def register(cls, format: ExportFormat, exporter_class: type[BaseExporter]) -> None:
        """Register an exporter for a format."""
        cls._exporters[format] = exporter_class

    @classmethod
    def get(cls, format: ExportFormat) -> Optional[type[BaseExporter]]:
        """Get the exporter class for a format."""
        return cls._exporters.get(format)

    @classmethod
    def create(cls, format: ExportFormat) -> Optional[BaseExporter]:
        """Create an exporter instance for a format."""
        exporter_class = cls.get(format)
        if exporter_class:
            return exporter_class()
        return None

    @classmethod
    def available_formats(cls) -> list[ExportFormat]:
        """Get list of available export formats."""
        return list(cls._exporters.keys())

    @classmethod
    def is_available(cls, format: ExportFormat) -> bool:
        """Check if a format is available."""
        return format in cls._exporters
