# sopher.ai

[![CI/CD Pipeline](https://github.com/cheesejaguar/sopher.ai/actions/workflows/ci.yml/badge.svg)](https://github.com/cheesejaguar/sopher.ai/actions/workflows/ci.yml)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An AI-powered book writing system that transforms author briefs into complete manuscripts using a multi-agent pipeline with real-time streaming and cost controls.

## Overview

sopher.ai orchestrates five specialized AI agents to generate novels from a simple brief:

1. **Concept Generator** - Expands briefs into rich story concepts with themes, settings, and conflicts
2. **Outliner** - Creates detailed chapter-by-chapter structure with plot threads and character arcs
3. **Writer** - Generates prose following style guides and maintaining voice consistency
4. **Editor** - Performs structural editing, pacing adjustments, and prose polish
5. **Continuity Checker** - Validates consistency across characters, timeline, and plot details

The system uses a thin orchestration layer built on [LiteLLM](https://github.com/BerriAI/litellm) for model routing, providing full control over prompts and generation flow without heavy framework dependencies.

## Features

- **Real-time Streaming** - Server-Sent Events with sub-300ms latency for live generation feedback
- **Multi-Model Support** - Route between GPT-4, Claude, Gemini with automatic fallbacks
- **Structured Outputs** - Pydantic models ensure type-safe, validated responses from LLMs
- **Cost Management** - Per-agent budget allocation with real-time tracking and limits
- **Parallel Generation** - Write multiple chapters concurrently with shared context
- **Genre Templates** - Specialized prompts for mystery, romance, fantasy, thriller, and more
- **Style Learning** - Analyze and replicate author voice from sample text
- **Export Formats** - Generate manuscripts in Markdown, plain text, or structured JSON

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | FastAPI, SQLAlchemy (async), PostgreSQL, Redis |
| **AI Orchestration** | LiteLLM, Pydantic, custom Agent framework |
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand |
| **Infrastructure** | Docker, Kubernetes (GKE), Prometheus, Grafana |
| **CI/CD** | GitHub Actions, CodeQL, Semgrep |

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- Docker & Docker Compose
- API keys for at least one LLM provider (OpenAI, Anthropic, or Google)

### Setup

```bash
# Clone the repository
git clone https://github.com/cheesejaguar/sopher.ai.git
cd sopher.ai

# Copy environment template
cp .env.example .env

# Add your API keys to .env (at minimum, one of these):
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_API_KEY=AI...
```

### Run with Docker (Recommended)

```bash
cd infra
docker-compose -f docker-compose.dev.yml up
```

Access the application:
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **Prometheus**: http://localhost:9090

### Run Locally

```bash
# Terminal 1: Backend
cd backend
pip install -e .[dev]
uvicorn app.main:app --reload

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Next.js Frontend                          │
│                    (SSE streaming, Zustand state)                 │
└─────────────────────────────┬────────────────────────────────────┘
                              │ HTTP/SSE
┌─────────────────────────────▼────────────────────────────────────┐
│                         FastAPI Backend                           │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Routers   │  │  Services   │  │   Agents    │              │
│  │  (outline,  │──│  (chapter,  │──│  (concept,  │              │
│  │  chapters,  │  │  continuity,│  │  outline,   │              │
│  │  export)    │  │  export)    │  │  writer,    │              │
│  └─────────────┘  └─────────────┘  │  editor,    │              │
│                                     │  continuity)│              │
│                                     └──────┬──────┘              │
└────────────────────────────────────────────┼─────────────────────┘
                                             │
┌────────────────────────────────────────────▼─────────────────────┐
│                          LiteLLM Router                           │
│                                                                   │
│     ┌─────────┐      ┌─────────┐      ┌─────────┐               │
│     │ GPT-4/5 │      │ Claude  │      │ Gemini  │               │
│     │(primary)│ ───▶ │(fallback│ ───▶ │(overflow│               │
│     └─────────┘      └─────────┘      └─────────┘               │
└───────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  PostgreSQL   │    │     Redis     │    │  Prometheus   │
│  (projects,   │    │   (cache,     │    │   (metrics,   │
│   artifacts)  │    │  rate limits) │    │   monitoring) │
└───────────────┘    └───────────────┘    └───────────────┘
```

## API Reference

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/projects` | POST | Create a new book project |
| `/api/v1/projects/{id}/outline/stream` | GET | Stream outline generation |
| `/api/v1/projects/{id}/chapters/{n}/generate/stream` | POST | Stream chapter generation |
| `/api/v1/projects/{id}/chapters/{n}/edit/stream` | POST | Stream editorial pass |
| `/api/v1/projects/{id}/continuity/check` | POST | Run continuity validation |
| `/api/v1/projects/{id}/export` | GET | Export manuscript |

### SSE Event Format

```typescript
// Token stream
{ "event": "token", "data": "The story begins..." }

// Progress checkpoint
{ "event": "checkpoint", "data": {"stage": "writing", "progress": 0.45} }

// Completion
{ "event": "complete", "data": {"tokens": 3500, "duration": 12.3} }
```

## Agent System

The agent system uses a thin abstraction over LiteLLM:

```python
from app.agents import BookPipeline

pipeline = BookPipeline(model="gpt-4")

# Generate a complete book
async for item in pipeline.generate_book(
    brief="A detective novel set in 1920s Chicago",
    num_chapters=12
):
    if isinstance(item, GenerationProgress):
        print(f"Stage: {item.stage}, Progress: {item.progress}")
    elif isinstance(item, Chapter):
        print(f"Chapter {item.number}: {item.title}")
```

### Custom Agents

Create specialized agents with structured outputs:

```python
from app.agents import Agent, AgentConfig
from pydantic import BaseModel

class CharacterProfile(BaseModel):
    name: str
    background: str
    motivations: list[str]

config = AgentConfig(
    role="character_designer",
    system_prompt="You create detailed character profiles...",
    model="gpt-4",
    temperature=0.8
)

agent = Agent(config, response_model=CharacterProfile)
profile = await agent.run("Create a villain for a noir mystery")
```

## Development

### Running Tests

```bash
cd backend

# Run all tests with coverage
pytest tests/ -v --cov=app

# Run specific test file
pytest tests/test_agents/test_orchestrator.py -v

# Run with parallel execution
pytest tests/ -n auto
```

Current test coverage: **86%** with **2280+ tests**

### Code Quality

```bash
cd backend

# Format code
black app tests

# Lint
ruff check app tests

# Type check
mypy app

# Run all checks
black app tests && ruff check app tests && mypy app && pytest tests/
```

### Frontend Development

```bash
cd frontend

npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # TypeScript validation
npm run test         # Run tests
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `GOOGLE_API_KEY` | Google AI API key | - |
| `DATABASE_URL` | PostgreSQL connection | `postgresql+asyncpg://postgres:postgres@localhost:5432/sopherai` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379/0` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | - |
| `MONTHLY_BUDGET_USD` | Cost limit per user | `100` |
| `PRIMARY_MODEL` | Default LLM model | `gpt-4` |
| `LOG_LEVEL` | Logging verbosity | `INFO` |

### Model Configuration

Configure model routing in code or via environment:

```python
pipeline = BookPipeline(
    model="gpt-4",
    fallback_models=["claude-3-opus", "gemini-pro"],
    temperature=0.7,
    max_tokens=4000
)
```

## Deployment

### Kubernetes (GKE)

```bash
# Build images
docker build -t ghcr.io/your-org/sopher-api:latest backend/
docker build -t ghcr.io/your-org/sopher-web:latest frontend/

# Push to registry
docker push ghcr.io/your-org/sopher-api:latest
docker push ghcr.io/your-org/sopher-web:latest

# Deploy
kubectl apply -f infra/k8s/

# Create secrets
kubectl create secret generic sopher-secrets \
  --from-literal=OPENAI_API_KEY=$OPENAI_API_KEY \
  --from-literal=JWT_SECRET=$(openssl rand -hex 32)
```

### Health Checks

| Endpoint | Purpose |
|----------|---------|
| `/healthz` | Basic health check |
| `/readyz` | Readiness probe (DB + Redis) |
| `/livez` | Liveness probe |

## Monitoring

Prometheus metrics available at `/api/metrics`:

- `llm_inference_seconds` - LLM response latency histogram
- `llm_tokens_total` - Token usage by model and agent
- `llm_cost_usd_total` - Cost tracking
- `active_sessions` - Concurrent generation sessions
- `cache_hits_total` / `cache_misses_total` - Cache efficiency

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests and linting (`pytest && ruff check && mypy app`)
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

The CI pipeline runs automatically on PRs - all checks must pass before merging.

## License

MIT License - see [LICENSE](LICENSE) for details.
