# Quick Spec: Make Projects Page Default Landing

## Overview
Redirect OAuth-authenticated users to `/projects` instead of `/` after login. The middleware already handles redirecting authenticated users from `/` to `/projects`, but the OAuth success handler bypasses this logic by returning early.

## Workflow Type
Simple - Single file modification to middleware

## Task Scope
### Files to Modify
- `frontend/middleware.ts` - Update OAuth success handler to redirect to /projects

### Change Details
The middleware already redirects authenticated users from `/` to `/projects` (lines 134-139), but the OAuth success handler (lines 47-50) bypasses this by returning early.

Change the OAuth success handler to redirect to `/projects?oauth=success` instead of allowing the request through to `/`.

Before (line 47-50):
```typescript
if (searchParams.get('oauth') === 'success') {
  return NextResponse.next()
}
```

After:
```typescript
if (searchParams.get('oauth') === 'success') {
  const projectsUrl = new URL('/projects', request.url)
  projectsUrl.searchParams.set('oauth', 'success')
  return NextResponse.redirect(projectsUrl)
}
```

## Success Criteria
- [ ] Login via OAuth → lands on /projects page
- [ ] OAuth success parameter is preserved for any needed client-side handling
- [ ] Direct navigation to / while authenticated still redirects to /projects

## Notes
- The projects page may want to handle `?oauth=success` parameter for welcome messaging (optional enhancement)
- Debug logging already exists in middleware for troubleshooting
