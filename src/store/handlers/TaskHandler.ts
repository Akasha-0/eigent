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
 * TaskHandler - Task lifecycle handlers for SSE messages
 *
 * Extraído do chatStore.ts para melhor organização.
 * Handles: TO_SUB_TASKS, TASK_STATE, ASSIGN_TASK, CONFIRMED, END, ADD_TASK, REMOVE_TASK
 */

import { generateUniqueId } from '@/lib';
import type { AgentStep } from '@/types/constants';
import { ChatTaskStatus, TaskStatus } from '@/types/constants';
import type { Agent, AgentMessage, Message, TaskInfo } from '@/types/handlers';
import { useProjectStore } from '../projectStore';

// Store access types - these will be provided by the parent chatStore
export interface TaskHandlerStore {
  currentTaskId: string;
  tasks: Record<
    string,
    {
      messages: Message[];
      taskInfo: TaskInfo[];
      taskRunning: TaskInfo[];
      taskAssigning: Agent[];
      summaryTask: string;
      status: string;
      isTaskEdit: boolean;
      isTakeControl: boolean;
      tokens: number;
    }
  >;
  setTaskInfo: (taskId: string, tasks: TaskInfo[]) => void;
  setTaskRunning: (taskId: string, tasks: TaskInfo[]) => void;
  setTaskAssigning: (taskId: string, agents: Agent[]) => void;
  setSummaryTask: (taskId: string, summary: string) => void;
  setStatus: (taskId: string, status: string) => void;
  setIsTaskEdit: (taskId: string, isEdit: boolean) => void;
  addMessages: (taskId: string, message: Message) => void;
  addTokens: (taskId: string, tokens: number) => void;
  getTokens: (taskId: string) => number;
  clearStreamingDecomposeText: (taskId: string) => void;
  handleConfirmTask: (
    project_id: string,
    taskId: string,
    type?: string
  ) => void;
  webviewDestroy?: (id: string) => void;
}

// Auto-confirm timer type
type AutoConfirmTimer = ReturnType<typeof setTimeout>;

/**
 * Creates a new task info object
 */
function createNewTaskInfo(): TaskInfo {
  return {
    id: '',
    content: '',
  };
}

/**
 * Creates a new to_sub_tasks message
 */
function createToSubTasksMessage(
  taskId: string,
  type: string | undefined,
  shouldAutoConfirm: boolean
): Message {
  return {
    id: generateUniqueId(),
    role: 'agent',
    content: '',
    step: AgentStep.TO_SUB_TASKS,
    taskType: type ? 2 : 1,
    showType: 'list',
    isConfirm: shouldAutoConfirm,
    task_id: taskId,
  };
}

/**
 * Creates a new notice card message
 */
function createNoticeCardMessage(): Message {
  return {
    id: generateUniqueId(),
    role: 'agent',
    content: '',
    step: AgentStep.NOTICE_CARD,
  };
}

/**
 * Handles TO_SUB_TASKS step from SSE messages
 * Creates subtasks for workforce splitting
 */
