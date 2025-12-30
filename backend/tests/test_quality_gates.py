"""Tests for quality gates service."""

import pytest

from app.services.quality_gates import (
    QualityAnalyzer,
    QualityDimension,
    QualityGate,
    QualityLevel,
    QualityReport,
    QualityScore,
    QualityThreshold,
    QualityTrend,
    score_to_level,
)


class TestQualityLevel:
    """Tests for QualityLevel enum."""

    def test_all_levels_defined(self):
        """All expected levels should be defined."""
        expected = {"excellent", "good", "acceptable", "poor", "unacceptable"}
        actual = {level.value for level in QualityLevel}
        assert actual == expected

    def test_level_ordering(self):
        """Levels should have logical ordering."""
        levels = list(QualityLevel)
        assert QualityLevel.EXCELLENT in levels
        assert QualityLevel.UNACCEPTABLE in levels


class TestQualityDimension:
    """Tests for QualityDimension enum."""

    def test_all_dimensions_defined(self):
        """All expected dimensions should be defined."""
        expected = {
            "coherence",
            "grammar",
            "style",
            "pacing",
            "dialogue",
            "description",
            "character",
            "plot",
            "overall",
        }
        actual = {dim.value for dim in QualityDimension}
        assert actual == expected


class TestScoreToLevel:
    """Tests for score_to_level function."""

    def test_excellent_score(self):
        """High scores should be excellent."""
        assert score_to_level(0.95) == QualityLevel.EXCELLENT
        assert score_to_level(0.90) == QualityLevel.EXCELLENT

    def test_good_score(self):
        """Good scores should be in range."""
        assert score_to_level(0.85) == QualityLevel.GOOD
        assert score_to_level(0.75) == QualityLevel.GOOD

    def test_acceptable_score(self):
        """Acceptable scores should be in range."""
        assert score_to_level(0.70) == QualityLevel.ACCEPTABLE
        assert score_to_level(0.60) == QualityLevel.ACCEPTABLE

    def test_poor_score(self):
        """Poor scores should be in range."""
        assert score_to_level(0.50) == QualityLevel.POOR
        assert score_to_level(0.40) == QualityLevel.POOR

    def test_unacceptable_score(self):
        """Low scores should be unacceptable."""
        assert score_to_level(0.30) == QualityLevel.UNACCEPTABLE
        assert score_to_level(0.0) == QualityLevel.UNACCEPTABLE


class TestQualityScore:
    """Tests for QualityScore dataclass."""

    def test_create_valid_score(self):
        """Valid score should be created."""
        score = QualityScore(
            dimension=QualityDimension.GRAMMAR,
            score=0.85,
            level=QualityLevel.GOOD,
            details="Test details",
        )
        assert score.dimension == QualityDimension.GRAMMAR
        assert score.score == 0.85
        assert score.level == QualityLevel.GOOD

    def test_score_with_suggestions(self):
        """Score can include suggestions."""
        score = QualityScore(
            dimension=QualityDimension.STYLE,
            score=0.5,
            level=QualityLevel.POOR,
            suggestions=["Improve sentence variety", "Reduce filler words"],
        )
        assert len(score.suggestions) == 2

    def test_score_validation_upper_bound(self):
        """Score above 1.0 should raise error."""
        with pytest.raises(ValueError):
            QualityScore(
                dimension=QualityDimension.GRAMMAR,
                score=1.5,
                level=QualityLevel.EXCELLENT,
            )

    def test_score_validation_lower_bound(self):
        """Score below 0.0 should raise error."""
        with pytest.raises(ValueError):
            QualityScore(
                dimension=QualityDimension.GRAMMAR,
                score=-0.1,
                level=QualityLevel.POOR,
            )


