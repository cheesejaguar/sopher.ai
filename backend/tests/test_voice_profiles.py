"""Tests for author voice profiles."""

from uuid import uuid4

from app.agents.voice_profiles import (
    BlendedVoice,
    EmotionalIntensity,
    HumorStyle,
    ImageryDensity,
    NarrativeDistance,
    PacingTendency,
    SentenceRhythm,
    VocabularyLevel,
    VoiceBlender,
    VoiceCharacteristic,
    VoiceParameters,
    VoiceProfile,
    VoiceProfileService,
    VoicePromptGenerator,
    create_custom_profile,
    get_all_voice_names,
    get_all_voice_profiles,
    get_profiles_for_genre,
    get_voice_profile,
)


class TestEnums:
    """Tests for enum classes."""

    def test_voice_characteristic_values(self):
        """Test VoiceCharacteristic enum values."""
        assert VoiceCharacteristic.SENTENCE_RHYTHM.value == "sentence_rhythm"
        assert VoiceCharacteristic.VOCABULARY_LEVEL.value == "vocabulary_level"
        assert VoiceCharacteristic.EMOTIONAL_INTENSITY.value == "emotional_intensity"

    def test_sentence_rhythm_values(self):
        """Test SentenceRhythm enum values."""
        assert SentenceRhythm.STACCATO.value == "staccato"
        assert SentenceRhythm.FLOWING.value == "flowing"
        assert SentenceRhythm.HYPNOTIC.value == "hypnotic"

    def test_vocabulary_level_values(self):
        """Test VocabularyLevel enum values."""
        assert VocabularyLevel.SIMPLE.value == "simple"
        assert VocabularyLevel.LITERARY.value == "literary"

    def test_emotional_intensity_values(self):
        """Test EmotionalIntensity enum values."""
        assert EmotionalIntensity.RESTRAINED.value == "restrained"
        assert EmotionalIntensity.INTENSE.value == "intense"

    def test_imagery_density_values(self):
        """Test ImageryDensity enum values."""
        assert ImageryDensity.SPARSE.value == "sparse"
        assert ImageryDensity.LUSH.value == "lush"

    def test_narrative_distance_values(self):
        """Test NarrativeDistance enum values."""
        assert NarrativeDistance.INTIMATE.value == "intimate"
        assert NarrativeDistance.OMNISCIENT.value == "omniscient"

    def test_humor_style_values(self):
        """Test HumorStyle enum values."""
        assert HumorStyle.NONE.value == "none"
        assert HumorStyle.WITTY.value == "witty"
        assert HumorStyle.SARDONIC.value == "sardonic"

    def test_pacing_tendency_values(self):
        """Test PacingTendency enum values."""
        assert PacingTendency.SLOW_BURN.value == "slow_burn"
        assert PacingTendency.RAPID.value == "rapid"


class TestVoiceParameters:
    """Tests for VoiceParameters dataclass."""

    def test_default_values(self):
        """Test default parameter values."""
        params = VoiceParameters()
        assert params.sentence_rhythm == SentenceRhythm.VARIED
        assert params.vocabulary_level == VocabularyLevel.MODERATE
        assert params.dialogue_naturalness == 0.5
        assert params.philosophical_depth == 0.3

    def test_custom_values(self):
        """Test custom parameter values."""
        params = VoiceParameters(
            sentence_rhythm=SentenceRhythm.STACCATO,
            vocabulary_level=VocabularyLevel.SIMPLE,
            dialogue_naturalness=0.9,
        )
        assert params.sentence_rhythm == SentenceRhythm.STACCATO
        assert params.vocabulary_level == VocabularyLevel.SIMPLE
        assert params.dialogue_naturalness == 0.9


class TestVoiceProfile:
    """Tests for VoiceProfile dataclass."""

    def test_default_values(self):
        """Test default profile values."""
        profile = VoiceProfile()
        assert profile.name == ""
        assert profile.description == ""
        assert isinstance(profile.parameters, VoiceParameters)
        assert profile.signature_techniques == []

    def test_custom_values(self):
        """Test custom profile values."""
        profile = VoiceProfile(
            name="Test Voice",
            description="A test voice",
            inspired_by="Test Author",
            best_for_genres=["fantasy", "mystery"],
        )
        assert profile.name == "Test Voice"
        assert profile.inspired_by == "Test Author"
        assert "fantasy" in profile.best_for_genres


