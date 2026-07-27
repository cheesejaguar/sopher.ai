"""Genre-specific outline prompts and templates.

This module provides genre-aware customization for outline generation:
- Romance: Meet-cute, conflict, resolution patterns
- Mystery: Clue placement, red herrings, revelation timing
- Fantasy: World-building integration, magic system rules
- Thriller: Pacing, tension escalation, twist placement
- Literary Fiction: Character development focus, thematic depth
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class GenreElement:
    """A required or recommended element for a genre."""

    name: str
    description: str
    when_to_include: str  # e.g., "early", "midpoint", "climax", "throughout"
    importance: str  # "required", "recommended", "optional"
    tips: List[str] = field(default_factory=list)


@dataclass
class GenrePromptTemplate:
    """Complete genre template with prompts and requirements."""

    genre: str
    description: str
    core_elements: List[GenreElement]
    chapter_guidance: Dict[str, str]  # e.g., {"opening": "...", "midpoint": "..."}
    tone_recommendations: List[str]
    pacing_notes: str
    common_tropes: List[str]
    avoid_list: List[str]
    reader_expectations: List[str]
    subgenres: List[str] = field(default_factory=list)

    def get_outline_prompt_additions(self) -> str:
        """Generate additional prompt text for outline generation."""
        lines = [f"\n## Genre Requirements: {self.genre}\n"]
        lines.append(f"{self.description}\n")

        lines.append("\n### Core Elements (must include):\n")
        for elem in self.core_elements:
            if elem.importance == "required":
                lines.append(f"- **{elem.name}**: {elem.description}")
                lines.append(f"  - When: {elem.when_to_include}")
                if elem.tips:
                    lines.append(f"  - Tips: {'; '.join(elem.tips)}")

        lines.append("\n### Reader Expectations:\n")
        for exp in self.reader_expectations:
            lines.append(f"- {exp}")

        lines.append(f"\n### Pacing Notes:\n{self.pacing_notes}\n")

        if self.avoid_list:
            lines.append("\n### Avoid:\n")
            for avoid in self.avoid_list:
                lines.append(f"- {avoid}")

        return "\n".join(lines)

    def get_chapter_prompt(self, chapter_position: str) -> str:
        """Get genre-specific guidance for a chapter position."""
        return self.chapter_guidance.get(chapter_position, "")


# =============================================================================
# ROMANCE GENRE TEMPLATE
# =============================================================================

ROMANCE_TEMPLATE = GenrePromptTemplate(
    genre="Romance",
    description="Stories centered on a romantic relationship with an emotionally satisfying and optimistic ending (HEA/HFN).",
    core_elements=[
        GenreElement(
            name="Meet-Cute",
            description="The first meeting between the romantic leads, often memorable or unusual.",
            when_to_include="First 10-15% of story",
            importance="required",
            tips=[
                "Make it memorable and specific to your characters",
                "Show initial chemistry or tension",
                "Plant seeds for their connection",
            ],
        ),
        GenreElement(
            name="Central Conflict",
            description="The obstacle(s) keeping the couple apart - internal, external, or both.",
            when_to_include="Introduced early, escalates throughout",
            importance="required",
            tips=[
                "Must be believable but not insurmountable",
                "Internal conflicts (fear of intimacy) are often stronger than external",
                "Avoid easily solvable misunderstandings",
            ],
        ),
        GenreElement(
            name="First Kiss/Moment of Intimacy",
            description="A significant romantic milestone showing deepening connection.",
            when_to_include="Around 30-40% mark",
            importance="required",
            tips=[
                "Build anticipation beforehand",
                "Make it emotionally significant, not just physical",
                "Often followed by a setback",
            ],
        ),
        GenreElement(
            name="Black Moment",
            description="The point where all seems lost for the relationship.",
            when_to_include="Around 75-85% mark",
            importance="required",
            tips=[
                "Should feel devastating but not contrived",
                "Often triggers character growth",
                "The moment readers fear they won't get together",
            ],
        ),
        GenreElement(
            name="Grand Gesture/Declaration",
            description="A significant action or confession that proves love.",
            when_to_include="Near the climax",
            importance="required",
            tips=[
                "Should demonstrate character growth",
                "Must address the central conflict",
                "Public or private depending on characters",
            ],
        ),
        GenreElement(
            name="HEA/HFN Ending",
            description="Happily Ever After or Happy For Now - the couple ends together.",
            when_to_include="Final chapter(s)",
            importance="required",
            tips=[
                "Must feel earned through the story",
                "Show the couple's future together",
                "Tie up emotional threads",
            ],
        ),
        GenreElement(
            name="Emotional Beats",
            description="Regular moments showing the relationship's emotional progression.",
            when_to_include="Throughout",
            importance="required",
            tips=[
                "Balance sweet and tension",
                "Show vulnerability from both leads",
                "Use internal monologue effectively",
            ],
        ),
    ],
    chapter_guidance={
        "opening": "Establish both characters' lives before they meet. Show what they're missing or what their flaw is. Make readers root for them to find love.",
        "early": "The meet-cute should be memorable. Show initial attraction but also the conflict that will keep them apart. Build romantic tension.",
        "midpoint": "First major romantic milestone (first kiss, first intimacy). Often followed by a complication that tests the relationship.",
        "late": "Escalate the central conflict. The relationship is threatened. Both characters must confront their fears.",
        "climax": "The black moment - all seems lost. Then the grand gesture or declaration that proves love conquers the obstacle.",
        "ending": "The HEA/HFN. Show the couple together, addressing any lingering doubts. Leave readers satisfied with the emotional payoff.",
    },
    tone_recommendations=[
        "Balance humor with emotional depth",
        "Allow both leads to be vulnerable",
        "Build sexual/romantic tension through delayed gratification",
        "Use internal monologue to show attraction",
    ],
    pacing_notes="Romance requires careful pacing of the relationship development. Too fast feels unbelievable; too slow tests patience. Major romantic beats should occur at roughly 25%, 50%, and 75% marks with the HEA at the end.",
    common_tropes=[
        "Enemies to lovers",
        "Friends to lovers",
        "Second chance romance",
        "Fake relationship",
        "Forced proximity",
        "Opposites attract",
        "Secret identity",
        "Forbidden love",
    ],
    avoid_list=[
        "Love triangles that don't resolve cleanly",
        "Misunderstandings that could be solved by a simple conversation",
        "Rushing the emotional development",
        "Ambiguous endings about the relationship",
        "One-sided grand gestures without consent",
    ],
    reader_expectations=[
        "The central relationship is the main plot, not a subplot",
        "Both leads are equally developed and important",
        "The ending is optimistic and emotionally satisfying",
        "Chemistry is palpable between the leads",
        "The obstacles to love are meaningful and overcome",
    ],
    subgenres=[
        "Contemporary Romance",
        "Historical Romance",
        "Paranormal Romance",
        "Romantic Suspense",
        "Romantic Comedy",
        "New Adult Romance",
    ],
)


# =============================================================================
# MYSTERY GENRE TEMPLATE
# =============================================================================

MYSTERY_TEMPLATE = GenrePromptTemplate(
    genre="Mystery",
    description="Stories centered on solving a crime or puzzle, with clues for readers to follow along.",
    core_elements=[
        GenreElement(
            name="The Crime/Puzzle",
            description="The central mystery that drives the plot - usually murder, theft, or disappearance.",
            when_to_include="Opening or inciting incident",
            importance="required",
            tips=[
                "Make the stakes clear and compelling",
                "Give the detective a personal stake if possible",
                "The mystery should seem impossible to solve at first",
            ],
        ),
        GenreElement(
            name="The Detective/Protagonist",
            description="The character who will solve the mystery - professional or amateur.",
            when_to_include="Established from the start",
            importance="required",
            tips=[
                "Give them unique skills and flaws",
                "Their methodology should be consistent",
                "Personal stakes increase engagement",
            ],
        ),
        GenreElement(
            name="Clue Placement",
            description="Fair clues scattered throughout that allow readers to potentially solve the mystery.",
            when_to_include="Throughout, with major clues at key beats",
            importance="required",
            tips=[
                "Plant at least 3-5 genuine clues",
                "Hide clues in plain sight through misdirection",
                "Each clue should have a 'reveal' moment",
            ],
        ),
        GenreElement(
            name="Red Herrings",
            description="False clues or suspects that mislead but play fair with the reader.",
            when_to_include="Sprinkled throughout, resolved before finale",
            importance="required",
            tips=[
                "Red herrings should seem plausible",
                "Eventually explain why they're not the solution",
                "Don't make them too obvious or frustrating",
            ],
        ),
        GenreElement(
            name="Suspect Pool",
            description="A cast of characters with means, motive, and opportunity.",
            when_to_include="Introduced in first third",
            importance="required",
            tips=[
                "Each suspect should be plausible",
                "Give each suspect secrets (most unrelated to the crime)",
                "The real culprit should be introduced early",
            ],
        ),
        GenreElement(
            name="The Revelation",
            description="The moment when the solution becomes clear, often in a dramatic scene.",
            when_to_include="Climax of the story",
            importance="required",
            tips=[
                "Connect all the planted clues",
                "The solution should be surprising but inevitable in hindsight",
                "Give the detective a moment of triumph",
            ],
        ),
        GenreElement(
            name="Resolution/Denouement",
            description="The aftermath showing justice served and loose ends tied.",
            when_to_include="Final chapter(s)",
            importance="required",
            tips=[
                "Explain the culprit's motivation fully",
                "Address all red herrings and subplots",
                "Provide emotional closure for affected characters",
            ],
        ),
    ],
    chapter_guidance={
        "opening": "Establish the setting and detective character. The crime should occur or be discovered within the first 1-2 chapters. Hook readers with an intriguing puzzle.",
        "early": "Introduce the suspect pool. Begin investigation. Plant initial clues and red herrings. Each suspect should have suspicious behavior.",
        "midpoint": "A major revelation changes the direction of the investigation. Perhaps a key suspect is eliminated or a new piece of evidence emerges. The detective may feel they're getting closer or farther from the truth.",
        "late": "The tension mounts. More clues are revealed. The detective may be in danger. The final pieces are coming together but the solution isn't clear yet.",
        "climax": "The revelation scene. The detective gathers suspects or confronts the culprit. All clues connect. The mystery is solved in a satisfying 'aha' moment.",
        "ending": "Justice is served (or deliberately isn't, in noir). Explain the full story. Show the impact on all characters. Provide closure.",
    },
    tone_recommendations=[
        "Maintain tension and suspicion throughout",
        "Use chapter endings as mini-cliffhangers",
        "Balance procedural details with character development",
        "Create atmosphere through setting details",
    ],
    pacing_notes="Mysteries require careful revelation of information. Too fast and readers can't engage with solving it; too slow and they lose interest. Major clues should appear at roughly 25%, 50%, and 75% marks with the solution at the climax.",
    common_tropes=[
        "Locked room mystery",
        "Amateur sleuth",
        "Police procedural",
        "Cozy mystery",
        "Hard-boiled detective",
        "Cold case",
        "Whodunit",
        "Howdunit",
    ],
    avoid_list=[
        "Solutions that rely on information never given to readers",
        "Culprits introduced at the last minute",
        "Deus ex machina revelations",
        "Making the mystery too easy to solve",
        "Red herrings that feel like cheating",
        "The detective knowing things they couldn't know",
    ],
    reader_expectations=[
        "Fair play - all clues should be available to readers",
        "A satisfying solution that makes sense in hindsight",
        "An engaging detective character",
        "Enough suspects to consider multiple theories",
        "Justice (in some form) at the end",
    ],
    subgenres=[
        "Cozy Mystery",
        "Police Procedural",
        "Hard-boiled/Noir",
        "Amateur Sleuth",
        "Legal Thriller",
        "Historical Mystery",
    ],
)


# =============================================================================
# FANTASY GENRE TEMPLATE
# =============================================================================

FANTASY_TEMPLATE = GenrePromptTemplate(
    genre="Fantasy",
    description="Stories set in imaginary worlds with supernatural elements like magic, mythical creatures, or alternate realities.",
    core_elements=[
        GenreElement(
            name="World Building",
            description="A distinct, consistent world with its own rules, cultures, and history.",
            when_to_include="Established early, revealed throughout",
            importance="required",
            tips=[
                "Show don't tell - reveal through character interaction",
                "Create rules and stick to them consistently",
                "The world should affect the plot directly",
            ],
        ),
        GenreElement(
            name="Magic System",
            description="Supernatural elements with defined rules, costs, and limitations.",
            when_to_include="Established early, demonstrated throughout",
            importance="required",
            tips=[
                "Hard magic: clear rules that readers understand",
                "Soft magic: mysterious but consistent",
                "Magic should have costs/limitations",
            ],
        ),
        GenreElement(
            name="Quest/Journey",
            description="A clear goal that drives the protagonist through the fantasy world.",
            when_to_include="Established by 15-20% mark",
            importance="required",
            tips=[
                "The quest should force exploration of the world",
                "Stakes should be both personal and world-scale",
                "Progress should be measurable",
            ],
        ),
        GenreElement(
            name="Chosen One/Special Status",
            description="The protagonist has a unique role, ability, or destiny.",
            when_to_include="Revealed early to midpoint",
            importance="recommended",
            tips=[
                "If subverting this trope, do so deliberately",
                "The special status should create burden, not just power",
                "Earn the destiny through character choices",
            ],
        ),
        GenreElement(
            name="Fantastical Creatures/Races",
            description="Non-human characters or creatures that inhabit the world.",
            when_to_include="Throughout as appropriate",
            importance="recommended",
            tips=[
                "Give each race/creature unique culture and traits",
                "Avoid pure evil races without nuance",
                "Use creatures to reflect themes",
            ],
        ),
        GenreElement(
            name="Epic Conflict",
            description="A struggle with far-reaching consequences, often good vs. evil.",
            when_to_include="Established early, culminates in climax",
            importance="required",
            tips=[
                "Make the stakes clear and meaningful",
                "Show what will be lost if the protagonist fails",
                "The antagonist should have comprehensible motivation",
            ],
        ),
    ],
    chapter_guidance={
        "opening": "Ground readers in the familiar before introducing the fantastical. Establish the protagonist's ordinary world, then disrupt it. Begin world-building through small, telling details.",
        "early": "Introduce the magic system through demonstration, not exposition. The quest/goal should become clear. Start building the fantastical world piece by piece.",
        "midpoint": "A major revelation about the world, magic, or the protagonist's role. The true scope of the conflict becomes clear. The protagonist may gain new powers or face their first major defeat.",
        "late": "The final preparation for the climactic confrontation. Alliances are tested. The cost of the magic/quest should be apparent. The world's fate hangs in the balance.",
        "climax": "The epic confrontation. Magic, world-building, and character growth all come together. The protagonist uses everything they've learned. The world changes as a result.",
        "ending": "Show the new state of the world. Address the cost of victory. The protagonist's transformation is complete. Leave room for wonder.",
    },
    tone_recommendations=[
        "Balance wonder with grounded emotion",
        "Make the fantastical elements matter to the plot",
        "Ground high concepts in relatable human emotions",
        "Use sensory details to make magic tangible",
    ],
    pacing_notes="Fantasy can support longer story lengths but must maintain momentum. World-building should enhance, not slow, the narrative. Action sequences should showcase the magic system. Allow quiet moments for character development.",
    common_tropes=[
        "Chosen One",
        "Dark Lord antagonist",
        "Magic school",
        "Lost heir",
        "Portal fantasy",
        "Epic quest",
        "Mentor figure",
        "Ancient prophecy",
    ],
    avoid_list=[
        "Info-dumping world-building exposition",
        "Magic that solves problems too easily (deus ex machina)",
        "Inconsistent magic rules",
        "Evil races with no nuance",
        "Incomprehensible fantasy names in excess",
        "Forgetting real-world physics when convenient",
    ],
    reader_expectations=[
        "A fully realized world that feels lived-in",
        "Magic that follows consistent rules",
        "Epic stakes and conflicts",
        "A sense of wonder and discovery",
        "A protagonist who grows through their journey",
    ],
    subgenres=[
        "Epic/High Fantasy",
        "Urban Fantasy",
        "Dark Fantasy",
        "Portal Fantasy",
        "Sword and Sorcery",
        "Romantic Fantasy",
    ],
)


# =============================================================================
# THRILLER GENRE TEMPLATE
# =============================================================================

THRILLER_TEMPLATE = GenrePromptTemplate(
    genre="Thriller",
    description="Fast-paced stories with high stakes, danger, and constant tension. The protagonist often races against time or a powerful antagonist.",
    core_elements=[
        GenreElement(
            name="High Stakes",
            description="Life-or-death consequences that affect the protagonist or larger groups.",
            when_to_include="Established from the start, escalating throughout",
            importance="required",
            tips=[
                "Make the stakes personal AND larger",
                "Raise stakes at each act break",
                "Show consequences of failure",
            ],
        ),
        GenreElement(
            name="Time Pressure",
            description="A ticking clock that creates urgency throughout the story.",
            when_to_include="Introduced early, constant presence",
            importance="required",
            tips=[
                "The clock should feel real and consequential",
                "Remind readers of the deadline regularly",
                "Time running out should increase tension naturally",
            ],
        ),
        GenreElement(
            name="Formidable Antagonist",
            description="An opponent who is competent, dangerous, and always one step ahead.",
            when_to_include="Presence felt from start, direct confrontation late",
            importance="required",
            tips=[
                "The antagonist should feel like a real threat",
                "Give them resources and intelligence",
                "Their plan should be comprehensible even if evil",
            ],
        ),
        GenreElement(
            name="Twists and Reversals",
            description="Unexpected developments that change the protagonist's understanding or situation.",
            when_to_include="Placed at key beats (25%, 50%, 75%)",
            importance="required",
            tips=[
                "Set up twists with subtle foreshadowing",
                "Each twist should raise stakes, not just surprise",
                "The final twist should reframe the entire story",
            ],
        ),
        GenreElement(
            name="Protagonist Under Threat",
            description="The main character is in constant physical or psychological danger.",
            when_to_include="Throughout",
            importance="required",
            tips=[
                "Vary the types of threats",
                "Use close calls to build tension",
                "The protagonist should earn their survival",
            ],
        ),
        GenreElement(
            name="Tension Escalation",
            description="Each chapter should increase the tension and stakes.",
            when_to_include="Throughout, building to climax",
            importance="required",
            tips=[
                "No chapter should feel like a plateau",
                "Use chapter endings as cliffhangers",
                "Brief respites make the tension more effective",
            ],
        ),
        GenreElement(
            name="Climactic Confrontation",
            description="A final showdown with the antagonist where everything is on the line.",
            when_to_include="Near the end, after maximum tension",
            importance="required",
            tips=[
                "The protagonist should use all they've learned",
                "The antagonist should be at their most dangerous",
                "The outcome should feel earned, not lucky",
            ],
        ),
    ],
    chapter_guidance={
        "opening": "Start in media res or with an immediate hook. Establish the threat and stakes quickly. The protagonist should be capable but in over their head.",
        "early": "The antagonist's plan begins to unfold. The protagonist is reactive. Plant clues for later twists. Each chapter should end on tension.",
        "midpoint": "A major twist or reversal. The protagonist shifts from reactive to proactive. New understanding of the threat. Stakes become personal as well as external.",
        "late": "The antagonist closes in. Time is running out. Trust is tested. The protagonist may lose allies or resources. The final confrontation approaches.",
        "climax": "The ultimate confrontation. Everything converges. The protagonist must make a crucial choice. Maximum action and tension. The twist that reframes everything may come here.",
        "ending": "Resolution of the threat. Brief cooldown showing the cost. The protagonist is changed. Possible setup for sequel or open question.",
    },
    tone_recommendations=[
        "Maintain relentless pace",
        "Short chapters and sentences during action",
        "Use multiple POVs to show the antagonist's moves",
        "Create dread through what characters don't know",
    ],
    pacing_notes="Thrillers demand constant forward momentum. Every scene should either advance the plot or increase tension. Long exposition or character reflection should be minimal. Use short chapters to maintain urgency. The pace should accelerate toward the climax.",
    common_tropes=[
        "Ticking clock",
        "Conspiracy",
        "Wrongly accused",
        "Cat and mouse",
        "The one that got away",
        "Inside job",
        "Race against time",
        "Trust no one",
    ],
    avoid_list=[
        "Long passages without tension",
        "Easily escapable traps",
        "Incompetent antagonists",
        "Twists that don't make sense in hindsight",
        "Protagonist winning through luck alone",
        "Excessive exposition during action",
    ],
    reader_expectations=[
        "Constant tension and suspense",
        "A protagonist who is tested to their limits",
        "A worthy, intelligent antagonist",
        "Surprising but logical plot developments",
        "A satisfying, high-stakes climax",
    ],
    subgenres=[
        "Psychological Thriller",
        "Legal Thriller",
        "Medical Thriller",
        "Spy Thriller",
        "Political Thriller",
        "Techno-thriller",
    ],
)


# =============================================================================
# LITERARY FICTION TEMPLATE
# =============================================================================

LITERARY_FICTION_TEMPLATE = GenrePromptTemplate(
    genre="Literary Fiction",
    description="Character-driven stories that emphasize prose style, thematic depth, and the human condition over plot mechanics.",
    core_elements=[
        GenreElement(
            name="Complex Protagonist",
            description="A deeply developed main character with rich inner life and contradictions.",
            when_to_include="Established from the start, deepened throughout",
            importance="required",
            tips=[
                "Interior life is as important as external action",
                "Contradictions and flaws make characters real",
                "The character's transformation is the plot",
            ],
        ),
        GenreElement(
            name="Thematic Depth",
            description="Exploration of universal themes through specific characters and situations.",
            when_to_include="Woven throughout",
            importance="required",
            tips=[
                "Theme should emerge from character and situation",
                "Avoid being didactic or heavy-handed",
                "Multiple layers of meaning enhance rereading",
            ],
        ),
        GenreElement(
            name="Prose Style",
            description="Distinctive, crafted prose that serves the story's emotional and thematic goals.",
            when_to_include="Throughout",
            importance="required",
            tips=[
                "The prose style should match the content",
                "Every word should be intentional",
                "Rhythm, imagery, and language all carry meaning",
            ],
        ),
        GenreElement(
            name="Moral Ambiguity",
            description="Situations and characters that resist simple judgments of right and wrong.",
            when_to_include="Throughout",
            importance="recommended",
            tips=[
                "Avoid clear heroes and villains",
                "Let readers draw their own conclusions",
                "Complexity reflects real life",
            ],
        ),
        GenreElement(
            name="Emotional Truth",
            description="Authentic representation of human emotion and experience.",
            when_to_include="Throughout",
            importance="required",
            tips=[
                "Specificity creates universality",
                "Show vulnerability and contradiction",
                "Quiet moments can be as powerful as dramatic ones",
            ],
        ),
        GenreElement(
            name="Character Transformation",
            description="Meaningful change in the protagonist's understanding, beliefs, or way of being.",
            when_to_include="Gradual throughout, culminating near end",
            importance="required",
            tips=[
                "Transformation can be subtle",
                "The change should feel earned through the narrative",
                "Not all transformations are positive",
            ],
        ),
    ],
    chapter_guidance={
        "opening": "Establish voice and tone immediately. Introduce the protagonist in a moment that reveals character. Ground the story in specific, vivid detail. The central tension may be internal.",
        "early": "Develop the protagonist's world and relationships. Explore the thematic questions through situation and character. The 'plot' may be subtle - focus on emotional truth.",
        "midpoint": "A shift in the protagonist's understanding or circumstances. This may be quiet rather than dramatic. The thematic questions deepen. Relationships evolve.",
        "late": "The central tensions come to a head. The protagonist must confront what they've been avoiding. The complexity of the situation is fully revealed.",
        "climax": "The moment of decision or realization. This may be an internal climax rather than external action. The thematic threads converge. The protagonist's transformation crystallizes.",
        "ending": "Resolution may be ambiguous or open-ended. The change in the protagonist is visible. Echo earlier moments with new meaning. Leave readers with something to contemplate.",
    },
    tone_recommendations=[
        "Trust the reader's intelligence",
        "Show rather than tell, but with purpose",
        "Allow silence and space in the narrative",
        "Subtext is as important as text",
    ],
    pacing_notes="Literary fiction often moves at a more contemplative pace than genre fiction. This doesn't mean slow - every scene should serve a purpose. The pacing should match the emotional journey. Quiet moments can be as intense as action.",
    common_tropes=[
        "Coming of age",
        "Family drama",
        "Identity exploration",
        "Loss and grief",
        "Social commentary",
        "Memory and nostalgia",
        "Relationship examination",
        "Ordinary life illuminated",
    ],
    avoid_list=[
        "Plot-driven events that feel artificial",
        "Characters as mouthpieces for themes",
        "Purple prose that overwhelms story",
        "Endings that tie everything up neatly",
        "Villains or heroes without complexity",
        "Heavy-handed symbolism",
    ],
    reader_expectations=[
        "Beautiful, purposeful prose",
        "Deep character exploration",
        "Themes that resonate beyond the page",
        "Emotional authenticity",
        "A thoughtful reading experience",
    ],
    subgenres=[
        "Contemporary Fiction",
        "Historical Literary Fiction",
        "Magical Realism",
        "Experimental Fiction",
        "Biographical Fiction",
        "Social Fiction",
    ],
)


# =============================================================================
# SCIENCE FICTION TEMPLATE (BONUS)
# =============================================================================

SCIENCE_FICTION_TEMPLATE = GenrePromptTemplate(
    genre="Science Fiction",
    description="Stories that extrapolate from current or imagined science and technology to explore their impact on humanity and society.",
    core_elements=[
        GenreElement(
            name="Speculative Element",
            description="A 'what if' premise rooted in science or technology.",
            when_to_include="Central to the story from the start",
            importance="required",
            tips=[
                "The speculation should be the story's engine",
                "Ground fantastical elements in plausible science",
                "Explore implications thoroughly",
            ],
        ),
        GenreElement(
            name="World-Building",
            description="A future or alternate world shaped by the speculative element.",
            when_to_include="Established early, revealed throughout",
            importance="required",
            tips=[
                "Show how society has adapted to the technology",
                "Include both benefits and drawbacks",
                "Small details make the world feel real",
            ],
        ),
        GenreElement(
            name="Thematic Exploration",
            description="Use the speculative element to explore real-world themes and questions.",
            when_to_include="Throughout",
            importance="required",
            tips=[
                "What does this technology reveal about human nature?",
                "Explore ethical implications",
                "The best SF illuminates the present through the future",
            ],
        ),
        GenreElement(
            name="Technology Impact",
            description="Show how the science/technology affects individual lives and society.",
            when_to_include="Throughout",
            importance="required",
            tips=[
                "Both positive and negative consequences",
                "Technology should create new problems as it solves others",
                "Personal stories illuminate broader themes",
            ],
        ),
    ],
    chapter_guidance={
        "opening": "Establish the speculative premise quickly. Show how it affects daily life. Ground readers in the rules of this world through action, not exposition.",
        "early": "Develop the implications of the premise. The protagonist encounters the central conflict that the technology creates or enables. World-building through character interaction.",
        "midpoint": "A major revelation about the technology, society, or protagonist changes the stakes. The full scope of the speculation becomes clear.",
        "late": "The consequences of the speculation come to a head. The protagonist must make choices that embody the thematic questions. Technology's double-edged nature is apparent.",
        "climax": "The thematic and plot threads converge. The protagonist confronts the implications of the speculative element. The climax should illuminate the central 'what if.'",
        "ending": "Show the changed world. The thematic question is answered (or deliberately left open). The human element transcends the technology.",
    },
    tone_recommendations=[
        "Balance wonder with critical examination",
        "Ground speculation in human emotion",
        "Use technical details sparingly and purposefully",
        "The science should serve the story, not vice versa",
    ],
    pacing_notes="Science fiction varies widely in pacing. Hard SF may move slower for exposition; space opera may be action-driven. Match pacing to your subgenre and story needs. World-building should never stop the story.",
    common_tropes=[
        "First contact",
        "Artificial intelligence",
        "Space exploration",
        "Time travel",
        "Dystopia/utopia",
        "Cyberpunk",
        "Post-apocalyptic",
        "Clone/genetic engineering",
    ],
    avoid_list=[
        "Technology as magic without rules",
        "Info-dumping technical exposition",
        "Ignoring social implications of technology",
        "Deus ex machina technological solutions",
        "Characters as vehicles for explaining technology",
    ],
    reader_expectations=[
        "A compelling 'what if' premise",
        "Consistent, believable speculation",
        "Exploration of the premise's implications",
        "Human stories within the speculative frame",
        "Ideas that provoke thought",
    ],
    subgenres=[
        "Hard SF",
        "Space Opera",
        "Cyberpunk",
        "Military SF",
        "Dystopian",
        "Time Travel",
    ],
)


# =============================================================================
# HORROR TEMPLATE (BONUS)
# =============================================================================

HORROR_TEMPLATE = GenrePromptTemplate(
    genre="Horror",
    description="Stories designed to frighten, unsettle, or disturb through supernatural or psychological elements.",
    core_elements=[
        GenreElement(
            name="Source of Fear",
            description="The central threat - supernatural, psychological, or monstrous.",
            when_to_include="Hinted early, revealed gradually",
            importance="required",
            tips=[
                "What you don't show is often scarier than what you do",
                "The unknown is inherently frightening",
                "The threat should be beyond normal control",
            ],
        ),
        GenreElement(
            name="Escalating Dread",
            description="Fear that builds progressively throughout the story.",
            when_to_include="Throughout, intensifying",
            importance="required",
            tips=[
                "Start with unease, build to terror",
                "Use false scares sparingly",
                "The anticipation of horror is often worse than the horror",
            ],
        ),
        GenreElement(
            name="Vulnerable Protagonist",
            description="A character readers connect with who faces genuine danger.",
            when_to_include="Established from the start",
            importance="required",
            tips=[
                "Readers must care about the protagonist's fate",
                "Vulnerability makes the threat more real",
                "Their fear should be relatable",
            ],
        ),
        GenreElement(
            name="Atmosphere/Setting",
            description="An environment that enhances the sense of dread and isolation.",
            when_to_include="Established early, maintained throughout",
            importance="required",
            tips=[
                "Use setting to create unease",
                "Isolation (physical or psychological) increases fear",
                "Familiar places made strange are effective",
            ],
        ),
    ],
    chapter_guidance={
        "opening": "Establish normalcy before disruption. Plant seeds of unease. Make readers care about the protagonist before threatening them.",
        "early": "The first encounters with the threat. Still deniable or explainable. The protagonist begins to suspect something is wrong.",
        "midpoint": "The threat becomes undeniable. The protagonist is isolated or trapped. Attempts to escape or fight back fail. The true nature of the horror begins to reveal itself.",
        "late": "Maximum terror. The protagonist faces their darkest fears. Resources are depleted. Hope seems lost.",
        "climax": "The final confrontation with the source of fear. The protagonist must act despite terror. Resolution may be victory, survival, or tragic.",
        "ending": "The aftermath. Is the threat truly gone? Show the cost. Horror often ends with a final twist or lingering unease.",
    },
    tone_recommendations=[
        "Build dread slowly before terror",
        "Use sensory details to ground fear",
        "The unknown is scarier than the known",
        "Give readers moments to breathe, then scare again",
    ],
    pacing_notes="Horror requires careful pacing of fear. Too much too soon exhausts readers; too slow loses them. Build tension through anticipation. Use quiet moments to reset before the next scare. The climax should be the most intense sustained sequence.",
    common_tropes=[
        "Haunted house",
        "Ancient evil awakens",
        "Possession",
        "Monster in the dark",
        "Psychological terror",
        "Body horror",
        "Survival horror",
        "Curse/vengeance",
    ],
    avoid_list=[
        "Jump scares without buildup",
        "Protagonists who act stupidly to create danger",
        "Over-explaining the monster/threat",
        "Clichéd scary settings without atmosphere",
        "Gore without emotional weight",
    ],
    reader_expectations=[
        "To be genuinely frightened",
        "A threat that feels dangerous and beyond control",
        "A protagonist worth rooting for",
        "Building dread and tension",
        "A satisfying (if terrifying) resolution",
    ],
    subgenres=[
        "Supernatural Horror",
        "Psychological Horror",
        "Gothic Horror",
        "Body Horror",
        "Cosmic Horror",
        "Slasher",
    ],
)


# =============================================================================
# TEMPLATE REGISTRY
# =============================================================================

GENRE_TEMPLATES: Dict[str, GenrePromptTemplate] = {
    "romance": ROMANCE_TEMPLATE,
    "mystery": MYSTERY_TEMPLATE,
    "fantasy": FANTASY_TEMPLATE,
    "thriller": THRILLER_TEMPLATE,
    "literary_fiction": LITERARY_FICTION_TEMPLATE,
    "literary": LITERARY_FICTION_TEMPLATE,  # Alias
    "science_fiction": SCIENCE_FICTION_TEMPLATE,
    "sci-fi": SCIENCE_FICTION_TEMPLATE,  # Alias
    "sf": SCIENCE_FICTION_TEMPLATE,  # Alias
    "horror": HORROR_TEMPLATE,
}


def get_genre_template(genre: str) -> Optional[GenrePromptTemplate]:
    """Get a genre template by name (case-insensitive)."""
    # Normalize the genre name
    normalized = genre.lower().replace(" ", "_")

    # Check direct match first
    if normalized in GENRE_TEMPLATES:
        return GENRE_TEMPLATES[normalized]

    # Try with hyphens converted to underscores
    normalized_underscore = normalized.replace("-", "_")
    if normalized_underscore in GENRE_TEMPLATES:
        return GENRE_TEMPLATES[normalized_underscore]

    # Try common aliases with hyphen forms
    hyphen_aliases = {
        "sci-fi": "science_fiction",
        "scifi": "science_fiction",
    }
    if normalized in hyphen_aliases:
        return GENRE_TEMPLATES.get(hyphen_aliases[normalized])

    return None


def get_all_genre_names() -> List[str]:
    """Get list of all available genre names."""
    # Return unique genres (excluding aliases)
    seen = set()
    result = []
    for name, template in GENRE_TEMPLATES.items():
        if template.genre not in seen:
            result.append(name)
            seen.add(template.genre)
    return result


def get_genre_summary(genre: str) -> Optional[Dict[str, Any]]:
    """Get a summary of a genre template for display."""
    template = get_genre_template(genre)
    if not template:
        return None

    return {
        "genre": template.genre,
        "description": template.description,
        "core_element_count": len(template.core_elements),
        "core_elements": [
            {"name": elem.name, "importance": elem.importance} for elem in template.core_elements
        ],
        "common_tropes": template.common_tropes,
        "subgenres": template.subgenres,
    }


def generate_outline_prompt_for_genre(genre: str) -> Optional[str]:
    """Generate the full outline prompt additions for a genre."""
    template = get_genre_template(genre)
    if not template:
        return None
    return template.get_outline_prompt_additions()


def get_chapter_prompt_for_genre(genre: str, chapter_position: str) -> str:
    """Get genre-specific guidance for a chapter position.

    Args:
        genre: The genre name
        chapter_position: One of 'opening', 'early', 'midpoint', 'late', 'climax', 'ending'

    Returns:
        Genre-specific chapter guidance or empty string
    """
    template = get_genre_template(genre)
    if not template:
        return ""
    return template.get_chapter_prompt(chapter_position)


def get_genre_avoid_list(genre: str) -> List[str]:
    """Get the list of things to avoid for a genre."""
    template = get_genre_template(genre)
    if not template:
        return []
    return template.avoid_list


def get_genre_reader_expectations(genre: str) -> List[str]:
    """Get reader expectations for a genre."""
    template = get_genre_template(genre)
    if not template:
        return []
    return template.reader_expectations
