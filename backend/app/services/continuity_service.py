"""
Continuity checking service for maintaining consistency across the book.

Provides:
- Character tracking (descriptions, traits, knowledge, locations)
- Timeline tracking (event sequencing, time passage, day/night)
- World consistency (rules, geography, culture)
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from uuid import uuid4


class IssueType(str, Enum):
    """Types of continuity issues."""

    CHARACTER = "character"
    TIMELINE = "timeline"
    WORLD = "world"
    PLOT_HOLE = "plot_hole"
    INCONSISTENCY = "inconsistency"


class IssueSeverity(str, Enum):
    """Severity levels for continuity issues."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class TimeOfDay(str, Enum):
    """Time of day indicators."""

    DAWN = "dawn"
    MORNING = "morning"
    NOON = "noon"
    AFTERNOON = "afternoon"
    EVENING = "evening"
    NIGHT = "night"
    MIDNIGHT = "midnight"


@dataclass
class CharacterMention:
    """A mention of a character in the text."""

    chapter_number: int
    position: int
    text: str
    context: str
    attribute_type: Optional[str] = None  # physical, emotional, location, knowledge
    attribute_value: Optional[str] = None


@dataclass
class CharacterTracker:
    """Tracks a character's state across chapters."""

    name: str
    aliases: list[str] = field(default_factory=list)
    first_appearance: Optional[int] = None

    # Physical attributes
    physical_descriptions: dict[int, list[str]] = field(default_factory=dict)

    # Personality traits
    personality_traits: dict[int, list[str]] = field(default_factory=dict)

    # Knowledge state per chapter
    knowledge: dict[int, set[str]] = field(default_factory=dict)

    # Location per chapter
    locations: dict[int, str] = field(default_factory=dict)

    # Emotional states per chapter
    emotional_states: dict[int, str] = field(default_factory=dict)

    # All mentions
    mentions: list[CharacterMention] = field(default_factory=list)

    def add_physical_description(self, chapter: int, description: str) -> None:
        """Add a physical description for a chapter."""
        if chapter not in self.physical_descriptions:
            self.physical_descriptions[chapter] = []
        self.physical_descriptions[chapter].append(description)

    def add_personality_trait(self, chapter: int, trait: str) -> None:
        """Add a personality trait mentioned in a chapter."""
        if chapter not in self.personality_traits:
            self.personality_traits[chapter] = []
        if trait not in self.personality_traits[chapter]:
            self.personality_traits[chapter].append(trait)

    def add_knowledge(self, chapter: int, knowledge_item: str) -> None:
        """Add something the character knows as of a chapter."""
        if chapter not in self.knowledge:
            self.knowledge[chapter] = set()
        self.knowledge[chapter].add(knowledge_item)

    def set_location(self, chapter: int, location: str) -> None:
        """Set the character's location in a chapter."""
        self.locations[chapter] = location

    def set_emotional_state(self, chapter: int, state: str) -> None:
        """Set the character's emotional state in a chapter."""
        self.emotional_states[chapter] = state

    def get_knowledge_at_chapter(self, chapter: int) -> set[str]:
        """Get cumulative knowledge up to a chapter."""
        knowledge = set()
        for ch in sorted(self.knowledge.keys()):
            if ch <= chapter:
                knowledge.update(self.knowledge[ch])
        return knowledge


@dataclass
class TimelineEvent:
    """An event in the story timeline."""

    id: str
    chapter_number: int
    description: str
    timestamp: Optional[str] = None
    time_of_day: Optional[TimeOfDay] = None
    day_number: Optional[int] = None
    characters_involved: list[str] = field(default_factory=list)
    location: Optional[str] = None
    duration: Optional[str] = None
    dependencies: list[str] = field(default_factory=list)
    position_in_text: int = 0

    def __lt__(self, other: "TimelineEvent") -> bool:
        """Sort by chapter then position in text."""
        if self.chapter_number != other.chapter_number:
            return self.chapter_number < other.chapter_number
        return self.position_in_text < other.position_in_text


