"""
Character bible service for tracking and managing character information.

Provides:
- Auto-extraction of character details from generated content
- Character state tracking per chapter
- Contradiction detection
- Relationship mapping
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from uuid import uuid4


class CharacterRole(str, Enum):
    """Character role in the story."""

    PROTAGONIST = "protagonist"
    ANTAGONIST = "antagonist"
    SUPPORTING = "supporting"
    MINOR = "minor"
    MENTIONED = "mentioned"


class RelationshipType(str, Enum):
    """Types of character relationships."""

    FAMILY = "family"
    FRIEND = "friend"
    ENEMY = "enemy"
    ROMANTIC = "romantic"
    PROFESSIONAL = "professional"
    MENTOR = "mentor"
    STUDENT = "student"
    RIVAL = "rival"
    NEUTRAL = "neutral"


@dataclass
class PhysicalAttribute:
    """A physical attribute of a character."""

    attribute_type: str  # eye_color, hair_color, height, age, etc.
    value: str
    chapter_established: int
    text_evidence: str
    position: int = 0

    def conflicts_with(self, other: "PhysicalAttribute") -> bool:
        """Check if this attribute conflicts with another."""
        if self.attribute_type != other.attribute_type:
            return False

        # Different values for same attribute type
        return self.value.lower().strip() != other.value.lower().strip()


@dataclass
class PersonalityTrait:
    """A personality trait of a character."""

    trait: str
    chapter_first_seen: int
    text_evidence: str
    positive: bool = True  # Is this a positive or negative trait?

    def __hash__(self) -> int:
        return hash(self.trait.lower())

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, PersonalityTrait):
            return False
        return self.trait.lower() == other.trait.lower()


@dataclass
class CharacterRelationship:
    """A relationship between two characters."""

    character_a: str
    character_b: str
    relationship_type: RelationshipType
    description: str
    chapter_established: int
    reciprocal: bool = True  # Does B have same relationship to A?
    evolution: list[tuple[int, str]] = field(default_factory=list)  # (chapter, description)

    def add_evolution(self, chapter: int, description: str) -> None:
        """Add an evolution in the relationship."""
        self.evolution.append((chapter, description))


@dataclass
class CharacterKnowledge:
    """Something a character knows."""

    knowledge: str
    chapter_learned: int
    source: Optional[str] = None  # How they learned it
    text_evidence: str = ""

    def __hash__(self) -> int:
        return hash(self.knowledge.lower())

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, CharacterKnowledge):
            return False
        return self.knowledge.lower() == other.knowledge.lower()


@dataclass
class CharacterState:
    """A character's state at a specific point in the story."""

    chapter: int
    location: Optional[str] = None
    emotional_state: Optional[str] = None
    physical_condition: Optional[str] = None
    goals: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)


