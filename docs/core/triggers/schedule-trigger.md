---
title: Schedule Trigger
description: Configure schedule-based triggers using cron expressions to automate recurring agent executions.
icon: calendar
---

A schedule trigger fires automatically on a recurring cron schedule or a one-time date. Once configured, Eigent handles execution timing, retries, rate limiting, and observability — so you can set it and forget it.

This reference covers the full configuration model, scheduling logic, execution flow, and configuration options.

## ScheduleTriggerConfig

The `ScheduleTriggerConfig` class (`app/model/trigger/app_configs/schedule_config.py`) drives all schedule-based triggers.

```python
from app.model.trigger.app_configs.schedule_config import ScheduleTriggerConfig
```

### Config Fields

| Field | Type | Description |
|---|---|---|
| `date` | `str \| None` | One-time execution date in `YYYY-MM-DD` format. Cleared after the trigger fires. Mutually exclusive with `cron_expression`. |
| `expirationDate` | `str \| None` | End date for recurring schedules (`YYYY-MM-DD`). Triggers past this date stop firing automatically. |
| `custom_cron_expression` | `str \| None` | A 5-field cron expression (e.g. `"0 9 * * MON-FRI"`). Used for recurring schedules. |
| `max_failure_count` | `int` | Number of consecutive failures before the trigger is auto-disabled (range: 1–100). Inherited from `BaseTriggerConfig`. |
| `message_filter` | `str \| None` | Optional regex pattern. The trigger only fires if the trigger prompt matches this pattern at execution time. |

### Key Methods

- `is_expired()` — Returns `True` if the trigger is past its `expirationDate`.
- `should_execute()` — Returns a `(bool, str)` tuple: whether the trigger should fire and the reason (e.g. `"expired"`, `"outside_cron_window"`, `"ok"`).
- `get_required_config_group()` — Returns `None` (schedule triggers have no required config group).
- `get_required_credentials()` — Returns `[]` (no external credentials required).

### One-Time vs. Recurring Schedules

**One-time schedules** use the `date` field only. The trigger fires once on the specified date, then stops. Useful for reminders, scheduled reports, or deferred tasks.

**Recurring schedules** use `custom_cron_expression`. The trigger fires repeatedly according to the cron expression until `expirationDate` is reached. The next run time is re-calculated after each execution using the `croniter` library.

## Configuring a Schedule Trigger

### Step 1: Set the Trigger Type

In the trigger creation API, set `trigger_type` to `"schedule"`.

```json
{
  "trigger_type": "schedule",
  "name": "Morning Standup Reminder",
  "trigger_prompt": "Send a summary of today's pending tasks to the #standup channel."
}
```

### Step 2: Choose a Schedule

**For a one-time date:**

```json
{
  "schedule_config": {
    "date": "2025-06-15",
    "max_failure_count": 3
  }
}
```

**For a recurring schedule, provide a cron expression:**

```json
{
  "schedule_config": {
    "custom_cron_expression": "0 9 * * MON-FRI",
    "expirationDate": "2025-12-31",
    "max_failure_count": 5
  }
}
```

### Cron Expression Format

Schedule triggers use standard 5-field cron syntax:

```
┌───────────── minute      (0–59)
│ ┌─────────── hour        (0–23)
│ │ ┌───────── day of month (1–31)
│ │ │ ┌─────── month        (1–12 or JAN–DEC)
│ │ │ │ ┌───── day of week  (0–6 or SUN–SAT)
│ │ │ │ │
* * * * *
```

**Common examples:**

| Cron Expression | Meaning |
|---|---|
| `0 9 * * MON-FRI` | Every weekday at 9:00 AM |
| `*/15 * * * *` | Every 15 minutes |
| `0 0 1 * *` | First day of every month at midnight |
| `30 17 * * 5` | Every Friday at 5:30 PM |
| `0 9,17 * * *` | Twice daily at 9:00 AM and 5:00 PM |

### Step 3: Add an Optional Message Filter

Use `message_filter` to restrict when the trigger fires based on the trigger prompt content:

```json
{
  "schedule_config": {
    "custom_cron_expression": "0 9 * * MON-FRI",
    "message_filter": "^(standup|daily)",
    "max_failure_count": 3
  }
}
```

