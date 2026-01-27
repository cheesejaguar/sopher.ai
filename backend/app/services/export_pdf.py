"""PDF export service for manuscripts.

Uses ReportLab Platypus to generate properly formatted PDF files
with table of contents, page numbers, and professional typography.

The TOC with page numbers is implemented using a two-pass build:
1. First pass generates the document and tracks chapter page numbers
2. Second pass generates the final PDF with accurate TOC page references
"""

import io
import logging
import re
from typing import Optional

from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.services.manuscript_assembly import (
    ChapterContent,
    CopyrightContent,
    DedicationContent,
    EpigraphContent,
    Manuscript,
    TitlePageContent,
)

from .exporters.base import BaseExporter, ExporterRegistry, ExportFormat, ExportResult

logger = logging.getLogger(__name__)


class PDFExportError(Exception):
    """Exception raised when PDF export fails."""

    pass


class NumberedCanvas:
    """Canvas wrapper that tracks page numbers."""

    def __init__(self, canvas, doc):
        self._canvas = canvas
        self._doc = doc

    def __getattr__(self, name):
        return getattr(self._canvas, name)


class TOCEntry(Flowable):
    """Invisible flowable that marks a TOC entry location.

    Used in the first pass to record the page number where each chapter
    starts. The recorded page numbers are then used to build the TOC
    in the second pass.
    """

    def __init__(
        self,
        entry_id: str,
        title: str,
        level: int = 1,
        page_tracker: Optional[dict[str, int]] = None,
    ):
        """Initialize a TOC entry marker.

        Args:
            entry_id: Unique identifier for this entry (e.g., "chapter-1").
            title: Display title for the TOC (e.g., "Chapter 1: The Beginning").
            level: Heading level (1 = chapter, 2 = section, etc.).
            page_tracker: Dictionary to store page numbers during build.
        """
        Flowable.__init__(self)
        self.entry_id = entry_id
        self.title = title
        self.level = level
        self.page_tracker = page_tracker if page_tracker is not None else {}

    def draw(self):
        """Record the current page number when this flowable is drawn."""
        if hasattr(self, "canv") and self.canv is not None:
            # Get current page number from the canvas
            page_num = self.canv.getPageNumber()
            self.page_tracker[self.entry_id] = page_num

    def wrap(self, avail_width, avail_height):  # noqa: N803 - ReportLab interface
        """Return zero size - this is an invisible marker."""
        return (0, 0)


