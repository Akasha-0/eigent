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
import { proxyUpdateTriggerExecution } from '@/service/triggerApi';
import type { ExecutionStatus } from '@/types';
import type { ChatTaskStatusType } from '@/types/constants';
import { AgentStatusValue, AgentStep, ChatTaskStatus } from '@/types/constants';
import type {
  Agent,
  AgentMessage,
  Message,
  TaskInfo,
  ToolKit,
} from '@/types/handlers';
import { toast } from 'sonner';

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
 * Dependencies needed for CONFIRMED handler
 */
export interface ConfirmedHandlerDeps {
  project_id?: string;
  messageContent?: string;
  type?: string;
  delayTime?: number;
  email?: string;
  apiModel: {
    model_platform?: string;
    model_type?: string;
    api_key?: string;
    api_url?: string;
    extra_params?: Record<string, unknown>;
  };
  systemLanguage?: string;
  skipFirstConfirm: { current: boolean };
  autoConfirmTimers: Record<string, ReturnType<typeof setTimeout>>;
  ttftTracking: Record<
    string,
    { confirmedAt: number; firstTokenLogged: boolean }
  >;
  projectStore: {
    activeProjectId: string | null;
    appendInitChatStore: (
      projectId: string,
      nextTaskId?: string
    ) => { taskId: string; chatStore: ConfirmedChatStore } | null;
    setHistoryId: (projectId: string, historyId: number) => void;
  };
  updateLockedReferences: (
    chatStore: ConfirmedChatStore,
    taskId: string
  ) => void;
  targetChatStore: ConfirmedChatStore;
  generateUniqueId: () => string;
  addWorkers?: unknown[];
  browser_port?: string;
  cdp_browsers?: unknown;
  envPath?: string;
  searchConfig?: unknown;
  proxyFetchPost: (
    url: string,
    data: Record<string, unknown>
  ) => Promise<{ id: number }>;
  getCurrentChatStore: () => ConfirmedChatStore;
  setStatus: (taskId: string, status: ChatTaskStatusType) => void;
  setHasWaitComfirm: (taskId: string, value: boolean) => void;
}

/**
 * Minimal chat store interface for handler usage
 */
interface ConfirmedChatStore {
  getState: () => {
    activeTaskId: string | null;
    nextTaskId: string | null;
    tasks: Record<
      string,
      {
        messages: Message[];
        attaches: File[];
        nextExecutionId?: string;
      }
    >;
    setIsPending: (taskId: string, pending: boolean) => void;
    setExecutionId: (taskId: string, executionId: string) => void;
    setDelayTime: (taskId: string, delayTime: number) => void;
    setType: (taskId: string, type: string) => void;
    addMessages: (taskId: string, message: Message) => void;
    removeMessage: (taskId: string, messageId: string) => void;
  };
  removeMessage: (taskId: string, messageId: string) => void;
}

/**
 * Handles CONFIRMED step from SSE messages
 */
