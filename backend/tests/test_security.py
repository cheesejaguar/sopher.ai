"""Tests for security module - JWT tokens and encryption.

Tests cover:
- JWT token creation and verification
- Token expiration
- Role-based access
- Encrypted API keys
"""

from datetime import datetime, timedelta

import jwt
import pytest
from fastapi import HTTPException

from app.security import (
    ALGORITHM,
    SECRET_KEY,
    TokenData,
    create_access_token,
    create_refresh_token,
    verify_token,
)


class TestTokenCreation:
    """Tests for JWT token creation."""

    def test_create_access_token(self):
        """Test creating a valid access token."""
        data = {
            "user_id": "test-user-123",
            "email": "test@example.com",
            "role": "author",
        }

        token = create_access_token(data)

        assert isinstance(token, str)
        assert len(token) > 0
        # Should be a valid JWT (3 parts separated by dots)
        assert token.count(".") == 2

    def test_access_token_contains_user_data(self):
        """Test that access token contains user data."""
        data = {
            "user_id": "test-user-123",
            "email": "test@example.com",
            "role": "admin",
        }

        token = create_access_token(data)
        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        assert decoded["user_id"] == "test-user-123"
        assert decoded["email"] == "test@example.com"
        assert decoded["role"] == "admin"

    def test_access_token_has_expiration(self):
        """Test that access token has expiration."""
        data = {"user_id": "test-user"}
        token = create_access_token(data)
        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        assert "exp" in decoded
        # Expiration should be in the future
        exp_time = datetime.utcfromtimestamp(decoded["exp"])
        assert exp_time > datetime.utcnow()

    def test_access_token_type_is_access(self):
        """Test that access token has type 'access'."""
        data = {"user_id": "test-user"}
        token = create_access_token(data)
        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        assert decoded.get("type") == "access"

    def test_create_refresh_token(self):
        """Test creating a valid refresh token."""
        data = {"user_id": "test-user-123"}
        token = create_refresh_token(data)

        assert isinstance(token, str)
        assert len(token) > 0

    def test_refresh_token_type_is_refresh(self):
        """Test that refresh token has type 'refresh'."""
        data = {"user_id": "test-user"}
        token = create_refresh_token(data)
        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        assert decoded.get("type") == "refresh"

    def test_refresh_token_longer_expiry(self):
        """Test that refresh token has longer expiry than access token."""
        data = {"user_id": "test-user"}
        access_token = create_access_token(data)
        refresh_token = create_refresh_token(data)

        access_decoded = jwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM])
        refresh_decoded = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])

        assert refresh_decoded["exp"] > access_decoded["exp"]


class TestTokenVerification:
    """Tests for JWT token verification."""

    def test_verify_valid_token(self):
        """Test verifying a valid token."""
        data = {
            "user_id": "test-user-123",
            "email": "test@example.com",
            "role": "author",
        }
        token = create_access_token(data)

        result = verify_token(token)

        assert isinstance(result, TokenData)
        assert result.user_id == "test-user-123"

    def test_verify_invalid_token_raises(self):
        """Test that invalid token raises exception."""
        with pytest.raises(HTTPException) as exc_info:
            verify_token("invalid.token.here")

        assert exc_info.value.status_code == 401

    def test_verify_expired_token_raises(self):
        """Test that expired token raises exception."""
        data = {
            "user_id": "test-user",
            "exp": datetime.utcnow() - timedelta(hours=1),
            "type": "access",
        }
        expired_token = jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)

        with pytest.raises(HTTPException) as exc_info:
            verify_token(expired_token)

        assert exc_info.value.status_code == 401

    def test_verify_tampered_token_raises(self):
        """Test that tampered token raises exception."""
        data = {"user_id": "test-user"}
        token = create_access_token(data)

        # Tamper with the token
        parts = token.split(".")
        parts[1] = parts[1][::-1]  # Reverse the payload
        tampered_token = ".".join(parts)

        with pytest.raises(HTTPException):
            verify_token(tampered_token)

    def test_verify_wrong_secret_raises(self):
        """Test that token signed with wrong secret raises exception."""
        data = {"user_id": "test-user", "exp": datetime.utcnow() + timedelta(hours=1)}
        wrong_secret_token = jwt.encode(data, "wrong-secret", algorithm=ALGORITHM)

        with pytest.raises(HTTPException):
            verify_token(wrong_secret_token)


