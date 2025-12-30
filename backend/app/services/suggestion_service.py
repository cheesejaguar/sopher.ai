"""
Suggestion tracking service for managing edit suggestions.

Provides persistence and retrieval of edit suggestions with:
- CRUD operations for suggestions
- Filtering by chapter, pass type, severity, status
- Tracking accepted/rejected suggestions for learning
- Edit history management
"""

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EditHistory, Suggestion


@dataclass
class SuggestionStats:
    """Statistics about suggestions for a chapter or project."""

    total: int = 0
    pending: int = 0
    applied: int = 0
    rejected: int = 0
    by_severity: dict = None
    by_pass_type: dict = None
    by_suggestion_type: dict = None

    def __post_init__(self):
        if self.by_severity is None:
            self.by_severity = {"info": 0, "warning": 0, "error": 0}
        if self.by_pass_type is None:
            self.by_pass_type = {"structural": 0, "line": 0, "copy": 0, "proofread": 0}
        if self.by_suggestion_type is None:
            self.by_suggestion_type = {}

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "total": self.total,
            "pending": self.pending,
            "applied": self.applied,
            "rejected": self.rejected,
            "by_severity": self.by_severity,
            "by_pass_type": self.by_pass_type,
            "by_suggestion_type": self.by_suggestion_type,
        }


@dataclass
class SuggestionFilter:
    """Filters for querying suggestions."""

    chapter_number: Optional[int] = None
    pass_type: Optional[str] = None
    suggestion_type: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    min_confidence: Optional[float] = None