class TestBlendedVoice:
    """Tests for BlendedVoice dataclass."""

    def test_default_values(self):
        """Test default blended voice values."""
        blended = BlendedVoice()
        assert blended.name == ""
        assert blended.source_profiles == []
        assert blended.weights == []

    def test_custom_values(self):
        """Test custom blended voice values."""
        id1, id2 = uuid4(), uuid4()
        blended = BlendedVoice(
            name="Mixed Voice",
            source_profiles=[id1, id2],
            weights=[0.6, 0.4],
        )
        assert blended.name == "Mixed Voice"
        assert len(blended.source_profiles) == 2
        assert blended.weights == [0.6, 0.4]


class TestPredefinedProfiles:
    """Tests for predefined voice profiles."""

    def test_get_hemingway(self):
        """Test getting Hemingway profile."""
        profile = get_voice_profile("hemingway")
        assert profile is not None
        assert profile.name == "Hemingway"
        assert profile.inspired_by == "Ernest Hemingway"
        assert profile.parameters.sentence_rhythm == SentenceRhythm.STACCATO
        assert profile.parameters.vocabulary_level == VocabularyLevel.SIMPLE

    def test_get_austen(self):
        """Test getting Austen profile."""
        profile = get_voice_profile("austen")
        assert profile is not None
        assert profile.name == "Austen"
        assert profile.parameters.humor_style == HumorStyle.WITTY

    def test_get_king(self):
        """Test getting King profile."""
        profile = get_voice_profile("king")
        assert profile is not None
        assert profile.name == "King"
        assert profile.parameters.dialogue_naturalness > 0.9

    def test_get_pratchett(self):
        """Test getting Pratchett profile."""
        profile = get_voice_profile("pratchett")
        assert profile is not None
        assert profile.parameters.humor_style == HumorStyle.WITTY

    def test_get_mccarthy(self):
        """Test getting McCarthy profile."""
        profile = get_voice_profile("mccarthy")
        assert profile is not None
        assert profile.parameters.philosophical_depth > 0.8

    def test_get_rowling(self):
        """Test getting Rowling profile."""
        profile = get_voice_profile("rowling")
        assert profile is not None
        assert "young adult" in profile.best_for_genres

    def test_get_atwood(self):
        """Test getting Atwood profile."""
        profile = get_voice_profile("atwood")
        assert profile is not None
        assert profile.parameters.vocabulary_level == VocabularyLevel.LITERARY

    def test_get_gaiman(self):
        """Test getting Gaiman profile."""
        profile = get_voice_profile("gaiman")
        assert profile is not None
        assert profile.parameters.sentence_rhythm == SentenceRhythm.HYPNOTIC

    def test_get_christie(self):
        """Test getting Christie profile."""
        profile = get_voice_profile("christie")
        assert profile is not None
        assert "mystery" in profile.best_for_genres

    def test_get_sanderson(self):
        """Test getting Sanderson profile."""
        profile = get_voice_profile("sanderson")
        assert profile is not None
        assert profile.parameters.action_focus > 0.6

    def test_get_nonexistent(self):
        """Test getting nonexistent profile."""
        profile = get_voice_profile("nonexistent")
        assert profile is None

    def test_case_insensitive(self):
        """Test case-insensitive lookup."""
        profile1 = get_voice_profile("HEMINGWAY")
        profile2 = get_voice_profile("Hemingway")
        profile3 = get_voice_profile("hemingway")
        assert profile1 is not None
        assert profile1.name == profile2.name == profile3.name

    def test_get_all_voice_names(self):
        """Test getting all voice names."""
        names = get_all_voice_names()
        assert len(names) >= 10
        assert "hemingway" in names
        assert "austen" in names
        assert "king" in names

    def test_get_all_voice_profiles(self):
        """Test getting all voice profiles."""
        profiles = get_all_voice_profiles()
        assert len(profiles) >= 10
        assert all(isinstance(p, VoiceProfile) for p in profiles)