@dataclass
class WorldRule:
    """A rule or constraint in the story world."""

    id: str
    name: str
    category: str
    description: str
    exceptions: list[str] = field(default_factory=list)
    established_in_chapter: Optional[int] = None
    mentions: list[tuple[int, str]] = field(default_factory=list)  # (chapter, text)


@dataclass
class ContinuityIssue:
    """A detected continuity issue."""

    id: str
    issue_type: IssueType
    severity: IssueSeverity
    chapter_number: int
    description: str
    context: str = ""
    original_text: Optional[str] = None
    suggested_fix: Optional[str] = None
    affected_chapters: list[int] = field(default_factory=list)
    related_character: Optional[str] = None
    related_event_id: Optional[str] = None
    related_rule_id: Optional[str] = None
    auto_fixable: bool = False


# ============================================================================
# Analyzers
# ============================================================================


class PhysicalDescriptionAnalyzer:
    """Analyzes physical descriptions for consistency."""

    # Patterns for physical attributes
    EYE_PATTERN = re.compile(
        r"\b(?:his|her|their)\s+(\w+)\s+eyes?\b|\beyes?\s+(?:were|was)\s+(\w+)\b",
        re.IGNORECASE,
    )
    HAIR_PATTERN = re.compile(
        r"\b(?:his|her|their)\s+(\w+(?:\s+\w+)?)\s+hair\b|\bhair\s+(?:was|were)\s+(\w+)\b",
        re.IGNORECASE,
    )
    HEIGHT_PATTERN = re.compile(
        r"\b(?:stood|was|at)\s+(?:about\s+)?(\d+['\"]?\d*(?:\s*(?:feet|foot|ft|inches|in))?)\b"
        r"|\b(tall|short|average height)\b",
        re.IGNORECASE,
    )
    AGE_PATTERN = re.compile(
        r"\b(\d+)(?:\s*-?\s*)?(?:years?\s+old|year-old)\b"
        r"|\b(?:in\s+(?:his|her|their)\s+)?(twenties|thirties|forties|fifties|sixties)\b",
        re.IGNORECASE,
    )

    ATTRIBUTE_PATTERNS = {
        "eye_color": EYE_PATTERN,
        "hair": HAIR_PATTERN,
        "height": HEIGHT_PATTERN,
        "age": AGE_PATTERN,
    }

    @classmethod
    def extract_attributes(cls, text: str, character_name: str) -> dict[str, list[str]]:
        """Extract physical attributes from text mentioning a character."""
        attributes: dict[str, list[str]] = {}

        # Look for sentences containing the character name
        sentences = re.split(r"[.!?]+", text)
        for sentence in sentences:
            if character_name.lower() in sentence.lower():
                for attr_type, pattern in cls.ATTRIBUTE_PATTERNS.items():
                    matches = pattern.findall(sentence)
                    if matches:
                        for match in matches:
                            if isinstance(match, tuple):
                                # Take the first non-empty group
                                value = next((m for m in match if m), None)
                            else:
                                value = match
                            if value:
                                if attr_type not in attributes:
                                    attributes[attr_type] = []
                                attributes[attr_type].append(value.strip().lower())

        return attributes

    @classmethod
    def find_inconsistencies(cls, tracker: CharacterTracker) -> list[ContinuityIssue]:
        """Find inconsistencies in physical descriptions across chapters."""
        issues: list[ContinuityIssue] = []

        # Group all descriptions by attribute type
        all_eye_colors: dict[int, str] = {}
        all_hair: dict[int, str] = {}

        for chapter, descriptions in tracker.physical_descriptions.items():
            for desc in descriptions:
                # Parse the description to extract specific attributes
                for attr_type, pattern in cls.ATTRIBUTE_PATTERNS.items():
                    matches = pattern.findall(desc)
                    if matches:
                        value = matches[0]
                        if isinstance(value, tuple):
                            value = next((m for m in value if m), "")
                        if attr_type == "eye_color" and value:
                            all_eye_colors[chapter] = value.lower()
                        elif attr_type == "hair" and value:
                            all_hair[chapter] = value.lower()

        # Check for inconsistent eye colors
        if len(set(all_eye_colors.values())) > 1:
            chapters = sorted(all_eye_colors.keys())
            first_color = all_eye_colors[chapters[0]]
            for ch in chapters[1:]:
                if all_eye_colors[ch] != first_color:
                    issues.append(
                        ContinuityIssue(
                            id=str(uuid4()),
                            issue_type=IssueType.CHARACTER,
                            severity=IssueSeverity.ERROR,
                            chapter_number=ch,
                            description=(
                                f"{tracker.name}'s eye color changed from "
                                f"'{first_color}' (chapter {chapters[0]}) to "
                                f"'{all_eye_colors[ch]}' (chapter {ch})."
                            ),
                            affected_chapters=[chapters[0], ch],
                            related_character=tracker.name,
                            auto_fixable=True,
                        )
                    )

        # Check for inconsistent hair
        if len(set(all_hair.values())) > 1:
            chapters = sorted(all_hair.keys())
            first_hair = all_hair[chapters[0]]
            for ch in chapters[1:]:
                if all_hair[ch] != first_hair:
                    issues.append(
                        ContinuityIssue(
                            id=str(uuid4()),
                            issue_type=IssueType.CHARACTER,
                            severity=IssueSeverity.WARNING,
                            chapter_number=ch,
                            description=(
                                f"{tracker.name}'s hair description changed from "
                                f"'{first_hair}' (chapter {chapters[0]}) to "
                                f"'{all_hair[ch]}' (chapter {ch})."
                            ),
                            affected_chapters=[chapters[0], ch],
                            related_character=tracker.name,
                            auto_fixable=True,
                        )
                    )

        return issues


