"""Tests for scene-level generation.

Tests cover:
- Scene type and transition enums
- SceneContext and ChapterBreakdown dataclasses
- SceneBreakdownGenerator functionality
- SceneGenerator POV consistency and prompt generation
- Factory function
"""

from app.agents.scene_generator import (
    ChapterBreakdown,
    PacingIntensity,
    SceneBreakdownGenerator,
    SceneContext,
    SceneGenerator,
    SceneTransition,
    SceneType,
    TransitionType,
    create_scene_breakdown,
)


class TestSceneTypeEnum:
    """Tests for SceneType enum."""

    def test_all_values_defined(self):
        """Test that all scene type values are defined."""
        assert SceneType.ACTION == "action"
        assert SceneType.DIALOGUE == "dialogue"
        assert SceneType.EXPOSITION == "exposition"
        assert SceneType.INTROSPECTION == "introspection"
        assert SceneType.TRANSITION == "transition"
        assert SceneType.CLIMACTIC == "climactic"

    def test_enum_count(self):
        """Test expected number of scene types."""
        assert len(SceneType) == 6

    def test_is_string_enum(self):
        """Test that SceneType is a string enum."""
        for scene_type in SceneType:
            assert isinstance(scene_type.value, str)
            assert isinstance(scene_type, str)


class TestTransitionTypeEnum:
    """Tests for TransitionType enum."""

    def test_all_values_defined(self):
        """Test that all transition type values are defined."""
        assert TransitionType.CUT == "cut"
        assert TransitionType.DISSOLVE == "dissolve"
        assert TransitionType.BRIDGE == "bridge"
        assert TransitionType.TIME_SKIP == "time_skip"
        assert TransitionType.LOCATION_SHIFT == "location_shift"
        assert TransitionType.POV_SWITCH == "pov_switch"

    def test_enum_count(self):
        """Test expected number of transition types."""
        assert len(TransitionType) == 6


class TestPacingIntensityEnum:
    """Tests for PacingIntensity enum."""

    def test_all_values_defined(self):
        """Test that all pacing intensity values are defined."""
        assert PacingIntensity.SLOW == "slow"
        assert PacingIntensity.MODERATE == "moderate"
        assert PacingIntensity.FAST == "fast"
        assert PacingIntensity.INTENSE == "intense"

    def test_enum_count(self):
        """Test expected number of pacing intensities."""
        assert len(PacingIntensity) == 4


class TestSceneContext:
    """Tests for SceneContext dataclass."""

    def test_default_context(self):
        """Test default scene context creation."""
        context = SceneContext()

        assert context.id is not None
        assert context.scene_number == 1
        assert context.scene_type == SceneType.ACTION
        assert context.pov_character is None
        assert context.location is None
        assert context.time_of_day is None
        assert context.characters_present == []
        assert context.objectives == []
        assert context.emotional_beat is None
        assert context.tension_level == 0.5
        assert context.pacing == PacingIntensity.MODERATE
        assert context.hooks_from_previous is None
        assert context.setup_for_next is None
        assert context.estimated_word_count == 500

    def test_custom_context(self):
        """Test custom scene context creation."""
        context = SceneContext(
            scene_number=3,
            scene_type=SceneType.CLIMACTIC,
            pov_character="John",
            location="Castle throne room",
            time_of_day="midnight",
            characters_present=["John", "Mary", "King"],
            objectives=["Confront the king", "Reveal the truth"],
            emotional_beat="Righteous anger",
            tension_level=0.9,
            pacing=PacingIntensity.INTENSE,
            hooks_from_previous="The door burst open",
            setup_for_next="The king's guards arrive",
            estimated_word_count=800,
        )

        assert context.scene_number == 3
        assert context.scene_type == SceneType.CLIMACTIC
        assert context.pov_character == "John"
        assert context.location == "Castle throne room"
        assert context.time_of_day == "midnight"
        assert len(context.characters_present) == 3
        assert len(context.objectives) == 2
        assert context.emotional_beat == "Righteous anger"
        assert context.tension_level == 0.9
        assert context.pacing == PacingIntensity.INTENSE
        assert context.estimated_word_count == 800


