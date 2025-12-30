"""Tests for the style learning service."""

from uuid import uuid4

from app.services.style_learning import (
    PassiveVoiceDetector,
    SentenceExtractor,
    SentencePattern,
    SentencePatternAnalyzer,
    StyleApplication,
    StyleComparator,
    StyleFeature,
    StyleFeatureExtractor,
    StyleLearningService,
    StyleMetrics,
    StyleProfile,
    StylePromptGenerator,
    VocabularyAnalyzer,
)

# Sample texts for testing
HEMINGWAY_STYLE = """
The sun rose. The man walked. He saw the river.
The river was cold and clear. He drank.
He was thirsty. The water was good.
He sat on the bank. He waited. The fish came.
He caught the fish. It was a good fish.
"""

VERBOSE_STYLE = """
The magnificently brilliant sun rose slowly and majestically above the
distant, towering mountains, casting its warm, golden rays across the
verdant, dew-kissed meadows that stretched endlessly toward the
shimmering horizon, while the gentle breeze whispered softly through
the ancient, gnarled oak trees that had stood sentinel for countless
generations, their weathered branches swaying gracefully in the
morning light like the arms of old friends reaching out to embrace
the new day with unbridled enthusiasm and profound appreciation for
the simple, yet profoundly meaningful beauty of nature's eternal
spectacle.
"""

DIALOGUE_HEAVY = """
"Hello," she said.
"Hi there," he replied. "How are you?"
"I'm good. You?"
"Can't complain." He shrugged. "Nice day."
"It is," she agreed. "Perfect weather."
"Want to walk?"
"Sure." She smiled. "Let's go."
"""

PASSIVE_HEAVY = """
The door was opened by the butler. The guests were welcomed.
The dinner was served at eight. The wine was poured carefully.
The conversation was dominated by politics. The host was pleased.
The dessert was enjoyed by all. The evening was considered a success.
"""


class TestEnums:
    """Tests for enum classes."""

    def test_style_feature_values(self):
        """Test StyleFeature enum values."""
        assert StyleFeature.SENTENCE_LENGTH.value == "sentence_length"
        assert StyleFeature.DIALOGUE_RATIO.value == "dialogue_ratio"
        assert StyleFeature.PASSIVE_VOICE.value == "passive_voice"

    def test_sentence_pattern_values(self):
        """Test SentencePattern enum values."""
        assert SentencePattern.SIMPLE.value == "simple"
        assert SentencePattern.COMPOUND.value == "compound"
        assert SentencePattern.COMPLEX.value == "complex"


class TestStyleMetrics:
    """Tests for StyleMetrics dataclass."""

    def test_default_values(self):
        """Test default metric values."""
        metrics = StyleMetrics()
        assert metrics.avg_sentence_length == 0.0
        assert metrics.dialogue_ratio == 0.0
        assert metrics.sentence_patterns == {}

    def test_custom_values(self):
        """Test custom metric values."""
        metrics = StyleMetrics(
            avg_sentence_length=15.5,
            dialogue_ratio=0.3,
            adverb_ratio=0.02,
        )
        assert metrics.avg_sentence_length == 15.5
        assert metrics.dialogue_ratio == 0.3
        assert metrics.adverb_ratio == 0.02


class TestStyleProfile:
    """Tests for StyleProfile dataclass."""

    def test_default_values(self):
        """Test default profile values."""
        profile = StyleProfile()
        assert profile.name == ""
        assert profile.source_word_count == 0
        assert isinstance(profile.metrics, StyleMetrics)

    def test_profile_with_metrics(self):
        """Test profile with custom metrics."""
        metrics = StyleMetrics(avg_sentence_length=20.0)
        profile = StyleProfile(
            name="Test Style",
            source_word_count=1000,
            metrics=metrics,
        )
        assert profile.name == "Test Style"
        assert profile.metrics.avg_sentence_length == 20.0


class TestSentenceExtractor:
    """Tests for SentenceExtractor."""

    def test_extract_sentences(self):
        """Test sentence extraction."""
        extractor = SentenceExtractor()
        sentences = extractor.extract_sentences("Hello world. How are you? I am fine!")
        assert len(sentences) == 3
        assert "Hello world." in sentences

    def test_extract_dialogue(self):
        """Test dialogue extraction."""
        extractor = SentenceExtractor()
        dialogue = extractor.extract_dialogue('"Hello," she said. "How are you?"')
        assert len(dialogue) == 2
        assert "Hello," in dialogue

    def test_extract_from_empty(self):
        """Test extraction from empty text."""
        extractor = SentenceExtractor()
        assert extractor.extract_sentences("") == []
        assert extractor.extract_dialogue("") == []

    def test_sentences_without_dialogue(self):
        """Test narrative sentence extraction excludes dialogue."""
        extractor = SentenceExtractor()
        text = 'He walked. "Hello," she said. He stopped.'
        sentences = extractor.extract_sentences(text)
        # Should not include the dialogue content in sentences
        assert not any('"' in s for s in sentences)


