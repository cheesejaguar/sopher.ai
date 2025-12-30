"""Tests for project settings schemas."""

import pytest
from pydantic import ValidationError

from app.schemas import (
    CharacterProfile,
    ProjectSettings,
    WorldBuildingElement,
)


class TestCharacterProfile:
    """Tests for CharacterProfile schema."""

    def test_valid_minimal_character(self):
        """Test creating a character with minimal required fields."""
        character = CharacterProfile(
            name="John Doe", description="A mysterious stranger with a hidden past."
        )
        assert character.name == "John Doe"
        assert character.role == "supporting"  # default
        assert character.personality_traits == []

    def test_valid_full_character(self):
        """Test creating a character with all fields."""
        character = CharacterProfile(
            name="Elena Martinez",
            role="protagonist",
            description="A brilliant detective haunted by her past cases.",
            personality_traits=["determined", "empathetic", "secretive"],
            backstory="Former FBI agent who left after a case went wrong.",
            goals="Find the truth about her partner's disappearance.",
            conflicts="Her pursuit of truth conflicts with protecting her family.",
            relationships={"Marcus": "Former partner, now missing", "Sarah": "Daughter"},
            appearance="Tall, dark hair, sharp eyes that miss nothing.",
            voice_notes="Speaks in short, clipped sentences when stressed.",
        )
        assert character.role == "protagonist"
        assert len(character.personality_traits) == 3
        assert "Marcus" in character.relationships

    def test_character_name_too_short(self):
        """Test that empty name is rejected."""
        with pytest.raises(ValidationError):
            CharacterProfile(name="", description="Valid description here.")

    def test_character_description_too_short(self):
        """Test that short description is rejected."""
        with pytest.raises(ValidationError):
            CharacterProfile(name="John", description="Too short")

    def test_character_invalid_role(self):
        """Test that invalid role is rejected."""
        with pytest.raises(ValidationError):
            CharacterProfile(
                name="John",
                role="villain",  # Not a valid role
                description="Valid description here.",
            )


class TestWorldBuildingElement:
    """Tests for WorldBuildingElement schema."""

    def test_valid_location(self):
        """Test creating a location element."""
        element = WorldBuildingElement(
            name="The Crystal City",
            category="location",
            description="A gleaming metropolis built from magical crystals that glow at night.",
            rules=["Crystals respond to emotion", "Only royalty can enter the central tower"],
            related_elements=["The Crystal Mines", "Queen Elara"],
        )
        assert element.category == "location"
        assert len(element.rules) == 2

    def test_valid_magic_system(self):
        """Test creating a magic system element."""
        element = WorldBuildingElement(
            name="Elemental Binding",
            category="magic_system",
            description="Magic users bind elemental spirits to perform feats of power. "
            "Each binding requires a physical token and a piece of the mage's soul.",
        )
        assert element.category == "magic_system"

    def test_element_name_required(self):
        """Test that name is required."""
        with pytest.raises(ValidationError):
            WorldBuildingElement(
                category="location", description="A valid description that is long enough."
            )

    def test_element_invalid_category(self):
        """Test that invalid category is rejected."""
        with pytest.raises(ValidationError):
            WorldBuildingElement(
                name="Test Element",
                category="invalid_category",
                description="A valid description that is long enough.",
            )


