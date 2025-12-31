"""Tests for authentication and authorization"""

from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.main import app
from app.security import ALGORITHM, SECRET_KEY, create_access_token


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def valid_access_token():
    """Create a valid access token for testing"""
    token_data = {
        "user_id": "test-user-id",
        "email": "test@example.com",
        "role": "author",
    }
    return create_access_token(token_data)


def test_auth_me_without_auth(client):
    """Test /auth/me endpoint without authentication"""
    response = client.get("/auth/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    # Error format includes error_code
    json_response = response.json()
    assert "Not authenticated" in str(json_response)


@pytest.mark.skip(
    reason="Requires database connection; skipping in CI environment without PostgreSQL"
)
@patch("app.routers.auth.get_db")
def test_auth_me_with_bearer_token(mock_db, client, valid_access_token):
    """Test /auth/me endpoint with Bearer token authentication"""
    # Mock database session and user
    mock_session = MagicMock()
    mock_db.return_value.__aenter__.return_value = mock_session

    # Mock user query result
    mock_user = MagicMock()
    mock_user.id = "test-user-id"
    mock_user.email = "test@example.com"
    mock_user.name = "Test User"
    mock_user.picture = "https://example.com/picture.jpg"
    mock_user.role = "author"

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_user
    mock_session.execute.return_value = mock_result

    # Make request with Bearer token
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {valid_access_token}"})

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == "test-user-id"
    assert data["email"] == "test@example.com"
    assert data["name"] == "Test User"
    assert data["role"] == "author"


@pytest.mark.skip(
    reason="Requires database connection; skipping in CI environment without PostgreSQL"
)
def test_auth_me_with_cookie(client, valid_access_token):
    """Test /auth/me endpoint with cookie authentication"""
    with patch("app.routers.auth.get_db") as mock_db:
        # Mock database session and user
        mock_session = MagicMock()
        mock_db.return_value.__aenter__.return_value = mock_session

        # Mock user query result
        mock_user = MagicMock()
        mock_user.id = "test-user-id"
        mock_user.email = "test@example.com"
        mock_user.name = "Test User"
        mock_user.picture = "https://example.com/picture.jpg"
        mock_user.role = "author"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_session.execute.return_value = mock_result

        # Make request with cookie
        response = client.get("/auth/me", cookies={"access_token": valid_access_token})

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == "test-user-id"
        assert data["email"] == "test@example.com"


def test_get_current_user_with_invalid_token(client):
    """Test authentication with invalid token"""
    invalid_token = "invalid.token.here"
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {invalid_token}"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    # Error format includes error_code
    json_response = response.json()
    assert "Could not validate credentials" in str(json_response)


def test_get_current_user_with_expired_token(client):
    """Test authentication with expired token"""
    from datetime import datetime, timedelta

    # Create an expired token
    expired_data = {
        "user_id": "test-user-id",
        "exp": datetime.utcnow() - timedelta(hours=1),
        "type": "access",
    }
    expired_token = jwt.encode(expired_data, SECRET_KEY, algorithm=ALGORITHM)

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_logout_endpoint(client):
    """Test logout endpoint clears cookies"""
    response = client.post("/auth/logout")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["message"] == "Logged out successfully"

    # Check that cookies are cleared
    for cookie in response.cookies.values():
        if cookie.key in ["access_token", "refresh_token"]:
            assert cookie.value == '""'  # Cookie should be cleared


@pytest.mark.skip(
    reason="Requires database connection; skipping in CI environment without PostgreSQL"
)
@patch("app.routers.auth.exchange_code_for_token")
@patch("app.routers.auth.validate_oauth_state")
@patch("app.routers.auth.get_db")
def test_google_callback_creates_new_user(mock_db, mock_validate, mock_exchange, client):
    """Test Google OAuth callback creates new user"""
    # Mock OAuth state validation
    mock_validate.return_value = "mock-verifier"

    # Mock token exchange
    mock_exchange.return_value = (
        {"access_token": "google-token"},
        {
            "sub": "google-sub-123",
            "email": "newuser@example.com",
            "name": "New User",
            "picture": "https://example.com/pic.jpg",
        },
    )

    # Mock database session
    mock_session = MagicMock()
    mock_db.return_value.__aenter__.return_value = mock_session

    # Mock user not found (new user)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    # Mock the new user object that gets created
    mock_new_user = MagicMock()
    mock_new_user.id = "new-user-id"
    mock_new_user.email = "newuser@example.com"
    mock_new_user.role = "author"

    # Mock refresh to return the new user
    def refresh_side_effect(user):
        user.id = "new-user-id"
        user.email = "newuser@example.com"
        user.role = "author"

    mock_session.refresh.side_effect = refresh_side_effect

    # Make callback request
    response = client.get("/auth/callback/google?code=test-code&state=test-state")

    # Should redirect to frontend
    assert response.status_code == status.HTTP_302_FOUND
    assert response.headers["location"] in ["http://localhost:3000", "https://sopher.ai"]

    # Verify user was added to session
    assert mock_session.add.called


@patch("app.routers.auth.check_oauth_rate_limit", new_callable=lambda: MagicMock(return_value=None))
@patch("app.routers.auth.validate_oauth_state")
def test_google_callback_invalid_state(mock_validate, mock_rate_limit, client):
    """Test Google OAuth callback with invalid state"""

    # Mock rate limit check to be a no-op async function
    async def noop(*args, **kwargs):
        pass

    mock_rate_limit.side_effect = noop

    # Mock invalid state - need to return an awaitable since it's an async function
    async def return_none(*args, **kwargs):
        return None

    mock_validate.side_effect = return_none

    response = client.get("/auth/callback/google?code=test-code&state=invalid-state")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    # Error format includes error_code
    json_response = response.json()
    assert "Invalid or expired state parameter" in str(json_response)


class TestAuthEndpoints:
    """Additional tests for authentication endpoints."""

    def test_oauth_config_status(self, client):
        """Test OAuth configuration status endpoint."""
        response = client.get("/auth/config/status")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "google_oauth_configured" in data
        assert "client_id_set" in data
        assert "client_secret_set" in data
        assert "redirect_uri" in data
        assert "message" in data

    def test_verify_auth_without_cookies(self, client):
        """Test verify endpoint without authentication cookies."""
        response = client.get("/auth/verify")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["authenticated"] is False
        assert data["has_access_token"] is False
        assert data["has_refresh_token"] is False

    def test_verify_auth_with_access_token_cookie(self, client, valid_access_token):
        """Test verify endpoint with access token cookie."""
        response = client.get(
            "/auth/verify",
            cookies={"access_token": valid_access_token},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["authenticated"] is True
        assert data["has_access_token"] is True

    def test_google_callback_head_request(self, client):
        """Test HEAD request to OAuth callback (for health checks)."""
        response = client.head("/auth/callback/google")
        assert response.status_code == status.HTTP_200_OK

    @patch("app.routers.auth.check_oauth_rate_limit")
    def test_google_callback_with_oauth_error(self, mock_rate_limit, client):
        """Test callback handling of OAuth error from Google."""
        from unittest.mock import AsyncMock

        mock_rate_limit.return_value = None
        mock_rate_limit.side_effect = AsyncMock(return_value=None)

        response = client.get(
            "/auth/callback/google?error=access_denied&error_description=User+denied+access",
            follow_redirects=False,
        )
        # Should redirect to frontend with error
        assert response.status_code == status.HTTP_302_FOUND
        assert "oauth=error" in response.headers["location"]

    @patch("app.routers.auth.check_oauth_rate_limit")
    def test_google_callback_missing_code(self, mock_rate_limit, client):
        """Test callback with missing authorization code."""
        from unittest.mock import AsyncMock

        mock_rate_limit.return_value = None
        mock_rate_limit.side_effect = AsyncMock(return_value=None)

        response = client.get("/auth/callback/google?state=test-state", follow_redirects=False)
        # Should redirect to frontend with missing_parameters error
        assert response.status_code == status.HTTP_302_FOUND
        assert "missing_parameters" in response.headers["location"]

    @patch("app.routers.auth.check_oauth_rate_limit")
    def test_google_callback_missing_state(self, mock_rate_limit, client):
        """Test callback with missing state parameter."""
        from unittest.mock import AsyncMock

        mock_rate_limit.return_value = None
        mock_rate_limit.side_effect = AsyncMock(return_value=None)

        response = client.get("/auth/callback/google?code=test-code", follow_redirects=False)
        # Should redirect to frontend with missing_parameters error
        assert response.status_code == status.HTTP_302_FOUND
        assert "missing_parameters" in response.headers["location"]


class TestFrontendURLHelper:
    """Tests for the _get_frontend_url helper function."""

    def test_localhost_detection(self):
        """Test localhost URL detection."""
        from unittest.mock import MagicMock

        from app.routers.auth import _get_frontend_url

        # Test localhost
        request = MagicMock()
        request.headers = {"host": "localhost:3000"}
        result = _get_frontend_url(request)
        assert result == "http://localhost:3000/"

    def test_localhost_default_port(self):
        """Test localhost without port uses default."""
        from unittest.mock import MagicMock

        from app.routers.auth import _get_frontend_url

        request = MagicMock()
        request.headers = {"host": "localhost"}
        result = _get_frontend_url(request)
        assert result == "http://localhost:3000/"

    def test_production_detection(self):
        """Test production URL detection."""
        from unittest.mock import MagicMock

        from app.routers.auth import _get_frontend_url

        request = MagicMock()
        request.headers = {"host": "api.sopher.ai"}
        result = _get_frontend_url(request)
        assert result == "https://sopher.ai/"

    def test_unrecognized_host(self):
        """Test unrecognized host falls back to production."""
        from unittest.mock import MagicMock

        from app.routers.auth import _get_frontend_url

        request = MagicMock()
        request.headers = {"host": "unknown.example.com"}
        result = _get_frontend_url(request)
        assert result == "https://sopher.ai/"

    def test_no_host_header(self):
        """Test missing host header falls back to production."""
        from unittest.mock import MagicMock

        from app.routers.auth import _get_frontend_url

        request = MagicMock()
        request.headers = {}
        result = _get_frontend_url(request)
        assert result == "https://sopher.ai/"

    def test_invalid_port_number(self):
        """Test invalid port falls back to default localhost."""
        from unittest.mock import MagicMock

        from app.routers.auth import _get_frontend_url

        request = MagicMock()
        request.headers = {"host": "localhost:invalid"}
        result = _get_frontend_url(request)
        assert result == "http://localhost:3000/"

    def test_port_out_of_range(self):
        """Test port out of valid range falls back to default."""
        from unittest.mock import MagicMock

        from app.routers.auth import _get_frontend_url

        request = MagicMock()
        request.headers = {"host": "localhost:99999"}
        result = _get_frontend_url(request)
        assert result == "http://localhost:3000/"

    def test_127_0_0_1_host(self):
        """Test 127.0.0.1 is treated as localhost."""
        from unittest.mock import MagicMock

        from app.routers.auth import _get_frontend_url

        request = MagicMock()
        request.headers = {"host": "127.0.0.1:3000"}
        result = _get_frontend_url(request)
        assert result == "http://localhost:3000/"
