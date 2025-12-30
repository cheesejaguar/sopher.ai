"""Tests for chapter generation service.

Tests cover:
- ChapterContext and ChapterContextBuilder
- StyleEnforcer for consistent writing
- PacingController for story structure
- ChapterService for generation operations
"""

from app.schemas import ChapterDraftRequest
from app.services.chapter_service import (
    ChapterContext,
    ChapterContextBuilder,
    ChapterService,
    CharacterState,
    PacingController,
    StyleEnforcer,
    create_chapter_service,
)


class TestCharacterState:
    """Tests for CharacterState dataclass."""

    def test_basic_character_state(self):
        """Test creating a basic character state."""
        state = CharacterState(name="John")
        assert state.name == "John"
        assert state.location is None
        assert state.emotional_state is None
        assert state.knowledge == []
        assert state.relationships == {}

    def test_full_character_state(self):
        """Test character state with all fields."""
        state = CharacterState(
            name="Sarah",
            location="Library",
            emotional_state="anxious",
            knowledge=["Knows the secret", "Has the map"],
            relationships={"John": "friend", "Victor": "enemy"},
            last_appearance_chapter=5,
        )

        assert state.name == "Sarah"
        assert state.location == "Library"
        assert state.emotional_state == "anxious"
        assert len(state.knowledge) == 2
        assert state.relationships["John"] == "friend"
        assert state.last_appearance_chapter == 5


class TestChapterContext:
    """Tests for ChapterContext dataclass."""

    def test_minimal_context(self):
        """Test minimal chapter context."""
        context = ChapterContext(
            chapter_number=1,
            outline="Chapter 1 outline here",
        )

        assert context.chapter_number == 1
        assert context.outline == "Chapter 1 outline here"
        assert context.tension_level == 0.5  # Default

    def test_full_context(self):
        """Test chapter context with all fields."""
        context = ChapterContext(
            chapter_number=5,
            outline="Chapter 5 outline",
            style_guide="Third person, past tense",
            character_bible={"hero": {"name": "John"}},
            previous_summary="Summary of chapters 1-4",
            character_states={"John": CharacterState(name="John")},
            tension_level=0.8,
            pacing_notes="Build to climax",
            hooks_from_previous="The door creaked open...",
        )

        assert context.chapter_number == 5
        assert context.tension_level == 0.8
        assert "John" in context.character_states


class TestChapterContextBuilder:
    """Tests for ChapterContextBuilder."""

    def test_basic_builder(self):
        """Test basic context building."""
        builder = ChapterContextBuilder(
            chapter_number=1,
            outline="Chapter 1 begins the story",
        )
        context = builder.build()

        assert context.chapter_number == 1
        assert context.outline == "Chapter 1 begins the story"

    def test_builder_with_previous_chapters(self):
        """Test building context with previous chapters."""
        builder = ChapterContextBuilder(
            chapter_number=3,
            outline="Chapter 3 outline",
        )
        builder.with_previous_chapters(
            [
                "Chapter 1 content here...",
                "Chapter 2 content here...",
            ]
        )
        context = builder.build()

        assert context.previous_summary is not None
        assert "Chapter" in context.previous_summary

    def test_builder_with_character_state(self):
        """Test building context with character states."""
        builder = ChapterContextBuilder(
            chapter_number=2,
            outline="Chapter 2 outline",
        )
        builder.with_character_state(
            "John", CharacterState(name="John", location="Forest", emotional_state="determined")
        )
        context = builder.build()

        assert "John" in context.character_states
        assert context.character_states["John"].location == "Forest"

    def test_builder_with_tension_level(self):
        """Test tension level clamping."""
        builder = ChapterContextBuilder(chapter_number=1, outline="Outline")

        # Normal value
        builder.with_tension_level(0.7)
        context = builder.build()
        assert context.tension_level == 0.7

        # Clamped to max
        builder.with_tension_level(1.5)
        context = builder.build()
        assert context.tension_level == 1.0

        # Clamped to min
        builder.with_tension_level(-0.5)
        context = builder.build()
        assert context.tension_level == 0.0

    def test_builder_with_pacing_notes(self):
        """Test building context with pacing notes."""
        builder = ChapterContextBuilder(chapter_number=1, outline="Outline")
        builder.with_pacing_notes("Slow build, focus on atmosphere")
        context = builder.build()

        assert context.pacing_notes == "Slow build, focus on atmosphere"

    def test_builder_extracts_character_bible(self):
        """Test that builder extracts character states from bible."""
        builder = ChapterContextBuilder(
            chapter_number=1,
            outline="Outline",
            character_bible={
                "protagonist": {
                    "name": "Alice",
                    "location": "Home",
                    "emotional_state": "curious",
                }
            },
        )
        context = builder.build()

        assert "Alice" in context.character_states
        assert context.character_states["Alice"].location == "Home"

    def test_builder_extracts_previous_hook(self):
        """Test extraction of hook from previous chapter."""
        builder = ChapterContextBuilder(chapter_number=2, outline="Outline")
        builder.with_previous_chapters(
            ["Chapter content ending with an exciting hook.\n\nThe door burst open."]
        )
        context = builder.build()

        assert context.hooks_from_previous is not None
        assert "door" in context.hooks_from_previous

    def test_builder_chain_methods(self):
        """Test that builder methods can be chained."""
        context = (
            ChapterContextBuilder(chapter_number=5, outline="Outline")
            .with_previous_chapters(["Ch1", "Ch2", "Ch3", "Ch4"])
            .with_tension_level(0.8)
            .with_pacing_notes("Accelerate pace")
            .with_character_state("Hero", CharacterState(name="Hero"))
            .build()
        )

        assert context.chapter_number == 5
        assert context.tension_level == 0.8


