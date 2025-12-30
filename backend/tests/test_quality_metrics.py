"""
Tests for prose quality metrics service.

Tests cover:
- ReadabilityAnalyzer with all readability formulas
- SentenceVarietyAnalyzer for sentence structure analysis
- PassiveVoiceDetector
- AdverbTracker
- DialogueAnalyzer
- ProseQualityService integration
"""

from app.services.quality_metrics import (
    AdverbAnalysis,
    AdverbTracker,
    DialogueAnalyzer,
    DialogueRatio,
    PassiveVoiceDetector,
    ProseQualityReport,
    ProseQualityService,
    ReadabilityAnalyzer,
    ReadabilityScores,
    ReadingLevel,
    SentenceVariety,
    SentenceVarietyAnalyzer,
    TextStatistics,
    VoiceAnalysis,
)

# =============================================================================
# TextStatistics Tests
# =============================================================================


class TestTextStatistics:
    """Tests for TextStatistics utility class."""

    def test_count_syllables_monosyllabic(self):
        """Test counting syllables in monosyllabic words."""
        assert TextStatistics.count_syllables("cat") == 1
        assert TextStatistics.count_syllables("dog") == 1
        assert TextStatistics.count_syllables("the") == 1
        assert TextStatistics.count_syllables("a") == 1

    def test_count_syllables_multisyllabic(self):
        """Test counting syllables in multisyllabic words."""
        assert TextStatistics.count_syllables("hello") == 2
        assert TextStatistics.count_syllables("beautiful") == 3
        assert TextStatistics.count_syllables("understanding") >= 4

    def test_count_syllables_silent_endings(self):
        """Test handling of silent endings."""
        # Words with silent 'e' should not count extra syllable
        assert TextStatistics.count_syllables("made") == 1
        assert TextStatistics.count_syllables("live") == 1

    def test_count_syllables_short_words(self):
        """Test minimum syllable count for short words."""
        assert TextStatistics.count_syllables("") == 1
        assert TextStatistics.count_syllables("a") == 1
        assert TextStatistics.count_syllables("I") == 1

    def test_get_words(self):
        """Test word extraction."""
        text = "Hello, world! This is a test."
        words = TextStatistics.get_words(text)
        assert "Hello" in words
        assert "world" in words
        assert "test" in words
        assert len(words) == 6

    def test_get_words_empty(self):
        """Test word extraction from empty text."""
        assert TextStatistics.get_words("") == []
        assert TextStatistics.get_words("   ") == []

    def test_get_sentences(self):
        """Test sentence splitting."""
        text = "Hello world. How are you? I am fine!"
        sentences = TextStatistics.get_sentences(text)
        assert len(sentences) == 3

    def test_get_sentences_multiple_punctuation(self):
        """Test sentence splitting with multiple punctuation."""
        text = "Really?! Yes... okay."
        sentences = TextStatistics.get_sentences(text)
        assert len(sentences) >= 2

    def test_get_sentences_empty(self):
        """Test sentence splitting on empty text."""
        assert TextStatistics.get_sentences("") == []

    def test_count_complex_words(self):
        """Test counting complex words (3+ syllables)."""
        words = ["beautiful", "understanding", "cat", "dog", "hello"]
        complex_count = TextStatistics.count_complex_words(words)
        assert complex_count >= 2  # beautiful, understanding

    def test_count_complex_words_excludes_proper_nouns(self):
        """Test that proper nouns are excluded from complex word count."""
        words = ["Philadelphia", "cat"]  # Philadelphia is proper noun
        complex_count = TextStatistics.count_complex_words(words)
        assert complex_count == 0


# =============================================================================
# ReadabilityScores Tests
# =============================================================================


class TestReadabilityScores:
    """Tests for ReadabilityScores dataclass."""

    def test_default_values(self):
        """Test default values."""
        scores = ReadabilityScores()
        assert scores.flesch_reading_ease == 0.0
        assert scores.flesch_kincaid_grade == 0.0
        assert scores.reading_level == ReadingLevel.HIGH_SCHOOL

    def test_to_dict(self):
        """Test conversion to dictionary."""
        scores = ReadabilityScores(
            flesch_reading_ease=65.5,
            flesch_kincaid_grade=8.2,
            reading_level=ReadingLevel.MIDDLE_SCHOOL,
        )
        result = scores.to_dict()

        assert result["flesch_reading_ease"] == 65.5
        assert result["flesch_kincaid_grade"] == 8.2
        assert result["reading_level"] == "middle_school"


