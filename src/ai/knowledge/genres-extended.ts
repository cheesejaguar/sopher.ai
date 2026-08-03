/**
 * Genres added after the original seven.
 *
 * The first seven templates in `./genres` are all adult genre fiction. The
 * homepage, however, sells a bedtime story and a family memoir — books an
 * author could not actually select. These five close that gap:
 *
 * - Three age-banded fiction categories (children's, middle grade, young adult)
 *   whose defining constraints are audience, chapter length, and content, not
 *   plot shape.
 * - Historical fiction, a peer of the original seven.
 * - Memoir, the first non-fiction form. It is marked `nonFiction`, which is what
 *   tells the outline and Story Bible layers to stop assuming invented
 *   characters and a plotted arc.
 *
 * Structure and depth deliberately mirror `./genres` so downstream prompt
 * builders treat every template identically.
 */

import type { GenreTemplate } from "./genres";

// =============================================================================
// CHILDREN'S CHAPTER BOOK
// =============================================================================

export const CHILDRENS_TEMPLATE: GenreTemplate = {
  genre: "Children's",
  description:
    "Short illustrated-style chapter books for readers roughly 5-9, built on one clear problem, a warm voice, and a reassuring resolution.",
  audience: "children",
  defaultChapters: 8,
  defaultWordsPerChapter: 750,
  coreElements: [
    {
      name: "One Clear Problem",
      description:
        "A single, concrete problem a young reader can hold in their head for the whole book.",
      whenToInclude: "First chapter",
      required: true,
      tips: [
        "State the problem in terms a six-year-old would use",
        "Keep it small and physical — a lost thing, a scary first day, an unfair rule",
        "One problem only; subplots confuse this age",
      ],
    },
    {
      name: "A Child (Or Child-Like) Protagonist With Agency",
      description: "The young hero solves the problem themselves; adults do not rescue them.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "The protagonist should be the same age as the reader or slightly older",
        "Adults may help, but the decisive act belongs to the child",
        "Give them one strong, nameable trait",
      ],
    },
    {
      name: "Repetition And Pattern",
      description:
        "Recurring phrases, running jokes, and repeated structures that reward a young reader.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "A repeated catchphrase makes the book feel like a friend",
        "Three attempts before success is the classic rhythm",
        "Repetition also carries new readers over hard sentences",
      ],
    },
    {
      name: "Escalating Attempts",
      description: "Two or three failed tries that get funnier or bigger before the solution.",
      whenToInclude: "Middle chapters",
      required: true,
      tips: [
        "Each attempt should fail for a different reason",
        "Physical comedy lands better than verbal irony at this age",
        "The last failure should feel like the end of hope",
      ],
    },
    {
      name: "Warm, Reassuring Resolution",
      description: "The problem is solved and the world is safe again.",
      whenToInclude: "Final chapter",
      required: true,
      tips: [
        "Resolve completely — no ambiguity, no cliffhangers",
        "Return to the opening image or phrase to close the circle",
        "End on comfort, often home, food, or sleep",
      ],
    },
    {
      name: "Chapter-End Hooks",
      description: "Small pulls that make a child ask for one more chapter.",
      whenToInclude: "Every chapter break",
      required: false,
      tips: [
        "End on a small surprise rather than real peril",
        "A question in the last line works well",
        "Keep the fear level low; this is often read at bedtime",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Introduce the hero, their world, and the one problem in the first few pages. Use short sentences and concrete nouns. Establish any repeated phrase immediately.",
    early:
      "The first attempt to fix the problem. Let it fail in a way that is funny rather than frightening. Show the hero's defining trait in action.",
    midpoint:
      "The second attempt, bigger and sillier. Raise the stakes only slightly. A friend or animal companion can join here.",
    late: "The last failure. Let the hero feel genuinely discouraged, but keep the tone gentle. An adult may offer comfort but not the answer.",
    climax:
      "The hero uses their defining trait to solve the problem themselves. Keep the action clear, physical, and quick.",
    ending:
      "Everything is set right. Echo the opening phrase or image. Close on warmth and safety, ideally at home.",
  },
  toneRecommendations: [
    "Warm, playful, and never condescending",
    "Short sentences and concrete, sensory nouns",
    "Read-aloud rhythm — the text should sound good spoken",
    "Humor comes from the physical and the absurd, not from irony",
  ],
  pacingNotes:
    "Very fast. Each chapter is one scene with one event and should take about five minutes to read aloud. Nothing is described that does not matter. A whole book is often shorter than a single adult chapter, so every paragraph must earn its place.",
  commonTropes: [
    "The talking animal companion",
    "The first day somewhere new",
    "The lost object hunt",
    "The unfair grown-up rule",
    "The secret hideout",
    "The small hero and the big task",
    "The wish that goes wrong",
    "The messy helper who saves the day",
  ],
  avoidList: [
    "Peril or threat that would frighten a child at bedtime",
    "An adult solving the problem for the child",
    "Irony, sarcasm, or jokes aimed over the child's head at the parent",
    "Long descriptive passages or abstract emotion",
    "Ambiguous or unresolved endings",
    "Vocabulary chosen to impress rather than to be understood",
  ],
  readerExpectations: [
    "One problem, clearly solved by the end",
    "The child hero is the one who fixes it",
    "It can be read aloud comfortably in one or two sittings",
    "The ending feels safe and warm",
    "Language is simple without being flat",
  ],
  subgenres: [
    "Bedtime Story",
    "Animal Adventure",
    "First Experiences",
    "Funny School Story",
    "Gentle Fantasy",
    "Family Story",
  ],
};

