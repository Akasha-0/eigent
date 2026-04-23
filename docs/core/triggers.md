---
title: Triggers
description: Automate agent executions on schedules, webhooks, or external events.
icon: zap
---

Eigent's trigger system lets you automate agent executions based on schedules, inbound HTTP requests, or external events like Slack activity. Instead of manually running agents, you define a trigger — specifying when it should fire and what it should do — and let the system handle execution, retries, rate limiting, and observability.

This guide covers the three trigger types available in Eigent and how to configure them.

## Trigger Types

Eigent supports three trigger types, each driven by a dedicated configuration class and handler.

### Schedule Trigger

Fires automatically on a recurring cron schedule or a one-time date. Use this to automate recurring tasks like daily standup reminders, weekly report generation, or deferred one-time actions.

- [Read the Schedule Trigger guide](/core/triggers/schedule-trigger) →

### Webhook Trigger

Fires when an HTTP request hits the trigger's unique endpoint. Use this to integrate Eigent with CI/CD pipelines, monitoring tools, or any system that can make an outbound HTTP call.

- [Read the Webhook Trigger guide](/core/triggers/webhook-trigger) →

### Slack Trigger

Fires when a Slack event matches your configured filters — such as app mentions, channel messages, or file shares. Use this to give your workforce a conversational interface via Slack. See [Architecture](/core/triggers/architecture) for details on the SlackTriggerConfig.

## Key Concepts

### Execution Pipeline

When a trigger fires, the system follows a deterministic pipeline regardless of trigger type:

1. **Event Source** — A scheduled poll, inbound webhook, or Slack event arrives.
2. **Handler Lookup** — The appropriate `BaseAppHandler` subclass is resolved based on the trigger type.
3. **Filtering & Validation** — The handler applies filtering logic and validates activation requirements.
4. **Rate Limit Check** — `check_rate_limits()` evaluates per-trigger hourly and daily limits.
5. **Execution Creation** — A `TriggerExecution` record is created with status `pending`.
6. **Celery Dispatch** — Execution details are published to Redis for background processing.
7. **Agent Execution** — A Celery worker picks up the execution, runs the agent, and updates the record.
8. **Status Publication** — Updated status is pushed via WebSocket to subscribed clients.

### Rate Limiting

Every trigger has configurable `max_executions_per_hour` and `max_executions_per_day` limits. If either is exceeded, the trigger is skipped for that cycle. Schedule triggers still advance their `next_run_at` to avoid repeated re-fetching; webhook triggers return a `429 Too Many Requests` response immediately.

### Auto-Disable on Failure

Each trigger has a `max_failure_count` field. After the specified number of consecutive failures (status `failed` or `missed`), the trigger is automatically disabled and requires manual re-enabling from the Eigent UI. Successful executions between failures reset the failure counter.

### Celery Beat Poller

Schedule triggers are polled by a Celery Beat task that runs on a configurable interval (default: 1 minute). The poller fetches all triggers where `next_run_at` is due, checks rate limits, dispatches allowed triggers, and re-calculates the next run time using the `croniter` library.

## Environment Variables

The trigger system is controlled by several environment variables. See the [Environment Variables reference](/core/triggers/environment-variables) for the full list.

Key variables:

| Variable | Default | Description |
|---|---|---|
| `ENABLE_TRIGGER_SCHEDULE_POLLER_TASK` | `"true"` | Enable the schedule trigger poller |
| `TRIGGER_SCHEDULE_POLLER_INTERVAL` | `"1"` | Poller interval in minutes |
| `EXECUTION_PENDING_TIMEOUT_SECONDS` | `"60"` | Seconds before a pending execution is marked `missed` |
| `EXECUTION_RUNNING_TIMEOUT_SECONDS` | `"600"` | Seconds before a running execution is marked `failed` |

## What's next?

- [Schedule Trigger](/core/triggers/schedule-trigger) — Automate recurring or one-time tasks with cron expressions.
- [Webhook Trigger](/core/triggers/webhook-trigger) — Fire executions from inbound HTTP requests.
- [Trigger System Architecture](/core/triggers/architecture) — Understand the full execution pipeline, rate limiting, and app handlers.
- [Environment Variables](/core/triggers/environment-variables) — Full reference for all trigger-related environment variables.