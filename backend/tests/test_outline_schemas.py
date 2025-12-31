"""Tests for enhanced outline schemas."""

from datetime import datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas import (
    BookOutline,
    ChapterHooks,
    ChapterOutline,
    CharacterArc,
    OutlineRequest,
    OutlineRevision,
    PlotPoint,
    PlotStructure,
)


class TestChapterHooks:
    """Tests for ChapterHooks schema."""

    def test_valid_chapter_hooks(self):
        """Test creating valid chapter hooks."""
        hooks = ChapterHooks(
            opening_hook="The storm had been building for hours, and now it broke with fury.",
            closing_hook="She turned to face her destiny, knowing nothing would ever be the same.",
        )
        assert len(hooks.opening_hook) > 0
        assert len(hooks.closing_hook) > 0

    def test_opening_hook_too_short(self):
        """Test that short opening hooks are rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ChapterHooks(
                opening_hook="Short", closing_hook="This is a valid closing hook for the chapter."
            )
        assert "opening_hook" in str(exc_info.value)

    def test_closing_hook_too_short(self):
        """Test that short closing hooks are rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ChapterHooks(
                opening_hook="This is a valid opening hook for the chapter.", closing_hook="Short"
            )
        assert "closing_hook" in str(exc_info.value)


class TestChapterOutline:
    """Tests for ChapterOutline schema."""

    def test_valid_chapter_outline(self):
        """Test creating a valid chapter outline."""
        chapter = ChapterOutline(
            number=1,
            title="The Beginning",
            summary="The protagonist discovers a mysterious letter that will change everything.",
            key_events=["Finds letter", "Meets stranger", "Decision to investigate"],
            characters_involved=["Alice", "Bob"],
            emotional_arc="rising_action",
            pov_character="Alice",
            setting="A small coastal town in Maine",
            estimated_word_count=3500,
        )
        assert chapter.number == 1
        assert chapter.title == "The Beginning"
        assert len(chapter.key_events) == 3
        assert chapter.emotional_arc == "rising_action"

    def test_chapter_outline_with_hooks(self):
        """Test chapter outline with hooks."""
        hooks = ChapterHooks(
            opening_hook="The letter arrived on a Tuesday morning.",
            closing_hook="She knew she had to find the truth.",
        )
        chapter = ChapterOutline(
            number=2,
            title="The Investigation",
            summary="Alice begins her investigation into the mysterious letter.",
            setting="Local library and town hall",
            hooks=hooks,
        )
        assert chapter.hooks is not None
        assert "Tuesday" in chapter.hooks.opening_hook

    def test_invalid_chapter_number(self):
        """Test that chapter number 0 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ChapterOutline(
                number=0,
                title="Invalid",
                summary="This chapter has an invalid number.",
                setting="Somewhere",
            )
        assert "number" in str(exc_info.value)

    def test_invalid_emotional_arc(self):
        """Test that invalid emotional arc is rejected."""
        with pytest.raises(ValidationError):
            ChapterOutline(
                number=1,
                title="Test",
                summary="Test chapter with invalid arc.",
                emotional_arc="invalid_arc",
                setting="Somewhere",
            )

    def test_word_count_bounds(self):
        """Test word count validation."""
        # Too low
        with pytest.raises(ValidationError):
            ChapterOutline(
                number=1,
                title="Test",
                summary="Test chapter summary text.",
                setting="Somewhere",
                estimated_word_count=100,
            )

        # Too high
        with pytest.raises(ValidationError):
            ChapterOutline(
                number=1,
                title="Test",
                summary="Test chapter summary text.",
                setting="Somewhere",
                estimated_word_count=20000,
            )

    def test_all_emotional_arcs(self):
        """Test all valid emotional arc values."""
        valid_arcs = [
            "exposition",
            "rising_action",
            "tension_building",
            "climax",
            "falling_action",
            "resolution",
            "denouement",
            "transition",
        ]
        for arc in valid_arcs:
            chapter = ChapterOutline(
                number=1,
                title="Test",
                summary="This is a test chapter summary.",
                setting="Test setting",
                emotional_arc=arc,
            )
            assert chapter.emotional_arc == arc


class TestCharacterArc:
    """Tests for CharacterArc schema."""

    def test_valid_character_arc(self):
        """Test creating a valid character arc."""
        arc = CharacterArc(
            character_name="Hero McHeroface",
            starting_state="A naive farm boy with dreams of adventure",
            transformation="Through trials and mentorship, discovers inner strength and purpose",
            ending_state="A confident leader who inspires others",
            key_moments=["Meeting the mentor", "First battle", "Moment of doubt", "Final triumph"],
            internal_conflict="Fear of failure and disappointing others",
            external_conflict="The dark lord's army threatens the kingdom",
        )
        assert arc.character_name == "Hero McHeroface"
        assert len(arc.key_moments) == 4

    def test_minimal_character_arc(self):
        """Test character arc with only required fields."""
        arc = CharacterArc(
            character_name="Minor Character",
            starting_state="A simple merchant in the marketplace",
            transformation="Becomes entangled in the hero's quest and finds courage",
            ending_state="A valued ally and friend to the hero",
        )
        assert arc.internal_conflict is None
        assert arc.external_conflict is None

    def test_empty_character_name_rejected(self):
        """Test that empty character name is rejected."""
        with pytest.raises(ValidationError):
            CharacterArc(
                character_name="",
                starting_state="Some starting state description",
                transformation="Some transformation description",
                ending_state="Some ending state description",
            )


class TestPlotPoint:
    """Tests for PlotPoint schema."""

    def test_valid_plot_point(self):
        """Test creating a valid plot point."""
        point = PlotPoint(
            name="Inciting Incident",
            description="The hero discovers the magical artifact that will drive the story.",
            chapter_number=2,
            significance="major",
        )
        assert point.name == "Inciting Incident"
        assert point.chapter_number == 2
        assert point.significance == "major"

    def test_plot_point_all_significance_levels(self):
        """Test all valid significance levels."""
        for sig in ["major", "minor", "turning_point", "climactic"]:
            point = PlotPoint(
                name="Test Point",
                description="Test description for the plot point.",
                significance=sig,
            )
            assert point.significance == sig


class TestPlotStructure:
    """Tests for PlotStructure schema."""

    def test_three_act_structure(self):
        """Test creating a three-act structure."""
        structure = PlotStructure(
            structure_type="three_act",
            description="Classic three-act structure with setup, confrontation, resolution",
            act_one_chapters=[1, 2, 3],
            act_two_chapters=[4, 5, 6, 7, 8],
            act_three_chapters=[9, 10],
        )
        assert structure.structure_type == "three_act"
        assert len(structure.act_one_chapters) == 3

    def test_heros_journey_structure(self):
        """Test creating a hero's journey structure."""
        structure = PlotStructure(
            structure_type="heros_journey",
            ordinary_world="Luke on Tatooine",
            call_to_adventure="R2-D2's message from Leia",
            refusal_of_call="Luke's initial reluctance",
            meeting_mentor="Obi-Wan Kenobi",
            crossing_threshold="Leaving Tatooine",
            tests_allies_enemies="Cantina, Han Solo, Stormtroopers",
            approach_innermost_cave="Approaching Death Star",
            ordeal="Rescue mission and trash compactor",
            reward="Princess Leia rescued",
            road_back="Pursued by TIE fighters",
            resurrection="Final trench run",
            return_with_elixir="Medal ceremony and new hope",
        )
        assert structure.structure_type == "heros_journey"
        assert structure.ordinary_world == "Luke on Tatooine"

    def test_all_structure_types(self):
        """Test all valid structure types."""
        types = [
            "three_act",
            "five_act",
            "heros_journey",
            "seven_point",
            "save_the_cat",
            "freytags_pyramid",
            "custom",
        ]
        for stype in types:
            structure = PlotStructure(structure_type=stype)
            assert structure.structure_type == stype

    def test_structure_with_plot_points(self):
        """Test structure with plot points."""
        points = [
            PlotPoint(name="Opening", description="The story begins.", significance="minor"),
            PlotPoint(
                name="Midpoint", description="Everything changes.", significance="turning_point"
            ),
            PlotPoint(name="Climax", description="The final battle.", significance="climactic"),
        ]
        structure = PlotStructure(structure_type="custom", plot_points=points)
        assert len(structure.plot_points) == 3