class TestSceneTransition:
    """Tests for SceneTransition dataclass."""

    def test_default_transition(self):
        """Test default transition creation."""
        transition = SceneTransition(from_scene=1, to_scene=2)

        assert transition.from_scene == 1
        assert transition.to_scene == 2
        assert transition.transition_type == TransitionType.DISSOLVE
        assert transition.time_gap is None
        assert transition.location_change is False
        assert transition.pov_change is False
        assert transition.transition_text is None

    def test_custom_transition(self):
        """Test custom transition creation."""
        transition = SceneTransition(
            from_scene=2,
            to_scene=3,
            transition_type=TransitionType.TIME_SKIP,
            time_gap="two hours later",
            location_change=True,
            pov_change=False,
            transition_text="The sun had set by the time...",
        )

        assert transition.from_scene == 2
        assert transition.to_scene == 3
        assert transition.transition_type == TransitionType.TIME_SKIP
        assert transition.time_gap == "two hours later"
        assert transition.location_change is True
        assert transition.pov_change is False
        assert transition.transition_text is not None


class TestChapterBreakdown:
    """Tests for ChapterBreakdown dataclass."""

    def test_default_breakdown(self):
        """Test default breakdown creation."""
        breakdown = ChapterBreakdown(chapter_number=1)

        assert breakdown.chapter_number == 1
        assert breakdown.chapter_title is None
        assert breakdown.scenes == []
        assert breakdown.transitions == []
        assert breakdown.total_estimated_words == 0
        assert breakdown.primary_pov is None
        assert breakdown.chapter_arc is None

    def test_breakdown_with_scenes(self):
        """Test breakdown with scenes and transitions."""
        scenes = [
            SceneContext(scene_number=1),
            SceneContext(scene_number=2),
        ]
        transitions = [SceneTransition(from_scene=1, to_scene=2)]

        breakdown = ChapterBreakdown(
            chapter_number=5,
            chapter_title="The Confrontation",
            scenes=scenes,
            transitions=transitions,
            total_estimated_words=1500,
            primary_pov="Hero",
            chapter_arc="climax",
        )

        assert breakdown.chapter_number == 5
        assert breakdown.chapter_title == "The Confrontation"
        assert len(breakdown.scenes) == 2
        assert len(breakdown.transitions) == 1
        assert breakdown.total_estimated_words == 1500
        assert breakdown.primary_pov == "Hero"
        assert breakdown.chapter_arc == "climax"


