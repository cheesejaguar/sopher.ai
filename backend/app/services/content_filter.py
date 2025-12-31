"""Content filtering service for age-appropriate book generation.

This module provides content filtering based on:
- Target audience age
- Violence level settings
- Profanity settings
- Mature content settings
- Custom topics to avoid
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from app.schemas import ProjectSettings


class AudienceLevel(str, Enum):
    """Audience age classification levels."""

    CHILDREN = "children"  # Ages 6-10
    MIDDLE_GRADE = "middle_grade"  # Ages 10-14
    YOUNG_ADULT = "young_adult"  # Ages 14-18
    ADULT = "adult"  # Ages 18+


@dataclass
class ContentGuidelines:
    """Generated content guidelines based on settings."""

    audience_level: AudienceLevel
    violence_level: str  # none, mild, moderate, graphic
    violence_instruction: str
    profanity_instruction: str
    mature_content_instruction: str
    vocabulary_level: str
    themes_instruction: str
    avoid_topics: list[str]

    def to_prompt_section(self) -> str:
        """Convert guidelines to a prompt section for the writer agent."""
        sections = [
            "## Content Guidelines",
            "",
            f"**Target Audience:** {self.audience_level.value.replace('_', ' ').title()}",
            "",
            "### Content Restrictions",
            f"- **Violence:** {self.violence_instruction}",
            f"- **Language:** {self.profanity_instruction}",
            f"- **Mature Themes:** {self.mature_content_instruction}",
            "",
            "### Writing Style",
            f"- **Vocabulary:** {self.vocabulary_level}",
            f"- **Themes:** {self.themes_instruction}",
        ]

        if self.avoid_topics:
            sections.extend([
                "",
                "### Topics to Avoid",
                "The following topics must NOT appear in the content:",
            ])
            for topic in self.avoid_topics:
                sections.append(f"- {topic}")

        sections.extend([
            "",
            "**IMPORTANT:** These content guidelines are mandatory. "
            "Any content that violates these restrictions will be rejected.",
        ])

        return "\n".join(sections)


class ContentFilterService:
    """Service for generating content guidelines based on project settings."""

    # Violence level descriptions for each audience
    VIOLENCE_GUIDELINES = {
        AudienceLevel.CHILDREN: {
            "none": "No violence of any kind. Conflicts should be resolved peacefully.",
            "mild": "Only very mild cartoon-style conflict allowed. No injury or harm.",
        },
        AudienceLevel.MIDDLE_GRADE: {
            "none": "No violence. Focus on emotional and intellectual conflicts.",
            "mild": "Minor conflict is acceptable (pushing, chasing). No injury or blood.",
            "moderate": "Some physical conflict allowed, but no graphic descriptions. "
            "Injuries are mentioned briefly without detail.",
        },
        AudienceLevel.YOUNG_ADULT: {
            "none": "Avoid violence. Use tension and suspense without physical harm.",
            "mild": "Minor conflict allowed. Keep violence off-page when possible.",
            "moderate": "Moderate action is acceptable. Avoid graphic injury details.",
            "graphic": "Action and conflict allowed but maintain some restraint "
            "in describing injuries.",
        },
        AudienceLevel.ADULT: {
            "none": "Minimize violence. Focus on psychological tension.",
            "mild": "Brief, non-graphic violence is acceptable.",
            "moderate": "Realistic violence allowed with reasonable detail.",
            "graphic": "Graphic violence allowed within story context. "
            "Avoid gratuitous violence.",
        },
    }

    # Profanity guidelines for each audience
    PROFANITY_GUIDELINES = {
        AudienceLevel.CHILDREN: {
            True: "Use only mild exclamations (oh no, darn, heck). No actual profanity.",
            False: "No profanity or crude language of any kind.",
        },
        AudienceLevel.MIDDLE_GRADE: {
            True: "Mild swearing only (damn, hell). No strong profanity.",
            False: "No profanity. Use character-appropriate exclamations.",
        },
        AudienceLevel.YOUNG_ADULT: {
            True: "Moderate profanity acceptable. Avoid excessive use.",
            False: "No profanity. Express strong emotion without swearing.",
        },
        AudienceLevel.ADULT: {
            True: "Profanity allowed naturally in dialogue and narration.",
            False: "No profanity even for adult audiences.",
        },
    }

    # Mature content guidelines
    MATURE_CONTENT_GUIDELINES = {
        AudienceLevel.CHILDREN: {
            True: "No mature themes. Keep content age-appropriate for ages 6-10.",
            False: "No mature themes. Keep content age-appropriate for ages 6-10.",
        },
        AudienceLevel.MIDDLE_GRADE: {
            True: "Age-appropriate themes only. Handle serious topics sensitively "
            "without explicit detail.",
            False: "Keep themes light and age-appropriate for ages 10-14.",
        },
        AudienceLevel.YOUNG_ADULT: {
            True: "Mature themes (relationships, identity, loss) allowed with "
            "restraint. No explicit sexual content.",
            False: "Handle mature topics carefully. Fade to black for any "
            "romantic intimacy.",
        },
        AudienceLevel.ADULT: {
            True: "Mature themes allowed including complex relationships and "
            "adult situations.",
            False: "Handle mature themes with discretion. No explicit content.",
        },
    }

    # Vocabulary level by audience
    VOCABULARY_LEVELS = {
        AudienceLevel.CHILDREN: (
            "Use simple, clear vocabulary. Short sentences. "
            "Avoid complex words - explain any unfamiliar terms through context."
        ),
        AudienceLevel.MIDDLE_GRADE: (
            "Use age-appropriate vocabulary. Introduce some challenging words "
            "with context clues. Keep sentence structure varied but accessible."
        ),
        AudienceLevel.YOUNG_ADULT: (
            "Use rich vocabulary suitable for teens. Complex sentence structures "
            "are acceptable. Match vocabulary to character and genre."
        ),
        AudienceLevel.ADULT: (
            "Full vocabulary range available. Match complexity to genre and "
            "character voice."
        ),
    }

    # Theme guidelines by audience
    THEME_GUIDELINES = {
        AudienceLevel.CHILDREN: (
            "Focus on friendship, family, adventure, discovery, and overcoming "
            "fears. Positive resolutions. Good triumphs over challenges."
        ),
        AudienceLevel.MIDDLE_GRADE: (
            "Themes of identity, friendship, family dynamics, school challenges. "
            "Characters can face real problems but with hope and resolution."
        ),
        AudienceLevel.YOUNG_ADULT: (
            "Complex themes including identity, relationships, moral ambiguity, "
            "social issues. Characters face real consequences but stories have "
            "meaningful conclusions."
        ),
        AudienceLevel.ADULT: (
            "Full thematic range. Complex moral questions, nuanced characters, "
            "realistic consequences. Themes can be dark or challenging."
        ),
    }

    @classmethod
    def parse_target_audience(cls, target_audience: str) -> AudienceLevel:
        """Parse target audience string into AudienceLevel.

        Args:
            target_audience: The target audience string from settings

        Returns:
            The corresponding AudienceLevel enum value
        """
        audience_lower = target_audience.lower()

        # Children indicators
        if any(
            term in audience_lower
            for term in [
                "child",
                "kid",
                "6-10",
                "7-10",
                "8-10",
                "elementary",
                "grade school",
            ]
        ):
            return AudienceLevel.CHILDREN

        # Middle grade indicators
        if any(
            term in audience_lower
            for term in [
                "middle grade",
                "middle-grade",
                "tween",
                "10-14",
                "11-14",
                "middle school",
                "preteen",
            ]
        ):
            return AudienceLevel.MIDDLE_GRADE

        # Young adult indicators
        if any(
            term in audience_lower
            for term in [
                "young adult",
                "ya",
                "teen",
                "14-18",
                "15-18",
                "high school",
                "adolescent",
            ]
        ):
            return AudienceLevel.YOUNG_ADULT

        # Default to adult
        return AudienceLevel.ADULT

    @classmethod
    def generate_guidelines(cls, settings: ProjectSettings) -> ContentGuidelines:
        """Generate content guidelines from project settings.

        Args:
            settings: The project settings

        Returns:
            ContentGuidelines with all appropriate restrictions
        """
        audience = cls.parse_target_audience(settings.target_audience)

        # Get violence instruction based on audience and setting
        violence_options = cls.VIOLENCE_GUIDELINES[audience]
        violence_level = settings.violence_level
        # Clamp violence level for younger audiences
        if audience == AudienceLevel.CHILDREN and violence_level not in violence_options:
            violence_level = "mild"
        elif audience == AudienceLevel.MIDDLE_GRADE and violence_level == "graphic":
            violence_level = "moderate"
        violence_instruction = violence_options.get(
            violence_level, violence_options["mild"]
        )

        # Get profanity instruction
        # Children never get profanity even if set to True
        allow_profanity = settings.profanity and audience != AudienceLevel.CHILDREN
        profanity_instruction = cls.PROFANITY_GUIDELINES[audience][allow_profanity]

        # Get mature content instruction
        # Children never get mature content
        allow_mature = settings.mature_content and audience != AudienceLevel.CHILDREN
        mature_instruction = cls.MATURE_CONTENT_GUIDELINES[audience][allow_mature]

        # Get vocabulary level
        vocabulary_level = cls.VOCABULARY_LEVELS[audience]

        # Get theme guidelines
        themes_instruction = cls.THEME_GUIDELINES[audience]

        # Compile avoid topics
        avoid_topics = list(settings.avoid_topics) if settings.avoid_topics else []

        # Add automatic avoid topics for younger audiences
        if audience == AudienceLevel.CHILDREN:
            auto_avoid = [
                "death of main characters",
                "graphic injury",
                "romantic relationships",
                "substance abuse",
                "adult situations",
            ]
            avoid_topics.extend([t for t in auto_avoid if t not in avoid_topics])
        elif audience == AudienceLevel.MIDDLE_GRADE:
            auto_avoid = [
                "explicit violence",
                "substance abuse",
                "explicit romantic content",
            ]
            avoid_topics.extend([t for t in auto_avoid if t not in avoid_topics])

        return ContentGuidelines(
            audience_level=audience,
            violence_level=violence_level,
            violence_instruction=violence_instruction,
            profanity_instruction=profanity_instruction,
            mature_content_instruction=mature_instruction,
            vocabulary_level=vocabulary_level,
            themes_instruction=themes_instruction,
            avoid_topics=avoid_topics,
        )


class ContentValidator:
    """Validates generated content against guidelines.

    This provides post-generation validation to catch any content
    that may have violated the guidelines.
    """

    # Words/phrases that indicate potential issues
    PROFANITY_INDICATORS = [
        "fuck",
        "shit",
        "damn",
        "hell",
        "ass",
        "bitch",
        "bastard",
        "crap",
    ]

    VIOLENCE_INDICATORS = {
        "graphic": ["blood pooled", "entrails", "decapitat", "dismember", "gore"],
        "moderate": ["blood spray", "severed", "impaled"],
        "mild": ["stabbed", "slashed deeply", "bones broke"],
    }

    MATURE_CONTENT_INDICATORS = [
        "naked",
        "undress",
        "thrust",
        "moan",
        "climax",
        "explicit",
    ]

    @classmethod
    def validate_content(
        cls,
        content: str,
        guidelines: ContentGuidelines,
    ) -> tuple[bool, list[str]]:
        """Validate content against guidelines.

        Args:
            content: The generated content to validate
            guidelines: The content guidelines to check against

        Returns:
            Tuple of (is_valid, list of issues found)
        """
        issues: list[str] = []
        content_lower = content.lower()

        # Check profanity
        if "No profanity" in guidelines.profanity_instruction:
            for word in cls.PROFANITY_INDICATORS:
                if word in content_lower:
                    issues.append(f"Profanity detected: contains '{word}'")

        # Check violence level based on the violence_level field
        if guidelines.violence_level == "none":
            # No violence allowed - check all indicators
            for level, indicators in cls.VIOLENCE_INDICATORS.items():
                for phrase in indicators:
                    if phrase in content_lower:
                        issues.append(f"Violence detected: contains '{phrase}'")
        elif guidelines.violence_level == "mild":
            # Check for graphic and moderate indicators
            for level in ["graphic", "moderate"]:
                for phrase in cls.VIOLENCE_INDICATORS[level]:
                    if phrase in content_lower:
                        issues.append(
                            f"Violence level exceeded: contains '{phrase}'"
                        )
        elif guidelines.violence_level == "moderate":
            # Only check graphic indicators
            for phrase in cls.VIOLENCE_INDICATORS["graphic"]:
                if phrase in content_lower:
                    issues.append(f"Violence level exceeded: contains '{phrase}'")

        # Check mature content
        if guidelines.audience_level in [
            AudienceLevel.CHILDREN,
            AudienceLevel.MIDDLE_GRADE,
        ]:
            for indicator in cls.MATURE_CONTENT_INDICATORS:
                if indicator in content_lower:
                    issues.append(f"Mature content detected: contains '{indicator}'")

        # Check avoid topics
        for topic in guidelines.avoid_topics:
            if topic.lower() in content_lower:
                issues.append(f"Avoided topic detected: '{topic}'")

        return len(issues) == 0, issues


def build_content_filter_prompt(settings: Optional[ProjectSettings]) -> str:
    """Build content filter prompt section from project settings.

    Args:
        settings: Optional project settings. If None, returns minimal default.

    Returns:
        String containing the content guidelines prompt section.
    """
    if settings is None:
        return ""

    guidelines = ContentFilterService.generate_guidelines(settings)
    return guidelines.to_prompt_section()