class TestBookOutline:
    """Tests for BookOutline schema."""

    def test_valid_book_outline(self):
        """Test creating a valid book outline."""
        outline = BookOutline(
            title="The Quest for the Crystal",
            logline="A young wizard must find a stolen crystal before darkness consumes the realm.",
            synopsis="In a world where magic is fading, young wizard Elena discovers that the Crystal of Light has been stolen. With the help of unlikely allies, she must journey across dangerous lands to recover it before the shadow lord uses its power to plunge the world into eternal darkness. Along the way, she'll discover truths about her past and the true meaning of courage.",
            genre="Fantasy",
            subgenres=["Adventure", "Coming of Age"],
            themes=["Courage", "Friendship", "Self-discovery"],
            estimated_total_words=80000,
            target_audience="Young Adult readers",
        )
        assert outline.title == "The Quest for the Crystal"
        assert len(outline.themes) == 3
        assert outline.estimated_total_words == 80000

    def test_book_outline_with_chapters(self):
        """Test book outline with chapter list."""
        chapters = [
            ChapterOutline(
                number=i,
                title=f"Chapter {i}",
                summary=f"Summary for chapter {i} describing events.",
                setting=f"Setting for chapter {i}",
            )
            for i in range(1, 6)
        ]
        outline = BookOutline(
            title="Five Chapter Story",
            logline="A short adventure in five parts.",
            synopsis="This is a synopsis that is long enough to pass validation. It describes the overall story arc and major plot points of our five chapter adventure.",
            chapters=chapters,
        )
        assert len(outline.chapters) == 5
        assert outline.chapters[2].number == 3

    def test_book_outline_with_character_arcs(self):
        """Test book outline with character arcs."""
        arcs = {
            "protagonist": CharacterArc(
                character_name="The Hero",
                starting_state="A humble beginning in a small village",
                transformation="Through trials, becomes a leader and warrior",
                ending_state="Respected and wise, changed by the journey",
            ),
            "mentor": CharacterArc(
                character_name="The Mentor",
                starting_state="Ancient and powerful, but jaded",
                transformation="Finds renewed purpose through teaching",
                ending_state="Sacrifices self to save the hero",
            ),
        }
        outline = BookOutline(
            title="Hero's Journey",
            logline="A classic tale of growth and adventure.",
            synopsis="This is a detailed synopsis that describes the hero's journey from ordinary world to extraordinary circumstances and back again with wisdom gained.",
            character_arcs=arcs,
        )
        assert "protagonist" in outline.character_arcs
        assert outline.character_arcs["mentor"].character_name == "The Mentor"

    def test_book_outline_with_plot_structure(self):
        """Test book outline with plot structure."""
        structure = PlotStructure(
            structure_type="three_act",
            act_one_chapters=[1, 2, 3],
            act_two_chapters=[4, 5, 6, 7],
            act_three_chapters=[8, 9, 10],
        )
        outline = BookOutline(
            title="Structured Story",
            logline="A well-structured narrative following three-act format.",
            synopsis="This story follows the classic three-act structure with careful attention to pacing and character development throughout each major section.",
            plot_structure=structure,
        )
        assert outline.plot_structure.structure_type == "three_act"

    def test_book_outline_metadata(self):
        """Test book outline generation metadata."""
        outline = BookOutline(
            title="Generated Story",
            logline="An AI-generated narrative with tracking.",
            synopsis="This outline was generated by an AI system and includes metadata about the generation process for tracking and revision purposes.",
            generated_at=datetime.now(),
            model_used="gpt-5",
            revision_number=3,
        )
        assert outline.generated_at is not None
        assert outline.model_used == "gpt-5"
        assert outline.revision_number == 3

    def test_book_outline_word_count_bounds(self):
        """Test word count validation bounds."""
        valid_synopsis = "This is a detailed and comprehensive synopsis that describes the overall story arc, major plot points, character development, and thematic elements of the narrative."

        # Too low
        with pytest.raises(ValidationError):
            BookOutline(
                title="Too Short",
                logline="This book is way too short.",
                synopsis=valid_synopsis,
                estimated_total_words=500,
            )

        # Valid upper bound
        outline = BookOutline(
            title="Epic Novel",
            logline="This book is appropriately long.",
            synopsis=valid_synopsis,
            estimated_total_words=500000,
        )
        assert outline.estimated_total_words == 500000


