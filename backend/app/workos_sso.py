"""WorkOS SSO authentication module

WorkOS provides enterprise-grade SSO with support for:
- Google OAuth
- Microsoft Azure AD
- Okta
- SAML providers
- And 50+ other identity providers

Docs: https://workos.com/docs/sso
"""

import hashlib
import logging
import os
import secrets
from typing import Optional

from fastapi import HTTPException, Request, Response, status
from workos import WorkOSClient

from .cache import cache

logger = logging.getLogger(__name__)

# WorkOS Configuration
WORKOS_CLIENT_ID = os.getenv("WORKOS_CLIENT_ID", "")
WORKOS_API_KEY = os.getenv("WORKOS_API_KEY", "")
WORKOS_REDIRECT_URI = os.getenv(
    "WORKOS_REDIRECT_URI", "http://localhost:3000/api/backend/auth/callback"
)

# Initialize WorkOS client (lazy initialization)
_workos_client: Optional[WorkOSClient] = None


def get_workos_client() -> WorkOSClient:
    """Get or create WorkOS client instance"""
    global _workos_client

    if not WORKOS_CLIENT_ID or not WORKOS_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "WorkOS credentials not configured. "
                "Please set WORKOS_CLIENT_ID and WORKOS_API_KEY environment variables."
            ),
        )

    if _workos_client is None:
        _workos_client = WorkOSClient(
            api_key=WORKOS_API_KEY,
            client_id=WORKOS_CLIENT_ID,
        )

    return _workos_client


def generate_state() -> str:
    """Generate a secure random state for CSRF protection"""
    return secrets.token_urlsafe(32)


async def store_sso_state(state: str, provider: str = "google") -> None:
    """Store SSO state in cache for validation"""
    await cache.set(
        f"sso:state:{state}",
        {"provider": provider},
        ttl=600,  # 10 minutes
    )


async def validate_sso_state(state: str) -> Optional[dict]:
    """Validate SSO state and return stored data"""
    try:
        data = await cache.get(f"sso:state:{state}")
        if data:
            await cache.delete(f"sso:state:{state}")  # One-time use
            logger.info("SSO state validated successfully")
            return data
        else:
            state_hash = hashlib.sha256(state.encode()).hexdigest()[:8]
            logger.warning(f"SSO state not found or expired: hash={state_hash}")
            return None
    except Exception as e:
        logger.error(f"Failed to validate SSO state: {type(e).__name__}", exc_info=True)
        raise


def get_authorization_url(
    state: str,
    provider: str = "GoogleOAuth",
    connection_id: Optional[str] = None,
    organization_id: Optional[str] = None,
) -> str:
    """Generate WorkOS SSO authorization URL

    Args:
        state: CSRF protection state token
        provider: OAuth provider (e.g., "GoogleOAuth", "MicrosoftOAuth")
        connection_id: Specific SSO connection ID (for enterprise SAML)
        organization_id: WorkOS organization ID

    Returns:
        Authorization URL to redirect user to

    Docs: https://workos.com/docs/sso/guide
    """
    client = get_workos_client()

    # Build authorization URL parameters
    # WorkOS uses different selectors based on what's configured
    kwargs = {
        "redirect_uri": WORKOS_REDIRECT_URI,
        "state": state,
    }

    if connection_id:
        # Enterprise SSO with specific connection
        kwargs["connection_id"] = connection_id
    elif organization_id:
        # Organization-level SSO
        kwargs["organization_id"] = organization_id
    else:
        # OAuth provider (Google, Microsoft, etc.)
        kwargs["provider"] = provider

    authorization_url = client.sso.get_authorization_url(**kwargs)

    logger.info(f"Generated WorkOS authorization URL for provider: {provider}")
    return authorization_url


