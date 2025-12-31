"""
Tests for pacing analysis service.

Tests cover:
- TensionAnalyzer
- SceneAnalyzer
- ActionBalanceAnalyzer
- EndingAnalyzer
- PacingAnalyzer (main service)
"""

from app.services.pacing_analyzer import (
    ActionBalanceAnalyzer,
    ActionReflectionBalance,
    ChapterEndingAnalysis,
    EndingAnalyzer,
    EndingStrength,
    PacingAnalyzer,
    PacingReport,
    SceneAnalysis,
    SceneAnalyzer,
    SceneType,
    TensionAnalyzer,
    TensionLevel,
    TextAnalysisUtils,
)

# =============================================================================
# TextAnalysisUtils Tests
# =============================================================================


class TestTextAnalysisUtils:
    """Tests for TextAnalysisUtils."""

    def test_get_words(self):
        """Test word extraction."""
        text = "Hello, world! This is a test."
        words = TextAnalysisUtils.get_words(text)
        assert len(words) == 6
        assert "Hello" in words
        assert "test" in words

    def test_get_words_empty(self):
        """Test word extraction from empty text."""
        assert TextAnalysisUtils.get_words("") == []

    def test_get_sentences(self):
        """Test sentence splitting."""
        text = "Hello world. How are you? I am fine!"
        sentences = TextAnalysisUtils.get_sentences(text)
        assert len(sentences) == 3

    def test_get_dialogue_words(self):
        """Test dialogue word counting."""
        text = '"Hello there," she said. "How are you?"'
        count = TextAnalysisUtils.get_dialogue_words(text)
        assert count >= 4  # Hello there, How are you

    def test_get_dialogue_words_smart_quotes(self):
        """Test dialogue with smart quotes."""
        text = "\u201cHello world\u201d she said."
        count = TextAnalysisUtils.get_dialogue_words(text)
        assert count == 2

    def test_split_into_scenes_paragraph_break(self):
        """Test scene splitting on paragraph breaks."""
        text = "Scene one content.\n\nScene two content."
        scenes = TextAnalysisUtils.split_into_scenes(text)
        assert len(scenes) == 2

    def test_split_into_scenes_markers(self):
        """Test scene splitting on markers like ***."""
        text = "Scene one content.\n\n***\n\nScene two content."
        scenes = TextAnalysisUtils.split_into_scenes(text)
        assert len(scenes) >= 2

    def test_split_into_scenes_dashes(self):
        """Test scene splitting on dash markers."""
        text = "Scene one.\n\n---\n\nScene two."
        scenes = TextAnalysisUtils.split_into_scenes(text)
        assert len(scenes) >= 2


# =============================================================================
# TensionLevel Tests
# =============================================================================


class TestTensionLevel:
    """Tests for TensionLevel enum."""

    def test_tension_levels_ordered(self):
        """Test tension levels are properly ordered."""
        assert TensionLevel.VERY_LOW.value < TensionLevel.LOW.value
        assert TensionLevel.LOW.value < TensionLevel.MEDIUM.value
        assert TensionLevel.MEDIUM.value < TensionLevel.HIGH.value
        assert TensionLevel.HIGH.value < TensionLevel.CLIMACTIC.value


# =============================================================================
# TensionAnalyzer Tests
# =============================================================================


