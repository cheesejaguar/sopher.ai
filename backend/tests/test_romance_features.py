"""Tests for romance-specific features."""

from uuid import uuid4

from app.agents.genres.romance import (
    TROPE_GUIDANCE,
    CharacterChemistry,
    EmotionalBeat,
    EmotionalBeatPlanner,
    HeatLevel,
    HeatLevelController,
    RelationshipArc,
    RelationshipStage,
    RelationshipState,
    RelationshipTracker,
    RomanceService,
    RomanceTrope,
    TropeManager,
)


class TestEnums:
    """Tests for enum classes."""

    def test_heat_level_values(self):
        """Test HeatLevel enum values."""
        assert HeatLevel.SWEET.value == "sweet"
        assert HeatLevel.STEAMY.value == "steamy"
        assert HeatLevel.EROTIC.value == "erotic"

    def test_relationship_stage_values(self):
        """Test RelationshipStage enum values."""
        assert RelationshipStage.STRANGERS.value == "strangers"
        assert RelationshipStage.FIRST_KISS.value == "first_kiss"
        assert RelationshipStage.HEA.value == "hea"

    def test_romance_trope_values(self):
        """Test RomanceTrope enum values."""
        assert RomanceTrope.ENEMIES_TO_LOVERS.value == "enemies_to_lovers"
        assert RomanceTrope.GRUMPY_SUNSHINE.value == "grumpy_sunshine"
        assert RomanceTrope.ONE_BED.value == "one_bed"

    def test_emotional_beat_values(self):
        """Test EmotionalBeat enum values."""
        assert EmotionalBeat.MEET_CUTE.value == "meet_cute"
        assert EmotionalBeat.DECLARATION.value == "declaration"


class TestDataclasses:
    """Tests for dataclasses."""

    def test_character_chemistry_defaults(self):
        """Test CharacterChemistry default values."""
        chemistry = CharacterChemistry()
        assert chemistry.character_a == ""
        assert chemistry.attraction_type == "physical_and_emotional"
        assert chemistry.shared_interests == []

    def test_relationship_state_defaults(self):
        """Test RelationshipState default values."""
        state = RelationshipState()
        assert state.stage == RelationshipStage.STRANGERS
        assert state.trust_level == 0.0
        assert state.notes == ""

    def test_relationship_arc_defaults(self):
        """Test RelationshipArc default values."""
        arc = RelationshipArc()
        assert arc.character_a == ""
        assert arc.heat_level == HeatLevel.SENSUAL
        assert arc.tropes == []

    def test_relationship_arc_custom(self):
        """Test RelationshipArc with custom values."""
        arc = RelationshipArc(
            character_a="Jane",
            character_b="John",
            tropes=[RomanceTrope.ENEMIES_TO_LOVERS],
            heat_level=HeatLevel.STEAMY,
        )
        assert arc.character_a == "Jane"
        assert RomanceTrope.ENEMIES_TO_LOVERS in arc.tropes


class TestTropeGuidance:
    """Tests for trope guidance library."""

    def test_enemies_to_lovers_guidance(self):
        """Test enemies to lovers guidance exists."""
        guidance = TROPE_GUIDANCE.get(RomanceTrope.ENEMIES_TO_LOVERS)
        assert guidance is not None
        assert guidance.trope == RomanceTrope.ENEMIES_TO_LOVERS
        assert len(guidance.key_elements) > 0
        assert len(guidance.pitfalls_to_avoid) > 0

    def test_friends_to_lovers_guidance(self):
        """Test friends to lovers guidance."""
        guidance = TROPE_GUIDANCE.get(RomanceTrope.FRIENDS_TO_LOVERS)
        assert guidance is not None
        assert "friends" in guidance.description.lower()

    def test_fake_relationship_guidance(self):
        """Test fake relationship guidance."""
        guidance = TROPE_GUIDANCE.get(RomanceTrope.FAKE_RELATIONSHIP)
        assert guidance is not None
        assert "pretend" in guidance.description.lower()

    def test_slow_burn_guidance(self):
        """Test slow burn guidance."""
        guidance = TROPE_GUIDANCE.get(RomanceTrope.SLOW_BURN)
        assert guidance is not None
        assert "gradually" in guidance.description.lower()


