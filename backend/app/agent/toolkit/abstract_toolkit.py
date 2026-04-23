# ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========

from camel.toolkits.function_tool import FunctionTool
from inflection import titleize


class AbstractToolkit:
    r"""A base toolkit class for all agent toolkits.

    This class provides a common interface and utilities for toolkits
    that wrap external tool libraries (e.g., CAMEL toolkits). Subclasses
    should inherit from both the external toolkit base (e.g.,
    ``BaseToolkit`` from ``camel.toolkits``) and this ``AbstractToolkit``
    to integrate cleanly with the agent system.

    Attributes:
        api_task_id: The unique identifier for the current task or session.
        agent_name: The name of the agent that owns this toolkit.

    Example:
        Subclasses should follow this pattern::

            from camel.toolkits.base import BaseToolkit

            @auto_listen_toolkit(BaseToolkit)
            class MyToolkit(BaseToolkit, AbstractToolkit):
                agent_name: str = Agents.my_agent

                def __init__(self, api_task_id: str):
                    super().__init__()
                    self.api_task_id = api_task_id

                def get_tools(self) -> list[FunctionTool]:
                    return [...]

                @classmethod
                def get_can_use_tools(cls, api_task_id: str) -> list[FunctionTool]:
                    return cls(api_task_id).get_tools()
    """

    api_task_id: str
    agent_name: str

    def get_tools(self) -> list[FunctionTool]:
        r"""Returns the list of tools exposed by this toolkit.

        Subclasses must override this method to return the actual
        ``FunctionTool`` objects provided by the toolkit.

        Returns:
            A list of ``FunctionTool`` objects representing the
            available tools.
        """
        return []

    @classmethod
    def get_can_use_tools(cls, api_task_id: str) -> list[FunctionTool]:
        r"""Returns the tools that the agent is allowed to use for a given task.

        By default this returns all tools (``get_tools()``). Subclasses
        may override this to filter or restrict tools based on the task
        context or user permissions.

        Args:
            api_task_id: The unique identifier for the current task or session.

        Returns:
            A list of ``FunctionTool`` objects available for the task.
        """
        return cls(api_task_id).get_tools()  # type: ignore

    @classmethod
    def toolkit_name(cls) -> str:
        r"""Returns the human-readable name of the toolkit.

        The name is derived from the class name using title case
        (e.g., ``SlackToolkit`` → ``Slack Toolkit``).

        Returns:
            The titleized toolkit name.
        """
        return titleize(cls.__name__)
