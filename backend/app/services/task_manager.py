"""Task Manager for team agent coordination.

Manages the shared task list for a team run, including:
- Task graph creation with dependency resolution
- Atomic task claiming via Redis SET NX
- Status transitions and dependency unblocking
- Quality gate enforcement on completion
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..cache import RedisCache
from ..models import TeamTask

logger = logging.getLogger(__name__)


def _sanitize_log(value: object, max_len: int = 200) -> str:
    """Sanitize a value for safe logging (prevent log injection)."""
    s = str(value).replace("\n", "\\n").replace("\r", "\\r")
    if len(s) > max_len:
        return s[:max_len] + "..."
    return s


# Redis key TTL for team resources (4 hours)
TEAM_TTL = 14400

# Task lock TTL (5 minutes, renewed by heartbeat)
TASK_LOCK_TTL = 300


class TaskManager:
    """Manages the shared task list for a team run.

    Handles task creation, atomic claiming via Redis, status transitions,
    and dependency resolution.
    """

    def __init__(self, db: AsyncSession, redis: RedisCache):
        self.db = db
        self.redis = redis

    async def create_task_graph(
        self,
        team_run_id: UUID,
        config: dict[str, Any],
    ) -> list[TeamTask]:
        """Create the full task dependency graph for a book generation run.

        Dependency structure:
            concept_task
                -> outline_task
                    -> [write_ch_1, write_ch_2, ..., write_ch_N]  (parallel, all depend on outline)
                        -> [edit_ch_1, edit_ch_2, ..., edit_ch_N]  (each depends on its write)
                            -> continuity_check  (depends on ALL edits or writes)

        Args:
            team_run_id: The team run ID.
            config: Run configuration (num_chapters, skip_editing, skip_continuity, etc.)

        Returns:
            List of created TeamTask objects.
        """
        num_chapters = config.get("num_chapters", 10)
        skip_editing = config.get("skip_editing", False)
        skip_continuity = config.get("skip_continuity", False)

        tasks: list[TeamTask] = []

        # Stage 1: Concept generation (no dependencies, starts ready)
        concept_task = TeamTask(
            id=uuid4(),
            team_run_id=team_run_id,
            task_type="concept",
            title="Generate book concept",
            description="Expand the brief into a rich book concept",
            status="ready",
            assigned_agent="concept_generator",
            priority=100,
            dependencies=[],
        )
        tasks.append(concept_task)

        # Stage 2: Outline generation (depends on concept)
        outline_task = TeamTask(
            id=uuid4(),
            team_run_id=team_run_id,
            task_type="outline",
            title="Generate book outline",
            description=f"Create a {num_chapters}-chapter outline",
            status="blocked",
            assigned_agent="outliner",
            priority=90,
            dependencies=[str(concept_task.id)],
        )
        tasks.append(outline_task)

        # Stage 3: Write chapters (parallel, each depends on outline)
        write_tasks: list[TeamTask] = []
        for i in range(1, num_chapters + 1):
            write_task = TeamTask(
                id=uuid4(),
                team_run_id=team_run_id,
                task_type="write_chapter",
                title=f"Write chapter {i}",
                description=f"Generate chapter {i} content following the outline",
                status="blocked",
                assigned_agent="writer",
                priority=80 - i,  # Earlier chapters slightly higher priority
                chapter_number=i,
                dependencies=[str(outline_task.id)],
            )
            write_tasks.append(write_task)
            tasks.append(write_task)

        # Stage 4: Edit chapters (each depends on its corresponding write task)
        edit_tasks: list[TeamTask] = []
        if not skip_editing:
            for i, write_task in enumerate(write_tasks, start=1):
                edit_task = TeamTask(
                    id=uuid4(),
                    team_run_id=team_run_id,
                    task_type="edit_chapter",
                    title=f"Edit chapter {i}",
                    description=f"Perform structural and line editing on chapter {i}",
                    status="blocked",
                    assigned_agent="editor",
                    priority=60 - i,
                    chapter_number=i,
                    dependencies=[str(write_task.id)],
                )
                edit_tasks.append(edit_task)
                tasks.append(edit_task)

        # Stage 5: Continuity check (depends on ALL edit tasks, or all writes if no editing)
        if not skip_continuity:
            final_deps = (
                [str(t.id) for t in edit_tasks] if edit_tasks else [str(t.id) for t in write_tasks]
            )
            continuity_task = TeamTask(
                id=uuid4(),
                team_run_id=team_run_id,
                task_type="continuity_check",
                title="Run continuity check",
                description="Validate consistency across all chapters",
                status="blocked",
                assigned_agent="continuity_checker",
                priority=10,
                dependencies=final_deps,
            )
            tasks.append(continuity_task)

        # Persist tasks to database
        for task in tasks:
            self.db.add(task)
        await self.db.flush()

        # Initialize Redis dependency sets for blocked tasks
        for task in tasks:
            if task.dependencies:
                deps_key = f"team:{team_run_id}:deps:{task.id}"
                for dep_id in task.dependencies:
                    await self.redis.redis.sadd(deps_key, dep_id)  # type: ignore[misc]
                await self.redis.redis.expire(deps_key, TEAM_TTL)  # type: ignore[misc]

        # Initialize run state in Redis
        state_key = f"team:{team_run_id}:state"
        await self.redis.redis.hset(  # type: ignore[misc]
            state_key,
            mapping={
                "status": "running",
                "total_tasks": str(len(tasks)),
                "completed_tasks": "0",
                "failed_tasks": "0",
                "current_stage": "concept",
                "started_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        await self.redis.redis.expire(state_key, TEAM_TTL)  # type: ignore[misc]

        logger.info(f"Created task graph with {len(tasks)} tasks for run {team_run_id}")
        return tasks

    async def claim_task(
        self,
        team_run_id: UUID,
        task_id: UUID,
        agent_role: str,
    ) -> bool:
        """Atomically claim a task using Redis SET NX.

        Tasks are pre-assigned to agent roles, but the Redis lock prevents
        duplicate execution when multiple parallel instances exist.

        Args:
            team_run_id: The team run ID.
            task_id: The task to claim.
            agent_role: The agent role claiming the task.

        Returns:
            True if claimed successfully, False if already claimed.
        """
        lock_key = f"team:{team_run_id}:task:{task_id}:lock"
        claimed = await self.redis.redis.set(lock_key, agent_role, nx=True, ex=TASK_LOCK_TTL)

        if claimed:
            now = datetime.now(timezone.utc)
            stmt = (
                update(TeamTask)
                .where(TeamTask.id == task_id)
                .values(status="claimed", assigned_agent=agent_role, claimed_at=now)
            )
            await self.db.execute(stmt)
            await self.db.flush()

            # Publish status to Redis stream
            await self._publish_status(team_run_id, task_id, agent_role, "claimed")
            logger.info(f"Task {task_id} claimed by {agent_role}")

        return bool(claimed)

    async def update_status(
        self,
        task_id: UUID,
        status: str,
        team_run_id: Optional[UUID] = None,
    ) -> None:
        """Update a task's status in the database.

        Args:
            task_id: The task to update.
            status: New status value.
            team_run_id: Optional run ID for Redis status publishing.
        """
        values: dict[str, Any] = {"status": status}
        if status == "in_progress":
            values["started_at"] = datetime.now(timezone.utc)

        stmt = update(TeamTask).where(TeamTask.id == task_id).values(**values)
        await self.db.execute(stmt)
        await self.db.flush()

        if team_run_id:
            # Fetch agent for status publish
            result = await self.db.execute(
                select(TeamTask.assigned_agent).where(TeamTask.id == task_id)
            )
            agent = result.scalar_one_or_none() or "unknown"
            await self._publish_status(team_run_id, task_id, agent, status)

    async def complete_task(
        self,
        team_run_id: UUID,
        task_id: UUID,
        result: dict[str, Any],
        quality_score: Optional[float] = None,
    ) -> list[UUID]:
        """Mark a task as completed and unblock dependents.

        Args:
            team_run_id: The team run ID.
            task_id: The completed task ID.
            result: Result data to store in output_result.
            quality_score: Optional quality gate score.

        Returns:
            List of task IDs that were unblocked by this completion.
        """
        now = datetime.now(timezone.utc)
        values: dict[str, Any] = {
            "status": "completed",
            "output_result": result,
            "completed_at": now,
        }
        if quality_score is not None:
            values["quality_score"] = quality_score

        stmt = update(TeamTask).where(TeamTask.id == task_id).values(**values)
        await self.db.execute(stmt)
        await self.db.flush()

        # Release Redis lock
        lock_key = f"team:{team_run_id}:task:{task_id}:lock"
        await self.redis.redis.delete(lock_key)

        # Increment completed counter in Redis
        state_key = f"team:{team_run_id}:state"
        await self.redis.redis.hincrby(state_key, "completed_tasks", 1)  # type: ignore[misc]

        # Resolve dependencies and return newly unblocked tasks
        unblocked = await self._resolve_dependencies(team_run_id, task_id)

        # Fetch agent for status publish
        result_row = await self.db.execute(
            select(TeamTask.assigned_agent).where(TeamTask.id == task_id)
        )
        agent = result_row.scalar_one_or_none() or "unknown"
        await self._publish_status(team_run_id, task_id, agent, "completed")

        logger.info(f"Task {task_id} completed, unblocked {len(unblocked)} tasks")
        return unblocked

    async def fail_task(
        self,
        team_run_id: UUID,
        task_id: UUID,
        error: str,
    ) -> bool:
        """Mark a task as failed. Returns True if retry is available.

        Args:
            team_run_id: The team run ID.
            task_id: The failed task ID.
            error: Error description.

        Returns:
            True if the task can be retried, False if max retries exceeded.
        """
        # Fetch current retry state
        result = await self.db.execute(
            select(TeamTask.retry_count, TeamTask.max_retries, TeamTask.assigned_agent).where(
                TeamTask.id == task_id
            )
        )
        row = result.one_or_none()
        if not row:
            return False

        retry_count, max_retries, agent = row
        can_retry = retry_count < max_retries

        if can_retry:
            # Reset to ready for retry
            stmt = (
                update(TeamTask)
                .where(TeamTask.id == task_id)
                .values(
                    status="ready",
                    retry_count=retry_count + 1,
                    claimed_at=None,
                    started_at=None,
                )
            )
            await self.db.execute(stmt)
            logger.info(f"Task {task_id} failed, retry {retry_count + 1}/{max_retries}")
        else:
            # Mark as permanently failed
            stmt = (
                update(TeamTask)
                .where(TeamTask.id == task_id)
                .values(
                    status="failed",
                    output_result={"error": error},
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await self.db.execute(stmt)

            # Increment failed counter
            state_key = f"team:{team_run_id}:state"
            await self.redis.redis.hincrby(state_key, "failed_tasks", 1)  # type: ignore[misc]
            logger.error(f"Task {task_id} permanently failed: {_sanitize_log(error)}")

        await self.db.flush()

        # Release Redis lock
        lock_key = f"team:{team_run_id}:task:{task_id}:lock"
        await self.redis.redis.delete(lock_key)

        await self._publish_status(team_run_id, task_id, agent or "unknown", "failed")
        return can_retry

    async def get_ready_tasks(
        self,
        team_run_id: UUID,
        agent_role: Optional[str] = None,
    ) -> list[TeamTask]:
        """Get all tasks in 'ready' state, optionally filtered by agent role.

        Args:
            team_run_id: The team run ID.
            agent_role: Optional filter by assigned agent.

        Returns:
            List of ready tasks, ordered by priority descending.
        """
        stmt = (
            select(TeamTask)
            .where(TeamTask.team_run_id == team_run_id, TeamTask.status == "ready")
            .order_by(TeamTask.priority.desc())
        )
        if agent_role:
            stmt = stmt.where(TeamTask.assigned_agent == agent_role)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_run_progress(
        self,
        team_run_id: UUID,
    ) -> dict[str, Any]:
        """Get aggregate progress for a team run.

        Returns:
            Dict with total, completed, failed, in_progress, overall_progress.
        """
        state_key = f"team:{team_run_id}:state"
        state = await self.redis.redis.hgetall(state_key)  # type: ignore[misc]

        if not state:
            # Fallback to DB query
            result = await self.db.execute(
                select(TeamTask.status).where(TeamTask.team_run_id == team_run_id)
            )
            statuses = [row[0] for row in result.all()]
            total = len(statuses)
            completed = statuses.count("completed")
            failed = statuses.count("failed")
        else:
            total = int(state.get("total_tasks", 0))
            completed = int(state.get("completed_tasks", 0))
            failed = int(state.get("failed_tasks", 0))

        in_progress = max(0, total - completed - failed)
        overall = completed / total if total > 0 else 0.0

        return {
            "total": total,
            "completed": completed,
            "failed": failed,
            "in_progress": in_progress,
            "overall_progress": overall,
        }

    async def get_all_tasks(
        self,
        team_run_id: UUID,
    ) -> list[TeamTask]:
        """Get all tasks for a team run.

        Args:
            team_run_id: The team run ID.

        Returns:
            List of all tasks.
        """
        result = await self.db.execute(
            select(TeamTask)
            .where(TeamTask.team_run_id == team_run_id)
            .order_by(TeamTask.priority.desc())
        )
        return list(result.scalars().all())

    async def renew_task_lock(
        self,
        team_run_id: UUID,
        task_id: UUID,
    ) -> bool:
        """Renew the Redis lock for a task (heartbeat).

        Returns:
            True if lock was renewed, False if lock was lost.
        """
        lock_key = f"team:{team_run_id}:task:{task_id}:lock"
        result = await self.redis.redis.expire(lock_key, TASK_LOCK_TTL)
        return bool(result)

    async def _resolve_dependencies(
        self,
        team_run_id: UUID,
        completed_task_id: UUID,
    ) -> list[UUID]:
        """Remove completed task from all dependent tasks' dependency sets.

        Transitions tasks with empty dependency sets from 'blocked' to 'ready'.

        Returns:
            List of newly unblocked task IDs.
        """
        unblocked: list[UUID] = []
        completed_id_str = str(completed_task_id)

        # Find all blocked tasks that depend on the completed task
        result = await self.db.execute(
            select(TeamTask).where(
                TeamTask.team_run_id == team_run_id,
                TeamTask.status == "blocked",
            )
        )
        blocked_tasks = result.scalars().all()

        for task in blocked_tasks:
            deps = task.dependencies or []
            if completed_id_str not in deps:
                continue

            # Remove from Redis dep set
            deps_key = f"team:{team_run_id}:deps:{task.id}"
            await self.redis.redis.srem(deps_key, completed_id_str)  # type: ignore[misc]

            # Check if all dependencies are now resolved
            remaining = await self.redis.redis.scard(deps_key)  # type: ignore[misc]
            if remaining == 0:
                # Unblock the task
                stmt = update(TeamTask).where(TeamTask.id == task.id).values(status="ready")
                await self.db.execute(stmt)
                unblocked.append(task.id)
                logger.info(f"Task {task.id} unblocked after {completed_task_id} completed")

        await self.db.flush()
        return unblocked

    async def _publish_status(
        self,
        team_run_id: UUID,
        task_id: UUID,
        agent: str,
        status: str,
    ) -> None:
        """Publish a task status change to the Redis stream.

        Args:
            team_run_id: The team run ID.
            task_id: The task ID.
            agent: The agent role.
            status: The new status.
        """
        stream_key = f"team:{team_run_id}:status"
        await self.redis.redis.xadd(  # type: ignore[misc]
            stream_key,
            {
                "task_id": str(task_id),
                "agent": agent,
                "status": status,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        # Ensure stream has a TTL
        await self.redis.redis.expire(stream_key, TEAM_TTL)  # type: ignore[misc]
