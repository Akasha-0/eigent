# API Documentation

Eigent provides a REST API for external integrations.

## Running the API Server

```bash
cd server
uvicorn app:api --host 0.0.0.0 --port 8000 --reload
```

## OpenAPI/Swagger UI

Once running, access:
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc
- **OpenAPI JSON:** http://localhost:8000/openapi.json

## Authentication

Currently uses internal session-based auth. For external API access, use the built-in token system.

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/...` | Main API routes |
| `GET` | `/health` | Health check |

## Rate Limiting

The API includes rate limiting via Redis. Default limits:
- 100 requests per minute for authenticated users
- 20 requests per minute for unauthenticated requests

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `redis_url` | Redis connection URL | Required |
| `api_host` | API host | `0.0.0.0` |
| `api_port` | API port | `8000` |

## Adding New Endpoints

Create controllers in `app/domains/` following the domain-driven structure:

```python
from fastapi import APIRouter

router = APIRouter()

@router.get("/my-endpoint")
async def my_endpoint():
    return {"message": "Hello"}
```

---

*For detailed endpoint documentation, see the Swagger UI at `/docs`*