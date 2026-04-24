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
 * Shared Types for Store Handlers
 *
 * Tipos centralizados para MessageHandler, ConnectionManager e TaskQueue.
 * Evita duplicação de interfaces entre os módulos.
 */

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  step?: string;
  agent_id?: string;
  isConfirm?: boolean;
  taskType?: 1 | 2 | 3;
  taskInfo?: TaskInfo[];
  taskRunning?: TaskInfo[];
  summaryTask?: string;
  taskAssigning?: Agent[];
  showType?: 'tree' | 'list';
  rePort?: unknown;
  fileList?: FileInfo[];
  task_id?: string;
  summary?: string;
  agent_name?: string;
  attaches?: File[];
}

export interface File {
  fileName: string;
  filePath: string;
}

export interface FileInfo {
  name: string;
  type: string;
  path: string;
  content?: string;
  agent_id?: string;
  task_id?: string;
  project_id?: string;
  isFolder?: boolean;
  relativePath?: string;
  icon?: unknown;
}

// ============================================================================
// TASK TYPES
// ============================================================================

export interface TaskInfo {
  id: string;
  content: string;
  status?: string;
  agent?: Agent;
  terminal?: string[];
  fileList?: FileInfo[];
  project_id?: string;
  toolkits?: ToolKit[];
  failure_count?: number;
  reAssignTo?: string;
  report?: string;
}

export interface ToolKit {
  toolkitId?: string;
  toolkitName: string;
  toolkitMethods: string;
  message: string;
  toolkitStatus?: string;
}

export interface Agent {
  agent_id: string;
  name: string;
  type: string;
  status?: string;
  tasks: TaskInfo[];
  log: AgentMessage[];
}

export interface AgentMessage {
  step: string;
  data: Record<string, unknown>;
  status?: string;
}

// ============================================================================
// CONNECTION TYPES
// ============================================================================

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  taskId: string;
  connectedAt?: Date;
  error?: string;
}

export interface ConnectionEvent {
  type: 'message' | 'error' | 'close' | 'open';
  data?: unknown;
  error?: Error;
}

export interface ConnectionConfig {
  taskId: string;
  url: string;
  headers?: Record<string, string>;
  onMessage?: (data: unknown) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  onOpen?: () => void;
}

// ============================================================================
// TASK QUEUE TYPES
// ============================================================================

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface QueuedTask {
  id: string;
  priority: TaskPriority;
  taskId: string;
  createdAt: number;
}

export interface TaskQueueConfig {
  maxConcurrent: number;
  maxQueueSize: number;
}

// ============================================================================
// HANDLER OPERATION TYPES
// ============================================================================

export interface MessageOperationResult {
  success: boolean;
  error?: string;
}

export interface AddMessageInput {
  taskId: string;
  message: Message;
}

export interface UpdateMessageInput {
  taskId: string;
  messageId: string;
  message: Partial<Message>;
}

export interface SetMessagesInput {
  taskId: string;
  messages: Message[];
}