class KnowledgeStateAnalyzer:
    """Analyzes character knowledge state for consistency."""

    # Patterns that indicate a character learns something
    LEARN_PATTERNS = [
        re.compile(
            r"(?:realized|discovered|learned|found out|understood)\s+that\s+(.+)", re.IGNORECASE
        ),
        re.compile(r"now (?:knew|knows)\s+(?:that\s+)?(.+)", re.IGNORECASE),
        re.compile(
            r"(?:told|revealed|explained|showed)\s+(?:him|her|them)\s+(?:that\s+)?(.+)",
            re.IGNORECASE,
        ),
    ]

    # Patterns that indicate a character references knowledge
    REFERENCE_PATTERNS = [
        re.compile(r"(?:knew|remembered|recalled)\s+(?:that\s+)?(.+)", re.IGNORECASE),
        re.compile(r"(?:had\s+learned|had\s+discovered)\s+(?:that\s+)?(.+)", re.IGNORECASE),
    ]

    @classmethod
    def extract_knowledge_changes(
        cls, text: str, character_name: str
    ) -> tuple[list[str], list[str]]:
        """Extract knowledge gained and referenced by a character."""
        learned: list[str] = []
        referenced: list[str] = []

        # Find sentences mentioning the character
        sentences = re.split(r"[.!?]+", text)
        for sentence in sentences:
            if character_name.lower() in sentence.lower():
                # Check for learning
                for pattern in cls.LEARN_PATTERNS:
                    match = pattern.search(sentence)
                    if match:
                        learned.append(match.group(1).strip()[:100])

                # Check for referencing
                for pattern in cls.REFERENCE_PATTERNS:
                    match = pattern.search(sentence)
                    if match:
                        referenced.append(match.group(1).strip()[:100])

        return learned, referenced

    @classmethod
    def find_knowledge_issues(
        cls, tracker: CharacterTracker, chapters: dict[int, str]
    ) -> list[ContinuityIssue]:
        """Find issues where character references knowledge they shouldn't have."""
        issues: list[ContinuityIssue] = []

        for chapter_num, text in sorted(chapters.items()):
            learned, referenced = cls.extract_knowledge_changes(text, tracker.name)

            # Add learned knowledge to tracker
            for item in learned:
                tracker.add_knowledge(chapter_num, item)

            # Check if referenced knowledge was learned before
            known_at_chapter = tracker.get_knowledge_at_chapter(chapter_num - 1)
            for ref in referenced:
                # Simple substring matching - could be improved
                if not any(
                    ref.lower() in k.lower() or k.lower() in ref.lower() for k in known_at_chapter
                ):
                    # Character references something they shouldn't know yet
                    issues.append(
                        ContinuityIssue(
                            id=str(uuid4()),
                            issue_type=IssueType.PLOT_HOLE,
                            severity=IssueSeverity.ERROR,
                            chapter_number=chapter_num,
                            description=(
                                f"{tracker.name} references '{ref[:50]}...' but "
                                f"there's no prior scene where they learned this."
                            ),
                            related_character=tracker.name,
                            auto_fixable=False,
                        )
                    )

        return issues