class TestTokenData:
    """Tests for TokenData model."""

    def test_token_data_fields(self):
        """Test TokenData has expected fields."""
        token_data = TokenData(
            user_id="user-123",
            role="admin",
            project_id="project-456",
        )

        assert token_data.user_id == "user-123"
        assert token_data.role == "admin"
        assert token_data.project_id == "project-456"

    def test_token_data_optional_fields(self):
        """Test that TokenData optional fields have defaults."""
        token_data = TokenData(user_id="user-123")

        assert token_data.user_id == "user-123"
        assert token_data.role == "author"  # Default role
        assert token_data.project_id is None

    def test_token_data_extra_kwargs(self):
        """Test that TokenData accepts extra kwargs."""
        token_data = TokenData(
            user_id="user-123",
            email="test@example.com",
            custom_field="value",
        )

        assert token_data.user_id == "user-123"
        assert token_data.extra.get("email") == "test@example.com"
        assert token_data.extra.get("custom_field") == "value"


class TestSecurityConfiguration:
    """Tests for security configuration requirements."""

    def test_secret_key_required(self):
        """Test that JWT_SECRET is required."""
        # The module already enforces this at import time
        # We verify by checking that SECRET_KEY is not empty
        assert SECRET_KEY is not None
        assert len(SECRET_KEY) > 0

    def test_algorithm_is_hs256(self):
        """Test that algorithm is HS256."""
        assert ALGORITHM == "HS256"


class TestTokenRoles:
    """Tests for role-based token functionality."""

    def test_token_with_admin_role(self):
        """Test token with admin role."""
        data = {"user_id": "admin-user", "role": "admin"}
        token = create_access_token(data)
        result = verify_token(token)

        assert result.role == "admin"

    def test_token_with_author_role(self):
        """Test token with author role."""
        data = {"user_id": "author-user", "role": "author"}
        token = create_access_token(data)
        result = verify_token(token)

        assert result.role == "author"

    def test_token_without_role_gets_default(self):
        """Test token without role gets default 'author'."""
        data = {"user_id": "user-no-role"}
        token = create_access_token(data)
        result = verify_token(token)

        assert result.user_id == "user-no-role"
        assert result.role == "author"  # Default role


class TestTokenEdgeCases:
    """Tests for edge cases in token handling."""

    def test_empty_token_raises(self):
        """Test that empty token raises exception."""
        with pytest.raises(HTTPException):
            verify_token("")

    def test_none_token_raises(self):
        """Test that None token raises exception."""
        with pytest.raises((HTTPException, TypeError)):
            verify_token(None)

    def test_token_with_special_characters(self):
        """Test token with special characters in user data."""
        data = {
            "user_id": "user-with-üñíçödé",
            "email": "tëst@exämple.com",
        }
        token = create_access_token(data)
        result = verify_token(token)

        assert "üñíçödé" in result.user_id

    def test_token_with_very_long_user_id(self):
        """Test token with very long user id."""
        long_user_id = "u" * 1000
        data = {"user_id": long_user_id}
        token = create_access_token(data)
        result = verify_token(token)

        assert result.user_id == long_user_id


class TestTokenTypeValidation:
    """Tests for token type validation."""

    def test_verify_access_token_with_refresh_type_fails(self):
        """Test that verifying access token with refresh type fails."""
        data = {"user_id": "test-user"}
        access_token = create_access_token(data)

        # Try to verify as refresh token
        with pytest.raises(HTTPException) as exc_info:
            verify_token(access_token, token_type="refresh")

        assert exc_info.value.status_code == 401
        assert "Invalid token type" in exc_info.value.detail

    def test_verify_refresh_token_with_access_type_fails(self):
        """Test that verifying refresh token with access type fails."""
        data = {"user_id": "test-user"}
        refresh_token = create_refresh_token(data)

        # Try to verify as access token (default)
        with pytest.raises(HTTPException) as exc_info:
            verify_token(refresh_token, token_type="access")

        assert exc_info.value.status_code == 401
        assert "Invalid token type" in exc_info.value.detail

    def test_verify_refresh_token_as_refresh(self):
        """Test verifying refresh token with correct type."""
        data = {"user_id": "test-user"}
        refresh_token = create_refresh_token(data)

        result = verify_token(refresh_token, token_type="refresh")
        assert result.user_id == "test-user"


