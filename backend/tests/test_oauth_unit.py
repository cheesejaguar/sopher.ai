"""Simplified unit tests for OAuth implementation."""

import base64
import hashlib
from unittest.mock import patch

import pytest
from fastapi import Request, Response

from app.oauth import (
    clear_auth_cookies,
    generate_pkce_challenge,
    generate_state,
    set_auth_cookies,
    store_oauth_state,
    validate_oauth_state,
)


class TestOAuthCore:
    """Test core OAuth functionality."""

    def test_generate_state(self):
        """Test state generation for CSRF protection."""
        state = generate_state()

        # Should be a random string
        assert isinstance(state, str)
        assert len(state) > 20

        # Should be unique
        state2 = generate_state()
        assert state != state2

    def test_generate_pkce_challenge(self):
        """Test PKCE challenge generation."""
        verifier, challenge = generate_pkce_challenge()

        # Verify verifier format
        assert isinstance(verifier, str)
        assert 43 <= len(verifier) <= 128

        # Verify challenge is base64url encoded SHA256
        expected = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            .decode()
            .rstrip("=")
        )
        assert challenge == expected

    def test_set_auth_cookies_localhost(self):
        """Test cookie setting for localhost."""
        response = Response()
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/",
            "query_string": b"",
            "headers": [],
            "server": ("localhost", 3000),
        }
        request = Request(scope)

        set_auth_cookies(response, "access_token", "refresh_token", request)

        cookies = response.headers.getlist("set-cookie")
        assert len(cookies) == 2

        # Check no domain is set for localhost
        for cookie in cookies:
            assert "Domain=" not in cookie

    def test_set_auth_cookies_production(self):
        """Test cookie setting for production domain."""
        response = Response()
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/",
            "query_string": b"",
            "headers": [(b"x-forwarded-host", b"app.sopher.ai"), (b"x-forwarded-proto", b"https")],
            "server": ("backend", 8000),
        }
        request = Request(scope)

        with patch.dict("os.environ", {"ENV": "production"}):
            set_auth_cookies(response, "access_token", "refresh_token", request)

        cookies = response.headers.getlist("set-cookie")

        # Check domain is set correctly
        for cookie in cookies:
            if "access_token" in cookie or "refresh_token" in cookie:
                assert "Domain=sopher.ai" in cookie
                assert "Secure" in cookie

    def test_clear_auth_cookies(self):
        """Test cookie clearing."""
        response = Response()
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/",
            "query_string": b"",
            "headers": [],
            "server": ("localhost", 3000),
        }
        request = Request(scope)

        clear_auth_cookies(response, request)

        cookies = response.headers.getlist("set-cookie")
        assert len(cookies) == 2

        # Check cookies are cleared (max_age=0)
        for cookie in cookies:
            assert "Max-Age=0" in cookie or "max-age=0" in cookie


