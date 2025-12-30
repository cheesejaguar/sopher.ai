"""
Prose quality metrics service.

Provides comprehensive text analysis for:
- Reading level (Flesch-Kincaid, Flesch Reading Ease, Gunning Fog, etc.)
- Sentence variety analysis
- Passive voice detection
- Adverb usage tracking
- Dialogue-to-narrative ratio
"""

import re
from dataclasses import dataclass, field
from enum import Enum


class ReadingLevel(Enum):
    """Reading level categories based on grade level."""

    ELEMENTARY = "elementary"  # Grades 1-5 (ages 6-11)
    MIDDLE_SCHOOL = "middle_school"  # Grades 6-8 (ages 11-14)
    HIGH_SCHOOL = "high_school"  # Grades 9-12 (ages 14-18)
    COLLEGE = "college"  # College level
    GRADUATE = "graduate"  # Graduate/professional level


@dataclass
class ReadabilityScores:
    """Collection of readability metrics."""

    flesch_reading_ease: float = 0.0
    flesch_kincaid_grade: float = 0.0
    gunning_fog_index: float = 0.0
    smog_index: float = 0.0
    coleman_liau_index: float = 0.0
    automated_readability_index: float = 0.0
    average_grade_level: float = 0.0
    reading_level: ReadingLevel = ReadingLevel.HIGH_SCHOOL

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "flesch_reading_ease": round(self.flesch_reading_ease, 2),
            "flesch_kincaid_grade": round(self.flesch_kincaid_grade, 2),
            "gunning_fog_index": round(self.gunning_fog_index, 2),
            "smog_index": round(self.smog_index, 2),
            "coleman_liau_index": round(self.coleman_liau_index, 2),
            "automated_readability_index": round(self.automated_readability_index, 2),
            "average_grade_level": round(self.average_grade_level, 2),
            "reading_level": self.reading_level.value,
        }


@dataclass
class SentenceVariety:
    """Metrics for sentence variety and structure."""

    total_sentences: int = 0
    average_length: float = 0.0
    length_std_dev: float = 0.0
    shortest_sentence: int = 0
    longest_sentence: int = 0
    sentence_lengths: list[int] = field(default_factory=list)
    variety_score: float = 0.0  # 0-1, higher is more varied

    # Sentence type breakdown
    simple_sentences: int = 0
    compound_sentences: int = 0
    complex_sentences: int = 0
    question_sentences: int = 0
    exclamation_sentences: int = 0

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "total_sentences": self.total_sentences,
            "average_length": round(self.average_length, 2),
            "length_std_dev": round(self.length_std_dev, 2),
            "shortest_sentence": self.shortest_sentence,
            "longest_sentence": self.longest_sentence,
            "variety_score": round(self.variety_score, 2),
            "simple_sentences": self.simple_sentences,
            "compound_sentences": self.compound_sentences,
            "complex_sentences": self.complex_sentences,
            "question_sentences": self.question_sentences,
            "exclamation_sentences": self.exclamation_sentences,
        }


@dataclass
class VoiceAnalysis:
    """Passive voice detection results."""

    total_sentences: int = 0
    passive_sentences: int = 0
    passive_percentage: float = 0.0
    passive_instances: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "total_sentences": self.total_sentences,
            "passive_sentences": self.passive_sentences,
            "passive_percentage": round(self.passive_percentage, 2),
            "passive_instances": self.passive_instances[:10],  # Limit examples
        }


@dataclass
class AdverbAnalysis:
    """Adverb usage tracking results."""

    total_words: int = 0
    adverb_count: int = 0
    adverb_percentage: float = 0.0
    adverbs_found: list[str] = field(default_factory=list)
    ly_adverbs: int = 0
    sentence_starting_adverbs: int = 0

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "total_words": self.total_words,
            "adverb_count": self.adverb_count,
            "adverb_percentage": round(self.adverb_percentage, 2),
            "adverbs_found": list(set(self.adverbs_found))[:20],  # Unique, limited
            "ly_adverbs": self.ly_adverbs,
            "sentence_starting_adverbs": self.sentence_starting_adverbs,
        }


@dataclass
class DialogueRatio:
    """Dialogue to narrative ratio analysis."""

    total_words: int = 0
    dialogue_words: int = 0
    narrative_words: int = 0
    dialogue_percentage: float = 0.0
    dialogue_exchanges: int = 0
    average_exchange_length: float = 0.0

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "total_words": self.total_words,
            "dialogue_words": self.dialogue_words,
            "narrative_words": self.narrative_words,
            "dialogue_percentage": round(self.dialogue_percentage, 2),
            "dialogue_exchanges": self.dialogue_exchanges,
            "average_exchange_length": round(self.average_exchange_length, 2),
        }