class TestSceneBreakdownGenerator:
    """Tests for SceneBreakdownGenerator."""

    def test_default_initialization(self):
        """Test default generator initialization."""
        generator = SceneBreakdownGenerator()

        assert generator.target_scenes == 3
        assert generator.min_scene_words == 300
        assert generator.max_scene_words == 1500

    def test_custom_initialization(self):
        """Test custom generator initialization."""
        generator = SceneBreakdownGenerator(
            target_scenes_per_chapter=5,
            min_scene_words=400,
            max_scene_words=2000,
        )

        assert generator.target_scenes == 5
        assert generator.min_scene_words == 400
        assert generator.max_scene_words == 2000

    def test_generate_breakdown_basic(self):
        """Test basic breakdown generation."""
        generator = SceneBreakdownGenerator()
        breakdown = generator.generate_breakdown(
            chapter_number=1,
            chapter_outline="The hero arrives in the city and meets an ally.",
            chapter_arc="opening",
            target_word_count=2000,
        )

        assert breakdown.chapter_number == 1
        assert len(breakdown.scenes) >= 2
        assert breakdown.total_estimated_words > 0
        assert breakdown.chapter_arc == "opening"

    def test_generate_breakdown_with_characters(self):
        """Test breakdown generation with POV and characters."""
        generator = SceneBreakdownGenerator()
        breakdown = generator.generate_breakdown(
            chapter_number=3,
            chapter_outline="The heroes plan their assault.",
            chapter_arc="rising_action",
            target_word_count=3000,
            pov_character="John",
            characters=["John", "Mary", "Bob"],
        )

        assert breakdown.primary_pov == "John"
        for scene in breakdown.scenes:
            assert scene.pov_character == "John"
            assert "John" in scene.characters_present
            assert "Mary" in scene.characters_present
            assert "Bob" in scene.characters_present

    def test_generate_breakdown_creates_transitions(self):
        """Test that transitions are generated between scenes."""
        generator = SceneBreakdownGenerator()
        breakdown = generator.generate_breakdown(
            chapter_number=1,
            chapter_outline="Multiple events occur.",
            chapter_arc="midpoint",
            target_word_count=3000,
        )

        # Should have one fewer transition than scenes
        assert len(breakdown.transitions) == len(breakdown.scenes) - 1

        # Check transition scene references
        for i, transition in enumerate(breakdown.transitions):
            assert transition.from_scene == i + 1
            assert transition.to_scene == i + 2

    def test_scene_count_scales_with_word_count(self):
        """Test that scene count scales appropriately with word count."""
        generator = SceneBreakdownGenerator()

        short_breakdown = generator.generate_breakdown(
            chapter_number=1,
            chapter_outline="Short chapter.",
            target_word_count=800,
        )

        long_breakdown = generator.generate_breakdown(
            chapter_number=2,
            chapter_outline="Long chapter.",
            target_word_count=4000,
        )

        assert len(short_breakdown.scenes) <= len(long_breakdown.scenes)

    def test_all_chapter_arcs(self):
        """Test that all chapter arc types work."""
        generator = SceneBreakdownGenerator()
        arcs = [
            "opening",
            "rising_action",
            "midpoint",
            "escalation",
            "climax",
            "falling_action",
            "resolution",
        ]

        for arc in arcs:
            breakdown = generator.generate_breakdown(
                chapter_number=1,
                chapter_outline="Test chapter.",
                chapter_arc=arc,
            )
            assert breakdown.chapter_arc == arc
            assert len(breakdown.scenes) >= 2

    def test_tension_curves(self):
        """Test that tension curves are appropriate for arcs."""
        generator = SceneBreakdownGenerator()

        # Climax should have higher tension
        climax = generator.generate_breakdown(
            chapter_number=1,
            chapter_outline="The climax.",
            chapter_arc="climax",
            target_word_count=2000,
        )

        # Opening should have lower tension
        opening = generator.generate_breakdown(
            chapter_number=1,
            chapter_outline="The opening.",
            chapter_arc="opening",
            target_word_count=2000,
        )

        climax_avg_tension = sum(s.tension_level for s in climax.scenes) / len(climax.scenes)
        opening_avg_tension = sum(s.tension_level for s in opening.scenes) / len(opening.scenes)

        assert climax_avg_tension > opening_avg_tension

    def test_scene_hooks_continuity(self):
        """Test that scenes have continuity hooks."""
        generator = SceneBreakdownGenerator()
        breakdown = generator.generate_breakdown(
            chapter_number=1,
            chapter_outline="Multi-scene chapter.",
            target_word_count=3000,
        )

        if len(breakdown.scenes) > 1:
            # First scene should have setup_for_next
            assert breakdown.scenes[0].setup_for_next is not None

            # Middle scenes should have both
            for scene in breakdown.scenes[1:-1]:
                assert scene.hooks_from_previous is not None
                assert scene.setup_for_next is not None

            # Last scene should have hooks_from_previous
            assert breakdown.scenes[-1].hooks_from_previous is not None

    def test_pacing_matches_scene_type(self):
        """Test that scene pacing matches scene type."""
        # Pacing is assigned based on scene type
        generator = SceneBreakdownGenerator()
        breakdown = generator.generate_breakdown(
            chapter_number=1,
            chapter_outline="Action-heavy chapter.",
            chapter_arc="climax",
            target_word_count=2000,
        )

        for scene in breakdown.scenes:
            if scene.scene_type == SceneType.ACTION:
                assert scene.pacing == PacingIntensity.FAST
            elif scene.scene_type == SceneType.CLIMACTIC:
                assert scene.pacing == PacingIntensity.INTENSE
            elif scene.scene_type in [SceneType.EXPOSITION, SceneType.INTROSPECTION]:
                assert scene.pacing == PacingIntensity.SLOW


