"""Tests for plot structure templates module.

Tests cover:
- All 5 plot structure templates (three-act, five-act, hero's journey, seven-point, save-the-cat)
- Template registry functions
- Chapter assignment calculations
- PlotStructure schema conversion
- Chapter guidance generation
- Emotional arc suggestions
- Edge cases and boundary conditions
"""

from app.agents.plot_structures import (
    FIVE_ACT_STRUCTURE,
    HEROS_JOURNEY,
    PLOT_TEMPLATES,
    SAVE_THE_CAT,
    SEVEN_POINT_STRUCTURE,
    THREE_ACT_STRUCTURE,
    PlotBeat,
    generate_chapter_guidance,
    get_all_template_names,
    get_plot_template,
    get_template_summary,
    suggest_emotional_arc,
)
from app.schemas import PlotStructure


class TestPlotBeat:
    """Tests for PlotBeat dataclass."""

    def test_basic_plot_beat(self):
        """Test creating a basic plot beat."""
        beat = PlotBeat(
            name="Test Beat",
            description="A test beat for validation",
            percentage_through_story=0.5,
            chapter_range_start=0.45,
            chapter_range_end=0.55,
            typical_emotional_arc="climax",
        )

        assert beat.name == "Test Beat"
        assert beat.percentage_through_story == 0.5
        assert beat.typical_emotional_arc == "climax"
        assert beat.tips == []

    def test_plot_beat_with_tips(self):
        """Test plot beat with tips list."""
        beat = PlotBeat(
            name="Midpoint",
            description="The story's central turning point",
            percentage_through_story=0.5,
            chapter_range_start=0.48,
            chapter_range_end=0.52,
            typical_emotional_arc="climax",
            tips=["Raise the stakes", "Shift from reaction to action"],
        )

        assert len(beat.tips) == 2
        assert "Raise the stakes" in beat.tips


class TestPlotTemplate:
    """Tests for PlotTemplate dataclass."""

    def test_chapter_assignments_10_chapters(self):
        """Test chapter assignments for a 10-chapter book."""
        assignments = THREE_ACT_STRUCTURE.get_chapter_assignments(10)

        assert "Act One (Setup)" in assignments
        assert "Midpoint" in assignments
        assert "Act Three (Resolution)" in assignments

    def test_chapter_assignments_20_chapters(self):
        """Test chapter assignments for a 20-chapter book."""
        assignments = HEROS_JOURNEY.get_chapter_assignments(20)

        # Should have assignments for all 12 Hero's Journey stages
        assert len(assignments) == 12
        assert "Ordinary World" in assignments
        assert "Return with Elixir" in assignments

    def test_chapter_assignments_single_chapter(self):
        """Test edge case with single chapter book."""
        assignments = THREE_ACT_STRUCTURE.get_chapter_assignments(1)

        # All assignments should map to chapter 1
        for beat_name, chapters in assignments.items():
            for ch in chapters:
                assert ch == 1

    def test_to_plot_structure_three_act(self):
        """Test converting three-act template to PlotStructure schema."""
        structure = THREE_ACT_STRUCTURE.to_plot_structure(10)

        assert isinstance(structure, PlotStructure)
        assert structure.structure_type == "three_act"
        assert structure.act_one_chapters is not None
        assert structure.act_two_chapters is not None
        assert structure.act_three_chapters is not None
        assert len(structure.plot_points) > 0

    def test_to_plot_structure_heros_journey(self):
        """Test converting hero's journey template to PlotStructure schema."""
        structure = HEROS_JOURNEY.to_plot_structure(12)

        assert isinstance(structure, PlotStructure)
        assert structure.structure_type == "heros_journey"
        assert structure.ordinary_world is not None
        assert structure.call_to_adventure is not None
        assert structure.return_with_elixir is not None

    def test_to_plot_structure_with_custom_plot_points(self):
        """Test adding custom plot points to structure."""
        from app.schemas import PlotPoint

        custom_points = [
            PlotPoint(
                name="Custom Twist",
                description="An unexpected revelation",
                chapter_number=7,
                significance="major",
            )
        ]

        structure = THREE_ACT_STRUCTURE.to_plot_structure(10, custom_points)

        # Should include both template and custom plot points
        names = [p.name for p in structure.plot_points]
        assert "Custom Twist" in names

    def test_genre_modifications_exist(self):
        """Test that genre modifications are defined for relevant templates."""
        assert len(THREE_ACT_STRUCTURE.genre_modifications) > 0
        assert "romance" in THREE_ACT_STRUCTURE.genre_modifications
        assert "mystery" in THREE_ACT_STRUCTURE.genre_modifications

        assert len(HEROS_JOURNEY.genre_modifications) > 0
        assert "fantasy" in HEROS_JOURNEY.genre_modifications