@dataclass
class CharacterEntry:
    """A complete character entry in the bible."""

    id: str
    name: str
    role: CharacterRole
    aliases: list[str] = field(default_factory=list)
    first_appearance: Optional[int] = None
    last_appearance: Optional[int] = None

    # Physical description
    physical_attributes: list[PhysicalAttribute] = field(default_factory=list)

    # Personality
    personality_traits: set[PersonalityTrait] = field(default_factory=set)

    # Backstory
    backstory: str = ""
    backstory_chapter: Optional[int] = None

    # Relationships
    relationships: list[CharacterRelationship] = field(default_factory=list)

    # Knowledge
    knowledge: set[CharacterKnowledge] = field(default_factory=set)

    # State history
    states: list[CharacterState] = field(default_factory=list)

    # Voice/dialogue patterns
    speech_patterns: list[str] = field(default_factory=list)
    common_phrases: list[str] = field(default_factory=list)

    # Metadata
    mention_count: int = 0
    dialogue_lines: int = 0

    def add_physical_attribute(
        self,
        attr_type: str,
        value: str,
        chapter: int,
        evidence: str,
    ) -> Optional[PhysicalAttribute]:
        """Add a physical attribute, checking for conflicts."""
        new_attr = PhysicalAttribute(
            attribute_type=attr_type,
            value=value,
            chapter_established=chapter,
            text_evidence=evidence,
        )

        # Check for conflicts with existing attributes
        for existing in self.physical_attributes:
            if existing.conflicts_with(new_attr):
                return None  # Conflict detected

        self.physical_attributes.append(new_attr)
        return new_attr

    def add_personality_trait(
        self, trait: str, chapter: int, evidence: str, positive: bool = True
    ) -> PersonalityTrait:
        """Add a personality trait."""
        new_trait = PersonalityTrait(
            trait=trait,
            chapter_first_seen=chapter,
            text_evidence=evidence,
            positive=positive,
        )
        self.personality_traits.add(new_trait)
        return new_trait

    def add_knowledge(
        self, knowledge: str, chapter: int, source: Optional[str] = None, evidence: str = ""
    ) -> CharacterKnowledge:
        """Add knowledge the character has."""
        new_knowledge = CharacterKnowledge(
            knowledge=knowledge,
            chapter_learned=chapter,
            source=source,
            text_evidence=evidence,
        )
        self.knowledge.add(new_knowledge)
        return new_knowledge

    def get_knowledge_at_chapter(self, chapter: int) -> set[str]:
        """Get all knowledge the character has by a specific chapter."""
        return {k.knowledge for k in self.knowledge if k.chapter_learned <= chapter}

    def add_relationship(
        self,
        other_character: str,
        relationship_type: RelationshipType,
        description: str,
        chapter: int,
    ) -> CharacterRelationship:
        """Add a relationship with another character."""
        relationship = CharacterRelationship(
            character_a=self.name,
            character_b=other_character,
            relationship_type=relationship_type,
            description=description,
            chapter_established=chapter,
        )
        self.relationships.append(relationship)
        return relationship

    def update_state(
        self,
        chapter: int,
        location: Optional[str] = None,
        emotional_state: Optional[str] = None,
        physical_condition: Optional[str] = None,
    ) -> CharacterState:
        """Update the character's state for a chapter."""
        state = CharacterState(
            chapter=chapter,
            location=location,
            emotional_state=emotional_state,
            physical_condition=physical_condition,
        )
        self.states.append(state)
        return state

    def get_state_at_chapter(self, chapter: int) -> Optional[CharacterState]:
        """Get the character's state at or before a specific chapter."""
        relevant_states = [s for s in self.states if s.chapter <= chapter]
        if relevant_states:
            return max(relevant_states, key=lambda s: s.chapter)
        return None

    def get_physical_attribute(self, attr_type: str) -> Optional[PhysicalAttribute]:
        """Get the first established physical attribute of a type."""
        for attr in sorted(self.physical_attributes, key=lambda a: a.chapter_established):
            if attr.attribute_type == attr_type:
                return attr
        return None


@dataclass
class Contradiction:
    """A detected contradiction in character information."""

    id: str
    character_name: str
    contradiction_type: str  # physical, personality, knowledge, timeline
    description: str
    chapter_a: int
    chapter_b: int
    text_a: str
    text_b: str
    suggested_resolution: Optional[str] = None
    auto_resolvable: bool = False


# ============================================================================
# Extraction Patterns
# ============================================================================


