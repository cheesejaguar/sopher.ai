"""Tests for manuscript assembly service."""

from app.services.manuscript_assembly import (
    AlsoByContent,
    AuthorBioContent,
    BackMatterGenerator,
    ChapterBreakStyle,
    ChapterContent,
    ChapterFormatter,
    CopyrightContent,
    DedicationContent,
    EpigraphContent,
    ExcerptContent,
    FormattingSettings,
    FrontMatterGenerator,
    Manuscript,
    ManuscriptAssembler,
    ManuscriptBuilder,
    TableOfContentsEntry,
    TableOfContentsGenerator,
    TitlePageContent,
)


class TestTitlePageContent:
    """Tests for TitlePageContent dataclass."""

    def test_minimal_title_page(self):
        """Minimal title page should have just title."""
        content = TitlePageContent(title="My Book")
        assert content.title == "My Book"
        assert content.subtitle is None
        assert content.author_name is None

    def test_full_title_page(self):
        """Full title page should have all fields."""
        content = TitlePageContent(
            title="My Book",
            subtitle="A Novel",
            author_name="Jane Doe",
            publisher="Great Books Inc.",
            edition="First Edition",
        )
        assert content.title == "My Book"
        assert content.subtitle == "A Novel"
        assert content.author_name == "Jane Doe"
        assert content.publisher == "Great Books Inc."
        assert content.edition == "First Edition"


class TestCopyrightContent:
    """Tests for CopyrightContent dataclass."""

    def test_default_copyright(self):
        """Default copyright should have current year."""
        from datetime import datetime

        content = CopyrightContent()
        assert content.year == datetime.now().year
        assert content.rights_statement == "All rights reserved."

    def test_custom_copyright(self):
        """Custom copyright with all fields."""
        content = CopyrightContent(
            author_name="John Smith",
            year=2024,
            publisher="Publisher Name",
            isbn="978-1234567890",
            edition_info="First Edition, 2024",
            credits=["Cover design by Artist", "Edited by Editor"],
        )
        assert content.author_name == "John Smith"
        assert content.year == 2024
        assert content.isbn == "978-1234567890"
        assert len(content.credits) == 2


class TestDedicationContent:
    """Tests for DedicationContent dataclass."""

    def test_simple_dedication(self):
        """Simple dedication with default style."""
        content = DedicationContent(text="To my family")
        assert content.text == "To my family"
        assert content.style == "italic"

    def test_styled_dedication(self):
        """Dedication with custom style."""
        content = DedicationContent(text="For readers everywhere", style="plain")
        assert content.style == "plain"


class TestEpigraphContent:
    """Tests for EpigraphContent dataclass."""

    def test_simple_epigraph(self):
        """Simple epigraph with just text."""
        content = EpigraphContent(text="All is fair in love and war.")
        assert content.text == "All is fair in love and war."
        assert content.attribution is None

    def test_attributed_epigraph(self):
        """Epigraph with attribution and source."""
        content = EpigraphContent(
            text="To be or not to be",
            attribution="William Shakespeare",
            source="Hamlet",
        )
        assert content.attribution == "William Shakespeare"
        assert content.source == "Hamlet"


class TestChapterContent:
    """Tests for ChapterContent dataclass."""

    def test_chapter_creation(self):
        """Chapter should store all content."""
        content = ChapterContent(
            number=1,
            title="The Beginning",
            content="Once upon a time...",
            word_count=4,
        )
        assert content.number == 1
        assert content.title == "The Beginning"
        assert content.content == "Once upon a time..."
        assert content.word_count == 4

    def test_chapter_default_word_count(self):
        """Default word count should be 0."""
        content = ChapterContent(
            number=1,
            title="Test",
            content="Text here",
        )
        assert content.word_count == 0