class TestStyleEnforcer:
    """Tests for StyleEnforcer."""

    def test_default_styles(self):
        """Test default style settings."""
        enforcer = StyleEnforcer()

        assert enforcer.get_pov() == "third_person_limited"
        assert enforcer.get_tense() == "past"
        assert enforcer.get_prose_style() == "conversational"

    def test_first_person_detection(self):
        """Test first person POV detection."""
        enforcer = StyleEnforcer("Write in first person narrative")
        assert enforcer.get_pov() == "first_person"

    def test_third_person_omniscient_detection(self):
        """Test third person omniscient detection."""
        enforcer = StyleEnforcer("Use third person omniscient perspective")
        assert enforcer.get_pov() == "third_person_omniscient"

    def test_second_person_detection(self):
        """Test second person detection."""
        enforcer = StyleEnforcer("Write in second person, addressing the reader directly")
        assert enforcer.get_pov() == "second_person"

    def test_present_tense_detection(self):
        """Test present tense detection."""
        enforcer = StyleEnforcer("Use present tense for immediacy")
        assert enforcer.get_tense() == "present"

    def test_lyrical_prose_detection(self):
        """Test lyrical prose style detection."""
        enforcer = StyleEnforcer("Use lyrical, poetic prose")
        assert enforcer.get_prose_style() == "lyrical"

    def test_sparse_prose_detection(self):
        """Test sparse prose style detection."""
        enforcer = StyleEnforcer("Sparse, minimalist prose please")
        assert enforcer.get_prose_style() == "sparse"

    def test_formal_prose_detection(self):
        """Test formal prose style detection."""
        enforcer = StyleEnforcer("Write in a formal literary style")
        assert enforcer.get_prose_style() == "formal"

    def test_get_style_prompt(self):
        """Test style prompt generation."""
        enforcer = StyleEnforcer("First person, present tense, lyrical")
        prompt = enforcer.get_style_prompt()

        assert "first person" in prompt.lower()
        assert "present" in prompt.lower()
        assert "lyrical" in prompt.lower()

    def test_style_prompt_includes_guide(self):
        """Test that style prompt includes original guide."""
        guide = "Write like Hemingway with sparse prose"
        enforcer = StyleEnforcer(guide)
        prompt = enforcer.get_style_prompt()

        assert guide in prompt


