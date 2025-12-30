"""Romance-specific features for sopher.ai.

This module provides specialized tools for romance novel generation including:
- Relationship development tracking
- Heat level control
- Trope selection and implementation
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class HeatLevel(Enum):
    """Heat levels for romance content."""

    SWEET = "sweet"  # Closed door, no explicit content
    WARM = "warm"  # Kissing, mild sensuality
    SENSUAL = "sensual"  # Fade to black, some description
    STEAMY = "steamy"  # Explicit but tasteful
    EROTIC = "erotic"  # Very explicit


class RelationshipStage(Enum):
    """Stages of romantic relationship development."""

    STRANGERS = "strangers"
    FIRST_MEETING = "first_meeting"
    ATTRACTION = "attraction"
    TENSION = "tension"
    FIRST_KISS = "first_kiss"
    DATING = "dating"
    INTIMACY = "intimacy"
    CONFLICT = "conflict"
    BLACK_MOMENT = "black_moment"
    RECONCILIATION = "reconciliation"
    COMMITMENT = "commitment"
    HEA = "hea"  # Happily Ever After
    HFN = "hfn"  # Happy For Now


class RomanceTrope(Enum):
    """Common romance tropes."""

    ENEMIES_TO_LOVERS = "enemies_to_lovers"
    FRIENDS_TO_LOVERS = "friends_to_lovers"
    SECOND_CHANCE = "second_chance"
    FAKE_RELATIONSHIP = "fake_relationship"
    FORCED_PROXIMITY = "forced_proximity"
    FORBIDDEN_LOVE = "forbidden_love"
    SECRET_IDENTITY = "secret_identity"
    MARRIAGE_OF_CONVENIENCE = "marriage_of_convenience"
    BILLIONAIRE = "billionaire"
    BOSS_EMPLOYEE = "boss_employee"
    GRUMPY_SUNSHINE = "grumpy_sunshine"
    SLOW_BURN = "slow_burn"
    INSTALOVE = "instalove"
    ONE_BED = "one_bed"
    SNOWED_IN = "snowed_in"
    SMALL_TOWN = "small_town"
    SINGLE_PARENT = "single_parent"
    PROTECTOR = "protector"
    BODYGUARD = "bodyguard"
    ROYAL = "royal"
    SPORTS_ROMANCE = "sports_romance"
    ROCKSTAR = "rockstar"
    MILITARY = "military"
    ARRANGED_MARRIAGE = "arranged_marriage"
    OPPOSITES_ATTRACT = "opposites_attract"
    HURT_COMFORT = "hurt_comfort"
    REDEMPTION = "redemption"
    AGE_GAP = "age_gap"
    OFFICE_ROMANCE = "office_romance"
    BEST_FRIENDS_SIBLING = "best_friends_sibling"


class EmotionalBeat(Enum):
    """Emotional beats in romance."""

    MEET_CUTE = "meet_cute"
    FIRST_SPARK = "first_spark"
    PUSH_PULL = "push_pull"
    VULNERABILITY = "vulnerability"
    TRUST_BUILDING = "trust_building"
    EMOTIONAL_INTIMACY = "emotional_intimacy"
    PHYSICAL_INTIMACY = "physical_intimacy"
    DECLARATION = "declaration"
    SACRIFICE = "sacrifice"
    GRAND_GESTURE = "grand_gesture"
    RESOLUTION = "resolution"


@dataclass
class CharacterChemistry:
    """Chemistry dynamics between romantic leads."""

    character_a: str = ""
    character_b: str = ""
    attraction_type: str = "physical_and_emotional"
    power_dynamic: str = "balanced"  # balanced, a_dominant, b_dominant, shifts
    communication_style: str = "banter"  # banter, tender, antagonistic, shy
    shared_interests: list[str] = field(default_factory=list)
    points_of_conflict: list[str] = field(default_factory=list)
    chemistry_notes: str = ""


@dataclass
class RelationshipState:
    """Current state of the romantic relationship."""

    stage: RelationshipStage = RelationshipStage.STRANGERS
    chapter_number: int = 0
    trust_level: float = 0.0  # 0.0 to 1.0
    attraction_level: float = 0.0  # 0.0 to 1.0
    conflict_level: float = 0.0  # 0.0 to 1.0
    emotional_intimacy: float = 0.0  # 0.0 to 1.0
    physical_intimacy: float = 0.0  # 0.0 to 1.0
    notes: str = ""


@dataclass
class RelationshipArc:
    """The overall arc of the romantic relationship."""

    id: UUID = field(default_factory=uuid4)
    character_a: str = ""
    character_b: str = ""
    tropes: list[RomanceTrope] = field(default_factory=list)
    heat_level: HeatLevel = HeatLevel.SENSUAL
    ending_type: str = "hea"  # hea or hfn
    chemistry: CharacterChemistry = field(default_factory=CharacterChemistry)
    states: list[RelationshipState] = field(default_factory=list)
    planned_beats: list[EmotionalBeat] = field(default_factory=list)


@dataclass
class TropeGuidance:
    """Guidance for implementing a specific trope."""

    trope: RomanceTrope
    description: str
    key_elements: list[str]
    common_beats: list[EmotionalBeat]
    conflict_sources: list[str]
    resolution_approaches: list[str]
    pitfalls_to_avoid: list[str]


# Trope guidance library
TROPE_GUIDANCE: dict[RomanceTrope, TropeGuidance] = {
    RomanceTrope.ENEMIES_TO_LOVERS: TropeGuidance(
        trope=RomanceTrope.ENEMIES_TO_LOVERS,
        description="Characters start as adversaries and slowly develop romantic feelings",
        key_elements=[
            "Genuine conflict or rivalry at the start",
            "Moments of vulnerability that show another side",
            "Gradual respect before attraction",
            "A turning point that shifts perspective",
            "The realization that hatred masked attraction",
        ],
        common_beats=[
            EmotionalBeat.PUSH_PULL,
            EmotionalBeat.VULNERABILITY,
            EmotionalBeat.TRUST_BUILDING,
            EmotionalBeat.DECLARATION,
        ],
        conflict_sources=[
            "Past grievances",
            "Competing goals",
            "Misunderstandings",
            "Family or loyalty conflicts",
            "Pride and stubbornness",
        ],
        resolution_approaches=[
            "Forced cooperation reveals compatibility",
            "Sacrifice shows true feelings",
            "Apology and forgiveness",
            "External threat unites them",
        ],
        pitfalls_to_avoid=[
            "Making the hatred too mean-spirited",
            "Instant forgiveness without growth",
            "One-sided redemption",
            "Abusive behavior played as romantic",
        ],
    ),
    RomanceTrope.FRIENDS_TO_LOVERS: TropeGuidance(
        trope=RomanceTrope.FRIENDS_TO_LOVERS,
        description="Long-time friends realize their feelings are romantic",
        key_elements=[
            "Established deep friendship",
            "A moment that changes everything",
            "Fear of ruining the friendship",
            "Jealousy that reveals true feelings",
            "The 'I've always loved you' realization",
        ],
        common_beats=[
            EmotionalBeat.FIRST_SPARK,
            EmotionalBeat.PUSH_PULL,
            EmotionalBeat.VULNERABILITY,
            EmotionalBeat.DECLARATION,
        ],
        conflict_sources=[
            "Fear of losing the friendship",
            "One realizing feelings before the other",
            "External pressure or expectations",
            "Past relationships interfering",
        ],
        resolution_approaches=[
            "Near-loss makes them realize what matters",
            "Honest conversation about feelings",
            "A test of the friendship proves love",
            "Time apart makes the heart grow fonder",
        ],
        pitfalls_to_avoid=[
            "Making the friendship seem shallow",
            "Rushing the transition",
            "Not acknowledging the risk they're taking",
        ],
    ),
    RomanceTrope.SECOND_CHANCE: TropeGuidance(
        trope=RomanceTrope.SECOND_CHANCE,
        description="Former lovers reunite and rekindle their romance",
        key_elements=[
            "A believable reason they separated",
            "Both have grown as individuals",
            "Unresolved feelings still present",
            "Addressing what went wrong before",
            "Demonstrating real change",
        ],
        common_beats=[
            EmotionalBeat.FIRST_SPARK,
            EmotionalBeat.PUSH_PULL,
            EmotionalBeat.TRUST_BUILDING,
            EmotionalBeat.RESOLUTION,
        ],
        conflict_sources=[
            "Old wounds and trust issues",
            "What broke them up originally",
            "New complications in their lives",
            "Resistance to getting hurt again",
        ],
        resolution_approaches=[
            "Confronting the past honestly",
            "Proving change through actions",
            "Creating new memories together",
            "Forgiveness and moving forward",
        ],
        pitfalls_to_avoid=[
            "Ignoring the original problems",
            "Repeating the same mistakes",
            "Making one person do all the work",
        ],
    ),
    RomanceTrope.FAKE_RELATIONSHIP: TropeGuidance(
        trope=RomanceTrope.FAKE_RELATIONSHIP,
        description="Characters pretend to be in a relationship, then develop real feelings",
        key_elements=[
            "A convincing reason to fake it",
            "Rules and boundaries that get blurred",
            "Moments of genuine connection",
            "The 'when did this become real?' realization",
            "Risk of exposure adding tension",
        ],
        common_beats=[
            EmotionalBeat.FIRST_SPARK,
            EmotionalBeat.PUSH_PULL,
            EmotionalBeat.EMOTIONAL_INTIMACY,
            EmotionalBeat.DECLARATION,
        ],
        conflict_sources=[
            "Fear of rejection if they confess",
            "The fake relationship ending",
            "Others discovering the truth",
            "Mixing up real and fake feelings",
        ],
        resolution_approaches=[
            "The facade becomes reality",
            "Honest confession despite the risk",
            "External exposure forces honesty",
            "Realizing they don't want it to end",
        ],
        pitfalls_to_avoid=[
            "Unbelievable reason for the fake relationship",
            "Unclear when feelings become real",
            "Consequences of the lie not addressed",
        ],
    ),
    RomanceTrope.FORCED_PROXIMITY: TropeGuidance(
        trope=RomanceTrope.FORCED_PROXIMITY,
        description="Characters are stuck together and develop feelings",
        key_elements=[
            "A believable reason they can't escape",
            "Initial friction or awkwardness",
            "Gradual discovery of compatibility",
            "Intimate moments in close quarters",
            "The 'real world' test after isolation",
        ],
        common_beats=[
            EmotionalBeat.PUSH_PULL,
            EmotionalBeat.VULNERABILITY,
            EmotionalBeat.EMOTIONAL_INTIMACY,
            EmotionalBeat.PHYSICAL_INTIMACY,
        ],
        conflict_sources=[
            "Clashing personalities in close quarters",
            "Secrets that come out in isolation",
            "External pressures from before",
            "Question of whether feelings are real or situational",
        ],
        resolution_approaches=[
            "Choosing each other after escape",
            "Crisis that proves their bond",
            "Voluntarily staying together",
        ],
        pitfalls_to_avoid=[
            "Stockholm syndrome dynamics",
            "Unrealistic isolation scenario",
            "Feelings that seem purely situational",
        ],
    ),
    RomanceTrope.GRUMPY_SUNSHINE: TropeGuidance(
        trope=RomanceTrope.GRUMPY_SUNSHINE,
        description="An optimistic character melts the heart of a grumpy one",
        key_elements=[
            "Grumpy character with reasons for cynicism",
            "Sunshine character with genuine warmth",
            "The sunshine seeing past the grumpiness",
            "The grump being soft only for them",
            "Gradual thawing of the cold exterior",
        ],
        common_beats=[
            EmotionalBeat.MEET_CUTE,
            EmotionalBeat.PUSH_PULL,
            EmotionalBeat.VULNERABILITY,
            EmotionalBeat.DECLARATION,
        ],
        conflict_sources=[
            "Grump pushing sunshine away for their 'protection'",
            "Misunderstanding the grump's behavior",
            "External threats to the relationship",
            "Sunshine's limits being tested",
        ],
        resolution_approaches=[
            "The grump opening up about their past",
            "Sunshine standing their ground",
            "The grump making a grand gesture",
            "Finding balance between their personalities",
        ],
        pitfalls_to_avoid=[
            "Making the grump actually mean",
            "Sunshine having no depth",
            "One-sided emotional labor",
        ],
    ),
    RomanceTrope.SLOW_BURN: TropeGuidance(
        trope=RomanceTrope.SLOW_BURN,
        description="Romance develops gradually over extended time",
        key_elements=[
            "Tension that builds chapter by chapter",
            "Near-misses and interrupted moments",
            "Deepening emotional connection",
            "The payoff feels earned",
            "Reader investment in the eventual union",
        ],
        common_beats=[
            EmotionalBeat.FIRST_SPARK,
            EmotionalBeat.PUSH_PULL,
            EmotionalBeat.TRUST_BUILDING,
            EmotionalBeat.EMOTIONAL_INTIMACY,
            EmotionalBeat.DECLARATION,
        ],
        conflict_sources=[
            "External circumstances keeping them apart",
            "Internal barriers and fears",
            "Timing issues",
            "Miscommunication",
        ],
        resolution_approaches=[
            "A moment when they can't wait any longer",
            "All barriers finally removed",
            "A declaration that's been building",
            "Choosing each other definitively",
        ],
        pitfalls_to_avoid=[
            "Dragging it out too long",
            "Artificial obstacles",
            "Unsatisfying payoff",
            "Forgetting to maintain tension",
        ],
    ),
    RomanceTrope.ONE_BED: TropeGuidance(
        trope=RomanceTrope.ONE_BED,
        description="Characters must share a bed, leading to tension and intimacy",
        key_elements=[
            "A believable reason for sharing",
            "Initial awkwardness and negotiation",
            "Physical awareness and tension",
            "Barriers breaking down in the dark",
            "Morning after dynamics",
        ],
        common_beats=[
            EmotionalBeat.PUSH_PULL,
            EmotionalBeat.VULNERABILITY,
            EmotionalBeat.PHYSICAL_INTIMACY,
        ],
        conflict_sources=[
            "Pretending to be unaffected",
            "Existing tension complicated by proximity",
            "What happens in the bed vs. the morning",
        ],
        resolution_approaches=[
            "Midnight confessions",
            "Giving in to the tension",
            "The bed becoming symbolic of their relationship",
        ],
        pitfalls_to_avoid=[
            "Making it feel contrived",
            "Not exploring the emotional impact",
            "Skipping over the actual bed-sharing",
        ],
    ),
}


class RelationshipTracker:
    """Tracks romantic relationship development across chapters."""

    def __init__(self):
        self._arcs: dict[UUID, RelationshipArc] = {}

    def create_arc(
        self,
        character_a: str,
        character_b: str,
        tropes: Optional[list[RomanceTrope]] = None,
        heat_level: HeatLevel = HeatLevel.SENSUAL,
        ending_type: str = "hea",
    ) -> RelationshipArc:
        """Create a new relationship arc."""
        arc = RelationshipArc(
            character_a=character_a,
            character_b=character_b,
            tropes=tropes or [],
            heat_level=heat_level,
            ending_type=ending_type,
            chemistry=CharacterChemistry(
                character_a=character_a,
                character_b=character_b,
            ),
        )
        self._arcs[arc.id] = arc
        return arc

    def get_arc(self, arc_id: UUID) -> Optional[RelationshipArc]:
        """Get a relationship arc by ID."""
        return self._arcs.get(arc_id)

    def list_arcs(self) -> list[RelationshipArc]:
        """List all relationship arcs."""
        return list(self._arcs.values())

    def update_state(
        self,
        arc_id: UUID,
        chapter_number: int,
        stage: Optional[RelationshipStage] = None,
        trust_level: Optional[float] = None,
        attraction_level: Optional[float] = None,
        conflict_level: Optional[float] = None,
        emotional_intimacy: Optional[float] = None,
        physical_intimacy: Optional[float] = None,
        notes: str = "",
    ) -> Optional[RelationshipState]:
        """Update the relationship state for a chapter."""
        arc = self._arcs.get(arc_id)
        if not arc:
            return None

        # Get previous state or create new
        prev_state = arc.states[-1] if arc.states else RelationshipState()

        new_state = RelationshipState(
            stage=stage if stage is not None else prev_state.stage,
            chapter_number=chapter_number,
            trust_level=trust_level if trust_level is not None else prev_state.trust_level,
            attraction_level=(
                attraction_level if attraction_level is not None else prev_state.attraction_level
            ),
            conflict_level=(
                conflict_level if conflict_level is not None else prev_state.conflict_level
            ),
            emotional_intimacy=(
                emotional_intimacy
                if emotional_intimacy is not None
                else prev_state.emotional_intimacy
            ),
            physical_intimacy=(
                physical_intimacy if physical_intimacy is not None else prev_state.physical_intimacy
            ),
            notes=notes,
        )

        arc.states.append(new_state)
        return new_state

    def get_current_state(self, arc_id: UUID) -> Optional[RelationshipState]:
        """Get the current relationship state."""
        arc = self._arcs.get(arc_id)
        if not arc or not arc.states:
            return None
        return arc.states[-1]

    def get_state_at_chapter(self, arc_id: UUID, chapter: int) -> Optional[RelationshipState]:
        """Get the relationship state at a specific chapter."""
        arc = self._arcs.get(arc_id)
        if not arc:
            return None

        for state in reversed(arc.states):
            if state.chapter_number <= chapter:
                return state
        return None


class HeatLevelController:
    """Controls heat level in romance scenes."""

    HEAT_LEVEL_GUIDANCE = {
        HeatLevel.SWEET: {
            "description": "Closed-door romance with no explicit content",
            "allowed": [
                "Hand-holding",
                "Longing looks",
                "Innocent kisses",
                "Hugs and embraces",
                "Emotional declarations",
            ],
            "avoid": [
                "Explicit physical descriptions",
                "Intimate scenes beyond kisses",
                "Sexual tension beyond mild",
            ],
            "prompt": (
                "Keep the romance sweet and clean. Focus on emotional connection. "
                "Kisses are brief and tender. Any intimacy happens off-page. "
                "The relationship develops through emotional moments and gestures."
            ),
        },
        HeatLevel.WARM: {
            "description": "Kisses and mild sensuality",
            "allowed": [
                "Passionate kisses",
                "Light sensual tension",
                "Awareness of physical attraction",
                "Mild physical affection",
            ],
            "avoid": [
                "Explicit intimate scenes",
                "Detailed physical descriptions",
            ],
            "prompt": (
                "Romance includes passionate kisses and physical awareness. "
                "Characters notice each other's physical presence. "
                "Any intimate scenes fade to black before becoming explicit."
            ),
        },
        HeatLevel.SENSUAL: {
            "description": "Fade to black with some sensual description",
            "allowed": [
                "Sensual tension and buildup",
                "Suggestive scenes",
                "Fade to black intimate moments",
                "Morning-after scenes",
            ],
            "avoid": [
                "Explicit play-by-play of intimate scenes",
                "Graphic physical descriptions",
            ],
            "prompt": (
                "Include sensual tension and buildup. Intimate scenes can begin "
                "on page but should fade to black before becoming explicit. "
                "Focus on emotions and connection rather than physical mechanics."
            ),
        },
        HeatLevel.STEAMY: {
            "description": "Explicit but tasteful intimate scenes",
            "allowed": [
                "On-page intimate scenes",
                "Sensual descriptions",
                "Physical desire expressed",
                "Multiple intimate encounters",
            ],
            "avoid": [
                "Overly clinical language",
                "Gratuitous content without emotional context",
            ],
            "prompt": (
                "Intimate scenes are on-page and can be explicit. "
                "Use evocative, sensual language. Focus on both physical "
                "and emotional connection. Scenes should advance the relationship."
            ),
        },
        HeatLevel.EROTIC: {
            "description": "Very explicit intimate content",
            "allowed": [
                "Detailed intimate scenes",
                "Explicit physical descriptions",
                "Sexual content as major element",
                "Varied intimate encounters",
            ],
            "avoid": [
                "Anything without consent",
                "Content that overshadows the romance",
            ],
            "prompt": (
                "Write explicit, detailed intimate scenes. Physical desire is "
                "a major element of the story. Use explicit language. "
                "Maintain emotional connection even in explicit scenes."
            ),
        },
    }

    def get_guidance(self, heat_level: HeatLevel) -> dict:
        """Get guidance for a specific heat level."""
        return self.HEAT_LEVEL_GUIDANCE.get(heat_level, {})

    def get_prompt(self, heat_level: HeatLevel) -> str:
        """Get the writing prompt for a heat level."""
        guidance = self.HEAT_LEVEL_GUIDANCE.get(heat_level, {})
        return guidance.get("prompt", "")

    def is_allowed(self, heat_level: HeatLevel, content_type: str) -> bool:
        """Check if a content type is allowed at the heat level."""
        guidance = self.HEAT_LEVEL_GUIDANCE.get(heat_level, {})
        allowed = guidance.get("allowed", [])
        avoid = guidance.get("avoid", [])

        content_lower = content_type.lower()

        # Check if explicitly not allowed
        for item in avoid:
            if item.lower() in content_lower or content_lower in item.lower():
                return False

        # Check if explicitly allowed
        for item in allowed:
            if item.lower() in content_lower or content_lower in item.lower():
                return True

        return True  # Default to allowed if not specified


class TropeManager:
    """Manages romance tropes and their implementation."""

    def get_guidance(self, trope: RomanceTrope) -> Optional[TropeGuidance]:
        """Get guidance for implementing a trope."""
        return TROPE_GUIDANCE.get(trope)

    def get_all_tropes(self) -> list[RomanceTrope]:
        """Get all available tropes."""
        return list(RomanceTrope)

    def get_tropes_by_category(self, category: str) -> list[RomanceTrope]:
        """Get tropes by category."""
        categories = {
            "setup": [
                RomanceTrope.ENEMIES_TO_LOVERS,
                RomanceTrope.FRIENDS_TO_LOVERS,
                RomanceTrope.SECOND_CHANCE,
                RomanceTrope.ARRANGED_MARRIAGE,
            ],
            "situation": [
                RomanceTrope.FAKE_RELATIONSHIP,
                RomanceTrope.FORCED_PROXIMITY,
                RomanceTrope.ONE_BED,
                RomanceTrope.SNOWED_IN,
                RomanceTrope.MARRIAGE_OF_CONVENIENCE,
            ],
            "dynamic": [
                RomanceTrope.GRUMPY_SUNSHINE,
                RomanceTrope.OPPOSITES_ATTRACT,
                RomanceTrope.SLOW_BURN,
                RomanceTrope.INSTALOVE,
            ],
            "setting": [
                RomanceTrope.SMALL_TOWN,
                RomanceTrope.OFFICE_ROMANCE,
                RomanceTrope.ROYAL,
            ],
            "character": [
                RomanceTrope.BILLIONAIRE,
                RomanceTrope.SINGLE_PARENT,
                RomanceTrope.PROTECTOR,
                RomanceTrope.BODYGUARD,
            ],
        }
        return categories.get(category, [])

    def get_compatible_tropes(self, primary_trope: RomanceTrope) -> list[RomanceTrope]:
        """Get tropes that work well with the primary trope."""
        compatibility = {
            RomanceTrope.ENEMIES_TO_LOVERS: [
                RomanceTrope.FORCED_PROXIMITY,
                RomanceTrope.SLOW_BURN,
                RomanceTrope.OFFICE_ROMANCE,
            ],
            RomanceTrope.FRIENDS_TO_LOVERS: [
                RomanceTrope.SLOW_BURN,
                RomanceTrope.SMALL_TOWN,
                RomanceTrope.ONE_BED,
            ],
            RomanceTrope.FAKE_RELATIONSHIP: [
                RomanceTrope.GRUMPY_SUNSHINE,
                RomanceTrope.OPPOSITES_ATTRACT,
                RomanceTrope.BILLIONAIRE,
            ],
            RomanceTrope.FORCED_PROXIMITY: [
                RomanceTrope.ENEMIES_TO_LOVERS,
                RomanceTrope.ONE_BED,
                RomanceTrope.SNOWED_IN,
            ],
            RomanceTrope.SECOND_CHANCE: [
                RomanceTrope.SMALL_TOWN,
                RomanceTrope.SINGLE_PARENT,
                RomanceTrope.SLOW_BURN,
            ],
        }
        return compatibility.get(primary_trope, [])

    def generate_trope_prompt(self, tropes: list[RomanceTrope]) -> str:
        """Generate a writing prompt for implementing tropes."""
        if not tropes:
            return ""

        prompts = []
        for trope in tropes:
            guidance = TROPE_GUIDANCE.get(trope)
            if guidance:
                prompts.append(
                    f"**{trope.value.replace('_', ' ').title()}**: {guidance.description}"
                )
                prompts.append(f"Key elements: {', '.join(guidance.key_elements[:3])}")
                prompts.append(f"Avoid: {', '.join(guidance.pitfalls_to_avoid[:2])}")
                prompts.append("")

        return "\n".join(prompts)


class EmotionalBeatPlanner:
    """Plans emotional beats for romance progression."""

    STAGE_TO_BEATS = {
        RelationshipStage.FIRST_MEETING: [EmotionalBeat.MEET_CUTE, EmotionalBeat.FIRST_SPARK],
        RelationshipStage.ATTRACTION: [EmotionalBeat.FIRST_SPARK, EmotionalBeat.PUSH_PULL],
        RelationshipStage.TENSION: [EmotionalBeat.PUSH_PULL, EmotionalBeat.VULNERABILITY],
        RelationshipStage.FIRST_KISS: [EmotionalBeat.PHYSICAL_INTIMACY],
        RelationshipStage.DATING: [EmotionalBeat.TRUST_BUILDING, EmotionalBeat.EMOTIONAL_INTIMACY],
        RelationshipStage.INTIMACY: [
            EmotionalBeat.EMOTIONAL_INTIMACY,
            EmotionalBeat.PHYSICAL_INTIMACY,
        ],
        RelationshipStage.BLACK_MOMENT: [EmotionalBeat.SACRIFICE],
        RelationshipStage.RECONCILIATION: [EmotionalBeat.GRAND_GESTURE, EmotionalBeat.DECLARATION],
        RelationshipStage.COMMITMENT: [EmotionalBeat.DECLARATION, EmotionalBeat.RESOLUTION],
    }

    def get_beats_for_stage(self, stage: RelationshipStage) -> list[EmotionalBeat]:
        """Get appropriate emotional beats for a relationship stage."""
        return self.STAGE_TO_BEATS.get(stage, [])

    def plan_beats(
        self,
        total_chapters: int,
        heat_level: HeatLevel = HeatLevel.SENSUAL,
    ) -> dict[int, list[EmotionalBeat]]:
        """Plan emotional beats across chapters."""
        beats_by_chapter: dict[int, list[EmotionalBeat]] = {}

        # Distribute stages across chapters
        if total_chapters < 5:
            # Short story - compressed arc
            beats_by_chapter[1] = [EmotionalBeat.MEET_CUTE, EmotionalBeat.FIRST_SPARK]
            beats_by_chapter[2] = [EmotionalBeat.PUSH_PULL, EmotionalBeat.VULNERABILITY]
            beats_by_chapter[total_chapters] = [EmotionalBeat.DECLARATION, EmotionalBeat.RESOLUTION]
        else:
            # Full novel arc
            # First quarter: Setup
            quarter = total_chapters // 4
            beats_by_chapter[1] = [EmotionalBeat.MEET_CUTE]
            beats_by_chapter[2] = [EmotionalBeat.FIRST_SPARK]

            # Second quarter: Development
            beats_by_chapter[quarter + 1] = [EmotionalBeat.PUSH_PULL]
            beats_by_chapter[quarter + 2] = [EmotionalBeat.VULNERABILITY]
            beats_by_chapter[quarter * 2] = [EmotionalBeat.TRUST_BUILDING]

            # Third quarter: Deepening + Crisis
            beats_by_chapter[quarter * 2 + 1] = [EmotionalBeat.EMOTIONAL_INTIMACY]
            if heat_level in [HeatLevel.STEAMY, HeatLevel.EROTIC]:
                beats_by_chapter[quarter * 2 + 2] = [EmotionalBeat.PHYSICAL_INTIMACY]
            beats_by_chapter[quarter * 3] = [EmotionalBeat.SACRIFICE]

            # Final quarter: Resolution
            beats_by_chapter[quarter * 3 + 1] = [EmotionalBeat.GRAND_GESTURE]
            beats_by_chapter[total_chapters - 1] = [EmotionalBeat.DECLARATION]
            beats_by_chapter[total_chapters] = [EmotionalBeat.RESOLUTION]

        return beats_by_chapter

    def get_beat_guidance(self, beat: EmotionalBeat) -> str:
        """Get writing guidance for an emotional beat."""
        guidance = {
            EmotionalBeat.MEET_CUTE: (
                "Create a memorable first meeting. Use humor, coincidence, "
                "or conflict. Establish immediate chemistry or tension."
            ),
            EmotionalBeat.FIRST_SPARK: (
                "Show the first real moment of attraction. A glance, a touch, "
                "a realization. Make the reader feel the spark."
            ),
            EmotionalBeat.PUSH_PULL: (
                "Create tension through attraction mixed with resistance. "
                "Characters drawn together but pushing apart."
            ),
            EmotionalBeat.VULNERABILITY: (
                "Allow a character to show their true self. Break down walls. "
                "Share fears, dreams, or past wounds."
            ),
            EmotionalBeat.TRUST_BUILDING: (
                "Show characters relying on each other. Actions that prove "
                "trustworthiness. Small moments of faith."
            ),
            EmotionalBeat.EMOTIONAL_INTIMACY: (
                "Deepen the emotional connection. Honest conversations. "
                "Understanding without words. True seeing of each other."
            ),
            EmotionalBeat.PHYSICAL_INTIMACY: (
                "Physical expression of connection. Match to heat level. "
                "Focus on emotions as much as physicality."
            ),
            EmotionalBeat.DECLARATION: (
                "The confession of love. Make it earned. Match the characters' "
                "voices. This is what readers have been waiting for."
            ),
            EmotionalBeat.SACRIFICE: (
                "A character gives up something important for the other. "
                "Demonstrates the depth of their feelings through action."
            ),
            EmotionalBeat.GRAND_GESTURE: (
                "A significant action to prove love. Public or private. "
                "Should reflect the relationship's unique journey."
            ),
            EmotionalBeat.RESOLUTION: (
                "Tie up the romantic arc. Confirm the HEA/HFN. "
                "Leave readers satisfied with the couple's future."
            ),
        }
        return guidance.get(beat, "")


class RomanceService:
    """Main service for romance-specific features."""

    def __init__(self):
        self.tracker = RelationshipTracker()
        self.heat_controller = HeatLevelController()
        self.trope_manager = TropeManager()
        self.beat_planner = EmotionalBeatPlanner()

    def create_relationship(
        self,
        character_a: str,
        character_b: str,
        tropes: Optional[list[RomanceTrope]] = None,
        heat_level: HeatLevel = HeatLevel.SENSUAL,
        ending_type: str = "hea",
    ) -> RelationshipArc:
        """Create a new romantic relationship to track."""
        return self.tracker.create_arc(
            character_a=character_a,
            character_b=character_b,
            tropes=tropes,
            heat_level=heat_level,
            ending_type=ending_type,
        )

    def get_relationship(self, arc_id: UUID) -> Optional[RelationshipArc]:
        """Get a relationship arc."""
        return self.tracker.get_arc(arc_id)

    def update_relationship(
        self,
        arc_id: UUID,
        chapter_number: int,
        **kwargs,
    ) -> Optional[RelationshipState]:
        """Update relationship state for a chapter."""
        return self.tracker.update_state(arc_id, chapter_number, **kwargs)

    def generate_chapter_prompt(
        self,
        arc_id: UUID,
        chapter_number: int,
        total_chapters: int,
    ) -> str:
        """Generate a romance-specific prompt for a chapter."""
        arc = self.tracker.get_arc(arc_id)
        if not arc:
            return ""

        prompts = []

        # Heat level guidance
        heat_prompt = self.heat_controller.get_prompt(arc.heat_level)
        if heat_prompt:
            prompts.append(f"**Heat Level ({arc.heat_level.value})**: {heat_prompt}")

        # Trope guidance
        if arc.tropes:
            trope_prompt = self.trope_manager.generate_trope_prompt(arc.tropes)
            if trope_prompt:
                prompts.append(f"**Tropes**:\n{trope_prompt}")

        # Emotional beats
        planned_beats = self.beat_planner.plan_beats(total_chapters, arc.heat_level)
        chapter_beats = planned_beats.get(chapter_number, [])
        if chapter_beats:
            beat_guidance = []
            for beat in chapter_beats:
                guidance = self.beat_planner.get_beat_guidance(beat)
                beat_guidance.append(f"- {beat.value.replace('_', ' ').title()}: {guidance}")
            prompts.append("**Emotional Beats**:\n" + "\n".join(beat_guidance))

        # Current state
        current_state = self.tracker.get_current_state(arc_id)
        if current_state:
            prompts.append(
                f"**Relationship State**: Stage: {current_state.stage.value}, "
                f"Trust: {current_state.trust_level:.1f}, "
                f"Attraction: {current_state.attraction_level:.1f}"
            )

        return "\n\n".join(prompts)

    def get_trope_guidance(self, trope: RomanceTrope) -> Optional[TropeGuidance]:
        """Get implementation guidance for a trope."""
        return self.trope_manager.get_guidance(trope)

    def get_compatible_tropes(self, trope: RomanceTrope) -> list[RomanceTrope]:
        """Get tropes that work well together."""
        return self.trope_manager.get_compatible_tropes(trope)

    def is_content_appropriate(
        self,
        arc_id: UUID,
        content_type: str,
    ) -> bool:
        """Check if content type is appropriate for the relationship's heat level."""
        arc = self.tracker.get_arc(arc_id)
        if not arc:
            return True  # Default to allowed if no arc
        return self.heat_controller.is_allowed(arc.heat_level, content_type)
