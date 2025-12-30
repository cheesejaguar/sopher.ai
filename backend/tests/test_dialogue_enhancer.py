"""Tests for dialogue enhancement.

Tests cover:
- Dialogue tag styles and generation
- Voice profiles and character management
- Dialogue context and beats
- Pre-defined archetypes
- Factory functions
"""

from app.agents.dialogue_enhancer import (
    ARISTOCRATIC_VILLAIN_VOICE,
    ELDERLY_MENTOR_VOICE,
    FOLKSY_ELDER_VOICE,
    HARDBOILED_DETECTIVE_VOICE,
    MILITARY_COMMANDER_VOICE,
    NERVOUS_TEENAGER_VOICE,
    SCIENTIST_VOICE,
    VOICE_PROFILES,
    CharacterVoiceManager,
    DialogueBeat,
    DialogueContext,
    DialogueEnhancer,
    DialogueTagGenerator,
    DialogueTagStyle,
    EmotionalUndertone,
    SpeechPattern,
    VoiceProfile,
    create_dialogue_enhancer,
    get_all_archetypes,
    get_voice_profile,
)


class TestDialogueTagStyleEnum:
    """Tests for DialogueTagStyle enum."""

    def test_all_values_defined(self):
        """Test that all tag style values are defined."""
        assert DialogueTagStyle.MINIMAL == "minimal"
        assert DialogueTagStyle.STANDARD == "standard"
        assert DialogueTagStyle.VARIED == "varied"
        assert DialogueTagStyle.INVISIBLE == "invisible"

    def test_enum_count(self):
        """Test expected number of tag styles."""
        assert len(DialogueTagStyle) == 4


class TestSpeechPatternEnum:
    """Tests for SpeechPattern enum."""

    def test_all_values_defined(self):
        """Test that all speech pattern values are defined."""
        assert SpeechPattern.FORMAL == "formal"
        assert SpeechPattern.CASUAL == "casual"
        assert SpeechPattern.TECHNICAL == "technical"
        assert SpeechPattern.POETIC == "poetic"
        assert SpeechPattern.TERSE == "terse"
        assert SpeechPattern.VERBOSE == "verbose"
        assert SpeechPattern.FOLKSY == "folksy"
        assert SpeechPattern.ACADEMIC == "academic"

    def test_enum_count(self):
        """Test expected number of speech patterns."""
        assert len(SpeechPattern) == 8


class TestEmotionalUndertoneEnum:
    """Tests for EmotionalUndertone enum."""

    def test_all_values_defined(self):
        """Test that all emotional undertone values are defined."""
        assert EmotionalUndertone.NEUTRAL == "neutral"
        assert EmotionalUndertone.TENSE == "tense"
        assert EmotionalUndertone.FLIRTATIOUS == "flirtatious"
        assert EmotionalUndertone.HOSTILE == "hostile"
        assert EmotionalUndertone.NERVOUS == "nervous"
        assert EmotionalUndertone.CONFIDENT == "confident"
        assert EmotionalUndertone.MELANCHOLIC == "melancholic"
        assert EmotionalUndertone.PLAYFUL == "playful"

    def test_enum_count(self):
        """Test expected number of emotional undertones."""
        assert len(EmotionalUndertone) == 8


class TestVoiceProfile:
    """Tests for VoiceProfile dataclass."""

    def test_default_profile(self):
        """Test default voice profile creation."""
        profile = VoiceProfile(name="Test Character")

        assert profile.name == "Test Character"
        assert profile.speech_pattern == SpeechPattern.CASUAL
        assert profile.vocabulary_level == "moderate"
        assert profile.favorite_expressions == []
        assert profile.verbal_tics == []
        assert profile.sentence_length == "varied"
        assert profile.interrupts_others is False
        assert profile.uses_contractions is True
        assert profile.formality_level == 0.5
        assert profile.dialect_notes is None

    def test_custom_profile(self):
        """Test custom voice profile creation."""
        profile = VoiceProfile(
            name="Lord Blackwood",
            speech_pattern=SpeechPattern.FORMAL,
            vocabulary_level="advanced",
            favorite_expressions=["Indeed", "How tiresome"],
            verbal_tics=["Quite"],
            sentence_length="long",
            interrupts_others=True,
            uses_contractions=False,
            formality_level=0.9,
            dialect_notes="British aristocratic",
        )

        assert profile.name == "Lord Blackwood"
        assert profile.speech_pattern == SpeechPattern.FORMAL
        assert profile.vocabulary_level == "advanced"
        assert len(profile.favorite_expressions) == 2
        assert profile.uses_contractions is False
        assert profile.formality_level == 0.9


