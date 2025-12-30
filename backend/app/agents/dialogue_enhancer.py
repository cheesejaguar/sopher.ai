"""Dialogue enhancement for character-specific voice and realistic conversations.

This module provides dialogue enhancement capabilities including:
- Character-specific voice patterns
- Dialogue tag variety
- Subtext and tension in conversations
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class DialogueTagStyle(str, Enum):
    """Style of dialogue tags to use."""

    MINIMAL = "minimal"  # Said, asked only
    STANDARD = "standard"  # Standard range of tags
    VARIED = "varied"  # Wide variety including action beats
    INVISIBLE = "invisible"  # Action beats only, no said/asked


class SpeechPattern(str, Enum):
    """Character speech patterns."""

    FORMAL = "formal"
    CASUAL = "casual"
    TECHNICAL = "technical"
    POETIC = "poetic"
    TERSE = "terse"
    VERBOSE = "verbose"
    FOLKSY = "folksy"
    ACADEMIC = "academic"


class EmotionalUndertone(str, Enum):
    """Emotional undertone in dialogue."""

    NEUTRAL = "neutral"
    TENSE = "tense"
    FLIRTATIOUS = "flirtatious"
    HOSTILE = "hostile"
    NERVOUS = "nervous"
    CONFIDENT = "confident"
    MELANCHOLIC = "melancholic"
    PLAYFUL = "playful"


@dataclass
class VoiceProfile:
    """Character voice profile for dialogue."""

    name: str
    speech_pattern: SpeechPattern = SpeechPattern.CASUAL
    vocabulary_level: str = "moderate"  # accessible, moderate, advanced
    favorite_expressions: list[str] = field(default_factory=list)
    verbal_tics: list[str] = field(default_factory=list)
    sentence_length: str = "varied"  # short, medium, long, varied
    interrupts_others: bool = False
    uses_contractions: bool = True
    formality_level: float = 0.5  # 0.0 = very casual, 1.0 = very formal
    dialect_notes: Optional[str] = None


@dataclass
class DialogueContext:
    """Context for a dialogue exchange."""

    participants: list[str] = field(default_factory=list)
    location: Optional[str] = None
    emotional_undertone: EmotionalUndertone = EmotionalUndertone.NEUTRAL
    subtext: Optional[str] = None  # What's really being discussed
    stakes: Optional[str] = None  # What's at risk in this conversation
    power_dynamic: Optional[str] = None  # Who has the upper hand
    time_pressure: bool = False
    interrupted: bool = False
    overheard: bool = False


@dataclass
class DialogueBeat:
    """A single exchange in a dialogue."""

    speaker: str
    text: str
    tag_type: str = "said"  # said, asked, action beat, etc.
    action_beat: Optional[str] = None  # Action during/after speaking
    internal_thought: Optional[str] = None  # POV character's reaction
    subtext_hint: Optional[str] = None  # What's really meant


class DialogueTagGenerator:
    """Generates varied and appropriate dialogue tags."""

    # Standard dialogue tags organized by emotional context
    TAGS_BY_EMOTION = {
        "neutral": ["said", "replied", "answered", "responded", "added"],
        "angry": ["snapped", "growled", "barked", "snarled", "spat"],
        "happy": ["laughed", "chirped", "beamed", "gushed", "exclaimed"],
        "sad": ["whispered", "murmured", "sighed", "breathed", "muttered"],
        "surprised": ["gasped", "exclaimed", "blurted", "stammered", "squeaked"],
        "scared": ["whispered", "trembled", "stammered", "croaked", "whimpered"],
        "confident": ["declared", "announced", "stated", "proclaimed", "asserted"],
        "uncertain": ["mumbled", "hedged", "ventured", "wondered", "mused"],
    }

    # Action beats that can replace dialogue tags
    ACTION_BEATS = [
        "crossed arms",
        "leaned forward",
        "glanced away",
        "shrugged",
        "nodded slowly",
        "raised an eyebrow",
        "drummed fingers",
        "shifted weight",
        "looked up",
        "took a breath",
        "stepped closer",
        "folded hands",
        "tilted head",
        "pursed lips",
        "narrowed eyes",
    ]

    def __init__(self, style: DialogueTagStyle = DialogueTagStyle.STANDARD):
        """Initialize the dialogue tag generator.

        Args:
            style: The preferred dialogue tag style
        """
        self.style = style
        self._used_tags: list[str] = []
        self._tag_variety_threshold = 3  # Use different tag after N uses

    def get_tag(
        self,
        emotion: str = "neutral",
        is_question: bool = False,
        speaker: Optional[str] = None,
    ) -> str:
        """Get an appropriate dialogue tag.

        Args:
            emotion: The emotional context
            is_question: Whether the dialogue is a question
            speaker: The speaker's name (for action beats)

        Returns:
            A dialogue tag or action beat
        """
        if self.style == DialogueTagStyle.MINIMAL:
            return "asked" if is_question else "said"

        if self.style == DialogueTagStyle.INVISIBLE:
            # Return action beat instead of tag
            return self._get_action_beat()

        # Get emotion-appropriate tags
        emotion_key = emotion.lower()
        available_tags = self.TAGS_BY_EMOTION.get(emotion_key, self.TAGS_BY_EMOTION["neutral"])

        # Prefer variety
        tag = self._select_varied_tag(available_tags)

        # Handle questions
        if is_question and tag == "said":
            tag = "asked"

        return tag

    def _select_varied_tag(self, available_tags: list[str]) -> str:
        """Select a tag, preferring variety."""
        # Find tags not recently used
        fresh_tags = [t for t in available_tags if t not in self._used_tags]

        if fresh_tags:
            tag = fresh_tags[0]
        else:
            # Reset and start fresh
            self._used_tags = []
            tag = available_tags[0]

        # Track usage
        self._used_tags.append(tag)
        if len(self._used_tags) > self._tag_variety_threshold:
            self._used_tags = self._used_tags[-self._tag_variety_threshold :]

        return tag

    def _get_action_beat(self) -> str:
        """Get an action beat to use instead of a dialogue tag."""
        import random

        return random.choice(self.ACTION_BEATS)

    def reset(self) -> None:
        """Reset the tag usage tracking."""
        self._used_tags = []


class CharacterVoiceManager:
    """Manages character voices for consistent dialogue."""

    def __init__(self):
        """Initialize the character voice manager."""
        self._voices: dict[str, VoiceProfile] = {}

    def add_voice(self, profile: VoiceProfile) -> None:
        """Add a character voice profile.

        Args:
            profile: The voice profile to add
        """
        self._voices[profile.name.lower()] = profile

    def get_voice(self, name: str) -> Optional[VoiceProfile]:
        """Get a character's voice profile.

        Args:
            name: The character's name

        Returns:
            The voice profile, or None if not found
        """
        return self._voices.get(name.lower())

    def has_voice(self, name: str) -> bool:
        """Check if a character has a voice profile.

        Args:
            name: The character's name

        Returns:
            True if the character has a voice profile
        """
        return name.lower() in self._voices

    def get_all_characters(self) -> list[str]:
        """Get all characters with voice profiles.

        Returns:
            List of character names
        """
        return [v.name for v in self._voices.values()]

    def clear(self) -> None:
        """Clear all voice profiles."""
        self._voices = {}

    def get_voice_prompt(self, name: str) -> str:
        """Get a prompt describing a character's voice.

        Args:
            name: The character's name

        Returns:
            A prompt describing how the character speaks
        """
        voice = self.get_voice(name)
        if not voice:
            return f"{name} speaks normally."

        parts = [f"{voice.name}'s voice:"]

        # Speech pattern
        pattern_descriptions = {
            SpeechPattern.FORMAL: "speaks formally with proper grammar",
            SpeechPattern.CASUAL: "uses casual, everyday language",
            SpeechPattern.TECHNICAL: "uses technical jargon and precise terms",
            SpeechPattern.POETIC: "speaks with poetic flourishes and metaphors",
            SpeechPattern.TERSE: "speaks in short, clipped sentences",
            SpeechPattern.VERBOSE: "tends to ramble and over-explain",
            SpeechPattern.FOLKSY: "uses folksy expressions and homespun wisdom",
            SpeechPattern.ACADEMIC: "speaks in an academic, analytical manner",
        }
        parts.append(pattern_descriptions.get(voice.speech_pattern, ""))

        # Contractions
        if not voice.uses_contractions:
            parts.append("Avoids contractions (says 'do not' instead of 'don't').")

        # Favorite expressions
        if voice.favorite_expressions:
            exprs = ", ".join(f'"{e}"' for e in voice.favorite_expressions[:3])
            parts.append(f"Often uses expressions like {exprs}.")

        # Verbal tics
        if voice.verbal_tics:
            tics = ", ".join(f'"{t}"' for t in voice.verbal_tics[:3])
            parts.append(f"Has verbal tics like {tics}.")

        # Dialect
        if voice.dialect_notes:
            parts.append(f"Dialect: {voice.dialect_notes}")

        # Interruption habit
        if voice.interrupts_others:
            parts.append("Tends to interrupt others when excited or impatient.")

        return " ".join(parts)


class DialogueEnhancer:
    """Enhances dialogue with character voices, tags, and subtext."""

    def __init__(
        self,
        tag_style: DialogueTagStyle = DialogueTagStyle.STANDARD,
    ):
        """Initialize the dialogue enhancer.

        Args:
            tag_style: The preferred dialogue tag style
        """
        self.voice_manager = CharacterVoiceManager()
        self.tag_generator = DialogueTagGenerator(style=tag_style)

    def add_character_voice(self, profile: VoiceProfile) -> "DialogueEnhancer":
        """Add a character voice profile.

        Args:
            profile: The voice profile to add

        Returns:
            Self for method chaining
        """
        self.voice_manager.add_voice(profile)
        return self

    def get_dialogue_guidance(
        self,
        context: DialogueContext,
        pov_character: Optional[str] = None,
    ) -> str:
        """Generate dialogue guidance for LLM generation.

        Args:
            context: The dialogue context
            pov_character: The POV character (if any)

        Returns:
            Guidance prompt for dialogue generation
        """
        parts = ["DIALOGUE GUIDANCE:"]

        # Participants and their voices
        if context.participants:
            parts.append("\nPARTICIPANTS:")
            for name in context.participants:
                voice_prompt = self.voice_manager.get_voice_prompt(name)
                parts.append(f"  - {voice_prompt}")

        # Setting
        if context.location:
            parts.append(f"\nSETTING: {context.location}")

        # Emotional undertone
        undertone_guidance = {
            EmotionalUndertone.NEUTRAL: "Keep dialogue straightforward and natural.",
            EmotionalUndertone.TENSE: (
                "Add tension through pauses, short sentences, loaded silences."
            ),
            EmotionalUndertone.FLIRTATIOUS: (
                "Include playful banter, double meanings, warm undertones."
            ),
            EmotionalUndertone.HOSTILE: ("Use sharp words, interruptions, barely contained anger."),
            EmotionalUndertone.NERVOUS: (
                "Show nervousness through hesitation, trailing off, fidgeting."
            ),
            EmotionalUndertone.CONFIDENT: (
                "Use strong, declarative statements, direct eye contact descriptions."
            ),
            EmotionalUndertone.MELANCHOLIC: (
                "Include wistfulness, pauses, bittersweet observations."
            ),
            EmotionalUndertone.PLAYFUL: ("Add humor, teasing, light-hearted exchanges."),
        }
        if context.emotional_undertone != EmotionalUndertone.NEUTRAL:
            parts.append(f"\nTONE: {undertone_guidance[context.emotional_undertone]}")

        # Subtext
        if context.subtext:
            parts.append(f"\nSUBTEXT: What's really being discussed: {context.subtext}")
            parts.append("  Show this through word choice and what characters avoid saying.")

        # Stakes
        if context.stakes:
            parts.append(f"\nSTAKES: {context.stakes}")

        # Power dynamic
        if context.power_dynamic:
            parts.append(f"\nPOWER DYNAMIC: {context.power_dynamic}")
            parts.append("  Reflect this in who initiates topics, who defers, body language.")

        # Special conditions
        conditions = []
        if context.time_pressure:
            conditions.append("Time pressure - keep exchanges brief, show urgency")
        if context.interrupted:
            conditions.append(
                "Interrupted conversation - show frustration or relief at interruption"
            )
        if context.overheard:
            conditions.append("Being overheard - characters may speak in code or be guarded")

        if conditions:
            parts.append("\nSPECIAL CONDITIONS:")
            for condition in conditions:
                parts.append(f"  - {condition}")

        # POV considerations
        if pov_character:
            parts.append(f"\nPOV CHARACTER: {pov_character}")
            parts.append("  Include their internal reactions to what others say.")
            parts.append("  Show what they notice about tone, body language, subtext.")

        # Tag style guidance
        tag_guidance = {
            DialogueTagStyle.MINIMAL: ("Use mostly 'said' and 'asked' for dialogue tags."),
            DialogueTagStyle.STANDARD: ("Use varied dialogue tags appropriate to the emotion."),
            DialogueTagStyle.VARIED: (
                "Mix dialogue tags with action beats (e.g., 'He crossed his arms. \"No.\"')"
            ),
            DialogueTagStyle.INVISIBLE: ("Replace dialogue tags with action beats entirely."),
        }
        parts.append(f"\nTAG STYLE: {tag_guidance[self.tag_generator.style]}")

        return "\n".join(parts)

    def suggest_subtext(
        self,
        surface_topic: str,
        relationship: str,
        conflict: Optional[str] = None,
    ) -> str:
        """Suggest subtext for a conversation.

        Args:
            surface_topic: What the conversation appears to be about
            relationship: The relationship between speakers
            conflict: Any underlying conflict

        Returns:
            Suggested subtext description
        """
        parts = [f"Surface: {surface_topic}"]

        # Generate relationship-based subtext suggestions
        relationship_lower = relationship.lower()

        if "romantic" in relationship_lower or "love" in relationship_lower:
            parts.append("Subtext: Unspoken feelings, testing boundaries, seeking closeness")
        elif "rival" in relationship_lower or "enemy" in relationship_lower:
            parts.append("Subtext: Establishing dominance, finding weaknesses, veiled threats")
        elif "mentor" in relationship_lower or "student" in relationship_lower:
            parts.append("Subtext: Testing readiness, proving worth, passing on wisdom")
        elif "family" in relationship_lower:
            parts.append("Subtext: Old grievances, unspoken expectations, conditional love")
        elif "friend" in relationship_lower:
            parts.append("Subtext: Loyalty testing, shared history, protecting each other")
        else:
            parts.append("Subtext: Hidden agendas, power dynamics, trust assessment")

        if conflict:
            parts.append(f"Underlying conflict: {conflict}")

        return " | ".join(parts)

    def create_dialogue_beat(
        self,
        speaker: str,
        emotion: str = "neutral",
        is_question: bool = False,
        include_action: bool = False,
        include_thought: bool = False,
        pov_character: Optional[str] = None,
    ) -> DialogueBeat:
        """Create a template dialogue beat.

        Args:
            speaker: The character speaking
            emotion: The emotional context
            is_question: Whether this is a question
            include_action: Whether to include an action beat
            include_thought: Whether to include internal thought
            pov_character: The POV character (for thought access)

        Returns:
            A DialogueBeat template
        """
        tag = self.tag_generator.get_tag(
            emotion=emotion,
            is_question=is_question,
            speaker=speaker,
        )

        action = None
        if include_action:
            action = self.tag_generator._get_action_beat()

        thought = None
        if include_thought and pov_character and speaker != pov_character:
            thought = f"[{pov_character}'s reaction to {speaker}'s words]"

        return DialogueBeat(
            speaker=speaker,
            text="[dialogue text]",
            tag_type=tag,
            action_beat=action,
            internal_thought=thought,
        )

    def reset(self) -> None:
        """Reset the enhancer state."""
        self.tag_generator.reset()


# Pre-defined voice profiles for common character archetypes

HARDBOILED_DETECTIVE_VOICE = VoiceProfile(
    name="Detective",
    speech_pattern=SpeechPattern.TERSE,
    vocabulary_level="moderate",
    favorite_expressions=["The way I see it", "Here's the thing"],
    verbal_tics=[],
    sentence_length="short",
    interrupts_others=False,
    uses_contractions=True,
    formality_level=0.3,
    dialect_notes="Noir-influenced, world-weary",
)

ELDERLY_MENTOR_VOICE = VoiceProfile(
    name="Mentor",
    speech_pattern=SpeechPattern.POETIC,
    vocabulary_level="advanced",
    favorite_expressions=["In my experience", "You must understand"],
    verbal_tics=["Hmm", "You see"],
    sentence_length="long",
    interrupts_others=False,
    uses_contractions=False,
    formality_level=0.7,
    dialect_notes="Speaks in parables and metaphors",
)

NERVOUS_TEENAGER_VOICE = VoiceProfile(
    name="Teen",
    speech_pattern=SpeechPattern.CASUAL,
    vocabulary_level="accessible",
    favorite_expressions=["Like", "I mean", "You know"],
    verbal_tics=["Um", "Uh", "So..."],
    sentence_length="varied",
    interrupts_others=False,
    uses_contractions=True,
    formality_level=0.1,
    dialect_notes="Modern teen slang, trails off when nervous",
)

ARISTOCRATIC_VILLAIN_VOICE = VoiceProfile(
    name="Villain",
    speech_pattern=SpeechPattern.FORMAL,
    vocabulary_level="advanced",
    favorite_expressions=["How delightful", "You disappoint me"],
    verbal_tics=[],
    sentence_length="medium",
    interrupts_others=True,
    uses_contractions=False,
    formality_level=0.9,
    dialect_notes="Cultured, condescending, never raises voice",
)

MILITARY_COMMANDER_VOICE = VoiceProfile(
    name="Commander",
    speech_pattern=SpeechPattern.TERSE,
    vocabulary_level="moderate",
    favorite_expressions=["Listen up", "That's an order"],
    verbal_tics=[],
    sentence_length="short",
    interrupts_others=True,
    uses_contractions=True,
    formality_level=0.6,
    dialect_notes="Direct, commanding, no unnecessary words",
)

SCIENTIST_VOICE = VoiceProfile(
    name="Scientist",
    speech_pattern=SpeechPattern.TECHNICAL,
    vocabulary_level="advanced",
    favorite_expressions=["Theoretically speaking", "The data suggests"],
    verbal_tics=["Actually", "Technically"],
    sentence_length="long",
    interrupts_others=False,
    uses_contractions=True,
    formality_level=0.6,
    dialect_notes="Precise, analytical, over-explains",
)

FOLKSY_ELDER_VOICE = VoiceProfile(
    name="Elder",
    speech_pattern=SpeechPattern.FOLKSY,
    vocabulary_level="accessible",
    favorite_expressions=["Back in my day", "Let me tell you"],
    verbal_tics=["Well now", "I reckon"],
    sentence_length="long",
    interrupts_others=False,
    uses_contractions=True,
    formality_level=0.2,
    dialect_notes="Rural expressions, storytelling cadence",
)

# Registry of pre-defined voice profiles
VOICE_PROFILES: dict[str, VoiceProfile] = {
    "detective": HARDBOILED_DETECTIVE_VOICE,
    "mentor": ELDERLY_MENTOR_VOICE,
    "teen": NERVOUS_TEENAGER_VOICE,
    "teenager": NERVOUS_TEENAGER_VOICE,
    "villain": ARISTOCRATIC_VILLAIN_VOICE,
    "commander": MILITARY_COMMANDER_VOICE,
    "military": MILITARY_COMMANDER_VOICE,
    "scientist": SCIENTIST_VOICE,
    "elder": FOLKSY_ELDER_VOICE,
}


def get_voice_profile(archetype: str) -> Optional[VoiceProfile]:
    """Get a pre-defined voice profile by archetype.

    Args:
        archetype: The character archetype

    Returns:
        The voice profile, or None if not found
    """
    return VOICE_PROFILES.get(archetype.lower())


def get_all_archetypes() -> list[str]:
    """Get all available character archetypes.

    Returns:
        List of archetype names
    """
    return list(VOICE_PROFILES.keys())


def create_dialogue_enhancer(
    tag_style: DialogueTagStyle = DialogueTagStyle.STANDARD,
    voice_profiles: Optional[list[VoiceProfile]] = None,
) -> DialogueEnhancer:
    """Factory function to create a dialogue enhancer.

    Args:
        tag_style: The preferred dialogue tag style
        voice_profiles: Optional list of voice profiles to add

    Returns:
        Configured DialogueEnhancer
    """
    enhancer = DialogueEnhancer(tag_style=tag_style)

    if voice_profiles:
        for profile in voice_profiles:
            enhancer.add_character_voice(profile)

    return enhancer
