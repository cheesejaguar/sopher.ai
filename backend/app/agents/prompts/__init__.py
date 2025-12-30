"""System prompts for book generation agents.

These prompts define the behavior and personality of each agent
in the book generation pipeline.
"""

from .concept import CONCEPT_SYSTEM_PROMPT
from .continuity import CONTINUITY_SYSTEM_PROMPT
from .editor import EDITOR_SYSTEM_PROMPT
from .outline import OUTLINE_SYSTEM_PROMPT
from .writer import WRITER_SYSTEM_PROMPT

__all__ = [
    "CONCEPT_SYSTEM_PROMPT",
    "OUTLINE_SYSTEM_PROMPT",
    "WRITER_SYSTEM_PROMPT",
    "EDITOR_SYSTEM_PROMPT",
    "CONTINUITY_SYSTEM_PROMPT",
]
