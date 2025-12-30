"""Quality gates service for ensuring generation quality."""

import re
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


class QualityLevel(str, Enum):
    """Quality assessment levels."""

    EXCELLENT = "excellent"
    GOOD = "good"
    ACCEPTABLE = "acceptable"
    POOR = "poor"
    UNACCEPTABLE = "unacceptable"


class QualityDimension(str, Enum):
    """Dimensions of quality to assess."""

    COHERENCE = "coherence"
    GRAMMAR = "grammar"
    STYLE = "style"
    PACING = "pacing"
    DIALOGUE = "dialogue"
    DESCRIPTION = "description"
    CHARACTER = "character"
    PLOT = "plot"
    OVERALL = "overall"


@dataclass
class QualityScore:
    """Score for a single quality dimension."""

    dimension: QualityDimension
    score: float  # 0.0 to 1.0
    level: QualityLevel
    details: str = ""
    suggestions: list[str] = field(default_factory=list)

    def __post_init__(self):
        """Validate score is in range."""
        if not 0.0 <= self.score <= 1.0:
            raise ValueError(f"Score must be between 0.0 and 1.0, got {self.score}")


@dataclass
class QualityReport:
    """Complete quality assessment report."""

    content_id: str
    content_type: str  # "chapter", "outline", "scene"
    scores: list[QualityScore]
    overall_score: float
    overall_level: QualityLevel
    passed: bool
    threshold: float
    assessed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    word_count: int = 0
    regeneration_suggested: bool = False
    regeneration_reason: Optional[str] = None

    @property
    def dimension_scores(self) -> dict[QualityDimension, float]:
        """Get scores by dimension."""
        return {s.dimension: s.score for s in self.scores}

    @property
    def failed_dimensions(self) -> list[QualityDimension]:
        """Get dimensions that failed threshold."""
        return [
            s.dimension
            for s in self.scores
            if s.level in (QualityLevel.POOR, QualityLevel.UNACCEPTABLE)
        ]


@dataclass
class QualityThreshold:
    """Threshold configuration for quality gates."""

    minimum_overall: float = 0.6
    minimum_coherence: float = 0.5
    minimum_grammar: float = 0.7
    minimum_style: float = 0.5
    minimum_pacing: float = 0.5
    minimum_dialogue: float = 0.5
    minimum_description: float = 0.5
    minimum_character: float = 0.5
    minimum_plot: float = 0.5
    auto_regenerate_below: float = 0.4
    max_regeneration_attempts: int = 3

    def get_minimum(self, dimension: QualityDimension) -> float:
        """Get minimum threshold for a dimension."""
        dimension_map = {
            QualityDimension.COHERENCE: self.minimum_coherence,
            QualityDimension.GRAMMAR: self.minimum_grammar,
            QualityDimension.STYLE: self.minimum_style,
            QualityDimension.PACING: self.minimum_pacing,
            QualityDimension.DIALOGUE: self.minimum_dialogue,
            QualityDimension.DESCRIPTION: self.minimum_description,
            QualityDimension.CHARACTER: self.minimum_character,
            QualityDimension.PLOT: self.minimum_plot,
            QualityDimension.OVERALL: self.minimum_overall,
        }
        return dimension_map.get(dimension, self.minimum_overall)