// =============================================================================
// MIDDLE GRADE
// =============================================================================

export const MIDDLE_GRADE_TEMPLATE: GenreTemplate = {
  genre: "Middle Grade",
  description:
    "Adventures for readers roughly 8-12 in which a young protagonist tests themselves against a world that is bigger than their family but still safe at the edges.",
  audience: "middle_grade",
  defaultChapters: 20,
  defaultWordsPerChapter: 1_500,
  coreElements: [
    {
      name: "A Protagonist On The Edge Of Independence",
      description:
        "A hero of about eleven to thirteen who is starting to act without asking permission.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Make the protagonist slightly older than the intended reader",
        "Their competence should grow visibly across the book",
        "Adults should be well-meaning but absent at the crucial moment",
      ],
    },
    {
      name: "A Concrete External Quest",
      description: "A goal that can be described in one sentence and seen on the page.",
      whenToInclude: "Established in the first three chapters",
      required: true,
      tips: [
        "Physical goals beat abstract ones at this age",
        "The reader should always know what the hero is trying to do next",
        "Tie the external quest to an internal need",
      ],
    },
    {
      name: "Friendship As The Emotional Engine",
      description: "One or two friends whose bond is tested and repaired.",
      whenToInclude: "Introduced early, tested at the low point",
      required: true,
      tips: [
        "The friendship rupture often matters more than the plot setback",
        "Give each friend one clear want of their own",
        "Loyalty is the central virtue of the age band",
      ],
    },
    {
      name: "Humor And Wonder",
      description: "Regular relief and delight, even in a serious story.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Let the hero be funny on purpose sometimes",
        "Wonder can come from the ordinary seen closely",
        "Never let the book become bleak for long stretches",
      ],
    },
    {
      name: "A Fair, Earned Climax",
      description: "The hero wins using something established earlier, not luck or rescue.",
      whenToInclude: "Final 10-15%",
      required: true,
      tips: [
        "Plant the tool, skill, or truth well before it is needed",
        "The hero must choose, not merely survive",
        "Cost matters — winning should give something up",
      ],
    },
    {
      name: "Restored, Changed World",
      description: "Home is regained, but the hero is measurably different.",
      whenToInclude: "Final chapters",
      required: true,
      tips: [
        "Show the change through a small concrete action",
        "Reunion with family or friends closes the emotional loop",
        "Hopeful endings are effectively mandatory",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Show the hero in their ordinary world and make clear what frustrates them about it. Establish voice fast — middle grade lives on voice. End the first chapter with the disturbance.",
    early:
      "Commit to the quest. Introduce the friends and the rules of the world. Let the hero make a decision no adult sanctioned.",
    midpoint:
      "A real success or a real revelation that changes the shape of the problem. The hero moves from reacting to choosing.",
    late: "The friendship fractures and the quest looks lost. Let the hero be genuinely wrong about something. This is the emotional low point.",
    climax:
      "The hero acts alone or repairs the friendship in time to act together. They use what was planted earlier. Keep the action legible and physical.",
    ending:
      "Return home changed. Show the new competence in a small, quiet way. Leave the reader proud of the hero.",
  },
  toneRecommendations: [
    "Voice-forward and funny, even in serious moments",
    "Emotionally honest without being heavy",
    "Concrete sensory detail over abstraction",
    "Respect the reader's intelligence completely",
  ],
  pacingNotes:
    "Brisk. Chapters run short and end on pulls. Something should change every chapter. Interiority is welcome but must stay tethered to action; long reflective passages lose this reader.",
  commonTropes: [
    "The summer that changed everything",
    "The new kid in town",
    "A secret discovered in an old house",
    "The misfit team",
    "A magical object with rules",
    "The absent or distracted parent",
    "The map that leads somewhere real",
    "The rivalry that becomes a friendship",
  ],
  avoidList: [
    "Adults solving the central problem",
    "Romance beyond a first crush",
    "Graphic violence or on-page cruelty",
    "Moralizing or a lesson stated outright",
    "Nostalgic adult narration looking back",
    "Despairing or unresolved endings",
  ],
  readerExpectations: [
    "A hero their own age with real agency",
    "A clear quest they can follow",
    "Friendship that is tested and survives",
    "Humor throughout",
    "An ending that is hopeful and earned",
  ],
  subgenres: [
    "Contemporary Middle Grade",
    "Middle Grade Fantasy",
    "Middle Grade Mystery",
    "Adventure",
    "Animal Story",
    "Historical Middle Grade",
  ],
};