class TestDialogueContext:
    """Tests for DialogueContext dataclass."""

    def test_default_context(self):
        """Test default dialogue context creation."""
        context = DialogueContext()

        assert context.participants == []
        assert context.location is None
        assert context.emotional_undertone == EmotionalUndertone.NEUTRAL
        assert context.subtext is None
        assert context.stakes is None
        assert context.power_dynamic is None
        assert context.time_pressure is False
        assert context.interrupted is False
        assert context.overheard is False

    def test_custom_context(self):
        """Test custom dialogue context creation."""
        context = DialogueContext(
            participants=["Alice", "Bob"],
            location="Dark alley",
            emotional_undertone=EmotionalUndertone.TENSE,
            subtext="They both know who killed Marcus",
            stakes="Their lives",
            power_dynamic="Alice has the upper hand",
            time_pressure=True,
            overheard=True,
        )

        assert len(context.participants) == 2
        assert context.location == "Dark alley"
        assert context.emotional_undertone == EmotionalUndertone.TENSE
        assert context.subtext is not None
        assert context.time_pressure is True
        assert context.overheard is True


class TestDialogueBeat:
    """Tests for DialogueBeat dataclass."""

    def test_default_beat(self):
        """Test default dialogue beat creation."""
        beat = DialogueBeat(speaker="Alice", text="Hello there.")

        assert beat.speaker == "Alice"
        assert beat.text == "Hello there."
        assert beat.tag_type == "said"
        assert beat.action_beat is None
        assert beat.internal_thought is None
        assert beat.subtext_hint is None

    def test_full_beat(self):
        """Test full dialogue beat creation."""
        beat = DialogueBeat(
            speaker="Bob",
            text="We need to talk.",
            tag_type="said gravely",
            action_beat="He set down his coffee cup.",
            internal_thought="Alice wondered what he knew.",
            subtext_hint="He knows about the affair.",
        )

        assert beat.speaker == "Bob"
        assert beat.action_beat is not None
        assert beat.internal_thought is not None
        assert beat.subtext_hint is not None


class TestDialogueTagGenerator:
    """Tests for DialogueTagGenerator."""

    def test_minimal_style(self):
        """Test minimal style returns only said/asked."""
        generator = DialogueTagGenerator(style=DialogueTagStyle.MINIMAL)

        # Regular statement
        tag = generator.get_tag(emotion="angry")
        assert tag == "said"

        # Question
        tag = generator.get_tag(emotion="angry", is_question=True)
        assert tag == "asked"

    def test_standard_style_varies_by_emotion(self):
        """Test standard style varies by emotion."""
        generator = DialogueTagGenerator(style=DialogueTagStyle.STANDARD)

        neutral_tag = generator.get_tag(emotion="neutral")
        assert neutral_tag in ["said", "replied", "answered", "responded", "added"]

        angry_tag = generator.get_tag(emotion="angry")
        assert angry_tag in ["snapped", "growled", "barked", "snarled", "spat"]

    def test_invisible_style_returns_action_beat(self):
        """Test invisible style returns action beats."""
        generator = DialogueTagGenerator(style=DialogueTagStyle.INVISIBLE)

        tag = generator.get_tag()
        # Should be an action beat, not a dialogue tag
        assert tag in DialogueTagGenerator.ACTION_BEATS

    def test_question_handling(self):
        """Test that questions get appropriate tags."""
        generator = DialogueTagGenerator(style=DialogueTagStyle.STANDARD)

        tag = generator.get_tag(is_question=True)
        assert tag == "asked"

    def test_variety_in_tags(self):
        """Test that generator provides variety."""
        generator = DialogueTagGenerator(style=DialogueTagStyle.STANDARD)

        tags = set()
        for _ in range(10):
            tag = generator.get_tag(emotion="neutral")
            tags.add(tag)

        # Should have some variety (may reset after threshold)
        assert len(tags) >= 2

    def test_reset(self):
        """Test reset clears tag history."""
        generator = DialogueTagGenerator(style=DialogueTagStyle.STANDARD)

        # Use some tags
        for _ in range(5):
            generator.get_tag()

        generator.reset()

        # After reset, should start fresh
        # This is more of a state verification test
        assert len(generator._used_tags) == 0