class TestGetProfilesForGenre:
    """Tests for genre-based profile filtering."""

    def test_mystery_profiles(self):
        """Test getting profiles for mystery genre."""
        profiles = get_profiles_for_genre("mystery")
        names = [p.name for p in profiles]
        assert "Christie" in names

    def test_fantasy_profiles(self):
        """Test getting profiles for fantasy genre."""
        profiles = get_profiles_for_genre("fantasy")
        names = [p.name for p in profiles]
        assert "Pratchett" in names or "Gaiman" in names

    def test_horror_profiles(self):
        """Test getting profiles for horror genre."""
        profiles = get_profiles_for_genre("horror")
        names = [p.name for p in profiles]
        assert "King" in names

    def test_literary_fiction_profiles(self):
        """Test getting profiles for literary fiction."""
        profiles = get_profiles_for_genre("literary fiction")
        assert len(profiles) >= 1

    def test_unknown_genre(self):
        """Test getting profiles for unknown genre."""
        profiles = get_profiles_for_genre("xyz_unknown")
        assert profiles == []


class TestVoicePromptGenerator:
    """Tests for VoicePromptGenerator."""

    def test_generate_prompt_with_description(self):
        """Test prompt generation with description."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(
            description="spare and direct",
            inspired_by="Test Author",
        )
        prompt = generator.generate_prompt(profile)
        assert "spare and direct" in prompt
        assert "Test Author" in prompt

    def test_generate_prompt_staccato(self):
        """Test prompt generation for staccato rhythm."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(parameters=VoiceParameters(sentence_rhythm=SentenceRhythm.STACCATO))
        prompt = generator.generate_prompt(profile)
        assert "short" in prompt.lower()
        assert "punchy" in prompt.lower()

    def test_generate_prompt_flowing(self):
        """Test prompt generation for flowing rhythm."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(parameters=VoiceParameters(sentence_rhythm=SentenceRhythm.FLOWING))
        prompt = generator.generate_prompt(profile)
        assert "flowing" in prompt.lower()

    def test_generate_prompt_literary_vocabulary(self):
        """Test prompt generation for literary vocabulary."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(
            parameters=VoiceParameters(vocabulary_level=VocabularyLevel.LITERARY)
        )
        prompt = generator.generate_prompt(profile)
        assert "literary" in prompt.lower() or "rich" in prompt.lower()

    def test_generate_prompt_witty_humor(self):
        """Test prompt generation for witty humor."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(parameters=VoiceParameters(humor_style=HumorStyle.WITTY))
        prompt = generator.generate_prompt(profile)
        assert "witty" in prompt.lower()

    def test_generate_prompt_no_humor(self):
        """Test prompt generation with no humor."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(parameters=VoiceParameters(humor_style=HumorStyle.NONE))
        prompt = generator.generate_prompt(profile)
        assert "humor" not in prompt.lower() or "witty" not in prompt.lower()

    def test_generate_prompt_high_dialogue_naturalness(self):
        """Test prompt generation for high dialogue naturalness."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(parameters=VoiceParameters(dialogue_naturalness=0.9))
        prompt = generator.generate_prompt(profile)
        assert "dialogue" in prompt.lower()
        assert "natural" in prompt.lower()

    def test_generate_prompt_high_philosophical_depth(self):
        """Test prompt generation for high philosophical depth."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(parameters=VoiceParameters(philosophical_depth=0.8))
        prompt = generator.generate_prompt(profile)
        assert "philosophical" in prompt.lower()

    def test_generate_prompt_with_techniques(self):
        """Test prompt generation with signature techniques."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(
            signature_techniques=["iceberg theory", "repetition"],
        )
        prompt = generator.generate_prompt(profile)
        assert "iceberg theory" in prompt
        assert "repetition" in prompt

    def test_generate_prompt_with_avoids(self):
        """Test prompt generation with avoids list."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(
            avoids=["adverbs", "passive voice"],
        )
        prompt = generator.generate_prompt(profile)
        assert "adverbs" in prompt
        assert "passive voice" in prompt

    def test_generate_brief_prompt(self):
        """Test brief prompt generation."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(
            name="Test",
            inspired_by="Test Author",
            parameters=VoiceParameters(
                sentence_rhythm=SentenceRhythm.STACCATO,
                vocabulary_level=VocabularyLevel.SIMPLE,
            ),
        )
        prompt = generator.generate_brief_prompt(profile)
        assert "Test Author" in prompt
        assert "punchy" in prompt.lower() or "short" in prompt.lower()

    def test_generate_brief_prompt_minimal(self):
        """Test brief prompt with minimal profile."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile(name="Minimal")
        prompt = generator.generate_brief_prompt(profile)
        assert "Minimal" in prompt


