"""Tests for ConfigLoader."""

from pathlib import Path

import pytest

from app.agents.config_loader import (
    ConfigLoader,
    parse_frontmatter_md,
)
from app.agents.tool_definitions import ROLE_TOOLS


@pytest.fixture
def tmp_project(tmp_path):
    """Create a temporary project with .claude/agents/ and .claude/skills/."""
    agents_dir = tmp_path / ".claude" / "agents"
    skills_dir = tmp_path / ".claude" / "skills"
    agents_dir.mkdir(parents=True)
    skills_dir.mkdir(parents=True)

    # Create a test agent definition
    (agents_dir / "test-writer.md").write_text(
        "---\n"
        "name: test-writer\n"
        "description: A test writer agent\n"
        "tools:\n"
        "  - get_chapter_outline\n"
        "  - send_message\n"
        "model: inherit\n"
        "skills:\n"
        "  - test-writing\n"
        "---\n\n"
        "You are a test writer.\n\n"
        "Write good stuff.\n"
    )

    # Create a test skill
    skill_dir = skills_dir / "test-writing"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        "---\n"
        "name: test-writing\n"
        "description: Test writing skill\n"
        "allowed-tools:\n"
        "  - get_chapter_outline\n"
        "---\n\n"
        "# Test Writing Skill\n\n"
        "This is the test writing expertise.\n"
    )

    return tmp_path


class TestParseFrontmatter:
    """Tests for YAML frontmatter parsing."""

    def test_parse_valid_frontmatter(self, tmp_path):
        """Should parse frontmatter and body."""
        md_file = tmp_path / "test.md"
        md_file.write_text("---\nname: test\ndescription: A test\n---\n\nBody content here.\n")
        fm, body = parse_frontmatter_md(md_file)
        assert fm["name"] == "test"
        assert fm["description"] == "A test"
        assert body == "Body content here."

    def test_parse_no_frontmatter(self, tmp_path):
        """Should return empty dict and full content as body."""
        md_file = tmp_path / "test.md"
        md_file.write_text("Just plain markdown content.\n")
        fm, body = parse_frontmatter_md(md_file)
        assert fm == {}
        assert body == "Just plain markdown content."

    def test_parse_frontmatter_with_list(self, tmp_path):
        """Should parse YAML lists in frontmatter."""
        md_file = tmp_path / "test.md"
        md_file.write_text("---\ntools:\n  - read\n  - write\n---\n\nBody.\n")
        fm, body = parse_frontmatter_md(md_file)
        assert fm["tools"] == ["read", "write"]

    def test_parse_empty_frontmatter(self, tmp_path):
        """Empty frontmatter (no content between ---) is treated as no frontmatter."""
        md_file = tmp_path / "test.md"
        md_file.write_text("---\n---\n\nBody.\n")
        fm, body = parse_frontmatter_md(md_file)
        # Regex requires content between --- delimiters, so empty
        # frontmatter falls through to "no frontmatter" path
        assert fm == {}
        assert "Body." in body


class TestLoadSkill:
    """Tests for skill loading."""

    def test_load_existing_skill(self, tmp_project):
        """Should load a skill from .claude/skills/."""
        loader = ConfigLoader(tmp_project)
        skill = loader.load_skill("test-writing")
        assert skill is not None
        assert skill.name == "test-writing"
        assert skill.description == "Test writing skill"
        assert "get_chapter_outline" in skill.allowed_tools
        assert "Test Writing Skill" in skill.content

    def test_load_nonexistent_skill(self, tmp_project):
        """Should return None for missing skills."""
        loader = ConfigLoader(tmp_project)
        skill = loader.load_skill("nonexistent")
        assert skill is None

    def test_skill_caching(self, tmp_project):
        """Skills should be cached after first load."""
        loader = ConfigLoader(tmp_project)
        skill1 = loader.load_skill("test-writing")
        skill2 = loader.load_skill("test-writing")
        assert skill1 is skill2  # Same object


class TestLoadAgent:
    """Tests for agent definition loading."""

    def test_load_existing_agent(self, tmp_project):
        """Should load an agent definition."""
        loader = ConfigLoader(tmp_project)
        agent_def = loader.load_agent("test-writer")
        assert agent_def is not None
        assert agent_def.name == "test-writer"
        assert agent_def.description == "A test writer agent"
        assert "get_chapter_outline" in agent_def.tools
        assert "send_message" in agent_def.tools
        assert agent_def.model == "inherit"
        assert "test-writing" in agent_def.skills
        assert "You are a test writer." in agent_def.system_prompt

    def test_load_nonexistent_agent(self, tmp_project):
        """Should return None for missing agents."""
        loader = ConfigLoader(tmp_project)
        agent_def = loader.load_agent("nonexistent")
        assert agent_def is None

    def test_agent_caching(self, tmp_project):
        """Agents should be cached after first load."""
        loader = ConfigLoader(tmp_project)
        a1 = loader.load_agent("test-writer")
        a2 = loader.load_agent("test-writer")
        assert a1 is a2


