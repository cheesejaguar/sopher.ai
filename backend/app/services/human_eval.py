"""Human evaluation pipeline for quality assessment and calibration.

This module provides a system for:
- Sampling output for human review
- Collecting and storing feedback
- Calibrating quality scores based on human judgments
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class EvaluationStatus(Enum):
    """Status of an evaluation task."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"
    EXPIRED = "expired"


class EvaluationDimension(Enum):
    """Dimensions for human evaluation."""

    OVERALL_QUALITY = "overall_quality"
    READABILITY = "readability"
    ENGAGEMENT = "engagement"
    COHERENCE = "coherence"
    STYLE = "style"
    GRAMMAR = "grammar"
    PACING = "pacing"
    DIALOGUE = "dialogue"
    DESCRIPTION = "description"
    CHARACTER_VOICE = "character_voice"


class ContentType(Enum):
    """Types of content that can be evaluated."""

    CHAPTER = "chapter"
    OUTLINE = "outline"
    SCENE = "scene"
    DIALOGUE_EXCHANGE = "dialogue_exchange"
    DESCRIPTION_PASSAGE = "description_passage"


class SamplingStrategy(Enum):
    """Strategies for sampling content for evaluation."""

    RANDOM = "random"
    STRATIFIED = "stratified"  # Sample across quality score ranges
    LOW_SCORE = "low_score"  # Focus on low-scoring content
    HIGH_VARIANCE = "high_variance"  # Focus on content with high score variance
    RECENT = "recent"  # Focus on most recently generated content


@dataclass
class EvaluationScore:
    """A single dimension score from human evaluation."""

    dimension: EvaluationDimension
    score: float  # 1-5 scale
    confidence: float = 1.0  # How confident the evaluator was (0-1)
    notes: str = ""

    def __post_init__(self) -> None:
        if not 1.0 <= self.score <= 5.0:
            raise ValueError(f"Score must be between 1 and 5, got {self.score}")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(f"Confidence must be between 0 and 1, got {self.confidence}")


@dataclass
class EvaluationTask:
    """A task for human evaluation."""

    id: UUID
    project_id: UUID
    content_id: str  # e.g., "chapter-1", "outline"
    content_type: ContentType
    content_text: str
    context: str = ""  # Additional context (e.g., previous chapter summary)
    status: EvaluationStatus = EvaluationStatus.PENDING
    assigned_evaluator: Optional[str] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    automated_scores: dict[str, float] = field(default_factory=dict)  # From QualityGate
    priority: int = 0  # Higher = more urgent


@dataclass
class EvaluationResult:
    """Result of a human evaluation."""

    task_id: UUID
    evaluator_id: str
    scores: list[EvaluationScore]
    overall_feedback: str = ""
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)
    time_spent_seconds: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def average_score(self) -> float:
        """Calculate weighted average score across all dimensions."""
        if not self.scores:
            return 0.0
        total_weight = sum(s.confidence for s in self.scores)
        if total_weight == 0:
            return 0.0
        weighted_sum = sum(s.score * s.confidence for s in self.scores)
        return weighted_sum / total_weight


@dataclass
class CalibrationData:
    """Data for calibrating automated scores against human evaluations."""

    dimension: EvaluationDimension
    automated_score: float  # 0-1 scale from QualityGate
    human_score: float  # 1-5 scale from evaluation
    content_id: str
    evaluator_id: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class CalibrationResult:
    """Result of score calibration analysis."""

    dimension: EvaluationDimension
    sample_size: int
    correlation: float  # Pearson correlation between auto and human scores
    mean_absolute_error: float
    bias: float  # Positive = automated scores too high
    recommended_adjustment: float  # How much to adjust automated scores
    confidence_interval: tuple[float, float] = (0.0, 0.0)


