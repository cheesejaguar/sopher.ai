"""OpenAI-compatible tool schemas for each agent role.

Defines the tools available to each book pipeline agent. These schemas are
passed to the LLM via LiteLLM's `tools` parameter, enabling agents to
pull context on-demand rather than relying solely on pushed context.
"""

from typing import Any


def _tool(name: str, description: str, parameters: dict[str, Any] | None = None) -> dict[str, Any]:
    """Helper to build an OpenAI-format tool schema."""
    params = parameters or {"type": "object", "properties": {}, "required": []}
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": params,
        },
    }


# ============================================================================
# Shared tools (available to multiple roles)
# ============================================================================

_GET_BRIEF = _tool("get_brief", "Retrieve the author's original book brief/idea.")

_GET_STYLE_GUIDE = _tool("get_style_guide", "Retrieve the writing style guide for tone and voice.")

_GET_CHARACTER_BIBLE = _tool(
    "get_character_bible",
    "Retrieve the character bible with descriptions, traits, and relationships.",
)

_GET_CHAPTER_OUTLINE = _tool(
    "get_chapter_outline",
    "Retrieve the outline for the current chapter being worked on.",
)

_SEND_MESSAGE = _tool(
    "send_message",
    "Send a message to another agent (e.g., style notes to the editor).",
    {
        "type": "object",
        "properties": {
            "to_agent": {
                "type": "string",
                "description": "Target agent role (e.g., 'editor', 'writer')",
            },
            "message_type": {
                "type": "string",
                "enum": [
                    "style_note",
                    "issue_report",
                    "correction_request",
                    "quality_feedback",
                ],
                "description": "Type of message",
            },
            "content": {
                "type": "object",
                "description": "Structured message content",
            },
        },
        "required": ["to_agent", "message_type", "content"],
    },
)

# ============================================================================
# Concept Generator tools
# ============================================================================

CONCEPT_GENERATOR_TOOLS: list[dict[str, Any]] = [
    _GET_BRIEF,
    _tool("get_settings", "Retrieve project settings (genre preferences, etc.)."),
    _tool(
        "search_genre_conventions",
        "Search for genre-specific conventions and reader expectations.",
        {
            "type": "object",
            "properties": {
                "genre": {
                    "type": "string",
                    "description": "The genre to search conventions for",
                },
            },
            "required": ["genre"],
        },
    ),
]

# ============================================================================
# Outliner tools
# ============================================================================

OUTLINER_TOOLS: list[dict[str, Any]] = [
    _tool("get_concept", "Retrieve the expanded book concept."),
    _GET_BRIEF,
    _tool(
        "get_character_profiles",
        "Retrieve character profiles developed so far.",
    ),
    _tool(
        "get_world_building",
        "Retrieve world-building details (setting, rules, geography).",
    ),
]

# ============================================================================
# Writer tools
# ============================================================================

WRITER_TOOLS: list[dict[str, Any]] = [
    _GET_CHAPTER_OUTLINE,
    _GET_STYLE_GUIDE,
    _tool(
        "get_previous_chapters",
        "Retrieve summaries of previous chapters for continuity.",
        {
            "type": "object",
            "properties": {
                "current_chapter": {
                    "type": "integer",
                    "description": "Current chapter number",
                },
                "count": {
                    "type": "integer",
                    "description": "Number of previous chapters to retrieve",
                    "default": 2,
                },
            },
            "required": ["current_chapter"],
        },
    ),
    _GET_CHARACTER_BIBLE,
    _SEND_MESSAGE,
]

# ============================================================================
# Editor tools
# ============================================================================

EDITOR_TOOLS: list[dict[str, Any]] = [
    _tool(
        "get_chapter_content",
        "Retrieve the raw chapter content to edit.",
    ),
    _GET_STYLE_GUIDE,
    _GET_CHAPTER_OUTLINE,
    _tool(
        "get_writer_notes",
        "Retrieve style notes from the writer about intentional choices.",
    ),
    _SEND_MESSAGE,
]

# ============================================================================
# Continuity Checker tools
# ============================================================================

CONTINUITY_CHECKER_TOOLS: list[dict[str, Any]] = [
    _tool(
        "get_all_chapters",
        "Retrieve summaries of all chapters for cross-chapter analysis.",
    ),
    _GET_CHARACTER_BIBLE,
    _tool("get_timeline", "Retrieve the story timeline."),
    _tool(
        "search_chapters",
        "Search across chapter content for specific terms or patterns.",
        {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search term or pattern",
                },
                "chapter_numbers": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Optional chapter numbers to search",
                },
            },
            "required": ["query"],
        },
    ),
    _SEND_MESSAGE,
]

# ============================================================================
# Master mapping: role name → tool list
# ============================================================================

ROLE_TOOLS: dict[str, list[dict[str, Any]]] = {
    "concept_generator": CONCEPT_GENERATOR_TOOLS,
    "outliner": OUTLINER_TOOLS,
    "writer": WRITER_TOOLS,
    "editor": EDITOR_TOOLS,
    "continuity_checker": CONTINUITY_CHECKER_TOOLS,
}
