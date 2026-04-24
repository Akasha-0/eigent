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
 * SSEMessageHandler - NOTICE and ASK handlers for SSE messages
 *
 * Extraído do chatStore.ts para melhor organização.
 */

import { generateUniqueId } from '@/lib';
import type { AgentStep } from '@/types/constants';
import { AgentStatusValue } from '@/types/constants';
import type {
  Agent,
  AgentMessage,
  Message,
  TaskInfo,
  ToolKit,
} from '@/types/handlers';

// Store access types - these will be provided by the parent chatStore
export interface SSEMessageHandlerStore {
  currentTaskId: string;
  tasks: Record<
    string,
    {
      messages: Message[];
      cotList: string[];
      taskAssigning: Agent[];
      askList: Message[];
      activeAsk: string;
    }
  >;
  setTaskAssigning: (taskId: string, agents: Agent[]) => void;
  setCotList: (taskId: string, cotList: string[]) => void;
  addMessages: (taskId: string, message: Message) => void;
  setActiveAskList: (taskId: string, askList: Message[]) => void;
  setActiveAsk: (taskId: string, agent: string) => void;
  setIsPending: (taskId: string, pending: boolean) => void;
}

/**
 * Handles NOTICE step from SSE messages
 */
export function handleNotice(
  store: SSEMessageHandlerStore,
  agentMessages: AgentMessage
): boolean {
  if (agentMessages.step !== AgentStep.NOTICE) {
    return false;
  }

  const currentTask = store.tasks[store.currentTaskId];
  if (!currentTask) return true;

  if (agentMessages.data.process_task_id !== '') {
    let taskAssigning = [...currentTask.taskAssigning];

    const assigneeAgentIndex = taskAssigning.findIndex((agent: Agent) =>
      agent.tasks.find(
        (task: TaskInfo) => task.id === agentMessages.data.process_task_id
      )
    );
    const task = taskAssigning[assigneeAgentIndex].tasks.find(
      (task: TaskInfo) => task.id === agentMessages.data.process_task_id
    );
    const toolkit: ToolKit = {
      toolkitId: generateUniqueId(),
      toolkitName: 'notice',
      toolkitMethods: '',
      message: agentMessages.data.notice as string,
      toolkitStatus: AgentStatusValue.RUNNING,
    };
    if (assigneeAgentIndex !== -1 && task) {
      task.toolkits ??= [];
      task.toolkits.push({ ...toolkit });
    }
    store.setTaskAssigning(store.currentTaskId, [...taskAssigning]);
  } else {
    const messages = [...currentTask.messages];
    const noticeCardIndex = messages.findLastIndex(
      (message) => message.step === AgentStep.NOTICE_CARD
    );
    if (noticeCardIndex === -1) {
      const newMessage: Message = {
        id: generateUniqueId(),
        role: 'agent',
        content: '',
        step: AgentStep.NOTICE_CARD,
      };
      store.addMessages(store.currentTaskId, newMessage);
    }
    store.setCotList(store.currentTaskId, [
      ...currentTask.cotList,
      agentMessages.data.notice as string,
    ]);
  }

  return true;
}

/**
 * Handles ASK step from SSE messages
 */
export function handleAsk(
  store: SSEMessageHandlerStore,
  agentMessages: AgentMessage
): boolean {
  if (agentMessages.step !== AgentStep.ASK) {
    return false;
  }

  const currentTask = store.tasks[store.currentTaskId];
  if (!currentTask) return true;

  if (currentTask.activeAsk != '') {
    const newMessage: Message = {
      id: generateUniqueId(),
      role: 'agent',
      agent_name: agentMessages.data.agent || '',
      content:
        agentMessages.data?.content ||
        agentMessages.data?.notice ||
        agentMessages.data?.answer ||
        agentMessages.data?.question ||
        (agentMessages.data as string) ||
        '',
      step: agentMessages.step,
      isConfirm: false,
    };
    let activeAskList = currentTask.askList;
    store.setActiveAskList(store.currentTaskId, [...activeAskList, newMessage]);
    return true;
  }

  store.setActiveAsk(store.currentTaskId, agentMessages.data.agent || '');
  store.setIsPending(store.currentTaskId, false);

  return true;
}

/**
 * Process SSE message steps (NOTICE, ASK, SYNC)
 * Returns 'sync' if handled as SYNC, otherwise returns the step
 */
export function processSSEMessageSteps(
  store: SSEMessageHandlerStore,
  agentMessages: AgentMessage
): 'sync' | AgentStep | null {
  // Handle SYNC
  if (agentMessages.step === AgentStep.SYNC) {
    return 'sync';
  }

  // Handle NOTICE
  if (handleNotice(store, agentMessages)) {
    return null;
  }

  // Handle ASK
  if (handleAsk(store, agentMessages)) {
    return null;
  }

  return agentMessages.step;
}
