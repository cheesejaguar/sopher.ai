# BUGS.md - Codebase Audit Todo List

Last audited: 2025-12-30

## Critical Issues

- [ ] **Token Exposure via Query Parameters** - `backend/app/security.py:109-111`
  - SSE endpoints accept access tokens via query parameters (`request.query_params.get("access_token")`)
  - Query parameters are logged in server logs and browser history
  - **Fix**: Remove query parameter token support; use only Bearer tokens or HttpOnly cookies

- [ ] **Weak Default JWT Secret** - `backend/app/security.py:16`
  - Default JWT secret is `"dev-secret-key-change-in-production"`
  - If `JWT_SECRET` env var is not set in production, all tokens are compromised
  - **Fix**: Remove default; raise error if `JWT_SECRET` not provided

- [ ] **Dynamic FERNET_KEY Generation** - `backend/app/security.py:22`
  - `FERNET_KEY` generated dynamically if not provided; not persisted across restarts
  - Encrypted API keys become unrecoverable on application restart
  - **Fix**: Require `FERNET_KEY` to be set via environment variable

- [ ] **Missing Database Health Check** - `backend/app/main.py:296-308`
  - `/readyz` endpoint only checks Redis, not database connection
  - API could be "ready" but database offline
  - **Fix**: Add database ping to readiness check

- [ ] **Budget Check Race Condition** - `backend/app/routers/outline.py:272-290`
  - Budget checked but not transaction-locked
  - Concurrent requests could exceed monthly budget limits
  - **Fix**: Use database row-level locking or check within transaction

- [ ] **Middleware JWT Parsing Without Signature Verification** - `frontend/middleware.ts:91-93`
  - JWT parsed and expiry checked without signature verification
  - Malicious actors can forge tokens with future expiry dates
  - **Fix**: Verify JWT signature or rely solely on backend validation

## High Severity Issues

- [ ] **Bare Exception Catching in OAuth** - `backend/app/oauth.py:71-74, 125-127, 137-145`
  - Broad `except Exception` blocks swallow unexpected errors
  - **Fix**: Catch specific exceptions (HTTPException, ValueError, etc.)

- [ ] **Inconsistent Cookie Security Settings** - `backend/app/oauth.py:305, 315`
  - Cookie deletion uses `httponly=False` but creation uses `httponly=True`
  - Cookie deletion may fail due to attribute mismatch
  - **Fix**: Ensure consistent httponly settings

- [ ] **User Email Logged in Production** - `backend/app/routers/auth.py:276`
  - User email logged in plaintext: `logger.info(f"User {user.email} authenticated...")`
  - **Fix**: Log user ID only, not email

- [ ] **No Rate Limiting on Auth Endpoints** - `backend/app/routers/auth.py`
  - `/auth/login/google` and `/auth/callback/google` have no rate limiting
  - Susceptible to brute force attacks
  - **Fix**: Implement rate limiting per IP for OAuth endpoints

- [ ] **Missing Validation on Budget Update** - `backend/app/routers/usage.py:148-158`
  - Schema allows budgets > $10,000 despite validation
  - **Fix**: Add validation to Pydantic schema with `ge=0, le=10000`

- [ ] **Hardcoded Frontend URL Validation** - `backend/app/routers/auth.py:47-54`
  - Allowed hosts hardcoded; adding new domains requires code change
  - **Fix**: Load allowed hosts from environment variable

- [ ] **N+1 Query Pattern in Project Listing** - `backend/app/routers/projects.py:59-61`
  - Counting projects using subquery instead of direct count()
  - **Fix**: Use `select(func.count(Project.id)).where(...)`

- [ ] **No Timeout on Streaming Endpoints** - `backend/app/routers/outline.py`, `chapters.py`
  - SSE stream generators don't have timeout; could hold connections indefinitely
  - **Fix**: Add 30 minute max timeout to stream generators

