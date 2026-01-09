"""EPUB3 export service for manuscripts.

Uses EbookLib to generate valid EPUB3 files with proper structure,
metadata, and navigation. Content is converted to valid XHTML.
"""

import html
import io
import re
import uuid
from typing import Optional

from ebooklib import epub

from app.services.manuscript_assembly import (
    ChapterContent,
    CopyrightContent,
    DedicationContent,
    EpigraphContent,
    Manuscript,
    TitlePageContent,
)

from .exporters.base import BaseExporter, ExporterRegistry, ExportFormat, ExportResult


class EPUBExportError(Exception):
    """Exception raised when EPUB export fails."""

    pass


class EPUBExportService(BaseExporter):
    """Service for exporting manuscripts to EPUB3 format.

    Features:
    - EPUB3 compliant output
    - Proper metadata (DC terms)
    - Navigation document (NCX and EPUB3 nav)
    - Front matter sections (title page, copyright, dedication)
    - Chapter content as valid XHTML
    - CSS styling for consistent formatting
    """

    format = ExportFormat.EPUB
    file_extension = ".epub"
    mime_type = "application/epub+zip"

    # Default CSS for EPUB content
    DEFAULT_CSS = """
body {
    font-family: Georgia, "Times New Roman", serif;
    line-height: 1.6;
    margin: 1em;
    padding: 0;
}

h1 {
    font-size: 2em;
    text-align: center;
    margin-top: 3em;
    margin-bottom: 1em;
    page-break-before: always;
}

h2 {
    font-size: 1.5em;
    text-align: center;
    margin-top: 2em;
    margin-bottom: 1em;
}

h3 {
    font-size: 1.2em;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
}

p {
    text-indent: 1.5em;
    margin: 0;
    padding: 0;
}

p.first, p.no-indent {
    text-indent: 0;
}

p.center {
    text-align: center;
    text-indent: 0;
}

.scene-break {
    text-align: center;
    margin: 2em 0;
}

.title-page {
    text-align: center;
    margin-top: 30%;
}

.title-page h1 {
    page-break-before: auto;
}

.title-page .author {
    font-size: 1.2em;
    margin-top: 2em;
}

.title-page .publisher {
    margin-top: 3em;
    font-style: italic;
}

.copyright-page {
    font-size: 0.9em;
    margin-top: 30%;
}

.copyright-page p {
    text-indent: 0;
    margin-bottom: 1em;
}

.dedication {
    font-style: italic;
    text-align: center;
    margin-top: 30%;
}

.epigraph {
    font-style: italic;
    margin: 30% 2em 0 2em;
}

.epigraph .attribution {
    text-align: right;
    margin-top: 1em;
    font-style: normal;
}

.chapter-header {
    text-align: center;
    margin-top: 3em;
    margin-bottom: 2em;
}

.chapter-number {
    font-size: 1.2em;
    letter-spacing: 0.2em;
    margin-bottom: 0.5em;
}

.chapter-title {
    font-size: 1.5em;
    font-style: italic;
}

.acknowledgments h2 {
    margin-top: 3em;
}

.author-bio h2 {
    margin-top: 3em;
}

.also-by h2 {
    margin-top: 3em;
}
"""

    def __init__(self, css: Optional[str] = None):
        """Initialize the EPUB export service.

        Args:
            css: Optional custom CSS for styling. Uses DEFAULT_CSS if not provided.
        """
        self.css = css or self.DEFAULT_CSS

    def export(self, manuscript: Manuscript) -> ExportResult:
        """Export the manuscript as an EPUB3 file.

        Args:
            manuscript: The manuscript to export.

        Returns:
            ExportResult with the EPUB content and metadata.
        """
        try:
            book = self._create_book(manuscript)
            content = self._write_book_to_bytes(book)
            return self._success_result(content, manuscript)
        except Exception as e:
            return self._error_result(f"EPUB export failed: {str(e)}", manuscript)

    def _create_book(self, manuscript: Manuscript) -> epub.EpubBook:
        """Create an EPUB book from the manuscript.

        Args:
            manuscript: The manuscript to convert.

        Returns:
            EpubBook ready for writing.
        """
        book = epub.EpubBook()

        # Set required metadata
        book_id = str(uuid.uuid4())
        book.set_identifier(book_id)
        book.set_title(manuscript.title)
        book.set_language("en")

        # Set optional metadata
        if manuscript.author_name:
            book.add_author(manuscript.author_name)

        # Add CSS
        css_item = epub.EpubItem(
            uid="style",
            file_name="style/main.css",
            media_type="text/css",
            content=self.css.encode("utf-8"),
        )
        book.add_item(css_item)

        # Build book structure
        spine = ["nav"]  # Navigation document must be first
        toc = []

        # Add front matter
        if manuscript.title_page:
            item = self._create_title_page(manuscript.title_page, css_item)
            book.add_item(item)
            spine.append(item)

        if manuscript.copyright_page:
            item = self._create_copyright_page(manuscript.copyright_page, css_item)
            book.add_item(item)
            spine.append(item)

        if manuscript.dedication:
            item = self._create_dedication_page(manuscript.dedication, css_item)
            book.add_item(item)
            spine.append(item)

        if manuscript.epigraph:
            item = self._create_epigraph_page(manuscript.epigraph, css_item)
            book.add_item(item)
            spine.append(item)

        if manuscript.acknowledgments:
            item = self._create_acknowledgments_page(manuscript.acknowledgments, css_item)
            book.add_item(item)
            spine.append(item)

        # Add chapters
        for chapter in manuscript.chapters:
            if not chapter.content or not chapter.content.strip():
                continue  # Skip empty chapters

            item = self._create_chapter(chapter, css_item)
            book.add_item(item)
            spine.append(item)
            toc.append(
                epub.Link(
                    item.file_name,
                    f"Chapter {chapter.number}: {chapter.title}",
                    f"chapter_{chapter.number}",
                )
            )

        # Add back matter
        if manuscript.author_bio:
            item = self._create_author_bio_page(manuscript, css_item)
            book.add_item(item)
            spine.append(item)
            toc.append(epub.Link(item.file_name, "About the Author", "author_bio"))

        if manuscript.also_by:
            item = self._create_also_by_page(manuscript, css_item)
            book.add_item(item)
            spine.append(item)
            toc.append(epub.Link(item.file_name, "Also By", "also_by"))

        if manuscript.excerpt:
            item = self._create_excerpt_page(manuscript, css_item)
            book.add_item(item)
            spine.append(item)
            toc.append(epub.Link(item.file_name, "Preview", "excerpt"))

        # Set table of contents and spine
        book.toc = tuple(toc)
        book.spine = spine

        # Add required EPUB3 navigation document
        book.add_item(epub.EpubNcx())
        book.add_item(epub.EpubNav())

        return book

    def _write_book_to_bytes(self, book: epub.EpubBook) -> bytes:
        """Write the EPUB book to a bytes buffer.

        Args:
            book: The EpubBook to write.

        Returns:
            Bytes content of the EPUB file.
        """
        buffer = io.BytesIO()
        epub.write_epub(buffer, book, {})
        return buffer.getvalue()

    def _create_title_page(self, content: TitlePageContent, css: epub.EpubItem) -> epub.EpubHtml:
        """Create the title page XHTML.

        Args:
            content: Title page content.
            css: CSS item to include.

        Returns:
            EpubHtml item for the title page.
        """
        title_html = self._escape_html(content.title)
        parts = [
            '<div class="title-page">',
            f"<h1>{title_html}</h1>",
        ]

        if content.subtitle:
            parts.append(f'<p class="subtitle">{self._escape_html(content.subtitle)}</p>')

        if content.author_name:
            parts.append(f'<p class="author">by {self._escape_html(content.author_name)}</p>')

        if content.publisher:
            parts.append(f'<p class="publisher">{self._escape_html(content.publisher)}</p>')

        if content.edition:
            parts.append(f'<p class="edition">{self._escape_html(content.edition)}</p>')

        parts.append("</div>")

        return self._create_html_item(
            uid="title_page",
            file_name="title_page.xhtml",
            title="Title Page",
            body_content="\n".join(parts),
            css=css,
        )

    def _create_copyright_page(
        self, content: CopyrightContent, css: epub.EpubItem
    ) -> epub.EpubHtml:
        """Create the copyright page XHTML.

        Args:
            content: Copyright page content.
            css: CSS item to include.

        Returns:
            EpubHtml item for the copyright page.
        """
        author = self._escape_html(content.author_name or "Author")
        parts = [
            '<div class="copyright-page">',
            f"<p>Copyright © {content.year} {author}</p>",
            f"<p>{self._escape_html(content.rights_statement)}</p>",
        ]

        if content.publisher:
            parts.append(f"<p>Published by {self._escape_html(content.publisher)}</p>")

        if content.isbn:
            parts.append(f"<p>ISBN: {self._escape_html(content.isbn)}</p>")

        if content.edition_info:
            parts.append(f"<p>{self._escape_html(content.edition_info)}</p>")

        if content.credits:
            for credit in content.credits:
                parts.append(f"<p>{self._escape_html(credit)}</p>")

        parts.append(
            "<p>This is a work of fiction. Names, characters, places, and incidents "
            "either are the product of the author's imagination or are used "
            "fictitiously. Any resemblance to actual persons, living or dead, "
            "events, or locales is entirely coincidental.</p>"
        )
        parts.append("</div>")

        return self._create_html_item(
            uid="copyright",
            file_name="copyright.xhtml",
            title="Copyright",
            body_content="\n".join(parts),
            css=css,
        )

    def _create_dedication_page(
        self, content: DedicationContent, css: epub.EpubItem
    ) -> epub.EpubHtml:
        """Create the dedication page XHTML.

        Args:
            content: Dedication content.
            css: CSS item to include.

        Returns:
            EpubHtml item for the dedication page.
        """
        text_html = self._escape_html(content.text)
        body = f'<div class="dedication"><p>{text_html}</p></div>'

        return self._create_html_item(
            uid="dedication",
            file_name="dedication.xhtml",
            title="Dedication",
            body_content=body,
            css=css,
        )

    def _create_epigraph_page(self, content: EpigraphContent, css: epub.EpubItem) -> epub.EpubHtml:
        """Create the epigraph page XHTML.

        Args:
            content: Epigraph content.
            css: CSS item to include.

        Returns:
            EpubHtml item for the epigraph page.
        """
        text_html = self._escape_html(content.text)
        parts = [
            '<div class="epigraph">',
            f'<p>"{text_html}"</p>',
        ]

        if content.attribution or content.source:
            attr_parts = []
            if content.attribution:
                attr_parts.append(self._escape_html(content.attribution))
            if content.source:
                attr_parts.append(f"<em>{self._escape_html(content.source)}</em>")
            attribution = ", ".join(attr_parts)
            parts.append(f'<p class="attribution">— {attribution}</p>')

        parts.append("</div>")

        return self._create_html_item(
            uid="epigraph",
            file_name="epigraph.xhtml",
            title="Epigraph",
            body_content="\n".join(parts),
            css=css,
        )

    def _create_acknowledgments_page(self, text: str, css: epub.EpubItem) -> epub.EpubHtml:
        """Create the acknowledgments page XHTML.

        Args:
            text: Acknowledgments text.
            css: CSS item to include.

        Returns:
            EpubHtml item for the acknowledgments page.
        """
        paragraphs = self._text_to_paragraphs(text)
        body = f'<div class="acknowledgments"><h2>Acknowledgments</h2>{paragraphs}</div>'

        return self._create_html_item(
            uid="acknowledgments",
            file_name="acknowledgments.xhtml",
            title="Acknowledgments",
            body_content=body,
            css=css,
        )

    def _create_chapter(self, chapter: ChapterContent, css: epub.EpubItem) -> epub.EpubHtml:
        """Create a chapter XHTML.

        Args:
            chapter: Chapter content.
            css: CSS item to include.

        Returns:
            EpubHtml item for the chapter.
        """
        # Create chapter header
        header = [
            '<div class="chapter-header">',
            f'<p class="chapter-number">CHAPTER {chapter.number}</p>',
            f'<p class="chapter-title">{self._escape_html(chapter.title)}</p>',
            "</div>",
        ]

        # Convert content to XHTML paragraphs
        content_html = self._content_to_xhtml(chapter.content)

        body = "\n".join(header) + content_html

        return self._create_html_item(
            uid=f"chapter_{chapter.number}",
            file_name=f"chapter_{chapter.number:02d}.xhtml",
            title=f"Chapter {chapter.number}: {chapter.title}",
            body_content=body,
            css=css,
        )

    def _create_author_bio_page(self, manuscript: Manuscript, css: epub.EpubItem) -> epub.EpubHtml:
        """Create the author bio page XHTML.

        Args:
            manuscript: Manuscript with author bio.
            css: CSS item to include.

        Returns:
            EpubHtml item for the author bio page.
        """
        bio = manuscript.author_bio
        parts = [
            '<div class="author-bio">',
            "<h2>About the Author</h2>",
            self._text_to_paragraphs(bio.text),
        ]

        if bio.website:
            parts.append(
                f'<p>Website: <a href="{self._escape_html(bio.website)}">'
                f"{self._escape_html(bio.website)}</a></p>"
            )

        if bio.social_media:
            for platform, handle in bio.social_media.items():
                parts.append(
                    f"<p>{self._escape_html(platform.capitalize())}: "
                    f"{self._escape_html(handle)}</p>"
                )

        parts.append("</div>")

        return self._create_html_item(
            uid="author_bio",
            file_name="author_bio.xhtml",
            title="About the Author",
            body_content="\n".join(parts),
            css=css,
        )

    def _create_also_by_page(self, manuscript: Manuscript, css: epub.EpubItem) -> epub.EpubHtml:
        """Create the "Also By" page XHTML.

        Args:
            manuscript: Manuscript with also_by content.
            css: CSS item to include.

        Returns:
            EpubHtml item for the also by page.
        """
        ab = manuscript.also_by
        parts = [
            '<div class="also-by">',
            f"<h2>Also by {self._escape_html(ab.author_name)}</h2>",
        ]

        if ab.series_info:
            for series_name, titles in ab.series_info.items():
                parts.append(f"<h3>{self._escape_html(series_name)} Series</h3>")
                parts.append("<ul>")
                for title in titles:
                    parts.append(f"<li><em>{self._escape_html(title)}</em></li>")
                parts.append("</ul>")

        if ab.titles:
            parts.append("<h3>Standalone Novels</h3>")
            parts.append("<ul>")
            for title in ab.titles:
                parts.append(f"<li><em>{self._escape_html(title)}</em></li>")
            parts.append("</ul>")

        parts.append("</div>")

        return self._create_html_item(
            uid="also_by",
            file_name="also_by.xhtml",
            title="Also By",
            body_content="\n".join(parts),
            css=css,
        )

    def _create_excerpt_page(self, manuscript: Manuscript, css: epub.EpubItem) -> epub.EpubHtml:
        """Create the excerpt/preview page XHTML.

        Args:
            manuscript: Manuscript with excerpt content.
            css: CSS item to include.

        Returns:
            EpubHtml item for the excerpt page.
        """
        ex = manuscript.excerpt
        parts = ['<div class="excerpt">']

        if ex.coming_soon_date:
            date_html = self._escape_html(ex.coming_soon_date)
            parts.append(f"<p><strong>Coming Soon: {date_html}</strong></p>")

        parts.append(f"<h2>{self._escape_html(ex.book_title)}</h2>")

        if ex.chapter_title:
            parts.append(f"<h3>{self._escape_html(ex.chapter_title)}</h3>")

        parts.append(self._text_to_paragraphs(ex.text))
        parts.append("</div>")

        return self._create_html_item(
            uid="excerpt",
            file_name="excerpt.xhtml",
            title="Preview",
            body_content="\n".join(parts),
            css=css,
        )

    def _create_html_item(
        self,
        uid: str,
        file_name: str,
        title: str,
        body_content: str,
        css: epub.EpubItem,
    ) -> epub.EpubHtml:
        """Create an EpubHtml item with proper XHTML structure.

        Args:
            uid: Unique identifier for the item.
            file_name: File name within the EPUB.
            title: Title for the document.
            body_content: HTML content for the body.
            css: CSS item to link.

        Returns:
            EpubHtml item.
        """
        item = epub.EpubHtml(
            uid=uid,
            file_name=file_name,
            title=title,
        )

        # Build complete XHTML document
        xhtml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
    <meta charset="UTF-8" />
    <title>{self._escape_html(title)}</title>
    <link rel="stylesheet" type="text/css" href="{css.file_name}" />
