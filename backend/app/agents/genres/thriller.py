"""Thriller-specific features for sopher.ai.

This module provides specialized tools for thriller novel generation including:
- Pacing optimizer for tension
- Twist placement suggestions
- Stakes escalation tracking
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class TensionLevel(Enum):
    """Tension levels for pacing."""

    CALM = "calm"  # Low tension, breather
    RISING = "rising"  # Building tension
    HIGH = "high"  # Elevated tension
    PEAK = "peak"  # Maximum tension
    RELEASE = "release"  # Tension release after peak


class ThrillerSubgenre(Enum):
    """Thriller subgenres."""

    PSYCHOLOGICAL = "psychological"  # Mind games, unreliable narrators
    POLITICAL = "political"  # Government, conspiracy
    LEGAL = "legal"  # Courtroom, legal system
    MEDICAL = "medical"  # Medical setting, disease
    TECHNO = "techno"  # Technology, cyber threats
    SPY = "spy"  # Espionage, intelligence
    CRIME = "crime"  # Criminal activities
    ACTION = "action"  # Physical action focus
    DOMESTIC = "domestic"  # Home, family threats
    SUPERNATURAL = "supernatural"  # Horror elements


class TwistType(Enum):
    """Types of plot twists."""

    BETRAYAL = "betrayal"  # Trusted ally is enemy
    IDENTITY = "identity"  # Character isn't who they seem
    REVELATION = "revelation"  # Hidden truth exposed
    REVERSAL = "reversal"  # Tables turn completely
    MISDIRECTION = "misdirection"  # Attention was on wrong thing
    DEAD_CHARACTER = "dead_character"  # Character faked death
    TRUE_VILLAIN = "true_villain"  # Real antagonist revealed
    UNRELIABLE = "unreliable"  # Narrator/POV was wrong
    TIME = "time"  # Timeline manipulation revealed
    REDEMPTION = "redemption"  # Villain isn't all bad


class StakeType(Enum):
    """Types of stakes in thriller."""

    PERSONAL = "personal"  # Individual safety/wellbeing
    LOVED_ONES = "loved_ones"  # Family/friends at risk
    CAREER = "career"  # Professional destruction
    FREEDOM = "freedom"  # Risk of imprisonment
    REPUTATION = "reputation"  # Public image at stake
    LOCAL = "local"  # Community/city at risk
    NATIONAL = "national"  # Country-level threat
    GLOBAL = "global"  # World-ending stakes
    MORAL = "moral"  # Character's soul/values
    SANITY = "sanity"  # Mental stability at risk


@dataclass
class TensionBeat:
    """A tension beat in the story."""

    chapter: int = 0
    level: TensionLevel = TensionLevel.RISING
    description: str = ""
    source: str = ""  # What causes this tension
    release_method: str = ""  # How tension is released


@dataclass
class PlotTwist:
    """A plot twist definition."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    twist_type: TwistType = TwistType.REVELATION
    chapter_revealed: int = 0
    setup_chapters: list[int] = field(default_factory=list)  # Where hints are planted
    description: str = ""
    impact: str = ""  # How this changes the story
    foreshadowing: list[str] = field(default_factory=list)  # Hints to plant


@dataclass
class Stakes:
    """Stakes definition for a chapter or arc."""

    id: UUID = field(default_factory=uuid4)
    stake_type: StakeType = StakeType.PERSONAL
    description: str = ""
    escalation_level: int = 1  # 1-10
    who_at_risk: list[str] = field(default_factory=list)
    deadline: str = ""  # Time pressure if any
    consequences: str = ""  # What happens if protagonist fails