// =============================================================================
// YOUNG ADULT
// =============================================================================

export const YOUNG_ADULT_TEMPLATE: GenreTemplate = {
  genre: "Young Adult",
  description:
    "Stories for readers roughly 13-18 driven by identity, first autonomy, and consequences that are allowed to be permanent.",
  audience: "young_adult",
  defaultChapters: 30,
  defaultWordsPerChapter: 2_500,
  coreElements: [
    {
      name: "An Identity Question",
      description: "A protagonist actively deciding who they are, not merely what to do.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "The external plot should force the identity question",
        "Let the answer cost them a relationship or a belief",
        "Avoid resolving it too tidily",
      ],
    },
    {
      name: "Immediate, Close Voice",
      description: "First person or tight third, present in the character's head at all times.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Voice is the primary reason a YA reader stays",
        "Interiority should be specific and unflattering, not generic angst",
        "Present tense is common and heightens immediacy",
      ],
    },
    {
      name: "Peer World Over Adult World",
      description: "Friends, rivals, and love interests carry the emotional weight.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Adults may be present but should not hold the solution",
        "Peer judgment is a real and sufficient stake",
        "Give the antagonist a comprehensible motive",
      ],
    },
    {
      name: "First Autonomy",
      description: "A decision made without permission that cannot be taken back.",
      whenToInclude: "Around the midpoint",
      required: true,
      tips: [
        "This is the spine of the age band — let it be genuinely risky",
        "Consequences must be real and land on the page",
        "The protagonist should own the choice afterwards",
      ],
    },
    {
      name: "Permanent Consequence",
      description: "Something that does not get restored: a person, a place, an innocence.",
      whenToInclude: "Late",
      required: true,
      tips: [
        "YA can end sadder than middle grade, but not hopelessly",
        "Loss is what separates YA from middle grade structurally",
        "Grief should be given room rather than skipped",
      ],
    },
    {
      name: "Earned Forward Motion",
      description: "An ending that opens rather than closes — a beginning, not a homecoming.",
      whenToInclude: "Final chapters",
      required: false,
      tips: [
        "Hope should be visible even when the ending hurts",
        "Show the protagonist choosing their next step",
        "Resist tying every thread",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Establish the voice in the first paragraph and the protagonist's central discomfort by the end of the chapter. Ground the reader in a specific social world.",
    early:
      "Introduce the peer relationships and the pressure that will force change. Show what the protagonist believes about themselves — it should be wrong.",
    midpoint:
      "The first genuinely autonomous decision. The story stops being something that happens to them.",
    late: "Consequences arrive. Relationships fracture. The belief established early is proven false, and it hurts.",
    climax:
      "The protagonist chooses who they are, at cost. The choice should be active, specific, and irreversible.",
    ending:
      "Aftermath rather than restoration. Show what was lost and what is now possible. End looking outward.",
  },
  toneRecommendations: [
    "Immediate, intimate, and unsentimental",
    "Let emotion be big without the prose becoming purple",
    "Contemporary rhythm without chasing current slang",
    "Take the protagonist's problems as seriously as they do",
  ],
  pacingNotes:
    "Chapters are short and end on emotional turns rather than plot cliffhangers. Interiority carries more weight than in middle grade, but must alternate with scene. The midpoint autonomy beat and the late consequence beat are the two structural anchors.",
  commonTropes: [
    "The chosen one who refuses",
    "Found family",
    "The secret that will destroy a friendship",
    "First love and first betrayal",
    "The last summer before everything changes",
    "The institution that cannot be trusted",
    "The parent whose story turns out to be false",
    "The competition with a real cost",
  ],
  avoidList: [
    "Adult narration that condescends to the protagonist",
    "Slang written to sound current",
    "Lessons delivered by a wise adult",
    "Treating teenage feeling as a phase to be outgrown",
    "Romanticizing self-harm, addiction, or abuse",
    "Resolving the identity question with a single conversation",
  ],
  readerExpectations: [
    "A voice that feels true from the first page",
    "Peers, not adults, at the center",
    "Real consequences that stick",
    "Emotional honesty about hard subjects",
    "An ending that hurts but leaves a way forward",
  ],
  subgenres: [
    "Contemporary YA",
    "YA Fantasy",
    "YA Science Fiction",
    "YA Romance",
    "YA Thriller",
    "YA Historical",
  ],
};

