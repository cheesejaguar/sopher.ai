"""Chapter generation service with context injection and style management.

This service handles the business logic for chapter generation, including:
- Context building from previous chapters
- Character state tracking
- Style guide enforcement
- Pacing control
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from ..schemas import ChapterDraftRequest

logger = logging.getLogger(__name__)


@dataclass
class CharacterState:
    """Track character state at a point in the story."""

    name: str
    location: Optional[str] = None
    emotional_state: Optional[str] = None
    knowledge: list[str] = field(default_factory=list)
    relationships: dict[str, str] = field(default_factory=dict)
    last_appearance_chapter: Optional[int] = None


@dataclass
class ChapterContext:
    """Context for generating a chapter."""

    chapter_number: int
    outline: str
    style_guide: Optional[str] = None
    character_bible: Optional[dict[str, Any]] = None
    previous_summary: Optional[str] = None
    character_states: dict[str, CharacterState] = field(default_factory=dict)
    tension_level: float = 0.5  # 0.0 to 1.0
    pacing_notes: Optional[str] = None
    hooks_from_previous: Optional[str] = None


class ChapterContextBuilder:
    """Build context for chapter generation."""

    def __init__(
        self,
        chapter_number: int,
        outline: str,
        style_guide: Optional[str] = None,
        character_bible: Optional[dict[str, Any]] = None,
    ):
        self.chapter_number = chapter_number
        self.outline = outline
        self.style_guide = style_guide
        self.character_bible = character_bible
        self._previous_chapters: list[str] = []
        self._character_states: dict[str, CharacterState] = {}
        self._tension_level = 0.5
        self._pacing_notes: Optional[str] = None

    def with_previous_chapters(self, chapters: list[str]) -> "ChapterContextBuilder":
        """Add previous chapters for context."""
        self._previous_chapters = chapters
        return self

    def with_character_state(self, name: str, state: CharacterState) -> "ChapterContextBuilder":
        """Add character state."""
        self._character_states[name] = state
        return self

    def with_tension_level(self, level: float) -> "ChapterContextBuilder":
        """Set tension level (0.0 to 1.0)."""
        self._tension_level = max(0.0, min(1.0, level))
        return self

    def with_pacing_notes(self, notes: str) -> "ChapterContextBuilder":
        """Add pacing notes."""
        self._pacing_notes = notes
        return self

    def _extract_character_states(self) -> dict[str, CharacterState]:
        """Extract character states from previous chapters and character bible."""
        states = {}

        # Start with character bible info
        if self.character_bible:
            for key, char_data in self.character_bible.items():
                if isinstance(char_data, dict):
                    name = char_data.get("name", key)
                    states[name] = CharacterState(
                        name=name,
                        location=char_data.get("location"),
                        emotional_state=char_data.get("emotional_state"),
                        knowledge=char_data.get("knowledge", []),
                        relationships=char_data.get("relationships", {}),
                    )

        # Update with provided states
        states.update(self._character_states)

        return states

    def _summarize_previous_chapters(self) -> Optional[str]:
        """Create a summary of previous chapters for context."""
        if not self._previous_chapters:
            return None

        summaries = []
        for i, chapter in enumerate(self._previous_chapters):
            # Take key portions of each chapter
            chapter_num = self.chapter_number - len(self._previous_chapters) + i
            # First 200 chars and last 200 chars for context
            start = chapter[:200] if len(chapter) > 200 else chapter
            end = chapter[-200:] if len(chapter) > 400 else ""
            summary = f"Chapter {chapter_num}: {start}...{end}"
            summaries.append(summary)

        return "\n\n".join(summaries)

    def _extract_previous_hook(self) -> Optional[str]:
        """Extract the closing hook from the previous chapter."""
        if not self._previous_chapters:
            return None

        last_chapter = self._previous_chapters[-1]
        # Take last paragraph or 300 chars
        paragraphs = last_chapter.strip().split("\n\n")
        if paragraphs:
            last_para = paragraphs[-1]
            return last_para[-300:] if len(last_para) > 300 else last_para

        return last_chapter[-300:] if len(last_chapter) > 300 else last_chapter

    def build(self) -> ChapterContext:
        """Build the chapter context."""
        return ChapterContext(
            chapter_number=self.chapter_number,
            outline=self.outline,
            style_guide=self.style_guide,
            character_bible=self.character_bible,
            previous_summary=self._summarize_previous_chapters(),
            character_states=self._extract_character_states(),
            tension_level=self._tension_level,
            pacing_notes=self._pacing_notes,
            hooks_from_previous=self._extract_previous_hook(),
        )


class StyleEnforcer:
    """Enforce consistent writing style across chapters."""

    DEFAULT_STYLES = {
        "pov": "third_person_limited",
        "tense": "past",
        "prose_style": "conversational",
        "dialogue_style": "realistic",
    }

    def __init__(self, style_guide: Optional[str] = None):
        self.style_guide = style_guide
        self._parsed_styles: dict[str, str] = {}
        self._parse_style_guide()

    def _parse_style_guide(self) -> None:
        """Parse style guide into structured settings."""
        if not self.style_guide:
            self._parsed_styles = self.DEFAULT_STYLES.copy()
            return

        self._parsed_styles = self.DEFAULT_STYLES.copy()

        guide_lower = self.style_guide.lower()

        # Detect POV
        if "first person" in guide_lower:
            self._parsed_styles["pov"] = "first_person"
        elif "third person omniscient" in guide_lower:
            self._parsed_styles["pov"] = "third_person_omniscient"
        elif "second person" in guide_lower:
            self._parsed_styles["pov"] = "second_person"

        # Detect tense
        if "present tense" in guide_lower:
            self._parsed_styles["tense"] = "present"

        # Detect prose style
        if "lyrical" in guide_lower:
            self._parsed_styles["prose_style"] = "lyrical"
        elif "sparse" in guide_lower or "minimalist" in guide_lower:
            self._parsed_styles["prose_style"] = "sparse"
        elif "formal" in guide_lower:
            self._parsed_styles["prose_style"] = "formal"

    def get_pov(self) -> str:
        """Get the POV setting."""
        return self._parsed_styles.get("pov", "third_person_limited")

    def get_tense(self) -> str:
        """Get the tense setting."""
        return self._parsed_styles.get("tense", "past")

    def get_prose_style(self) -> str:
        """Get the prose style."""
        return self._parsed_styles.get("prose_style", "conversational")

    def get_style_prompt(self) -> str:
        """Generate a style prompt for the LLM."""
        pov_descriptions = {
            "first_person": "Write in first person from the protagonist's perspective.",
            "third_person_limited": "Write in third person limited, staying close to the POV character's thoughts.",
            "third_person_omniscient": "Write in third person omniscient with access to all characters' thoughts.",
            "second_person": "Write in second person, addressing the reader as 'you'.",
        }

        tense_descriptions = {
            "past": "Use past tense throughout.",
            "present": "Use present tense for immediacy.",
        }

        style_descriptions = {
            "conversational": "Use a conversational, accessible prose style.",
            "lyrical": "Use lyrical, poetic prose with rich imagery.",
            "sparse": "Use sparse, minimalist prose - every word must earn its place.",
            "formal": "Use formal, literary prose.",
        }

        parts = [
            pov_descriptions.get(self.get_pov(), ""),
            tense_descriptions.get(self.get_tense(), ""),
            style_descriptions.get(self.get_prose_style(), ""),
        ]

        if self.style_guide:
            parts.append(f"\nAdditional style notes: {self.style_guide}")

        return " ".join(filter(None, parts))


class PacingController:
    """Control chapter pacing based on position in the story."""

    PACING_PROFILES = {
        "opening": {
            "description": "Set the scene, introduce the status quo",
            "tension_target": 0.3,
            "scene_length": "medium",
            "action_ratio": 0.3,
        },
        "rising_action": {
            "description": "Build tension, introduce complications",
            "tension_target": 0.5,
            "scene_length": "varied",
            "action_ratio": 0.5,
        },
        "midpoint": {
            "description": "Major revelation or shift in direction",
            "tension_target": 0.7,
            "scene_length": "medium",
            "action_ratio": 0.6,
        },
        "escalation": {
            "description": "Raise stakes, accelerate pace",
            "tension_target": 0.8,
            "scene_length": "short",
            "action_ratio": 0.7,
        },
        "climax": {
            "description": "Peak tension, major confrontation",
            "tension_target": 1.0,
            "scene_length": "short",
            "action_ratio": 0.8,
        },
        "falling_action": {
            "description": "Begin resolution, some breathing room",
            "tension_target": 0.5,
            "scene_length": "medium",
            "action_ratio": 0.4,
        },
        "resolution": {
            "description": "Wrap up, provide closure",
            "tension_target": 0.2,
            "scene_length": "long",
            "action_ratio": 0.2,
        },
    }

    def __init__(self, total_chapters: int, current_chapter: int):
        self.total_chapters = max(1, total_chapters)
        self.current_chapter = max(1, current_chapter)

    def get_story_position(self) -> float:
        """Get position in story (0.0 to 1.0)."""
        return (self.current_chapter - 1) / max(1, self.total_chapters - 1)

    def get_pacing_profile(self) -> str:
        """Determine pacing profile based on story position."""
        position = self.get_story_position()

        if position < 0.1:
            return "opening"
        elif position < 0.4:
            return "rising_action"
        elif position < 0.5:
            return "midpoint"
        elif position < 0.75:
            return "escalation"
        elif position < 0.9:
            return "climax"
        elif position < 0.95:
            return "falling_action"
        else:
            return "resolution"

    def get_tension_target(self) -> float:
        """Get target tension level for this chapter."""
        profile = self.get_pacing_profile()
        return self.PACING_PROFILES[profile]["tension_target"]

    def get_pacing_notes(self) -> str:
        """Generate pacing notes for the chapter."""
        profile_name = self.get_pacing_profile()
        profile = self.PACING_PROFILES[profile_name]

        return f"""
