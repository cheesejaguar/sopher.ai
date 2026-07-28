"""
Pacing analysis service.

Provides comprehensive pacing analysis for:
- Scene length distribution
- Tension curve analysis
- Action vs reflection balance
- Chapter ending strength
"""

import re
from dataclasses import dataclass, field
from enum import Enum


class TensionLevel(Enum):
    """Tension/intensity levels for scenes."""

    VERY_LOW = 1  # Quiet reflection, peaceful moments
    LOW = 2  # Calm dialogue, setup
    MEDIUM = 3  # Normal action, mild conflict
    HIGH = 4  # Confrontation, chase, discovery
    CLIMACTIC = 5  # Peak tension, major reveals, climax


class SceneType(Enum):
    """Types of scenes for pacing analysis."""

    ACTION = "action"  # Physical movement, fights, chases
    DIALOGUE = "dialogue"  # Character conversations
    REFLECTION = "reflection"  # Internal monologue, thinking
    DESCRIPTION = "description"  # Setting, world-building
    TRANSITION = "transition"  # Scene changes, time jumps
    MIXED = "mixed"  # Combination of types


class EndingStrength(Enum):
    """Strength of chapter/scene endings."""

    WEAK = "weak"  # Trailing off, no hook
    MODERATE = "moderate"  # Some closure, mild interest
    STRONG = "strong"  # Clear hook or cliffhanger


@dataclass
class SceneAnalysis:
    """Analysis of an individual scene."""

    word_count: int = 0
    scene_type: SceneType = SceneType.MIXED
    tension_level: TensionLevel = TensionLevel.MEDIUM
    dialogue_ratio: float = 0.0  # 0-1
    action_words_ratio: float = 0.0  # 0-1
    estimated_read_time_seconds: int = 0

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "word_count": self.word_count,
            "scene_type": self.scene_type.value,
            "tension_level": self.tension_level.value,
            "dialogue_ratio": round(self.dialogue_ratio, 2),
            "action_words_ratio": round(self.action_words_ratio, 2),
            "estimated_read_time_seconds": self.estimated_read_time_seconds,
        }


@dataclass
class SceneLengthDistribution:
    """Distribution of scene lengths."""

    total_scenes: int = 0
    average_length: float = 0.0
    shortest_scene: int = 0
    longest_scene: int = 0
    scene_lengths: list[int] = field(default_factory=list)
    std_deviation: float = 0.0
    variety_score: float = 0.0  # 0-1, higher is more varied

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "total_scenes": self.total_scenes,
            "average_length": round(self.average_length, 2),
            "shortest_scene": self.shortest_scene,
            "longest_scene": self.longest_scene,
            "std_deviation": round(self.std_deviation, 2),
            "variety_score": round(self.variety_score, 2),
        }


@dataclass
class TensionCurve:
    """Tension curve analysis."""

    tension_points: list[int] = field(default_factory=list)  # Tension levels at intervals
    average_tension: float = 0.0
    peak_tension: int = 0
    peak_position: float = 0.0  # 0-1 position in text
    tension_variance: float = 0.0
    has_build: bool = False  # Does tension build over time?
    has_climax: bool = False  # Is there a clear peak?
    has_resolution: bool = False  # Does tension decrease after peak?
    curve_type: str = "flat"  # flat, rising, falling, arc, volatile

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "tension_points": self.tension_points,
            "average_tension": round(self.average_tension, 2),
            "peak_tension": self.peak_tension,
            "peak_position": round(self.peak_position, 2),
            "tension_variance": round(self.tension_variance, 2),
            "has_build": self.has_build,
            "has_climax": self.has_climax,
            "has_resolution": self.has_resolution,
            "curve_type": self.curve_type,
        }


