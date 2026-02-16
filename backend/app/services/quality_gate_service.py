"""Quality gate service for team task completion validation.

Wraps the existing QualityGate/QualityAnalyzer to provide task-level
quality assessment that the TeamLead uses for completion decisions.
"""

import logging
from typing import Any, Optional

from .quality_gates import QualityGate, QualityReport, QualityThreshold

logger = logging.getLogger(__name__)


class QualityGateService:
    """Quality gate enforcement for team task completion.

    Assesses the quality of task results and determines whether
    they meet the threshold for completion or need retry.
    """

    def __init__(self, threshold: Optional[QualityThreshold] = None):
        self.threshold = threshold or QualityThreshold()
        self.gate = QualityGate(self.threshold)

    def assess(self, task_type: str, result: Any) -> float:
        """Assess quality of a task result.

        Args:
            task_type: Type of task (concept, outline, write_chapter, etc.)
            result: The task result to assess.

        Returns:
            Quality score between 0.0 and 1.0.
        """
        if task_type == "write_chapter":
            return self._assess_chapter(result)
        elif task_type == "edit_chapter":
            return self._assess_edited_chapter(result)
        elif task_type == "outline":
            return self._assess_outline(result)
        elif task_type == "continuity_check":
            return self._assess_continuity(result)
        elif task_type == "concept":
            return self._assess_concept(result)
        return 1.0  # Default pass for unknown types

    def should_retry(self, score: float) -> bool:
        """Determine if a task should be retried based on its quality score.

        Args:
            score: The quality score.

        Returns:
            True if the task should be retried.
        """
        return score < self.threshold.auto_regenerate_below

    def get_report(self, task_type: str, result: Any) -> QualityReport:
        """Get a full quality report for a task result.

        Args:
            task_type: Type of task.
            result: The task result.

        Returns:
            Detailed QualityReport.
        """
        content = self._extract_content(result)
        return self.gate.check(
            text=content,
            content_id=f"task-{task_type}",
            content_type=task_type,
        )

    def _assess_chapter(self, result: Any) -> float:
        """Assess chapter writing quality."""
        content = self._extract_content(result)
        if not content or len(content.split()) < 100:
            return 0.3  # Too short

        report = self.gate.check(
            text=content,
            content_id="chapter",
            content_type="chapter",
        )
        return report.overall_score

    def _assess_edited_chapter(self, result: Any) -> float:
        """Assess edited chapter quality."""
        content = self._extract_content(result)
        if not content:
            return 0.3

        report = self.gate.check(
            text=content,
            content_id="edited-chapter",
            content_type="chapter",
        )
        # Edited chapters should score higher
        return min(1.0, report.overall_score * 1.1)

    def _assess_outline(self, result: Any) -> float:
        """Assess outline quality."""
        if hasattr(result, "model_dump"):
            data = result.model_dump()
        elif isinstance(result, dict):
            data = result
        else:
            return 0.7  # Can't assess non-structured outline

        chapters = data.get("chapters", [])
        if not chapters:
            return 0.3

        # Check for basic completeness
        score = 0.5
        if len(chapters) >= 5:
            score += 0.1
        if all(ch.get("title") for ch in chapters):
            score += 0.1
        if all(ch.get("summary") for ch in chapters):
            score += 0.1
        if data.get("character_summaries"):
            score += 0.1
        if data.get("plot_threads"):
            score += 0.1

        return min(1.0, score)

    def _assess_continuity(self, result: Any) -> float:
        """Assess continuity check quality."""
        if hasattr(result, "model_dump"):
            data = result.model_dump()
        elif isinstance(result, dict):
            data = result
        else:
            return 0.7

        # Continuity check always passes if it produced results
        score = data.get("consistency_score", 0.7)

        # The check itself is valuable regardless of issues found
        return max(0.6, score)

    def _assess_concept(self, result: Any) -> float:
        """Assess concept generation quality."""
        if hasattr(result, "model_dump"):
            data = result.model_dump()
        elif isinstance(result, dict):
            data = result
        else:
            return 0.7

        score = 0.4
        if data.get("title"):
            score += 0.1
        if data.get("genre"):
            score += 0.1
        if data.get("themes") and len(data["themes"]) >= 2:
            score += 0.1
        if data.get("central_conflict"):
            score += 0.1
        if data.get("setting"):
            score += 0.1
        if data.get("unique_elements"):
            score += 0.1

        return min(1.0, score)

    def _extract_content(self, result: Any) -> str:
        """Extract text content from various result types."""
        if isinstance(result, str):
            return result
        if hasattr(result, "content"):
            return result.content
        if hasattr(result, "model_dump"):
            data = result.model_dump()
            return data.get("content", str(result))
        if isinstance(result, dict):
            return result.get("content", str(result))
        return str(result)