class TestRelationshipTracker:
    """Tests for RelationshipTracker."""

    def test_create_arc(self):
        """Test creating a relationship arc."""
        tracker = RelationshipTracker()
        arc = tracker.create_arc(
            character_a="Jane",
            character_b="John",
            tropes=[RomanceTrope.ENEMIES_TO_LOVERS],
            heat_level=HeatLevel.STEAMY,
        )

        assert arc.character_a == "Jane"
        assert arc.character_b == "John"
        assert arc.heat_level == HeatLevel.STEAMY

    def test_get_arc(self):
        """Test getting a relationship arc."""
        tracker = RelationshipTracker()
        created = tracker.create_arc("Jane", "John")
        retrieved = tracker.get_arc(created.id)

        assert retrieved is not None
        assert retrieved.character_a == "Jane"

    def test_get_nonexistent_arc(self):
        """Test getting nonexistent arc."""
        tracker = RelationshipTracker()
        result = tracker.get_arc(uuid4())
        assert result is None

    def test_list_arcs(self):
        """Test listing arcs."""
        tracker = RelationshipTracker()
        tracker.create_arc("Jane", "John")
        tracker.create_arc("Alice", "Bob")

        arcs = tracker.list_arcs()
        assert len(arcs) == 2

    def test_update_state(self):
        """Test updating relationship state."""
        tracker = RelationshipTracker()
        arc = tracker.create_arc("Jane", "John")

        state = tracker.update_state(
            arc.id,
            chapter_number=1,
            stage=RelationshipStage.FIRST_MEETING,
            attraction_level=0.3,
        )

        assert state is not None
        assert state.stage == RelationshipStage.FIRST_MEETING
        assert state.attraction_level == 0.3

    def test_update_state_preserves_previous(self):
        """Test that update state preserves previous values."""
        tracker = RelationshipTracker()
        arc = tracker.create_arc("Jane", "John")

        tracker.update_state(
            arc.id,
            chapter_number=1,
            trust_level=0.5,
            attraction_level=0.6,
        )

        # Update only trust level
        state = tracker.update_state(
            arc.id,
            chapter_number=2,
            trust_level=0.7,
        )

        # Attraction should be preserved
        assert state.trust_level == 0.7
        assert state.attraction_level == 0.6

    def test_get_current_state(self):
        """Test getting current state."""
        tracker = RelationshipTracker()
        arc = tracker.create_arc("Jane", "John")

        tracker.update_state(arc.id, chapter_number=1, trust_level=0.3)
        tracker.update_state(arc.id, chapter_number=2, trust_level=0.5)

        current = tracker.get_current_state(arc.id)
        assert current.chapter_number == 2
        assert current.trust_level == 0.5

    def test_get_state_at_chapter(self):
        """Test getting state at specific chapter."""
        tracker = RelationshipTracker()
        arc = tracker.create_arc("Jane", "John")

        tracker.update_state(arc.id, chapter_number=1, trust_level=0.3)
        tracker.update_state(arc.id, chapter_number=3, trust_level=0.5)
        tracker.update_state(arc.id, chapter_number=5, trust_level=0.8)

        # Chapter 2 should return state from chapter 1
        state = tracker.get_state_at_chapter(arc.id, chapter=2)
        assert state.chapter_number == 1

        # Chapter 4 should return state from chapter 3
        state = tracker.get_state_at_chapter(arc.id, chapter=4)
        assert state.chapter_number == 3


class TestHeatLevelController:
    """Tests for HeatLevelController."""

    def test_get_guidance_sweet(self):
        """Test getting guidance for sweet heat level."""
        controller = HeatLevelController()
        guidance = controller.get_guidance(HeatLevel.SWEET)

        assert "description" in guidance
        assert "allowed" in guidance
        assert "avoid" in guidance
        assert "Hand-holding" in guidance["allowed"]

    def test_get_guidance_steamy(self):
        """Test getting guidance for steamy heat level."""
        controller = HeatLevelController()
        guidance = controller.get_guidance(HeatLevel.STEAMY)

        assert "explicit" in guidance["description"].lower()

    def test_get_prompt(self):
        """Test getting prompt for heat level."""
        controller = HeatLevelController()

        sweet_prompt = controller.get_prompt(HeatLevel.SWEET)
        assert "clean" in sweet_prompt.lower()

        steamy_prompt = controller.get_prompt(HeatLevel.STEAMY)
        assert "explicit" in steamy_prompt.lower()

    def test_is_allowed_sweet(self):
        """Test content allowance for sweet level."""
        controller = HeatLevelController()

        # Hand-holding should be allowed
        assert controller.is_allowed(HeatLevel.SWEET, "hand-holding")

        # Explicit content should not be allowed
        assert not controller.is_allowed(HeatLevel.SWEET, "explicit physical descriptions")

    def test_is_allowed_steamy(self):
        """Test content allowance for steamy level."""
        controller = HeatLevelController()

        assert controller.is_allowed(HeatLevel.STEAMY, "intimate scenes")
        assert controller.is_allowed(HeatLevel.STEAMY, "sensual descriptions")


