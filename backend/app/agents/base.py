"""Base agent implementation using LiteLLM.

This module provides a thin abstraction layer over LLM API calls,
replacing the heavy CrewAI/LangChain dependencies with direct LiteLLM calls.
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Generic, TypeVar

import litellm
from pydantic import BaseModel
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


@dataclass
class AgentConfig:
    """Configuration for an agent."""

    role: str
    system_prompt: str
    model: str = ""  # Set at runtime from config.DEFAULT_MODEL
    temperature: float = 0.7
    max_tokens: int = 4000
    fallback_models: list[str] = field(default_factory=list)
    timeout: float = 120.0
    # Tool calling support (OpenAI-format tool schemas)
    tools: list[dict[str, Any]] | None = None
    tool_handler: Any = None  # ToolHandler instance, set at runtime
    max_tool_iterations: int = 10

    def __post_init__(self):
        """Set default model from config if not provided."""
        if not self.model:
            import os

            self.model = os.getenv("PRIMARY_MODEL", "anthropic/claude-sonnet-4.5")


class AgentError(Exception):
    """Base exception for agent errors."""

    pass


class AgentResponseError(AgentError):
    """Error parsing agent response."""

    pass


class AgentAPIError(AgentError):
    """Error calling LLM API."""

    pass


class Agent(Generic[T]):
    """
    Base agent that wraps LLM calls with structured output support.

    This is a thin wrapper that provides:
    - Retry logic with exponential backoff
    - Model fallbacks via LiteLLM
    - Structured output parsing via Pydantic
    - Streaming support for real-time output

    Usage:
        # Simple text response
        agent = Agent(AgentConfig(role="writer", system_prompt="You are a writer"))
        result = await agent.run("Write a paragraph about cats")

        # Structured response
        agent = Agent(config, response_model=ChapterOutline)
        outline = await agent.run("Create an outline for chapter 1")

        # Streaming response
        async for chunk in agent.stream("Write a story"):
            print(chunk, end="", flush=True)
    """

    def __init__(
        self,
        config: AgentConfig,
        response_model: type[T] | None = None,
    ):
        self.config = config
        self.response_model = response_model
        self._configure_litellm()

    def _configure_litellm(self) -> None:
        """Configure LiteLLM settings."""
        litellm.set_verbose = False
        # Suppress LiteLLM's internal logging noise
        logging.getLogger("LiteLLM").setLevel(logging.WARNING)

    def _build_messages(
        self,
        task: str,
        context: dict[str, Any] | None = None,
    ) -> list[dict[str, str]]:
        """Build the message list for the LLM."""
        # Build user content with optional context
        if context:
            context_parts = []
            for key, value in context.items():
                if isinstance(value, (dict, list)):
                    context_parts.append(f"{key}:\n{json.dumps(value, indent=2)}")
                else:
                    context_parts.append(f"{key}: {value}")
            context_str = "\n\n".join(context_parts)
            user_content = f"Context:\n{context_str}\n\nTask:\n{task}"
        else:
            user_content = task

        # Add JSON format instruction if using response model
        if self.response_model:
            schema_hint = f"\n\nRespond with valid JSON matching this schema:\n{self.response_model.model_json_schema()}"
            user_content += schema_hint

        return [
            {"role": "system", "content": self.config.system_prompt},
            {"role": "user", "content": user_content},
        ]

    def _parse_response(self, content: str) -> T:
        """Parse response into structured model."""
        if not self.response_model:
            raise AgentResponseError("No response model configured")

        try:
            # Handle markdown code blocks
            cleaned = content.strip()
            if "```json" in cleaned:
                cleaned = cleaned.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned:
                # Try to extract from any code block
                parts = cleaned.split("```")
                if len(parts) >= 2:
                    cleaned = parts[1].strip()
                    # Remove language identifier if present
                    if cleaned.startswith(("json", "python", "{")):
                        lines = cleaned.split("\n")
                        if not lines[0].startswith("{"):
                            cleaned = "\n".join(lines[1:])

            data = json.loads(cleaned)
            return self.response_model.model_validate(data)

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {e}")
            # Try to extract JSON object from response
            try:
                start = content.find("{")
                end = content.rfind("}") + 1
                if start >= 0 and end > start:
                    data = json.loads(content[start:end])
                    return self.response_model.model_validate(data)
            except (json.JSONDecodeError, ValueError):
                pass
            raise AgentResponseError(f"Failed to parse response as JSON: {e}") from e

        except Exception as e:
            raise AgentResponseError(f"Failed to validate response: {e}") from e

    async def _run_with_tools(
        self,
        messages: list[dict[str, Any]],
        completion_kwargs: dict[str, Any],
    ) -> str:
        """Execute a tool-calling loop until the model produces a final response.

        Calls the LLM with tool definitions. When the model returns tool_calls,
        executes each via the configured tool_handler and feeds results back.
        Repeats until the model produces a content-only response.

        Args:
            messages: The conversation messages (mutated in-place).
            completion_kwargs: kwargs for litellm.acompletion (messages updated each iteration).

        Returns:
            The final text content from the model.

        Raises:
            AgentError: If max_tool_iterations is exceeded.
        """
        for iteration in range(self.config.max_tool_iterations):
            response = await litellm.acompletion(**completion_kwargs)
            message = response.choices[0].message

            # If no tool calls, we have the final response
            tool_calls = getattr(message, "tool_calls", None)
            if not tool_calls:
                return message.content or ""

            # Append the assistant message with tool_calls
            messages.append(message.model_dump(exclude_none=True))

            # Execute each tool call
            for tool_call in tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)
                logger.debug(f"Agent '{self.config.role}' calling tool: " f"{fn_name}({fn_args})")
                result = await self.config.tool_handler.execute(fn_name, fn_args)
                result_str = json.dumps(result) if not isinstance(result, str) else result
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result_str,
                    }
                )

            # Update messages in completion_kwargs for next iteration
            completion_kwargs["messages"] = messages

        raise AgentError(
            f"Agent '{self.config.role}' exceeded max tool iterations "
            f"({self.config.max_tool_iterations})"
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((litellm.APIError, litellm.Timeout)),
    )
    async def run(
        self,
        task: str,
        context: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> T | str:
        """
        Execute the agent's task.

        Args:
            task: The task description/prompt
            context: Optional context dict to include in the prompt
            **kwargs: Additional arguments passed to LiteLLM

        Returns:
            Structured response if response_model is set, else raw string

        Raises:
            AgentAPIError: If the API call fails after retries
            AgentResponseError: If response parsing fails
        """
        messages = self._build_messages(task, context)

        try:
            # Build completion kwargs
            completion_kwargs: dict[str, Any] = {
                "model": self.config.model,
                "messages": messages,
                "temperature": self.config.temperature,
                "max_tokens": self.config.max_tokens,
                "timeout": self.config.timeout,
            }

            # Add fallbacks if configured
            if self.config.fallback_models:
                completion_kwargs["fallbacks"] = self.config.fallback_models

            # Add tools if configured
            if self.config.tools:
                completion_kwargs["tools"] = self.config.tools

            # Merge any additional kwargs
            completion_kwargs.update(kwargs)

            logger.debug(f"Agent '{self.config.role}' calling {self.config.model}")

            # Use tool-calling loop if tools are configured
            if self.config.tools and self.config.tool_handler:
                content = await self._run_with_tools(messages, completion_kwargs)
            else:
                response = await litellm.acompletion(**completion_kwargs)
                content = response.choices[0].message.content or ""

            logger.debug(f"Agent '{self.config.role}' received {len(content)} chars")

            if self.response_model:
                return self._parse_response(content)
            return content

        except (litellm.APIError, litellm.Timeout) as e:
            # Let tenacity handle retries
            logger.warning(f"Agent '{self.config.role}' API error: {e}")
            raise

        except AgentError:
            raise

        except Exception as e:
            logger.error(f"Agent '{self.config.role}' unexpected error: {e}")
            raise AgentAPIError(f"Agent execution failed: {e}") from e

    async def stream(
        self,
        task: str,
        context: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """
        Stream the agent's response.

        Args:
            task: The task description/prompt
            context: Optional context dict to include in the prompt
            **kwargs: Additional arguments passed to LiteLLM

        Yields:
            Content chunks as they arrive

        Note:
            Streaming does not support structured output parsing.
            Use run() if you need a response_model.
        """
        messages = self._build_messages(task, context)

        try:
            completion_kwargs: dict[str, Any] = {
                "model": self.config.model,
                "messages": messages,
                "temperature": self.config.temperature,
                "max_tokens": self.config.max_tokens,
                "timeout": self.config.timeout,
                "stream": True,
            }

            if self.config.fallback_models:
                completion_kwargs["fallbacks"] = self.config.fallback_models

            completion_kwargs.update(kwargs)

            logger.debug(f"Agent '{self.config.role}' streaming from {self.config.model}")
            response = await litellm.acompletion(**completion_kwargs)

            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            logger.error(f"Agent '{self.config.role}' streaming error: {e}")
            raise AgentAPIError(f"Streaming failed: {e}") from e

    async def run_with_retry_models(
        self,
        task: str,
        context: dict[str, Any] | None = None,
        models: list[str] | None = None,
        **kwargs: Any,
    ) -> T | str:
        """
        Try multiple models in sequence until one succeeds.

        This provides manual fallback control when you want to
        try different models with different parameters.

        Args:
            task: The task description/prompt
            context: Optional context dict
            models: List of models to try (uses config.model + fallback_models if not provided)
            **kwargs: Additional arguments passed to LiteLLM

        Returns:
            Response from the first successful model
        """
        if models is None:
            models = [self.config.model] + self.config.fallback_models

        last_error: Exception | None = None

        for model in models:
            try:
                logger.debug(f"Agent '{self.config.role}' trying model: {model}")
                return await self.run(task, context, model=model, **kwargs)
            except (AgentAPIError, litellm.APIError) as e:
                logger.warning(f"Model {model} failed: {e}")
                last_error = e
                continue

        raise AgentAPIError(f"All models failed. Last error: {last_error}")


class SimpleAgent(Agent[BaseModel]):
    """
    A simplified agent that always returns string responses.

    Use this when you don't need structured output parsing.
    """

    def __init__(self, config: AgentConfig):
        super().__init__(config, response_model=None)

    async def run(
        self,
        task: str,
        context: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> str:
        """Execute and return string response."""
        result = await super().run(task, context, **kwargs)
        return str(result)
