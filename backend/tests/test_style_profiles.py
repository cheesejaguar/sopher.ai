"""Tests for writing style profiles.

Tests cover:
- All enum definitions
- WritingStyleProfile dataclass
- to_prompt() method generation
- Pre-defined style profiles
- Registry functions
- Custom profile creation
"""

from app.agents.style_profiles import (
    COMMERCIAL_FICTION_STYLE,
    FANTASY_STYLE,
    HEMINGWAY_STYLE,
    HORROR_STYLE,
    LITERARY_FICTION_STYLE,
    MYSTERY_STYLE,
    POV,
    ROMANCE_STYLE,
    SCI_FI_STYLE,
    STYLE_PROFILES,
    THRILLER_STYLE,
    YOUNG_ADULT_STYLE,
    DescriptionDensity,
    DialogueStyle,
    HumorLevel,
    ProseStyle,
    SentenceVariety,
    Tense,
    VocabularyLevel,
    WritingStyleProfile,
    create_custom_profile,
    get_all_style_names,
    get_style_for_genre,
    get_style_profile,
)


class TestProseStyleEnum:
    """Tests for ProseStyle enum."""

    def test_all_values_defined(self):
        """Test that all prose style values are defined."""
        assert ProseStyle.SPARSE == "sparse"
        assert ProseStyle.CONVERSATIONAL == "conversational"
        assert ProseStyle.LYRICAL == "lyrical"
        assert ProseStyle.FORMAL == "formal"
        assert ProseStyle.LITERARY == "literary"

    def test_enum_count(self):
        """Test expected number of prose styles."""
        assert len(ProseStyle) == 5

    def test_is_string_enum(self):
        """Test that ProseStyle is a string enum."""
        for style in ProseStyle:
            assert isinstance(style.value, str)
            assert isinstance(style, str)


class TestDialogueStyleEnum:
    """Tests for DialogueStyle enum."""

    def test_all_values_defined(self):
        """Test that all dialogue style values are defined."""
        assert DialogueStyle.REALISTIC == "realistic"
        assert DialogueStyle.STYLIZED == "stylized"
        assert DialogueStyle.MINIMAL == "minimal"
        assert DialogueStyle.THEATRICAL == "theatrical"

    def test_enum_count(self):
        """Test expected number of dialogue styles."""
        assert len(DialogueStyle) == 4


class TestDescriptionDensityEnum:
    """Tests for DescriptionDensity enum."""

    def test_all_values_defined(self):
        """Test that all description density values are defined."""
        assert DescriptionDensity.MINIMAL == "minimal"
        assert DescriptionDensity.MODERATE == "moderate"
        assert DescriptionDensity.RICH == "rich"

    def test_enum_count(self):
        """Test expected number of density options."""
        assert len(DescriptionDensity) == 3


class TestSentenceVarietyEnum:
    """Tests for SentenceVariety enum."""

    def test_all_values_defined(self):
        """Test that all sentence variety values are defined."""
        assert SentenceVariety.SIMPLE == "simple"
        assert SentenceVariety.VARIED == "varied"
        assert SentenceVariety.COMPLEX == "complex"

    def test_enum_count(self):
        """Test expected number of variety options."""
        assert len(SentenceVariety) == 3


class TestVocabularyLevelEnum:
    """Tests for VocabularyLevel enum."""

    def test_all_values_defined(self):
        """Test that all vocabulary level values are defined."""
        assert VocabularyLevel.ACCESSIBLE == "accessible"
        assert VocabularyLevel.MODERATE == "moderate"
        assert VocabularyLevel.ADVANCED == "advanced"

    def test_enum_count(self):
        """Test expected number of vocabulary levels."""
        assert len(VocabularyLevel) == 3


class TestHumorLevelEnum:
    """Tests for HumorLevel enum."""

    def test_all_values_defined(self):
        """Test that all humor level values are defined."""
        assert HumorLevel.NONE == "none"
        assert HumorLevel.SUBTLE == "subtle"
        assert HumorLevel.MODERATE == "moderate"
        assert HumorLevel.FREQUENT == "frequent"

    def test_enum_count(self):
        """Test expected number of humor levels."""
        assert len(HumorLevel) == 4