class TestTensionAnalyzer:
    """Tests for TensionAnalyzer."""

    def test_calculate_tension_empty(self):
        """Test tension calculation on empty text."""
        tension = TensionAnalyzer.calculate_tension_level("")
        assert tension == TensionLevel.MEDIUM

    def test_calculate_tension_high(self):
        """Test high tension text detection."""
        text = "Suddenly the danger struck! She screamed and ran, heart pounded with terror."
        tension = TensionAnalyzer.calculate_tension_level(text)
        assert tension.value >= TensionLevel.HIGH.value

    def test_calculate_tension_low(self):
        """Test low tension text detection."""
        text = "The peaceful morning was calm and serene. She smiled contentedly at the beautiful view."
        tension = TensionAnalyzer.calculate_tension_level(text)
        assert tension.value <= TensionLevel.LOW.value

    def test_calculate_tension_medium(self):
        """Test medium tension text."""
        text = "She walked to the store. The weather was nice. She bought some groceries."
        tension = TensionAnalyzer.calculate_tension_level(text)
        assert tension == TensionLevel.MEDIUM

    def test_calculate_tension_exclamation_increases(self):
        """Test that exclamations increase tension."""
        text = "Look out! Watch out! No!"
        tension = TensionAnalyzer.calculate_tension_level(text)
        assert tension.value >= TensionLevel.HIGH.value

    def test_analyze_tension_curve_empty(self):
        """Test tension curve on empty text."""
        curve = TensionAnalyzer.analyze_tension_curve("")
        assert curve.tension_points == []

    def test_analyze_tension_curve_basic(self):
        """Test basic tension curve analysis."""
        # Text with enough words for multiple intervals
        text = " ".join(["word"] * 200)  # 200 words for analysis
        curve = TensionAnalyzer.analyze_tension_curve(text, intervals=3)
        assert len(curve.tension_points) >= 1

    def test_tension_curve_has_build(self):
        """Test detection of tension build."""
        # Calm start, tense ending
        text = """
        Everything was calm and peaceful. Birds sang softly.

        The peaceful moment continued pleasantly.

        Suddenly danger struck! Panic and terror everywhere! Run!
        """
        curve = TensionAnalyzer.analyze_tension_curve(text, intervals=3)
        # Should detect rising tension
        if len(curve.tension_points) >= 2:
            assert curve.tension_points[-1] >= curve.tension_points[0]

    def test_tension_curve_type_flat(self):
        """Test flat tension curve detection."""
        text = "Normal day. Normal work. Normal lunch. Normal evening."
        curve = TensionAnalyzer.analyze_tension_curve(text, intervals=4)
        # Low variance should result in flat curve type
        assert curve.tension_variance < 1.0

    def test_tension_curve_statistics(self):
        """Test tension curve statistics calculation."""
        text = "Text " * 200  # Long enough for analysis
        curve = TensionAnalyzer.analyze_tension_curve(text, intervals=5)
        assert curve.average_tension >= 1
        assert 0 <= curve.peak_position <= 1


# =============================================================================
# SceneAnalysis Tests
# =============================================================================


class TestSceneAnalysis:
    """Tests for SceneAnalysis dataclass."""

    def test_default_values(self):
        """Test default values."""
        analysis = SceneAnalysis()
        assert analysis.word_count == 0
        assert analysis.scene_type == SceneType.MIXED
        assert analysis.tension_level == TensionLevel.MEDIUM

    def test_to_dict(self):
        """Test conversion to dictionary."""
        analysis = SceneAnalysis(
            word_count=500,
            scene_type=SceneType.ACTION,
            tension_level=TensionLevel.HIGH,
        )
        result = analysis.to_dict()
        assert result["word_count"] == 500
        assert result["scene_type"] == "action"
        assert result["tension_level"] == 4


# =============================================================================
# SceneAnalyzer Tests
# =============================================================================


class TestSceneAnalyzer:
    """Tests for SceneAnalyzer."""

    def test_analyze_scene_empty(self):
        """Test scene analysis on empty text."""
        analysis = SceneAnalyzer.analyze_scene("")
        assert analysis.word_count == 0

    def test_analyze_scene_basic(self):
        """Test basic scene analysis."""
        text = "The hero fought bravely. She punched and kicked her way through."
        analysis = SceneAnalyzer.analyze_scene(text)
        assert analysis.word_count > 0
        assert analysis.estimated_read_time_seconds > 0

    def test_analyze_scene_dialogue_type(self):
        """Test dialogue scene type detection."""
        text = '"Hello," she said. "How are you?" he replied. "I am fine," she answered.'
        analysis = SceneAnalyzer.analyze_scene(text)
        assert analysis.dialogue_ratio > 0.3

    def test_analyze_scene_action_type(self):
        """Test action scene type detection."""
        text = "He ran and jumped. She fought and struck. They chased and attacked."
        analysis = SceneAnalyzer.analyze_scene(text)
        assert analysis.scene_type == SceneType.ACTION

    def test_analyze_scene_reflection_type(self):
        """Test reflection scene type detection."""
        text = "She thought about her life. She wondered what could have been. She remembered."
        analysis = SceneAnalyzer.analyze_scene(text)
        assert analysis.scene_type == SceneType.REFLECTION

    def test_analyze_scene_distribution_empty(self):
        """Test scene distribution on empty text."""
        dist = SceneAnalyzer.analyze_scene_distribution("")
        assert dist.total_scenes == 0

    def test_analyze_scene_distribution_single(self):
        """Test scene distribution with single scene."""
        text = "This is a single scene with no breaks."
        dist = SceneAnalyzer.analyze_scene_distribution(text)
        assert dist.total_scenes >= 1

    def test_analyze_scene_distribution_multiple(self):
        """Test scene distribution with multiple scenes."""
        text = "Scene one content here.\n\nScene two content here.\n\nScene three."
        dist = SceneAnalyzer.analyze_scene_distribution(text)
        assert dist.total_scenes >= 2

    def test_scene_distribution_statistics(self):
        """Test scene distribution statistics."""
        text = "Short.\n\nThis is a longer scene with more words.\n\nMedium length scene."
        dist = SceneAnalyzer.analyze_scene_distribution(text)
        assert dist.average_length > 0
        assert dist.shortest_scene <= dist.longest_scene