- [ ] **Missing Content Security Policy** - Frontend middleware
  - No CSP headers set on responses
  - Vulnerable to XSS attacks
  - **Fix**: Add CSP headers in middleware

- [ ] **Missing Security Headers** - Backend responses
  - No X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security
  - **Fix**: Add security headers middleware

- [ ] **No Request Size Limits** - `backend/app/main.py`
  - No max_request_size configured in FastAPI
  - Could accept huge payloads causing DoS
  - **Fix**: Add request size limits to FastAPI app config

## Medium Severity Issues

- [ ] **Type Ignores Hiding Problems** - Multiple files
  - Excessive `# type: ignore` comments suppress legitimate type issues
  - **Fix**: Fix underlying type issues instead of suppressing

- [ ] **Print Statements in Production** - `backend/app/agents/`
  - Debug print statements in production code (base.py, orchestrator.py)
  - **Fix**: Replace with `logger.debug()`

- [ ] **Generic Error Messages Expose Details** - `backend/app/routers/chapters.py:274-285`
  - Exception converted to string may expose internal details
  - **Fix**: Return generic message; log full traceback server-side

- [ ] **No Validation on Chapter Number in Cache Key** - `backend/app/routers/chapters.py:120`
  - Cache key includes chapter_number without validation
  - **Fix**: Validate chapter_number >= 1 in schema

- [ ] **Silent Auth Failures in Frontend** - `frontend/middleware.ts:110`
  - Token parsing errors silently caught in production
  - **Fix**: Always log errors; add metrics tracking

- [ ] **Redis Connection Pool Not Configurable** - `backend/app/cache.py:24`
  - Max connections hardcoded to 50
  - **Fix**: Make configurable via environment variable

- [ ] **Model Parameter Not Dynamic** - `backend/app/schemas.py:297`
  - Model parameter uses hardcoded Literal type
  - **Fix**: Load valid models from configuration

- [ ] **Missing Database Transaction Rollback** - `backend/app/db.py:45-51`
  - Session dependency doesn't explicitly rollback on exception
  - **Fix**: Add explicit rollback in exception handler

## Low Severity / Code Quality

- [ ] **Inconsistent Error Response Format** - Multiple router files
  - Some endpoints return `api_error()`, others raise `HTTPException()`
  - **Fix**: Standardize on one approach

- [ ] **Missing Docstrings** - `backend/app/services/`
  - Many service methods lack docstrings
  - **Fix**: Add comprehensive docstrings to public methods

- [ ] **Duplicate Imports** - `backend/app/oauth.py:50-51`
  - `hashlib` imported twice
  - **Fix**: Remove duplicate

- [ ] **Magic Numbers Without Constants** - `backend/app/cache.py:45`
  - TTL values hardcoded (600 for 10 minutes)
  - **Fix**: Define constants for TTL values

- [ ] **Logging at Wrong Severity** - `backend/app/routers/auth.py:156-159`
  - Non-error conditions logged at ERROR level
  - **Fix**: Use INFO for normal flow, ERROR for unexpected

- [ ] **Test Coverage at 66%** - `backend/pyproject.toml:139`
  - Many critical paths untested (auth, streaming, cost tracking)
  - **Fix**: Increase coverage to 80%+ for critical endpoints

- [ ] **Configuration Duplication** - Multiple files
  - Model pricing, allowed hosts scattered across files
  - **Fix**: Create central configuration module

## Summary

| Severity | Count |
|----------|-------|
| Critical | 6 |
| High | 11 |
| Medium | 8 |
| Low | 7 |
| **Total** | **32** |

## Priority Remediation Order

1. Remove query parameter token support (security)
2. Enforce required environment variables (JWT_SECRET, FERNET_KEY)
3. Add database to readiness check
4. Fix budget check race condition
5. Add rate limiting to auth endpoints
6. Fix cookie security consistency
7. Remove print statements
8. Add security headers
9. Add request size limits
10. Fix middleware JWT verification