class TestPOVEnum:
    """Tests for POV enum."""

    def test_all_values_defined(self):
        """Test that all POV values are defined."""
        assert POV.FIRST_PERSON == "first_person"
        assert POV.SECOND_PERSON == "second_person"
        assert POV.THIRD_PERSON_LIMITED == "third_person_limited"
        assert POV.THIRD_PERSON_OMNISCIENT == "third_person_omniscient"
        assert POV.THIRD_PERSON_OBJECTIVE == "third_person_objective"

    def test_enum_count(self):
        """Test expected number of POV options."""
        assert len(POV) == 5


class TestTenseEnum:
    """Tests for Tense enum."""

    def test_all_values_defined(self):
        """Test that all tense values are defined."""
        assert Tense.PAST == "past"
        assert Tense.PRESENT == "present"

    def test_enum_count(self):
        """Test expected number of tense options."""
        assert len(Tense) == 2


class TestWritingStyleProfile:
    """Tests for WritingStyleProfile dataclass."""

    def test_default_profile(self):
        """Test default profile creation."""
        profile = WritingStyleProfile()

        assert profile.prose_style == ProseStyle.CONVERSATIONAL
        assert profile.dialogue_style == DialogueStyle.REALISTIC
        assert profile.description_density == DescriptionDensity.MODERATE
        assert profile.sentence_variety == SentenceVariety.VARIED
        assert profile.vocabulary_level == VocabularyLevel.MODERATE
        assert profile.humor_level == HumorLevel.NONE
        assert profile.pov == POV.THIRD_PERSON_LIMITED
        assert profile.tense == Tense.PAST
        assert profile.sensory_details is True
        assert profile.internal_monologue is True
        assert profile.show_dont_tell is True
        assert profile.action_to_reflection_ratio == 0.5
        assert profile.scene_transition_style == "smooth"
        assert profile.name is None
        assert profile.description is None

    def test_custom_profile(self):
        """Test custom profile creation."""
        profile = WritingStyleProfile(
            prose_style=ProseStyle.SPARSE,
            dialogue_style=DialogueStyle.MINIMAL,
            description_density=DescriptionDensity.MINIMAL,
            sentence_variety=SentenceVariety.SIMPLE,
            vocabulary_level=VocabularyLevel.ACCESSIBLE,
            humor_level=HumorLevel.SUBTLE,
            pov=POV.FIRST_PERSON,
            tense=Tense.PRESENT,
            sensory_details=False,
            internal_monologue=True,
            show_dont_tell=True,
            action_to_reflection_ratio=0.7,
            scene_transition_style="abrupt",
            name="Custom Test",
            description="A custom test profile",
        )

        assert profile.prose_style == ProseStyle.SPARSE
        assert profile.dialogue_style == DialogueStyle.MINIMAL
        assert profile.pov == POV.FIRST_PERSON
        assert profile.tense == Tense.PRESENT
        assert profile.humor_level == HumorLevel.SUBTLE
        assert profile.sensory_details is False
        assert profile.action_to_reflection_ratio == 0.7
        assert profile.scene_transition_style == "abrupt"
        assert profile.name == "Custom Test"
        assert profile.description == "A custom test profile"