class TestPacingController:
    """Tests for PacingController."""

    def test_story_position_calculation(self):
        """Test story position calculation."""
        controller = PacingController(total_chapters=10, current_chapter=5)
        position = controller.get_story_position()
        # Chapter 5 of 10: (5-1)/(10-1) = 4/9 ≈ 0.44
        assert 0.4 <= position <= 0.5

    def test_story_position_first_chapter(self):
        """Test position for first chapter."""
        controller = PacingController(total_chapters=10, current_chapter=1)
        assert controller.get_story_position() == 0.0

    def test_story_position_last_chapter(self):
        """Test position for last chapter."""
        controller = PacingController(total_chapters=10, current_chapter=10)
        assert controller.get_story_position() == 1.0

    def test_pacing_profile_opening(self):
        """Test opening pacing profile."""
        controller = PacingController(total_chapters=20, current_chapter=1)
        assert controller.get_pacing_profile() == "opening"

    def test_pacing_profile_rising_action(self):
        """Test rising action pacing profile."""
        controller = PacingController(total_chapters=20, current_chapter=5)
        assert controller.get_pacing_profile() == "rising_action"

    def test_pacing_profile_midpoint(self):
        """Test midpoint pacing profile."""
        controller = PacingController(total_chapters=20, current_chapter=10)
        assert controller.get_pacing_profile() == "midpoint"

    def test_pacing_profile_escalation(self):
        """Test escalation pacing profile."""
        controller = PacingController(total_chapters=20, current_chapter=13)
        assert controller.get_pacing_profile() == "escalation"

    def test_pacing_profile_climax(self):
        """Test climax pacing profile."""
        controller = PacingController(total_chapters=20, current_chapter=17)
        assert controller.get_pacing_profile() == "climax"

    def test_pacing_profile_falling_action(self):
        """Test falling action pacing profile."""
        controller = PacingController(total_chapters=20, current_chapter=19)
        assert controller.get_pacing_profile() == "falling_action"

    def test_pacing_profile_resolution(self):
        """Test resolution pacing profile."""
        controller = PacingController(total_chapters=20, current_chapter=20)
        assert controller.get_pacing_profile() == "resolution"

    def test_tension_target_varies(self):
        """Test that tension target varies by position."""
        opening = PacingController(20, 1).get_tension_target()
        climax = PacingController(20, 17).get_tension_target()

        assert opening < climax

    def test_pacing_notes_content(self):
        """Test pacing notes content."""
        controller = PacingController(total_chapters=10, current_chapter=5)
        notes = controller.get_pacing_notes()

        assert "Chapter 5" in notes
        assert "10" in notes
        assert "%" in notes  # Tension percentage

    def test_handles_single_chapter(self):
        """Test handling of single chapter book."""
        controller = PacingController(total_chapters=1, current_chapter=1)
        # Should not crash
        position = controller.get_story_position()
        profile = controller.get_pacing_profile()

        assert position == 0.0
        assert profile == "opening"


