"""Fantasy-specific features for sopher.ai.

This module provides specialized tools for fantasy novel generation including:
- Magic system consistency
- World-building integration
- Naming convention enforcement
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class MagicSystemType(Enum):
    """Types of magic systems."""

    HARD = "hard"  # Defined rules, costs, limitations
    SOFT = "soft"  # Mysterious, undefined, wonder-focused
    HYBRID = "hybrid"  # Mix of both
    ELEMENTAL = "elemental"  # Based on elements
    RITUAL = "ritual"  # Requires ceremonies or components
    INNATE = "innate"  # Born with abilities
    LEARNED = "learned"  # Must study to use magic
    DIVINE = "divine"  # Granted by gods/higher powers


class WorldBuildingCategory(Enum):
    """Categories of world-building elements."""

    GEOGRAPHY = "geography"
    POLITICS = "politics"
    RELIGION = "religion"
    CULTURE = "culture"
    ECONOMY = "economy"
    HISTORY = "history"
    MAGIC = "magic"
    RACES = "races"
    TECHNOLOGY = "technology"
    LANGUAGE = "language"


class FantasySubgenre(Enum):
    """Fantasy subgenres."""

    EPIC = "epic"  # Large scale, world-changing events
    HIGH = "high"  # Magic-rich, alternate world
    LOW = "low"  # Limited magic, grounded
    URBAN = "urban"  # Modern setting with magic
    DARK = "dark"  # Gritty, morally gray
    COZY = "cozy"  # Warm, comfortable, low stakes
    PORTAL = "portal"  # Travel to another world
    GRIMDARK = "grimdark"  # Bleak, violent, cynical
    ROMANTIC = "romantic"  # Romance central to plot
    SWORD_AND_SORCERY = "sword_and_sorcery"  # Action-focused
    MYTHIC = "mythic"  # Based on mythology


class NamingConvention(Enum):
    """Naming convention styles."""

    ELVISH = "elvish"  # Melodic, flowing names
    DWARVEN = "dwarven"  # Guttural, consonant-heavy
    NORSE = "norse"  # Scandinavian inspired
    CELTIC = "celtic"  # Irish/Welsh inspired
    EASTERN = "eastern"  # Asian inspired
    ARABIC = "arabic"  # Middle Eastern inspired
    LATIN = "latin"  # Roman/Latin inspired
    INVENTED = "invented"  # Unique constructed language
    ENGLISH = "english"  # Standard English names


@dataclass
class MagicRule:
    """A rule or constraint in the magic system."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    description: str = ""
    source: str = ""  # What powers the magic
    cost: str = ""  # What using magic costs
    limitation: str = ""  # What magic cannot do
    examples: list[str] = field(default_factory=list)


@dataclass
class MagicAbility:
    """A specific magical ability or spell."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    description: str = ""
    category: str = ""
    power_level: int = 1  # 1-10 scale
    requirements: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    known_by: list[str] = field(default_factory=list)


@dataclass
class MagicSystem:
    """Complete magic system definition."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    system_type: MagicSystemType = MagicSystemType.HYBRID
    description: str = ""
    source: str = ""  # Where magic comes from
    cost: str = ""  # Default cost of using magic
    rules: list[MagicRule] = field(default_factory=list)
    abilities: list[MagicAbility] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    consequences: list[str] = field(default_factory=list)


@dataclass
class WorldElement:
    """A world-building element."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    category: WorldBuildingCategory = WorldBuildingCategory.GEOGRAPHY
    description: str = ""
    significance: str = ""
    related_elements: list[str] = field(default_factory=list)
    first_mentioned: int = 0  # Chapter first mentioned


@dataclass
class FantasyRace:
    """A fantasy race or species."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    description: str = ""
    physical_traits: list[str] = field(default_factory=list)
    cultural_traits: list[str] = field(default_factory=list)
    magic_affinity: str = ""
    naming_convention: NamingConvention = NamingConvention.INVENTED
    relations_with_others: dict[str, str] = field(default_factory=dict)


@dataclass
class WorldBuilding:
    """Complete world-building structure."""

    id: UUID = field(default_factory=uuid4)
    world_name: str = ""
    era: str = ""
    subgenre: FantasySubgenre = FantasySubgenre.HIGH
    magic_system: Optional[MagicSystem] = None
    elements: list[WorldElement] = field(default_factory=list)
    races: list[FantasyRace] = field(default_factory=list)
    established_facts: list[str] = field(default_factory=list)