@dataclass
class ActionReflectionBalance:
    """Balance between action and reflection."""

    total_words: int = 0
    action_words: int = 0
    dialogue_words: int = 0
    reflection_words: int = 0
    description_words: int = 0
    action_percentage: float = 0.0
    dialogue_percentage: float = 0.0
    reflection_percentage: float = 0.0
    description_percentage: float = 0.0
    balance_score: float = 0.0  # 0-1, higher is better balanced
    recommendation: str = ""

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "total_words": self.total_words,
            "action_words": self.action_words,
            "dialogue_words": self.dialogue_words,
            "reflection_words": self.reflection_words,
            "description_words": self.description_words,
            "action_percentage": round(self.action_percentage, 2),
            "dialogue_percentage": round(self.dialogue_percentage, 2),
            "reflection_percentage": round(self.reflection_percentage, 2),
            "description_percentage": round(self.description_percentage, 2),
            "balance_score": round(self.balance_score, 2),
            "recommendation": self.recommendation,
        }


@dataclass
class ChapterEndingAnalysis:
    """Analysis of chapter ending strength."""

    ending_text: str = ""  # Last few sentences
    ending_strength: EndingStrength = EndingStrength.MODERATE
    has_hook: bool = False
    has_cliffhanger: bool = False
    has_question: bool = False
    has_unresolved_conflict: bool = False
    hook_score: float = 0.0  # 0-1

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "ending_strength": self.ending_strength.value,
            "has_hook": self.has_hook,
            "has_cliffhanger": self.has_cliffhanger,
            "has_question": self.has_question,
            "has_unresolved_conflict": self.has_unresolved_conflict,
            "hook_score": round(self.hook_score, 2),
        }


@dataclass
class PacingReport:
    """Complete pacing analysis report."""

    word_count: int = 0
    estimated_read_time_minutes: int = 0
    scene_distribution: SceneLengthDistribution = field(default_factory=SceneLengthDistribution)
    tension_curve: TensionCurve = field(default_factory=TensionCurve)
    action_balance: ActionReflectionBalance = field(default_factory=ActionReflectionBalance)
    ending_analysis: ChapterEndingAnalysis = field(default_factory=ChapterEndingAnalysis)
    overall_pacing_score: float = 0.0  # 0-100
    recommendations: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "word_count": self.word_count,
            "estimated_read_time_minutes": self.estimated_read_time_minutes,
            "scene_distribution": self.scene_distribution.to_dict(),
            "tension_curve": self.tension_curve.to_dict(),
            "action_balance": self.action_balance.to_dict(),
            "ending_analysis": self.ending_analysis.to_dict(),
            "overall_pacing_score": round(self.overall_pacing_score, 2),
            "recommendations": self.recommendations,
        }