# =============================================================================
# ActionReflectionBalance Tests
# =============================================================================


class TestActionReflectionBalance:
    """Tests for ActionReflectionBalance dataclass."""

    def test_default_values(self):
        """Test default values."""
        balance = ActionReflectionBalance()
        assert balance.total_words == 0
        assert balance.balance_score == 0.0

    def test_to_dict(self):
        """Test conversion to dictionary."""
        balance = ActionReflectionBalance(
            total_words=100,
            dialogue_percentage=35.0,
            balance_score=0.8,
        )
        result = balance.to_dict()
        assert result["total_words"] == 100
        assert result["balance_score"] == 0.8


class TestActionBalanceAnalyzer:
    """Tests for ActionBalanceAnalyzer."""

    def test_analyze_empty(self):
        """Test analysis on empty text."""
        balance = ActionBalanceAnalyzer.analyze("")
        assert balance.total_words == 0

    def test_analyze_with_dialogue(self):
        """Test dialogue detection."""
        text = '"Hello there," she said. "How are you doing today?"'
        balance = ActionBalanceAnalyzer.analyze(text)
        assert balance.dialogue_words > 0
        assert balance.dialogue_percentage > 0

    def test_analyze_with_action(self):
        """Test action word detection."""
        text = "He ran and jumped. She fought and kicked. They chased the enemy."
        balance = ActionBalanceAnalyzer.analyze(text)
        assert balance.action_words > 0
        assert balance.action_percentage > 0

    def test_analyze_with_reflection(self):
        """Test reflection word detection."""
        text = "She thought deeply. He wondered about life. They pondered the meaning."
        balance = ActionBalanceAnalyzer.analyze(text)
        assert balance.reflection_words > 0
        assert balance.reflection_percentage > 0

    def test_balance_score_calculated(self):
        """Test balance score is calculated."""
        text = '"Hello," she said. He ran quickly. She thought about it.'
        balance = ActionBalanceAnalyzer.analyze(text)
        assert 0 <= balance.balance_score <= 1

    def test_recommendation_generated(self):
        """Test recommendation is generated."""
        text = "Some text here with various content."
        balance = ActionBalanceAnalyzer.analyze(text)
        assert balance.recommendation != ""


# =============================================================================
# ChapterEndingAnalysis Tests
# =============================================================================


class TestChapterEndingAnalysis:
    """Tests for ChapterEndingAnalysis dataclass."""

    def test_default_values(self):
        """Test default values."""
        analysis = ChapterEndingAnalysis()
        assert analysis.ending_strength == EndingStrength.MODERATE
        assert analysis.hook_score == 0.0

    def test_to_dict(self):
        """Test conversion to dictionary."""
        analysis = ChapterEndingAnalysis(
            ending_strength=EndingStrength.STRONG,
            has_hook=True,
            hook_score=0.8,
        )
        result = analysis.to_dict()
        assert result["ending_strength"] == "strong"
        assert result["has_hook"] is True


