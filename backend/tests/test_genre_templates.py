"""Tests for genre-specific outline prompts and templates.

Tests cover:
- All 7 genre templates (romance, mystery, fantasy, thriller, literary, sci-fi, horror)
- Template registry functions
- Genre element validation
- Chapter guidance generation
- Prompt generation
- Edge cases and completeness checks
"""

import pytest

from app.agents.genre_templates import (
    FANTASY_TEMPLATE,
    GENRE_TEMPLATES,
    HORROR_TEMPLATE,
    LITERARY_FICTION_TEMPLATE,
    MYSTERY_TEMPLATE,
    ROMANCE_TEMPLATE,
    SCIENCE_FICTION_TEMPLATE,
    THRILLER_TEMPLATE,
    GenreElement,
    generate_outline_prompt_for_genre,
    get_all_genre_names,
    get_chapter_prompt_for_genre,
    get_genre_avoid_list,
    get_genre_reader_expectations,
    get_genre_summary,
    get_genre_template,
)


class TestGenreElement:
    """Tests for GenreElement dataclass."""

    def test_basic_genre_element(self):
        """Test creating a basic genre element."""
        elem = GenreElement(
            name="Test Element",
            description="A test element for validation",
            when_to_include="Throughout",
            importance="required",
        )

        assert elem.name == "Test Element"
        assert elem.importance == "required"
        assert elem.tips == []

    def test_genre_element_with_tips(self):
        """Test genre element with tips list."""
        elem = GenreElement(
            name="Character Development",
            description="Deep character exploration",
            when_to_include="Throughout",
            importance="required",
            tips=["Show internal conflict", "Use dialogue to reveal character"],
        )

        assert len(elem.tips) == 2


class TestGenrePromptTemplate:
    """Tests for GenrePromptTemplate dataclass."""

    def test_get_outline_prompt_additions(self):
        """Test generating outline prompt additions."""
        prompt = ROMANCE_TEMPLATE.get_outline_prompt_additions()

        assert "Romance" in prompt
        assert "Meet-Cute" in prompt
        assert "HEA/HFN" in prompt
        assert "Reader Expectations" in prompt

    def test_get_chapter_prompt_valid(self):
        """Test getting chapter prompt for valid position."""
        prompt = MYSTERY_TEMPLATE.get_chapter_prompt("opening")

        assert len(prompt) > 0
        assert "crime" in prompt.lower() or "detective" in prompt.lower()

    def test_get_chapter_prompt_invalid(self):
        """Test getting chapter prompt for invalid position."""
        prompt = MYSTERY_TEMPLATE.get_chapter_prompt("nonexistent")

        assert prompt == ""


class TestRomanceTemplate:
    """Tests specific to Romance genre template."""

    def test_has_required_elements(self):
        """Test that romance has all essential elements."""
        element_names = [e.name for e in ROMANCE_TEMPLATE.core_elements]

        assert "Meet-Cute" in element_names
        assert "Central Conflict" in element_names
        assert "Black Moment" in element_names
        assert "HEA/HFN Ending" in element_names

    def test_all_elements_have_descriptions(self):
        """Test that all elements have descriptions."""
        for elem in ROMANCE_TEMPLATE.core_elements:
            assert len(elem.description) > 10, f"Element {elem.name} needs description"

    def test_has_chapter_guidance(self):
        """Test that all chapter positions have guidance."""
        positions = ["opening", "early", "midpoint", "late", "climax", "ending"]

        for pos in positions:
            guidance = ROMANCE_TEMPLATE.get_chapter_prompt(pos)
            assert len(guidance) > 0, f"Missing guidance for {pos}"

    def test_has_avoid_list(self):
        """Test that romance has things to avoid."""
        assert len(ROMANCE_TEMPLATE.avoid_list) >= 3
        assert any("misunderstanding" in item.lower() for item in ROMANCE_TEMPLATE.avoid_list)

    def test_has_common_tropes(self):
        """Test that romance has common tropes listed."""
        assert len(ROMANCE_TEMPLATE.common_tropes) >= 5
        assert "Enemies to lovers" in ROMANCE_TEMPLATE.common_tropes

    def test_has_subgenres(self):
        """Test that romance has subgenres listed."""
        assert len(ROMANCE_TEMPLATE.subgenres) >= 4


