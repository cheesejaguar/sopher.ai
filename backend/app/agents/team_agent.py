"""Team-aware agent wrapper for coordinated multi-agent execution.

Wraps the existing Agent[T] class with team coordination capabilities
including inbox reading, shared context loading, heartbeat maintenance,
result publishing, and inter-agent messaging.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Generic, Optional, TypeVar
from uuid import UUID

from pydantic import BaseModel

from ..services.message_bus import MessageBus
from ..services.task_manager import TaskManager
from .base import Agent, AgentConfig
from .context_manager import ContextManager

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Heartbeat interval for task lock renewal (seconds)
HEARTBEAT_INTERVAL = 60


@dataclass
class TeamAgentConfig:
    """Extended configuration for team-aware agents."""

    agent_config: AgentConfig
    role_name: str
    team_run_id: UUID
    task_id: UUID
    chapter_number: Optional[int] = None
    max_context_tokens: int = 6000
    heartbeat_interval: float = HEARTBEAT_INTERVAL


class TeamAgent(Generic[T]):
    """Wraps an Agent[T] with team coordination capabilities.

    Provides:
    - Pre-execution: Fetches messages from inbox, loads shared context
    - During execution: Heartbeat to maintain task lock
    - Post-execution: Publishes results, sends inter-agent messages

    Usage:
        team_agent = TeamAgent(
            agent=writer_agent,
            config=TeamAgentConfig(...),
            task_manager=task_manager,
            message_bus=message_bus,
            context_manager=context_manager,
        )
        result = await team_agent.execute("Write chapter 1", base_context)
    """

    def __init__(
        self,
        agent: Agent[T],
        config: TeamAgentConfig,
        task_manager: TaskManager,
        message_bus: MessageBus,
        context_manager: ContextManager,
    ):
        self.agent = agent
        self.config = config
        self.task_manager = task_manager
        self.message_bus = message_bus
        self.context_manager = context_manager

    async def execute(
        self,
        task: str,
        base_context: dict[str, Any],
        task_type: str = "",
    ) -> Any:
        """Execute the agent with team-aware context enrichment.

        Steps:
        1. Read unread messages from inbox
        2. Load relevant shared context within token budget
        3. Build enriched context merging base + messages + shared
        4. Start heartbeat coroutine (renews Redis lock)
        5. Run the underlying agent
        6. Publish results to shared context
        7. Send role-specific post-execution messages

        Args:
            task: The task description/prompt for the agent.
            base_context: Base context for the task (task-specific input).
            task_type: The type of task (concept, write_chapter, etc.)

        Returns:
            Agent result (structured T or string).
        """
        run_id = self.config.team_run_id
        role = self.config.role_name
        task_id = self.config.task_id

        # Step 1: Read messages from inbox
        messages = await self.message_bus.read_inbox(run_id, role)
        if messages:
            logger.info(f"Agent {role} read {len(messages)} messages from inbox")

        # Step 2: Load shared context within token budget
        shared_context = await self.context_manager.load_context_for_role(
            run_id,
            role,
            max_tokens=self.config.max_context_tokens,
            extra_context=base_context,
        )

        # Step 3: Build enriched context
        enriched_context = self._build_enriched_context(base_context, messages, shared_context)

        # Step 4: Update status and start heartbeat
        await self.task_manager.update_status(task_id, "in_progress", run_id)
        heartbeat_task = asyncio.create_task(self._heartbeat_loop())

        try:
            # Step 5: Run the underlying agent
            logger.info(f"Agent {role} executing task {task_id}")
            result = await self.agent.run(task, context=enriched_context)

            # Step 6: Publish results to shared context
            await self.context_manager.publish_result(
                run_id,
                role,
                task_type,
                result,
                chapter_number=self.config.chapter_number,
            )

            # Step 7: Send post-execution messages
            await self._send_post_execution_messages(result, task_type)

            return result

        finally:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass

    def _build_enriched_context(
        self,
        base_context: dict[str, Any],
        messages: list[dict[str, Any]],
        shared_context: dict[str, Any],
    ) -> dict[str, Any]:
        """Merge base context, inbox messages, and shared context.

        Priority order: base_context > messages > shared_context
        (base_context keys take precedence).

        Args:
            base_context: Task-specific input context.
            messages: Messages from the agent's inbox.
            shared_context: Context loaded by ContextManager.

        Returns:
            Merged context dict.
        """
        enriched = dict(shared_context)

        # Add message summaries if any
        if messages:
            message_notes = []
            for msg in messages:
                from_agent = msg.get("from_agent", "unknown")
                msg_type = msg.get("message_type", "")
                content = msg.get("content", {})

                if msg_type == "style_note":
                    decisions = content.get("decisions", [])
                    if decisions:
                        message_notes.append(
                            f"[Style note from {from_agent}]: " + "; ".join(decisions)
                        )
                elif msg_type == "issue_report":
                    issues = content.get("issues", [])
                    if issues:
                        issue_summaries = [f"- {i.get('description', '')}" for i in issues[:5]]
                        message_notes.append(
                            f"[Issues reported by {from_agent}]:\n" + "\n".join(issue_summaries)
                        )
                elif msg_type == "correction_request":
                    corrections = content.get("corrections", [])
                    if corrections:
                        corr_summaries = [
                            f"- {c.get('reason', '')}: {c.get('suggested', '')}"
                            for c in corrections[:5]
                        ]
                        message_notes.append(
                            f"[Corrections requested by {from_agent}]:\n"
                            + "\n".join(corr_summaries)
                        )
                elif msg_type == "quality_feedback":
                    score = content.get("score", 0)
                    instruction = content.get("instruction", "")
                    message_notes.append(f"[Quality feedback (score: {score:.2f})]: {instruction}")
                elif msg_type == "dependency_resolved":
                    summary = content.get("result_summary", "")
                    if summary:
                        message_notes.append(f"[Dependency resolved]: {summary}")

            if message_notes:
                enriched["agent_messages"] = "\n\n".join(message_notes)

        # Base context overrides everything
        enriched.update(base_context)

        return enriched

    async def _heartbeat_loop(self) -> None:
        """Periodically renew the Redis task lock."""
        while True:
            try:
                await asyncio.sleep(self.config.heartbeat_interval)
                renewed = await self.task_manager.renew_task_lock(
                    self.config.team_run_id, self.config.task_id
                )
                if not renewed:
                    logger.warning(
                        f"Lost lock for task {self.config.task_id} "
                        f"(agent {self.config.role_name})"
                    )
                    break
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"Heartbeat error: {e}")

    async def _send_post_execution_messages(
        self,
        result: Any,
        task_type: str,
    ) -> None:
        """Send role-specific messages after task completion.

        Message routing:
        - Writer -> Editor: style notes about intentional choices
        - ContinuityChecker -> all: issue reports
        - ContinuityChecker -> Writer: correction requests
        - Editor -> Writer: quality feedback

        Args:
            result: The agent's output.
            task_type: Type of task that was completed.
        """
        run_id = self.config.team_run_id
        role = self.config.role_name
        task_id = self.config.task_id
        chapter_number = self.config.chapter_number

        if role == "writer" and task_type == "write_chapter":
            # Writer tells Editor about intentional style choices
            result_dict = result.model_dump() if hasattr(result, "model_dump") else {}
            content = result_dict.get("content", str(result))

            await self.message_bus.send_message(
                team_run_id=run_id,
                from_agent="writer",
                to_agent="editor",
                message_type="style_note",
                content={
                    "chapter_number": chapter_number,
                    "decisions": [
                        f"Chapter {chapter_number} written with " f"{len(content.split())} words"
                    ],
                },
                task_id=task_id,
            )

        elif role == "continuity_checker" and task_type == "continuity_check":
            # ContinuityChecker broadcasts issues to all
            result_dict = result.model_dump() if hasattr(result, "model_dump") else {}
            issues = result_dict.get("issues", [])

            if issues:
                await self.message_bus.broadcast(
                    team_run_id=run_id,
                    from_agent="continuity_checker",
                    message_type="issue_report",
                    content={
                        "issues": issues[:10],  # Cap at 10 issues
                        "affected_chapters": list(
                            set(
                                i.get("location", "").split(" ")[1]
                                for i in issues
                                if "chapter" in i.get("location", "").lower()
                            )
                        ),
                    },
                    task_id=task_id,
                )

        elif role == "editor" and task_type == "edit_chapter":
            # Editor sends quality feedback to Writer
            result_dict = result.model_dump() if hasattr(result, "model_dump") else {}
            changes = result_dict.get("changes_made", [])

            if changes:
                await self.message_bus.send_message(
                    team_run_id=run_id,
                    from_agent="editor",
                    to_agent="writer",
                    message_type="quality_feedback",
                    content={
                        "chapter_number": chapter_number,
                        "changes_made": changes[:5],
                        "score": 0.0,  # Placeholder; real score from quality gate
                    },
                    task_id=task_id,
                )
