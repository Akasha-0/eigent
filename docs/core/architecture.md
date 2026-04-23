---
title: Architecture
description: A system-wide overview of how Eigent's services interact, from the frontend to the backend and server components.
icon: server
---

## Overview

Eigent is built around three core services that work together to power AI-driven task automation:

- **Frontend** — An Electron desktop app (TypeScript/React) that provides the user interface.
- **Backend** — A proxy service (Node.js/Express) that bridges the frontend to external services and forwards API calls.
- **Server** — The main application service (Python/FastAPI) that owns all business logic, data persistence, and background job scheduling.

Understanding how these three pieces communicate is the foundation for contributing to or extending Eigent.

## Services at a Glance

### Frontend (`/`)

The Electron desktop app renders the UI, manages user sessions, and communicates with both the backend proxy and the server directly depending on the operation type.

- **Technology**: Electron, React, TypeScript, Zustand (state), Tailwind CSS
- **Key stores**: `authStore`, `activityLogStore`
- **API layer**: `src/api/http.ts` — wraps `fetch` with auth headers, token injection, and error handling

### Backend (`backend/`)

A lightweight Node.js proxy that sits in front of the server. It handles cross-cutting concerns like rate limiting, CORS, and forwarding long-running or external API calls. The backend is also the entry point for cloud model requests that need to be routed to third-party AI providers.

- **Technology**: Node.js, Express, TypeScript
- **Role**: API gateway, proxy router, external service integration
- **Key files**: `backend/src/...` — service-specific proxy modules

### Server (`server/`)

The Python FastAPI application that owns all business logic. It exposes over 110 API routes across multiple domain modules and runs background workers via Celery Beat.

