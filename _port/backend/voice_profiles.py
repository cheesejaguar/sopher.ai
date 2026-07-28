"""Author voice profiles for sopher.ai.

This module provides pre-defined author-inspired voice profiles and
tools for creating custom voice configurations with blending support.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class VoiceCharacteristic(Enum):
    """Characteristics that define a writing voice."""

    SENTENCE_RHYTHM = "sentence_rhythm"
    VOCABULARY_LEVEL = "vocabulary_level"
    EMOTIONAL_INTENSITY = "emotional_intensity"
    IMAGERY_DENSITY = "imagery_density"
    DIALOGUE_NATURALNESS = "dialogue_naturalness"
    NARRATIVE_DISTANCE = "narrative_distance"
    PHILOSOPHICAL_DEPTH = "philosophical_depth"
    HUMOR_STYLE = "humor_style"
    PACING_TENDENCY = "pacing_tendency"
    DETAIL_ORIENTATION = "detail_orientation"


class SentenceRhythm(Enum):
    """Types of sentence rhythm patterns."""

    STACCATO = "staccato"  # Short, punchy
    FLOWING = "flowing"  # Long, connected
    VARIED = "varied"  # Mix of lengths
    HYPNOTIC = "hypnotic"  # Repetitive patterns
    CONVERSATIONAL = "conversational"  # Natural speech


class VocabularyLevel(Enum):
    """Vocabulary complexity levels."""

    SIMPLE = "simple"
    MODERATE = "moderate"
    SOPHISTICATED = "sophisticated"
    LITERARY = "literary"
    TECHNICAL = "technical"


class EmotionalIntensity(Enum):
    """Emotional intensity levels."""

    RESTRAINED = "restrained"
    SUBTLE = "subtle"
    MODERATE = "moderate"
    EXPRESSIVE = "expressive"
    INTENSE = "intense"


class ImageryDensity(Enum):
    """Density of imagery and description."""

    SPARSE = "sparse"
    MODERATE = "moderate"
    RICH = "rich"
    LUSH = "lush"
    OVERWHELMING = "overwhelming"


class NarrativeDistance(Enum):
    """Narrative distance from characters."""

    INTIMATE = "intimate"
    CLOSE = "close"
    MODERATE = "moderate"
    DISTANT = "distant"
    OMNISCIENT = "omniscient"


class HumorStyle(Enum):
    """Types of humor style."""

    NONE = "none"
    DRY = "dry"
    WITTY = "witty"
    SARDONIC = "sardonic"
    ABSURDIST = "absurdist"
    SLAPSTICK = "slapstick"


class PacingTendency(Enum):
    """Pacing tendencies."""

    SLOW_BURN = "slow_burn"
    MEASURED = "measured"
    BRISK = "brisk"
    RAPID = "rapid"
    VARIABLE = "variable"


@dataclass
class VoiceParameters:
    """Adjustable parameters for a writing voice."""

    sentence_rhythm: SentenceRhythm = SentenceRhythm.VARIED
    vocabulary_level: VocabularyLevel = VocabularyLevel.MODERATE
    emotional_intensity: EmotionalIntensity = EmotionalIntensity.MODERATE
    imagery_density: ImageryDensity = ImageryDensity.MODERATE
    narrative_distance: NarrativeDistance = NarrativeDistance.MODERATE
    humor_style: HumorStyle = HumorStyle.NONE
    pacing_tendency: PacingTendency = PacingTendency.MEASURED

    # Numeric parameters (0.0 to 1.0)
    dialogue_naturalness: float = 0.5
    philosophical_depth: float = 0.3
    detail_orientation: float = 0.5
    sensory_focus: float = 0.5
    introspection_level: float = 0.5
    action_focus: float = 0.5


@dataclass
class VoiceProfile:
    """A complete voice profile configuration."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    description: str = ""
    inspired_by: str = ""  # Author or work this is inspired by
    parameters: VoiceParameters = field(default_factory=VoiceParameters)

    # Style notes
    signature_techniques: list[str] = field(default_factory=list)
    characteristic_phrases: list[str] = field(default_factory=list)
    avoids: list[str] = field(default_factory=list)

    # Genre affinities
    best_for_genres: list[str] = field(default_factory=list)


