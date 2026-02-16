"""Team Lead orchestrator for coordinated multi-agent book generation.

Replaces the sequential BookPipeline.generate_book() with a team-based
approach that features task tracking, inter-agent messaging, context
optimization, and quality gates.
"""

import asyncio
import copy
import json
import logging
from dataclasses import dataclass
from typing import Any, AsyncIterator, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..cache import RedisCache
from ..models import TeamTask
from ..services.message_bus import MessageBus
from ..services.quality_gate_service import QualityGateService
from ..services.task_manager import TaskManager
from .base import Agent, AgentError
from .context_manager import ContextManager
from .orchestrator import (
    BookPipeline,
)
from .team_agent import TeamAgent, TeamAgentConfig
from .tool_handlers import BookToolHandler

logger = logging.getLogger(__name__)


def _sanitize_log(value: object, max_len: int = 200) -> str:
    """Sanitize a value for safe logging (prevent log injection)."""
    s = str(value).replace("\n", "\\n").replace("\r", "\\r")
    if len(s) > max_len:
        return s[:max_len] + "..."
    return s


@dataclass
class TeamProgressEvent:
    """Progress event yielded by TeamLead for SSE streaming."""

    event_type: str
    # team_started, task_claimed, task_in_progress, task_completed,
    # task_failed, task_retry, task_unblocked, progress_update,
    # message_sent, team_completed, team_failed, error
    team_run_id: Optional[str] = None
    task_id: Optional[str] = None
    agent: Optional[str] = None
    chapter_number: Optional[int] = None
    progress: Optional[float] = None
    total_tasks: Optional[int] = None
    completed_tasks: Optional[int] = None
    failed_tasks: Optional[int] = None
    quality_score: Optional[float] = None
    error: Optional[str] = None
    message: Optional[str] = None

    def to_sse_data(self) -> str:
        """Serialize to JSON for SSE transmission."""
        data = {k: v for k, v in self.__dict__.items() if v is not None}
        return json.dumps(data)