</head>
<body>
{body_content}
</body>
</html>"""

        item.set_content(xhtml.encode("utf-8"))
        item.add_item(css)

        return item

    def _content_to_xhtml(self, content: str) -> str:
        """Convert chapter content to valid XHTML.

        Handles:
        - Paragraph breaks (double newlines)
        - Scene breaks (* * *, # # #, etc.)
        - First paragraph no-indent styling
        - Special character escaping

        Args:
            content: Raw chapter content text.

        Returns:
            XHTML string with proper paragraph markup.
        """
        if not content:
            return ""

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

        xhtml_parts = []
        first_after_break = True

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            if para == "[SCENE_BREAK]":
                xhtml_parts.append('<p class="scene-break">* * *</p>')
                first_after_break = True
            else:
                escaped = self._escape_html(para)
                if first_after_break:
                    xhtml_parts.append(f'<p class="first">{escaped}</p>')
                    first_after_break = False
                else:
                    xhtml_parts.append(f"<p>{escaped}</p>")

        return "\n".join(xhtml_parts)

    def _text_to_paragraphs(self, text: str) -> str:
        """Convert plain text to XHTML paragraphs.

        Args:
            text: Plain text content.

        Returns:
            XHTML string with paragraph markup.
        """
        if not text:
            return ""

        paragraphs = text.strip().split("\n\n")
        xhtml_parts = []

        for i, para in enumerate(paragraphs):
            para = para.strip()
            if para:
                escaped = self._escape_html(para)
                css_class = 'class="first"' if i == 0 else ""
                if css_class:
                    xhtml_parts.append(f"<p {css_class}>{escaped}</p>")
                else:
                    xhtml_parts.append(f"<p>{escaped}</p>")

        return "\n".join(xhtml_parts)

    def _escape_html(self, text: str) -> str:
        """Escape text for safe inclusion in XHTML.

        Args:
            text: Raw text to escape.

        Returns:
            HTML-escaped string.
        """
        return html.escape(text, quote=True)


# Register the exporter
ExporterRegistry.register(ExportFormat.EPUB, EPUBExportService)