class TestVoiceBlender:
    """Tests for VoiceBlender."""

    def test_blend_two_profiles(self):
        """Test blending two profiles."""
        blender = VoiceBlender()
        profile1 = VoiceProfile(
            name="Profile 1",
            parameters=VoiceParameters(
                dialogue_naturalness=0.2,
                philosophical_depth=0.8,
            ),
        )
        profile2 = VoiceProfile(
            name="Profile 2",
            parameters=VoiceParameters(
                dialogue_naturalness=0.8,
                philosophical_depth=0.2,
            ),
        )

        blended = blender.blend([profile1, profile2], name="Blended")

        # Should be averaged
        assert 0.4 < blended.blended_parameters.dialogue_naturalness < 0.6
        assert 0.4 < blended.blended_parameters.philosophical_depth < 0.6

    def test_blend_with_weights(self):
        """Test blending with custom weights."""
        blender = VoiceBlender()
        profile1 = VoiceProfile(parameters=VoiceParameters(dialogue_naturalness=0.0))
        profile2 = VoiceProfile(parameters=VoiceParameters(dialogue_naturalness=1.0))

        # Weight heavily toward profile2
        blended = blender.blend([profile1, profile2], weights=[0.2, 0.8])

        assert blended.blended_parameters.dialogue_naturalness > 0.7

    def test_blend_empty_list(self):
        """Test blending empty list."""
        blender = VoiceBlender()
        blended = blender.blend([], name="Empty")
        assert blended.name == "Empty"
        assert blended.source_profiles == []

    def test_blend_single_profile(self):
        """Test blending single profile."""
        blender = VoiceBlender()
        profile = VoiceProfile(parameters=VoiceParameters(dialogue_naturalness=0.9))

        blended = blender.blend([profile])
        assert blended.blended_parameters.dialogue_naturalness == 0.9

    def test_blend_dominant_enum_values(self):
        """Test that enum values come from dominant profile."""
        blender = VoiceBlender()
        profile1 = VoiceProfile(
            parameters=VoiceParameters(
                sentence_rhythm=SentenceRhythm.STACCATO,
                humor_style=HumorStyle.DRY,
            )
        )
        profile2 = VoiceProfile(
            parameters=VoiceParameters(
                sentence_rhythm=SentenceRhythm.FLOWING,
                humor_style=HumorStyle.WITTY,
            )
        )

        # Profile2 is dominant (higher weight)
        blended = blender.blend([profile1, profile2], weights=[0.3, 0.7])

        assert blended.blended_parameters.sentence_rhythm == SentenceRhythm.FLOWING
        assert blended.blended_parameters.humor_style == HumorStyle.WITTY


class TestCreateCustomProfile:
    """Tests for create_custom_profile function."""

    def test_create_with_name_only(self):
        """Test creating profile with name only."""
        profile = create_custom_profile("Custom Voice")
        assert profile.name == "Custom Voice"
        assert isinstance(profile.parameters, VoiceParameters)

    def test_create_with_parameters(self):
        """Test creating profile with parameters."""
        profile = create_custom_profile(
            "Custom Voice",
            description="A custom voice",
            sentence_rhythm=SentenceRhythm.STACCATO,
            dialogue_naturalness=0.9,
        )
        assert profile.name == "Custom Voice"
        assert profile.description == "A custom voice"
        assert profile.parameters.sentence_rhythm == SentenceRhythm.STACCATO
        assert profile.parameters.dialogue_naturalness == 0.9

    def test_create_with_profile_kwargs(self):
        """Test creating profile with additional kwargs."""
        profile = create_custom_profile(
            "Custom Voice",
            inspired_by="Someone",
            signature_techniques=["technique1"],
            best_for_genres=["genre1"],
        )
        assert profile.inspired_by == "Someone"
        assert "technique1" in profile.signature_techniques
        assert "genre1" in profile.best_for_genres