class TextAnalysisUtils:
    """Utility functions for text analysis."""

    WORD_PATTERN = re.compile(r"\b\w+\b")
    SENTENCE_PATTERN = re.compile(r"[.!?]+(?:\s|$)")
    DIALOGUE_PATTERN = re.compile(r'["\u201c\u201d]([^"\u201c\u201d]+)["\u201c\u201d]')
    SCENE_BREAK_PATTERN = re.compile(r"\n\s*\n|\n\s*[#*]{3,}\s*\n|\n\s*[-]{3,}\s*\n")

    # Words indicating action
    ACTION_WORDS = {
        "ran",
        "run",
        "running",
        "jumped",
        "jump",
        "jumping",
        "fought",
        "fight",
        "fighting",
        "struck",
        "strike",
        "hitting",
        "hit",
        "punched",
        "kicked",
        "grabbed",
        "grab",
        "threw",
        "throw",
        "shot",
        "shooting",
        "chased",
        "chase",
        "escaped",
        "escape",
        "fled",
        "flee",
        "dodged",
        "dodge",
        "attacked",
        "attack",
        "blocked",
        "block",
        "slammed",
        "slam",
        "crashed",
        "crash",
        "leaped",
        "leap",
        "dashed",
        "dash",
        "sprinted",
        "sprint",
        "lunged",
        "lunge",
        "dove",
        "dive",
        "rolled",
        "roll",
        "swung",
        "swing",
        "shoved",
        "shove",
        "pushed",
        "push",
        "pulled",
        "pull",
        "dragged",
        "drag",
        "hurled",
        "hurl",
        "charged",
        "charge",
        "rushed",
        "rush",
        "raced",
        "race",
        "climbed",
        "climb",
        "fell",
        "fall",
        "tumbled",
        "tumble",
        "exploded",
        "explode",
        "burst",
        "bursting",
    }

    # Words indicating reflection/internal state
    REFLECTION_WORDS = {
        "thought",
        "think",
        "thinking",
        "wondered",
        "wonder",
        "pondered",
        "ponder",
        "considered",
        "consider",
        "remembered",
        "remember",
        "recalled",
        "recall",
        "realized",
        "realize",
        "felt",
        "feel",
        "feeling",
        "knew",
        "know",
        "believed",
        "believe",
        "imagined",
        "imagine",
        "dreamed",
        "dream",
        "hoped",
        "hope",
        "feared",
        "fear",
        "worried",
        "worry",
        "doubted",
        "doubt",
        "suspected",
        "suspect",
        "understood",
        "understand",
        "recognized",
        "recognize",
        "contemplated",
        "contemplate",
        "reflected",
        "reflect",
        "mused",
        "muse",
        "brooded",
        "brood",
        "regretted",
        "regret",
        "wished",
        "wish",
        "longed",
        "long",
        "yearned",
        "yearn",
        "decided",
        "decide",
        "concluded",
        "conclude",
    }

    # Words indicating high tension
    TENSION_WORDS = {
        "suddenly",
        "immediately",
        "urgent",
        "danger",
        "threat",
        "desperate",
        "panic",
        "terrified",
        "horrified",
        "shocked",
        "stunned",
        "frozen",
        "heart pounded",
        "screamed",
        "shouted",
        "yelled",
        "roared",
        "gasped",
        "trembled",
        "shook",
        "danger",
        "deadly",
        "fatal",
        "critical",
        "crucial",
        "life",
        "death",
        "kill",
        "killed",
        "murder",
        "blood",
        "wound",
        "injured",
        "trapped",
        "escape",
        "chase",
        "pursuit",
        "hunter",
        "hunted",
        "prey",
        "attack",
        "defend",
        "fight",
        "battle",
        "war",
        "enemy",
        "foe",
        "threat",
    }

    # Words indicating calm/low tension
    CALM_WORDS = {
        "peaceful",
        "calm",
        "quiet",
        "serene",
        "gentle",
        "soft",
        "slow",
        "relaxed",
        "comfortable",
        "safe",
        "warm",
        "cozy",
        "pleasant",
        "lovely",
        "beautiful",
        "smiled",
        "laughed",
        "enjoyed",
        "appreciated",
        "content",
        "satisfied",
        "happy",
        "joyful",
        "peaceful",
        "tranquil",
        "still",
    }

    @classmethod
    def get_words(cls, text: str) -> list[str]:
        """Extract words from text."""
        return cls.WORD_PATTERN.findall(text)

    @classmethod
    def get_sentences(cls, text: str) -> list[str]:
        """Split text into sentences."""
        sentences = cls.SENTENCE_PATTERN.split(text)
        return [s.strip() for s in sentences if s.strip()]

    @classmethod
    def get_dialogue_words(cls, text: str) -> int:
        """Count words within dialogue."""
        matches = cls.DIALOGUE_PATTERN.findall(text)
        word_count = 0
        for match in matches:
            word_count += len(cls.get_words(match))
        return word_count

    @classmethod
    def split_into_scenes(cls, text: str) -> list[str]:
        """Split text into scenes based on common scene breaks."""
        scenes = cls.SCENE_BREAK_PATTERN.split(text)
        return [s.strip() for s in scenes if s.strip()]


