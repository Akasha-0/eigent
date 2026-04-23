---
title: Environment Variables
description: Complete reference for all trigger-related environment variables in Eigent.
icon: settings
---

This reference documents every environment variable that affects the trigger system. These are set in your deployment's environment (e.g., `.env` file, Docker environment, or Kubernetes config).

## Schedule Trigger Variables

Variables that control the Celery Beat poller for schedule-based triggers.

### `ENABLE_TRIGGER_SCHEDULE_POLLER_TASK`

**Type:** `bool` | **Default:** `"true"`

Enables or disables the Celery Beat task that polls for due schedule triggers. Set to `"false"` to pause all scheduled trigger firing without removing trigger configurations.

```bash
ENABLE_TRIGGER_SCHEDULE_POLLER_TASK=false
```

### `TRIGGER_SCHEDULE_POLLER_INTERVAL`

**Type:** `int` | **Default:** `"1"` (minutes)

How often the Celery Beat scheduler checks for due triggers. Lower values mean tighter scheduling precision but higher database load.

```bash
TRIGGER_SCHEDULE_POLLER_INTERVAL=2  # Check every 2 minutes
```

<aside>

**📌 Performance Tip:** In high-volume deployments, increase this value to reduce database load. A 5-minute interval still provides adequate precision for most scheduled workflows.

</aside>

### `TRIGGER_SCHEDULE_POLLER_BATCH_SIZE`

**Type:** `int` | **Default:** `"100"`

Number of due triggers fetched from the database per poll cycle. Tune this based on your expected trigger volume and database capacity.

```bash
TRIGGER_SCHEDULE_POLLER_BATCH_SIZE=200
```

### `TRIGGER_SCHEDULE_MAX_DISPATCH_PER_TICK`

**Type:** `int` | **Default:** `"0"` (unlimited)

Maximum number of triggers dispatched per poller tick. Set to `"0"` for unlimited dispatches. Use this to cap concurrent executions during peak load.

```bash
TRIGGER_SCHEDULE_MAX_DISPATCH_PER_TICK=50  # Dispatch at most 50 triggers per tick
```

## Execution Timeout Variables

Variables that control how long a trigger execution can remain in `pending` or `running` state before being marked as `missed` or `failed`.

### `EXECUTION_PENDING_TIMEOUT_SECONDS`

**Type:** `int` | **Default:** `"60"` (seconds)

Seconds before a `pending` execution is marked `missed`. A trigger execution transitions to `pending` when created but not yet picked up by a Celery worker.

```bash
EXECUTION_PENDING_TIMEOUT_SECONDS=120  # Allow 2 minutes before marking missed
```

### `EXECUTION_RUNNING_TIMEOUT_SECONDS`

**Type:** `int` | **Default:** `"600"` (seconds)

Seconds before a `running` execution is marked `failed`. A trigger execution transitions to `running` when a Celery worker picks it up.

```bash
EXECUTION_RUNNING_TIMEOUT_SECONDS=1800  # Allow 30 minutes for long-running agents
```

<aside>

**📌 Timeout Tuning:** Increase these values for workflows that involve long-running AI agent tasks, external API calls, or large document processing. Decreasing them helps catch stalled executions faster in low-latency environments.

</aside>

## Execution Timeout Checker Variables

Variables that control the Celery Beat task responsible for marking stale executions.

### `ENABLE_EXECUTION_TIMEOUT_CHECKER`

**Type:** `bool` | **Default:** `"true"`

Enables or disables the Celery Beat task that marks timed-out executions. Set to `"false"` to disable timeout enforcement.

```bash
ENABLE_EXECUTION_TIMEOUT_CHECKER=false
```

### `EXECUTION_TIMEOUT_CHECKER_INTERVAL`

**Type:** `int` | **Default:** `"1"` (minutes)

How often the timeout checker runs. This should be equal to or greater than your smallest timeout threshold to avoid redundant processing.

```bash
EXECUTION_TIMEOUT_CHECKER_INTERVAL=2  # Check every 2 minutes
```

## Webhook Trigger Variables

Variables that affect webhook and Slack-based triggers.

### `WEBHOOK_REQUEST_TIMEOUT_SECONDS`

**Type:** `int` | **Default:** `"30"` (seconds)

Timeout for inbound webhook requests. If an incoming webhook request takes longer than this, it is terminated and the trigger is not fired.

```bash
WEBHOOK_REQUEST_TIMEOUT_SECONDS=15  # Faster failure for slow senders
```

## Global Rate Limiting Variables

Variables that apply to all trigger types (schedule, webhook, and Slack).

### `TRIGGER_RATE_LIMIT_WINDOW_SECONDS`

**Type:** `int` | **Default:** `"3600"` (1 hour)

Sliding window for per-trigger hourly rate limiting. Controls how far back the system looks when counting executions for `max_executions_per_hour`.

```bash
TRIGGER_RATE_LIMIT_WINDOW_SECONDS=1800  # 30-minute window instead of 1 hour
```

## Quick Reference

| Variable | Default | Description |
|---|---|---|
| `ENABLE_TRIGGER_SCHEDULE_POLLER_TASK` | `"true"` | Enable the schedule trigger poller Celery task |
| `TRIGGER_SCHEDULE_POLLER_INTERVAL` | `"1"` | Poller interval in minutes |
| `TRIGGER_SCHEDULE_POLLER_BATCH_SIZE` | `"100"` | Number of due triggers fetched per poll |
| `TRIGGER_SCHEDULE_MAX_DISPATCH_PER_TICK` | `"0"` | Max triggers dispatched per tick (`0` = unlimited) |
| `ENABLE_EXECUTION_TIMEOUT_CHECKER` | `"true"` | Enable execution timeout checker |
| `EXECUTION_TIMEOUT_CHECKER_INTERVAL` | `"1"` | Timeout checker interval in minutes |
| `EXECUTION_PENDING_TIMEOUT_SECONDS` | `"60"` | Seconds before a pending execution is marked `missed` |
| `EXECUTION_RUNNING_TIMEOUT_SECONDS` | `"600"` | Seconds before a running execution is marked `failed` |
| `WEBHOOK_REQUEST_TIMEOUT_SECONDS` | `"30"` | Seconds before an inbound webhook request times out |
| `TRIGGER_RATE_LIMIT_WINDOW_SECONDS` | `"3600"` | Sliding window for hourly rate limiting |

## What's next?

- [Schedule Trigger](/core/triggers/schedule-trigger) — Learn about time-based triggers using cron expressions.
- [Webhook Trigger](/core/triggers/webhook-trigger) — Learn about event-driven triggers via HTTP endpoints.
- [Trigger System Architecture](/core/triggers/architecture) — Understand the full execution pipeline, rate limiting, and app handlers.