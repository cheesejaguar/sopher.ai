# CHANGES.md - Project Improvement Checklist

Last updated: 2025-12-30

## Project Goal

Enable users to generate custom books on demand with full customization including:
- Age-appropriate content filtering (e.g., a 12-year-old reading about dragons)
- Genre customization (fantasy, romance, adventure, etc.)
- Thematic control (lessons, values, appropriate language)
- Real-time generation with streaming feedback

## Current Status

| Metric | Current | Target |
|--------|---------|--------|
| Test Coverage | 89.38% | 90%+ |
| Tests Passing | 2722/2722 (100%) | 100% |
| Backend Completeness | ~85% | 100% |
| Frontend Completeness | ~30% | 100% |

---

## Critical Priority - Must Fix

### Testing & Quality

- [x] **Fix 3 failing tests** - All tests now passing (2584 passed)
  - Fixed `tests/security/test_security_audit.py::TestCryptographicFailures::test_jwt_secret_length`
  - Fixed `tests/test_auth.py::test_google_callback_invalid_state`
  - Fixed `tests/test_oauth_cookies.py::TestOAuthCallback::test_callback_returns_redirect_with_cookies`

- [x] **Increase test coverage to 90%** - Target reached! (90%, up from 86%)
  - Added tests for `app/routers/auth.py` - now 80% coverage (was 29%)
  - Added tests for `app/routers/projects.py` - now 100% coverage (was 28%)
  - Added tests for `app/oauth.py` - now 74% coverage (was 58%)
  - Added tests for `app/cache.py` - now 99% coverage
  - Added tests for `app/routers/usage.py` - now 100% coverage
  - Added tests for `app/routers/chapters.py` - now 51% coverage (was 16%)
  - Added tests for `app/routers/outline.py` - now 68% coverage (was 31%)
  - Added tests for `app/main.py` - now 87% coverage
  - Added tests for `app/errors.py` - now 100% coverage
  - Added tests for `app/db.py` - now 100% coverage
  - Added tests for `app/security.py` - now 94% coverage
  - Added tests for `app/routers/editing.py` - now 47% coverage (was 41%)
  - Added tests for `app/services/parallel_writer.py` - now 69% coverage (was 66%)

### Age-Appropriate Content Filtering

- [x] **Implement content filtering service** (`app/services/content_filter.py`)
  - ContentFilterService with audience level parsing
  - ContentGuidelines generation based on ProjectSettings
  - Support for `mature_content`, `violence_level`, `profanity` settings
  - Age-appropriate language guidance based on `target_audience`
  - 55 unit tests with 94% coverage

- [x] **Add content validation service**
  - ContentValidator for post-generation content scanning
  - Profanity detection for all audience levels
  - Violence level enforcement (graphic/moderate/mild/none)
  - Mature content detection for children/middle grade
  - Avoided topics detection

- [x] **Add target audience presets**
  - Children (6-10): No violence, no profanity, simple vocabulary, auto-avoided topics
  - Middle Grade (10-14): Mild conflict, no profanity, age-appropriate themes
  - Young Adult (14-18): Moderate themes, limited violence
  - Adult (18+): Full content range per user settings

- [x] **Integrate content filtering into chapter generation**
  - Added `build_content_filter_prompt()` to chapter writer prompts in `chapters.py`
  - Project settings automatically parsed and passed to chapter generation
  - Content guidelines included in prompt with strict enforcement requirement
  - (Future) Implement post-generation content validation and regeneration

---

## High Priority - Core Features

### Chapter Generation API

- [x] **Complete chapter streaming endpoint** (`app/routers/chapters.py`)
  - `POST /api/v1/projects/{id}/chapters/{n}/generate/stream`
  - SSE streaming with progress events (token, checkpoint, complete, error)
  - Context injection from previous chapters (last 2 chapters)
  - Character bible integration
  - Content filtering integration

- [x] **Add chapter regeneration endpoint** (`app/routers/chapters.py`)
  - `POST /api/v1/projects/{id}/chapters/{n}/regenerate/stream`
  - Additional instructions support
  - Cache invalidation before regeneration
  - Content filtering integration
  - (Future) Preserve user edits option, quality threshold triggering

- [x] **Implement parallel chapter generation** (`app/routers/chapters.py`)
  - `POST /api/v1/projects/{id}/chapters/generate/parallel/stream`
  - Configurable concurrency (1-5 chapters via `max_parallel`)
  - SSE streaming with progress events per chapter
  - Content filtering integration
  - Job queue with status tracking (pending/running/completed/failed/cancelled)
  - Batch progress with estimated remaining time
  - Automatic artifact storage for completed chapters

### Editing System

- [ ] **Complete editing API endpoints**
  - `POST /api/v1/projects/{id}/chapters/{n}/edit` - Apply edits
  - `GET /api/v1/projects/{id}/chapters/{n}/suggestions` - Get suggestions
  - `POST /api/v1/projects/{id}/chapters/{n}/suggestions/{id}/apply` - Apply suggestion

- [ ] **Implement inline suggestion system**
  - Position-based suggestions (start/end offsets)
  - Confidence scoring display
  - Bulk accept/reject functionality

