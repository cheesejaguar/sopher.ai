"""Tests for outline revision schemas and endpoint validation.

Tests cover:
- OutlineRevision schema validation
- Input validation for outline operations
- Endpoint route registration
"""

from uuid import uuid4

import pytest

from app.schemas import BookOutline, ChapterOutline, OutlineRevision, PlotStructure


class TestOutlineRevisionSchema:
    """Tests for OutlineRevision schema validation."""

    def test_valid_revision_request(self):
        """Test valid revision request with minimal fields."""
        revision = OutlineRevision(
            revision_instructions="Add more conflict between the protagonist and antagonist"
        )

        assert revision.revision_instructions is not None
        assert len(revision.revision_instructions) >= 10
        assert revision.chapters_to_revise is None
        assert revision.preserve_chapters is None
        assert revision.add_chapters is None
        assert revision.remove_chapters is None

    def test_revision_with_chapter_options(self):
        """Test revision with chapter-specific options."""
        revision = OutlineRevision(
            revision_instructions="Revise the pacing in the middle chapters",
            chapters_to_revise=[5, 6, 7],
            preserve_chapters=[1, 2, 10],
            add_chapters=2,
        )

        assert revision.chapters_to_revise == [5, 6, 7]
        assert revision.preserve_chapters == [1, 2, 10]
        assert revision.add_chapters == 2
        assert revision.remove_chapters is None

    def test_revision_with_remove_chapters(self):
        """Test revision with chapters to remove."""
        revision = OutlineRevision(
            revision_instructions="Remove filler chapters and tighten the narrative",
            remove_chapters=[4, 8],
        )

        assert revision.remove_chapters == [4, 8]

    def test_revision_instructions_too_short(self):
        """Test that short instructions are rejected."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError) as exc_info:
            OutlineRevision(revision_instructions="short")

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert "revision_instructions" in str(errors[0]["loc"])

    def test_revision_instructions_too_long(self):
        """Test that overly long instructions are rejected."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            OutlineRevision(revision_instructions="x" * 5001)

    def test_revision_with_outline_id(self):
        """Test revision with specific outline ID."""
        outline_id = uuid4()
        revision = OutlineRevision(
            outline_id=outline_id,
            revision_instructions="Revise based on feedback from editor",
        )

        assert revision.outline_id == outline_id

    def test_revision_add_chapters_bounds(self):
        """Test add_chapters field bounds."""
        from pydantic import ValidationError

        # Valid bounds
        revision = OutlineRevision(
            revision_instructions="Add more chapters to expand the story",
            add_chapters=5,
        )
        assert revision.add_chapters == 5

        # Too many chapters
        with pytest.raises(ValidationError):
            OutlineRevision(
                revision_instructions="Add way too many chapters",
                add_chapters=25,
            )


class TestBookOutlineWithRevision:
    """Tests for BookOutline schema with revision metadata."""

    def test_book_outline_revision_number(self):
        """Test that BookOutline tracks revision numbers."""
        synopsis = "A comprehensive story about testing software. " * 5

        outline = BookOutline(
            title="Test Book",
            logline="A story about testing",
            synopsis=synopsis,
            revision_number=1,
        )

        assert outline.revision_number == 1

        # Increment revision
        outline2 = BookOutline(
            title="Test Book",
            logline="A story about testing",
            synopsis=synopsis,
            revision_number=2,
        )

        assert outline2.revision_number == 2

    def test_book_outline_with_generated_metadata(self):
        """Test BookOutline with generation metadata."""
        from datetime import datetime

        synopsis = "A comprehensive story about testing software. " * 5

        outline = BookOutline(
            title="AI Generated Book",
            logline="An exciting AI-generated story",
            synopsis=synopsis,
            generated_at=datetime.utcnow(),
            model_used="gpt-5",
            revision_number=1,
        )

        assert outline.generated_at is not None
        assert outline.model_used == "gpt-5"


class TestOutlineEndpointRoutes:
    """Tests for outline endpoint route registration."""

    def test_outline_routes_exist(self):
        """Test that outline routes are registered."""
        from app.main import app

        routes = [route.path for route in app.routes]

        # Check that outline routes are registered
        assert any("/projects/{project_id}/outline" in route for route in routes)

    def test_outline_stream_route_exists(self):
        """Test that outline stream route is registered."""
        from app.main import app

        routes = [route.path for route in app.routes]

        assert any("/projects/{project_id}/outline/stream" in route for route in routes)

    def test_outline_revise_route_exists(self):
        """Test that outline revise route is registered."""
        from app.main import app

        routes = [route.path for route in app.routes]

        assert any("/projects/{project_id}/outline/revise/stream" in route for route in routes)


