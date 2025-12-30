'use client'

import { useState } from 'react'
import {
  BookOpen,
  Heart,
  Search,
  Wand2,
  Zap,
  Pen,
  Rocket,
  Ghost,
  ChevronDown,
  ChevronUp,
  Check,
  Info,
  AlertTriangle,
  Target,
  X,
} from 'lucide-react'

// Genre template data matching backend genre_templates.py
interface GenreElement {
  name: string
  description: string
  when_to_include: string
  importance: 'required' | 'recommended' | 'optional'
  tips: string[]
}

interface GenreTemplate {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  core_elements: GenreElement[]
  common_tropes: string[]
  subgenres: string[]
  avoid_list: string[]
  reader_expectations: string[]
  pacing_notes: string
}

const GENRE_TEMPLATES: GenreTemplate[] = [
  {
    id: 'romance',
    name: 'Romance',
    description:
      'Stories centered on a romantic relationship with an emotionally satisfying and optimistic ending (HEA/HFN).',
    icon: <Heart className="h-5 w-5" />,
    core_elements: [
      {
        name: 'Meet-Cute',
        description: 'The first meeting between the romantic leads.',
        when_to_include: 'First 10-15% of story',
        importance: 'required',
        tips: [
          'Make it memorable and specific to your characters',
          'Show initial chemistry or tension',
        ],
      },
      {
        name: 'Central Conflict',
        description: 'The obstacle(s) keeping the couple apart.',
        when_to_include: 'Introduced early, escalates throughout',
        importance: 'required',
        tips: ['Must be believable but not insurmountable'],
      },
      {
        name: 'Black Moment',
        description: 'The point where all seems lost for the relationship.',
        when_to_include: 'Around 75-85% mark',
        importance: 'required',
        tips: ['Should feel devastating but not contrived'],
      },
      {
        name: 'HEA/HFN Ending',
        description: 'Happily Ever After or Happy For Now ending.',
        when_to_include: 'Final chapter(s)',
        importance: 'required',
        tips: ['Must feel earned through the story'],
      },
    ],
    common_tropes: [
      'Enemies to lovers',
      'Friends to lovers',
      'Second chance romance',
      'Fake relationship',
      'Forced proximity',
      'Opposites attract',
    ],
    subgenres: [
      'Contemporary Romance',
      'Historical Romance',
      'Paranormal Romance',
      'Romantic Suspense',
      'Romantic Comedy',
    ],
    avoid_list: [
      'Love triangles that don\'t resolve cleanly',
      'Misunderstandings solvable by simple conversation',
      'Ambiguous endings about the relationship',
    ],
    reader_expectations: [
      'Central relationship is the main plot',
      'Both leads are equally developed',
      'Optimistic, emotionally satisfying ending',
    ],
    pacing_notes:
      'Major romantic beats should occur at roughly 25%, 50%, and 75% marks with the HEA at the end.',
  },
  {
    id: 'mystery',
    name: 'Mystery',
    description:
      'Stories centered on solving a crime or puzzle, with clues for readers to follow along.',
    icon: <Search className="h-5 w-5" />,
    core_elements: [
      {
        name: 'The Crime/Puzzle',
        description: 'The central mystery that drives the plot.',
        when_to_include: 'Opening or inciting incident',
        importance: 'required',
        tips: ['Make the stakes clear and compelling'],
      },
      {
        name: 'Clue Placement',
        description: 'Fair clues allowing readers to potentially solve the mystery.',
        when_to_include: 'Throughout, with major clues at key beats',
        importance: 'required',
        tips: ['Plant at least 3-5 genuine clues', 'Hide clues in plain sight'],
      },
      {
        name: 'Red Herrings',
        description: 'False clues or suspects that mislead but play fair.',
        when_to_include: 'Sprinkled throughout, resolved before finale',
        importance: 'required',
        tips: ['Should seem plausible', 'Eventually explain why they\'re not the solution'],
      },
      {
        name: 'The Revelation',
        description: 'The moment when the solution becomes clear.',
        when_to_include: 'Climax of the story',
        importance: 'required',
        tips: ['Connect all the planted clues'],
      },
    ],
    common_tropes: [
      'Locked room mystery',
      'Amateur sleuth',
      'Police procedural',
      'Cozy mystery',
      'Hard-boiled detective',
      'Cold case',
    ],
    subgenres: [
      'Cozy Mystery',
      'Police Procedural',
      'Hard-boiled/Noir',
      'Amateur Sleuth',
      'Legal Thriller',
    ],
    avoid_list: [
      'Solutions relying on information never given to readers',
      'Culprits introduced at the last minute',
      'Deus ex machina revelations',
    ],
    reader_expectations: [
      'Fair play - all clues should be available to readers',
      'A satisfying solution that makes sense in hindsight',
      'Justice (in some form) at the end',
    ],
    pacing_notes:
      'Major clues should appear at roughly 25%, 50%, and 75% marks with the solution at the climax.',
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    description:
      'Stories set in imaginary worlds with supernatural elements like magic, mythical creatures, or alternate realities.',
    icon: <Wand2 className="h-5 w-5" />,
    core_elements: [
      {
        name: 'World Building',
        description: 'A distinct, consistent world with its own rules.',
        when_to_include: 'Established early, revealed throughout',
        importance: 'required',
        tips: ['Show don\'t tell', 'The world should affect the plot directly'],
      },
      {
        name: 'Magic System',
        description: 'Supernatural elements with defined rules and limitations.',
        when_to_include: 'Established early, demonstrated throughout',
        importance: 'required',
        tips: ['Magic should have costs/limitations'],
      },
      {
        name: 'Quest/Journey',
        description: 'A clear goal driving the protagonist through the fantasy world.',
        when_to_include: 'Established by 15-20% mark',
        importance: 'required',
        tips: ['Progress should be measurable'],
      },
      {
        name: 'Epic Conflict',
        description: 'A struggle with far-reaching consequences.',
        when_to_include: 'Established early, culminates in climax',
        importance: 'required',
        tips: ['Show what will be lost if the protagonist fails'],
      },
    ],
    common_tropes: [
      'Chosen One',
      'Dark Lord antagonist',
      'Magic school',
      'Lost heir',
      'Portal fantasy',
      'Epic quest',
    ],
    subgenres: [
      'Epic/High Fantasy',
      'Urban Fantasy',
      'Dark Fantasy',
      'Portal Fantasy',
      'Sword and Sorcery',
    ],
    avoid_list: [
      'Info-dumping world-building exposition',
      'Magic that solves problems too easily',
      'Inconsistent magic rules',
    ],
    reader_expectations: [
      'A fully realized world that feels lived-in',
      'Magic that follows consistent rules',
      'A sense of wonder and discovery',
    ],
    pacing_notes:
      'Fantasy can support longer story lengths but must maintain momentum. World-building should enhance, not slow, the narrative.',
  },
  {
    id: 'thriller',
    name: 'Thriller',
    description:
      'Fast-paced stories with high stakes, danger, and constant tension. The protagonist often races against time.',
    icon: <Zap className="h-5 w-5" />,
    core_elements: [
      {
        name: 'High Stakes',
        description: 'Life-or-death consequences.',
        when_to_include: 'Established from the start, escalating throughout',
        importance: 'required',
        tips: ['Make the stakes personal AND larger', 'Raise stakes at each act break'],
      },
      {
        name: 'Time Pressure',
        description: 'A ticking clock that creates urgency.',
        when_to_include: 'Introduced early, constant presence',
        importance: 'required',
        tips: ['The clock should feel real and consequential'],
      },
      {
        name: 'Formidable Antagonist',
        description: 'An opponent who is competent and always one step ahead.',
        when_to_include: 'Presence felt from start, direct confrontation late',
        importance: 'required',
        tips: ['The antagonist should feel like a real threat'],
      },
      {
        name: 'Twists and Reversals',
        description: 'Unexpected developments that change the situation.',
        when_to_include: 'Placed at key beats (25%, 50%, 75%)',
        importance: 'required',
        tips: ['Each twist should raise stakes, not just surprise'],
      },
    ],
    common_tropes: [
      'Ticking clock',
      'Conspiracy',
      'Wrongly accused',
      'Cat and mouse',
      'Race against time',
      'Trust no one',
    ],
    subgenres: [
      'Psychological Thriller',
      'Legal Thriller',
      'Medical Thriller',
      'Spy Thriller',
      'Political Thriller',
    ],
    avoid_list: [
      'Long passages without tension',
      'Easily escapable traps',
      'Incompetent antagonists',
    ],
    reader_expectations: [
      'Constant tension and suspense',
      'A protagonist tested to their limits',
      'Surprising but logical plot developments',
    ],
    pacing_notes:
      'Thrillers demand constant forward momentum. Every scene should either advance the plot or increase tension.',
  },
  {
    id: 'literary_fiction',
    name: 'Literary Fiction',
    description:
      'Character-driven stories emphasizing prose style, thematic depth, and the human condition.',
    icon: <Pen className="h-5 w-5" />,
    core_elements: [
      {
        name: 'Complex Protagonist',
        description: 'A deeply developed main character with rich inner life.',
        when_to_include: 'Established from the start, deepened throughout',
        importance: 'required',
        tips: ['Interior life is as important as external action'],
      },
      {
        name: 'Thematic Depth',
        description: 'Exploration of universal themes through specific situations.',
        when_to_include: 'Woven throughout',
        importance: 'required',
        tips: ['Theme should emerge from character and situation'],
      },
      {
        name: 'Prose Style',
        description: 'Distinctive, crafted prose that serves emotional and thematic goals.',
        when_to_include: 'Throughout',
        importance: 'required',
        tips: ['Every word should be intentional'],
      },
      {
        name: 'Character Transformation',
        description: 'Meaningful change in the protagonist\'s understanding or way of being.',
        when_to_include: 'Gradual throughout, culminating near end',
        importance: 'required',
        tips: ['The change should feel earned through the narrative'],
      },
    ],
    common_tropes: [
      'Coming of age',
      'Family drama',
      'Identity exploration',
      'Loss and grief',
      'Social commentary',
      'Ordinary life illuminated',
    ],
    subgenres: [
      'Contemporary Fiction',
      'Historical Literary Fiction',
      'Magical Realism',
      'Experimental Fiction',
      'Social Fiction',
    ],
    avoid_list: [
      'Plot-driven events that feel artificial',
      'Characters as mouthpieces for themes',
      'Endings that tie everything up neatly',
    ],
    reader_expectations: [
      'Beautiful, purposeful prose',
      'Deep character exploration',
      'Themes that resonate beyond the page',
    ],
    pacing_notes:
      'Literary fiction often moves at a more contemplative pace. Every scene should serve a purpose.',
  },
  {
    id: 'science_fiction',
    name: 'Science Fiction',
    description:
      'Stories that extrapolate from science and technology to explore their impact on humanity.',
    icon: <Rocket className="h-5 w-5" />,
    core_elements: [
      {
        name: 'Speculative Element',
        description: 'A "what if" premise rooted in science or technology.',
        when_to_include: 'Central to the story from the start',
        importance: 'required',
        tips: ['The speculation should be the story\'s engine'],
      },
      {
        name: 'World-Building',
        description: 'A future or alternate world shaped by the speculative element.',
        when_to_include: 'Established early, revealed throughout',
        importance: 'required',
        tips: ['Show how society has adapted to the technology'],
      },
      {
        name: 'Thematic Exploration',
        description: 'Use the speculative element to explore real-world themes.',
        when_to_include: 'Throughout',
        importance: 'required',
        tips: ['What does this technology reveal about human nature?'],
      },
      {
        name: 'Technology Impact',
        description: 'Show how science/technology affects lives and society.',
        when_to_include: 'Throughout',
        importance: 'required',
        tips: ['Both positive and negative consequences'],
      },
    ],
    common_tropes: [
      'First contact',
      'Artificial intelligence',
      'Space exploration',
      'Time travel',
      'Dystopia/utopia',
      'Cyberpunk',
    ],
    subgenres: ['Hard SF', 'Space Opera', 'Cyberpunk', 'Military SF', 'Dystopian', 'Time Travel'],
    avoid_list: [
      'Technology as magic without rules',
      'Info-dumping technical exposition',
      'Deus ex machina technological solutions',
    ],
    reader_expectations: [
      'A compelling "what if" premise',
      'Consistent, believable speculation',
      'Ideas that provoke thought',
    ],
    pacing_notes:
      'Science fiction varies widely in pacing. Match pacing to your subgenre. World-building should never stop the story.',
  },
  {
    id: 'horror',
    name: 'Horror',
    description:
      'Stories designed to frighten, unsettle, or disturb through supernatural or psychological elements.',
    icon: <Ghost className="h-5 w-5" />,
    core_elements: [
      {
        name: 'Source of Fear',
        description: 'The central threat - supernatural, psychological, or monstrous.',
        when_to_include: 'Hinted early, revealed gradually',
        importance: 'required',
        tips: ['What you don\'t show is often scarier than what you do'],
      },
      {
        name: 'Escalating Dread',
        description: 'Fear that builds progressively throughout the story.',
        when_to_include: 'Throughout, intensifying',
        importance: 'required',
        tips: ['Start with unease, build to terror'],
      },
      {
        name: 'Vulnerable Protagonist',
        description: 'A character readers connect with who faces genuine danger.',
        when_to_include: 'Established from the start',
        importance: 'required',
        tips: ['Readers must care about the protagonist\'s fate'],
      },
      {
        name: 'Atmosphere/Setting',
        description: 'An environment that enhances the sense of dread.',
        when_to_include: 'Established early, maintained throughout',
        importance: 'required',
        tips: ['Familiar places made strange are effective'],
      },
    ],
    common_tropes: [
      'Haunted house',
      'Ancient evil awakens',
      'Possession',
      'Monster in the dark',
      'Psychological terror',
      'Survival horror',
    ],
    subgenres: [
      'Supernatural Horror',
      'Psychological Horror',
      'Gothic Horror',
      'Body Horror',
      'Cosmic Horror',
    ],
    avoid_list: [
      'Jump scares without buildup',
      'Protagonists who act stupidly to create danger',
      'Over-explaining the monster/threat',
    ],
    reader_expectations: [
      'To be genuinely frightened',
      'A threat that feels dangerous and beyond control',
      'Building dread and tension',
    ],
    pacing_notes:
      'Horror requires careful pacing of fear. Build tension through anticipation. Use quiet moments to reset before the next scare.',
  },
]