class TestCharacterVoiceManager:
    """Tests for CharacterVoiceManager."""

    def test_add_and_get_voice(self):
        """Test adding and retrieving voice profiles."""
        manager = CharacterVoiceManager()
        profile = VoiceProfile(name="Alice")

        manager.add_voice(profile)
        retrieved = manager.get_voice("Alice")

        assert retrieved is not None
        assert retrieved.name == "Alice"

    def test_get_voice_case_insensitive(self):
        """Test that voice lookup is case insensitive."""
        manager = CharacterVoiceManager()
        profile = VoiceProfile(name="Alice")

        manager.add_voice(profile)

        assert manager.get_voice("ALICE") is not None
        assert manager.get_voice("alice") is not None
        assert manager.get_voice("Alice") is not None

    def test_get_nonexistent_voice(self):
        """Test getting nonexistent voice returns None."""
        manager = CharacterVoiceManager()
        assert manager.get_voice("Unknown") is None

    def test_has_voice(self):
        """Test has_voice check."""
        manager = CharacterVoiceManager()
        profile = VoiceProfile(name="Bob")

        assert not manager.has_voice("Bob")

        manager.add_voice(profile)

        assert manager.has_voice("Bob")
        assert manager.has_voice("bob")

    def test_get_all_characters(self):
        """Test getting all character names."""
        manager = CharacterVoiceManager()

        manager.add_voice(VoiceProfile(name="Alice"))
        manager.add_voice(VoiceProfile(name="Bob"))
        manager.add_voice(VoiceProfile(name="Charlie"))

        characters = manager.get_all_characters()

        assert len(characters) == 3
        assert "Alice" in characters
        assert "Bob" in characters
        assert "Charlie" in characters

    def test_clear(self):
        """Test clearing all voice profiles."""
        manager = CharacterVoiceManager()

        manager.add_voice(VoiceProfile(name="Alice"))
        manager.add_voice(VoiceProfile(name="Bob"))

        manager.clear()

        assert len(manager.get_all_characters()) == 0
        assert manager.get_voice("Alice") is None

    def test_get_voice_prompt_basic(self):
        """Test basic voice prompt generation."""
        manager = CharacterVoiceManager()
        profile = VoiceProfile(
            name="Detective Sam",
            speech_pattern=SpeechPattern.TERSE,
        )

        manager.add_voice(profile)
        prompt = manager.get_voice_prompt("Detective Sam")

        assert "Detective Sam" in prompt
        assert "short" in prompt.lower() or "clipped" in prompt.lower()

    def test_get_voice_prompt_with_all_fields(self):
        """Test voice prompt with all fields populated."""
        manager = CharacterVoiceManager()
        profile = VoiceProfile(
            name="Lady Victoria",
            speech_pattern=SpeechPattern.FORMAL,
            vocabulary_level="advanced",
            favorite_expressions=["How delightful", "I see"],
            verbal_tics=["Indeed"],
            uses_contractions=False,
            interrupts_others=True,
            dialect_notes="British aristocratic",
        )

        manager.add_voice(profile)
        prompt = manager.get_voice_prompt("Lady Victoria")

        assert "Lady Victoria" in prompt
        assert "formal" in prompt.lower()
        assert "How delightful" in prompt
        assert "Indeed" in prompt
        assert "do not" in prompt.lower() or "contractions" in prompt.lower()
        assert "interrupt" in prompt.lower()
        assert "British" in prompt

    def test_get_voice_prompt_unknown(self):
        """Test voice prompt for unknown character."""
        manager = CharacterVoiceManager()
        prompt = manager.get_voice_prompt("Unknown")

        assert "Unknown" in prompt
        assert "normally" in prompt