class TestMysteryTemplate:
    """Tests specific to Mystery genre template."""

    def test_has_required_elements(self):
        """Test that mystery has all essential elements."""
        element_names = [e.name for e in MYSTERY_TEMPLATE.core_elements]

        assert "The Crime/Puzzle" in element_names
        assert "Clue Placement" in element_names
        assert "Red Herrings" in element_names
        assert "The Revelation" in element_names

    def test_clue_placement_has_tips(self):
        """Test that clue placement element has useful tips."""
        clue_elem = next(e for e in MYSTERY_TEMPLATE.core_elements if e.name == "Clue Placement")

        assert len(clue_elem.tips) >= 2
        assert any("clue" in tip.lower() for tip in clue_elem.tips)

    def test_fair_play_expectation(self):
        """Test that fair play is mentioned in expectations."""
        expectations = MYSTERY_TEMPLATE.reader_expectations

        assert any("fair" in exp.lower() for exp in expectations)

    def test_has_subgenres(self):
        """Test that mystery has subgenres listed."""
        assert len(MYSTERY_TEMPLATE.subgenres) >= 4
        assert "Cozy Mystery" in MYSTERY_TEMPLATE.subgenres


class TestFantasyTemplate:
    """Tests specific to Fantasy genre template."""

    def test_has_required_elements(self):
        """Test that fantasy has all essential elements."""
        element_names = [e.name for e in FANTASY_TEMPLATE.core_elements]

        assert "World Building" in element_names
        assert "Magic System" in element_names
        assert "Quest/Journey" in element_names

    def test_magic_system_has_tips(self):
        """Test that magic system element has useful tips."""
        magic_elem = next(e for e in FANTASY_TEMPLATE.core_elements if e.name == "Magic System")

        assert len(magic_elem.tips) >= 2
        # Should mention hard/soft magic or rules
        assert any("rule" in tip.lower() or "magic" in tip.lower() for tip in magic_elem.tips)

    def test_warns_against_info_dumping(self):
        """Test that info-dumping is in avoid list."""
        avoid = FANTASY_TEMPLATE.avoid_list

        assert any("info" in item.lower() and "dump" in item.lower() for item in avoid)

    def test_has_subgenres(self):
        """Test that fantasy has subgenres listed."""
        assert len(FANTASY_TEMPLATE.subgenres) >= 4


class TestThrillerTemplate:
    """Tests specific to Thriller genre template."""

    def test_has_required_elements(self):
        """Test that thriller has all essential elements."""
        element_names = [e.name for e in THRILLER_TEMPLATE.core_elements]

        assert "High Stakes" in element_names
        assert "Time Pressure" in element_names
        assert "Twists and Reversals" in element_names

    def test_pacing_notes_mention_momentum(self):
        """Test that pacing notes address thriller pacing."""
        pacing = THRILLER_TEMPLATE.pacing_notes.lower()

        assert "momentum" in pacing or "pace" in pacing or "forward" in pacing

    def test_formidable_antagonist(self):
        """Test that antagonist element exists and is detailed."""
        antagonist_elem = next(
            (e for e in THRILLER_TEMPLATE.core_elements if "antagonist" in e.name.lower()), None
        )

        assert antagonist_elem is not None
        assert antagonist_elem.importance == "required"

    def test_has_subgenres(self):
        """Test that thriller has subgenres listed."""
        assert len(THRILLER_TEMPLATE.subgenres) >= 4


class TestLiteraryFictionTemplate:
    """Tests specific to Literary Fiction genre template."""

    def test_has_required_elements(self):
        """Test that literary fiction has all essential elements."""
        element_names = [e.name for e in LITERARY_FICTION_TEMPLATE.core_elements]

        assert "Complex Protagonist" in element_names
        assert "Thematic Depth" in element_names
        assert "Prose Style" in element_names

    def test_character_focus(self):
        """Test that character development is emphasized."""
        char_elem = next(
            e
            for e in LITERARY_FICTION_TEMPLATE.core_elements
            if "protagonist" in e.name.lower() or "character" in e.name.lower()
        )

        assert char_elem.importance == "required"
        assert len(char_elem.tips) >= 2

    def test_ambiguous_endings_not_avoided(self):
        """Test that ambiguous endings are acceptable."""
        # Literary fiction should allow ambiguous endings
        avoid = LITERARY_FICTION_TEMPLATE.avoid_list

        # Should warn against neat endings, not ambiguous ones
        assert any("neat" in item.lower() or "tie up" in item.lower() for item in avoid)


class TestScienceFictionTemplate:
    """Tests specific to Science Fiction genre template."""

    def test_has_required_elements(self):
        """Test that sci-fi has all essential elements."""
        element_names = [e.name for e in SCIENCE_FICTION_TEMPLATE.core_elements]

        assert "Speculative Element" in element_names
        assert "World-Building" in element_names
        assert "Technology Impact" in element_names

    def test_thematic_exploration_required(self):
        """Test that thematic exploration is required."""
        thematic_elem = next(
            (e for e in SCIENCE_FICTION_TEMPLATE.core_elements if "thematic" in e.name.lower()),
            None,
        )

        assert thematic_elem is not None
        assert thematic_elem.importance == "required"

    def test_has_subgenres(self):
        """Test that sci-fi has subgenres listed."""
        assert len(SCIENCE_FICTION_TEMPLATE.subgenres) >= 4
        assert (
            "Hard SF" in SCIENCE_FICTION_TEMPLATE.subgenres
            or "Space Opera" in SCIENCE_FICTION_TEMPLATE.subgenres
        )