interface GenreTemplateSelectorProps {
  onGenreSelect?: (template: GenreTemplate | null) => void
  onSubgenreSelect?: (subgenre: string | null) => void
  onTropeSelect?: (tropes: string[]) => void
  initialGenre?: string
  initialSubgenre?: string
  initialTropes?: string[]
}

export default function GenreTemplateSelector({
  onGenreSelect,
  onSubgenreSelect,
  onTropeSelect,
  initialGenre,
  initialSubgenre,
  initialTropes = [],
}: GenreTemplateSelectorProps) {
  const [selectedGenre, setSelectedGenre] = useState<GenreTemplate | null>(
    initialGenre ? GENRE_TEMPLATES.find((g) => g.id === initialGenre) || null : null
  )
  const [selectedSubgenre, setSelectedSubgenre] = useState<string | null>(initialSubgenre || null)
  const [selectedTropes, setSelectedTropes] = useState<string[]>(initialTropes)
  const [expandedSection, setExpandedSection] = useState<string | null>('genres')
  const [showDetails, setShowDetails] = useState(false)

  const handleGenreSelect = (template: GenreTemplate) => {
    if (selectedGenre?.id === template.id) {
      setSelectedGenre(null)
      setSelectedSubgenre(null)
      setSelectedTropes([])
      onGenreSelect?.(null)
      onSubgenreSelect?.(null)
      onTropeSelect?.([])
    } else {
      setSelectedGenre(template)
      setSelectedSubgenre(null)
      setSelectedTropes([])
      onGenreSelect?.(template)
      onSubgenreSelect?.(null)
      onTropeSelect?.([])
    }
  }

  const handleSubgenreSelect = (subgenre: string) => {
    if (selectedSubgenre === subgenre) {
      setSelectedSubgenre(null)
      onSubgenreSelect?.(null)
    } else {
      setSelectedSubgenre(subgenre)
      onSubgenreSelect?.(subgenre)
    }
  }

  const handleTropeToggle = (trope: string) => {
    const newTropes = selectedTropes.includes(trope)
      ? selectedTropes.filter((t) => t !== trope)
      : [...selectedTropes, trope]
    setSelectedTropes(newTropes)
    onTropeSelect?.(newTropes)
  }

  const renderGenreCard = (template: GenreTemplate) => {
    const isSelected = selectedGenre?.id === template.id

    return (
      <button
        key={template.id}
        onClick={() => handleGenreSelect(template)}
        className={`flex items-center gap-3 p-4 border rounded-lg text-left transition-all w-full ${
          isSelected
            ? 'border-teal bg-teal/5 shadow-md'
            : 'border-slate/20 hover:border-slate/40'
        }`}
      >
        <div
          className={`p-2 rounded-lg ${isSelected ? 'bg-teal text-snow' : 'bg-slate/10 text-slate'}`}
        >
          {template.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{template.name}</span>
            {isSelected && <Check className="h-4 w-4 text-teal" />}
          </div>
          <p className="text-xs text-slate truncate">{template.description}</p>
        </div>
      </button>
    )
  }

  const renderCoreElements = () => {
    if (!selectedGenre) return null

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-ink">Required Elements</h3>
        {selectedGenre.core_elements.map((element, index) => (
          <div
            key={index}
            className={`border rounded-lg p-3 ${
              element.importance === 'required'
                ? 'border-teal/30 bg-teal/5'
                : 'border-slate/20'
            }`}
          >
            <div className="flex items-start gap-2">
              <Target className="h-4 w-4 text-teal mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-ink">{element.name}</span>
                  {element.importance === 'required' && (
                    <span className="text-xs bg-teal/20 text-teal px-1.5 py-0.5 rounded">
                      Required
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate mt-1">{element.description}</p>
                <p className="text-xs text-slate/70 mt-1">
                  <span className="font-medium">When:</span> {element.when_to_include}
                </p>
                {showDetails && element.tips.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {element.tips.map((tip, i) => (
                      <li key={i} className="text-xs text-slate flex items-start gap-1">
                        <span className="text-teal">-</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderAvoidList = () => {
    if (!selectedGenre) return null

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-ink flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Things to Avoid
        </h3>
        <ul className="space-y-2">
          {selectedGenre.avoid_list.map((item, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-slate">
              <X className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const renderReaderExpectations = () => {
    if (!selectedGenre) return null

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-ink flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-500" />
          Reader Expectations
        </h3>
        <ul className="space-y-2">
          {selectedGenre.reader_expectations.map((item, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-slate">
              <Check className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="bg-snow rounded-xl shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-slate/10">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-teal" />
          <h2 className="text-lg font-medium text-ink">Genre Template</h2>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Genre Selection */}
        <div>
          <button
            onClick={() =>
              setExpandedSection(expandedSection === 'genres' ? null : 'genres')
            }
            className="flex items-center justify-between w-full text-sm font-medium text-ink mb-3"
          >
            <span>Select Genre</span>
            {expandedSection === 'genres' ? (
              <ChevronUp className="h-4 w-4 text-slate" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate" />
            )}
          </button>
          {expandedSection === 'genres' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GENRE_TEMPLATES.map(renderGenreCard)}
            </div>
          )}
        </div>

        {/* Genre Details */}
        {selectedGenre && (
          <>
            {/* Subgenre Selection */}
            <div>
              <button
                onClick={() =>
                  setExpandedSection(expandedSection === 'subgenres' ? null : 'subgenres')
                }
                className="flex items-center justify-between w-full text-sm font-medium text-ink mb-3"
              >
                <span>Subgenre (Optional)</span>
                {expandedSection === 'subgenres' ? (
                  <ChevronUp className="h-4 w-4 text-slate" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate" />
                )}
              </button>
              {expandedSection === 'subgenres' && (
                <div className="flex flex-wrap gap-2">
                  {selectedGenre.subgenres.map((subgenre) => (
                    <button
                      key={subgenre}
                      onClick={() => handleSubgenreSelect(subgenre)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        selectedSubgenre === subgenre
                          ? 'border-teal bg-teal/10 text-teal'
                          : 'border-slate/20 text-slate hover:border-slate/40'
                      }`}
                    >
                      {subgenre}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Common Tropes */}
            <div>
              <button
                onClick={() =>
                  setExpandedSection(expandedSection === 'tropes' ? null : 'tropes')
                }
                className="flex items-center justify-between w-full text-sm font-medium text-ink mb-3"
              >
                <span>
                  Common Tropes{' '}
                  {selectedTropes.length > 0 && (
                    <span className="text-teal">({selectedTropes.length} selected)</span>
                  )}
                </span>
                {expandedSection === 'tropes' ? (
                  <ChevronUp className="h-4 w-4 text-slate" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate" />
                )}
              </button>
              {expandedSection === 'tropes' && (
                <div className="flex flex-wrap gap-2">
                  {selectedGenre.common_tropes.map((trope) => (
                    <button
                      key={trope}
                      onClick={() => handleTropeToggle(trope)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        selectedTropes.includes(trope)
                          ? 'border-teal bg-teal/10 text-teal'
                          : 'border-slate/20 text-slate hover:border-slate/40'
                      }`}
                    >
                      {trope}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Core Elements */}
            <div>
              <button
                onClick={() =>
                  setExpandedSection(expandedSection === 'elements' ? null : 'elements')
                }
                className="flex items-center justify-between w-full text-sm font-medium text-ink mb-3"
              >
                <span>Core Elements</span>
                {expandedSection === 'elements' ? (
                  <ChevronUp className="h-4 w-4 text-slate" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate" />
                )}
              </button>
              {expandedSection === 'elements' && (
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-sm text-slate">
                    <input
                      type="checkbox"
                      checked={showDetails}
                      onChange={(e) => setShowDetails(e.target.checked)}
                      className="rounded border-slate/30 text-teal focus:ring-teal"
                    />
                    Show detailed tips
                  </label>
                  {renderCoreElements()}
                </div>
              )}
            </div>

            {/* Reader Expectations & Avoid List */}
            <div>
              <button
                onClick={() =>
                  setExpandedSection(expandedSection === 'guidance' ? null : 'guidance')
                }
                className="flex items-center justify-between w-full text-sm font-medium text-ink mb-3"
              >
                <span>Writing Guidance</span>
                {expandedSection === 'guidance' ? (
                  <ChevronUp className="h-4 w-4 text-slate" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate" />
                )}
              </button>
              {expandedSection === 'guidance' && (
                <div className="space-y-6">
                  {renderReaderExpectations()}
                  {renderAvoidList()}
                  <div className="bg-slate/5 rounded-lg p-3">
                    <h3 className="text-sm font-medium text-ink mb-2">Pacing Notes</h3>
                    <p className="text-sm text-slate">{selectedGenre.pacing_notes}</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Summary Footer */}
      {selectedGenre && (
        <div className="p-4 border-t border-slate/10 bg-slate/5">
          <div className="text-sm space-y-1">
            <div>
              <span className="text-slate">Genre: </span>
              <span className="font-medium text-ink">{selectedGenre.name}</span>
            </div>
            {selectedSubgenre && (
              <div>
                <span className="text-slate">Subgenre: </span>
                <span className="font-medium text-ink">{selectedSubgenre}</span>
              </div>
            )}
            {selectedTropes.length > 0 && (
              <div>
                <span className="text-slate">Tropes: </span>
                <span className="font-medium text-ink">{selectedTropes.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
