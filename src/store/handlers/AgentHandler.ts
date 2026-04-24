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
 * AgentHandler - Agent lifecycle handlers for SSE messages
 *
 * Extraído do chatStore.ts para melhor organização.
 * Handles: CREATE_AGENT, ACTIVATE_AGENT, DEACTIVATE_AGENT
 */

import type { AgentStep } from '@/types/constants';
import {
  AgentMessageStatus,
  AgentStatusValue,
  TaskStatus,
} from '@/types/constants';
import type { Agent, AgentMessage, Message, TaskInfo } from '@/types/handlers';
import { filterMessage } from './ToolkitHandler';

// Store access types - these will be provided by the parent chatStore
export interface AgentHandlerStore {
  currentTaskId: string;
  tasks: Record<
    string,
    {
      taskAssigning: Agent[];
      taskRunning: TaskInfo[];
      messages: Message[];
      snapshots: any[];
      summaryTask: string;
      tokens: number;
      status: string;
      isTakeControl: boolean;
      isTaskEdit: boolean;
    }
  >;
  setTaskAssigning: (taskId: string, agents: Agent[]) => void;
  setTaskRunning: (taskId: string, tasks: TaskInfo[]) => void;
  addMessages: (taskId: string, message: Message) => void;
  addTokens: (taskId: string, tokens: number) => void;
  setSummaryTask: (taskId: string, summary: string) => void;
  setStatus: (taskId: string, status: string) => void;
  setIsTaskEdit: (taskId: string, isEdit: boolean) => void;
}

// Map agent names to display names
const agentNameMap: Record<string, string> = {
  developer_agent: 'Developer Agent',
  browser_agent: 'Browser Agent',
  document_agent: 'Document Agent',
  multi_modal_agent: 'Multi Modal Agent',
  social_media_agent: 'Social Media Agent',
};

// Agent names to exclude from workforce display
const excludedAgentNames = [
  'mcp_agent',
  'new_worker_agent',
  'task_agent',
  'task_summary_agent',
  'coordinator_agent',
  'question_confirm_agent',
];

// Get base URL for development/production
const getBaseUrl = (): string => {
  return import.meta.env.DEV
    ? import.meta.env.VITE_PROXY_URL
    : import.meta.env.VITE_BASE_URL;
};

/**
 * Handles CREATE_AGENT step from SSE messages
 * Adds a new agent to the taskAssigning array
 */
export function handleCreateAgent(
  store: AgentHandlerStore,
  agentMessages: AgentMessage
): boolean {
  if (agentMessages.step !== AgentStep.CREATE_AGENT) {
    return false;
  }

  const currentTask = store.tasks[store.currentTaskId];
  if (!currentTask) return true;

  const { agent_name, agent_id } = agentMessages.data as {
    agent_name?: string;
    agent_id?: string;
    tools?: unknown[];
  };

  if (!agent_name || !agent_id) return true;

  // Skip excluded agent types
  if (excludedAgentNames.includes(agent_name)) {
    return true;
  }

  // Check if agent already exists
  const hasAgent = currentTask.taskAssigning.find(
    (agent) => agent.agent_id === agent_id
  );

  if (hasAgent) {
    return true;
  }

  // Process browser agent snapshots for webview tracking
  let activeWebviewIds: {
    id: string;
    img: string;
    processTaskId: string;
    url: string;
  }[] = [];
  if (agent_name === 'browser_agent') {
    currentTask.snapshots?.forEach((item: any) => {
      const imgUrl = !item.image_path.includes('/public')
        ? item.image_path
        : getBaseUrl() + item.image_path;
      activeWebviewIds.push({
        id: item.id,
        img: imgUrl,
        processTaskId: item.camel_task_id,
        url: item.browser_url,
      });
    });
  }

  const tools = (agentMessages.data as any).tools;

  // Add agent to taskAssigning
  store.setTaskAssigning(store.currentTaskId, [
    ...currentTask.taskAssigning,
    {
      agent_id,
      name: agentNameMap[agent_name] || agent_name,
      type: agent_name,
      tasks: [],
      log: [],
      img: [],
      tools: tools || [],
      activeWebviewIds,
    },
  ]);

  return true;
}

/**
 * Handles ACTIVATE_AGENT step from SSE messages
 * Updates agent status to RUNNING and updates task states
 */