class TensionAnalyzer:
    """Analyzes tension levels in text."""

    @classmethod
    def calculate_tension_level(cls, text: str) -> TensionLevel:
        """Calculate tension level for a piece of text."""
        words = TextAnalysisUtils.get_words(text.lower())
        if not words:
            return TensionLevel.MEDIUM

        # Count tension and calm indicators
        tension_count = sum(1 for w in words if w in TextAnalysisUtils.TENSION_WORDS)
        calm_count = sum(1 for w in words if w in TextAnalysisUtils.CALM_WORDS)
        action_count = sum(1 for w in words if w in TextAnalysisUtils.ACTION_WORDS)

        total = len(words)
        tension_ratio = (tension_count + action_count) / total
        calm_ratio = calm_count / total

        # Check for specific high-tension patterns
        has_sudden = "suddenly" in words or "immediately" in words
        has_exclamation = "!" in text

        # Calculate base level
        if tension_ratio > 0.05 or has_sudden or has_exclamation:
            if tension_ratio > 0.1:
                return TensionLevel.CLIMACTIC
            return TensionLevel.HIGH
        elif calm_ratio > 0.03:
            if calm_ratio > 0.06:
                return TensionLevel.VERY_LOW
            return TensionLevel.LOW
        else:
            return TensionLevel.MEDIUM

    @classmethod
    def analyze_tension_curve(cls, text: str, intervals: int = 10) -> TensionCurve:
        """Analyze tension curve across the text."""
        if not text or not text.strip():
            return TensionCurve()

        words = TextAnalysisUtils.get_words(text)
        if not words:
            return TensionCurve()

        total_words = len(words)
        interval_size = max(total_words // intervals, 50)

        curve = TensionCurve()
        curve.tension_points = []

        # Calculate tension at each interval
        for i in range(intervals):
            start = i * interval_size
            end = min((i + 1) * interval_size, total_words)
            if start >= total_words:
                break

            # Reconstruct text for this interval (approximate)
            interval_words = words[start:end]
            interval_text = " ".join(interval_words)

            tension = cls.calculate_tension_level(interval_text)
            curve.tension_points.append(tension.value)

        if not curve.tension_points:
            return TensionCurve()

        # Calculate statistics
        curve.average_tension = sum(curve.tension_points) / len(curve.tension_points)
        curve.peak_tension = max(curve.tension_points)

        # Find peak position
        peak_idx = curve.tension_points.index(curve.peak_tension)
        curve.peak_position = peak_idx / len(curve.tension_points)

        # Calculate variance
        mean = curve.average_tension
        curve.tension_variance = sum((x - mean) ** 2 for x in curve.tension_points) / len(
            curve.tension_points
        )

        # Analyze curve characteristics
        first_half = curve.tension_points[: len(curve.tension_points) // 2]
        second_half = curve.tension_points[len(curve.tension_points) // 2 :]

        first_half_avg = sum(first_half) / len(first_half) if first_half else 0
        second_half_avg = sum(second_half) / len(second_half) if second_half else 0

        # Check for build
        curve.has_build = first_half_avg < second_half_avg - 0.5

        # Check for climax (peak in middle-to-end)
        curve.has_climax = curve.peak_position > 0.4 and curve.peak_tension >= 4

        # Check for resolution (tension decreases after peak)
        if peak_idx < len(curve.tension_points) - 1:
            post_peak = curve.tension_points[peak_idx + 1 :]
            if post_peak:
                post_peak_avg = sum(post_peak) / len(post_peak)
                curve.has_resolution = post_peak_avg < curve.peak_tension - 0.5

        # Determine curve type
        if curve.tension_variance < 0.3:
            curve.curve_type = "flat"
        elif curve.has_build and curve.has_climax and curve.has_resolution:
            curve.curve_type = "arc"
        elif first_half_avg < second_half_avg:
            curve.curve_type = "rising"
        elif first_half_avg > second_half_avg:
            curve.curve_type = "falling"
        else:
            curve.curve_type = "volatile"

        return curve


class SceneAnalyzer:
    """Analyzes individual scenes and scene distribution."""

    @classmethod
    def analyze_scene(cls, text: str) -> SceneAnalysis:
        """Analyze an individual scene."""
        if not text or not text.strip():
            return SceneAnalysis()

        words = TextAnalysisUtils.get_words(text.lower())
        if not words:
            return SceneAnalysis()

        analysis = SceneAnalysis()
        analysis.word_count = len(words)

        # Estimate read time (average 250 words per minute)
        analysis.estimated_read_time_seconds = int((analysis.word_count / 250) * 60)

        # Calculate dialogue ratio
        dialogue_words = TextAnalysisUtils.get_dialogue_words(text)
        analysis.dialogue_ratio = (
            dialogue_words / analysis.word_count if analysis.word_count > 0 else 0
        )

        # Calculate action words ratio
        action_count = sum(1 for w in words if w in TextAnalysisUtils.ACTION_WORDS)
        analysis.action_words_ratio = (
            action_count / analysis.word_count if analysis.word_count > 0 else 0
        )

        # Determine scene type
        if analysis.dialogue_ratio > 0.4:
            analysis.scene_type = SceneType.DIALOGUE
        elif analysis.action_words_ratio > 0.02:
            analysis.scene_type = SceneType.ACTION
        else:
            # Check for reflection
            reflection_count = sum(1 for w in words if w in TextAnalysisUtils.REFLECTION_WORDS)
            reflection_ratio = reflection_count / analysis.word_count
            if reflection_ratio > 0.01:
                analysis.scene_type = SceneType.REFLECTION
            else:
                analysis.scene_type = SceneType.DESCRIPTION

        # Calculate tension level
        analysis.tension_level = TensionAnalyzer.calculate_tension_level(text)

        return analysis

    @classmethod
    def analyze_scene_distribution(cls, text: str) -> SceneLengthDistribution:
        """Analyze the distribution of scene lengths."""
        if not text or not text.strip():
            return SceneLengthDistribution()

        scenes = TextAnalysisUtils.split_into_scenes(text)
        if not scenes:
            # Treat entire text as one scene
            scenes = [text]

        distribution = SceneLengthDistribution()
        distribution.total_scenes = len(scenes)

        for scene in scenes:
            word_count = len(TextAnalysisUtils.get_words(scene))
            distribution.scene_lengths.append(word_count)

        if distribution.scene_lengths:
            distribution.average_length = sum(distribution.scene_lengths) / len(
                distribution.scene_lengths
            )
            distribution.shortest_scene = min(distribution.scene_lengths)
            distribution.longest_scene = max(distribution.scene_lengths)

            # Calculate standard deviation
            if len(distribution.scene_lengths) > 1:
                mean = distribution.average_length
                variance = sum((x - mean) ** 2 for x in distribution.scene_lengths) / len(
                    distribution.scene_lengths
                )
                distribution.std_deviation = variance**0.5

                # Calculate variety score
                if distribution.average_length > 0:
                    distribution.variety_score = min(
                        1.0, distribution.std_deviation / distribution.average_length
                    )

        return distribution


class ActionBalanceAnalyzer:
    """Analyzes balance between action and reflection."""

    @classmethod
    def analyze(cls, text: str) -> ActionReflectionBalance:
        """Analyze action vs reflection balance."""
        if not text or not text.strip():
            return ActionReflectionBalance()

        words = TextAnalysisUtils.get_words(text.lower())
        if not words:
            return ActionReflectionBalance()

        balance = ActionReflectionBalance()
        balance.total_words = len(words)

        # Count dialogue words
        balance.dialogue_words = TextAnalysisUtils.get_dialogue_words(text)

        # Count action words
        balance.action_words = sum(1 for w in words if w in TextAnalysisUtils.ACTION_WORDS)

        # Count reflection words
        balance.reflection_words = sum(1 for w in words if w in TextAnalysisUtils.REFLECTION_WORDS)

        # Estimate description words (remaining)
        classified = balance.dialogue_words + balance.action_words + balance.reflection_words
        balance.description_words = max(0, balance.total_words - classified)

        # Calculate percentages
        if balance.total_words > 0:
            balance.action_percentage = (balance.action_words / balance.total_words) * 100
            balance.dialogue_percentage = (balance.dialogue_words / balance.total_words) * 100
            balance.reflection_percentage = (balance.reflection_words / balance.total_words) * 100
            balance.description_percentage = (balance.description_words / balance.total_words) * 100

        # Calculate balance score
        # Good fiction typically has: ~35% dialogue, ~5% action verbs, ~5% reflection, ~55% description
        # But this varies by genre. Score based on having reasonable distribution.
        ideal_dialogue = 35
        ideal_action = 5
        ideal_reflection = 5

        dialogue_diff = abs(balance.dialogue_percentage - ideal_dialogue)
        action_diff = abs(balance.action_percentage - ideal_action)
        reflection_diff = abs(balance.reflection_percentage - ideal_reflection)

        # Lower total difference = higher score
        total_diff = dialogue_diff + action_diff + reflection_diff
        balance.balance_score = max(0, 1 - (total_diff / 100))

        # Generate recommendation
        if balance.dialogue_percentage < 20:
            balance.recommendation = "Consider adding more dialogue to break up narrative."
        elif balance.dialogue_percentage > 60:
            balance.recommendation = "Balance dialogue with more narrative and description."
        elif balance.action_percentage < 1:
            balance.recommendation = "Add some action verbs to create more dynamic prose."
        elif balance.reflection_percentage < 1:
            balance.recommendation = "Add more character introspection for depth."
        else:
            balance.recommendation = "Good balance between action, dialogue, and reflection."

        return balance


class EndingAnalyzer:
    """Analyzes chapter/scene ending strength."""

    # Hook indicators
    HOOK_PATTERNS = [
        re.compile(r"\?$"),  # Ends with question
        re.compile(r"!$"),  # Ends with exclamation
        re.compile(r"\.\.\.$"),  # Trailing off
        re.compile(r"\b(but|yet|however|still)\b", re.IGNORECASE),  # Contrast
    ]

    CLIFFHANGER_WORDS = {
        "suddenly",
        "then",
        "but",
        "however",
        "until",
        "when",
        "before",
        "as",
        "just",
        "then",
        "that",
        "moment",
    }

    UNRESOLVED_WORDS = {
        "would",
        "could",
        "might",
        "should",
        "if",
        "whether",
        "unless",
        "until",
        "before",
        "waiting",
        "wondered",
        "unclear",
        "unknown",
    }

    @classmethod
    def analyze(cls, text: str, ending_sentences: int = 3) -> ChapterEndingAnalysis:
        """Analyze chapter ending strength."""
        if not text or not text.strip():
            return ChapterEndingAnalysis()

        # Get the raw ending text (last portion) to preserve punctuation
        # Use a regex to get the last few sentences with punctuation
        import re

        sentence_pattern = re.compile(r"[^.!?]*[.!?]+")
        all_sentences = sentence_pattern.findall(text)

        if not all_sentences:
            # Fallback to last N words
            words = text.split()
            ending_text = " ".join(words[-30:]) if len(words) > 30 else text
        else:
            # Get last few sentences with punctuation
            ending_text = " ".join(all_sentences[-ending_sentences:])

        analysis = ChapterEndingAnalysis()
        analysis.ending_text = ending_text.strip()[:200]  # Limit stored text

        # Check for hook patterns
        hook_count = 0
        for pattern in cls.HOOK_PATTERNS:
            if pattern.search(ending_text):
                hook_count += 1
                analysis.has_hook = True

        # Check for question
        if ending_text.strip().endswith("?"):
            analysis.has_question = True
            hook_count += 1

        # Check for cliffhanger words
        words = TextAnalysisUtils.get_words(ending_text.lower())
        cliffhanger_count = sum(1 for w in words if w in cls.CLIFFHANGER_WORDS)
        if cliffhanger_count >= 2:
            analysis.has_cliffhanger = True
            hook_count += 1

        # Check for unresolved conflict
        unresolved_count = sum(1 for w in words if w in cls.UNRESOLVED_WORDS)
        if unresolved_count >= 2:
            analysis.has_unresolved_conflict = True
            hook_count += 1

        # Calculate hook score
        analysis.hook_score = min(1.0, hook_count / 4)

        # Determine ending strength
        if analysis.hook_score >= 0.6:
            analysis.ending_strength = EndingStrength.STRONG
        elif analysis.hook_score >= 0.3:
            analysis.ending_strength = EndingStrength.MODERATE
        else:
            analysis.ending_strength = EndingStrength.WEAK

        return analysis


class PacingAnalyzer:
    """Main service for pacing analysis."""

    @classmethod
    def analyze(cls, text: str) -> PacingReport:
        """Perform complete pacing analysis."""
        if not text or not text.strip():
            return PacingReport()

        report = PacingReport()

        # Basic metrics
        words = TextAnalysisUtils.get_words(text)
        report.word_count = len(words)
        report.estimated_read_time_minutes = max(1, report.word_count // 250)

        # Run all analyses
        report.scene_distribution = SceneAnalyzer.analyze_scene_distribution(text)
        report.tension_curve = TensionAnalyzer.analyze_tension_curve(text)
        report.action_balance = ActionBalanceAnalyzer.analyze(text)
        report.ending_analysis = EndingAnalyzer.analyze(text)

        # Calculate overall pacing score
        report.overall_pacing_score = cls._calculate_overall_score(report)

        # Generate recommendations
        report.recommendations = cls._generate_recommendations(report)

        return report

    @classmethod
    def _calculate_overall_score(cls, report: PacingReport) -> float:
        """Calculate overall pacing score (0-100)."""
        score = 100.0

        # Scene variety contributes to pacing
        if report.scene_distribution.variety_score < 0.2:
            score -= 10  # Uniform scene lengths

        # Tension curve quality
        if report.tension_curve.curve_type == "flat":
            score -= 15  # No tension variation
        elif report.tension_curve.curve_type == "arc":
            score += 10  # Good narrative arc

        if not report.tension_curve.has_climax and report.word_count > 2000:
            score -= 10  # Long text without climax

        # Action balance
        score += report.action_balance.balance_score * 20

        # Ending strength
        if report.ending_analysis.ending_strength == EndingStrength.STRONG:
            score += 10
        elif report.ending_analysis.ending_strength == EndingStrength.WEAK:
            score -= 10

        return max(0, min(100, score))

    @classmethod
    def _generate_recommendations(cls, report: PacingReport) -> list[str]:
        """Generate pacing recommendations."""
        recommendations = []

        # Scene distribution recommendations
        if report.scene_distribution.total_scenes <= 1 and report.word_count > 1000:
            recommendations.append(
                "Consider breaking the text into distinct scenes with scene breaks "
                "to vary pacing and give readers natural pause points."
            )

        if report.scene_distribution.variety_score < 0.2:
            recommendations.append(
                "Scene lengths are very uniform. Varying scene length can "
                "create rhythm and control pacing—shorter scenes for action, "
                "longer for reflection."
            )

        # Tension curve recommendations
        if report.tension_curve.curve_type == "flat":
            recommendations.append(
                "Tension remains relatively constant throughout. Consider adding "
                "moments of higher and lower tension to create a more engaging rhythm."
            )

        if not report.tension_curve.has_build and report.word_count > 2000:
            recommendations.append(
                "Tension doesn't build progressively. For longer pieces, "
                "gradually increasing tension keeps readers engaged."
            )

        if not report.tension_curve.has_resolution and report.tension_curve.has_climax:
            recommendations.append(
                "The text reaches high tension but doesn't resolve it. "
                "Unless intentional (cliffhanger), consider adding resolution."
            )

        # Action balance recommendations
        if report.action_balance.recommendation:
            recommendations.append(report.action_balance.recommendation)

        # Ending recommendations
        if report.ending_analysis.ending_strength == EndingStrength.WEAK:
            recommendations.append(
                "The ending feels weak. Consider ending with a question, "
                "unresolved tension, or a hook to keep readers engaged."
            )

        return recommendations