With this filter, the trigger only fires if the trigger prompt starts with "standup" or "daily". This is useful when a single worker handles multiple schedule triggers and you want conditional routing.

## Execution Flow

When a schedule trigger fires, the system follows this pipeline:

1. **Celery Beat** runs `poll_trigger_schedules` on the configured interval (default: 1 minute).
2. **Poll and filter** — fetches all triggers where `next_run_at <= now` (batch size: 100 by default).
3. **Expiration check** — `ScheduleTriggerConfig.is_expired()` returns `True` for expired triggers; those are skipped.
4. **Rate limit check** — `check_rate_limits()` evaluates `max_executions_per_hour` and `max_executions_per_day`.
5. **Message filter check** — if `message_filter` is set, the trigger prompt is matched against it.
6. **Dispatch** — `TriggerScheduleService.dispatch_trigger()` sends the execution to Celery.
7. **Next run recalculation** — `croniter` computes the next `next_run_at` from the cron expression.
8. **Agent execution** — a Celery worker picks up the task, runs the agent, and updates the execution record.

## Auto-Disable on Failure

The `max_failure_count` field protects against runaway or misconfigured triggers. After `max_failure_count` consecutive failures, the trigger is automatically disabled and requires manual re-enabling.

A failure is any execution that ends in `failed` or `missed` status (not `completed` or `cancelled`).

<aside>

**📌 Note on Auto-Disable**

Auto-disable only counts *consecutive* failures. A successful execution between failures resets the counter. To re-enable a disabled trigger, go to the **Triggers** page in the Eigent UI and click **Enable**.

</aside>

## Rate Limiting

Schedule triggers respect per-trigger rate limits defined at the trigger level:

- `max_executions_per_hour` — Maximum executions in any 60-minute sliding window.
- `max_executions_per_day` — Maximum executions in any 24-hour sliding window.

If either limit is exceeded, the trigger is skipped for that tick. Its `next_run_at` is still updated to prevent repeated re-fetching.

## Environment Variables

The following environment variables affect schedule trigger behavior:

| Variable | Default | Description |
|---|---|---|
| `ENABLE_TRIGGER_SCHEDULE_POLLER_TASK` | `"true"` | Enable the Celery Beat poller task. Set to `"false"` to pause all schedule triggers. |
| `TRIGGER_SCHEDULE_POLLER_INTERVAL` | `"1"` | How often (in minutes) the poller runs. Lower values = tighter scheduling precision. |
| `TRIGGER_SCHEDULE_POLLER_BATCH_SIZE` | `"100"` | Number of due triggers fetched per poll. Tune based on expected trigger volume. |
| `TRIGGER_SCHEDULE_MAX_DISPATCH_PER_TICK` | `"0"` | Maximum triggers dispatched per poller tick (`0` = unlimited). Use to cap concurrent executions. |
| `EXECUTION_PENDING_TIMEOUT_SECONDS` | `"60"` | Seconds before a `pending` execution is marked `missed`. |
| `EXECUTION_RUNNING_TIMEOUT_SECONDS` | `"600"` | Seconds before a `running` execution is marked `failed`. |

## Troubleshooting

**Trigger fires but nothing happens.** Check the agent task the trigger is connected to. A `failed` execution may indicate an agent error rather than a trigger error.

**Trigger is not firing at the expected time.** Verify the cron expression is valid (use a [cron parser tool](https://crontab.guru) to check). Ensure `ENABLE_TRIGGER_SCHEDULE_POLLER_TASK` is `"true"` and the Celery Beat worker is running.

**Trigger was auto-disabled.** This means it reached `max_failure_count` consecutive failures. Re-enable it from the UI, then investigate the root cause of the failures before relying on it again.

**next_run_at is in the past but the trigger didn't fire.** The trigger may be rate-limited, expired (`is_expired() == True`), or the Celery Beat worker may not be running. Check the Eigent server logs for `rate_limited` or `skipped` entries.

## What's next?

- [Webhook Trigger](/core/triggers/webhook-trigger) — Learn about event-driven triggers via HTTP endpoints.
- [Trigger System Architecture](/core/triggers/architecture) — Understand the full execution pipeline, rate limiting, and app handlers.
- [Environment Variables](/core/triggers/environment-variables) — Full reference for all trigger-related environment variables.