class TestOutlineRevision:
    """Tests for OutlineRevision schema."""

    def test_valid_revision_request(self):
        """Test creating a valid revision request."""
        revision = OutlineRevision(
            outline_id=uuid4(),
            revision_instructions="Make chapter 3 more dramatic and add foreshadowing.",
            chapters_to_revise=[3],
            preserve_chapters=[1, 2, 4, 5],
        )
        assert len(revision.chapters_to_revise) == 1
        assert len(revision.preserve_chapters) == 4

    def test_revision_add_chapters(self):
        """Test revision request to add chapters."""
        revision = OutlineRevision(
            revision_instructions="Add two more chapters to expand the middle section.",
            add_chapters=2,
        )
        assert revision.add_chapters == 2

    def test_revision_remove_chapters(self):
        """Test revision request to remove chapters."""
        revision = OutlineRevision(
            revision_instructions="Remove the slow-paced chapters in the middle.",
            remove_chapters=[4, 5],
        )
        assert revision.remove_chapters == [4, 5]

    def test_revision_instructions_too_short(self):
        """Test that short revision instructions are rejected."""
        with pytest.raises(ValidationError):
            OutlineRevision(revision_instructions="Short")


class TestOutlineRequest:
    """Tests for enhanced OutlineRequest schema."""

    def test_outline_request_with_structure_type(self):
        """Test outline request with plot structure type."""
        request = OutlineRequest(
            brief="A fantasy story about a young wizard learning magic.",
            genre="Fantasy",
            target_chapters=15,
            plot_structure_type="heros_journey",
        )
        assert request.plot_structure_type == "heros_journey"

    def test_outline_request_all_structure_types(self):
        """Test all valid plot structure types in outline request."""
        types = [
            "three_act",
            "five_act",
            "heros_journey",
            "seven_point",
            "save_the_cat",
            "freytags_pyramid",
            "custom",
        ]
        for stype in types:
            request = OutlineRequest(
                brief="A story that follows a specific structure pattern.",
                plot_structure_type=stype,
            )
            assert request.plot_structure_type == stype

    def test_outline_request_with_character_profiles(self):
        """Test outline request with character profiles."""
        from app.schemas import CharacterProfile

        profiles = {
            "hero": CharacterProfile(
                name="The Hero",
                role="protagonist",
                description="A young person who must save the world from darkness.",
                personality_traits=["brave", "curious", "stubborn"],
            )
        }
        request = OutlineRequest(
            brief="A coming-of-age story about a young hero.", character_profiles=profiles
        )
        assert "hero" in request.character_profiles

    def test_outline_request_with_world_building(self):
        """Test outline request with world building elements."""
        from app.schemas import WorldBuildingElement

        world = {
            "magic_system": WorldBuildingElement(
                name="Elemental Magic",
                category="magic_system",
                description="A magic system based on the four classical elements.",
                rules=["Each person can only use one element", "Power scales with training"],
            )
        }
        request = OutlineRequest(
            brief="A fantasy story with complex magic system.", world_building=world
        )
        assert "magic_system" in request.world_building