@dataclass
class ProseQualityReport:
    """Complete prose quality analysis report."""

    word_count: int = 0
    character_count: int = 0
    paragraph_count: int = 0
    readability: ReadabilityScores = field(default_factory=ReadabilityScores)
    sentence_variety: SentenceVariety = field(default_factory=SentenceVariety)
    voice_analysis: VoiceAnalysis = field(default_factory=VoiceAnalysis)
    adverb_analysis: AdverbAnalysis = field(default_factory=AdverbAnalysis)
    dialogue_ratio: DialogueRatio = field(default_factory=DialogueRatio)
    overall_score: float = 0.0  # 0-100 quality score

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "word_count": self.word_count,
            "character_count": self.character_count,
            "paragraph_count": self.paragraph_count,
            "readability": self.readability.to_dict(),
            "sentence_variety": self.sentence_variety.to_dict(),
            "voice_analysis": self.voice_analysis.to_dict(),
            "adverb_analysis": self.adverb_analysis.to_dict(),
            "dialogue_ratio": self.dialogue_ratio.to_dict(),
            "overall_score": round(self.overall_score, 2),
        }


class TextStatistics:
    """Utility class for computing text statistics."""

    # Regex patterns
    SENTENCE_PATTERN = re.compile(r"[.!?]+(?:\s|$)")
    WORD_PATTERN = re.compile(r"\b\w+\b")
    SYLLABLE_VOWEL_PATTERN = re.compile(r"[aeiouy]+", re.IGNORECASE)
    DIALOGUE_PATTERN = re.compile(r'["\u201c\u201d]([^"\u201c\u201d]+)["\u201c\u201d]')
    PARAGRAPH_PATTERN = re.compile(r"\n\s*\n")

    # Common word endings that don't add a syllable
    SILENT_ENDINGS = ["es", "ed", "e"]

    @classmethod
    def count_syllables(cls, word: str) -> int:
        """Count syllables in a word using vowel groups."""
        word = word.lower().strip()
        if len(word) <= 2:
            return 1

        # Remove common silent endings
        for ending in cls.SILENT_ENDINGS:
            if word.endswith(ending) and len(word) > len(ending) + 1:
                word = word[: -len(ending)]
                break

        # Count vowel groups
        syllables = len(cls.SYLLABLE_VOWEL_PATTERN.findall(word))
        return max(1, syllables)

    @classmethod
    def get_words(cls, text: str) -> list[str]:
        """Extract all words from text."""
        return cls.WORD_PATTERN.findall(text)

    @classmethod
    def get_sentences(cls, text: str) -> list[str]:
        """Split text into sentences."""
        # Handle abbreviations and other edge cases
        sentences = cls.SENTENCE_PATTERN.split(text)
        return [s.strip() for s in sentences if s.strip()]

    @classmethod
    def count_complex_words(cls, words: list[str]) -> int:
        """Count words with 3+ syllables (excluding common suffixes)."""
        complex_count = 0
        for word in words:
            # Skip proper nouns (simple heuristic: starts with capital)
            if word[0].isupper():
                continue
            # Skip common suffixes that don't add complexity
            base_word = word.lower()
            for suffix in ["ing", "ed", "es", "ly"]:
                if base_word.endswith(suffix):
                    base_word = base_word[: -len(suffix)]
                    break
            if cls.count_syllables(base_word) >= 3:
                complex_count += 1
        return complex_count