class SuggestionService:
    """Service for managing edit suggestions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_suggestion(
        self,
        project_id: UUID,
        chapter_number: int,
        pass_type: str,
        suggestion_type: str,
        explanation: str,
        severity: str = "info",
        original_text: str = "",
        suggested_text: str = "",
        start_position: int = 0,
        end_position: int = 0,
        confidence: float = 0.5,
    ) -> Suggestion:
        """Create a new suggestion."""
        suggestion = Suggestion(
            project_id=project_id,
            chapter_number=chapter_number,
            pass_type=pass_type,
            suggestion_type=suggestion_type,
            severity=severity,
            original_text=original_text,
            suggested_text=suggested_text,
            start_position=start_position,
            end_position=end_position,
            explanation=explanation,
            confidence=confidence,
            status="pending",
        )
        self.db.add(suggestion)
        await self.db.commit()
        await self.db.refresh(suggestion)
        return suggestion

    async def get_suggestion(self, suggestion_id: UUID) -> Optional[Suggestion]:
        """Get a suggestion by ID."""
        stmt = select(Suggestion).where(Suggestion.id == suggestion_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_suggestions(
        self,
        project_id: UUID,
        filters: Optional[SuggestionFilter] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Suggestion]:
        """Get suggestions for a project with optional filters."""
        stmt = select(Suggestion).where(Suggestion.project_id == project_id)

        if filters:
            if filters.chapter_number is not None:
                stmt = stmt.where(Suggestion.chapter_number == filters.chapter_number)
            if filters.pass_type:
                stmt = stmt.where(Suggestion.pass_type == filters.pass_type)
            if filters.suggestion_type:
                stmt = stmt.where(Suggestion.suggestion_type == filters.suggestion_type)
            if filters.severity:
                stmt = stmt.where(Suggestion.severity == filters.severity)
            if filters.status:
                stmt = stmt.where(Suggestion.status == filters.status)
            if filters.min_confidence is not None:
                stmt = stmt.where(Suggestion.confidence >= filters.min_confidence)

        stmt = stmt.order_by(Suggestion.created_at.desc())
        stmt = stmt.limit(limit).offset(offset)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def apply_suggestion(self, suggestion_id: UUID) -> tuple[bool, str]:
        """Mark a suggestion as applied."""
        suggestion = await self.get_suggestion(suggestion_id)
        if not suggestion:
            return False, "Suggestion not found"

        if suggestion.status == "applied":
            return False, "Suggestion already applied"

        if suggestion.status == "rejected":
            return False, "Cannot apply rejected suggestion"

        suggestion.status = "applied"
        await self.db.commit()
        return True, "Suggestion applied"

    async def reject_suggestion(self, suggestion_id: UUID) -> tuple[bool, str]:
        """Mark a suggestion as rejected."""
        suggestion = await self.get_suggestion(suggestion_id)
        if not suggestion:
            return False, "Suggestion not found"

        if suggestion.status == "rejected":
            return False, "Suggestion already rejected"

        if suggestion.status == "applied":
            return False, "Cannot reject applied suggestion"

        suggestion.status = "rejected"
        await self.db.commit()
        return True, "Suggestion rejected"

    async def delete_suggestion(self, suggestion_id: UUID) -> bool:
        """Delete a suggestion."""
        suggestion = await self.get_suggestion(suggestion_id)
        if not suggestion:
            return False

        await self.db.delete(suggestion)
        await self.db.commit()
        return True

    async def get_stats(
        self,
        project_id: UUID,
        chapter_number: Optional[int] = None,
    ) -> SuggestionStats:
        """Get suggestion statistics for a project or chapter."""
        base_filter = Suggestion.project_id == project_id
        if chapter_number is not None:
            base_filter = and_(base_filter, Suggestion.chapter_number == chapter_number)

        # Total count
        total_stmt = select(func.count()).select_from(Suggestion).where(base_filter)
        total_result = await self.db.execute(total_stmt)
        total = total_result.scalar() or 0

        # Count by status
        status_stmt = (
            select(Suggestion.status, func.count()).where(base_filter).group_by(Suggestion.status)
        )
        status_result = await self.db.execute(status_stmt)
        status_counts = {row[0]: row[1] for row in status_result.all()}

        # Count by severity
        severity_stmt = (
            select(Suggestion.severity, func.count())
            .where(base_filter)
            .group_by(Suggestion.severity)
        )
        severity_result = await self.db.execute(severity_stmt)
        severity_counts = {row[0]: row[1] for row in severity_result.all()}

        # Count by pass type
        pass_stmt = (
            select(Suggestion.pass_type, func.count())
            .where(base_filter)
            .group_by(Suggestion.pass_type)
        )
        pass_result = await self.db.execute(pass_stmt)
        pass_counts = {row[0]: row[1] for row in pass_result.all()}

        # Count by suggestion type
        type_stmt = (
            select(Suggestion.suggestion_type, func.count())
            .where(base_filter)
            .group_by(Suggestion.suggestion_type)
        )
        type_result = await self.db.execute(type_stmt)
        type_counts = {row[0]: row[1] for row in type_result.all()}

        stats = SuggestionStats(
            total=total,
            pending=status_counts.get("pending", 0),
            applied=status_counts.get("applied", 0),
            rejected=status_counts.get("rejected", 0),
        )
        stats.by_severity = {
            "info": severity_counts.get("info", 0),
            "warning": severity_counts.get("warning", 0),
            "error": severity_counts.get("error", 0),
        }
        stats.by_pass_type = {
            "structural": pass_counts.get("structural", 0),
            "line": pass_counts.get("line", 0),
            "copy": pass_counts.get("copy", 0),
            "proofread": pass_counts.get("proofread", 0),
        }
        stats.by_suggestion_type = type_counts

        return stats

    async def bulk_create_suggestions(
        self,
        project_id: UUID,
        chapter_number: int,
        suggestions: list[dict],
    ) -> list[Suggestion]:
        """Create multiple suggestions at once."""
        created = []
        for sugg_data in suggestions:
            suggestion = Suggestion(
                project_id=project_id,
                chapter_number=chapter_number,
                pass_type=sugg_data.get("pass_type", ""),
                suggestion_type=sugg_data.get("suggestion_type", ""),
                severity=sugg_data.get("severity", "info"),
                original_text=sugg_data.get("original_text", ""),
                suggested_text=sugg_data.get("suggested_text", ""),
                start_position=sugg_data.get("start_position", 0),
                end_position=sugg_data.get("end_position", 0),
                explanation=sugg_data.get("explanation", ""),
                confidence=sugg_data.get("confidence", 0.5),
                status="pending",
            )
            self.db.add(suggestion)
            created.append(suggestion)

        await self.db.commit()
        for s in created:
            await self.db.refresh(s)
        return created

    async def clear_chapter_suggestions(
        self,
        project_id: UUID,
        chapter_number: int,
        pass_type: Optional[str] = None,
    ) -> int:
        """Clear suggestions for a chapter, optionally filtered by pass type."""
        stmt = select(Suggestion).where(
            and_(
                Suggestion.project_id == project_id,
                Suggestion.chapter_number == chapter_number,
            )
        )
        if pass_type:
            stmt = stmt.where(Suggestion.pass_type == pass_type)

        result = await self.db.execute(stmt)
        suggestions = result.scalars().all()
        count = len(suggestions)

        for suggestion in suggestions:
            await self.db.delete(suggestion)

        await self.db.commit()
        return count


class EditHistoryService:
    """Service for managing edit history."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_history_entry(
        self,
        project_id: UUID,
        chapter_number: int,
        pass_type: str,
        suggestions_generated: int = 0,
        suggestions_applied: int = 0,
        suggestions_rejected: int = 0,
        content_before: Optional[str] = None,
        content_after: Optional[str] = None,
    ) -> EditHistory:
        """Create a new edit history entry."""
        entry = EditHistory(
            project_id=project_id,
            chapter_number=chapter_number,
            pass_type=pass_type,
            suggestions_generated=suggestions_generated,
            suggestions_applied=suggestions_applied,
            suggestions_rejected=suggestions_rejected,
            content_before=content_before,
            content_after=content_after,
        )
        self.db.add(entry)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def get_history(
        self,
        project_id: UUID,
        chapter_number: Optional[int] = None,
        pass_type: Optional[str] = None,
        limit: int = 50,
    ) -> list[EditHistory]:
        """Get edit history for a project or chapter."""
        stmt = select(EditHistory).where(EditHistory.project_id == project_id)

        if chapter_number is not None:
            stmt = stmt.where(EditHistory.chapter_number == chapter_number)
        if pass_type:
            stmt = stmt.where(EditHistory.pass_type == pass_type)

        stmt = stmt.order_by(EditHistory.created_at.desc()).limit(limit)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_latest_entry(
        self,
        project_id: UUID,
        chapter_number: int,
        pass_type: Optional[str] = None,
    ) -> Optional[EditHistory]:
        """Get the most recent edit history entry."""
        stmt = select(EditHistory).where(
            and_(
                EditHistory.project_id == project_id,
                EditHistory.chapter_number == chapter_number,
            )
        )
        if pass_type:
            stmt = stmt.where(EditHistory.pass_type == pass_type)

        stmt = stmt.order_by(EditHistory.created_at.desc()).limit(1)

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_summary(
        self,
        project_id: UUID,
        chapter_number: Optional[int] = None,
    ) -> dict:
        """Get a summary of edit history."""
        base_filter = EditHistory.project_id == project_id
        if chapter_number is not None:
            base_filter = and_(base_filter, EditHistory.chapter_number == chapter_number)

        # Total passes
        total_stmt = select(func.count()).select_from(EditHistory).where(base_filter)
        total_result = await self.db.execute(total_stmt)
        total_passes = total_result.scalar() or 0

        # Sum of suggestions
        sum_stmt = select(
            func.sum(EditHistory.suggestions_generated),
            func.sum(EditHistory.suggestions_applied),
            func.sum(EditHistory.suggestions_rejected),
        ).where(base_filter)
        sum_result = await self.db.execute(sum_stmt)
        sums = sum_result.one()

        # Count by pass type
        pass_stmt = (
            select(EditHistory.pass_type, func.count())
            .where(base_filter)
            .group_by(EditHistory.pass_type)
        )
        pass_result = await self.db.execute(pass_stmt)
        pass_counts = {row[0]: row[1] for row in pass_result.all()}

        return {
            "total_passes": total_passes,
            "total_suggestions_generated": sums[0] or 0,
            "total_suggestions_applied": sums[1] or 0,
            "total_suggestions_rejected": sums[2] or 0,
            "passes_by_type": pass_counts,
        }