class TestHorrorTemplate:
    """Tests specific to Horror genre template."""

    def test_has_required_elements(self):
        """Test that horror has all essential elements."""
        element_names = [e.name for e in HORROR_TEMPLATE.core_elements]

        assert "Source of Fear" in element_names
        assert "Escalating Dread" in element_names
        assert "Vulnerable Protagonist" in element_names

    def test_atmosphere_importance(self):
        """Test that atmosphere is emphasized."""
        atmosphere_elem = next(
            (e for e in HORROR_TEMPLATE.core_elements if "atmosphere" in e.name.lower()), None
        )

        assert atmosphere_elem is not None
        assert atmosphere_elem.importance == "required"

    def test_has_subgenres(self):
        """Test that horror has subgenres listed."""
        assert len(HORROR_TEMPLATE.subgenres) >= 4


class TestTemplateRegistry:
    """Tests for template registry functions."""

    def test_get_all_genre_names(self):
        """Test getting all genre names."""
        names = get_all_genre_names()

        # Should have at least the 7 main genres
        assert len(names) >= 7
        assert "romance" in names
        assert "mystery" in names
        assert "fantasy" in names
        assert "thriller" in names

    def test_get_genre_template_valid(self):
        """Test getting a valid template."""
        template = get_genre_template("romance")

        assert template is not None
        assert template.genre == "Romance"

    def test_get_genre_template_case_insensitive(self):
        """Test that genre lookup is case insensitive."""
        template1 = get_genre_template("Romance")
        template2 = get_genre_template("ROMANCE")
        template3 = get_genre_template("romance")

        assert template1 == template2 == template3

    def test_get_genre_template_invalid(self):
        """Test getting an invalid template."""
        template = get_genre_template("nonexistent")

        assert template is None

    def test_get_genre_template_aliases(self):
        """Test that aliases work correctly."""
        literary1 = get_genre_template("literary_fiction")
        literary2 = get_genre_template("literary")

        assert literary1 == literary2

        sf1 = get_genre_template("science_fiction")
        sf2 = get_genre_template("sci-fi")
        sf3 = get_genre_template("sf")

        assert sf1 == sf2 == sf3

    def test_get_genre_summary_valid(self):
        """Test getting a genre summary."""
        summary = get_genre_summary("mystery")

        assert summary is not None
        assert summary["genre"] == "Mystery"
        assert "core_elements" in summary
        assert "common_tropes" in summary
        assert "subgenres" in summary

    def test_get_genre_summary_invalid(self):
        """Test getting summary for invalid genre."""
        summary = get_genre_summary("nonexistent")

        assert summary is None


class TestPromptGeneration:
    """Tests for prompt generation functions."""

    def test_generate_outline_prompt_for_genre(self):
        """Test generating outline prompt for a genre."""
        prompt = generate_outline_prompt_for_genre("romance")

        assert prompt is not None
        assert "Romance" in prompt
        assert "Core Elements" in prompt
        assert "Reader Expectations" in prompt

    def test_generate_outline_prompt_invalid_genre(self):
        """Test prompt generation for invalid genre."""
        prompt = generate_outline_prompt_for_genre("nonexistent")

        assert prompt is None

    def test_get_chapter_prompt_for_genre(self):
        """Test getting chapter prompt for a genre."""
        prompt = get_chapter_prompt_for_genre("thriller", "opening")

        assert len(prompt) > 0
        assert "start" in prompt.lower() or "hook" in prompt.lower() or "threat" in prompt.lower()

    def test_get_chapter_prompt_invalid_genre(self):
        """Test chapter prompt for invalid genre."""
        prompt = get_chapter_prompt_for_genre("nonexistent", "opening")

        assert prompt == ""

    def test_get_genre_avoid_list(self):
        """Test getting avoid list for a genre."""
        avoid = get_genre_avoid_list("mystery")

        assert len(avoid) >= 3
        # Mystery should avoid unfair solutions
        assert any("information" in item.lower() or "reader" in item.lower() for item in avoid)

    def test_get_genre_avoid_list_invalid(self):
        """Test avoid list for invalid genre."""
        avoid = get_genre_avoid_list("nonexistent")

        assert avoid == []

    def test_get_genre_reader_expectations(self):
        """Test getting reader expectations for a genre."""
        expectations = get_genre_reader_expectations("fantasy")

        assert len(expectations) >= 3
        # Fantasy readers expect world-building
        assert any("world" in exp.lower() for exp in expectations)

    def test_get_genre_reader_expectations_invalid(self):
        """Test expectations for invalid genre."""
        expectations = get_genre_reader_expectations("nonexistent")

        assert expectations == []