export function handleToSubTasks(
  store: TaskHandlerStore,
  agentMessages: AgentMessage,
  autoConfirmTimers: Record<string, AutoConfirmTimer>,
  context?: {
    type?: string;
    historyId?: string;
    project_id?: string;
  }
): boolean {
  if (agentMessages.step !== AgentStep.TO_SUB_TASKS) {
    return false;
  }

  const currentTask = store.tasks[store.currentTaskId];
  if (!currentTask) return true;

  // Clear streaming decompose text when task splitting is done
  store.clearStreamingDecomposeText(store.currentTaskId);

  // Check if task is already confirmed - don't overwrite user edits
  const existingToSubTasksMessage = currentTask.messages.findLast(
    (m: Message) => m.step === AgentStep.TO_SUB_TASKS
  );
  if (existingToSubTasksMessage?.isConfirm) {
    return true;
  }

  // Check if this is a multi-turn scenario after task completion
  const isMultiTurnAfterCompletion =
    currentTask.status === ChatTaskStatus.FINISHED;

  // Reset status for multi-turn complex tasks to allow splitting panel to show
  if (isMultiTurnAfterCompletion) {
    store.setStatus(store.currentTaskId, ChatTaskStatus.PENDING);
  }

  // Each splitting round starts in a clean editing state
  store.setIsTaskEdit(store.currentTaskId, false);

  const messages = [...currentTask.messages];
  const toSubTaskIndex = messages.findLastIndex(
    (message: Message) => message.step === AgentStep.TO_SUB_TASKS
  );

  // For multi-turn scenarios, always create a new to_sub_tasks message
  if (toSubTaskIndex === -1 || isMultiTurnAfterCompletion) {
    // Clear any pending auto-confirm timer from previous rounds
    if (autoConfirmTimers[store.currentTaskId]) {
      clearTimeout(autoConfirmTimers[store.currentTaskId]);
      delete autoConfirmTimers[store.currentTaskId];
    }

    // 30 seconds auto confirm
    if (context?.project_id && !context?.type) {
      const timer = setTimeout(() => {
        try {
          const message = currentTask.messages.findLast(
            (item) => item.step === AgentStep.TO_SUB_TASKS
          );
          const isConfirm = message?.isConfirm || false;
          const isTakeControl = currentTask.isTakeControl;
          const isTaskEdit = currentTask.isTaskEdit;

          if (
            context.project_id &&
            !isConfirm &&
            !isTakeControl &&
            !isTaskEdit
          ) {
            store.handleConfirmTask(
              context.project_id,
              store.currentTaskId,
              context.type
            );
          }
          store.setIsTaskEdit(store.currentTaskId, false);
          delete autoConfirmTimers[store.currentTaskId];
        } catch (error) {
          console.error('Error in auto-confirm timeout handler:', error);
          delete autoConfirmTimers[store.currentTaskId];
        }
      }, 30000);

      autoConfirmTimers[store.currentTaskId] = timer;
    }

    // Add notice card message
    store.addMessages(store.currentTaskId, createNoticeCardMessage());

    const shouldAutoConfirm = !!context?.type && !isMultiTurnAfterCompletion;

    // Add to_sub_tasks message
    store.addMessages(
      store.currentTaskId,
      createToSubTasksMessage(
        store.currentTaskId,
        context?.type,
        shouldAutoConfirm
      )
    );

    // Add new task to sub_tasks if not replay
    const subTasks = agentMessages.data.sub_tasks as TaskInfo[] | undefined;
    if (context?.type !== 'replay' && subTasks) {
      subTasks.push(createNewTaskInfo());
    }
  }

  // Update subtask statuses
  const subTasks = agentMessages.data.sub_tasks as TaskInfo[] | undefined;
  if (subTasks) {
    agentMessages.data.sub_tasks = subTasks.map((item) => {
      item.status = TaskStatus.EMPTY;
      return item;
    });
  }

  // Update history if not replay
  if (!context?.type && context?.historyId) {
    const summaryTask = agentMessages.data.summary_task as string | undefined;
    const summaryParts = summaryTask?.split('|') || [];
    // Note: This would need to be called via a callback or store action
    // proxyFetchPut(`/api/v1/chat/history/${historyId}`, {
    //   project_name: summaryParts[0] || '',
    //   summary: summaryParts[1] || '',
    //   status: 1,
    //   tokens: store.getTokens(store.currentTaskId),
    // });
  }

  // Update store with task info
  if (agentMessages.data.summary_task) {
    store.setSummaryTask(
      store.currentTaskId,
      agentMessages.data.summary_task as string
    );
  }

  if (agentMessages.data.sub_tasks) {
    store.setTaskInfo(
      store.currentTaskId,
      agentMessages.data.sub_tasks as TaskInfo[]
    );
    store.setTaskRunning(
      store.currentTaskId,
      agentMessages.data.sub_tasks as TaskInfo[]
    );
  }

  return true;
}

/**
 * Handles TASK_STATE step from SSE messages
 * Updates task completion status
 */