- **Technology**: Python 3.11+, FastAPI, SQLModel, Celery, Redis, Loguru
- **Architecture**: Domain-driven (see [Domain Layout](#server-domain-layout))
- **Key entry**: `server/main.py`

## Data Flow Between Services

### Direct frontend → server calls

Short-lived, synchronous operations (e.g., trigger CRUD, MCP catalog browsing) go directly from the frontend to the server via `src/api/http.ts`:

```
Frontend (Electron)
  └─▶ GET /v1/trigger/          ──▶ Server (FastAPI)
  └─▶ POST /v1/mcp/install      ──▶ Server (FastAPI)
```

The frontend resolves the server's port at runtime via `window.ipcRenderer.invoke('get-backend-port')`, then routes to `http://localhost:{port}/v1/...`.

### Frontend → backend proxy → server

Long-running operations, external service calls, or calls that require the backend's environment context use the proxy layer:

```
Frontend
  └─▶ proxyFetchGet(/api/v1/trigger/)
        └─▶ Backend proxy (Node.js)
              └─▶ Server (FastAPI)
```

The proxy URL is resolved from `VITE_PROXY_URL` in development and `VITE_BASE_URL` in production.

### MCP tool access from Workers

Workers running in the frontend receive their tool definitions from MCP servers managed by the server:

```
Server (McpUserService)
  ├─▶ MCP catalog: installed tools + metadata
  └─▶ Worker runtime: tools exposed via MCP protocol
```

The frontend's trigger/API layer (`src/service/triggerApi.ts`) is responsible for triggering worker tasks based on server-side scheduling decisions.

## Server Architecture

### Domain Layout (v0.0.89+)

The server is organized around business domains rather than technical layers. Each domain is a self-contained module under `server/app/domains/`:

```
server/app/
├── domains/
│   ├── mcp/           # MCP tool management, discovery, user installation
│   │   ├── api/       # mcp_controller, user_controller, proxy_controller
│   │   ├── model/     # Mcp, McpUser SQLModel tables
│   │   └── service/   # McpUserService, McpCatalogService
│   ├── trigger/       # Trigger lifecycle, scheduling, execution tracking
│   │   ├── api/       # trigger_controller, webhook_controller, execution_controller
│   │   ├── model/     # Trigger, TriggerExecution, ScheduleTriggerConfig
│   │   └── service/   # TriggerService, TriggerScheduleService, Celery tasks
│   ├── chat/          # Chat sessions and message handling
│   ├── config/        # App configuration and user preferences
│   ├── model_provider/  # AI model provider setup and routing
│   ├── oauth/         # OAuth integration
│   └── user/          # User management, authentication
├── api/               # Cross-domain API routes
├── core/              # Shared infrastructure (DB, Celery, i18n, validators)
└── shared/            # Exception handlers, middleware, utilities
```

### Auto-registered routes

Routes are automatically discovered and registered via `auto_include_routers()` in `server/main.py`. Any file named `*_controller.py` inside `app/domains/` or `app/api/` that exports an `APIRouter` is automatically mounted under `/v1/`. This keeps route registration declarative and reduces boilerplate as new domains are added.

### Database

The server uses SQLModel (built on SQLAlchemy) for all database operations. A shared `session_make()` utility provides scoped sessions for service-layer operations. All model definitions live alongside their domain under `domains/*/model/`.

## Background Jobs with Celery

The server uses Celery + Celery Beat for scheduled and long-running background tasks.

### Broker and Backend

Celery is configured in `server/app/core/celery.py`:

```python
celery = Celery(
    __name__,
    broker=env_or_fail("celery_broker_url"),    # e.g. Redis
    backend=env_or_fail("celery_result_url")    # e.g. Redis
)
```

### Beat Schedule

Two scheduled tasks are registered by default (both configurable via environment variables):

| Task | Interval | Queue | Purpose |
|------|----------|-------|---------|
| `poll-trigger-schedules` | Every N minutes (default 1) | `poll_trigger_schedules` | Scans for due schedule triggers and dispatches them |
| `check-execution-timeouts` | Every N minutes (default 1) | `check_execution_timeouts` | Marks executions that have exceeded their timeout window |

Both are defined in `server/app/domains/trigger/service/trigger_schedule_task.py` and auto-discovered via `celery.conf.imports`.

### Trigger Scheduling Flow

1. `poll_trigger_schedules` task runs on a Celery Beat schedule.
2. `TriggerScheduleService.fetch_due_schedules()` queries the database for triggers where `next_run_at <= now` and `status == active`.
3. For each due trigger, `dispatch_trigger()` creates a `TriggerExecution` record and recalculates the next run time using `croniter`.
4. Single-execution triggers are deactivated after dispatch; repeating triggers remain active.

The Celery Beat interval, individual trigger intervals, and timeout checker are all configurable via environment variables.

## MCP Tool Lifecycle

MCP (Model Context Protocol) tools extend what Workers can do by connecting them to external services — databases, APIs, file systems, and more. Eigent supports two MCP server types: **Local** (user-managed) and **Remote** (server-hosted).

### Discovery and Catalog

The server maintains an MCP catalog (`Mcp` table) with metadata about available tools. Workers browse this catalog via the frontend's MCP UI. Catalog entries include the tool name, key, description, and an `install_command` describing how to launch the tool.

### Installation (from Catalog)

1. User selects a tool from the catalog and clicks **Install**.
2. Frontend calls `POST /v1/mcp/{mcp_id}/install` via `mcpApi.ts`.
3. `McpUserService.install()` checks for a duplicate (`mcp_id` + `user_id`), parses the `install_command` JSON, and creates a `McpUser` record.
4. The tool becomes available to the user's Workers.

### Import (user-configured)

Users can also import their own MCP server configurations:

- **Local MCP**: User provides a `mcpServers` JSON object. `validate_mcp_servers()` parses and validates it. A `McpUser` record is created for each server.
- **Remote MCP**: User provides a server URL. `validate_mcp_remote_servers()` validates the remote endpoint and creates a `McpUser` of type `Remote`.

### Tool Access During Worker Runtime

When a Worker starts, the frontend retrieves the user's installed MCP tools and passes them to the Worker runtime. MCP servers are launched as subprocesses (for Local) or proxied (for Remote) and communicate with the Worker via the MCP protocol.

## Trigger and Scheduling System

Triggers allow Workers to run tasks automatically based on external events or schedules. Eigent supports multiple trigger types.

### Trigger Types

- **Schedule** — Time-based triggers using cron expressions. Managed by `TriggerScheduleService`.
- **Webhook** — Event-based triggers invoked by external HTTP calls. Routed through `webhook_controller.py`.
- **Slack** — Triggers invoked by Slack app events (Slash commands, interactive payloads).

### Trigger Lifecycle

1. **Create** — User configures a trigger via the frontend or API. `TriggerService.create()` stores the trigger in the `Trigger` table with `next_run_at` calculated from the cron expression.
2. **Activate** — User activates the trigger. Its `status` becomes `active`.
3. **Dispatch** — Celery Beat's `poll-trigger-schedules` task finds the trigger at `next_run_at`. A `TriggerExecution` record is created. `next_run_at` is recalculated for the next interval.
4. **Execute** — The trigger's configured action runs. For Worker-triggered tasks, this means sending an execution signal to the frontend via `src/service/triggerApi.ts`.
5. **Timeout** — Celery Beat's `check-execution-timeouts` task marks executions that have exceeded their configured window as `timed_out`.

### Integration with the Broader Architecture

Triggers are not isolated — they drive Worker activity. When a schedule trigger fires, the server creates a `TriggerExecution` record and the frontend receives a notification (via polling or WebSocket) that triggers a Worker task. The trigger thus acts as the bridge between the server's scheduling layer and the frontend's execution layer.

## Communication Patterns

| Pattern | Example |
|---------|---------|
| Frontend → Server (direct) | Browse MCP catalog, CRUD triggers |
| Frontend → Backend proxy → Server | Trigger execution dispatch, external AI calls |
| Server → Celery (async) | Scheduled trigger polling, timeout checking |
| Worker → MCP Server | Tool invocation at runtime |

## Security Notes

- All server routes require a `Bearer` token (JWT) obtained at login.
- MCP user installations are scoped per `user_id` — a user cannot access another user's MCP tools.
- MCP `install_command` JSON is validated before being stored or executed.
- Remote MCP server URLs are validated against a schema before import.

## Further Reading

- [Concepts](/core/concepts) — Understand Workers, Workforce, MCP, and more
- [Workers](/core/workers) — How Workers are configured and run
- [Tools](/core/tools) — MCP tools and external integrations
- [Models](/core/models/byok) — AI model configuration and provider routing