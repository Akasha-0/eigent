// Monaco Environment Setup
// Configuração carregada dinamicamente para evitar impacto no bundle inicial

import loader from '@monaco-editor/loader';
import * as monaco from 'monaco-editor';

let configured = false;

export async function setupMonacoEnvironment(): Promise<void> {
  if (configured) return;

  if (typeof globalThis !== 'undefined') {
    (globalThis as unknown as { MonacoEnvironment: { getWorker: (moduleId: string, label: string) => Worker } }).MonacoEnvironment = {
      getWorker(_: string, label: string) {
        if (['json', 'css', 'html', 'typescript', 'javascript'].includes(label)) {
          return new Worker(
            URL.createObjectURL(
              new Blob(
                [
                  `
					self.onmessage = function () {};
				`,
                ],
                { type: 'application/javascript' }
              )
            )
          );
        }
        // Return a dummy worker for other languages
        return new Worker(
          URL.createObjectURL(
            new Blob([`self.onmessage = function () {}`], { type: 'application/javascript' })
          )
        );
      },
    };
  }

  loader.config({ monaco });
  configured = true;
}

// Export monaco for type usage
export { monaco };
export type Monaco = typeof monaco;
