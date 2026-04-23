---
title: Build a Custom Toolkit
description: Learn how to create custom toolkits to extend your agents' capabilities.
icon: tool
---

Eigent's agent system is built around **toolkits** — collections of functions that give your agents their powers. Every pre-configured agent (DeveloperAgent, BrowserAgent, DocumentAgent, etc.) is equipped with a curated set of toolkits. This guide shows you how to build your own custom toolkit.

## What is a Toolkit?

A toolkit in Eigent is a Python class that inherits from `AbstractToolkit` and exposes one or more **FunctionTool** objects — callable functions that agents can invoke. Toolkits live in `backend/app/agent/toolkit/` and are composed by assigning them to agents.

## The Three Patterns

There are three ways to build a toolkit, depending on how much custom logic you need:

| Pattern | When to Use | Example |
|---|---|---|
| **Simple Wrapper** | Wrapping an existing CAMEL toolkit | `NotionToolkit`, `GithubToolkit` |
| **Method Override** | Extending an existing toolkit with custom behavior | `FileToolkit`, `SearchToolkit` |
| **Custom Implementation** | Building something from scratch | `HumanToolkit`, `RAGToolkit` |

---

## Pattern 1: Simple Wrapper

Use this pattern when you want to adopt an existing CAMEL toolkit with minimal integration logic (e.g., environment-variable checks, `api_task_id` injection).

### Step-by-Step

1. Create a new Python file in `backend/app/agent/toolkit/` — e.g., `my_toolkit.py`.
2. Import the CAMEL base toolkit, `AbstractToolkit`, and the `auto_listen_toolkit` decorator.
3. Declare a class that inherits from both the base and `AbstractToolkit`.
4. Add the `@auto_listen_toolkit` decorator.
5. Set `agent_name` and implement `__init__` to capture `api_task_id`.
6. Override `get_can_use_tools` if you want conditional availability.

### Example: Wrapping a CAMEL Toolkit

```python
# backend/app/agent/toolkit/my_toolkit.py

from camel.toolkits import SomeToolkit as BaseSomeToolkit
from camel.toolkits.function_tool import FunctionTool

from app.agent.toolkit.abstract_toolkit import AbstractToolkit
from app.component.environment import env, env_not_empty
from app.service.task import Agents
from app.utils.listen.toolkit_listen import auto_listen_toolkit


@auto_listen_toolkit(BaseSomeToolkit)
class MyToolkit(BaseSomeToolkit, AbstractToolkit):
    agent_name: str = Agents.developer_agent

    def __init__(
        self,
        api_task_id: str,
        some_token: str | None = None,
        timeout: float | None = None,
    ) -> None:
        super().__init__(some_token, timeout)
        self.api_task_id = api_task_id

    @classmethod
    def get_can_use_tools(cls, api_task_id: str) -> list[FunctionTool]:
        # Expose tools only when the required env variable is set
        if env("MY_API_TOKEN"):
            return MyToolkit(api_task_id).get_tools()
        else:
            return []
```

### Key Points

- **`@auto_listen_toolkit(BaseToolkit)`**: Automatically wraps all public methods from the base toolkit with toolkit event logging (activate/deactivate). This lets the agent system track when tools are called.
- **`agent_name`**: Associates the toolkit with a specific agent role.
- **`api_task_id`**: The session/task identifier — required so the toolkit can interact with the task lock, send messages, etc.
- **`get_can_use_tools`**: Override this to conditionally expose tools (e.g., only when credentials are available).

---

## Pattern 2: Method Override

Use this pattern when you need to add custom logic to specific methods of an existing toolkit — for example, to emit side-effects, inject dependencies, or change behavior.

### The `@listen_toolkit` Decorator

The `@listen_toolkit` decorator wraps a method so it emits toolkit activate/deactivate events. It takes two optional arguments:

```python
@listen_toolkit(inputs=<inputs_formatter>, return_msg=<return_msg_formatter>)
def my_method(self, arg1: str, arg2: int) -> str:
    ...
```

| Argument | Type | Description |
|---|---|---|
| `inputs` | `Callable[..., str]` | Formats the input arguments into a human-readable log message. Receives the same args as the method. |
| `return_msg` | `Callable[[Any], str]` | Formats the return value into a human-readable log message. |

If `inputs` is omitted, the decorator formats arguments automatically. If `return_msg` is omitted, the raw result is used.

### Example: Overriding a Single Method

```python
# backend/app/agent/toolkit/my_toolkit.py

from camel.toolkits import SomeToolkit as BaseSomeToolkit

from app.agent.toolkit.abstract_toolkit import AbstractToolkit
from app.service.task import (
    Agents,
    get_task_lock,
    ActionSomeData,
)
from app.utils.listen.toolkit_listen import (
    _safe_put_queue,
    auto_listen_toolkit,
    listen_toolkit,
)


@auto_listen_toolkit(BaseSomeToolkit)
class MyToolkit(BaseSomeToolkit, AbstractToolkit):
    agent_name: str = Agents.developer_agent

    def __init__(self, api_task_id: str, timeout: float | None = None):
        super().__init__(timeout)
        self.api_task_id = api_task_id

    # Override a specific method with custom behavior
    @listen_toolkit(
        BaseSomeToolkit.some_method,
        lambda _, arg1, arg2: f"custom input: {arg1}, {arg2}",
    )
    def some_method(self, arg1: str, arg2: int) -> str:
        # Call the parent implementation
        result = super().some_method(arg1, arg2)

        # Add custom side-effect: queue an action for the agent system
        if "success" in result.lower():
            task_lock = get_task_lock(self.api_task_id)
            _safe_put_queue(
                task_lock,
                ActionSomeData(data={"arg1": arg1, "result": result}),
            )

        return result
```