export async function handleConfirmed(
  deps: ConfirmedHandlerDeps,
  agentMessages: AgentMessage,
  currentTaskId: string
): Promise<boolean> {
  if (agentMessages.step !== AgentStep.CONFIRMED) {
    return false;
  }

  const { question } = agentMessages.data as { question?: string };
  const shouldCreateNewChat =
    deps.project_id && (question || deps.messageContent);

  // All except first confirmed event to reuse the existing chatStore
  if (shouldCreateNewChat && !deps.skipFirstConfirm.current) {
    /**
     * For Tasks where appended to existing project by
     * reusing same projectId. Need to create new chatStore
     * as it has been skipped earlier in startTask.
     */
    const nextTaskId = deps.targetChatStore.getState().nextTaskId || undefined;
    const newChatResult = deps.projectStore.appendInitChatStore(
      deps.project_id || deps.projectStore.activeProjectId!,
      nextTaskId
    );

    if (newChatResult) {
      const { taskId: newTaskId, chatStore: newChatStore } = newChatResult;

      // Update references for both scenarios
      deps.updateLockedReferences(newChatStore, newTaskId);
      newChatStore.getState().setIsPending(newTaskId, false);

      // If nextExecutionId exists, pass it to new task
      const previousTask = deps.targetChatStore.getState().tasks[currentTaskId];
      if (previousTask?.nextExecutionId) {
        newChatStore
          .getState()
          .setExecutionId(newTaskId, previousTask.nextExecutionId);
      }

      if (deps.type === 'replay') {
        newChatStore
          .getState()
          .setDelayTime(newTaskId, deps.delayTime as number);
        newChatStore.getState().setType(newTaskId, 'replay');
      }

      const lastMessage = previousTask?.messages.at(-1);
      if (lastMessage?.role === 'user' && lastMessage?.id) {
        deps.targetChatStore.removeMessage(currentTaskId, lastMessage.id);
      }

      const attachesForNewMessage =
        lastMessage?.role === 'user' && lastMessage?.attaches?.length
          ? lastMessage.attaches
          : [...(previousTask?.attaches || [])];

      // Trick: by the time the question is retrieved from event,
      // the last message from previous chatStore is at display
      newChatStore.getState().addMessages(newTaskId, {
        id: deps.generateUniqueId(),
        role: 'user',
        content: question || (deps.messageContent as string),
        attaches: attachesForNewMessage,
      });
      console.log('[NEW CHATSTORE] Created for ', deps.project_id);

      // Create a new history point
      if (!deps.type) {
        const obj = {
          project_id: deps.project_id,
          task_id: newTaskId,
          user_id: deps.email,
          question:
            question ||
            deps.messageContent ||
            (deps.targetChatStore.getState().tasks[newTaskId]?.messages[0]
              ?.content ??
              ''),
          language: deps.systemLanguage,
          model_platform: deps.apiModel.model_platform,
          model_type: deps.apiModel.model_type,
          api_url: deps.apiModel.api_url,
          max_retries: 3,
          file_save_path: 'string',
          installed_mcp: 'string',
          status: 1,
          tokens: 0,
        };
        await deps.proxyFetchPost(`/api/v1/chat/history`, obj).then((res) => {
          const historyId = res.id;
          if (deps.project_id && historyId)
            deps.projectStore.setHistoryId(deps.project_id, historyId);
        });
      }
    }
  } else {
    // NOTE: Triggered only with first "confirmed" in the project
    // Handle Original cases - with old chatStore
    deps.setStatus(currentTaskId, ChatTaskStatus.PENDING);
    deps.setHasWaitComfirm(currentTaskId, false);
  }

  // Enable it for the rest of current SSE session
  deps.skipFirstConfirm.current = false;

  // Record confirmed time for TTFT tracking
  const ttftTaskId = deps.targetChatStore.getState().activeTaskId;
  deps.ttftTracking[ttftTaskId] = {
    confirmedAt: performance.now(),
    firstTokenLogged: false,
  };
  console.log(
    `[TTFT] Task ${ttftTaskId} confirmed at ${new Date().toISOString()}, starting TTFT measurement`
  );

  return true;
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

// Store access types for error handlers
export interface SSEMessageErrorHandlerStore {
  currentTaskId: string;
  tasks: Record<
    string,
    {
      tokens: number;
      taskRunning: TaskInfo[];
      taskAssigning: Agent[];
      executionId?: string;
    }
  >;
  setTaskRunning: (taskId: string, tasks: TaskInfo[]) => void;
  setTaskAssigning: (taskId: string, agents: Agent[]) => void;
  setStatus: (taskId: string, status: ChatTaskStatus) => void;
  setIsPending: (taskId: string, pending: boolean) => void;
  setIsContextExceeded: (taskId: string, exceeded: boolean) => void;
  addMessages: (taskId: string, message: Message) => void;
  getState: () => SSEMessageErrorHandlerStore & Record<string, unknown>;
  type?: string;
  project_id?: string;
}

/**
 * Handles BUDGET_NOT_ENOUGH step from SSE messages
 */
export function handleBudgetNotEnough(
  store: SSEMessageErrorHandlerStore,
  agentMessages: AgentMessage
): boolean {
  if (agentMessages.step !== AgentStep.BUDGET_NOT_ENOUGH) {
    return false;
  }

  console.log('error', agentMessages.data);

  // Dynamically import showCreditsToast to avoid circular dependency
  import('@/components/Toast/creditsToast').then(({ showCreditsToast }) => {
    showCreditsToast();
  });

  store.setStatus(store.currentTaskId, ChatTaskStatus.PAUSE);

  // Import uploadLog dynamically
  import('@/lib').then(({ uploadLog }) => {
    uploadLog(store.currentTaskId, store.type || '');
  });

  return true;
}

/**
 * Handles CONTEXT_TOO_LONG step from SSE messages
 */
export function handleContextTooLong(
  store: SSEMessageErrorHandlerStore,
  agentMessages: AgentMessage
): boolean {
  if (agentMessages.step !== AgentStep.CONTEXT_TOO_LONG) {
    return false;
  }

  console.error('Context too long:', agentMessages.data);
  const currentLength = agentMessages.data?.current_length || 0;
  const maxLength = agentMessages.data?.max_length || 100000;

  // Show toast notification
  toast.dismiss();
  toast.error(
    `⚠️ Context Limit Exceeded\n\nThe conversation history is too long (${currentLength.toLocaleString()} / ${maxLength.toLocaleString()} characters).\n\nPlease create a new project to continue your work.`,
    {
      duration: Infinity,
      closeButton: true,
    }
  );

  // Set flag to block input and set status to pause
  store.setIsContextExceeded(store.currentTaskId, true);
  store.setStatus(store.currentTaskId, ChatTaskStatus.PAUSE);

  // Import uploadLog dynamically
  import('@/lib').then(({ uploadLog }) => {
    uploadLog(store.currentTaskId, store.type || '');
  });

  return true;
}

/**
 * Handles ERROR step from SSE messages
 */
export async function handleError(
  store: SSEMessageErrorHandlerStore,
  agentMessages: AgentMessage
): Promise<boolean> {
  if (agentMessages.step !== AgentStep.ERROR) {
    return false;
  }

  try {
    console.error('Model error:', agentMessages.data);

    // Validate that agentMessages.data exists before processing
    if (agentMessages.data === undefined || agentMessages.data === null) {
      throw new Error('Invalid error message format: missing data');
    }

    // Safely extract error message with fallback chain
    const errorMessage =
      agentMessages.data?.message ||
      (typeof agentMessages.data === 'string' ? agentMessages.data : null) ||
      'An error occurred while processing your request';

    // Get task data from store
    const task = store.tasks[store.currentTaskId];
    if (!task) return true;

    // Mark all incomplete tasks as failed
    let taskRunning = [...task.taskRunning];
    let taskAssigning = [...task.taskAssigning];

    // Update taskRunning - mark non-completed tasks as failed
    taskRunning = taskRunning.map((t) => {
      if (t.status !== 'completed' && t.status !== 'failed') {
        t.status = 'failed' as TaskInfo['status'];
      }
      return t;
    });

    // Update taskAssigning - mark non-completed tasks as failed
    taskAssigning = taskAssigning.map((agent) => {
      agent.tasks = agent.tasks.map((t) => {
        if (t.status !== 'completed' && t.status !== 'failed') {
          t.status = 'failed' as TaskInfo['status'];
        }
        return t;
      });
      return agent;
    });

    // Apply the updates
    store.setTaskRunning(store.currentTaskId, taskRunning);
    store.setTaskAssigning(store.currentTaskId, taskAssigning);

    // Complete the current task with error status
    store.setStatus(store.currentTaskId, ChatTaskStatus.FINISHED);
    store.setIsPending(store.currentTaskId, false);

    // Add error message to the current task
    store.addMessages(store.currentTaskId, {
      id: generateUniqueId(),
      role: 'agent',
      content: `❌ **Error**: ${errorMessage}`,
    });

    // Import uploadLog dynamically
    const { uploadLog } = await import('@/lib');
    uploadLog(store.currentTaskId, store.type || '');

    // Update trigger execution status to Failed on error
    const executionId = task.executionId;
    if (executionId && store.project_id) {
      try {
        await proxyUpdateTriggerExecution(
          executionId,
          {
            status: ExecutionStatus.Failed,
            completed_at: new Date().toISOString(),
            error_message: errorMessage,
            tokens_used: task.tokens || 0,
          },
          { projectId: store.project_id }
        );
      } catch (err) {
        console.warn('[handleError] Failed to update execution status:', err);
      }
    }

    // Stop the workforce - import fetchDelete dynamically
    try {
      const { fetchDelete } = await import('@/api/http');
      await fetchDelete(`/chat/${store.project_id}`);
    } catch (error) {
      console.log('Task may not exist on backend:', error);
    }
  } catch (error) {
    console.error('Failed to handle model error:', error);
    console.error('Original agentMessages:', agentMessages);

    // Fallback: try to create error task with minimal operations
    try {
      const fullState = store.getState() as SSEMessageErrorHandlerStore & {
        create: () => string;
        setActiveTaskId: (id: string) => void;
        setHasWaitComfirm: (id: string, val: boolean) => void;
      };
      const fallbackTaskId = fullState.create();
      fullState.setActiveTaskId(fallbackTaskId);
      fullState.setHasWaitComfirm(fallbackTaskId, true);
      fullState.addMessages(fallbackTaskId, {
        id: generateUniqueId(),
        role: 'agent',
        content: `**Critical Error**: An unexpected error occurred while handling a model error. Please refresh the application or contact support.`,
      });
    } catch (fallbackError) {
      console.error('Failed to create fallback error task:', fallbackError);
      console.error('Failed to handle model error:', error);
    }
  }

  return true;
}

/**
 * Process SSE message steps (NOTICE, ASK, SYNC, ERROR handling)
 * Returns true if handled, false if should continue to other handlers
 */
export function processSSEMessageErrorSteps(
  store: SSEMessageErrorHandlerStore,
  agentMessages: AgentMessage
): boolean {
  // Handle BUDGET_NOT_ENOUGH
  if (handleBudgetNotEnough(store, agentMessages)) {
    return true;
  }

  // Handle CONTEXT_TOO_LONG
  if (handleContextTooLong(store, agentMessages)) {
    return true;
  }

  // ERROR is handled asynchronously - don't block on it
  return false;
}