class TestToPrompt:
    """Tests for WritingStyleProfile.to_prompt() method."""

    def test_default_prompt_contains_pov(self):
        """Test that prompt contains POV instruction."""
        profile = WritingStyleProfile()
        prompt = profile.to_prompt()

        assert "third person limited" in prompt.lower()

    def test_default_prompt_contains_tense(self):
        """Test that prompt contains tense instruction."""
        profile = WritingStyleProfile()
        prompt = profile.to_prompt()

        assert "past tense" in prompt.lower()

    def test_default_prompt_contains_prose_style(self):
        """Test that prompt contains prose style instruction."""
        profile = WritingStyleProfile()
        prompt = profile.to_prompt()

        assert "conversational" in prompt.lower()

    def test_default_prompt_contains_dialogue_style(self):
        """Test that prompt contains dialogue style instruction."""
        profile = WritingStyleProfile()
        prompt = profile.to_prompt()

        assert "realistic dialogue" in prompt.lower()

    def test_prompt_includes_sensory_details_when_enabled(self):
        """Test that sensory details instruction is included when enabled."""
        profile = WritingStyleProfile(sensory_details=True)
        prompt = profile.to_prompt()

        assert "sensory" in prompt.lower()

    def test_prompt_excludes_sensory_details_when_disabled(self):
        """Test that sensory details instruction is excluded when disabled."""
        profile = WritingStyleProfile(sensory_details=False)
        prompt = profile.to_prompt()

        assert "sensory details" not in prompt.lower()

    def test_prompt_includes_internal_monologue_when_enabled(self):
        """Test that internal monologue instruction is included when enabled."""
        profile = WritingStyleProfile(internal_monologue=True)
        prompt = profile.to_prompt()

        assert "internal" in prompt.lower()

    def test_prompt_excludes_internal_monologue_when_disabled(self):
        """Test that internal monologue instruction is excluded when disabled."""
        profile = WritingStyleProfile(internal_monologue=False)
        prompt = profile.to_prompt()

        assert "internal thoughts" not in prompt.lower()

    def test_prompt_includes_show_dont_tell_when_enabled(self):
        """Test that show don't tell instruction is included when enabled."""
        profile = WritingStyleProfile(show_dont_tell=True)
        prompt = profile.to_prompt()

        assert "show" in prompt.lower()

    def test_prompt_excludes_show_dont_tell_when_disabled(self):
        """Test that show don't tell instruction is excluded when disabled."""
        profile = WritingStyleProfile(show_dont_tell=False)
        prompt = profile.to_prompt()

        assert "show emotions" not in prompt.lower()

    def test_humor_excluded_when_none(self):
        """Test that humor instruction is excluded when set to none."""
        profile = WritingStyleProfile(humor_level=HumorLevel.NONE)
        prompt = profile.to_prompt()

        assert "humor" not in prompt.lower()
        # Check for "wit " with space to avoid matching "with"
        assert " wit " not in prompt.lower() and "wit where" not in prompt.lower()

    def test_humor_included_when_subtle(self):
        """Test that humor instruction is included when set to subtle."""
        profile = WritingStyleProfile(humor_level=HumorLevel.SUBTLE)
        prompt = profile.to_prompt()

        assert "subtle humor" in prompt.lower() or "wit" in prompt.lower()

    def test_humor_included_when_moderate(self):
        """Test that humor instruction is included when set to moderate."""
        profile = WritingStyleProfile(humor_level=HumorLevel.MODERATE)
        prompt = profile.to_prompt()

        assert "moderate humor" in prompt.lower()

    def test_humor_included_when_frequent(self):
        """Test that humor instruction is included when set to frequent."""
        profile = WritingStyleProfile(humor_level=HumorLevel.FREQUENT)
        prompt = profile.to_prompt()

        assert "frequent humor" in prompt.lower()

    def test_prompt_ends_with_period(self):
        """Test that prompt ends with a period."""
        profile = WritingStyleProfile()
        prompt = profile.to_prompt()

        assert prompt.endswith(".")

    def test_all_pov_options_generate_prompts(self):
        """Test that all POV options generate valid prompts."""
        for pov in POV:
            profile = WritingStyleProfile(pov=pov)
            prompt = profile.to_prompt()
            assert len(prompt) > 0
            assert "person" in prompt.lower() or "you" in prompt.lower()

    def test_all_prose_styles_generate_prompts(self):
        """Test that all prose styles generate valid prompts."""
        for style in ProseStyle:
            profile = WritingStyleProfile(prose_style=style)
            prompt = profile.to_prompt()
            assert len(prompt) > 0