class PDFExportService(BaseExporter):
    """Service for exporting manuscripts to PDF format.

    Features:
    - Professional typography with Times New Roman or serif fallback
    - Table of contents with page references
    - Page numbers on all content pages (not front matter)
    - Front matter sections (title page, copyright, dedication)
    - Back matter sections (author bio, also by, excerpt)
    - Chapter formatting with proper breaks
    - Scene break handling
    """

    format = ExportFormat.PDF
    file_extension = ".pdf"
    mime_type = "application/pdf"

    # Page configuration
    PAGE_SIZE = letter
    MARGIN_TOP = 1 * inch
    MARGIN_BOTTOM = 1 * inch
    MARGIN_LEFT = 1.25 * inch
    MARGIN_RIGHT = 1.25 * inch

    def __init__(
        self,
        font_name: str = "Times-Roman",
        font_size: int = 12,
        line_spacing: float = 1.5,
    ):
        """Initialize the PDF export service.

        Args:
            font_name: Font to use (defaults to Times-Roman).
            font_size: Base font size in points.
            line_spacing: Line spacing multiplier.
        """
        self.font_name = font_name
        self.font_size = font_size
        self.line_spacing = line_spacing
        self._styles: Optional[dict] = None
        self._page_tracker: dict[str, int] = {}  # Tracks chapter page numbers
        self._current_page = 0
        self._show_page_numbers = False
        self._is_first_pass = True  # True during first pass, False during second
        self._toc_entries: list[tuple[str, str, int]] = []  # (id, title, level)
        self._first_content_page: Optional[int] = None  # Track first content page

    def _get_italic_font(self) -> str:
        """Get the italic variant of the current font.

        ReportLab's built-in Times font variants:
        - Times-Roman (regular)
        - Times-Italic
        - Times-Bold
        - Times-BoldItalic

        Returns:
            The italic font name, or the regular font if no italic is available.
        """
        if self.font_name == "Times-Roman":
            return "Times-Italic"
        elif self.font_name == "Helvetica":
            return "Helvetica-Oblique"
        elif self.font_name == "Courier":
            return "Courier-Oblique"
        else:
            # For custom fonts, try adding -Italic suffix
            return self.font_name

    def export(self, manuscript: Manuscript) -> ExportResult:
        """Export the manuscript as a PDF file.

        Args:
            manuscript: The manuscript to export.

        Returns:
            ExportResult with the PDF content and metadata.
        """
        try:
            content = self._generate_pdf(manuscript)
            return self._success_result(content, manuscript)
        except Exception as e:
            logger.error(f"PDF export failed: {e}")
            return self._error_result(f"PDF export failed: {str(e)}", manuscript)

    def _generate_pdf(self, manuscript: Manuscript) -> bytes:
        """Generate the PDF document using a two-pass build.

        The two-pass build is necessary to generate accurate TOC page numbers:
        1. First pass: Generate document and track chapter page positions
        2. Second pass: Rebuild with accurate TOC page numbers

        Args:
            manuscript: The manuscript to convert.

        Returns:
            Bytes content of the PDF file.
        """
        # Initialize styles once for both passes
        self._init_styles()

        # First pass: Build document to capture page numbers
        self._page_tracker = {}
        self._toc_entries = []
        self._current_page = 0
        self._is_first_pass = True
        self._first_content_page = None  # Reset for each pass

        first_pass_buffer = io.BytesIO()
        first_doc = self._create_document(first_pass_buffer, manuscript)
        first_story = self._build_story(manuscript)
        first_doc.build(first_story)

        # Save the first content page from the first pass for TOC calculation
        first_content_page_from_first_pass = self._first_content_page

        # Second pass: Rebuild with accurate TOC using captured page numbers
        self._is_first_pass = False
        self._first_content_page = None  # Reset for second pass rendering
        # Store the first content page for TOC display page number calculation
        self._first_content_page_for_toc = first_content_page_from_first_pass
        final_buffer = io.BytesIO()
        final_doc = self._create_document(final_buffer, manuscript)
        final_story = self._build_story(manuscript)
        final_doc.build(final_story)

        return final_buffer.getvalue()

    def _create_document(self, buffer: io.BytesIO, manuscript: Manuscript) -> BaseDocTemplate:
        """Create a PDF document with page templates.

        Args:
            buffer: BytesIO buffer for the document output.
            manuscript: The manuscript (for metadata).

        Returns:
            Configured BaseDocTemplate ready for building.
        """
        doc = BaseDocTemplate(
            buffer,
            pagesize=self.PAGE_SIZE,
            topMargin=self.MARGIN_TOP,
            bottomMargin=self.MARGIN_BOTTOM,
            leftMargin=self.MARGIN_LEFT,
            rightMargin=self.MARGIN_RIGHT,
            title=manuscript.title,
            author=manuscript.author_name or "",
        )

        # Create frames and page templates
        frame_width = self.PAGE_SIZE[0] - self.MARGIN_LEFT - self.MARGIN_RIGHT
        frame_height = self.PAGE_SIZE[1] - self.MARGIN_TOP - self.MARGIN_BOTTOM

        # Main content frame
        main_frame = Frame(
            self.MARGIN_LEFT,
            self.MARGIN_BOTTOM,
            frame_width,
            frame_height,
            id="main",
        )

        # Front matter template (no page numbers)
        front_template = PageTemplate(
            id="front",
            frames=[main_frame],
            onPage=self._on_front_page,
        )

        # Content template (with page numbers)
        content_template = PageTemplate(
            id="content",
            frames=[main_frame],
            onPage=self._on_content_page,
        )

        doc.addPageTemplates([front_template, content_template])

        return doc

    def _on_front_page(self, canvas, doc):
        """Callback for front matter pages (no page numbers)."""
        self._current_page = doc.page
        canvas.saveState()
        canvas.restoreState()

    def _on_content_page(self, canvas, doc):
        """Callback for content pages (with page numbers).

        Page numbers restart from 1 for content pages (after front matter).
        This follows standard book publishing conventions where front matter
        (title page, copyright, dedication, etc.) is either unnumbered or
        uses Roman numerals, and Arabic numerals begin with the first chapter.
        """
        self._current_page = doc.page
        canvas.saveState()

        # Track the first content page to calculate display page numbers
        if self._first_content_page is None:
            self._first_content_page = doc.page

        # Calculate display page number (starts at 1 for first content page)
        display_page_num = doc.page - self._first_content_page + 1

        # Draw page number at bottom center
        canvas.setFont(self.font_name, 10)
        canvas.drawCentredString(
            self.PAGE_SIZE[0] / 2,
            0.5 * inch,
            str(display_page_num),
        )

        canvas.restoreState()

    def _init_styles(self):
        """Initialize paragraph styles."""
        base_styles = getSampleStyleSheet()

        self._styles = {
            # Normal body text
            "Normal": ParagraphStyle(
                "Normal",
                parent=base_styles["Normal"],
                fontName=self.font_name,
                fontSize=self.font_size,
                leading=self.font_size * self.line_spacing,
                alignment=TA_JUSTIFY,
                firstLineIndent=0.5 * inch,
                spaceBefore=0,
                spaceAfter=0,
            ),
            # First paragraph (no indent)
            "FirstParagraph": ParagraphStyle(
                "FirstParagraph",
                parent=base_styles["Normal"],
                fontName=self.font_name,
                fontSize=self.font_size,
                leading=self.font_size * self.line_spacing,
                alignment=TA_JUSTIFY,
                firstLineIndent=0,
                spaceBefore=0,
                spaceAfter=0,
            ),
            # Title
            "Title": ParagraphStyle(
                "Title",
                parent=base_styles["Title"],
                fontName=self.font_name,
                fontSize=24,
                leading=28,
                alignment=TA_CENTER,
                spaceAfter=12,
            ),
            # Subtitle
            "Subtitle": ParagraphStyle(
                "Subtitle",
                parent=base_styles["Normal"],
                fontName=self.font_name,
                fontSize=16,
                leading=20,
                alignment=TA_CENTER,
                spaceAfter=6,
            ),
            # Author
            "Author": ParagraphStyle(
                "Author",
                parent=base_styles["Normal"],
                fontName=self.font_name,
                fontSize=14,
                leading=18,
                alignment=TA_CENTER,
                spaceBefore=24,
            ),
            # Chapter heading
            "ChapterHeading": ParagraphStyle(
                "ChapterHeading",
                parent=base_styles["Heading1"],
                fontName=self.font_name,
                fontSize=18,
                leading=22,
                alignment=TA_CENTER,
                spaceBefore=72,
                spaceAfter=6,
            ),
            # Chapter title
            "ChapterTitle": ParagraphStyle(
                "ChapterTitle",
                parent=base_styles["Normal"],
                fontName=self._get_italic_font(),
                fontSize=14,
                leading=18,
                alignment=TA_CENTER,
                spaceAfter=36,
            ),
            # Section heading
            "Heading2": ParagraphStyle(
                "Heading2",
                parent=base_styles["Heading2"],
                fontName=self.font_name,
                fontSize=14,
                leading=18,
                alignment=TA_CENTER,
                spaceBefore=24,
                spaceAfter=12,
            ),
            # Copyright text
            "Copyright": ParagraphStyle(
                "Copyright",
                parent=base_styles["Normal"],
                fontName=self.font_name,
                fontSize=10,
                leading=14,
                alignment=TA_LEFT,
                firstLineIndent=0,
                spaceAfter=8,
            ),
            # Dedication
            "Dedication": ParagraphStyle(
                "Dedication",
                parent=base_styles["Normal"],
                fontName=self._get_italic_font(),
                fontSize=self.font_size,
                leading=self.font_size * self.line_spacing,
                alignment=TA_CENTER,
            ),
            # Epigraph
            "Epigraph": ParagraphStyle(
                "Epigraph",
                parent=base_styles["Normal"],
                fontName=self._get_italic_font(),
                fontSize=self.font_size,
                leading=self.font_size * self.line_spacing,
                alignment=TA_LEFT,
                leftIndent=1 * inch,
                rightIndent=1 * inch,
            ),
            # Attribution
            "Attribution": ParagraphStyle(
                "Attribution",
                parent=base_styles["Normal"],
                fontName=self.font_name,
                fontSize=self.font_size,
                leading=self.font_size * self.line_spacing,
                alignment=TA_RIGHT,
                rightIndent=1 * inch,
                spaceBefore=12,
            ),
            # Scene break
            "SceneBreak": ParagraphStyle(
                "SceneBreak",
                parent=base_styles["Normal"],
                fontName=self.font_name,
                fontSize=self.font_size,
                alignment=TA_CENTER,
                spaceBefore=18,
                spaceAfter=18,
            ),
            # TOC heading
            "TOCHeading": ParagraphStyle(
                "TOCHeading",
                parent=base_styles["Heading1"],
                fontName=self.font_name,
                fontSize=18,
                leading=22,
                alignment=TA_CENTER,
                spaceBefore=36,
                spaceAfter=24,
            ),
            # TOC entry
            "TOCEntry": ParagraphStyle(
                "TOCEntry",
                parent=base_styles["Normal"],
                fontName=self.font_name,
                fontSize=self.font_size,
                leading=self.font_size * 1.5,
                firstLineIndent=0,
            ),
        }

    def _build_story(self, manuscript: Manuscript) -> list:
        """Build the document story (content flow).

        Args:
            manuscript: The manuscript to convert.

        Returns:
            List of flowable elements.
        """
        story = []

        # Start with front matter template
        story.append(NextPageTemplate("front"))

        # Front matter
        if manuscript.title_page:
            story.extend(self._build_title_page(manuscript.title_page))
            story.append(PageBreak())

        if manuscript.copyright_page:
            story.extend(self._build_copyright_page(manuscript.copyright_page))
            story.append(PageBreak())

        if manuscript.dedication:
            story.extend(self._build_dedication_page(manuscript.dedication))
            story.append(PageBreak())

        if manuscript.epigraph:
            story.extend(self._build_epigraph_page(manuscript.epigraph))
            story.append(PageBreak())

        if manuscript.acknowledgments:
            story.extend(self._build_acknowledgments_page(manuscript.acknowledgments))
            story.append(PageBreak())

        # Table of contents (placed before chapters, with page numbers)
        if manuscript.chapters:
            story.extend(self._build_toc(manuscript))
            story.append(PageBreak())

        # Switch to content template (with page numbers)
        story.append(NextPageTemplate("content"))

        # Chapters
        for i, chapter in enumerate(manuscript.chapters):
            if not chapter.content or not chapter.content.strip():
                continue  # Skip empty chapters

            story.extend(self._build_chapter(chapter))

            # Page break after each chapter except the last
            if i < len(manuscript.chapters) - 1:
                story.append(PageBreak())

        # Back matter
        if manuscript.author_bio:
            story.append(PageBreak())
            story.extend(self._build_author_bio_page(manuscript))

        if manuscript.also_by:
            story.append(PageBreak())
            story.extend(self._build_also_by_page(manuscript))

        if manuscript.excerpt:
            story.append(PageBreak())
            story.extend(self._build_excerpt_page(manuscript))

        return story

    def _build_title_page(self, content: TitlePageContent) -> list:
        """Build title page elements.

        Args:
            content: Title page content.

        Returns:
            List of flowable elements.
        """
        elements = []

        # Add vertical space to center content
        elements.append(Spacer(1, 2 * inch))

        # Title
        elements.append(Paragraph(self._escape(content.title), self._styles["Title"]))

        # Subtitle
        if content.subtitle:
            elements.append(Paragraph(self._escape(content.subtitle), self._styles["Subtitle"]))

        # Author
        if content.author_name:
            elements.append(Spacer(1, 24))
            elements.append(
                Paragraph(f"by {self._escape(content.author_name)}", self._styles["Author"])
            )

        # Publisher
        if content.publisher:
            elements.append(Spacer(1, 48))
            elements.append(Paragraph(self._escape(content.publisher), self._styles["Author"]))

        # Edition
        if content.edition:
            elements.append(Paragraph(self._escape(content.edition), self._styles["Author"]))

        return elements

    def _build_copyright_page(self, content: CopyrightContent) -> list:
        """Build copyright page elements.

        Args:
            content: Copyright page content.

        Returns:
            List of flowable elements.
        """
        elements = []

        # Add vertical space
        elements.append(Spacer(1, 2 * inch))

        # Copyright notice
        author = content.author_name or "Author"
        elements.append(
            Paragraph(
                f"Copyright © {content.year} {self._escape(author)}",
                self._styles["Copyright"],
            )
        )

        # Rights statement
        elements.append(
            Paragraph(self._escape(content.rights_statement), self._styles["Copyright"])
        )

        # Publisher
        if content.publisher:
            elements.append(Spacer(1, 12))
            elements.append(
                Paragraph(
                    f"Published by {self._escape(content.publisher)}",
                    self._styles["Copyright"],
                )
            )

        # ISBN
        if content.isbn:
            elements.append(
                Paragraph(f"ISBN: {self._escape(content.isbn)}", self._styles["Copyright"])
            )

        # Edition info
        if content.edition_info:
            elements.append(Spacer(1, 12))
            elements.append(
                Paragraph(self._escape(content.edition_info), self._styles["Copyright"])
            )

        # Credits
        if content.credits:
            elements.append(Spacer(1, 12))
            for credit in content.credits:
                elements.append(Paragraph(self._escape(credit), self._styles["Copyright"]))

        # Fiction disclaimer
        elements.append(Spacer(1, 24))
        disclaimer = (
            "This is a work of fiction. Names, characters, places, and incidents "
            "either are the product of the author's imagination or are used "
            "fictitiously. Any resemblance to actual persons, living or dead, "
            "events, or locales is entirely coincidental."
        )
        elements.append(Paragraph(disclaimer, self._styles["Copyright"]))

        return elements

    def _build_dedication_page(self, content: DedicationContent) -> list:
        """Build dedication page elements.

        Args:
            content: Dedication content.

        Returns:
            List of flowable elements.
        """
        elements = []

        # Center vertically
        elements.append(Spacer(1, 2.5 * inch))

        # Dedication text
        elements.append(Paragraph(self._escape(content.text), self._styles["Dedication"]))

        return elements

    def _build_epigraph_page(self, content: EpigraphContent) -> list:
        """Build epigraph page elements.

        Args:
            content: Epigraph content.

        Returns:
            List of flowable elements.
        """
        elements = []

        # Center vertically
        elements.append(Spacer(1, 2.5 * inch))

        # Quote
        elements.append(Paragraph(f'"{self._escape(content.text)}"', self._styles["Epigraph"]))

        # Attribution
        if content.attribution or content.source:
            attr_parts = []
            if content.attribution:
                attr_parts.append(self._escape(content.attribution))
            if content.source:
                attr_parts.append(f"<i>{self._escape(content.source)}</i>")
            attribution = ", ".join(attr_parts)
            elements.append(Paragraph(f"— {attribution}", self._styles["Attribution"]))

        return elements

    def _build_acknowledgments_page(self, text: str) -> list:
        """Build acknowledgments page elements.

        Args:
            text: Acknowledgments text.

        Returns:
            List of flowable elements.
        """
        elements = []

        # Heading
        elements.append(Paragraph("Acknowledgments", self._styles["Heading2"]))

        # Content
        paragraphs = self._text_to_paragraphs(text)
        for i, para in enumerate(paragraphs):
            style = "FirstParagraph" if i == 0 else "Normal"
            elements.append(Paragraph(para, self._styles[style]))

        return elements

    def _build_toc(self, manuscript: Manuscript) -> list:
        """Build table of contents with page numbers.

        On the first pass, page numbers are not yet known, so placeholder
        dots are used. On the second pass, actual page numbers from the
        page tracker are included, converted to display page numbers
        (starting from 1 for the first content page).

        Args:
            manuscript: The manuscript.

        Returns:
            List of flowable elements.
        """
        elements = []

        # TOC heading
        elements.append(Paragraph("Table of Contents", self._styles["TOCHeading"]))
        elements.append(Spacer(1, 12))

        # Calculate available width for TOC entries
        page_width = self.PAGE_SIZE[0] - self.MARGIN_LEFT - self.MARGIN_RIGHT

        # Build TOC entries with dotted leaders and page numbers
        for chapter in manuscript.chapters:
            if not chapter.content or not chapter.content.strip():
                continue

            entry_id = f"chapter-{chapter.number}"
            chapter_title = self._escape(chapter.title or f"Chapter {chapter.number}")
            entry_title = f"Chapter {chapter.number}: {chapter_title}"

            # Get page number if available (second pass) or use placeholder
            if not self._is_first_pass and entry_id in self._page_tracker:
                raw_page_num = self._page_tracker[entry_id]
                # Convert raw page number to display page number (starting from 1)
                # Use the first content page captured during the first pass
                first_content = getattr(self, "_first_content_page_for_toc", None)
                if first_content is not None:
                    display_page_num = raw_page_num - first_content + 1
                else:
                    display_page_num = raw_page_num
                page_num = str(display_page_num)
            else:
                page_num = "..."

            # Create TOC entry with dotted leader line
            toc_entry = self._build_toc_entry(entry_title, page_num, page_width)
            elements.append(toc_entry)

        return elements

    def _build_toc_entry(self, title: str, page_num: str, available_width: float) -> Table:
        """Build a single TOC entry with dotted leader.

        Creates a table-based TOC entry with the chapter title on the left,
        a dotted leader in the middle, and the page number on the right.

        Args:
            title: The chapter title to display.
            page_num: The page number (or placeholder).
            available_width: Available width for the entry.

        Returns:
            Table flowable representing the TOC entry.
        """
        # Create cells for title and page number
        title_para = Paragraph(title, self._styles["TOCEntry"])
        page_para = Paragraph(page_num, self._styles["TOCEntry"])

        # Create table with two columns
        # Title column takes most of the width, page number is right-aligned
        col_widths = [available_width - 0.5 * inch, 0.5 * inch]

        table = Table(
            [[title_para, page_para]],
            colWidths=col_widths,
        )

        table.setStyle(
            TableStyle(
                [
                    ("ALIGN", (0, 0), (0, 0), "LEFT"),
                    ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ]
            )
        )

        return table

    def _build_chapter(self, chapter: ChapterContent) -> list:
        """Build chapter elements with TOC entry marker.

        Includes an invisible TOCEntry flowable at the start to track
        the page number where this chapter begins (used for TOC generation).

        Args:
            chapter: Chapter content.

        Returns:
            List of flowable elements.
        """
        elements = []

        # Add TOC entry marker to track page number (first pass only needs this)
        entry_id = f"chapter-{chapter.number}"
        chapter_title = chapter.title or f"Chapter {chapter.number}"
        toc_marker = TOCEntry(
            entry_id=entry_id,
            title=f"Chapter {chapter.number}: {chapter_title}",
            level=1,
            page_tracker=self._page_tracker,
        )
        elements.append(toc_marker)

        # Chapter heading
        elements.append(Paragraph(f"CHAPTER {chapter.number}", self._styles["ChapterHeading"]))

        # Chapter title
        if chapter.title:
            elements.append(Paragraph(self._escape(chapter.title), self._styles["ChapterTitle"]))

        # Chapter content
        content_elements = self._content_to_elements(chapter.content)
        elements.extend(content_elements)

        return elements

    def _build_author_bio_page(self, manuscript: Manuscript) -> list:
        """Build author bio page elements.

        Args:
            manuscript: The manuscript with author bio.

        Returns:
            List of flowable elements.
        """
        elements = []
        bio = manuscript.author_bio

        # Heading
        elements.append(Paragraph("About the Author", self._styles["Heading2"]))

        # Bio text
        paragraphs = self._text_to_paragraphs(bio.text)
        for i, para in enumerate(paragraphs):
            style = "FirstParagraph" if i == 0 else "Normal"
            elements.append(Paragraph(para, self._styles[style]))

        # Website
        if bio.website:
            elements.append(Spacer(1, 12))
            elements.append(
                Paragraph(
                    f"Website: {self._escape(bio.website)}",
                    self._styles["FirstParagraph"],
                )
            )

        # Social media
        if bio.social_media:
            for platform, handle in bio.social_media.items():
                elements.append(
                    Paragraph(
                        f"{platform.capitalize()}: {self._escape(handle)}",
                        self._styles["FirstParagraph"],
                    )
                )

        return elements

    def _build_also_by_page(self, manuscript: Manuscript) -> list:
        """Build "Also By" page elements.

        Args:
            manuscript: The manuscript with also_by content.

        Returns:
            List of flowable elements.
        """
        elements = []
        ab = manuscript.also_by

        # Heading
        elements.append(
            Paragraph(f"Also by {self._escape(ab.author_name)}", self._styles["Heading2"])
        )

        # Series info
        if ab.series_info:
            for series_name, titles in ab.series_info.items():
                elements.append(Spacer(1, 12))
                elements.append(
                    Paragraph(
                        f"<b>{self._escape(series_name)} Series</b>",
                        self._styles["FirstParagraph"],
                    )
                )
                for title in titles:
                    elements.append(
                        Paragraph(
                            f"    <i>{self._escape(title)}</i>",
                            self._styles["FirstParagraph"],
                        )
                    )

        # Standalone titles
        if ab.titles:
            elements.append(Spacer(1, 12))
            elements.append(Paragraph("<b>Standalone Novels</b>", self._styles["FirstParagraph"]))
            for title in ab.titles:
                elements.append(
                    Paragraph(
                        f"    <i>{self._escape(title)}</i>",
                        self._styles["FirstParagraph"],
                    )
                )

        return elements

    def _build_excerpt_page(self, manuscript: Manuscript) -> list:
        """Build excerpt/preview page elements.

        Args:
            manuscript: The manuscript with excerpt content.

        Returns:
            List of flowable elements.
        """
        elements = []
        ex = manuscript.excerpt

        # Coming soon
        if ex.coming_soon_date:
            elements.append(
                Paragraph(
                    f"<b>Coming Soon: {self._escape(ex.coming_soon_date)}</b>",
                    self._styles["FirstParagraph"],
                )
            )
            elements.append(Spacer(1, 12))

        # Book title
        elements.append(Paragraph(self._escape(ex.book_title), self._styles["Heading2"]))

        # Chapter title
        if ex.chapter_title:
            elements.append(Paragraph(self._escape(ex.chapter_title), self._styles["ChapterTitle"]))

        # Excerpt text
        paragraphs = self._text_to_paragraphs(ex.text)
        for i, para in enumerate(paragraphs):
            style = "FirstParagraph" if i == 0 else "Normal"
            elements.append(Paragraph(para, self._styles[style]))

        return elements

    def _content_to_elements(self, content: str) -> list:
        """Convert chapter content to flowable elements.

        Handles:
        - Paragraph breaks (double newlines)
        - Scene breaks (* * *, # # #, etc.)
        - First paragraph styling

        Args:
            content: Raw chapter content text.

        Returns:
            List of flowable elements.
        """
        if not content:
            return []

        elements = []

        # Normalize line endings
        content = content.replace("\r\n", "\n").replace("\r", "\n")

        # Handle scene breaks
        scene_break_patterns = [
            r"\n\s*\*\s*\*\s*\*\s*\n",
            r"\n\s*#\s*#\s*#\s*\n",
            r"\n\s*-\s*-\s*-\s*\n",
            r"\n\s*~\s*~\s*~\s*\n",
        ]
        scene_break_marker = "\n\n[SCENE_BREAK]\n\n"
        for pattern in scene_break_patterns:
            content = re.sub(pattern, scene_break_marker, content)

        # Split into paragraphs
        paragraphs = re.split(r"\n\s*\n", content)

        first_after_break = True

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            if para == "[SCENE_BREAK]":
                elements.append(Paragraph("* * *", self._styles["SceneBreak"]))
                first_after_break = True
            else:
                escaped = self._escape(para)
                style = "FirstParagraph" if first_after_break else "Normal"
                elements.append(Paragraph(escaped, self._styles[style]))
                first_after_break = False

        return elements

    def _text_to_paragraphs(self, text: str) -> list[str]:
        """Convert plain text to list of escaped paragraph strings.

        Args:
            text: Plain text content.

        Returns:
            List of escaped paragraph strings.
        """
        if not text:
            return []

        paragraphs = text.strip().split("\n\n")
        return [self._escape(p.strip()) for p in paragraphs if p.strip()]

    def _escape(self, text: str) -> str:
        """Escape text for safe inclusion in ReportLab paragraphs.

        ReportLab uses a subset of HTML for formatting, so we need to
        escape special characters.

        Args:
            text: Raw text to escape.

        Returns:
            Escaped string safe for ReportLab.
        """
        if not text:
            return ""

        # Escape HTML special characters
        text = text.replace("&", "&amp;")
        text = text.replace("<", "&lt;")
        text = text.replace(">", "&gt;")

        return text


# Register the exporter
ExporterRegistry.register(ExportFormat.PDF, PDFExportService)