class SampleSelector:
    """Selects content samples for human evaluation."""

    def __init__(
        self,
        strategy: SamplingStrategy = SamplingStrategy.STRATIFIED,
        sample_rate: float = 0.1,  # 10% of content by default
        min_samples: int = 1,
        max_samples: int = 100,
    ):
        self.strategy = strategy
        self.sample_rate = sample_rate
        self.min_samples = min_samples
        self.max_samples = max_samples

    def select_samples(
        self,
        content_items: list[tuple[str, str, float]],  # (content_id, text, auto_score)
    ) -> list[tuple[str, str, int]]:
        """Select samples for evaluation based on strategy.

        Returns list of (content_id, text, priority).
        """
        if not content_items:
            return []

        num_samples = min(
            max(int(len(content_items) * self.sample_rate), self.min_samples),
            self.max_samples,
        )

        if self.strategy == SamplingStrategy.RANDOM:
            return self._random_sample(content_items, num_samples)
        elif self.strategy == SamplingStrategy.STRATIFIED:
            return self._stratified_sample(content_items, num_samples)
        elif self.strategy == SamplingStrategy.LOW_SCORE:
            return self._low_score_sample(content_items, num_samples)
        elif self.strategy == SamplingStrategy.RECENT:
            return self._recent_sample(content_items, num_samples)
        else:
            return self._random_sample(content_items, num_samples)

    def _random_sample(
        self,
        content_items: list[tuple[str, str, float]],
        num_samples: int,
    ) -> list[tuple[str, str, int]]:
        """Random sampling with uniform priority."""
        import random

        samples = random.sample(content_items, min(num_samples, len(content_items)))
        return [(cid, text, 1) for cid, text, _ in samples]

    def _stratified_sample(
        self,
        content_items: list[tuple[str, str, float]],
        num_samples: int,
    ) -> list[tuple[str, str, int]]:
        """Stratified sampling across score ranges."""
        # Sort by score
        sorted_items = sorted(content_items, key=lambda x: x[2])

        # Divide into strata
        strata_count = min(5, len(sorted_items))
        strata_size = len(sorted_items) // strata_count
        samples_per_stratum = max(1, num_samples // strata_count)

        result = []
        for i in range(strata_count):
            start = i * strata_size
            end = start + strata_size if i < strata_count - 1 else len(sorted_items)
            stratum = sorted_items[start:end]

            import random

            stratum_samples = random.sample(stratum, min(samples_per_stratum, len(stratum)))
            # Lower scores get higher priority
            priority = strata_count - i
            result.extend([(cid, text, priority) for cid, text, _ in stratum_samples])

        return result[:num_samples]

    def _low_score_sample(
        self,
        content_items: list[tuple[str, str, float]],
        num_samples: int,
    ) -> list[tuple[str, str, int]]:
        """Focus on lowest-scoring content."""
        sorted_items = sorted(content_items, key=lambda x: x[2])
        samples = sorted_items[:num_samples]
        # Priority based on inverse score (lower score = higher priority)
        return [(cid, text, max(1, int((1 - score) * 10))) for cid, text, score in samples]

    def _recent_sample(
        self,
        content_items: list[tuple[str, str, float]],
        num_samples: int,
    ) -> list[tuple[str, str, int]]:
        """Sample most recent items (assumes list is in chronological order)."""
        samples = content_items[-num_samples:]
        # Most recent gets highest priority
        return [(cid, text, len(samples) - i) for i, (cid, text, _) in enumerate(samples)]


class FeedbackCollector:
    """Collects and stores human evaluation feedback."""

    def __init__(self) -> None:
        self._tasks: dict[UUID, EvaluationTask] = {}
        self._results: dict[UUID, EvaluationResult] = {}
        self._calibration_data: list[CalibrationData] = []

    def create_task(
        self,
        project_id: UUID,
        content_id: str,
        content_type: ContentType,
        content_text: str,
        context: str = "",
        automated_scores: dict[str, float] | None = None,
        priority: int = 0,
        expires_at: datetime | None = None,
    ) -> EvaluationTask:
        """Create a new evaluation task."""
        task = EvaluationTask(
            id=uuid4(),
            project_id=project_id,
            content_id=content_id,
            content_type=content_type,
            content_text=content_text,
            context=context,
            automated_scores=automated_scores or {},
            priority=priority,
            expires_at=expires_at,
        )
        self._tasks[task.id] = task
        return task

    def get_task(self, task_id: UUID) -> EvaluationTask | None:
        """Get a task by ID."""
        return self._tasks.get(task_id)

    def get_pending_tasks(
        self,
        evaluator_id: str | None = None,
        limit: int = 10,
    ) -> list[EvaluationTask]:
        """Get pending tasks, optionally filtered by evaluator."""
        now = datetime.now(timezone.utc)
        pending = [
            t
            for t in self._tasks.values()
            if t.status == EvaluationStatus.PENDING
            and (t.expires_at is None or t.expires_at > now)
            and (evaluator_id is None or t.assigned_evaluator in (None, evaluator_id))
        ]
        # Sort by priority (descending) then created_at (ascending)
        pending.sort(key=lambda t: (-t.priority, t.created_at))
        return pending[:limit]

    def start_task(self, task_id: UUID, evaluator_id: str) -> bool:
        """Mark a task as in progress."""
        task = self._tasks.get(task_id)
        if not task or task.status != EvaluationStatus.PENDING:
            return False

        task.status = EvaluationStatus.IN_PROGRESS
        task.assigned_evaluator = evaluator_id
        task.started_at = datetime.now(timezone.utc)
        return True

    def submit_result(
        self,
        task_id: UUID,
        evaluator_id: str,
        scores: list[EvaluationScore],
        overall_feedback: str = "",
        strengths: list[str] | None = None,
        weaknesses: list[str] | None = None,
        suggestions: list[str] | None = None,
        time_spent_seconds: int = 0,
    ) -> EvaluationResult | None:
        """Submit evaluation results for a task."""
        task = self._tasks.get(task_id)
        if not task:
            return None

        if task.status not in (EvaluationStatus.PENDING, EvaluationStatus.IN_PROGRESS):
            return None

        result = EvaluationResult(
            task_id=task_id,
            evaluator_id=evaluator_id,
            scores=scores,
            overall_feedback=overall_feedback,
            strengths=strengths or [],
            weaknesses=weaknesses or [],
            suggestions=suggestions or [],
            time_spent_seconds=time_spent_seconds,
        )
        self._results[task_id] = result

        task.status = EvaluationStatus.COMPLETED
        task.completed_at = datetime.now(timezone.utc)

        # Record calibration data
        self._record_calibration(task, result)

        return result

    def _record_calibration(self, task: EvaluationTask, result: EvaluationResult) -> None:
        """Record calibration data from completed evaluation."""
        for score in result.scores:
            # Map dimension name to automated score key
            auto_key = score.dimension.value
            if auto_key in task.automated_scores:
                self._calibration_data.append(
                    CalibrationData(
                        dimension=score.dimension,
                        automated_score=task.automated_scores[auto_key],
                        human_score=score.score,
                        content_id=task.content_id,
                        evaluator_id=result.evaluator_id,
                    )
                )

    def get_result(self, task_id: UUID) -> EvaluationResult | None:
        """Get the result for a task."""
        return self._results.get(task_id)

    def get_results_for_project(self, project_id: UUID) -> list[EvaluationResult]:
        """Get all evaluation results for a project."""
        project_tasks = [t.id for t in self._tasks.values() if t.project_id == project_id]
        return [self._results[tid] for tid in project_tasks if tid in self._results]

    def get_calibration_data(
        self, dimension: EvaluationDimension | None = None
    ) -> list[CalibrationData]:
        """Get calibration data, optionally filtered by dimension."""
        if dimension is None:
            return list(self._calibration_data)
        return [d for d in self._calibration_data if d.dimension == dimension]


class ScoreCalibrator:
    """Calibrates automated scores based on human evaluations."""

    def __init__(self, min_samples: int = 10):
        self.min_samples = min_samples
        self._adjustments: dict[EvaluationDimension, float] = {}

    def analyze_calibration(self, data: list[CalibrationData]) -> CalibrationResult | None:
        """Analyze calibration data for a single dimension."""
        if len(data) < self.min_samples:
            return None

        dimension = data[0].dimension

        # Convert human scores (1-5) to 0-1 scale for comparison
        auto_scores = [d.automated_score for d in data]
        human_scores = [(d.human_score - 1) / 4 for d in data]  # Map 1-5 to 0-1

        # Calculate statistics
        correlation = self._pearson_correlation(auto_scores, human_scores)
        mae = sum(abs(a - h) for a, h in zip(auto_scores, human_scores)) / len(data)
        bias = sum(a - h for a, h in zip(auto_scores, human_scores)) / len(data)

        # Calculate recommended adjustment
        recommended_adjustment = -bias

        # Simple confidence interval based on sample size
        margin = 1.96 * (mae / (len(data) ** 0.5))
        confidence_interval = (
            recommended_adjustment - margin,
            recommended_adjustment + margin,
        )

        return CalibrationResult(
            dimension=dimension,
            sample_size=len(data),
            correlation=correlation,
            mean_absolute_error=mae,
            bias=bias,
            recommended_adjustment=recommended_adjustment,
            confidence_interval=confidence_interval,
        )

    def _pearson_correlation(self, x: list[float], y: list[float]) -> float:
        """Calculate Pearson correlation coefficient."""
        n = len(x)
        if n == 0:
            return 0.0

        mean_x = sum(x) / n
        mean_y = sum(y) / n

        numerator = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, y))
        denominator_x = sum((xi - mean_x) ** 2 for xi in x) ** 0.5
        denominator_y = sum((yi - mean_y) ** 2 for yi in y) ** 0.5

        if denominator_x == 0 or denominator_y == 0:
            return 0.0

        return numerator / (denominator_x * denominator_y)

    def calibrate_all(
        self, data: list[CalibrationData]
    ) -> dict[EvaluationDimension, CalibrationResult]:
        """Analyze calibration for all dimensions with sufficient data."""
        # Group by dimension
        by_dimension: dict[EvaluationDimension, list[CalibrationData]] = {}
        for d in data:
            if d.dimension not in by_dimension:
                by_dimension[d.dimension] = []
            by_dimension[d.dimension].append(d)

        results = {}
        for dimension, dimension_data in by_dimension.items():
            result = self.analyze_calibration(dimension_data)
            if result:
                results[dimension] = result
                self._adjustments[dimension] = result.recommended_adjustment

        return results

    def adjust_score(self, dimension: EvaluationDimension, score: float) -> float:
        """Apply calibration adjustment to an automated score."""
        adjustment = self._adjustments.get(dimension, 0.0)
        adjusted = score + adjustment
        return max(0.0, min(1.0, adjusted))  # Clamp to 0-1

    def get_adjustment(self, dimension: EvaluationDimension) -> float:
        """Get the current adjustment for a dimension."""
        return self._adjustments.get(dimension, 0.0)


