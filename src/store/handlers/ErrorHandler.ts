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
 * ErrorHandler
 *
 * Handler para tratamento de erros SSE extraído do chatStore.ts.
 * Gerencia erros de conexão, cleanup de AbortControllers e status de execução.
 */

import { proxyUpdateTriggerExecution } from '@/service/triggerApi';
import type { ChatStore } from '@/store/chatStore';
import { ChatTaskStatus, ExecutionStatus } from '@/types/constants';

// ============================================================================
// SSE ERROR HANDLING
// ============================================================================

export interface SSEErrorHandlerConfig {
  newTaskId: string;
  project_id: string;
  getCurrentChatStore: () => ChatStore;
  getCurrentTaskId: () => string;
  activeSSEControllers: Record<string, AbortController>;
}

/**
 * Check if error is a connection error that should be retried automatically.
 */
export const isConnectionError = (err: unknown): boolean => {
  return (
    err instanceof TypeError ||
    (err as { message?: string })?.message?.includes('Failed to fetch') ||
    (err as { message?: string })?.message?.includes('ECONNREFUSED') ||
    (err as { message?: string })?.message?.includes('NetworkError') ||
    (err as { message?: string })?.message?.includes('ERR_NETWORK_CHANGED') ||
    (err as { message?: string })?.message?.includes(
      'ERR_INTERNET_DISCONNECTED'
    )
  );
};

/**
 * Update trigger execution status to Cancelled.
 */
export const handleTriggerExecutionStatusUpdate = (
  store: ChatStore,
  projectId: string,
  taskId: string,
  tokens: number
): void => {
  proxyUpdateTriggerExecution(
    store,
    projectId,
    taskId,
    ExecutionStatus.Cancelled,
    tokens || 0
  );
};

/**
 * Clean up AbortController with robust error handling.
 */
export const cleanupSSEController = (
  taskId: string,
  activeSSEControllers: Record<string, AbortController>,
  context: string
): void => {
  try {
    if (activeSSEControllers[taskId]) {
      delete activeSSEControllers[taskId];
      console.log(
        `Cleaned up SSE controller for task ${taskId} after ${context}`
      );
    }
  } catch (cleanupError) {
    console.warn(
      `Error cleaning up AbortController on SSE ${context}:`,
      cleanupError
    );
  }
};

/**
 * Handle SSE error event.
 * Returns true if error should be retried, false if should stop.
 */
export const handleSSEError = (
  err: unknown,
  config: SSEErrorHandlerConfig
): boolean => {
  const {
    newTaskId,
    getCurrentChatStore,
    getCurrentTaskId,
    activeSSEControllers,
  } = config;

  console.error('[fetchEventSource] Error:', err);

  // Do not retry if the task has already finished (avoids duplicate execution
  // after ERR_NETWORK_CHANGED, ERR_INTERNET_DISCONNECTED, sleep/wake - see issue #1212)
  const currentStore = getCurrentChatStore();
  const lockedId = getCurrentTaskId();
  const task = currentStore.tasks[lockedId];

  if (task?.status === ChatTaskStatus.FINISHED) {
    console.log(
      `[fetchEventSource] Task ${lockedId} already finished, stopping retry to avoid duplicate execution`
    );
    cleanupSSEController(newTaskId, activeSSEControllers, 'finished task');
    throw err;
  }

  // Allow automatic retry for connection errors only when task is not finished
  if (isConnectionError(err)) {
    console.warn(
      '[fetchEventSource] Connection error detected, will retry automatically...'
    );
    return true;
  }

  const currentTaskId = getCurrentTaskId();
  // Update trigger execution status to Completed for connection closed by server
  handleTriggerExecutionStatusUpdate(
    getCurrentChatStore(),
    config.project_id,
    currentTaskId,
    getCurrentChatStore().tasks[currentTaskId]?.tokens || 0
  );

  // For other errors, log and throw to stop retrying
  console.error('[fetchEventSource] Fatal error, stopping connection:', err);

  // Clean up AbortController on error
  cleanupSSEController(newTaskId, activeSSEControllers, 'error');
  throw err;
};

/**
 * Handle SSE connection close event.
 */
export const handleSSEClose = (
  abortController: AbortController,
  newTaskId: string,
  activeSSEControllers: Record<string, AbortController>
): void => {
  console.log('SSE connection closed');

  // Abort to resolve fetchEventSource promise (for replay/load - allows awaiting completion)
  try {
    abortController.abort();
  } catch (_e) {
    // Ignore if already aborted
  }

  // Clean up AbortController when connection closes
  cleanupSSEController(newTaskId, activeSSEControllers, 'connection close');
};