class ReadabilityAnalyzer:
    """Calculates various readability metrics."""

    @classmethod
    def analyze(cls, text: str) -> ReadabilityScores:
        """Analyze text readability and return scores."""
        if not text or not text.strip():
            return ReadabilityScores()

        words = TextStatistics.get_words(text)
        sentences = TextStatistics.get_sentences(text)

        if not words or not sentences:
            return ReadabilityScores()

        total_words = len(words)
        total_sentences = len(sentences)
        total_syllables = sum(TextStatistics.count_syllables(w) for w in words)
        total_characters = sum(len(w) for w in words)
        complex_words = TextStatistics.count_complex_words(words)

        # Calculate metrics
        avg_words_per_sentence = total_words / total_sentences
        avg_syllables_per_word = total_syllables / total_words

        scores = ReadabilityScores()

        # Flesch Reading Ease
        # 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
        scores.flesch_reading_ease = (
            206.835 - 1.015 * avg_words_per_sentence - 84.6 * avg_syllables_per_word
        )
        scores.flesch_reading_ease = max(0, min(100, scores.flesch_reading_ease))

        # Flesch-Kincaid Grade Level
        # 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
        scores.flesch_kincaid_grade = (
            0.39 * avg_words_per_sentence + 11.8 * avg_syllables_per_word - 15.59
        )
        scores.flesch_kincaid_grade = max(0, scores.flesch_kincaid_grade)

        # Gunning Fog Index
        # 0.4 * ((words/sentences) + 100 * (complex/words))
        complex_ratio = (complex_words / total_words) * 100 if total_words > 0 else 0
        scores.gunning_fog_index = 0.4 * (avg_words_per_sentence + complex_ratio)

        # SMOG Index (requires at least 30 sentences for accuracy)
        # 1.0430 * sqrt(complex_words * (30/sentences)) + 3.1291
        if total_sentences >= 10:
            smog_complex = complex_words * (30 / total_sentences)
            scores.smog_index = 1.0430 * (smog_complex**0.5) + 3.1291
        else:
            scores.smog_index = scores.flesch_kincaid_grade  # Fallback

        # Coleman-Liau Index
        # 0.0588 * L - 0.296 * S - 15.8
        # L = average letters per 100 words, S = average sentences per 100 words
        l_value = (total_characters / total_words) * 100
        s_value = (total_sentences / total_words) * 100
        scores.coleman_liau_index = 0.0588 * l_value - 0.296 * s_value - 15.8
        scores.coleman_liau_index = max(0, scores.coleman_liau_index)

        # Automated Readability Index
        # 4.71 * (characters/words) + 0.5 * (words/sentences) - 21.43
        avg_chars_per_word = total_characters / total_words
        scores.automated_readability_index = (
            4.71 * avg_chars_per_word + 0.5 * avg_words_per_sentence - 21.43
        )
        scores.automated_readability_index = max(0, scores.automated_readability_index)

        # Calculate average grade level
        grade_scores = [
            scores.flesch_kincaid_grade,
            scores.gunning_fog_index,
            scores.smog_index,
            scores.coleman_liau_index,
            scores.automated_readability_index,
        ]
        scores.average_grade_level = sum(grade_scores) / len(grade_scores)

        # Determine reading level category
        avg = scores.average_grade_level
        if avg <= 5:
            scores.reading_level = ReadingLevel.ELEMENTARY
        elif avg <= 8:
            scores.reading_level = ReadingLevel.MIDDLE_SCHOOL
        elif avg <= 12:
            scores.reading_level = ReadingLevel.HIGH_SCHOOL
        elif avg <= 16:
            scores.reading_level = ReadingLevel.COLLEGE
        else:
            scores.reading_level = ReadingLevel.GRADUATE

        return scores