class TestPreDefinedProfiles:
    """Tests for pre-defined style profiles."""

    def test_hemingway_style(self):
        """Test Hemingway style profile."""
        assert HEMINGWAY_STYLE.name == "Hemingway"
        assert HEMINGWAY_STYLE.prose_style == ProseStyle.SPARSE
        assert HEMINGWAY_STYLE.dialogue_style == DialogueStyle.REALISTIC
        assert HEMINGWAY_STYLE.description_density == DescriptionDensity.MINIMAL
        assert HEMINGWAY_STYLE.sentence_variety == SentenceVariety.SIMPLE
        assert HEMINGWAY_STYLE.vocabulary_level == VocabularyLevel.ACCESSIBLE
        assert HEMINGWAY_STYLE.sensory_details is False
        assert HEMINGWAY_STYLE.internal_monologue is False
        assert HEMINGWAY_STYLE.show_dont_tell is True

    def test_literary_fiction_style(self):
        """Test Literary Fiction style profile."""
        assert LITERARY_FICTION_STYLE.name == "Literary Fiction"
        assert LITERARY_FICTION_STYLE.prose_style == ProseStyle.LITERARY
        assert LITERARY_FICTION_STYLE.dialogue_style == DialogueStyle.STYLIZED
        assert LITERARY_FICTION_STYLE.description_density == DescriptionDensity.RICH
        assert LITERARY_FICTION_STYLE.sentence_variety == SentenceVariety.COMPLEX
        assert LITERARY_FICTION_STYLE.vocabulary_level == VocabularyLevel.ADVANCED

    def test_commercial_fiction_style(self):
        """Test Commercial Fiction style profile."""
        assert COMMERCIAL_FICTION_STYLE.name == "Commercial Fiction"
        assert COMMERCIAL_FICTION_STYLE.prose_style == ProseStyle.CONVERSATIONAL
        assert COMMERCIAL_FICTION_STYLE.vocabulary_level == VocabularyLevel.ACCESSIBLE

    def test_romance_style(self):
        """Test Romance style profile."""
        assert ROMANCE_STYLE.name == "Romance"
        assert ROMANCE_STYLE.humor_level == HumorLevel.MODERATE
        assert ROMANCE_STYLE.action_to_reflection_ratio == 0.3
        assert ROMANCE_STYLE.sensory_details is True
        assert ROMANCE_STYLE.internal_monologue is True

    def test_thriller_style(self):
        """Test Thriller style profile."""
        assert THRILLER_STYLE.name == "Thriller"
        assert THRILLER_STYLE.prose_style == ProseStyle.SPARSE
        assert THRILLER_STYLE.description_density == DescriptionDensity.MINIMAL
        assert THRILLER_STYLE.action_to_reflection_ratio == 0.7

    def test_fantasy_style(self):
        """Test Fantasy style profile."""
        assert FANTASY_STYLE.name == "Fantasy"
        assert FANTASY_STYLE.prose_style == ProseStyle.LYRICAL
        assert FANTASY_STYLE.dialogue_style == DialogueStyle.STYLIZED
        assert FANTASY_STYLE.description_density == DescriptionDensity.RICH

    def test_mystery_style(self):
        """Test Mystery style profile."""
        assert MYSTERY_STYLE.name == "Mystery"
        assert MYSTERY_STYLE.pov == POV.FIRST_PERSON
        assert MYSTERY_STYLE.sensory_details is True

    def test_horror_style(self):
        """Test Horror style profile."""
        assert HORROR_STYLE.name == "Horror"
        assert HORROR_STYLE.prose_style == ProseStyle.LITERARY
        assert HORROR_STYLE.dialogue_style == DialogueStyle.MINIMAL
        assert HORROR_STYLE.description_density == DescriptionDensity.RICH
        assert HORROR_STYLE.humor_level == HumorLevel.NONE

    def test_young_adult_style(self):
        """Test Young Adult style profile."""
        assert YOUNG_ADULT_STYLE.name == "Young Adult"
        assert YOUNG_ADULT_STYLE.pov == POV.FIRST_PERSON
        assert YOUNG_ADULT_STYLE.tense == Tense.PRESENT
        assert YOUNG_ADULT_STYLE.vocabulary_level == VocabularyLevel.ACCESSIBLE
        assert YOUNG_ADULT_STYLE.humor_level == HumorLevel.MODERATE

    def test_sci_fi_style(self):
        """Test Science Fiction style profile."""
        assert SCI_FI_STYLE.name == "Science Fiction"
        assert SCI_FI_STYLE.prose_style == ProseStyle.CONVERSATIONAL
        assert SCI_FI_STYLE.vocabulary_level == VocabularyLevel.MODERATE

    def test_all_profiles_have_names(self):
        """Test that all pre-defined profiles have names."""
        profiles = [
            HEMINGWAY_STYLE,
            LITERARY_FICTION_STYLE,
            COMMERCIAL_FICTION_STYLE,
            ROMANCE_STYLE,
            THRILLER_STYLE,
            FANTASY_STYLE,
            MYSTERY_STYLE,
            HORROR_STYLE,
            YOUNG_ADULT_STYLE,
            SCI_FI_STYLE,
        ]
        for profile in profiles:
            assert profile.name is not None
            assert len(profile.name) > 0

    def test_all_profiles_have_descriptions(self):
        """Test that all pre-defined profiles have descriptions."""
        profiles = [
            HEMINGWAY_STYLE,
            LITERARY_FICTION_STYLE,
            COMMERCIAL_FICTION_STYLE,
            ROMANCE_STYLE,
            THRILLER_STYLE,
            FANTASY_STYLE,
            MYSTERY_STYLE,
            HORROR_STYLE,
            YOUNG_ADULT_STYLE,
            SCI_FI_STYLE,
        ]
        for profile in profiles:
            assert profile.description is not None
            assert len(profile.description) > 0

    def test_all_profiles_generate_valid_prompts(self):
        """Test that all pre-defined profiles generate valid prompts."""
        profiles = [
            HEMINGWAY_STYLE,
            LITERARY_FICTION_STYLE,
            COMMERCIAL_FICTION_STYLE,
            ROMANCE_STYLE,
            THRILLER_STYLE,
            FANTASY_STYLE,
            MYSTERY_STYLE,
            HORROR_STYLE,
            YOUNG_ADULT_STYLE,
            SCI_FI_STYLE,
        ]
        for profile in profiles:
            prompt = profile.to_prompt()
            assert len(prompt) > 100  # Reasonable minimum length
            assert prompt.endswith(".")


