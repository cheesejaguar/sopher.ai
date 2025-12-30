"""Plain text exporter for manuscripts."""

from app.services.manuscript_assembly import (
    Manuscript,
    ManuscriptAssembler,
)

from .base import BaseExporter, ExporterRegistry, ExportFormat, ExportResult


class TextExporter(BaseExporter):
    """Exporter for plain text format."""

    format = ExportFormat.TEXT
    file_extension = ".txt"
    mime_type = "text/plain"

    def __init__(self):
        """Initialize the text exporter."""
        self.assembler = ManuscriptAssembler()

    def export(self, manuscript: Manuscript) -> ExportResult:
        """
        Export the manuscript as plain text.

        Args:
            manuscript: The manuscript to export.

        Returns:
            ExportResult with the text content.
        """
        try:
            # Assemble the manuscript
            text = self.assembler.assemble(manuscript)

            # Clean up formatting markers
            text = self._clean_markers(text)

            # Encode as bytes
            content = text.encode("utf-8")

            return self._success_result(content, manuscript)

        except Exception as e:
            return self._error_result(str(e), manuscript)

    def _clean_markers(self, text: str) -> str:
        """Remove formatting markers from text."""
        # Remove page break markers
        text = text.replace("[PAGE_BREAK]", "\n" + "=" * 60 + "\n")

        # Remove section break markers
        text = text.replace("[SECTION_BREAK]", "\n" + "-" * 40 + "\n")

        # Remove ornamental break markers
        text = text.replace("[ORNAMENTAL_BREAK]", "\n" + "~ * ~ * ~" + "\n")

        # Remove drop cap markers
        text = text.replace("[DROP_CAP]", "")
        text = text.replace("[/DROP_CAP]", "")

        return text


# Register the exporter
ExporterRegistry.register(ExportFormat.TEXT, TextExporter)