class TestVocabularyAnalyzer:
    """Tests for VocabularyAnalyzer."""

    def test_get_words(self):
        """Test word extraction."""
        analyzer = VocabularyAnalyzer()
        words = analyzer.get_words("Hello World, how are you?")
        assert "hello" in words
        assert "world" in words
        assert len(words) == 5

    def test_calculate_richness(self):
        """Test vocabulary richness calculation."""
        analyzer = VocabularyAnalyzer()

        # All unique words
        words1 = ["one", "two", "three", "four", "five"]
        assert analyzer.calculate_richness(words1) == 1.0

        # Repeated words
        words2 = ["one", "one", "two", "two"]
        assert analyzer.calculate_richness(words2) == 0.5

        # Empty list
        assert analyzer.calculate_richness([]) == 0.0

    def test_get_content_words(self):
        """Test content word filtering."""
        analyzer = VocabularyAnalyzer()
        words = ["the", "magnificent", "castle", "was", "ancient"]
        content = analyzer.get_content_words(words)
        assert "magnificent" in content
        assert "castle" in content
        assert "ancient" in content
        assert "the" not in content
        assert "was" not in content

    def test_count_adverbs(self):
        """Test adverb counting."""
        analyzer = VocabularyAnalyzer()
        text = "She walked quickly and spoke softly. He was extremely happy."
        count = analyzer.count_adverbs(text)
        assert count == 3  # quickly, softly, extremely

    def test_get_distinctive_vocabulary(self):
        """Test distinctive vocabulary extraction."""
        analyzer = VocabularyAnalyzer()
        words = ["castle", "castle", "magnificent", "ancient", "the", "was"]
        vocab = analyzer.get_distinctive_vocabulary(words, top_n=3)
        assert "castle" in vocab
        assert "the" not in vocab


class TestSentencePatternAnalyzer:
    """Tests for SentencePatternAnalyzer."""

    def test_classify_simple(self):
        """Test simple sentence classification."""
        analyzer = SentencePatternAnalyzer()
        pattern = analyzer.classify_sentence("The cat sat on the mat.")
        assert pattern == SentencePattern.SIMPLE

    def test_classify_compound(self):
        """Test compound sentence classification."""
        analyzer = SentencePatternAnalyzer()
        pattern = analyzer.classify_sentence("The cat sat on the mat, and the dog watched.")
        assert pattern == SentencePattern.COMPOUND

    def test_classify_complex(self):
        """Test complex sentence classification."""
        analyzer = SentencePatternAnalyzer()
        pattern = analyzer.classify_sentence("Although it was raining, the cat sat on the mat.")
        assert pattern == SentencePattern.COMPLEX

    def test_classify_compound_complex(self):
        """Test compound-complex sentence classification."""
        analyzer = SentencePatternAnalyzer()
        pattern = analyzer.classify_sentence(
            "Although it was raining, the cat sat on the mat, and the dog watched."
        )
        assert pattern == SentencePattern.COMPOUND_COMPLEX

    def test_get_pattern_distribution(self):
        """Test pattern distribution calculation."""
        analyzer = SentencePatternAnalyzer()
        sentences = [
            "The cat sat.",
            "The dog ran.",
            "The bird flew, and the cat watched.",
        ]
        distribution = analyzer.get_pattern_distribution(sentences)
        assert "simple" in distribution
        assert "compound" in distribution
        assert distribution["simple"] > 0.5

    def test_get_common_starters(self):
        """Test common sentence starter extraction."""
        analyzer = SentencePatternAnalyzer()
        sentences = [
            "The cat sat.",
            "The dog ran.",
            "A bird flew.",
            "The cat meowed.",
        ]
        starters = analyzer.get_common_starters(sentences, top_n=2)
        assert "the cat" in starters


