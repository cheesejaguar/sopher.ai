"""Writing style profiles for chapter generation.

This module provides comprehensive writing style profiles that can be applied
to chapter generation to ensure consistent voice, prose style, and quality.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ProseStyle(str, Enum):
    """Prose style options."""

    SPARSE = "sparse"
    CONVERSATIONAL = "conversational"
    LYRICAL = "lyrical"
    FORMAL = "formal"
    LITERARY = "literary"


class DialogueStyle(str, Enum):
    """Dialogue style options."""

    REALISTIC = "realistic"
    STYLIZED = "stylized"
    MINIMAL = "minimal"
    THEATRICAL = "theatrical"


class DescriptionDensity(str, Enum):
    """Description density options."""

    MINIMAL = "minimal"
    MODERATE = "moderate"
    RICH = "rich"


class SentenceVariety(str, Enum):
    """Sentence structure variety options."""

    SIMPLE = "simple"
    VARIED = "varied"
    COMPLEX = "complex"


class VocabularyLevel(str, Enum):
    """Vocabulary level options."""

    ACCESSIBLE = "accessible"
    MODERATE = "moderate"
    ADVANCED = "advanced"


class HumorLevel(str, Enum):
    """Humor level options."""

    NONE = "none"
    SUBTLE = "subtle"
    MODERATE = "moderate"
    FREQUENT = "frequent"


class POV(str, Enum):
    """Point of view options."""

    FIRST_PERSON = "first_person"
    SECOND_PERSON = "second_person"
    THIRD_PERSON_LIMITED = "third_person_limited"
    THIRD_PERSON_OMNISCIENT = "third_person_omniscient"
    THIRD_PERSON_OBJECTIVE = "third_person_objective"


class Tense(str, Enum):
    """Narrative tense options."""

    PAST = "past"
    PRESENT = "present"


@dataclass
class WritingStyleProfile:
    """Comprehensive writing style profile for chapter generation."""

    # Core style settings
    prose_style: ProseStyle = ProseStyle.CONVERSATIONAL
    dialogue_style: DialogueStyle = DialogueStyle.REALISTIC
    description_density: DescriptionDensity = DescriptionDensity.MODERATE
    sentence_variety: SentenceVariety = SentenceVariety.VARIED
    vocabulary_level: VocabularyLevel = VocabularyLevel.MODERATE
    humor_level: HumorLevel = HumorLevel.NONE

    # Narrative settings
    pov: POV = POV.THIRD_PERSON_LIMITED
    tense: Tense = Tense.PAST

    # Content preferences
    sensory_details: bool = True
    internal_monologue: bool = True
    show_dont_tell: bool = True

    # Pacing preferences
    action_to_reflection_ratio: float = 0.5  # 0.0 = all reflection, 1.0 = all action
    scene_transition_style: str = "smooth"  # "smooth", "abrupt", "chapter_break"

    # Name for reference
    name: Optional[str] = None
    description: Optional[str] = None

    def to_prompt(self) -> str:
        """Generate a style prompt for LLM generation."""
        parts = []

        # POV and tense
        pov_descriptions = {
            POV.FIRST_PERSON: "Write in first person perspective",
            POV.SECOND_PERSON: "Write in second person, addressing the reader as 'you'",
            POV.THIRD_PERSON_LIMITED: "Write in third person limited, staying close to the POV character's thoughts and perceptions",
            POV.THIRD_PERSON_OMNISCIENT: "Write in third person omniscient with access to all characters' thoughts",
            POV.THIRD_PERSON_OBJECTIVE: "Write in third person objective, describing only external actions without internal thoughts",
        }
        parts.append(pov_descriptions[self.pov])

        tense_descriptions = {
            Tense.PAST: "Use past tense throughout",
            Tense.PRESENT: "Use present tense for immediacy",
        }
        parts.append(tense_descriptions[self.tense])

        # Prose style
        prose_descriptions = {
            ProseStyle.SPARSE: "Use sparse, minimalist prose - every word must earn its place. Short sentences. No purple prose.",
            ProseStyle.CONVERSATIONAL: "Use natural, conversational prose that flows easily",
            ProseStyle.LYRICAL: "Use lyrical, poetic prose with rich imagery and rhythm",
            ProseStyle.FORMAL: "Use formal, polished prose with precise language",
            ProseStyle.LITERARY: "Use literary prose with careful attention to craft and style",
        }
        parts.append(prose_descriptions[self.prose_style])

        # Dialogue style
        dialogue_descriptions = {
            DialogueStyle.REALISTIC: "Write natural, realistic dialogue that sounds like real speech",
            DialogueStyle.STYLIZED: "Write stylized dialogue with distinct character voices",
            DialogueStyle.MINIMAL: "Keep dialogue minimal and impactful",
            DialogueStyle.THEATRICAL: "Write dramatic, theatrical dialogue",
        }
        parts.append(dialogue_descriptions[self.dialogue_style])

        # Description density
        density_descriptions = {
            DescriptionDensity.MINIMAL: "Keep descriptions brief and functional",
            DescriptionDensity.MODERATE: "Include balanced descriptions that set the scene without overloading",
            DescriptionDensity.RICH: "Include rich, detailed descriptions of settings and characters",
        }
        parts.append(density_descriptions[self.description_density])

        # Sentence variety
        sentence_descriptions = {
            SentenceVariety.SIMPLE: "Use mostly simple, clear sentences",
            SentenceVariety.VARIED: "Vary sentence length and structure for rhythm",
            SentenceVariety.COMPLEX: "Use complex sentence structures for sophistication",
        }
        parts.append(sentence_descriptions[self.sentence_variety])

        # Vocabulary
        vocab_descriptions = {
            VocabularyLevel.ACCESSIBLE: "Use accessible vocabulary for broad readability",
            VocabularyLevel.MODERATE: "Use moderate vocabulary with occasional elevated words",
            VocabularyLevel.ADVANCED: "Use advanced vocabulary appropriate for literary fiction",
        }
        parts.append(vocab_descriptions[self.vocabulary_level])

        # Humor
        if self.humor_level != HumorLevel.NONE:
            humor_descriptions = {
                HumorLevel.SUBTLE: "Include subtle humor and wit where appropriate",
                HumorLevel.MODERATE: "Include moderate humor to lighten the narrative",
                HumorLevel.FREQUENT: "Include frequent humor and comedic elements",
            }
            parts.append(humor_descriptions[self.humor_level])

        # Content preferences
        if self.sensory_details:
            parts.append("Include vivid sensory details (sight, sound, smell, touch, taste)")

        if self.internal_monologue:
            parts.append("Include character's internal thoughts and reflections")

        if self.show_dont_tell:
            parts.append("Show emotions and states through action and dialogue rather than telling")

        return ". ".join(parts) + "."


# Pre-defined style profiles for common genres and styles

HEMINGWAY_STYLE = WritingStyleProfile(
    name="Hemingway",
    description="Spare, direct prose inspired by Ernest Hemingway",
    prose_style=ProseStyle.SPARSE,
    dialogue_style=DialogueStyle.REALISTIC,
    description_density=DescriptionDensity.MINIMAL,
    sentence_variety=SentenceVariety.SIMPLE,
    vocabulary_level=VocabularyLevel.ACCESSIBLE,
    humor_level=HumorLevel.NONE,
    pov=POV.THIRD_PERSON_LIMITED,
    tense=Tense.PAST,
    sensory_details=False,
    internal_monologue=False,
    show_dont_tell=True,
)

LITERARY_FICTION_STYLE = WritingStyleProfile(
    name="Literary Fiction",
    description="Sophisticated literary prose with careful attention to craft",
    prose_style=ProseStyle.LITERARY,
    dialogue_style=DialogueStyle.STYLIZED,
    description_density=DescriptionDensity.RICH,
    sentence_variety=SentenceVariety.COMPLEX,
    vocabulary_level=VocabularyLevel.ADVANCED,
    humor_level=HumorLevel.SUBTLE,
    pov=POV.THIRD_PERSON_LIMITED,
    tense=Tense.PAST,
    sensory_details=True,
    internal_monologue=True,
    show_dont_tell=True,
)

COMMERCIAL_FICTION_STYLE = WritingStyleProfile(
    name="Commercial Fiction",
    description="Accessible, engaging prose for broad appeal",
    prose_style=ProseStyle.CONVERSATIONAL,
    dialogue_style=DialogueStyle.REALISTIC,
    description_density=DescriptionDensity.MODERATE,
    sentence_variety=SentenceVariety.VARIED,
    vocabulary_level=VocabularyLevel.ACCESSIBLE,
    humor_level=HumorLevel.SUBTLE,
    pov=POV.THIRD_PERSON_LIMITED,
    tense=Tense.PAST,
    sensory_details=True,
    internal_monologue=True,
    show_dont_tell=True,
)

ROMANCE_STYLE = WritingStyleProfile(
    name="Romance",
    description="Emotionally rich prose focused on character connections",
    prose_style=ProseStyle.CONVERSATIONAL,
    dialogue_style=DialogueStyle.REALISTIC,
    description_density=DescriptionDensity.MODERATE,
    sentence_variety=SentenceVariety.VARIED,
    vocabulary_level=VocabularyLevel.ACCESSIBLE,
    humor_level=HumorLevel.MODERATE,
    pov=POV.THIRD_PERSON_LIMITED,
    tense=Tense.PAST,
    sensory_details=True,
    internal_monologue=True,
    show_dont_tell=True,
    action_to_reflection_ratio=0.3,
)

THRILLER_STYLE = WritingStyleProfile(
    name="Thriller",
    description="Fast-paced, tension-driven prose",
    prose_style=ProseStyle.SPARSE,
    dialogue_style=DialogueStyle.REALISTIC,
    description_density=DescriptionDensity.MINIMAL,
    sentence_variety=SentenceVariety.VARIED,
    vocabulary_level=VocabularyLevel.ACCESSIBLE,
    humor_level=HumorLevel.NONE,
    pov=POV.THIRD_PERSON_LIMITED,
    tense=Tense.PAST,
    sensory_details=True,
    internal_monologue=True,
    show_dont_tell=True,
    action_to_reflection_ratio=0.7,
)

FANTASY_STYLE = WritingStyleProfile(
    name="Fantasy",
    description="Immersive world-building with rich descriptions",
    prose_style=ProseStyle.LYRICAL,
    dialogue_style=DialogueStyle.STYLIZED,
    description_density=DescriptionDensity.RICH,
    sentence_variety=SentenceVariety.VARIED,
    vocabulary_level=VocabularyLevel.MODERATE,
    humor_level=HumorLevel.SUBTLE,
    pov=POV.THIRD_PERSON_LIMITED,
    tense=Tense.PAST,
    sensory_details=True,
    internal_monologue=True,
    show_dont_tell=True,
)

MYSTERY_STYLE = WritingStyleProfile(
    name="Mystery",
    description="Atmospheric prose with careful pacing of revelations",
    prose_style=ProseStyle.CONVERSATIONAL,
    dialogue_style=DialogueStyle.REALISTIC,
    description_density=DescriptionDensity.MODERATE,
    sentence_variety=SentenceVariety.VARIED,
    vocabulary_level=VocabularyLevel.MODERATE,
    humor_level=HumorLevel.SUBTLE,
    pov=POV.FIRST_PERSON,
    tense=Tense.PAST,
    sensory_details=True,
    internal_monologue=True,
    show_dont_tell=True,
)

HORROR_STYLE = WritingStyleProfile(
    name="Horror",
    description="Atmospheric, dread-building prose",
    prose_style=ProseStyle.LITERARY,
    dialogue_style=DialogueStyle.MINIMAL,
    description_density=DescriptionDensity.RICH,
    sentence_variety=SentenceVariety.VARIED,
    vocabulary_level=VocabularyLevel.MODERATE,
    humor_level=HumorLevel.NONE,
    pov=POV.THIRD_PERSON_LIMITED,
    tense=Tense.PAST,
    sensory_details=True,
    internal_monologue=True,
    show_dont_tell=True,
)

YOUNG_ADULT_STYLE = WritingStyleProfile(
    name="Young Adult",
    description="Accessible, emotionally resonant prose for teen readers",
    prose_style=ProseStyle.CONVERSATIONAL,
    dialogue_style=DialogueStyle.REALISTIC,
    description_density=DescriptionDensity.MODERATE,
    sentence_variety=SentenceVariety.VARIED,
    vocabulary_level=VocabularyLevel.ACCESSIBLE,
    humor_level=HumorLevel.MODERATE,
    pov=POV.FIRST_PERSON,
    tense=Tense.PRESENT,
    sensory_details=True,
    internal_monologue=True,
    show_dont_tell=True,
)

SCI_FI_STYLE = WritingStyleProfile(
    name="Science Fiction",
    description="Clear, idea-driven prose with technical clarity",
    prose_style=ProseStyle.CONVERSATIONAL,
    dialogue_style=DialogueStyle.REALISTIC,
    description_density=DescriptionDensity.MODERATE,
    sentence_variety=SentenceVariety.VARIED,
    vocabulary_level=VocabularyLevel.MODERATE,
    humor_level=HumorLevel.SUBTLE,
    pov=POV.THIRD_PERSON_LIMITED,
    tense=Tense.PAST,
    sensory_details=True,
    internal_monologue=True,
    show_dont_tell=True,
)

# Registry of all pre-defined styles
STYLE_PROFILES: dict[str, WritingStyleProfile] = {
    "hemingway": HEMINGWAY_STYLE,
    "literary_fiction": LITERARY_FICTION_STYLE,
    "commercial_fiction": COMMERCIAL_FICTION_STYLE,
    "romance": ROMANCE_STYLE,
    "thriller": THRILLER_STYLE,
    "fantasy": FANTASY_STYLE,
    "mystery": MYSTERY_STYLE,
    "horror": HORROR_STYLE,
    "young_adult": YOUNG_ADULT_STYLE,
    "science_fiction": SCI_FI_STYLE,
}


def get_style_profile(name: str) -> Optional[WritingStyleProfile]:
    """Get a pre-defined style profile by name."""
    normalized = name.lower().replace(" ", "_").replace("-", "_")
    return STYLE_PROFILES.get(normalized)


def get_all_style_names() -> list[str]:
    """Get list of all available style profile names."""
    return list(STYLE_PROFILES.keys())


def get_style_for_genre(genre: str) -> WritingStyleProfile:
    """Get a recommended style profile for a genre."""
    genre_mapping = {
        "romance": ROMANCE_STYLE,
        "thriller": THRILLER_STYLE,
        "mystery": MYSTERY_STYLE,
        "fantasy": FANTASY_STYLE,
        "science_fiction": SCI_FI_STYLE,
        "sci_fi": SCI_FI_STYLE,
        "scifi": SCI_FI_STYLE,
        "horror": HORROR_STYLE,
        "literary_fiction": LITERARY_FICTION_STYLE,
        "literary": LITERARY_FICTION_STYLE,
        "young_adult": YOUNG_ADULT_STYLE,
        "ya": YOUNG_ADULT_STYLE,
    }

    normalized = genre.lower().replace(" ", "_").replace("-", "_")
    return genre_mapping.get(normalized, COMMERCIAL_FICTION_STYLE)


def create_custom_profile(
    base: Optional[str] = None,
    **overrides,
) -> WritingStyleProfile:
    """Create a custom style profile, optionally based on an existing one."""
    if base:
        base_profile = get_style_profile(base)
        if base_profile:
            # Create a copy with overrides
            profile_dict = {
                "prose_style": base_profile.prose_style,
                "dialogue_style": base_profile.dialogue_style,
                "description_density": base_profile.description_density,
                "sentence_variety": base_profile.sentence_variety,
                "vocabulary_level": base_profile.vocabulary_level,
                "humor_level": base_profile.humor_level,
                "pov": base_profile.pov,
                "tense": base_profile.tense,
                "sensory_details": base_profile.sensory_details,
                "internal_monologue": base_profile.internal_monologue,
                "show_dont_tell": base_profile.show_dont_tell,
                "action_to_reflection_ratio": base_profile.action_to_reflection_ratio,
                "scene_transition_style": base_profile.scene_transition_style,
            }
            profile_dict.update(overrides)
            return WritingStyleProfile(**profile_dict)

    return WritingStyleProfile(**overrides)