### Key Points

- **`@listen_toolkit(...)`**: The decorator must reference the base method as its first positional argument (this is how Eigent knows which method you're overriding). Use the `inputs` lambda to provide a custom log message.
- **Call `super()` first**: Always call the parent implementation to get the result, then build on it.
- **`_safe_put_queue`**: Use this helper (imported from `toolkit_listen`) to safely enqueue actions from within a toolkit method. It handles both sync and async contexts.

---

## Pattern 3: Custom Implementation

Use this pattern when you are building something original — either from scratch or by composing multiple CAMEL toolkits via delegation (not inheritance).

### The Required Interface

Your class must expose these three things:

```python
from camel.toolkits.function_tool import FunctionTool

class MyToolkit(AbstractToolkit):
    api_task_id: str
    agent_name: str

    def get_tools(self) -> list[FunctionTool]:
        """Return the FunctionTool objects for this toolkit."""
        return [...]

    @classmethod
    def get_can_use_tools(cls, api_task_id: str) -> list[FunctionTool]:
        """Return tools allowed for the given task."""
        return cls(api_task_id).get_tools()
```

### Example: Building a Custom Toolkit from Scratch

```python
# backend/app/agent/toolkit/my_custom_toolkit.py

import logging
from typing import Any

import httpx
from camel.toolkits.base import BaseToolkit
from camel.toolkits.function_tool import FunctionTool

from app.agent.toolkit.abstract_toolkit import AbstractToolkit
from app.component.environment import env, env_not_empty
from app.service.task import (
    Agents,
    ActionSearchData,
    get_task_lock,
)
from app.utils.listen.toolkit_listen import (
    _safe_put_queue,
    auto_listen_toolkit,
    listen_toolkit,
)

logger = logging.getLogger("my_custom_toolkit")


@auto_listen_toolkit(BaseToolkit)
class MyCustomToolkit(BaseToolkit, AbstractToolkit):
    """A custom toolkit that calls an external API and returns structured results."""

    agent_name: str = Agents.developer_agent

    def __init__(self, api_task_id: str, timeout: float | None = None):
        super().__init__(timeout)
        self.api_task_id = api_task_id

    @listen_toolkit(
        inputs=lambda _, keyword, size, page: f"keyword: {keyword}, size: {size}, page: {page}"
    )
    async def search_external_api(self, keyword: str, size: int = 15, page: int = 0) -> dict[str, Any]:
        """Search an external API and return results.

        Args:
            keyword: The search query.
            size: Number of results per page.
            page: Page number (0-indexed).

        Returns:
            A dictionary containing search results.
        """
        api_url = env_not_empty("EXTERNAL_API_URL")

        async with httpx.AsyncClient() as client:
            response = await client.get(api_url, params={
                "keyword": keyword,
                "size": size,
                "page": page,
            })
            response.raise_for_status()
            data = response.json()

        # Emit an action so the agent system can track this
        task_lock = get_task_lock(self.api_task_id)
        await task_lock.put_queue(
            ActionSearchData(data={"keyword": keyword, "count": len(data.get("results", []))})
        )

        return data

    def get_tools(self) -> list[FunctionTool]:
        return [
            FunctionTool(self.search_external_api),
        ]
```

### Key Points

- **`BaseToolkit`**: Use this as the base class even when you're not wrapping a CAMEL toolkit — it provides the constructor signature and toolkit infrastructure.
- **`@listen_toolkit`**: Decorate each method you want the agent system to track. The `inputs` lambda makes the log message human-readable.
- **`get_tools()`**: Explicitly return a list of `FunctionTool` objects. Each `FunctionTool` wraps one of your methods.
- **Async methods work too**: `@listen_toolkit` handles both `def` and `async def` methods transparently.

---

## Registering Your Toolkit with the Agent System

After creating your toolkit file, you need to wire it into an agent so it gets included in that agent's toolkit list.

### Adding to an Agent

Edit the agent definition file (e.g., `backend/app/service/task.py` or wherever agents are configured). Import your new toolkit and add it to the agent's `toolkits` list:

```python
from app.agent.toolkits import MyToolkit

WORKER_CONFIGS = {
    "developer_agent": {
        ...
        "toolkits": [
            # ... existing toolkits
            MyToolkit,
        ],
    },
}
```

The agent system will automatically instantiate your toolkit with the correct `api_task_id` at runtime.

### Task Isolation

All toolkits receive an `api_task_id` in their constructor. Use this to:

- Isolate per-task resources (e.g., RAG collection names use `f"task_{api_task_id}"`)
- Route actions and messages to the correct task context via `get_task_lock(api_task_id)`
- Filter what tools are available based on the task

---

## Toolkit Event System

Eigent's toolkit listening system emits **activate** and **deactivate** events for every tool call, letting the UI and orchestrator track agent activity in real time.

- **`@auto_listen_toolkit`**: Automatically wraps every public method from the base toolkit class.
- **`@listen_toolkit`**: Manually wraps a single method. Useful for custom implementations or overriding specific methods.
- **`_safe_put_queue`**: Safely enqueues an action from inside a toolkit method. Use this instead of `task_lock.put_queue` directly — it handles both sync and async contexts.

You don't need to manually emit events — the decorators do it for you. Just decorate your methods and the system takes care of the rest.

---

## Next Steps

- Explore the existing toolkit implementations in `backend/app/agent/toolkit/` for reference.
- Check the [Toolkit Reference](./workforce.md#toolkit-reference) in the Workforce docs for the full list of built-in toolkits.
- Learn how to [create custom workers](./workers.md) and equip them with your new toolkit.