class TestStyleProfilesRegistry:
    """Tests for STYLE_PROFILES registry."""

    def test_registry_has_all_profiles(self):
        """Test that registry contains all expected profiles."""
        expected_keys = [
            "hemingway",
            "literary_fiction",
            "commercial_fiction",
            "romance",
            "thriller",
            "fantasy",
            "mystery",
            "horror",
            "young_adult",
            "science_fiction",
        ]
        for key in expected_keys:
            assert key in STYLE_PROFILES

    def test_registry_count(self):
        """Test registry contains expected number of profiles."""
        assert len(STYLE_PROFILES) == 10

    def test_registry_values_are_profiles(self):
        """Test that all registry values are WritingStyleProfile instances."""
        for key, profile in STYLE_PROFILES.items():
            assert isinstance(profile, WritingStyleProfile)


class TestGetStyleProfile:
    """Tests for get_style_profile function."""

    def test_get_by_exact_name(self):
        """Test getting profile by exact registry key."""
        profile = get_style_profile("hemingway")
        assert profile is not None
        assert profile.name == "Hemingway"

    def test_get_with_spaces(self):
        """Test getting profile with spaces in name."""
        profile = get_style_profile("literary fiction")
        assert profile is not None
        assert profile.name == "Literary Fiction"

    def test_get_with_hyphens(self):
        """Test getting profile with hyphens in name."""
        profile = get_style_profile("young-adult")
        assert profile is not None
        assert profile.name == "Young Adult"

    def test_get_case_insensitive(self):
        """Test getting profile is case insensitive."""
        profile = get_style_profile("THRILLER")
        assert profile is not None
        assert profile.name == "Thriller"

    def test_get_mixed_case(self):
        """Test getting profile with mixed case."""
        profile = get_style_profile("Science Fiction")
        assert profile is not None
        assert profile.name == "Science Fiction"

    def test_get_nonexistent_returns_none(self):
        """Test getting nonexistent profile returns None."""
        profile = get_style_profile("nonexistent")
        assert profile is None

    def test_get_empty_string_returns_none(self):
        """Test getting empty string returns None."""
        profile = get_style_profile("")
        assert profile is None