class TestVoiceProfileService:
    """Tests for VoiceProfileService."""

    def test_get_predefined(self):
        """Test getting predefined profile through service."""
        service = VoiceProfileService()
        profile = service.get_predefined("hemingway")
        assert profile is not None
        assert profile.name == "Hemingway"

    def test_list_predefined(self):
        """Test listing predefined profiles."""
        service = VoiceProfileService()
        profiles = service.list_predefined()
        assert len(profiles) >= 10

    def test_create_custom(self):
        """Test creating custom profile."""
        service = VoiceProfileService()
        profile = service.create_custom(
            "My Voice",
            description="My custom voice",
            sentence_rhythm=SentenceRhythm.FLOWING,
        )
        assert profile.name == "My Voice"
        assert profile.parameters.sentence_rhythm == SentenceRhythm.FLOWING

    def test_get_custom(self):
        """Test getting custom profile."""
        service = VoiceProfileService()
        created = service.create_custom("Test Voice")
        retrieved = service.get_custom(created.id)
        assert retrieved is not None
        assert retrieved.name == "Test Voice"

    def test_get_nonexistent_custom(self):
        """Test getting nonexistent custom profile."""
        service = VoiceProfileService()
        result = service.get_custom(uuid4())
        assert result is None

    def test_list_custom(self):
        """Test listing custom profiles."""
        service = VoiceProfileService()
        service.create_custom("Voice 1")
        service.create_custom("Voice 2")
        profiles = service.list_custom()
        assert len(profiles) == 2
        names = [p.name for p in profiles]
        assert "Voice 1" in names
        assert "Voice 2" in names

    def test_delete_custom(self):
        """Test deleting custom profile."""
        service = VoiceProfileService()
        profile = service.create_custom("To Delete")
        assert service.delete_custom(profile.id)
        assert service.get_custom(profile.id) is None

    def test_delete_nonexistent(self):
        """Test deleting nonexistent profile."""
        service = VoiceProfileService()
        assert not service.delete_custom(uuid4())

    def test_blend_profiles(self):
        """Test blending profiles through service."""
        service = VoiceProfileService()
        p1 = service.create_custom("Voice 1", dialogue_naturalness=0.2)
        p2 = service.create_custom("Voice 2", dialogue_naturalness=0.8)

        blended = service.blend_profiles([p1.id, p2.id], name="Blended")

        assert blended.name == "Blended"
        assert 0.4 < blended.blended_parameters.dialogue_naturalness < 0.6

    def test_get_blended(self):
        """Test getting blended voice."""
        service = VoiceProfileService()
        p1 = service.create_custom("Voice 1")
        p2 = service.create_custom("Voice 2")

        created = service.blend_profiles([p1.id, p2.id])
        retrieved = service.get_blended(created.id)

        assert retrieved is not None
        assert retrieved.id == created.id

    def test_list_blended(self):
        """Test listing blended voices."""
        service = VoiceProfileService()
        p1 = service.create_custom("Voice 1")
        p2 = service.create_custom("Voice 2")

        service.blend_profiles([p1.id, p2.id], name="Blend 1")
        service.blend_profiles([p1.id, p2.id], name="Blend 2")

        blended = service.list_blended()
        assert len(blended) == 2

    def test_generate_prompt(self):
        """Test generating prompt through service."""
        service = VoiceProfileService()
        profile = service.get_predefined("hemingway")
        prompt = service.generate_prompt(profile)
        assert len(prompt) > 0
        assert "short" in prompt.lower() or "punchy" in prompt.lower()

    def test_generate_brief_prompt(self):
        """Test generating brief prompt through service."""
        service = VoiceProfileService()
        profile = service.get_predefined("hemingway")
        prompt = service.generate_brief_prompt(profile)
        assert len(prompt) > 0
        assert "Hemingway" in prompt

    def test_generate_blended_prompt(self):
        """Test generating prompt for blended voice."""
        service = VoiceProfileService()
        p1 = service.create_custom("Voice 1")
        p2 = service.create_custom("Voice 2")

        blended = service.blend_profiles([p1.id, p2.id])
        prompt = service.generate_blended_prompt(blended)

        assert len(prompt) > 0

    def test_get_profiles_for_genre(self):
        """Test getting profiles for genre through service."""
        service = VoiceProfileService()

        # Add custom profile with genre
        service.create_custom(
            "Custom Mystery",
            best_for_genres=["mystery", "thriller"],
        )

        profiles = service.get_profiles_for_genre("mystery")
        names = [p.name for p in profiles]

        assert "Christie" in names  # Predefined
        assert "Custom Mystery" in names  # Custom


