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
 * EndHandler - END step handler for SSE messages
 *
 * Extraído do chatStore.ts para melhor organização.
 */

import { generateUniqueId } from '@/lib';
import { proxyUpdateTriggerExecution } from '@/service/triggerApi';
import type {
  ChatTaskStatusType,
  ExecutionStatus,
  FileInfo,
  Message,
} from '@/types';
import { AgentStep, ChatTaskStatus, TaskStatus } from '@/types/constants';

export interface EndHandlerDeps {
  project_id?: string;
  type?: string;
  historyId?: number;
  email?: string;
  tasks: Record<
    string,
    {
      messages: Message[];
      attaches: File[];
      taskRunning: TaskInfo[];
      taskAssigning: Agent[];
      fileList: FileInfo[];
      summaryTask: string;
      taskTime: number;
      elapsed: number;
      tokens: number;
      snapshotsTemp: any[];
      executionId?: string;
    }
  >;
  setStatus: (taskId: string, status: ChatTaskStatusType) => void;
  setIsPending: (taskId: string, pending: boolean) => void;
  setTaskAssigning: (taskId: string, agents: Agent[]) => void;
  setTaskRunning: (taskId: string, tasks: TaskInfo[]) => void;
  setTaskTime: (taskId: string, taskTime: number) => void;
  setElapsed: (taskId: string, elapsed: number) => void;
  addMessages: (taskId: string, message: Message) => void;
  setUpdateCount: () => void;
  getTokens: (taskId: string) => number;
  getCurrentChatStore: () => EndChatStore;
  uploadLog: (taskId: string, type: string) => void;
  proxyFetchPut: (url: string, data: Record<string, unknown>) => Promise<void>;
  proxyFetchPost: (
    url: string,
    data: Record<string, unknown>
  ) => Promise<unknown>;
  collectTaskUploadFiles: (
    generatedFiles: GeneratedUploadFile[],
    messages: Message[],
    pendingAttaches: File[],
    taskId: string
  ) => UploadCandidate[];
  uploadTaskFiles: (
    files: UploadCandidate[],
    uploadTargetId: string
  ) => Promise<UploadOutcome[]>;
}

interface TaskInfo {
  id: string;
  status: string;
  fileList?: FileInfo[];
}

interface Agent {
  tasks: TaskInfo[];
}

interface File {
  filePath?: string;
  fileName?: string;
}

interface GeneratedUploadFile {
  path?: string;
  name?: string;
  isFolder?: boolean;
  relativePath?: string;
  source?: 'project_output' | 'camel_log';
}

interface UploadCandidate {
  path: string;
  name: string;
  uploadName: string;
  source: 'project_output' | 'camel_log' | 'user_attachment';
}

interface UploadOutcome {
  success: boolean;
  fileName: string;
  source: 'project_output' | 'camel_log' | 'user_attachment';
}

/**
 * Minimal chat store interface for handler usage
 */