class TestGetAllStyleNames:
    """Tests for get_all_style_names function."""

    def test_returns_list(self):
        """Test that function returns a list."""
        names = get_all_style_names()
        assert isinstance(names, list)

    def test_returns_correct_count(self):
        """Test that function returns correct number of names."""
        names = get_all_style_names()
        assert len(names) == 10

    def test_all_names_are_strings(self):
        """Test that all names are strings."""
        names = get_all_style_names()
        for name in names:
            assert isinstance(name, str)

    def test_names_match_registry_keys(self):
        """Test that returned names match registry keys."""
        names = get_all_style_names()
        for name in names:
            assert name in STYLE_PROFILES


class TestGetStyleForGenre:
    """Tests for get_style_for_genre function."""

    def test_romance_genre(self):
        """Test getting style for romance genre."""
        profile = get_style_for_genre("romance")
        assert profile.name == "Romance"

    def test_thriller_genre(self):
        """Test getting style for thriller genre."""
        profile = get_style_for_genre("thriller")
        assert profile.name == "Thriller"

    def test_mystery_genre(self):
        """Test getting style for mystery genre."""
        profile = get_style_for_genre("mystery")
        assert profile.name == "Mystery"

    def test_fantasy_genre(self):
        """Test getting style for fantasy genre."""
        profile = get_style_for_genre("fantasy")
        assert profile.name == "Fantasy"

    def test_science_fiction_genre(self):
        """Test getting style for science fiction genre."""
        profile = get_style_for_genre("science_fiction")
        assert profile.name == "Science Fiction"

    def test_sci_fi_alias(self):
        """Test getting style for sci-fi alias."""
        profile = get_style_for_genre("sci-fi")
        assert profile.name == "Science Fiction"

    def test_horror_genre(self):
        """Test getting style for horror genre."""
        profile = get_style_for_genre("horror")
        assert profile.name == "Horror"

    def test_literary_fiction_genre(self):
        """Test getting style for literary fiction genre."""
        profile = get_style_for_genre("literary_fiction")
        assert profile.name == "Literary Fiction"

    def test_literary_alias(self):
        """Test getting style for literary alias."""
        profile = get_style_for_genre("literary")
        assert profile.name == "Literary Fiction"

    def test_young_adult_genre(self):
        """Test getting style for young adult genre."""
        profile = get_style_for_genre("young_adult")
        assert profile.name == "Young Adult"

    def test_ya_alias(self):
        """Test getting style for ya alias."""
        profile = get_style_for_genre("ya")
        assert profile.name == "Young Adult"

    def test_unknown_genre_returns_commercial(self):
        """Test that unknown genre returns commercial fiction."""
        profile = get_style_for_genre("unknown_genre")
        assert profile.name == "Commercial Fiction"

    def test_genre_case_insensitive(self):
        """Test that genre lookup is case insensitive."""
        profile = get_style_for_genre("ROMANCE")
        assert profile.name == "Romance"

    def test_genre_with_spaces(self):
        """Test that genre with spaces works."""
        profile = get_style_for_genre("young adult")
        assert profile.name == "Young Adult"


