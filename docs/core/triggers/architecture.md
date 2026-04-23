---
title: Trigger System Architecture
description: Understand the architecture, execution pipeline, and trigger types in Eigent's trigger system.
icon: zap
---

## Concept: What is the Trigger System?

Eigent's trigger system is a background processing engine that lets you automate workflows based on schedules, webhooks, or external events. Triggers connect external events or time-based schedules to AI agent executions, enabling fully automated pipelines without manual intervention.

Instead of manually running agents, you define a trigger—specifying when it should fire and what it should do—then let the system handle execution, retries, rate limiting, and observability.

<aside>
**📌 Key capabilities of the trigger system:**

- Schedule-based execution using cron expressions
- Webhook-driven execution via HTTP endpoints
- Slack event-driven execution (mentions, messages, file shares)
- Built-in rate limiting (hourly/daily per trigger)
- Automatic retry and timeout handling
- Real-time execution status via WebSockets
- Auto-disable on repeated failures

</aside>

## System Design

### **Architecture: How Triggers Work**

The trigger system uses a layered, service-oriented architecture with Celery for background processing.
![Trigger System](/docs/images/trigger_architecture.jpg)

The system is organized into four main layers:

- **API Layer** (`app/domains/trigger/api/`): HTTP endpoints for trigger CRUD, webhook ingestion, Slack events, and execution management.
- **Service Layer** (`app/domains/trigger/service/`): Business logic including `TriggerService`, `TriggerScheduleService`, `TriggerCrudService`, and `AppHandlerService`.
- **Model Layer** (`app/model/trigger/`): Data models for `Trigger` and `TriggerExecution`, plus trigger-type-specific config classes.
- **Celery Layer** (`app/core/celery.py` + `app/domains/trigger/service/trigger_schedule_task.py`): Background task scheduling and execution polling.

### **Execution Pipeline: From Trigger to Agent**

When a trigger fires, the system follows a deterministic pipeline:

1. **Event Source**: A scheduled poll, an inbound HTTP webhook, or a Slack event arrives at the API layer.
2. **Handler Lookup**: The appropriate `BaseAppHandler` subclass is resolved via `get_app_handler()` based on the trigger type.
3. **Filtering & Validation**: The handler applies filtering logic (`matches_filter`, `has_required_headers`, `should_trigger`) and validates activation requirements.
4. **Rate Limit Check**: `check_rate_limits()` evaluates the trigger's `max_executions_per_hour` and `max_executions_per_day` limits against recent execution counts.
5. **Execution Creation**: `TriggerService.create_execution()` creates a `TriggerExecution` record with status `pending`.
6. **Celery Dispatch**: The trigger is dispatched via `TriggerScheduleService.dispatch_trigger()`, which publishes execution details to Redis.
7. **Agent Execution**: A worker picks up the execution, runs the agent task, and updates the execution record.
8. **Status Publication**: Updated status is pushed via WebSocket to subscribed clients.
9. **Timeout Guard**: `check_execution_timeouts()` periodically marks stale executions as `missed` or `failed`.

### **Celery Beat Scheduler: Polling Loop**

Scheduled triggers are polled by a Celery Beat task defined in `app/core/celery.py`:

```python
# Enabled via ENABLE_TRIGGER_SCHEDULE_POLLER_TASK (default: true)
# Interval controlled by TRIGGER_SCHEDULE_POLLER_INTERVAL (default: 1 minute)
```

The poller task (`poll_trigger_schedules`) calls `TriggerScheduleService.poll_and_execute_due_triggers()`:

1. Fetches triggers where `next_run_at <= now` (batch size: `TRIGGER_SCHEDULE_POLLER_BATCH_SIZE`, default 100).
2. For each due trigger: checks rate limits, dispatch if allowed, updates `next_run_at` (re-calculated via `croniter`).
3. Returns a tuple of `(dispatched_count, rate_limited_count)`.

An additional task (`check_execution_timeouts`) runs periodically to catch executions that stalled:

- **Pending timeout**: `EXECUTION_PENDING_TIMEOUT_SECONDS` (default: 60s) — marks as `missed`.
- **Running timeout**: `EXECUTION_RUNNING_TIMEOUT_SECONDS` (default: 600s) — marks as `failed`.

<aside>

**📌 Tip:** Increase `TRIGGER_SCHEDULE_POLLER_INTERVAL` in high-volume deployments to reduce database load, and tune `TRIGGER_SCHEDULE_MAX_DISPATCH_PER_TICK` to cap concurrent dispatches.

