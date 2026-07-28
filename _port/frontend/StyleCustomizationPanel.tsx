'use client'

import { useState, useEffect } from 'react'
import {
  Palette,
  User,
  Sliders,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
  X,
  Check,
  RefreshCw,
} from 'lucide-react'

// Voice profile data matching backend voice_profiles.py
interface VoiceProfile {
  id: string
  name: string
  description: string
  characteristics: string[]
  parameters: VoiceParameters
}

interface VoiceParameters {
  sentence_rhythm: 'staccato' | 'flowing' | 'varied' | 'measured'
  vocabulary_level: 'simple' | 'moderate' | 'sophisticated' | 'ornate'
  emotional_intensity: 'restrained' | 'moderate' | 'intense' | 'raw'
  imagery_density: 'sparse' | 'moderate' | 'rich' | 'lush'
  narrative_distance: 'intimate' | 'close' | 'middle' | 'distant'
  dialogue_heaviness: number // 0.0-1.0
  description_heaviness: number // 0.0-1.0
  action_pacing: number // 0.0-1.0
  introspection_level: number // 0.0-1.0
}

// Predefined voice profiles from backend
const VOICE_PROFILES: VoiceProfile[] = [
  {
    id: 'hemingway',
    name: 'Hemingway-Inspired',
    description: 'Minimalist, direct prose with short sentences and strong verbs.',
    characteristics: [
      'Short, declarative sentences',
      'Minimal adjectives',
      'Strong, active verbs',
      'Iceberg theory - meaning beneath the surface',
    ],
    parameters: {
      sentence_rhythm: 'staccato',
      vocabulary_level: 'simple',
      emotional_intensity: 'restrained',
      imagery_density: 'sparse',
      narrative_distance: 'middle',
      dialogue_heaviness: 0.6,
      description_heaviness: 0.3,
      action_pacing: 0.7,
      introspection_level: 0.2,
    },
  },
  {
    id: 'austen',
    name: 'Austen-Inspired',
    description: 'Witty, observant prose with elegant sentence structures and social commentary.',
    characteristics: [
      'Free indirect discourse',
      'Ironic narrative voice',
      'Social observation',
      'Elegant, balanced sentences',
    ],
    parameters: {
      sentence_rhythm: 'flowing',
      vocabulary_level: 'sophisticated',
      emotional_intensity: 'restrained',
      imagery_density: 'moderate',
      narrative_distance: 'close',
      dialogue_heaviness: 0.5,
      description_heaviness: 0.4,
      action_pacing: 0.3,
      introspection_level: 0.6,
    },
  },
  {
    id: 'king',
    name: 'King-Inspired',
    description: 'Accessible, conversational style with deep character interiority.',
    characteristics: [
      'Colloquial voice',
      'Deep POV immersion',
      'Pop culture references',
      'Accessible yet literary',
    ],
    parameters: {
      sentence_rhythm: 'varied',
      vocabulary_level: 'moderate',
      emotional_intensity: 'intense',
      imagery_density: 'rich',
      narrative_distance: 'intimate',
      dialogue_heaviness: 0.5,
      description_heaviness: 0.5,
      action_pacing: 0.5,
      introspection_level: 0.7,
    },
  },
  {
    id: 'pratchett',
    name: 'Pratchett-Inspired',
    description: 'Humorous, satirical prose with clever wordplay and footnotes.',
    characteristics: [
      'Satirical observations',
      'Clever wordplay',
      'Breaking fourth wall',
      'Philosophical humor',
    ],
    parameters: {
      sentence_rhythm: 'varied',
      vocabulary_level: 'sophisticated',
      emotional_intensity: 'moderate',
      imagery_density: 'rich',
      narrative_distance: 'middle',
      dialogue_heaviness: 0.6,
      description_heaviness: 0.4,
      action_pacing: 0.4,
      introspection_level: 0.5,
    },
  },
  {
    id: 'mccarthy',
    name: 'McCarthy-Inspired',
    description: 'Sparse, poetic prose with biblical rhythms and minimal punctuation.',
    characteristics: [
      'No quotation marks',
      'Biblical cadence',
      'Landscape as character',
      'Visceral imagery',
    ],
    parameters: {
      sentence_rhythm: 'measured',
      vocabulary_level: 'moderate',
      emotional_intensity: 'raw',
      imagery_density: 'lush',
      narrative_distance: 'distant',
      dialogue_heaviness: 0.3,
      description_heaviness: 0.7,
      action_pacing: 0.5,
      introspection_level: 0.4,
    },
  },
  {
    id: 'rowling',
    name: 'Rowling-Inspired',
    description: 'Clear, engaging prose perfect for all ages with strong world-building.',
    characteristics: [
      'Clear, accessible prose',
      'Strong character voice',
      'Whimsical details',
      'Emotional payoffs',
    ],
    parameters: {
      sentence_rhythm: 'varied',
      vocabulary_level: 'moderate',
      emotional_intensity: 'intense',
      imagery_density: 'rich',
      narrative_distance: 'close',
      dialogue_heaviness: 0.6,
      description_heaviness: 0.5,
      action_pacing: 0.6,
      introspection_level: 0.5,
    },
  },
  {
    id: 'atwood',
    name: 'Atwood-Inspired',
    description: 'Sharp, layered prose with feminist themes and speculative elements.',
    characteristics: [
      'Layered meanings',
      'Sharp observations',
      'Historical echoes',
      'Feminist undertones',
    ],
    parameters: {
      sentence_rhythm: 'varied',
      vocabulary_level: 'sophisticated',
      emotional_intensity: 'moderate',
      imagery_density: 'moderate',
      narrative_distance: 'intimate',
      dialogue_heaviness: 0.4,
      description_heaviness: 0.5,
      action_pacing: 0.3,
      introspection_level: 0.8,
    },
  },
  {
    id: 'gaiman',
    name: 'Gaiman-Inspired',
    description: 'Mythic, dreamy prose blending fairy tale with modern sensibilities.',
    characteristics: [
      'Fairy tale echoes',
      'Dreamy atmosphere',
      'Myth made modern',
      'Dark whimsy',
    ],
    parameters: {
      sentence_rhythm: 'flowing',
      vocabulary_level: 'moderate',
      emotional_intensity: 'moderate',
      imagery_density: 'rich',
      narrative_distance: 'middle',
      dialogue_heaviness: 0.5,
      description_heaviness: 0.5,
      action_pacing: 0.4,
      introspection_level: 0.5,
    },
  },
  {
    id: 'christie',
    name: 'Christie-Inspired',
    description: 'Clean, puzzle-focused prose with fair-play mystery construction.',
    characteristics: [
      'Clean, efficient prose',
      'Fair-play clues',
      'Red herring mastery',
      'Satisfying reveals',
    ],
    parameters: {
      sentence_rhythm: 'measured',
      vocabulary_level: 'moderate',
      emotional_intensity: 'restrained',
      imagery_density: 'sparse',
      narrative_distance: 'middle',
      dialogue_heaviness: 0.7,
      description_heaviness: 0.3,
      action_pacing: 0.4,
      introspection_level: 0.4,
    },
  },
  {
    id: 'sanderson',
    name: 'Sanderson-Inspired',
    description: 'Clear, systematic prose with detailed magic systems and epic scope.',
    characteristics: [
      'Clear explanations',
      'Systematic magic',
      'Epic scope',
      'Satisfying payoffs',
    ],
    parameters: {
      sentence_rhythm: 'measured',
      vocabulary_level: 'moderate',
      emotional_intensity: 'moderate',
      imagery_density: 'moderate',
      narrative_distance: 'close',
      dialogue_heaviness: 0.5,
      description_heaviness: 0.6,
      action_pacing: 0.7,
      introspection_level: 0.4,
    },
  },
]