@dataclass
class ConsistencyIssue:
    """A detected consistency issue."""

    element: str
    issue_type: str
    description: str
    chapter_detected: int
    conflicting_chapters: list[int] = field(default_factory=list)
    suggestion: str = ""


class MagicSystemBuilder:
    """Builds and validates magic systems."""

    def __init__(self):
        self._systems: dict[UUID, MagicSystem] = {}

    def create_system(
        self,
        name: str,
        system_type: MagicSystemType = MagicSystemType.HYBRID,
        source: str = "",
        cost: str = "",
        description: str = "",
    ) -> MagicSystem:
        """Create a new magic system."""
        system = MagicSystem(
            name=name,
            system_type=system_type,
            source=source,
            cost=cost,
            description=description,
        )
        self._systems[system.id] = system
        return system

    def get_system(self, system_id: UUID) -> Optional[MagicSystem]:
        """Get a magic system by ID."""
        return self._systems.get(system_id)

    def add_rule(
        self,
        system_id: UUID,
        name: str,
        description: str,
        **kwargs,
    ) -> Optional[MagicRule]:
        """Add a rule to a magic system."""
        system = self._systems.get(system_id)
        if not system:
            return None

        rule = MagicRule(name=name, description=description, **kwargs)
        system.rules.append(rule)
        return rule

    def add_ability(
        self,
        system_id: UUID,
        name: str,
        description: str,
        **kwargs,
    ) -> Optional[MagicAbility]:
        """Add an ability to a magic system."""
        system = self._systems.get(system_id)
        if not system:
            return None

        ability = MagicAbility(name=name, description=description, **kwargs)
        system.abilities.append(ability)
        return ability

    def validate_system(self, system_id: UUID) -> list[str]:
        """Validate a magic system for consistency."""
        issues = []
        system = self._systems.get(system_id)

        if not system:
            return ["System not found"]

        if system.system_type == MagicSystemType.HARD:
            if not system.source:
                issues.append("Hard magic system needs a defined source")
            if not system.cost:
                issues.append("Hard magic system needs a defined cost")
            if len(system.rules) < 2:
                issues.append("Hard magic system needs at least 2 rules")
            if not system.limitations:
                issues.append("Hard magic system needs defined limitations")

        if not system.description:
            issues.append("Magic system needs a description")

        return issues

    def generate_system_prompt(self, system: MagicSystem) -> str:
        """Generate a prompt describing the magic system."""
        prompts = []

        prompts.append(f"**Magic System: {system.name}**")
        prompts.append(f"Type: {system.system_type.value}")

        if system.description:
            prompts.append(f"Description: {system.description}")

        if system.source:
            prompts.append(f"Source: Magic comes from {system.source}")

        if system.cost:
            prompts.append(f"Cost: Using magic costs {system.cost}")

        if system.limitations:
            prompts.append(f"Limitations: {', '.join(system.limitations)}")

        if system.rules:
            prompts.append("Rules:")
            for rule in system.rules[:5]:
                prompts.append(f"  - {rule.name}: {rule.description}")

        if system.consequences:
            prompts.append(f"Consequences of overuse: {', '.join(system.consequences)}")

        return "\n".join(prompts)