class TestChapterOutlineValidation:
    """Tests for ChapterOutline schema validation."""

    def test_valid_chapter_outline(self):
        """Test valid chapter outline creation."""
        chapter = ChapterOutline(
            number=1,
            title="The Beginning",
            summary="Our story begins in a small town where the protagonist lives.",
            setting="Small town, early morning",
        )

        assert chapter.number == 1
        assert chapter.title == "The Beginning"
        assert chapter.emotional_arc == "rising_action"  # Default
        assert chapter.estimated_word_count == 3000  # Default

    def test_chapter_number_bounds(self):
        """Test chapter number validation bounds."""
        from pydantic import ValidationError

        # Valid chapter numbers
        ChapterOutline(
            number=1,
            title="First",
            summary="A valid summary that meets length requirements",
            setting="Some location",
        )
        ChapterOutline(
            number=100,
            title="Last",
            summary="A valid summary that meets length requirements",
            setting="Some location",
        )

        # Invalid chapter number
        with pytest.raises(ValidationError):
            ChapterOutline(
                number=0,
                title="Invalid",
                summary="A valid summary that meets length requirements",
                setting="Some location",
            )

        with pytest.raises(ValidationError):
            ChapterOutline(
                number=101,
                title="Invalid",
                summary="A valid summary that meets length requirements",
                setting="Some location",
            )

    def test_chapter_with_all_fields(self):
        """Test chapter outline with all fields populated."""
        from app.schemas import ChapterHooks

        chapter = ChapterOutline(
            number=5,
            title="The Turning Point",
            summary="A critical chapter where everything changes for the protagonist",
            key_events=["Discovery of the truth", "Confrontation with mentor", "Decision to act"],
            characters_involved=["Protagonist", "Mentor", "Antagonist"],
            emotional_arc="climax",
            pov_character="Protagonist",
            setting="The ancient library at midnight",
            estimated_word_count=4500,
            hooks=ChapterHooks(
                opening_hook="The dust had barely settled when she heard the footsteps.",
                closing_hook="And in that moment, she knew nothing would ever be the same.",
            ),
            notes="Key chapter - ensure proper buildup in previous chapters",
        )

        assert len(chapter.key_events) == 3
        assert len(chapter.characters_involved) == 3
        assert chapter.emotional_arc == "climax"
        assert chapter.hooks is not None


class TestPlotStructureValidation:
    """Tests for PlotStructure schema validation."""

    def test_three_act_structure(self):
        """Test three-act structure creation."""
        structure = PlotStructure(
            structure_type="three_act",
            act_one_chapters=[1, 2, 3],
            act_two_chapters=[4, 5, 6, 7],
            act_three_chapters=[8, 9, 10],
        )

        assert structure.structure_type == "three_act"
        assert len(structure.act_one_chapters) == 3
        assert len(structure.act_two_chapters) == 4
        assert len(structure.act_three_chapters) == 3

    def test_heros_journey_structure(self):
        """Test hero's journey structure with all stages."""
        structure = PlotStructure(
            structure_type="heros_journey",
            ordinary_world="Luke on Tatooine, longing for adventure",
            call_to_adventure="Princess Leia's holographic message",
            refusal_of_call="Luke's uncle needs him for the harvest",
            meeting_mentor="Obi-Wan Kenobi reveals Luke's heritage",
            crossing_threshold="Leaving Tatooine with Han Solo",
            tests_allies_enemies="Death Star infiltration",
            approach_innermost_cave="Approaching the Death Star's core",
            ordeal="Rescuing Leia, losing Obi-Wan",
            reward="Escaping with the plans",
            road_back="The Rebellion's counterattack",
            resurrection="The trench run, trusting the Force",
            return_with_elixir="Medal ceremony, hero status achieved",
        )

        assert structure.structure_type == "heros_journey"
        assert structure.ordinary_world is not None
        assert structure.return_with_elixir is not None

    def test_all_structure_types_valid(self):
        """Test all valid structure types."""
        valid_types = [
            "three_act",
            "five_act",
            "heros_journey",
            "seven_point",
            "save_the_cat",
            "freytags_pyramid",
            "custom",
        ]

        for structure_type in valid_types:
            structure = PlotStructure(structure_type=structure_type)
            assert structure.structure_type == structure_type

    def test_invalid_structure_type(self):
        """Test that invalid structure types are rejected."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            PlotStructure(structure_type="invalid_type")


class TestOutlineRequestValidation:
    """Tests for OutlineRequest with enhanced fields."""

    def test_outline_request_with_plot_structure(self):
        """Test outline request with plot structure type."""
        from app.schemas import OutlineRequest

        request = OutlineRequest(
            brief="A thrilling story about a hero's journey through a magical land",
            plot_structure_type="heros_journey",
            target_chapters=12,
            genre="fantasy",
        )

        assert request.plot_structure_type == "heros_journey"
        assert request.target_chapters == 12

    def test_outline_request_with_character_profiles(self):
        """Test outline request with character profiles."""
        from app.schemas import CharacterProfile, OutlineRequest

        request = OutlineRequest(
            brief="A detective story set in 1920s New York",
            character_profiles={
                "Detective": CharacterProfile(
                    name="Jack Morrison",
                    role="protagonist",
                    description="A hard-boiled detective with a hidden past and a moral code he refuses to break.",
                    personality_traits=["determined", "cynical", "loyal"],
                ),
            },
            genre="mystery",
        )

        assert "Detective" in request.character_profiles
        assert request.character_profiles["Detective"].name == "Jack Morrison"

    def test_outline_request_with_world_building(self):
        """Test outline request with world building elements."""
        from app.schemas import OutlineRequest, WorldBuildingElement

        request = OutlineRequest(
            brief="An epic fantasy in a world where magic is dying",
            world_building={
                "The Fade": WorldBuildingElement(
                    name="The Fade",
                    category="magic_system",
                    description="The gradual disappearance of magic from the world, happening over centuries",
                    rules=["Magic weakens near iron", "Old spells work but new ones fail"],
                ),
            },
            genre="fantasy",
        )

        assert "The Fade" in request.world_building
        assert request.world_building["The Fade"].category == "magic_system"