class TestCreateCustomProfile:
    """Tests for create_custom_profile function."""

    def test_create_without_base(self):
        """Test creating custom profile without base."""
        profile = create_custom_profile(
            prose_style=ProseStyle.LYRICAL,
            pov=POV.SECOND_PERSON,
        )

        assert profile.prose_style == ProseStyle.LYRICAL
        assert profile.pov == POV.SECOND_PERSON
        # Other fields should be defaults
        assert profile.dialogue_style == DialogueStyle.REALISTIC

    def test_create_with_base(self):
        """Test creating custom profile with base."""
        profile = create_custom_profile(
            base="hemingway",
            humor_level=HumorLevel.SUBTLE,
        )

        # Should inherit from Hemingway
        assert profile.prose_style == ProseStyle.SPARSE
        assert profile.sentence_variety == SentenceVariety.SIMPLE
        # But override humor
        assert profile.humor_level == HumorLevel.SUBTLE

    def test_create_with_invalid_base(self):
        """Test creating custom profile with invalid base."""
        profile = create_custom_profile(
            base="nonexistent",
            prose_style=ProseStyle.FORMAL,
        )

        # Should use provided values
        assert profile.prose_style == ProseStyle.FORMAL
        # Defaults for unspecified
        assert profile.dialogue_style == DialogueStyle.REALISTIC

    def test_create_preserves_base_values(self):
        """Test that base values are preserved when not overridden."""
        profile = create_custom_profile(
            base="thriller",
            name="Custom Thriller",
        )

        # Should inherit all thriller characteristics
        assert profile.prose_style == ProseStyle.SPARSE
        assert profile.action_to_reflection_ratio == 0.7
        assert profile.description_density == DescriptionDensity.MINIMAL
        # Override only name
        assert profile.name == "Custom Thriller"

    def test_create_with_all_overrides(self):
        """Test creating custom profile with all fields overridden."""
        profile = create_custom_profile(
            base="fantasy",
            prose_style=ProseStyle.FORMAL,
            dialogue_style=DialogueStyle.THEATRICAL,
            description_density=DescriptionDensity.MINIMAL,
            sentence_variety=SentenceVariety.SIMPLE,
            vocabulary_level=VocabularyLevel.ACCESSIBLE,
            humor_level=HumorLevel.FREQUENT,
            pov=POV.SECOND_PERSON,
            tense=Tense.PRESENT,
            sensory_details=False,
            internal_monologue=False,
            show_dont_tell=False,
            action_to_reflection_ratio=0.9,
            scene_transition_style="chapter_break",
        )

        assert profile.prose_style == ProseStyle.FORMAL
        assert profile.dialogue_style == DialogueStyle.THEATRICAL
        assert profile.description_density == DescriptionDensity.MINIMAL
        assert profile.sentence_variety == SentenceVariety.SIMPLE
        assert profile.vocabulary_level == VocabularyLevel.ACCESSIBLE
        assert profile.humor_level == HumorLevel.FREQUENT
        assert profile.pov == POV.SECOND_PERSON
        assert profile.tense == Tense.PRESENT
        assert profile.sensory_details is False
        assert profile.internal_monologue is False
        assert profile.show_dont_tell is False
        assert profile.action_to_reflection_ratio == 0.9
        assert profile.scene_transition_style == "chapter_break"

    def test_custom_profile_generates_valid_prompt(self):
        """Test that custom profile generates valid prompt."""
        profile = create_custom_profile(
            base="literary_fiction",
            pov=POV.FIRST_PERSON,
            tense=Tense.PRESENT,
        )

        prompt = profile.to_prompt()
        assert "first person" in prompt.lower()
        assert "present tense" in prompt.lower()


class TestIntegration:
    """Integration tests for style profiles."""

    def test_full_workflow(self):
        """Test a typical workflow using style profiles."""
        # Get available styles
        style_names = get_all_style_names()
        assert len(style_names) > 0

        # Get style for a genre
        genre_style = get_style_for_genre("mystery")
        assert genre_style.name == "Mystery"

        # Customize it
        custom_style = create_custom_profile(
            base="mystery",
            humor_level=HumorLevel.SUBTLE,
            action_to_reflection_ratio=0.6,
        )

        # Generate prompt
        prompt = custom_style.to_prompt()
        assert len(prompt) > 100
        assert "first person" in prompt.lower()  # Mystery uses first person
        assert "subtle humor" in prompt.lower() or "wit" in prompt.lower()

    def test_all_genres_have_distinct_profiles(self):
        """Test that different genres have distinct style configurations."""
        thriller = get_style_for_genre("thriller")
        romance = get_style_for_genre("romance")
        horror = get_style_for_genre("horror")

        # These should be different
        assert thriller.action_to_reflection_ratio != romance.action_to_reflection_ratio
        assert thriller.humor_level != romance.humor_level
        assert horror.dialogue_style != thriller.dialogue_style