class SentenceVarietyAnalyzer:
    """Analyzes sentence structure and variety."""

    # Coordinating conjunctions for compound detection
    COORDINATING_CONJUNCTIONS = {"and", "but", "or", "nor", "for", "yet", "so"}

    # Subordinating conjunctions for complex detection
    SUBORDINATING_CONJUNCTIONS = {
        "after",
        "although",
        "as",
        "because",
        "before",
        "if",
        "once",
        "since",
        "than",
        "that",
        "though",
        "till",
        "unless",
        "until",
        "when",
        "where",
        "whether",
        "while",
    }

    # Pattern to split sentences while keeping the punctuation
    SENTENCE_WITH_PUNCT = re.compile(r"([^.!?]+[.!?]+)")

    @classmethod
    def analyze(cls, text: str) -> SentenceVariety:
        """Analyze sentence variety in text."""
        if not text or not text.strip():
            return SentenceVariety()

        # Get sentences with punctuation for type classification
        sentences_with_punct = cls.SENTENCE_WITH_PUNCT.findall(text)
        if not sentences_with_punct:
            # Fallback: text without clear sentence boundaries
            sentences_with_punct = [text.strip()] if text.strip() else []

        sentences = TextStatistics.get_sentences(text)
        if not sentences:
            return SentenceVariety()

        variety = SentenceVariety()
        variety.total_sentences = len(sentences)

        # Calculate sentence lengths and classify types
        for i, sentence in enumerate(sentences):
            words = TextStatistics.get_words(sentence)
            word_count = len(words)
            variety.sentence_lengths.append(word_count)

            # Get corresponding sentence with punctuation for classification
            if i < len(sentences_with_punct):
                sentence_with_punct = sentences_with_punct[i].strip()
            else:
                sentence_with_punct = sentence.strip()

            # Classify sentence type based on ending punctuation
            if sentence_with_punct.endswith("?"):
                variety.question_sentences += 1
            elif sentence_with_punct.endswith("!"):
                variety.exclamation_sentences += 1
            else:
                # Determine if simple, compound, or complex
                sentence_lower = sentence.lower()
                words_set = set(TextStatistics.get_words(sentence_lower))

                has_coord = bool(words_set & cls.COORDINATING_CONJUNCTIONS)
                has_subord = bool(words_set & cls.SUBORDINATING_CONJUNCTIONS)

                if has_subord:
                    variety.complex_sentences += 1
                elif has_coord:
                    variety.compound_sentences += 1
                else:
                    variety.simple_sentences += 1

        # Calculate statistics
        if variety.sentence_lengths:
            variety.average_length = sum(variety.sentence_lengths) / len(variety.sentence_lengths)
            variety.shortest_sentence = min(variety.sentence_lengths)
            variety.longest_sentence = max(variety.sentence_lengths)

            # Calculate standard deviation
            if len(variety.sentence_lengths) > 1:
                mean = variety.average_length
                variance = sum((x - mean) ** 2 for x in variety.sentence_lengths) / len(
                    variety.sentence_lengths
                )
                variety.length_std_dev = variance**0.5

            # Calculate variety score (based on std dev relative to mean)
            # Higher std dev relative to mean = more variety
            if variety.average_length > 0:
                variety.variety_score = min(1.0, variety.length_std_dev / variety.average_length)

        return variety


class PassiveVoiceDetector:
    """Detects passive voice constructions."""

    # Common forms of "to be"
    TO_BE_FORMS = {"am", "is", "are", "was", "were", "be", "being", "been"}

    # Common irregular past participles
    IRREGULAR_PAST_PARTICIPLES = {
        "built",
        "bought",
        "brought",
        "caught",
        "done",
        "drunk",
        "eaten",
        "fallen",
        "felt",
        "found",
        "forgotten",
        "frozen",
        "given",
        "gone",
        "grown",
        "held",
        "hidden",
        "hit",
        "hurt",
        "kept",
        "known",
        "left",
        "lost",
        "made",
        "meant",
        "met",
        "paid",
        "put",
        "read",
        "run",
        "said",
        "seen",
        "sent",
        "set",
        "shown",
        "shut",
        "slept",
        "sold",
        "spent",
        "spoken",
        "stood",
        "struck",
        "sung",
        "taken",
        "taught",
        "thought",
        "told",
        "understood",
        "won",
        "worn",
        "written",
    }

    # Pattern for passive voice: form of "to be" + optional adverb + past participle
    # Matches: "was written", "was quickly written", "is being done"
    PASSIVE_PATTERN = re.compile(
        r"\b(am|is|are|was|were|be|being|been)\s+(?:\w+ly\s+)?(\w+)\b", re.IGNORECASE
    )

    @classmethod
    def _is_past_participle(cls, word: str) -> bool:
        """Check if a word is likely a past participle."""
        word_lower = word.lower()
        # Check regular past participles
        if word_lower.endswith("ed") or word_lower.endswith("en"):
            return True
        # Check irregular past participles
        if word_lower in cls.IRREGULAR_PAST_PARTICIPLES:
            return True
        return False

    @classmethod
    def analyze(cls, text: str) -> VoiceAnalysis:
        """Analyze text for passive voice usage."""
        if not text or not text.strip():
            return VoiceAnalysis()

        sentences = TextStatistics.get_sentences(text)
        if not sentences:
            return VoiceAnalysis()

        analysis = VoiceAnalysis()
        analysis.total_sentences = len(sentences)

        for sentence in sentences:
            sentence_has_passive = False
            for match in cls.PASSIVE_PATTERN.finditer(sentence):
                to_be_form = match.group(1)
                following_word = match.group(2)
                if cls._is_past_participle(following_word):
                    if not sentence_has_passive:
                        analysis.passive_sentences += 1
                        sentence_has_passive = True
                    analysis.passive_instances.append(f"{to_be_form} ... {following_word}")

        if analysis.total_sentences > 0:
            analysis.passive_percentage = (
                analysis.passive_sentences / analysis.total_sentences
            ) * 100

        return analysis