class TestOAuthStateManagement:
    """Tests for OAuth state storage and validation."""

    @pytest.mark.asyncio
    async def test_store_oauth_state(self):
        """Test storing OAuth state."""
        from unittest.mock import AsyncMock, patch

        mock_cache = AsyncMock()
        mock_cache.set = AsyncMock()

        with patch("app.oauth.cache", mock_cache):
            await store_oauth_state("test-state", "test-verifier")

            mock_cache.set.assert_called_once()
            call_args = mock_cache.set.call_args
            assert "oauth:state:test-state" in call_args[0][0]
            assert call_args[0][1] == {"verifier": "test-verifier"}
            assert call_args[1]["ttl"] == 600

    @pytest.mark.asyncio
    async def test_validate_oauth_state_success(self):
        """Test successful OAuth state validation."""
        from unittest.mock import AsyncMock, patch

        mock_cache = AsyncMock()
        mock_cache.get = AsyncMock(return_value={"verifier": "test-verifier"})
        mock_cache.delete = AsyncMock()

        with patch("app.oauth.cache", mock_cache):
            result = await validate_oauth_state("test-state")

            assert result == "test-verifier"
            mock_cache.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_validate_oauth_state_not_found(self):
        """Test OAuth state validation when state not found."""
        from unittest.mock import AsyncMock, patch

        mock_cache = AsyncMock()
        mock_cache.get = AsyncMock(return_value=None)

        with patch("app.oauth.cache", mock_cache):
            result = await validate_oauth_state("nonexistent-state")

            assert result is None

    @pytest.mark.asyncio
    async def test_validate_oauth_state_no_verifier(self):
        """Test OAuth state validation when verifier missing."""
        from unittest.mock import AsyncMock, patch

        mock_cache = AsyncMock()
        mock_cache.get = AsyncMock(return_value={"other": "data"})
        mock_cache.delete = AsyncMock()

        with patch("app.oauth.cache", mock_cache):
            result = await validate_oauth_state("test-state")

            assert result is None

    @pytest.mark.asyncio
    async def test_validate_oauth_state_exception(self):
        """Test OAuth state validation handles exceptions."""
        from unittest.mock import AsyncMock, patch

        mock_cache = AsyncMock()
        mock_cache.get = AsyncMock(side_effect=Exception("Redis error"))

        with patch("app.oauth.cache", mock_cache):
            with pytest.raises(Exception) as exc_info:
                await validate_oauth_state("test-state")

            assert "Redis error" in str(exc_info.value)


class TestGoogleOAuthClient:
    """Tests for Google OAuth client creation."""

    def test_get_google_oauth_client_no_credentials(self):
        """Test client creation fails without credentials."""
        from fastapi import HTTPException

        with patch.dict("os.environ", {"GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": ""}):
            # Need to reimport to pick up empty env vars
            import importlib

            import app.oauth

            importlib.reload(app.oauth)

            with pytest.raises(HTTPException) as exc_info:
                app.oauth.get_google_oauth_client()

            assert exc_info.value.status_code == 500
            assert "not configured" in exc_info.value.detail

            # Restore
            importlib.reload(app.oauth)

    def test_get_google_auth_url(self):
        """Test generating Google auth URL."""
        with patch.dict(
            "os.environ",
            {
                "GOOGLE_CLIENT_ID": "test-client-id",
                "GOOGLE_CLIENT_SECRET": "test-secret",
            },
        ):
            import importlib

            import app.oauth

            importlib.reload(app.oauth)

            url = app.oauth.get_google_auth_url("test-state", "test-challenge")

            assert "https://accounts.google.com" in url
            assert "test-state" in url
            assert "test-challenge" in url
            assert "response_type=code" in url

            importlib.reload(app.oauth)


class TestCookieSettings:
    """Additional tests for cookie settings."""

    def test_set_auth_cookies_127_0_0_1(self):
        """Test cookie setting for 127.0.0.1."""
        response = Response()
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/",
            "query_string": b"",
            "headers": [(b"host", b"127.0.0.1:3000")],
            "server": ("127.0.0.1", 3000),
        }
        request = Request(scope)

        set_auth_cookies(response, "access_token", "refresh_token", request)

        cookies = response.headers.getlist("set-cookie")
        assert len(cookies) == 2

        # Check no domain is set for 127.0.0.1
        for cookie in cookies:
            assert "Domain=" not in cookie
            # Should not be secure for localhost
            assert "Secure" not in cookie

    def test_clear_auth_cookies_production(self):
        """Test cookie clearing for production domain."""
        response = Response()
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/",
            "query_string": b"",
            "headers": [
                (b"host", b"api.sopher.ai"),
                (b"x-forwarded-proto", b"https"),
            ],
            "server": ("backend", 8000),
        }
        request = Request(scope)

        clear_auth_cookies(response, request)

        cookies = response.headers.getlist("set-cookie")
        assert len(cookies) == 2

        # Check cookies are cleared with correct domain
        for cookie in cookies:
            assert "Max-Age=0" in cookie or "max-age=0" in cookie
            assert "Domain=sopher.ai" in cookie
