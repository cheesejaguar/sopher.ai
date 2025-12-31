"""Tests for the content filtering service.

Tests cover:
- Audience level parsing
- Content guideline generation
- Content validation
- Prompt building
"""


from app.schemas import ProjectSettings
from app.services.content_filter import (
    AudienceLevel,
    ContentFilterService,
    ContentValidator,
    build_content_filter_prompt,
)


class TestAudienceLevelParsing:
    """Tests for audience level parsing."""

    def test_parse_children_explicit(self):
        """Test parsing explicit children audience."""
        assert (
            ContentFilterService.parse_target_audience("children")
            == AudienceLevel.CHILDREN
        )

    def test_parse_children_with_ages(self):
        """Test parsing children audience with age range."""
        assert (
            ContentFilterService.parse_target_audience("kids ages 6-10")
            == AudienceLevel.CHILDREN
        )

    def test_parse_children_elementary(self):
        """Test parsing elementary school audience."""
        assert (
            ContentFilterService.parse_target_audience("elementary school")
            == AudienceLevel.CHILDREN
        )

    def test_parse_middle_grade_explicit(self):
        """Test parsing explicit middle grade audience."""
        assert (
            ContentFilterService.parse_target_audience("middle grade")
            == AudienceLevel.MIDDLE_GRADE
        )

    def test_parse_middle_grade_hyphenated(self):
        """Test parsing hyphenated middle-grade audience."""
        assert (
            ContentFilterService.parse_target_audience("middle-grade readers")
            == AudienceLevel.MIDDLE_GRADE
        )

    def test_parse_middle_grade_tween(self):
        """Test parsing tween audience."""
        assert (
            ContentFilterService.parse_target_audience("tween readers")
            == AudienceLevel.MIDDLE_GRADE
        )

    def test_parse_middle_grade_ages(self):
        """Test parsing middle grade with age range."""
        assert (
            ContentFilterService.parse_target_audience("ages 10-14")
            == AudienceLevel.MIDDLE_GRADE
        )

    def test_parse_young_adult_explicit(self):
        """Test parsing explicit young adult audience."""
        assert (
            ContentFilterService.parse_target_audience("young adult")
            == AudienceLevel.YOUNG_ADULT
        )

    def test_parse_young_adult_ya(self):
        """Test parsing YA abbreviation."""
        assert (
            ContentFilterService.parse_target_audience("YA fiction")
            == AudienceLevel.YOUNG_ADULT
        )

    def test_parse_young_adult_teen(self):
        """Test parsing teen audience."""
        assert (
            ContentFilterService.parse_target_audience("teenagers")
            == AudienceLevel.YOUNG_ADULT
        )

    def test_parse_young_adult_ages(self):
        """Test parsing young adult with age range."""
        assert (
            ContentFilterService.parse_target_audience("ages 14-18")
            == AudienceLevel.YOUNG_ADULT
        )

    def test_parse_adult_explicit(self):
        """Test parsing explicit adult audience."""
        assert (
            ContentFilterService.parse_target_audience("adult")
            == AudienceLevel.ADULT
        )

    def test_parse_adult_general(self):
        """Test parsing general adult audience."""
        assert (
            ContentFilterService.parse_target_audience("general adult")
            == AudienceLevel.ADULT
        )

    def test_parse_adult_default(self):
        """Test default to adult for unknown audience."""
        assert (
            ContentFilterService.parse_target_audience("mature readers")
            == AudienceLevel.ADULT
        )

    def test_parse_case_insensitive(self):
        """Test audience parsing is case insensitive."""
        assert (
            ContentFilterService.parse_target_audience("CHILDREN")
            == AudienceLevel.CHILDREN
        )
        assert (
            ContentFilterService.parse_target_audience("Young Adult")
            == AudienceLevel.YOUNG_ADULT
        )