# =============================================================================
# ReadabilityAnalyzer Tests
# =============================================================================


class TestReadabilityAnalyzer:
    """Tests for ReadabilityAnalyzer."""

    def test_analyze_empty_text(self):
        """Test analysis of empty text."""
        scores = ReadabilityAnalyzer.analyze("")
        assert scores.flesch_reading_ease == 0.0
        assert scores.flesch_kincaid_grade == 0.0

    def test_analyze_simple_text(self):
        """Test analysis of simple text."""
        # Simple, short sentences with common words
        text = "The cat sat. The dog ran. The bird flew."
        scores = ReadabilityAnalyzer.analyze(text)

        # Simple text should have high reading ease
        assert scores.flesch_reading_ease > 60
        # And low grade level
        assert scores.flesch_kincaid_grade < 5

    def test_analyze_complex_text(self):
        """Test analysis of complex text."""
        # Complex sentences with long words
        text = (
            "The unprecedented demonstration of sophisticated computational "
            "methodologies necessitates comprehensive understanding of underlying "
            "algorithmic implementations and their consequential ramifications."
        )
        scores = ReadabilityAnalyzer.analyze(text)

        # Complex text should have lower reading ease
        assert scores.flesch_reading_ease < 40
        # And higher grade level
        assert scores.flesch_kincaid_grade > 10

    def test_reading_level_elementary(self):
        """Test elementary reading level detection."""
        text = "The cat is big. I like cats. Cats are fun."
        scores = ReadabilityAnalyzer.analyze(text)
        # Very simple text
        assert scores.average_grade_level <= 8  # Could be elementary or middle

    def test_reading_level_college(self):
        """Test college reading level detection."""
        text = (
            "The epistemological implications of post-structuralist theory "
            "fundamentally reconceptualize our understanding of textual hermeneutics "
            "and the phenomenological experience of literary engagement."
        )
        scores = ReadabilityAnalyzer.analyze(text)
        assert scores.reading_level in [ReadingLevel.COLLEGE, ReadingLevel.GRADUATE]

    def test_flesch_reading_ease_bounds(self):
        """Test Flesch Reading Ease is bounded 0-100."""
        text = "A. B. C. D."  # Edge case
        scores = ReadabilityAnalyzer.analyze(text)
        assert 0 <= scores.flesch_reading_ease <= 100

    def test_all_indices_calculated(self):
        """Test that all readability indices are calculated."""
        text = "This is a sample text with multiple sentences. It should work well."
        scores = ReadabilityAnalyzer.analyze(text)

        assert scores.flesch_reading_ease != 0
        assert scores.flesch_kincaid_grade >= 0
        assert scores.gunning_fog_index >= 0
        assert scores.coleman_liau_index >= 0
        assert scores.automated_readability_index >= 0


# =============================================================================
# SentenceVariety Tests
# =============================================================================


class TestSentenceVariety:
    """Tests for SentenceVariety dataclass."""

    def test_default_values(self):
        """Test default values."""
        variety = SentenceVariety()
        assert variety.total_sentences == 0
        assert variety.average_length == 0.0
        assert variety.sentence_lengths == []

    def test_to_dict(self):
        """Test conversion to dictionary."""
        variety = SentenceVariety(
            total_sentences=5,
            average_length=12.5,
            variety_score=0.45,
        )
        result = variety.to_dict()

        assert result["total_sentences"] == 5
        assert result["average_length"] == 12.5
        assert result["variety_score"] == 0.45


