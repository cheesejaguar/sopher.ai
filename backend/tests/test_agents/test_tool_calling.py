"""Tests for tool calling infrastructure in Agent base class."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.agents.base import Agent, AgentConfig, AgentError


class MockToolCall:
    """Mock LiteLLM tool call object."""

    def __init__(self, tool_id, name, arguments):
        self.id = tool_id
        self.function = MagicMock()
        self.function.name = name
        self.function.arguments = json.dumps(arguments)


class MockMessage:
    """Mock LiteLLM response message."""

    def __init__(self, content=None, tool_calls=None):
        self.content = content
        self.tool_calls = tool_calls

    def model_dump(self, exclude_none=False):
        data = {"role": "assistant", "content": self.content}
        if self.tool_calls and not exclude_none:
            data["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in self.tool_calls
            ]
        elif self.tool_calls:
            data["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in self.tool_calls
            ]
        return data


class MockChoice:
    def __init__(self, message):
        self.message = message


class MockResponse:
    def __init__(self, message):
        self.choices = [MockChoice(message)]


@pytest.fixture
def simple_config():
    """Agent config without tools."""
    return AgentConfig(
        role="test",
        system_prompt="You are a test agent.",
        model="test-model",
    )


@pytest.fixture
def tool_config():
    """Agent config with tools."""
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_data",
                "description": "Gets data",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string"},
                    },
                    "required": ["key"],
                },
            },
        }
    ]
    handler = AsyncMock()
    handler.execute = AsyncMock(return_value="tool result")
    return AgentConfig(
        role="test",
        system_prompt="You are a test agent.",
        model="test-model",
        tools=tools,
        tool_handler=handler,
    )


class TestAgentConfigToolFields:
    """Tests for new tool-related fields on AgentConfig."""

    def test_default_tools_none(self, simple_config):
        """Tools should default to None."""
        assert simple_config.tools is None

    def test_default_tool_handler_none(self, simple_config):
        """Tool handler should default to None."""
        assert simple_config.tool_handler is None

    def test_default_max_tool_iterations(self, simple_config):
        """Max tool iterations should default to 10."""
        assert simple_config.max_tool_iterations == 10

    def test_custom_tools(self, tool_config):
        """Tools should be settable."""
        assert tool_config.tools is not None
        assert len(tool_config.tools) == 1
        assert tool_config.tools[0]["function"]["name"] == "get_data"

    def test_custom_tool_handler(self, tool_config):
        """Tool handler should be settable."""
        assert tool_config.tool_handler is not None


class TestRunWithoutTools:
    """Tests that Agent.run() without tools is unchanged."""

    @pytest.mark.asyncio
    @patch("app.agents.base.litellm")
    async def test_run_no_tools_returns_content(self, mock_litellm, simple_config):
        """Without tools, run() should return content directly."""
        mock_litellm.acompletion = AsyncMock(
            return_value=MockResponse(MockMessage(content="Hello world"))
        )
        mock_litellm.APIError = Exception
        mock_litellm.Timeout = TimeoutError

        agent = Agent(simple_config)
        result = await agent.run("Say hello")
        assert result == "Hello world"

    @pytest.mark.asyncio
    @patch("app.agents.base.litellm")
    async def test_run_no_tools_doesnt_pass_tools_param(self, mock_litellm, simple_config):
        """Without tools, run() should NOT pass tools to acompletion."""
        mock_litellm.acompletion = AsyncMock(return_value=MockResponse(MockMessage(content="ok")))
        mock_litellm.APIError = Exception
        mock_litellm.Timeout = TimeoutError

        agent = Agent(simple_config)
        await agent.run("test")

        call_kwargs = mock_litellm.acompletion.call_args.kwargs
        assert "tools" not in call_kwargs


class TestRunWithTools:
    """Tests for tool-calling loop in Agent.run()."""

    @pytest.mark.asyncio
    @patch("app.agents.base.litellm")
    async def test_single_tool_call_iteration(self, mock_litellm, tool_config):
        """Agent should call tool, feed result back, and get final response."""
        tool_call = MockToolCall("call_1", "get_data", {"key": "test"})

        # First response: tool call. Second response: final content.
        mock_litellm.acompletion = AsyncMock(
            side_effect=[
                MockResponse(MockMessage(tool_calls=[tool_call])),
                MockResponse(MockMessage(content="Final answer")),
            ]
        )
        mock_litellm.APIError = Exception
        mock_litellm.Timeout = TimeoutError

        agent = Agent(tool_config)
        result = await agent.run("Get some data")

        assert result == "Final answer"
        tool_config.tool_handler.execute.assert_called_once_with("get_data", {"key": "test"})

    @pytest.mark.asyncio
    @patch("app.agents.base.litellm")
    async def test_multiple_tool_call_iterations(self, mock_litellm, tool_config):
        """Agent should handle multiple rounds of tool calls."""
        tool_call_1 = MockToolCall("call_1", "get_data", {"key": "first"})
        tool_call_2 = MockToolCall("call_2", "get_data", {"key": "second"})

        mock_litellm.acompletion = AsyncMock(
            side_effect=[
                MockResponse(MockMessage(tool_calls=[tool_call_1])),
                MockResponse(MockMessage(tool_calls=[tool_call_2])),
                MockResponse(MockMessage(content="Done")),
            ]
        )
        mock_litellm.APIError = Exception
        mock_litellm.Timeout = TimeoutError

        agent = Agent(tool_config)
        result = await agent.run("Multi-step task")

        assert result == "Done"
        assert tool_config.tool_handler.execute.call_count == 2

    @pytest.mark.asyncio
    @patch("app.agents.base.litellm")
    async def test_max_iterations_exceeded(self, mock_litellm, tool_config):
        """Agent should raise AgentError when max iterations exceeded."""
        tool_call = MockToolCall("call_1", "get_data", {"key": "loop"})
        tool_config.max_tool_iterations = 2

        # Always returns tool calls (never produces final content)
        mock_litellm.acompletion = AsyncMock(
            return_value=MockResponse(MockMessage(tool_calls=[tool_call]))
        )
        mock_litellm.APIError = Exception
        mock_litellm.Timeout = TimeoutError

        agent = Agent(tool_config)
        with pytest.raises(AgentError, match="exceeded max tool iterations"):
            await agent.run("Infinite loop task")

    @pytest.mark.asyncio
    @patch("app.agents.base.litellm")
    async def test_tools_passed_to_completion(self, mock_litellm, tool_config):
        """When tools are configured, they should be passed to acompletion."""
        mock_litellm.acompletion = AsyncMock(
            return_value=MockResponse(MockMessage(content="direct"))
        )
        mock_litellm.APIError = Exception
        mock_litellm.Timeout = TimeoutError

        agent = Agent(tool_config)
        await agent.run("test")

        call_kwargs = mock_litellm.acompletion.call_args.kwargs
        assert "tools" in call_kwargs
        assert call_kwargs["tools"] == tool_config.tools

    @pytest.mark.asyncio
    @patch("app.agents.base.litellm")
    async def test_tool_result_dict_serialized_as_json(self, mock_litellm, tool_config):
        """Dict results from tool handler should be JSON serialized."""
        tool_call = MockToolCall("call_1", "get_data", {"key": "test"})
        tool_config.tool_handler.execute = AsyncMock(return_value={"value": 42})

        mock_litellm.acompletion = AsyncMock(
            side_effect=[
                MockResponse(MockMessage(tool_calls=[tool_call])),
                MockResponse(MockMessage(content="got 42")),
            ]
        )
        mock_litellm.APIError = Exception
        mock_litellm.Timeout = TimeoutError

        agent = Agent(tool_config)
        result = await agent.run("test")

        assert result == "got 42"
        # Verify the tool result was added to messages
        second_call_messages = mock_litellm.acompletion.call_args_list[1].kwargs["messages"]
        tool_msg = [m for m in second_call_messages if m.get("role") == "tool"]
        assert len(tool_msg) == 1
        assert json.loads(tool_msg[0]["content"]) == {"value": 42}

    @pytest.mark.asyncio
    @patch("app.agents.base.litellm")
    async def test_tool_result_string_not_double_serialized(self, mock_litellm, tool_config):
        """String results from tool handler should not be double-serialized."""
        tool_call = MockToolCall("call_1", "get_data", {"key": "test"})
        tool_config.tool_handler.execute = AsyncMock(return_value="plain text result")

        mock_litellm.acompletion = AsyncMock(
            side_effect=[
                MockResponse(MockMessage(tool_calls=[tool_call])),
                MockResponse(MockMessage(content="ok")),
            ]
        )
        mock_litellm.APIError = Exception
        mock_litellm.Timeout = TimeoutError

        agent = Agent(tool_config)
        await agent.run("test")

        second_call_messages = mock_litellm.acompletion.call_args_list[1].kwargs["messages"]
        tool_msg = [m for m in second_call_messages if m.get("role") == "tool"]
        assert tool_msg[0]["content"] == "plain text result"