@dataclass
class Antagonist:
    """The antagonist definition."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    motivation: str = ""
    resources: list[str] = field(default_factory=list)
    methods: list[str] = field(default_factory=list)
    weakness: str = ""
    threat_level: int = 5  # 1-10
    intelligence: int = 5  # 1-10
    ruthlessness: int = 5  # 1-10
    is_known: bool = True  # Whether identity is known to protagonist


@dataclass
class ThrillerStructure:
    """Complete thriller story structure."""

    id: UUID = field(default_factory=uuid4)
    subgenre: ThrillerSubgenre = ThrillerSubgenre.PSYCHOLOGICAL
    protagonist_name: str = ""
    antagonist: Optional[Antagonist] = None
    stakes: list[Stakes] = field(default_factory=list)
    twists: list[PlotTwist] = field(default_factory=list)
    tension_beats: list[TensionBeat] = field(default_factory=list)
    ticking_clock: str = ""  # Main time pressure
    red_herrings: list[str] = field(default_factory=list)


class TensionPacer:
    """Manages tension pacing throughout the thriller."""

    # Ideal tension curve for thrillers
    TENSION_CURVE = {
        0.00: TensionLevel.CALM,  # Opening
        0.10: TensionLevel.RISING,  # Inciting incident
        0.20: TensionLevel.HIGH,  # First complication
        0.30: TensionLevel.RISING,  # Building
        0.40: TensionLevel.HIGH,  # Midpoint crisis
        0.50: TensionLevel.RELEASE,  # Brief breather
        0.55: TensionLevel.RISING,  # Rising action
        0.65: TensionLevel.HIGH,  # Major setback
        0.75: TensionLevel.PEAK,  # Dark night of soul
        0.80: TensionLevel.HIGH,  # Climax approach
        0.90: TensionLevel.PEAK,  # Climax
        0.95: TensionLevel.RELEASE,  # Resolution
        1.00: TensionLevel.CALM,  # Denouement
    }

    def get_target_tension(self, position: float) -> TensionLevel:
        """Get target tension level for a story position (0.0-1.0)."""
        closest_position = min(self.TENSION_CURVE.keys(), key=lambda x: abs(x - position))
        return self.TENSION_CURVE[closest_position]

    def get_tension_for_chapter(self, chapter: int, total_chapters: int) -> TensionLevel:
        """Get target tension for a specific chapter."""
        position = chapter / total_chapters
        return self.get_target_tension(position)

    def plan_tension_beats(self, total_chapters: int) -> dict[int, TensionBeat]:
        """Plan tension beats across all chapters."""
        beats = {}
        for chapter in range(1, total_chapters + 1):
            position = chapter / total_chapters
            level = self.get_target_tension(position)
            beats[chapter] = TensionBeat(
                chapter=chapter,
                level=level,
            )
        return beats

    def suggest_release_points(self, total_chapters: int) -> list[int]:
        """Suggest chapters where tension should be released."""
        releases = []
        for chapter in range(1, total_chapters + 1):
            position = chapter / total_chapters
            if self.get_target_tension(position) == TensionLevel.RELEASE:
                releases.append(chapter)
        return releases

    def generate_pacing_prompt(self, chapter: int, total_chapters: int) -> str:
        """Generate pacing guidance for a chapter."""
        position = chapter / total_chapters
        level = self.get_target_tension(position)

        prompts = {
            TensionLevel.CALM: (
                "Keep tension low here. Allow characters (and readers) to breathe. "
                "Use this for setup, character development, or aftermath."
            ),
            TensionLevel.RISING: (
                "Build tension steadily. Introduce complications or hints of danger. "
                "Keep the reader turning pages but don't peak yet."
            ),
            TensionLevel.HIGH: (
                "Maintain high tension. Things are clearly dangerous. "
                "Stakes are real and present. Keep pressure on."
            ),
            TensionLevel.PEAK: (
                "Maximum tension. This is a major crisis point. "
                "Life or death, now or never. Keep it tight and urgent."
            ),
            TensionLevel.RELEASE: (
                "Release tension here. The immediate crisis is past. "
                "Allow processing but plant seeds for what's coming."
            ),
        }

        return f"**Pacing ({level.value})**: {prompts[level]}"


class TwistPlanner:
    """Plans and manages plot twists."""

    def __init__(self):
        self._twists: dict[UUID, PlotTwist] = {}

    def add_twist(
        self,
        name: str,
        twist_type: TwistType,
        chapter_revealed: int,
        description: str = "",
        **kwargs,
    ) -> PlotTwist:
        """Add a plot twist."""
        twist = PlotTwist(
            name=name,
            twist_type=twist_type,
            chapter_revealed=chapter_revealed,
            description=description,
            **kwargs,
        )
        self._twists[twist.id] = twist
        return twist

    def get_twist(self, twist_id: UUID) -> Optional[PlotTwist]:
        """Get a twist by ID."""
        return self._twists.get(twist_id)

    def list_twists(self) -> list[PlotTwist]:
        """List all twists."""
        return list(self._twists.values())

    def plan_setup_chapters(self, twist: PlotTwist, total_chapters: int) -> list[int]:
        """Plan which chapters should contain foreshadowing."""
        reveal = twist.chapter_revealed
        if reveal < 3:
            return [1]

        # Plant clues in 3-5 chapters before reveal
        num_clues = min(5, reveal - 1)
        spacing = (reveal - 1) // num_clues

        return [max(1, reveal - (i * spacing)) for i in range(1, num_clues + 1)]

    def generate_foreshadowing(self, twist: PlotTwist) -> list[str]:
        """Generate foreshadowing suggestions for a twist."""
        suggestions = {
            TwistType.BETRAYAL: [
                "Small inconsistencies in the traitor's story",
                "Moments where they seem too helpful",
                "Unexplained absences during key events",
                "Their past connections to the antagonist",
                "Subtle changes in their behavior under stress",
            ],
            TwistType.IDENTITY: [
                "Physical details that don't quite match",
                "Gaps in their knowledge of their own history",
                "Reactions that seem wrong for their claimed background",
                "Others having vague recognition",
                "Nervous moments when identity is questioned",
            ],
            TwistType.REVELATION: [
                "Locked rooms or forbidden topics",
                "Characters who know more than they say",
                "Historical references that don't add up",
                "Documents with redacted information",
                "Emotional reactions to seemingly neutral topics",
            ],
            TwistType.REVERSAL: [
                "Underestimation of the opponent",
                "Overconfidence at the wrong moment",
                "Missing information that seems irrelevant",
                "Setup that seems like victory",
                "The antagonist seeming too easily beaten",
            ],
            TwistType.TRUE_VILLAIN: [
                "The apparent villain's motivations seem shallow",
                "Someone else benefits more from the situation",
                "Evidence that points in two directions",
                "The 'real' villain helping the protagonist",
                "Power dynamics that don't quite make sense",
            ],
        }
        return suggestions.get(twist.twist_type, [])

    def generate_twist_prompt(self, twist: PlotTwist, is_reveal_chapter: bool) -> str:
        """Generate a prompt for a twist."""
        if is_reveal_chapter:
            return (
                f"**TWIST REVEAL: {twist.name}**\n"
                f"Type: {twist.twist_type.value}\n"
                f"This is the revelation chapter. The truth comes out.\n"
                f"Impact: {twist.impact}\n"
                f"Make sure all planted foreshadowing now makes sense."
            )
        else:
            foreshadowing = self.generate_foreshadowing(twist)
            return (
                f"**Plant foreshadowing for: {twist.name}**\n"
                f"Subtle hints to include (pick 1-2):\n"
                + "\n".join(f"  - {hint}" for hint in foreshadowing[:3])
            )


class StakesEscalator:
    """Manages stakes escalation throughout the thriller."""

    ESCALATION_PATTERN = {
        0.00: 1,  # Personal stakes
        0.15: 2,  # Stakes established
        0.25: 3,  # First escalation
        0.40: 4,  # Midpoint escalation
        0.50: 5,  # Major escalation
        0.65: 6,  # Higher stakes
        0.75: 7,  # Near-maximum
        0.85: 8,  # Final escalation
        0.95: 9,  # Maximum stakes
    }

    def __init__(self):
        self._stakes: dict[UUID, Stakes] = {}

    def add_stakes(
        self,
        stake_type: StakeType,
        description: str,
        escalation_level: int = 1,
        **kwargs,
    ) -> Stakes:
        """Add stakes."""
        stakes = Stakes(
            stake_type=stake_type,
            description=description,
            escalation_level=escalation_level,
            **kwargs,
        )
        self._stakes[stakes.id] = stakes
        return stakes

    def get_stakes(self, stakes_id: UUID) -> Optional[Stakes]:
        """Get stakes by ID."""
        return self._stakes.get(stakes_id)

    def list_stakes(self) -> list[Stakes]:
        """List all stakes."""
        return list(self._stakes.values())

    def get_target_escalation(self, position: float) -> int:
        """Get target escalation level for a story position."""
        closest_position = min(self.ESCALATION_PATTERN.keys(), key=lambda x: abs(x - position))
        return self.ESCALATION_PATTERN[closest_position]

    def plan_escalation(self, total_chapters: int) -> dict[int, int]:
        """Plan escalation levels across chapters."""
        escalation = {}
        for chapter in range(1, total_chapters + 1):
            position = chapter / total_chapters
            escalation[chapter] = self.get_target_escalation(position)
        return escalation

    def suggest_stake_progression(self) -> list[StakeType]:
        """Suggest a progression of stake types."""
        return [
            StakeType.PERSONAL,
            StakeType.CAREER,
            StakeType.LOVED_ONES,
            StakeType.FREEDOM,
            StakeType.LOCAL,
            StakeType.NATIONAL,
        ]

    def generate_stakes_prompt(
        self, chapter: int, total_chapters: int, current_stakes: Optional[Stakes] = None
    ) -> str:
        """Generate a stakes prompt for a chapter."""
        position = chapter / total_chapters
        target_level = self.get_target_escalation(position)

        if current_stakes:
            if current_stakes.escalation_level < target_level:
                return (
                    f"**Stakes Escalation Needed**\n"
                    f"Current: Level {current_stakes.escalation_level} - {current_stakes.description}\n"
                    f"Target: Level {target_level}\n"
                    f"Consider: Adding more people at risk, raising consequences, "
                    f"or introducing time pressure."
                )
            else:
                return (
                    f"**Current Stakes (Level {current_stakes.escalation_level})**\n"
                    f"{current_stakes.description}\n"
                    f"At risk: {', '.join(current_stakes.who_at_risk) or 'protagonist'}\n"
                    f"{'Deadline: ' + current_stakes.deadline if current_stakes.deadline else ''}"
                )
        else:
            return (
                f"**Establish Stakes**\n"
                f"Target escalation: Level {target_level}\n"
                f"Make clear what the protagonist stands to lose."
            )


class ThrillerService:
    """Main service for thriller-specific features."""

    def __init__(self):
        self.pacer = TensionPacer()
        self.twist_planner = TwistPlanner()
        self.escalator = StakesEscalator()
        self._structures: dict[UUID, ThrillerStructure] = {}

    def create_structure(
        self,
        subgenre: ThrillerSubgenre = ThrillerSubgenre.PSYCHOLOGICAL,
        protagonist_name: str = "",
        ticking_clock: str = "",
    ) -> ThrillerStructure:
        """Create a new thriller structure."""
        structure = ThrillerStructure(
            subgenre=subgenre,
            protagonist_name=protagonist_name,
            ticking_clock=ticking_clock,
        )
        self._structures[structure.id] = structure
        return structure

    def get_structure(self, structure_id: UUID) -> Optional[ThrillerStructure]:
        """Get a thriller structure."""
        return self._structures.get(structure_id)

    def set_antagonist(
        self,
        structure_id: UUID,
        name: str,
        motivation: str,
        **kwargs,
    ) -> Optional[Antagonist]:
        """Set the antagonist."""
        structure = self._structures.get(structure_id)
        if not structure:
            return None

        antagonist = Antagonist(name=name, motivation=motivation, **kwargs)
        structure.antagonist = antagonist
        return antagonist

    def add_twist(
        self,
        structure_id: UUID,
        name: str,
        twist_type: TwistType,
        chapter_revealed: int,
        **kwargs,
    ) -> Optional[PlotTwist]:
        """Add a plot twist."""
        structure = self._structures.get(structure_id)
        if not structure:
            return None

        twist = self.twist_planner.add_twist(name, twist_type, chapter_revealed, **kwargs)
        structure.twists.append(twist)
        return twist

    def add_stakes(
        self,
        structure_id: UUID,
        stake_type: StakeType,
        description: str,
        **kwargs,
    ) -> Optional[Stakes]:
        """Add stakes."""
        structure = self._structures.get(structure_id)
        if not structure:
            return None

        stakes = self.escalator.add_stakes(stake_type, description, **kwargs)
        structure.stakes.append(stakes)
        return stakes

    def get_tension_for_chapter(self, chapter: int, total_chapters: int) -> TensionLevel:
        """Get target tension for a chapter."""
        return self.pacer.get_tension_for_chapter(chapter, total_chapters)

    def get_escalation_for_chapter(self, chapter: int, total_chapters: int) -> int:
        """Get target escalation level for a chapter."""
        position = chapter / total_chapters
        return self.escalator.get_target_escalation(position)

    def generate_chapter_prompt(
        self,
        structure_id: UUID,
        chapter_number: int,
        total_chapters: int,
    ) -> str:
        """Generate a thriller-specific prompt for a chapter."""
        structure = self._structures.get(structure_id)
        if not structure:
            return ""

        prompts = []

        # Subgenre guidance
        subgenre_guidance = self._get_subgenre_guidance(structure.subgenre)
        if subgenre_guidance:
            prompts.append(f"**Subgenre ({structure.subgenre.value})**: {subgenre_guidance}")

        # Pacing
        pacing_prompt = self.pacer.generate_pacing_prompt(chapter_number, total_chapters)
        prompts.append(pacing_prompt)

        # Stakes
        if structure.stakes:
            current_stakes = structure.stakes[-1]
            stakes_prompt = self.escalator.generate_stakes_prompt(
                chapter_number, total_chapters, current_stakes
            )
            prompts.append(stakes_prompt)

        # Twists
        for twist in structure.twists:
            if twist.chapter_revealed == chapter_number:
                prompts.append(self.twist_planner.generate_twist_prompt(twist, True))
            elif twist.chapter_revealed > chapter_number:
                setup_chapters = self.twist_planner.plan_setup_chapters(twist, total_chapters)
                if chapter_number in setup_chapters:
                    prompts.append(self.twist_planner.generate_twist_prompt(twist, False))

        # Ticking clock
        if structure.ticking_clock:
            position = chapter_number / total_chapters
            if position > 0.5:
                prompts.append(
                    f"**Ticking Clock**: {structure.ticking_clock} - remind reader of the deadline"
                )

        # Antagonist pressure
        if structure.antagonist and chapter_number > 2:
            prompts.append(
                f"**Antagonist Pressure**: {structure.antagonist.name} should be felt. "
                f"Threat level: {structure.antagonist.threat_level}/10"
            )

        return "\n\n".join(prompts)

    def _get_subgenre_guidance(self, subgenre: ThrillerSubgenre) -> str:
        """Get writing guidance for a thriller subgenre."""
        guidance = {
            ThrillerSubgenre.PSYCHOLOGICAL: (
                "Focus on mental games and manipulation. The threat may be internal as much as external. "
                "Unreliable perceptions. Paranoia and doubt. Who can be trusted?"
            ),
            ThrillerSubgenre.POLITICAL: (
                "Conspiracy and power plays. Government secrets and cover-ups. "
                "The protagonist is usually an outsider uncovering truth."
            ),
            ThrillerSubgenre.LEGAL: (
                "Courtroom tension. Evidence and witness manipulation. "
                "Justice system as both tool and obstacle. Procedural accuracy helps."
            ),
            ThrillerSubgenre.SPY: (
                "Espionage tradecraft. Double agents and dead drops. "
                "Trust no one. International settings. High-tech gadgets optional."
            ),
            ThrillerSubgenre.ACTION: (
                "Physical confrontations. Chase sequences. "
                "The body is at risk as much as the mind. Visceral, kinetic prose."
            ),
            ThrillerSubgenre.DOMESTIC: (
                "The threat comes from within the home. Familiar settings made sinister. "
                "Isolation. The person who should protect you is the danger."
            ),
            ThrillerSubgenre.TECHNO: (
                "Technology as threat and tool. Cyber attacks, surveillance. "
                "Modern anxieties about connectivity and privacy."
            ),
        }
        return guidance.get(subgenre, "")

    def plan_tension_curve(self, total_chapters: int) -> dict[int, TensionLevel]:
        """Plan tension levels for all chapters."""
        return {
            ch: level.level for ch, level in self.pacer.plan_tension_beats(total_chapters).items()
        }

    def get_twist_foreshadowing(self, twist: PlotTwist) -> list[str]:
        """Get foreshadowing suggestions for a twist."""
        return self.twist_planner.generate_foreshadowing(twist)

    def validate_structure(self, structure_id: UUID) -> list[str]:
        """Validate thriller structure."""
        structure = self._structures.get(structure_id)
        if not structure:
            return ["Structure not found"]

        issues = []

        if not structure.antagonist:
            issues.append("No antagonist defined")
        elif not structure.antagonist.motivation:
            issues.append("Antagonist needs a clear motivation")

        if not structure.stakes:
            issues.append("No stakes defined")

        if not structure.twists:
            issues.append("Consider adding at least one plot twist")

        if not structure.ticking_clock:
            issues.append("Consider adding time pressure (ticking clock)")

        return issues
