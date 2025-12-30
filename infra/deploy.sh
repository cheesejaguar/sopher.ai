#!/bin/bash
# sopher.ai Deployment Script
# Usage: ./deploy.sh [dev|prod]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="${1:-prod}"

echo "=== sopher.ai Deployment ==="
echo "Environment: $ENV"
echo ""

# Check required tools
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || command -v "docker compose" >/dev/null 2>&1 || { echo "Docker Compose is required but not installed."; exit 1; }

# Use docker compose v2 if available
if command -v "docker compose" >/dev/null 2>&1; then
    COMPOSE="docker compose"
else
    COMPOSE="docker-compose"
fi

cd "$SCRIPT_DIR"

if [ "$ENV" = "dev" ]; then
    echo "Starting development environment..."
    $COMPOSE -f docker-compose.dev.yml up -d
    echo ""
    echo "Development services started!"
    echo "  Frontend: http://localhost:3000"
    echo "  Backend:  http://localhost:8000"
    echo "  API Docs: http://localhost:8000/docs"
    echo "  Grafana:  http://localhost:3001"
else
    # Production deployment
    if [ ! -f ".env.prod" ]; then
        echo "Error: .env.prod not found!"
        echo "Copy .env.example to .env.prod and configure it first."
        exit 1
    fi

    # Validate required env vars
    source .env.prod
    if [ -z "$JWT_SECRET" ]; then
        echo "Error: JWT_SECRET not set in .env.prod"
        exit 1
    fi
    if [ -z "$ANTHROPIC_API_KEY" ]; then
        echo "Error: ANTHROPIC_API_KEY not set in .env.prod"
        exit 1
    fi

    echo "Building images..."
    $COMPOSE --env-file .env.prod build

    echo "Starting production services..."
    $COMPOSE --env-file .env.prod up -d

    echo ""
    echo "Production services started!"
    echo "  Application: https://${DOMAIN:-localhost}"
    echo "  Grafana:     https://${DOMAIN:-localhost}/grafana"
    echo ""
    echo "Check status with: $COMPOSE --env-file .env.prod ps"
    echo "View logs with:    $COMPOSE --env-file .env.prod logs -f"
fi