class TestThreeActStructure:
    """Tests specific to Three-Act Structure."""

    def test_has_all_required_beats(self):
        """Test that three-act structure has all standard beats."""
        beat_names = [b.name for b in THREE_ACT_STRUCTURE.beats]

        assert "Act One (Setup)" in beat_names
        assert "Inciting Incident" in beat_names
        assert "First Plot Point" in beat_names
        assert "Midpoint" in beat_names
        assert "Second Plot Point" in beat_names
        assert "Act Three (Resolution)" in beat_names
        assert "Climax" in beat_names
        assert "Denouement" in beat_names

    def test_beat_percentages_are_ordered(self):
        """Test that beats are in chronological order."""
        percentages = [b.percentage_through_story for b in THREE_ACT_STRUCTURE.beats]

        for i in range(1, len(percentages)):
            assert (
                percentages[i] >= percentages[i - 1]
            ), f"Beat {THREE_ACT_STRUCTURE.beats[i].name} is out of order"

    def test_midpoint_at_50_percent(self):
        """Test that midpoint is approximately at 50%."""
        for beat in THREE_ACT_STRUCTURE.beats:
            if beat.name == "Midpoint":
                assert 0.45 <= beat.percentage_through_story <= 0.55
                break


class TestFiveActStructure:
    """Tests specific to Five-Act Structure (Freytag's Pyramid)."""

    def test_has_all_required_beats(self):
        """Test that five-act structure has all Freytag stages."""
        beat_names = [b.name for b in FIVE_ACT_STRUCTURE.beats]

        assert "Exposition" in beat_names
        assert "Exciting Force" in beat_names
        assert "Rising Action" in beat_names
        assert "Climax" in beat_names
        assert "Falling Action" in beat_names
        assert "Catastrophe/Resolution" in beat_names

    def test_climax_at_midpoint(self):
        """Test that Freytag's climax is at the story midpoint."""
        for beat in FIVE_ACT_STRUCTURE.beats:
            if beat.name == "Climax":
                assert beat.percentage_through_story == 0.5
                break


class TestHerosJourney:
    """Tests specific to Hero's Journey structure."""

    def test_has_all_12_stages(self):
        """Test that hero's journey has all 12 stages."""
        assert len(HEROS_JOURNEY.beats) == 12

        expected_stages = [
            "Ordinary World",
            "Call to Adventure",
            "Refusal of Call",
            "Meeting Mentor",
            "Crossing Threshold",
            "Tests Allies Enemies",
            "Approach Innermost Cave",
            "Ordeal",
            "Reward",
            "Road Back",
            "Resurrection",
            "Return with Elixir",
        ]

        beat_names = [b.name for b in HEROS_JOURNEY.beats]
        for stage in expected_stages:
            assert stage in beat_names, f"Missing stage: {stage}"

    def test_ordeal_after_approach(self):
        """Test that Ordeal comes after Approach to Innermost Cave."""
        ordeal_idx = None
        approach_idx = None

        for i, beat in enumerate(HEROS_JOURNEY.beats):
            if beat.name == "Ordeal":
                ordeal_idx = i
            if beat.name == "Approach Innermost Cave":
                approach_idx = i

        assert ordeal_idx is not None
        assert approach_idx is not None
        assert ordeal_idx > approach_idx


class TestSevenPointStructure:
    """Tests specific to Seven-Point Story Structure."""

    def test_has_all_7_points(self):
        """Test that seven-point structure has all 7 beats."""
        assert len(SEVEN_POINT_STRUCTURE.beats) == 7

        expected_points = [
            "Hook",
            "Plot Turn 1",
            "Pinch Point 1",
            "Midpoint",
            "Pinch Point 2",
            "Plot Turn 2",
            "Resolution",
        ]

        beat_names = [b.name for b in SEVEN_POINT_STRUCTURE.beats]
        for point in expected_points:
            assert point in beat_names, f"Missing point: {point}"

    def test_pinch_points_bracket_midpoint(self):
        """Test that pinch points are before and after midpoint."""
        pinch1_pct = None
        pinch2_pct = None
        midpoint_pct = None

        for beat in SEVEN_POINT_STRUCTURE.beats:
            if beat.name == "Pinch Point 1":
                pinch1_pct = beat.percentage_through_story
            if beat.name == "Pinch Point 2":
                pinch2_pct = beat.percentage_through_story
            if beat.name == "Midpoint":
                midpoint_pct = beat.percentage_through_story

        assert pinch1_pct < midpoint_pct < pinch2_pct