class TestIntegration:
    """Integration tests for voice profile workflow."""

    def test_full_workflow(self):
        """Test complete voice profile workflow."""
        service = VoiceProfileService()

        # 1. Get predefined profile
        hemingway = service.get_predefined("hemingway")
        assert hemingway is not None

        # 2. Create custom profile
        custom = service.create_custom(
            "My Style",
            description="My personal writing style",
            sentence_rhythm=SentenceRhythm.VARIED,
            dialogue_naturalness=0.85,
        )

        # 3. Blend profiles
        blended = service.blend_profiles(
            [hemingway.id, custom.id],
            weights=[0.6, 0.4],
            name="Hemingway-Custom Blend",
        )

        # 4. Generate prompts
        hem_prompt = service.generate_prompt(hemingway)
        custom_prompt = service.generate_prompt(custom)
        blended_prompt = service.generate_blended_prompt(blended)

        assert len(hem_prompt) > 0
        assert len(custom_prompt) > 0
        assert len(blended_prompt) > 0

    def test_genre_based_selection(self):
        """Test selecting profiles based on genre."""
        service = VoiceProfileService()

        # Get profiles for mystery
        mystery_profiles = service.get_profiles_for_genre("mystery")
        assert len(mystery_profiles) > 0

        # Use Christie for mystery
        christie = service.get_predefined("christie")
        prompt = service.generate_prompt(christie)

        assert "clue" in prompt.lower() or "misdirection" in prompt.lower()


class TestEdgeCases:
    """Tests for edge cases."""

    def test_blend_with_nonexistent_profiles(self):
        """Test blending with nonexistent profile IDs."""
        service = VoiceProfileService()
        blended = service.blend_profiles([uuid4(), uuid4()])
        # Should return empty blended voice
        assert blended.source_profiles == []

    def test_empty_profile_prompt(self):
        """Test generating prompt for minimal profile."""
        generator = VoicePromptGenerator()
        profile = VoiceProfile()
        prompt = generator.generate_prompt(profile)
        # Should still generate some content
        assert isinstance(prompt, str)

    def test_all_numeric_params_extreme(self):
        """Test with extreme numeric parameter values."""
        profile = VoiceProfile(
            parameters=VoiceParameters(
                dialogue_naturalness=1.0,
                philosophical_depth=1.0,
                detail_orientation=1.0,
                sensory_focus=1.0,
                introspection_level=1.0,
                action_focus=1.0,
            )
        )
        generator = VoicePromptGenerator()
        prompt = generator.generate_prompt(profile)
        assert len(prompt) > 0

    def test_profile_with_empty_lists(self):
        """Test profile with empty technique and avoid lists."""
        profile = VoiceProfile(
            signature_techniques=[],
            avoids=[],
            best_for_genres=[],
        )
        generator = VoicePromptGenerator()
        prompt = generator.generate_prompt(profile)
        assert isinstance(prompt, str)


class TestPreDefinedProfileCharacteristics:
    """Test specific characteristics of predefined profiles."""

    def test_hemingway_avoids_adverbs(self):
        """Test that Hemingway profile avoids adverbs."""
        profile = get_voice_profile("hemingway")
        assert "adverbs" in profile.avoids

    def test_king_has_high_dialogue_naturalness(self):
        """Test that King profile has high dialogue naturalness."""
        profile = get_voice_profile("king")
        assert profile.parameters.dialogue_naturalness >= 0.9

    def test_mccarthy_uses_literary_vocabulary(self):
        """Test that McCarthy profile uses literary vocabulary."""
        profile = get_voice_profile("mccarthy")
        assert profile.parameters.vocabulary_level == VocabularyLevel.LITERARY

    def test_gaiman_hypnotic_rhythm(self):
        """Test that Gaiman profile uses hypnotic rhythm."""
        profile = get_voice_profile("gaiman")
        assert profile.parameters.sentence_rhythm == SentenceRhythm.HYPNOTIC

    def test_christie_detail_oriented(self):
        """Test that Christie profile is detail oriented."""
        profile = get_voice_profile("christie")
        assert profile.parameters.detail_orientation >= 0.9

    def test_sanderson_action_focused(self):
        """Test that Sanderson profile is action focused."""
        profile = get_voice_profile("sanderson")
        assert profile.parameters.action_focus >= 0.7
