"""Mystery-specific features for sopher.ai.

This module provides specialized tools for mystery novel generation including:
- Clue placement system
- Red herring generator
- Fair play mystery validation
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class ClueType(Enum):
    """Types of clues in a mystery."""

    PHYSICAL = "physical"  # Physical evidence
    TESTIMONIAL = "testimonial"  # Witness statements
    DOCUMENTARY = "documentary"  # Documents, records
    BEHAVIORAL = "behavioral"  # Character behavior
    CIRCUMSTANTIAL = "circumstantial"  # Situational evidence
    FORENSIC = "forensic"  # Scientific evidence
    DIGITAL = "digital"  # Electronic evidence


class ClueImportance(Enum):
    """Importance level of a clue."""

    CRITICAL = "critical"  # Essential to solving the case
    MAJOR = "major"  # Significantly advances the investigation
    MINOR = "minor"  # Helpful but not essential
    ATMOSPHERIC = "atmospheric"  # Sets mood, not crucial


class RedHerringType(Enum):
    """Types of red herrings."""

    FALSE_SUSPECT = "false_suspect"  # Innocent person who seems guilty
    MISLEADING_CLUE = "misleading_clue"  # Evidence that points wrong direction
    COINCIDENCE = "coincidence"  # Unrelated suspicious coincidence
    MISDIRECTION = "misdirection"  # Deliberate distraction
    INCOMPLETE_INFO = "incomplete_info"  # Partial truth that misleads


class SuspectRole(Enum):
    """Role of a suspect in the mystery."""

    CULPRIT = "culprit"  # The actual perpetrator
    RED_HERRING = "red_herring"  # Seems guilty but isn't
    ACCOMPLICE = "accomplice"  # Helped the culprit
    WITNESS = "witness"  # Has important information
    VICTIM = "victim"  # The victim (can also be suspect in some plots)
    SLEUTH = "sleuth"  # The detective/investigator


class MysterySubgenre(Enum):
    """Mystery subgenres."""

    COZY = "cozy"  # Soft, amateur detective, community setting
    HARDBOILED = "hardboiled"  # Gritty, PI, urban setting
    POLICE_PROCEDURAL = "police_procedural"  # Police investigation
    AMATEUR_SLEUTH = "amateur_sleuth"  # Non-professional investigator
    LOCKED_ROOM = "locked_room"  # Impossible crime
    WHODUNIT = "whodunit"  # Classic puzzle mystery
    HOWDUNIT = "howdunit"  # Focus on method
    WHYDUNIT = "whydunit"  # Focus on motive
    NOIR = "noir"  # Dark, morally ambiguous


@dataclass
class Clue:
    """A clue in the mystery."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    description: str = ""
    clue_type: ClueType = ClueType.PHYSICAL
    importance: ClueImportance = ClueImportance.MINOR
    chapter_introduced: int = 0
    chapter_significance_revealed: int = 0
    points_to: str = ""  # What/who this clue points to
    found_by: str = ""  # Who discovers the clue
    location: str = ""
    is_revealed: bool = False
    notes: str = ""


@dataclass
class RedHerring:
    """A red herring in the mystery."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    description: str = ""
    herring_type: RedHerringType = RedHerringType.MISLEADING_CLUE
    chapter_introduced: int = 0
    chapter_dismissed: int = 0
    false_implication: str = ""
    actual_explanation: str = ""
    connected_suspect: Optional[str] = None


@dataclass
class Suspect:
    """A suspect in the mystery."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    role: SuspectRole = SuspectRole.RED_HERRING
    motive: str = ""
    means: str = ""
    opportunity: str = ""
    alibi: str = ""
    alibi_strength: float = 0.5  # 0.0 = weak, 1.0 = airtight
    secrets: list[str] = field(default_factory=list)
    connections_to_victim: list[str] = field(default_factory=list)
    first_appearance: int = 0
    suspicion_peak_chapter: int = 0
    cleared_chapter: int = 0


@dataclass
class MysteryStructure:
    """The structure of the mystery plot."""

    id: UUID = field(default_factory=uuid4)
    crime_type: str = "murder"
    victim_name: str = ""
    culprit_name: str = ""
    motive: str = ""
    method: str = ""
    opportunity: str = ""
    subgenre: MysterySubgenre = MysterySubgenre.WHODUNIT
    detective_name: str = ""
    setting: str = ""
    time_period: str = "contemporary"
    clues: list[Clue] = field(default_factory=list)
    red_herrings: list[RedHerring] = field(default_factory=list)
    suspects: list[Suspect] = field(default_factory=list)


