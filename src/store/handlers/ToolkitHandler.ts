// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========

/**
 * ToolkitHandler
 *
 * Handler para processar eventos de toolkit (ACTIVATE_TOOLKIT, DEACTIVATE_TOOLKIT)
 * extraído do chatStore.ts para melhor organização e testabilidade.
 */

import { generateUniqueId } from '@/lib';
import { AgentStatusValue, TaskStatus } from '@/types/constants';
import type { AgentMessage } from '@/types/handlers';
// Task is defined locally in chatStore.ts
import type { Agent, TaskInfo, ToolKit } from '@/types/handlers';

// ============================================================================
// TOOLKIT UTILITIES
// ============================================================================

/**
 * Normalize toolkit message value to string.
 * Handles JSON.stringify fallback for non-string values.
 */
export const normalizeToolkitMessage = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * Resolve process task ID for toolkit events.
 * Returns direct ID if provided, otherwise finds from running tasks.
 */
export const resolveProcessTaskIdForToolkitEvent = (
  tasksById: Record<string, Task>,
  currentTaskId: string,
  agentName: string | undefined,
  processTaskId: unknown
): string => {
  const direct = typeof processTaskId === 'string' ? processTaskId : '';
  if (direct) return direct;

  const running = tasksById[currentTaskId]?.taskRunning ?? [];
  // Prefer a task owned by the same agent
  const match = running.findLast(
    (t: any) =>
      typeof t?.id === 'string' &&
      t.id &&
      (agentName ? t.agent?.type === agentName : true)
  );
  if (match?.id) return match.id as string;
  // Fallback to the latest running task id
  const last = running.at(-1);
  if (typeof last?.id === 'string' && last.id) return last.id;
  return '';
};

// ============================================================================
// TOOLKIT MESSAGE FILTERING
// ============================================================================

/**
 * Filter and normalize agent message for toolkit processing.
 */