class TestTableOfContentsEntry:
    """Tests for TableOfContentsEntry dataclass."""

    def test_chapter_entry(self):
        """Chapter entry should have correct format."""
        entry = TableOfContentsEntry(
            title="The First Chapter",
            chapter_number=1,
            page_number=1,
            level=1,
        )
        assert entry.title == "The First Chapter"
        assert entry.chapter_number == 1
        assert entry.page_number == 1

    def test_section_entry(self):
        """Section entry should have higher level."""
        entry = TableOfContentsEntry(
            title="A Sub-Section",
            level=2,
        )
        assert entry.level == 2


class TestFormattingSettings:
    """Tests for FormattingSettings dataclass."""

    def test_default_settings(self):
        """Default settings should have reasonable values."""
        settings = FormattingSettings()
        assert settings.font_family == "Times New Roman"
        assert settings.font_size == 12
        assert settings.line_spacing == 1.5
        assert settings.paragraph_indent == 0.5
        assert settings.chapter_break_style == ChapterBreakStyle.PAGE_BREAK
        assert settings.scene_break_marker == "* * *"
        assert settings.include_drop_caps is False

    def test_custom_settings(self):
        """Custom settings should be accepted."""
        settings = FormattingSettings(
            font_family="Georgia",
            font_size=14,
            line_spacing=2.0,
            chapter_break_style=ChapterBreakStyle.ORNAMENTAL,
            include_drop_caps=True,
        )
        assert settings.font_family == "Georgia"
        assert settings.font_size == 14
        assert settings.chapter_break_style == ChapterBreakStyle.ORNAMENTAL


class TestManuscript:
    """Tests for Manuscript dataclass."""

    def test_empty_manuscript(self):
        """Empty manuscript should have zero stats."""
        manuscript = Manuscript(title="Empty Book")
        assert manuscript.total_words == 0
        assert manuscript.total_chapters == 0

    def test_manuscript_with_chapters(self):
        """Manuscript with chapters should calculate stats."""
        manuscript = Manuscript(
            title="My Book",
            chapters=[
                ChapterContent(number=1, title="Ch 1", content="Text", word_count=1000),
                ChapterContent(number=2, title="Ch 2", content="More", word_count=1500),
            ],
        )
        assert manuscript.total_words == 2500
        assert manuscript.total_chapters == 2


class TestFrontMatterGenerator:
    """Tests for FrontMatterGenerator."""

    def test_generate_title_page_minimal(self):
        """Minimal title page should have title only."""
        gen = FrontMatterGenerator()
        content = TitlePageContent(title="My Novel")
        result = gen.generate_title_page(content)
        assert "MY NOVEL" in result

    def test_generate_title_page_full(self):
        """Full title page should have all elements."""
        gen = FrontMatterGenerator()
        content = TitlePageContent(
            title="Epic Tale",
            subtitle="A Journey",
            author_name="Jane Doe",
            publisher="Great Books",
            edition="First Edition",
        )
        result = gen.generate_title_page(content)
        assert "EPIC TALE" in result
        assert "A Journey" in result
        assert "Jane Doe" in result
        assert "Great Books" in result

    def test_generate_copyright_page(self):
        """Copyright page should have all required elements."""
        gen = FrontMatterGenerator()
        content = CopyrightContent(
            author_name="Author Name",
            year=2024,
            publisher="Publisher",
            isbn="978-1234567890",
        )
        result = gen.generate_copyright_page(content)
        assert "Copyright 2024 Author Name" in result
        assert "All rights reserved" in result
        assert "978-1234567890" in result
        assert "work of fiction" in result

    def test_generate_dedication_italic(self):
        """Italic dedication should be formatted."""
        gen = FrontMatterGenerator()
        content = DedicationContent(text="To my family", style="italic")
        result = gen.generate_dedication(content)
        assert "_To my family_" in result

    def test_generate_dedication_plain(self):
        """Plain dedication should not be styled."""
        gen = FrontMatterGenerator()
        content = DedicationContent(text="To my family", style="plain")
        result = gen.generate_dedication(content)
        assert "To my family" in result
        assert "_" not in result

    def test_generate_epigraph_with_attribution(self):
        """Epigraph with attribution should be formatted."""
        gen = FrontMatterGenerator()
        content = EpigraphContent(
            text="To be or not to be",
            attribution="Shakespeare",
            source="Hamlet",
        )
        result = gen.generate_epigraph(content)
        assert '"To be or not to be"' in result
        assert "Shakespeare" in result
        assert "Hamlet" in result

    def test_generate_acknowledgments(self):
        """Acknowledgments should be formatted correctly."""
        gen = FrontMatterGenerator()
        text = "Thank you to everyone who helped."
        result = gen.generate_acknowledgments(text)
        assert "ACKNOWLEDGMENTS" in result
        assert text in result


