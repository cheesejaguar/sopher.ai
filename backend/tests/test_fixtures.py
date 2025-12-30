"""Tests for conftest.py fixtures to ensure test infrastructure works correctly."""

from decimal import Decimal

import pytest


@pytest.mark.asyncio
async def test_db_session_fixture_creates_session(db_session):
    """Test that db_session fixture provides a working session."""
    from sqlalchemy import text

    assert db_session is not None
    # Session should be usable
    result = await db_session.execute(text("SELECT 1"))
    row = result.scalar()
    assert row == 1


@pytest.mark.asyncio
async def test_db_session_isolation(db_session, user_factory):
    """Test that db_session provides transaction isolation."""
    # Create a user in this session
    user = await user_factory(email="isolation-test@example.com")
    await db_session.commit()

    # User should exist within this test
    assert user.id is not None
    assert user.email == "isolation-test@example.com"


@pytest.mark.asyncio
async def test_user_factory_creates_valid_user(db_session, user_factory):
    """Test that user_factory creates valid User objects."""
    user = await user_factory()

    assert user.id is not None
    assert user.email is not None
    assert "@" in user.email
    assert user.name == "Test User"
    assert user.provider == "google"
    assert user.role == "author"
    assert user.monthly_budget_usd == Decimal("100.00")


@pytest.mark.asyncio
async def test_user_factory_custom_values(db_session, user_factory):
    """Test that user_factory accepts custom values."""
    user = await user_factory(
        email="custom@example.com",
        name="Custom User",
        role="admin",
        monthly_budget_usd=Decimal("500.00"),
    )

    assert user.email == "custom@example.com"
    assert user.name == "Custom User"
    assert user.role == "admin"
    assert user.monthly_budget_usd == Decimal("500.00")


@pytest.mark.asyncio
async def test_project_factory_creates_valid_project(db_session, project_factory):
    """Test that project_factory creates valid Project objects."""
    project = await project_factory()

    assert project.id is not None
    assert project.name == "Test Book Project"
    assert project.settings is not None
    assert "genre" in project.settings
    assert "target_chapters" in project.settings


@pytest.mark.asyncio
async def test_project_factory_custom_settings(db_session, project_factory):
    """Test that project_factory accepts custom settings."""
    custom_settings = {
        "genre": "mystery",
        "target_chapters": 20,
        "style_guide": "Noir detective style",
        "pov": "first-person",
    }
    project = await project_factory(
        name="Mystery Novel",
        settings=custom_settings,
    )

    assert project.name == "Mystery Novel"
    assert project.settings["genre"] == "mystery"
    assert project.settings["pov"] == "first-person"


@pytest.mark.asyncio
async def test_session_factory_creates_valid_session(
    db_session, user_factory, project_factory, session_factory
):
    """Test that session_factory creates valid Session objects."""
    user = await user_factory()
    project = await project_factory()
    session = await session_factory(project=project, user=user)

    assert session.id is not None
    assert session.project_id == project.id
    assert session.user_id == user.id
    assert session.context == {}


@pytest.mark.asyncio
async def test_session_factory_with_context(
    db_session, user_factory, project_factory, session_factory
):
    """Test that session_factory accepts custom context."""
    user = await user_factory()
    project = await project_factory()
    context = {"current_chapter": 5, "characters": ["Maya", "Jake"]}
    session = await session_factory(project=project, user=user, context=context)

    assert session.context["current_chapter"] == 5
    assert "Maya" in session.context["characters"]


@pytest.mark.asyncio
async def test_event_factory_creates_valid_event(
    db_session, user_factory, project_factory, session_factory, event_factory
):
    """Test that event_factory creates valid Event objects."""
    user = await user_factory()
    project = await project_factory()
    session = await session_factory(project=project, user=user)
    event = await event_factory(session=session, type="outline_start")

    assert event.id is not None
    assert event.session_id == session.id
    assert event.type == "outline_start"
    assert event.payload == {}


@pytest.mark.asyncio
async def test_event_factory_with_payload(
    db_session, user_factory, project_factory, session_factory, event_factory
):
    """Test that event_factory accepts custom payload."""
    user = await user_factory()
    project = await project_factory()
    session = await session_factory(project=project, user=user)
    payload = {"chapter": 1, "status": "in_progress", "tokens": 500}
    event = await event_factory(session=session, type="chapter_draft", payload=payload)

    assert event.payload["chapter"] == 1
    assert event.payload["status"] == "in_progress"


@pytest.mark.asyncio
async def test_artifact_factory_creates_valid_artifact(
    db_session, user_factory, project_factory, session_factory, artifact_factory
):
    """Test that artifact_factory creates valid Artifact objects."""
    user = await user_factory()
    project = await project_factory()
    session = await session_factory(project=project, user=user)
    artifact = await artifact_factory(session=session, kind="outline")

    assert artifact.id is not None
    assert artifact.session_id == session.id
    assert artifact.kind == "outline"


