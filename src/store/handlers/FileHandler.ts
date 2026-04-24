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
 * FileHandler - Terminal and File Write handlers for SSE messages
 *
 * Extraído do chatStore.ts para melhor organização.
 */

import type { AgentStep } from '@/types/constants';
import type { AgentMessage, FileInfo } from '@/types/handlers';
import { FileText } from 'lucide-react';

// Store access types - these will be provided by the parent chatStore
export interface FileHandlerStore {
  currentTaskId: string;
  tasks: Record<
    string,
    {
      nuwFileNum: number;
      fileList: FileInfo[];
    }
  >;
  addTerminal: (taskId: string, processTaskId: string, output: string) => void;
  setNuwFileNum: (taskId: string, num: number) => void;
  addFileList: (
    taskId: string,
    processTaskId: string,
    fileInfo: FileInfo
  ) => void;
  usePageTabStore: {
    getState: () => { markTabAsUnviewed: (tab: string) => void };
  };
}

/**
 * Handles TERMINAL step from SSE messages
 */
export function handleTerminal(
  store: FileHandlerStore,
  agentMessages: AgentMessage
): boolean {
  if (agentMessages.step !== AgentStep.TERMINAL) {
    return false;
  }

  store.addTerminal(
    store.currentTaskId,
    agentMessages.data.process_task_id as string,
    agentMessages.data.output as string
  );

  return true;
}

/**
 * Handles WRITE_FILE step from SSE messages
 */
export function handleWriteFile(
  store: FileHandlerStore,
  agentMessages: AgentMessage
): boolean {
  if (agentMessages.step !== AgentStep.WRITE_FILE) {
    return false;
  }

  console.log('write_to_file', agentMessages.data);

  const currentTask = store.tasks[store.currentTaskId];
  if (!currentTask) return true;

  store.setNuwFileNum(store.currentTaskId, currentTask.nuwFileNum + 1);

  // Mark inbox tab as having unviewed content
  store.usePageTabStore.getState().markTabAsUnviewed('inbox');

  const { file_path } = agentMessages.data;
  const fileName = file_path?.replace(/\\/g, '/').split('/').pop() || '';
  const fileType = fileName.split('.').pop() || '';
  const fileInfo: FileInfo = {
    name: fileName,
    type: fileType,
    path: file_path || '',
    icon: FileText,
  };

  store.addFileList(
    store.currentTaskId,
    agentMessages.data.process_task_id as string,
    fileInfo
  );

  return true;
}

/**
 * Process all file-related steps (TERMINAL, WRITE_FILE)
 */
export function processFileSteps(
  store: FileHandlerStore,
  agentMessages: AgentMessage
): boolean {
  return (
    handleTerminal(store, agentMessages) ||
    handleWriteFile(store, agentMessages)
  );
}