class CharacterExtractors:
    """Patterns for extracting character information from text."""

    # Physical description patterns
    EYE_COLOR = re.compile(
        r"(?:his|her|their)\s+(\w+(?:\s+\w+)?)\s+eyes?"
        r"|eyes?\s+(?:were|was)\s+(\w+)"
        r"|(\w+)[- ]eyed",
        re.IGNORECASE,
    )

    HAIR_COLOR = re.compile(
        r"(?:his|her|their)\s+(\w+(?:\s+\w+)?)\s+hair"
        r"|hair\s+(?:was|were)\s+(\w+)"
        r"|(\w+)[- ]haired",
        re.IGNORECASE,
    )

    HAIR_STYLE = re.compile(
        r"(?:his|her|their)\s+(\w+(?:\s+\w+)?)\s+(?:hair|locks|curls)"
        r"|hair\s+(?:was|were)\s+(?:worn\s+)?(\w+(?:\s+\w+)?)",
        re.IGNORECASE,
    )

    HEIGHT = re.compile(
        r"(?:stood|was|at)\s+(?:about\s+)?(\d+['\"]?\d*(?:\s*(?:feet|foot|ft|inches|in))?)"
        r"|(?:was\s+)?(tall|short|average height|petite|towering|lanky)",
        re.IGNORECASE,
    )

    AGE = re.compile(
        r"(\d+)(?:\s*-?\s*)?(?:years?\s+old|year-old)"
        r"|(?:in\s+(?:his|her|their)\s+)?(twenties|thirties|forties|fifties|sixties|seventies|eighties)"
        r"|(?:was\s+)?(young|old|elderly|middle-aged|teenage|adolescent|child)",
        re.IGNORECASE,
    )

    BUILD = re.compile(
        r"(?:was\s+)?(muscular|slim|slender|stocky|athletic|heavy|thin|lean|broad)",
        re.IGNORECASE,
    )

    # Personality trait patterns
    TRAIT_PATTERNS = [
        re.compile(r"(?:was|seemed|appeared)\s+(?:very\s+)?(\w+)", re.IGNORECASE),
        re.compile(r"(?:his|her|their)\s+(\w+)\s+(?:nature|personality|character)", re.IGNORECASE),
        re.compile(r"(?:a|an)\s+(\w+)\s+(?:person|man|woman|individual)", re.IGNORECASE),
    ]

    # Relationship patterns
    RELATIONSHIP_PATTERNS = [
        (
            RelationshipType.FAMILY,
            re.compile(
                r"(?:his|her|their)\s+(mother|father|sister|brother|son|daughter|aunt|uncle|cousin|grandmother|grandfather)",
                re.IGNORECASE,
            ),
        ),
        (
            RelationshipType.ROMANTIC,
            re.compile(
                r"(?:his|her|their)\s+(wife|husband|girlfriend|boyfriend|partner|fiancé|fiancée|lover)",
                re.IGNORECASE,
            ),
        ),
        (
            RelationshipType.FRIEND,
            re.compile(
                r"(?:his|her|their)\s+(?:best\s+)?friend\s+(\w+)"
                r"|(\w+),?\s+(?:his|her|their)\s+(?:best\s+)?friend",
                re.IGNORECASE,
            ),
        ),
        (
            RelationshipType.MENTOR,
            re.compile(
                r"(?:his|her|their)\s+(?:mentor|teacher|master|guide)\s+(\w+)"
                r"|(\w+),?\s+(?:his|her|their)\s+(?:mentor|teacher|master)",
                re.IGNORECASE,
            ),
        ),
        (
            RelationshipType.ENEMY,
            re.compile(
                r"(?:his|her|their)\s+(?:enemy|nemesis|rival|foe)\s+(\w+)"
                r"|(\w+),?\s+(?:his|her|their)\s+(?:enemy|nemesis|rival|foe)",
                re.IGNORECASE,
            ),
        ),
    ]

    # Knowledge patterns
    KNOWLEDGE_PATTERNS = [
        re.compile(
            r"(?:knew|learned|discovered|realized|understood)\s+that\s+(.+?)(?:\.|,|$)",
            re.IGNORECASE,
        ),
        re.compile(
            r"(?:had\s+learned|had\s+discovered)\s+(?:that\s+)?(.+?)(?:\.|,|$)", re.IGNORECASE
        ),
        re.compile(r"now\s+(?:knew|knows)\s+(?:that\s+)?(.+?)(?:\.|,|$)", re.IGNORECASE),
    ]

    # Location patterns
    LOCATION_PATTERNS = [
        re.compile(r"(?:was|were)\s+(?:in|at)\s+(?:the\s+)?(\w+(?:\s+\w+)?)", re.IGNORECASE),
        re.compile(r"(?:entered|arrived at|reached)\s+(?:the\s+)?(\w+(?:\s+\w+)?)", re.IGNORECASE),
        re.compile(
            r"(?:walked|ran|went)\s+(?:to|into|toward)\s+(?:the\s+)?(\w+(?:\s+\w+)?)", re.IGNORECASE
        ),
    ]

    # Emotional state patterns
    EMOTION_PATTERNS = [
        re.compile(r"(?:felt|was feeling|seemed)\s+(\w+)", re.IGNORECASE),
        re.compile(r"(?:with|in)\s+(\w+)\s+(?:expression|tone|voice)", re.IGNORECASE),
        re.compile(r"(\w+ly)\s+(?:said|replied|responded|asked)", re.IGNORECASE),
    ]

    @classmethod
    def extract_physical_attribute(
        cls, text: str, character_name: str, attr_type: str
    ) -> list[tuple[str, str]]:
        """Extract physical attributes of a given type."""
        results = []
        pattern_map = {
            "eye_color": cls.EYE_COLOR,
            "hair_color": cls.HAIR_COLOR,
            "hair_style": cls.HAIR_STYLE,
            "height": cls.HEIGHT,
            "age": cls.AGE,
            "build": cls.BUILD,
        }

        pattern = pattern_map.get(attr_type)
        if not pattern:
            return results

        # Find sentences mentioning the character
        sentences = re.split(r"[.!?]+", text)
        for sentence in sentences:
            if character_name.lower() in sentence.lower():
                matches = pattern.findall(sentence)
                for match in matches:
                    if isinstance(match, tuple):
                        value = next((m for m in match if m), None)
                    else:
                        value = match
                    if value:
                        results.append((value.strip(), sentence.strip()))

        return results

    @classmethod
    def extract_relationships(
        cls, text: str, character_name: str
    ) -> list[tuple[RelationshipType, str, str]]:
        """Extract relationships for a character."""
        results = []
        sentences = re.split(r"[.!?]+", text)

        for sentence in sentences:
            if character_name.lower() in sentence.lower():
                for rel_type, pattern in cls.RELATIONSHIP_PATTERNS:
                    matches = pattern.findall(sentence)
                    for match in matches:
                        if isinstance(match, tuple):
                            related = next((m for m in match if m), None)
                        else:
                            related = match
                        if related:
                            results.append((rel_type, related.strip(), sentence.strip()))

        return results

    @classmethod
    def extract_knowledge(cls, text: str, character_name: str) -> list[tuple[str, str]]:
        """Extract knowledge gained by a character."""
        results = []
        sentences = re.split(r"[.!?]+", text)

        for sentence in sentences:
            if character_name.lower() in sentence.lower():
                for pattern in cls.KNOWLEDGE_PATTERNS:
                    match = pattern.search(sentence)
                    if match:
                        knowledge = match.group(1).strip()[:200]  # Limit length
                        results.append((knowledge, sentence.strip()))

        return results

    @classmethod
    def extract_location(cls, text: str, character_name: str) -> Optional[tuple[str, str]]:
        """Extract the character's current location."""
        sentences = re.split(r"[.!?]+", text)

        for sentence in sentences:
            if character_name.lower() in sentence.lower():
                for pattern in cls.LOCATION_PATTERNS:
                    match = pattern.search(sentence)
                    if match:
                        return (match.group(1).strip(), sentence.strip())

        return None

    @classmethod
    def extract_emotion(cls, text: str, character_name: str) -> Optional[tuple[str, str]]:
        """Extract the character's emotional state."""
        sentences = re.split(r"[.!?]+", text)

        for sentence in sentences:
            if character_name.lower() in sentence.lower():
                for pattern in cls.EMOTION_PATTERNS:
                    match = pattern.search(sentence)
                    if match:
                        emotion = match.group(1).strip()
                        # Filter out adverbs (ending in -ly) and convert to adjective form
                        if emotion.endswith("ly"):
                            emotion = emotion[:-2]  # Rough conversion
                        return (emotion, sentence.strip())

        return None