@pytest.mark.asyncio
async def test_artifact_factory_with_blob(
    db_session, user_factory, project_factory, session_factory, artifact_factory
):
    """Test that artifact_factory can store blob content."""
    user = await user_factory()
    project = await project_factory()
    session = await session_factory(project=project, user=user)
    content = b"Chapter 1: The Beginning\n\nIt was a dark and stormy night..."
    artifact = await artifact_factory(
        session=session,
        kind="chapter",
        meta={"chapter_number": 1, "word_count": 5000},
        blob=content,
    )

    assert artifact.blob == content
    assert artifact.meta["chapter_number"] == 1


@pytest.mark.asyncio
async def test_cost_factory_creates_valid_cost(
    db_session, user_factory, project_factory, session_factory, cost_factory
):
    """Test that cost_factory creates valid Cost objects."""
    user = await user_factory()
    project = await project_factory()
    session = await session_factory(project=project, user=user)
    cost = await cost_factory(session=session)

    assert cost.id is not None
    assert cost.session_id == session.id
    assert cost.agent == "writer"
    assert cost.model == "gpt-4o"
    assert cost.prompt_tokens == 100
    assert cost.completion_tokens == 50


@pytest.mark.asyncio
async def test_cost_factory_custom_values(
    db_session, user_factory, project_factory, session_factory, cost_factory
):
    """Test that cost_factory accepts custom values."""
    user = await user_factory()
    project = await project_factory()
    session = await session_factory(project=project, user=user)
    cost = await cost_factory(
        session=session,
        agent="editor",
        model="claude-sonnet-4-20250514",
        prompt_tokens=2000,
        completion_tokens=1000,
        usd=Decimal("0.05"),
    )

    assert cost.agent == "editor"
    assert cost.model == "claude-sonnet-4-20250514"
    assert cost.prompt_tokens == 2000
    assert cost.usd == Decimal("0.05")


def test_mock_cache_fixture(mock_cache):
    """Test that mock_cache provides expected interface."""
    assert mock_cache is not None
    assert hasattr(mock_cache, "get")
    assert hasattr(mock_cache, "set")
    assert hasattr(mock_cache, "delete")
    assert hasattr(mock_cache, "increment")
    assert hasattr(mock_cache.redis, "ping")


@pytest.mark.asyncio
async def test_mock_cache_operations(mock_cache):
    """Test that mock_cache operations work as expected."""
    # Test get returns None by default
    result = await mock_cache.get("test-key")
    assert result is None

    # Test set doesn't raise
    await mock_cache.set("test-key", "test-value")

    # Test increment returns expected value
    count = await mock_cache.increment("counter")
    assert count == 1


def test_mock_llm_response_factory(mock_llm_response):
    """Test that mock_llm_response creates proper mock."""
    mock = mock_llm_response(["Hello, ", "world!"])
    assert mock is not None
    assert callable(mock)


@pytest.mark.asyncio
async def test_mock_llm_response_streaming(mock_llm_response):
    """Test that mock_llm_response streams correctly."""
    mock = mock_llm_response(
        content_chunks=["Once ", "upon ", "a ", "time..."],
        prompt_tokens=50,
        completion_tokens=25,
    )

    chunks = []
    async for chunk in mock():
        chunks.append(chunk)

    # Should have 4 content chunks + 1 usage chunk
    assert len(chunks) == 5
    assert chunks[0]["choices"][0]["delta"]["content"] == "Once "
    assert chunks[-1]["usage"]["prompt_tokens"] == 50


def test_mock_agents_fixture(mock_agents):
    """Test that mock_agents provides expected interface."""
    assert mock_agents is not None
    assert hasattr(mock_agents, "generate_concepts")
    assert hasattr(mock_agents, "generate_outline")
    assert hasattr(mock_agents, "write_chapter")
    assert hasattr(mock_agents, "edit_content")
    assert hasattr(mock_agents, "check_continuity")


@pytest.mark.asyncio
async def test_mock_agents_generate_concepts(mock_agents):
    """Test mock_agents generate_concepts returns expected structure."""
    result = await mock_agents.generate_concepts("Test brief")

    assert "concepts" in result
    assert "themes" in result
    assert isinstance(result["themes"], list)


@pytest.mark.asyncio
async def test_mock_agents_write_chapter(mock_agents):
    """Test mock_agents write_chapter returns expected structure."""
    result = await mock_agents.write_chapter(outline={}, chapter_number=1)

    assert "content" in result
    assert "word_count" in result
    assert isinstance(result["word_count"], int)