class TestAllTemplatesCompleteness:
    """Tests to ensure all templates are complete and consistent."""

    @pytest.mark.parametrize("genre_name", get_all_genre_names())
    def test_all_templates_have_description(self, genre_name):
        """Test that all templates have descriptions."""
        template = get_genre_template(genre_name)
        assert template is not None
        assert len(template.description) >= 20

    @pytest.mark.parametrize("genre_name", get_all_genre_names())
    def test_all_templates_have_core_elements(self, genre_name):
        """Test that all templates have core elements."""
        template = get_genre_template(genre_name)
        assert template is not None
        assert len(template.core_elements) >= 3

    @pytest.mark.parametrize("genre_name", get_all_genre_names())
    def test_all_templates_have_chapter_guidance(self, genre_name):
        """Test that all templates have chapter guidance."""
        template = get_genre_template(genre_name)
        assert template is not None
        assert len(template.chapter_guidance) >= 5

    @pytest.mark.parametrize("genre_name", get_all_genre_names())
    def test_all_templates_have_pacing_notes(self, genre_name):
        """Test that all templates have pacing notes."""
        template = get_genre_template(genre_name)
        assert template is not None
        assert len(template.pacing_notes) >= 50

    @pytest.mark.parametrize("genre_name", get_all_genre_names())
    def test_all_templates_have_tropes(self, genre_name):
        """Test that all templates have common tropes."""
        template = get_genre_template(genre_name)
        assert template is not None
        assert len(template.common_tropes) >= 5

    @pytest.mark.parametrize("genre_name", get_all_genre_names())
    def test_all_templates_have_avoid_list(self, genre_name):
        """Test that all templates have avoid lists."""
        template = get_genre_template(genre_name)
        assert template is not None
        assert len(template.avoid_list) >= 3

    @pytest.mark.parametrize("genre_name", get_all_genre_names())
    def test_all_templates_have_reader_expectations(self, genre_name):
        """Test that all templates have reader expectations."""
        template = get_genre_template(genre_name)
        assert template is not None
        assert len(template.reader_expectations) >= 3


class TestElementImportanceLevels:
    """Tests for element importance levels."""

    def test_importance_levels_are_valid(self):
        """Test that all importance levels are valid strings."""
        valid_levels = {"required", "recommended", "optional"}

        for template in GENRE_TEMPLATES.values():
            for elem in template.core_elements:
                assert (
                    elem.importance in valid_levels
                ), f"Invalid importance '{elem.importance}' in {template.genre}"

    def test_each_genre_has_required_elements(self):
        """Test that each genre has at least some required elements."""
        for name, template in GENRE_TEMPLATES.items():
            required = [e for e in template.core_elements if e.importance == "required"]
            assert len(required) >= 2, f"Genre {name} needs more required elements"


class TestChapterPositions:
    """Tests for chapter position guidance."""

    EXPECTED_POSITIONS = ["opening", "early", "midpoint", "late", "climax", "ending"]

    def test_all_templates_have_all_positions(self):
        """Test that all templates have guidance for all positions."""
        for name, template in GENRE_TEMPLATES.items():
            for pos in self.EXPECTED_POSITIONS:
                assert (
                    pos in template.chapter_guidance
                ), f"Genre {name} missing guidance for '{pos}'"

    def test_chapter_guidance_is_substantial(self):
        """Test that chapter guidance has substance."""
        for name, template in GENRE_TEMPLATES.items():
            for pos, guidance in template.chapter_guidance.items():
                assert len(guidance) >= 30, f"Genre {name} needs more guidance for '{pos}'"


class TestEdgeCases:
    """Tests for edge cases."""

    def test_normalize_genre_names(self):
        """Test that various name formats work."""
        # Spaces
        assert get_genre_template("literary fiction") is not None

        # Hyphens
        assert get_genre_template("sci-fi") is not None

        # Mixed case with spaces
        assert get_genre_template("Science Fiction") is not None

    def test_empty_genre_name(self):
        """Test handling of empty genre name."""
        template = get_genre_template("")
        assert template is None

    def test_prompt_generation_completeness(self):
        """Test that generated prompts contain all sections."""
        prompt = generate_outline_prompt_for_genre("romance")

        sections = ["Core Elements", "Reader Expectations", "Pacing Notes", "Avoid"]
        for section in sections:
            assert section in prompt, f"Prompt missing '{section}' section"