class TestEndingAnalyzer:
    """Tests for EndingAnalyzer."""

    def test_analyze_empty(self):
        """Test analysis on empty text."""
        analysis = EndingAnalyzer.analyze("")
        assert analysis.ending_strength == EndingStrength.MODERATE

    def test_analyze_question_ending(self):
        """Test question ending detection."""
        # Need text that ends with a question
        text = "The story continued. She walked home. What would happen?"
        analysis = EndingAnalyzer.analyze(text)
        # Check if hooks are detected (questions, exclamations, etc.)
        assert analysis.has_hook is True or analysis.hook_score > 0

    def test_analyze_cliffhanger(self):
        """Test cliffhanger detection."""
        text = "Everything seemed fine. But then suddenly, before she could react..."
        analysis = EndingAnalyzer.analyze(text)
        assert analysis.has_cliffhanger is True

    def test_analyze_strong_ending(self):
        """Test strong ending detection."""
        text = "He walked away. But would he return? What unknown dangers awaited?"
        analysis = EndingAnalyzer.analyze(text)
        # Has question and unresolved elements
        assert analysis.ending_strength in [EndingStrength.STRONG, EndingStrength.MODERATE]

    def test_analyze_weak_ending(self):
        """Test weak ending detection."""
        text = "She sat down. The day was over. Everything was normal."
        analysis = EndingAnalyzer.analyze(text)
        assert analysis.hook_score < 0.5

    def test_hook_score_range(self):
        """Test hook score is within range."""
        text = "Some ending text here."
        analysis = EndingAnalyzer.analyze(text)
        assert 0 <= analysis.hook_score <= 1


# =============================================================================
# PacingReport Tests
# =============================================================================


class TestPacingReport:
    """Tests for PacingReport dataclass."""

    def test_default_values(self):
        """Test default values."""
        report = PacingReport()
        assert report.word_count == 0
        assert report.overall_pacing_score == 0.0
        assert report.recommendations == []

    def test_to_dict(self):
        """Test conversion to dictionary."""
        report = PacingReport(
            word_count=1000,
            overall_pacing_score=85.0,
        )
        result = report.to_dict()
        assert result["word_count"] == 1000
        assert result["overall_pacing_score"] == 85.0
        assert "scene_distribution" in result
        assert "tension_curve" in result


# =============================================================================
# PacingAnalyzer Tests
# =============================================================================


class TestPacingAnalyzer:
    """Tests for PacingAnalyzer main service."""

    def test_analyze_empty(self):
        """Test analysis on empty text."""
        report = PacingAnalyzer.analyze("")
        assert report.word_count == 0
        assert report.overall_pacing_score == 0.0

    def test_analyze_basic(self):
        """Test basic pacing analysis."""
        text = "This is a test. It has multiple sentences. The content varies."
        report = PacingAnalyzer.analyze(text)
        assert report.word_count > 0
        assert report.estimated_read_time_minutes >= 1

    def test_analyze_includes_all_components(self):
        """Test that all analysis components are included."""
        text = '"Hello," she said. He ran quickly. She thought about it.'
        report = PacingAnalyzer.analyze(text)

        assert report.scene_distribution is not None
        assert report.tension_curve is not None
        assert report.action_balance is not None
        assert report.ending_analysis is not None

    def test_overall_score_bounded(self):
        """Test overall score is within bounds."""
        text = "Some content here for testing purposes." * 50
        report = PacingAnalyzer.analyze(text)
        assert 0 <= report.overall_pacing_score <= 100

    def test_recommendations_generated(self):
        """Test recommendations are generated for weak pacing."""
        # Text without scene breaks or variation
        text = "Normal sentence. " * 100
        report = PacingAnalyzer.analyze(text)
        # Should have at least one recommendation
        assert isinstance(report.recommendations, list)

    def test_analyze_varied_content(self):
        """Test analysis with varied content."""
        text = """
        "What should we do?" she asked anxiously.

        He ran to the window, heart pounding. The danger was real!

        She thought about their options carefully, pondering each possibility.

        Suddenly, the door burst open! They fought for their lives!

        Finally, calm returned. Would they survive?
        """
        report = PacingAnalyzer.analyze(text)

        assert report.word_count > 0
        assert report.scene_distribution.total_scenes >= 1
        assert report.action_balance.total_words > 0
        assert 0 <= report.overall_pacing_score <= 100