@dataclass
class BlendedVoice:
    """A voice created by blending multiple profiles."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    source_profiles: list[UUID] = field(default_factory=list)
    weights: list[float] = field(default_factory=list)
    blended_parameters: VoiceParameters = field(default_factory=VoiceParameters)


class VoicePromptGenerator:
    """Generates prompts from voice profiles."""

    def generate_prompt(self, profile: VoiceProfile) -> str:
        """Generate a writing style prompt from a voice profile."""
        params = profile.parameters
        sections = []

        # Core voice description
        if profile.description:
            sections.append(f"Write in a voice that is {profile.description}")

        if profile.inspired_by:
            sections.append(f"Take inspiration from the style of {profile.inspired_by}.")

        # Sentence rhythm
        rhythm_prompts = {
            SentenceRhythm.STACCATO: "Use short, punchy sentences. Cut the fat. Get to the point.",
            SentenceRhythm.FLOWING: "Use long, flowing sentences that carry the reader along like a river.",
            SentenceRhythm.VARIED: "Vary sentence length for rhythm. Short. Then longer, more complex passages that build.",
            SentenceRhythm.HYPNOTIC: "Use repetitive patterns and parallel structures for a hypnotic effect.",
            SentenceRhythm.CONVERSATIONAL: "Write as if speaking naturally to a friend. Use contractions. Keep it real.",
        }
        if params.sentence_rhythm in rhythm_prompts:
            sections.append(rhythm_prompts[params.sentence_rhythm])

        # Vocabulary level
        vocab_prompts = {
            VocabularyLevel.SIMPLE: "Use simple, everyday words. Avoid jargon and pretension.",
            VocabularyLevel.MODERATE: "Use clear vocabulary accessible to general readers.",
            VocabularyLevel.SOPHISTICATED: "Employ a sophisticated vocabulary when appropriate.",
            VocabularyLevel.LITERARY: "Use rich, literary vocabulary with precise word choices.",
            VocabularyLevel.TECHNICAL: "Use precise technical terminology where appropriate.",
        }
        if params.vocabulary_level in vocab_prompts:
            sections.append(vocab_prompts[params.vocabulary_level])

        # Emotional intensity
        emotion_prompts = {
            EmotionalIntensity.RESTRAINED: "Keep emotions understated. Show restraint. Let readers infer.",
            EmotionalIntensity.SUBTLE: "Express emotions subtly through actions and details.",
            EmotionalIntensity.MODERATE: "Balance emotional content naturally.",
            EmotionalIntensity.EXPRESSIVE: "Allow characters to express emotions openly.",
            EmotionalIntensity.INTENSE: "Go deep into emotional experiences. Don't hold back.",
        }
        if params.emotional_intensity in emotion_prompts:
            sections.append(emotion_prompts[params.emotional_intensity])

        # Imagery density
        imagery_prompts = {
            ImageryDensity.SPARSE: "Use minimal description. Let readers fill in the gaps.",
            ImageryDensity.MODERATE: "Balance description with action and dialogue.",
            ImageryDensity.RICH: "Use rich sensory details to bring scenes to life.",
            ImageryDensity.LUSH: "Layer imagery densely. Immerse readers in sensory experience.",
            ImageryDensity.OVERWHELMING: "Create overwhelming sensory experiences.",
        }
        if params.imagery_density in imagery_prompts:
            sections.append(imagery_prompts[params.imagery_density])

        # Narrative distance
        distance_prompts = {
            NarrativeDistance.INTIMATE: "Stay deep inside the character's head. Use their voice, their thoughts.",
            NarrativeDistance.CLOSE: "Stay close to the viewpoint character's experience.",
            NarrativeDistance.MODERATE: "Balance internal and external perspectives.",
            NarrativeDistance.DISTANT: "Maintain narrative distance. Observe more than inhabit.",
            NarrativeDistance.OMNISCIENT: "Use an omniscient perspective, moving between viewpoints freely.",
        }
        if params.narrative_distance in distance_prompts:
            sections.append(distance_prompts[params.narrative_distance])

        # Humor style
        humor_prompts = {
            HumorStyle.DRY: "Use dry, understated humor. Deadpan delivery.",
            HumorStyle.WITTY: "Include witty observations and clever wordplay.",
            HumorStyle.SARDONIC: "Use sardonic, sometimes dark humor.",
            HumorStyle.ABSURDIST: "Include absurdist humor and surreal moments.",
            HumorStyle.SLAPSTICK: "Include physical comedy and broad humor.",
        }
        if params.humor_style in humor_prompts and params.humor_style != HumorStyle.NONE:
            sections.append(humor_prompts[params.humor_style])

        # Pacing
        pacing_prompts = {
            PacingTendency.SLOW_BURN: "Take your time. Build slowly. Let tension accumulate.",
            PacingTendency.MEASURED: "Maintain a steady, measured pace.",
            PacingTendency.BRISK: "Keep things moving. Don't linger too long.",
            PacingTendency.RAPID: "Fast pace. Quick cuts. Momentum.",
            PacingTendency.VARIABLE: "Vary the pace to match the emotional content.",
        }
        if params.pacing_tendency in pacing_prompts:
            sections.append(pacing_prompts[params.pacing_tendency])

        # Numeric parameters
        if params.dialogue_naturalness > 0.7:
            sections.append("Make dialogue sound natural and authentic to each character.")
        elif params.dialogue_naturalness < 0.3:
            sections.append("Dialogue can be stylized or formal.")

        if params.philosophical_depth > 0.7:
            sections.append("Explore philosophical themes and existential questions.")
        elif params.philosophical_depth > 0.5:
            sections.append("Touch on deeper meanings and themes where appropriate.")

        if params.detail_orientation > 0.7:
            sections.append("Include specific, concrete details.")
        elif params.detail_orientation < 0.3:
            sections.append("Focus on essentials; skip unnecessary details.")

        if params.sensory_focus > 0.7:
            sections.append("Engage all five senses in descriptions.")

        if params.introspection_level > 0.7:
            sections.append("Include deep character introspection and internal monologue.")
        elif params.introspection_level < 0.3:
            sections.append("Focus on external action rather than internal thoughts.")

        if params.action_focus > 0.7:
            sections.append("Emphasize action and physical movement.")

        # Signature techniques
        if profile.signature_techniques:
            techniques = ", ".join(profile.signature_techniques[:5])
            sections.append(f"Employ these techniques: {techniques}")

        # Avoids
        if profile.avoids:
            avoids = ", ".join(profile.avoids[:5])
            sections.append(f"Avoid: {avoids}")

        return "\n\n".join(sections)

    def generate_brief_prompt(self, profile: VoiceProfile) -> str:
        """Generate a brief one-paragraph style description."""
        params = profile.parameters

        parts = []

        if profile.inspired_by:
            parts.append(f"in the style of {profile.inspired_by}")

        # Key characteristics
        if params.sentence_rhythm == SentenceRhythm.STACCATO:
            parts.append("short punchy sentences")
        elif params.sentence_rhythm == SentenceRhythm.FLOWING:
            parts.append("flowing prose")

        if params.vocabulary_level == VocabularyLevel.LITERARY:
            parts.append("literary vocabulary")
        elif params.vocabulary_level == VocabularyLevel.SIMPLE:
            parts.append("simple direct language")

        if params.emotional_intensity == EmotionalIntensity.INTENSE:
            parts.append("emotional intensity")
        elif params.emotional_intensity == EmotionalIntensity.RESTRAINED:
            parts.append("emotional restraint")

        if params.imagery_density == ImageryDensity.LUSH:
            parts.append("lush imagery")
        elif params.imagery_density == ImageryDensity.SPARSE:
            parts.append("spare description")

        if params.humor_style != HumorStyle.NONE:
            parts.append(f"{params.humor_style.value} humor")

        if not parts:
            return f"Write in a {profile.name} voice."

        return f"Write with {', '.join(parts)}."


# Pre-defined author-inspired voice profiles
def _create_hemingway_profile() -> VoiceProfile:
    """Create Hemingway-inspired voice profile."""
    return VoiceProfile(
        name="Hemingway",
        description="sparse, direct, and emotionally understated",
        inspired_by="Ernest Hemingway",
        parameters=VoiceParameters(
            sentence_rhythm=SentenceRhythm.STACCATO,
            vocabulary_level=VocabularyLevel.SIMPLE,
            emotional_intensity=EmotionalIntensity.RESTRAINED,
            imagery_density=ImageryDensity.SPARSE,
            narrative_distance=NarrativeDistance.CLOSE,
            humor_style=HumorStyle.DRY,
            pacing_tendency=PacingTendency.MEASURED,
            dialogue_naturalness=0.9,
            philosophical_depth=0.3,
            detail_orientation=0.4,
            sensory_focus=0.6,
            introspection_level=0.2,
            action_focus=0.7,
        ),
        signature_techniques=[
            "iceberg theory (leave meaning implicit)",
            "repetition for emphasis",
            "simple declarative sentences",
            "dialogue-heavy scenes",
            "understated emotion",
        ],
        avoids=[
            "adverbs",
            "flowery language",
            "excessive description",
            "explaining emotions",
            "complex vocabulary",
        ],
        best_for_genres=["literary fiction", "war fiction", "adventure"],
    )


def _create_austen_profile() -> VoiceProfile:
    """Create Jane Austen-inspired voice profile."""
    return VoiceProfile(
        name="Austen",
        description="witty, ironic, and socially observant",
        inspired_by="Jane Austen",
        parameters=VoiceParameters(
            sentence_rhythm=SentenceRhythm.FLOWING,
            vocabulary_level=VocabularyLevel.SOPHISTICATED,
            emotional_intensity=EmotionalIntensity.SUBTLE,
            imagery_density=ImageryDensity.MODERATE,
            narrative_distance=NarrativeDistance.OMNISCIENT,
            humor_style=HumorStyle.WITTY,
            pacing_tendency=PacingTendency.MEASURED,
            dialogue_naturalness=0.8,
            philosophical_depth=0.4,
            detail_orientation=0.6,
            sensory_focus=0.4,
            introspection_level=0.6,
            action_focus=0.2,
        ),
        signature_techniques=[
            "free indirect discourse",
            "ironic narration",
            "social commentary",
            "witty dialogue",
            "parallel structure",
        ],
        avoids=[
            "melodrama",
            "explicit emotion",
            "action sequences",
            "modern slang",
        ],
        best_for_genres=["romance", "comedy of manners", "historical fiction"],
    )


def _create_king_profile() -> VoiceProfile:
    """Create Stephen King-inspired voice profile."""
    return VoiceProfile(
        name="King",
        description="conversational, immersive, and psychologically deep",
        inspired_by="Stephen King",
        parameters=VoiceParameters(
            sentence_rhythm=SentenceRhythm.CONVERSATIONAL,
            vocabulary_level=VocabularyLevel.MODERATE,
            emotional_intensity=EmotionalIntensity.EXPRESSIVE,
            imagery_density=ImageryDensity.RICH,
            narrative_distance=NarrativeDistance.INTIMATE,
            humor_style=HumorStyle.SARDONIC,
            pacing_tendency=PacingTendency.VARIABLE,
            dialogue_naturalness=0.95,
            philosophical_depth=0.5,
            detail_orientation=0.8,
            sensory_focus=0.8,
            introspection_level=0.8,
            action_focus=0.5,
        ),
        signature_techniques=[
            "deep POV",
            "specific brand names and cultural references",
            "internal monologue",
            "building dread through mundane details",
            "authentic dialogue with regional flavor",
        ],
        avoids=[
            "passive voice",
            "abstract description",
            "distant narration",
        ],
        best_for_genres=["horror", "thriller", "supernatural fiction"],
    )


def _create_pratchett_profile() -> VoiceProfile:
    """Create Terry Pratchett-inspired voice profile."""
    return VoiceProfile(
        name="Pratchett",
        description="witty, satirical, and humanistic",
        inspired_by="Terry Pratchett",
        parameters=VoiceParameters(
            sentence_rhythm=SentenceRhythm.VARIED,
            vocabulary_level=VocabularyLevel.SOPHISTICATED,
            emotional_intensity=EmotionalIntensity.MODERATE,
            imagery_density=ImageryDensity.RICH,
            narrative_distance=NarrativeDistance.OMNISCIENT,
            humor_style=HumorStyle.WITTY,
            pacing_tendency=PacingTendency.BRISK,
            dialogue_naturalness=0.85,
            philosophical_depth=0.7,
            detail_orientation=0.7,
            sensory_focus=0.5,
            introspection_level=0.5,
            action_focus=0.4,
        ),
        signature_techniques=[
            "footnotes and asides",
            "satirical observations",
            "extended metaphors",
            "wordplay and puns",
            "philosophical musings disguised as humor",
        ],
        avoids=[
            "taking itself too seriously",
            "grimdark tone",
            "purple prose",
        ],
        best_for_genres=["fantasy", "satire", "comedy"],
    )


def _create_mccarthy_profile() -> VoiceProfile:
    """Create Cormac McCarthy-inspired voice profile."""
    return VoiceProfile(
        name="McCarthy",
        description="biblical, sparse, and unflinching",
        inspired_by="Cormac McCarthy",
        parameters=VoiceParameters(
            sentence_rhythm=SentenceRhythm.VARIED,
            vocabulary_level=VocabularyLevel.LITERARY,
            emotional_intensity=EmotionalIntensity.RESTRAINED,
            imagery_density=ImageryDensity.LUSH,
            narrative_distance=NarrativeDistance.DISTANT,
            humor_style=HumorStyle.DRY,
            pacing_tendency=PacingTendency.SLOW_BURN,
            dialogue_naturalness=0.7,
            philosophical_depth=0.9,
            detail_orientation=0.8,
            sensory_focus=0.9,
            introspection_level=0.3,
            action_focus=0.5,
        ),
        signature_techniques=[
            "minimal punctuation in dialogue",
            "landscape as character",
            "biblical cadence",
            "violence rendered beautifully",
            "long descriptive passages",
        ],
        avoids=[
            "quotation marks",
            "explaining violence",
            "happy endings",
            "moral simplicity",
        ],
        best_for_genres=["western", "literary fiction", "post-apocalyptic"],
    )


def _create_rowling_profile() -> VoiceProfile:
    """Create J.K. Rowling-inspired voice profile."""
    return VoiceProfile(
        name="Rowling",
        description="accessible, warm, and whimsical",
        inspired_by="J.K. Rowling",
        parameters=VoiceParameters(
            sentence_rhythm=SentenceRhythm.VARIED,
            vocabulary_level=VocabularyLevel.MODERATE,
            emotional_intensity=EmotionalIntensity.EXPRESSIVE,
            imagery_density=ImageryDensity.RICH,
            narrative_distance=NarrativeDistance.CLOSE,
            humor_style=HumorStyle.WITTY,
            pacing_tendency=PacingTendency.VARIABLE,
            dialogue_naturalness=0.85,
            philosophical_depth=0.4,
            detail_orientation=0.75,
            sensory_focus=0.6,
            introspection_level=0.6,
            action_focus=0.5,
        ),
        signature_techniques=[
            "creative naming",
            "British humor and understatement",
            "foreshadowing through details",
            "character-specific speech patterns",
            "worldbuilding through casual mention",
        ],
        avoids=[
            "excessive exposition",
            "adult content",
            "moral ambiguity in protagonists",
        ],
        best_for_genres=["young adult", "fantasy", "adventure"],
    )


def _create_atwood_profile() -> VoiceProfile:
    """Create Margaret Atwood-inspired voice profile."""
    return VoiceProfile(
        name="Atwood",
        description="incisive, layered, and politically aware",
        inspired_by="Margaret Atwood",
        parameters=VoiceParameters(
            sentence_rhythm=SentenceRhythm.VARIED,
            vocabulary_level=VocabularyLevel.LITERARY,
            emotional_intensity=EmotionalIntensity.SUBTLE,
            imagery_density=ImageryDensity.RICH,
            narrative_distance=NarrativeDistance.INTIMATE,
            humor_style=HumorStyle.DRY,
            pacing_tendency=PacingTendency.MEASURED,
            dialogue_naturalness=0.75,
            philosophical_depth=0.8,
            detail_orientation=0.7,
            sensory_focus=0.7,
            introspection_level=0.8,
            action_focus=0.2,
        ),
        signature_techniques=[
            "layered symbolism",
            "feminist perspective",
            "fragmented memory",
            "unreliable narration",
            "present tense narration",
        ],
        avoids=[
            "simple binaries",
            "passive female characters",
            "exposition dumps",
        ],
        best_for_genres=["dystopian", "literary fiction", "speculative fiction"],
    )


def _create_gaiman_profile() -> VoiceProfile:
    """Create Neil Gaiman-inspired voice profile."""
    return VoiceProfile(
        name="Gaiman",
        description="mythic, dreamy, and darkly whimsical",
        inspired_by="Neil Gaiman",
        parameters=VoiceParameters(
            sentence_rhythm=SentenceRhythm.HYPNOTIC,
            vocabulary_level=VocabularyLevel.LITERARY,
            emotional_intensity=EmotionalIntensity.MODERATE,
            imagery_density=ImageryDensity.LUSH,
            narrative_distance=NarrativeDistance.MODERATE,
            humor_style=HumorStyle.DRY,
            pacing_tendency=PacingTendency.VARIABLE,
            dialogue_naturalness=0.8,
            philosophical_depth=0.6,
            detail_orientation=0.7,
            sensory_focus=0.7,
            introspection_level=0.5,
            action_focus=0.3,
        ),
        signature_techniques=[
            "fairy tale cadence",
            "mythology remixed",
            "personification of abstract concepts",
            "quiet horror",
            "British understatement meets American weirdness",
        ],
        avoids=[
            "explicit violence",
            "cynicism without hope",
            "mundane explanations for magic",
        ],
        best_for_genres=["fantasy", "horror", "urban fantasy", "fairy tales"],
    )


def _create_christie_profile() -> VoiceProfile:
    """Create Agatha Christie-inspired voice profile."""
    return VoiceProfile(
        name="Christie",
        description="precise, puzzle-focused, and deceptively simple",
        inspired_by="Agatha Christie",
        parameters=VoiceParameters(
            sentence_rhythm=SentenceRhythm.CONVERSATIONAL,
            vocabulary_level=VocabularyLevel.MODERATE,
            emotional_intensity=EmotionalIntensity.SUBTLE,
            imagery_density=ImageryDensity.MODERATE,
            narrative_distance=NarrativeDistance.MODERATE,
            humor_style=HumorStyle.DRY,
            pacing_tendency=PacingTendency.BRISK,
            dialogue_naturalness=0.8,
            philosophical_depth=0.2,
            detail_orientation=0.9,
            sensory_focus=0.4,
            introspection_level=0.3,
            action_focus=0.3,
        ),
        signature_techniques=[
            "fair-play clue placement",
            "misdirection through emphasis",
            "character-based red herrings",
            "the gathering scene",
            "theatrical reveals",
        ],
        avoids=[
            "graphic violence",
            "excessive psychology",
            "purple prose",
            "loose ends",
        ],
        best_for_genres=["mystery", "cozy mystery", "detective fiction"],
    )


def _create_sanderson_profile() -> VoiceProfile:
    """Create Brandon Sanderson-inspired voice profile."""
    return VoiceProfile(
        name="Sanderson",
        description="clear, systematic, and epic",
        inspired_by="Brandon Sanderson",
        parameters=VoiceParameters(
            sentence_rhythm=SentenceRhythm.VARIED,
            vocabulary_level=VocabularyLevel.MODERATE,
            emotional_intensity=EmotionalIntensity.EXPRESSIVE,
            imagery_density=ImageryDensity.MODERATE,
            narrative_distance=NarrativeDistance.CLOSE,
            humor_style=HumorStyle.WITTY,
            pacing_tendency=PacingTendency.VARIABLE,
            dialogue_naturalness=0.85,
            philosophical_depth=0.5,
            detail_orientation=0.8,
            sensory_focus=0.5,
            introspection_level=0.6,
            action_focus=0.7,
        ),
        signature_techniques=[
            "hard magic systems",
            "avalanche endings",
            "character growth arcs",
            "multiple POV with distinct voices",
            "foreshadowing through worldbuilding",
        ],
        avoids=[
            "deus ex machina",
            "grimdark without hope",
            "unexplained magic",
            "gratuitous content",
        ],
        best_for_genres=["epic fantasy", "science fiction", "young adult fantasy"],
    )


# Voice profile registry
_PREDEFINED_PROFILES: dict[str, VoiceProfile] = {}


def _initialize_profiles():
    """Initialize predefined profiles."""
    global _PREDEFINED_PROFILES
    profiles = [
        _create_hemingway_profile(),
        _create_austen_profile(),
        _create_king_profile(),
        _create_pratchett_profile(),
        _create_mccarthy_profile(),
        _create_rowling_profile(),
        _create_atwood_profile(),
        _create_gaiman_profile(),
        _create_christie_profile(),
        _create_sanderson_profile(),
    ]
    for profile in profiles:
        _PREDEFINED_PROFILES[profile.name.lower()] = profile


# Initialize on module load
_initialize_profiles()


def get_voice_profile(name: str) -> Optional[VoiceProfile]:
    """Get a predefined voice profile by name."""
    return _PREDEFINED_PROFILES.get(name.lower())


def get_all_voice_names() -> list[str]:
    """Get names of all predefined voice profiles."""
    return list(_PREDEFINED_PROFILES.keys())


def get_all_voice_profiles() -> list[VoiceProfile]:
    """Get all predefined voice profiles."""
    return list(_PREDEFINED_PROFILES.values())


def get_profiles_for_genre(genre: str) -> list[VoiceProfile]:
    """Get voice profiles suitable for a specific genre."""
    genre_lower = genre.lower()
    matching = []
    for profile in _PREDEFINED_PROFILES.values():
        for profile_genre in profile.best_for_genres:
            if genre_lower in profile_genre.lower() or profile_genre.lower() in genre_lower:
                matching.append(profile)
                break
    return matching


class VoiceBlender:
    """Blends multiple voice profiles together."""

    def blend(
        self,
        profiles: list[VoiceProfile],
        weights: Optional[list[float]] = None,
        name: str = "Blended Voice",
    ) -> BlendedVoice:
        """Blend multiple voice profiles into a new voice."""
        if not profiles:
            return BlendedVoice(name=name)

        if weights is None:
            weights = [1.0 / len(profiles)] * len(profiles)

        # Normalize weights
        total = sum(weights)
        weights = [w / total for w in weights]

        # Blend numeric parameters
        blended_params = VoiceParameters()

        # For numeric parameters, use weighted average
        blended_params.dialogue_naturalness = sum(
            p.parameters.dialogue_naturalness * w for p, w in zip(profiles, weights)
        )
        blended_params.philosophical_depth = sum(
            p.parameters.philosophical_depth * w for p, w in zip(profiles, weights)
        )
        blended_params.detail_orientation = sum(
            p.parameters.detail_orientation * w for p, w in zip(profiles, weights)
        )
        blended_params.sensory_focus = sum(
            p.parameters.sensory_focus * w for p, w in zip(profiles, weights)
        )
        blended_params.introspection_level = sum(
            p.parameters.introspection_level * w for p, w in zip(profiles, weights)
        )
        blended_params.action_focus = sum(
            p.parameters.action_focus * w for p, w in zip(profiles, weights)
        )

        # For enum parameters, use the one from the highest-weighted profile
        dominant_idx = weights.index(max(weights))
        dominant = profiles[dominant_idx]

        blended_params.sentence_rhythm = dominant.parameters.sentence_rhythm
        blended_params.vocabulary_level = dominant.parameters.vocabulary_level
        blended_params.emotional_intensity = dominant.parameters.emotional_intensity
        blended_params.imagery_density = dominant.parameters.imagery_density
        blended_params.narrative_distance = dominant.parameters.narrative_distance
        blended_params.humor_style = dominant.parameters.humor_style
        blended_params.pacing_tendency = dominant.parameters.pacing_tendency

        return BlendedVoice(
            name=name,
            source_profiles=[p.id for p in profiles],
            weights=weights,
            blended_parameters=blended_params,
        )


def create_custom_profile(
    name: str,
    description: str = "",
    inspired_by: str = "",
    **kwargs,
) -> VoiceProfile:
    """Create a custom voice profile with specified parameters."""
    # Extract known VoiceParameters fields
    param_fields = {
        "sentence_rhythm",
        "vocabulary_level",
        "emotional_intensity",
        "imagery_density",
        "narrative_distance",
        "humor_style",
        "pacing_tendency",
        "dialogue_naturalness",
        "philosophical_depth",
        "detail_orientation",
        "sensory_focus",
        "introspection_level",
        "action_focus",
    }

    param_kwargs = {k: v for k, v in kwargs.items() if k in param_fields}
    profile_kwargs = {k: v for k, v in kwargs.items() if k not in param_fields}

    parameters = VoiceParameters(**param_kwargs)

    return VoiceProfile(
        name=name,
        description=description,
        inspired_by=inspired_by,
        parameters=parameters,
        **profile_kwargs,
    )


class VoiceProfileService:
    """Service for managing voice profiles."""

    def __init__(self):
        self._custom_profiles: dict[UUID, VoiceProfile] = {}
        self._blended_voices: dict[UUID, BlendedVoice] = {}
        self.prompt_generator = VoicePromptGenerator()
        self.blender = VoiceBlender()

    def get_predefined(self, name: str) -> Optional[VoiceProfile]:
        """Get a predefined voice profile."""
        return get_voice_profile(name)

    def list_predefined(self) -> list[VoiceProfile]:
        """List all predefined voice profiles."""
        return get_all_voice_profiles()

    def create_custom(
        self,
        name: str,
        description: str = "",
        inspired_by: str = "",
        **kwargs,
    ) -> VoiceProfile:
        """Create and store a custom voice profile."""
        profile = create_custom_profile(name, description, inspired_by, **kwargs)
        self._custom_profiles[profile.id] = profile
        return profile

    def get_custom(self, profile_id: UUID) -> Optional[VoiceProfile]:
        """Get a custom voice profile by ID."""
        return self._custom_profiles.get(profile_id)

    def list_custom(self) -> list[VoiceProfile]:
        """List all custom voice profiles."""
        return list(self._custom_profiles.values())

    def delete_custom(self, profile_id: UUID) -> bool:
        """Delete a custom voice profile."""
        if profile_id in self._custom_profiles:
            del self._custom_profiles[profile_id]
            return True
        return False

    def blend_profiles(
        self,
        profile_ids: list[UUID],
        weights: Optional[list[float]] = None,
        name: str = "Blended Voice",
    ) -> BlendedVoice:
        """Blend multiple profiles into a new voice."""
        profiles = []
        for pid in profile_ids:
            # Check custom profiles first
            profile = self._custom_profiles.get(pid)
            if profile:
                profiles.append(profile)
            else:
                # Check if it's a predefined profile by scanning
                for pred in _PREDEFINED_PROFILES.values():
                    if pred.id == pid:
                        profiles.append(pred)
                        break

        blended = self.blender.blend(profiles, weights, name)
        self._blended_voices[blended.id] = blended
        return blended

    def get_blended(self, voice_id: UUID) -> Optional[BlendedVoice]:
        """Get a blended voice by ID."""
        return self._blended_voices.get(voice_id)

    def list_blended(self) -> list[BlendedVoice]:
        """List all blended voices."""
        return list(self._blended_voices.values())

    def generate_prompt(self, profile: VoiceProfile) -> str:
        """Generate a writing prompt for a voice profile."""
        return self.prompt_generator.generate_prompt(profile)

    def generate_brief_prompt(self, profile: VoiceProfile) -> str:
        """Generate a brief prompt for a voice profile."""
        return self.prompt_generator.generate_brief_prompt(profile)

    def generate_blended_prompt(self, blended: BlendedVoice) -> str:
        """Generate a writing prompt for a blended voice."""
        # Create a temporary profile from blended parameters
        temp_profile = VoiceProfile(
            name=blended.name,
            parameters=blended.blended_parameters,
        )
        return self.prompt_generator.generate_prompt(temp_profile)

    def get_profiles_for_genre(self, genre: str) -> list[VoiceProfile]:
        """Get voice profiles suitable for a genre."""
        predefined = get_profiles_for_genre(genre)
        custom_matching = [
            p
            for p in self._custom_profiles.values()
            if any(genre.lower() in g.lower() for g in p.best_for_genres)
        ]
        return predefined + custom_matching