class WorldBuildingManager:
    """Manages world-building elements."""

    def __init__(self):
        self._worlds: dict[UUID, WorldBuilding] = {}

    def create_world(
        self,
        world_name: str,
        subgenre: FantasySubgenre = FantasySubgenre.HIGH,
        era: str = "medieval",
    ) -> WorldBuilding:
        """Create a new world."""
        world = WorldBuilding(
            world_name=world_name,
            subgenre=subgenre,
            era=era,
        )
        self._worlds[world.id] = world
        return world

    def get_world(self, world_id: UUID) -> Optional[WorldBuilding]:
        """Get a world by ID."""
        return self._worlds.get(world_id)

    def add_element(
        self,
        world_id: UUID,
        name: str,
        category: WorldBuildingCategory,
        description: str,
        **kwargs,
    ) -> Optional[WorldElement]:
        """Add a world element."""
        world = self._worlds.get(world_id)
        if not world:
            return None

        element = WorldElement(
            name=name,
            category=category,
            description=description,
            **kwargs,
        )
        world.elements.append(element)
        return element

    def add_race(
        self,
        world_id: UUID,
        name: str,
        description: str,
        **kwargs,
    ) -> Optional[FantasyRace]:
        """Add a fantasy race."""
        world = self._worlds.get(world_id)
        if not world:
            return None

        race = FantasyRace(name=name, description=description, **kwargs)
        world.races.append(race)
        return race

    def add_established_fact(
        self,
        world_id: UUID,
        fact: str,
    ) -> bool:
        """Add an established world fact."""
        world = self._worlds.get(world_id)
        if not world:
            return False

        world.established_facts.append(fact)
        return True

    def get_elements_by_category(
        self,
        world_id: UUID,
        category: WorldBuildingCategory,
    ) -> list[WorldElement]:
        """Get elements by category."""
        world = self._worlds.get(world_id)
        if not world:
            return []

        return [e for e in world.elements if e.category == category]

    def generate_world_summary(self, world: WorldBuilding) -> str:
        """Generate a summary of the world."""
        parts = []

        parts.append(f"**World: {world.world_name}**")
        parts.append(f"Era: {world.era}")
        parts.append(f"Subgenre: {world.subgenre.value}")

        if world.established_facts:
            parts.append("\nEstablished Facts:")
            for fact in world.established_facts[:10]:
                parts.append(f"  - {fact}")

        if world.races:
            parts.append("\nRaces:")
            for race in world.races:
                parts.append(f"  - {race.name}: {race.description[:100]}...")

        # Group elements by category
        for category in WorldBuildingCategory:
            elements = [e for e in world.elements if e.category == category]
            if elements:
                parts.append(f"\n{category.value.title()}:")
                for elem in elements[:3]:
                    parts.append(f"  - {elem.name}: {elem.description[:50]}...")

        return "\n".join(parts)


class NamingConventionEnforcer:
    """Enforces naming conventions for consistency."""

    CONVENTION_PATTERNS = {
        NamingConvention.ELVISH: {
            "vowel_heavy": True,
            "common_endings": ["iel", "wen", "dil", "las", "or", "oth"],
            "common_prefixes": ["El", "Gal", "Cel", "Ar", "Fae"],
            "avoid": ["hard consonant clusters", "z", "x"],
            "examples": ["Galadriel", "Celeborn", "Arwen", "Elrond"],
        },
        NamingConvention.DWARVEN: {
            "vowel_heavy": False,
            "common_endings": ["in", "im", "ur", "ak", "or"],
            "common_prefixes": ["Thor", "Dur", "Gim", "Bal", "Dwar"],
            "avoid": ["flowing sounds", "too many syllables"],
            "examples": ["Thorin", "Gimli", "Balin", "Durin"],
        },
        NamingConvention.NORSE: {
            "common_endings": ["son", "dottir", "heim", "gard", "ulf"],
            "common_prefixes": ["Thor", "Sig", "Bjorn", "Rag", "Frey"],
            "examples": ["Ragnar", "Sigrid", "Bjorn", "Freya"],
        },
        NamingConvention.CELTIC: {
            "common_endings": ["wen", "an", "ach", "id", "og"],
            "common_prefixes": ["Bran", "Mor", "Fion", "Aed", "Conn"],
            "examples": ["Branwen", "Fionn", "Aedhan", "Morrighan"],
        },
    }

    def get_convention_rules(self, convention: NamingConvention) -> dict:
        """Get rules for a naming convention."""
        return self.CONVENTION_PATTERNS.get(convention, {})

    def suggest_names(self, convention: NamingConvention, count: int = 5) -> list[str]:
        """Suggest names following a convention."""
        rules = self.CONVENTION_PATTERNS.get(convention, {})
        examples = rules.get("examples", [])
        return examples[:count]

    def validate_name(self, name: str, convention: NamingConvention) -> tuple[bool, str]:
        """Validate a name against a convention."""
        rules = self.CONVENTION_PATTERNS.get(convention, {})
        if not rules:
            return True, "Convention not defined"

        # Check vowel ratio
        vowels = sum(1 for c in name.lower() if c in "aeiou")
        ratio = vowels / len(name) if name else 0

        if rules.get("vowel_heavy") and ratio < 0.4:
            return False, f"Name should be more vowel-heavy for {convention.value}"

        if rules.get("vowel_heavy") is False and ratio > 0.5:
            return False, f"Name should be more consonant-heavy for {convention.value}"

        return True, "Name follows convention"

    def generate_naming_prompt(self, convention: NamingConvention) -> str:
        """Generate a prompt for naming consistency."""
        rules = self.CONVENTION_PATTERNS.get(convention, {})
        if not rules:
            return ""

        parts = [f"**Naming Convention: {convention.value}**"]

        if "common_endings" in rules:
            parts.append(f"Common endings: {', '.join(rules['common_endings'])}")

        if "common_prefixes" in rules:
            parts.append(f"Common prefixes: {', '.join(rules['common_prefixes'])}")

        if "avoid" in rules:
            parts.append(f"Avoid: {', '.join(rules['avoid'])}")

        if "examples" in rules:
            parts.append(f"Examples: {', '.join(rules['examples'])}")

        return "\n".join(parts)