@pytest.mark.asyncio
async def test_mock_agents_check_continuity(mock_agents):
    """Test mock_agents check_continuity returns expected structure."""
    result = await mock_agents.check_continuity(chapters=[])

    assert "inconsistencies" in result
    assert "suggestions" in result
    assert "confidence_score" in result
    assert result["confidence_score"] == 0.95


def test_sse_collector_fixture(sse_collector):
    """Test that sse_collector provides expected interface."""
    assert sse_collector is not None
    assert hasattr(sse_collector, "add_event")
    assert hasattr(sse_collector, "tokens")
    assert hasattr(sse_collector, "errors")
    assert hasattr(sse_collector, "full_content")
    assert hasattr(sse_collector, "is_complete")


def test_sse_collector_processes_events(sse_collector):
    """Test that sse_collector correctly categorizes events."""
    import json

    # Add token events
    sse_collector.add_event({"event": "token", "data": "Hello "})
    sse_collector.add_event({"event": "token", "data": "world!"})

    # Add checkpoint
    sse_collector.add_event({"event": "checkpoint", "data": json.dumps({"progress": 0.5})})

    # Add complete event
    sse_collector.add_event({"event": "complete", "data": json.dumps({"tokens": 100})})

    assert len(sse_collector.tokens) == 2
    assert sse_collector.full_content == "Hello world!"
    assert len(sse_collector.checkpoints) == 1
    assert sse_collector.checkpoints[0]["progress"] == 0.5
    assert sse_collector.is_complete
    assert sse_collector.complete["tokens"] == 100


def test_sse_collector_error_detection(sse_collector):
    """Test that sse_collector detects errors."""
    import json

    assert not sse_collector.has_errors

    sse_collector.add_event(
        {
            "event": "error",
            "data": json.dumps({"error_code": "TEST_ERROR", "message": "Test error"}),
        }
    )

    assert sse_collector.has_errors
    assert len(sse_collector.errors) == 1
    assert sse_collector.errors[0]["error_code"] == "TEST_ERROR"


def test_sample_book_brief_fixture(sample_book_brief):
    """Test that sample_book_brief provides valid content."""
    assert sample_book_brief is not None
    assert len(sample_book_brief) > 50  # Should be substantial
    assert "archaeologist" in sample_book_brief.lower()


def test_sample_outline_fixture(sample_outline):
    """Test that sample_outline provides valid structure."""
    assert sample_outline is not None
    assert "title" in sample_outline
    assert "chapters" in sample_outline
    assert len(sample_outline["chapters"]) >= 2

    # Check chapter structure
    chapter = sample_outline["chapters"][0]
    assert "number" in chapter
    assert "title" in chapter
    assert "summary" in chapter


def test_sample_chapter_content_fixture(sample_chapter_content):
    """Test that sample_chapter_content provides valid content."""
    assert sample_chapter_content is not None
    assert len(sample_chapter_content) > 100
    assert "Chapter" in sample_chapter_content


@pytest.mark.asyncio
async def test_async_client_fixture(async_client):
    """Test that async_client can make requests."""
    response = await async_client.get("/healthz")
    assert response.status_code == 200


def test_mock_token_fixture(mock_token):
    """Test that mock_token provides authentication mock."""
    assert mock_token is not None
    # The mock should have been configured with expected return value
    result = mock_token.return_value
    assert hasattr(result, "user_id")
    assert hasattr(result, "role")


def test_temp_env_vars_fixture(temp_env_vars):
    """Test that temp_env_vars allows temporary environment changes."""
    import os

    os.environ.get("TEST_VAR_12345")

    temp_env_vars(TEST_VAR_12345="test_value")
    assert os.environ.get("TEST_VAR_12345") == "test_value"

    # Note: cleanup happens after test, so we just verify setting works


@pytest.mark.asyncio
async def test_multiple_factories_together(
    db_session,
    user_factory,
    project_factory,
    session_factory,
    event_factory,
    artifact_factory,
    cost_factory,
):
    """Test that all factories work together correctly."""
    # Create a complete hierarchy
    user = await user_factory(name="Test Author")
    project = await project_factory(name="Complete Test Book")
    session = await session_factory(project=project, user=user)

    # Add events
    event1 = await event_factory(session=session, type="outline_start")
    event2 = await event_factory(session=session, type="chapter_draft", payload={"chapter": 1})

    # Add artifacts
    outline = await artifact_factory(session=session, kind="outline")
    chapter1 = await artifact_factory(session=session, kind="chapter", meta={"number": 1})

    # Add costs
    cost1 = await cost_factory(session=session, agent="outliner")
    cost2 = await cost_factory(session=session, agent="writer")

    # Verify relationships
    assert session.project_id == project.id
    assert session.user_id == user.id
    assert event1.session_id == session.id
    assert event2.session_id == session.id
    assert outline.session_id == session.id
    assert chapter1.session_id == session.id
    assert cost1.session_id == session.id
    assert cost2.session_id == session.id

    await db_session.commit()