### Export System

- [ ] **Complete DOCX exporter**
  - Chapter formatting with styles
  - Front/back matter support
  - Table of contents generation

- [ ] **Complete PDF exporter**
  - Print-ready formatting
  - Page numbering and headers
  - Font embedding

- [ ] **Complete EPUB exporter**
  - E-reader compatible format
  - Navigation document
  - Cover image support

---

## Medium Priority - Enhanced Features

### Continuity System

- [ ] **Complete continuity checking API**
  - `POST /api/v1/projects/{id}/continuity/check`
  - Multi-chapter validation
  - Character consistency tracking
  - Timeline verification

- [ ] **Add continuity issue resolution**
  - Automatic fix suggestions
  - Manual override capability
  - Issue severity levels

### Character & World Building

- [ ] **Add character bible CRUD endpoints**
  - `POST /api/v1/projects/{id}/characters` - Create character
  - `GET /api/v1/projects/{id}/characters` - List characters
  - `PUT /api/v1/projects/{id}/characters/{id}` - Update character
  - `DELETE /api/v1/projects/{id}/characters/{id}` - Delete character

- [ ] **Add world building CRUD endpoints**
  - Locations, cultures, magic systems
  - Relationship mapping
  - Consistency rules enforcement

### Style & Voice

- [ ] **Integrate style learning service**
  - `POST /api/v1/projects/{id}/style/learn` - Learn from sample text
  - `GET /api/v1/projects/{id}/style/profile` - Get learned profile
  - Apply learned style to generation

- [ ] **Add voice profile management**
  - Named voice presets
  - Voice cloning from samples
  - Per-chapter voice variation

---

## Low Priority - Polish & Infrastructure

### Frontend Completion

- [ ] **Complete chapter generation page**
  - Real-time streaming display
  - Progress indicators
  - Error handling with retry

- [ ] **Complete editing dashboard**
  - Inline editing interface
  - Suggestion sidebar
  - Version history

- [ ] **Complete export page**
  - Format selection
  - Preview before download
  - Batch export options

- [ ] **Add character bible UI**
  - Character cards with relationships
  - Visual relationship mapper
  - Quick edit dialogs

### Frontend Testing

- [ ] **Add component tests**
  - `GenreTemplateSelector.tsx`
  - `ChapterEditor.tsx`
  - `ManuscriptPreview.tsx`
  - `StyleCustomizationPanel.tsx`

- [ ] **Add E2E tests for workflows**
  - Complete book generation flow
  - Edit and regenerate flow
  - Export and download flow

### Infrastructure

- [ ] **Complete Kubernetes deployment**
  - Test HPA scaling
  - Configure resource limits
  - Set up monitoring dashboards

- [ ] **Add Grafana dashboards**
  - Request latency tracking
  - Error rate monitoring
  - Cost tracking visualization

- [ ] **Performance optimization**
  - Optimize N+1 queries in project listing
  - Add database query caching
  - Implement response compression

---

## Completed Items

### Security (from BUGS.md)
- [x] Token exposure via query parameters - Fixed
- [x] Weak default JWT secret - Now required via env
- [x] Dynamic FERNET_KEY generation - Now required via env
- [x] Missing database health check - Added to /readyz
- [x] Budget check race condition - Row-level locking added
- [x] Rate limiting on auth endpoints - 10 req/min per IP
- [x] Security headers middleware - All headers added
- [x] Request size limits - 10MB default

### Testing Infrastructure
- [x] Backend test framework setup - pytest with async support
- [x] Frontend test framework setup - Vitest + Playwright
- [x] CI/CD pipeline - GitHub Actions configured
- [x] Coverage reporting - 86% backend coverage

### Core Features
- [x] Outline generation with SSE streaming
- [x] Cost tracking and budget management
- [x] Google OAuth authentication
- [x] Project CRUD operations
- [x] Genre template system
- [x] Caching with Redis

---

## Implementation Priority Order

1. **Fix failing tests** (immediate)
2. **Age-appropriate content filtering** (critical for use case)
3. **Chapter generation API completion** (core functionality)
4. **Increase test coverage to 90%** (quality gate)
5. **Editing system** (user workflow)
6. **Export system** (deliverable output)
7. **Frontend completion** (user experience)
8. **Infrastructure polish** (production readiness)

---

## Testing Requirements

### Backend Testing Goals
- Unit tests for all service methods
- Integration tests for all API endpoints
- Property-based tests for schema validation
- Load tests for streaming endpoints
- Security tests for auth flows

### Frontend Testing Goals
- Component unit tests with React Testing Library
- State management tests for Zustand store
- E2E tests for critical user flows
- Accessibility tests (color contrast, keyboard nav)

### Coverage Targets
| Area | Current | Target |
|------|---------|--------|
| Backend Overall | 90% | 90% |
| Routers | ~70% | 80% |
| Services | ~90% | 95% |
| Agents | ~85% | 85% |
| Frontend | ~30% | 70% |

---

## Notes

- All changes should maintain backwards compatibility
- New features should include comprehensive tests
- Documentation should be updated alongside code changes
- Performance impact should be measured for streaming endpoints