class TestTropeManager:
    """Tests for TropeManager."""

    def test_get_guidance(self):
        """Test getting trope guidance."""
        manager = TropeManager()
        guidance = manager.get_guidance(RomanceTrope.ENEMIES_TO_LOVERS)

        assert guidance is not None
        assert guidance.trope == RomanceTrope.ENEMIES_TO_LOVERS

    def test_get_all_tropes(self):
        """Test getting all tropes."""
        manager = TropeManager()
        tropes = manager.get_all_tropes()

        assert len(tropes) > 20
        assert RomanceTrope.ENEMIES_TO_LOVERS in tropes

    def test_get_tropes_by_category(self):
        """Test getting tropes by category."""
        manager = TropeManager()

        setup_tropes = manager.get_tropes_by_category("setup")
        assert RomanceTrope.ENEMIES_TO_LOVERS in setup_tropes

        situation_tropes = manager.get_tropes_by_category("situation")
        assert RomanceTrope.FAKE_RELATIONSHIP in situation_tropes

    def test_get_compatible_tropes(self):
        """Test getting compatible tropes."""
        manager = TropeManager()

        compatible = manager.get_compatible_tropes(RomanceTrope.ENEMIES_TO_LOVERS)
        assert RomanceTrope.FORCED_PROXIMITY in compatible

    def test_generate_trope_prompt(self):
        """Test generating trope prompt."""
        manager = TropeManager()

        prompt = manager.generate_trope_prompt([RomanceTrope.ENEMIES_TO_LOVERS])
        assert "Enemies To Lovers" in prompt
        assert "Avoid:" in prompt

    def test_generate_trope_prompt_multiple(self):
        """Test generating prompt for multiple tropes."""
        manager = TropeManager()

        prompt = manager.generate_trope_prompt(
            [
                RomanceTrope.ENEMIES_TO_LOVERS,
                RomanceTrope.SLOW_BURN,
            ]
        )
        assert "Enemies To Lovers" in prompt
        assert "Slow Burn" in prompt

    def test_generate_trope_prompt_empty(self):
        """Test generating prompt with no tropes."""
        manager = TropeManager()
        prompt = manager.generate_trope_prompt([])
        assert prompt == ""


class TestEmotionalBeatPlanner:
    """Tests for EmotionalBeatPlanner."""

    def test_get_beats_for_stage(self):
        """Test getting beats for a stage."""
        planner = EmotionalBeatPlanner()

        beats = planner.get_beats_for_stage(RelationshipStage.FIRST_MEETING)
        assert EmotionalBeat.MEET_CUTE in beats

    def test_plan_beats_short_story(self):
        """Test planning beats for short story."""
        planner = EmotionalBeatPlanner()

        planned = planner.plan_beats(total_chapters=3)

        assert 1 in planned
        assert EmotionalBeat.MEET_CUTE in planned[1]
        assert 3 in planned
        assert EmotionalBeat.RESOLUTION in planned[3]

    def test_plan_beats_full_novel(self):
        """Test planning beats for full novel."""
        planner = EmotionalBeatPlanner()

        planned = planner.plan_beats(total_chapters=20)

        # Should have meet cute early
        assert EmotionalBeat.MEET_CUTE in planned.get(1, [])
        # Should have resolution at end
        assert EmotionalBeat.RESOLUTION in planned.get(20, [])

    def test_plan_beats_steamy_includes_physical(self):
        """Test that steamy heat level includes physical intimacy."""
        planner = EmotionalBeatPlanner()

        planned = planner.plan_beats(total_chapters=20, heat_level=HeatLevel.STEAMY)

        # Should include physical intimacy beat
        all_beats = []
        for beats in planned.values():
            all_beats.extend(beats)
        assert EmotionalBeat.PHYSICAL_INTIMACY in all_beats

    def test_get_beat_guidance(self):
        """Test getting beat guidance."""
        planner = EmotionalBeatPlanner()

        guidance = planner.get_beat_guidance(EmotionalBeat.MEET_CUTE)
        assert "memorable" in guidance.lower()

        guidance = planner.get_beat_guidance(EmotionalBeat.DECLARATION)
        assert "love" in guidance.lower()


