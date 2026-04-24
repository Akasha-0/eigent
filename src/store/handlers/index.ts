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
 * Handlers Index
 *
 * Módulos extraídos do chatStore.ts para melhor organização e testabilidade.
 */

export {
  MessageHandler,
  addBulkMessages,
  addMessages,
  clearMessages,
  cloneMessage,
  createMessage,
  deleteMessage,
  finalizeStreamingMessage,
  findMessage,
  findMessageIndex,
  getAgentMessages,
  getAgentTaskMessages,
  getLastMessage,
  getMessageCount,
  getUserMessages,
  setMessages,
  updateMessage,
  upsertStreamingMessage,
  validateMessage,
} from './MessageHandler';

export {
  handleTerminal,
  handleWriteFile,
  processFileSteps,
  type FileHandlerStore,
} from './FileHandler';

export {
  handleAsk,
  handleBudgetNotEnough,
  handleContextTooLong,
  handleError,
  handleNotice,
  processSSEMessageErrorSteps,
  processSSEMessageSteps,
  type SSEMessageErrorHandlerStore,
  type SSEMessageHandlerStore,
} from './SSEMessageHandler';

export { ConnectionManager, connectionManager } from './ConnectionManager';

// Re-export types from central types file
export type {
  AddMessageInput,
  Agent,
  AgentMessage,
  ConnectionConfig,
  ConnectionEvent,
  ConnectionState,
  ConnectionStatus,
  File,
  FileInfo,
  Message,
  MessageOperationResult,
  QueuedTask,
  SetMessagesInput,
  TaskInfo,
  TaskPriority,
  TaskQueueConfig,
  ToolKit,
  UpdateMessageInput,
} from '@/types/handlers';

export {
  filterMessage,
  handleActivateToolkit,
  handleDeactivateToolkit,
  normalizeToolkitMessage,
  resolveProcessTaskIdForToolkitEvent,
} from './ToolkitHandler';

export {
  cleanupSSEController,
  handleSSEClose,
  handleSSEError,
  handleTriggerExecutionStatusUpdate,
  isConnectionError,
} from './ErrorHandler';

export {
  handleActivateAgent,
  handleCreateAgent,
  handleDeactivateAgent,
  processAgentSteps,
  type AgentHandlerStore,
} from './AgentHandler';

export {
  handleAssignTask,
  handleTaskState,
  handleToSubTasks,
  processTaskSteps,
  type TaskHandlerStore,
} from './TaskHandler';