class TestPassiveVoiceDetector:
    """Tests for PassiveVoiceDetector."""

    def test_detect_passive_ed(self):
        """Test passive voice detection with -ed verbs."""
        detector = PassiveVoiceDetector()
        assert detector.is_passive("The door was opened by the butler.")
        assert detector.is_passive("The cake was baked yesterday.")

    def test_detect_passive_irregular(self):
        """Test passive voice detection with irregular verbs."""
        detector = PassiveVoiceDetector()
        assert detector.is_passive("The song was sung beautifully.")
        assert detector.is_passive("The letter was written by hand.")

    def test_detect_active(self):
        """Test active voice detection."""
        detector = PassiveVoiceDetector()
        assert not detector.is_passive("The butler opened the door.")
        assert not detector.is_passive("She sang the song.")

    def test_count_passive(self):
        """Test passive sentence counting."""
        detector = PassiveVoiceDetector()
        sentences = [
            "the door was opened by someone",
            "she walked home",
            "the cake was eaten by guests",
        ]
        count = detector.count_passive(sentences)
        assert count == 2


class TestStyleFeatureExtractor:
    """Tests for StyleFeatureExtractor."""

    def test_extract_metrics_hemingway(self):
        """Test metric extraction from Hemingway-style text."""
        extractor = StyleFeatureExtractor()
        metrics = extractor.extract_metrics(HEMINGWAY_STYLE)

        # Short sentences
        assert metrics.avg_sentence_length < 10
        # Low adverb usage
        assert metrics.adverb_ratio < 0.02

    def test_extract_metrics_verbose(self):
        """Test metric extraction from verbose text."""
        extractor = StyleFeatureExtractor()
        metrics = extractor.extract_metrics(VERBOSE_STYLE)

        # Long sentences
        assert metrics.avg_sentence_length > 20

    def test_extract_metrics_dialogue(self):
        """Test metric extraction from dialogue-heavy text."""
        extractor = StyleFeatureExtractor()
        metrics = extractor.extract_metrics(DIALOGUE_HEAVY)

        # High dialogue ratio
        assert metrics.dialogue_ratio > 0.3

    def test_extract_metrics_passive(self):
        """Test metric extraction from passive-heavy text."""
        extractor = StyleFeatureExtractor()
        metrics = extractor.extract_metrics(PASSIVE_HEAVY)

        # High passive voice ratio
        assert metrics.passive_voice_ratio > 0.5

    def test_extract_profile(self):
        """Test profile extraction."""
        extractor = StyleFeatureExtractor()
        profile = extractor.extract_profile(HEMINGWAY_STYLE, "Hemingway Test")

        assert profile.name == "Hemingway Test"
        assert profile.source_word_count > 0
        assert isinstance(profile.metrics, StyleMetrics)

    def test_extract_profile_punctuation(self):
        """Test punctuation style extraction."""
        extractor = StyleFeatureExtractor()

        text_with_dash = "The man—he was old—walked slowly."
        profile = extractor.extract_profile(text_with_dash)
        assert "em_dash" in profile.characteristic_punctuation

        text_with_ellipsis = "He walked... slowly... toward the door..."
        profile = extractor.extract_profile(text_with_ellipsis)
        assert "ellipsis" in profile.characteristic_punctuation

    def test_extract_transition_words(self):
        """Test transition word extraction."""
        extractor = StyleFeatureExtractor()
        text = "However, he decided to go. Therefore, she followed. Meanwhile, they waited."
        profile = extractor.extract_profile(text)

        assert "however" in profile.transition_words
        assert "therefore" in profile.transition_words
        assert "meanwhile" in profile.transition_words


