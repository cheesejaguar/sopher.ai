#!/bin/bash

# Test SSE streaming at each layer

echo "=== SSE Streaming Diagnostic Test ==="
echo ""

PROJECT_ID="b8d2e5d6-51c1-4075-865a-cfb2dadffa94"

# Get a valid auth token from the user's browser cookie (you'll need to provide this)
# For now, test without auth to see if streaming works

echo "1. Testing backend health..."
curl -s http://localhost:8000/healthz
echo ""
echo ""

echo "2. Testing backend SSE directly (without auth - expect 401)..."
timeout 3 curl -N -s -X POST "http://localhost:8000/api/v1/projects/${PROJECT_ID}/chapters/1/generate/stream" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"outline":"Test chapter outline","chapter_number":1}' 2>&1 | head -5
echo ""
echo ""

echo "3. Testing frontend rewrite proxy (without auth - expect 401)..."
timeout 3 curl -N -s -X POST "http://localhost:3000/api/backend/v1/projects/${PROJECT_ID}/chapters/1/generate/stream" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"outline":"Test chapter outline","chapter_number":1}' 2>&1 | head -5
echo ""
echo ""

echo "4. Testing outline endpoint (GET, without auth)..."
timeout 3 curl -N -s "http://localhost:3000/api/backend/v1/projects/${PROJECT_ID}/outline" 2>&1 | head -5
echo ""
echo ""

echo "5. Checking if backend receives chapter requests (check docker logs)..."
echo "Run: docker-compose -f infra/docker-compose.dev.yml logs --tail=20 backend | grep -i chapter"
echo ""

echo "=== To test with authentication ==="
echo "1. Open browser dev tools -> Application -> Cookies"
echo "2. Copy the 'access_token' cookie value"
echo "3. Run:"
echo '   curl -N -s -X POST "http://localhost:8000/api/v1/projects/'${PROJECT_ID}'/chapters/1/generate/stream" \'
echo '     -H "Content-Type: application/json" \'
echo '     -H "Accept: text/event-stream" \'
echo '     -H "Cookie: access_token=YOUR_TOKEN_HERE" \'
echo '     -d "{\"outline\":\"Test\",\"chapter_number\":1}"'
