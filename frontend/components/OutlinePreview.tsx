"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Clock, BookOpen, Users, ArrowLeft } from "lucide-react";

// Types
interface ChapterData {
  number: number;
  title: string;
  summary: string;
  setting?: string;
  emotional_arc?: string;
  estimated_word_count?: number;
  characters_involved?: string[];
  key_events?: string[];
}

interface OutlinePreviewProps {
  projectId: string;
  title: string;
  chapters: ChapterData[];
  characters?: string[];
  onBack?: () => void;
}

// Reading time calculation: average 250 words per minute
const WORDS_PER_MINUTE = 250;

function formatReadingTime(totalWords: number): string {
  const minutes = Math.round(totalWords / WORDS_PER_MINUTE);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${remainingMinutes} min`;
}

// Highlight character names in text using safe string matching (no dynamic RegExp)
function highlightCharacters(text: string, characters: string[]): React.ReactNode {
  if (!characters.length) return text;

  // Create a set of lowercase character names for fast lookup
  const characterSet = new Set(characters.map(c => c.toLowerCase()));

  // Split text into words while preserving whitespace and punctuation
  const result: React.ReactNode[] = [];
  let currentWord = '';
  let currentNonWord = '';
  let keyIndex = 0;

  for (let i = 0; i <= text.length; i++) {
    const char = text[i];
    const isWordChar = char && /\w/.test(char);

    if (isWordChar) {
      // If we have accumulated non-word characters, push them first
      if (currentNonWord) {
        result.push(currentNonWord);
        currentNonWord = '';
      }
      currentWord += char;
    } else {
      // If we have accumulated a word, check if it's a character name
      if (currentWord) {
        if (characterSet.has(currentWord.toLowerCase())) {
          result.push(
            <span
              key={keyIndex++}
              className="bg-nebula-blue/20 text-nebula-blue px-1 rounded font-medium"
              data-testid="character-highlight"
            >
              {currentWord}
            </span>
          );
        } else {
          result.push(currentWord);
        }
        currentWord = '';
      }
      if (char) {
        currentNonWord += char;
      }
    }
  }

  // Push any remaining non-word characters
  if (currentNonWord) {
    result.push(currentNonWord);
  }

  return result.length > 0 ? result : text;
}

// Chapter Preview Card Component
function ChapterPreviewCard({
  chapter,
  characters,
  isExpanded,
  onToggle
}: {
  chapter: ChapterData;
  characters: string[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const readingTime = chapter.estimated_word_count
    ? formatReadingTime(chapter.estimated_word_count)
    : null;

  return (
    <div className="border border-graphite rounded-lg overflow-hidden bg-charcoal-light" data-testid={`chapter-preview-${chapter.number}`}>
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between bg-charcoal hover:bg-charcoal-light transition-colors text-left"
        aria-expanded={isExpanded}
        data-testid={`chapter-toggle-${chapter.number}`}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-fog" data-testid="chevron-down" />
          ) : (
            <ChevronRight className="w-5 h-5 text-fog" data-testid="chevron-right" />
          )}
          <span className="text-sm font-medium text-fog">Chapter {chapter.number}</span>
          <span className="font-semibold text-cream">{chapter.title}</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-fog">
          {chapter.emotional_arc && (
            <span className="capitalize">{chapter.emotional_arc.replace('_', ' ')}</span>
          )}
          {readingTime && (
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {readingTime}
            </span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 py-4 space-y-4 bg-charcoal-light" data-testid={`chapter-content-${chapter.number}`}>
          {/* Summary */}
          <div>
            <h4 className="text-sm font-medium text-fog mb-1">Summary</h4>
            <p className="text-mist">{highlightCharacters(chapter.summary, characters)}</p>
          </div>

          {/* Setting */}
          {chapter.setting && (
            <div>
              <h4 className="text-sm font-medium text-fog mb-1">Setting</h4>
              <p className="text-mist">{chapter.setting}</p>
            </div>
          )}

          {/* Characters Involved */}
          {chapter.characters_involved && chapter.characters_involved.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-fog mb-1">Characters</h4>
              <div className="flex flex-wrap gap-2">
                {chapter.characters_involved.map((char, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-nebula-blue/10 text-nebula-blue rounded-full text-sm"
                  >
                    {char}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Key Events */}
          {chapter.key_events && chapter.key_events.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-fog mb-1">Key Events</h4>
              <ul className="list-disc list-inside text-mist space-y-1">
                {chapter.key_events.map((event, idx) => (
                  <li key={idx}>{highlightCharacters(event, characters)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Word count */}
          {chapter.estimated_word_count && (
            <div className="text-sm text-fog">
              Estimated: {chapter.estimated_word_count.toLocaleString()} words
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Main Outline Preview Component
export default function OutlinePreview({
  projectId,
  title,
  chapters,
  characters = [],
  onBack
}: OutlinePreviewProps) {
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const [isAllExpanded, setIsAllExpanded] = useState(false);

  // Calculate totals
  const stats = useMemo(() => {
    const totalWords = chapters.reduce((sum, ch) => sum + (ch.estimated_word_count || 0), 0);
    const totalReadingTime = formatReadingTime(totalWords);

    // Extract all unique characters from chapters
    const allCharacters = new Set<string>(characters);
    chapters.forEach(ch => {
      ch.characters_involved?.forEach(c => allCharacters.add(c));
    });

    return {
      chapterCount: chapters.length,
      totalWords,
      totalReadingTime,
      uniqueCharacters: Array.from(allCharacters),
    };
  }, [chapters, characters]);

  const toggleChapter = (chapterNumber: number) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapterNumber)) {
        next.delete(chapterNumber);
      } else {
        next.add(chapterNumber);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (isAllExpanded) {
      setExpandedChapters(new Set());
    } else {
      setExpandedChapters(new Set(chapters.map(ch => ch.number)));
    }
    setIsAllExpanded(!isAllExpanded);
  };

  return (
    <div className="min-h-screen bg-charcoal">
      {/* Header */}
      <div className="bg-charcoal-light border-b border-graphite sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {onBack ? (
                <button
                  onClick={onBack}
                  className="flex items-center gap-2 text-mist hover:text-cream transition-colors"
                  data-testid="back-button"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Back
                </button>
              ) : (
                <Link
                  href={`/projects/${projectId}/outline`}
                  className="flex items-center gap-2 text-mist hover:text-cream transition-colors"
                  data-testid="back-link"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Back to Editor
                </Link>
              )}
            </div>
            <h1 className="text-xl font-bold text-cream">{title}</h1>
            <button
              onClick={toggleAll}
              className="text-sm text-aurora-teal hover:text-aurora-teal/80 transition-colors"
              data-testid="toggle-all-button"
            >
              {isAllExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-charcoal-light border-b border-graphite">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-around text-sm">
            <div className="flex items-center gap-2 text-mist" data-testid="chapter-count">
              <BookOpen className="w-4 h-4" />
              <span>{stats.chapterCount} Chapters</span>
            </div>
            <div className="flex items-center gap-2 text-mist" data-testid="word-count">
              <span>{stats.totalWords.toLocaleString()} Words</span>
            </div>
            <div className="flex items-center gap-2 text-mist" data-testid="reading-time">
              <Clock className="w-4 h-4" />
              <span>{stats.totalReadingTime} reading time</span>
            </div>
            <div className="flex items-center gap-2 text-mist" data-testid="character-count">
              <Users className="w-4 h-4" />
              <span>{stats.uniqueCharacters.length} Characters</span>
            </div>
          </div>
        </div>
      </div>

      {/* Character Legend (if characters provided) */}
      {stats.uniqueCharacters.length > 0 && (
        <div className="bg-charcoal-light border-b border-graphite">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-fog">Characters:</span>
              {stats.uniqueCharacters.map((char, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-nebula-blue/20 text-nebula-blue rounded-full text-sm font-medium"
                  data-testid={`character-legend-${char}`}
                >
                  {char}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chapter List */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="space-y-3" data-testid="chapter-list">
          {chapters.map((chapter) => (
            <ChapterPreviewCard
              key={chapter.number}
              chapter={chapter}
              characters={stats.uniqueCharacters}
              isExpanded={expandedChapters.has(chapter.number)}
              onToggle={() => toggleChapter(chapter.number)}
            />
          ))}
        </div>

        {chapters.length === 0 && (
          <div className="text-center py-12 text-fog" data-testid="empty-state">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-graphite" />
            <p>No chapters in this outline yet.</p>
            <Link
              href={`/projects/${projectId}/outline`}
              className="text-aurora-teal hover:text-aurora-teal/80 mt-2 inline-block"
            >
              Go to Outline Editor
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// Named export for testing
export { formatReadingTime, highlightCharacters };