class TestDialogueEnhancer:
    """Tests for DialogueEnhancer."""

    def test_initialization(self):
        """Test enhancer initialization."""
        enhancer = DialogueEnhancer()

        assert enhancer.voice_manager is not None
        assert enhancer.tag_generator is not None

    def test_add_character_voice(self):
        """Test adding character voice."""
        enhancer = DialogueEnhancer()
        profile = VoiceProfile(name="Test")

        result = enhancer.add_character_voice(profile)

        assert result is enhancer  # Method chaining
        assert enhancer.voice_manager.has_voice("Test")

    def test_get_dialogue_guidance_basic(self):
        """Test basic dialogue guidance generation."""
        enhancer = DialogueEnhancer()
        context = DialogueContext(
            participants=["Alice", "Bob"],
            location="Coffee shop",
        )

        guidance = enhancer.get_dialogue_guidance(context)

        assert "DIALOGUE GUIDANCE" in guidance
        assert "Alice" in guidance
        assert "Bob" in guidance
        assert "Coffee shop" in guidance

    def test_get_dialogue_guidance_with_undertone(self):
        """Test dialogue guidance with emotional undertone."""
        enhancer = DialogueEnhancer()
        context = DialogueContext(
            participants=["Alice", "Bob"],
            emotional_undertone=EmotionalUndertone.TENSE,
        )

        guidance = enhancer.get_dialogue_guidance(context)

        assert "TONE" in guidance
        assert "tension" in guidance.lower()

    def test_get_dialogue_guidance_with_subtext(self):
        """Test dialogue guidance with subtext."""
        enhancer = DialogueEnhancer()
        context = DialogueContext(
            participants=["Alice", "Bob"],
            subtext="They both know the secret",
        )

        guidance = enhancer.get_dialogue_guidance(context)

        assert "SUBTEXT" in guidance
        assert "They both know the secret" in guidance

    def test_get_dialogue_guidance_with_conditions(self):
        """Test dialogue guidance with special conditions."""
        enhancer = DialogueEnhancer()
        context = DialogueContext(
            participants=["Alice", "Bob"],
            time_pressure=True,
            overheard=True,
        )

        guidance = enhancer.get_dialogue_guidance(context)

        assert "SPECIAL CONDITIONS" in guidance
        assert "urgency" in guidance.lower()
        assert "overheard" in guidance.lower()

    def test_get_dialogue_guidance_with_pov(self):
        """Test dialogue guidance with POV character."""
        enhancer = DialogueEnhancer()
        context = DialogueContext(participants=["Alice", "Bob"])

        guidance = enhancer.get_dialogue_guidance(context, pov_character="Alice")

        assert "POV CHARACTER" in guidance
        assert "Alice" in guidance
        assert "internal" in guidance.lower()

    def test_get_dialogue_guidance_with_voices(self):
        """Test dialogue guidance with character voices."""
        enhancer = DialogueEnhancer()
        enhancer.add_character_voice(
            VoiceProfile(name="Alice", speech_pattern=SpeechPattern.FORMAL)
        )
        enhancer.add_character_voice(VoiceProfile(name="Bob", speech_pattern=SpeechPattern.CASUAL))

        context = DialogueContext(participants=["Alice", "Bob"])

        guidance = enhancer.get_dialogue_guidance(context)

        assert "formal" in guidance.lower()
        assert "casual" in guidance.lower()

    def test_suggest_subtext(self):
        """Test subtext suggestion."""
        enhancer = DialogueEnhancer()

        subtext = enhancer.suggest_subtext(
            surface_topic="The weather",
            relationship="romantic interest",
        )

        assert "weather" in subtext.lower()
        assert "unspoken" in subtext.lower() or "feelings" in subtext.lower()

    def test_suggest_subtext_with_conflict(self):
        """Test subtext suggestion with conflict."""
        enhancer = DialogueEnhancer()

        subtext = enhancer.suggest_subtext(
            surface_topic="Business deal",
            relationship="rivals",
            conflict="They both want the same promotion",
        )

        assert "Business deal" in subtext
        assert "promotion" in subtext
        assert "dominance" in subtext.lower() or "weakness" in subtext.lower()

    def test_create_dialogue_beat(self):
        """Test dialogue beat creation."""
        enhancer = DialogueEnhancer()

        beat = enhancer.create_dialogue_beat(
            speaker="Alice",
            emotion="neutral",
        )

        assert beat.speaker == "Alice"
        assert beat.text == "[dialogue text]"
        assert beat.tag_type in [
            "said",
            "replied",
            "answered",
            "responded",
            "added",
        ]

    def test_create_dialogue_beat_with_action(self):
        """Test dialogue beat with action beat."""
        enhancer = DialogueEnhancer()

        beat = enhancer.create_dialogue_beat(
            speaker="Bob",
            include_action=True,
        )

        assert beat.action_beat is not None
        assert beat.action_beat in DialogueTagGenerator.ACTION_BEATS

    def test_create_dialogue_beat_with_thought(self):
        """Test dialogue beat with internal thought."""
        enhancer = DialogueEnhancer()

        beat = enhancer.create_dialogue_beat(
            speaker="Bob",
            include_thought=True,
            pov_character="Alice",
        )

        assert beat.internal_thought is not None
        assert "Alice" in beat.internal_thought

    def test_reset(self):
        """Test reset clears state."""
        enhancer = DialogueEnhancer()

        # Generate some tags
        for _ in range(5):
            enhancer.tag_generator.get_tag()

        enhancer.reset()

        assert len(enhancer.tag_generator._used_tags) == 0