export function handleTaskState(
  store: TaskHandlerStore,
  agentMessages: AgentMessage,
  webviewDestroy?: (id: string) => void
): boolean {
  if (agentMessages.step !== AgentStep.TASK_STATE) {
    return false;
  }

  const currentTask = store.tasks[store.currentTaskId];
  if (!currentTask) return true;

  const { state, task_id, result, failure_count } = agentMessages.data as {
    state?: string;
    task_id?: string;
    result?: string;
    failure_count?: number;
  };

  if (!state && !task_id) {
    return true;
  }

  let taskRunning = [...currentTask.taskRunning];
  let taskAssigning = [...currentTask.taskAssigning];

  // Find task in taskRunning
  const targetTaskIndex = taskRunning.findIndex((task) => task.id === task_id);

  // Find agent in taskAssigning
  const targetTaskAssigningIndex = taskAssigning.findIndex((agent) =>
    agent.tasks.find(
      (task: TaskInfo) => task.id === task_id && !task.reAssignTo
    )
  );

  // Update taskAssigning if found
  if (targetTaskAssigningIndex !== -1) {
    const taskIndex = taskAssigning[targetTaskAssigningIndex].tasks.findIndex(
      (task: TaskInfo) => task.id === task_id
    );

    taskAssigning[targetTaskAssigningIndex].tasks[taskIndex].status =
      state === 'DONE' ? TaskStatus.COMPLETED : TaskStatus.FAILED;
    taskAssigning[targetTaskAssigningIndex].tasks[taskIndex].failure_count =
      failure_count || 0;

    // Destroy webviews for browser agent
    const agent = taskAssigning[targetTaskAssigningIndex];
    if (agent.type === 'browser_agent' && agent.activeWebviewIds?.length) {
      const removeList: number[] = [];
      const destroyFn = webviewDestroy ?? store.webviewDestroy;
      agent.activeWebviewIds.forEach((webview, index) => {
        if (webview.processTaskId === task_id && destroyFn) {
          destroyFn(webview.id);
          removeList.push(index);
        }
      });
      removeList.forEach((index) => {
        agent.activeWebviewIds?.splice(index, 1);
      });
    }

    // Update report if result provided
    if (result && result !== '') {
      const agentName = taskAssigning[targetTaskAssigningIndex].name;
      const agentId = taskAssigning[targetTaskAssigningIndex].agent_id;
      let targetResult = result.replace(agentId, agentName);
      taskAssigning[targetTaskAssigningIndex].tasks[taskIndex].report =
        targetResult;

      // Add FAILED message if task failed with 3+ failures
      if (state === 'FAILED' && failure_count && failure_count >= 3) {
        store.addMessages(store.currentTaskId, {
          id: generateUniqueId(),
          role: 'agent',
          content: targetResult,
          step: AgentStep.FAILED,
        });
      }
    }
  }

  // Update taskRunning if found
  if (targetTaskIndex !== -1) {
    console.log('targetTaskIndex', targetTaskIndex, state);
    taskRunning[targetTaskIndex].status =
      state === 'DONE' ? TaskStatus.COMPLETED : TaskStatus.FAILED;
  }

  store.setTaskRunning(store.currentTaskId, taskRunning);
  store.setTaskAssigning(store.currentTaskId, taskAssigning);

  return true;
}

/**
 * Handles ASSIGN_TASK step from SSE messages
 * Assigns tasks to agents
 */
