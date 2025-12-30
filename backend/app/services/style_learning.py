"""Style learning service for sopher.ai.

This module provides functionality to learn writing styles from sample texts
and apply them to generated content.
"""

import re
import statistics
from collections import Counter
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class StyleFeature(Enum):
    """Categories of style features that can be extracted."""

    SENTENCE_LENGTH = "sentence_length"
    PARAGRAPH_LENGTH = "paragraph_length"
    VOCABULARY_COMPLEXITY = "vocabulary_complexity"
    DIALOGUE_RATIO = "dialogue_ratio"
    ADVERB_USAGE = "adverb_usage"
    PASSIVE_VOICE = "passive_voice"
    PUNCTUATION_STYLE = "punctuation_style"
    CONTRACTION_USAGE = "contraction_usage"
    SENTENCE_VARIETY = "sentence_variety"
    DESCRIPTION_DENSITY = "description_density"


class SentencePattern(Enum):
    """Types of sentence patterns that can be detected."""

    SIMPLE = "simple"
    COMPOUND = "compound"
    COMPLEX = "complex"
    COMPOUND_COMPLEX = "compound_complex"


@dataclass
class StyleMetrics:
    """Quantitative metrics extracted from sample text."""

    avg_sentence_length: float = 0.0
    sentence_length_std: float = 0.0
    avg_paragraph_length: float = 0.0
    avg_word_length: float = 0.0
    vocabulary_richness: float = 0.0  # Type-token ratio
    dialogue_ratio: float = 0.0
    adverb_ratio: float = 0.0
    passive_voice_ratio: float = 0.0
    contraction_ratio: float = 0.0
    exclamation_ratio: float = 0.0
    question_ratio: float = 0.0
    sentence_patterns: dict[str, float] = field(default_factory=dict)
    common_sentence_starters: list[str] = field(default_factory=list)
    avg_adjectives_per_sentence: float = 0.0