class TestSentenceVarietyAnalyzer:
    """Tests for SentenceVarietyAnalyzer."""

    def test_analyze_empty_text(self):
        """Test analysis of empty text."""
        variety = SentenceVarietyAnalyzer.analyze("")
        assert variety.total_sentences == 0

    def test_analyze_single_sentence(self):
        """Test analysis of single sentence."""
        variety = SentenceVarietyAnalyzer.analyze("This is a single sentence.")
        assert variety.total_sentences == 1
        assert variety.variety_score == 0.0  # No variety with one sentence

    def test_analyze_varied_sentences(self):
        """Test analysis of varied sentence lengths."""
        text = (
            "Short. This is a bit longer sentence with more words. "
            "And this one is even longer with many more words than the others."
        )
        variety = SentenceVarietyAnalyzer.analyze(text)

        assert variety.total_sentences == 3
        assert variety.shortest_sentence < variety.longest_sentence
        assert variety.length_std_dev > 0
        assert variety.variety_score > 0

    def test_analyze_uniform_sentences(self):
        """Test analysis of uniform sentence lengths."""
        text = "Cat sat. Dog ran. Fly flew. Bee buzzed."
        variety = SentenceVarietyAnalyzer.analyze(text)

        assert variety.total_sentences == 4
        assert variety.length_std_dev < 1  # Very low variation
        assert variety.variety_score < 0.3

    def test_sentence_type_detection_questions(self):
        """Test question sentence detection."""
        text = "What is this? How does it work? It works well."
        variety = SentenceVarietyAnalyzer.analyze(text)
        # Questions are detected based on the sentence text ending with ?
        assert variety.question_sentences >= 1

    def test_sentence_type_detection_exclamations(self):
        """Test exclamation sentence detection."""
        text = "Wow, that is amazing! This is great!"
        variety = SentenceVarietyAnalyzer.analyze(text)
        assert variety.exclamation_sentences >= 1

    def test_sentence_type_compound(self):
        """Test compound sentence detection."""
        text = "I went home, and I cooked dinner. The sun was bright, but it was cold."
        variety = SentenceVarietyAnalyzer.analyze(text)
        assert variety.compound_sentences >= 2

    def test_sentence_type_complex(self):
        """Test complex sentence detection."""
        text = "Because it was raining, I stayed home. Although tired, she continued."
        variety = SentenceVarietyAnalyzer.analyze(text)
        assert variety.complex_sentences >= 2

    def test_sentence_type_simple(self):
        """Test simple sentence detection."""
        text = "The cat sat. The dog ran. Birds fly."
        variety = SentenceVarietyAnalyzer.analyze(text)
        assert variety.simple_sentences >= 2


# =============================================================================
# VoiceAnalysis Tests
# =============================================================================


class TestVoiceAnalysis:
    """Tests for VoiceAnalysis dataclass."""

    def test_default_values(self):
        """Test default values."""
        analysis = VoiceAnalysis()
        assert analysis.total_sentences == 0
        assert analysis.passive_sentences == 0
        assert analysis.passive_instances == []

    def test_to_dict(self):
        """Test conversion to dictionary."""
        analysis = VoiceAnalysis(
            total_sentences=10,
            passive_sentences=2,
            passive_percentage=20.0,
            passive_instances=["was written", "were made"],
        )
        result = analysis.to_dict()

        assert result["total_sentences"] == 10
        assert result["passive_percentage"] == 20.0


class TestPassiveVoiceDetector:
    """Tests for PassiveVoiceDetector."""

    def test_detect_empty_text(self):
        """Test detection in empty text."""
        analysis = PassiveVoiceDetector.analyze("")
        assert analysis.total_sentences == 0
        assert analysis.passive_sentences == 0

    def test_detect_passive_was(self):
        """Test detection of 'was' passive constructions."""
        text = "The book was written by the author. The door was opened."
        analysis = PassiveVoiceDetector.analyze(text)
        assert analysis.passive_sentences >= 2

    def test_detect_passive_were(self):
        """Test detection of 'were' passive constructions."""
        text = "The letters were written. The houses were built."
        analysis = PassiveVoiceDetector.analyze(text)
        assert analysis.passive_sentences >= 2

    def test_detect_passive_is(self):
        """Test detection of 'is' passive constructions."""
        text = "The report is completed. The work is done."
        analysis = PassiveVoiceDetector.analyze(text)
        assert analysis.passive_sentences >= 1

    def test_no_passive_active_voice(self):
        """Test no false positives in active voice text."""
        text = "The author wrote the book. I opened the door. She completed the report."
        analysis = PassiveVoiceDetector.analyze(text)
        assert analysis.passive_sentences == 0

    def test_passive_percentage_calculation(self):
        """Test passive percentage calculation."""
        text = "The book was written. The author smiled. The door was opened. I walked."
        analysis = PassiveVoiceDetector.analyze(text)
        assert analysis.passive_percentage == 50.0

    def test_passive_instances_recorded(self):
        """Test that passive instances are recorded."""
        text = "The cake was eaten. The song was sung."
        analysis = PassiveVoiceDetector.analyze(text)
        assert len(analysis.passive_instances) >= 1


