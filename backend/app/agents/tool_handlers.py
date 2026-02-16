"""Tool call handlers for book pipeline agents.

Implements the ToolHandler protocol for dispatching agent tool calls
to the appropriate backend services (ContextManager, MessageBus).
"""

import json
import logging
from typing import Any, Protocol
from uuid import UUID

from ..services.message_bus import MessageBus
from .context_manager import ContextManager

logger = logging.getLogger(__name__)


class ToolHandler(Protocol):
    """Protocol for tool execution handlers."""

    async def execute(self, tool_name: str, arguments: dict[str, Any]) -> Any: ...


# Genre conventions knowledge base (used by search_genre_conventions tool)
GENRE_CONVENTIONS: dict[str, str] = {
    "fantasy": (
        "Fantasy conventions: world-building with consistent magic systems, "
        "quest narratives, good vs evil themes, coming-of-age arcs, "
        "detailed settings with maps and histories, multiple POV characters, "
        "series potential with expanding scope."
    ),
    "mystery": (
        "Mystery conventions: fair-play clue planting, red herrings, "
        "unreliable witnesses, ticking clock tension, detective protagonist "
        "with distinctive traits, satisfying revelation that recontextualizes "
        "earlier events, closed circle of suspects."
    ),
    "romance": (
        "Romance conventions: meet-cute opening, escalating emotional intimacy, "
        "the dark moment/crisis, happily ever after (HEA) or happy for now (HFN), "
        "dual POV showing both characters' feelings, external conflict "
        "threatening the relationship, emotional vulnerability."
    ),
    "sci-fi": (
        "Science fiction conventions: speculative technology or science as "
        "central premise, world-building exploring societal implications, "
        "exploration of what-if scenarios, sense of wonder, "
        "internally consistent rules, commentary on current issues."
    ),
    "thriller": (
        "Thriller conventions: high stakes from the start, fast pacing with "
        "short chapters, cliffhanger endings, ticking clock, "
        "protagonist under pressure, plot twists, escalating danger, "
        "cat-and-mouse dynamics."
    ),
    "literary": (
        "Literary fiction conventions: character-driven narrative, "
        "prose style as a feature, thematic depth, ambiguous endings, "
        "internal conflict, unreliable narration, social commentary, "
        "layered symbolism."
    ),
    "horror": (
        "Horror conventions: building dread through atmosphere, "
        "isolation of protagonist, escalating threat, unreliable perception, "
        "the uncanny and familiar-made-strange, psychological tension, "
        "consequences for transgression."
    ),
}

DEFAULT_GENRE = (
    "General fiction conventions: compelling characters, clear stakes, "
    "rising tension, satisfying resolution, consistent voice, "
    "show-don't-tell, strong opening hook, thematic coherence."
)


