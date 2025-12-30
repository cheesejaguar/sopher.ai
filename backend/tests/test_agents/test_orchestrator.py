"""Tests for the BookPipeline orchestrator."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.agents.orchestrator import (
    BookConcept,
    BookOutline,
    BookPipeline,
    BookWritingAgents,
    Chapter,
    ChapterOutline,
    ContinuityIssue,
    ContinuityReport,
    GenerationProgress,
    ParallelChapterWriter,
)


class MockChoice:
    """Mock LiteLLM choice object."""

    def __init__(self, content: str):
        self.message = MagicMock()
        self.message.content = content


class MockResponse:
    """Mock LiteLLM response object."""

    def __init__(self, content: str):
        self.choices = [MockChoice(content)]


class TestBookConcept:
    """Tests for BookConcept model."""

    def test_valid_concept(self):
        """Test creating a valid book concept."""
        concept = BookConcept(
            title="The Mystery of Shadow Manor",
            genre="Mystery",
            themes=["betrayal", "redemption"],
            setting="Victorian England",
            time_period="1880s",
            tone="Dark and suspenseful",
            target_audience="Adult mystery readers",
            unique_elements=["Unreliable narrator", "Gothic atmosphere"],
            central_conflict="A detective must solve a murder while hiding their own dark past",
        )

        assert concept.title == "The Mystery of Shadow Manor"
        assert "betrayal" in concept.themes
        assert concept.genre == "Mystery"


class TestChapterOutline:
    """Tests for ChapterOutline model."""

    def test_valid_chapter_outline(self):
        """Test creating a valid chapter outline."""
        outline = ChapterOutline(
            number=1,
            title="The Arrival",
            summary="Detective arrives at the manor and discovers the first clue.",
            key_events=["Arrival at manor", "Meeting the suspects", "Finding the letter"],
            characters_involved=["Detective Holmes", "Lord Ashford", "Mrs. Whitmore"],
            emotional_arc="Curiosity to suspicion",
            estimated_word_count=4000,
        )

        assert outline.number == 1
        assert len(outline.key_events) == 3
        assert outline.estimated_word_count == 4000

    def test_word_count_validation(self):
        """Test word count must be in valid range."""
        with pytest.raises(ValueError):
            ChapterOutline(
                number=1,
                title="Test",
                summary="Test",
                key_events=[],
                characters_involved=[],
                emotional_arc="Test",
                estimated_word_count=500,  # Too low
            )


class TestBookOutline:
    """Tests for BookOutline model."""

    def test_valid_book_outline(self):
        """Test creating a valid book outline."""
        chapters = [
            ChapterOutline(
                number=i,
                title=f"Chapter {i}",
                summary=f"Summary {i}",
                key_events=[f"Event {i}"],
                characters_involved=["Protagonist"],
                emotional_arc="Rising tension",
                estimated_word_count=4000,
            )
            for i in range(1, 4)
        ]

        outline = BookOutline(
            title="Test Book",
            chapters=chapters,
            character_summaries={"Protagonist": "The hero of the story"},
            plot_threads=["Main mystery", "Romance subplot"],
            total_estimated_words=12000,
        )

        assert len(outline.chapters) == 3
        assert outline.total_estimated_words == 12000


class TestChapter:
    """Tests for Chapter model."""

    def test_valid_chapter(self):
        """Test creating a valid chapter."""
        chapter = Chapter(
            number=1,
            title="The Beginning",
            content="# The Beginning\n\nIt was a dark and stormy night...",
            word_count=3500,
        )

        assert chapter.number == 1
        assert "stormy night" in chapter.content


class TestContinuityReport:
    """Tests for ContinuityReport model."""

    def test_valid_report(self):
        """Test creating a valid continuity report."""
        issues = [
            ContinuityIssue(
                type="character",
                severity="major",
                location="Chapter 3",
                description="Eye color changes from blue to green",
                suggestion="Standardize to blue throughout",
            )
        ]

        report = ContinuityReport(
            issues=issues,
            suggestions=["Review all character descriptions"],
            consistency_score=0.85,
        )

        assert len(report.issues) == 1
        assert report.consistency_score == 0.85


class TestBookPipeline:
    """Tests for BookPipeline class."""

    @pytest.fixture
    def pipeline(self):
        """Create a test pipeline."""
        return BookPipeline(model="gpt-4-test")

    @pytest.fixture
    def mock_concept_response(self):
        """Create a mock concept response."""
        return MockResponse(
            json.dumps(
                {
                    "title": "Test Book",
                    "genre": "Mystery",
                    "themes": ["mystery", "adventure"],
                    "setting": "Modern city",
                    "time_period": "Present day",
                    "tone": "Thrilling",
                    "target_audience": "Adults",
                    "unique_elements": ["Unique twist"],
                    "central_conflict": "Detective vs killer",
                }
            )
        )

    @pytest.fixture
    def mock_outline_response(self):
        """Create a mock outline response."""
        return MockResponse(
            json.dumps(
                {
                    "title": "Test Book",
                    "chapters": [
                        {
                            "number": 1,
                            "title": "Chapter 1",
                            "summary": "The beginning",
                            "key_events": ["Event 1"],
                            "characters_involved": ["Hero"],
                            "emotional_arc": "Rising",
                            "estimated_word_count": 4000,
                        },
                        {
                            "number": 2,
                            "title": "Chapter 2",
                            "summary": "The middle",
                            "key_events": ["Event 2"],
                            "characters_involved": ["Hero"],
                            "emotional_arc": "Climax",
                            "estimated_word_count": 4000,
                        },
                    ],
                    "character_summaries": {"Hero": "The protagonist"},
                    "plot_threads": ["Main plot"],
                    "total_estimated_words": 8000,
                }
            )
        )

    @pytest.fixture
    def mock_chapter_response(self):
        """Create a mock chapter response."""
        return MockResponse(
            json.dumps(
                {
                    "number": 1,
                    "title": "Chapter 1",
                    "content": "# Chapter 1\n\nThe story begins...",
                    "word_count": 3500,
                }
            )
        )

    @pytest.mark.asyncio
    async def test_generate_concept(self, pipeline, mock_concept_response):
        """Test concept generation."""
        with patch("litellm.acompletion", new_callable=AsyncMock) as mock:
            mock.return_value = mock_concept_response
            concept = await pipeline.generate_concept("A mystery novel")

        assert isinstance(concept, BookConcept)
        assert concept.title == "Test Book"
        assert concept.genre == "Mystery"

    @pytest.mark.asyncio
    async def test_generate_outline(self, pipeline, mock_outline_response):
        """Test outline generation."""
        concept = BookConcept(
            title="Test",
            genre="Mystery",
            themes=["mystery"],
            setting="City",
            time_period="Now",
            tone="Dark",
            target_audience="Adults",
            unique_elements=["Twist"],
            central_conflict="Good vs evil",
        )

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock:
            mock.return_value = mock_outline_response
            outline = await pipeline.generate_outline(concept, num_chapters=2)

        assert isinstance(outline, BookOutline)
        assert len(outline.chapters) == 2

    @pytest.mark.asyncio
    async def test_write_chapter(self, pipeline, mock_chapter_response):
        """Test chapter writing."""
        chapter_outline = ChapterOutline(
            number=1,
            title="The Beginning",
            summary="Story starts",
            key_events=["Event"],
            characters_involved=["Hero"],
            emotional_arc="Rising",
            estimated_word_count=4000,
        )

        book_context = {"title": "Test", "genre": "Mystery"}

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock:
            mock.return_value = mock_chapter_response
            chapter = await pipeline.write_chapter(chapter_outline, book_context)

        assert isinstance(chapter, Chapter)
        assert chapter.number == 1

    @pytest.mark.asyncio
    async def test_generate_book_yields_progress(self, pipeline):
        """Test generate_book yields progress updates."""
        # Mock all agent responses
        concept_resp = MockResponse(
            json.dumps(
                {
                    "title": "Test",
                    "genre": "Test",
                    "themes": [],
                    "setting": "Test",
                    "time_period": "Test",
                    "tone": "Test",
                    "target_audience": "Test",
                    "unique_elements": [],
                    "central_conflict": "Test",
                }
            )
        )

        outline_resp = MockResponse(
            json.dumps(
                {
                    "title": "Test",
                    "chapters": [
                        {
                            "number": 1,
                            "title": "Ch1",
                            "summary": "S1",
                            "key_events": [],
                            "characters_involved": [],
                            "emotional_arc": "E1",
                            "estimated_word_count": 3000,
                        }
                    ],
                    "character_summaries": {},
                    "plot_threads": [],
                    "total_estimated_words": 3000,
                }
            )
        )

        chapter_resp = MockResponse(
            json.dumps(
                {"number": 1, "title": "Ch1", "content": "Content", "word_count": 3000}
            )
        )

        edited_resp = MockResponse(
            json.dumps(
                {
                    "number": 1,
                    "title": "Ch1",
                    "content": "Edited content",
                    "word_count": 3000,
                    "changes_made": ["Fixed typos"],
                }
            )
        )

        continuity_resp = MockResponse(
            json.dumps({"issues": [], "suggestions": [], "consistency_score": 1.0})
        )

        responses = [
            concept_resp,
            outline_resp,
            chapter_resp,
            edited_resp,
            continuity_resp,
        ]
        response_index = 0

        async def mock_completion(**kwargs):
            nonlocal response_index
            resp = responses[min(response_index, len(responses) - 1)]
            response_index += 1
            return resp

        with patch("litellm.acompletion", side_effect=mock_completion):
            items = []
            async for item in pipeline.generate_book("Test", num_chapters=1):
                items.append(item)

        # Check we got progress updates
        progress_items = [i for i in items if isinstance(i, GenerationProgress)]
        assert len(progress_items) > 0
        assert any(p.stage == "concept" for p in progress_items)
        assert any(p.stage == "outline" for p in progress_items)
        assert any(p.stage == "writing" for p in progress_items)


class TestLegacyCompatibility:
    """Tests for legacy BookWritingAgents compatibility."""

    @pytest.fixture
    def agents(self):
        """Create legacy agents wrapper."""
        return BookWritingAgents(model="gpt-4-test")

    @pytest.mark.asyncio
    async def test_generate_concepts(self, agents):
        """Test legacy generate_concepts method."""
        mock_response = MockResponse(
            json.dumps(
                {
                    "title": "Test",
                    "genre": "Mystery",
                    "themes": ["theme1"],
                    "setting": "City",
                    "time_period": "Now",
                    "tone": "Dark",
                    "target_audience": "Adults",
                    "unique_elements": ["Unique"],
                    "central_conflict": "Conflict",
                }
            )
        )

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock:
            mock.return_value = mock_response
            result = await agents.generate_concepts("A mystery novel")

        assert "concepts" in result
        assert result["concepts"]["title"] == "Test"

    @pytest.mark.asyncio
    async def test_write_chapter(self, agents):
        """Test legacy write_chapter method."""
        mock_response = MockResponse(
            json.dumps(
                {
                    "number": 1,
                    "title": "Chapter 1",
                    "content": "The story begins...",
                    "word_count": 3500,
                }
            )
        )

        outline = json.dumps(
            {
                "title": "Chapter 1",
                "summary": "The beginning",
                "key_events": ["Event 1"],
                "estimated_word_count": 4000,
            }
        )

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock:
            mock.return_value = mock_response
            result = await agents.write_chapter(
                chapter_number=1, outline=outline, style_guide="Standard"
            )

        assert isinstance(result, str)
        assert "story begins" in result

    @pytest.mark.asyncio
    async def test_check_continuity(self, agents):
        """Test legacy check_continuity method."""
        mock_response = MockResponse(
            json.dumps(
                {
                    "issues": [
                        {
                            "type": "character",
                            "severity": "minor",
                            "location": "Ch2",
                            "description": "Name typo",
                            "suggestion": "Fix spelling",
                        }
                    ],
                    "suggestions": ["Review names"],
                    "consistency_score": 0.9,
                }
            )
        )

        chapters = ["Chapter 1 content...", "Chapter 2 content..."]

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock:
            mock.return_value = mock_response
            result = await agents.check_continuity(chapters)

        assert "inconsistencies" in result
        assert "confidence_score" in result
        assert result["confidence_score"] == 0.9


class TestParallelChapterWriter:
    """Tests for ParallelChapterWriter compatibility."""

    @pytest.mark.asyncio
    async def test_write_chapters_parallel(self):
        """Test parallel chapter writing."""
        agents = BookWritingAgents(model="gpt-4-test")
        writer = ParallelChapterWriter(agents)

        chapter_responses = [
            MockResponse(
                json.dumps(
                    {
                        "number": i,
                        "title": f"Chapter {i}",
                        "content": f"Content of chapter {i}",
                        "word_count": 3000,
                    }
                )
            )
            for i in range(1, 4)
        ]

        response_index = 0

        async def mock_completion(**kwargs):
            nonlocal response_index
            resp = chapter_responses[min(response_index, len(chapter_responses) - 1)]
            response_index += 1
            return resp

        outline = {
            "title": "Test Book",
            "chapters": [
                {
                    "number": i,
                    "title": f"Chapter {i}",
                    "summary": f"Summary {i}",
                    "estimated_word_count": 3000,
                }
                for i in range(1, 4)
            ],
        }

        with patch("litellm.acompletion", side_effect=mock_completion):
            chapters = await writer.write_chapters_parallel(
                outline={"outline": outline},
                style_guide="Standard",
                max_parallel=2,
            )

        assert len(chapters) == 3
        assert all(isinstance(c, str) for c in chapters)