class LocationTracker:
    """Tracks character locations for consistency."""

    # Patterns for location changes
    LOCATION_PATTERNS = [
        re.compile(
            r"(?:walked|ran|went|headed|traveled)\s+(?:to|into|toward)\s+(?:the\s+)?(\w+(?:\s+\w+)?)",
            re.IGNORECASE,
        ),
        re.compile(
            r"(?:arrived\s+at|reached|entered)\s+(?:the\s+)?(\w+(?:\s+\w+)?)", re.IGNORECASE
        ),
        re.compile(r"(?:was|were)\s+(?:in|at)\s+(?:the\s+)?(\w+(?:\s+\w+)?)", re.IGNORECASE),
        re.compile(
            r"(?:stood|sat|stayed)\s+(?:in|at)\s+(?:the\s+)?(\w+(?:\s+\w+)?)", re.IGNORECASE
        ),
    ]

    @classmethod
    def extract_location(cls, text: str, character_name: str) -> Optional[str]:
        """Extract the character's location from text."""
        sentences = re.split(r"[.!?]+", text)
        for sentence in sentences:
            if character_name.lower() in sentence.lower():
                for pattern in cls.LOCATION_PATTERNS:
                    match = pattern.search(sentence)
                    if match:
                        return match.group(1).strip()
        return None

    @classmethod
    def find_teleportation_issues(
        cls, tracker: CharacterTracker, chapters: dict[int, str]
    ) -> list[ContinuityIssue]:
        """Find issues where character appears in a new location without travel."""
        issues: list[ContinuityIssue] = []

        prev_location: Optional[str] = None
        prev_chapter: Optional[int] = None

        for chapter_num in sorted(chapters.keys()):
            current_location = tracker.locations.get(chapter_num)
            if current_location:
                if prev_location and current_location.lower() != prev_location.lower():
                    # Location changed - check if there's travel mentioned
                    chapter_text = chapters.get(chapter_num, "")
                    travel_mentioned = any(
                        word in chapter_text.lower()
                        for word in [
                            "traveled",
                            "journeyed",
                            "drove",
                            "flew",
                            "walked to",
                            "went to",
                        ]
                    )

                    if not travel_mentioned and prev_chapter:
                        issues.append(
                            ContinuityIssue(
                                id=str(uuid4()),
                                issue_type=IssueType.CHARACTER,
                                severity=IssueSeverity.WARNING,
                                chapter_number=chapter_num,
                                description=(
                                    f"{tracker.name} appears at '{current_location}' but "
                                    f"was last seen at '{prev_location}' (chapter {prev_chapter}) "
                                    f"with no travel described."
                                ),
                                affected_chapters=[prev_chapter, chapter_num],
                                related_character=tracker.name,
                                auto_fixable=False,
                            )
                        )

                prev_location = current_location
                prev_chapter = chapter_num

        return issues


