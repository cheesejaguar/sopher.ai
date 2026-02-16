"""Tests for tool definitions."""

import pytest

from app.agents.tool_definitions import (
    CONCEPT_GENERATOR_TOOLS,
    CONTINUITY_CHECKER_TOOLS,
    EDITOR_TOOLS,
    OUTLINER_TOOLS,
    ROLE_TOOLS,
    WRITER_TOOLS,
)


class TestRoleTools:
    """Tests for ROLE_TOOLS mapping."""

    def test_all_roles_have_tools(self):
        """All 5 agent roles should have tool definitions."""
        expected_roles = {
            "concept_generator",
            "outliner",
            "writer",
            "editor",
            "continuity_checker",
        }
        assert set(ROLE_TOOLS.keys()) == expected_roles

    def test_each_role_has_at_least_one_tool(self):
        """Each role should have at least one tool."""
        for role, tools in ROLE_TOOLS.items():
            assert len(tools) > 0, f"Role '{role}' has no tools"

    def test_role_tool_references_match_constants(self):
        """ROLE_TOOLS values should match the per-role constants."""
        assert ROLE_TOOLS["concept_generator"] is CONCEPT_GENERATOR_TOOLS
        assert ROLE_TOOLS["outliner"] is OUTLINER_TOOLS
        assert ROLE_TOOLS["writer"] is WRITER_TOOLS
        assert ROLE_TOOLS["editor"] is EDITOR_TOOLS
        assert ROLE_TOOLS["continuity_checker"] is CONTINUITY_CHECKER_TOOLS


class TestToolSchemaFormat:
    """Tests for OpenAI tool schema format compliance."""

    @pytest.mark.parametrize("role", ROLE_TOOLS.keys())
    def test_tool_schema_has_type_function(self, role):
        """Each tool schema must have type: 'function'."""
        for tool in ROLE_TOOLS[role]:
            assert tool["type"] == "function", f"Tool in '{role}' missing type: function"

    @pytest.mark.parametrize("role", ROLE_TOOLS.keys())
    def test_tool_schema_has_function_block(self, role):
        """Each tool must have a 'function' block."""
        for tool in ROLE_TOOLS[role]:
            assert "function" in tool
            fn = tool["function"]
            assert "name" in fn, f"Tool in '{role}' missing function.name"
            assert (
                "description" in fn
            ), f"Tool '{fn.get('name', '?')}' in '{role}' missing description"
            assert "parameters" in fn, f"Tool '{fn['name']}' in '{role}' missing parameters"

    @pytest.mark.parametrize("role", ROLE_TOOLS.keys())
    def test_parameters_is_valid_json_schema(self, role):
        """Each tool's parameters should be a valid JSON schema object."""
        for tool in ROLE_TOOLS[role]:
            params = tool["function"]["parameters"]
            assert (
                params["type"] == "object"
            ), f"Tool '{tool['function']['name']}' parameters.type must be 'object'"
            assert "properties" in params

    @pytest.mark.parametrize("role", ROLE_TOOLS.keys())
    def test_tool_names_unique_per_role(self, role):
        """Tool names should not be duplicated within a role."""
        names = [t["function"]["name"] for t in ROLE_TOOLS[role]]
        assert len(names) == len(set(names)), f"Duplicate tool names in '{role}': {names}"


class TestSpecificTools:
    """Tests for specific tool configurations."""

    def test_send_message_tool_has_required_params(self):
        """send_message tool should require to_agent, message_type, content."""
        for role in ["writer", "editor", "continuity_checker"]:
            tools = ROLE_TOOLS[role]
            send_msg = next(t for t in tools if t["function"]["name"] == "send_message")
            required = send_msg["function"]["parameters"]["required"]
            assert "to_agent" in required
            assert "message_type" in required
            assert "content" in required

    def test_search_chapters_has_query_param(self):
        """search_chapters should have a required query parameter."""
        tools = ROLE_TOOLS["continuity_checker"]
        search = next(t for t in tools if t["function"]["name"] == "search_chapters")
        required = search["function"]["parameters"]["required"]
        assert "query" in required

    def test_get_previous_chapters_has_current_chapter(self):
        """get_previous_chapters should have current_chapter as required."""
        tools = ROLE_TOOLS["writer"]
        tool = next(t for t in tools if t["function"]["name"] == "get_previous_chapters")
        required = tool["function"]["parameters"]["required"]
        assert "current_chapter" in required

    def test_concept_generator_has_no_send_message(self):
        """Concept generator should not have send_message."""
        names = [t["function"]["name"] for t in CONCEPT_GENERATOR_TOOLS]
        assert "send_message" not in names

    def test_outliner_has_no_send_message(self):
        """Outliner should not have send_message."""
        names = [t["function"]["name"] for t in OUTLINER_TOOLS]
        assert "send_message" not in names
