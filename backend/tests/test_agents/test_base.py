"""Tests for the base Agent class."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel

from app.agents.base import (
    Agent,
    AgentAPIError,
    AgentConfig,
    AgentResponseError,
    SimpleAgent,
)


class SampleResponse(BaseModel):
    """Sample response model for testing."""

    title: str
    content: str
    count: int


class MockChoice:
    """Mock LiteLLM choice object."""

    def __init__(self, content: str):
        self.message = MagicMock()
        self.message.content = content
        self.delta = MagicMock()
        self.delta.content = content


class MockResponse:
    """Mock LiteLLM response object."""

    def __init__(self, content: str):
        self.choices = [MockChoice(content)]


class TestAgentConfig:
    """Tests for AgentConfig dataclass."""

    def test_default_values(self):
        """Test default configuration values."""
        config = AgentConfig(role="test", system_prompt="You are a test agent")

        assert config.role == "test"
        assert config.system_prompt == "You are a test agent"
        assert config.model == "gpt-4"
        assert config.temperature == 0.7
        assert config.max_tokens == 4000
        assert config.fallback_models == []
        assert config.timeout == 120.0

    def test_custom_values(self):
        """Test custom configuration values."""
        config = AgentConfig(
            role="writer",
            system_prompt="You are a writer",
            model="claude-3-opus",
            temperature=0.9,
            max_tokens=8000,
            fallback_models=["gpt-4", "gemini-pro"],
            timeout=60.0,
        )

        assert config.model == "claude-3-opus"
        assert config.temperature == 0.9
        assert config.max_tokens == 8000
        assert config.fallback_models == ["gpt-4", "gemini-pro"]
        assert config.timeout == 60.0


class TestAgent:
    """Tests for the Agent class."""

    @pytest.fixture
    def config(self):
        """Create a test configuration."""
        return AgentConfig(
            role="test_agent",
            system_prompt="You are a helpful test agent.",
            model="gpt-4",
        )

    @pytest.fixture
    def agent(self, config):
        """Create a test agent without response model."""
        return Agent(config)

    @pytest.fixture
    def structured_agent(self, config):
        """Create a test agent with response model."""
        return Agent(config, response_model=SampleResponse)

    def test_build_messages_without_context(self, agent):
        """Test message building without context."""
        messages = agent._build_messages("Write a story")

        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == "You are a helpful test agent."
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "Write a story"

    def test_build_messages_with_context(self, agent):
        """Test message building with context."""
        context = {"genre": "mystery", "setting": "Victorian London"}
        messages = agent._build_messages("Write a story", context)

        assert len(messages) == 2
        assert "Context:" in messages[1]["content"]
        assert "genre: mystery" in messages[1]["content"]
        assert "setting: Victorian London" in messages[1]["content"]
        assert "Task:" in messages[1]["content"]
        assert "Write a story" in messages[1]["content"]

    def test_build_messages_with_response_model(self, structured_agent):
        """Test message building includes schema hint for structured output."""
        messages = structured_agent._build_messages("Generate content")

        assert "JSON" in messages[1]["content"]
        assert "schema" in messages[1]["content"].lower()

    def test_parse_response_valid_json(self, structured_agent):
        """Test parsing valid JSON response."""
        json_content = '{"title": "Test", "content": "Hello", "count": 42}'
        result = structured_agent._parse_response(json_content)

        assert isinstance(result, SampleResponse)
        assert result.title == "Test"
        assert result.content == "Hello"
        assert result.count == 42

    def test_parse_response_json_in_code_block(self, structured_agent):
        """Test parsing JSON wrapped in markdown code block."""
        content = '```json\n{"title": "Test", "content": "Hello", "count": 42}\n```'
        result = structured_agent._parse_response(content)

        assert isinstance(result, SampleResponse)
        assert result.title == "Test"

    def test_parse_response_json_with_surrounding_text(self, structured_agent):
        """Test parsing JSON with surrounding text."""
        content = 'Here is the response:\n{"title": "Test", "content": "Hello", "count": 42}\nDone!'
        result = structured_agent._parse_response(content)

        assert isinstance(result, SampleResponse)
        assert result.title == "Test"

    def test_parse_response_invalid_json(self, structured_agent):
        """Test parsing invalid JSON raises error."""
        with pytest.raises(AgentResponseError):
            structured_agent._parse_response("This is not JSON")

    @pytest.mark.asyncio
    async def test_run_returns_string(self, agent):
        """Test run returns string when no response model."""
        mock_response = MockResponse("Hello, world!")

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock_completion:
            mock_completion.return_value = mock_response
            result = await agent.run("Say hello")

        assert result == "Hello, world!"
        mock_completion.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_returns_parsed_model(self, structured_agent):
        """Test run returns parsed model when response model is set."""
        json_response = '{"title": "Hello", "content": "World", "count": 1}'
        mock_response = MockResponse(json_response)

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock_completion:
            mock_completion.return_value = mock_response
            result = await structured_agent.run("Generate content")

        assert isinstance(result, SampleResponse)
        assert result.title == "Hello"

    @pytest.mark.asyncio
    async def test_run_includes_fallbacks(self, config):
        """Test run includes fallback models in API call."""
        config.fallback_models = ["claude-3-opus", "gemini-pro"]
        agent = Agent(config)
        mock_response = MockResponse("test")

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock_completion:
            mock_completion.return_value = mock_response
            await agent.run("test")

        call_kwargs = mock_completion.call_args.kwargs
        assert call_kwargs["fallbacks"] == ["claude-3-opus", "gemini-pro"]

    @pytest.mark.asyncio
    async def test_run_passes_extra_kwargs(self, agent):
        """Test run passes additional kwargs to LiteLLM."""
        mock_response = MockResponse("test")

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock_completion:
            mock_completion.return_value = mock_response
            await agent.run("test", top_p=0.9, presence_penalty=0.5)

        call_kwargs = mock_completion.call_args.kwargs
        assert call_kwargs["top_p"] == 0.9
        assert call_kwargs["presence_penalty"] == 0.5


class TestSimpleAgent:
    """Tests for SimpleAgent class."""

    @pytest.mark.asyncio
    async def test_run_returns_string(self):
        """Test SimpleAgent always returns string."""
        config = AgentConfig(role="simple", system_prompt="You are simple")
        agent = SimpleAgent(config)
        mock_response = MockResponse("Simple response")

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock_completion:
            mock_completion.return_value = mock_response
            result = await agent.run("Test")

        assert isinstance(result, str)
        assert result == "Simple response"


class TestAgentStreaming:
    """Tests for agent streaming functionality."""

    @pytest.fixture
    def agent(self):
        """Create a test agent."""
        config = AgentConfig(role="streamer", system_prompt="You stream responses")
        return Agent(config)

    @pytest.mark.asyncio
    async def test_stream_yields_chunks(self, agent):
        """Test stream yields content chunks."""
        chunks = ["Hello", ", ", "world", "!"]

        async def mock_stream():
            for chunk_text in chunks:
                chunk = MagicMock()
                chunk.choices = [MagicMock()]
                chunk.choices[0].delta = MagicMock()
                chunk.choices[0].delta.content = chunk_text
                yield chunk

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock_completion:
            mock_completion.return_value = mock_stream()

            result_chunks = []
            async for chunk in agent.stream("Say hello"):
                result_chunks.append(chunk)

        assert result_chunks == chunks

    @pytest.mark.asyncio
    async def test_stream_skips_empty_chunks(self, agent):
        """Test stream skips chunks with no content."""

        async def mock_stream():
            chunk1 = MagicMock()
            chunk1.choices = [MagicMock()]
            chunk1.choices[0].delta = MagicMock()
            chunk1.choices[0].delta.content = "Hello"
            yield chunk1

            chunk2 = MagicMock()
            chunk2.choices = [MagicMock()]
            chunk2.choices[0].delta = MagicMock()
            chunk2.choices[0].delta.content = None  # Empty chunk
            yield chunk2

            chunk3 = MagicMock()
            chunk3.choices = [MagicMock()]
            chunk3.choices[0].delta = MagicMock()
            chunk3.choices[0].delta.content = "World"
            yield chunk3

        with patch("litellm.acompletion", new_callable=AsyncMock) as mock_completion:
            mock_completion.return_value = mock_stream()

            result_chunks = []
            async for chunk in agent.stream("Test"):
                result_chunks.append(chunk)

        assert result_chunks == ["Hello", "World"]


class TestAgentRetry:
    """Tests for agent retry functionality."""

    @pytest.fixture
    def agent(self):
        """Create a test agent."""
        config = AgentConfig(
            role="retry_test",
            system_prompt="Test",
            fallback_models=["model-1", "model-2"],
        )
        return Agent(config)

    @pytest.mark.asyncio
    async def test_run_with_retry_models_tries_all(self, agent):
        """Test run_with_retry_models tries all models."""
        import litellm

        call_count = 0
        models_tried = []

        async def mock_completion(**kwargs):
            nonlocal call_count
            call_count += 1
            models_tried.append(kwargs.get("model"))

            if call_count < 3:
                raise litellm.APIError(
                    message="Model unavailable",
                    llm_provider="test",
                    model=kwargs.get("model"),
                )
            return MockResponse("Success!")

        with patch("litellm.acompletion", side_effect=mock_completion):
            result = await agent.run_with_retry_models(
                "test", models=["fail-1", "fail-2", "success"]
            )

        assert result == "Success!"
        assert models_tried == ["fail-1", "fail-2", "success"]

    @pytest.mark.asyncio
    async def test_run_with_retry_models_raises_on_all_fail(self, agent):
        """Test run_with_retry_models raises when all models fail."""
        import litellm

        async def mock_completion(**kwargs):
            raise litellm.APIError(
                message="All models down",
                llm_provider="test",
                model=kwargs.get("model"),
            )

        with patch("litellm.acompletion", side_effect=mock_completion):
            with pytest.raises(AgentAPIError) as exc_info:
                await agent.run_with_retry_models("test", models=["m1", "m2"])

        assert "All models failed" in str(exc_info.value)