class TestStylePromptGenerator:
    """Tests for StylePromptGenerator."""

    def test_generate_short_sentence_prompt(self):
        """Test prompt generation for short sentences."""
        generator = StylePromptGenerator()
        profile = StyleProfile(metrics=StyleMetrics(avg_sentence_length=8.0))

        prompt = generator.generate_style_prompt(profile)
        assert "short" in prompt.lower()
        assert "punchy" in prompt.lower()

    def test_generate_long_sentence_prompt(self):
        """Test prompt generation for long sentences."""
        generator = StylePromptGenerator()
        profile = StyleProfile(metrics=StyleMetrics(avg_sentence_length=30.0))

        prompt = generator.generate_style_prompt(profile)
        assert "longer" in prompt.lower() or "flowing" in prompt.lower()

    def test_generate_dialogue_heavy_prompt(self):
        """Test prompt generation for dialogue-heavy style."""
        generator = StylePromptGenerator()
        profile = StyleProfile(metrics=StyleMetrics(dialogue_ratio=0.5))

        prompt = generator.generate_style_prompt(profile)
        assert "dialogue" in prompt.lower()
        assert "extensive" in prompt.lower() or "heavy" in prompt.lower()

    def test_generate_adverb_sparse_prompt(self):
        """Test prompt generation for sparse adverb usage."""
        generator = StylePromptGenerator()
        profile = StyleProfile(metrics=StyleMetrics(adverb_ratio=0.005))

        prompt = generator.generate_style_prompt(profile)
        assert "avoid adverbs" in prompt.lower()

    def test_strength_modifier(self):
        """Test strength modifier application."""
        generator = StylePromptGenerator()
        profile = StyleProfile(metrics=StyleMetrics(avg_sentence_length=8.0))

        generator.generate_style_prompt(profile, strength=1.0)
        weak_prompt = generator.generate_style_prompt(profile, strength=0.3)

        assert "lightly apply" in weak_prompt.lower()

    def test_vocabulary_guidance(self):
        """Test vocabulary guidance generation."""
        generator = StylePromptGenerator()
        profile = StyleProfile(vocabulary_sample=["magnificent", "ancient", "castle", "towering"])

        guidance = generator.generate_vocabulary_guidance(profile)
        assert "magnificent" in guidance
        assert "vocabulary" in guidance.lower()


class TestStyleComparator:
    """Tests for StyleComparator."""

    def test_compare_similar_profiles(self):
        """Test comparison of similar profiles."""
        comparator = StyleComparator()

        profile1 = StyleProfile(
            metrics=StyleMetrics(
                avg_sentence_length=15.0,
                dialogue_ratio=0.3,
                adverb_ratio=0.02,
            )
        )
        profile2 = StyleProfile(
            metrics=StyleMetrics(
                avg_sentence_length=16.0,
                dialogue_ratio=0.32,
                adverb_ratio=0.018,
            )
        )

        result = comparator.compare(profile1, profile2)
        assert result.similarity_score > 0.7
        assert len(result.matching_features) > len(result.divergent_features)

    def test_compare_different_profiles(self):
        """Test comparison of different profiles."""
        comparator = StyleComparator()

        profile1 = StyleProfile(
            metrics=StyleMetrics(
                avg_sentence_length=8.0,
                dialogue_ratio=0.1,
                passive_voice_ratio=0.05,
                adverb_ratio=0.01,
                contraction_ratio=0.005,
            )
        )
        profile2 = StyleProfile(
            metrics=StyleMetrics(
                avg_sentence_length=30.0,
                dialogue_ratio=0.5,
                passive_voice_ratio=0.4,
                adverb_ratio=0.05,
                contraction_ratio=0.05,
            )
        )

        result = comparator.compare(profile1, profile2)
        assert result.similarity_score <= 0.5
        assert len(result.divergent_features) >= len(result.matching_features)
        assert len(result.recommendations) > 0

    def test_recommendations_generated(self):
        """Test that recommendations are generated."""
        comparator = StyleComparator()

        profile1 = StyleProfile(
            metrics=StyleMetrics(
                avg_sentence_length=10.0,
                dialogue_ratio=0.1,
            )
        )
        profile2 = StyleProfile(
            metrics=StyleMetrics(
                avg_sentence_length=25.0,
                dialogue_ratio=0.5,
            )
        )

        result = comparator.compare(profile1, profile2)
        assert any("sentence length" in r.lower() for r in result.recommendations)
        assert any("dialogue" in r.lower() for r in result.recommendations)