class TestBuildAgentConfig:
    """Tests for building AgentConfig from definitions."""

    def test_build_config_composes_prompt(self, tmp_project):
        """System prompt should include agent body + skill content."""
        loader = ConfigLoader(tmp_project)
        config = loader.build_agent_config(
            agent_name="test-writer",
            role_name="writer",
            model="gpt-5",
            temperature=0.8,
        )
        assert "You are a test writer." in config.system_prompt
        assert "Test Writing Skill" in config.system_prompt
        assert "Skill: test-writing" in config.system_prompt

    def test_build_config_sets_model(self, tmp_project):
        """Model should be set from parameter."""
        loader = ConfigLoader(tmp_project)
        config = loader.build_agent_config(
            agent_name="test-writer",
            role_name="writer",
            model="gpt-5",
        )
        assert config.model == "gpt-5"

    def test_build_config_inherit_model_uses_default(self, tmp_project):
        """Model 'inherit' should resolve to default."""
        loader = ConfigLoader(tmp_project)
        config = loader.build_agent_config(
            agent_name="test-writer",
            role_name="writer",
            model="inherit",
        )
        # Empty string triggers __post_init__ default
        assert config.model != "inherit"

    def test_build_config_attaches_tools(self, tmp_project):
        """Tools should be attached from ROLE_TOOLS."""
        loader = ConfigLoader(tmp_project)
        config = loader.build_agent_config(
            agent_name="test-writer",
            role_name="writer",
        )
        assert config.tools is not None
        assert config.tools == ROLE_TOOLS["writer"]

    def test_build_config_not_found_raises(self, tmp_project):
        """Should raise ValueError for missing agent definitions."""
        loader = ConfigLoader(tmp_project)
        with pytest.raises(ValueError, match="not found"):
            loader.build_agent_config(
                agent_name="nonexistent",
                role_name="writer",
            )

    def test_build_config_sets_temperature(self, tmp_project):
        """Temperature should be passed through."""
        loader = ConfigLoader(tmp_project)
        config = loader.build_agent_config(
            agent_name="test-writer",
            role_name="writer",
            temperature=0.3,
        )
        assert config.temperature == 0.3

    def test_build_config_sets_max_tokens(self, tmp_project):
        """Max tokens should be passed through."""
        loader = ConfigLoader(tmp_project)
        config = loader.build_agent_config(
            agent_name="test-writer",
            role_name="writer",
            max_tokens=8000,
        )
        assert config.max_tokens == 8000


class TestListMethods:
    """Tests for listing available agents and skills."""

    def test_list_agents(self, tmp_project):
        """Should list all agent definition files."""
        loader = ConfigLoader(tmp_project)
        agents = loader.list_agents()
        assert "test-writer" in agents

    def test_list_skills(self, tmp_project):
        """Should list all skill directories with SKILL.md."""
        loader = ConfigLoader(tmp_project)
        skills = loader.list_skills()
        assert "test-writing" in skills

    def test_list_agents_empty_dir(self, tmp_path):
        """Should return empty list when no agents dir exists."""
        loader = ConfigLoader(tmp_path)
        assert loader.list_agents() == []

    def test_list_skills_empty_dir(self, tmp_path):
        """Should return empty list when no skills dir exists."""
        loader = ConfigLoader(tmp_path)
        assert loader.list_skills() == []


class TestRealProjectFiles:
    """Tests using the actual project .claude/ files."""

    @pytest.fixture
    def project_loader(self):
        """ConfigLoader pointing at the real project root."""
        project_root = Path(__file__).parent.parent.parent.parent
        return ConfigLoader(project_root=project_root)

    def test_real_agents_exist(self, project_loader):
        """Real project should have the 5 book pipeline agent definitions."""
        agents = project_loader.list_agents()
        expected = {
            "concept-generator",
            "outliner",
            "chapter-writer",
            "editor",
            "continuity-checker",
        }
        assert expected.issubset(set(agents))

    def test_real_skills_exist(self, project_loader):
        """Real project should have the 5 book pipeline skills."""
        skills = project_loader.list_skills()
        expected = {
            "concept-generation",
            "outlining",
            "chapter-writing",
            "editing",
            "continuity-checking",
        }
        assert expected.issubset(set(skills))

    def test_real_build_writer_config(self, project_loader):
        """Should build a complete writer config from real files."""
        config = project_loader.build_agent_config(
            agent_name="chapter-writer",
            role_name="writer",
            model="gpt-5",
            temperature=0.8,
            max_tokens=8000,
        )
        assert config.role == "writer"
        assert config.temperature == 0.8
        assert config.max_tokens == 8000
        assert config.tools is not None
        assert len(config.tools) > 0
        # Should have skill content in prompt
        assert "chapter-writing" in config.system_prompt.lower()