class ConsistencyChecker:
    """Checks for world-building consistency issues."""

    def __init__(self):
        self._facts: dict[str, list[tuple[int, str]]] = {}  # element -> [(chapter, value)]

    def record_fact(self, element: str, value: str, chapter: int):
        """Record a fact about an element."""
        if element not in self._facts:
            self._facts[element] = []
        self._facts[element].append((chapter, value))

    def check_consistency(self, element: str) -> list[ConsistencyIssue]:
        """Check consistency for an element."""
        issues = []
        facts = self._facts.get(element, [])

        if len(facts) < 2:
            return []

        # Check for conflicting values
        values = {}
        for chapter, value in facts:
            if value not in values:
                values[value] = []
            values[value].append(chapter)

        if len(values) > 1:
            issue = ConsistencyIssue(
                element=element,
                issue_type="conflicting_values",
                description=f"Element '{element}' has conflicting descriptions",
                chapter_detected=facts[-1][0],
                conflicting_chapters=[c for c, _ in facts],
                suggestion="Review and unify the descriptions",
            )
            issues.append(issue)

        return issues

    def check_magic_consistency(
        self,
        system: MagicSystem,
        usage_log: list[dict],
    ) -> list[ConsistencyIssue]:
        """Check magic system consistency against usage."""
        issues = []

        for usage in usage_log:
            ability_name = usage.get("ability", "")
            chapter = usage.get("chapter", 0)

            # Check if ability is defined
            known_abilities = [a.name.lower() for a in system.abilities]
            if (
                ability_name.lower() not in known_abilities
                and system.system_type == MagicSystemType.HARD
            ):
                issues.append(
                    ConsistencyIssue(
                        element=ability_name,
                        issue_type="undefined_ability",
                        description=f"Magic ability '{ability_name}' used but not defined in system",
                        chapter_detected=chapter,
                        suggestion="Either define this ability or use an existing one",
                    )
                )

            # Check if cost was paid
            if usage.get("no_cost") and system.cost:
                issues.append(
                    ConsistencyIssue(
                        element=ability_name,
                        issue_type="unpaid_cost",
                        description=f"Magic used without paying the established cost ({system.cost})",
                        chapter_detected=chapter,
                        suggestion="Show the cost being paid or explain why it wasn't required",
                    )
                )

        return issues