class TestTableOfContentsGenerator:
    """Tests for TableOfContentsGenerator."""

    def test_generate_toc_basic(self):
        """Basic TOC should list chapters."""
        gen = TableOfContentsGenerator()
        entries = [
            TableOfContentsEntry(title="Intro", chapter_number=1, page_number=1),
            TableOfContentsEntry(title="Adventure", chapter_number=2, page_number=15),
        ]
        result = gen.generate(entries)
        assert "TABLE OF CONTENTS" in result
        assert "Chapter 1: Intro" in result
        assert "Chapter 2: Adventure" in result

    def test_generate_toc_with_page_numbers(self):
        """TOC with page numbers should show them."""
        gen = TableOfContentsGenerator(include_page_numbers=True)
        entries = [
            TableOfContentsEntry(title="Chapter One", chapter_number=1, page_number=10),
        ]
        result = gen.generate(entries)
        assert "10" in result

    def test_generate_toc_without_page_numbers(self):
        """TOC without page numbers should omit them."""
        gen = TableOfContentsGenerator(include_page_numbers=False)
        entries = [
            TableOfContentsEntry(title="Chapter One", chapter_number=1, page_number=10),
        ]
        result = gen.generate(entries)
        assert "Chapter 1: Chapter One" in result

    def test_generate_toc_custom_title(self):
        """Custom TOC title should be used."""
        gen = TableOfContentsGenerator(title="Contents")
        entries = []
        result = gen.generate(entries)
        assert "CONTENTS" in result

    def test_generate_toc_max_depth(self):
        """Max depth should filter entries."""
        gen = TableOfContentsGenerator(max_depth=1)
        entries = [
            TableOfContentsEntry(title="Chapter", level=1),
            TableOfContentsEntry(title="Section", level=2),
            TableOfContentsEntry(title="Subsection", level=3),
        ]
        result = gen.generate(entries)
        assert "Chapter" in result
        assert "Section" not in result
        assert "Subsection" not in result

    def test_create_entries_from_chapters(self):
        """Entries should be created from chapter list."""
        gen = TableOfContentsGenerator()
        chapters = [
            ChapterContent(number=1, title="First", content=""),
            ChapterContent(number=2, title="Second", content=""),
        ]
        entries = gen.create_entries_from_chapters(chapters)
        assert len(entries) == 2
        assert entries[0].title == "First"
        assert entries[0].chapter_number == 1
        assert entries[1].title == "Second"


class TestChapterFormatter:
    """Tests for ChapterFormatter."""

    def test_format_chapter_heading(self):
        """Chapter heading should be formatted."""
        settings = FormattingSettings()
        formatter = ChapterFormatter(settings)
        chapter = ChapterContent(number=3, title="The Journey", content="")
        result = formatter.format_chapter_heading(chapter)
        assert "CHAPTER 3" in result
        assert "THE JOURNEY" in result

    def test_format_chapter_content_scene_breaks(self):
        """Scene breaks should be normalized."""
        settings = FormattingSettings(scene_break_marker="***")
        formatter = ChapterFormatter(settings)
        content = "Para 1.\n\n* * *\n\nPara 2."
        result = formatter.format_chapter_content(content)
        assert "***" in result

    def test_format_chapter_content_multiple_scene_break_styles(self):
        """Different scene break styles should be normalized."""
        settings = FormattingSettings(scene_break_marker="---")
        formatter = ChapterFormatter(settings)
        content = "Para 1.\n\n# # #\n\nPara 2.\n\n* * *\n\nPara 3."
        result = formatter.format_chapter_content(content)
        assert result.count("---") == 2

    def test_format_chapter_with_drop_caps(self):
        """Drop caps should be marked."""
        settings = FormattingSettings(include_drop_caps=True)
        formatter = ChapterFormatter(settings)
        content = "Once upon a time..."
        result = formatter.format_chapter_content(content)
        assert "[DROP_CAP]O[/DROP_CAP]" in result

    def test_format_full_chapter(self):
        """Full chapter should have heading and content."""
        settings = FormattingSettings()
        formatter = ChapterFormatter(settings)
        chapter = ChapterContent(
            number=1,
            title="Beginning",
            content="It was a dark and stormy night.",
        )
        result = formatter.format_full_chapter(chapter)
        assert "CHAPTER 1" in result
        assert "BEGINNING" in result
        assert "dark and stormy night" in result