</aside>

## Trigger Types

Eigent supports three trigger types, each driven by a dedicated configuration class registered in the config registry.

### ScheduleTriggerConfig

_A trigger that executes on a recurring cron schedule or a one-time date._

**Config Fields:**

- `date` — One-time execution date in `YYYY-MM-DD` format. Cleared after execution.
- `expirationDate` — End date for recurring schedules (`YYYY-MM-DD`). Triggers past this date stop firing.
- `max_failure_count` — Number of consecutive failures before auto-disable (1–100).
- `message_filter` — Optional regex pattern; only fires if the trigger prompt matches.

**Key Methods:**

- `is_expired()` — Checks if the trigger is past its `expirationDate`.
- `should_execute()` — Returns `(bool, str)` — whether to execute and the reason.

**Scheduling Logic:** Next run times are calculated using the `croniter` library from the trigger's `custom_cron_expression` field. One-time schedules use the `date` field only.

### WebhookTriggerConfig

_A trigger that fires when an HTTP request hits the trigger's unique webhook URL._

**Config Fields:**

- `authentication_required` — Whether to require a valid signature (default: `False`).
- `body_contains` — Optional substring that must appear in the request body.
- `required_headers` — List of HTTP headers that must be present.
- `header_match` — Regex pattern for a header value (format: `"Header-Name: pattern"`).
- `include_headers` — Whether to pass request headers into the execution context.
- `include_query_params` — Whether to pass query parameters into the execution context (default: `True`).
- `include_request_metadata` — Whether to include IP, user-agent, and timing metadata.
- `max_failure_count` / `message_filter` — Inherited from `BaseTriggerConfig`.

**Key Methods:**

- `matches_body_filter()` — Checks if the request body contains the required substring.
- `has_required_headers()` — Verifies all required headers are present.
- `matches_header_pattern()` — Validates header values against the regex pattern.
- `should_trigger()` — Aggregates all checks; returns `(bool, reason)`.

**Webhook Endpoint:** `GET/POST /v1/webhook/trigger/{webhook_uuid}`

### SlackTriggerConfig

_A trigger that fires when a Slack event matches the configured filters._

**Config Fields:**

- `events` — List of `SlackEventType` values: `ANY`, `APP_MENTION`, `MESSAGE`, `FILE_SHARED`, and others.
- `channel_id` — Restrict firing to a specific Slack channel.
- `ignore_bot_messages` — Skip events from bot users (default: `True`).
- `ignore_users` — List of user IDs to ignore.
- `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` — Credentials required for Slack event processing.

**Key Methods:**

- `should_trigger()` — Checks event type, channel, bot filter, and user exclusions.
- `get_required_config_group()` — Returns `ConfigGroup.SLACK`.
- `get_required_credentials()` — Returns `["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"]`.

**Slack Event Types:** `ANY`, `APP_MENTION`, `MESSAGE`, `FILE_SHARED`, `APP_HOME_OPENED`, `APP_UNINSTALLED`, `TOKENS_REVOKED`, `MEMBER_JOINED_CHANNEL`, `REACTION_ADDED`, `MESSAGE_CHANNELS`, `MESSAGE_GROUPS`, `MESSAGE_IM`, `MESSAGE_MPIM`, `LINK_SHARED`

## Rate Limiting

The trigger system enforces per-trigger rate limits before dispatching an execution:

```python
# server/app/core/trigger_utils.py

def check_rate_limits(session, trigger) -> bool:
    """
    Returns True if the trigger is within its rate limits, False if blocked.
    Checks:
    - Hourly: count executions in the last 60 minutes vs max_executions_per_hour
    - Daily: count executions in the last 24 hours vs max_executions_per_day
    """
```

**How rate limiting works in the schedule pipeline:**

- `TriggerScheduleService.process_schedules()` calls `check_rate_limits()` for each due trigger.
- If rate limited, the trigger is skipped but its `next_run_at` is still updated—preventing repeated re-fetching.
- In the webhook path (`webhook_controller.py`), a `429 Too Many Requests` response is returned immediately if rate limited.

**Environment Variables:**

| Variable | Default | Description |
|---|---|---|
| `TRIGGER_SCHEDULE_MAX_DISPATCH_PER_TICK` | `0` (unlimited) | Max triggers dispatched per poller tick |
| `TRIGGER_SCHEDULE_POLLER_BATCH_SIZE` | `100` | Number of due triggers fetched per poll |

## App Handlers

Each trigger type has a corresponding `BaseAppHandler` subclass that encapsulates the event-source-specific logic. Handlers are registered in `app_handler_service.py`:

```python
_HANDLERS: dict[TriggerType, BaseAppHandler] = {
    TriggerType.slack_trigger: SlackAppHandler(),
    TriggerType.webhook: DefaultWebhookHandler(),
    TriggerType.schedule: ScheduleAppHandler(),
}

def get_app_handler(trigger_type: TriggerType) -> Optional[BaseAppHandler]
def register_app_handler(trigger_type: TriggerType, handler: BaseAppHandler)
```

**`BaseAppHandler` interface:**

- `authenticate()` — Validates the incoming request (signature, tokens, Slack signing secret).
- `filter_event()` — Applies type-specific filtering (body content, headers, Slack event types).
- `normalize_payload()` — Extracts and structures the relevant data for the execution context.
- `check_activation_requirements()` — Verifies the trigger has all required credentials/config groups before firing.

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `ENABLE_TRIGGER_SCHEDULE_POLLER_TASK` | `"true"` | Enable the scheduled trigger poller Celery task |
| `TRIGGER_SCHEDULE_POLLER_INTERVAL` | `"1"` | Poller interval in minutes |
| `ENABLE_EXECUTION_TIMEOUT_CHECKER` | `"true"` | Enable execution timeout checker |
| `EXECUTION_TIMEOUT_CHECKER_INTERVAL` | `"1"` | Timeout checker interval in minutes |
| `TRIGGER_SCHEDULE_MAX_DISPATCH_PER_TICK` | `"0"` | Max triggers dispatched per tick (`0` = unlimited) |
| `TRIGGER_SCHEDULE_POLLER_BATCH_SIZE` | `"100"` | Batch size for fetching due triggers |
| `EXECUTION_PENDING_TIMEOUT_SECONDS` | `"60"` | Seconds before a pending execution is marked `missed` |
| `EXECUTION_RUNNING_TIMEOUT_SECONDS` | `"600"` | Seconds before a running execution is marked `failed` |

## Adding a New Trigger Type

The trigger system is designed to be extensible. Follow these steps to add a new trigger type (e.g., a cron-based or email-based trigger):

### Step 1: Define the Trigger Type

Add a new value to the `TriggerType` enum in `server/app/shared/types/trigger_types.py`:

```python
class TriggerType(StrEnum):
    schedule = "schedule"
    webhook = "webhook"
    slack_trigger = "slack_trigger"
    new_trigger = "new_trigger"  # Add here
```

Also add a corresponding `ExecutionType` value if needed.

### Step 2: Create a Config Class

Create a new file in `server/app/model/trigger/app_configs/` (e.g., `new_config.py`):

```python
from app.model.trigger.app_configs.base_config import BaseTriggerConfig

class NewTriggerConfig(BaseTriggerConfig):
    # Fields specific to this trigger type

    def get_required_config_group(self) -> Optional[ConfigGroup]:
        return None

    def get_required_credentials(self) -> List[str]:
        return []
```

Register it in `server/app/model/trigger/app_configs/config_registry.py`:

```python
from app.shared.types.trigger_types import TriggerType
from app.model.trigger.app_configs.new_config import NewTriggerConfig

_CONFIG_REGISTRY: Dict[TriggerType, Type[BaseTriggerConfig]] = {
    # ... existing ...
    TriggerType.new_trigger: NewTriggerConfig,
}
```

### Step 3: Create an App Handler

Add a new `BaseAppHandler` subclass in `app_handler_service.py`:

```python
class NewTriggerAppHandler(BaseAppHandler):
    trigger_type = TriggerType.new_trigger
    execution_type = ExecutionType.webhook  # or appropriate type

    async def authenticate(self, request, body, trigger, session):
        # Validate the incoming event
        pass

    async def filter_event(self, payload, trigger):
        # Apply type-specific filtering
        pass

    def normalize_payload(self, payload, trigger, request_meta=None):
        # Structure data for the execution context
        pass

_HANDLERS[TriggerType.new_trigger] = NewTriggerAppHandler()
```

### Step 4: Add an API Endpoint

Create a new controller in `app/domains/trigger/api/` (e.g., `new_trigger_controller.py`) and register the router in the FastAPI app.

### Step 5: Update Exports

Update `server/app/model/trigger/app_configs/__init__.py` to export the new config class.

<aside>

**📌 Design Pattern:** The trigger system uses a **registry pattern** for config classes and handlers, and a **factory pattern** for service instantiation. Follow these patterns to maintain consistency when extending the system.

</aside>
