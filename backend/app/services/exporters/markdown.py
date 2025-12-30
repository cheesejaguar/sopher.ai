"""Markdown exporter for manuscripts."""

from app.services.manuscript_assembly import (
    ChapterContent,
    Manuscript,
)

from .base import BaseExporter, ExporterRegistry, ExportFormat, ExportResult


class MarkdownExporter(BaseExporter):
    """Exporter for Markdown format."""

    format = ExportFormat.MARKDOWN
    file_extension = ".md"
    mime_type = "text/markdown"

    def export(self, manuscript: Manuscript) -> ExportResult:
        """
        Export the manuscript as Markdown.

        Args:
            manuscript: The manuscript to export.

        Returns:
            ExportResult with the Markdown content.
        """
        try:
            parts = []

            # Title page
            if manuscript.title_page:
                parts.append(self._format_title_page(manuscript))

            # Copyright
            if manuscript.copyright_page:
                parts.append(self._format_copyright(manuscript))

            # Dedication
            if manuscript.dedication:
                parts.append(self._format_dedication(manuscript))

            # Epigraph
            if manuscript.epigraph:
                parts.append(self._format_epigraph(manuscript))

            # Acknowledgments
            if manuscript.acknowledgments:
                parts.append(self._format_acknowledgments(manuscript))

            # Table of Contents
            if manuscript.table_of_contents:
                parts.append(self._format_toc(manuscript))

            # Chapters
            for chapter in manuscript.chapters:
                parts.append(self._format_chapter(chapter))

            # Author Bio
            if manuscript.author_bio:
                parts.append(self._format_author_bio(manuscript))

            # Also By
            if manuscript.also_by:
                parts.append(self._format_also_by(manuscript))

            # Excerpt
            if manuscript.excerpt:
                parts.append(self._format_excerpt(manuscript))

            # Join with page breaks
            text = "\n\n---\n\n".join(parts)

            # Encode as bytes
            content = text.encode("utf-8")

            return self._success_result(content, manuscript)

        except Exception as e:
            return self._error_result(str(e), manuscript)

    def _format_title_page(self, manuscript: Manuscript) -> str:
        """Format the title page as Markdown."""
        tp = manuscript.title_page
        lines = []

        lines.append(f"# {tp.title}")

        if tp.subtitle:
            lines.append(f"## {tp.subtitle}")

        lines.append("")

        if tp.author_name:
            lines.append(f"**by {tp.author_name}**")

        if tp.publisher:
            lines.append("")
            lines.append(f"*{tp.publisher}*")

        if tp.edition:
            lines.append(f"*{tp.edition}*")

        return "\n".join(lines)

    def _format_copyright(self, manuscript: Manuscript) -> str:
        """Format the copyright page as Markdown."""
        cp = manuscript.copyright_page
        lines = []

        author = cp.author_name or "Author"
        lines.append(f"Copyright {cp.year} {author}")
        lines.append("")
        lines.append(f"*{cp.rights_statement}*")

        if cp.publisher:
            lines.append("")
            lines.append(f"Published by {cp.publisher}")

        if cp.isbn:
            lines.append("")
            lines.append(f"ISBN: {cp.isbn}")

        if cp.edition_info:
            lines.append("")
            lines.append(cp.edition_info)

        if cp.credits:
            lines.append("")
            for credit in cp.credits:
                lines.append(f"- {credit}")

        lines.append("")
        lines.append(
            "*This is a work of fiction. Names, characters, places, and incidents "
            "either are the product of the author's imagination or are used "
            "fictitiously.*"
        )

        return "\n".join(lines)

    def _format_dedication(self, manuscript: Manuscript) -> str:
        """Format the dedication as Markdown."""
        ded = manuscript.dedication
        return f"*{ded.text}*"

    def _format_epigraph(self, manuscript: Manuscript) -> str:
        """Format the epigraph as Markdown."""
        ep = manuscript.epigraph
        lines = []

        lines.append(f"> {ep.text}")

        if ep.attribution:
            if ep.source:
                lines.append(f"> — {ep.attribution}, *{ep.source}*")
            else:
                lines.append(f"> — {ep.attribution}")
        elif ep.source:
            lines.append(f"> — *{ep.source}*")

        return "\n".join(lines)

    def _format_acknowledgments(self, manuscript: Manuscript) -> str:
        """Format the acknowledgments as Markdown."""
        lines = []
        lines.append("## Acknowledgments")
        lines.append("")
        lines.append(manuscript.acknowledgments)
        return "\n".join(lines)

    def _format_toc(self, manuscript: Manuscript) -> str:
        """Format the table of contents as Markdown."""
        lines = []
        lines.append("## Table of Contents")
        lines.append("")

        for entry in manuscript.table_of_contents:
            indent = "  " * (entry.level - 1)
            if entry.chapter_number is not None:
                lines.append(f"{indent}- Chapter {entry.chapter_number}: {entry.title}")
            else:
                lines.append(f"{indent}- {entry.title}")

        return "\n".join(lines)

    def _format_chapter(self, chapter: ChapterContent) -> str:
        """Format a chapter as Markdown."""
        lines = []

        # Chapter heading
        lines.append(f"## Chapter {chapter.number}: {chapter.title}")
        lines.append("")

        # Content - convert scene breaks to markdown horizontal rules
        content = chapter.content
        content = content.replace("* * *", "\n---\n")
        content = content.replace("# # #", "\n---\n")
        content = content.replace("~ ~ ~", "\n---\n")

        lines.append(content)

        return "\n".join(lines)

    def _format_author_bio(self, manuscript: Manuscript) -> str:
        """Format the author bio as Markdown."""
        bio = manuscript.author_bio
        lines = []

        lines.append("## About the Author")
        lines.append("")
        lines.append(bio.text)

        if bio.website:
            lines.append("")
            lines.append(f"Website: [{bio.website}]({bio.website})")

        if bio.social_media:
            lines.append("")
            for platform, handle in bio.social_media.items():
                lines.append(f"- {platform.capitalize()}: {handle}")

        return "\n".join(lines)

    def _format_also_by(self, manuscript: Manuscript) -> str:
        """Format the also by page as Markdown."""
        ab = manuscript.also_by
        lines = []

        lines.append(f"## Also by {ab.author_name}")
        lines.append("")

        if ab.series_info:
            for series_name, titles in ab.series_info.items():
                lines.append(f"### {series_name} Series")
                for title in titles:
                    lines.append(f"- *{title}*")
                lines.append("")

        if ab.titles:
            lines.append("### Standalone Novels")
            for title in ab.titles:
                lines.append(f"- *{title}*")

        return "\n".join(lines)

    def _format_excerpt(self, manuscript: Manuscript) -> str:
        """Format the excerpt as Markdown."""
        ex = manuscript.excerpt
        lines = []

        if ex.coming_soon_date:
            lines.append(f"### Coming Soon: {ex.coming_soon_date}")
            lines.append("")

        lines.append(f"## {ex.book_title}")

        if ex.chapter_title:
            lines.append("")
            lines.append(f"### {ex.chapter_title}")

        lines.append("")
        lines.append(ex.text)

        return "\n".join(lines)


# Register the exporter
ExporterRegistry.register(ExportFormat.MARKDOWN, MarkdownExporter)
