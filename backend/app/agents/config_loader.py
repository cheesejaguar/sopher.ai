"""Loader for .claude/agents/ and .claude/skills/ definitions.

Reads YAML-frontmatter markdown files and produces AgentConfig objects
enriched with tool definitions and skill content. This aligns the
sopher.ai agent system with Claude Code's Agent Teams architecture.
"""

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .base import AgentConfig
from .tool_definitions import ROLE_TOOLS

logger = logging.getLogger(__name__)

# Regex to split YAML frontmatter from markdown body
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)", re.DOTALL)


@dataclass
class SkillDefinition:
    """A parsed skill from a SKILL.md file."""

    name: str
    description: str
    allowed_tools: list[str] = field(default_factory=list)
    content: str = ""  # The markdown body (expertise instructions)


@dataclass
class AgentDefinition:
    """A parsed agent from an agent .md file."""

    name: str
    description: str
    tools: list[str] = field(default_factory=list)
    model: str = "inherit"
    skills: list[str] = field(default_factory=list)
    system_prompt: str = ""  # The markdown body


def parse_frontmatter_md(filepath: Path) -> tuple[dict[str, Any], str]:
    """Parse a YAML-frontmatter markdown file.

    Args:
        filepath: Path to the markdown file.

    Returns:
        Tuple of (frontmatter_dict, markdown_body).
    """
    content = filepath.read_text(encoding="utf-8")
    match = FRONTMATTER_RE.match(content)
    if not match:
        return {}, content.strip()
    frontmatter = yaml.safe_load(match.group(1)) or {}
    body = match.group(2).strip()
    return frontmatter, body


class ConfigLoader:
    """Loads agent and skill definitions from .claude/ directories.

    Bridges the file-based definitions (Claude Code format) and the
    Python-runtime AgentConfig objects used by the agent system.

    Usage:
        loader = ConfigLoader("/path/to/project")
        config = loader.build_agent_config(
            agent_name="chapter-writer",
            role_name="writer",
            model="anthropic/claude-sonnet-4.5",
            temperature=0.8,
        )
    """

    def __init__(self, project_root: str | Path | None = None):
        if project_root is None:
            self.project_root = Path.cwd()
        else:
            self.project_root = Path(project_root)
        self.agents_dir = self.project_root / ".claude" / "agents"
        self.skills_dir = self.project_root / ".claude" / "skills"
        self._skills_cache: dict[str, SkillDefinition] = {}
        self._agents_cache: dict[str, AgentDefinition] = {}

    def load_skill(self, skill_name: str) -> SkillDefinition | None:
        """Load a skill definition by name.

        Args:
            skill_name: Name matching a directory under .claude/skills/.

        Returns:
            SkillDefinition or None if not found.
        """
        if skill_name in self._skills_cache:
            return self._skills_cache[skill_name]

        skill_path = self.skills_dir / skill_name / "SKILL.md"
        if not skill_path.exists():
            logger.warning(f"Skill not found: {skill_path}")
            return None

        fm, body = parse_frontmatter_md(skill_path)
        skill = SkillDefinition(
            name=fm.get("name", skill_name),
            description=fm.get("description", ""),
            allowed_tools=fm.get("allowed-tools", []),
            content=body,
        )
        self._skills_cache[skill_name] = skill
        logger.debug(f"Loaded skill: {skill.name}")
        return skill

    def load_agent(self, agent_name: str) -> AgentDefinition | None:
        """Load an agent definition by name.

        Args:
            agent_name: Name matching a file under .claude/agents/ (without .md).

        Returns:
            AgentDefinition or None if not found.
        """
        if agent_name in self._agents_cache:
            return self._agents_cache[agent_name]

        agent_path = self.agents_dir / f"{agent_name}.md"
        if not agent_path.exists():
            logger.warning(f"Agent definition not found: {agent_path}")
            return None

        fm, body = parse_frontmatter_md(agent_path)
        agent_def = AgentDefinition(
            name=fm.get("name", agent_name),
            description=fm.get("description", ""),
            tools=fm.get("tools", []),
            model=fm.get("model", "inherit"),
            skills=fm.get("skills", []),
            system_prompt=body,
        )
        self._agents_cache[agent_name] = agent_def
        logger.debug(f"Loaded agent definition: {agent_def.name}")
        return agent_def

    def build_agent_config(
        self,
        agent_name: str,
        role_name: str,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
        fallback_models: list[str] | None = None,
    ) -> AgentConfig:
        """Build an AgentConfig from agent definition + skills.

        Loads the agent definition, resolves skill references,
        composes the system prompt (agent body + skill content),
        and attaches tool schemas from ROLE_TOOLS.

        Args:
            agent_name: Name of the agent definition file (without .md).
            role_name: The pipeline role name (e.g., "writer").
            model: Model override (None or "inherit" uses default).
            temperature: Temperature for generation.
            max_tokens: Max tokens for generation.
            fallback_models: Fallback model list.

        Returns:
            Complete AgentConfig ready for Agent initialization.

        Raises:
            ValueError: If agent definition is not found.
        """
        agent_def = self.load_agent(agent_name)
        if not agent_def:
            raise ValueError(f"Agent definition not found: {agent_name}")

        # Build system prompt: agent body + skill content sections
        prompt_parts = [agent_def.system_prompt]
        for skill_name in agent_def.skills:
            skill = self.load_skill(skill_name)
            if skill:
                prompt_parts.append(f"\n\n## Skill: {skill.name}\n\n{skill.content}")

        system_prompt = "\n".join(prompt_parts)

        # Resolve model: agent def > pipeline param > default
        resolved_model = ""
        if agent_def.model and agent_def.model not in ("inherit", "default"):
            resolved_model = agent_def.model
        elif model and model not in ("inherit", "default"):
            resolved_model = model

        # Get tool schemas for this role
        tools = ROLE_TOOLS.get(role_name)

        return AgentConfig(
            role=role_name,
            system_prompt=system_prompt,
            model=resolved_model,
            temperature=temperature,
            max_tokens=max_tokens,
            fallback_models=fallback_models or [],
            tools=tools,
        )

    def list_agents(self) -> list[str]:
        """List all available agent definition names.

        Returns:
            List of agent names (without .md extension).
        """
        if not self.agents_dir.exists():
            return []
        return sorted(p.stem for p in self.agents_dir.glob("*.md"))

    def list_skills(self) -> list[str]:
        """List all available skill names.

        Returns:
            List of skill directory names.
        """
        if not self.skills_dir.exists():
            return []
        return sorted(
            p.name for p in self.skills_dir.iterdir() if p.is_dir() and (p / "SKILL.md").exists()
        )