class TestApiKeyEncryption:
    """Tests for API key encryption and decryption."""

    def test_encrypt_api_key(self):
        """Test encrypting API key."""
        from app.security import encrypt_api_key

        api_key = "sk-test-key-12345"
        encrypted = encrypt_api_key(api_key)

        assert encrypted != api_key
        assert isinstance(encrypted, str)
        assert len(encrypted) > 0

    def test_decrypt_api_key(self):
        """Test decrypting API key."""
        from app.security import decrypt_api_key, encrypt_api_key

        original_key = "sk-test-key-67890"
        encrypted = encrypt_api_key(original_key)
        decrypted = decrypt_api_key(encrypted)

        assert decrypted == original_key

    def test_encrypt_decrypt_roundtrip(self):
        """Test encrypting and decrypting preserves original value."""
        from app.security import decrypt_api_key, encrypt_api_key

        keys = [
            "sk-short",
            "sk-" + "a" * 100,
            "sk-special-!@#$%^&*()",
            "sk-unicode-üñíçödé",
        ]

        for original in keys:
            encrypted = encrypt_api_key(original)
            decrypted = decrypt_api_key(encrypted)
            assert decrypted == original

    def test_hash_api_key_id(self):
        """Test hashing API key for identification."""
        from app.security import hash_api_key_id

        api_key = "sk-test-key-12345"
        hash1 = hash_api_key_id(api_key)
        hash2 = hash_api_key_id(api_key)

        # Same input should give same hash
        assert hash1 == hash2
        # Hash should be 64 character hex (SHA-256)
        assert len(hash1) == 64
        assert all(c in "0123456789abcdef" for c in hash1)

    def test_different_keys_different_hashes(self):
        """Test that different keys have different hashes."""
        from app.security import hash_api_key_id

        hash1 = hash_api_key_id("sk-key-1")
        hash2 = hash_api_key_id("sk-key-2")

        assert hash1 != hash2


class TestGetCurrentAdmin:
    """Tests for admin access verification."""

    @pytest.mark.asyncio
    async def test_get_current_admin_with_admin_role(self):
        """Test get_current_admin allows admin role."""
        from app.security import get_current_admin

        admin_user = TokenData(user_id="admin-123", role="admin")
        result = await get_current_admin(admin_user)

        assert result.user_id == "admin-123"
        assert result.role == "admin"

    @pytest.mark.asyncio
    async def test_get_current_admin_rejects_author_role(self):
        """Test get_current_admin rejects author role."""
        from app.security import get_current_admin

        author_user = TokenData(user_id="author-123", role="author")

        with pytest.raises(HTTPException) as exc_info:
            await get_current_admin(author_user)

        assert exc_info.value.status_code == 403
        assert "Admin access required" in exc_info.value.detail


class TestCustomTokenExpiry:
    """Tests for custom token expiration."""

    def test_create_access_token_custom_expiry(self):
        """Test creating access token with custom expiry."""
        data = {"user_id": "test-user"}
        custom_delta = timedelta(hours=2)
        token = create_access_token(data, expires_delta=custom_delta)

        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        exp_time = datetime.utcfromtimestamp(decoded["exp"])

        # Should expire in roughly 2 hours
        now = datetime.utcnow()
        diff = exp_time - now
        # Allow for some processing time
        assert 1.9 <= diff.total_seconds() / 3600 <= 2.1

    def test_create_access_token_short_expiry(self):
        """Test creating access token with short expiry."""
        data = {"user_id": "test-user"}
        custom_delta = timedelta(minutes=5)
        token = create_access_token(data, expires_delta=custom_delta)

        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        exp_time = datetime.utcfromtimestamp(decoded["exp"])

        now = datetime.utcnow()
        diff = exp_time - now
        # Should expire in roughly 5 minutes
        assert 4.5 <= diff.total_seconds() / 60 <= 5.5


class TestRateLimiterClass:
    """Tests for RateLimiter class."""

    def test_rate_limiter_init_defaults(self):
        """Test RateLimiter initialization with defaults."""
        from app.security import RateLimiter

        limiter = RateLimiter()
        assert limiter.requests == 60
        assert limiter.window == 60

    def test_rate_limiter_init_custom(self):
        """Test RateLimiter initialization with custom values."""
        from app.security import RateLimiter

        limiter = RateLimiter(requests=100, window=300)
        assert limiter.requests == 100
        assert limiter.window == 300

    def test_default_rate_limiter_exists(self):
        """Test that default rate limiter is configured."""
        from app.security import rate_limiter

        assert rate_limiter is not None
        assert rate_limiter.requests == 60
        assert rate_limiter.window == 60
