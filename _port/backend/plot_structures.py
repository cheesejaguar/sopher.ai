"""Plot structure templates for book outline generation.

This module provides structured templates for common narrative frameworks:
- Three-Act Structure
- Five-Act Structure (Freytag's Pyramid)
- Hero's Journey (12 stages)
- Seven-Point Story Structure
- Save the Cat Beat Sheet
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.schemas import PlotPoint, PlotStructure


@dataclass
class PlotBeat:
    """A single beat/milestone in a plot structure."""

    name: str
    description: str
    percentage_through_story: float  # 0.0 to 1.0
    chapter_range_start: float  # As percentage of total chapters
    chapter_range_end: float
    typical_emotional_arc: str
    tips: List[str] = field(default_factory=list)


@dataclass
class PlotTemplate:
    """A complete plot structure template."""

    name: str
    structure_type: str
    description: str
    beats: List[PlotBeat]
    genre_modifications: Dict[str, List[str]] = field(default_factory=dict)

    def get_chapter_assignments(self, total_chapters: int) -> Dict[str, List[int]]:
        """Assign chapters to each beat based on total chapter count."""
        assignments: Dict[str, List[int]] = {}
        for beat in self.beats:
            start_ch = max(1, int(beat.chapter_range_start * total_chapters) + 1)
            end_ch = min(total_chapters, int(beat.chapter_range_end * total_chapters) + 1)
            assignments[beat.name] = list(range(start_ch, end_ch + 1))
        return assignments

    def to_plot_structure(
        self, total_chapters: int, custom_plot_points: Optional[List[PlotPoint]] = None
    ) -> PlotStructure:
        """Convert template to a PlotStructure schema instance."""
        assignments = self.get_chapter_assignments(total_chapters)

        # Build plot points from beats
        plot_points = []
        for beat in self.beats:
            target_chapter = int(beat.percentage_through_story * total_chapters) + 1
            target_chapter = max(1, min(total_chapters, target_chapter))

            plot_points.append(
                PlotPoint(
                    name=beat.name,
                    description=beat.description,
                    chapter_number=target_chapter,
                    significance=(
                        "major"
                        if beat.percentage_through_story in [0.25, 0.5, 0.75, 1.0]
                        else "turning_point" if "turning" in beat.name.lower() else "minor"
                    ),
                )
            )

        # Add any custom plot points
        if custom_plot_points:
            plot_points.extend(custom_plot_points)

        # Build structure-specific fields
        kwargs: Dict[str, Any] = {
            "structure_type": self.structure_type,
            "description": self.description,
            "plot_points": plot_points,
        }

        # Add act assignments for three-act structure
        if self.structure_type == "three_act":
            kwargs["act_one_chapters"] = assignments.get("Act One (Setup)", [])
            kwargs["act_two_chapters"] = assignments.get(
                "Act Two (Confrontation)", []
            ) + assignments.get("Midpoint", [])
            kwargs["act_three_chapters"] = assignments.get("Act Three (Resolution)", [])

        # Add Hero's Journey specific fields
        if self.structure_type == "heros_journey":
            hero_fields = [
                "ordinary_world",
                "call_to_adventure",
                "refusal_of_call",
                "meeting_mentor",
                "crossing_threshold",
                "tests_allies_enemies",
                "approach_innermost_cave",
                "ordeal",
                "reward",
                "road_back",
                "resurrection",
                "return_with_elixir",
            ]
            for beat in self.beats:
                field_name = beat.name.lower().replace(" ", "_").replace("'", "")
                if field_name in hero_fields:
                    kwargs[field_name] = beat.description

        return PlotStructure(**kwargs)


# =============================================================================
# THREE-ACT STRUCTURE
# =============================================================================

THREE_ACT_STRUCTURE = PlotTemplate(
    name="Three-Act Structure",
    structure_type="three_act",
    description="Classic Hollywood structure dividing the story into Setup, Confrontation, and Resolution.",
    beats=[
        PlotBeat(
            name="Act One (Setup)",
            description="Introduce the protagonist, their world, and the central conflict.",
            percentage_through_story=0.0,
            chapter_range_start=0.0,
            chapter_range_end=0.25,
            typical_emotional_arc="exposition",
            tips=[
                "Establish the protagonist's ordinary world",
                "Show what they want vs. what they need",
                "Plant seeds for later plot developments",
            ],
        ),
        PlotBeat(
            name="Inciting Incident",
            description="The event that disrupts the protagonist's ordinary world and sets the story in motion.",
            percentage_through_story=0.12,
            chapter_range_start=0.10,
            chapter_range_end=0.15,
            typical_emotional_arc="rising_action",
            tips=[
                "Make it clear and impactful",
                "Directly challenge the protagonist",
                "Create urgency",
            ],
        ),
        PlotBeat(
            name="First Plot Point",
            description="The protagonist commits to addressing the central conflict. No turning back.",
            percentage_through_story=0.25,
            chapter_range_start=0.22,
            chapter_range_end=0.28,
            typical_emotional_arc="rising_action",
            tips=[
                "Raise the stakes",
                "Force a decision",
                "Move from reaction to action",
            ],
        ),
        PlotBeat(
            name="Act Two (Confrontation)",
            description="The protagonist faces escalating obstacles while pursuing their goal.",
            percentage_through_story=0.30,
            chapter_range_start=0.25,
            chapter_range_end=0.75,
            typical_emotional_arc="tension_building",
            tips=[
                "Each obstacle should be harder than the last",
                "Deepen character relationships",
                "Reveal backstory through action",
            ],
        ),
        PlotBeat(
            name="Midpoint",
            description="A major revelation or reversal that shifts the story's direction.",
            percentage_through_story=0.50,
            chapter_range_start=0.48,
            chapter_range_end=0.52,
            typical_emotional_arc="climax",
            tips=[
                "Often a false victory or false defeat",
                "Raises stakes significantly",
                "Protagonist gains new information",
            ],
        ),
        PlotBeat(
            name="Second Plot Point",
            description="All seems lost. The protagonist faces their darkest moment.",
            percentage_through_story=0.75,
            chapter_range_start=0.72,
            chapter_range_end=0.78,
            typical_emotional_arc="falling_action",
            tips=[
                "Remove all safety nets",
                "Force protagonist to face their flaws",
                "Set up the final confrontation",
            ],
        ),
        PlotBeat(
            name="Act Three (Resolution)",
            description="The protagonist confronts the antagonist and resolves the central conflict.",
            percentage_through_story=0.80,
            chapter_range_start=0.75,
            chapter_range_end=1.0,
            typical_emotional_arc="resolution",
            tips=[
                "Pay off earlier setups",
                "Show character transformation",
                "Provide emotional satisfaction",
            ],
        ),
        PlotBeat(
            name="Climax",
            description="The final confrontation where the central conflict is decided.",
            percentage_through_story=0.90,
            chapter_range_start=0.88,
            chapter_range_end=0.95,
            typical_emotional_arc="climax",
            tips=[
                "Make it the highest stakes moment",
                "Protagonist must use what they've learned",
                "Resolution must feel earned",
            ],
        ),
        PlotBeat(
            name="Denouement",
            description="The aftermath showing the new normal after the conflict is resolved.",
            percentage_through_story=0.95,
            chapter_range_start=0.95,
            chapter_range_end=1.0,
            typical_emotional_arc="denouement",
            tips=[
                "Show how characters have changed",
                "Tie up loose ends",
                "Leave readers satisfied",
            ],
        ),
    ],
    genre_modifications={
        "romance": [
            "Inciting incident should bring protagonists together",
            "Midpoint often includes first romantic commitment",
            "Dark moment often involves relationship threat",
        ],
        "mystery": [
            "Inciting incident is typically the crime",
            "Midpoint reveals crucial clue",
            "Climax is the reveal/confrontation",
        ],
        "thriller": [
            "Higher stakes from the beginning",
            "Multiple reversals in Act Two",
            "Climax should be visceral and immediate",
        ],
    },
)


# =============================================================================
# FIVE-ACT STRUCTURE (FREYTAG'S PYRAMID)
# =============================================================================

FIVE_ACT_STRUCTURE = PlotTemplate(
    name="Five-Act Structure (Freytag's Pyramid)",
    structure_type="five_act",
    description="Classical dramatic structure with Exposition, Rising Action, Climax, Falling Action, and Catastrophe/Resolution.",
    beats=[
        PlotBeat(
            name="Exposition",
            description="Introduction of characters, setting, and initial situation.",
            percentage_through_story=0.0,
            chapter_range_start=0.0,
            chapter_range_end=0.15,
            typical_emotional_arc="exposition",
            tips=[
                "Establish tone and genre",
                "Introduce key relationships",
                "Plant dramatic irony if applicable",
            ],
        ),
        PlotBeat(
            name="Exciting Force",
            description="The event that sets the main conflict in motion.",
            percentage_through_story=0.15,
            chapter_range_start=0.12,
            chapter_range_end=0.18,
            typical_emotional_arc="rising_action",
            tips=[
                "Clear cause and effect",
                "Protagonist must respond",
                "Sets trajectory for the story",
            ],
        ),
        PlotBeat(
            name="Rising Action",
            description="Complications and obstacles increase tension toward the climax.",
            percentage_through_story=0.20,
            chapter_range_start=0.15,
            chapter_range_end=0.50,
            typical_emotional_arc="tension_building",
            tips=[
                "Each scene should raise stakes",
                "Develop subplots",
                "Build toward inevitable confrontation",
            ],
        ),
        PlotBeat(
            name="Climax",
            description="The turning point - the moment of highest tension where fortune shifts.",
            percentage_through_story=0.50,
            chapter_range_start=0.48,
            chapter_range_end=0.55,
            typical_emotional_arc="climax",
            tips=[
                "Maximum emotional impact",
                "Irreversible change occurs",
                "Point of no return for protagonist",
            ],
        ),
        PlotBeat(
            name="Falling Action",
            description="Events unfold from the climax toward the resolution.",
            percentage_through_story=0.60,
            chapter_range_start=0.55,
            chapter_range_end=0.85,
            typical_emotional_arc="falling_action",
            tips=[
                "Show consequences of climax",
                "Build toward final resolution",
                "Include moments of suspense",
            ],
        ),
        PlotBeat(
            name="Final Suspense",
            description="A moment of uncertainty before the final resolution.",
            percentage_through_story=0.85,
            chapter_range_start=0.82,
            chapter_range_end=0.90,
            typical_emotional_arc="tension_building",
            tips=[
                "Last obstacle or twist",
                "Tests protagonist's transformation",
                "Heightens emotional payoff",
            ],
        ),
        PlotBeat(
            name="Catastrophe/Resolution",
            description="The final outcome - tragic or triumphant - and return to stability.",
            percentage_through_story=0.90,
            chapter_range_start=0.90,
            chapter_range_end=1.0,
            typical_emotional_arc="resolution",
            tips=[
                "Fulfill genre expectations",
                "Complete character arcs",
                "Provide thematic closure",
            ],
        ),
    ],
)


# =============================================================================
# HERO'S JOURNEY (12 STAGES)
# =============================================================================

HEROS_JOURNEY = PlotTemplate(
    name="Hero's Journey",
    structure_type="heros_journey",
    description="Joseph Campbell's monomyth structure following a hero's transformative adventure.",
    beats=[
        PlotBeat(
            name="Ordinary World",
            description="The hero's normal life before the adventure begins.",
            percentage_through_story=0.0,
            chapter_range_start=0.0,
            chapter_range_end=0.08,
            typical_emotional_arc="exposition",
            tips=[
                "Show what the hero has to lose",
                "Establish their flaw or wound",
                "Create sympathy and relatability",
            ],
        ),
        PlotBeat(
            name="Call to Adventure",
            description="The hero receives an invitation or challenge to leave their ordinary world.",
            percentage_through_story=0.08,
            chapter_range_start=0.06,
            chapter_range_end=0.12,
            typical_emotional_arc="rising_action",
            tips=[
                "Make the call personal",
                "Show what's at stake",
                "Create intrigue about the special world",
            ],
        ),
        PlotBeat(
            name="Refusal of Call",
            description="The hero initially resists the adventure due to fear or obligation.",
            percentage_through_story=0.12,
            chapter_range_start=0.10,
            chapter_range_end=0.16,
            typical_emotional_arc="rising_action",
            tips=[
                "Show legitimate concerns",
                "Reveals character",
                "Builds anticipation",
            ],
        ),
        PlotBeat(
            name="Meeting Mentor",
            description="The hero encounters a guide who provides training, advice, or a gift.",
            percentage_through_story=0.16,
            chapter_range_start=0.14,
            chapter_range_end=0.22,
            typical_emotional_arc="rising_action",
            tips=[
                "Mentor should have wisdom to share",
                "May give a protective talisman",
                "Prepares hero for challenges ahead",
            ],
        ),
        PlotBeat(
            name="Crossing Threshold",
            description="The hero commits to the adventure and enters the special world.",
            percentage_through_story=0.22,
            chapter_range_start=0.20,
            chapter_range_end=0.28,
            typical_emotional_arc="rising_action",
            tips=[
                "Clear demarcation from ordinary world",
                "No turning back",
                "Rules are different here",
            ],
        ),
        PlotBeat(
            name="Tests Allies Enemies",
            description="The hero faces challenges and discovers who can be trusted.",
            percentage_through_story=0.35,
            chapter_range_start=0.28,
            chapter_range_end=0.45,
            typical_emotional_arc="tension_building",
            tips=[
                "Introduce key allies",
                "Establish antagonist's power",
                "Hero learns new skills",
            ],
        ),
        PlotBeat(
            name="Approach Innermost Cave",
            description="The hero prepares for the major challenge in the special world.",
            percentage_through_story=0.50,
            chapter_range_start=0.45,
            chapter_range_end=0.55,
            typical_emotional_arc="tension_building",
            tips=[
                "Build tension and dread",
                "Final preparations",
                "Team dynamics solidify",
            ],
        ),
        PlotBeat(
            name="Ordeal",
            description="The hero faces their greatest challenge and experiences death and rebirth.",
            percentage_through_story=0.60,
            chapter_range_start=0.55,
            chapter_range_end=0.65,
            typical_emotional_arc="climax",
            tips=[
                "Near-death experience (literal or metaphorical)",
                "Confronts greatest fear",
                "Transformation occurs",
            ],
        ),
        PlotBeat(
            name="Reward",
            description="The hero gains the treasure, knowledge, or reconciliation they sought.",
            percentage_through_story=0.68,
            chapter_range_start=0.65,
            chapter_range_end=0.72,
            typical_emotional_arc="falling_action",
            tips=[
                "Celebrate the achievement",
                "But danger isn't over",
                "Hero has changed",
            ],
        ),
        PlotBeat(
            name="Road Back",
            description="The hero begins the journey back to the ordinary world.",
            percentage_through_story=0.75,
            chapter_range_start=0.72,
            chapter_range_end=0.82,
            typical_emotional_arc="falling_action",
            tips=[
                "Chase or pursuit common",
                "Consequences catch up",
                "Must choose between worlds",
            ],
        ),
        PlotBeat(
            name="Resurrection",
            description="The final test where the hero must use everything learned.",
            percentage_through_story=0.88,
            chapter_range_start=0.82,
            chapter_range_end=0.92,
            typical_emotional_arc="climax",
            tips=[
                "Climactic confrontation",
                "Hero proves transformation",
                "Old self dies, new self emerges",
            ],
        ),
        PlotBeat(
            name="Return with Elixir",
            description="The hero returns home transformed, bearing gifts for the community.",
            percentage_through_story=0.95,
            chapter_range_start=0.92,
            chapter_range_end=1.0,
            typical_emotional_arc="denouement",
            tips=[
                "Show how hero has changed",
                "Benefit to the community",
                "New equilibrium established",
            ],
        ),
    ],
    genre_modifications={
        "fantasy": [
            "Mentor often has magical abilities",
            "Special world has clear magical rules",
            "Elixir may be literal magical object",
        ],
        "romance": [
            "The 'special world' is often the relationship",
            "Ordeal involves emotional vulnerability",
            "Elixir is love/commitment",
        ],
    },
)


# =============================================================================
# SEVEN-POINT STORY STRUCTURE
# =============================================================================

SEVEN_POINT_STRUCTURE = PlotTemplate(
    name="Seven-Point Story Structure",
    structure_type="seven_point",
    description="Dan Wells' structure focusing on the protagonist's transformation through key plot points.",
    beats=[
        PlotBeat(
            name="Hook",
            description="Establish the protagonist's starting state - the opposite of where they'll end.",
            percentage_through_story=0.0,
            chapter_range_start=0.0,
            chapter_range_end=0.10,
            typical_emotional_arc="exposition",
            tips=[
                "Show the character flaw or weakness",
                "Make readers care",
                "Set up the transformation to come",
            ],
        ),
        PlotBeat(
            name="Plot Turn 1",
            description="The event that introduces the conflict and starts the story moving.",
            percentage_through_story=0.15,
            chapter_range_start=0.12,
            chapter_range_end=0.20,
            typical_emotional_arc="rising_action",
            tips=[
                "Call to adventure",
                "New information changes everything",
                "Character must react",
            ],
        ),
        PlotBeat(
            name="Pinch Point 1",
            description="Apply pressure - show the antagonist's power and raise stakes.",
            percentage_through_story=0.35,
            chapter_range_start=0.30,
            chapter_range_end=0.40,
            typical_emotional_arc="tension_building",
            tips=[
                "Villain demonstrates power",
                "Something bad happens",
                "Forces protagonist to act",
            ],
        ),
        PlotBeat(
            name="Midpoint",
            description="The protagonist shifts from reaction to action.",
            percentage_through_story=0.50,
            chapter_range_start=0.45,
            chapter_range_end=0.55,
            typical_emotional_arc="rising_action",
            tips=[
                "Protagonist takes initiative",
                "Key realization or discovery",
                "Turns the story around",
            ],
        ),
        PlotBeat(
            name="Pinch Point 2",
            description="More pressure - the antagonist strikes back, all seems lost.",
            percentage_through_story=0.70,
            chapter_range_start=0.65,
            chapter_range_end=0.75,
            typical_emotional_arc="falling_action",
            tips=[
                "Antagonist's counter-attack",
                "Protagonist loses something important",
                "Dark night of the soul",
            ],
        ),
        PlotBeat(
            name="Plot Turn 2",
            description="The final piece of the puzzle that enables the climax.",
            percentage_through_story=0.80,
            chapter_range_start=0.75,
            chapter_range_end=0.85,
            typical_emotional_arc="rising_action",
            tips=[
                "Protagonist gains key knowledge or power",
                "Often comes from within",
                "Sets up the resolution",
            ],
        ),
        PlotBeat(
            name="Resolution",
            description="The climax where the protagonist achieves their goal and completes their arc.",
            percentage_through_story=0.90,
            chapter_range_start=0.85,
            chapter_range_end=1.0,
            typical_emotional_arc="resolution",
            tips=[
                "Mirror the hook - show transformation",
                "Protagonist uses everything they've learned",
                "Satisfying emotional payoff",
            ],
        ),
    ],
)


# =============================================================================
# SAVE THE CAT BEAT SHEET
# =============================================================================

SAVE_THE_CAT = PlotTemplate(
    name="Save the Cat Beat Sheet",
    structure_type="save_the_cat",
    description="Blake Snyder's screenwriting structure adapted for novels, with 15 specific beats.",
    beats=[
        PlotBeat(
            name="Opening Image",
            description="A visual that represents the protagonist's starting point.",
            percentage_through_story=0.0,
            chapter_range_start=0.0,
            chapter_range_end=0.02,
            typical_emotional_arc="exposition",
            tips=[
                "Sets tone and mood",
                "Shows 'before' state",
                "Mirror with final image",
            ],
        ),
        PlotBeat(
            name="Theme Stated",
            description="Someone states the theme, often as advice the protagonist doesn't yet understand.",
            percentage_through_story=0.05,
            chapter_range_start=0.03,
            chapter_range_end=0.07,
            typical_emotional_arc="exposition",
            tips=[
                "Can be subtle",
                "Often in dialogue",
                "Protagonist doesn't get it yet",
            ],
        ),
        PlotBeat(
            name="Setup",
            description="Establish the protagonist's world, flaws, and what needs to change.",
            percentage_through_story=0.08,
            chapter_range_start=0.02,
            chapter_range_end=0.10,
            typical_emotional_arc="exposition",
            tips=[
                "'Save the Cat' moment here",
                "Show what's at stake",
                "Plant setups for later payoffs",
            ],
        ),
        PlotBeat(
            name="Catalyst",
            description="The moment that sets the story in motion - life can't continue as before.",
            percentage_through_story=0.10,
            chapter_range_start=0.08,
            chapter_range_end=0.12,
            typical_emotional_arc="rising_action",
            tips=[
                "Clear inciting incident",
                "Happens TO the protagonist",
                "Creates urgency",
            ],
        ),
        PlotBeat(
            name="Debate",
            description="The protagonist debates whether to embark on the journey.",
            percentage_through_story=0.15,
            chapter_range_start=0.12,
            chapter_range_end=0.20,
            typical_emotional_arc="rising_action",
            tips=[
                "Internal and external debate",
                "Shows stakes of inaction",
                "Last chance to stay in status quo",
            ],
        ),
        PlotBeat(
            name="Break into Two",
            description="The protagonist makes a choice and enters a new world.",
            percentage_through_story=0.20,
            chapter_range_start=0.18,
            chapter_range_end=0.23,
            typical_emotional_arc="rising_action",
            tips=[
                "Proactive choice",
                "No turning back",
                "Upside-down version of ordinary world",
            ],
        ),
        PlotBeat(
            name="B Story",
            description="A subplot (often romantic) that carries the theme.",
            percentage_through_story=0.22,
            chapter_range_start=0.20,
            chapter_range_end=0.25,
            typical_emotional_arc="rising_action",
            tips=[
                "New character(s) introduced",
                "Relationship develops theme",
                "Provides breather from A story",
            ],
        ),
        PlotBeat(
            name="Fun and Games",
            description="The promise of the premise - what the audience came to see.",
            percentage_through_story=0.35,
            chapter_range_start=0.25,
            chapter_range_end=0.45,
            typical_emotional_arc="rising_action",
            tips=[
                "Deliver genre expectations",
                "Protagonist explores new world",
                "Often has montage quality",
            ],
        ),
        PlotBeat(
            name="Midpoint",
            description="Either a false victory or false defeat that raises the stakes.",
            percentage_through_story=0.50,
            chapter_range_start=0.45,
            chapter_range_end=0.55,
            typical_emotional_arc="climax",
            tips=[
                "Stakes become life/death (literal or metaphorical)",
                "Time lock often starts",
                "Fun and games are over",
            ],
        ),
        PlotBeat(
            name="Bad Guys Close In",
            description="External pressure mounts while internal doubts grow.",
            percentage_through_story=0.60,
            chapter_range_start=0.55,
            chapter_range_end=0.70,
            typical_emotional_arc="tension_building",
            tips=[
                "Antagonist gains ground",
                "Team may fracture",
                "Protagonist's flaw causes problems",
            ],
        ),
        PlotBeat(
            name="All Is Lost",
            description="The lowest point - often involving a 'death' of some kind.",
            percentage_through_story=0.75,
            chapter_range_start=0.72,
            chapter_range_end=0.78,
            typical_emotional_arc="falling_action",
            tips=[
                "'Whiff of death'",
                "Old self/way must die",
                "Mentor often 'dies' here",
            ],
        ),
        PlotBeat(
            name="Dark Night of the Soul",
            description="The protagonist processes the loss and finds new strength.",
            percentage_through_story=0.80,
            chapter_range_start=0.78,
            chapter_range_end=0.85,
            typical_emotional_arc="falling_action",
            tips=[
                "Emotional processing",
                "Leads to breakthrough",
                "B story often provides key insight",
            ],
        ),
        PlotBeat(
            name="Break into Three",
            description="The protagonist has an epiphany and chooses to act.",
            percentage_through_story=0.85,
            chapter_range_start=0.82,
            chapter_range_end=0.88,
            typical_emotional_arc="rising_action",
            tips=[
                "A and B stories merge",
                "Protagonist has changed",
                "New plan forms",
            ],
        ),
        PlotBeat(
            name="Finale",
            description="The protagonist confronts the antagonist and proves their transformation.",
            percentage_through_story=0.92,
            chapter_range_start=0.88,
            chapter_range_end=0.97,
            typical_emotional_arc="climax",
            tips=[
                "Five-point finale structure",
                "Uses all learned skills",
                "High point of catharsis",
            ],
        ),
        PlotBeat(
            name="Final Image",
            description="A visual that represents the protagonist's ending point - mirror of opening.",
            percentage_through_story=0.98,
            chapter_range_start=0.97,
            chapter_range_end=1.0,
            typical_emotional_arc="denouement",
            tips=[
                "Shows transformation complete",
                "Mirrors opening image",
                "Provides closure",
            ],
        ),
    ],
)


# =============================================================================
# TEMPLATE REGISTRY
# =============================================================================

PLOT_TEMPLATES: Dict[str, PlotTemplate] = {
    "three_act": THREE_ACT_STRUCTURE,
    "five_act": FIVE_ACT_STRUCTURE,
    "heros_journey": HEROS_JOURNEY,
    "seven_point": SEVEN_POINT_STRUCTURE,
    "save_the_cat": SAVE_THE_CAT,
    "freytags_pyramid": FIVE_ACT_STRUCTURE,  # Alias
}


def get_plot_template(structure_type: str) -> Optional[PlotTemplate]:
    """Get a plot template by its structure type."""
    return PLOT_TEMPLATES.get(structure_type)


def get_all_template_names() -> List[str]:
    """Get list of all available template names."""
    return list(PLOT_TEMPLATES.keys())


def get_template_summary(structure_type: str) -> Optional[Dict[str, Any]]:
    """Get a summary of a plot template for display."""
    template = get_plot_template(structure_type)
    if not template:
        return None

    return {
        "name": template.name,
        "structure_type": template.structure_type,
        "description": template.description,
        "beat_count": len(template.beats),
        "beats": [
            {
                "name": beat.name,
                "description": beat.description,
                "percentage": beat.percentage_through_story,
            }
            for beat in template.beats
        ],
    }


def generate_chapter_guidance(
    structure_type: str,
    chapter_number: int,
    total_chapters: int,
) -> Dict[str, Any]:
    """Generate writing guidance for a specific chapter based on plot structure."""
    template = get_plot_template(structure_type)
    if not template:
        return {"error": f"Unknown structure type: {structure_type}"}

    # Calculate percentage through the story
    percentage = (chapter_number - 1) / max(1, total_chapters - 1)

    # Find the current beat
    current_beat: Optional[PlotBeat] = None
    next_beat: Optional[PlotBeat] = None

    for i, beat in enumerate(template.beats):
        if beat.chapter_range_start <= percentage <= beat.chapter_range_end:
            current_beat = beat
            if i + 1 < len(template.beats):
                next_beat = template.beats[i + 1]
            break

    if not current_beat:
        # Find the closest beat
        for beat in template.beats:
            if percentage <= beat.percentage_through_story:
                current_beat = beat
                break
        if not current_beat:
            current_beat = template.beats[-1]

    guidance = {
        "chapter_number": chapter_number,
        "percentage_through_story": percentage,
        "current_beat": {
            "name": current_beat.name,
            "description": current_beat.description,
            "emotional_arc": current_beat.typical_emotional_arc,
            "tips": current_beat.tips,
        },
        "structure_context": template.description,
    }

    if next_beat:
        guidance["next_beat"] = {
            "name": next_beat.name,
            "description": next_beat.description,
            "chapters_until": int(next_beat.chapter_range_start * total_chapters)
            - chapter_number
            + 1,
        }

    return guidance


def suggest_emotional_arc(
    structure_type: str,
    chapter_number: int,
    total_chapters: int,
) -> str:
    """Suggest the emotional arc for a chapter based on plot structure."""
    template = get_plot_template(structure_type)
    if not template:
        return "rising_action"

    percentage = (chapter_number - 1) / max(1, total_chapters - 1)

    for beat in template.beats:
        if beat.chapter_range_start <= percentage <= beat.chapter_range_end:
            return beat.typical_emotional_arc

    return "rising_action"