class TestSceneGenerator:
    """Tests for SceneGenerator."""

    def test_pov_management(self):
        """Test POV character management."""
        generator = SceneGenerator()

        assert generator.get_pov() is None

        generator.set_pov("Alice")
        assert generator.get_pov() == "Alice"

        generator.set_pov("Bob")
        assert generator.get_pov() == "Bob"

    def test_validate_pov_consistency_no_issues(self):
        """Test POV validation with consistent POV."""
        generator = SceneGenerator()
        scenes = [
            SceneContext(scene_number=1, pov_character="Alice"),
            SceneContext(scene_number=2, pov_character="Alice"),
            SceneContext(scene_number=3, pov_character="Alice"),
        ]

        warnings = generator.validate_pov_consistency(scenes)
        assert len(warnings) == 0

    def test_validate_pov_consistency_with_switch(self):
        """Test POV validation with unexpected POV switch."""
        generator = SceneGenerator()
        scenes = [
            SceneContext(scene_number=1, pov_character="Alice"),
            SceneContext(scene_number=2, pov_character="Bob", scene_type=SceneType.DIALOGUE),
            SceneContext(scene_number=3, pov_character="Alice"),
        ]

        warnings = generator.validate_pov_consistency(scenes)
        # Only scene 2 differs from primary POV (scene 1's POV)
        assert len(warnings) == 1
        assert "Scene 2" in warnings[0]
        assert "Bob" in warnings[0]

    def test_validate_pov_consistency_transition_allowed(self):
        """Test POV validation allows switches in transition scenes."""
        generator = SceneGenerator()
        scenes = [
            SceneContext(scene_number=1, pov_character="Alice"),
            SceneContext(scene_number=2, pov_character="Bob", scene_type=SceneType.TRANSITION),
        ]

        warnings = generator.validate_pov_consistency(scenes)
        # Transition scenes are allowed to switch POV
        assert len(warnings) == 0

    def test_validate_pov_consistency_empty(self):
        """Test POV validation with empty scene list."""
        generator = SceneGenerator()
        warnings = generator.validate_pov_consistency([])
        assert len(warnings) == 0

    def test_get_scene_prompt_basic(self):
        """Test basic scene prompt generation."""
        generator = SceneGenerator()
        scene = SceneContext(
            scene_number=1,
            scene_type=SceneType.ACTION,
            pov_character="Hero",
            pacing=PacingIntensity.FAST,
            tension_level=0.7,
        )

        prompt = generator.get_scene_prompt(scene)

        assert "SCENE 1" in prompt
        assert "action" in prompt.lower()
        assert "Hero" in prompt
        assert "fast" in prompt.lower()
        assert "70%" in prompt

    def test_get_scene_prompt_with_all_fields(self):
        """Test scene prompt with all fields populated."""
        generator = SceneGenerator()
        scene = SceneContext(
            scene_number=2,
            scene_type=SceneType.DIALOGUE,
            pov_character="Alice",
            location="Coffee shop",
            time_of_day="morning",
            characters_present=["Alice", "Bob"],
            objectives=["Share the secret", "Build trust"],
            emotional_beat="Nervous anticipation",
            tension_level=0.5,
            pacing=PacingIntensity.MODERATE,
            hooks_from_previous="After leaving the office",
            setup_for_next="The phone rings",
            estimated_word_count=600,
        )

        prompt = generator.get_scene_prompt(scene)

        assert "SCENE 2" in prompt
        assert "dialogue" in prompt.lower()
        assert "Alice" in prompt
        assert "Coffee shop" in prompt
        assert "morning" in prompt
        assert "Bob" in prompt
        assert "Share the secret" in prompt
        assert "Build trust" in prompt
        assert "Nervous anticipation" in prompt
        assert "After leaving the office" in prompt
        assert "The phone rings" in prompt
        assert "600 words" in prompt

    def test_get_scene_prompt_with_style(self):
        """Test scene prompt with style guidance."""
        generator = SceneGenerator()
        scene = SceneContext(scene_number=1)
        style_prompt = "Write in third person limited. Use sparse prose."

        prompt = generator.get_scene_prompt(scene, style_prompt=style_prompt)

        assert "STYLE GUIDANCE" in prompt
        assert "third person limited" in prompt
        assert "sparse prose" in prompt

    def test_get_transition_text(self):
        """Test transition text generation."""
        generator = SceneGenerator()

        # Test different transition types
        cut_transition = SceneTransition(
            from_scene=1, to_scene=2, transition_type=TransitionType.CUT
        )
        assert generator.get_transition_text(cut_transition) == ""

        dissolve_transition = SceneTransition(
            from_scene=1, to_scene=2, transition_type=TransitionType.DISSOLVE
        )
        assert generator.get_transition_text(dissolve_transition) == "..."

        bridge_transition = SceneTransition(
            from_scene=1, to_scene=2, transition_type=TransitionType.BRIDGE
        )
        assert generator.get_transition_text(bridge_transition) == "Meanwhile, "

        pov_transition = SceneTransition(
            from_scene=1, to_scene=2, transition_type=TransitionType.POV_SWITCH
        )
        assert "* * *" in generator.get_transition_text(pov_transition)

    def test_get_transition_text_with_time_gap(self):
        """Test transition text with time gap."""
        generator = SceneGenerator()
        transition = SceneTransition(
            from_scene=1,
            to_scene=2,
            transition_type=TransitionType.TIME_SKIP,
            time_gap="three days later",
        )

        text = generator.get_transition_text(transition)
        assert "three days later" in text

    def test_scene_history(self):
        """Test scene history tracking."""
        generator = SceneGenerator()

        assert len(generator.get_history()) == 0

        scene1 = SceneContext(scene_number=1)
        scene2 = SceneContext(scene_number=2)

        generator.add_to_history(scene1)
        assert len(generator.get_history()) == 1

        generator.add_to_history(scene2)
        assert len(generator.get_history()) == 2

        generator.clear_history()
        assert len(generator.get_history()) == 0

    def test_history_returns_copy(self):
        """Test that get_history returns a copy."""
        generator = SceneGenerator()
        scene = SceneContext(scene_number=1)
        generator.add_to_history(scene)

        history = generator.get_history()
        history.append(SceneContext(scene_number=99))

        assert len(generator.get_history()) == 1