class FantasyService:
    """Main service for fantasy-specific features."""

    def __init__(self):
        self.magic_builder = MagicSystemBuilder()
        self.world_manager = WorldBuildingManager()
        self.naming_enforcer = NamingConventionEnforcer()
        self.consistency_checker = ConsistencyChecker()

    def create_world(
        self,
        world_name: str,
        subgenre: FantasySubgenre = FantasySubgenre.HIGH,
        era: str = "medieval",
    ) -> WorldBuilding:
        """Create a new fantasy world."""
        return self.world_manager.create_world(world_name, subgenre, era)

    def get_world(self, world_id: UUID) -> Optional[WorldBuilding]:
        """Get a world by ID."""
        return self.world_manager.get_world(world_id)

    def create_magic_system(
        self,
        world_id: UUID,
        name: str,
        system_type: MagicSystemType = MagicSystemType.HYBRID,
        **kwargs,
    ) -> Optional[MagicSystem]:
        """Create a magic system for a world."""
        world = self.world_manager.get_world(world_id)
        if not world:
            return None

        system = self.magic_builder.create_system(name, system_type, **kwargs)
        world.magic_system = system
        return system

    def add_magic_rule(
        self,
        world_id: UUID,
        name: str,
        description: str,
        **kwargs,
    ) -> Optional[MagicRule]:
        """Add a rule to the world's magic system."""
        world = self.world_manager.get_world(world_id)
        if not world or not world.magic_system:
            return None

        return self.magic_builder.add_rule(world.magic_system.id, name, description, **kwargs)

    def add_world_element(
        self,
        world_id: UUID,
        name: str,
        category: WorldBuildingCategory,
        description: str,
        **kwargs,
    ) -> Optional[WorldElement]:
        """Add a world element."""
        return self.world_manager.add_element(world_id, name, category, description, **kwargs)

    def add_race(
        self,
        world_id: UUID,
        name: str,
        description: str,
        **kwargs,
    ) -> Optional[FantasyRace]:
        """Add a fantasy race."""
        return self.world_manager.add_race(world_id, name, description, **kwargs)

    def validate_magic_system(self, world_id: UUID) -> list[str]:
        """Validate the world's magic system."""
        world = self.world_manager.get_world(world_id)
        if not world or not world.magic_system:
            return ["No magic system defined"]

        return self.magic_builder.validate_system(world.magic_system.id)

    def get_naming_rules(self, convention: NamingConvention) -> dict:
        """Get naming convention rules."""
        return self.naming_enforcer.get_convention_rules(convention)

    def validate_name(self, name: str, convention: NamingConvention) -> tuple[bool, str]:
        """Validate a name against a convention."""
        return self.naming_enforcer.validate_name(name, convention)

    def record_world_fact(self, world_id: UUID, element: str, value: str, chapter: int):
        """Record a world-building fact for consistency checking."""
        self.consistency_checker.record_fact(f"{world_id}:{element}", value, chapter)

    def check_consistency(self, world_id: UUID, element: str) -> list[ConsistencyIssue]:
        """Check consistency for a world element."""
        return self.consistency_checker.check_consistency(f"{world_id}:{element}")

    def generate_chapter_prompt(
        self,
        world_id: UUID,
        chapter_number: int,
        total_chapters: int,
    ) -> str:
        """Generate a fantasy-specific prompt for a chapter."""
        world = self.world_manager.get_world(world_id)
        if not world:
            return ""

        prompts = []

        # Subgenre guidance
        subgenre_guidance = self._get_subgenre_guidance(world.subgenre)
        if subgenre_guidance:
            prompts.append(f"**Subgenre ({world.subgenre.value})**: {subgenre_guidance}")

        # Magic system
        if world.magic_system:
            magic_prompt = self.magic_builder.generate_system_prompt(world.magic_system)
            prompts.append(magic_prompt)

        # World elements mentioned by this point
        relevant_elements = [e for e in world.elements if e.first_mentioned <= chapter_number]
        if relevant_elements:
            prompts.append("**Established World Elements**:")
            for elem in relevant_elements[:5]:
                prompts.append(
                    f"  - {elem.name} ({elem.category.value}): {elem.description[:50]}..."
                )

        # Established facts
        if world.established_facts:
            prompts.append("**World Facts to Remember**:")
            for fact in world.established_facts[:5]:
                prompts.append(f"  - {fact}")

        return "\n\n".join(prompts)

    def _get_subgenre_guidance(self, subgenre: FantasySubgenre) -> str:
        """Get writing guidance for a fantasy subgenre."""
        guidance = {
            FantasySubgenre.EPIC: (
                "Grand scale with world-changing events. Multiple POV characters. "
                "Complex politics and large battles. Clear good vs evil or moral complexity."
            ),
            FantasySubgenre.HIGH: (
                "Magic is common and accepted. Focus on wonder and spectacle. "
                "The world is distinctly different from ours."
            ),
            FantasySubgenre.LOW: (
                "Magic is rare or subtle. Focus on human drama. "
                "More grounded, realistic approach to the fantastic."
            ),
            FantasySubgenre.URBAN: (
                "Modern or near-modern setting with magical elements. "
                "Magic hidden from ordinary world or recently revealed. "
                "Contemporary voice and concerns."
            ),
            FantasySubgenre.DARK: (
                "Gritty, morally gray world. Violence and consequences realistic. "
                "No easy answers. Heroes are flawed."
            ),
            FantasySubgenre.COZY: (
                "Low stakes, warm atmosphere. Focus on community and comfort. "
                "Magic adds whimsy, not danger. Positive resolutions."
            ),
            FantasySubgenre.GRIMDARK: (
                "Bleak world, cynical tone. Violence is brutal. "
                "Traditional heroes fail. Power corrupts. "
                "Reader should feel the weight of the world."
            ),
            FantasySubgenre.SWORD_AND_SORCERY: (
                "Action-focused adventure. Personal stakes over world stakes. "
                "Roguish heroes. Magic is dangerous and mysterious. "
                "Fast pacing, clear conflicts."
            ),
        }
        return guidance.get(subgenre, "")

    def get_world_summary(self, world_id: UUID) -> str:
        """Get a summary of the world."""
        world = self.world_manager.get_world(world_id)
        if not world:
            return ""
        return self.world_manager.generate_world_summary(world)
