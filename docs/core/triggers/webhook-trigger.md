---
title: Webhook Trigger
description: Configure webhook triggers to fire agent executions from inbound HTTP requests.
icon: webhook
---

A webhook trigger fires when an HTTP request hits the trigger's unique endpoint. Once configured, Eigent validates the request, applies optional filtering rules, and dispatches an agent execution — giving you a powerful way to integrate any system that can make an HTTP call.

This reference covers the full configuration model, request validation, execution flow, and configuration options.

## WebhookTriggerConfig

The `WebhookTriggerConfig` class (`app/model/trigger/app_configs/webhook_config.py`) drives all webhook-based triggers.

```python
from app.model.trigger.app_configs.webhook_config import WebhookTriggerConfig
```

### Config Fields

| Field | Type | Description |
|---|---|---|
| `authentication_required` | `bool` | Whether to require a valid signature in the request (default: `False`). |
| `body_contains` | `str \| None` | Substring that must appear somewhere in the request body for the trigger to fire. |
| `required_headers` | `List[str] \| None` | List of HTTP header names that must be present in the request. |
| `header_match` | `str \| None` | Regex pattern with format `"Header-Name: pattern"`. The named header value must match the regex. |
| `include_headers` | `bool` | Whether to pass the request headers into the execution context (default: `False`). |
| `include_query_params` | `bool` | Whether to pass query parameters into the execution context (default: `True`). |
| `include_request_metadata` | `bool` | Whether to include IP address, user-agent, and request timing metadata (default: `False`). |
| `max_failure_count` | `int` | Number of consecutive failures before the trigger is auto-disabled (range: 1–100). Inherited from `BaseTriggerConfig`. |
| `message_filter` | `str \| None` | Optional regex pattern. The trigger only fires if the trigger prompt matches this pattern at execution time. |

### Key Methods

- `matches_body_filter(body)` — Returns `True` if the request body contains the required `body_contains` substring.
- `has_required_headers(headers)` — Verifies all headers in `required_headers` are present in the incoming request.
- `matches_header_pattern(headers)` — Validates the header specified in `header_match` against its regex pattern.
- `should_trigger(body, headers)` — Aggregates all filter checks; returns `(bool, reason)` where reason explains why the trigger was blocked (e.g. `"missing_header"`, `"body_mismatch"`, `"ok"`).
- `get_required_config_group()` — Returns `None` (webhook triggers have no required config group unless `authentication_required` is set).
- `get_required_credentials()` — Returns `[]` by default. If `authentication_required` is `True`, returns `["WEBHOOK_SECRET"]`.

## Configuring a Webhook Trigger

### Step 1: Set the Trigger Type

In the trigger creation API, set `trigger_type` to `"webhook"`.

```json
{
  "trigger_type": "webhook",
  "name": "CI Pipeline Notifier",
  "trigger_prompt": "Analyze the CI pipeline failure and summarize the error for the engineering team."
}
```

### Step 2: Get the Webhook URL

After creating the trigger, copy its unique webhook URL from the trigger detail view. The URL follows this pattern:

```
GET/POST /v1/webhook/trigger/{webhook_uuid}
```

Every webhook trigger is assigned a UUID that uniquely identifies it. Send HTTP requests to this URL to fire the trigger.

### Step 3: Add Filtering Rules (Optional)

**Filter by body content:**

```json
{
  "webhook_config": {
    "body_contains": "deploy_failed",
    "max_failure_count": 3
  }
}
```

**Filter by required headers:**

```json
{
  "webhook_config": {
    "required_headers": ["X-GitHub-Event", "X-GitHub-Delivery"],
    "max_failure_count": 5
  }
}
```

**Filter by header regex:**

```json
{
  "webhook_config": {
    "header_match": "X-GitHub-Event: (push|pull_request)",
    "max_failure_count": 5
  }
}
```

**Combine filters** — all filters must pass for the trigger to fire:

```json
{
  "webhook_config": {
    "required_headers": ["X-GitHub-Event"],
    "header_match": "X-GitHub-Event: push",
    "body_contains": "refs/heads/main",
    "max_failure_count": 5
  }
}
```

### Step 4: Enable Request Metadata Passthrough

To pass request details into the agent's execution context:

```json
{
  "webhook_config": {
    "include_headers": true,
    "include_query_params": true,
    "include_request_metadata": true,
    "max_failure_count": 3
  }
}
```

When enabled, the agent receives:
- **Headers** — all HTTP headers from the inbound request.
- **Query params** — URL query string parameters.
- **Metadata** — client IP address, user-agent string, and request timestamp.

### Step 5: Require Request Authentication

Set `authentication_required` to `True` to require a signature in every request. The trigger expects a valid signature generated using the `WEBHOOK_SECRET` credential.

Requests without a valid signature receive a `401 Unauthorized` response.

```json
{
  "webhook_config": {
    "authentication_required": true,
    "max_failure_count": 3
  }
}
```

<aside>

**📌 Generating a Signature**

When `authentication_required` is `True`, sign your webhook payload using HMAC-SHA256 with the `WEBHOOK_SECRET` as the key. Include the signature in the `X-Webhook-Signature` header as `sha256=<hex_digest>`. The handler accepts both raw body and JSON-encoded payloads.

</aside>

## Execution Flow

When an HTTP request arrives at a webhook endpoint, the system follows this pipeline:

1. **Request reception** — The FastAPI webhook controller (`app/domains/trigger/api/webhook_controller.py`) receives the request at `/v1/webhook/trigger/{webhook_uuid}`.
2. **Handler lookup** — `get_app_handler(TriggerType.webhook)` resolves the `DefaultWebhookHandler`.
3. **UUID lookup** — The handler looks up the trigger by its `webhook_uuid` in the database.
4. **Authentication check** — If `authentication_required` is `True`, the handler validates the `X-Webhook-Signature` header against the stored `WEBHOOK_SECRET`.
5. **Filter checks** — `WebhookTriggerConfig.should_trigger()` evaluates `required_headers`, `header_match`, and `body_contains`.
6. **Rate limit check** — `check_rate_limits()` evaluates `max_executions_per_hour` and `max_executions_per_day`. If exceeded, a `429 Too Many Requests` response is returned immediately.
7. **Payload normalization** — The handler calls `normalize_payload()` to extract headers, query params, and metadata (if enabled).
8. **Execution creation** — `TriggerService.create_execution()` creates a `TriggerExecution` record with status `pending`.
9. **Celery dispatch** — The execution is dispatched via Redis to a Celery worker.
10. **Agent execution** — The worker picks up the task, runs the agent, and updates the execution record.
11. **Status publication** — Updated status is pushed via WebSocket to subscribed clients.

## Response Codes

| Status | Meaning |
|---|---|
| `200 OK` | Trigger fired successfully. Execution created and dispatched. |
| `400 Bad Request` | Missing required fields or malformed request. |
| `401 Unauthorized` | `authentication_required` is `True` and the signature is invalid or missing. |
| `404 Not Found` | No trigger found for the given `webhook_uuid`. |
| `422 Unprocessable Entity` | UUID is not a valid UUID format. |
| `429 Too Many Requests` | Rate limit exceeded for this trigger. |

## Auto-Disable on Failure

The `max_failure_count` field protects against runaway or misconfigured triggers. After `max_failure_count` consecutive failures, the trigger is automatically disabled and requires manual re-enabling.

A failure is any execution that ends in `failed` or `missed` status (not `completed` or `cancelled`).

<aside>

**📌 Note on Auto-Disable**

Auto-disable only counts *consecutive* failures. A successful execution between failures resets the counter. To re-enable a disabled trigger, go to the **Triggers** page in the Eigent UI and click **Enable**.

</aside>

## Rate Limiting

Webhook triggers respect per-trigger rate limits defined at the trigger level:

- `max_executions_per_hour` — Maximum executions in any 60-minute sliding window.
- `max_executions_per_day` — Maximum executions in any 24-hour sliding window.

When rate limited, the API responds immediately with `429 Too Many Requests` without creating an execution record.

## Environment Variables

The following environment variables affect webhook trigger behavior:

| Variable | Default | Description |
|---|---|---|
| `EXECUTION_PENDING_TIMEOUT_SECONDS` | `"60"` | Seconds before a `pending` execution is marked `missed`. |
| `EXECUTION_RUNNING_TIMEOUT_SECONDS` | `"600"` | Seconds before a `running` execution is marked `failed`. |

## Testing a Webhook Trigger

### Using curl

**Basic trigger fire (no auth):**

```bash
curl -X POST https://your-eigent-server.com/v1/webhook/trigger/your-webhook-uuid \
  -H "Content-Type: application/json" \
  -d '{"event": "deploy_failed", "pipeline": "production", "error": "Exit code 1"}'
```

**With a signature (when `authentication_required` is `True`):**

```bash
# Generate signature (example in bash)
PAYLOAD='{"event":"deploy_failed"}'
SECRET="your-webhook-secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print "sha256=" $2}')

curl -X POST https://your-eigent-server.com/v1/webhook/trigger/your-webhook-uuid \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Testing with Query Params

Since `include_query_params` defaults to `True`, query params are passed to the agent by default:

```bash
curl -X GET "https://your-eigent-server.com/v1/webhook/trigger/your-webhook-uuid?build_id=1234&branch=main"
```

## Troubleshooting

**Trigger returns 404 Not Found.** Verify the `webhook_uuid` is correct and the trigger exists in Eigent. Check that the trigger is enabled (not manually disabled or auto-disabled due to failures).

**Trigger returns 401 Unauthorized.** Ensure `authentication_required` matches your request. If set to `True`, include a valid `X-Webhook-Signature` header. If set to `False`, remove any existing signature headers or ensure they are not being rejected.

**Trigger returns 429 Too Many Requests.** The trigger has exceeded its hourly or daily execution limit. Wait until the sliding window resets, or increase `max_executions_per_hour` / `max_executions_per_day` on the trigger.

**Trigger fires but nothing happens.** Check the agent task the trigger is connected to. A `failed` execution may indicate an agent error rather than a trigger error.

**body_contains filter is not matching.** The `body_contains` filter performs a simple substring match, not a regex. Ensure the exact substring is present in the request body. Note that for JSON payloads, the body must be a string (raw), not a re-encoded JSON string.

**header_match filter is not working.** The `header_match` format is `"Header-Name: pattern"` (colon-separated). For example: `"X-GitHub-Event: push"`. Only one header can be matched per `header_match` field.

## What's next?

- [Schedule Trigger](/core/triggers/schedule-trigger) — Learn about time-based triggers using cron expressions.
- [Trigger System Architecture](/core/triggers/architecture) — Understand the full execution pipeline, rate limiting, and app handlers.
- [Environment Variables](/core/triggers/environment-variables) — Full reference for all trigger-related environment variables.