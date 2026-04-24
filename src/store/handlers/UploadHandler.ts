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
 * Upload Handler
 * 
 * Handler para coleta e upload de arquivos gerados durante tarefas.
 */

import { uploadFile } from '@/api/http';

// ============================================================================
// TYPES
// ============================================================================

export type UploadFileSource = 'project_output' | 'camel_log' | 'user_attachment';

export interface GeneratedUploadFile {
  path?: string;
  name?: string;
  isFolder?: boolean;
  relativePath?: string;
  source?: Exclude<UploadFileSource, 'user_attachment'>;
}

export interface UploadCandidate {
  path: string;
  name: string;
  uploadName: string;
  source: UploadFileSource;
}

export interface UploadOutcome {
  success: boolean;
  fileName: string;
  source: UploadFileSource;
  error?: unknown;
}

// ============================================================================
// HELPERS
// ============================================================================

export function getFileNameFromPath(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || 'file';
}

export function isReadableLocalPath(filePath?: string): filePath is string {
  if (!filePath) return false;
  return !/^(https?:|file:|blob:|data:)/i.test(filePath);
}

function buildUploadName(
  fileName: string,
  source: UploadFileSource,
  taskId: string,
  attachmentIndex: number,
  relativePath?: string
): string {
  if (source === 'camel_log') {
    if (relativePath) {
      return `camel_log/${relativePath}/${fileName}`;
    }
    return `camel_log/${fileName}`;
  }

  if (source === 'user_attachment') {
    return `user_attachment/${fileName}`;
  }

  return `project_output/${fileName}`;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Coleta arquivos que precisam ser fazer upload.
 */
export function collectTaskUploadFiles(
  generatedFiles: GeneratedUploadFile[],
  messages: Array<{ attaches?: File[] }>,
  pendingAttaches: File[] = [],
  taskId = 'unknown_task'
): UploadCandidate[] {
  const uploadCandidates: Array<
    Omit<UploadCandidate, 'uploadName'> & { relativePath?: string }
  > = [];

  // Process generated files
  for (const file of generatedFiles) {
    if (!file?.path || !file?.name || file.isFolder) continue;
    uploadCandidates.push({
      path: file.path,
      name: file.name,
      relativePath: file.relativePath,
      source: file.source === 'camel_log' ? 'camel_log' : 'project_output',
    });
  }

  // Process attachment files from messages
  const attachmentFiles = [
    ...messages.flatMap((message) => message.attaches || []),
    ...pendingAttaches,
  ];

  for (const attachment of attachmentFiles) {
    if (!isReadableLocalPath(attachment?.filePath)) continue;
    uploadCandidates.push({
      path: attachment.filePath,
      name:
        attachment.fileName?.trim() || getFileNameFromPath(attachment.filePath),
      source: 'user_attachment',
    });
  }

  // Deduplicate and build upload names
  const uniqueCandidates = new Map<string, UploadCandidate>();
  let attachmentIndex = 1;
  for (const file of uploadCandidates) {
    if (!uniqueCandidates.has(file.path)) {
      const { relativePath, ...rest } = file;
      uniqueCandidates.set(file.path, {
        ...rest,
        uploadName: buildUploadName(
          file.name,
          file.source,
          taskId,
          file.source === 'user_attachment' ? attachmentIndex++ : 0,
          relativePath
        ),
      });
    }
  }

  return Array.from(uniqueCandidates.values());
}

/**
 * Faz upload dos arquivos para o servidor.
 */
export async function uploadTaskFiles(
  files: UploadCandidate[],
  uploadTargetId: string
): Promise<UploadOutcome[]> {
  const results: UploadOutcome[] = [];

  for (const file of files) {
    try {
      const result = await window.ipcRenderer.invoke('read-file', file.path);
      if (!result.success || !result.data) {
        results.push({
          success: false,
          fileName: file.name,
          source: file.source,
          error: result.error || 'Failed to read file',
        });
        continue;
      }

      const formData = new FormData();
      const blob = new Blob([result.data], {
        type: 'application/octet-stream',
      });
      formData.append('file', blob, file.uploadName);
      formData.append('task_id', uploadTargetId);

      await uploadFile('/api/v1/chat/files/upload', formData);
      console.log('File uploaded successfully:', file.uploadName, file.source);
      results.push({
        success: true,
        fileName: file.uploadName,
        source: file.source,
      });
    } catch (error) {
      console.error('File upload failed:', file.uploadName, file.source, error);
      results.push({
        success: false,
        fileName: file.uploadName,
        source: file.source,
        error,
      });
    }
  }

  return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const UploadHandler = {
  collectTaskUploadFiles,
  uploadTaskFiles,
  getFileNameFromPath,
  isReadableLocalPath,
};