class TestStyleLearningService:
    """Tests for StyleLearningService."""

    def test_learn_style(self):
        """Test style learning from sample."""
        service = StyleLearningService()
        profile = service.learn_style(HEMINGWAY_STYLE, "Hemingway")

        assert profile.name == "Hemingway"
        assert profile.source_word_count > 0
        assert profile.metrics.avg_sentence_length > 0

    def test_get_profile(self):
        """Test profile retrieval."""
        service = StyleLearningService()
        profile = service.learn_style(HEMINGWAY_STYLE, "Test")

        retrieved = service.get_profile(profile.id)
        assert retrieved is not None
        assert retrieved.name == "Test"

    def test_get_nonexistent_profile(self):
        """Test retrieval of nonexistent profile."""
        service = StyleLearningService()
        result = service.get_profile(uuid4())
        assert result is None

    def test_list_profiles(self):
        """Test listing all profiles."""
        service = StyleLearningService()
        service.learn_style(HEMINGWAY_STYLE, "Style 1")
        service.learn_style(VERBOSE_STYLE, "Style 2")

        profiles = service.list_profiles()
        assert len(profiles) == 2
        names = [p.name for p in profiles]
        assert "Style 1" in names
        assert "Style 2" in names

    def test_delete_profile(self):
        """Test profile deletion."""
        service = StyleLearningService()
        profile = service.learn_style(HEMINGWAY_STYLE, "To Delete")

        assert service.delete_profile(profile.id)
        assert service.get_profile(profile.id) is None

    def test_delete_nonexistent_profile(self):
        """Test deletion of nonexistent profile."""
        service = StyleLearningService()
        assert not service.delete_profile(uuid4())

    def test_generate_style_prompt(self):
        """Test style prompt generation from learned profile."""
        service = StyleLearningService()
        profile = service.learn_style(HEMINGWAY_STYLE, "Hemingway")

        prompt = service.generate_style_prompt(profile.id)
        assert len(prompt) > 0
        assert "sentence" in prompt.lower()

    def test_generate_style_prompt_nonexistent(self):
        """Test prompt generation for nonexistent profile."""
        service = StyleLearningService()
        prompt = service.generate_style_prompt(uuid4())
        assert prompt == ""

    def test_generate_style_prompt_with_vocabulary(self):
        """Test prompt generation with vocabulary guidance."""
        service = StyleLearningService()
        profile = service.learn_style(VERBOSE_STYLE, "Verbose")

        prompt = service.generate_style_prompt(profile.id, include_vocabulary=True)
        assert "vocabulary" in prompt.lower()

    def test_compare_to_sample(self):
        """Test comparing generated text to learned style."""
        service = StyleLearningService()
        profile = service.learn_style(HEMINGWAY_STYLE, "Target")

        # Text similar to Hemingway style
        similar_text = "He walked. The sun was hot. He stopped. He looked around."

        result = service.compare_to_sample(similar_text, profile.id)
        assert result.similarity_score > 0.3

    def test_compare_to_nonexistent_profile(self):
        """Test comparison to nonexistent profile."""
        service = StyleLearningService()
        result = service.compare_to_sample("Some text", uuid4())
        assert result.similarity_score == 0.0

    def test_analyze_text(self):
        """Test text analysis without storing."""
        service = StyleLearningService()
        metrics = service.analyze_text(DIALOGUE_HEAVY)

        assert metrics.dialogue_ratio > 0.3
        assert len(service.list_profiles()) == 0  # Should not store

    def test_blend_profiles(self):
        """Test blending multiple profiles."""
        service = StyleLearningService()
        p1 = service.learn_style(HEMINGWAY_STYLE, "Short")
        p2 = service.learn_style(VERBOSE_STYLE, "Long")

        blended = service.blend_profiles([p1.id, p2.id], name="Blended")

        # Blended sentence length should be between the two
        assert p1.metrics.avg_sentence_length < blended.metrics.avg_sentence_length
        assert blended.metrics.avg_sentence_length < p2.metrics.avg_sentence_length

    def test_blend_profiles_with_weights(self):
        """Test blending with custom weights."""
        service = StyleLearningService()
        p1 = service.learn_style(HEMINGWAY_STYLE, "Short")
        p2 = service.learn_style(VERBOSE_STYLE, "Long")

        # Heavily weight toward short style
        blended = service.blend_profiles([p1.id, p2.id], weights=[0.9, 0.1])

        # Should be closer to short style
        short_diff = abs(blended.metrics.avg_sentence_length - p1.metrics.avg_sentence_length)
        long_diff = abs(blended.metrics.avg_sentence_length - p2.metrics.avg_sentence_length)
        assert short_diff < long_diff

    def test_blend_empty_profiles(self):
        """Test blending with no valid profiles."""
        service = StyleLearningService()
        blended = service.blend_profiles([uuid4(), uuid4()])
        assert blended.source_word_count == 0

    def test_blend_single_profile(self):
        """Test blending with single profile."""
        service = StyleLearningService()
        p1 = service.learn_style(HEMINGWAY_STYLE, "Single")

        blended = service.blend_profiles([p1.id])
        assert blended.metrics.avg_sentence_length == p1.metrics.avg_sentence_length