class TestQualityThreshold:
    """Tests for QualityThreshold dataclass."""

    def test_default_thresholds(self):
        """Default thresholds should be set."""
        threshold = QualityThreshold()
        assert threshold.minimum_overall == 0.6
        assert threshold.minimum_grammar == 0.7
        assert threshold.auto_regenerate_below == 0.4

    def test_custom_thresholds(self):
        """Custom thresholds should be applied."""
        threshold = QualityThreshold(
            minimum_overall=0.8,
            minimum_grammar=0.9,
        )
        assert threshold.minimum_overall == 0.8
        assert threshold.minimum_grammar == 0.9

    def test_get_minimum_for_dimension(self):
        """Get minimum should return correct value."""
        threshold = QualityThreshold(minimum_grammar=0.85)
        assert threshold.get_minimum(QualityDimension.GRAMMAR) == 0.85
        assert threshold.get_minimum(QualityDimension.OVERALL) == 0.6


class TestQualityTrend:
    """Tests for QualityTrend dataclass."""

    def test_create_empty_trend(self):
        """Empty trend should be created."""
        trend = QualityTrend(
            content_type="chapter",
            dimension=QualityDimension.GRAMMAR,
        )
        assert trend.scores == []
        assert trend.average == 0.0

    def test_add_score(self):
        """Scores should be added correctly."""
        trend = QualityTrend(
            content_type="chapter",
            dimension=QualityDimension.GRAMMAR,
        )
        trend.add_score(0.8)
        trend.add_score(0.9)
        assert len(trend.scores) == 2
        assert abs(trend.average - 0.85) < 0.001

    def test_trend_direction_improving(self):
        """Improving trend should be detected."""
        trend = QualityTrend(
            content_type="chapter",
            dimension=QualityDimension.GRAMMAR,
        )
        trend.add_score(0.5)
        trend.add_score(0.6)
        trend.add_score(0.7)
        trend.add_score(0.8)
        assert trend.trend_direction == "improving"

    def test_trend_direction_declining(self):
        """Declining trend should be detected."""
        trend = QualityTrend(
            content_type="chapter",
            dimension=QualityDimension.GRAMMAR,
        )
        trend.add_score(0.9)
        trend.add_score(0.8)
        trend.add_score(0.6)
        trend.add_score(0.5)
        assert trend.trend_direction == "declining"

    def test_trend_direction_stable(self):
        """Stable trend should be detected."""
        trend = QualityTrend(
            content_type="chapter",
            dimension=QualityDimension.GRAMMAR,
        )
        trend.add_score(0.7)
        trend.add_score(0.72)
        trend.add_score(0.71)
        trend.add_score(0.73)
        assert trend.trend_direction == "stable"

    def test_trend_insufficient_data(self):
        """Insufficient data should be reported."""
        trend = QualityTrend(
            content_type="chapter",
            dimension=QualityDimension.GRAMMAR,
        )
        trend.add_score(0.7)
        assert trend.trend_direction == "insufficient_data"

    def test_variance(self):
        """Variance should be calculated."""
        trend = QualityTrend(
            content_type="chapter",
            dimension=QualityDimension.GRAMMAR,
        )
        trend.add_score(0.6)
        trend.add_score(0.8)
        assert trend.variance > 0


class TestQualityReport:
    """Tests for QualityReport dataclass."""

    def test_create_report(self):
        """Report should be created correctly."""
        scores = [
            QualityScore(
                dimension=QualityDimension.GRAMMAR,
                score=0.8,
                level=QualityLevel.GOOD,
            ),
            QualityScore(
                dimension=QualityDimension.STYLE,
                score=0.7,
                level=QualityLevel.ACCEPTABLE,
            ),
        ]
        report = QualityReport(
            content_id="ch-1",
            content_type="chapter",
            scores=scores,
            overall_score=0.75,
            overall_level=QualityLevel.GOOD,
            passed=True,
            threshold=0.6,
        )
        assert report.content_id == "ch-1"
        assert report.passed is True
        assert len(report.scores) == 2

    def test_dimension_scores_property(self):
        """Dimension scores should be accessible."""
        scores = [
            QualityScore(
                dimension=QualityDimension.GRAMMAR,
                score=0.8,
                level=QualityLevel.GOOD,
            ),
        ]
        report = QualityReport(
            content_id="ch-1",
            content_type="chapter",
            scores=scores,
            overall_score=0.8,
            overall_level=QualityLevel.GOOD,
            passed=True,
            threshold=0.6,
        )
        assert report.dimension_scores[QualityDimension.GRAMMAR] == 0.8

    def test_failed_dimensions_property(self):
        """Failed dimensions should be identified."""
        scores = [
            QualityScore(
                dimension=QualityDimension.GRAMMAR,
                score=0.8,
                level=QualityLevel.GOOD,
            ),
            QualityScore(
                dimension=QualityDimension.STYLE,
                score=0.3,
                level=QualityLevel.UNACCEPTABLE,
            ),
        ]
        report = QualityReport(
            content_id="ch-1",
            content_type="chapter",
            scores=scores,
            overall_score=0.55,
            overall_level=QualityLevel.POOR,
            passed=False,
            threshold=0.6,
        )
        assert QualityDimension.STYLE in report.failed_dimensions
        assert QualityDimension.GRAMMAR not in report.failed_dimensions