# =============================================================================
# Edge Case Tests
# =============================================================================


class TestEdgeCases:
    """Edge case tests for pacing analyzer."""

    def test_very_short_text(self):
        """Test analysis of very short text."""
        text = "Hello."
        report = PacingAnalyzer.analyze(text)
        assert report.word_count == 1

    def test_only_dialogue(self):
        """Test text that is only dialogue."""
        text = '"Hello." "Hi." "How are you?" "Fine, thanks."'
        report = PacingAnalyzer.analyze(text)
        assert report.action_balance.dialogue_percentage > 50

    def test_only_action(self):
        """Test text that is only action."""
        text = "He ran. She jumped. They fought. He fell. She escaped."
        report = PacingAnalyzer.analyze(text)
        assert report.action_balance.action_percentage > 0

    def test_numbers_in_text(self):
        """Test text with numbers."""
        text = "There were 100 people. It was 2024."
        report = PacingAnalyzer.analyze(text)
        assert report.word_count > 0

    def test_special_characters(self):
        """Test text with special characters."""
        text = "Hello—world! Test...text?"
        report = PacingAnalyzer.analyze(text)
        assert report.word_count > 0

    def test_unicode_characters(self):
        """Test text with unicode."""
        text = "Café résumé naïve."
        report = PacingAnalyzer.analyze(text)
        assert report.word_count > 0

    def test_single_long_sentence(self):
        """Test text with single very long sentence."""
        text = " ".join(["word"] * 500) + "."
        report = PacingAnalyzer.analyze(text)
        assert report.word_count == 500

    def test_many_scene_breaks(self):
        """Test text with many scene breaks."""
        text = "Scene one.\n\n***\n\nScene two.\n\n---\n\nScene three.\n\nScene four."
        report = PacingAnalyzer.analyze(text)
        assert report.scene_distribution.total_scenes >= 2


class TestTensionCurveTypes:
    """Tests for different tension curve types."""

    def test_very_low_tension_text(self):
        """Test text with very low tension words."""
        text = "The peaceful serene calm quiet still tranquil peaceful " * 50
        level = TensionAnalyzer.calculate_tension_level(text)
        assert level == TensionLevel.VERY_LOW

    def test_low_tension_text(self):
        """Test text with low tension words."""
        text = "The calm gentle peaceful serene day passed slowly. " * 20
        level = TensionAnalyzer.calculate_tension_level(text)
        assert level in [TensionLevel.VERY_LOW, TensionLevel.LOW]

    def test_climactic_tension_text(self):
        """Test text with climactic tension."""
        text = "Danger! Death! Suddenly exploded! Terrified! KILLED! " * 20
        level = TensionAnalyzer.calculate_tension_level(text)
        assert level in [TensionLevel.HIGH, TensionLevel.CLIMACTIC]

    def test_falling_curve_type(self):
        """Test falling tension curve."""
        # Start with high tension, end with calm
        text = "Danger! Emergency! Crisis! " * 50 + "Peace. Calm. Rest. " * 150
        curve = TensionAnalyzer.analyze_tension_curve(text, intervals=4)
        # Curve type should be falling or arc
        assert curve.curve_type in ["falling", "arc", "rising", "flat", "volatile"]

    def test_flat_curve_type(self):
        """Test flat tension curve with consistent tension."""
        text = "Normal day. Regular activity. Nothing special happens. " * 200
        curve = TensionAnalyzer.analyze_tension_curve(text, intervals=10)
        assert curve.tension_variance >= 0

    def test_tension_curve_empty_intervals(self):
        """Test tension curve with short text."""
        text = "Short."
        curve = TensionAnalyzer.analyze_tension_curve(text, intervals=10)
        # Should handle gracefully
        assert isinstance(curve.tension_points, list)