class UserPreferenceLearner:
    """Learns from user accept/reject patterns to improve suggestions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_acceptance_rate(
        self,
        project_id: UUID,
        suggestion_type: Optional[str] = None,
        pass_type: Optional[str] = None,
    ) -> float:
        """Calculate acceptance rate for suggestions."""
        base_filter = Suggestion.project_id == project_id

        if suggestion_type:
            base_filter = and_(base_filter, Suggestion.suggestion_type == suggestion_type)
        if pass_type:
            base_filter = and_(base_filter, Suggestion.pass_type == pass_type)

        # Count applied and rejected
        applied_stmt = (
            select(func.count())
            .select_from(Suggestion)
            .where(and_(base_filter, Suggestion.status == "applied"))
        )
        applied_result = await self.db.execute(applied_stmt)
        applied_count = applied_result.scalar() or 0

        rejected_stmt = (
            select(func.count())
            .select_from(Suggestion)
            .where(and_(base_filter, Suggestion.status == "rejected"))
        )
        rejected_result = await self.db.execute(rejected_stmt)
        rejected_count = rejected_result.scalar() or 0

        total = applied_count + rejected_count
        if total == 0:
            return 0.5  # Default 50% if no data

        return applied_count / total

    async def get_preference_profile(self, project_id: UUID) -> dict:
        """Get a profile of user preferences based on accept/reject patterns."""
        # Get acceptance rates by suggestion type
        type_stmt = (
            select(
                Suggestion.suggestion_type,
                func.count().filter(Suggestion.status == "applied").label("applied"),
                func.count().filter(Suggestion.status == "rejected").label("rejected"),
            )
            .where(Suggestion.project_id == project_id)
            .group_by(Suggestion.suggestion_type)
        )
        type_result = await self.db.execute(type_stmt)
        type_rates = {}
        for row in type_result.all():
            total = row[1] + row[2]
            if total > 0:
                type_rates[row[0]] = {
                    "applied": row[1],
                    "rejected": row[2],
                    "acceptance_rate": row[1] / total,
                }

        # Get acceptance rates by severity
        severity_stmt = (
            select(
                Suggestion.severity,
                func.count().filter(Suggestion.status == "applied").label("applied"),
                func.count().filter(Suggestion.status == "rejected").label("rejected"),
            )
            .where(Suggestion.project_id == project_id)
            .group_by(Suggestion.severity)
        )
        severity_result = await self.db.execute(severity_stmt)
        severity_rates = {}
        for row in severity_result.all():
            total = row[1] + row[2]
            if total > 0:
                severity_rates[row[0]] = {
                    "applied": row[1],
                    "rejected": row[2],
                    "acceptance_rate": row[1] / total,
                }

        return {
            "by_suggestion_type": type_rates,
            "by_severity": severity_rates,
        }

    async def should_show_suggestion(
        self,
        project_id: UUID,
        suggestion_type: str,
        confidence: float,
    ) -> bool:
        """Determine if a suggestion should be shown based on user preferences."""
        acceptance_rate = await self.get_acceptance_rate(project_id, suggestion_type)

        # If user frequently rejects this type, require higher confidence
        if acceptance_rate < 0.3:
            return confidence >= 0.9
        elif acceptance_rate < 0.5:
            return confidence >= 0.7
        else:
            return confidence >= 0.5