class TestIntegration:
    """Integration tests for the style learning workflow."""

    def test_full_learning_workflow(self):
        """Test complete style learning and application workflow."""
        service = StyleLearningService()

        # 1. Learn a style
        profile = service.learn_style(HEMINGWAY_STYLE, "Hemingway")
        assert profile.id is not None

        # 2. Generate prompt for generation
        prompt = service.generate_style_prompt(profile.id)
        assert len(prompt) > 0

        # 3. Compare generated text
        generated = "The man walked. He was tired. He sat down."
        comparison = service.compare_to_sample(generated, profile.id)
        assert comparison.similarity_score > 0

        # 4. Get recommendations
        assert isinstance(comparison.recommendations, list)

    def test_multi_style_workflow(self):
        """Test workflow with multiple styles."""
        service = StyleLearningService()

        # Learn multiple styles
        hemingway = service.learn_style(HEMINGWAY_STYLE, "Hemingway")
        verbose = service.learn_style(VERBOSE_STYLE, "Verbose")
        dialogue = service.learn_style(DIALOGUE_HEAVY, "Dialogue")

        # List all
        profiles = service.list_profiles()
        assert len(profiles) == 3

        # Compare styles to each other (indirectly via comparator)
        comparator = StyleComparator()
        result = comparator.compare(hemingway, verbose)
        assert result.similarity_score < 0.5  # Should be quite different

        # Blend for mixed style
        blended = service.blend_profiles([hemingway.id, dialogue.id])
        assert blended.metrics.dialogue_ratio > hemingway.metrics.dialogue_ratio

    def test_style_consistency_check(self):
        """Test using style learning for consistency checking."""
        service = StyleLearningService()

        # Establish baseline from first chapter
        chapter1 = "The sun rose. He walked. The road was long. He was tired."
        profile = service.learn_style(chapter1, "Chapter 1 Style")

        # Check if subsequent content matches
        chapter2_good = "She ran. The wind blew. It was cold. She stopped."
        chapter2_bad = (
            "The magnificently resplendent sun rose gloriously above the "
            "verdant hills, casting its warm, golden light."
        )

        good_comparison = service.compare_to_sample(chapter2_good, profile.id)
        bad_comparison = service.compare_to_sample(chapter2_bad, profile.id)

        assert good_comparison.similarity_score > bad_comparison.similarity_score


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_empty_text(self):
        """Test handling of empty text."""
        service = StyleLearningService()
        profile = service.learn_style("", "Empty")

        assert profile.source_word_count == 0
        assert profile.metrics.avg_sentence_length == 0.0

    def test_single_word_text(self):
        """Test handling of single word."""
        service = StyleLearningService()
        profile = service.learn_style("Hello", "Single")

        assert profile.source_word_count == 1

    def test_very_long_text(self):
        """Test handling of very long text."""
        service = StyleLearningService()
        long_text = "The quick brown fox jumps over the lazy dog. " * 1000
        profile = service.learn_style(long_text, "Long")

        assert profile.source_word_count > 5000

    def test_special_characters(self):
        """Test handling of special characters."""
        service = StyleLearningService()
        text = "He said—with a pause—'Hello!' Then... he left? Yes, he did."
        profile = service.learn_style(text, "Special")

        assert "em_dash" in profile.characteristic_punctuation
        assert "ellipsis" in profile.characteristic_punctuation

    def test_unicode_text(self):
        """Test handling of Unicode text."""
        service = StyleLearningService()
        text = "Él caminó por la calle. «Hola», dijo. ¿Cómo estás?"
        profile = service.learn_style(text, "Unicode")

        assert profile.source_word_count > 0

    def test_only_dialogue(self):
        """Test text with only dialogue."""
        service = StyleLearningService()
        text = '"Hello." "Hi." "Goodbye."'
        profile = service.learn_style(text, "Only Dialogue")

        assert profile.metrics.dialogue_ratio > 0.8

    def test_no_sentences(self):
        """Test text without proper sentence endings."""
        service = StyleLearningService()
        text = "No sentences here just words without punctuation"
        profile = service.learn_style(text, "No Sentences")

        # Should handle gracefully
        assert profile.source_word_count > 0


class TestStyleApplication:
    """Tests for StyleApplication dataclass."""

    def test_default_values(self):
        """Test default application values."""
        app = StyleApplication()
        assert app.strength == 1.0
        assert app.preserve_aspects == []
        assert app.ignore_aspects == []

    def test_custom_values(self):
        """Test custom application values."""
        app = StyleApplication(
            strength=0.7,
            preserve_aspects=[StyleFeature.DIALOGUE_RATIO],
            ignore_aspects=[StyleFeature.ADVERB_USAGE],
        )
        assert app.strength == 0.7
        assert StyleFeature.DIALOGUE_RATIO in app.preserve_aspects
        assert StyleFeature.ADVERB_USAGE in app.ignore_aspects