@dataclass
class QualityTrend:
    """Track quality trends over time."""

    content_type: str
    dimension: QualityDimension
    scores: list[float] = field(default_factory=list)
    timestamps: list[datetime] = field(default_factory=list)

    def add_score(self, score: float, timestamp: Optional[datetime] = None):
        """Add a new score to the trend."""
        self.scores.append(score)
        self.timestamps.append(timestamp or datetime.now(timezone.utc))

    @property
    def average(self) -> float:
        """Get average score."""
        return statistics.mean(self.scores) if self.scores else 0.0

    @property
    def trend_direction(self) -> str:
        """Get trend direction (improving, declining, stable)."""
        if len(self.scores) < 3:
            return "insufficient_data"

        recent = self.scores[-3:]
        first_half = sum(recent[: len(recent) // 2]) / (len(recent) // 2)
        second_half = sum(recent[len(recent) // 2 :]) / (len(recent) - len(recent) // 2)

        diff = second_half - first_half
        if diff > 0.05:
            return "improving"
        elif diff < -0.05:
            return "declining"
        return "stable"

    @property
    def variance(self) -> float:
        """Get score variance."""
        return statistics.variance(self.scores) if len(self.scores) > 1 else 0.0


def score_to_level(score: float) -> QualityLevel:
    """Convert numeric score to quality level."""
    if score >= 0.9:
        return QualityLevel.EXCELLENT
    elif score >= 0.75:
        return QualityLevel.GOOD
    elif score >= 0.6:
        return QualityLevel.ACCEPTABLE
    elif score >= 0.4:
        return QualityLevel.POOR
    return QualityLevel.UNACCEPTABLE


class QualityAnalyzer:
    """Analyzes content quality across multiple dimensions."""

    def __init__(self):
        """Initialize the analyzer with pattern matchers."""
        self._setup_patterns()

    def _setup_patterns(self):
        """Setup regex patterns for quality analysis."""
        # Grammar issues
        self.grammar_patterns = [
            (r"\b(their|there|they're)\b", "homophone_check"),
            (r"\b(your|you're)\b", "homophone_check"),
            (r"\b(its|it's)\b", "homophone_check"),
            (r"\s{2,}", "double_space"),
            (r"[.!?]{2,}", "repeated_punctuation"),
            (r"\b(\w+)\s+\1\b", "repeated_word"),
        ]

        # Style patterns
        self.style_patterns = [
            (r"\bvery\s+\w+", "weak_intensifier"),
            (r"\breally\s+\w+", "weak_intensifier"),
            (r"\bjust\s+", "filler_word"),
            (r"\bactually\s+", "filler_word"),
            (r"\bbasically\s+", "filler_word"),
            (r"\b(said|asked|replied)\b", "dialogue_tag"),
        ]

        # Pacing patterns
        self.pacing_patterns = [
            (r"[.!?]\s*[A-Z]", "sentence_break"),
            (r"\n\n", "paragraph_break"),
        ]

    def analyze_coherence(self, text: str) -> QualityScore:
        """Analyze text coherence."""
        sentences = re.split(r"[.!?]+", text)
        sentences = [s.strip() for s in sentences if s.strip()]

        if len(sentences) < 2:
            return QualityScore(
                dimension=QualityDimension.COHERENCE,
                score=0.5,
                level=QualityLevel.ACCEPTABLE,
                details="Insufficient sentences to assess coherence",
            )

        # Check for transition words and logical flow
        transition_words = [
            "however",
            "therefore",
            "meanwhile",
            "furthermore",
            "moreover",
            "consequently",
            "nevertheless",
            "although",
            "because",
            "since",
            "then",
            "next",
            "finally",
            "first",
            "second",
            "later",
            "after",
            "before",
            "when",
            "while",
        ]

        text_lower = text.lower()
        transition_count = sum(1 for word in transition_words if word in text_lower)
        transition_ratio = transition_count / len(sentences) if sentences else 0

        # Check for pronoun consistency
        pronouns = re.findall(r"\b(he|she|they|it|him|her|them)\b", text_lower)
        pronoun_variety = len(set(pronouns)) / len(pronouns) if pronouns else 1

        # Calculate coherence score
        base_score = 0.5
        base_score += min(0.25, transition_ratio * 0.5)  # Transition words
        base_score += min(0.25, (1 - pronoun_variety) * 0.3)  # Pronoun consistency

        score = min(1.0, base_score)

        return QualityScore(
            dimension=QualityDimension.COHERENCE,
            score=score,
            level=score_to_level(score),
            details=f"Found {transition_count} transitions in {len(sentences)} sentences",
            suggestions=self._get_coherence_suggestions(score, transition_count),
        )

    def _get_coherence_suggestions(self, score: float, transition_count: int) -> list[str]:
        """Get suggestions for improving coherence."""
        suggestions = []
        if score < 0.6:
            if transition_count < 3:
                suggestions.append("Add more transition words to improve flow between sentences")
            suggestions.append("Consider restructuring for better logical progression")
        return suggestions

    def analyze_grammar(self, text: str) -> QualityScore:
        """Analyze grammar quality."""
        issues = []
        word_count = len(text.split())

        for pattern, issue_type in self.grammar_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                issues.extend([(m, issue_type) for m in matches])

        # Calculate score based on issue density
        issue_density = len(issues) / word_count if word_count > 0 else 0
        score = max(0.0, 1.0 - (issue_density * 20))  # Each issue per 50 words = 0.4 penalty

        suggestions = []
        if issues:
            issue_types = set(i[1] for i in issues)
            if "repeated_word" in issue_types:
                suggestions.append("Check for accidentally repeated words")
            if "double_space" in issue_types:
                suggestions.append("Fix double spacing issues")

        return QualityScore(
            dimension=QualityDimension.GRAMMAR,
            score=score,
            level=score_to_level(score),
            details=f"Found {len(issues)} potential grammar issues",
            suggestions=suggestions,
        )

    def analyze_style(self, text: str) -> QualityScore:
        """Analyze writing style quality."""
        issues = []
        word_count = len(text.split())

        for pattern, issue_type in self.style_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                issues.extend([(m, issue_type) for m in matches])

        # Check sentence variety
        sentences = re.split(r"[.!?]+", text)
        sentences = [s.strip() for s in sentences if s.strip()]
        sentence_lengths = [len(s.split()) for s in sentences]

        length_variance = statistics.variance(sentence_lengths) if len(sentence_lengths) > 1 else 0
        variety_score = min(1.0, length_variance / 50)  # Good variety around 50 variance

        # Calculate final score
        issue_density = len(issues) / word_count if word_count > 0 else 0
        base_score = max(0.0, 1.0 - (issue_density * 15))
        score = (base_score * 0.7) + (variety_score * 0.3)

        suggestions = []
        if "weak_intensifier" in [i[1] for i in issues]:
            suggestions.append("Replace weak intensifiers (very, really) with stronger words")
        if length_variance < 20:
            suggestions.append("Vary sentence length for better rhythm")

        return QualityScore(
            dimension=QualityDimension.STYLE,
            score=score,
            level=score_to_level(score),
            details=f"Sentence length variance: {length_variance:.1f}",
            suggestions=suggestions,
        )

    def analyze_pacing(self, text: str) -> QualityScore:
        """Analyze pacing quality."""
        paragraphs = text.split("\n\n")
        paragraphs = [p.strip() for p in paragraphs if p.strip()]

        if len(paragraphs) < 2:
            return QualityScore(
                dimension=QualityDimension.PACING,
                score=0.6,
                level=QualityLevel.ACCEPTABLE,
                details="Text too short for pacing analysis",
            )

        # Check paragraph length variance
        para_lengths = [len(p.split()) for p in paragraphs]
        avg_para_length = statistics.mean(para_lengths)
        para_variance = statistics.variance(para_lengths) if len(para_lengths) > 1 else 0

        # Good pacing has moderate paragraph length (50-150 words) with some variety
        length_score = 1.0
        if avg_para_length < 30:
            length_score = 0.6  # Too choppy
        elif avg_para_length > 200:
            length_score = 0.6  # Too dense

        variance_score = min(1.0, para_variance / 100)  # Some variety is good

        score = (length_score * 0.6) + (variance_score * 0.4)

        suggestions = []
        if avg_para_length < 30:
            suggestions.append("Consider combining short paragraphs for better flow")
        elif avg_para_length > 200:
            suggestions.append("Break up long paragraphs for easier reading")

        return QualityScore(
            dimension=QualityDimension.PACING,
            score=score,
            level=score_to_level(score),
            details=f"Average paragraph length: {avg_para_length:.0f} words",
            suggestions=suggestions,
        )

    def analyze_dialogue(self, text: str) -> QualityScore:
        """Analyze dialogue quality."""
        # Find dialogue (text in quotes)
        dialogue_pattern = r'"([^"]+)"'
        dialogues = re.findall(dialogue_pattern, text)

        if not dialogues:
            return QualityScore(
                dimension=QualityDimension.DIALOGUE,
                score=0.7,
                level=QualityLevel.GOOD,
                details="No dialogue found in text",
            )

        # Check dialogue tag variety
        tag_pattern = r'"\s*(said|asked|replied|whispered|shouted|muttered|exclaimed)'
        tags = re.findall(tag_pattern, text, re.IGNORECASE)
        tag_variety = len(set(tags)) / len(tags) if tags else 1

        # Check dialogue length variety
        dialogue_lengths = [len(d.split()) for d in dialogues]
        length_variance = statistics.variance(dialogue_lengths) if len(dialogue_lengths) > 1 else 0

        # Score calculation
        variety_score = min(1.0, tag_variety + 0.3)  # More variety is good
        length_score = min(1.0, length_variance / 30)

        score = (variety_score * 0.5) + (length_score * 0.3) + 0.2  # Base 0.2

        suggestions = []
        if tag_variety < 0.5:
            suggestions.append("Vary dialogue tags or use action beats instead")
        if length_variance < 10:
            suggestions.append("Add variety to dialogue length")

        return QualityScore(
            dimension=QualityDimension.DIALOGUE,
            score=score,
            level=score_to_level(score),
            details=f"Found {len(dialogues)} dialogue instances with {len(set(tags))} unique tags",
            suggestions=suggestions,
        )

    def analyze_description(self, text: str) -> QualityScore:
        """Analyze descriptive writing quality."""
        words = text.lower().split()
        word_count = len(words)

        if word_count < 50:
            return QualityScore(
                dimension=QualityDimension.DESCRIPTION,
                score=0.6,
                level=QualityLevel.ACCEPTABLE,
                details="Text too short for description analysis",
            )

        # Check for sensory words
        sensory_words = {
            "sight": [
                "saw",
                "looked",
                "appeared",
                "glowed",
                "shimmered",
                "bright",
                "dark",
                "colorful",
            ],
            "sound": ["heard", "whispered", "thundered", "echoed", "silent", "loud", "quiet"],
            "touch": ["felt", "touched", "smooth", "rough", "cold", "warm", "soft", "hard"],
            "smell": ["smelled", "scent", "fragrant", "musty", "fresh", "stale"],
            "taste": ["tasted", "sweet", "bitter", "sour", "salty"],
        }

        sensory_counts = {sense: 0 for sense in sensory_words}
        for sense, words_list in sensory_words.items():
            for word in words_list:
                sensory_counts[sense] += text.lower().count(word)

        total_sensory = sum(sensory_counts.values())
        sensory_density = total_sensory / word_count
        senses_used = sum(1 for count in sensory_counts.values() if count > 0)

        # Score based on sensory richness
        density_score = min(1.0, sensory_density * 20)  # Target ~5% sensory words
        variety_score = senses_used / 5  # Use all 5 senses ideally

        score = (density_score * 0.5) + (variety_score * 0.5)

        suggestions = []
        if senses_used < 3:
            unused = [s for s, c in sensory_counts.items() if c == 0]
            suggestions.append(f"Add sensory details for: {', '.join(unused[:2])}")
        if sensory_density < 0.02:
            suggestions.append("Include more sensory descriptions")

        return QualityScore(
            dimension=QualityDimension.DESCRIPTION,
            score=score,
            level=score_to_level(score),
            details=f"Used {senses_used}/5 senses, {total_sensory} sensory words",
            suggestions=suggestions,
        )

    def analyze_content(
        self,
        text: str,
        content_id: str,
        content_type: str = "chapter",
        threshold: Optional[QualityThreshold] = None,
    ) -> QualityReport:
        """Perform complete quality analysis on content."""
        if threshold is None:
            threshold = QualityThreshold()

        # Run all analyses
        scores = [
            self.analyze_coherence(text),
            self.analyze_grammar(text),
            self.analyze_style(text),
            self.analyze_pacing(text),
            self.analyze_dialogue(text),
            self.analyze_description(text),
        ]

        # Calculate overall score
        overall_score = statistics.mean([s.score for s in scores])
        overall_level = score_to_level(overall_score)

        # Check if passed threshold
        passed = overall_score >= threshold.minimum_overall
        for score in scores:
            if score.score < threshold.get_minimum(score.dimension):
                passed = False
                break

        # Determine if regeneration is suggested
        regeneration_suggested = overall_score < threshold.auto_regenerate_below
        regeneration_reason = None
        if regeneration_suggested:
            failed = [s.dimension.value for s in scores if s.score < 0.4]
            regeneration_reason = f"Low scores in: {', '.join(failed)}"

        # Add overall score
        scores.append(
            QualityScore(
                dimension=QualityDimension.OVERALL,
                score=overall_score,
                level=overall_level,
                details=f"Average of {len(scores) - 1} dimensions",
            )
        )

        return QualityReport(
            content_id=content_id,
            content_type=content_type,
            scores=scores,
            overall_score=overall_score,
            overall_level=overall_level,
            passed=passed,
            threshold=threshold.minimum_overall,
            word_count=len(text.split()),
            regeneration_suggested=regeneration_suggested,
            regeneration_reason=regeneration_reason,
        )


class QualityGate:
    """Gate that enforces quality standards."""

    def __init__(self, threshold: Optional[QualityThreshold] = None):
        """Initialize the quality gate."""
        self.threshold = threshold or QualityThreshold()
        self.analyzer = QualityAnalyzer()
        self.trends: dict[str, dict[QualityDimension, QualityTrend]] = {}

    def check(
        self,
        text: str,
        content_id: str,
        content_type: str = "chapter",
    ) -> QualityReport:
        """Check content against quality standards."""
        report = self.analyzer.analyze_content(
            text=text,
            content_id=content_id,
            content_type=content_type,
            threshold=self.threshold,
        )

        # Track trends
        self._update_trends(content_type, report)

        return report

    def _update_trends(self, content_type: str, report: QualityReport):
        """Update quality trends with new report."""
        if content_type not in self.trends:
            self.trends[content_type] = {}

        for score in report.scores:
            if score.dimension not in self.trends[content_type]:
                self.trends[content_type][score.dimension] = QualityTrend(
                    content_type=content_type,
                    dimension=score.dimension,
                )
            self.trends[content_type][score.dimension].add_score(score.score, report.assessed_at)

    def get_trend(self, content_type: str, dimension: QualityDimension) -> Optional[QualityTrend]:
        """Get quality trend for a dimension."""
        return self.trends.get(content_type, {}).get(dimension)

    def should_regenerate(self, report: QualityReport) -> bool:
        """Determine if content should be regenerated."""
        return report.regeneration_suggested

    def get_improvement_suggestions(self, report: QualityReport) -> list[str]:
        """Get prioritized improvement suggestions."""
        suggestions = []

        # Sort scores by ascending order (worst first)
        sorted_scores = sorted(report.scores, key=lambda s: s.score)

        for score in sorted_scores:
            if score.dimension == QualityDimension.OVERALL:
                continue
            if score.suggestions:
                suggestions.extend(score.suggestions)

        return suggestions[:5]  # Top 5 suggestions