// Custom style settings
interface CustomStyleSettings {
  sentenceLength: 'short' | 'medium' | 'long' | 'varied'
  vocabularyComplexity: 'simple' | 'moderate' | 'complex'
  emotionalDepth: 'surface' | 'moderate' | 'deep'
  descriptionLevel: 'minimal' | 'balanced' | 'rich'
  dialogueRatio: number // 0-100
  pacingSpeed: 'slow' | 'moderate' | 'fast'
}

interface StyleCustomizationPanelProps {
  onStyleChange?: (style: {
    voiceProfile: VoiceProfile | null
    customSettings: CustomStyleSettings
    blendProfiles: { profile: VoiceProfile; weight: number }[]
  }) => void
  initialVoiceProfile?: string
  initialCustomSettings?: Partial<CustomStyleSettings>
}

const DEFAULT_CUSTOM_SETTINGS: CustomStyleSettings = {
  sentenceLength: 'varied',
  vocabularyComplexity: 'moderate',
  emotionalDepth: 'moderate',
  descriptionLevel: 'balanced',
  dialogueRatio: 50,
  pacingSpeed: 'moderate',
}

export default function StyleCustomizationPanel({
  onStyleChange,
  initialVoiceProfile,
  initialCustomSettings,
}: StyleCustomizationPanelProps) {
  const [activeTab, setActiveTab] = useState<'profiles' | 'custom' | 'blend'>('profiles')
  const [selectedProfile, setSelectedProfile] = useState<VoiceProfile | null>(
    initialVoiceProfile
      ? VOICE_PROFILES.find((p) => p.id === initialVoiceProfile) || null
      : null
  )
  const [customSettings, setCustomSettings] = useState<CustomStyleSettings>({
    ...DEFAULT_CUSTOM_SETTINGS,
    ...initialCustomSettings,
  })
  const [blendProfiles, setBlendProfiles] = useState<{ profile: VoiceProfile; weight: number }[]>(
    []
  )
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null)
  const [showBlendInfo, setShowBlendInfo] = useState(false)

  // Notify parent of changes
  useEffect(() => {
    if (onStyleChange) {
      onStyleChange({
        voiceProfile: selectedProfile,
        customSettings,
        blendProfiles,
      })
    }
  }, [selectedProfile, customSettings, blendProfiles, onStyleChange])

  const handleProfileSelect = (profile: VoiceProfile) => {
    if (selectedProfile?.id === profile.id) {
      setSelectedProfile(null)
    } else {
      setSelectedProfile(profile)
    }
  }

  const handleAddToBlend = (profile: VoiceProfile) => {
    if (blendProfiles.length >= 3) return
    if (blendProfiles.some((bp) => bp.profile.id === profile.id)) return

    setBlendProfiles([...blendProfiles, { profile, weight: 50 }])
  }

  const handleRemoveFromBlend = (profileId: string) => {
    setBlendProfiles(blendProfiles.filter((bp) => bp.profile.id !== profileId))
  }

  const handleBlendWeightChange = (profileId: string, weight: number) => {
    setBlendProfiles(
      blendProfiles.map((bp) => (bp.profile.id === profileId ? { ...bp, weight } : bp))
    )
  }

  const handleCustomSettingChange = <K extends keyof CustomStyleSettings>(
    key: K,
    value: CustomStyleSettings[K]
  ) => {
    setCustomSettings((prev) => ({ ...prev, [key]: value }))
  }

  const resetCustomSettings = () => {
    setCustomSettings(DEFAULT_CUSTOM_SETTINGS)
  }

  const renderProfileCard = (profile: VoiceProfile) => {
    const isSelected = selectedProfile?.id === profile.id
    const isExpanded = expandedProfile === profile.id
    const isInBlend = blendProfiles.some((bp) => bp.profile.id === profile.id)

    return (
      <div
        key={profile.id}
        className={`border rounded-lg transition-all ${
          isSelected
            ? 'border-aurora-teal bg-aurora-teal/5 shadow-glow-teal'
            : 'border-graphite hover:border-nebula-blue/50'
        }`}
      >
        <div
          className="p-4 cursor-pointer"
          onClick={() => handleProfileSelect(profile)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-mist" />
                <h3 className="font-medium text-cream">{profile.name}</h3>
                {isSelected && <Check className="h-4 w-4 text-aurora-teal" />}
              </div>
              <p className="text-sm text-mist mt-1">{profile.description}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpandedProfile(isExpanded ? null : profile.id)
              }}
              className="p-1 hover:bg-charcoal rounded"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-mist" />
              ) : (
                <ChevronDown className="h-4 w-4 text-mist" />
              )}
            </button>
          </div>

          {isExpanded && (
            <div className="mt-4 pt-4 border-t border-graphite">
              <h4 className="text-sm font-medium text-mist mb-2">Characteristics:</h4>
              <ul className="text-sm text-mist space-y-1">
                {profile.characteristics.map((char, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-1 h-1 bg-aurora-teal rounded-full" />
                    {char}
                  </li>
                ))}
              </ul>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-charcoal rounded p-2">
                  <span className="text-fog">Rhythm:</span>{' '}
                  <span className="font-medium text-cream">{profile.parameters.sentence_rhythm}</span>
                </div>
                <div className="bg-charcoal rounded p-2">
                  <span className="text-fog">Vocabulary:</span>{' '}
                  <span className="font-medium text-cream">{profile.parameters.vocabulary_level}</span>
                </div>
                <div className="bg-charcoal rounded p-2">
                  <span className="text-fog">Emotion:</span>{' '}
                  <span className="font-medium text-cream">{profile.parameters.emotional_intensity}</span>
                </div>
                <div className="bg-charcoal rounded p-2">
                  <span className="text-fog">Imagery:</span>{' '}
                  <span className="font-medium text-cream">{profile.parameters.imagery_density}</span>
                </div>
              </div>

              {activeTab === 'blend' && !isInBlend && blendProfiles.length < 3 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAddToBlend(profile)
                  }}
                  className="mt-4 w-full py-2 text-sm font-medium text-aurora-teal border border-aurora-teal rounded-lg hover:bg-aurora-teal/10"
                >
                  Add to Blend
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderProfilesTab = () => (
    <div className="space-y-4">
      <p className="text-sm text-mist">
        Select a voice profile inspired by famous authors to guide your writing style.
      </p>
      <div className="grid gap-3">
        {VOICE_PROFILES.map(renderProfileCard)}
      </div>
    </div>
  )

  const renderCustomTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-mist">Fine-tune your writing style with custom settings.</p>
        <button
          onClick={resetCustomSettings}
          className="flex items-center gap-1 text-sm text-mist hover:text-cream"
        >
          <RefreshCw className="h-3 w-3" />
          Reset
        </button>
      </div>

      {/* Sentence Length */}
      <div>
        <label className="block text-sm font-medium text-mist mb-2">Sentence Length</label>
        <div className="grid grid-cols-4 gap-2">
          {(['short', 'medium', 'long', 'varied'] as const).map((option) => (
            <button
              key={option}
              onClick={() => handleCustomSettingChange('sentenceLength', option)}
              className={`py-2 px-3 text-sm rounded-lg border transition-colors capitalize ${
                customSettings.sentenceLength === option
                  ? 'border-aurora-teal bg-aurora-teal/10 text-aurora-teal'
                  : 'border-graphite hover:border-nebula-blue/50 text-mist'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Vocabulary Complexity */}
      <div>
        <label className="block text-sm font-medium text-mist mb-2">Vocabulary Complexity</label>
        <div className="grid grid-cols-3 gap-2">
          {(['simple', 'moderate', 'complex'] as const).map((option) => (
            <button
              key={option}
              onClick={() => handleCustomSettingChange('vocabularyComplexity', option)}
              className={`py-2 px-3 text-sm rounded-lg border transition-colors capitalize ${
                customSettings.vocabularyComplexity === option
                  ? 'border-aurora-teal bg-aurora-teal/10 text-aurora-teal'
                  : 'border-graphite hover:border-nebula-blue/50 text-mist'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Emotional Depth */}
      <div>
        <label className="block text-sm font-medium text-mist mb-2">Emotional Depth</label>
        <div className="grid grid-cols-3 gap-2">
          {(['surface', 'moderate', 'deep'] as const).map((option) => (
            <button
              key={option}
              onClick={() => handleCustomSettingChange('emotionalDepth', option)}
              className={`py-2 px-3 text-sm rounded-lg border transition-colors capitalize ${
                customSettings.emotionalDepth === option
                  ? 'border-aurora-teal bg-aurora-teal/10 text-aurora-teal'
                  : 'border-graphite hover:border-nebula-blue/50 text-mist'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Description Level */}
      <div>
        <label className="block text-sm font-medium text-mist mb-2">Description Level</label>
        <div className="grid grid-cols-3 gap-2">
          {(['minimal', 'balanced', 'rich'] as const).map((option) => (
            <button
              key={option}
              onClick={() => handleCustomSettingChange('descriptionLevel', option)}
              className={`py-2 px-3 text-sm rounded-lg border transition-colors capitalize ${
                customSettings.descriptionLevel === option
                  ? 'border-aurora-teal bg-aurora-teal/10 text-aurora-teal'
                  : 'border-graphite hover:border-nebula-blue/50 text-mist'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Dialogue Ratio Slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-mist">Dialogue vs. Narrative</label>
          <span className="text-sm text-mist">{customSettings.dialogueRatio}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={customSettings.dialogueRatio}
          onChange={(e) =>
            handleCustomSettingChange('dialogueRatio', parseInt(e.target.value))
          }
          className="w-full h-2 bg-graphite rounded-lg appearance-none cursor-pointer accent-aurora-teal"
        />
        <div className="flex justify-between text-xs text-fog mt-1">
          <span>More Narrative</span>
          <span>More Dialogue</span>
        </div>
      </div>

      {/* Pacing Speed */}
      <div>
        <label className="block text-sm font-medium text-mist mb-2">Pacing Speed</label>
        <div className="grid grid-cols-3 gap-2">
          {(['slow', 'moderate', 'fast'] as const).map((option) => (
            <button
              key={option}
              onClick={() => handleCustomSettingChange('pacingSpeed', option)}
              className={`py-2 px-3 text-sm rounded-lg border transition-colors capitalize ${
                customSettings.pacingSpeed === option
                  ? 'border-aurora-teal bg-aurora-teal/10 text-aurora-teal'
                  : 'border-graphite hover:border-nebula-blue/50 text-mist'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const renderBlendTab = () => (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <p className="text-sm text-mist">
          Blend up to 3 voice profiles to create a unique style combination.
        </p>
        <button
          onClick={() => setShowBlendInfo(!showBlendInfo)}
          className="p-1 hover:bg-charcoal rounded"
        >
          <Info className="h-4 w-4 text-mist" />
        </button>
      </div>

      {showBlendInfo && (
        <div className="bg-ember/10 border border-ember/30 rounded-lg p-4 text-sm text-ember">
          Blending combines characteristics from multiple authors. Adjust the weight of each
          profile to control how much influence it has on the final style.
        </div>
      )}

      {/* Selected Blend Profiles */}
      {blendProfiles.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-cream">Your Blend</h3>
          {blendProfiles.map(({ profile, weight }) => (
            <div
              key={profile.id}
              className="border border-aurora-teal/30 bg-aurora-teal/5 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-aurora-teal" />
                  <span className="font-medium text-cream">{profile.name}</span>
                </div>
                <button
                  onClick={() => handleRemoveFromBlend(profile.id)}
                  className="p-1 hover:bg-charcoal rounded text-mist hover:text-cream"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-mist w-16">{weight}%</span>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={weight}
                  onChange={(e) =>
                    handleBlendWeightChange(profile.id, parseInt(e.target.value))
                  }
                  className="flex-1 h-2 bg-graphite rounded-lg appearance-none cursor-pointer accent-aurora-teal"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {blendProfiles.length < 3 && (
        <div>
          <h3 className="text-sm font-medium text-cream mb-3">
            Add profiles ({3 - blendProfiles.length} remaining)
          </h3>
          <div className="grid gap-3">
            {VOICE_PROFILES.filter(
              (p) => !blendProfiles.some((bp) => bp.profile.id === p.id)
            ).map(renderProfileCard)}
          </div>
        </div>
      )}

      {blendProfiles.length === 0 && (
        <div className="text-center py-8 text-mist">
          <Sparkles className="h-8 w-8 mx-auto mb-2 text-graphite" />
          <p>Select profiles from below to start blending</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="bg-charcoal-light rounded-xl border border-graphite">
      {/* Header */}
      <div className="p-4 border-b border-graphite">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-aurora-teal" />
          <h2 className="text-lg font-medium text-cream">Style Customization</h2>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-graphite">
        <button
          onClick={() => setActiveTab('profiles')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'profiles'
              ? 'text-aurora-teal border-b-2 border-aurora-teal'
              : 'text-mist hover:text-cream'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <User className="h-4 w-4" />
            Voice Profiles
          </div>
        </button>
        <button
          onClick={() => setActiveTab('custom')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'custom'
              ? 'text-aurora-teal border-b-2 border-aurora-teal'
              : 'text-mist hover:text-cream'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Sliders className="h-4 w-4" />
            Custom Settings
          </div>
        </button>
        <button
          onClick={() => setActiveTab('blend')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'blend'
              ? 'text-aurora-teal border-b-2 border-aurora-teal'
              : 'text-mist hover:text-cream'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4" />
            Blend
          </div>
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-[600px] overflow-y-auto">
        {activeTab === 'profiles' && renderProfilesTab()}
        {activeTab === 'custom' && renderCustomTab()}
        {activeTab === 'blend' && renderBlendTab()}
      </div>

      {/* Summary Footer */}
      {(selectedProfile || blendProfiles.length > 0) && (
        <div className="p-4 border-t border-graphite bg-charcoal">
          <div className="text-sm">
            <span className="text-mist">Current Style: </span>
            <span className="font-medium text-cream">
              {blendProfiles.length > 0
                ? `Blend: ${blendProfiles.map((bp) => bp.profile.name).join(' + ')}`
                : selectedProfile?.name || 'None selected'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