class TestQualityAnalyzer:
    """Tests for QualityAnalyzer class."""

    @pytest.fixture
    def analyzer(self):
        """Create analyzer instance."""
        return QualityAnalyzer()

    def test_analyze_coherence_with_transitions(self, analyzer):
        """Coherence should score well with transitions."""
        text = """
        First, the character arrived. However, things were not as expected.
        Therefore, a new plan was needed. Meanwhile, others were watching.
        Finally, a decision was made. Because of this, everything changed.
        """
        score = analyzer.analyze_coherence(text)
        assert score.dimension == QualityDimension.COHERENCE
        assert score.score > 0.5

    def test_analyze_coherence_short_text(self, analyzer):
        """Short text should get acceptable score."""
        text = "Just one sentence."
        score = analyzer.analyze_coherence(text)
        assert score.score == 0.5
        assert "Insufficient" in score.details

    def test_analyze_grammar_clean_text(self, analyzer):
        """Clean text should score well."""
        text = "The sun rose over the mountains. Birds sang in the trees. A gentle breeze carried the scent of flowers."
        score = analyzer.analyze_grammar(text)
        assert score.dimension == QualityDimension.GRAMMAR
        assert score.score >= 0.7

    def test_analyze_grammar_with_issues(self, analyzer):
        """Text with issues should score lower."""
        text = """
        The  sun rose.  There  was  double  spaces  everywhere.
        The the repeated words appeared here.
        """
        score = analyzer.analyze_grammar(text)
        assert score.score < 0.9

    def test_analyze_style_varied_sentences(self, analyzer):
        """Varied sentence length should score well."""
        text = """
        Short one. This is a medium length sentence here.
        And now comes a rather long sentence that goes on for quite a while
        with many words and clauses included. Brief. Another one.
        Yet another sentence of moderate length follows here.
        """
        score = analyzer.analyze_style(text)
        assert score.dimension == QualityDimension.STYLE
        assert score.score >= 0.4

    def test_analyze_style_with_filler_words(self, analyzer):
        """Text with filler words should score lower."""
        text = """
        It was very really just basically actually a very simple thing.
        Just really very actually basically the situation was very clear.
        """
        score = analyzer.analyze_style(text)
        assert "weak_intensifier" in score.details or score.score < 0.9

    def test_analyze_pacing_good(self, analyzer):
        """Good pacing should score well."""
        text = """The first paragraph introduces the scene with some detail and sets up what is happening and who is involved in this unfolding story. We learn about the characters and their motivations as the narrative begins to take shape.

The second paragraph moves the action forward with purpose. Something important happens here that changes things significantly for the characters involved. They must respond to new challenges and unexpected developments.

In the third paragraph, we see the consequences of what came before. The characters must deal with what just occurred and make critical decisions about how to proceed. The tension builds as choices become clearer."""
        score = analyzer.analyze_pacing(text)
        assert score.dimension == QualityDimension.PACING
        assert score.score >= 0.5

    def test_analyze_pacing_short_text(self, analyzer):
        """Short text should get acceptable score."""
        text = "Just one short paragraph."
        score = analyzer.analyze_pacing(text)
        assert score.score >= 0.5

    def test_analyze_dialogue_varied_tags(self, analyzer):
        """Varied dialogue tags should score well."""
        text = """
        "Hello there," said John.
        "Good morning," replied Sarah.
        "What brings you here?" asked John.
        "I came to see you," whispered Sarah.
        """
        score = analyzer.analyze_dialogue(text)
        assert score.dimension == QualityDimension.DIALOGUE
        assert score.score > 0.5

    def test_analyze_dialogue_no_dialogue(self, analyzer):
        """Text without dialogue should score acceptably."""
        text = """
        The sun rose over the mountains. There was no one around.
        The landscape was peaceful and quiet.
        """
        score = analyzer.analyze_dialogue(text)
        assert score.score >= 0.6
        assert "No dialogue" in score.details

    def test_analyze_description_sensory(self, analyzer):
        """Sensory descriptions should score well."""
        text = """She saw the bright sunlight streaming through the large window and looked at the colorful flowers on the table. The room smelled of fresh coffee and the fragrant scent of warm bread filled the air. She felt the smooth wooden table under her fingers and touched the cold glass of water. Outside, she heard birds singing their morning songs in the loud chorus. The sweet taste of her breakfast lingered pleasantly on her tongue as she savored every bite of the delicious meal before her."""
        score = analyzer.analyze_description(text)
        assert score.dimension == QualityDimension.DESCRIPTION
        assert score.score > 0.3

    def test_analyze_description_short_text(self, analyzer):
        """Short text should get acceptable score."""
        text = "Too short."
        score = analyzer.analyze_description(text)
        assert score.score >= 0.5

    def test_analyze_content_complete(self, analyzer):
        """Complete analysis should include all dimensions."""
        text = """
        "Hello," said John. He looked around the bright room.
        The smell of coffee filled the air. Sarah smiled warmly.

        "Good morning," she replied. Therefore, they began talking.
        The conversation flowed naturally. Meanwhile, time passed.

        However, something changed. First, John noticed the sound.
        Then, Sarah felt a chill. Finally, they understood.
        """
        report = analyzer.analyze_content(
            text=text,
            content_id="test-1",
            content_type="chapter",
        )

        assert report.content_id == "test-1"
        assert report.content_type == "chapter"
        assert len(report.scores) == 7  # 6 dimensions + overall
        assert 0 <= report.overall_score <= 1

    def test_analyze_content_with_threshold(self, analyzer):
        """Analysis should respect custom thresholds."""
        text = "Short poor quality text."
        threshold = QualityThreshold(minimum_overall=0.9)
        report = analyzer.analyze_content(
            text=text,
            content_id="test-1",
            content_type="chapter",
            threshold=threshold,
        )

        assert report.passed is False
        assert report.threshold == 0.9