async def exchange_code_for_profile(code: str) -> dict:
    """Exchange authorization code for user profile

    Args:
        code: Authorization code from callback

    Returns:
        User profile dict with: id, email, first_name, last_name, raw_attributes

    Docs: https://workos.com/docs/sso/guide
    """
    client = get_workos_client()

    try:
        # Exchange code for profile and token
        profile_and_token = client.sso.get_profile_and_token(code)

        # Extract profile data
        profile = profile_and_token.profile

        # Build standardized user info dict
        user_info = {
            "id": profile.id,
            "idp_id": profile.idp_id,
            "email": profile.email,
            "first_name": profile.first_name,
            "last_name": profile.last_name,
            "name": f"{profile.first_name or ''} {profile.last_name or ''}".strip(),
            "connection_id": profile.connection_id,
            "connection_type": profile.connection_type,
            "organization_id": profile.organization_id,
            "raw_attributes": profile.raw_attributes,
        }

        # Extract profile picture if available
        raw_attrs = profile.raw_attributes or {}
        user_info["picture"] = raw_attrs.get("picture") or raw_attrs.get("avatar_url")

        logger.info(f"WorkOS SSO profile retrieved for: {profile.email}")
        return user_info

    except Exception as e:
        logger.error(f"WorkOS code exchange failed: {type(e).__name__}", exc_info=True)

        error_msg = str(e).lower()
        if "invalid" in error_msg and "code" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The authorization code is invalid or has expired. Please try again.",
            )
        elif "redirect" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Redirect URI mismatch. Please contact the administrator.",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to authenticate: {str(e)}",
            )


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    request: Request,
) -> None:
    """Set authentication cookies with appropriate security settings"""
    # Determine environment
    env = os.getenv("ENVIRONMENT", "development")
    host = request.headers.get("host", "")
    x_forwarded_host = request.headers.get("x-forwarded-host", "")
    x_forwarded_proto = request.headers.get("x-forwarded-proto", "")

    # Production detection
    is_production = (
        env == "production"
        or x_forwarded_proto == "https"
        or "sopher.ai" in host
        or "sopher.ai" in x_forwarded_host
    )

    # Override for local testing
    if "localhost" in host or "127.0.0.1" in host:
        is_production = False

    # Extract domain for cookie
    domain = None
    effective_host = x_forwarded_host or host

    if effective_host:
        domain_parts = effective_host.split(":")
        domain = domain_parts[0]

        if "localhost" in domain or "127.0.0.1" in domain:
            domain = None
        elif "sopher.ai" in domain:
            domain = "sopher.ai"

    logger.info(
        f"Setting auth cookies - host: {host}, domain: {domain}, "
        f"production: {is_production}, env: {env}"
    )

    use_secure = is_production or x_forwarded_proto == "https"

    # Set access token cookie (1 hour)
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=3600,
        httponly=True,
        samesite="lax",
        secure=use_secure,
        path="/",
        domain=domain,
    )

    # Set refresh token cookie (7 days)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=7 * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=use_secure,
        path="/",
        domain=domain,
    )


def clear_auth_cookies(response: Response, request: Request) -> None:
    """Clear authentication cookies"""
    env = os.getenv("ENVIRONMENT", "development")
    host = request.headers.get("host", "")
    x_forwarded_host = request.headers.get("x-forwarded-host", "")
    x_forwarded_proto = request.headers.get("x-forwarded-proto", "")

    is_production = (
        env == "production"
        or x_forwarded_proto == "https"
        or "sopher.ai" in host
        or "sopher.ai" in x_forwarded_host
    )

    if "localhost" in host or "127.0.0.1" in host:
        is_production = False

    domain = None
    effective_host = x_forwarded_host or host

    if effective_host:
        domain_parts = effective_host.split(":")
        domain = domain_parts[0]

        if "localhost" in domain or "127.0.0.1" in domain:
            domain = None
        elif "sopher.ai" in domain:
            domain = "sopher.ai"

    logger.info(f"Clearing auth cookies - host: {host}, domain: {domain}")

    response.delete_cookie(
        key="access_token",
        path="/",
        secure=is_production,
        httponly=True,
        samesite="lax",
        domain=domain,
    )

    response.delete_cookie(
        key="refresh_token",
        path="/",
        secure=is_production,
        httponly=True,
        samesite="lax",
        domain=domain,
    )