Pacing Profile: {profile_name.replace('_', ' ').title()}
Position: Chapter {self.current_chapter} of {self.total_chapters}
Description: {profile['description']}
Tension Target: {profile['tension_target'] * 100:.0f}%
Scene Length Preference: {profile['scene_length']}
Action to Reflection Ratio: {profile['action_ratio'] * 100:.0f}% action
""".strip()


class ChapterService:
    """Main service for chapter generation operations."""

    def __init__(self):
        self._context_builder: Optional[ChapterContextBuilder] = None

    def create_context_builder(
        self,
        request: ChapterDraftRequest,
    ) -> ChapterContextBuilder:
        """Create a context builder from a chapter request."""
        builder = ChapterContextBuilder(
            chapter_number=request.chapter_number,
            outline=request.outline,
            style_guide=request.style_guide,
            character_bible=request.character_bible,
        )

        if request.previous_chapters:
            builder.with_previous_chapters(request.previous_chapters)

        self._context_builder = builder
        return builder

    def build_generation_prompt(
        self,
        context: ChapterContext,
        pacing: Optional[PacingController] = None,
    ) -> str:
        """Build the full generation prompt from context."""

        # Style enforcement
        style_enforcer = StyleEnforcer(context.style_guide)
        style_prompt = style_enforcer.get_style_prompt()

        # Build character context
        char_context = ""
        if context.character_states:
            char_lines = []
            for name, state in context.character_states.items():
                line = f"- {name}"
                if state.location:
                    line += f" (at {state.location})"
                if state.emotional_state:
                    line += f": {state.emotional_state}"
                char_lines.append(line)
            char_context = "\n".join(char_lines)

        # Build previous context
        prev_context = ""
        if context.previous_summary:
            prev_context = f"\n\nPrevious chapter context:\n{context.previous_summary}"

        if context.hooks_from_previous:
            prev_context += f"\n\nPrevious chapter ended with:\n{context.hooks_from_previous}"

        # Pacing notes
        pacing_section = ""
        if pacing:
            pacing_section = f"\n\n{pacing.get_pacing_notes()}"
        elif context.pacing_notes:
            pacing_section = f"\n\nPacing: {context.pacing_notes}"

        # Character bible section
        char_bible_section = ""
        if context.character_bible:
            char_bible_section = (
                f"\n\nCharacter Bible:\n{json.dumps(context.character_bible, indent=2)}"
            )

        prompt = f"""Write Chapter {context.chapter_number} following this outline:

{context.outline}

STYLE REQUIREMENTS:
{style_prompt}

{f"CURRENT CHARACTER STATES:{chr(10)}{char_context}" if char_context else ""}
{char_bible_section}
{prev_context}
{pacing_section}

CHAPTER REQUIREMENTS:
1. Follow the style guide precisely
2. Maintain consistency with previous chapters
3. Create vivid scenes with engaging dialogue
4. End with a compelling hook for the next chapter
5. Target 3000-5000 words
6. Use proper scene breaks with "***" or similar markers

Begin writing Chapter {context.chapter_number}:
"""

        return prompt.strip()

    def estimate_word_count(self, content: str) -> int:
        """Estimate word count for content."""
        return len(content.split())

    def validate_chapter_output(
        self,
        content: str,
        min_words: int = 1000,
        max_words: int = 10000,
    ) -> tuple[bool, list[str]]:
        """Validate generated chapter output."""
        issues = []
        word_count = self.estimate_word_count(content)

        if word_count < min_words:
            issues.append(f"Chapter is too short: {word_count} words (minimum: {min_words})")

        if word_count > max_words:
            issues.append(f"Chapter is too long: {word_count} words (maximum: {max_words})")

        if not content.strip():
            issues.append("Chapter content is empty")

        return len(issues) == 0, issues


# Factory function for easy service creation
def create_chapter_service() -> ChapterService:
    """Create a new chapter service instance."""
    return ChapterService()