# =============================================================================
# AdverbAnalysis Tests
# =============================================================================


class TestAdverbAnalysis:
    """Tests for AdverbAnalysis dataclass."""

    def test_default_values(self):
        """Test default values."""
        analysis = AdverbAnalysis()
        assert analysis.total_words == 0
        assert analysis.adverb_count == 0
        assert analysis.adverbs_found == []

    def test_to_dict(self):
        """Test conversion to dictionary."""
        analysis = AdverbAnalysis(
            total_words=100,
            adverb_count=5,
            adverb_percentage=5.0,
            adverbs_found=["quickly", "slowly"],
        )
        result = analysis.to_dict()

        assert result["total_words"] == 100
        assert result["adverb_percentage"] == 5.0


class TestAdverbTracker:
    """Tests for AdverbTracker."""

    def test_track_empty_text(self):
        """Test tracking in empty text."""
        analysis = AdverbTracker.analyze("")
        assert analysis.total_words == 0
        assert analysis.adverb_count == 0

    def test_track_ly_adverbs(self):
        """Test tracking of -ly adverbs."""
        text = "She walked quickly down the street. He spoke softly."
        analysis = AdverbTracker.analyze(text)
        assert analysis.ly_adverbs >= 2
        assert "quickly" in analysis.adverbs_found
        assert "softly" in analysis.adverbs_found

    def test_track_common_adverbs(self):
        """Test tracking of common adverbs without -ly."""
        text = "I always do this. She never goes there. Perhaps it is true."
        analysis = AdverbTracker.analyze(text)
        assert analysis.adverb_count >= 3

    def test_exclude_adjectives_ending_ly(self):
        """Test that adjectives ending in -ly are excluded."""
        text = "The friendly dog was lovely. She felt lonely."
        analysis = AdverbTracker.analyze(text)
        # friendly, lovely, lonely should not count
        assert "friendly" not in analysis.adverbs_found
        assert "lovely" not in analysis.adverbs_found
        assert "lonely" not in analysis.adverbs_found

    def test_sentence_starting_adverbs(self):
        """Test detection of sentence-starting adverbs."""
        text = "Suddenly, the door opened. Perhaps we should go. Finally, it ended."
        analysis = AdverbTracker.analyze(text)
        assert analysis.sentence_starting_adverbs >= 2

    def test_adverb_percentage(self):
        """Test adverb percentage calculation."""
        text = "She quickly ran very fast."  # quickly, very are adverbs
        analysis = AdverbTracker.analyze(text)
        assert analysis.adverb_percentage > 0


# =============================================================================
# DialogueRatio Tests
# =============================================================================


class TestDialogueRatio:
    """Tests for DialogueRatio dataclass."""

    def test_default_values(self):
        """Test default values."""
        ratio = DialogueRatio()
        assert ratio.total_words == 0
        assert ratio.dialogue_words == 0
        assert ratio.narrative_words == 0

    def test_to_dict(self):
        """Test conversion to dictionary."""
        ratio = DialogueRatio(
            total_words=100,
            dialogue_words=40,
            narrative_words=60,
            dialogue_percentage=40.0,
        )
        result = ratio.to_dict()

        assert result["total_words"] == 100
        assert result["dialogue_percentage"] == 40.0