class TestContentGuidelinesGeneration:
    """Tests for content guidelines generation."""

    def test_children_audience_defaults(self):
        """Test children audience with default settings."""
        settings = ProjectSettings(target_audience="children")
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert guidelines.audience_level == AudienceLevel.CHILDREN
        assert "No profanity" in guidelines.profanity_instruction
        assert "No mature themes" in guidelines.mature_content_instruction

    def test_children_violence_clamped(self):
        """Test violence level is clamped for children."""
        # Even with graphic setting, children get mild
        settings = ProjectSettings(
            target_audience="children", violence_level="graphic"
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert "mild" in guidelines.violence_instruction.lower() or \
               "no violence" in guidelines.violence_instruction.lower()

    def test_children_profanity_override(self):
        """Test profanity is always off for children."""
        settings = ProjectSettings(target_audience="children", profanity=True)
        guidelines = ContentFilterService.generate_guidelines(settings)

        # Children should never have actual profanity
        assert "No profanity" in guidelines.profanity_instruction or \
               "mild exclamations" in guidelines.profanity_instruction

    def test_children_auto_avoid_topics(self):
        """Test children get auto-avoided topics."""
        settings = ProjectSettings(target_audience="children")
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert "death of main characters" in guidelines.avoid_topics
        assert "substance abuse" in guidelines.avoid_topics

    def test_middle_grade_settings(self):
        """Test middle grade audience settings."""
        settings = ProjectSettings(
            target_audience="middle grade",
            violence_level="moderate",
            profanity=False,
            mature_content=False,
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert guidelines.audience_level == AudienceLevel.MIDDLE_GRADE
        assert "moderate" in guidelines.violence_instruction.lower() or \
               "Some physical conflict" in guidelines.violence_instruction

    def test_middle_grade_graphic_violence_clamped(self):
        """Test graphic violence is clamped to moderate for middle grade."""
        settings = ProjectSettings(
            target_audience="middle grade", violence_level="graphic"
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        # Should be clamped to moderate
        assert "graphic" not in guidelines.violence_instruction.lower() or \
               guidelines.violence_instruction != ContentFilterService.VIOLENCE_GUIDELINES[
                   AudienceLevel.ADULT
               ]["graphic"]

    def test_young_adult_full_range(self):
        """Test young adult can access full violence range."""
        settings = ProjectSettings(
            target_audience="young adult",
            violence_level="graphic",
            profanity=True,
            mature_content=True,
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert guidelines.audience_level == AudienceLevel.YOUNG_ADULT
        assert "profanity acceptable" in guidelines.profanity_instruction.lower() or \
               "Moderate profanity" in guidelines.profanity_instruction

    def test_adult_settings(self):
        """Test adult audience with all options enabled."""
        settings = ProjectSettings(
            target_audience="adult",
            violence_level="graphic",
            profanity=True,
            mature_content=True,
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert guidelines.audience_level == AudienceLevel.ADULT
        assert "Profanity allowed" in guidelines.profanity_instruction
        assert "Mature themes allowed" in guidelines.mature_content_instruction

    def test_adult_no_violence(self):
        """Test adult audience with no violence."""
        settings = ProjectSettings(
            target_audience="adult", violence_level="none"
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert "minimize" in guidelines.violence_instruction.lower() or \
               "psychological" in guidelines.violence_instruction.lower()

    def test_custom_avoid_topics(self):
        """Test custom avoid topics are preserved."""
        settings = ProjectSettings(
            target_audience="adult",
            avoid_topics=["spiders", "heights"],
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert "spiders" in guidelines.avoid_topics
        assert "heights" in guidelines.avoid_topics

    def test_vocabulary_level_children(self):
        """Test children get simple vocabulary guidance."""
        settings = ProjectSettings(target_audience="children")
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert "simple" in guidelines.vocabulary_level.lower()

    def test_vocabulary_level_adult(self):
        """Test adults get full vocabulary range."""
        settings = ProjectSettings(target_audience="adult")
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert "full" in guidelines.vocabulary_level.lower() or \
               "range" in guidelines.vocabulary_level.lower()


class TestContentGuidelinesPrompt:
    """Tests for content guidelines prompt generation."""

    def test_to_prompt_section_contains_header(self):
        """Test prompt section contains header."""
        settings = ProjectSettings(target_audience="children")
        guidelines = ContentFilterService.generate_guidelines(settings)
        prompt = guidelines.to_prompt_section()

        assert "## Content Guidelines" in prompt

    def test_to_prompt_section_contains_audience(self):
        """Test prompt section contains audience level."""
        settings = ProjectSettings(target_audience="middle grade")
        guidelines = ContentFilterService.generate_guidelines(settings)
        prompt = guidelines.to_prompt_section()

        assert "Middle Grade" in prompt

    def test_to_prompt_section_contains_restrictions(self):
        """Test prompt section contains all restriction types."""
        settings = ProjectSettings(target_audience="adult")
        guidelines = ContentFilterService.generate_guidelines(settings)
        prompt = guidelines.to_prompt_section()

        assert "Violence:" in prompt
        assert "Language:" in prompt
        assert "Mature Themes:" in prompt

    def test_to_prompt_section_contains_avoid_topics(self):
        """Test prompt section contains avoid topics when present."""
        settings = ProjectSettings(
            target_audience="adult", avoid_topics=["spiders"]
        )
        guidelines = ContentFilterService.generate_guidelines(settings)
        prompt = guidelines.to_prompt_section()

        assert "Topics to Avoid" in prompt
        assert "spiders" in prompt

    def test_to_prompt_section_mandatory_warning(self):
        """Test prompt section contains mandatory warning."""
        settings = ProjectSettings(target_audience="children")
        guidelines = ContentFilterService.generate_guidelines(settings)
        prompt = guidelines.to_prompt_section()

        assert "mandatory" in prompt.lower()


class TestContentValidator:
    """Tests for content validation."""

    def test_validate_clean_content(self):
        """Test validation passes for clean content."""
        settings = ProjectSettings(target_audience="children")
        guidelines = ContentFilterService.generate_guidelines(settings)

        content = "The dragon flew through the sky and landed gently on the hill."
        is_valid, issues = ContentValidator.validate_content(content, guidelines)

        assert is_valid
        assert len(issues) == 0

    def test_validate_detects_profanity(self):
        """Test validation detects profanity."""
        settings = ProjectSettings(target_audience="children")
        guidelines = ContentFilterService.generate_guidelines(settings)

        content = "The hero said damn when he saw the dragon."
        is_valid, issues = ContentValidator.validate_content(content, guidelines)

        assert not is_valid
        assert any("damn" in issue for issue in issues)

    def test_validate_allows_profanity_when_enabled(self):
        """Test validation allows profanity for adult with profanity enabled."""
        settings = ProjectSettings(target_audience="adult", profanity=True)
        guidelines = ContentFilterService.generate_guidelines(settings)

        content = "The hero said damn when he saw the dragon."
        is_valid, issues = ContentValidator.validate_content(content, guidelines)

        # Adult with profanity enabled should be valid
        assert is_valid or not any("Profanity" in issue for issue in issues)

    def test_validate_detects_graphic_violence(self):
        """Test validation detects graphic violence for mild settings."""
        settings = ProjectSettings(
            target_audience="children", violence_level="none"
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        content = "Blood pooled on the floor as the villain fell."
        is_valid, issues = ContentValidator.validate_content(content, guidelines)

        assert not is_valid
        assert any("blood pooled" in issue.lower() for issue in issues)

    def test_validate_allows_violence_when_enabled(self):
        """Test validation allows violence for adult with graphic enabled."""
        settings = ProjectSettings(
            target_audience="adult", violence_level="graphic"
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        content = "Blood pooled on the floor as the villain fell."
        is_valid, issues = ContentValidator.validate_content(content, guidelines)

        assert is_valid

    def test_validate_detects_mature_content_children(self):
        """Test validation detects mature content for children."""
        settings = ProjectSettings(target_audience="children")
        guidelines = ContentFilterService.generate_guidelines(settings)

        content = "She began to undress as the scene faded."
        is_valid, issues = ContentValidator.validate_content(content, guidelines)

        assert not is_valid
        assert any("undress" in issue for issue in issues)

    def test_validate_detects_avoided_topics(self):
        """Test validation detects avoided topics."""
        settings = ProjectSettings(
            target_audience="adult", avoid_topics=["spiders"]
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        content = "A giant spiders crawled across the ceiling."
        is_valid, issues = ContentValidator.validate_content(content, guidelines)

        assert not is_valid
        assert any("spiders" in issue for issue in issues)

    def test_validate_moderate_violence_for_mild_setting(self):
        """Test moderate violence indicators flagged for mild setting."""
        settings = ProjectSettings(
            target_audience="middle grade", violence_level="mild"
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        # Use a clearly graphic violence indicator
        content = "Blood spray covered the wall as the villain fell."
        is_valid, issues = ContentValidator.validate_content(content, guidelines)

        # "blood spray" is a moderate indicator, should be flagged for mild
        assert not is_valid
        assert any("blood spray" in issue.lower() for issue in issues)


class TestBuildContentFilterPrompt:
    """Tests for build_content_filter_prompt function."""

    def test_build_prompt_none_settings(self):
        """Test building prompt with None settings returns empty."""
        result = build_content_filter_prompt(None)
        assert result == ""

    def test_build_prompt_returns_string(self):
        """Test building prompt returns non-empty string."""
        settings = ProjectSettings(target_audience="children")
        result = build_content_filter_prompt(settings)

        assert isinstance(result, str)
        assert len(result) > 0

    def test_build_prompt_contains_guidelines(self):
        """Test built prompt contains guidelines."""
        settings = ProjectSettings(target_audience="young adult")
        result = build_content_filter_prompt(settings)

        assert "Content Guidelines" in result
        assert "Young Adult" in result

    def test_build_prompt_different_audiences(self):
        """Test different audiences produce different prompts."""
        children_settings = ProjectSettings(target_audience="children")
        adult_settings = ProjectSettings(target_audience="adult")

        children_prompt = build_content_filter_prompt(children_settings)
        adult_prompt = build_content_filter_prompt(adult_settings)

        assert children_prompt != adult_prompt
        assert "Children" in children_prompt
        assert "Adult" in adult_prompt


class TestAudienceLevelEnum:
    """Tests for AudienceLevel enum."""

    def test_audience_level_values(self):
        """Test audience level enum values."""
        assert AudienceLevel.CHILDREN.value == "children"
        assert AudienceLevel.MIDDLE_GRADE.value == "middle_grade"
        assert AudienceLevel.YOUNG_ADULT.value == "young_adult"
        assert AudienceLevel.ADULT.value == "adult"

    def test_audience_level_is_string_enum(self):
        """Test audience level is a string enum."""
        assert isinstance(AudienceLevel.CHILDREN.value, str)
        assert str(AudienceLevel.CHILDREN) == "AudienceLevel.CHILDREN"


class TestEdgeCases:
    """Edge case tests for content filtering."""

    def test_empty_avoid_topics(self):
        """Test handling of empty avoid topics."""
        settings = ProjectSettings(target_audience="adult", avoid_topics=[])
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert isinstance(guidelines.avoid_topics, list)

    def test_none_avoid_topics(self):
        """Test handling of None avoid topics."""
        settings = ProjectSettings(target_audience="adult", avoid_topics=None)
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert isinstance(guidelines.avoid_topics, list)

    def test_many_avoid_topics(self):
        """Test handling of many avoid topics."""
        topics = [f"topic_{i}" for i in range(20)]
        settings = ProjectSettings(target_audience="adult", avoid_topics=topics)
        guidelines = ContentFilterService.generate_guidelines(settings)

        for topic in topics:
            assert topic in guidelines.avoid_topics

    def test_special_characters_in_audience(self):
        """Test parsing audience with special characters."""
        assert (
            ContentFilterService.parse_target_audience("middle-grade (ages 10-14)")
            == AudienceLevel.MIDDLE_GRADE
        )

    def test_very_long_content_validation(self):
        """Test validation of very long content."""
        settings = ProjectSettings(target_audience="adult")
        guidelines = ContentFilterService.generate_guidelines(settings)

        # Create long clean content
        content = "The hero walked through the forest. " * 1000
        is_valid, issues = ContentValidator.validate_content(content, guidelines)

        assert is_valid
        assert len(issues) == 0

    def test_unicode_content_validation(self):
        """Test validation handles unicode content."""
        settings = ProjectSettings(target_audience="adult", profanity=True)
        guidelines = ContentFilterService.generate_guidelines(settings)

        content = "The hero said \u201cHello\u201d in Japanese: \u3053\u3093\u306b\u3061\u306f"
        is_valid, issues = ContentValidator.validate_content(content, guidelines)

        assert is_valid


class TestIntegrationScenarios:
    """Integration tests for realistic scenarios."""

    def test_childrens_dragon_book_scenario(self):
        """Test scenario: 12-year-old wanting dragon books."""
        settings = ProjectSettings(
            target_audience="middle grade 10-14",
            violence_level="mild",
            profanity=False,
            mature_content=False,
            avoid_topics=["death", "serious injury"],
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert guidelines.audience_level == AudienceLevel.MIDDLE_GRADE
        assert "death" in guidelines.avoid_topics

        # Valid dragon content
        content = """
        The young dragon stretched its wings and soared above the mountains.
        Lily laughed with joy as she rode on its back, the wind whipping through
        her hair. Below, the village looked like a collection of tiny toys.
        """
        is_valid, issues = ContentValidator.validate_content(content, guidelines)
        assert is_valid

    def test_adult_fantasy_scenario(self):
        """Test scenario: adult fantasy with mature content."""
        settings = ProjectSettings(
            target_audience="adult",
            violence_level="graphic",
            profanity=True,
            mature_content=True,
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert guidelines.audience_level == AudienceLevel.ADULT
        assert "Graphic violence" in guidelines.violence_instruction or \
               "allowed" in guidelines.violence_instruction.lower()

        prompt = guidelines.to_prompt_section()
        assert "Adult" in prompt

    def test_young_adult_romance_scenario(self):
        """Test scenario: YA romance with appropriate restrictions."""
        settings = ProjectSettings(
            target_audience="young adult teens",
            violence_level="mild",
            profanity=False,
            mature_content=True,  # Can handle mature themes, not explicit
        )
        guidelines = ContentFilterService.generate_guidelines(settings)

        assert guidelines.audience_level == AudienceLevel.YOUNG_ADULT
        assert "restraint" in guidelines.mature_content_instruction.lower() or \
               "No explicit" in guidelines.mature_content_instruction