class BookToolHandler:
    """Executes tool calls for book generation agents.

    Wraps ContextManager and MessageBus to provide tool implementations
    that agents can call during their execution via LLM function calling.
    """

    def __init__(
        self,
        context_manager: ContextManager,
        message_bus: MessageBus,
        team_run_id: UUID,
        role: str,
        chapter_number: int | None = None,
    ):
        self.context_manager = context_manager
        self.message_bus = message_bus
        self.team_run_id = team_run_id
        self.role = role
        self.chapter_number = chapter_number

        self._handlers: dict[str, Any] = {
            "get_brief": self._get_brief,
            "get_settings": self._get_settings,
            "get_concept": self._get_concept,
            "get_character_profiles": self._get_character_profiles,
            "get_world_building": self._get_world_building,
            "get_chapter_outline": self._get_chapter_outline,
            "get_style_guide": self._get_style_guide,
            "get_previous_chapters": self._get_previous_chapters,
            "get_character_bible": self._get_character_bible,
            "get_chapter_content": self._get_chapter_content,
            "get_writer_notes": self._get_writer_notes,
            "get_all_chapters": self._get_all_chapters,
            "get_timeline": self._get_timeline,
            "search_chapters": self._search_chapters,
            "search_genre_conventions": self._search_genre_conventions,
            "send_message": self._send_message,
        }

    async def execute(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """Dispatch a tool call to the appropriate handler.

        Args:
            tool_name: Name of the tool to execute.
            arguments: Arguments parsed from the LLM's function call.

        Returns:
            Tool result (string or dict).
        """
        handler = self._handlers.get(tool_name)
        if not handler:
            logger.warning(f"Unknown tool called: {tool_name}")
            return {"error": f"Unknown tool: {tool_name}"}

        logger.debug(f"Executing tool {tool_name} for {self.role}")
        return await handler(**arguments)

    # ========================================================================
    # Context retrieval handlers
    # ========================================================================

    async def _get_brief(self) -> str:
        result = await self.context_manager.get_context(self.team_run_id, "brief")
        return result or "No brief available."

    async def _get_settings(self) -> str:
        result = await self.context_manager.get_context(self.team_run_id, "settings")
        if result and isinstance(result, dict):
            return json.dumps(result, indent=2)
        return str(result) if result else "No project settings available."

    async def _get_concept(self) -> str:
        result = await self.context_manager.get_context(self.team_run_id, "concept")
        if result and isinstance(result, dict):
            return json.dumps(result, indent=2)
        return str(result) if result else "Concept not yet generated."

    async def _get_character_profiles(self) -> str:
        result = await self.context_manager.get_context(self.team_run_id, "character_profiles")
        if not result:
            # Fall back to character_bible from outline
            result = await self.context_manager.get_context(self.team_run_id, "character_bible")
        if result and isinstance(result, dict):
            return json.dumps(result, indent=2)
        return str(result) if result else "No character profiles available yet."

    async def _get_world_building(self) -> str:
        result = await self.context_manager.get_context(self.team_run_id, "world_building")
        if not result:
            # Extract from concept
            concept = await self.context_manager.get_context(self.team_run_id, "concept")
            if concept and isinstance(concept, dict):
                return json.dumps(
                    {
                        "setting": concept.get("setting", ""),
                        "time_period": concept.get("time_period", ""),
                    },
                    indent=2,
                )
        if result and isinstance(result, dict):
            return json.dumps(result, indent=2)
        return str(result) if result else "No world-building details available."

    async def _get_chapter_outline(self) -> str:
        outline = await self.context_manager.get_context(self.team_run_id, "outline")
        if outline and isinstance(outline, dict) and self.chapter_number:
            chapters = outline.get("chapters", [])
            ch_outline = next(
                (ch for ch in chapters if ch.get("number") == self.chapter_number),
                chapters[self.chapter_number - 1] if len(chapters) >= self.chapter_number else None,
            )
            if ch_outline:
                return json.dumps(ch_outline, indent=2)
        if outline and isinstance(outline, dict):
            return json.dumps(outline, indent=2)
        return str(outline) if outline else "No outline available."

    async def _get_style_guide(self) -> str:
        result = await self.context_manager.get_context(self.team_run_id, "style_guide")
        return str(result) if result else "No style guide specified."

    async def _get_previous_chapters(
        self, current_chapter: int | None = None, count: int = 2
    ) -> str:
        ch = current_chapter or self.chapter_number or 1
        result = await self.context_manager.get_previous_chapter_summaries(
            self.team_run_id, ch, count
        )
        return result or "No previous chapters available."

    async def _get_character_bible(self) -> str:
        result = await self.context_manager.get_context(self.team_run_id, "character_bible")
        if result and isinstance(result, dict):
            return json.dumps(result, indent=2)
        return str(result) if result else "No character bible available."

    async def _get_chapter_content(self) -> str:
        if self.chapter_number:
            key = f"chapter_summary:{self.chapter_number}"
            result = await self.context_manager.get_context(self.team_run_id, key)
            return str(result) if result else "No chapter content available."
        return "No chapter number specified."

    async def _get_writer_notes(self) -> str:
        messages, _ = await self.message_bus.get_messages(
            team_run_id=self.team_run_id,
            to_agent=self.role,
            message_type="style_note",
            limit=10,
        )
        if not messages:
            return "No writer notes available."
        notes = []
        for msg in messages:
            content = msg.content if isinstance(msg.content, dict) else {}
            decisions = content.get("decisions", [])
            ch_num = content.get("chapter_number", "?")
            if decisions:
                notes.append(f"Chapter {ch_num}: " + "; ".join(str(d) for d in decisions))
        return "\n".join(notes) if notes else "No writer notes available."

    async def _get_all_chapters(self) -> str:
        result = await self.context_manager.get_context(self.team_run_id, "all_chapter_summaries")
        if result and isinstance(result, dict):
            return json.dumps(result, indent=2)
        return str(result) if result else "No chapter summaries available."

    async def _get_timeline(self) -> str:
        # Try dedicated timeline context first
        result = await self.context_manager.get_context(self.team_run_id, "timeline")
        if result:
            if isinstance(result, dict):
                return json.dumps(result, indent=2)
            return str(result)

        # Extract timeline hints from outline
        outline = await self.context_manager.get_context(self.team_run_id, "outline")
        if outline and isinstance(outline, dict):
            chapters = outline.get("chapters", [])
            timeline_entries = []
            for ch in chapters:
                entry = (
                    f"Chapter {ch.get('number', '?')}: "
                    f"{ch.get('summary', ch.get('title', 'No summary'))}"
                )
                timeline_entries.append(entry)
            return "\n".join(timeline_entries) if timeline_entries else ("No timeline available.")
        return "No timeline available."

    async def _search_chapters(
        self,
        query: str,
        chapter_numbers: list[int] | None = None,
    ) -> str:
        all_summaries = await self.context_manager.get_context(
            self.team_run_id, "all_chapter_summaries"
        )
        if not all_summaries or not isinstance(all_summaries, dict):
            return f"No chapters to search for '{query}'."

        query_lower = query.lower()
        matches = []
        for key, summary in all_summaries.items():
            # Parse chapter number from key (e.g., "chapter_1")
            try:
                ch_num = int(key.split("_")[-1]) if "_" in key else int(key)
            except (ValueError, IndexError):
                ch_num = None

            if chapter_numbers and ch_num not in chapter_numbers:
                continue

            summary_str = str(summary)
            if query_lower in summary_str.lower():
                matches.append(f"Chapter {ch_num or key}: {summary_str[:500]}")

        if matches:
            return f"Found '{query}' in {len(matches)} chapter(s):\n" + ("\n\n".join(matches))
        return f"No matches found for '{query}'."

    async def _search_genre_conventions(self, genre: str) -> str:
        genre_lower = genre.lower()
        for key, conventions in GENRE_CONVENTIONS.items():
            if key in genre_lower or genre_lower in key:
                return conventions
        return DEFAULT_GENRE

    async def _send_message(self, to_agent: str, message_type: str, content: dict[str, Any]) -> str:
        msg_id = await self.message_bus.send_message(
            team_run_id=self.team_run_id,
            from_agent=self.role,
            to_agent=to_agent,
            message_type=message_type,
            content=content,
        )
        return f"Message sent to {to_agent} (id: {msg_id})"
