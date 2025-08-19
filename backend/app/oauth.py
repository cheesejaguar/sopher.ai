"""OAuth2 authentication module for Google login"""

import hashlib
import os
import secrets
from base64 import urlsafe_b64encode
from typing import Optional
from urllib.parse import urlencode

from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import HTTPException, Request, Response, status

from .cache import cache

# Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_OAUTH_REDIRECT_URI = os.getenv(
    "GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:3000/api/backend/auth/callback/google"
)

# Google OAuth2 endpoints
GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

# OAuth2 scopes
OAUTH_SCOPES = ["openid", "email", "profile"]


def generate_state() -> str:
    """Generate a secure random state for CSRF protection"""
    return secrets.token_urlsafe(32)


def generate_pkce_challenge() -> tuple[str, str]:
    """Generate PKCE code verifier and challenge for OAuth2"""
    verifier = secrets.token_urlsafe(32)
    challenge = urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


async def store_oauth_state(state: str, verifier: str) -> None:
    """Store OAuth state and PKCE verifier in cache"""
    await cache.set(f"oauth:state:{state}", {"verifier": verifier}, ttl=600)  # 10 minutes


async def validate_oauth_state(state: str) -> Optional[str]:
    """Validate OAuth state and return PKCE verifier"""
    import hashlib
    import logging

    logger = logging.getLogger(__name__)

    try:
        data = await cache.get(f"oauth:state:{state}")
        if data:
            await cache.delete(f"oauth:state:{state}")  # One-time use
            verifier = data.get("verifier")
            if verifier:
                logger.info("OAuth state validated successfully")
                return str(verifier)
            else:
                logger.warning("OAuth state found but no verifier present")
                return None
        else:
            # Log only a hash of the state to prevent log injection
            state_hash = hashlib.sha256(state.encode()).hexdigest()[:8]
            logger.warning(f"OAuth state not found or expired: hash={state_hash}")
            return None
    except Exception as e:
        # Use exc_info for full details, log only error type for safety
        logger.error(f"Failed to validate OAuth state: {type(e).__name__}", exc_info=True)
        raise


def get_google_oauth_client() -> AsyncOAuth2Client:
    """Create Google OAuth2 client"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Google OAuth credentials not configured. "
                "Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
            ),
        )

    return AsyncOAuth2Client(
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        redirect_uri=GOOGLE_OAUTH_REDIRECT_URI,
        scope=" ".join(OAUTH_SCOPES),
        authorize_url=GOOGLE_AUTHORIZE_URL,
        token_url=GOOGLE_TOKEN_URL,
    )


def get_google_auth_url(state: str, code_challenge: str) -> str:
    """Generate Google OAuth2 authorization URL with PKCE"""
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(OAUTH_SCOPES),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str, code_verifier: str) -> tuple[dict, dict]:
    """Exchange authorization code for tokens and fetch user info"""
    import logging

    logger = logging.getLogger(__name__)

    try:
        client = get_google_oauth_client()
    except HTTPException:
        # Re-raise configuration errors
        raise
    except Exception as e:
        logger.error(f"Failed to create OAuth client: {type(e).__name__}", exc_info=True)
        raise

    try:
        # Exchange code for token
        logger.info("Exchanging OAuth code for token")
        token = await client.fetch_token(
            GOOGLE_TOKEN_URL,
            code=code,
            code_verifier=code_verifier,
        )
    except Exception as e:
        logger.error(f"Token exchange failed: {type(e).__name__}", exc_info=True)
        # Add more context to the error
        if "invalid_grant" in str(e):
            raise ValueError("invalid_grant: The authorization code is invalid or has expired")
        elif "redirect_uri_mismatch" in str(e):
            raise ValueError(f"redirect_uri_mismatch: Expected {GOOGLE_OAUTH_REDIRECT_URI}")
        else:
            raise

    try:
        # Fetch user info
        client.token = token
        resp = await client.get(GOOGLE_USERINFO_URL)
        resp.raise_for_status()
        userinfo = resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch user info: {type(e).__name__}", exc_info=True)
        raise ValueError(f"Failed to fetch user info from Google: {str(e)}")

    return token, userinfo


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    request: Request,
) -> None:
    """Set authentication cookies with appropriate security settings"""
    # Determine if we're in production based on the request
    # When proxied through frontend, check the original host header
    host = request.headers.get("host", "")
    is_production = "localhost" not in host and "127.0.0.1" not in host

    # Extract domain from host for cookie setting
    # For proxied requests, cookies should be set for the frontend domain
    domain = None
    if host:
        # Remove port if present
        domain_parts = host.split(":")
        domain = domain_parts[0]

        # For localhost, don't set domain (allows cookie on any port)
        if "localhost" in domain or "127.0.0.1" in domain:
            domain = None
        # For production, use the base domain to allow subdomain access
        elif "sopher.ai" in domain:
            domain = ".sopher.ai"  # Allow access from sopher.ai and subdomains

    # Set access token cookie (1 hour)
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=3600,
        httponly=False,  # Allow JavaScript access for API calls
        samesite="lax",
        secure=is_production,
        path="/",
        domain=domain,  # None for localhost, ".sopher.ai" for production
    )

    # Set refresh token cookie (7 days)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=7 * 24 * 3600,
        httponly=True,  # Keep refresh token httponly for security
        samesite="lax",
        secure=is_production,
        path="/",
        domain=domain,  # None for localhost, ".sopher.ai" for production
    )


def clear_auth_cookies(response: Response, request: Request) -> None:
    """Clear authentication cookies"""
    host = request.headers.get("host", "")
    is_production = "localhost" not in host and "127.0.0.1" not in host

    # Match domain setting from set_auth_cookies
    domain = None
    if host:
        domain_parts = host.split(":")
        domain = domain_parts[0]

        if "localhost" in domain or "127.0.0.1" in domain:
            domain = None
        elif "sopher.ai" in domain:
            domain = ".sopher.ai"

    # Clear access token
    response.delete_cookie(
        key="access_token",
        path="/",
        secure=is_production,
        httponly=False,
        samesite="lax",
        domain=domain,
    )

    # Clear refresh token
    response.delete_cookie(
        key="refresh_token",
        path="/",
        secure=is_production,
        httponly=True,
        samesite="lax",
        domain=domain,
    )