class TimelineAnalyzer:
    """Analyzes timeline for consistency."""

    # Time of day patterns
    TIME_PATTERNS = {
        TimeOfDay.DAWN: re.compile(r"\b(?:dawn|daybreak|sunrise|first light)\b", re.IGNORECASE),
        TimeOfDay.MORNING: re.compile(r"\b(?:morning|breakfast|a\.m\.)\b", re.IGNORECASE),
        TimeOfDay.NOON: re.compile(r"\b(?:noon|midday|lunch)\b", re.IGNORECASE),
        TimeOfDay.AFTERNOON: re.compile(r"\b(?:afternoon|p\.m\.)\b", re.IGNORECASE),
        TimeOfDay.EVENING: re.compile(
            r"\b(?:evening|sunset|sun\s+set|dusk|dinner)\b", re.IGNORECASE
        ),
        TimeOfDay.NIGHT: re.compile(r"\b(?:night|midnight|dark)\b", re.IGNORECASE),
    }

    # Day change patterns
    DAY_PATTERNS = [
        re.compile(r"(?:the\s+)?next\s+(?:day|morning)", re.IGNORECASE),
        re.compile(r"(?:the\s+)?following\s+day", re.IGNORECASE),
        re.compile(r"(?:a|one|two|three)\s+days?\s+later", re.IGNORECASE),
        re.compile(r"(?:that\s+)?night", re.IGNORECASE),
    ]

    @classmethod
    def extract_time_of_day(cls, text: str) -> Optional[TimeOfDay]:
        """Extract time of day from text."""
        for time_of_day, pattern in cls.TIME_PATTERNS.items():
            if pattern.search(text):
                return time_of_day
        return None

    @classmethod
    def detect_day_change(cls, text: str) -> bool:
        """Detect if the text indicates a day change."""
        return any(pattern.search(text) for pattern in cls.DAY_PATTERNS)

    @classmethod
    def analyze_timeline(cls, events: list[TimelineEvent]) -> list[ContinuityIssue]:
        """Analyze timeline events for consistency issues."""
        issues: list[ContinuityIssue] = []

        if len(events) < 2:
            return issues

        # Sort events by chapter and position
        sorted_events = sorted(events)

        prev_event: Optional[TimelineEvent] = None
        for event in sorted_events:
            if prev_event:
                # Check for impossible time sequences within the same day
                if (
                    prev_event.day_number == event.day_number
                    and prev_event.time_of_day
                    and event.time_of_day
                ):
                    time_order = list(TimeOfDay)
                    prev_idx = time_order.index(prev_event.time_of_day)
                    curr_idx = time_order.index(event.time_of_day)

                    if curr_idx < prev_idx:
                        issues.append(
                            ContinuityIssue(
                                id=str(uuid4()),
                                issue_type=IssueType.TIMELINE,
                                severity=IssueSeverity.ERROR,
                                chapter_number=event.chapter_number,
                                description=(
                                    f"Time goes backwards: '{prev_event.description[:30]}...' "
                                    f"happens at {prev_event.time_of_day.value}, but "
                                    f"'{event.description[:30]}...' happens at "
                                    f"{event.time_of_day.value} on the same day."
                                ),
                                related_event_id=event.id,
                                auto_fixable=False,
                            )
                        )

            prev_event = event

        return issues

    @classmethod
    def find_timeline_gaps(cls, events: list[TimelineEvent]) -> list[str]:
        """Find significant gaps in the timeline."""
        gaps: list[str] = []

        if len(events) < 2:
            return gaps

        sorted_events = sorted(events)
        prev_event = sorted_events[0]

        for event in sorted_events[1:]:
            if event.day_number and prev_event.day_number:
                day_gap = event.day_number - prev_event.day_number
                if day_gap > 7:
                    gaps.append(
                        f"Large time gap ({day_gap} days) between "
                        f"chapter {prev_event.chapter_number} and {event.chapter_number}."
                    )

            prev_event = event

        return gaps