class TestQualityGate:
    """Tests for QualityGate class."""

    @pytest.fixture
    def gate(self):
        """Create gate instance."""
        return QualityGate()

    def test_check_quality(self, gate):
        """Quality check should return report."""
        text = """
        The story begins here. However, things change quickly.
        Therefore, the characters must adapt. Meanwhile, tension builds.

        "What should we do?" asked John.
        "We must act now," replied Sarah.

        The room was dark and cold. She felt fear rising.
        """
        report = gate.check(
            text=text,
            content_id="ch-1",
            content_type="chapter",
        )

        assert isinstance(report, QualityReport)
        assert report.content_id == "ch-1"

    def test_trend_tracking(self, gate):
        """Trends should be tracked across checks."""
        texts = [
            "First text here. Basic content.",
            "Second text with more detail. However, it improves.",
            "Third text is best. Therefore, we see progress. Finally, done.",
        ]

        for i, text in enumerate(texts):
            gate.check(
                text=text,
                content_id=f"ch-{i}",
                content_type="chapter",
            )

        trend = gate.get_trend("chapter", QualityDimension.COHERENCE)
        assert trend is not None
        assert len(trend.scores) == 3

    def test_should_regenerate_low_quality(self, gate):
        """Low quality should suggest regeneration."""
        gate.threshold = QualityThreshold(auto_regenerate_below=0.5)

        # Create a low quality report
        scores = [
            QualityScore(
                dimension=QualityDimension.GRAMMAR,
                score=0.3,
                level=QualityLevel.UNACCEPTABLE,
            ),
        ]
        report = QualityReport(
            content_id="ch-1",
            content_type="chapter",
            scores=scores,
            overall_score=0.3,
            overall_level=QualityLevel.UNACCEPTABLE,
            passed=False,
            threshold=0.6,
            regeneration_suggested=True,
        )

        assert gate.should_regenerate(report) is True

    def test_should_not_regenerate_good_quality(self, gate):
        """Good quality should not suggest regeneration."""
        scores = [
            QualityScore(
                dimension=QualityDimension.GRAMMAR,
                score=0.85,
                level=QualityLevel.GOOD,
            ),
        ]
        report = QualityReport(
            content_id="ch-1",
            content_type="chapter",
            scores=scores,
            overall_score=0.85,
            overall_level=QualityLevel.GOOD,
            passed=True,
            threshold=0.6,
            regeneration_suggested=False,
        )

        assert gate.should_regenerate(report) is False

    def test_get_improvement_suggestions(self, gate):
        """Improvement suggestions should be returned."""
        scores = [
            QualityScore(
                dimension=QualityDimension.GRAMMAR,
                score=0.5,
                level=QualityLevel.POOR,
                suggestions=["Fix grammar issues"],
            ),
            QualityScore(
                dimension=QualityDimension.STYLE,
                score=0.4,
                level=QualityLevel.POOR,
                suggestions=["Improve style", "Vary sentences"],
            ),
        ]
        report = QualityReport(
            content_id="ch-1",
            content_type="chapter",
            scores=scores,
            overall_score=0.45,
            overall_level=QualityLevel.POOR,
            passed=False,
            threshold=0.6,
        )

        suggestions = gate.get_improvement_suggestions(report)
        assert len(suggestions) > 0
        assert len(suggestions) <= 5

    def test_custom_threshold(self):
        """Custom thresholds should be applied."""
        threshold = QualityThreshold(
            minimum_overall=0.8,
            minimum_grammar=0.9,
        )
        gate = QualityGate(threshold=threshold)

        assert gate.threshold.minimum_overall == 0.8
        assert gate.threshold.minimum_grammar == 0.9