class TestChapterService:
    """Tests for ChapterService."""

    def test_create_context_builder(self):
        """Test creating context builder from request."""
        service = ChapterService()
        request = ChapterDraftRequest(
            outline="Chapter outline here",
            chapter_number=3,
            style_guide="Third person, past tense",
        )

        builder = service.create_context_builder(request)
        context = builder.build()

        assert context.chapter_number == 3
        assert context.style_guide == "Third person, past tense"

    def test_create_context_builder_with_previous_chapters(self):
        """Test context builder with previous chapters from request."""
        service = ChapterService()
        request = ChapterDraftRequest(
            outline="Chapter outline here",
            chapter_number=3,
            previous_chapters=["Ch1 content", "Ch2 content"],
        )

        builder = service.create_context_builder(request)
        context = builder.build()

        assert context.previous_summary is not None

    def test_build_generation_prompt(self):
        """Test building generation prompt."""
        service = ChapterService()
        context = ChapterContext(
            chapter_number=5,
            outline="The hero faces the villain",
            style_guide="Third person, past tense",
        )

        prompt = service.build_generation_prompt(context)

        assert "Chapter 5" in prompt
        assert "hero faces the villain" in prompt
        assert "third person" in prompt.lower()

    def test_build_prompt_with_pacing(self):
        """Test building prompt with pacing controller."""
        service = ChapterService()
        context = ChapterContext(
            chapter_number=5,
            outline="Midpoint revelation",
        )
        pacing = PacingController(total_chapters=10, current_chapter=5)

        prompt = service.build_generation_prompt(context, pacing)

        assert "Pacing Profile" in prompt
        assert "Tension Target" in prompt

    def test_build_prompt_with_character_states(self):
        """Test building prompt with character states."""
        service = ChapterService()
        context = ChapterContext(
            chapter_number=5,
            outline="Chapter outline",
            character_states={
                "Alice": CharacterState(
                    name="Alice", location="Castle", emotional_state="determined"
                )
            },
        )

        prompt = service.build_generation_prompt(context)

        assert "Alice" in prompt
        assert "Castle" in prompt or "determined" in prompt

    def test_estimate_word_count(self):
        """Test word count estimation."""
        service = ChapterService()

        assert service.estimate_word_count("one two three") == 3
        assert service.estimate_word_count("") == 0
        assert service.estimate_word_count("hello world") == 2

    def test_validate_chapter_output_valid(self):
        """Test validating valid chapter output."""
        service = ChapterService()
        content = " ".join(["word"] * 3000)

        is_valid, issues = service.validate_chapter_output(content)

        assert is_valid
        assert len(issues) == 0

    def test_validate_chapter_output_too_short(self):
        """Test validating too-short chapter output."""
        service = ChapterService()
        content = "Too short."

        is_valid, issues = service.validate_chapter_output(content)

        assert not is_valid
        assert any("too short" in issue.lower() for issue in issues)

    def test_validate_chapter_output_too_long(self):
        """Test validating too-long chapter output."""
        service = ChapterService()
        content = " ".join(["word"] * 15000)

        is_valid, issues = service.validate_chapter_output(content)

        assert not is_valid
        assert any("too long" in issue.lower() for issue in issues)

    def test_validate_chapter_output_empty(self):
        """Test validating empty chapter output."""
        service = ChapterService()
        content = ""

        is_valid, issues = service.validate_chapter_output(content)

        assert not is_valid
        assert any("empty" in issue.lower() for issue in issues)


class TestCreateChapterService:
    """Tests for factory function."""

    def test_creates_service_instance(self):
        """Test that factory creates service instance."""
        service = create_chapter_service()

        assert isinstance(service, ChapterService)

    def test_services_are_independent(self):
        """Test that multiple services are independent."""
        service1 = create_chapter_service()
        service2 = create_chapter_service()

        assert service1 is not service2


class TestIntegration:
    """Integration tests for chapter service components."""

    def test_full_workflow(self):
        """Test complete workflow from request to prompt."""
        # Create request
        request = ChapterDraftRequest(
            outline="The protagonist discovers the truth about her past.",
            chapter_number=8,
            style_guide="First person, present tense, lyrical prose",
            character_bible={
                "protagonist": {
                    "name": "Elena",
                    "location": "Ancient library",
                    "emotional_state": "shocked",
                }
            },
            previous_chapters=[
                "Chapter 6 ended with Elena finding the hidden room.",
                "Chapter 7 had her reading the first journal entry.",
            ],
        )

        # Build context
        service = create_chapter_service()
        builder = service.create_context_builder(request)
        context = builder.build()

        # Create pacing
        pacing = PacingController(total_chapters=12, current_chapter=8)

        # Build prompt
        prompt = service.build_generation_prompt(context, pacing)

        # Verify prompt content
        assert "Chapter 8" in prompt
        assert "discovers the truth" in prompt
        assert "first person" in prompt.lower()
        assert "Elena" in prompt
        assert "Pacing Profile" in prompt

    def test_style_consistency_across_chapters(self):
        """Test that style enforcer maintains consistency."""
        guide = "Third person limited, past tense, sparse prose like Hemingway"

        for chapter in range(1, 4):
            enforcer = StyleEnforcer(guide)
            assert enforcer.get_pov() == "third_person_limited"
            assert enforcer.get_tense() == "past"
            assert enforcer.get_prose_style() == "sparse"

    def test_pacing_progression(self):
        """Test pacing profile progression through story."""
        total = 20
        profiles = []

        for chapter in range(1, total + 1):
            controller = PacingController(total, chapter)
            profiles.append(controller.get_pacing_profile())

        # Should start with opening
        assert profiles[0] == "opening"

        # Should end with resolution
        assert profiles[-1] == "resolution"

        # Should hit all major profiles
        assert "rising_action" in profiles
        assert "midpoint" in profiles
        assert "climax" in profiles