# ============================================================================
# Character Bible Service
# ============================================================================


class CharacterBible:
    """Main service for managing the character bible."""

    def __init__(self) -> None:
        self.characters: dict[str, CharacterEntry] = {}
        self.contradictions: list[Contradiction] = []

    def add_character(
        self,
        name: str,
        role: CharacterRole = CharacterRole.SUPPORTING,
        aliases: Optional[list[str]] = None,
    ) -> CharacterEntry:
        """Add a new character to the bible."""
        entry = CharacterEntry(
            id=str(uuid4()),
            name=name,
            role=role,
            aliases=aliases or [],
        )
        self.characters[name.lower()] = entry
        return entry

    def get_character(self, name: str) -> Optional[CharacterEntry]:
        """Get a character by name or alias."""
        name_lower = name.lower()
        if name_lower in self.characters:
            return self.characters[name_lower]

        # Check aliases
        for entry in self.characters.values():
            if name_lower in [a.lower() for a in entry.aliases]:
                return entry

        return None

    def get_or_create_character(
        self, name: str, role: CharacterRole = CharacterRole.SUPPORTING
    ) -> CharacterEntry:
        """Get a character or create if not exists."""
        existing = self.get_character(name)
        if existing:
            return existing
        return self.add_character(name, role)

    def extract_from_chapter(self, chapter_number: int, text: str) -> list[str]:
        """Extract character information from a chapter."""
        extracted_names = []

        for entry in self.characters.values():
            # Check if character appears in this chapter
            if entry.name.lower() in text.lower():
                extracted_names.append(entry.name)

                # Update mention count
                entry.mention_count += text.lower().count(entry.name.lower())

                # Update appearances
                if entry.first_appearance is None:
                    entry.first_appearance = chapter_number
                entry.last_appearance = chapter_number

                # Extract physical attributes
                for attr_type in ["eye_color", "hair_color", "height", "age", "build"]:
                    extractions = CharacterExtractors.extract_physical_attribute(
                        text, entry.name, attr_type
                    )
                    for value, evidence in extractions:
                        result = entry.add_physical_attribute(
                            attr_type, value, chapter_number, evidence
                        )
                        if result is None:
                            # Conflict detected
                            existing = entry.get_physical_attribute(attr_type)
                            if existing:
                                self._record_contradiction(
                                    entry.name,
                                    "physical",
                                    f"{attr_type} changed from '{existing.value}' to '{value}'",
                                    existing.chapter_established,
                                    chapter_number,
                                    existing.text_evidence,
                                    evidence,
                                )

                # Extract relationships
                for rel_type, related, evidence in CharacterExtractors.extract_relationships(
                    text, entry.name
                ):
                    entry.add_relationship(related, rel_type, evidence, chapter_number)

                # Extract knowledge
                for knowledge, evidence in CharacterExtractors.extract_knowledge(text, entry.name):
                    entry.add_knowledge(knowledge, chapter_number, evidence=evidence)

                # Extract location
                location_result = CharacterExtractors.extract_location(text, entry.name)
                if location_result:
                    location, _ = location_result
                    entry.update_state(chapter_number, location=location)

                # Extract emotion
                emotion_result = CharacterExtractors.extract_emotion(text, entry.name)
                if emotion_result:
                    emotion, _ = emotion_result
                    state = entry.get_state_at_chapter(chapter_number)
                    if state:
                        state.emotional_state = emotion
                    else:
                        entry.update_state(chapter_number, emotional_state=emotion)

        return extracted_names

    def _record_contradiction(
        self,
        character_name: str,
        contradiction_type: str,
        description: str,
        chapter_a: int,
        chapter_b: int,
        text_a: str,
        text_b: str,
    ) -> Contradiction:
        """Record a detected contradiction."""
        contradiction = Contradiction(
            id=str(uuid4()),
            character_name=character_name,
            contradiction_type=contradiction_type,
            description=description,
            chapter_a=chapter_a,
            chapter_b=chapter_b,
            text_a=text_a,
            text_b=text_b,
        )
        self.contradictions.append(contradiction)
        return contradiction

    def check_knowledge_consistency(
        self, character_name: str, chapters: dict[int, str]
    ) -> list[Contradiction]:
        """Check if a character references knowledge they shouldn't have yet."""
        entry = self.get_character(character_name)
        if not entry:
            return []

        contradictions = []

        for chapter_num in sorted(chapters.keys()):
            text = chapters[chapter_num]
            if character_name.lower() not in text.lower():
                continue

            # Check for references to future knowledge
            knowledge_at_chapter = entry.get_knowledge_at_chapter(chapter_num - 1)

            # Look for "remembered" or "knew" patterns
            sentences = re.split(r"[.!?]+", text)
            for sentence in sentences:
                if character_name.lower() in sentence.lower():
                    # Check for knowledge references
                    ref_patterns = [
                        re.compile(
                            r"(?:remembered|recalled|knew)\s+(?:that\s+)?(.+)", re.IGNORECASE
                        ),
                    ]
                    for pattern in ref_patterns:
                        match = pattern.search(sentence)
                        if match:
                            referenced = match.group(1).strip()[:100]
                            # Check if this knowledge was established before
                            if not any(
                                referenced.lower() in k.lower() or k.lower() in referenced.lower()
                                for k in knowledge_at_chapter
                            ):
                                contradiction = Contradiction(
                                    id=str(uuid4()),
                                    character_name=character_name,
                                    contradiction_type="knowledge",
                                    description=f"References '{referenced}' before learning it.",
                                    chapter_a=chapter_num,
                                    chapter_b=chapter_num,
                                    text_a=sentence,
                                    text_b="",
                                )
                                contradictions.append(contradiction)

        return contradictions

    def get_all_contradictions(self) -> list[Contradiction]:
        """Get all recorded contradictions."""
        return self.contradictions

    def get_character_summary(self, name: str) -> Optional[dict]:
        """Get a summary of a character's information."""
        entry = self.get_character(name)
        if not entry:
            return None

        return {
            "id": entry.id,
            "name": entry.name,
            "role": entry.role.value,
            "aliases": entry.aliases,
            "first_appearance": entry.first_appearance,
            "last_appearance": entry.last_appearance,
            "physical_attributes": {
                attr.attribute_type: attr.value for attr in entry.physical_attributes
            },
            "personality_traits": [t.trait for t in entry.personality_traits],
            "relationships": [
                {
                    "with": r.character_b,
                    "type": r.relationship_type.value,
                    "description": r.description,
                }
                for r in entry.relationships
            ],
            "knowledge_count": len(entry.knowledge),
            "mention_count": entry.mention_count,
        }

    def export_bible(self) -> dict:
        """Export the entire character bible."""
        return {
            "characters": {
                name: self.get_character_summary(entry.name)
                for name, entry in self.characters.items()
            },
            "contradictions": [
                {
                    "id": c.id,
                    "character": c.character_name,
                    "type": c.contradiction_type,
                    "description": c.description,
                    "chapters": [c.chapter_a, c.chapter_b],
                }
                for c in self.contradictions
            ],
            "total_characters": len(self.characters),
            "total_contradictions": len(self.contradictions),
        }