class TestPreDefinedVoiceProfiles:
    """Tests for pre-defined voice profiles."""

    def test_hardboiled_detective(self):
        """Test hardboiled detective voice."""
        assert HARDBOILED_DETECTIVE_VOICE.speech_pattern == SpeechPattern.TERSE
        assert HARDBOILED_DETECTIVE_VOICE.sentence_length == "short"
        assert HARDBOILED_DETECTIVE_VOICE.formality_level < 0.5

    def test_elderly_mentor(self):
        """Test elderly mentor voice."""
        assert ELDERLY_MENTOR_VOICE.speech_pattern == SpeechPattern.POETIC
        assert ELDERLY_MENTOR_VOICE.vocabulary_level == "advanced"
        assert ELDERLY_MENTOR_VOICE.uses_contractions is False

    def test_nervous_teenager(self):
        """Test nervous teenager voice."""
        assert NERVOUS_TEENAGER_VOICE.speech_pattern == SpeechPattern.CASUAL
        assert len(NERVOUS_TEENAGER_VOICE.verbal_tics) > 0
        assert NERVOUS_TEENAGER_VOICE.formality_level < 0.3

    def test_aristocratic_villain(self):
        """Test aristocratic villain voice."""
        assert ARISTOCRATIC_VILLAIN_VOICE.speech_pattern == SpeechPattern.FORMAL
        assert ARISTOCRATIC_VILLAIN_VOICE.interrupts_others is True
        assert ARISTOCRATIC_VILLAIN_VOICE.uses_contractions is False
        assert ARISTOCRATIC_VILLAIN_VOICE.formality_level > 0.8

    def test_military_commander(self):
        """Test military commander voice."""
        assert MILITARY_COMMANDER_VOICE.speech_pattern == SpeechPattern.TERSE
        assert MILITARY_COMMANDER_VOICE.interrupts_others is True
        assert MILITARY_COMMANDER_VOICE.sentence_length == "short"

    def test_scientist(self):
        """Test scientist voice."""
        assert SCIENTIST_VOICE.speech_pattern == SpeechPattern.TECHNICAL
        assert SCIENTIST_VOICE.vocabulary_level == "advanced"
        assert len(SCIENTIST_VOICE.verbal_tics) > 0

    def test_folksy_elder(self):
        """Test folksy elder voice."""
        assert FOLKSY_ELDER_VOICE.speech_pattern == SpeechPattern.FOLKSY
        assert FOLKSY_ELDER_VOICE.vocabulary_level == "accessible"
        assert FOLKSY_ELDER_VOICE.sentence_length == "long"


class TestVoiceProfileRegistry:
    """Tests for VOICE_PROFILES registry."""

    def test_registry_has_all_profiles(self):
        """Test that registry contains expected profiles."""
        expected_keys = [
            "detective",
            "mentor",
            "teen",
            "teenager",
            "villain",
            "commander",
            "military",
            "scientist",
            "elder",
        ]
        for key in expected_keys:
            assert key in VOICE_PROFILES

    def test_registry_values_are_profiles(self):
        """Test that all registry values are VoiceProfile instances."""
        for key, profile in VOICE_PROFILES.items():
            assert isinstance(profile, VoiceProfile)


class TestGetVoiceProfile:
    """Tests for get_voice_profile function."""

    def test_get_by_archetype(self):
        """Test getting profile by archetype."""
        profile = get_voice_profile("detective")
        assert profile is not None
        assert profile.speech_pattern == SpeechPattern.TERSE

    def test_get_case_insensitive(self):
        """Test case insensitive lookup."""
        profile = get_voice_profile("VILLAIN")
        assert profile is not None
        assert profile.speech_pattern == SpeechPattern.FORMAL

    def test_get_nonexistent(self):
        """Test getting nonexistent archetype."""
        profile = get_voice_profile("nonexistent")
        assert profile is None


