"""Test configuration and fixtures for sopher.ai backend tests"""

import asyncio
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


@pytest.fixture
async def async_client():
    """Create async test client with proper mocking"""
    # Mock database and cache connections
    mock_cache = AsyncMock()
    mock_cache.redis = AsyncMock()
    mock_cache.redis.ping = AsyncMock()

    with (
        patch("app.main.init_db", new_callable=AsyncMock),
        patch("app.main.close_db", new_callable=AsyncMock),
        patch("app.main.cache", mock_cache),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


@pytest.fixture
def mock_token():
    """Mock JWT token"""
    with patch("app.security.verify_token") as mock:
        mock.return_value = type(
            "TokenData", (), {"user_id": "test-user", "project_id": str(uuid4()), "role": "author"}
        )()
        yield mock


@pytest.fixture
def mock_db_session():
    """Mock database session with proper async SQLAlchemy behavior"""
    mock_db = AsyncMock()
    mock_db.add = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    mock_db.rollback = AsyncMock()
    mock_db.close = AsyncMock()
    return mock_db


@pytest.fixture
def mock_sqlalchemy_models():
    """Mock SQLAlchemy models with proper async handling"""
    models = {}

    # Mock Session model
    mock_session_model = AsyncMock()
    mock_session_instance = AsyncMock()
    mock_session_instance.id = str(uuid4())
    mock_session_instance.project_id = str(uuid4())
    mock_session_instance.user_id = "test-user"
    mock_session_model.return_value = mock_session_instance
    models["Session"] = mock_session_model

    # Mock Cost model
    mock_cost_model = AsyncMock()
    mock_cost_instance = AsyncMock()
    mock_cost_instance.session_id = mock_session_instance.id
    mock_cost_instance.agent = "test-agent"
    mock_cost_instance.prompt_tokens = 100
    mock_cost_instance.completion_tokens = 50
    mock_cost_instance.usd = 0.005
    mock_cost_model.return_value = mock_cost_instance
    models["Cost"] = mock_cost_model

    # Mock Event model
    mock_event_model = AsyncMock()
    mock_event_instance = AsyncMock()
    mock_event_instance.session_id = mock_session_instance.id
    mock_event_instance.type = "test-event"
    mock_event_model.return_value = mock_event_instance
    models["Event"] = mock_event_model

    # Mock Artifact model
    mock_artifact_model = AsyncMock()
    mock_artifact_instance = AsyncMock()
    mock_artifact_instance.session_id = mock_session_instance.id
    mock_artifact_instance.kind = "test-artifact"
    mock_artifact_model.return_value = mock_artifact_instance
    models["Artifact"] = mock_artifact_model

    return models