@dataclass
class FairPlayCheck:
    """Result of a fair play mystery check."""

    passes: bool = True
    issues: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    clue_coverage: float = 0.0  # Percentage of solution clued
    revelation_timing: str = ""  # Assessment of revelation timing


class CluePlacementManager:
    """Manages clue placement throughout the mystery."""

    def __init__(self):
        self._clues: dict[UUID, Clue] = {}

    def add_clue(
        self,
        name: str,
        description: str,
        clue_type: ClueType = ClueType.PHYSICAL,
        importance: ClueImportance = ClueImportance.MINOR,
        chapter_introduced: int = 0,
        points_to: str = "",
        **kwargs,
    ) -> Clue:
        """Add a new clue to track."""
        clue = Clue(
            name=name,
            description=description,
            clue_type=clue_type,
            importance=importance,
            chapter_introduced=chapter_introduced,
            points_to=points_to,
            **kwargs,
        )
        self._clues[clue.id] = clue
        return clue

    def get_clue(self, clue_id: UUID) -> Optional[Clue]:
        """Get a clue by ID."""
        return self._clues.get(clue_id)

    def list_clues(self) -> list[Clue]:
        """List all clues."""
        return list(self._clues.values())

    def get_clues_by_chapter(self, chapter: int) -> list[Clue]:
        """Get clues introduced in a specific chapter."""
        return [c for c in self._clues.values() if c.chapter_introduced == chapter]

    def get_unrevealed_clues(self) -> list[Clue]:
        """Get clues that haven't had their significance revealed."""
        return [c for c in self._clues.values() if not c.is_revealed]

    def get_critical_clues(self) -> list[Clue]:
        """Get all critical clues."""
        return [c for c in self._clues.values() if c.importance == ClueImportance.CRITICAL]

    def mark_revealed(self, clue_id: UUID, chapter: int) -> bool:
        """Mark a clue as revealed."""
        clue = self._clues.get(clue_id)
        if clue:
            clue.is_revealed = True
            clue.chapter_significance_revealed = chapter
            return True
        return False

    def plan_clue_distribution(
        self,
        total_chapters: int,
        num_critical: int = 3,
        num_major: int = 5,
        num_minor: int = 8,
    ) -> dict[int, list[ClueImportance]]:
        """Plan distribution of clues across chapters."""
        distribution: dict[int, list[ClueImportance]] = {}

        if total_chapters < 5:
            # Short story - compressed distribution
            distribution[1] = [ClueImportance.CRITICAL, ClueImportance.MINOR]
            distribution[2] = [ClueImportance.MAJOR, ClueImportance.MINOR]
            distribution[total_chapters - 1] = [ClueImportance.CRITICAL]
            return distribution

        # Full novel distribution
        # Critical clues: early (setup), middle (turning point), late (final piece)
        early = max(1, total_chapters // 5)
        middle = total_chapters // 2
        late = total_chapters - 2

        distribution[early] = [ClueImportance.CRITICAL]
        distribution[middle] = [ClueImportance.CRITICAL]
        distribution[late] = [ClueImportance.CRITICAL]

        # Distribute major clues across investigation chapters
        investigation_start = total_chapters // 4
        investigation_end = (total_chapters * 3) // 4
        major_spacing = (investigation_end - investigation_start) // max(1, num_major)

        for i in range(num_major):
            chapter = investigation_start + (i * major_spacing)
            if chapter not in distribution:
                distribution[chapter] = []
            distribution[chapter].append(ClueImportance.MAJOR)

        # Distribute minor clues more evenly
        minor_spacing = total_chapters // max(1, num_minor)
        for i in range(num_minor):
            chapter = 1 + (i * minor_spacing)
            if chapter not in distribution:
                distribution[chapter] = []
            distribution[chapter].append(ClueImportance.MINOR)

        return distribution

    def generate_clue_prompt(self, chapter: int, clues: list[Clue]) -> str:
        """Generate a prompt for including specific clues in a chapter."""
        if not clues:
            return ""

        prompts = []
        for clue in clues:
            prompt = f"**{clue.name}** ({clue.importance.value}): {clue.description}"
            if clue.location:
                prompt += f"\n  - Location: {clue.location}"
            if clue.found_by:
                prompt += f"\n  - Discovered by: {clue.found_by}"
            if clue.importance == ClueImportance.CRITICAL:
                prompt += "\n  - IMPORTANT: This clue must be memorable but can be subtly presented"
            prompts.append(prompt)

        return "**Clues to Include**:\n" + "\n\n".join(prompts)


class RedHerringGenerator:
    """Generates and manages red herrings."""

    def __init__(self):
        self._herrings: dict[UUID, RedHerring] = {}

    def add_herring(
        self,
        name: str,
        description: str,
        herring_type: RedHerringType = RedHerringType.MISLEADING_CLUE,
        false_implication: str = "",
        actual_explanation: str = "",
        **kwargs,
    ) -> RedHerring:
        """Add a new red herring."""
        herring = RedHerring(
            name=name,
            description=description,
            herring_type=herring_type,
            false_implication=false_implication,
            actual_explanation=actual_explanation,
            **kwargs,
        )
        self._herrings[herring.id] = herring
        return herring

    def get_herring(self, herring_id: UUID) -> Optional[RedHerring]:
        """Get a red herring by ID."""
        return self._herrings.get(herring_id)

    def list_herrings(self) -> list[RedHerring]:
        """List all red herrings."""
        return list(self._herrings.values())

    def generate_false_suspect(
        self,
        name: str,
        apparent_motive: str,
        actual_innocence: str,
    ) -> RedHerring:
        """Generate a false suspect red herring."""
        return self.add_herring(
            name=f"False Suspect: {name}",
            description=f"{name} appears to have motive and opportunity",
            herring_type=RedHerringType.FALSE_SUSPECT,
            false_implication=apparent_motive,
            actual_explanation=actual_innocence,
            connected_suspect=name,
        )

    def generate_misleading_clue(
        self,
        clue_name: str,
        false_meaning: str,
        true_meaning: str,
    ) -> RedHerring:
        """Generate a misleading clue red herring."""
        return self.add_herring(
            name=f"Misleading: {clue_name}",
            description="Evidence that appears to point one way but means something else",
            herring_type=RedHerringType.MISLEADING_CLUE,
            false_implication=false_meaning,
            actual_explanation=true_meaning,
        )

    def plan_herring_distribution(
        self,
        total_chapters: int,
        num_herrings: int = 4,
    ) -> dict[int, list[RedHerringType]]:
        """Plan distribution of red herrings across chapters."""
        distribution: dict[int, list[RedHerringType]] = {}

        if total_chapters < 5:
            distribution[2] = [RedHerringType.FALSE_SUSPECT]
            return distribution

        # Red herrings should peak in the middle of the investigation
        investigation_start = total_chapters // 4
        investigation_peak = (total_chapters * 2) // 3

        herring_spacing = (investigation_peak - investigation_start) // max(1, num_herrings)

        types = [
            RedHerringType.FALSE_SUSPECT,
            RedHerringType.MISLEADING_CLUE,
            RedHerringType.COINCIDENCE,
            RedHerringType.MISDIRECTION,
        ]

        for i in range(num_herrings):
            chapter = investigation_start + (i * herring_spacing)
            if chapter not in distribution:
                distribution[chapter] = []
            distribution[chapter].append(types[i % len(types)])

        return distribution

    def generate_herring_prompt(self, herring: RedHerring) -> str:
        """Generate a prompt for including a red herring."""
        return (
            f"**Red Herring - {herring.name}**:\n"
            f"Type: {herring.herring_type.value}\n"
            f"False implication: {herring.false_implication}\n"
            f"Present this in a way that seems significant but will later be explained by: "
            f"{herring.actual_explanation}"
        )


class SuspectManager:
    """Manages suspects in the mystery."""

    def __init__(self):
        self._suspects: dict[UUID, Suspect] = {}

    def add_suspect(
        self,
        name: str,
        role: SuspectRole = SuspectRole.RED_HERRING,
        motive: str = "",
        means: str = "",
        opportunity: str = "",
        **kwargs,
    ) -> Suspect:
        """Add a suspect."""
        suspect = Suspect(
            name=name,
            role=role,
            motive=motive,
            means=means,
            opportunity=opportunity,
            **kwargs,
        )
        self._suspects[suspect.id] = suspect
        return suspect

    def get_suspect(self, suspect_id: UUID) -> Optional[Suspect]:
        """Get a suspect by ID."""
        return self._suspects.get(suspect_id)

    def get_suspect_by_name(self, name: str) -> Optional[Suspect]:
        """Get a suspect by name."""
        for suspect in self._suspects.values():
            if suspect.name.lower() == name.lower():
                return suspect
        return None

    def list_suspects(self) -> list[Suspect]:
        """List all suspects."""
        return list(self._suspects.values())

    def get_culprit(self) -> Optional[Suspect]:
        """Get the culprit."""
        for suspect in self._suspects.values():
            if suspect.role == SuspectRole.CULPRIT:
                return suspect
        return None

    def get_red_herrings(self) -> list[Suspect]:
        """Get all red herring suspects."""
        return [s for s in self._suspects.values() if s.role == SuspectRole.RED_HERRING]

    def validate_suspect_pool(self) -> list[str]:
        """Validate the suspect pool for a fair mystery."""
        issues = []

        suspects = list(self._suspects.values())
        if len(suspects) < 3:
            issues.append("Need at least 3 suspects for a fair mystery")

        culprits = [s for s in suspects if s.role == SuspectRole.CULPRIT]
        if len(culprits) == 0:
            issues.append("No culprit designated")
        elif len(culprits) > 1:
            issues.append("Multiple culprits - may need to clarify or make accomplice")

        herrings = [s for s in suspects if s.role == SuspectRole.RED_HERRING]
        if len(herrings) < 2:
            issues.append("Need at least 2 red herring suspects for misdirection")

        # Check that culprit has motive, means, and opportunity
        for culprit in culprits:
            if not culprit.motive:
                issues.append(f"Culprit {culprit.name} needs a motive")
            if not culprit.means:
                issues.append(f"Culprit {culprit.name} needs means")
            if not culprit.opportunity:
                issues.append(f"Culprit {culprit.name} needs opportunity")

        return issues

    def generate_suspect_profile(self, suspect: Suspect) -> str:
        """Generate a profile prompt for a suspect."""
        profile = [
            f"**{suspect.name}** ({suspect.role.value})",
            f"- Motive: {suspect.motive or 'Unknown'}",
            f"- Means: {suspect.means or 'Unknown'}",
            f"- Opportunity: {suspect.opportunity or 'Unknown'}",
            f"- Alibi: {suspect.alibi or 'None provided'} (Strength: {suspect.alibi_strength:.0%})",
        ]

        if suspect.secrets:
            profile.append(f"- Secrets: {', '.join(suspect.secrets)}")

        if suspect.connections_to_victim:
            profile.append(f"- Victim connections: {', '.join(suspect.connections_to_victim)}")

        return "\n".join(profile)


class FairPlayValidator:
    """Validates that a mystery follows fair play rules."""

    FAIR_PLAY_RULES = [
        "All clues available to detective must be available to reader",
        "Supernatural solutions not allowed without prior establishment",
        "No secret passages unless hinted",
        "No unknown poisons or technology",
        "Culprit must appear early in the story",
        "Detective cannot be the culprit",
        "Solutions must be logical, not intuitive",
        "Twins/doubles must be established early",
        "All clues pointing to solution must be shown",
        "The solution must be complete and satisfying",
    ]

    def validate(self, structure: MysteryStructure) -> FairPlayCheck:
        """Validate a mystery structure for fair play."""
        check = FairPlayCheck()

        # Check for culprit
        culprit = None
        for suspect in structure.suspects:
            if suspect.role == SuspectRole.CULPRIT:
                culprit = suspect
                break

        if not culprit:
            check.passes = False
            check.issues.append("No culprit designated in suspect list")
            return check

        # Check culprit appears early
        if culprit.first_appearance > len(structure.clues) // 3 + 1:
            check.warnings.append(
                f"Culprit {culprit.name} appears late (chapter {culprit.first_appearance})"
            )

        # Check detective isn't culprit
        detective = None
        for suspect in structure.suspects:
            if suspect.role == SuspectRole.SLEUTH:
                detective = suspect
                break

        if detective and detective.name == culprit.name:
            check.passes = False
            check.issues.append("Detective cannot be the culprit in fair play mystery")

        # Check critical clues exist
        critical_clues = [c for c in structure.clues if c.importance == ClueImportance.CRITICAL]
        if len(critical_clues) < 2:
            check.warnings.append("Less than 2 critical clues - solution may seem arbitrary")

        # Check clue coverage
        clues_pointing_to_culprit = [
            c for c in structure.clues if culprit.name.lower() in c.points_to.lower()
        ]
        if structure.clues:
            check.clue_coverage = len(clues_pointing_to_culprit) / len(structure.clues)
            if check.clue_coverage < 0.2:
                check.warnings.append("Less than 20% of clues point to the culprit")

        # Check motive, means, opportunity
        if not culprit.motive:
            check.passes = False
            check.issues.append("Culprit has no established motive")

        if not culprit.means:
            check.passes = False
            check.issues.append("Culprit has no established means")

        if not culprit.opportunity:
            check.passes = False
            check.issues.append("Culprit has no established opportunity")

        # Check red herrings are resolvable
        for herring in structure.red_herrings:
            if not herring.actual_explanation:
                check.warnings.append(f"Red herring '{herring.name}' has no explanation")

        # Check revelation timing
        unrevealed_critical = [c for c in critical_clues if not c.is_revealed]
        if unrevealed_critical:
            check.revelation_timing = "Some critical clues not yet revealed"
        else:
            check.revelation_timing = "All critical clues revealed"

        return check


class MysteryService:
    """Main service for mystery-specific features."""

    def __init__(self):
        self.clue_manager = CluePlacementManager()
        self.herring_generator = RedHerringGenerator()
        self.suspect_manager = SuspectManager()
        self.validator = FairPlayValidator()
        self._structures: dict[UUID, MysteryStructure] = {}

    def create_structure(
        self,
        crime_type: str = "murder",
        victim_name: str = "",
        culprit_name: str = "",
        motive: str = "",
        method: str = "",
        subgenre: MysterySubgenre = MysterySubgenre.WHODUNIT,
        **kwargs,
    ) -> MysteryStructure:
        """Create a new mystery structure."""
        structure = MysteryStructure(
            crime_type=crime_type,
            victim_name=victim_name,
            culprit_name=culprit_name,
            motive=motive,
            method=method,
            subgenre=subgenre,
            **kwargs,
        )
        self._structures[structure.id] = structure
        return structure

    def get_structure(self, structure_id: UUID) -> Optional[MysteryStructure]:
        """Get a mystery structure by ID."""
        return self._structures.get(structure_id)

    def add_clue(
        self,
        structure_id: UUID,
        name: str,
        description: str,
        **kwargs,
    ) -> Optional[Clue]:
        """Add a clue to the mystery."""
        structure = self._structures.get(structure_id)
        if not structure:
            return None

        clue = self.clue_manager.add_clue(name, description, **kwargs)
        structure.clues.append(clue)
        return clue

    def add_suspect(
        self,
        structure_id: UUID,
        name: str,
        role: SuspectRole = SuspectRole.RED_HERRING,
        **kwargs,
    ) -> Optional[Suspect]:
        """Add a suspect to the mystery."""
        structure = self._structures.get(structure_id)
        if not structure:
            return None

        suspect = self.suspect_manager.add_suspect(name, role, **kwargs)
        structure.suspects.append(suspect)
        return suspect

    def add_red_herring(
        self,
        structure_id: UUID,
        name: str,
        description: str,
        **kwargs,
    ) -> Optional[RedHerring]:
        """Add a red herring to the mystery."""
        structure = self._structures.get(structure_id)
        if not structure:
            return None

        herring = self.herring_generator.add_herring(name, description, **kwargs)
        structure.red_herrings.append(herring)
        return herring

    def validate_fair_play(self, structure_id: UUID) -> FairPlayCheck:
        """Validate the mystery for fair play rules."""
        structure = self._structures.get(structure_id)
        if not structure:
            return FairPlayCheck(passes=False, issues=["Structure not found"])
        return self.validator.validate(structure)

    def generate_chapter_prompt(
        self,
        structure_id: UUID,
        chapter_number: int,
        total_chapters: int,
    ) -> str:
        """Generate a mystery-specific prompt for a chapter."""
        structure = self._structures.get(structure_id)
        if not structure:
            return ""

        prompts = []

        # Subgenre guidance
        subgenre_guidance = self._get_subgenre_guidance(structure.subgenre)
        if subgenre_guidance:
            prompts.append(f"**Subgenre ({structure.subgenre.value})**: {subgenre_guidance}")

        # Clues for this chapter
        chapter_clues = [c for c in structure.clues if c.chapter_introduced == chapter_number]
        if chapter_clues:
            clue_prompt = self.clue_manager.generate_clue_prompt(chapter_number, chapter_clues)
            prompts.append(clue_prompt)

        # Red herrings for this chapter
        chapter_herrings = [
            h for h in structure.red_herrings if h.chapter_introduced == chapter_number
        ]
        for herring in chapter_herrings:
            prompts.append(self.herring_generator.generate_herring_prompt(herring))

        # Suspect focus
        focus_suspects = [
            s for s in structure.suspects if s.suspicion_peak_chapter == chapter_number
        ]
        for suspect in focus_suspects:
            prompts.append(
                f"**Suspect Focus**: Build suspicion around {suspect.name}\n"
                f"Apparent motive: {suspect.motive}"
            )

        # Story position guidance
        position = chapter_number / total_chapters
        if position < 0.2:
            prompts.append(
                "**Story Phase**: Setup - Establish the crime, introduce suspects, plant early clues"
            )
        elif position < 0.5:
            prompts.append(
                "**Story Phase**: Investigation - Gather evidence, interview suspects, follow leads"
            )
        elif position < 0.75:
            prompts.append(
                "**Story Phase**: Complications - Red herrings peak, dead ends, new revelations"
            )
        elif position < 0.9:
            prompts.append(
                "**Story Phase**: Climax - Final pieces fall into place, confrontation approaches"
            )
        else:
            prompts.append(
                "**Story Phase**: Resolution - Reveal the truth, explain the solution, tie up loose ends"
            )

        return "\n\n".join(prompts)

    def _get_subgenre_guidance(self, subgenre: MysterySubgenre) -> str:
        """Get writing guidance for a mystery subgenre."""
        guidance = {
            MysterySubgenre.COZY: (
                "Keep violence off-page. Focus on puzzle-solving and community. "
                "Amateur detective uses local knowledge and relationships. "
                "Gentle humor welcome. No graphic content."
            ),
            MysterySubgenre.HARDBOILED: (
                "Gritty urban setting. Tough, cynical PI. "
                "Violence and moral ambiguity expected. "
                "First-person narrative. Snappy dialogue."
            ),
            MysterySubgenre.POLICE_PROCEDURAL: (
                "Realistic police work. Procedural details matter. "
                "Team dynamics. Bureaucratic obstacles. "
                "Forensics and technology as key elements."
            ),
            MysterySubgenre.LOCKED_ROOM: (
                "Impossible crime setup. Focus on the puzzle. "
                "Reader should be able to solve it with the clues given. "
                "The 'how' is as important as the 'who'."
            ),
            MysterySubgenre.WHODUNIT: (
                "Classic puzzle mystery. Multiple viable suspects. "
                "Fair play clues throughout. "
                "The detective gathers everyone for the revelation."
            ),
            MysterySubgenre.NOIR: (
                "Dark, morally complex. No clear heroes. "
                "Fatalistic tone. Urban decay. "
                "The detective may be as flawed as the criminals."
            ),
        }
        return guidance.get(subgenre, "")

    def get_suspect_profiles(self, structure_id: UUID) -> str:
        """Get formatted profiles of all suspects."""
        structure = self._structures.get(structure_id)
        if not structure:
            return ""

        profiles = []
        for suspect in structure.suspects:
            profiles.append(self.suspect_manager.generate_suspect_profile(suspect))

        return "\n\n".join(profiles)

    def plan_clue_distribution(
        self,
        structure_id: UUID,
        total_chapters: int,
    ) -> dict[int, list[ClueImportance]]:
        """Plan clue distribution across chapters."""
        return self.clue_manager.plan_clue_distribution(total_chapters)

    def plan_herring_distribution(
        self,
        structure_id: UUID,
        total_chapters: int,
    ) -> dict[int, list[RedHerringType]]:
        """Plan red herring distribution across chapters."""
        return self.herring_generator.plan_herring_distribution(total_chapters)
