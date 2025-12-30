"""
Multi-pass editing service for chapter revision.

Provides a structured approach to editing with four distinct passes:
1. Structural editing - Pacing, plot holes, character consistency
2. Line editing - Prose quality, sentence flow, word choice
3. Copy editing - Grammar, punctuation, style guide adherence
4. Proofreading - Typos, formatting, final polish
"""

import re
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class EditPassType(str, Enum):
    """Types of editing passes."""

    STRUCTURAL = "structural"
    LINE = "line"
    COPY = "copy"
    PROOFREAD = "proofread"


class SuggestionSeverity(str, Enum):
    """Severity levels for suggestions."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class SuggestionType(str, Enum):
    """Types of edit suggestions."""

    # Structural
    PACING = "pacing"
    PLOT_HOLE = "plot_hole"
    CHARACTER_CONSISTENCY = "character_consistency"
    SCENE_STRUCTURE = "scene_structure"
    TENSION = "tension"

    # Line editing
    PROSE_QUALITY = "prose_quality"
    SENTENCE_FLOW = "sentence_flow"
    WORD_CHOICE = "word_choice"
    SHOW_DONT_TELL = "show_dont_tell"
    DIALOGUE = "dialogue"

    # Copy editing
    GRAMMAR = "grammar"
    PUNCTUATION = "punctuation"
    STYLE_GUIDE = "style_guide"
    CONSISTENCY = "consistency"

    # Proofreading
    SPELLING = "spelling"
    TYPO = "typo"
    FORMATTING = "formatting"


@dataclass
class EditSuggestion:
    """A single edit suggestion."""

    id: str
    pass_type: EditPassType
    suggestion_type: SuggestionType
    severity: SuggestionSeverity
    original_text: str
    suggested_text: str
    start_position: int
    end_position: int
    explanation: str
    confidence: float
    applied: bool = False
    rejected: bool = False

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "pass_type": self.pass_type.value,
            "suggestion_type": self.suggestion_type.value,
            "severity": self.severity.value,
            "original_text": self.original_text,
            "suggested_text": self.suggested_text,
            "start_position": self.start_position,
            "end_position": self.end_position,
            "explanation": self.explanation,
            "confidence": self.confidence,
            "applied": self.applied,
            "rejected": self.rejected,
        }


@dataclass
class EditPass:
    """Result of a single editing pass."""

    pass_type: EditPassType
    suggestions: list[EditSuggestion] = field(default_factory=list)
    completed: bool = False
    error: Optional[str] = None

    @property
    def suggestion_count(self) -> int:
        """Get total number of suggestions."""
        return len(self.suggestions)

    @property
    def applied_count(self) -> int:
        """Get number of applied suggestions."""
        return sum(1 for s in self.suggestions if s.applied)

    @property
    def rejected_count(self) -> int:
        """Get number of rejected suggestions."""
        return sum(1 for s in self.suggestions if s.rejected)


@dataclass
class EditSession:
    """Tracks all editing passes for a chapter."""

    chapter_number: int
    passes: dict[EditPassType, EditPass] = field(default_factory=dict)
    original_content: str = ""
    current_content: str = ""

    def get_pass(self, pass_type: EditPassType) -> Optional[EditPass]:
        """Get a specific editing pass."""
        return self.passes.get(pass_type)

    def add_pass(self, pass_type: EditPassType) -> EditPass:
        """Add a new editing pass."""
        edit_pass = EditPass(pass_type=pass_type)
        self.passes[pass_type] = edit_pass
        return edit_pass

    @property
    def total_suggestions(self) -> int:
        """Get total suggestions across all passes."""
        return sum(p.suggestion_count for p in self.passes.values())

    @property
    def total_applied(self) -> int:
        """Get total applied suggestions across all passes."""
        return sum(p.applied_count for p in self.passes.values())


class StructuralAnalyzer:
    """Analyzes structural issues in text."""

    # Scene transition markers
    SCENE_BREAK_PATTERNS = [
        r"\n\n\*\*\*\n\n",
        r"\n\n---\n\n",
        r"\n\n#\n\n",
    ]

    # Pacing indicators
    FAST_PACING_WORDS = {"suddenly", "immediately", "instantly", "rushed", "raced"}
    SLOW_PACING_WORDS = {"slowly", "gradually", "eventually", "finally", "meanwhile"}

    def analyze_pacing(self, content: str) -> list[dict]:
        """Analyze pacing issues in the text."""
        issues = []
        paragraphs = content.split("\n\n")

        # Check for very long paragraphs that might slow pacing
        for i, para in enumerate(paragraphs):
            word_count = len(para.split())
            if word_count > 200:
                issues.append(
                    {
                        "type": "pacing",
                        "issue": "long_paragraph",
                        "location": i,
                        "word_count": word_count,
                        "suggestion": "Consider breaking this long paragraph into smaller chunks.",
                    }
                )

        # Check for pacing word distribution
        fast_count = sum(1 for word in self.FAST_PACING_WORDS if word in content.lower())
        slow_count = sum(1 for word in self.SLOW_PACING_WORDS if word in content.lower())

        if fast_count > slow_count * 3:
            issues.append(
                {
                    "type": "pacing",
                    "issue": "too_fast",
                    "suggestion": "The pacing may be too fast. Consider adding moments of reflection.",
                }
            )
        elif slow_count > fast_count * 3:
            issues.append(
                {
                    "type": "pacing",
                    "issue": "too_slow",
                    "suggestion": "The pacing may be too slow. Consider tightening scenes.",
                }
            )

        return issues

    def analyze_scene_structure(self, content: str) -> list[dict]:
        """Analyze scene structure."""
        issues = []
        scenes = re.split(r"\n\n\*\*\*\n\n|\n\n---\n\n", content)

        for i, scene in enumerate(scenes):
            word_count = len(scene.split())

            # Very short scenes
            if word_count < 100:
                issues.append(
                    {
                        "type": "scene_structure",
                        "issue": "short_scene",
                        "scene_number": i + 1,
                        "word_count": word_count,
                        "suggestion": "This scene is very short. Consider expanding or merging with another scene.",
                    }
                )

            # Check for scene goal/conflict
            if not any(
                word in scene.lower() for word in ["want", "need", "must", "but", "however"]
            ):
                issues.append(
                    {
                        "type": "scene_structure",
                        "issue": "unclear_conflict",
                        "scene_number": i + 1,
                        "suggestion": "The scene goal or conflict may not be clear.",
                    }
                )

        return issues


class LineEditor:
    """Analyzes line-level prose quality."""

    # Weak verbs to flag
    WEAK_VERBS = {"was", "were", "is", "are", "had", "have", "has", "been", "being"}

    # Filter/weasel words
    FILTER_WORDS = {
        "very",
        "really",
        "quite",
        "rather",
        "somewhat",
        "just",
        "actually",
        "basically",
        "literally",
        "definitely",
        "absolutely",
    }

    # Adverbs ending in -ly to flag
    ADVERB_PATTERN = re.compile(r"\b\w+ly\b")

    def analyze_weak_verbs(self, content: str) -> list[dict]:
        """Find weak verb usage."""
        issues = []
        sentences = re.split(r"[.!?]+", content)

        for i, sentence in enumerate(sentences):
            words = sentence.lower().split()
            weak_count = sum(1 for word in words if word in self.WEAK_VERBS)

            if weak_count >= 2 and len(words) > 5:
                issues.append(
                    {
                        "type": "prose_quality",
                        "issue": "weak_verbs",
                        "sentence_number": i + 1,
                        "text": sentence.strip()[:100],
                        "suggestion": "Consider using stronger, more active verbs.",
                    }
                )

        return issues

    def analyze_filter_words(self, content: str) -> list[dict]:
        """Find filter word overuse."""
        issues = []
        word_count = len(content.split())

        for word in self.FILTER_WORDS:
            count = len(re.findall(rf"\b{word}\b", content.lower()))
            if count > word_count / 500:  # More than 0.2% occurrence
                issues.append(
                    {
                        "type": "word_choice",
                        "issue": "filter_word_overuse",
                        "word": word,
                        "count": count,
                        "suggestion": f"Consider reducing use of '{word}' ({count} occurrences).",
                    }
                )

        return issues

    def analyze_adverbs(self, content: str) -> list[dict]:
        """Find excessive adverb usage."""
        issues = []
        adverbs = self.ADVERB_PATTERN.findall(content.lower())

        # Filter out common non-adverbs ending in -ly
        exceptions = {"only", "family", "early", "likely", "lonely", "friendly", "ugly"}
        adverbs = [a for a in adverbs if a not in exceptions]

        word_count = len(content.split())
        adverb_ratio = len(adverbs) / word_count if word_count > 0 else 0

        if adverb_ratio > 0.03:  # More than 3% adverbs
            issues.append(
                {
                    "type": "prose_quality",
                    "issue": "adverb_overuse",
                    "count": len(adverbs),
                    "ratio": f"{adverb_ratio:.1%}",
                    "suggestion": "Consider replacing some adverbs with stronger verbs.",
                }
            )

        return issues

    def analyze_sentence_variety(self, content: str) -> list[dict]:
        """Check for sentence variety."""
        issues = []
        sentences = re.split(r"[.!?]+", content)
        sentences = [s.strip() for s in sentences if s.strip()]

        if len(sentences) < 3:
            return issues

        # Check for same starting words
        starts = [s.split()[0].lower() if s.split() else "" for s in sentences]
        start_counts = {}
        for start in starts:
            start_counts[start] = start_counts.get(start, 0) + 1

        for start, count in start_counts.items():
            if count >= 3 and count / len(sentences) > 0.2:
                issues.append(
                    {
                        "type": "sentence_flow",
                        "issue": "repetitive_starts",
                        "word": start,
                        "count": count,
                        "suggestion": f"Many sentences start with '{start}'. Consider varying sentence openings.",
                    }
                )

        # Check for sentence length variety
        lengths = [len(s.split()) for s in sentences if s]
        if lengths:
            avg_length = sum(lengths) / len(lengths)
            variance = sum((length - avg_length) ** 2 for length in lengths) / len(lengths)

            if variance < 10:  # Low variance = similar length sentences
                issues.append(
                    {
                        "type": "sentence_flow",
                        "issue": "uniform_length",
                        "avg_length": avg_length,
                        "suggestion": "Sentences are similar in length. Consider varying sentence length for rhythm.",
                    }
                )

        return issues


class CopyEditor:
    """Analyzes grammar and style issues."""

    # Common grammar patterns
    PASSIVE_VOICE_PATTERN = re.compile(r"\b(was|were|is|are|been|being)\s+\w+ed\b", re.IGNORECASE)

    # Repeated word pattern
    REPEATED_WORD_PATTERN = re.compile(r"\b(\w+)\s+\1\b", re.IGNORECASE)

    # Common errors
    COMMON_ERRORS = {
        "its vs it's": (r"\bits\s+(going|been|not|got)\b", "it's"),
        "your vs you're": (r"\byour\s+(going|not|the|my)\b", "you're"),
        "their vs they're": (r"\btheir\s+(going|not|the|my)\b", "they're"),
        "then vs than": (r"\bbetter\s+then\b", "than"),
    }

    def analyze_passive_voice(self, content: str) -> list[dict]:
        """Find passive voice usage."""
        issues = []
        matches = self.PASSIVE_VOICE_PATTERN.finditer(content)

        for match in matches:
            issues.append(
                {
                    "type": "grammar",
                    "issue": "passive_voice",
                    "text": match.group(),
                    "position": match.start(),
                    "suggestion": "Consider rewriting in active voice.",
                }
            )

        return issues

    def analyze_repeated_words(self, content: str) -> list[dict]:
        """Find immediately repeated words."""
        issues = []
        matches = self.REPEATED_WORD_PATTERN.finditer(content)

        for match in matches:
            # Skip intentional repetitions
            if match.group(1).lower() in {"very", "so", "that", "the", "a", "an", "had"}:
                continue

            issues.append(
                {
                    "type": "grammar",
                    "issue": "repeated_word",
                    "word": match.group(1),
                    "position": match.start(),
                    "suggestion": f"Remove repeated word: '{match.group(1)}'",
                }
            )

        return issues

    def analyze_common_errors(self, content: str) -> list[dict]:
        """Check for common grammatical errors."""
        issues = []

        for error_name, (pattern, correct) in self.COMMON_ERRORS.items():
            matches = re.finditer(pattern, content, re.IGNORECASE)
            for match in matches:
                issues.append(
                    {
                        "type": "grammar",
                        "issue": "common_error",
                        "error_type": error_name,
                        "text": match.group(),
                        "position": match.start(),
                        "suggestion": f"Should be '{correct}'",
                    }
                )

        return issues


class Proofreader:
    """Final proofreading checks."""

    # Common typos
    COMMON_TYPOS = {
        "teh": "the",
        "adn": "and",
        "hte": "the",
        "wiht": "with",
        "taht": "that",
        "recieve": "receive",
        "beleive": "believe",
        "occured": "occurred",
        "seperate": "separate",
        "definately": "definitely",
    }

    # Quote consistency patterns
    QUOTE_PATTERNS = {
        "smart_quotes": re.compile(r"[\u201c\u201d]"),  # Curly/smart quotes
        "straight_quotes": re.compile(r'"'),
    }

    def check_typos(self, content: str) -> list[dict]:
        """Check for common typos."""
        issues = []
        words = re.findall(r"\b\w+\b", content.lower())

        for word in words:
            if word in self.COMMON_TYPOS:
                issues.append(
                    {
                        "type": "spelling",
                        "issue": "common_typo",
                        "word": word,
                        "correction": self.COMMON_TYPOS[word],
                        "suggestion": f"Typo: '{word}' should be '{self.COMMON_TYPOS[word]}'",
                    }
                )

        return issues

    def check_quote_consistency(self, content: str) -> list[dict]:
        """Check for consistent quote usage."""
        issues = []
        smart_count = len(self.QUOTE_PATTERNS["smart_quotes"].findall(content))
        straight_count = len(self.QUOTE_PATTERNS["straight_quotes"].findall(content))

        if smart_count > 0 and straight_count > 0:
            issues.append(
                {
                    "type": "formatting",
                    "issue": "inconsistent_quotes",
                    "smart_count": smart_count,
                    "straight_count": straight_count,
                    "suggestion": "Mix of smart and straight quotes. Use one style consistently.",
                }
            )

        return issues

    def check_spacing(self, content: str) -> list[dict]:
        """Check for spacing issues."""
        issues = []

        # Double spaces
        double_spaces = len(re.findall(r"  +", content))
        if double_spaces > 0:
            issues.append(
                {
                    "type": "formatting",
                    "issue": "double_spaces",
                    "count": double_spaces,
                    "suggestion": f"Found {double_spaces} instances of multiple spaces.",
                }
            )

        # Missing space after punctuation
        missing_spaces = len(re.findall(r"[.!?,;:][A-Z]", content))
        if missing_spaces > 0:
            issues.append(
                {
                    "type": "formatting",
                    "issue": "missing_space_after_punctuation",
                    "count": missing_spaces,
                    "suggestion": f"Found {missing_spaces} instances of missing space after punctuation.",
                }
            )

        return issues


class MultiPassEditingService:
    """Orchestrates the multi-pass editing workflow."""

    def __init__(self):
        self.structural_analyzer = StructuralAnalyzer()
        self.line_editor = LineEditor()
        self.copy_editor = CopyEditor()
        self.proofreader = Proofreader()

    def create_session(self, chapter_number: int, content: str) -> EditSession:
        """Create a new editing session."""
        return EditSession(
            chapter_number=chapter_number,
            original_content=content,
            current_content=content,
        )

    def run_structural_pass(self, session: EditSession) -> EditPass:
        """Run structural editing pass."""
        edit_pass = session.add_pass(EditPassType.STRUCTURAL)
        content = session.current_content

        # Analyze pacing
        pacing_issues = self.structural_analyzer.analyze_pacing(content)
        for issue in pacing_issues:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.STRUCTURAL,
                suggestion_type=SuggestionType.PACING,
                severity=SuggestionSeverity.WARNING,
                original_text="",
                suggested_text="",
                start_position=0,
                end_position=0,
                explanation=issue.get("suggestion", ""),
                confidence=0.7,
            )
            edit_pass.suggestions.append(suggestion)

        # Analyze scene structure
        structure_issues = self.structural_analyzer.analyze_scene_structure(content)
        for issue in structure_issues:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.STRUCTURAL,
                suggestion_type=SuggestionType.SCENE_STRUCTURE,
                severity=SuggestionSeverity.INFO,
                original_text="",
                suggested_text="",
                start_position=0,
                end_position=0,
                explanation=issue.get("suggestion", ""),
                confidence=0.6,
            )
            edit_pass.suggestions.append(suggestion)

        edit_pass.completed = True
        return edit_pass

    def run_line_editing_pass(self, session: EditSession) -> EditPass:
        """Run line editing pass."""
        edit_pass = session.add_pass(EditPassType.LINE)
        content = session.current_content

        # Analyze weak verbs
        weak_verbs = self.line_editor.analyze_weak_verbs(content)
        for issue in weak_verbs:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.LINE,
                suggestion_type=SuggestionType.PROSE_QUALITY,
                severity=SuggestionSeverity.INFO,
                original_text=issue.get("text", "")[:100],
                suggested_text="",
                start_position=0,
                end_position=0,
                explanation=issue.get("suggestion", ""),
                confidence=0.6,
            )
            edit_pass.suggestions.append(suggestion)

        # Analyze filter words
        filter_words = self.line_editor.analyze_filter_words(content)
        for issue in filter_words:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.LINE,
                suggestion_type=SuggestionType.WORD_CHOICE,
                severity=SuggestionSeverity.WARNING,
                original_text=issue.get("word", ""),
                suggested_text="",
                start_position=0,
                end_position=0,
                explanation=issue.get("suggestion", ""),
                confidence=0.8,
            )
            edit_pass.suggestions.append(suggestion)

        # Analyze adverbs
        adverbs = self.line_editor.analyze_adverbs(content)
        for issue in adverbs:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.LINE,
                suggestion_type=SuggestionType.PROSE_QUALITY,
                severity=SuggestionSeverity.INFO,
                original_text="",
                suggested_text="",
                start_position=0,
                end_position=0,
                explanation=issue.get("suggestion", ""),
                confidence=0.7,
            )
            edit_pass.suggestions.append(suggestion)

        # Analyze sentence variety
        variety = self.line_editor.analyze_sentence_variety(content)
        for issue in variety:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.LINE,
                suggestion_type=SuggestionType.SENTENCE_FLOW,
                severity=SuggestionSeverity.INFO,
                original_text="",
                suggested_text="",
                start_position=0,
                end_position=0,
                explanation=issue.get("suggestion", ""),
                confidence=0.6,
            )
            edit_pass.suggestions.append(suggestion)

        edit_pass.completed = True
        return edit_pass

    def run_copy_editing_pass(self, session: EditSession) -> EditPass:
        """Run copy editing pass."""
        edit_pass = session.add_pass(EditPassType.COPY)
        content = session.current_content

        # Analyze passive voice
        passive = self.copy_editor.analyze_passive_voice(content)
        for issue in passive:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.COPY,
                suggestion_type=SuggestionType.GRAMMAR,
                severity=SuggestionSeverity.INFO,
                original_text=issue.get("text", ""),
                suggested_text="",
                start_position=issue.get("position", 0),
                end_position=issue.get("position", 0) + len(issue.get("text", "")),
                explanation=issue.get("suggestion", ""),
                confidence=0.7,
            )
            edit_pass.suggestions.append(suggestion)

        # Analyze repeated words
        repeated = self.copy_editor.analyze_repeated_words(content)
        for issue in repeated:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.COPY,
                suggestion_type=SuggestionType.GRAMMAR,
                severity=SuggestionSeverity.WARNING,
                original_text=f"{issue.get('word', '')} {issue.get('word', '')}",
                suggested_text=issue.get("word", ""),
                start_position=issue.get("position", 0),
                end_position=issue.get("position", 0) + len(issue.get("word", "")) * 2 + 1,
                explanation=issue.get("suggestion", ""),
                confidence=0.9,
            )
            edit_pass.suggestions.append(suggestion)

        # Analyze common errors
        errors = self.copy_editor.analyze_common_errors(content)
        for issue in errors:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.COPY,
                suggestion_type=SuggestionType.GRAMMAR,
                severity=SuggestionSeverity.ERROR,
                original_text=issue.get("text", ""),
                suggested_text="",
                start_position=issue.get("position", 0),
                end_position=issue.get("position", 0) + len(issue.get("text", "")),
                explanation=issue.get("suggestion", ""),
                confidence=0.95,
            )
            edit_pass.suggestions.append(suggestion)

        edit_pass.completed = True
        return edit_pass

    def run_proofreading_pass(self, session: EditSession) -> EditPass:
        """Run proofreading pass."""
        edit_pass = session.add_pass(EditPassType.PROOFREAD)
        content = session.current_content

        # Check typos
        typos = self.proofreader.check_typos(content)
        for issue in typos:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.PROOFREAD,
                suggestion_type=SuggestionType.SPELLING,
                severity=SuggestionSeverity.ERROR,
                original_text=issue.get("word", ""),
                suggested_text=issue.get("correction", ""),
                start_position=0,
                end_position=0,
                explanation=issue.get("suggestion", ""),
                confidence=0.99,
            )
            edit_pass.suggestions.append(suggestion)

        # Check quote consistency
        quotes = self.proofreader.check_quote_consistency(content)
        for issue in quotes:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.PROOFREAD,
                suggestion_type=SuggestionType.FORMATTING,
                severity=SuggestionSeverity.WARNING,
                original_text="",
                suggested_text="",
                start_position=0,
                end_position=0,
                explanation=issue.get("suggestion", ""),
                confidence=0.9,
            )
            edit_pass.suggestions.append(suggestion)

        # Check spacing
        spacing = self.proofreader.check_spacing(content)
        for issue in spacing:
            suggestion = EditSuggestion(
                id=str(uuid.uuid4()),
                pass_type=EditPassType.PROOFREAD,
                suggestion_type=SuggestionType.FORMATTING,
                severity=SuggestionSeverity.WARNING,
                original_text="",
                suggested_text="",
                start_position=0,
                end_position=0,
                explanation=issue.get("suggestion", ""),
                confidence=0.95,
            )
            edit_pass.suggestions.append(suggestion)

        edit_pass.completed = True
        return edit_pass

    def run_all_passes(self, session: EditSession) -> list[EditPass]:
        """Run all editing passes in sequence."""
        passes = []

        passes.append(self.run_structural_pass(session))
        passes.append(self.run_line_editing_pass(session))
        passes.append(self.run_copy_editing_pass(session))
        passes.append(self.run_proofreading_pass(session))

        return passes

    def apply_suggestion(self, session: EditSession, suggestion_id: str) -> tuple[bool, str]:
        """Apply a specific suggestion to the content."""
        for edit_pass in session.passes.values():
            for suggestion in edit_pass.suggestions:
                if suggestion.id == suggestion_id:
                    if suggestion.applied:
                        return False, "Suggestion already applied"
                    if suggestion.rejected:
                        return False, "Suggestion was rejected"

                    if suggestion.suggested_text and suggestion.original_text:
                        # Apply text replacement
                        session.current_content = session.current_content.replace(
                            suggestion.original_text,
                            suggestion.suggested_text,
                            1,
                        )
                        suggestion.applied = True
                        return True, "Suggestion applied"
                    else:
                        # Informational suggestion, mark as acknowledged
                        suggestion.applied = True
                        return True, "Suggestion acknowledged"

        return False, "Suggestion not found"

    def reject_suggestion(self, session: EditSession, suggestion_id: str) -> tuple[bool, str]:
        """Reject a specific suggestion."""
        for edit_pass in session.passes.values():
            for suggestion in edit_pass.suggestions:
                if suggestion.id == suggestion_id:
                    if suggestion.applied:
                        return False, "Cannot reject applied suggestion"
                    if suggestion.rejected:
                        return False, "Suggestion already rejected"

                    suggestion.rejected = True
                    return True, "Suggestion rejected"

        return False, "Suggestion not found"

    def get_summary(self, session: EditSession) -> dict:
        """Get a summary of the editing session."""
        summary = {
            "chapter_number": session.chapter_number,
            "passes_completed": len([p for p in session.passes.values() if p.completed]),
            "total_passes": 4,
            "total_suggestions": session.total_suggestions,
            "applied_suggestions": session.total_applied,
            "by_pass": {},
            "by_severity": {
                "error": 0,
                "warning": 0,
                "info": 0,
            },
        }

        for pass_type, edit_pass in session.passes.items():
            summary["by_pass"][pass_type.value] = {
                "suggestion_count": edit_pass.suggestion_count,
                "applied_count": edit_pass.applied_count,
                "rejected_count": edit_pass.rejected_count,
                "completed": edit_pass.completed,
            }

            for suggestion in edit_pass.suggestions:
                summary["by_severity"][suggestion.severity.value] += 1

        return summary