export function handleActivateAgent(
  store: AgentHandlerStore,
  agentMessages: AgentMessage
): boolean {
  if (agentMessages.step !== AgentStep.ACTIVATE_AGENT) {
    return false;
  }

  const currentTask = store.tasks[store.currentTaskId];
  if (!currentTask) return true;

  // Add tokens if provided
  const tokens = (agentMessages.data as any).tokens;
  if (tokens) {
    store.addTokens(store.currentTaskId, tokens);
  }

  const { state, agent_id, process_task_id } = agentMessages.data as {
    state?: string;
    agent_id?: string;
    process_task_id?: string;
    agent_name?: string;
    method_name?: string;
    toolkit_name?: string;
    message?: string;
    tokens?: number;
  };

  if (!state && !agent_id && !process_task_id) {
    return true;
  }

  let taskAssigning = [...currentTask.taskAssigning];
  let taskRunning = [...currentTask.taskRunning];

  const agentIndex = taskAssigning.findIndex(
    (agent) => agent.agent_id === agent_id
  );

  if (agentIndex === -1) {
    return true;
  }

  // Update agent status
  taskAssigning[agentIndex].status = AgentStatusValue.RUNNING;

  // Add log entry if message is filterable
  const message = filterMessage(agentMessages);
  if (message) {
    taskAssigning[agentIndex].log.push({
      ...agentMessages,
      status: AgentMessageStatus.RUNNING,
    } as AgentMessage);
  }

  // Update task running status
  const taskIndex = taskRunning.findIndex(
    (task) => task.id === process_task_id
  );

  if (taskIndex !== -1 && taskRunning[taskIndex]?.status) {
    taskRunning[taskIndex].agent!.status = AgentStatusValue.RUNNING;
    taskRunning[taskIndex].status = TaskStatus.RUNNING;

    // Also update task in agent's task list
    const task = taskAssigning[agentIndex].tasks.find(
      (task: TaskInfo) => task.id === process_task_id
    );
    if (task) {
      task.status = TaskStatus.RUNNING;
    }
  }

  store.setTaskRunning(store.currentTaskId, [...taskRunning]);
  store.setTaskAssigning(store.currentTaskId, [...taskAssigning]);

  return true;
}

/**
 * Handles DEACTIVATE_AGENT step from SSE messages
 * Updates agent logs and task completion status
 */
export function handleDeactivateAgent(
  store: AgentHandlerStore,
  agentMessages: AgentMessage,
  context?: {
    historyId?: string;
    type?: string;
    project_id?: string;
  }
): boolean {
  if (agentMessages.step !== AgentStep.DEACTIVATE_AGENT) {
    return false;
  }

  const currentTask = store.tasks[store.currentTaskId];
  if (!currentTask) return true;

  // Add tokens if provided
  const tokens = (agentMessages.data as any).tokens;
  if (tokens) {
    store.addTokens(store.currentTaskId, tokens);
  }

  const { state, agent_id, process_task_id } = agentMessages.data as {
    state?: string;
    agent_id?: string;
    process_task_id?: string;
    agent_name?: string;
    method_name?: string;
    toolkit_name?: string;
    message?: string;
  };

  if (!state && !agent_id && !process_task_id) {
    return true;
  }

  let taskAssigning = [...currentTask.taskAssigning];
  let taskRunning = [...currentTask.taskRunning];

  const agentIndex = taskAssigning.findIndex(
    (agent) => agent.agent_id === agent_id
  );

  if (agentIndex === -1) {
    return true;
  }

  // Update log entry status
  const message = filterMessage(agentMessages);
  if (message) {
    const index = taskAssigning[agentIndex].log.findLastIndex(
      (log) =>
        log.data?.method_name === method_name &&
        log.data?.toolkit_name === toolkit_name
    );
    if (index !== -1) {
      (taskAssigning[agentIndex].log[index] as any).status =
        AgentMessageStatus.COMPLETED;
    }
  }

  // Update task running status
  const taskIndex = taskRunning.findIndex(
    (task) => task.id === process_task_id
  );
  if (taskIndex !== -1 && taskRunning[taskIndex].agent) {
    taskRunning[taskIndex].agent!.status = 'completed';
  }

  // Update history if not replay
  if (!context?.type && context?.historyId) {
    const summaryParts = currentTask.summaryTask.split('|');
    const obj = {
      project_name: summaryParts[0],
      summary: summaryParts[1],
      status: 1,
      tokens: currentTask.tokens,
    };
    // Note: This would need to be called via a callback or store action
    // proxyFetchPut(`/api/v1/chat/history/${historyId}`, obj);
  }

  store.setTaskRunning(store.currentTaskId, [...taskRunning]);
  store.setTaskAssigning(store.currentTaskId, [...taskAssigning]);

  return true;
}

/**
 * Process agent-related SSE message steps
 * Returns true if the step was handled, false otherwise
 */
export function processAgentSteps(
  store: AgentHandlerStore,
  agentMessages: AgentMessage,
  context?: {
    historyId?: string;
    type?: string;
    project_id?: string;
  }
): boolean {
  // Handle CREATE_AGENT
  if (handleCreateAgent(store, agentMessages)) {
    return true;
  }

  // Handle ACTIVATE_AGENT
  if (handleActivateAgent(store, agentMessages)) {
    return true;
  }

  // Handle DEACTIVATE_AGENT
  if (handleDeactivateAgent(store, agentMessages, context)) {
    return true;
  }

  return false;
}