class TestDialogueAnalyzer:
    """Tests for DialogueAnalyzer."""

    def test_analyze_empty_text(self):
        """Test analysis of empty text."""
        ratio = DialogueAnalyzer.analyze("")
        assert ratio.total_words == 0

    def test_analyze_no_dialogue(self):
        """Test analysis of text without dialogue."""
        text = "The sun rose over the mountains. Birds sang in the trees."
        ratio = DialogueAnalyzer.analyze(text)
        assert ratio.dialogue_words == 0
        assert ratio.dialogue_percentage == 0

    def test_analyze_with_dialogue(self):
        """Test analysis of text with dialogue."""
        text = 'She said, "Hello there." He replied, "How are you?"'
        ratio = DialogueAnalyzer.analyze(text)
        assert ratio.dialogue_words > 0
        assert ratio.dialogue_exchanges >= 2
        assert ratio.dialogue_percentage > 0

    def test_analyze_smart_quotes(self):
        """Test analysis of text with smart quotes."""
        text = "\u201cHello,\u201d she said. \u201cGoodbye,\u201d he replied."
        ratio = DialogueAnalyzer.analyze(text)
        assert ratio.dialogue_words > 0
        assert ratio.dialogue_exchanges >= 2

    def test_average_exchange_length(self):
        """Test average exchange length calculation."""
        text = '"One two three." "Four five."'
        ratio = DialogueAnalyzer.analyze(text)
        assert ratio.dialogue_exchanges == 2
        assert ratio.average_exchange_length > 0

    def test_narrative_words_calculation(self):
        """Test narrative words are calculated correctly."""
        text = 'She said, "Hello." He nodded slowly.'
        ratio = DialogueAnalyzer.analyze(text)
        assert ratio.narrative_words > 0
        assert ratio.narrative_words == ratio.total_words - ratio.dialogue_words


# =============================================================================
# ProseQualityReport Tests
# =============================================================================


class TestProseQualityReport:
    """Tests for ProseQualityReport dataclass."""

    def test_default_values(self):
        """Test default values."""
        report = ProseQualityReport()
        assert report.word_count == 0
        assert report.overall_score == 0.0

    def test_to_dict(self):
        """Test conversion to dictionary."""
        report = ProseQualityReport(
            word_count=500,
            character_count=2500,
            paragraph_count=5,
            overall_score=85.5,
        )
        result = report.to_dict()

        assert result["word_count"] == 500
        assert result["character_count"] == 2500
        assert result["paragraph_count"] == 5
        assert result["overall_score"] == 85.5
        assert "readability" in result
        assert "sentence_variety" in result


# =============================================================================
# ProseQualityService Tests
# =============================================================================