class TestRomanceService:
    """Tests for RomanceService."""

    def test_create_relationship(self):
        """Test creating a relationship."""
        service = RomanceService()

        arc = service.create_relationship(
            character_a="Jane",
            character_b="John",
            tropes=[RomanceTrope.ENEMIES_TO_LOVERS],
            heat_level=HeatLevel.SENSUAL,
        )

        assert arc.character_a == "Jane"
        assert arc.heat_level == HeatLevel.SENSUAL

    def test_get_relationship(self):
        """Test getting a relationship."""
        service = RomanceService()
        created = service.create_relationship("Jane", "John")
        retrieved = service.get_relationship(created.id)

        assert retrieved is not None
        assert retrieved.id == created.id

    def test_update_relationship(self):
        """Test updating a relationship."""
        service = RomanceService()
        arc = service.create_relationship("Jane", "John")

        state = service.update_relationship(
            arc.id,
            chapter_number=1,
            stage=RelationshipStage.FIRST_MEETING,
            attraction_level=0.4,
        )

        assert state is not None
        assert state.attraction_level == 0.4

    def test_generate_chapter_prompt(self):
        """Test generating chapter prompt."""
        service = RomanceService()

        arc = service.create_relationship(
            "Jane",
            "John",
            tropes=[RomanceTrope.ENEMIES_TO_LOVERS],
            heat_level=HeatLevel.SENSUAL,
        )

        prompt = service.generate_chapter_prompt(arc.id, chapter_number=1, total_chapters=20)

        assert len(prompt) > 0
        assert "Heat Level" in prompt

    def test_generate_chapter_prompt_with_state(self):
        """Test chapter prompt includes relationship state."""
        service = RomanceService()

        arc = service.create_relationship("Jane", "John")
        service.update_relationship(
            arc.id,
            chapter_number=1,
            stage=RelationshipStage.ATTRACTION,
            trust_level=0.5,
        )

        prompt = service.generate_chapter_prompt(arc.id, chapter_number=2, total_chapters=10)

        assert "Relationship State" in prompt
        assert "attraction" in prompt.lower()

    def test_get_trope_guidance(self):
        """Test getting trope guidance through service."""
        service = RomanceService()
        guidance = service.get_trope_guidance(RomanceTrope.SLOW_BURN)

        assert guidance is not None
        assert guidance.trope == RomanceTrope.SLOW_BURN

    def test_get_compatible_tropes(self):
        """Test getting compatible tropes through service."""
        service = RomanceService()
        compatible = service.get_compatible_tropes(RomanceTrope.ENEMIES_TO_LOVERS)

        assert RomanceTrope.FORCED_PROXIMITY in compatible

    def test_is_content_appropriate(self):
        """Test content appropriateness check."""
        service = RomanceService()

        arc_sweet = service.create_relationship(
            "Jane",
            "John",
            heat_level=HeatLevel.SWEET,
        )

        # Explicit content not appropriate for sweet
        assert not service.is_content_appropriate(arc_sweet.id, "explicit physical descriptions")

        # Hand-holding is appropriate
        assert service.is_content_appropriate(arc_sweet.id, "hand-holding")


