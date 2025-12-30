"""Pytest fixtures for sopher.ai backend tests.

This module provides reusable fixtures for:
- Async database testing with transaction isolation
- Test data factories for all models
- Mocked external services (LLM, cache)
- Authenticated test clients
"""

import asyncio
import os
from decimal import Decimal
from typing import AsyncGenerator, Callable
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    Text,
    event,
)
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.pool import StaticPool
from sqlalchemy.sql import func

# =============================================================================
# Test-specific Models (SQLite compatible)
# =============================================================================
# We define SQLite-compatible test models that mirror production models
# but use JSON instead of PostgreSQL-specific JSONB


class DBTestBase(DeclarativeBase):
    """Test-specific SQLAlchemy base."""

    pass


class UserModel(DBTestBase):
    """Test User model (SQLite compatible)."""

    __tablename__ = "users"

    id = Column(Text, primary_key=True)
    email = Column(Text, nullable=False, unique=True, index=True)
    name = Column(Text)
    picture = Column(Text)
    provider = Column(Text, nullable=False, default="google")
    provider_sub = Column(Text, nullable=False, unique=True)
    role = Column(Text, nullable=False, default="author")
    monthly_budget_usd = Column(Numeric(10, 2), default=100.00)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ProjectModel(DBTestBase):
    """Test Project model (SQLite compatible)."""

    __tablename__ = "projects"

    id = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    settings = Column(JSON, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    sessions = relationship("SessionModel", back_populates="project", cascade="all, delete-orphan")


class SessionModel(DBTestBase):
    """Test Session model (SQLite compatible)."""

    __tablename__ = "sessions"

    id = Column(Text, primary_key=True)
    project_id = Column(Text, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Text, ForeignKey("users.id"), nullable=False)
    context = Column(JSON, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("ProjectModel", back_populates="sessions")
    user = relationship("UserModel")
    events = relationship("EventModel", back_populates="session", cascade="all, delete-orphan")
    artifacts = relationship(
        "ArtifactModel", back_populates="session", cascade="all, delete-orphan"
    )
    costs = relationship("CostModel", back_populates="session", cascade="all, delete-orphan")


class EventModel(DBTestBase):
    """Test Event model (SQLite compatible)."""

    __tablename__ = "events"

    id = Column(Text, primary_key=True)
    session_id = Column(Text, ForeignKey("sessions.id"), nullable=False)
    type = Column(Text, nullable=False)
    payload = Column(JSON, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("SessionModel", back_populates="events")


class ArtifactModel(DBTestBase):
    """Test Artifact model (SQLite compatible)."""

    __tablename__ = "artifacts"

    id = Column(Text, primary_key=True)
    session_id = Column(Text, ForeignKey("sessions.id"), nullable=False)
    kind = Column(Text, nullable=False)
    path = Column(Text)
    meta = Column(JSON, default={})
    blob = Column(LargeBinary)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("SessionModel", back_populates="artifacts")


class CostModel(DBTestBase):
    """Test Cost model (SQLite compatible)."""

    __tablename__ = "costs"

    id = Column(Text, primary_key=True)
    session_id = Column(Text, ForeignKey("sessions.id"), nullable=False)
    agent = Column(Text, nullable=False)
    model = Column(Text)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    usd = Column(Numeric(10, 6), default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("SessionModel", back_populates="costs")


# =============================================================================
# Database Configuration
# =============================================================================


# Use in-memory SQLite for tests (fast, isolated)
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "sqlite+aiosqlite:///:memory:",
)


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Create test database engine (session-scoped for performance)."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=os.getenv("SQL_ECHO", "false").lower() == "true",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False} if "sqlite" in TEST_DATABASE_URL else {},
    )

    async with engine.begin() as conn:
        await conn.run_sync(DBTestBase.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(DBTestBase.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create isolated database session with transaction rollback.

    Each test runs in its own transaction that is rolled back after the test,
    ensuring complete test isolation.
    """
    async_session_factory = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    async with test_engine.connect() as conn:
        await conn.begin()
        async with async_session_factory(bind=conn) as session:
            await session.begin_nested()

            @event.listens_for(session.sync_session, "after_transaction_end")
            def reopen_nested_transaction(session_sync, transaction):
                if transaction.nested and not transaction._parent.nested:
                    session_sync.begin_nested()

            yield session

            await session.rollback()
        await conn.rollback()


# =============================================================================
# Test Data Factories
# =============================================================================


@pytest.fixture
def user_factory(db_session: AsyncSession) -> Callable:
    """Factory for creating test User objects."""

    async def _create_user(
        email: str | None = None,
        name: str = "Test User",
        picture: str | None = None,
        provider: str = "google",
        provider_sub: str | None = None,
        role: str = "author",
        monthly_budget_usd: Decimal = Decimal("100.00"),
    ) -> UserModel:
        user = UserModel(
            id=str(uuid4()),
            email=email or f"test-{uuid4().hex[:8]}@example.com",
            name=name,
            picture=picture,
            provider=provider,
            provider_sub=provider_sub or f"google-{uuid4().hex}",
            role=role,
            monthly_budget_usd=monthly_budget_usd,
        )
        db_session.add(user)
        await db_session.flush()
        return user

    return _create_user


@pytest.fixture
def project_factory(db_session: AsyncSession) -> Callable:
    """Factory for creating test Project objects."""

    async def _create_project(
        name: str = "Test Book Project",
        settings: dict | None = None,
    ) -> ProjectModel:
        project = ProjectModel(
            id=str(uuid4()),
            name=name,
            settings=settings
            or {
                "genre": "fiction",
                "target_chapters": 10,
                "style_guide": "Modern prose style",
            },
        )
        db_session.add(project)
        await db_session.flush()
        return project

    return _create_project


@pytest.fixture
def session_factory(db_session: AsyncSession) -> Callable:
    """Factory for creating test Session objects."""

    async def _create_session(
        project: ProjectModel,
        user: UserModel,
        context: dict | None = None,
    ) -> SessionModel:
        session = SessionModel(
            id=str(uuid4()),
            project_id=project.id,
            user_id=user.id,
            context=context or {},
        )
        db_session.add(session)
        await db_session.flush()
        return session

    return _create_session


@pytest.fixture
def event_factory(db_session: AsyncSession) -> Callable:
    """Factory for creating test Event objects."""

    async def _create_event(
        session: SessionModel,
        type: str = "test_event",
        payload: dict | None = None,
    ) -> EventModel:
        event_obj = EventModel(
            id=str(uuid4()),
            session_id=session.id,
            type=type,
            payload=payload or {},
        )
        db_session.add(event_obj)
        await db_session.flush()
        return event_obj

    return _create_event


@pytest.fixture
def artifact_factory(db_session: AsyncSession) -> Callable:
    """Factory for creating test Artifact objects."""

    async def _create_artifact(
        session: SessionModel,
        kind: str = "outline",
        path: str | None = None,
        meta: dict | None = None,
        blob: bytes | None = None,
    ) -> ArtifactModel:
        artifact = ArtifactModel(
            id=str(uuid4()),
            session_id=session.id,
            kind=kind,
            path=path,
            meta=meta or {},
            blob=blob,
        )
        db_session.add(artifact)
        await db_session.flush()
        return artifact

    return _create_artifact


@pytest.fixture
def cost_factory(db_session: AsyncSession) -> Callable:
    """Factory for creating test Cost objects."""

    async def _create_cost(
        session: SessionModel,
        agent: str = "writer",
        model: str = "gpt-4o",
        prompt_tokens: int = 100,
        completion_tokens: int = 50,
        usd: Decimal = Decimal("0.001"),
    ) -> CostModel:
        cost = CostModel(
            id=str(uuid4()),
            session_id=session.id,
            agent=agent,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            usd=usd,
        )
        db_session.add(cost)
        await db_session.flush()
        return cost

    return _create_cost


# =============================================================================
# Mocked Services
# =============================================================================


@pytest.fixture
def mock_cache() -> MagicMock:
    """Mock Redis cache for testing."""
    cache = MagicMock()
    cache.redis = AsyncMock()
    cache.redis.ping = AsyncMock(return_value=True)
    cache.get = AsyncMock(return_value=None)
    cache.set = AsyncMock()
    cache.delete = AsyncMock()
    cache.increment = AsyncMock(return_value=1)
    cache.expire = AsyncMock()
    return cache


@pytest.fixture
def mock_llm_response() -> Callable[..., AsyncMock]:
    """Factory for creating mock LLM streaming responses."""

    def _create_response(
        content_chunks: list[str] | None = None,
        prompt_tokens: int = 100,
        completion_tokens: int = 50,
    ):
        chunks = content_chunks or ["Test ", "response ", "content."]

        async def mock_stream():
            for chunk in chunks:
                yield {"choices": [{"delta": {"content": chunk}}]}
            yield {
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                }
            }

        return mock_stream

    return _create_response


@pytest.fixture
def mock_agents() -> MagicMock:
    """Mock BookWritingAgents for testing."""
    agents = MagicMock()
    agents.generate_concepts = AsyncMock(
        return_value={
            "concepts": "Test concepts for book generation",
            "themes": ["adventure", "growth"],
            "tone": "engaging",
        }
    )
    agents.generate_outline = AsyncMock(
        return_value={
            "chapters": [
                {"number": 1, "title": "The Beginning", "summary": "Introduction"},
                {"number": 2, "title": "The Journey", "summary": "Development"},
            ]
        }
    )
    agents.write_chapter = AsyncMock(
        return_value={
            "content": "Chapter content goes here...",
            "word_count": 3000,
        }
    )
    agents.edit_content = AsyncMock(
        return_value={
            "edited_content": "Edited chapter content...",
            "changes": ["Fixed grammar", "Improved pacing"],
        }
    )
    agents.check_continuity = AsyncMock(
        return_value={
            "inconsistencies": [],
            "suggestions": [],
            "timeline_issues": [],
            "character_issues": [],
            "confidence_score": 0.95,
        }
    )
    return agents


# =============================================================================
# Test Clients
# =============================================================================


@pytest_asyncio.fixture
async def async_client(
    mock_cache: MagicMock,
) -> AsyncGenerator[AsyncClient, None]:
    """Create async test client with mocked dependencies."""
    from app.main import app

    with (
        patch("app.main.init_db", new_callable=AsyncMock),
        patch("app.main.close_db", new_callable=AsyncMock),
        patch("app.main.cache", mock_cache),
        patch("app.db.engine", new_callable=AsyncMock),
        patch("app.db.AsyncSessionLocal", new_callable=AsyncMock),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


@pytest_asyncio.fixture
async def authenticated_client(
    async_client: AsyncClient,
    db_session: AsyncSession,
    user_factory: Callable,
) -> AsyncGenerator[tuple[AsyncClient, UserModel], None]:
    """Create authenticated test client with a test user."""
    user = await user_factory()

    with patch("app.security.verify_token") as mock_verify:
        mock_verify.return_value = MagicMock(
            user_id=str(user.id),
            email=user.email,
            role=user.role,
        )
        yield async_client, user


@pytest.fixture
def mock_token() -> MagicMock:
    """Mock JWT token verification."""
    with patch("app.security.verify_token") as mock:
        mock.return_value = MagicMock(
            user_id=str(uuid4()),
            project_id=str(uuid4()),
            role="author",
        )
        yield mock


# =============================================================================
# SSE Testing Utilities
# =============================================================================


class SSEEventCollector:
    """Helper class for collecting and parsing SSE events."""

    def __init__(self):
        self.events: list[dict] = []
        self.tokens: list[str] = []
        self.checkpoints: list[dict] = []
        self.errors: list[dict] = []
        self.complete: dict | None = None

    def add_event(self, event_data: dict):
        """Add an event and categorize it."""
        self.events.append(event_data)
        event_type = event_data.get("event", "")

        if event_type == "token":
            self.tokens.append(event_data.get("data", ""))
        elif event_type == "checkpoint":
            import json

            self.checkpoints.append(json.loads(event_data.get("data", "{}")))
        elif event_type == "error":
            import json

            self.errors.append(json.loads(event_data.get("data", "{}")))
        elif event_type == "complete":
            import json

            self.complete = json.loads(event_data.get("data", "{}"))

    @property
    def full_content(self) -> str:
        """Get concatenated token content."""
        return "".join(self.tokens)

    @property
    def has_errors(self) -> bool:
        """Check if any errors occurred."""
        return len(self.errors) > 0

    @property
    def is_complete(self) -> bool:
        """Check if stream completed successfully."""
        return self.complete is not None


@pytest.fixture
def sse_collector() -> SSEEventCollector:
    """Create SSE event collector for testing streaming endpoints."""
    return SSEEventCollector()


# =============================================================================
# Test Data Helpers
# =============================================================================


@pytest.fixture
def sample_book_brief() -> str:
    """Sample book brief for testing."""
    return """
    A thrilling adventure story about a young archaeologist who discovers
    an ancient map leading to a lost civilization. Along the way, she must
    navigate treacherous jungles, solve ancient puzzles, and confront a
    rival expedition team who will stop at nothing to claim the treasure
    for themselves. Themes of perseverance, friendship, and the ethics of
    archaeological discovery.
    """


@pytest.fixture
def sample_outline() -> dict:
    """Sample book outline for testing."""
    return {
        "title": "The Lost Temple",
        "logline": "An archaeologist races to find a lost civilization before rivals can exploit it.",
        "synopsis": "Dr. Maya Chen discovers an ancient map...",
        "themes": ["adventure", "ethics", "friendship"],
        "chapters": [
            {
                "number": 1,
                "title": "The Discovery",
                "summary": "Maya finds the ancient map in her grandmother's belongings.",
                "key_events": ["Map discovery", "Decision to investigate"],
                "characters_involved": ["Maya Chen", "Professor Williams"],
                "emotional_arc": "curiosity building",
                "setting": "University office",
                "estimated_word_count": 3500,
            },
            {
                "number": 2,
                "title": "Into the Jungle",
                "summary": "Maya assembles a team and begins the expedition.",
                "key_events": ["Team assembly", "Journey begins", "First obstacle"],
                "characters_involved": ["Maya Chen", "Jake Torres", "Dr. Amara"],
                "emotional_arc": "excitement and tension",
                "setting": "Amazon rainforest",
                "estimated_word_count": 4000,
            },
        ],
        "estimated_total_words": 75000,
    }


@pytest.fixture
def sample_chapter_content() -> str:
    """Sample chapter content for testing."""
    return """
    Chapter 1: The Discovery

    The dusty box had sat in Maya Chen's attic for thirty years, forgotten
    among her grandmother's belongings. Now, as she sorted through the last
    of the estate, her fingers brushed against something unexpected—a folded
    piece of leather, brittle with age.

    "What's this?" she murmured, carefully extracting the object.

    As she unfolded it, her breath caught. Before her lay a map, hand-drawn
    with meticulous detail, showing a region of the Amazon she knew well
    from her research. But this map showed something that shouldn't exist—
    a city where modern surveys showed only jungle.

    Her heart raced as she traced the faded ink lines. This couldn't be real.
    And yet...

    "Grandmother," she whispered to the empty room, "what secrets were you
    keeping?"
    """


# =============================================================================
# Cleanup Helpers
# =============================================================================


@pytest.fixture(autouse=True)
def reset_singletons():
    """Reset any singletons between tests."""
    yield
    # Add any singleton reset logic here if needed


@pytest.fixture
def temp_env_vars():
    """Context manager for temporary environment variables."""
    original_env = os.environ.copy()

    def _set_env(**kwargs):
        for key, value in kwargs.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    yield _set_env

    os.environ.clear()
    os.environ.update(original_env)