class TestBackMatterGenerator:
    """Tests for BackMatterGenerator."""

    def test_generate_author_bio(self):
        """Author bio should be formatted."""
        gen = BackMatterGenerator()
        content = AuthorBioContent(
            text="Jane Doe is an author.",
            website="www.janedoe.com",
            social_media={"twitter": "@janedoe"},
        )
        result = gen.generate_author_bio(content)
        assert "ABOUT THE AUTHOR" in result
        assert "Jane Doe is an author." in result
        assert "www.janedoe.com" in result
        assert "@janedoe" in result

    def test_generate_also_by(self):
        """Also by page should list books."""
        gen = BackMatterGenerator()
        content = AlsoByContent(
            author_name="Jane Doe",
            titles=["Book One", "Book Two"],
            series_info={"Magic Series": ["Magic Book 1", "Magic Book 2"]},
        )
        result = gen.generate_also_by(content)
        assert "ALSO BY JANE DOE" in result
        assert "Book One" in result
        assert "Book Two" in result
        assert "Magic Series" in result

    def test_generate_excerpt(self):
        """Excerpt should be formatted."""
        gen = BackMatterGenerator()
        content = ExcerptContent(
            book_title="Next Book",
            text="Preview text here...",
            chapter_title="Chapter One",
            coming_soon_date="Fall 2025",
        )
        result = gen.generate_excerpt(content)
        assert "COMING SOON: Fall 2025" in result
        assert "NEXT BOOK" in result
        assert "Chapter One" in result
        assert "Preview text here..." in result


class TestManuscriptAssembler:
    """Tests for ManuscriptAssembler."""

    def test_assemble_minimal_manuscript(self):
        """Minimal manuscript should assemble correctly."""
        assembler = ManuscriptAssembler()
        manuscript = Manuscript(
            title="Simple Book",
            chapters=[ChapterContent(number=1, title="Only Chapter", content="The end.")],
        )
        result = assembler.assemble(manuscript)
        assert "CHAPTER 1" in result
        assert "ONLY CHAPTER" in result
        assert "The end." in result

    def test_assemble_full_manuscript(self):
        """Full manuscript should have all sections."""
        assembler = ManuscriptAssembler()
        manuscript = Manuscript(
            title="Complete Book",
            author_name="Author",
            title_page=TitlePageContent(title="Complete Book", author_name="Author"),
            copyright_page=CopyrightContent(author_name="Author"),
            dedication=DedicationContent(text="To readers"),
            table_of_contents=[TableOfContentsEntry(title="Ch 1", chapter_number=1, page_number=1)],
            chapters=[ChapterContent(number=1, title="Ch 1", content="Content here.")],
            author_bio=AuthorBioContent(text="Bio here."),
        )
        result = assembler.assemble(manuscript)
        assert "COMPLETE BOOK" in result
        assert "[PAGE_BREAK]" in result
        assert "CHAPTER 1" in result
        assert "ABOUT THE AUTHOR" in result

    def test_assemble_with_custom_formatting(self):
        """Custom formatting should be applied."""
        settings = FormattingSettings(
            chapter_break_style=ChapterBreakStyle.ORNAMENTAL,
        )
        assembler = ManuscriptAssembler(settings)
        manuscript = Manuscript(
            title="Formatted Book",
            chapters=[
                ChapterContent(number=1, title="Ch 1", content="Text"),
                ChapterContent(number=2, title="Ch 2", content="More"),
            ],
        )
        result = assembler.assemble(manuscript)
        assert "[ORNAMENTAL_BREAK]" in result

    def test_calculate_stats(self):
        """Stats should be calculated correctly."""
        assembler = ManuscriptAssembler()
        manuscript = Manuscript(
            title="Stats Test",
            chapters=[
                ChapterContent(
                    number=1,
                    title="Ch 1",
                    content="A" * 1000,
                    word_count=5000,
                ),
                ChapterContent(
                    number=2,
                    title="Ch 2",
                    content="B" * 500,
                    word_count=2500,
                ),
            ],
        )
        stats = assembler.calculate_stats(manuscript)
        assert stats["total_chapters"] == 2
        assert stats["total_words"] == 7500
        assert stats["total_characters"] == 1500
        assert stats["estimated_pages"] == 30  # 7500 / 250
        assert stats["average_chapter_length"] == 3750