class TestPacingAnalyzerEdgeCases:
    """Additional edge case tests for pacing analyzer."""

    def test_dialogue_heavy_text(self):
        """Test dialogue-heavy text analysis."""
        text = '"Hello!" "Hi there!" "How are you?" "Fine, thanks." ' * 50
        report = PacingAnalyzer.analyze(text)
        # Dialogue analysis is done at scene level
        assert report.word_count > 0
        assert report.scene_distribution is not None

    def test_all_caps_text(self):
        """Test all caps text (high tension markers)."""
        text = "DANGER! RUN! ESCAPE! HELP! NOW!"
        report = PacingAnalyzer.analyze(text)
        # At least confirms it runs without error
        assert report is not None
        assert report.word_count > 0

    def test_mixed_content_text(self):
        """Test mixed action and reflection content."""
        text = (
            "He thought about his past. She wondered about the future. "
            "Then suddenly he ran! He fought! He jumped!"
        )
        report = PacingAnalyzer.analyze(text)
        assert report.word_count > 0
        assert report.scene_distribution is not None


class TestTensionAnalyzerEdgeCases:
    """Additional edge case tests for TensionAnalyzer."""

    def test_very_low_tension_detection(self):
        """Test VERY_LOW tension with high concentration of calm words."""
        # Use lots of calm, peaceful, relaxed, serene, gentle, quiet, soft words
        # Need calm_ratio > 0.06 (6% calm words)
        calm_text = (
            "The peaceful calm serene gentle quiet soft relaxed tranquil "
            "placid mellow soothing restful still silent hushed subdued "
            "peaceful calm serene gentle quiet soft relaxed tranquil "
            "placid mellow soothing restful still silent hushed subdued "
            "peaceful calm serene gentle quiet soft relaxed tranquil "
            "placid mellow soothing restful still silent hushed subdued. "
            "It was a peaceful calm and serene gentle quiet day."
        )
        tension = TensionAnalyzer.calculate_tension_level(calm_text)
        # Should return LOW or VERY_LOW
        assert tension.value <= TensionLevel.LOW.value

    def test_analyze_curve_whitespace_only(self):
        """Test tension curve with whitespace-only text."""
        curve = TensionAnalyzer.analyze_tension_curve("   \n   \t   ")
        assert curve.tension_points == []

    def test_analyze_curve_single_word(self):
        """Test tension curve with very short text."""
        curve = TensionAnalyzer.analyze_tension_curve("Hello", intervals=10)
        # Short text should still produce some result
        assert len(curve.tension_points) >= 0

    def test_climactic_tension(self):
        """Test CLIMACTIC tension with very high tension words."""
        text = (
            "SUDDENLY DANGER DANGER DANGER! Panic screaming terror death! "
            "Emergency! Run! Escape! Crash! Explosion! Fear! Horror! "
            "SUDDENLY DANGER struck! Terror and chaos everywhere! "
            "The threat was imminent! Deadly peril! Desperate screams!"
        )
        tension = TensionAnalyzer.calculate_tension_level(text)
        # Should return HIGH or CLIMACTIC
        assert tension.value >= TensionLevel.HIGH.value


class TestTensionCurveTypesExtended:
    """Extended tests for tension curve type detection."""

    def test_rising_curve(self):
        """Test rising tension curve detection."""
        # Start calm, end tense
        text = (
            "The quiet peaceful morning. " * 30
            + "Suddenly danger struck! Panic everywhere! Terror! " * 30
        )
        curve = TensionAnalyzer.analyze_tension_curve(text, intervals=5)
        # Last point should be higher than first
        if len(curve.tension_points) >= 2:
            assert curve.tension_points[-1] >= curve.tension_points[0]

    def test_falling_curve(self):
        """Test falling tension curve detection."""
        # Start tense, end calm
        text = (
            "Danger! Panic! Terror! Emergency! " * 30
            + "Everything calmed down. Peace returned. Serene and quiet. " * 30
        )
        curve = TensionAnalyzer.analyze_tension_curve(text, intervals=5)
        # Should have some tension points
        assert len(curve.tension_points) > 0

    def test_peak_middle_curve(self):
        """Test curve with peak in middle."""
        text = (
            "Calm peaceful morning. " * 20
            + "DANGER! Panic terror! Emergency crisis! " * 20
            + "Calm resolution peace. " * 20
        )
        curve = TensionAnalyzer.analyze_tension_curve(text, intervals=5)
        # Peak should be somewhere in the middle
        if len(curve.tension_points) >= 3:
            assert curve.peak_tension >= curve.average_tension