class TestProjectSettings:
    """Tests for ProjectSettings schema."""

    def test_default_settings(self):
        """Test that default settings are applied."""
        settings = ProjectSettings()
        assert settings.target_audience == "general adult"
        assert settings.tone == "serious"
        assert settings.pov == "third_person_limited"
        assert settings.tense == "past"
        assert settings.chapter_length_target == 3000
        assert settings.dialogue_style == "moderate"
        assert settings.prose_style == "descriptive"
        assert settings.pacing == "medium"
        assert settings.mature_content is False
        assert settings.violence_level == "mild"
        assert settings.profanity is False

    def test_custom_settings(self):
        """Test creating settings with custom values."""
        settings = ProjectSettings(
            target_audience="young adult",
            tone="humorous",
            pov="first_person",
            tense="present",
            chapter_length_target=2000,
            dialogue_style="heavy",
            prose_style="minimal",
            pacing="fast",
            themes=["coming of age", "friendship", "adventure"],
        )
        assert settings.tone == "humorous"
        assert settings.pov == "first_person"
        assert len(settings.themes) == 3

    def test_settings_with_character_bible(self):
        """Test settings with character bible."""
        settings = ProjectSettings(
            character_bible={
                "hero": CharacterProfile(
                    name="Max Sterling",
                    role="protagonist",
                    description="A young inventor with big dreams and bigger problems.",
                ),
                "mentor": CharacterProfile(
                    name="Professor Oak",
                    role="supporting",
                    description="A wise old scientist who sees potential in Max.",
                ),
            }
        )
        assert len(settings.character_bible) == 2
        assert settings.character_bible["hero"].role == "protagonist"

    def test_settings_with_world_building(self):
        """Test settings with world building elements."""
        settings = ProjectSettings(
            world_building={
                "main_city": WorldBuildingElement(
                    name="Neo Tokyo",
                    category="location",
                    description="A sprawling cyberpunk metropolis where the story unfolds.",
                ),
                "tech": WorldBuildingElement(
                    name="Neural Interface",
                    category="technology",
                    description="Brain-computer interfaces that allow direct mental communication.",
                ),
            }
        )
        assert len(settings.world_building) == 2
        assert settings.world_building["main_city"].category == "location"

    def test_chapter_length_minimum(self):
        """Test that chapter length has minimum validation."""
        with pytest.raises(ValidationError):
            ProjectSettings(chapter_length_target=100)  # Below 500 minimum

    def test_chapter_length_maximum(self):
        """Test that chapter length has maximum validation."""
        with pytest.raises(ValidationError):
            ProjectSettings(chapter_length_target=20000)  # Above 10000 maximum

    def test_invalid_tone(self):
        """Test that invalid tone is rejected."""
        with pytest.raises(ValidationError):
            ProjectSettings(tone="invalid_tone")

    def test_invalid_pov(self):
        """Test that invalid POV is rejected."""
        with pytest.raises(ValidationError):
            ProjectSettings(pov="fourth_person")

    def test_invalid_tense(self):
        """Test that invalid tense is rejected."""
        with pytest.raises(ValidationError):
            ProjectSettings(tense="future")

    def test_content_settings(self):
        """Test content preference settings."""
        settings = ProjectSettings(
            mature_content=True,
            violence_level="graphic",
            profanity=True,
            avoid_topics=["self-harm", "explicit content"],
        )
        assert settings.mature_content is True
        assert settings.violence_level == "graphic"
        assert len(settings.avoid_topics) == 2

    def test_writing_influences(self):
        """Test writing influences field."""
        settings = ProjectSettings(
            writing_influences=["Stephen King", "Neil Gaiman", "Ursula K. Le Guin"]
        )
        assert len(settings.writing_influences) == 3

    def test_special_instructions(self):
        """Test special instructions field."""
        settings = ProjectSettings(
            special_instructions="Focus on emotional depth over action. "
            "Use metaphors related to the ocean throughout."
        )
        assert "emotional depth" in settings.special_instructions


class TestProjectSettingsIntegration:
    """Integration tests for ProjectSettings with other schemas."""

    def test_full_project_settings(self):
        """Test creating a complete project settings object."""
        settings = ProjectSettings(
            target_audience="science fiction fans",
            tone="suspenseful",
            pov="third_person_omniscient",
            tense="past",
            chapter_length_target=4000,
            chapter_structure="Opening hook, character moment, plot advancement, cliffhanger",
            character_bible={
                "captain": CharacterProfile(
                    name="Captain Sarah Chen",
                    role="protagonist",
                    description="A seasoned starship captain facing her greatest challenge.",
                    personality_traits=["brave", "analytical", "haunted by past decisions"],
                    goals="Protect her crew and complete the mission.",
                    voice_notes="Calm under pressure, uses technical jargon.",
                )
            },
            world_building={
                "ship": WorldBuildingElement(
                    name="ISS Horizon",
                    category="technology",
                    description="A deep space exploration vessel, humanity's most advanced ship.",
                    rules=["FTL travel damages the hull", "AI cannot override human commands"],
                )
            },
            dialogue_style="moderate",
            prose_style="descriptive",
            pacing="medium",
            mature_content=False,
            violence_level="moderate",
            profanity=False,
            themes=["exploration", "sacrifice", "what it means to be human"],
            writing_influences=["Arthur C. Clarke", "Becky Chambers"],
            special_instructions="Include moments of wonder at the cosmos.",
        )

        # Verify all sections are properly set
        assert settings.tone == "suspenseful"
        assert settings.character_bible["captain"].role == "protagonist"
        assert settings.world_building["ship"].category == "technology"
        assert "exploration" in settings.themes
        assert "Arthur C. Clarke" in settings.writing_influences