class TestSaveTheCat:
    """Tests specific to Save the Cat Beat Sheet."""

    def test_has_all_15_beats(self):
        """Test that Save the Cat has all 15 beats."""
        assert len(SAVE_THE_CAT.beats) == 15

    def test_opening_and_final_image(self):
        """Test that opening and final image bookend the story."""
        first_beat = SAVE_THE_CAT.beats[0]
        last_beat = SAVE_THE_CAT.beats[-1]

        assert first_beat.name == "Opening Image"
        assert last_beat.name == "Final Image"
        assert first_beat.percentage_through_story == 0.0
        assert last_beat.percentage_through_story >= 0.95

    def test_fun_and_games_is_longest(self):
        """Test that Fun and Games section is one of the longest."""
        fun_and_games = None
        for beat in SAVE_THE_CAT.beats:
            if beat.name == "Fun and Games":
                fun_and_games = beat
                break

        assert fun_and_games is not None
        duration = fun_and_games.chapter_range_end - fun_and_games.chapter_range_start
        assert duration >= 0.15  # At least 15% of the story

    def test_all_is_lost_before_finale(self):
        """Test that All Is Lost comes before the Finale."""
        all_is_lost_pct = None
        finale_pct = None

        for beat in SAVE_THE_CAT.beats:
            if beat.name == "All Is Lost":
                all_is_lost_pct = beat.percentage_through_story
            if beat.name == "Finale":
                finale_pct = beat.percentage_through_story

        assert all_is_lost_pct < finale_pct


class TestTemplateRegistry:
    """Tests for template registry functions."""

    def test_get_all_template_names(self):
        """Test getting all template names."""
        names = get_all_template_names()

        assert "three_act" in names
        assert "five_act" in names
        assert "heros_journey" in names
        assert "seven_point" in names
        assert "save_the_cat" in names
        assert "freytags_pyramid" in names  # Alias for five_act

    def test_get_plot_template_valid(self):
        """Test getting a valid template."""
        template = get_plot_template("three_act")

        assert template is not None
        assert template.name == "Three-Act Structure"

    def test_get_plot_template_invalid(self):
        """Test getting an invalid template."""
        template = get_plot_template("nonexistent")

        assert template is None

    def test_get_plot_template_alias(self):
        """Test that freytags_pyramid is an alias for five_act."""
        freytag = get_plot_template("freytags_pyramid")
        five_act = get_plot_template("five_act")

        assert freytag is five_act

    def test_get_template_summary_valid(self):
        """Test getting a template summary."""
        summary = get_template_summary("heros_journey")

        assert summary is not None
        assert summary["name"] == "Hero's Journey"
        assert summary["beat_count"] == 12
        assert len(summary["beats"]) == 12

    def test_get_template_summary_invalid(self):
        """Test getting summary for invalid template."""
        summary = get_template_summary("nonexistent")

        assert summary is None


class TestChapterGuidance:
    """Tests for chapter guidance generation."""

    def test_generate_guidance_first_chapter(self):
        """Test guidance for the first chapter."""
        guidance = generate_chapter_guidance("three_act", 1, 10)

        assert guidance["chapter_number"] == 1
        assert guidance["percentage_through_story"] == 0.0
        assert "current_beat" in guidance
        assert guidance["current_beat"]["name"] == "Act One (Setup)"

    def test_generate_guidance_midpoint(self):
        """Test guidance for the midpoint chapter."""
        guidance = generate_chapter_guidance("three_act", 5, 10)

        assert 0.4 <= guidance["percentage_through_story"] <= 0.5
        assert "current_beat" in guidance

    def test_generate_guidance_last_chapter(self):
        """Test guidance for the last chapter."""
        guidance = generate_chapter_guidance("three_act", 10, 10)

        assert guidance["percentage_through_story"] == 1.0
        assert "current_beat" in guidance

    def test_generate_guidance_invalid_structure(self):
        """Test guidance for invalid structure type."""
        guidance = generate_chapter_guidance("nonexistent", 1, 10)

        assert "error" in guidance

    def test_generate_guidance_includes_tips(self):
        """Test that guidance includes tips."""
        guidance = generate_chapter_guidance("three_act", 1, 10)

        assert "tips" in guidance["current_beat"]
        assert isinstance(guidance["current_beat"]["tips"], list)