class TeamLead:
    """Team Lead orchestrator that manages a team of agents.

    Responsibilities:
    - Create and manage the task dependency graph
    - Assign and delegate tasks to agents
    - Monitor progress and handle failures with retries
    - Enforce quality gates on task completion
    - Stream progress events for SSE frontend updates
    - Coordinate inter-agent communication

    Usage:
        lead = TeamLead(pipeline, task_manager, message_bus,
                       context_manager, quality_gate, db, redis)
        async for event in lead.run_team(team_run_id, brief):
            # Stream events to frontend via SSE
            yield event.to_sse_data()
    """

    def __init__(
        self,
        pipeline: BookPipeline,
        task_manager: TaskManager,
        message_bus: MessageBus,
        context_manager: ContextManager,
        quality_gate: QualityGateService,
        db: AsyncSession,
        redis: RedisCache,
    ):
        self.pipeline = pipeline
        self.task_manager = task_manager
        self.message_bus = message_bus
        self.context_manager = context_manager
        self.quality_gate = quality_gate
        self.db = db
        self.redis = redis

        # Timeout for individual agent task execution (seconds)
        self._task_timeout = 600  # 10 minutes

        # Map agent roles to their Agent instances from the pipeline
        self._agent_map: dict[str, Agent] = {
            "concept_generator": pipeline.concept_agent,
            "outliner": pipeline.outline_agent,
            "writer": pipeline.writer_agent,
            "editor": pipeline.editor_agent,
            "continuity_checker": pipeline.continuity_agent,
        }

    async def run_team(
        self,
        team_run_id: UUID,
        brief: str,
        num_chapters: int = 12,
        style_guide: str = "",
        max_parallel: int = 3,
        skip_editing: bool = False,
        skip_continuity: bool = False,
    ) -> AsyncIterator[TeamProgressEvent]:
        """Execute the full team pipeline with task delegation.

        Creates a task dependency graph and processes tasks concurrently,
        respecting dependencies and concurrency limits.

        Args:
            team_run_id: The team run ID (already created in DB).
            brief: The book brief/concept.
            num_chapters: Target number of chapters.
            style_guide: Optional style guidelines.
            max_parallel: Max concurrent writer/editor agents.
            skip_editing: Skip the editing pass.
            skip_continuity: Skip the continuity check.

        Yields:
            TeamProgressEvent objects for SSE streaming.
        """
        run_id_str = str(team_run_id)

        active_tasks: set[asyncio.Task] = set()
        try:
            # 1. Fetch pre-created task graph (created by the API endpoint)
            tasks = await self.task_manager.get_all_tasks(team_run_id)

            # 2. Store initial context
            await self.context_manager.store_context(team_run_id, "brief", brief)
            if style_guide:
                await self.context_manager.store_context(team_run_id, "style_guide", style_guide)

            yield TeamProgressEvent(
                event_type="team_started",
                team_run_id=run_id_str,
                total_tasks=len(tasks),
                message=f"Team started with {len(tasks)} tasks",
            )

            # 3. Main execution loop
            semaphore = asyncio.Semaphore(max_parallel)

            while True:
                # Fetch ready tasks
                ready_tasks = await self.task_manager.get_ready_tasks(team_run_id)

                for task in ready_tasks:
                    # Determine if this is a parallel-safe task
                    if task.task_type in ("write_chapter", "edit_chapter"):
                        coro = self._execute_with_semaphore(semaphore, team_run_id, task)
                    else:
                        coro = self._execute_task(team_run_id, task)

                    async_task = asyncio.create_task(coro)
                    active_tasks.add(async_task)

                if not active_tasks:
                    # No active tasks and no ready tasks -- we're done
                    break

                # Wait for at least one task to complete
                done, active_tasks = await asyncio.wait(
                    active_tasks, return_when=asyncio.FIRST_COMPLETED
                )

                # Process completed tasks
                for completed_task in done:
                    try:
                        event = await completed_task
                    except Exception as e:
                        logger.error(f"Task execution exception: {_sanitize_log(e)}")
                        yield TeamProgressEvent(
                            event_type="error",
                            team_run_id=run_id_str,
                            error=str(e),
                        )
                        continue

                    yield event

                    if event.event_type == "task_completed":
                        # Resolve dependencies and unblock tasks
                        task_uuid = UUID(event.task_id) if event.task_id else None
                        if task_uuid:
                            output = {}
                            if event.message:
                                output["summary"] = event.message
                            unblocked = await self.task_manager.complete_task(
                                team_run_id, task_uuid, output, event.quality_score
                            )
                            for unblocked_id in unblocked:
                                yield TeamProgressEvent(
                                    event_type="task_unblocked",
                                    team_run_id=run_id_str,
                                    task_id=str(unblocked_id),
                                    message=f"Task {unblocked_id} unblocked",
                                )

                    elif event.event_type == "task_retry":
                        # Task was retried -- it will be picked up in next iteration
                        pass

                    elif event.event_type == "task_failed":
                        # Check if the whole run should fail
                        task_uuid = UUID(event.task_id) if event.task_id else None
                        if task_uuid:
                            task_obj = await self.db.get(TeamTask, task_uuid)
                            if task_obj and task_obj.task_type in ("concept", "outline"):
                                # Critical task failed -- abort run
                                yield TeamProgressEvent(
                                    event_type="team_failed",
                                    team_run_id=run_id_str,
                                    error=f"Critical task {task_obj.task_type} failed: "
                                    f"{event.error}",
                                )
                                return

                # Emit progress update
                run_progress = await self.task_manager.get_run_progress(team_run_id)
                yield TeamProgressEvent(
                    event_type="progress_update",
                    team_run_id=run_id_str,
                    progress=run_progress["overall_progress"],
                    total_tasks=run_progress["total"],
                    completed_tasks=run_progress["completed"],
                    failed_tasks=run_progress["failed"],
                )

                # Check if all tasks are done
                total = run_progress["total"]
                done_count = run_progress["completed"] + run_progress["failed"]
                if done_count >= total:
                    break

            # Final completion event
            final_progress = await self.task_manager.get_run_progress(team_run_id)
            yield TeamProgressEvent(
                event_type="team_completed",
                team_run_id=run_id_str,
                progress=1.0,
                total_tasks=final_progress["total"],
                completed_tasks=final_progress["completed"],
                failed_tasks=final_progress["failed"],
                message="Team pipeline complete",
            )

        except Exception as e:
            logger.error(f"Team run {team_run_id} failed: {_sanitize_log(e)}")
            yield TeamProgressEvent(
                event_type="team_failed",
                team_run_id=run_id_str,
                error=str(e),
            )

        finally:
            # Cancel any outstanding tasks to prevent memory leaks
            for t in active_tasks:
                if not t.done():
                    t.cancel()
            # Await cancellation to ensure proper cleanup
            if active_tasks:
                await asyncio.gather(*active_tasks, return_exceptions=True)

    async def _execute_with_semaphore(
        self,
        semaphore: asyncio.Semaphore,
        team_run_id: UUID,
        task: TeamTask,
    ) -> TeamProgressEvent:
        """Execute a task with semaphore-controlled concurrency."""
        async with semaphore:
            return await self._execute_task(team_run_id, task)

    async def _execute_task(
        self,
        team_run_id: UUID,
        task: TeamTask,
    ) -> TeamProgressEvent:
        """Execute a single task via a TeamAgent wrapper.

        Args:
            team_run_id: The team run ID.
            task: The TeamTask to execute.

        Returns:
            TeamProgressEvent describing the outcome.
        """
        run_id_str = str(team_run_id)
        task_id_str = str(task.id)

        # 1. Claim the task
        claimed = await self.task_manager.claim_task(team_run_id, task.id, task.assigned_agent)
        if not claimed:
            return TeamProgressEvent(
                event_type="task_failed",
                team_run_id=run_id_str,
                task_id=task_id_str,
                agent=task.assigned_agent,
                error="Could not claim task (already claimed)",
            )

        logger.info(f"Task claimed: {task.title} by {task.assigned_agent}")

        # 2. Create TeamAgent wrapper
        agent_role = str(task.assigned_agent)
        base_agent = self._agent_map.get(agent_role)
        if not base_agent:
            return TeamProgressEvent(
                event_type="task_failed",
                team_run_id=run_id_str,
                task_id=task_id_str,
                error=f"Unknown agent role: {task.assigned_agent}",
            )

        # Attach tool handler if agent has tools configured
        if base_agent.config.tools:
            task_config = copy.copy(base_agent.config)
            task_config.tool_handler = BookToolHandler(
                context_manager=self.context_manager,
                message_bus=self.message_bus,
                team_run_id=team_run_id,
                role=task.assigned_agent,
                chapter_number=task.chapter_number,
            )
            task_agent = Agent(
                task_config,
                response_model=base_agent.response_model,
            )
        else:
            task_agent = base_agent

        team_agent = TeamAgent(
            agent=task_agent,
            config=TeamAgentConfig(
                agent_config=task_agent.config,
                role_name=task.assigned_agent,
                team_run_id=team_run_id,
                task_id=task.id,
                chapter_number=task.chapter_number,
            ),
            task_manager=self.task_manager,
            message_bus=self.message_bus,
            context_manager=self.context_manager,
        )

        # 3. Build task-specific prompt and context
        prompt, context = await self._build_task_prompt(team_run_id, task)

        # 4. Execute with timeout
        try:
            result = await asyncio.wait_for(
                team_agent.execute(prompt, context, task_type=task.task_type),
                timeout=self._task_timeout,
            )

            # 5. Quality gate
            quality_score = self.quality_gate.assess(task.task_type, result)

            if self.quality_gate.should_retry(quality_score):
                if task.retry_count < task.max_retries:
                    # Send quality feedback and retry
                    await self.message_bus.send_message(
                        team_run_id,
                        "team_lead",
                        task.assigned_agent,
                        "quality_feedback",
                        {
                            "score": quality_score,
                            "instruction": "Quality below threshold. Please improve the output.",
                        },
                        task_id=task.id,
                    )
                    await self.task_manager.fail_task(
                        team_run_id, task.id, f"Quality below threshold: {quality_score:.2f}"
                    )
                    return TeamProgressEvent(
                        event_type="task_retry",
                        team_run_id=run_id_str,
                        task_id=task_id_str,
                        agent=task.assigned_agent,
                        chapter_number=task.chapter_number,
                        quality_score=quality_score,
                        message=f"Retrying {task.title} (score: {quality_score:.2f})",
                    )
                else:
                    # Retries exhausted but quality still below threshold
                    await self.task_manager.fail_task(
                        team_run_id,
                        task.id,
                        f"Quality below threshold after {task.max_retries} retries: "
                        f"{quality_score:.2f}",
                    )
                    return TeamProgressEvent(
                        event_type="task_failed",
                        team_run_id=run_id_str,
                        task_id=task_id_str,
                        agent=task.assigned_agent,
                        chapter_number=task.chapter_number,
                        quality_score=quality_score,
                        error=f"Quality below threshold after {task.max_retries} retries",
                        message=f"Failed: {task.title} (score: {quality_score:.2f})",
                    )

            return TeamProgressEvent(
                event_type="task_completed",
                team_run_id=run_id_str,
                task_id=task_id_str,
                agent=task.assigned_agent,
                chapter_number=task.chapter_number,
                quality_score=quality_score,
                message=f"Completed: {task.title} (score: {quality_score:.2f})",
            )

        except AgentError as e:
            can_retry = await self.task_manager.fail_task(team_run_id, task.id, str(e))
            if can_retry:
                return TeamProgressEvent(
                    event_type="task_retry",
                    team_run_id=run_id_str,
                    task_id=task_id_str,
                    agent=task.assigned_agent,
                    error=str(e),
                    message=f"Retrying {task.title} after error",
                )
            return TeamProgressEvent(
                event_type="task_failed",
                team_run_id=run_id_str,
                task_id=task_id_str,
                agent=task.assigned_agent,
                chapter_number=task.chapter_number,
                error=str(e),
                message=f"Failed: {task.title}",
            )

        except TimeoutError:
            timeout_msg = f"Task timed out after {self._task_timeout}s"
            await self.task_manager.fail_task(team_run_id, task.id, timeout_msg)
            return TeamProgressEvent(
                event_type="task_failed",
                team_run_id=run_id_str,
                task_id=task_id_str,
                agent=task.assigned_agent,
                chapter_number=task.chapter_number,
                error=timeout_msg,
                message=f"Timed out: {task.title}",
            )

        except Exception as e:
            await self.task_manager.fail_task(team_run_id, task.id, str(e))
            return TeamProgressEvent(
                event_type="task_failed",
                team_run_id=run_id_str,
                task_id=task_id_str,
                agent=task.assigned_agent,
                chapter_number=task.chapter_number,
                error=str(e),
                message=f"Failed: {task.title}",
            )

    async def _build_task_prompt(
        self,
        team_run_id: UUID,
        task: TeamTask,
    ) -> tuple[str, dict[str, Any]]:
        """Build the prompt and context for a specific task type.

        Args:
            team_run_id: The team run ID.
            task: The task to build a prompt for.

        Returns:
            Tuple of (prompt_string, context_dict).
        """
        context: dict[str, Any] = task.input_context or {}

        if task.task_type == "concept":
            brief = await self.context_manager.get_context(team_run_id, "brief")
            prompt = f"Expand this book brief into a detailed concept:\n\n{brief}"

        elif task.task_type == "outline":
            concept = await self.context_manager.get_context(team_run_id, "concept")
            if concept and isinstance(concept, dict):
                context.update(
                    {
                        "title": concept.get("title", ""),
                        "genre": concept.get("genre", ""),
                        "themes": ", ".join(concept.get("themes", [])),
                        "setting": concept.get("setting", ""),
                        "tone": concept.get("tone", ""),
                        "central_conflict": concept.get("central_conflict", ""),
                    }
                )
            prompt = "Create a detailed chapter-by-chapter outline for this book:"

        elif task.task_type == "write_chapter":
            ch_num = task.chapter_number or 1
            outline = await self.context_manager.get_context(team_run_id, "outline")

            # Extract chapter-specific outline
            if outline and isinstance(outline, dict):
                chapters = outline.get("chapters", [])
                ch_outline = next(
                    (ch for ch in chapters if ch.get("number") == ch_num),
                    chapters[ch_num - 1] if len(chapters) >= ch_num else {},
                )
                context.update(
                    {
                        "chapter_number": ch_num,
                        "chapter_title": ch_outline.get("title", f"Chapter {ch_num}"),
                        "chapter_summary": ch_outline.get("summary", ""),
                        "key_events": ", ".join(ch_outline.get("key_events", [])),
                        "characters": ", ".join(ch_outline.get("characters_involved", [])),
                        "emotional_arc": ch_outline.get("emotional_arc", ""),
                    }
                )

            # Get previous chapter summaries for continuity
            prev_summaries = await self.context_manager.get_previous_chapter_summaries(
                team_run_id, ch_num
            )
            if prev_summaries:
                context["previous_context"] = prev_summaries

            prompt = "Write this chapter following the outline and maintaining consistency:"

        elif task.task_type == "edit_chapter":
            ch_num = task.chapter_number or 1
            ch_content_key = f"chapter_content:{ch_num}"
            chapter_content = await self.context_manager.get_context(team_run_id, ch_content_key)
            style_guide = await self.context_manager.get_context(team_run_id, "style_guide")

            context.update(
                {
                    "chapter_number": ch_num,
                    "content": chapter_content or "",
                    "style_guide": style_guide or "Standard narrative style",
                }
            )
            prompt = "Edit this chapter for quality, pacing, and consistency:"

        elif task.task_type == "continuity_check":
            all_summaries = await self.context_manager.get_context(
                team_run_id, "all_chapter_summaries"
            )
            context["chapters"] = all_summaries or {}
            prompt = "Check for continuity issues across these chapters:"

        else:
            prompt = f"Execute task: {task.title}"

        return prompt, context

    def _serialize_result(self, result: Any, task_type: str) -> dict[str, Any]:
        """Serialize a task result for storage.

        Args:
            result: The agent's output.
            task_type: The task type.

        Returns:
            Serializable dict.
        """
        if hasattr(result, "model_dump"):
            return result.model_dump()
        if isinstance(result, dict):
            return result
        return {"content": str(result)}

    async def cleanup(self, team_run_id: UUID) -> None:
        """Clean up all resources for a team run.

        Args:
            team_run_id: The team run ID.
        """
        await self.context_manager.cleanup(team_run_id)
        await self.message_bus.cleanup(team_run_id)

        # Clean up Redis state and streams
        state_key = f"team:{team_run_id}:state"
        status_key = f"team:{team_run_id}:status"
        await self.redis.redis.delete(state_key)
        await self.redis.redis.delete(status_key)

        # Clean up dependency sets
        pattern = f"team:{team_run_id}:deps:*"
        cursor = 0
        while True:
            cursor, keys = await self.redis.redis.scan(cursor, match=pattern, count=100)
            if keys:
                await self.redis.redis.delete(*keys)
            if cursor == 0:
                break

        # Clean up task locks
        pattern = f"team:{team_run_id}:task:*:lock"
        cursor = 0
        while True:
            cursor, keys = await self.redis.redis.scan(cursor, match=pattern, count=100)
            if keys:
                await self.redis.redis.delete(*keys)
            if cursor == 0:
                break

        logger.info(f"Cleaned up all resources for run {_sanitize_log(team_run_id)}")
