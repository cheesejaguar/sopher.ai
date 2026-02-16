"""Inter-agent messaging system for team coordination.

Provides direct messaging, broadcasting, and inbox management
for agents in a team run. Messages are persisted to PostgreSQL
and delivered in real-time via Redis lists and Pub/Sub.
"""

import json
import logging
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..cache import RedisCache
from ..models import TeamMessage
from ..schemas_team import AGENT_ROLES

logger = logging.getLogger(__name__)


def _sanitize_log(value: object, max_len: int = 200) -> str:
    """Sanitize a value for safe logging (prevent log injection)."""
    s = str(value).replace("\n", "\\n").replace("\r", "\\r")
    if len(s) > max_len:
        return s[:max_len] + "..."
    return s


# Redis key TTL for team resources (4 hours)
TEAM_TTL = 14400


class MessageBus:
    """Inter-agent messaging system.

    Supports:
    - Direct messages (agent-to-agent)
    - Broadcast messages (to all agents)
    - Inbox polling with ordered delivery
    - Real-time notification via Redis Pub/Sub
    """

    def __init__(self, db: AsyncSession, redis: RedisCache):
        self.db = db
        self.redis = redis

    async def send_message(
        self,
        team_run_id: UUID,
        from_agent: str,
        to_agent: Optional[str],
        message_type: str,
        content: dict[str, Any],
        task_id: Optional[UUID] = None,
    ) -> UUID:
        """Send a message to a specific agent or broadcast to all.

        Messages are:
        1. Persisted to PostgreSQL (team_messages table)
        2. Pushed to Redis inbox list(s) for polling
        3. Published on Redis Pub/Sub channel for real-time notification

        Args:
            team_run_id: The team run ID.
            from_agent: Sender agent role.
            to_agent: Target agent role, or None for broadcast.
            message_type: Type of message (context_share, style_note, etc.)
            content: Structured message content.
            task_id: Optional associated task ID.

        Returns:
            The created message ID.
        """
        # 1. Persist to database
        msg = TeamMessage(
            id=uuid4(),
            team_run_id=team_run_id,
            task_id=task_id,
            from_agent=from_agent,
            to_agent=to_agent,
            message_type=message_type,
            content=content,
        )
        self.db.add(msg)
        await self.db.flush()

        # 2. Serialize for Redis
        msg_data = json.dumps(
            {
                "id": str(msg.id),
                "from_agent": from_agent,
                "to_agent": to_agent,
                "message_type": message_type,
                "content": content,
                "task_id": str(task_id) if task_id else None,
            }
        )

        # 3. Push to Redis inbox(es)
        if to_agent:
            # Direct message to specific agent
            inbox_key = f"team:{team_run_id}:inbox:{to_agent}"
            await self.redis.redis.rpush(inbox_key, msg_data)  # type: ignore[misc]
            await self.redis.redis.expire(inbox_key, TEAM_TTL)  # type: ignore[misc]
        else:
            # Broadcast to all agent roles except sender
            for role in AGENT_ROLES:
                if role != from_agent:
                    inbox_key = f"team:{team_run_id}:inbox:{role}"
                    await self.redis.redis.rpush(inbox_key, msg_data)  # type: ignore[misc]
                    await self.redis.redis.expire(inbox_key, TEAM_TTL)  # type: ignore[misc]

        # 4. Pub/Sub notification for real-time listeners
        channel = f"team:{team_run_id}:messages"
        await self.redis.redis.publish(channel, msg_data)

        logger.debug(
            f"Message sent: {from_agent} -> {to_agent or 'broadcast'} "
            f"({message_type}) in run {team_run_id}"
        )
        return msg.id

    async def read_inbox(
        self,
        team_run_id: UUID,
        agent_role: str,
        max_messages: int = 20,
    ) -> list[dict[str, Any]]:
        """Read and consume messages from an agent's inbox.

        Messages are removed from the inbox after reading (LPOP).

        Args:
            team_run_id: The team run ID.
            agent_role: The agent role whose inbox to read.
            max_messages: Maximum number of messages to read.

        Returns:
            List of message dicts, ordered oldest first.
        """
        inbox_key = f"team:{team_run_id}:inbox:{agent_role}"
        messages: list[dict[str, Any]] = []

        for _ in range(max_messages):
            raw = await self.redis.redis.lpop(inbox_key)  # type: ignore[misc]
            if raw is None:
                break
            try:
                messages.append(json.loads(raw))
            except json.JSONDecodeError:
                logger.warning(f"Invalid message in inbox {inbox_key}: {_sanitize_log(raw)}")
                continue

        # Mark messages as read in database
        if messages:
            msg_ids = [m.get("id") for m in messages if m.get("id")]
            for msg_id in msg_ids:
                try:
                    msg_uuid = UUID(msg_id)
                    result = await self.db.execute(
                        select(TeamMessage).where(TeamMessage.id == msg_uuid)
                    )
                    msg = result.scalar_one_or_none()
                    if msg:
                        read_by = msg.read_by or []
                        if agent_role not in read_by:
                            read_by.append(agent_role)
                            msg.read_by = read_by
                except (ValueError, Exception):
                    continue
            await self.db.flush()

        return messages

    async def peek_inbox(
        self,
        team_run_id: UUID,
        agent_role: str,
    ) -> int:
        """Check how many messages are waiting in an agent's inbox.

        Does not consume messages.

        Args:
            team_run_id: The team run ID.
            agent_role: The agent role.

        Returns:
            Number of pending messages.
        """
        inbox_key = f"team:{team_run_id}:inbox:{agent_role}"
        return await self.redis.redis.llen(inbox_key)  # type: ignore[misc]

    async def get_messages(
        self,
        team_run_id: UUID,
        from_agent: Optional[str] = None,
        to_agent: Optional[str] = None,
        message_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[TeamMessage], int]:
        """Query persisted messages with optional filters.

        Args:
            team_run_id: The team run ID.
            from_agent: Filter by sender.
            to_agent: Filter by recipient.
            message_type: Filter by message type.
            limit: Max results.
            offset: Result offset.

        Returns:
            Tuple of (messages, total_count).
        """
        stmt = select(TeamMessage).where(TeamMessage.team_run_id == team_run_id)
        count_stmt = select(func.count(TeamMessage.id)).where(
            TeamMessage.team_run_id == team_run_id
        )

        if from_agent:
            stmt = stmt.where(TeamMessage.from_agent == from_agent)
            count_stmt = count_stmt.where(TeamMessage.from_agent == from_agent)
        if to_agent:
            stmt = stmt.where(TeamMessage.to_agent == to_agent)
            count_stmt = count_stmt.where(TeamMessage.to_agent == to_agent)
        if message_type:
            stmt = stmt.where(TeamMessage.message_type == message_type)
            count_stmt = count_stmt.where(TeamMessage.message_type == message_type)

        stmt = stmt.order_by(TeamMessage.created_at.desc()).offset(offset).limit(limit)

        result = await self.db.execute(stmt)
        messages = list(result.scalars().all())

        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar_one()

        return messages, total

    async def broadcast(
        self,
        team_run_id: UUID,
        from_agent: str,
        message_type: str,
        content: dict[str, Any],
        task_id: Optional[UUID] = None,
    ) -> UUID:
        """Convenience method to broadcast a message to all agents.

        Args:
            team_run_id: The team run ID.
            from_agent: Sender agent role.
            message_type: Type of message.
            content: Message content.
            task_id: Optional associated task ID.

        Returns:
            The created message ID.
        """
        return await self.send_message(
            team_run_id=team_run_id,
            from_agent=from_agent,
            to_agent=None,
            message_type=message_type,
            content=content,
            task_id=task_id,
        )

    async def cleanup(self, team_run_id: UUID) -> None:
        """Clean up Redis resources for a team run.

        Removes all inbox keys and the messages Pub/Sub channel.

        Args:
            team_run_id: The team run ID.
        """
        for role in AGENT_ROLES:
            inbox_key = f"team:{team_run_id}:inbox:{role}"
            await self.redis.redis.delete(inbox_key)

        # Also clean up team_lead inbox
        await self.redis.redis.delete(f"team:{team_run_id}:inbox:team_lead")
        logger.info(f"Cleaned up message bus for run {team_run_id}")