class AdverbTracker:
    """Tracks adverb usage in text."""

    # Common adverbs to track (non-exhaustive)
    COMMON_ADVERBS = {
        "actually",
        "almost",
        "already",
        "also",
        "always",
        "certainly",
        "completely",
        "constantly",
        "definitely",
        "easily",
        "entirely",
        "especially",
        "even",
        "eventually",
        "exactly",
        "extremely",
        "fairly",
        "finally",
        "frequently",
        "generally",
        "greatly",
        "hardly",
        "highly",
        "immediately",
        "indeed",
        "instead",
        "just",
        "largely",
        "lately",
        "likely",
        "literally",
        "maybe",
        "merely",
        "mostly",
        "nearly",
        "never",
        "normally",
        "obviously",
        "often",
        "only",
        "particularly",
        "perhaps",
        "possibly",
        "presumably",
        "probably",
        "quickly",
        "quite",
        "rather",
        "really",
        "recently",
        "relatively",
        "seemingly",
        "simply",
        "slightly",
        "sometimes",
        "somewhat",
        "soon",
        "still",
        "suddenly",
        "surely",
        "then",
        "therefore",
        "thus",
        "together",
        "too",
        "truly",
        "typically",
        "unfortunately",
        "usually",
        "utterly",
        "very",
        "virtually",
        "well",
        "widely",
    }

    @classmethod
    def analyze(cls, text: str) -> AdverbAnalysis:
        """Analyze adverb usage in text."""
        if not text or not text.strip():
            return AdverbAnalysis()

        words = TextStatistics.get_words(text)
        sentences = TextStatistics.get_sentences(text)

        if not words:
            return AdverbAnalysis()

        analysis = AdverbAnalysis()
        analysis.total_words = len(words)

        for word in words:
            word_lower = word.lower()

            # Check for -ly adverbs (excluding common false positives)
            if word_lower.endswith("ly") and len(word_lower) > 3:
                # Exclude words that are adjectives ending in -ly
                if word_lower not in {
                    "only",
                    "early",
                    "daily",
                    "weekly",
                    "monthly",
                    "yearly",
                    "costly",
                    "elderly",
                    "friendly",
                    "likely",
                    "lonely",
                    "lovely",
                    "silly",
                    "ugly",
                    "holy",
                    "jolly",
                    "hilly",
                    "chilly",
                }:
                    analysis.adverb_count += 1
                    analysis.ly_adverbs += 1
                    analysis.adverbs_found.append(word_lower)
            # Check against common adverbs list
            elif word_lower in cls.COMMON_ADVERBS:
                analysis.adverb_count += 1
                analysis.adverbs_found.append(word_lower)

        # Check for sentence-starting adverbs
        for sentence in sentences:
            words_in_sentence = TextStatistics.get_words(sentence)
            if words_in_sentence:
                first_word = words_in_sentence[0].lower()
                if first_word in cls.COMMON_ADVERBS or (
                    first_word.endswith("ly") and len(first_word) > 3
                ):
                    analysis.sentence_starting_adverbs += 1

        if analysis.total_words > 0:
            analysis.adverb_percentage = (analysis.adverb_count / analysis.total_words) * 100

        return analysis


class DialogueAnalyzer:
    """Analyzes dialogue to narrative ratio."""

    # Patterns for dialogue detection
    DOUBLE_QUOTE_PATTERN = re.compile(r'"([^"]*)"')
    SMART_QUOTE_PATTERN = re.compile(r"[\u201c]([^\u201d]*)[\u201d]")

    @classmethod
    def analyze(cls, text: str) -> DialogueRatio:
        """Analyze dialogue to narrative ratio."""
        if not text or not text.strip():
            return DialogueRatio()

        total_words = len(TextStatistics.get_words(text))
        if total_words == 0:
            return DialogueRatio()

        ratio = DialogueRatio()
        ratio.total_words = total_words

        # Find all dialogue
        dialogue_matches = cls.DOUBLE_QUOTE_PATTERN.findall(text)
        dialogue_matches.extend(cls.SMART_QUOTE_PATTERN.findall(text))

        ratio.dialogue_exchanges = len(dialogue_matches)

        # Count dialogue words
        dialogue_word_count = 0
        for match in dialogue_matches:
            dialogue_word_count += len(TextStatistics.get_words(match))

        ratio.dialogue_words = dialogue_word_count
        ratio.narrative_words = total_words - dialogue_word_count

        if total_words > 0:
            ratio.dialogue_percentage = (dialogue_word_count / total_words) * 100

        if ratio.dialogue_exchanges > 0:
            ratio.average_exchange_length = dialogue_word_count / ratio.dialogue_exchanges

        return ratio