class TestSchemasSerialization:
    """Tests for schema serialization and round-trip."""

    def test_book_outline_to_dict(self):
        """Test serializing book outline to dictionary."""
        outline = BookOutline(
            title="Serialization Test",
            logline="Testing the serialization capabilities.",
            synopsis="This is a comprehensive test of the serialization capabilities of the BookOutline schema to ensure proper round-trip handling.",
            themes=["Testing", "Quality"],
        )
        data = outline.model_dump()
        assert isinstance(data, dict)
        assert data["title"] == "Serialization Test"
        assert "Testing" in data["themes"]

    def test_book_outline_from_dict(self):
        """Test deserializing book outline from dictionary."""
        data = {
            "title": "From Dict",
            "logline": "Created from a dictionary input.",
            "synopsis": "This outline was created by parsing a dictionary object to test the deserialization capabilities of the BookOutline schema ensuring proper round-trip handling of data.",
            "estimated_total_words": 60000,
        }
        outline = BookOutline(**data)
        assert outline.title == "From Dict"
        assert outline.estimated_total_words == 60000

    def test_nested_schema_serialization(self):
        """Test serialization of deeply nested schemas."""
        arc = CharacterArc(
            character_name="Nested Test",
            starting_state="Initial state for testing purposes",
            transformation="Testing nested schema transformation handling",
            ending_state="Final state after transformation test",
        )
        chapter = ChapterOutline(
            number=1,
            title="Nested Chapter",
            summary="A chapter for testing nested serialization.",
            setting="Test environment",
        )
        outline = BookOutline(
            title="Nested Test",
            logline="Testing nested schema serialization.",
            synopsis="This test verifies that deeply nested schema structures serialize and deserialize correctly with full preservation of data integrity across all levels.",
            character_arcs={"test": arc},
            chapters=[chapter],
        )

        # Serialize
        data = outline.model_dump()
        assert "character_arcs" in data
        assert "test" in data["character_arcs"]
        assert data["chapters"][0]["number"] == 1

        # Deserialize
        restored = BookOutline(**data)
        assert restored.character_arcs["test"].character_name == "Nested Test"
        assert restored.chapters[0].title == "Nested Chapter"


class TestOutlineRequestModelValidation:
    """Tests for OutlineRequest model validation."""

    def test_valid_model(self):
        """Test creating outline request with valid model."""
        from app.config import DEFAULT_MODEL

        request = OutlineRequest(
            brief="A fantasy story about a young wizard.",
            model=DEFAULT_MODEL,
        )
        assert request.model == DEFAULT_MODEL

    def test_unsupported_model_rejected(self):
        """Test that unsupported models are rejected."""
        with pytest.raises(ValidationError) as exc_info:
            OutlineRequest(
                brief="A fantasy story about a young wizard.",
                model="unsupported-model-xyz",
            )
        error_str = str(exc_info.value)
        assert "Unsupported model" in error_str
        assert "unsupported-model-xyz" in error_str