class TestManuscriptBuilder:
    """Tests for ManuscriptBuilder."""

    def test_build_minimal(self):
        """Minimal manuscript should build."""
        manuscript = ManuscriptBuilder("My Book").build()
        assert manuscript.title == "My Book"

    def test_build_with_author(self):
        """Manuscript with author should build."""
        manuscript = ManuscriptBuilder("My Book").set_author("Jane Doe").build()
        assert manuscript.author_name == "Jane Doe"

    def test_build_with_title_page(self):
        """Manuscript with title page should build."""
        manuscript = (
            ManuscriptBuilder("My Book")
            .set_author("Jane Doe")
            .add_title_page(subtitle="A Novel")
            .build()
        )
        assert manuscript.title_page is not None
        assert manuscript.title_page.subtitle == "A Novel"

    def test_build_with_copyright(self):
        """Manuscript with copyright should build."""
        manuscript = (
            ManuscriptBuilder("My Book")
            .set_author("Jane Doe")
            .add_copyright_page(year=2024, isbn="978-123")
            .build()
        )
        assert manuscript.copyright_page is not None
        assert manuscript.copyright_page.year == 2024
        assert manuscript.copyright_page.isbn == "978-123"

    def test_build_with_dedication(self):
        """Manuscript with dedication should build."""
        manuscript = ManuscriptBuilder("My Book").add_dedication("To everyone").build()
        assert manuscript.dedication is not None
        assert manuscript.dedication.text == "To everyone"

    def test_build_with_epigraph(self):
        """Manuscript with epigraph should build."""
        manuscript = (
            ManuscriptBuilder("My Book").add_epigraph("Quote here", attribution="Author").build()
        )
        assert manuscript.epigraph is not None
        assert manuscript.epigraph.text == "Quote here"

    def test_build_with_chapters(self):
        """Manuscript with chapters should build."""
        manuscript = (
            ManuscriptBuilder("My Book")
            .add_chapter(1, "First", "Content of first chapter")
            .add_chapter(2, "Second", "Content of second chapter")
            .build()
        )
        assert len(manuscript.chapters) == 2
        assert manuscript.chapters[0].number == 1
        assert manuscript.chapters[1].number == 2

    def test_build_with_toc(self):
        """Manuscript with TOC should build."""
        manuscript = (
            ManuscriptBuilder("My Book")
            .add_chapter(1, "First", "Content")
            .add_chapter(2, "Second", "More content")
            .generate_toc()
            .build()
        )
        assert len(manuscript.table_of_contents) == 2
        assert manuscript.table_of_contents[0].title == "First"

    def test_build_with_back_matter(self):
        """Manuscript with back matter should build."""
        manuscript = (
            ManuscriptBuilder("My Book")
            .set_author("Jane Doe")
            .add_author_bio("Jane is an author.", website="www.jane.com")
            .add_also_by(["Previous Book"])
            .add_excerpt("Next Book", "Preview text...")
            .build()
        )
        assert manuscript.author_bio is not None
        assert manuscript.also_by is not None
        assert manuscript.excerpt is not None

    def test_build_with_formatting(self):
        """Manuscript with formatting should build."""
        settings = FormattingSettings(font_size=14)
        manuscript = ManuscriptBuilder("My Book").set_formatting(settings).build()
        assert manuscript.formatting.font_size == 14

    def test_builder_chaining(self):
        """Builder methods should chain properly."""
        manuscript = (
            ManuscriptBuilder("Complete Book")
            .set_author("Author Name")
            .add_title_page()
            .add_copyright_page()
            .add_dedication("To readers")
            .add_epigraph("A quote", attribution="Someone")
            .add_acknowledgments("Thanks to all")
            .add_chapter(1, "Chapter One", "The story begins...")
            .add_chapter(2, "Chapter Two", "The story continues...")
            .generate_toc()
            .add_author_bio("Bio text")
            .build()
        )
        assert manuscript.title == "Complete Book"
        assert manuscript.author_name == "Author Name"
        assert manuscript.title_page is not None
        assert manuscript.copyright_page is not None
        assert manuscript.dedication is not None
        assert manuscript.epigraph is not None
        assert manuscript.acknowledgments is not None
        assert len(manuscript.chapters) == 2
        assert len(manuscript.table_of_contents) == 2
        assert manuscript.author_bio is not None