class TestCreateSceneBreakdown:
    """Tests for create_scene_breakdown factory function."""

    def test_creates_breakdown(self):
        """Test that factory function creates breakdown."""
        breakdown = create_scene_breakdown(
            chapter_number=1,
            chapter_outline="The hero begins the journey.",
        )

        assert isinstance(breakdown, ChapterBreakdown)
        assert breakdown.chapter_number == 1
        assert len(breakdown.scenes) >= 2

    def test_with_all_parameters(self):
        """Test factory function with all parameters."""
        breakdown = create_scene_breakdown(
            chapter_number=5,
            chapter_outline="The confrontation.",
            chapter_arc="climax",
            target_word_count=4000,
            pov_character="Hero",
            characters=["Hero", "Villain", "Ally"],
        )

        assert breakdown.chapter_number == 5
        assert breakdown.chapter_arc == "climax"
        assert breakdown.primary_pov == "Hero"

    def test_default_arc(self):
        """Test that default arc is rising_action."""
        breakdown = create_scene_breakdown(
            chapter_number=1,
            chapter_outline="Test chapter.",
        )

        assert breakdown.chapter_arc == "rising_action"


class TestIntegration:
    """Integration tests for scene generation."""

    def test_full_workflow(self):
        """Test a complete scene generation workflow."""
        # Generate breakdown
        breakdown = create_scene_breakdown(
            chapter_number=3,
            chapter_outline="The heroes discover the villain's weakness.",
            chapter_arc="midpoint",
            target_word_count=3000,
            pov_character="Alice",
            characters=["Alice", "Bob", "Charlie"],
        )

        # Validate POV consistency
        generator = SceneGenerator()
        warnings = generator.validate_pov_consistency(breakdown.scenes)

        # Generate prompts for each scene
        prompts = []
        style_prompt = "Write in third person limited with lyrical prose."
        for scene in breakdown.scenes:
            prompt = generator.get_scene_prompt(scene, style_prompt)
            prompts.append(prompt)
            generator.add_to_history(scene)

        # Verify results
        assert len(breakdown.scenes) >= 2
        assert len(breakdown.transitions) == len(breakdown.scenes) - 1
        assert len(warnings) == 0  # No POV consistency issues
        assert len(prompts) == len(breakdown.scenes)
        assert len(generator.get_history()) == len(breakdown.scenes)

    def test_transition_recommendations(self):
        """Test that transitions are recommended appropriately."""
        breakdown = create_scene_breakdown(
            chapter_number=1,
            chapter_outline="Various scene types.",
            target_word_count=4000,
        )

        # All transitions should have valid types
        for transition in breakdown.transitions:
            assert transition.transition_type in TransitionType
            assert transition.from_scene < transition.to_scene
