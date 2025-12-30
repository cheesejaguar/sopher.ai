"""Tests for human evaluation pipeline."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.services.human_eval import (
    CalibrationData,
    ContentType,
    EvaluationDimension,
    EvaluationResult,
    EvaluationScore,
    EvaluationStatus,
    EvaluationTask,
    FeedbackCollector,
    HumanEvaluationPipeline,
    SampleSelector,
    SamplingStrategy,
    ScoreCalibrator,
)


class TestEvaluationStatus:
    """Tests for EvaluationStatus enum."""

    def test_all_statuses_defined(self):
        """All expected statuses are defined."""
        assert EvaluationStatus.PENDING.value == "pending"
        assert EvaluationStatus.IN_PROGRESS.value == "in_progress"
        assert EvaluationStatus.COMPLETED.value == "completed"
        assert EvaluationStatus.SKIPPED.value == "skipped"
        assert EvaluationStatus.EXPIRED.value == "expired"

    def test_status_count(self):
        """Correct number of statuses."""
        assert len(EvaluationStatus) == 5


class TestEvaluationDimension:
    """Tests for EvaluationDimension enum."""

    def test_all_dimensions_defined(self):
        """All evaluation dimensions are defined."""
        dimensions = [
            "overall_quality",
            "readability",
            "engagement",
            "coherence",
            "style",
            "grammar",
            "pacing",
            "dialogue",
            "description",
            "character_voice",
        ]
        for dim in dimensions:
            assert hasattr(EvaluationDimension, dim.upper())

    def test_dimension_count(self):
        """Correct number of dimensions."""
        assert len(EvaluationDimension) == 10


class TestContentType:
    """Tests for ContentType enum."""

    def test_all_types_defined(self):
        """All content types are defined."""
        assert ContentType.CHAPTER.value == "chapter"
        assert ContentType.OUTLINE.value == "outline"
        assert ContentType.SCENE.value == "scene"
        assert ContentType.DIALOGUE_EXCHANGE.value == "dialogue_exchange"
        assert ContentType.DESCRIPTION_PASSAGE.value == "description_passage"


class TestSamplingStrategy:
    """Tests for SamplingStrategy enum."""

    def test_all_strategies_defined(self):
        """All sampling strategies are defined."""
        assert SamplingStrategy.RANDOM.value == "random"
        assert SamplingStrategy.STRATIFIED.value == "stratified"
        assert SamplingStrategy.LOW_SCORE.value == "low_score"
        assert SamplingStrategy.HIGH_VARIANCE.value == "high_variance"
        assert SamplingStrategy.RECENT.value == "recent"


class TestEvaluationScore:
    """Tests for EvaluationScore dataclass."""

    def test_create_valid_score(self):
        """Create a valid evaluation score."""
        score = EvaluationScore(
            dimension=EvaluationDimension.READABILITY,
            score=4.5,
            confidence=0.9,
            notes="Good flow",
        )
        assert score.dimension == EvaluationDimension.READABILITY
        assert score.score == 4.5
        assert score.confidence == 0.9
        assert score.notes == "Good flow"

    def test_score_default_values(self):
        """Score has correct defaults."""
        score = EvaluationScore(
            dimension=EvaluationDimension.GRAMMAR,
            score=3.0,
        )
        assert score.confidence == 1.0
        assert score.notes == ""

    def test_score_validation_lower_bound(self):
        """Score must be at least 1."""
        with pytest.raises(ValueError, match="Score must be between 1 and 5"):
            EvaluationScore(
                dimension=EvaluationDimension.STYLE,
                score=0.5,
            )

    def test_score_validation_upper_bound(self):
        """Score must be at most 5."""
        with pytest.raises(ValueError, match="Score must be between 1 and 5"):
            EvaluationScore(
                dimension=EvaluationDimension.STYLE,
                score=5.5,
            )

    def test_confidence_validation_lower_bound(self):
        """Confidence must be at least 0."""
        with pytest.raises(ValueError, match="Confidence must be between 0 and 1"):
            EvaluationScore(
                dimension=EvaluationDimension.STYLE,
                score=3.0,
                confidence=-0.1,
            )

    def test_confidence_validation_upper_bound(self):
        """Confidence must be at most 1."""
        with pytest.raises(ValueError, match="Confidence must be between 0 and 1"):
            EvaluationScore(
                dimension=EvaluationDimension.STYLE,
                score=3.0,
                confidence=1.5,
            )


class TestEvaluationTask:
    """Tests for EvaluationTask dataclass."""

    def test_create_task(self):
        """Create an evaluation task."""
        project_id = uuid4()
        task = EvaluationTask(
            id=uuid4(),
            project_id=project_id,
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Sample chapter content...",
        )
        assert task.project_id == project_id
        assert task.content_id == "chapter-1"
        assert task.content_type == ContentType.CHAPTER
        assert task.status == EvaluationStatus.PENDING
        assert task.assigned_evaluator is None

    def test_task_default_values(self):
        """Task has correct defaults."""
        task = EvaluationTask(
            id=uuid4(),
            project_id=uuid4(),
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Content",
        )
        assert task.context == ""
        assert task.status == EvaluationStatus.PENDING
        assert task.started_at is None
        assert task.completed_at is None
        assert task.expires_at is None
        assert task.automated_scores == {}
        assert task.priority == 0


class TestEvaluationResult:
    """Tests for EvaluationResult dataclass."""

    def test_create_result(self):
        """Create an evaluation result."""
        task_id = uuid4()
        scores = [
            EvaluationScore(EvaluationDimension.READABILITY, 4.0),
            EvaluationScore(EvaluationDimension.ENGAGEMENT, 3.5),
        ]
        result = EvaluationResult(
            task_id=task_id,
            evaluator_id="eval-1",
            scores=scores,
            overall_feedback="Good overall",
        )
        assert result.task_id == task_id
        assert result.evaluator_id == "eval-1"
        assert len(result.scores) == 2
        assert result.overall_feedback == "Good overall"

    def test_average_score_calculation(self):
        """Calculate average score correctly."""
        scores = [
            EvaluationScore(EvaluationDimension.READABILITY, 4.0, confidence=1.0),
            EvaluationScore(EvaluationDimension.ENGAGEMENT, 3.0, confidence=1.0),
        ]
        result = EvaluationResult(
            task_id=uuid4(),
            evaluator_id="eval-1",
            scores=scores,
        )
        assert result.average_score == 3.5

    def test_weighted_average_score(self):
        """Calculate weighted average correctly."""
        scores = [
            EvaluationScore(EvaluationDimension.READABILITY, 4.0, confidence=0.8),
            EvaluationScore(EvaluationDimension.ENGAGEMENT, 2.0, confidence=0.2),
        ]
        result = EvaluationResult(
            task_id=uuid4(),
            evaluator_id="eval-1",
            scores=scores,
        )
        # (4.0 * 0.8 + 2.0 * 0.2) / (0.8 + 0.2) = (3.2 + 0.4) / 1.0 = 3.6
        assert result.average_score == 3.6

    def test_empty_scores_average(self):
        """Handle empty scores gracefully."""
        result = EvaluationResult(
            task_id=uuid4(),
            evaluator_id="eval-1",
            scores=[],
        )
        assert result.average_score == 0.0

    def test_zero_weight_scores(self):
        """Handle zero confidence scores."""
        scores = [
            EvaluationScore(EvaluationDimension.READABILITY, 4.0, confidence=0.0),
        ]
        result = EvaluationResult(
            task_id=uuid4(),
            evaluator_id="eval-1",
            scores=scores,
        )
        assert result.average_score == 0.0


class TestCalibrationData:
    """Tests for CalibrationData dataclass."""

    def test_create_calibration_data(self):
        """Create calibration data point."""
        data = CalibrationData(
            dimension=EvaluationDimension.COHERENCE,
            automated_score=0.75,
            human_score=3.5,
            content_id="chapter-1",
            evaluator_id="eval-1",
        )
        assert data.dimension == EvaluationDimension.COHERENCE
        assert data.automated_score == 0.75
        assert data.human_score == 3.5


class TestSampleSelector:
    """Tests for SampleSelector class."""

    def test_random_sampling(self):
        """Random sampling selects correct number."""
        selector = SampleSelector(
            strategy=SamplingStrategy.RANDOM,
            sample_rate=0.5,
            min_samples=1,
            max_samples=10,
        )
        items = [(f"ch-{i}", f"text-{i}", 0.5) for i in range(10)]
        samples = selector.select_samples(items)
        assert len(samples) == 5

    def test_stratified_sampling(self):
        """Stratified sampling covers score ranges."""
        selector = SampleSelector(
            strategy=SamplingStrategy.STRATIFIED,
            sample_rate=0.5,
            min_samples=1,
        )
        # Items with varying scores
        items = [(f"ch-{i}", f"text-{i}", i / 10) for i in range(10)]
        samples = selector.select_samples(items)
        # Should have samples from different score strata
        assert len(samples) >= 1

    def test_low_score_sampling(self):
        """Low score sampling prioritizes low scores."""
        selector = SampleSelector(
            strategy=SamplingStrategy.LOW_SCORE,
            sample_rate=0.3,
        )
        items = [(f"ch-{i}", f"text-{i}", i / 10) for i in range(10)]
        samples = selector.select_samples(items)
        # First samples should be lowest scores
        assert samples[0][0] == "ch-0"

    def test_recent_sampling(self):
        """Recent sampling selects latest items."""
        selector = SampleSelector(
            strategy=SamplingStrategy.RECENT,
            sample_rate=0.3,
        )
        items = [(f"ch-{i}", f"text-{i}", 0.5) for i in range(10)]
        samples = selector.select_samples(items)
        # Should be from the end of the list
        sample_ids = [s[0] for s in samples]
        assert "ch-9" in sample_ids

    def test_empty_input(self):
        """Handle empty input gracefully."""
        selector = SampleSelector()
        samples = selector.select_samples([])
        assert samples == []

    def test_min_samples(self):
        """Respect minimum samples setting."""
        selector = SampleSelector(
            strategy=SamplingStrategy.RANDOM,
            sample_rate=0.01,  # Would give 0 samples
            min_samples=2,
        )
        items = [(f"ch-{i}", f"text-{i}", 0.5) for i in range(5)]
        samples = selector.select_samples(items)
        assert len(samples) >= 2

    def test_max_samples(self):
        """Respect maximum samples setting."""
        selector = SampleSelector(
            strategy=SamplingStrategy.RANDOM,
            sample_rate=1.0,  # Would give all samples
            max_samples=3,
        )
        items = [(f"ch-{i}", f"text-{i}", 0.5) for i in range(10)]
        samples = selector.select_samples(items)
        assert len(samples) <= 3


class TestFeedbackCollector:
    """Tests for FeedbackCollector class."""

    def test_create_task(self):
        """Create an evaluation task."""
        collector = FeedbackCollector()
        project_id = uuid4()
        task = collector.create_task(
            project_id=project_id,
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Chapter content...",
            automated_scores={"overall_quality": 0.75},
        )
        assert task.project_id == project_id
        assert task.content_id == "chapter-1"
        assert task.status == EvaluationStatus.PENDING
        assert task.automated_scores == {"overall_quality": 0.75}

    def test_get_task(self):
        """Retrieve a task by ID."""
        collector = FeedbackCollector()
        task = collector.create_task(
            project_id=uuid4(),
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Content",
        )
        retrieved = collector.get_task(task.id)
        assert retrieved is not None
        assert retrieved.id == task.id

    def test_get_nonexistent_task(self):
        """Get nonexistent task returns None."""
        collector = FeedbackCollector()
        result = collector.get_task(uuid4())
        assert result is None

    def test_get_pending_tasks(self):
        """Get list of pending tasks."""
        collector = FeedbackCollector()
        project_id = uuid4()

        for i in range(5):
            collector.create_task(
                project_id=project_id,
                content_id=f"chapter-{i}",
                content_type=ContentType.CHAPTER,
                content_text=f"Content {i}",
                priority=i,
            )

        pending = collector.get_pending_tasks(limit=3)
        assert len(pending) == 3
        # Should be sorted by priority (descending)
        assert pending[0].priority > pending[1].priority

    def test_get_pending_tasks_filter_by_evaluator(self):
        """Filter pending tasks by assigned evaluator."""
        collector = FeedbackCollector()

        task1 = collector.create_task(
            project_id=uuid4(),
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Content 1",
        )
        task1.assigned_evaluator = "eval-1"

        task2 = collector.create_task(
            project_id=uuid4(),
            content_id="chapter-2",
            content_type=ContentType.CHAPTER,
            content_text="Content 2",
        )
        task2.assigned_evaluator = "eval-2"

        pending = collector.get_pending_tasks(evaluator_id="eval-1")
        assert len(pending) == 1
        assert pending[0].assigned_evaluator == "eval-1"

    def test_get_pending_excludes_expired(self):
        """Expired tasks are not returned."""
        collector = FeedbackCollector()

        collector.create_task(
            project_id=uuid4(),
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Content",
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )

        pending = collector.get_pending_tasks()
        assert len(pending) == 0

    def test_start_task(self):
        """Start working on a task."""
        collector = FeedbackCollector()
        task = collector.create_task(
            project_id=uuid4(),
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Content",
        )

        result = collector.start_task(task.id, "eval-1")
        assert result is True

        updated = collector.get_task(task.id)
        assert updated.status == EvaluationStatus.IN_PROGRESS
        assert updated.assigned_evaluator == "eval-1"
        assert updated.started_at is not None

    def test_start_nonexistent_task(self):
        """Cannot start nonexistent task."""
        collector = FeedbackCollector()
        result = collector.start_task(uuid4(), "eval-1")
        assert result is False

    def test_start_already_started_task(self):
        """Cannot start already started task."""
        collector = FeedbackCollector()
        task = collector.create_task(
            project_id=uuid4(),
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Content",
        )
        collector.start_task(task.id, "eval-1")
        result = collector.start_task(task.id, "eval-2")
        assert result is False

    def test_submit_result(self):
        """Submit evaluation results."""
        collector = FeedbackCollector()
        task = collector.create_task(
            project_id=uuid4(),
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Content",
            automated_scores={"readability": 0.7},
        )
        collector.start_task(task.id, "eval-1")

        scores = [
            EvaluationScore(EvaluationDimension.READABILITY, 4.0),
            EvaluationScore(EvaluationDimension.ENGAGEMENT, 3.5),
        ]
        result = collector.submit_result(
            task_id=task.id,
            evaluator_id="eval-1",
            scores=scores,
            overall_feedback="Good chapter",
            strengths=["Engaging dialogue"],
            weaknesses=["Slow pacing"],
        )

        assert result is not None
        assert result.evaluator_id == "eval-1"
        assert len(result.scores) == 2

        updated_task = collector.get_task(task.id)
        assert updated_task.status == EvaluationStatus.COMPLETED

    def test_submit_result_for_pending_task(self):
        """Can submit directly for pending task."""
        collector = FeedbackCollector()
        task = collector.create_task(
            project_id=uuid4(),
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Content",
        )

        scores = [EvaluationScore(EvaluationDimension.STYLE, 3.0)]
        result = collector.submit_result(
            task_id=task.id,
            evaluator_id="eval-1",
            scores=scores,
        )

        assert result is not None

    def test_submit_result_for_completed_task(self):
        """Cannot submit for completed task."""
        collector = FeedbackCollector()
        task = collector.create_task(
            project_id=uuid4(),
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Content",
        )
        task.status = EvaluationStatus.COMPLETED

        result = collector.submit_result(
            task_id=task.id,
            evaluator_id="eval-1",
            scores=[],
        )

        assert result is None

    def test_get_result(self):
        """Retrieve evaluation result."""
        collector = FeedbackCollector()
        task = collector.create_task(
            project_id=uuid4(),
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Content",
        )

        scores = [EvaluationScore(EvaluationDimension.GRAMMAR, 4.5)]
        collector.submit_result(task.id, "eval-1", scores)

        result = collector.get_result(task.id)
        assert result is not None
        assert result.scores[0].score == 4.5

    def test_get_results_for_project(self):
        """Get all results for a project."""
        collector = FeedbackCollector()
        project_id = uuid4()

        for i in range(3):
            task = collector.create_task(
                project_id=project_id,
                content_id=f"chapter-{i}",
                content_type=ContentType.CHAPTER,
                content_text=f"Content {i}",
            )
            scores = [EvaluationScore(EvaluationDimension.STYLE, float(i + 2))]
            collector.submit_result(task.id, "eval-1", scores)

        results = collector.get_results_for_project(project_id)
        assert len(results) == 3

    def test_calibration_data_recorded(self):
        """Calibration data is recorded on result submission."""
        collector = FeedbackCollector()
        task = collector.create_task(
            project_id=uuid4(),
            content_id="chapter-1",
            content_type=ContentType.CHAPTER,
            content_text="Content",
            automated_scores={"readability": 0.7},
        )

        scores = [EvaluationScore(EvaluationDimension.READABILITY, 4.0)]
        collector.submit_result(task.id, "eval-1", scores)

        calibration = collector.get_calibration_data(EvaluationDimension.READABILITY)
        assert len(calibration) == 1
        assert calibration[0].automated_score == 0.7
        assert calibration[0].human_score == 4.0


class TestScoreCalibrator:
    """Tests for ScoreCalibrator class."""

    def test_analyze_calibration_insufficient_data(self):
        """Returns None when insufficient data."""
        calibrator = ScoreCalibrator(min_samples=10)
        data = [
            CalibrationData(
                dimension=EvaluationDimension.STYLE,
                automated_score=0.5,
                human_score=3.0,
                content_id="ch-1",
                evaluator_id="eval-1",
            )
        ]
        result = calibrator.analyze_calibration(data)
        assert result is None

    def test_analyze_calibration_sufficient_data(self):
        """Analyze calibration with sufficient data."""
        calibrator = ScoreCalibrator(min_samples=5)
        data = [
            CalibrationData(
                dimension=EvaluationDimension.STYLE,
                automated_score=i / 10,
                human_score=1 + (i / 10) * 4,  # Linear mapping
                content_id=f"ch-{i}",
                evaluator_id="eval-1",
            )
            for i in range(10)
        ]
        result = calibrator.analyze_calibration(data)
        assert result is not None
        assert result.dimension == EvaluationDimension.STYLE
        assert result.sample_size == 10

    def test_pearson_correlation_perfect(self):
        """Perfect positive correlation."""
        calibrator = ScoreCalibrator()
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        y = [1.0, 2.0, 3.0, 4.0, 5.0]
        corr = calibrator._pearson_correlation(x, y)
        assert abs(corr - 1.0) < 0.001

    def test_pearson_correlation_negative(self):
        """Perfect negative correlation."""
        calibrator = ScoreCalibrator()
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        y = [5.0, 4.0, 3.0, 2.0, 1.0]
        corr = calibrator._pearson_correlation(x, y)
        assert abs(corr - (-1.0)) < 0.001

    def test_pearson_correlation_empty(self):
        """Handle empty input."""
        calibrator = ScoreCalibrator()
        corr = calibrator._pearson_correlation([], [])
        assert corr == 0.0

    def test_calibrate_all(self):
        """Calibrate all dimensions with data."""
        calibrator = ScoreCalibrator(min_samples=5)
        data = []
        for dim in [EvaluationDimension.STYLE, EvaluationDimension.GRAMMAR]:
            for i in range(10):
                data.append(
                    CalibrationData(
                        dimension=dim,
                        automated_score=i / 10,
                        human_score=1 + (i / 10) * 4,
                        content_id=f"ch-{i}",
                        evaluator_id="eval-1",
                    )
                )

        results = calibrator.calibrate_all(data)
        assert EvaluationDimension.STYLE in results
        assert EvaluationDimension.GRAMMAR in results

    def test_adjust_score(self):
        """Apply calibration adjustment."""
        calibrator = ScoreCalibrator(min_samples=5)
        # Create data with bias (automated scores 0.1 higher than they should be)
        data = [
            CalibrationData(
                dimension=EvaluationDimension.STYLE,
                automated_score=(i / 10) + 0.1,  # Biased high
                human_score=1 + (i / 10) * 4,
                content_id=f"ch-{i}",
                evaluator_id="eval-1",
            )
            for i in range(10)
        ]
        calibrator.calibrate_all(data)

        # Adjustment should lower the score
        adjusted = calibrator.adjust_score(EvaluationDimension.STYLE, 0.8)
        assert adjusted < 0.8  # Should be reduced

    def test_adjust_score_clamping(self):
        """Adjustments are clamped to 0-1."""
        calibrator = ScoreCalibrator()
        calibrator._adjustments[EvaluationDimension.STYLE] = 0.5

        # Should clamp to 1.0
        assert calibrator.adjust_score(EvaluationDimension.STYLE, 0.9) == 1.0

        calibrator._adjustments[EvaluationDimension.STYLE] = -0.5
        # Should clamp to 0.0
        assert calibrator.adjust_score(EvaluationDimension.STYLE, 0.1) == 0.0

    def test_get_adjustment(self):
        """Get adjustment for dimension."""
        calibrator = ScoreCalibrator()
        calibrator._adjustments[EvaluationDimension.STYLE] = 0.15

        assert calibrator.get_adjustment(EvaluationDimension.STYLE) == 0.15
        assert calibrator.get_adjustment(EvaluationDimension.GRAMMAR) == 0.0


class TestHumanEvaluationPipeline:
    """Tests for HumanEvaluationPipeline class."""

    def test_pipeline_initialization(self):
        """Initialize pipeline with settings."""
        pipeline = HumanEvaluationPipeline(
            sampling_strategy=SamplingStrategy.LOW_SCORE,
            sample_rate=0.2,
            min_calibration_samples=5,
        )
        assert pipeline.selector.strategy == SamplingStrategy.LOW_SCORE
        assert pipeline.selector.sample_rate == 0.2

    def test_queue_for_evaluation(self):
        """Queue content for evaluation."""
        pipeline = HumanEvaluationPipeline(sample_rate=0.5)
        project_id = uuid4()

        content_items = [
            (f"ch-{i}", f"Chapter {i} content...", ContentType.CHAPTER, i / 10, "")
            for i in range(10)
        ]

        tasks = pipeline.queue_for_evaluation(project_id, content_items)
        assert len(tasks) >= 1
        assert all(t.project_id == project_id for t in tasks)

    def test_get_pending_evaluations(self):
        """Get pending evaluation tasks."""
        pipeline = HumanEvaluationPipeline(sample_rate=1.0)
        project_id = uuid4()

        content_items = [
            ("ch-1", "Content 1", ContentType.CHAPTER, 0.5, ""),
            ("ch-2", "Content 2", ContentType.CHAPTER, 0.5, ""),
        ]
        pipeline.queue_for_evaluation(project_id, content_items)

        pending = pipeline.get_pending_evaluations(limit=5)
        assert len(pending) == 2

    def test_start_evaluation(self):
        """Start an evaluation task."""
        pipeline = HumanEvaluationPipeline(sample_rate=1.0)
        project_id = uuid4()

        content_items = [("ch-1", "Content 1", ContentType.CHAPTER, 0.5, "")]
        tasks = pipeline.queue_for_evaluation(project_id, content_items)

        result = pipeline.start_evaluation(tasks[0].id, "eval-1")
        assert result is True

    def test_submit_evaluation(self):
        """Submit evaluation results."""
        pipeline = HumanEvaluationPipeline(sample_rate=1.0)
        project_id = uuid4()

        content_items = [("ch-1", "Content 1", ContentType.CHAPTER, 0.5, "")]
        tasks = pipeline.queue_for_evaluation(project_id, content_items)
        pipeline.start_evaluation(tasks[0].id, "eval-1")

        scores = [
            (EvaluationDimension.READABILITY, 4.0, 1.0, "Good"),
            (EvaluationDimension.ENGAGEMENT, 3.5, 0.8, "Okay"),
        ]
        result = pipeline.submit_evaluation(
            task_id=tasks[0].id,
            evaluator_id="eval-1",
            scores=scores,
            overall_feedback="Solid chapter",
        )

        assert result is not None
        assert len(result.scores) == 2

    def test_run_calibration(self):
        """Run calibration analysis."""
        pipeline = HumanEvaluationPipeline(
            sample_rate=1.0,
            min_calibration_samples=2,
        )
        project_id = uuid4()

        # Queue and evaluate content with automated scores
        for i in range(5):
            content_items = [
                (
                    f"ch-{i}",
                    f"Content {i}",
                    ContentType.CHAPTER,
                    i / 5,  # auto score
                    "",
                )
            ]
            tasks = pipeline.queue_for_evaluation(project_id, content_items)

            # Manually set automated score for the dimension we're testing
            task = pipeline.collector.get_task(tasks[0].id)
            task.automated_scores["overall_quality"] = i / 5

            scores = [(EvaluationDimension.OVERALL_QUALITY, 1 + i, 1.0, "")]
            pipeline.submit_evaluation(tasks[0].id, "eval-1", scores)

        results = pipeline.run_calibration()
        assert EvaluationDimension.OVERALL_QUALITY in results

    def test_get_calibrated_score(self):
        """Get calibrated score."""
        pipeline = HumanEvaluationPipeline()
        # Without calibration, should return original score
        score = pipeline.get_calibrated_score(EvaluationDimension.STYLE, 0.7)
        assert score == 0.7

    def test_get_evaluation_stats(self):
        """Get evaluation statistics."""
        pipeline = HumanEvaluationPipeline(sample_rate=1.0)
        project_id = uuid4()

        # Create and complete some tasks
        content_items = [
            ("ch-1", "Content 1", ContentType.CHAPTER, 0.5, ""),
            ("ch-2", "Content 2", ContentType.CHAPTER, 0.5, ""),
        ]
        tasks = pipeline.queue_for_evaluation(project_id, content_items)

        # Complete one task
        scores = [(EvaluationDimension.STYLE, 4.0, 1.0, "")]
        pipeline.submit_evaluation(tasks[0].id, "eval-1", scores)

        stats = pipeline.get_evaluation_stats(project_id)
        assert stats["total_tasks"] == 2
        assert stats["completed"] == 1
        assert stats["pending"] == 1
        assert stats["completion_rate"] == 0.5

    def test_get_evaluation_stats_all_projects(self):
        """Get stats across all projects."""
        pipeline = HumanEvaluationPipeline(sample_rate=1.0)

        # Create tasks in different projects
        for _ in range(3):
            content_items = [("ch-1", "Content", ContentType.CHAPTER, 0.5, "")]
            pipeline.queue_for_evaluation(uuid4(), content_items)

        stats = pipeline.get_evaluation_stats()  # No project filter
        assert stats["total_tasks"] == 3


class TestIntegration:
    """Integration tests for human evaluation workflow."""

    def test_full_evaluation_workflow(self):
        """Test complete evaluation workflow."""
        pipeline = HumanEvaluationPipeline(
            sampling_strategy=SamplingStrategy.STRATIFIED,
            sample_rate=0.5,
            min_calibration_samples=2,
        )

        project_id = uuid4()
        content_items = [
            (f"ch-{i}", f"Chapter {i} content...", ContentType.CHAPTER, i / 10, f"Context {i}")
            for i in range(10)
        ]

        # 1. Queue content for evaluation
        tasks = pipeline.queue_for_evaluation(project_id, content_items)
        assert len(tasks) >= 1

        # 2. Get pending tasks
        pending = pipeline.get_pending_evaluations("eval-1")
        assert len(pending) >= 1

        # 3. Start and complete evaluations
        for task in pending[:3]:
            pipeline.start_evaluation(task.id, "eval-1")

            # Set automated scores for calibration
            t = pipeline.collector.get_task(task.id)
            t.automated_scores["style"] = 0.6

            scores = [
                (EvaluationDimension.STYLE, 3.5, 0.9, "Good prose"),
                (EvaluationDimension.PACING, 4.0, 0.8, "Well paced"),
            ]
            result = pipeline.submit_evaluation(
                task_id=task.id,
                evaluator_id="eval-1",
                scores=scores,
                overall_feedback="Solid chapter overall",
                strengths=["Good dialogue", "Nice descriptions"],
                weaknesses=["Slow middle section"],
            )
            assert result is not None

        # 4. Check stats
        stats = pipeline.get_evaluation_stats(project_id)
        assert stats["completed"] >= 1

        # 5. Run calibration (may not have enough data for all dimensions)
        pipeline.run_calibration()
        # Calibration may be empty if not enough samples per dimension
        # but should not error

    def test_multiple_evaluators(self):
        """Test workflow with multiple evaluators."""
        pipeline = HumanEvaluationPipeline(sample_rate=1.0)
        project_id = uuid4()

        content_items = [
            ("ch-1", "Content 1", ContentType.CHAPTER, 0.5, ""),
            ("ch-2", "Content 2", ContentType.CHAPTER, 0.5, ""),
            ("ch-3", "Content 3", ContentType.CHAPTER, 0.5, ""),
        ]
        tasks = pipeline.queue_for_evaluation(project_id, content_items)

        # Assign to different evaluators
        for i, task in enumerate(tasks):
            evaluator = f"eval-{i % 2 + 1}"
            task = pipeline.collector.get_task(task.id)
            task.assigned_evaluator = evaluator

        # Each evaluator sees only their tasks
        eval1_tasks = pipeline.get_pending_evaluations("eval-1")
        eval2_tasks = pipeline.get_pending_evaluations("eval-2")

        assert len(eval1_tasks) + len(eval2_tasks) == len(tasks)

    def test_priority_ordering(self):
        """Test that high-priority tasks come first."""
        pipeline = HumanEvaluationPipeline(
            sampling_strategy=SamplingStrategy.LOW_SCORE,
            sample_rate=1.0,
        )
        project_id = uuid4()

        # Lower scores should get higher priority
        content_items = [
            ("ch-high", "High score content", ContentType.CHAPTER, 0.9, ""),
            ("ch-low", "Low score content", ContentType.CHAPTER, 0.1, ""),
            ("ch-mid", "Mid score content", ContentType.CHAPTER, 0.5, ""),
        ]
        pipeline.queue_for_evaluation(project_id, content_items)

        pending = pipeline.get_pending_evaluations()
        # Low score should be first (highest priority)
        assert pending[0].content_id == "ch-low"