class TestIntegration:
    """Integration tests for romance features."""

    def test_full_relationship_arc(self):
        """Test complete relationship arc workflow."""
        service = RomanceService()

        # Create relationship
        arc = service.create_relationship(
            character_a="Emma",
            character_b="Oliver",
            tropes=[RomanceTrope.ENEMIES_TO_LOVERS, RomanceTrope.SLOW_BURN],
            heat_level=HeatLevel.SENSUAL,
            ending_type="hea",
        )

        # Track across chapters
        service.update_relationship(
            arc.id,
            chapter_number=1,
            stage=RelationshipStage.FIRST_MEETING,
            attraction_level=0.2,
            trust_level=0.0,
        )

        service.update_relationship(
            arc.id,
            chapter_number=5,
            stage=RelationshipStage.TENSION,
            attraction_level=0.6,
            trust_level=0.3,
        )

        service.update_relationship(
            arc.id,
            chapter_number=15,
            stage=RelationshipStage.BLACK_MOMENT,
            attraction_level=0.9,
            trust_level=0.4,
            conflict_level=0.8,
        )

        service.update_relationship(
            arc.id,
            chapter_number=20,
            stage=RelationshipStage.HEA,
            attraction_level=1.0,
            trust_level=0.9,
            conflict_level=0.1,
        )

        # Verify final state
        final = service.get_relationship(arc.id)
        assert final is not None
        assert len(final.states) == 4
        assert final.states[-1].stage == RelationshipStage.HEA

    def test_generate_prompts_across_story(self):
        """Test generating prompts across the story."""
        service = RomanceService()

        arc = service.create_relationship(
            "Jane",
            "John",
            tropes=[RomanceTrope.FAKE_RELATIONSHIP],
            heat_level=HeatLevel.WARM,
        )

        # Generate prompts for different chapters
        chapter1 = service.generate_chapter_prompt(arc.id, 1, 10)
        chapter5 = service.generate_chapter_prompt(arc.id, 5, 10)
        chapter10 = service.generate_chapter_prompt(arc.id, 10, 10)

        # All should have content
        assert len(chapter1) > 0
        assert len(chapter5) > 0
        assert len(chapter10) > 0


class TestEdgeCases:
    """Tests for edge cases."""

    def test_update_nonexistent_arc(self):
        """Test updating nonexistent arc."""
        service = RomanceService()
        result = service.update_relationship(uuid4(), 1, stage=RelationshipStage.ATTRACTION)
        assert result is None

    def test_generate_prompt_nonexistent_arc(self):
        """Test generating prompt for nonexistent arc."""
        service = RomanceService()
        prompt = service.generate_chapter_prompt(uuid4(), 1, 10)
        assert prompt == ""

    def test_empty_arc_current_state(self):
        """Test getting current state of arc with no updates."""
        tracker = RelationshipTracker()
        arc = tracker.create_arc("Jane", "John")
        state = tracker.get_current_state(arc.id)
        assert state is None

    def test_get_state_before_any_updates(self):
        """Test getting state at chapter before any updates."""
        tracker = RelationshipTracker()
        arc = tracker.create_arc("Jane", "John")
        tracker.update_state(arc.id, chapter_number=5, trust_level=0.5)

        state = tracker.get_state_at_chapter(arc.id, chapter=2)
        assert state is None

    def test_is_content_appropriate_nonexistent_arc(self):
        """Test content check for nonexistent arc."""
        service = RomanceService()
        # Should default to allowed
        assert service.is_content_appropriate(uuid4(), "anything")


class TestTropeDetails:
    """Test specific trope implementation details."""

    def test_one_bed_trope_has_conflict_sources(self):
        """Test one bed trope has proper structure."""
        guidance = TROPE_GUIDANCE.get(RomanceTrope.ONE_BED)
        assert guidance is not None
        assert len(guidance.conflict_sources) > 0
        assert len(guidance.resolution_approaches) > 0

    def test_grumpy_sunshine_has_key_elements(self):
        """Test grumpy sunshine trope has key elements."""
        guidance = TROPE_GUIDANCE.get(RomanceTrope.GRUMPY_SUNSHINE)
        assert guidance is not None
        assert "grumpy" in guidance.description.lower()
        assert any("soft" in elem.lower() for elem in guidance.key_elements)

    def test_all_documented_tropes_have_guidance(self):
        """Test all documented tropes have guidance."""
        documented = [
            RomanceTrope.ENEMIES_TO_LOVERS,
            RomanceTrope.FRIENDS_TO_LOVERS,
            RomanceTrope.SECOND_CHANCE,
            RomanceTrope.FAKE_RELATIONSHIP,
            RomanceTrope.FORCED_PROXIMITY,
            RomanceTrope.GRUMPY_SUNSHINE,
            RomanceTrope.SLOW_BURN,
            RomanceTrope.ONE_BED,
        ]
        for trope in documented:
            assert trope in TROPE_GUIDANCE, f"{trope} missing from guidance"
