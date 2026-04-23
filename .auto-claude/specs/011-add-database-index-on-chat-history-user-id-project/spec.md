# Add database index on `chat_history.user_id + project_id` for grouped history queries

## Overview

The `get_grouped_histories` and `get_grouped_project` endpoints query `ChatHistory` filtered by `user_id` and `project_id`, but no composite index exists. The query currently relies on a single-column `user_id` index and a subsequent filter, causing inefficient scans for users with many projects.

## Rationale

With 82 server routes and growing chat history data, grouped history queries will degrade linearly with user history size. A composite index on (user_id, project_id, created_at DESC) would reduce query time from O(n log n) to O(log n) for the history fetch, and from full scan to index-only for the trigger count subquery.

---
*This spec was created from ideation and is pending detailed specification.*