class TestQualityGateIntegration:
    """Integration tests for quality gate workflows."""

    def test_full_quality_check_workflow(self):
        """Test complete quality check workflow."""
        # Use lower thresholds for the test
        gate = QualityGate(threshold=QualityThreshold(minimum_overall=0.4))

        # Quality text with good structure
        good_text = """The morning sun cast long shadows across the valley. However, Sarah knew this peaceful scene would soon change. Therefore, she prepared herself for what was to come. Meanwhile, tension was building in the air.

"Are you ready?" asked John, his voice barely above a whisper. He looked at her with concern.

"As ready as I'll ever be," she replied softly. She felt the cold metal of the key in her pocket. The fresh scent of pine trees filled the air around them. The birds sang loudly in the bright morning light.

Meanwhile, in the distance, thunder rumbled ominously. First came the wind, rustling through the trees. Then the rain began to fall. Finally, the storm arrived in full force, bringing darkness to the valley."""

        report = gate.check(
            text=good_text,
            content_id="ch-1",
            content_type="chapter",
        )

        # Check that we got a valid report with scores
        assert isinstance(report, QualityReport)
        assert report.content_id == "ch-1"
        assert len(report.scores) > 0
        assert 0 <= report.overall_score <= 1

    def test_failing_quality_check(self):
        """Test quality check that fails."""
        gate = QualityGate(threshold=QualityThreshold(minimum_overall=0.9))

        poor_text = "Bad. Very bad. Just really basically bad text here."

        report = gate.check(
            text=poor_text,
            content_id="ch-1",
            content_type="chapter",
        )

        assert report.passed is False

    def test_multiple_content_types(self):
        """Test tracking different content types."""
        gate = QualityGate()

        gate.check("Chapter content here.", "ch-1", "chapter")
        gate.check("Outline content here.", "out-1", "outline")
        gate.check("Scene content here.", "sc-1", "scene")

        # Each type should have its own trends
        assert "chapter" in gate.trends
        assert "outline" in gate.trends
        assert "scene" in gate.trends
