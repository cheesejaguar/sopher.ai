"""Scene-level generation for chapter breakdown and transitions.

This module provides scene-level generation capabilities to break chapters
into manageable scenes with proper transitions and POV consistency.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class SceneType(str, Enum):
    """Types of scenes in a chapter."""

    ACTION = "action"  # High tension, fast pacing
    DIALOGUE = "dialogue"  # Character conversation focused
    EXPOSITION = "exposition"  # World-building, backstory
    INTROSPECTION = "introspection"  # Character internal reflection
    TRANSITION = "transition"  # Bridge between major scenes
    CLIMACTIC = "climactic"  # High-stakes turning point


class TransitionType(str, Enum):
    """Types of scene transitions."""

    CUT = "cut"  # Abrupt change
    DISSOLVE = "dissolve"  # Gradual shift
    BRIDGE = "bridge"  # Connecting element
    TIME_SKIP = "time_skip"  # Temporal jump
    LOCATION_SHIFT = "location_shift"  # Spatial change
    POV_SWITCH = "pov_switch"  # Perspective change


class PacingIntensity(str, Enum):
    """Pacing intensity levels for scenes."""

    SLOW = "slow"
    MODERATE = "moderate"
    FAST = "fast"
    INTENSE = "intense"


@dataclass
class SceneContext:
    """Context for a single scene within a chapter."""

    id: UUID = field(default_factory=uuid4)
    scene_number: int = 1
    scene_type: SceneType = SceneType.ACTION
    pov_character: Optional[str] = None
    location: Optional[str] = None
    time_of_day: Optional[str] = None
    characters_present: list[str] = field(default_factory=list)
    objectives: list[str] = field(default_factory=list)
    emotional_beat: Optional[str] = None
    tension_level: float = 0.5  # 0.0 to 1.0
    pacing: PacingIntensity = PacingIntensity.MODERATE
    hooks_from_previous: Optional[str] = None
    setup_for_next: Optional[str] = None
    estimated_word_count: int = 500


@dataclass
class SceneTransition:
    """Transition between two scenes."""

    from_scene: int
    to_scene: int
    transition_type: TransitionType = TransitionType.DISSOLVE
    time_gap: Optional[str] = None  # e.g., "two hours later", "the next morning"
    location_change: bool = False
    pov_change: bool = False
    transition_text: Optional[str] = None


@dataclass
class ChapterBreakdown:
    """Complete scene breakdown for a chapter."""

    chapter_number: int
    chapter_title: Optional[str] = None
    scenes: list[SceneContext] = field(default_factory=list)
    transitions: list[SceneTransition] = field(default_factory=list)
    total_estimated_words: int = 0
    primary_pov: Optional[str] = None
    chapter_arc: Optional[str] = None  # e.g., "rising action", "climax"


class SceneBreakdownGenerator:
    """Generates scene breakdowns from chapter outlines."""

    # Default scene distribution by chapter arc type
    SCENE_PATTERNS = {
        "opening": [
            (SceneType.EXPOSITION, 0.3),
            (SceneType.DIALOGUE, 0.4),
            (SceneType.ACTION, 0.2),
        ],
        "rising_action": [
            (SceneType.DIALOGUE, 0.3),
            (SceneType.ACTION, 0.4),
            (SceneType.INTROSPECTION, 0.2),
        ],
        "midpoint": [
            (SceneType.CLIMACTIC, 0.4),
            (SceneType.DIALOGUE, 0.3),
            (SceneType.INTROSPECTION, 0.2),
        ],
        "escalation": [
            (SceneType.ACTION, 0.5),
            (SceneType.DIALOGUE, 0.3),
            (SceneType.INTROSPECTION, 0.1),
        ],
        "climax": [
            (SceneType.CLIMACTIC, 0.6),
            (SceneType.ACTION, 0.3),
            (SceneType.DIALOGUE, 0.1),
        ],
        "falling_action": [
            (SceneType.DIALOGUE, 0.4),
            (SceneType.INTROSPECTION, 0.3),
            (SceneType.EXPOSITION, 0.2),
        ],
        "resolution": [
            (SceneType.DIALOGUE, 0.4),
            (SceneType.INTROSPECTION, 0.3),
            (SceneType.TRANSITION, 0.2),
        ],
    }

    # Transition recommendations based on scene type changes
    TRANSITION_RECOMMENDATIONS = {
        (SceneType.ACTION, SceneType.DIALOGUE): TransitionType.DISSOLVE,
        (SceneType.ACTION, SceneType.INTROSPECTION): TransitionType.TIME_SKIP,
        (SceneType.DIALOGUE, SceneType.ACTION): TransitionType.CUT,
        (SceneType.DIALOGUE, SceneType.INTROSPECTION): TransitionType.DISSOLVE,
        (SceneType.EXPOSITION, SceneType.ACTION): TransitionType.CUT,
        (SceneType.EXPOSITION, SceneType.DIALOGUE): TransitionType.BRIDGE,
        (SceneType.INTROSPECTION, SceneType.ACTION): TransitionType.CUT,
        (SceneType.INTROSPECTION, SceneType.DIALOGUE): TransitionType.DISSOLVE,
        (SceneType.CLIMACTIC, SceneType.INTROSPECTION): TransitionType.TIME_SKIP,
        (SceneType.CLIMACTIC, SceneType.DIALOGUE): TransitionType.DISSOLVE,
    }

    def __init__(
        self,
        target_scenes_per_chapter: int = 3,
        min_scene_words: int = 300,
        max_scene_words: int = 1500,
    ):
        """Initialize the scene breakdown generator.

        Args:
            target_scenes_per_chapter: Default number of scenes per chapter
            min_scene_words: Minimum words per scene
            max_scene_words: Maximum words per scene
        """
        self.target_scenes = target_scenes_per_chapter
        self.min_scene_words = min_scene_words
        self.max_scene_words = max_scene_words

    def generate_breakdown(
        self,
        chapter_number: int,
        chapter_outline: str,
        chapter_arc: str = "rising_action",
        target_word_count: int = 2500,
        pov_character: Optional[str] = None,
        characters: Optional[list[str]] = None,
    ) -> ChapterBreakdown:
        """Generate a scene breakdown for a chapter.

        Args:
            chapter_number: The chapter number
            chapter_outline: The chapter's outline text
            chapter_arc: The story arc phase (opening, rising_action, etc.)
            target_word_count: Target word count for the chapter
            pov_character: The primary POV character
            characters: List of characters in the chapter

        Returns:
            ChapterBreakdown with scenes and transitions
        """
        characters = characters or []

        # Determine number of scenes based on word count
        num_scenes = self._calculate_scene_count(target_word_count)

        # Get scene type distribution for this arc
        scene_pattern = self.SCENE_PATTERNS.get(
            chapter_arc.lower(), self.SCENE_PATTERNS["rising_action"]
        )

        # Generate scenes
        scenes = self._generate_scenes(
            num_scenes=num_scenes,
            scene_pattern=scene_pattern,
            target_word_count=target_word_count,
            pov_character=pov_character,
            characters=characters,
            chapter_arc=chapter_arc,
        )

        # Generate transitions between scenes
        transitions = self._generate_transitions(scenes)

        # Calculate total estimated words
        total_words = sum(s.estimated_word_count for s in scenes)

        return ChapterBreakdown(
            chapter_number=chapter_number,
            scenes=scenes,
            transitions=transitions,
            total_estimated_words=total_words,
            primary_pov=pov_character,
            chapter_arc=chapter_arc,
        )

    def _calculate_scene_count(self, target_word_count: int) -> int:
        """Calculate the optimal number of scenes for a chapter."""
        avg_scene_words = (self.min_scene_words + self.max_scene_words) / 2
        estimated_scenes = target_word_count / avg_scene_words
        return max(2, min(6, int(round(estimated_scenes))))

    def _generate_scenes(
        self,
        num_scenes: int,
        scene_pattern: list[tuple[SceneType, float]],
        target_word_count: int,
        pov_character: Optional[str],
        characters: list[str],
        chapter_arc: str,
    ) -> list[SceneContext]:
        """Generate scene contexts based on pattern and parameters."""
        scenes = []

        # Calculate word allocation per scene
        words_per_scene = target_word_count // num_scenes

        # Assign scene types based on pattern weights
        scene_types = self._assign_scene_types(num_scenes, scene_pattern)

        # Calculate tension progression
        tension_values = self._calculate_tension_curve(num_scenes, chapter_arc)

        for i, scene_type in enumerate(scene_types):
            scene = SceneContext(
                scene_number=i + 1,
                scene_type=scene_type,
                pov_character=pov_character,
                characters_present=characters.copy() if characters else [],
                tension_level=tension_values[i],
                pacing=self._scene_type_to_pacing(scene_type),
                estimated_word_count=words_per_scene,
            )

            # Set hooks for continuity
            if i > 0:
                scene.hooks_from_previous = f"Following from scene {i}"
            if i < num_scenes - 1:
                scene.setup_for_next = f"Setting up scene {i + 2}"

            scenes.append(scene)

        return scenes

    def _assign_scene_types(
        self, num_scenes: int, pattern: list[tuple[SceneType, float]]
    ) -> list[SceneType]:
        """Assign scene types based on weighted pattern."""
        scene_types = []

        # Extract types and weights
        types = [t for t, _ in pattern]
        weights = [w for _, w in pattern]

        # Normalize weights
        total = sum(weights)
        weights = [w / total for w in weights]

        # Distribute scenes based on weights
        for i in range(num_scenes):
            # Simple weighted selection based on position
            if i == 0:
                # First scene often sets up the chapter
                scene_types.append(types[0])
            elif i == num_scenes - 1:
                # Last scene often has action or climax
                scene_types.append(types[-1] if len(types) > 1 else types[0])
            else:
                # Middle scenes follow pattern distribution
                idx = i % len(types)
                scene_types.append(types[idx])

        return scene_types

    def _calculate_tension_curve(self, num_scenes: int, chapter_arc: str) -> list[float]:
        """Calculate tension values for each scene based on arc position."""
        base_tensions = {
            "opening": (0.2, 0.4),
            "rising_action": (0.4, 0.6),
            "midpoint": (0.5, 0.7),
            "escalation": (0.6, 0.8),
            "climax": (0.8, 1.0),
            "falling_action": (0.6, 0.4),
            "resolution": (0.3, 0.2),
        }

        start, end = base_tensions.get(chapter_arc.lower(), (0.4, 0.6))

        if num_scenes == 1:
            return [(start + end) / 2]

        # Linear interpolation with slight curve
        tensions = []
        for i in range(num_scenes):
            progress = i / (num_scenes - 1)
            # Add slight curve for more natural progression
            curved_progress = progress**0.8 if end > start else 1 - (1 - progress) ** 0.8
            tension = start + (end - start) * curved_progress
            tensions.append(round(tension, 2))

        return tensions

    def _scene_type_to_pacing(self, scene_type: SceneType) -> PacingIntensity:
        """Map scene type to appropriate pacing intensity."""
        pacing_map = {
            SceneType.ACTION: PacingIntensity.FAST,
            SceneType.DIALOGUE: PacingIntensity.MODERATE,
            SceneType.EXPOSITION: PacingIntensity.SLOW,
            SceneType.INTROSPECTION: PacingIntensity.SLOW,
            SceneType.TRANSITION: PacingIntensity.MODERATE,
            SceneType.CLIMACTIC: PacingIntensity.INTENSE,
        }
        return pacing_map.get(scene_type, PacingIntensity.MODERATE)

    def _generate_transitions(self, scenes: list[SceneContext]) -> list[SceneTransition]:
        """Generate transitions between consecutive scenes."""
        transitions = []

        for i in range(len(scenes) - 1):
            from_scene = scenes[i]
            to_scene = scenes[i + 1]

            # Determine transition type
            transition_key = (from_scene.scene_type, to_scene.scene_type)
            transition_type = self.TRANSITION_RECOMMENDATIONS.get(
                transition_key, TransitionType.DISSOLVE
            )

            # Check for POV or location changes
            pov_change = from_scene.pov_character != to_scene.pov_character
            location_change = from_scene.location != to_scene.location

            if pov_change:
                transition_type = TransitionType.POV_SWITCH
            elif location_change:
                transition_type = TransitionType.LOCATION_SHIFT

            transition = SceneTransition(
                from_scene=from_scene.scene_number,
                to_scene=to_scene.scene_number,
                transition_type=transition_type,
                pov_change=pov_change,
                location_change=location_change,
            )
            transitions.append(transition)

        return transitions


class SceneGenerator:
    """Generates scene content with transitions and POV consistency."""

    def __init__(self):
        """Initialize the scene generator."""
        self._current_pov: Optional[str] = None
        self._scene_history: list[SceneContext] = []

    def set_pov(self, character: str) -> None:
        """Set the current POV character."""
        self._current_pov = character

    def get_pov(self) -> Optional[str]:
        """Get the current POV character."""
        return self._current_pov

    def validate_pov_consistency(self, scenes: list[SceneContext]) -> list[str]:
        """Validate POV consistency across scenes.

        Returns list of warning messages for any consistency issues.
        """
        warnings = []

        if not scenes:
            return warnings

        primary_pov = scenes[0].pov_character
        for scene in scenes:
            if scene.pov_character and scene.pov_character != primary_pov:
                if scene.scene_type != SceneType.TRANSITION:
                    warnings.append(
                        f"Scene {scene.scene_number}: POV switches from "
                        f"'{primary_pov}' to '{scene.pov_character}' without explicit transition"
                    )

        return warnings

    def get_scene_prompt(self, scene: SceneContext, style_prompt: str = "") -> str:
        """Generate a prompt for scene generation.

        Args:
            scene: The scene context
            style_prompt: Optional style guidance from WritingStyleProfile

        Returns:
            Complete prompt for scene generation
        """
        parts = []

        # Scene header
        parts.append(f"SCENE {scene.scene_number}")
        parts.append(f"Scene Type: {scene.scene_type.value}")

        # POV and setting
        if scene.pov_character:
            parts.append(f"POV Character: {scene.pov_character}")
        if scene.location:
            parts.append(f"Location: {scene.location}")
        if scene.time_of_day:
            parts.append(f"Time: {scene.time_of_day}")

        # Characters
        if scene.characters_present:
            parts.append(f"Characters present: {', '.join(scene.characters_present)}")

        # Pacing and tension
        parts.append(f"Pacing: {scene.pacing.value}")
        parts.append(f"Tension level: {int(scene.tension_level * 100)}%")

        # Emotional beat
        if scene.emotional_beat:
            parts.append(f"Emotional beat: {scene.emotional_beat}")

        # Objectives
        if scene.objectives:
            parts.append("Objectives:")
            for obj in scene.objectives:
                parts.append(f"  - {obj}")

        # Continuity hooks
        if scene.hooks_from_previous:
            parts.append(f"Continue from: {scene.hooks_from_previous}")
        if scene.setup_for_next:
            parts.append(f"Set up: {scene.setup_for_next}")

        # Word count target
        parts.append(f"Target word count: ~{scene.estimated_word_count} words")

        # Style guidance
        if style_prompt:
            parts.append("")
            parts.append("STYLE GUIDANCE:")
            parts.append(style_prompt)

        return "\n".join(parts)

    def get_transition_text(self, transition: SceneTransition) -> str:
        """Generate suggested transition text between scenes.

        Args:
            transition: The transition context

        Returns:
            Suggested transition prose
        """
        transition_templates = {
            TransitionType.CUT: "",  # No explicit transition text
            TransitionType.DISSOLVE: "...",
            TransitionType.BRIDGE: "Meanwhile, ",
            TransitionType.TIME_SKIP: (
                f"{transition.time_gap or 'Later'}, "
                if transition.time_gap
                else "Some time later, "
            ),
            TransitionType.LOCATION_SHIFT: "Elsewhere, ",
            TransitionType.POV_SWITCH: "* * *\n\n",
        }

        return transition_templates.get(transition.transition_type, "")

    def add_to_history(self, scene: SceneContext) -> None:
        """Add a scene to the generation history."""
        self._scene_history.append(scene)

    def get_history(self) -> list[SceneContext]:
        """Get the scene generation history."""
        return self._scene_history.copy()

    def clear_history(self) -> None:
        """Clear the scene generation history."""
        self._scene_history = []


def create_scene_breakdown(
    chapter_number: int,
    chapter_outline: str,
    chapter_arc: str = "rising_action",
    target_word_count: int = 2500,
    pov_character: Optional[str] = None,
    characters: Optional[list[str]] = None,
) -> ChapterBreakdown:
    """Factory function to create a scene breakdown.

    Args:
        chapter_number: The chapter number
        chapter_outline: The chapter's outline text
        chapter_arc: The story arc phase (opening, rising_action, etc.)
        target_word_count: Target word count for the chapter
        pov_character: The primary POV character
        characters: List of characters in the chapter

    Returns:
        ChapterBreakdown with scenes and transitions
    """
    generator = SceneBreakdownGenerator()
    return generator.generate_breakdown(
        chapter_number=chapter_number,
        chapter_outline=chapter_outline,
        chapter_arc=chapter_arc,
        target_word_count=target_word_count,
        pov_character=pov_character,
        characters=characters,
    )
