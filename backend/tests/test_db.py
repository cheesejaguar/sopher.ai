"""Tests for database connection and session management.

Tests cover:
- Database initialization
- Session management
- Connection health checks
- Exception handling
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestDatabaseConfiguration:
    """Tests for database configuration."""

    def test_default_database_url(self):
        """Test default DATABASE_URL."""
        with patch.dict("os.environ", {}, clear=True):
            import importlib

            import app.db

            importlib.reload(app.db)
            assert "postgresql" in app.db.DATABASE_URL
            assert "localhost" in app.db.DATABASE_URL

    def test_custom_database_url(self):
        """Test custom DATABASE_URL from environment."""
        with patch.dict("os.environ", {"DATABASE_URL": "postgresql+asyncpg://custom:5432/testdb"}):
            import importlib

            import app.db

            importlib.reload(app.db)
            assert "custom" in app.db.DATABASE_URL

            # Restore
            importlib.reload(app.db)

    def test_sql_echo_disabled_by_default(self):
        """Test SQL echo is disabled by default."""
        with patch.dict("os.environ", {}, clear=True):
            import importlib

            import app.db

            importlib.reload(app.db)
            # Engine echo should be False by default
            assert app.db.engine.echo is False


class TestGetDbSession:
    """Tests for get_db session generator."""

    @pytest.mark.asyncio
    async def test_get_db_yields_session(self):
        """Test that get_db yields a session."""
        mock_session = AsyncMock()
        mock_session.close = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=None)

        with patch("app.db.AsyncSessionLocal", mock_session_factory):
            from app.db import get_db

            async for session in get_db():
                assert session is mock_session

    @pytest.mark.asyncio
    async def test_get_db_rollback_on_exception(self):
        """Test that get_db rolls back on exception."""
        mock_session = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.close = AsyncMock()

        # Create a proper async context manager
        class MockContextManager:
            async def __aenter__(self):
                return mock_session

            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass

        mock_session_factory = MagicMock(return_value=MockContextManager())

        with patch("app.db.AsyncSessionLocal", mock_session_factory):
            from app.db import get_db

            gen = get_db()
            session = await gen.__anext__()
            assert session is mock_session

            # Simulate exception
            try:
                await gen.athrow(ValueError("Test error"))
            except ValueError:
                pass

            mock_session.rollback.assert_called_once()


class TestInitDb:
    """Tests for init_db function."""

    @pytest.mark.asyncio
    async def test_init_db_creates_tables(self):
        """Test that init_db creates database tables."""
        mock_conn = AsyncMock()
        mock_conn.run_sync = AsyncMock()

        mock_engine = AsyncMock()
        mock_engine.begin = MagicMock(return_value=AsyncMock())
        mock_engine.begin.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_engine.begin.return_value.__aexit__ = AsyncMock(return_value=None)

        with patch("app.db.engine", mock_engine):
            from app.db import init_db

            await init_db()

            mock_conn.run_sync.assert_called_once()


class TestCloseDb:
    """Tests for close_db function."""

    @pytest.mark.asyncio
    async def test_close_db_disposes_engine(self):
        """Test that close_db disposes the engine."""
        mock_engine = AsyncMock()
        mock_engine.dispose = AsyncMock()

        with patch("app.db.engine", mock_engine):
            from app.db import close_db

            await close_db()

            mock_engine.dispose.assert_called_once()


class TestCheckDbHealth:
    """Tests for check_db_health function."""

    @pytest.mark.asyncio
    async def test_check_db_health_success(self):
        """Test successful database health check."""
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock()

        class MockContextManager:
            async def __aenter__(self):
                return mock_session

            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass

        mock_session_factory = MagicMock(return_value=MockContextManager())

        with patch("app.db.AsyncSessionLocal", mock_session_factory):
            from app.db import check_db_health

            result = await check_db_health()

            assert result is True
            mock_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_check_db_health_failure(self):
        """Test database health check failure."""
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=Exception("Connection failed"))

        class MockContextManager:
            async def __aenter__(self):
                return mock_session

            async def __aexit__(self, exc_type, exc_val, exc_tb):
                return False

        mock_session_factory = MagicMock(return_value=MockContextManager())

        with patch("app.db.AsyncSessionLocal", mock_session_factory):
            from app.db import check_db_health

            with pytest.raises(Exception) as exc_info:
                await check_db_health()

            assert "Connection failed" in str(exc_info.value)