class ProseQualityService:
    """Main service for prose quality analysis."""

    @classmethod
    def analyze(cls, text: str) -> ProseQualityReport:
        """Perform complete prose quality analysis."""
        if not text or not text.strip():
            return ProseQualityReport()

        report = ProseQualityReport()

        # Basic counts
        words = TextStatistics.get_words(text)
        report.word_count = len(words)
        report.character_count = len(text)
        paragraphs = TextStatistics.PARAGRAPH_PATTERN.split(text)
        report.paragraph_count = len([p for p in paragraphs if p.strip()])

        # Run all analyzers
        report.readability = ReadabilityAnalyzer.analyze(text)
        report.sentence_variety = SentenceVarietyAnalyzer.analyze(text)
        report.voice_analysis = PassiveVoiceDetector.analyze(text)
        report.adverb_analysis = AdverbTracker.analyze(text)
        report.dialogue_ratio = DialogueAnalyzer.analyze(text)

        # Calculate overall quality score
        report.overall_score = cls._calculate_overall_score(report)

        return report

    @classmethod
    def _calculate_overall_score(cls, report: ProseQualityReport) -> float:
        """Calculate overall quality score (0-100)."""
        score = 100.0

        # Readability penalty (target: Flesch Reading Ease 60-80)
        fre = report.readability.flesch_reading_ease
        if fre < 30 or fre > 90:
            score -= 10
        elif fre < 50 or fre > 85:
            score -= 5

        # Sentence variety bonus/penalty
        variety = report.sentence_variety.variety_score
        if variety > 0.4:
            score += 5
        elif variety < 0.2:
            score -= 10

        # Passive voice penalty (target: < 10%)
        passive = report.voice_analysis.passive_percentage
        if passive > 20:
            score -= 15
        elif passive > 10:
            score -= 5

        # Adverb penalty (target: < 2%)
        adverb = report.adverb_analysis.adverb_percentage
        if adverb > 4:
            score -= 15
        elif adverb > 2:
            score -= 5

        # Dialogue ratio consideration (fiction typically 30-50%)
        dialogue = report.dialogue_ratio.dialogue_percentage
        if dialogue < 10 or dialogue > 70:
            score -= 5

        return max(0, min(100, score))

    @classmethod
    def get_recommendations(cls, report: ProseQualityReport) -> list[str]:
        """Generate recommendations based on analysis."""
        recommendations = []

        # Readability recommendations
        fre = report.readability.flesch_reading_ease
        if fre < 50:
            recommendations.append(
                "Consider simplifying sentence structure. The text is quite difficult to read. "
                "Try using shorter sentences and more common words."
            )
        elif fre > 80:
            recommendations.append(
                "The text may be too simple for adult fiction. "
                "Consider adding more complexity and varied vocabulary."
            )

        # Sentence variety
        if report.sentence_variety.variety_score < 0.2:
            recommendations.append(
                "Sentence lengths are very uniform. "
                "Try varying sentence length more to create rhythm and interest."
            )

        # Passive voice
        if report.voice_analysis.passive_percentage > 15:
            recommendations.append(
                f"Passive voice is used in {report.voice_analysis.passive_percentage:.1f}% of sentences. "
                "Consider converting some passive constructions to active voice."
            )

        # Adverbs
        if report.adverb_analysis.adverb_percentage > 3:
            recommendations.append(
                f"Adverbs make up {report.adverb_analysis.adverb_percentage:.1f}% of words. "
                "Consider replacing adverbs with stronger verbs."
            )

        if report.adverb_analysis.sentence_starting_adverbs > 3:
            recommendations.append(
                f"Found {report.adverb_analysis.sentence_starting_adverbs} sentences starting with adverbs. "
                "Vary sentence openers for better flow."
            )

        # Dialogue
        dialogue_pct = report.dialogue_ratio.dialogue_percentage
        if dialogue_pct < 15:
            recommendations.append(
                "Dialogue is sparse (under 15%). Consider adding more character conversations "
                "to break up narrative and reveal character."
            )
        elif dialogue_pct > 60:
            recommendations.append(
                "Dialogue is heavy (over 60%). Balance with more narrative, description, "
                "and introspection."
            )

        return recommendations