// =============================================================================
// HISTORICAL FICTION
// =============================================================================

export const HISTORICAL_FICTION_TEMPLATE: GenreTemplate = {
  genre: "Historical Fiction",
  description:
    "Invented characters living inside a real past, where the period constrains what they are able to want, say, and do.",
  audience: "adult",
  coreElements: [
    {
      name: "A Specific Anchored Moment",
      description: "A named place and a narrow span of time, not a vague 'long ago'.",
      whenToInclude: "First chapter",
      required: true,
      tips: [
        "Anchor with a date, a season, and a place in the opening pages",
        "The narrower the window, the more solid the world feels",
        "Choose a moment where ordinary life is already under pressure",
      ],
    },
    {
      name: "Period-Constrained Agency",
      description: "What the protagonist can do is limited by the era's law, class, and custom.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "The constraint is the drama — do not write a modern person in costume",
        "Show the cost of transgressing a norm rather than waving it away",
        "Let characters believe things their time believed",
      ],
    },
    {
      name: "Embedded Sensory Research",
      description: "Period detail delivered through action and the senses, never as a lecture.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Work, food, smell, money, and weather do more than dates",
        "One precise object beats a paragraph of background",
        "If a detail does not touch a character, cut it",
      ],
    },
    {
      name: "History As Antagonist",
      description: "The larger event presses on private life and forces choices.",
      whenToInclude: "Escalating throughout",
      required: true,
      tips: [
        "Keep the famous events at the edges and the private life at the center",
        "The reader may know how history ends; the character must not",
        "Dramatic irony is a resource, not a problem",
      ],
    },
    {
      name: "Period-Plausible Voice",
      description: "Prose and dialogue that suggest the era without becoming pastiche.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Suggest period with syntax and vocabulary, not phonetic dialect",
        "Avoid anachronistic metaphors, especially technological ones",
        "Readability wins over authenticity when they conflict",
      ],
    },
    {
      name: "Honest Reckoning",
      description: "The period's injustices are neither erased nor gratuitously staged.",
      whenToInclude: "Throughout",
      required: false,
      tips: [
        "Do not sanitize, and do not linger for effect",
        "Let characters hold period views without the narrative endorsing them",
        "An author's note can carry what the story should not explain",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Place the reader precisely in time and location through concrete daily detail. Establish the protagonist's ordinary work and the constraint they live under.",
    early:
      "Introduce the pressure from the larger historical moment. Show what the protagonist wants and exactly why the period makes it difficult.",
    midpoint:
      "History intrudes decisively on private life. The protagonist commits to a course that their world disapproves of.",
    late: "The cost of that commitment arrives — social, legal, or physical. Loyalties divide along period lines.",
    climax:
      "The protagonist chooses between safety and conscience. The choice must be possible within the period's rules.",
    ending:
      "Show the aftermath in ordinary terms. Resist resolving the historical event; resolve the private life inside it.",
  },
  toneRecommendations: [
    "Grounded, tactile, and unhurried",
    "Let research show as texture, never as exposition",
    "Restraint in tragedy; the facts carry the weight",
    "Period vocabulary in moderation",
  ],
  pacingNotes:
    "Somewhat slower than contemporary genre fiction, because the world must be established before it can be threatened. Front-load sensory grounding, then accelerate as the historical pressure closes in. Avoid research dumps at any speed.",
  commonTropes: [
    "The letter that arrives too late",
    "The servant who sees everything",
    "Divided loyalties in wartime",
    "The forbidden marriage across class",
    "The dual timeline with a modern researcher",
    "The village that keeps one secret",
    "The inheritance that arrives with a condition",
    "The emigrant's crossing",
  ],
  avoidList: [
    "Modern attitudes in period dress",
    "Phonetic dialect spelling",
    "Research dumps and encyclopedia paragraphs",
    "Famous historical figures crowding out the invented cast",
    "Anachronistic idiom, technology, or metaphor",
    "Treating the past as uniformly grim or uniformly quaint",
  ],
  readerExpectations: [
    "A world that feels lived in rather than looked up",
    "Characters whose limits are real",
    "Historical accuracy in the load-bearing details",
    "Private stakes inside public events",
    "An author's note distinguishing fact from invention",
  ],
  subgenres: [
    "War Fiction",
    "Biographical Fiction",
    "Historical Saga",
    "Historical Mystery",
    "Dual Timeline",
    "Historical Romance",
  ],
};