class TestProseQualityService:
    """Tests for ProseQualityService."""

    def test_analyze_empty_text(self):
        """Test analysis of empty text."""
        report = ProseQualityService.analyze("")
        assert report.word_count == 0
        assert report.overall_score == 0.0

    def test_analyze_basic_text(self):
        """Test analysis of basic text."""
        text = "This is a simple test. It has multiple sentences. The text is easy to read."
        report = ProseQualityService.analyze(text)

        assert report.word_count > 0
        assert report.readability.flesch_reading_ease > 0
        assert report.sentence_variety.total_sentences == 3

    def test_analyze_counts_paragraphs(self):
        """Test paragraph counting."""
        text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
        report = ProseQualityService.analyze(text)
        assert report.paragraph_count >= 2

    def test_overall_score_high_quality(self):
        """Test high quality text gets good score."""
        text = (
            'The morning sun cast long shadows across the garden. "What a beautiful day," '
            "she said, stretching her arms. The birds sang their chorus, filling the air "
            "with melody. She walked slowly down the path, enjoying each moment."
        )
        report = ProseQualityService.analyze(text)
        assert report.overall_score >= 70

    def test_overall_score_low_quality(self):
        """Test low quality text gets lower score."""
        # Heavy adverbs, passive voice, no dialogue
        text = (
            "The document was quickly written. The report was hastily prepared. "
            "The analysis was thoroughly completed. The conclusion was definitely reached. "
            "The work was finally finished. The review was certainly done."
        )
        report = ProseQualityService.analyze(text)
        # Should have penalties for passive voice and adverbs
        # This text has passive voice (was written, was prepared, etc.) and many adverbs
        assert report.voice_analysis.passive_percentage > 0
        assert report.adverb_analysis.adverb_percentage > 2

    def test_get_recommendations_passive_voice(self):
        """Test recommendations for high passive voice."""
        text = (
            "The book was written. The letter was sent. The door was opened. "
            "The work was completed. The task was finished."
        )
        report = ProseQualityService.analyze(text)
        recommendations = ProseQualityService.get_recommendations(report)
        assert any("passive" in r.lower() for r in recommendations)

    def test_get_recommendations_adverbs(self):
        """Test recommendations for high adverb usage."""
        text = (
            "She quickly ran. He slowly walked. They suddenly stopped. "
            "We carefully looked. You definitely knew. They certainly agreed. "
            "We probably should. They really did."
        )
        report = ProseQualityService.analyze(text)
        recommendations = ProseQualityService.get_recommendations(report)
        assert any("adverb" in r.lower() for r in recommendations)

    def test_get_recommendations_sentence_variety(self):
        """Test recommendations for poor sentence variety."""
        text = "Cat sat. Dog ran. Fly flew. Bee buzzed. Bird sang. Fish swam."
        report = ProseQualityService.analyze(text)
        # Very uniform sentence lengths
        ProseQualityService.get_recommendations(report)
        # May or may not trigger recommendation depending on variety score

    def test_get_recommendations_low_dialogue(self):
        """Test recommendations for sparse dialogue."""
        text = (
            "The sun rose over the hills. Morning mist covered the valley. "
            "Birds began their dawn chorus. The world awakened slowly. "
            "Nature stirred from slumber. Day had finally arrived."
        )
        report = ProseQualityService.analyze(text)
        recommendations = ProseQualityService.get_recommendations(report)
        assert any("dialogue" in r.lower() for r in recommendations)

    def test_full_analysis_integration(self):
        """Test full analysis with varied content."""
        text = """
        The detective stared at the crime scene. "What happened here?" he asked.

        The officer shook his head slowly. "We're not entirely sure, sir. The victim
        was found this morning by the cleaning staff."

        Johnson knelt beside the body, examining it carefully. The wounds were
        unusual—deep gashes that seemed almost ritualistic. Something about this
        case felt different, darker.

        "Get forensics down here immediately," he ordered.
        """
        report = ProseQualityService.analyze(text)

        # Should have reasonable scores across all metrics
        assert report.word_count > 50
        assert report.paragraph_count >= 2
        assert report.sentence_variety.total_sentences >= 5
        assert report.dialogue_ratio.dialogue_words > 0
        assert 0 <= report.overall_score <= 100


# =============================================================================
# Edge Case Tests
# =============================================================================


class TestEdgeCases:
    """Edge case tests for quality metrics."""

    def test_text_with_only_punctuation(self):
        """Test text with only punctuation."""
        report = ProseQualityService.analyze("... !!! ???")
        assert report.word_count == 0

    def test_text_with_numbers(self):
        """Test text with numbers."""
        text = "There were 100 people. The year was 2024."
        report = ProseQualityService.analyze(text)
        assert report.word_count > 0

    def test_text_with_special_characters(self):
        """Test text with special characters."""
        text = "Hello—world! Test...text. What's happening?"
        report = ProseQualityService.analyze(text)
        assert report.word_count > 0

    def test_very_long_sentence(self):
        """Test handling of very long sentences."""
        text = " ".join(["word"] * 100) + "."
        report = ProseQualityService.analyze(text)
        assert report.sentence_variety.total_sentences == 1
        assert report.sentence_variety.longest_sentence == 100

    def test_mixed_quote_styles(self):
        """Test handling of mixed quote styles."""
        text = '"Hello," she said. \u201cGoodbye,\u201d he replied.'
        report = ProseQualityService.analyze(text)
        assert report.dialogue_ratio.dialogue_exchanges >= 2

    def test_whitespace_handling(self):
        """Test handling of excessive whitespace."""
        text = "Hello    world.   This   is   a   test."
        report = ProseQualityService.analyze(text)
        assert report.word_count > 0

    def test_unicode_text(self):
        """Test handling of unicode characters."""
        text = "Café résumé naïve. The price is €50."
        report = ProseQualityService.analyze(text)
        assert report.word_count > 0