interface EndChatStore {
  getState: () => {
    activeTaskId: string | null;
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
 * Handles END step from SSE messages
 */
export async function handleEnd(
  deps: EndHandlerDeps,
  agentMessages: AgentMessage,
  currentTaskId: string
): Promise<boolean | 'N/A'> {
  if (agentMessages.step !== AgentStep.END) {
    return false;
  }

  // compute task time
  console.log(
    'tasks[taskId].snapshotsTemp',
    deps.tasks[currentTaskId]?.snapshotsTemp
  );

  // Upload snapshots
  Promise.all(
    (deps.tasks[currentTaskId]?.snapshotsTemp || []).map((snapshot) =>
      deps.proxyFetchPost(`/api/v1/chat/snapshots`, { ...snapshot })
    )
  );

  const uploadTargetId = deps.project_id;
  if (!deps.type && import.meta.env.VITE_USE_LOCAL_PROXY !== 'true') {
    if (!uploadTargetId) {
      console.warn('Skip file upload because no active project ID was found');
    } else {
      try {
        const generatedFiles =
          ((await window.ipcRenderer.invoke(
            'get-file-list',
            deps.email,
            currentTaskId,
            uploadTargetId
          )) as GeneratedUploadFile[]) || [];
        const filesToUpload = deps.collectTaskUploadFiles(
          generatedFiles,
          deps.tasks[currentTaskId]?.messages || [],
          deps.tasks[currentTaskId]?.attaches || [],
          currentTaskId
        );

        if (filesToUpload.length > 0) {
          const uploadResults = await deps.uploadTaskFiles(
            filesToUpload,
            uploadTargetId
          );
          const failedUploads = uploadResults.filter(
            (result) => !result.success
          );
          if (failedUploads.length > 0) {
            console.error('Failed to upload files:', failedUploads);
          }

          const generatedSuccessCount = uploadResults.filter(
            (result) => result.success && result.source === 'project_output'
          ).length;

          if (generatedSuccessCount > 0) {
            deps.proxyFetchPost(`/api/v1/user/stat`, {
              action: 'file_generate_count',
              value: generatedSuccessCount,
            });
          }
        }
      } catch (error) {
        console.error('Failed to prepare task files for upload:', error);
      }
    }
  }

  // Update history
  if (!deps.type && deps.historyId) {
    const obj = {
      project_name: deps.tasks[currentTaskId]?.summaryTask.split('|')[0] || '',
      summary: deps.tasks[currentTaskId]?.summaryTask.split('|')[1] || '',
      status: 2,
      tokens: deps.getTokens(currentTaskId),
    };
    deps.proxyFetchPut(`/api/v1/chat/history/${deps.historyId}`, obj);
  }

  deps.uploadLog(currentTaskId, deps.type || '');

  // Mark incomplete tasks as skipped
  let taskRunning = [...(deps.tasks[currentTaskId]?.taskRunning || [])];
  let taskAssigning = [...(deps.tasks[currentTaskId]?.taskAssigning || [])];

  taskAssigning = taskAssigning.map((agent) => {
    agent.tasks = agent.tasks.map((task) => {
      if (
        task.status !== TaskStatus.COMPLETED &&
        task.status !== TaskStatus.FAILED &&
        !deps.type
      ) {
        task.status = TaskStatus.SKIPPED;
      }
      return task;
    });
    return agent;
  });

  taskRunning = taskRunning.map((task) => {
    console.log('task.status', task.status);
    if (
      task.status !== TaskStatus.COMPLETED &&
      task.status !== TaskStatus.FAILED &&
      !deps.type
    ) {
      task.status = TaskStatus.SKIPPED;
    }
    return task;
  });

  deps.setTaskAssigning(currentTaskId, [...taskAssigning]);
  deps.setTaskRunning(currentTaskId, [...taskRunning]);

  if (!currentTaskId || !deps.tasks[currentTaskId]) return 'N/A';

  const task = deps.tasks[currentTaskId];
  let taskTime = task.taskTime;
  let elapsed = task.elapsed;

  // if task is running, compute current time
  if (taskTime !== 0) {
    const currentTime = Date.now();
    elapsed += currentTime - taskTime;
  }

  deps.setTaskTime(currentTaskId, 0);
  deps.setElapsed(currentTaskId, elapsed);

  const fileList = (deps.tasks[currentTaskId]?.taskAssigning || [])
    .map((agent) => {
      return (agent.tasks || []).map((task) => task.fileList || []).flat();
    })
    .flat();

  let endMessage = agentMessages.data as string;
  let summary = endMessage.match(/<summary>(.*?)<\/summary>/)?.[1];
  let newMessage: Message | null = null;

  const agent_summary_end = deps.tasks[currentTaskId]?.messages.findLast(
    (message: Message) => message.step === AgentStep.AGENT_SUMMARY_END
  );

  console.log('summary', summary);
  if (summary) {
    endMessage = summary;
  } else if (agent_summary_end) {
    console.log('agent_summary_end', agent_summary_end);
    endMessage = agent_summary_end.summary || '';
  }

  console.log('endMessage', endMessage);
  newMessage = {
    id: generateUniqueId(),
    role: 'agent',
    content: endMessage || '',
    step: agentMessages.step,
    isConfirm: false,
    fileList: fileList,
  };

  deps.addMessages(currentTaskId, newMessage);

  deps.setIsPending(currentTaskId, false);
  deps.setStatus(currentTaskId, ChatTaskStatus.FINISHED);
  // completed tasks move to history
  deps.setUpdateCount();

  console.log(deps.tasks[currentTaskId], 'end');

  // Update trigger execution status to Completed
  proxyUpdateTriggerExecution(
    deps.tasks[currentTaskId]?.executionId || '',
    {
      status: ExecutionStatus.Completed,
      completed_at: new Date().toISOString(),
      tokens_used: deps.tasks[currentTaskId]?.tokens || 0,
    },
    { projectId: deps.project_id }
  ).catch((err) => {
    console.warn('[handleEnd] Failed to update execution status:', err);
  });

  return true;
}