// =============================================================================
// MEMOIR (NON-FICTION)
// =============================================================================

export const MEMOIR_TEMPLATE: GenreTemplate = {
  genre: "Memoir",
  description:
    "A true account of a bounded period of the author's own life, shaped around one question the author is genuinely trying to answer.",
  audience: "adult",
  nonFiction: true,
  coreElements: [
    {
      name: "A Bounded Subject",
      description: "One thread of a life — not the whole life, which is autobiography.",
      whenToInclude: "Established in the first chapter",
      required: true,
      tips: [
        "Name the span: a year, an illness, a marriage, a move",
        "If it cannot be stated in a sentence, the scope is still too wide",
        "Everything that does not serve the thread belongs in another book",
      ],
    },
    {
      name: "The Driving Question",
      description: "What the narrator is trying to understand by telling this.",
      whenToInclude: "Implicit early, explicit by the midpoint",
      required: true,
      tips: [
        "The question must be one the author has not fully answered",
        "Certainty flattens memoir; genuine searching animates it",
        "The reader should feel the question being worked on, not concluded",
      ],
    },
    {
      name: "Two Voices: Then And Now",
      description:
        "The self who lived it and the self who is telling it, held in deliberate tension.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Let the younger self be wrong without the narrator sneering",
        "Retrospective insight is the reason to write it now",
        "Do not let the present-day voice explain away every scene",
      ],
    },
    {
      name: "Scene, Not Summary",
      description: "Remembered life rendered as dramatized scene with dialogue and detail.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Summary is where memoir goes to die — dramatize the turning points",
        "Sensory specifics carry truth better than assertions of feeling",
        "It is honest to reconstruct dialogue in good faith; say so if it matters",
      ],
    },
    {
      name: "Honest Self-Implication",
      description: "The narrator is also at fault somewhere, and says so.",
      whenToInclude: "Throughout, unmistakable by the late chapters",
      required: true,
      tips: [
        "A blameless narrator reads as untrustworthy",
        "Self-implication is what earns the reader's trust for the harder claims",
        "Avoid settling scores on the page",
      ],
    },
    {
      name: "Care For Real People",
      description: "Other people in the account are treated as people, not devices.",
      whenToInclude: "Throughout",
      required: true,
      tips: [
        "Give others their own reasons, including those who hurt you",
        "Consider changing identifying details for private individuals",
        "Fairness is both an ethical and a craft requirement",
      ],
    },
    {
      name: "Meaning Without A Moral",
      description: "An ending that arrives at understanding rather than a lesson.",
      whenToInclude: "Final chapters",
      required: false,
      tips: [
        "Resist the tidy takeaway; readers resent being instructed",
        "It is acceptable to end still partly unresolved",
        "The last image should carry the meaning",
      ],
    },
  ],
  chapterGuidance: {
    opening:
      "Open inside a specific scene, not with background. Establish the narrator's voice and hint at the question the book is asking. Orient the reader in time and place quickly.",
    early:
      "Give the necessary context through dramatized scene. Establish what the narrator believed then, and let the reader see it is incomplete.",
    midpoint:
      "The turn — the event or realization that made this period worth writing about. The driving question should become explicit here.",
    late: "The hardest material. Include the narrator's own failure. Resist protecting yourself; this is where the book earns its trust.",
    climax:
      "Not necessarily dramatic — often the moment of understanding, or of refusing an easy understanding. Keep it in scene.",
    ending:
      "Arrive at what the narrator now knows and what remains unresolved. Close on a concrete image rather than a summarizing statement.",
  },
  toneRecommendations: [
    "Intimate, specific, and self-aware",
    "Restraint in the most painful passages — understatement carries further",
    "Allow humor; it is a mark of perspective",
    "Trust the reader to draw conclusions",
  ],
  pacingNotes:
    "Organized by meaning rather than by chronology. Chapters can move in time freely as long as the reader is oriented in the first lines. Alternate dramatized scene with reflection, and keep reflective passages shorter than the scenes they follow. Because there is no plot machinery, the driving question is what supplies forward pull — restate and complicate it regularly.",
  commonTropes: [
    "The year of the illness",
    "The journey undertaken to understand a parent",
    "Leaving the faith or community one was raised in",
    "The apprenticeship or first job that formed a life",
    "Caring for someone at the end",
    "The return to a childhood place",
    "The letters or diaries found after a death",
    "The addiction and what came after",
  ],
  avoidList: [
    "Chronological life-summary from birth onward",
    "A narrator who is only ever wronged",
    "Settling scores with named private individuals",
    "Ending with an explicit lesson for the reader",
    "Inventing events or composite scenes presented as literal fact",
    "Reflection that substitutes for scene",
  ],
  readerExpectations: [
    "It is true, and told in good faith",
    "One bounded subject rather than an entire life",
    "Real scenes with real specificity",
    "A narrator honest about their own part",
    "Understanding at the end, not instruction",
  ],
  subgenres: [
    "Family Memoir",
    "Travel Memoir",
    "Illness and Recovery",
    "Grief Memoir",
    "Coming-of-Age Memoir",
    "Vocation and Career Memoir",
  ],
};