class WorldRuleAnalyzer:
    """Analyzes world-building rules for consistency."""

    @classmethod
    def check_rule_violations(
        cls, rules: list[WorldRule], chapters: dict[int, str]
    ) -> list[ContinuityIssue]:
        """Check for violations of established world rules."""
        issues: list[ContinuityIssue] = []

        for rule in rules:
            if not rule.established_in_chapter:
                continue

            # Check chapters after the rule was established
            for chapter_num in sorted(chapters.keys()):
                if chapter_num <= rule.established_in_chapter:
                    continue

                chapters[chapter_num]

                # Look for potential violations (basic keyword matching)
                # This is a simplified check - a real implementation would use NLP
                if rule.category == "magic_system":
                    # Check for magic being used without cost/rules
                    pass
                elif rule.category == "technology":
                    # Check for anachronistic technology
                    pass

        return issues


# ============================================================================
# Main Service
# ============================================================================


@dataclass
class ContinuityCheckResult:
    """Result of a continuity check."""

    issues: list[ContinuityIssue]
    characters: dict[str, CharacterTracker]
    timeline_events: list[TimelineEvent]
    world_rules: list[WorldRule]
    timeline_gaps: list[str]
    overall_score: float
    summary: str


class ContinuityService:
    """Main service for continuity checking."""

    def __init__(self) -> None:
        self.characters: dict[str, CharacterTracker] = {}
        self.timeline_events: list[TimelineEvent] = []
        self.world_rules: list[WorldRule] = []

    def register_character(
        self, name: str, aliases: Optional[list[str]] = None
    ) -> CharacterTracker:
        """Register a character for tracking."""
        tracker = CharacterTracker(name=name, aliases=aliases or [])
        self.characters[name.lower()] = tracker
        return tracker

    def get_character(self, name: str) -> Optional[CharacterTracker]:
        """Get a character tracker by name or alias."""
        name_lower = name.lower()
        if name_lower in self.characters:
            return self.characters[name_lower]

        # Check aliases
        for tracker in self.characters.values():
            if name_lower in [a.lower() for a in tracker.aliases]:
                return tracker

        return None

    def add_timeline_event(
        self,
        chapter_number: int,
        description: str,
        **kwargs,
    ) -> TimelineEvent:
        """Add a timeline event."""
        event = TimelineEvent(
            id=str(uuid4()),
            chapter_number=chapter_number,
            description=description,
            **kwargs,
        )
        self.timeline_events.append(event)
        return event

    def add_world_rule(
        self,
        name: str,
        category: str,
        description: str,
        **kwargs,
    ) -> WorldRule:
        """Add a world rule."""
        rule = WorldRule(
            id=str(uuid4()),
            name=name,
            category=category,
            description=description,
            **kwargs,
        )
        self.world_rules.append(rule)
        return rule

    def check_character_consistency(self, chapters: dict[int, str]) -> list[ContinuityIssue]:
        """Check all characters for consistency issues."""
        issues: list[ContinuityIssue] = []

        for tracker in self.characters.values():
            # Check physical descriptions
            issues.extend(PhysicalDescriptionAnalyzer.find_inconsistencies(tracker))

            # Check knowledge state
            issues.extend(KnowledgeStateAnalyzer.find_knowledge_issues(tracker, chapters))

            # Check location continuity
            issues.extend(LocationTracker.find_teleportation_issues(tracker, chapters))

        return issues

    def check_timeline_consistency(self) -> list[ContinuityIssue]:
        """Check timeline for consistency issues."""
        return TimelineAnalyzer.analyze_timeline(self.timeline_events)

    def check_world_consistency(self, chapters: dict[int, str]) -> list[ContinuityIssue]:
        """Check world rules for violations."""
        return WorldRuleAnalyzer.check_rule_violations(self.world_rules, chapters)

    def find_timeline_gaps(self) -> list[str]:
        """Find gaps in the timeline."""
        return TimelineAnalyzer.find_timeline_gaps(self.timeline_events)

    def calculate_overall_score(self, issues: list[ContinuityIssue]) -> float:
        """Calculate overall continuity score (0-1)."""
        if not issues:
            return 1.0

        # Weight by severity
        weights = {
            IssueSeverity.INFO: 0.1,
            IssueSeverity.WARNING: 0.3,
            IssueSeverity.ERROR: 0.6,
        }

        total_penalty = sum(weights.get(issue.severity, 0.3) for issue in issues)

        # Normalize: 10 errors would give score of 0
        score = max(0.0, 1.0 - (total_penalty / 10))
        return round(score, 2)

    def generate_summary(self, issues: list[ContinuityIssue], score: float) -> str:
        """Generate a summary of the continuity check."""
        if not issues:
            return "No continuity issues detected. The manuscript maintains consistency."

        by_type = {}
        for issue in issues:
            by_type[issue.issue_type.value] = by_type.get(issue.issue_type.value, 0) + 1

        by_severity = {}
        for issue in issues:
            by_severity[issue.severity.value] = by_severity.get(issue.severity.value, 0) + 1

        parts = [f"Found {len(issues)} continuity issue(s)."]

        if by_severity.get("error"):
            parts.append(f"{by_severity['error']} critical errors require attention.")

        if by_severity.get("warning"):
            parts.append(f"{by_severity['warning']} warnings should be reviewed.")

        if by_type.get("character"):
            parts.append(f"{by_type['character']} character-related issues.")

        if by_type.get("timeline"):
            parts.append(f"{by_type['timeline']} timeline issues.")

        parts.append(f"Overall consistency score: {score * 100:.0f}%.")

        return " ".join(parts)

    def run_full_check(
        self,
        chapters: dict[int, str],
        check_types: Optional[list[str]] = None,
    ) -> ContinuityCheckResult:
        """Run a full continuity check."""
        if check_types is None:
            check_types = ["character", "timeline", "world"]

        all_issues: list[ContinuityIssue] = []

        if "character" in check_types:
            all_issues.extend(self.check_character_consistency(chapters))

        if "timeline" in check_types:
            all_issues.extend(self.check_timeline_consistency())

        if "world" in check_types:
            all_issues.extend(self.check_world_consistency(chapters))

        timeline_gaps = self.find_timeline_gaps() if "timeline" in check_types else []
        score = self.calculate_overall_score(all_issues)
        summary = self.generate_summary(all_issues, score)

        return ContinuityCheckResult(
            issues=all_issues,
            characters=self.characters,
            timeline_events=self.timeline_events,
            world_rules=self.world_rules,
            timeline_gaps=timeline_gaps,
            overall_score=score,
            summary=summary,
        )