class TestGetAllArchetypes:
    """Tests for get_all_archetypes function."""

    def test_returns_list(self):
        """Test that function returns a list."""
        archetypes = get_all_archetypes()
        assert isinstance(archetypes, list)

    def test_all_archetypes_are_strings(self):
        """Test that all archetypes are strings."""
        archetypes = get_all_archetypes()
        for archetype in archetypes:
            assert isinstance(archetype, str)


class TestCreateDialogueEnhancer:
    """Tests for create_dialogue_enhancer factory function."""

    def test_creates_enhancer(self):
        """Test that factory creates enhancer."""
        enhancer = create_dialogue_enhancer()

        assert isinstance(enhancer, DialogueEnhancer)
        assert enhancer.tag_generator.style == DialogueTagStyle.STANDARD

    def test_creates_with_custom_style(self):
        """Test creating with custom tag style."""
        enhancer = create_dialogue_enhancer(tag_style=DialogueTagStyle.MINIMAL)

        assert enhancer.tag_generator.style == DialogueTagStyle.MINIMAL

    def test_creates_with_voice_profiles(self):
        """Test creating with voice profiles."""
        profiles = [
            VoiceProfile(name="Alice"),
            VoiceProfile(name="Bob"),
        ]

        enhancer = create_dialogue_enhancer(voice_profiles=profiles)

        assert enhancer.voice_manager.has_voice("Alice")
        assert enhancer.voice_manager.has_voice("Bob")


class TestIntegration:
    """Integration tests for dialogue enhancement."""

    def test_full_workflow(self):
        """Test a complete dialogue enhancement workflow."""
        # Create enhancer with voices
        enhancer = create_dialogue_enhancer(
            tag_style=DialogueTagStyle.VARIED,
            voice_profiles=[
                get_voice_profile("detective"),
                VoiceProfile(
                    name="Suspect",
                    speech_pattern=SpeechPattern.CASUAL,
                    verbal_tics=["I mean", "You know"],
                    formality_level=0.2,
                ),
            ],
        )

        # Rename detective profile
        detective_profile = get_voice_profile("detective")
        detective_profile = VoiceProfile(
            name="Sam",
            speech_pattern=detective_profile.speech_pattern,
            vocabulary_level=detective_profile.vocabulary_level,
            favorite_expressions=detective_profile.favorite_expressions,
            verbal_tics=detective_profile.verbal_tics,
            sentence_length=detective_profile.sentence_length,
            formality_level=detective_profile.formality_level,
        )
        enhancer.add_character_voice(detective_profile)

        # Create context
        context = DialogueContext(
            participants=["Sam", "Suspect"],
            location="Interrogation room",
            emotional_undertone=EmotionalUndertone.TENSE,
            subtext="Sam knows more than he's letting on",
            stakes="The suspect's freedom",
            power_dynamic="Sam has the upper hand",
            time_pressure=True,
        )

        # Get guidance
        guidance = enhancer.get_dialogue_guidance(context, pov_character="Sam")

        # Verify all elements present
        assert "DIALOGUE GUIDANCE" in guidance
        assert "Sam" in guidance
        assert "Suspect" in guidance
        assert "Interrogation room" in guidance
        assert "TONE" in guidance
        assert "SUBTEXT" in guidance
        assert "STAKES" in guidance
        assert "POV CHARACTER" in guidance

    def test_relationship_based_subtext(self):
        """Test subtext suggestions for different relationships."""
        enhancer = DialogueEnhancer()

        romantic = enhancer.suggest_subtext(
            surface_topic="Work project",
            relationship="romantic partners",
        )
        assert "feelings" in romantic.lower() or "closeness" in romantic.lower()

        rivals = enhancer.suggest_subtext(
            surface_topic="The competition",
            relationship="rivals",
        )
        assert "dominance" in rivals.lower() or "weakness" in rivals.lower()

        family = enhancer.suggest_subtext(
            surface_topic="Holiday plans",
            relationship="family members",
        )
        assert "grievances" in family.lower() or "expectations" in family.lower()