@dataclass
class StyleProfile:
    """A complete style profile extracted from sample text."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    source_text_length: int = 0
    source_word_count: int = 0
    metrics: StyleMetrics = field(default_factory=StyleMetrics)
    vocabulary_sample: list[str] = field(default_factory=list)
    phrase_patterns: list[str] = field(default_factory=list)
    transition_words: list[str] = field(default_factory=list)
    characteristic_punctuation: list[str] = field(default_factory=list)


@dataclass
class StyleApplication:
    """Configuration for applying a learned style to generation."""

    profile_id: UUID = field(default_factory=uuid4)
    strength: float = 1.0  # 0.0 to 1.0
    preserve_aspects: list[StyleFeature] = field(default_factory=list)
    ignore_aspects: list[StyleFeature] = field(default_factory=list)


@dataclass
class StyleComparisonResult:
    """Result of comparing two style profiles."""

    similarity_score: float = 0.0
    matching_features: list[StyleFeature] = field(default_factory=list)
    divergent_features: list[StyleFeature] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)


class SentenceExtractor:
    """Extracts sentences from text."""

    SENTENCE_PATTERN = re.compile(r"[^.!?]*[.!?]")
    DIALOGUE_PATTERN = re.compile(r'"[^"]*"')

    def extract_sentences(self, text: str) -> list[str]:
        """Extract sentences from text."""
        # Remove dialogue to get narrative sentences
        narrative_text = self.DIALOGUE_PATTERN.sub("", text)
        sentences = self.SENTENCE_PATTERN.findall(narrative_text)
        return [s.strip() for s in sentences if s.strip()]

    def extract_dialogue(self, text: str) -> list[str]:
        """Extract dialogue from text."""
        matches = self.DIALOGUE_PATTERN.findall(text)
        return [m.strip('"') for m in matches if m.strip('"')]


class VocabularyAnalyzer:
    """Analyzes vocabulary usage in text."""

    COMMON_WORDS = {
        "the",
        "a",
        "an",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "shall",
        "can",
        "to",
        "of",
        "in",
        "for",
        "on",
        "with",
        "at",
        "by",
        "from",
        "as",
        "into",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "between",
        "under",
        "again",
        "further",
        "then",
        "once",
        "and",
        "but",
        "or",
        "nor",
        "so",
        "yet",
        "both",
        "either",
        "neither",
        "not",
        "only",
        "own",
        "same",
        "than",
        "too",
        "very",
        "just",
        "he",
        "she",
        "it",
        "they",
        "we",
        "you",
        "i",
        "me",
        "him",
        "her",
        "them",
        "us",
        "my",
        "your",
        "his",
        "her",
        "its",
        "our",
        "their",
        "this",
        "that",
        "these",
        "those",
        "what",
        "which",
        "who",
        "whom",
        "whose",
    }

    ADVERBS_PATTERN = re.compile(r"\b\w+ly\b", re.IGNORECASE)

    def get_words(self, text: str) -> list[str]:
        """Extract words from text."""
        return re.findall(r"\b[a-zA-Z]+\b", text.lower())

    def calculate_richness(self, words: list[str]) -> float:
        """Calculate type-token ratio (vocabulary richness)."""
        if not words:
            return 0.0
        unique_words = set(words)
        return len(unique_words) / len(words)

    def get_content_words(self, words: list[str]) -> list[str]:
        """Get content words (non-common words)."""
        return [w for w in words if w not in self.COMMON_WORDS]

    def count_adverbs(self, text: str) -> int:
        """Count adverbs ending in -ly."""
        return len(self.ADVERBS_PATTERN.findall(text))

    def get_distinctive_vocabulary(self, words: list[str], top_n: int = 50) -> list[str]:
        """Get distinctive vocabulary (frequent content words)."""
        content_words = self.get_content_words(words)
        word_counts = Counter(content_words)
        return [word for word, _ in word_counts.most_common(top_n)]


class SentencePatternAnalyzer:
    """Analyzes sentence structure patterns."""

    CONJUNCTIONS = {"and", "but", "or", "nor", "so", "yet", "for"}
    SUBORDINATING = {
        "although",
        "because",
        "since",
        "while",
        "when",
        "where",
        "if",
        "unless",
        "until",
        "after",
        "before",
        "though",
        "whereas",
        "whenever",
        "wherever",
    }

    def classify_sentence(self, sentence: str) -> SentencePattern:
        """Classify a sentence by its structure."""
        words = sentence.lower().split()
        has_coord = any(w in self.CONJUNCTIONS for w in words)
        has_subord = any(w in self.SUBORDINATING for w in words)

        if has_coord and has_subord:
            return SentencePattern.COMPOUND_COMPLEX
        elif has_coord:
            return SentencePattern.COMPOUND
        elif has_subord:
            return SentencePattern.COMPLEX
        else:
            return SentencePattern.SIMPLE

    def get_pattern_distribution(self, sentences: list[str]) -> dict[str, float]:
        """Get distribution of sentence patterns."""
        if not sentences:
            return {}

        patterns = [self.classify_sentence(s) for s in sentences]
        counts = Counter(p.value for p in patterns)
        total = len(patterns)

        return {pattern: count / total for pattern, count in counts.items()}

    def get_common_starters(self, sentences: list[str], top_n: int = 10) -> list[str]:
        """Get most common sentence starters (first 1-2 words)."""
        starters = []
        for sentence in sentences:
            words = sentence.split()
            if len(words) >= 2:
                starters.append(f"{words[0]} {words[1]}".lower())
            elif words:
                starters.append(words[0].lower())

        counter = Counter(starters)
        return [starter for starter, _ in counter.most_common(top_n)]


class PassiveVoiceDetector:
    """Detects passive voice constructions."""

    BE_VERBS = {"am", "is", "are", "was", "were", "be", "been", "being"}
    PAST_PARTICIPLE_PATTERN = re.compile(r"\b\w+ed\b|\b\w+en\b", re.IGNORECASE)

    IRREGULAR_PAST_PARTICIPLES = {
        "been",
        "begun",
        "bitten",
        "blown",
        "broken",
        "brought",
        "built",
        "burnt",
        "bought",
        "caught",
        "chosen",
        "come",
        "cost",
        "cut",
        "done",
        "drawn",
        "drunk",
        "driven",
        "eaten",
        "fallen",
        "felt",
        "fought",
        "found",
        "flown",
        "forgotten",
        "forgiven",
        "frozen",
        "given",
        "gone",
        "grown",
        "had",
        "heard",
        "hidden",
        "hit",
        "held",
        "hurt",
        "kept",
        "known",
        "laid",
        "led",
        "left",
        "lent",
        "let",
        "lost",
        "made",
        "meant",
        "met",
        "paid",
        "put",
        "read",
        "ridden",
        "rung",
        "risen",
        "run",
        "said",
        "seen",
        "sold",
        "sent",
        "set",
        "shaken",
        "shown",
        "shut",
        "sung",
        "sat",
        "slept",
        "spoken",
        "spent",
        "stood",
        "stolen",
        "struck",
        "sworn",
        "swum",
        "taken",
        "taught",
        "told",
        "thought",
        "thrown",
        "understood",
        "woken",
        "worn",
        "won",
        "written",
    }

    def is_passive(self, sentence: str) -> bool:
        """Check if a sentence contains passive voice."""
        words = sentence.lower().split()

        for i, word in enumerate(words):
            if word in self.BE_VERBS and i + 1 < len(words):
                next_word = words[i + 1]
                # Check for past participle
                if next_word in self.IRREGULAR_PAST_PARTICIPLES:
                    return True
                if next_word.endswith("ed") or next_word.endswith("en"):
                    return True

        return False

    def count_passive(self, sentences: list[str]) -> int:
        """Count sentences with passive voice."""
        return sum(1 for s in sentences if self.is_passive(s))


class StyleFeatureExtractor:
    """Extracts style features from sample text."""

    def __init__(self):
        self.sentence_extractor = SentenceExtractor()
        self.vocabulary_analyzer = VocabularyAnalyzer()
        self.pattern_analyzer = SentencePatternAnalyzer()
        self.passive_detector = PassiveVoiceDetector()

    def extract_metrics(self, text: str) -> StyleMetrics:
        """Extract quantitative style metrics from text."""
        sentences = self.sentence_extractor.extract_sentences(text)
        dialogue = self.sentence_extractor.extract_dialogue(text)
        words = self.vocabulary_analyzer.get_words(text)
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

        # Calculate metrics
        metrics = StyleMetrics()

        # Sentence length
        if sentences:
            sentence_lengths = [len(s.split()) for s in sentences]
            metrics.avg_sentence_length = statistics.mean(sentence_lengths)
            if len(sentence_lengths) > 1:
                metrics.sentence_length_std = statistics.stdev(sentence_lengths)

        # Paragraph length
        if paragraphs:
            paragraph_lengths = [len(p.split()) for p in paragraphs]
            metrics.avg_paragraph_length = statistics.mean(paragraph_lengths)

        # Word length
        if words:
            word_lengths = [len(w) for w in words]
            metrics.avg_word_length = statistics.mean(word_lengths)

        # Vocabulary richness
        metrics.vocabulary_richness = self.vocabulary_analyzer.calculate_richness(words)

        # Dialogue ratio
        total_words = len(words)
        if total_words > 0:
            dialogue_words = sum(len(d.split()) for d in dialogue)
            metrics.dialogue_ratio = dialogue_words / total_words

        # Adverb ratio
        if total_words > 0:
            adverb_count = self.vocabulary_analyzer.count_adverbs(text)
            metrics.adverb_ratio = adverb_count / total_words

        # Passive voice ratio
        if sentences:
            passive_count = self.passive_detector.count_passive(sentences)
            metrics.passive_voice_ratio = passive_count / len(sentences)

        # Contraction ratio
        contractions = len(re.findall(r"\b\w+'\w+\b", text))
        if total_words > 0:
            metrics.contraction_ratio = contractions / total_words

        # Punctuation ratios
        if sentences:
            exclamations = sum(1 for s in sentences if s.strip().endswith("!"))
            questions = sum(1 for s in sentences if s.strip().endswith("?"))
            metrics.exclamation_ratio = exclamations / len(sentences)
            metrics.question_ratio = questions / len(sentences)

        # Sentence patterns
        metrics.sentence_patterns = self.pattern_analyzer.get_pattern_distribution(sentences)
        metrics.common_sentence_starters = self.pattern_analyzer.get_common_starters(sentences)

        # Adjectives per sentence (rough estimate based on common adjective patterns)
        adjective_pattern = re.compile(
            r"\b(beautiful|dark|bright|small|large|old|young|good|bad|new|long|short|great|little|high|low|big|fast|slow|hot|cold|warm|cool|hard|soft|strong|weak|happy|sad|angry|scared|tired|hungry|thirsty|sick|healthy)\b",
            re.IGNORECASE,
        )
        if sentences:
            total_adj = len(adjective_pattern.findall(text))
            metrics.avg_adjectives_per_sentence = total_adj / len(sentences)

        return metrics

    def extract_profile(self, text: str, name: str = "") -> StyleProfile:
        """Extract a complete style profile from sample text."""
        words = self.vocabulary_analyzer.get_words(text)

        profile = StyleProfile(
            name=name,
            source_text_length=len(text),
            source_word_count=len(words),
            metrics=self.extract_metrics(text),
            vocabulary_sample=self.vocabulary_analyzer.get_distinctive_vocabulary(words),
        )

        # Extract transition words
        transition_pattern = re.compile(
            r"\b(however|therefore|moreover|furthermore|consequently|nevertheless|meanwhile|otherwise|indeed|thus|hence|accordingly|similarly|likewise|alternatively|subsequently|finally|initially|ultimately|eventually)\b",
            re.IGNORECASE,
        )
        profile.transition_words = list(set(transition_pattern.findall(text.lower())))

        # Extract phrase patterns (common 3-grams)
        profile.phrase_patterns = self._extract_phrase_patterns(text)

        # Characteristic punctuation
        profile.characteristic_punctuation = self._extract_punctuation_style(text)

        return profile

    def _extract_phrase_patterns(self, text: str, top_n: int = 20) -> list[str]:
        """Extract common phrase patterns (3-grams)."""
        words = text.lower().split()
        if len(words) < 3:
            return []

        trigrams = [" ".join(words[i : i + 3]) for i in range(len(words) - 2)]
        # Filter out trigrams with common words only
        content_trigrams = [
            t for t in trigrams if not all(w in VocabularyAnalyzer.COMMON_WORDS for w in t.split())
        ]

        counter = Counter(content_trigrams)
        return [phrase for phrase, count in counter.most_common(top_n) if count > 1]

    def _extract_punctuation_style(self, text: str) -> list[str]:
        """Extract characteristic punctuation usage."""
        patterns = []

        # Em dashes
        if "—" in text or " - " in text or "--" in text:
            patterns.append("em_dash")

        # Semicolons
        if ";" in text:
            patterns.append("semicolon")

        # Ellipses
        if "..." in text or "…" in text:
            patterns.append("ellipsis")

        # Parentheses
        if "(" in text:
            patterns.append("parentheses")

        # Exclamations
        if "!" in text:
            patterns.append("exclamation")

        return patterns


class StylePromptGenerator:
    """Generates prompts to apply a learned style."""

    def generate_style_prompt(self, profile: StyleProfile, strength: float = 1.0) -> str:
        """Generate a prompt section describing the style to emulate."""
        metrics = profile.metrics
        prompts = []

        # Sentence length guidance
        if metrics.avg_sentence_length > 0:
            if metrics.avg_sentence_length < 12:
                prompts.append(
                    f"Use short, punchy sentences averaging {metrics.avg_sentence_length:.0f} words."
                )
            elif metrics.avg_sentence_length > 25:
                prompts.append(
                    f"Use longer, flowing sentences averaging {metrics.avg_sentence_length:.0f} words with varied structure."
                )
            else:
                prompts.append(
                    f"Use medium-length sentences averaging {metrics.avg_sentence_length:.0f} words."
                )

        # Sentence variety
        if metrics.sentence_length_std > 10:
            prompts.append("Vary sentence length significantly for rhythm and pacing.")
        elif metrics.sentence_length_std < 5:
            prompts.append("Keep sentence lengths fairly consistent.")

        # Dialogue ratio
        if metrics.dialogue_ratio > 0.4:
            prompts.append("Use extensive dialogue (dialogue-heavy style).")
        elif metrics.dialogue_ratio < 0.1:
            prompts.append("Use minimal dialogue (narrative-heavy style).")

        # Adverb usage
        if metrics.adverb_ratio < 0.01:
            prompts.append("Avoid adverbs (-ly words). Show, don't tell.")
        elif metrics.adverb_ratio > 0.03:
            prompts.append("Use adverbs freely to modify actions and descriptions.")

        # Passive voice
        if metrics.passive_voice_ratio < 0.05:
            prompts.append("Use active voice almost exclusively.")
        elif metrics.passive_voice_ratio > 0.2:
            prompts.append("Use passive voice when appropriate for emphasis or variation.")

        # Contractions
        if metrics.contraction_ratio > 0.02:
            prompts.append("Use contractions freely for a conversational tone.")
        elif metrics.contraction_ratio < 0.005:
            prompts.append("Avoid contractions for a formal tone.")

        # Vocabulary
        if metrics.vocabulary_richness > 0.6:
            prompts.append("Use varied, rich vocabulary. Avoid word repetition.")
        elif metrics.vocabulary_richness < 0.4:
            prompts.append("Use simple, accessible vocabulary. Repetition is acceptable.")

        # Punctuation style
        if "em_dash" in profile.characteristic_punctuation:
            prompts.append("Use em dashes for interruptions, asides, and emphasis.")
        if "semicolon" in profile.characteristic_punctuation:
            prompts.append("Use semicolons to connect related independent clauses.")
        if "ellipsis" in profile.characteristic_punctuation:
            prompts.append("Use ellipses for trailing thoughts and hesitation.")

        # Sentence patterns
        if metrics.sentence_patterns:
            dominant = max(metrics.sentence_patterns.items(), key=lambda x: x[1], default=(None, 0))
            if dominant[0] == "simple" and dominant[1] > 0.5:
                prompts.append("Favor simple, direct sentence structures.")
            elif dominant[0] == "complex" and dominant[1] > 0.3:
                prompts.append("Use complex sentences with subordinate clauses.")
            elif dominant[0] == "compound" and dominant[1] > 0.3:
                prompts.append("Use compound sentences connected by conjunctions.")

        # Transition words
        if profile.transition_words:
            prompts.append(f"Use transitions like: {', '.join(profile.transition_words[:5])}.")

        # Apply strength modifier
        if strength < 1.0:
            prompts = [f"Lightly apply: {p}" if strength < 0.5 else p for p in prompts]

        return "\n".join(prompts)

    def generate_vocabulary_guidance(self, profile: StyleProfile) -> str:
        """Generate vocabulary guidance from the profile."""
        if not profile.vocabulary_sample:
            return ""

        vocab = profile.vocabulary_sample[:20]
        return f"Incorporate vocabulary similar to: {', '.join(vocab)}"


class StyleComparator:
    """Compares style profiles for similarity."""

    def compare(self, profile1: StyleProfile, profile2: StyleProfile) -> StyleComparisonResult:
        """Compare two style profiles."""
        m1, m2 = profile1.metrics, profile2.metrics

        matching = []
        divergent = []
        recommendations = []

        # Compare sentence length
        sl_diff = abs(m1.avg_sentence_length - m2.avg_sentence_length)
        if sl_diff < 5:
            matching.append(StyleFeature.SENTENCE_LENGTH)
        else:
            divergent.append(StyleFeature.SENTENCE_LENGTH)
            recommendations.append(
                f"Adjust sentence length from {m1.avg_sentence_length:.1f} to {m2.avg_sentence_length:.1f} words"
            )

        # Compare dialogue ratio
        dr_diff = abs(m1.dialogue_ratio - m2.dialogue_ratio)
        if dr_diff < 0.1:
            matching.append(StyleFeature.DIALOGUE_RATIO)
        else:
            divergent.append(StyleFeature.DIALOGUE_RATIO)
            if m2.dialogue_ratio > m1.dialogue_ratio:
                recommendations.append("Increase dialogue usage")
            else:
                recommendations.append("Decrease dialogue usage")

        # Compare adverb usage
        ar_diff = abs(m1.adverb_ratio - m2.adverb_ratio)
        if ar_diff < 0.01:
            matching.append(StyleFeature.ADVERB_USAGE)
        else:
            divergent.append(StyleFeature.ADVERB_USAGE)

        # Compare passive voice
        pv_diff = abs(m1.passive_voice_ratio - m2.passive_voice_ratio)
        if pv_diff < 0.1:
            matching.append(StyleFeature.PASSIVE_VOICE)
        else:
            divergent.append(StyleFeature.PASSIVE_VOICE)

        # Compare contraction usage
        cr_diff = abs(m1.contraction_ratio - m2.contraction_ratio)
        if cr_diff < 0.01:
            matching.append(StyleFeature.CONTRACTION_USAGE)
        else:
            divergent.append(StyleFeature.CONTRACTION_USAGE)

        # Compare vocabulary complexity
        vr_diff = abs(m1.vocabulary_richness - m2.vocabulary_richness)
        if vr_diff < 0.1:
            matching.append(StyleFeature.VOCABULARY_COMPLEXITY)
        else:
            divergent.append(StyleFeature.VOCABULARY_COMPLEXITY)

        # Calculate overall similarity
        total_features = len(matching) + len(divergent)
        similarity = len(matching) / total_features if total_features > 0 else 0.0

        return StyleComparisonResult(
            similarity_score=similarity,
            matching_features=matching,
            divergent_features=divergent,
            recommendations=recommendations,
        )


class StyleLearningService:
    """Main service for learning and applying writing styles."""

    def __init__(self):
        self.extractor = StyleFeatureExtractor()
        self.prompt_generator = StylePromptGenerator()
        self.comparator = StyleComparator()
        self._profiles: dict[UUID, StyleProfile] = {}

    def learn_style(self, sample_text: str, name: str = "") -> StyleProfile:
        """Learn a style from sample text."""
        profile = self.extractor.extract_profile(sample_text, name)
        self._profiles[profile.id] = profile
        return profile

    def get_profile(self, profile_id: UUID) -> Optional[StyleProfile]:
        """Get a stored style profile by ID."""
        return self._profiles.get(profile_id)

    def list_profiles(self) -> list[StyleProfile]:
        """List all stored style profiles."""
        return list(self._profiles.values())

    def delete_profile(self, profile_id: UUID) -> bool:
        """Delete a stored style profile."""
        if profile_id in self._profiles:
            del self._profiles[profile_id]
            return True
        return False

    def generate_style_prompt(
        self,
        profile_id: UUID,
        strength: float = 1.0,
        include_vocabulary: bool = True,
    ) -> str:
        """Generate a prompt to apply a learned style."""
        profile = self._profiles.get(profile_id)
        if not profile:
            return ""

        parts = [self.prompt_generator.generate_style_prompt(profile, strength)]

        if include_vocabulary:
            vocab_guidance = self.prompt_generator.generate_vocabulary_guidance(profile)
            if vocab_guidance:
                parts.append(vocab_guidance)

        return "\n\n".join(parts)

    def compare_to_sample(self, generated_text: str, profile_id: UUID) -> StyleComparisonResult:
        """Compare generated text to a learned style profile."""
        target_profile = self._profiles.get(profile_id)
        if not target_profile:
            return StyleComparisonResult()

        generated_profile = self.extractor.extract_profile(generated_text)
        return self.comparator.compare(generated_profile, target_profile)

    def analyze_text(self, text: str) -> StyleMetrics:
        """Analyze the style metrics of a text without storing."""
        return self.extractor.extract_metrics(text)

    def blend_profiles(
        self,
        profile_ids: list[UUID],
        weights: Optional[list[float]] = None,
        name: str = "",
    ) -> StyleProfile:
        """Blend multiple style profiles into a new profile."""
        profiles = [self._profiles.get(pid) for pid in profile_ids]
        profiles = [p for p in profiles if p is not None]

        if not profiles:
            return StyleProfile(name=name)

        if weights is None:
            weights = [1.0 / len(profiles)] * len(profiles)

        # Normalize weights
        total_weight = sum(weights)
        weights = [w / total_weight for w in weights]

        # Blend metrics
        blended_metrics = StyleMetrics()

        blended_metrics.avg_sentence_length = sum(
            p.metrics.avg_sentence_length * w for p, w in zip(profiles, weights)
        )
        blended_metrics.sentence_length_std = sum(
            p.metrics.sentence_length_std * w for p, w in zip(profiles, weights)
        )
        blended_metrics.avg_paragraph_length = sum(
            p.metrics.avg_paragraph_length * w for p, w in zip(profiles, weights)
        )
        blended_metrics.avg_word_length = sum(
            p.metrics.avg_word_length * w for p, w in zip(profiles, weights)
        )
        blended_metrics.vocabulary_richness = sum(
            p.metrics.vocabulary_richness * w for p, w in zip(profiles, weights)
        )
        blended_metrics.dialogue_ratio = sum(
            p.metrics.dialogue_ratio * w for p, w in zip(profiles, weights)
        )
        blended_metrics.adverb_ratio = sum(
            p.metrics.adverb_ratio * w for p, w in zip(profiles, weights)
        )
        blended_metrics.passive_voice_ratio = sum(
            p.metrics.passive_voice_ratio * w for p, w in zip(profiles, weights)
        )
        blended_metrics.contraction_ratio = sum(
            p.metrics.contraction_ratio * w for p, w in zip(profiles, weights)
        )
        blended_metrics.exclamation_ratio = sum(
            p.metrics.exclamation_ratio * w for p, w in zip(profiles, weights)
        )
        blended_metrics.question_ratio = sum(
            p.metrics.question_ratio * w for p, w in zip(profiles, weights)
        )

        # Combine vocabulary samples
        vocab_sample = []
        for profile in profiles:
            vocab_sample.extend(profile.vocabulary_sample[:10])
        vocab_sample = list(set(vocab_sample))[:50]

        # Combine transition words
        transition_words = []
        for profile in profiles:
            transition_words.extend(profile.transition_words)
        transition_words = list(set(transition_words))

        # Combine punctuation styles
        punctuation = []
        for profile in profiles:
            punctuation.extend(profile.characteristic_punctuation)
        punctuation = list(set(punctuation))

        blended_profile = StyleProfile(
            name=name or "Blended Style",
            source_text_length=sum(p.source_text_length for p in profiles),
            source_word_count=sum(p.source_word_count for p in profiles),
            metrics=blended_metrics,
            vocabulary_sample=vocab_sample,
            transition_words=transition_words,
            characteristic_punctuation=punctuation,
        )

        self._profiles[blended_profile.id] = blended_profile
        return blended_profile