# ============================================================================
# Auto-Discovery
# ============================================================================


class CharacterDiscovery:
    """Auto-discover characters from text."""

    # Proper noun pattern
    PROPER_NOUN = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b")

    # Common words to exclude
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
        "section",
        "mr",
        "mrs",
        "ms",
        "dr",
        "prof",
    }

    # Words that suggest a character (pronouns following proper nouns)
    CHARACTER_INDICATORS = re.compile(
        r"([A-Z][a-z]+)\s+(?:said|asked|replied|thought|felt|walked|ran|looked|smiled|frowned|nodded)",
        re.IGNORECASE,
    )

    @classmethod
    def discover_characters(
        cls, chapters: dict[int, str], min_mentions: int = 3
    ) -> list[tuple[str, int, CharacterRole]]:
        """
        Discover characters from text.

        Returns: List of (name, mention_count, suggested_role)
        """
        all_text = " ".join(chapters.values())
        candidates: dict[str, int] = {}

        # Find proper nouns
        for match in cls.PROPER_NOUN.finditer(all_text):
            name = match.group(1)
            if name.lower() not in cls.EXCLUDE_WORDS:
                candidates[name] = candidates.get(name, 0) + 1

        # Find character indicators
        for match in cls.CHARACTER_INDICATORS.finditer(all_text):
            name = match.group(1)
            if name.lower() not in cls.EXCLUDE_WORDS:
                candidates[name] = candidates.get(name, 0) + 5  # Weight these higher

        # Filter and sort by mention count
        results = []
        for name, count in candidates.items():
            if count >= min_mentions:
                # Determine role based on mention count
                if count > 50:
                    role = CharacterRole.PROTAGONIST
                elif count > 20:
                    role = CharacterRole.SUPPORTING
                elif count > 10:
                    role = CharacterRole.MINOR
                else:
                    role = CharacterRole.MENTIONED

                results.append((name, count, role))

        # Sort by count descending
        results.sort(key=lambda x: x[1], reverse=True)

        return results

    @classmethod
    def auto_populate_bible(
        cls, bible: CharacterBible, chapters: dict[int, str], min_mentions: int = 3
    ) -> list[str]:
        """Auto-populate a character bible from chapters."""
        discovered = cls.discover_characters(chapters, min_mentions)
        added_names = []

        for name, count, role in discovered:
            if not bible.get_character(name):
                entry = bible.add_character(name, role)
                entry.mention_count = count
                added_names.append(name)

        # Extract information for each character
        for chapter_num in sorted(chapters.keys()):
            bible.extract_from_chapter(chapter_num, chapters[chapter_num])

        return added_names