class TestChapterBreakStyle:
    """Tests for ChapterBreakStyle enum."""

    def test_all_styles_defined(self):
        """All break styles should be defined."""
        styles = list(ChapterBreakStyle)
        assert len(styles) == 3
        assert ChapterBreakStyle.PAGE_BREAK in styles
        assert ChapterBreakStyle.SECTION_BREAK in styles
        assert ChapterBreakStyle.ORNAMENTAL in styles


class TestWordCountCalculation:
    """Tests for word count calculation."""

    def test_chapter_word_count_auto(self):
        """Word count should be calculated if not provided."""
        content = "One two three four five"
        manuscript = ManuscriptBuilder("Test").add_chapter(1, "Test", content).build()
        assert manuscript.chapters[0].word_count == 5

    def test_chapter_word_count_manual(self):
        """Manual word count should be preserved."""
        manuscript = (
            ManuscriptBuilder("Test").add_chapter(1, "Test", "Content", word_count=100).build()
        )
        assert manuscript.chapters[0].word_count == 100


class TestIntegration:
    """Integration tests for manuscript assembly."""

    def test_complete_workflow(self):
        """Complete manuscript workflow should work."""
        # Build manuscript
        manuscript = (
            ManuscriptBuilder("The Great Adventure")
            .set_author("Jane Doe")
            .add_title_page(subtitle="A Tale of Wonder", publisher="Great Books")
            .add_copyright_page(year=2024)
            .add_dedication("For all dreamers")
            .add_epigraph(
                "Not all who wander are lost.",
                attribution="J.R.R. Tolkien",
            )
            .add_chapter(1, "The Beginning", "Once upon a time in a land far away...")
            .add_chapter(2, "The Journey", "Our hero set forth on an adventure...")
            .add_chapter(3, "The End", "And they lived happily ever after.")
            .generate_toc()
            .add_author_bio("Jane Doe is an award-winning author.")
            .build()
        )

        # Assemble
        assembler = ManuscriptAssembler()
        result = assembler.assemble(manuscript)

        # Verify
        assert "THE GREAT ADVENTURE" in result
        assert "Jane Doe" in result
        assert "For all dreamers" in result
        assert "Tolkien" in result
        assert "TABLE OF CONTENTS" in result
        assert "CHAPTER 1" in result
        assert "CHAPTER 2" in result
        assert "CHAPTER 3" in result
        assert "ABOUT THE AUTHOR" in result

        # Calculate stats
        stats = assembler.calculate_stats(manuscript)
        assert stats["total_chapters"] == 3
        assert stats["total_words"] > 0