export function handleAssignTask(
  store: TaskHandlerStore,
  agentMessages: AgentMessage,
  context?: {
    type?: string;
    historyId?: string;
  }
): boolean {
  if (agentMessages.step !== AgentStep.ASSIGN_TASK) {
    return false;
  }

  const currentTask = store.tasks[store.currentTaskId];
  if (!currentTask) return true;

  const {
    assignee_id,
    task_id,
    content,
    state: taskState,
    failure_count,
  } = agentMessages.data as {
    assignee_id?: string;
    task_id?: string;
    content?: string;
    state?: string;
    failure_count?: number;
  };

  if (!assignee_id || !task_id) {
    return true;
  }

  let taskAssigning = [...currentTask.taskAssigning];
  let taskRunning = [...currentTask.taskRunning];
  let taskInfo = [...currentTask.taskInfo];

  // Find the index of the agent corresponding to assignee_id
  const assigneeAgentIndex = taskAssigning.findIndex(
    (agent: Agent) => agent.agent_id === assignee_id
  );

  // Find task corresponding to task_id
  const task = taskInfo.find((task: TaskInfo) => task.id === task_id);

  const taskRunningIndex = taskRunning.findIndex(
    (task: TaskInfo) => task.id === task_id
  );

  // Skip tasks with empty content only if the task doesn't exist in taskInfo
  if ((!content || content.trim() === '') && !task) {
    console.warn(
      `Skipping task ${task_id} with empty content and not found in taskInfo`
    );
    return true;
  }

  if (assigneeAgentIndex === -1) {
    return true;
  }

  const taskAgent = taskAssigning[assigneeAgentIndex];

  // Find the agent to reassign the task to
  const target = taskAssigning
    .map((agent, agentIndex) => {
      if (agent.agent_id === assignee_id) return null;

      const taskIndex = agent.tasks.findIndex(
        (task: TaskInfo) => task.id === task_id && !task.reAssignTo
      );

      return taskIndex !== -1 ? { agentIndex, taskIndex } : null;
    })
    .find(Boolean);

  if (target) {
    const { agentIndex, taskIndex } = target;
    const agentName = taskAssigning.find(
      (agent: Agent) => agent.agent_id === assignee_id
    )?.name;
    if (agentName !== taskAssigning[agentIndex].name) {
      taskAssigning[agentIndex].tasks[taskIndex].reAssignTo = agentName;
    }
  }

  // Clear logs from the assignee agent that are related to this task
  // This prevents logs from previous attempts appearing in the reassigned task
  if (taskState !== TaskStatus.WAITING && failure_count && failure_count > 0) {
    taskAssigning[assigneeAgentIndex].log = taskAssigning[
      assigneeAgentIndex
    ].log.filter((log) => (log.data as any).process_task_id !== task_id);
  }

  // Handle task assignment based on state
  if (taskState === TaskStatus.WAITING) {
    const existingTask = taskAssigning[assigneeAgentIndex].tasks.find(
      (item) => item.id === task_id
    );
    if (!existingTask) {
      taskAssigning[assigneeAgentIndex].tasks.push(
        task ?? {
          id: task_id,
          content: content || '',
          status: TaskStatus.WAITING,
        }
      );
    }
    store.setTaskAssigning(store.currentTaskId, [...taskAssigning]);
  } else if (taskAssigning[assigneeAgentIndex]) {
    // Task is running
    const existingTaskIndex = taskAssigning[assigneeAgentIndex].tasks.findIndex(
      (item) => item.id === task_id
    );

    if (existingTaskIndex !== -1) {
      // Task already exists, update its status
      taskAssigning[assigneeAgentIndex].tasks[existingTaskIndex].status =
        TaskStatus.RUNNING;
      if (failure_count !== 0) {
        taskAssigning[assigneeAgentIndex].tasks[
          existingTaskIndex
        ].failure_count = failure_count;
      }
    } else {
      // Task doesn't exist, add it
      let taskTemp: TaskInfo | null = null;
      if (task) {
        taskTemp = JSON.parse(JSON.stringify(task));
        taskTemp.failure_count = 0;
        taskTemp.status = TaskStatus.RUNNING;
        taskTemp.toolkits = [];
        taskTemp.report = '';
      }
      taskAssigning[assigneeAgentIndex].tasks.push(
        taskTemp ?? {
          id: task_id,
          content: content || '',
          status: TaskStatus.RUNNING,
        }
      );
    }
  }

  // Update taskRunning
  if (taskRunningIndex === -1) {
    // Task not in taskRunning, add it
    if (task) {
      task.status =
        taskState === TaskStatus.WAITING
          ? TaskStatus.WAITING
          : TaskStatus.RUNNING;
    }
    taskRunning.push(
      task ?? {
        id: task_id,
        content: content || '',
        status:
          taskState === TaskStatus.WAITING
            ? TaskStatus.WAITING
            : TaskStatus.RUNNING,
        agent: JSON.parse(JSON.stringify(taskAgent)),
      }
    );
  } else {
    // Task already in taskRunning, update it
    taskRunning[taskRunningIndex] = {
      ...taskRunning[taskRunningIndex],
      status:
        taskState === TaskStatus.WAITING
          ? TaskStatus.WAITING
          : TaskStatus.RUNNING,
      agent: JSON.parse(JSON.stringify(taskAgent)),
    };
  }

  store.setTaskRunning(store.currentTaskId, taskRunning);
  store.setTaskAssigning(store.currentTaskId, taskAssigning);

  return true;
}

