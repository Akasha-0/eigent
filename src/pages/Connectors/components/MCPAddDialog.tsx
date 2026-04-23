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

import {
  Dialog,
  DialogContent,
  DialogContentSection,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';
import React, { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setupMonacoEnvironment } from '@/lib/monaco-setup';

// Lazy load Monaco Editor - only loaded when dialog opens
const MonacoEditor = lazy(() =>
  setupMonacoEnvironment().then(() => import('@monaco-editor/react'))
);

interface MCPAddDialogProps {
  open: boolean;
  addType: 'local' | 'remote';
  setAddType: (type: 'local' | 'remote') => void;
  localJson: string;
  setLocalJson: (v: string) => void;
  remoteName: string;
  setRemoteName: (v: string) => void;
  remoteUrl: string;
  setRemoteUrl: (v: string) => void;
  installing: boolean;
  onClose: () => void;
  onInstall: () => void;
}

// Monaco Editor fallback while loading
function MonacoEditorSkeleton() {
  return (
    <div className="flex items-center justify-center h-[300px] bg-[#1e1e1e]">
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-[#007acc] border-t-transparent rounded-full animate-spin" />
        <span className="text-[#cccccc] text-sm">Loading editor...</span>
      </div>
    </div>
  );
}

export default function MCPAddDialog({
  open,
  localJson,
  setLocalJson,
  installing,
  onClose,
  onInstall,
}: MCPAddDialogProps) {
  const [jsonError, setJsonError] = useState<string | null>(null);
  const { t } = useTranslation();

  // when the dialog is opened, automatically format the JSON
  React.useEffect(() => {
    if (open && localJson) {
      try {
        const obj = JSON.parse(localJson);
        setLocalJson(JSON.stringify(obj, null, 4));
        setJsonError(null);
      } catch (e: unknown) {
        // do not format invalid JSON, keep the original content
        const errorMessage = e instanceof Error ? e.message : String(e);
        setJsonError('JSON format error: ' + errorMessage);
      }
    } else if (open) {
      setJsonError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // when localJson changes, clear the error prompt
  React.useEffect(() => {
    setJsonError(null);
  }, [localJson]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        size="lg"
        showCloseButton
        onClose={onClose}
        className="p-0"
      >
        <DialogHeader title={t('setting.add-your-agent')} />
        <DialogContentSection>
          <div className="mb-4 text-body-sm text-text-label">
            {t(
              'setting.add-a-local-mcp-server-by-providing-a-valid-json-configuration'
            )}
            <a
              href="https://modelcontextprotocol.io/docs/getting-started/intro"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-information underline"
            >
              {t('setting.learn-more')}
            </a>
          </div>
          {jsonError && (
            <div className="mb-2 text-label-md text-text-cuation">
              {jsonError}
            </div>
          )}
          <div className="rounded-xl border-border-primary overflow-hidden border">
            <Suspense fallback={<MonacoEditorSkeleton />}>
              <MonacoEditor
                height="300px"
                width="100%"
                language="json"
                theme="vs-dark"
                value={localJson}
                onChange={(v) => {
                  setLocalJson(v ?? '');
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  scrollBeyondLastLine: false,
                  readOnly: installing,
                  automaticLayout: true,
                }}
              />
            </Suspense>
          </div>
        </DialogContentSection>
        <DialogFooter
          showConfirmButton
          confirmButtonText={
            installing ? t('setting.installing') : t('setting.install')
          }
          onConfirm={onInstall}
          confirmButtonVariant="primary"
        />
      </DialogContent>
    </Dialog>
  );
}