export const filterMessage = (message: AgentMessage): AgentMessage | null => {
  const data = message.data as Record<string, unknown>;
  if ((data.toolkit_name as string)?.includes('Search ')) {
    data.toolkit_name = 'Search Toolkit';
  }
  if ((data.method_name as string)?.includes('search')) {
    data.method_name = 'search';
  }

  data.message = normalizeToolkitMessage(data.message);

  if (data.toolkit_name === 'Note Taking Toolkit') {
    data.message = (data.message as string)
      .replace(/content='/g, '')
      .replace(/', update=False/g, '')
      .replace(/', update=True/g, '');
  }
  if (data.method_name === 'scrape') {
    data.message = (data.message as string)
      .replace(/content='/g, '')
      .replace(/'/g, '');
  }

  return message;
};

// ============================================================================
// TOOLKIT HANDLERS
// ============================================================================

// Task type compatible with chatStore.ts Task interface
interface Task {
  taskAssigning: Agent[];
  taskRunning: TaskInfo[];
  // other properties as needed
}

export interface ToolkitHandlerDeps {
  tasks: Record<string, Task>;
  currentTaskId: string;
  agentMessages: AgentMessage;
  setTaskAssigning: (taskId: string, value: Agent[]) => void;
  setTaskRunning: (taskId: string, value: TaskInfo[]) => void;
  addWebViewUrl: (taskId: string, url: string, processTaskId: string) => void;
}

/**
 * Handle ACTIVATE_TOOLKIT event.
 */
export const handleActivateToolkit = (deps: ToolkitHandlerDeps): void => {
  const {
    tasks,
    currentTaskId,
    agentMessages,
    setTaskAssigning,
    setTaskRunning,
    addWebViewUrl,
  } = deps;

  const data = agentMessages.data as Record<string, unknown>;

  // add log
  let taskAssigning = [...tasks[currentTaskId].taskAssigning];
  const resolvedProcessTaskId = resolveProcessTaskIdForToolkitEvent(
    tasks,
    currentTaskId,
    data.agent_name as string | undefined,
    data.process_task_id
  );
  let assigneeAgentIndex = taskAssigning!.findIndex((agent: Agent) =>
    agent.tasks.find((task: TaskInfo) => task.id === resolvedProcessTaskId)
  );

  // Fallback: if task ID not found, try finding by agent type
  if (assigneeAgentIndex === -1 && data.agent_name) {
    assigneeAgentIndex = taskAssigning!.findIndex(
      (agent: Agent) => agent.type === data.agent_name
    );
  }

  if (assigneeAgentIndex !== -1) {
    const message = filterMessage(agentMessages);
    if (message) {
      taskAssigning[assigneeAgentIndex].log.push(agentMessages);
      setTaskAssigning(currentTaskId, [...taskAssigning]);
    }
  }

  if (
    data.toolkit_name === 'Browser Toolkit' &&
    data.method_name === 'browser visit page'
  ) {
    addWebViewUrl(
      currentTaskId,
      normalizeToolkitMessage(data.message)
        .replace(/url=/g, '')
        .replace(/'/g, '') as string,
      resolvedProcessTaskId
    );
  }
  if (
    data.toolkit_name === 'Browser Toolkit' &&
    data.method_name === 'visit page'
  ) {
    console.log('match success');
    addWebViewUrl(
      currentTaskId,
      normalizeToolkitMessage(data.message) as string,
      resolvedProcessTaskId
    );
  }
  if (
    data.toolkit_name === 'ElectronToolkit' &&
    data.method_name === 'browse_url'
  ) {
    addWebViewUrl(
      currentTaskId,
      normalizeToolkitMessage(data.message) as string,
      resolvedProcessTaskId
    );
  }
  if (
    data.method_name === 'browser_navigate' &&
    (data.message as string)?.startsWith('{"url"')
  ) {
    try {
      const urlData = JSON.parse(normalizeToolkitMessage(data.message));
      if (urlData?.url) {
        addWebViewUrl(
          currentTaskId,
          urlData.url as string,
          resolvedProcessTaskId
        );
      }
    } catch (error) {
      console.error('Failed to parse browser_navigate URL:', error);
      console.error('Raw message:', data.message);
    }
  }
  let taskRunning = [...tasks[currentTaskId].taskRunning];

  const taskIndex = taskRunning.findIndex(
    (task) => task.id === resolvedProcessTaskId
  );

  if (taskIndex !== -1) {
    const toolkit_name = data.toolkit_name as string | undefined;
    const method_name = data.method_name as string | undefined;
    if (toolkit_name && method_name) {
      const message = filterMessage(agentMessages);
      if (message) {
        const toolkit: ToolKit = {
          toolkitId: generateUniqueId(),
          toolkitName: toolkit_name,
          toolkitMethods: method_name,
          message: normalizeToolkitMessage(
            (message.data as Record<string, unknown>).message
          ),
          toolkitStatus: AgentStatusValue.RUNNING,
        };

        // Update taskAssigning if we found the agent
        if (assigneeAgentIndex !== -1) {
          const task = taskAssigning[assigneeAgentIndex].tasks.find(
            (task: TaskInfo) => task.id === resolvedProcessTaskId
          );
          if (task) {
            task.toolkits ??= [];
            task.toolkits.push({ ...toolkit });
            task.status = TaskStatus.RUNNING;
            setTaskAssigning(currentTaskId, [...taskAssigning]);
          }
        }

        // Always update taskRunning (even if assigneeAgentIndex is -1)
        taskRunning![taskIndex].status = TaskStatus.RUNNING;
        taskRunning![taskIndex].toolkits ??= [];
        taskRunning![taskIndex].toolkits.push({ ...toolkit });
      }
    }
  }
  setTaskRunning(currentTaskId, taskRunning);
};

/**
 * Handle DEACTIVATE_TOOLKIT event.
 */
export const handleDeactivateToolkit = (deps: ToolkitHandlerDeps): void => {
  const {
    tasks,
    currentTaskId,
    agentMessages,
    setTaskAssigning,
    setTaskRunning,
  } = deps;

  const data = agentMessages.data as Record<string, unknown>;

  // add log
  let taskAssigning = [...tasks[currentTaskId].taskAssigning];
  const resolvedProcessTaskId = resolveProcessTaskIdForToolkitEvent(
    tasks,
    currentTaskId,
    data.agent_name as string | undefined,
    data.process_task_id
  );

  const assigneeAgentIndex = taskAssigning!.findIndex((agent: Agent) =>
    agent.tasks.find((task: TaskInfo) => task.id === resolvedProcessTaskId)
  );
  if (assigneeAgentIndex !== -1) {
    const message = filterMessage(agentMessages);
    if (message) {
      const task = taskAssigning[assigneeAgentIndex].tasks.find(
        (task: TaskInfo) => task.id === resolvedProcessTaskId
      );
      if (task) {
        let index = task.toolkits?.findIndex((toolkit: ToolKit) => {
          return (
            toolkit.toolkitName === data.toolkit_name &&
            toolkit.toolkitMethods === data.method_name &&
            toolkit.toolkitStatus === AgentStatusValue.RUNNING
          );
        });

        if (task.toolkits && index !== -1 && index !== undefined) {
          task.toolkits[index].message =
            `${normalizeToolkitMessage(task.toolkits[index].message)}
${normalizeToolkitMessage((message.data as Record<string, unknown>).message)}`.trim();
          task.toolkits[index].toolkitStatus = AgentStatusValue.COMPLETED;
        }
      }
      taskAssigning[assigneeAgentIndex].log.push(agentMessages);
      setTaskAssigning(currentTaskId, [...taskAssigning]);
    }
  }

  let taskRunning = [...tasks[currentTaskId].taskRunning];
  const toolkit_name = data.toolkit_name as string | undefined;
  const method_name = data.method_name as string | undefined;
  const message = data.message as string | undefined;
  const taskIndex = taskRunning.findIndex(
    (task) =>
      task.agent?.type === data.agent_name &&
      task.toolkits?.at(-1)?.toolkitName === toolkit_name
  );

  if (taskIndex !== -1) {
    if (toolkit_name && method_name && message) {
      const targetMessage = filterMessage(agentMessages);

      if (targetMessage) {
        taskRunning![taskIndex].toolkits?.unshift({
          toolkitName: toolkit_name,
          toolkitMethods: method_name,
          message: normalizeToolkitMessage(
            (targetMessage.data as Record<string, unknown>).message
          ),
          toolkitStatus: AgentStatusValue.COMPLETED,
        });
      }
    }
  }
  setTaskAssigning(currentTaskId, [...taskAssigning]);
  setTaskRunning(currentTaskId, taskRunning);
};
