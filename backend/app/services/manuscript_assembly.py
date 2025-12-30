"""
Manuscript assembly service for generating publication-ready exports.

Provides functionality for:
- Front matter generation (title page, copyright, dedication, etc.)
- Table of contents generation
- Chapter formatting with proper breaks
- Back matter generation (author bio, acknowledgments, etc.)
- Complete manuscript assembly
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class ChapterBreakStyle(str, Enum):
    """Chapter break styles."""

    PAGE_BREAK = "page_break"
    SECTION_BREAK = "section_break"
    ORNAMENTAL = "ornamental"


class SceneBreakStyle(str, Enum):
    """Scene break styles."""

    ASTERISKS = "* * *"
    DASHES = "---"
    BLANK_LINE = ""
    ORNAMENT = "~"


@dataclass
class TitlePageContent:
    """Content for the title page."""

    title: str
    subtitle: Optional[str] = None
    author_name: Optional[str] = None
    publisher: Optional[str] = None
    edition: Optional[str] = None


@dataclass
class CopyrightContent:
    """Content for the copyright page."""

    author_name: Optional[str] = None
    year: int = field(default_factory=lambda: datetime.now().year)
    publisher: Optional[str] = None
    rights_statement: str = "All rights reserved."
    isbn: Optional[str] = None
    edition_info: Optional[str] = None
    credits: list[str] = field(default_factory=list)


@dataclass
class DedicationContent:
    """Content for the dedication page."""

    text: str
    style: str = "italic"  # italic, plain, centered


@dataclass
class EpigraphContent:
    """Content for the epigraph page."""

    text: str
    attribution: Optional[str] = None
    source: Optional[str] = None


@dataclass
class ChapterContent:
    """Content for a chapter."""

    number: int
    title: str
    content: str
    word_count: int = 0
    scenes: list[str] = field(default_factory=list)


@dataclass
class TableOfContentsEntry:
    """An entry in the table of contents."""

    title: str
    page_number: Optional[int] = None
    level: int = 1  # 1 = chapter, 2 = section, etc.
    chapter_number: Optional[int] = None


@dataclass
class AuthorBioContent:
    """Content for the author bio."""

    text: str
    photo_path: Optional[str] = None
    website: Optional[str] = None
    social_media: dict[str, str] = field(default_factory=dict)


@dataclass
class AlsoByContent:
    """Content for the "Also By" page."""

    author_name: str
    titles: list[str] = field(default_factory=list)
    series_info: dict[str, list[str]] = field(default_factory=dict)


@dataclass
class ExcerptContent:
    """Content for a preview excerpt."""

    book_title: str
    text: str
    chapter_title: Optional[str] = None
    coming_soon_date: Optional[str] = None


@dataclass
class FormattingSettings:
    """Settings for document formatting."""

    font_family: str = "Times New Roman"
    font_size: int = 12
    line_spacing: float = 1.5
    paragraph_indent: float = 0.5
    chapter_break_style: ChapterBreakStyle = ChapterBreakStyle.PAGE_BREAK
    scene_break_marker: str = "* * *"
    include_drop_caps: bool = False
    page_margins: dict[str, float] = field(
        default_factory=lambda: {"top": 1.0, "bottom": 1.0, "left": 1.25, "right": 1.25}
    )


@dataclass
class Manuscript:
    """Complete assembled manuscript."""

    title: str
    author_name: Optional[str] = None
    title_page: Optional[TitlePageContent] = None
    copyright_page: Optional[CopyrightContent] = None
    dedication: Optional[DedicationContent] = None
    epigraph: Optional[EpigraphContent] = None
    acknowledgments: Optional[str] = None
    table_of_contents: list[TableOfContentsEntry] = field(default_factory=list)
    chapters: list[ChapterContent] = field(default_factory=list)
    author_bio: Optional[AuthorBioContent] = None
    also_by: Optional[AlsoByContent] = None
    excerpt: Optional[ExcerptContent] = None
    formatting: FormattingSettings = field(default_factory=FormattingSettings)

    @property
    def total_words(self) -> int:
        """Get total word count of all chapters."""
        return sum(ch.word_count for ch in self.chapters)

    @property
    def total_chapters(self) -> int:
        """Get total number of chapters."""
        return len(self.chapters)


class FrontMatterGenerator:
    """Generator for front matter sections."""

    def generate_title_page(self, content: TitlePageContent) -> str:
        """Generate title page content."""
        lines = []
        lines.append("")  # Leading space
        lines.append("")
        lines.append("")
        lines.append(content.title.upper())

        if content.subtitle:
            lines.append("")
            lines.append(content.subtitle)

        lines.append("")
        lines.append("")

        if content.author_name:
            lines.append(f"by {content.author_name}")

        if content.publisher:
            lines.append("")
            lines.append("")
            lines.append(content.publisher)

        if content.edition:
            lines.append(content.edition)

        return "\n".join(lines)

    def generate_copyright_page(self, content: CopyrightContent) -> str:
        """Generate copyright page content."""
        lines = []

        # Copyright notice
        author = content.author_name or "Author"
        lines.append(f"Copyright {content.year} {author}")
        lines.append("")
        lines.append(content.rights_statement)
        lines.append("")

        if content.publisher:
            lines.append(f"Published by {content.publisher}")
            lines.append("")

        if content.isbn:
            lines.append(f"ISBN: {content.isbn}")
            lines.append("")

        if content.edition_info:
            lines.append(content.edition_info)
            lines.append("")

        if content.credits:
            for credit in content.credits:
                lines.append(credit)

        lines.append("")
        lines.append("This is a work of fiction. Names, characters, places, and incidents")
        lines.append("either are the product of the author's imagination or are used")
        lines.append("fictitiously. Any resemblance to actual persons, living or dead,")
        lines.append("events, or locales is entirely coincidental.")

        return "\n".join(lines)

    def generate_dedication(self, content: DedicationContent) -> str:
        """Generate dedication page content."""
        lines = []
        lines.append("")
        lines.append("")
        lines.append("")

        if content.style == "italic":
            lines.append(f"_{content.text}_")
        else:
            lines.append(content.text)

        return "\n".join(lines)

    def generate_epigraph(self, content: EpigraphContent) -> str:
        """Generate epigraph page content."""
        lines = []
        lines.append("")
        lines.append("")

        # Quote text
        lines.append(f'"{content.text}"')

        # Attribution
        if content.attribution:
            if content.source:
                lines.append(f"    —{content.attribution}, {content.source}")
            else:
                lines.append(f"    —{content.attribution}")
        elif content.source:
            lines.append(f"    —{content.source}")

        return "\n".join(lines)

    def generate_acknowledgments(self, text: str) -> str:
        """Generate acknowledgments page content."""
        lines = []
        lines.append("ACKNOWLEDGMENTS")
        lines.append("")
        lines.append(text)
        return "\n".join(lines)


class TableOfContentsGenerator:
    """Generator for table of contents."""

    def __init__(
        self,
        title: str = "Table of Contents",
        include_page_numbers: bool = True,
        max_depth: int = 1,
    ):
        """Initialize the TOC generator."""
        self.title = title
        self.include_page_numbers = include_page_numbers
        self.max_depth = max_depth

    def generate(self, entries: list[TableOfContentsEntry]) -> str:
        """Generate table of contents."""
        lines = []
        lines.append(self.title.upper())
        lines.append("")

        for entry in entries:
            if entry.level > self.max_depth:
                continue

            # Indentation based on level
            indent = "    " * (entry.level - 1)

            # Format title
            if entry.chapter_number is not None:
                title_text = f"Chapter {entry.chapter_number}: {entry.title}"
            else:
                title_text = entry.title

            # Add page number if included
            if self.include_page_numbers and entry.page_number is not None:
                # Create dots between title and page number
                dots_needed = 60 - len(indent) - len(title_text) - len(str(entry.page_number))
                dots = "." * max(3, dots_needed)
                lines.append(f"{indent}{title_text}{dots}{entry.page_number}")
            else:
                lines.append(f"{indent}{title_text}")

        return "\n".join(lines)

    def create_entries_from_chapters(
        self, chapters: list[ChapterContent]
    ) -> list[TableOfContentsEntry]:
        """Create TOC entries from chapter list."""
        entries = []
        for i, chapter in enumerate(chapters, 1):
            entries.append(
                TableOfContentsEntry(
                    title=chapter.title,
                    chapter_number=chapter.number,
                    level=1,
                    page_number=None,  # Page numbers calculated during export
                )
            )
        return entries


class ChapterFormatter:
    """Formatter for chapter content."""

    def __init__(self, settings: FormattingSettings):
        """Initialize the chapter formatter."""
        self.settings = settings

    def format_chapter_heading(self, chapter: ChapterContent) -> str:
        """Format a chapter heading."""
        lines = []
        lines.append(f"CHAPTER {chapter.number}")
        lines.append("")
        if chapter.title:
            lines.append(chapter.title.upper())
        lines.append("")
        return "\n".join(lines)

    def format_chapter_content(self, content: str) -> str:
        """Format chapter content with scene breaks."""
        # Normalize scene breaks
        formatted = self._normalize_scene_breaks(content)

        # Apply drop caps if enabled
        if self.settings.include_drop_caps:
            formatted = self._apply_drop_caps(formatted)

        return formatted

    def _normalize_scene_breaks(self, content: str) -> str:
        """Normalize scene break markers."""
        # Common scene break patterns to replace
        patterns = [
            r"\n\s*\*\s*\*\s*\*\s*\n",  # * * *
            r"\n\s*#\s*#\s*#\s*\n",  # # # #
            r"\n\s*-\s*-\s*-\s*\n",  # - - -
            r"\n\s*~\s*~\s*~\s*\n",  # ~ ~ ~
            r"\n{3,}",  # Multiple blank lines
        ]

        marker = f"\n\n{self.settings.scene_break_marker}\n\n"

        result = content
        for pattern in patterns:
            result = re.sub(pattern, marker, result)

        return result

    def _apply_drop_caps(self, content: str) -> str:
        """Apply drop caps formatting to first letter of chapter."""
        if not content:
            return content

        # Find the first letter
        match = re.match(r"^(\s*)([A-Za-z])", content)
        if match:
            whitespace, letter = match.groups()
            # Mark for drop cap (formatting applied during export)
            return f"{whitespace}[DROP_CAP]{letter.upper()}[/DROP_CAP]{content[match.end():]}"

        return content

    def format_full_chapter(self, chapter: ChapterContent) -> str:
        """Format a complete chapter with heading and content."""
        parts = []
        parts.append(self.format_chapter_heading(chapter))
        parts.append(self.format_chapter_content(chapter.content))
        return "\n".join(parts)


class BackMatterGenerator:
    """Generator for back matter sections."""

    def generate_author_bio(self, content: AuthorBioContent) -> str:
        """Generate author bio page content."""
        lines = []
        lines.append("ABOUT THE AUTHOR")
        lines.append("")
        lines.append(content.text)
        lines.append("")

        if content.website:
            lines.append(f"Website: {content.website}")

        for platform, handle in content.social_media.items():
            lines.append(f"{platform.capitalize()}: {handle}")

        return "\n".join(lines)

    def generate_also_by(self, content: AlsoByContent) -> str:
        """Generate "Also By" page content."""
        lines = []
        lines.append(f"ALSO BY {content.author_name.upper()}")
        lines.append("")

        if content.series_info:
            for series_name, titles in content.series_info.items():
                lines.append(f"{series_name} Series:")
                for title in titles:
                    lines.append(f"    {title}")
                lines.append("")

        if content.titles:
            lines.append("Standalone Novels:")
            for title in content.titles:
                lines.append(f"    {title}")

        return "\n".join(lines)

    def generate_excerpt(self, content: ExcerptContent) -> str:
        """Generate excerpt/preview page content."""
        lines = []

        if content.coming_soon_date:
            lines.append(f"COMING SOON: {content.coming_soon_date}")
            lines.append("")

        lines.append(content.book_title.upper())

        if content.chapter_title:
            lines.append("")
            lines.append(content.chapter_title)

        lines.append("")
        lines.append(content.text)

        return "\n".join(lines)


class ManuscriptAssembler:
    """Assembler for complete manuscripts."""

    def __init__(self, settings: Optional[FormattingSettings] = None):
        """Initialize the manuscript assembler."""
        self.settings = settings or FormattingSettings()
        self.front_matter_gen = FrontMatterGenerator()
        self.toc_gen = TableOfContentsGenerator()
        self.chapter_formatter = ChapterFormatter(self.settings)
        self.back_matter_gen = BackMatterGenerator()

    def assemble(self, manuscript: Manuscript) -> str:
        """Assemble the complete manuscript as text."""
        sections = []

        # Front matter
        if manuscript.title_page:
            sections.append(self.front_matter_gen.generate_title_page(manuscript.title_page))
            sections.append(self._page_break())

        if manuscript.copyright_page:
            sections.append(
                self.front_matter_gen.generate_copyright_page(manuscript.copyright_page)
            )
            sections.append(self._page_break())

        if manuscript.dedication:
            sections.append(self.front_matter_gen.generate_dedication(manuscript.dedication))
            sections.append(self._page_break())

        if manuscript.epigraph:
            sections.append(self.front_matter_gen.generate_epigraph(manuscript.epigraph))
            sections.append(self._page_break())

        if manuscript.acknowledgments:
            sections.append(
                self.front_matter_gen.generate_acknowledgments(manuscript.acknowledgments)
            )
            sections.append(self._page_break())

        # Table of contents
        if manuscript.table_of_contents:
            sections.append(self.toc_gen.generate(manuscript.table_of_contents))
            sections.append(self._page_break())

        # Chapters
        for chapter in manuscript.chapters:
            sections.append(self.chapter_formatter.format_full_chapter(chapter))
            sections.append(self._chapter_break())

        # Back matter
        if manuscript.author_bio:
            sections.append(self.back_matter_gen.generate_author_bio(manuscript.author_bio))
            sections.append(self._page_break())

        if manuscript.also_by:
            sections.append(self.back_matter_gen.generate_also_by(manuscript.also_by))
            sections.append(self._page_break())

        if manuscript.excerpt:
            sections.append(self.back_matter_gen.generate_excerpt(manuscript.excerpt))

        # Join all sections
        return "\n".join(sections)

    def _page_break(self) -> str:
        """Generate a page break marker."""
        return "\n[PAGE_BREAK]\n"

    def _chapter_break(self) -> str:
        """Generate a chapter break marker."""
        style = self.settings.chapter_break_style
        if style == ChapterBreakStyle.PAGE_BREAK:
            return "\n[PAGE_BREAK]\n"
        elif style == ChapterBreakStyle.SECTION_BREAK:
            return "\n[SECTION_BREAK]\n"
        else:  # ornamental
            return "\n[ORNAMENTAL_BREAK]\n"

    def calculate_stats(self, manuscript: Manuscript) -> dict:
        """Calculate manuscript statistics."""
        total_words = manuscript.total_words
        total_chapters = manuscript.total_chapters

        # Estimate pages (assuming ~250 words per page)
        words_per_page = 250
        estimated_pages = max(1, total_words // words_per_page)

        # Estimate reading time (assuming ~250 words per minute)
        words_per_minute = 250
        reading_time_minutes = max(1, total_words // words_per_minute)

        # Average chapter length
        avg_chapter_length = total_words // total_chapters if total_chapters > 0 else 0

        # Count characters (rough estimate)
        total_characters = sum(len(ch.content) for ch in manuscript.chapters)

        return {
            "total_chapters": total_chapters,
            "total_words": total_words,
            "total_characters": total_characters,
            "estimated_pages": estimated_pages,
            "estimated_reading_time_minutes": reading_time_minutes,
            "average_chapter_length": avg_chapter_length,
        }


class ManuscriptBuilder:
    """Builder pattern for creating manuscripts."""

    def __init__(self, title: str):
        """Initialize the builder."""
        self._manuscript = Manuscript(title=title)

    def set_author(self, name: str) -> "ManuscriptBuilder":
        """Set the author name."""
        self._manuscript.author_name = name
        return self

    def add_title_page(
        self,
        subtitle: Optional[str] = None,
        publisher: Optional[str] = None,
        edition: Optional[str] = None,
    ) -> "ManuscriptBuilder":
        """Add a title page."""
        self._manuscript.title_page = TitlePageContent(
            title=self._manuscript.title,
            subtitle=subtitle,
            author_name=self._manuscript.author_name,
            publisher=publisher,
            edition=edition,
        )
        return self

    def add_copyright_page(
        self,
        year: Optional[int] = None,
        publisher: Optional[str] = None,
        isbn: Optional[str] = None,
        edition_info: Optional[str] = None,
    ) -> "ManuscriptBuilder":
        """Add a copyright page."""
        self._manuscript.copyright_page = CopyrightContent(
            author_name=self._manuscript.author_name,
            year=year or datetime.now().year,
            publisher=publisher,
            isbn=isbn,
            edition_info=edition_info,
        )
        return self

    def add_dedication(self, text: str, style: str = "italic") -> "ManuscriptBuilder":
        """Add a dedication."""
        self._manuscript.dedication = DedicationContent(text=text, style=style)
        return self

    def add_epigraph(
        self,
        text: str,
        attribution: Optional[str] = None,
        source: Optional[str] = None,
    ) -> "ManuscriptBuilder":
        """Add an epigraph."""
        self._manuscript.epigraph = EpigraphContent(
            text=text,
            attribution=attribution,
            source=source,
        )
        return self

    def add_acknowledgments(self, text: str) -> "ManuscriptBuilder":
        """Add acknowledgments."""
        self._manuscript.acknowledgments = text
        return self

    def add_chapter(
        self,
        number: int,
        title: str,
        content: str,
        word_count: Optional[int] = None,
    ) -> "ManuscriptBuilder":
        """Add a chapter."""
        if word_count is None:
            word_count = len(content.split())

        chapter = ChapterContent(
            number=number,
            title=title,
            content=content,
            word_count=word_count,
        )
        self._manuscript.chapters.append(chapter)
        return self

    def add_author_bio(
        self,
        text: str,
        website: Optional[str] = None,
        social_media: Optional[dict[str, str]] = None,
    ) -> "ManuscriptBuilder":
        """Add author bio."""
        self._manuscript.author_bio = AuthorBioContent(
            text=text,
            website=website,
            social_media=social_media or {},
        )
        return self

    def add_also_by(
        self,
        titles: list[str],
        series_info: Optional[dict[str, list[str]]] = None,
    ) -> "ManuscriptBuilder":
        """Add also by page."""
        self._manuscript.also_by = AlsoByContent(
            author_name=self._manuscript.author_name or "Author",
            titles=titles,
            series_info=series_info or {},
        )
        return self

    def add_excerpt(
        self,
        book_title: str,
        text: str,
        chapter_title: Optional[str] = None,
        coming_soon_date: Optional[str] = None,
    ) -> "ManuscriptBuilder":
        """Add an excerpt."""
        self._manuscript.excerpt = ExcerptContent(
            book_title=book_title,
            chapter_title=chapter_title,
            text=text,
            coming_soon_date=coming_soon_date,
        )
        return self

    def set_formatting(self, settings: FormattingSettings) -> "ManuscriptBuilder":
        """Set formatting options."""
        self._manuscript.formatting = settings
        return self

    def generate_toc(
        self,
        title: str = "Table of Contents",
        include_page_numbers: bool = True,
    ) -> "ManuscriptBuilder":
        """Generate table of contents from chapters."""
        toc_gen = TableOfContentsGenerator(
            title=title,
            include_page_numbers=include_page_numbers,
        )
        self._manuscript.table_of_contents = toc_gen.create_entries_from_chapters(
            self._manuscript.chapters
        )
        return self

    def build(self) -> Manuscript:
        """Build and return the manuscript."""
        return self._manuscript