class HumanEvaluationPipeline:
    """Main pipeline for human evaluation workflow."""

    def __init__(
        self,
        sampling_strategy: SamplingStrategy = SamplingStrategy.STRATIFIED,
        sample_rate: float = 0.1,
        min_calibration_samples: int = 10,
    ):
        self.selector = SampleSelector(
            strategy=sampling_strategy,
            sample_rate=sample_rate,
        )
        self.collector = FeedbackCollector()
        self.calibrator = ScoreCalibrator(min_samples=min_calibration_samples)

    def queue_for_evaluation(
        self,
        project_id: UUID,
        content_items: list[tuple[str, str, ContentType, float, str]],
        # (content_id, text, type, auto_score, context)
    ) -> list[EvaluationTask]:
        """Queue content items for human evaluation based on sampling strategy."""
        # Convert to format expected by selector
        for_selection = [(cid, text, score) for cid, text, _, score, _ in content_items]
        selected = self.selector.select_samples(for_selection)

        # Create lookup for full content info
        content_lookup = {
            cid: (text, ctype, score, ctx) for cid, text, ctype, score, ctx in content_items
        }

        tasks = []
        for content_id, _, priority in selected:
            text, content_type, auto_score, context = content_lookup[content_id]
            task = self.collector.create_task(
                project_id=project_id,
                content_id=content_id,
                content_type=content_type,
                content_text=text,
                context=context,
                automated_scores={"overall_quality": auto_score},
                priority=priority,
            )
            tasks.append(task)

        return tasks

    def get_pending_evaluations(
        self,
        evaluator_id: str | None = None,
        limit: int = 10,
    ) -> list[EvaluationTask]:
        """Get pending evaluation tasks."""
        return self.collector.get_pending_tasks(evaluator_id=evaluator_id, limit=limit)

    def start_evaluation(self, task_id: UUID, evaluator_id: str) -> bool:
        """Start working on an evaluation task."""
        return self.collector.start_task(task_id, evaluator_id)

    def submit_evaluation(
        self,
        task_id: UUID,
        evaluator_id: str,
        scores: list[tuple[EvaluationDimension, float, float, str]],
        # (dimension, score, confidence, notes)
        overall_feedback: str = "",
        strengths: list[str] | None = None,
        weaknesses: list[str] | None = None,
        suggestions: list[str] | None = None,
        time_spent_seconds: int = 0,
    ) -> EvaluationResult | None:
        """Submit evaluation results."""
        eval_scores = [
            EvaluationScore(
                dimension=dim,
                score=score,
                confidence=conf,
                notes=notes,
            )
            for dim, score, conf, notes in scores
        ]
        return self.collector.submit_result(
            task_id=task_id,
            evaluator_id=evaluator_id,
            scores=eval_scores,
            overall_feedback=overall_feedback,
            strengths=strengths,
            weaknesses=weaknesses,
            suggestions=suggestions,
            time_spent_seconds=time_spent_seconds,
        )

    def run_calibration(self) -> dict[EvaluationDimension, CalibrationResult]:
        """Run calibration analysis on collected data."""
        data = self.collector.get_calibration_data()
        return self.calibrator.calibrate_all(data)

    def get_calibrated_score(self, dimension: EvaluationDimension, score: float) -> float:
        """Get a calibrated score adjusted by human feedback."""
        return self.calibrator.adjust_score(dimension, score)

    def get_evaluation_stats(self, project_id: UUID | None = None) -> dict[str, int | float]:
        """Get statistics about evaluations."""
        tasks = list(self.collector._tasks.values())
        if project_id:
            tasks = [t for t in tasks if t.project_id == project_id]

        results = [
            self.collector.get_result(t.id) for t in tasks if self.collector.get_result(t.id)
        ]

        completed = len([t for t in tasks if t.status == EvaluationStatus.COMPLETED])
        pending = len([t for t in tasks if t.status == EvaluationStatus.PENDING])
        in_progress = len([t for t in tasks if t.status == EvaluationStatus.IN_PROGRESS])

        avg_score = 0.0
        if results:
            avg_score = sum(r.average_score for r in results) / len(results)

        return {
            "total_tasks": len(tasks),
            "completed": completed,
            "pending": pending,
            "in_progress": in_progress,
            "completion_rate": completed / len(tasks) if tasks else 0.0,
            "average_score": avg_score,
        }
