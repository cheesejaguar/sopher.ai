"""Authentication routes using WorkOS SSO

WorkOS provides enterprise-grade SSO with support for Google, Microsoft,
Okta, and 50+ other identity providers.

Docs: https://workos.com/docs/sso
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..cache import cache
from ..db import get_db
from ..models import User
from ..security import TokenData, create_access_token, create_refresh_token, get_current_user
from ..workos_sso import (
    WORKOS_CLIENT_ID,
    WORKOS_REDIRECT_URI,
    clear_auth_cookies,
    exchange_code_for_profile,
    generate_state,
    get_authorization_url,
    set_auth_cookies,
    store_sso_state,
    validate_sso_state,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# Rate limiting constants
OAUTH_RATE_LIMIT_REQUESTS = 10
OAUTH_RATE_LIMIT_WINDOW = 60


async def check_oauth_rate_limit(request: Request) -> None:
    """Check rate limit for OAuth endpoints"""
    forwarded_for = request.headers.get("x-forwarded-for")
    client_ip = (
        forwarded_for.split(",")[0].strip()
        if forwarded_for
        else request.client.host if request.client else "unknown"
    )

    rate_key = f"oauth_rate:{client_ip}"
    count = await cache.increment(rate_key, ttl=OAUTH_RATE_LIMIT_WINDOW)

    if count > OAUTH_RATE_LIMIT_REQUESTS:
        logger.warning(f"OAuth rate limit exceeded for IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication requests. Please try again later.",
        )


# URL constants
LOCALHOST_URL_TEMPLATE = "http://localhost:{}/"
DEFAULT_LOCALHOST_URL = "http://localhost:3000/"
PRODUCTION_URL = "https://sopher.ai/"

# Allowed hosts for redirects
_extra_hosts = os.getenv("ALLOWED_OAUTH_HOSTS", "")
_default_hosts = {
    "localhost:3000",
    "localhost:3001",
    "127.0.0.1:3000",
    "sopher.ai",
    "api.sopher.ai",
    "www.sopher.ai",
}
ALLOWED_OAUTH_HOSTS = _default_hosts | {h.strip() for h in _extra_hosts.split(",") if h.strip()}


def _get_frontend_url(request: Request) -> str:
    """Extract and validate frontend URL from request headers"""
    # Check for explicit frontend URL override (useful in Docker/proxy environments)
    frontend_url_override = os.getenv("FRONTEND_URL")
    if frontend_url_override:
        return frontend_url_override.rstrip("/") + "/"

    # Check X-Forwarded-Host first (set by reverse proxies like Next.js rewrites)
    x_forwarded_host = request.headers.get("x-forwarded-host", "")
    host = x_forwarded_host or request.headers.get("host", "")

    if host:
        hostname = host.split(":")[0] if ":" in host else host

        if hostname in ["localhost", "127.0.0.1"]:
            if ":" in host:
                port = host.split(":")[1]
                try:
                    port_num = int(port)
                    if 1 <= port_num <= 65535:
                        return f"http://localhost:{port_num}/"
                except ValueError:
                    pass
            return DEFAULT_LOCALHOST_URL

        elif host in ALLOWED_OAUTH_HOSTS or hostname in ["sopher.ai", "api.sopher.ai"]:
            return PRODUCTION_URL
        else:
            logger.warning(f"Unrecognized host header: {host}, using default")
            return PRODUCTION_URL

    return PRODUCTION_URL


@router.get("/config/status")
async def oauth_config_status():
    """Check SSO configuration status"""
    workos_configured = bool(WORKOS_CLIENT_ID and os.getenv("WORKOS_API_KEY"))

    return {
        "sso_provider": "workos",
        "sso_configured": workos_configured,
        "client_id_set": bool(WORKOS_CLIENT_ID),
        "api_key_set": bool(os.getenv("WORKOS_API_KEY")),
        "redirect_uri": WORKOS_REDIRECT_URI,
        "message": (
            "WorkOS SSO is properly configured"
            if workos_configured
            else "WorkOS credentials are missing. See docs for setup instructions."
        ),
    }


@router.get("/login/google")
async def login_google(request: Request):
    """Initiate Google OAuth login via WorkOS"""
    await check_oauth_rate_limit(request)

    state = generate_state()
    await store_sso_state(state, provider="GoogleOAuth")

    auth_url = get_authorization_url(state=state, provider="GoogleOAuth")

    logger.info("Initiating Google OAuth via WorkOS")
    return RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)


@router.get("/login/microsoft")
async def login_microsoft(request: Request):
    """Initiate Microsoft OAuth login via WorkOS"""
    await check_oauth_rate_limit(request)

    state = generate_state()
    await store_sso_state(state, provider="MicrosoftOAuth")

    auth_url = get_authorization_url(state=state, provider="MicrosoftOAuth")

    logger.info("Initiating Microsoft OAuth via WorkOS")
    return RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)


@router.get("/login/github")
async def login_github(request: Request):
    """Initiate GitHub OAuth login via WorkOS"""
    await check_oauth_rate_limit(request)

    state = generate_state()
    await store_sso_state(state, provider="GitHubOAuth")

    auth_url = get_authorization_url(state=state, provider="GitHubOAuth")

    logger.info("Initiating GitHub OAuth via WorkOS")
    return RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)


@router.get("/callback")
@router.head("/callback")
async def sso_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle WorkOS SSO callback"""
    # Handle HEAD requests
    if request.method == "HEAD":
        return Response(status_code=status.HTTP_200_OK)

    await check_oauth_rate_limit(request)

    # Log callback (sanitized)
    sanitized_error = error.replace("\r", "").replace("\n", "").replace("\t", "") if error else None
    logger.info(
        f"SSO callback - code_present: {bool(code)}, "
        f"state_present: {bool(state)}, error: {sanitized_error}"
    )

    # Handle OAuth errors
    if error:
        logger.error(f"SSO error from WorkOS: {sanitized_error}")
        frontend_url = _get_frontend_url(request)
        from urllib.parse import quote

        error_param = quote(sanitized_error) if sanitized_error else ""
        return RedirectResponse(
            url=f"{frontend_url}login?error={error_param}",
            status_code=status.HTTP_302_FOUND,
        )

    # Validate parameters
    if not code or not state:
        logger.warning(f"Missing SSO parameters - code: {bool(code)}, state: {bool(state)}")
        frontend_url = _get_frontend_url(request)
        return RedirectResponse(
            url=f"{frontend_url}login?error=missing_parameters",
            status_code=status.HTTP_302_FOUND,
        )

    # Validate state
    state_data = await validate_sso_state(state)
    if not state_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired state parameter. Please try logging in again.",
        )

    # Exchange code for profile
    try:
        user_info = await exchange_code_for_profile(code)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"SSO profile exchange failed: {type(e).__name__}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to authenticate: {str(e)}",
        )

    # Extract user information
    provider_sub = user_info.get("id") or user_info.get("idp_id")
    email = user_info.get("email")
    name = user_info.get("name")
    picture = user_info.get("picture")

    if not provider_sub or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incomplete user information from identity provider",
        )

    # Find or create user
    result = await db.execute(select(User).where(User.provider_sub == provider_sub))
    user = result.scalar_one_or_none()

    if not user:
        # Check if user exists by email (migration from other providers)
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user:
        # Update existing user
        user.email = email
        user.name = name
        user.picture = picture
        user.provider = "workos"
        user.provider_sub = provider_sub
    else:
        # Create new user
        user = User(
            email=email,
            name=name,
            picture=picture,
            provider="workos",
            provider_sub=provider_sub,
            role="author",
        )
        db.add(user)

    await db.commit()
    await db.refresh(user)

    # Create JWT tokens
    token_data = {
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    logger.info(f"User {user.id} authenticated successfully via WorkOS")

    # Redirect to frontend with auth cookies
    frontend_url = _get_frontend_url(request)
    redirect_url = f"{frontend_url}?oauth=success"

    redirect_response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
    set_auth_cookies(redirect_response, access_token, refresh_token, request)

    # Debug headers in development
    debug_mode = (
        os.getenv("ENVIRONMENT", "development") == "development"
        or os.getenv("DEBUG_AUTH") == "true"
    )
    if debug_mode:
        redirect_response.headers["X-Auth-Status"] = "success"
        redirect_response.headers["X-User-Email"] = str(user.email)

    return redirect_response


# Legacy callback for backwards compatibility
@router.get("/callback/google")
@router.head("/callback/google")
async def callback_google_legacy(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Legacy Google OAuth callback - redirects to main callback"""
    return await sso_callback(request, code, state, error, error_description, db)


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Clear authentication cookies"""
    clear_auth_cookies(response, request)
    return {"message": "Logged out successfully"}


@router.get("/verify")
async def verify_auth(request: Request):
    """Verify authentication cookies are present"""
    access_token = request.cookies.get("access_token")
    refresh_token = request.cookies.get("refresh_token")

    return {
        "authenticated": access_token is not None,
        "has_access_token": access_token is not None,
        "has_refresh_token": refresh_token is not None,
        "host": request.headers.get("host", ""),
        "cookies_present": list(request.cookies.keys()),
    }


@router.get("/me")
async def get_me(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user profile"""
    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "role": user.role,
        "monthly_budget_usd": float(user.monthly_budget_usd),
    }


# =============================================================================
# Local Development Auth Bypass
# =============================================================================

LOCAL_AUTH_BYPASS = os.getenv("LOCAL_AUTH_BYPASS", "false").lower() == "true"
DEV_TEST_EMAIL = os.getenv("DEV_TEST_EMAIL", "test@localhost.dev")
DEV_TEST_NAME = os.getenv("DEV_TEST_NAME", "Test User")


@router.get("/dev/login")
async def dev_login(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Development-only login endpoint that bypasses SSO"""
    if not LOCAL_AUTH_BYPASS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dev login is not enabled. Set LOCAL_AUTH_BYPASS=true in .env",
        )

    environment = os.getenv("ENVIRONMENT", "development")
    if environment == "production":
        logger.error("Attempted dev login in production!")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dev login is not available in production.",
        )

    logger.warning(f"Dev login bypass activated - Environment: {environment}")

    # Find or create test user
    result = await db.execute(select(User).where(User.email == DEV_TEST_EMAIL))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=DEV_TEST_EMAIL,
            name=DEV_TEST_NAME,
            provider="dev-bypass",
            provider_sub=f"dev-{DEV_TEST_EMAIL}",
            role="author",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info(f"Created dev test user: {user.id}")
    else:
        logger.info(f"Using existing dev test user: {user.id}")

    # Create JWT tokens
    token_data = {
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Redirect with cookies
    frontend_url = _get_frontend_url(request)
    redirect_response = RedirectResponse(
        url=f"{frontend_url}?oauth=success&dev=true",
        status_code=status.HTTP_302_FOUND,
    )
    set_auth_cookies(redirect_response, access_token, refresh_token, request)

    redirect_response.headers["X-Auth-Status"] = "dev-bypass"
    redirect_response.headers["X-Dev-User"] = DEV_TEST_EMAIL

    return redirect_response


@router.get("/dev/status")
async def dev_auth_status():
    """Check if dev auth bypass is enabled"""
    environment = os.getenv("ENVIRONMENT", "development")
    return {
        "dev_auth_enabled": LOCAL_AUTH_BYPASS,
        "environment": environment,
        "test_email": DEV_TEST_EMAIL if LOCAL_AUTH_BYPASS else None,
        "test_name": DEV_TEST_NAME if LOCAL_AUTH_BYPASS else None,
        "warning": (
            "Dev auth bypass is enabled - do not use in production!"
            if LOCAL_AUTH_BYPASS
            else "Dev auth bypass is disabled"
        ),
    }