# ============================================================================
# Character Extraction
# ============================================================================


class CharacterExtractor:
    """Extracts character information from text."""

    # Common proper noun patterns
    PROPER_NOUN_PATTERN = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b")

    # Common non-character proper nouns to exclude
    EXCLUDE_WORDS = {
        "the",
        "a",
        "an",
        "i",
        "he",
        "she",
        "they",
        "it",
        "we",
        "you",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
        "chapter",
        "part",
        "book",
        "volume",
    }

    @classmethod
    def extract_potential_characters(cls, text: str) -> set[str]:
        """Extract potential character names from text."""
        matches = cls.PROPER_NOUN_PATTERN.findall(text)
        characters = set()

        for match in matches:
            # Filter out common non-character words
            if match.lower() not in cls.EXCLUDE_WORDS:
                characters.add(match)

        return characters

    @classmethod
    def count_mentions(cls, text: str, name: str) -> int:
        """Count how many times a name appears in text."""
        pattern = re.compile(rf"\b{re.escape(name)}\b", re.IGNORECASE)
        return len(pattern.findall(text))

    @classmethod
    def find_main_characters(cls, chapters: dict[int, str], min_mentions: int = 5) -> list[str]:
        """Find main characters based on mention frequency."""
        all_text = " ".join(chapters.values())
        potential_chars = cls.extract_potential_characters(all_text)

        # Count mentions for each potential character
        char_mentions = []
        for char in potential_chars:
            count = cls.count_mentions(all_text, char)
            if count >= min_mentions:
                char_mentions.append((char, count))

        # Sort by mention count
        char_mentions.sort(key=lambda x: x[1], reverse=True)

        return [char for char, _ in char_mentions]