class TestEmotionalArcSuggestion:
    """Tests for emotional arc suggestion."""

    def test_suggest_arc_exposition(self):
        """Test suggesting exposition arc for early chapters."""
        arc = suggest_emotional_arc("three_act", 1, 10)

        assert arc == "exposition"

    def test_suggest_arc_rising_action(self):
        """Test suggesting rising action for early-mid chapters."""
        # Chapter 4 of 10 is around 33%, past Act One and into rising action
        arc = suggest_emotional_arc("three_act", 4, 10)

        # Should be rising_action or tension_building at this point
        assert arc in ["rising_action", "tension_building"]

    def test_suggest_arc_climax(self):
        """Test suggesting climax for climactic chapters."""
        arc = suggest_emotional_arc("three_act", 9, 10)

        # Should be climax or resolution
        assert arc in ["climax", "resolution"]

    def test_suggest_arc_invalid_structure(self):
        """Test default arc for invalid structure."""
        arc = suggest_emotional_arc("nonexistent", 5, 10)

        assert arc == "rising_action"

    def test_suggest_arc_all_templates(self):
        """Test that all templates return valid arcs."""
        valid_arcs = {
            "exposition",
            "rising_action",
            "tension_building",
            "climax",
            "falling_action",
            "resolution",
            "denouement",
            "transition",
        }

        for template_name in get_all_template_names():
            for chapter in range(1, 11):
                arc = suggest_emotional_arc(template_name, chapter, 10)
                assert arc in valid_arcs, f"Invalid arc {arc} from {template_name}"


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_very_short_book(self):
        """Test with a very short book (3 chapters)."""
        structure = THREE_ACT_STRUCTURE.to_plot_structure(3)

        assert isinstance(structure, PlotStructure)
        assert len(structure.plot_points) > 0

        guidance = generate_chapter_guidance("three_act", 2, 3)
        assert "current_beat" in guidance

    def test_very_long_book(self):
        """Test with a very long book (100 chapters)."""
        structure = SAVE_THE_CAT.to_plot_structure(100)

        assert isinstance(structure, PlotStructure)
        assert len(structure.plot_points) == 15

        # Check that assignments spread across all chapters
        assignments = SAVE_THE_CAT.get_chapter_assignments(100)
        all_chapters = set()
        for chapters in assignments.values():
            all_chapters.update(chapters)

        # Should cover most of the book
        assert len(all_chapters) >= 50

    def test_chapter_zero_handling(self):
        """Test that chapter 0 is handled gracefully."""
        guidance = generate_chapter_guidance("three_act", 0, 10)

        # Should not crash, may return first beat
        assert "current_beat" in guidance or "error" in guidance

    def test_chapter_beyond_total(self):
        """Test chapter number beyond total chapters."""
        guidance = generate_chapter_guidance("three_act", 15, 10)

        # Should handle gracefully
        assert "current_beat" in guidance

    def test_all_templates_have_descriptions(self):
        """Test that all templates have non-empty descriptions."""
        for name, template in PLOT_TEMPLATES.items():
            assert template.description, f"Template {name} has no description"
            assert len(template.description) > 20

    def test_all_beats_have_tips(self):
        """Test that most beats have tips."""
        for name, template in PLOT_TEMPLATES.items():
            beats_with_tips = sum(1 for b in template.beats if len(b.tips) > 0)
            assert beats_with_tips >= len(template.beats) * 0.8, f"Template {name} needs more tips"


class TestPlotPointSignificance:
    """Tests for plot point significance assignment."""

    def test_major_plot_points(self):
        """Test that key plot points are marked as major."""
        structure = THREE_ACT_STRUCTURE.to_plot_structure(10)

        major_points = [p for p in structure.plot_points if p.significance == "major"]
        assert len(major_points) >= 2

    def test_plot_point_chapter_numbers(self):
        """Test that plot points have valid chapter numbers."""
        structure = THREE_ACT_STRUCTURE.to_plot_structure(10)

        for point in structure.plot_points:
            if point.chapter_number is not None:
                assert 1 <= point.chapter_number <= 10


class TestIntegrationWithSchemas:
    """Tests for integration with Pydantic schemas."""

    def test_plot_structure_serialization(self):
        """Test that generated PlotStructure can be serialized."""
        structure = HEROS_JOURNEY.to_plot_structure(12)

        # Should serialize to dict without errors
        data = structure.model_dump()

        assert data["structure_type"] == "heros_journey"
        assert "plot_points" in data

    def test_plot_structure_json(self):
        """Test that generated PlotStructure can be converted to JSON."""
        structure = THREE_ACT_STRUCTURE.to_plot_structure(10)

        json_str = structure.model_dump_json()

        assert "three_act" in json_str
        assert "plot_points" in json_str

    def test_round_trip_serialization(self):
        """Test serialization round-trip."""
        original = SAVE_THE_CAT.to_plot_structure(15)

        # Serialize and deserialize
        data = original.model_dump()
        restored = PlotStructure(**data)

        assert restored.structure_type == original.structure_type
        assert len(restored.plot_points) == len(original.plot_points)