/**
 * Handles ADD_TASK step from SSE messages
 * Queues tasks for the project store
 */
export function handleAddTask(
  store: TaskHandlerStore,
  agentMessages: AgentMessage
): boolean {
  if (agentMessages.step !== AgentStep.ADD_TASK) {
    return false;
  }

  try {
    const taskData = agentMessages.data;
    if (taskData && taskData.project_id && taskData.content) {
      console.log(`Task added to project queue: ${taskData.project_id}`);
    }
  } catch (error) {
    const taskIdToRemove = agentMessages.data?.task_id as string;
    const projectStore = useProjectStore.getState();
    // Remove the task from the queue on error
    if (store.currentTaskId) {
      const project = projectStore.getProjectById(store.currentTaskId);
      if (project && project.queuedMessages) {
        const messageToRemove = project.queuedMessages.find(
          (msg) =>
            msg.task_id === taskIdToRemove ||
            msg.content.includes(taskIdToRemove)
        );
        if (messageToRemove) {
          projectStore.removeQueuedMessage(
            store.currentTaskId,
            messageToRemove.task_id
          );
          console.log(`Task removed from project queue: ${taskIdToRemove}`);
        }
      }
    }
    console.error('Error adding task to project store:', error);
  }

  return true;
}

/**
 * Handles REMOVE_TASK step from SSE messages
 * Removes tasks from the project store queue
 */
export function handleRemoveTask(
  store: TaskHandlerStore,
  agentMessages: AgentMessage
): boolean {
  if (agentMessages.step !== AgentStep.REMOVE_TASK) {
    return false;
  }

  try {
    const taskIdToRemove = agentMessages.data?.task_id as string;
    if (taskIdToRemove) {
      const projectStore = useProjectStore.getState();
      const projectId = agentMessages.data?.project_id ?? store.currentTaskId;
      if (projectId) {
        const project = projectStore.getProjectById(projectId);
        if (project && project.queuedMessages) {
          const messageToRemove = project.queuedMessages.find(
            (msg) =>
              msg.task_id === taskIdToRemove ||
              msg.content.includes(taskIdToRemove)
          );
          if (messageToRemove) {
            projectStore.removeQueuedMessage(
              projectId,
              messageToRemove.task_id
            );
            console.log(`Task removed from project queue: ${taskIdToRemove}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error removing task from project store:', error);
  }

  return true;
}

/**
 * Process task-related SSE message steps
 * Returns true if the step was handled, false otherwise
 */
export function processTaskSteps(
  store: TaskHandlerStore,
  agentMessages: AgentMessage,
  autoConfirmTimers: Record<string, AutoConfirmTimer>,
  context?: {
    type?: string;
    historyId?: string;
    project_id?: string;
  },
  webviewDestroy?: (id: string) => void
): boolean {
  // Handle TO_SUB_TASKS
  if (handleToSubTasks(store, agentMessages, autoConfirmTimers, context)) {
    return true;
  }

  // Handle TASK_STATE
  if (handleTaskState(store, agentMessages, webviewDestroy)) {
    return true;
  }

  // Handle ASSIGN_TASK
  if (handleAssignTask(store, agentMessages, context)) {
    return true;
  }

  // Handle ADD_TASK
  if (handleAddTask(store, agentMessages)) {
    return true;
  }

  // Handle REMOVE_TASK
  if (handleRemoveTask(store, agentMessages)) {
    return true;
  }

  return false;
}
