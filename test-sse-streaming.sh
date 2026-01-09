#!/bin/bash

# SSE Streaming Integration Test
# Tests that SSE streaming works end-to-end from browser to backend

echo "=== SSE Streaming Integration Test ==="
echo ""

PROJECT_ID="b8d2e5d6-51c1-4075-865a-cfb2dadffa94"
BACKEND_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:3000"

echo "Testing SSE streaming from browser -> backend (direct)"
echo ""

echo "1. Backend health check..."
HEALTH=$(curl -s "${BACKEND_URL}/healthz")
echo "   Backend: $HEALTH"
echo ""

echo "2. Frontend health check..."
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" "${FRONTEND_URL}")
echo "   Frontend: HTTP $FRONTEND"
echo ""

echo "3. Testing direct backend SSE (will show 401 without auth)..."
echo "   URL: ${BACKEND_URL}/api/v1/projects/${PROJECT_ID}/chapters/1/generate/stream"
echo "   Response:"
curl -N -s --max-time 3 -X POST "${BACKEND_URL}/api/v1/projects/${PROJECT_ID}/chapters/1/generate/stream" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"outline":"Test chapter outline","chapter_number":1}' 2>&1 | head -10
echo ""
echo ""

echo "4. Testing direct backend outline SSE (will show 401 without auth)..."
echo "   URL: ${BACKEND_URL}/api/v1/projects/${PROJECT_ID}/outline/stream"
echo "   Response:"
curl -N -s --max-time 3 "${BACKEND_URL}/api/v1/projects/${PROJECT_ID}/outline/stream?brief=test&target_chapters=5" \
  -H "Accept: text/event-stream" 2>&1 | head -10
echo ""
echo ""

echo "5. Verifying CORS headers allow direct access from localhost:3000..."
CORS=$(curl -s -I -X OPTIONS "${BACKEND_URL}/api/v1/projects/${PROJECT_ID}/chapters/1/generate/stream" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" 2>&1 | grep -i "access-control-allow-origin")
echo "   $CORS"
echo ""

echo "=== Test Summary ==="
echo ""
echo "The fix changes SSE streaming to call the backend directly at ${BACKEND_URL}"
echo "instead of going through Next.js rewrites which buffer the response."
echo ""
echo "To fully test:"
echo "1. Open browser to ${FRONTEND_URL}"
echo "2. Log in and navigate to a project"
echo "3. Generate a chapter"
echo "4. You should see tokens streaming in real-time instead of 0 words"
echo ""
echo "Check browser console for these logs:"
echo "  [ChapterGen] Fetching from: ${BACKEND_URL}/api/v1/projects/{id}/chapters/{n}/generate/stream"
echo "  [ChapterGen] Response received, status: 200"
echo "  [ChapterGen] First chunk received: ..."
