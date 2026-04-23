# Eigent - Plano de Épicos e Stories (Próxima Fase)

> Baseado na análise de ideation | Planejamento detalhado ANTES da implementação

---

# VISÃO GERAL DOS PRÓXIMOS ÉPICOS

| Épico | Impacto | Estimativa | Prioridade |
|-------|---------|------------|------------|
| ÉPICO 2: Segurança & Dependências | CRITICAL | 1 semana | P0 |
| ÉPICO 3: Performance & Bundle | HIGH | 2 semanas | P1 |
| ÉPICO 4: TypeScript & Code Quality | HIGH | 2 semanas | P1 |
| ÉPICO 5: Acessibilidade (a11y) | MEDIUM | 1 semana | P2 |
| ÉPICO 6: Error Handling & UX | MEDIUM | 1 semana | P2 |

---

# ÉPICO 2: SEGURANÇA & DEPENDÊNCIAS
**Impacto:** CRÍTICO (vulnerabilidades ativas) | **Estimativa:** 1 semana | **Status:** Planejado

---

## STORY 2.1: Upgrade Electron + npm audit fix
**Pontos:** 5 | **Prioridade:** P0 (CRÍTICO)

### Análise Prévia
- **Problema:** Electron com 18+ CVEs conhecidos
- **Arquivos afetados:** `package.json`, `electron/main/index.ts`
- **Riscos:** Breaking changes no Electron API
- **Testes necessários:** smoke test completo da aplicação

### Tasks Detalhadas
```
[ ] 1. Executar npm audit para documentar estado atual
[ ] 2. Fazer backup do package.json
[ ] 3. Upgrade Electron: npm install electron@latest --save-dev
[ ] 4. Resolver conflitos de peer dependencies
[ ] 5. Testar build local (npm run build)
[ ] 6. Testar startup da aplicação
[ ] 7. Verificar APIs críticas:
     - electron/main/index.ts (IPC handlers)
     - electron/preload/*.ts (context bridge)
     - window.electron.* usages
[ ] 8. npm audit fix para outras vulnerabilidades
[ ] 9. Documentar breaking changes se houver
[ ] 10. Commit com changelog das correções
```

### Critérios de Aceitação
```
[ ] Electron version >= última stable (sem CVEs críticas)
[ ] npm audit mostra 0 vulnerabilidades HIGH
[ ] Build completa sem erros
[ ] App inicia corretamente
[ ] Todos os IPC channels funcionam
[ ] CI passa (se existir)
```

### Estimativa de Esforço
- **Pesquisa/Setup:** 2h
- **Upgrade:** 3h
- **Testes:** 4h
- **Total:** ~1 dia

---

## STORY 2.2: Fortalecer CSP (Content Security Policy)
**Pontos:** 8 | **Prioridade:** P1

### Análise Prévia
- **Problema:** CSP atual tem `'unsafe-inline'` e `'unsafe-eval'`
- **Arquivo:** `index.html` (linhas 8-50)
- **CDN allowlist:** 50+ domínios (risco de supply chain)
- **Abordagem:** FASEADA (não quebrar funcionalidades)

### Tasks Detalhadas - FASE 1 (Quick Wins)
```
[ ] 1. Documentar CSP atual completo
[ ] 2. Identificar scripts inline necessários (whitelist)
[ ] 3. Analisar uso de eval() no código
[ ] 4. Reduzir CDN allowlist para domínios ESSENCIAIS:
     - cdn.amplitude.com (analytics)
     - fonts.googleapis.com (fallback)
     - [analisar quais são realmente usados]
[ ] 5. Adicionar nonce ou hash para scripts inline permitidos
[ ] 6. Testar funcionalidades críticas
```

### Tasks Detalhadas - FASE 2 (Meta tags CSP)
```
[ ] 1. Converter inline CSP para meta tag se necessário
[ ] 2. Implementar report-uri para violações
[ ] 3. Monitorar violations por 1 semana
[ ] 4. Iterar baseado nos relatórios
```

### Critérios de Aceitação
```
[ ] CSP permite apenas domínios essenciais (<20)
[ ] Scripts inline documentados e com nonce/hash
[ ] 0 eval() usage ou documentado
[ ] report-uri configurado
[ ] Teste de XSS básico passa
```

### Estimativa de Esforço
- **Análise:** 4h
- **Fase 1:** 4h
- **Testes:** 4h
- **Total:** ~2 dias

---

## STORY 2.3: Auditoria de Input Validation
**Pontos:** 3 | **Prioridade:** P1

### Análise Prévia
- **Bom:** FastAPI usa Pydantic, OAuth valida params, rate limiting existe
- **Melhorar:** Webhook validation explícita, webhook body structure

### Tasks Detalhadas
```
[ ] 1. Revisar webhook controller - adicionar validação explícita de JSON structure
[ ] 2. Documentar expected schemas para webhooks
[ ] 3. Adicionar tests para edge cases (null, undefined, malformed JSON)
```

### Critérios de Aceitação
```
[ ] Webhook rejeita JSON mal formado
[ ] Validação retorna erro claro
[ ] Testes cobrindo edge cases
```

---

# ÉPICO 3: PERFORMANCE & BUNDLE
**Impacto:** HIGH | **Estimativa:** 2 semanas | **Status:** Planejado

---

## STORY 3.1: Lazy Loading Monaco Editor
**Pontos:** 5 | **Prioridade:** P0

### Análise Prévia
- **Problema:** Monaco (~2-3MB) carregado staticamente
- **Arquivo:** `src/components/MCPAddDialog.tsx`
- **Solução:** React.lazy() + Suspense

### Tasks Detalhadas
```
[ ] 1. Identificar TODOS os imports do Monaco
     - @monaco-editor/react
     - monaco-editor
     - @monaco-editor/loader
[ ] 2. Criar componente wrapper:
     ```typescript
     const MonacoEditorLazy = lazy(() => import('@monaco-editor/react'));
     ```
[ ] 3. Adicionar Suspense com skeleton/loading
[ ] 4. Testar em:
     - MCPAddDialog.tsx
     - Quaisquer outros arquivos usando Monaco
[ ] 5. Medir bundle antes/depois
[ ] 6. Testar performance em máquina lenta
```

### Critérios de Aceitação
```
[ ] Monaco NÃO está no initial bundle
[ ] Loading state visível durante carregamento
[ ] Funcionalidade completa preservada
[ ] Bundle size reduzido em ~2-3MB
```

### Estimativa de Esforço
- **Codificação:** 2h
- **Testes:** 2h
- **Total:** ~4h

---

## STORY 3.2: Lazy Loading Páginas Pesadas
**Pontos:** 5 | **Prioridade:** P0

### Análise Prévia
- **Problema:** Connectors e Agents carregam no initial bundle
- **Arquivos:**
  - `src/pages/Connectors/index.tsx` (128KB)
  - `src/pages/Agents/index.tsx` (148KB)
- **Solução:** Já existe React.lazy() no router, só precisa usar

### Tasks Detalhadas
```
[ ] 1. Verificar router atual (src/routers/index.tsx)
     - Já usa lazy? Se não, adicionar
[ ] 2. Garantir lazy para:
     - Connectors/index.tsx
     - Agents/index.tsx
     - Project/Workspace.tsx (se pesado)
[ ] 3. Adicionar Suspense fallback com Skeleton
[ ] 4. Testar navegação entre páginas
[ ] 5. Medir bundle size por chunk
```

### Critérios de Aceitação
```
[ ] Páginas pesadas são chunks separados
[ ] Initial bundle < 1.5MB
[ ] Navegação fluida com loading states
```

---

## STORY 3.3: Otimização de Assets (Vídeos + Imagens)
**Pontos:** 8 | **Prioridade:** P1

### Análise Prévia
- **Problema:** 27MB em vídeos servidos localmente
- **Arquivos:**
  - `add_worker.mp4` (7.4MB)
  - `dynamic_workforce.mp4` (15MB)
  - `local_model.mp4` (4.6MB)
  - `background.png` (220KB) → WebP
  - `login.gif` (621KB)
- **Solução:** CDN + compressão

### Tasks Detalhadas - FASE 1 (CDN)
```
[ ] 1. Upload vídeos para CDN (verificar provider)
     - Sugestão: Cloudflare R2, S3+CloudFront, ou similar
[ ] 2. Atualizar referências no código:
     - src/components/InstallStep/
     - src/components/onboarding/
[ ] 3. Adicionar fallback para offline
[ ] 4. Testar em ambiente local (dev)
```

### Tasks Detalhadas - FASE 2 (Compressão)
```
[ ] 1. Converter PNGs para WebP:
     - background.png (220KB → ~20KB)
     - dmg-background.png (587KB → ~50KB)
[ ] 2. Comprimir vídeos com FFmpeg:
     - 1080p → 720p
     - bitrate otimizado
     - Codec: H.264 ou VP9
[ ] 3. GIF → MP4 (se aplicável)
[ ] 4. Adicionar video preload="none"
```

### Tasks Detalhadas - FASE 3 (Cleanup)
```
[ ] 1. Remover vídeos locais do repo
[ ] 2. Update .gitignore (se vídeos ainda local)
[ ] 3. Documentar URLs de CDN no README
[ ] 4. Setup CDN invalidation strategy
```

### Critérios de Aceitação
```
[ ] 0 vídeos > 2MB no bundle
[ ] Imagens convertidas para WebP
[ ] Videos servem de CDN
[ ] Fallback offline funciona
[ ] Bundle < 5MB (sem vídeos)
```

### Estimativa de Esforço
- **Fase 1 (CDN):** 4h
- **Fase 2 (Compressão):** 4h
- **Fase 3 (Cleanup):** 2h
- **Total:** ~2 dias

---

## STORY 3.4: Vite Manual Chunks
**Pontos:** 3 | **Prioridade:** P1

### Análise Prévia
- **Problema:** Sem code splitting otimizado
- **Arquivo:** `vite.config.ts`
- **Dependências pesadas:**
  - monaco-editor (~2-3MB)
  - @xyflow/react (~500KB)
  - framer-motion (~100KB)
  - three (~150KB)
  - gsap (~50KB)

### Tasks Detalhadas
```
[ ] 1. Analisar bundle atual com rollup-plugin-visualizer
[ ] 2. Definir chunks:
     ```typescript
     manualChunks: {
       'vendor-react': ['react', 'react-dom'],
       'vendor-monaco': ['monaco-editor', '@monaco-editor/react'],
       'vendor-xyflow': ['@xyflow/react'],
       'vendor-motion': ['framer-motion'],
     }
     ```
[ ] 3. Implementar no vite.config.ts
[ ] 4. Testar build
[ ] 5. Verificar caching de chunks
```

### Critérios de Aceitação
```
[ ] Chunks identificados corretamente
[ ] Vendor chunks reutilizáveis entre builds
[ ] Build time não aumenta significativamente
```

---

# ÉPICO 4: TYPESCRIPT & CODE QUALITY
**Impacto:** HIGH | **Estimativa:** 2 semanas | **Status:** Planejado

---

## STORY 4.1: Corrigir TypeScript Errors (Phase 1 - Critical)
**Pontos:** 8 | **Prioridade:** P0

### Análise Prévia
- **Total:** 107 errors
- **Principais:**
  - `src/components/Folder/index.tsx` (5 errors)
  - `test/integration/chatStore/activeQueue.test.tsx`
  - `test/integration/chatStore/deadWorkforce.test.tsx`

### Tasks Detalhadas
```
[ ] 1. Executar tsc --noEmit > errors.txt
[ ] 2. Categorizar erros:
     - implicit any
     - null/undefined
     - type mismatches
[ ] 3. Fix Folder/index.tsx (5 errors)
[ ] 4. Fix test files (prioridade por impacto)
[ ] 5. Fix restantes em batches
[ ] 6. Configurar CI para falhar em TS errors
```

### Critérios de Aceitação
```
[ ] tsc --noEmit retorna 0 errors
[ ] CI/CD bloqueia PRs com TS errors
[ ] Nenhum implicit any tersisa
```

---

## STORY 4.2: Eliminar `any` Types
**Pontos:** 13 | **Prioridade:** P1

### Análise Prévia
- **Total:** 242 usages
- **Categorias:**
  - Catch blocks: 45
  - Props: ~100
  - State: ~50
  - Retorn types: ~47

### Tasks Detalhadas - FASE 1 (Catch Blocks)
```
[ ] 1. Listar todos os catch blocks com error: any
[ ] 2. Substituir pattern:
     DE: catch (error: any)
     PARA: catch (error: unknown)
           if (error instanceof Error) { ... }
[ ] 3. Usar utility types onde aplicável:
     - Result<T, E>
     - Optional<T>
[ ] 4. Automatizar com codemod (typescript-eslint)
```

### Tasks Detalhadas - FASE 2 (Props & State)
```
[ ] 1. Criar/expandir tipos para componentes
[ ] 2. Usar inferência de tipos do React
[ ] 3. Extrair tipos compartilhados para @/types
```

### Tasks Detalhadas - FASE 3 (Validation)
```
[ ] 1. ESLint rule: @typescript-eslint/no-explicit-any: error
[ ] 2. ESLint rule: @typescript-eslint/no-unsafe-* 
[ ] 3. Exceptions documentadas com // eslint-disable
```

### Critérios de Aceitação
```
[ ] 0 new usages de any (ESLint rule)
[ ] Catch blocks com error: unknown
[ ] Props tipadas
[ ] Coverage de tipos > 90%
```

---

## STORY 4.3: Refatorar Arquivos Grandes (Phase 1)
**Pontos:** 13 | **Prioridade:** P1

### Análise Prévia
- **22 arquivos > 500 linhas**
- **Críticos (>1000 linhas):**
  1. `electron/main/index.ts` (3637)
  2. `src/store/chatStore.ts` (3575)
  3. `src/pages/Agents/Models.tsx` (2100)
  4. `src/components/Folder/index.tsx` (1253)
  5. `src/components/ChatBox/index.tsx` (1215)

### Tasks Detalhadas - ChatStore
```
[ ] 1. Já está em progresso (Story 1.4)
[ ] 2. Garantir < 500 linhas no final
[ ] 3. Validar cobertura de testes
```

### Tasks Detalhadas - Folder Component
```
[ ] 1. Identificar sub-componentes:
     - FileTree
     - FileContextMenu
     - FilePreview
     - FolderHeader
[ ] 2. Extrair cada um para arquivo separado
[ ] 3. Manter index.tsx como facade
[ ] 4. Testar funcionalidades:
     - Drag & drop
     - Context menu
     - Preview
```

### Tasks Detalhadas - Models.tsx
```
[ ] 1. Identificar seções:
     - ModelList
     - ModelCard
     - ModelFilters
     - ModelDialog
[ ] 2. Extrair para componentes separados
[ ] 3. Mover para pasta Models/
```

### Critérios de Aceitação
```
[ ] Nenhum arquivo > 500 linhas (exceto electron/main)
[ ] Cada componente < 300 linhas
[ ] Testes passam
```

---

# ÉPICO 5: ACESSIBILIDADE (A11Y)
**Impacto:** MEDIUM | **Estimativa:** 1 semana | **Status:** Planejado

---

## STORY 5.1: ARIA Labels & Roles
**Pontos:** 5 | **Prioridade:** P0

### Análise Prévia
- **~25 instâncias de botões sem aria-label**
- **Arquivos críticos:**
  - Folder/index.tsx (3+)
  - AddWorker/ToolSelect.tsx (1)
  - Trigger/DynamicTriggerConfig.tsx (1)

### Tasks Detalhadas
```
[ ] 1. Listar TODOS os botões de ícone sem aria-label
[ ] 2. Classificar por frequência de uso
[ ] 3. Adicionar labels descritivos:
     BAD: <button>⋮</button>
     GOOD: <button aria-label="More options">⋮</button>
[ ] 4. Inputs sem label → aria-label ou aria-labelledby
[ ] 5. Testar com screen reader (NVDA/VoiceOver)
[ ] 6. Validar com axe-core ou lighthouse
```

### Critérios de Aceitação
```
[ ] 0 botões de ícone sem aria-label
[ ] 0 inputs sem accessible name
[ ] Lighthouse Accessibility > 90
```

---

## STORY 5.2: Keyboard Navigation
**Pontos:** 5 | **Prioridade:** P1

### Análise Prévia
- Sem skip-to-content
- Sem Ctrl+/- para zoom
- Sem focus trap em modais
- Sidebar com atalho mas sem indicador visual

### Tasks Detalhadas
```
[ ] 1. Adicionar skip-to-content link
[ ] 2. Implementar focus trap em Dialog/Modal
[ ] 3. Adicionar Ctrl++/- zoom alternative
[ ] 4. Indicador visual para shortcuts
[ ] 5. Escape para fechar popovers
```

### Critérios de Aceitação
```
[ ] Tab reacha conteúdo principal em 1 clique
[ ] Modais prendem focus
[ ] Todos os popovers fecham com Escape
[ ] Zoom funciona via teclado
```

---

## STORY 5.3: Empty States & Loading
**Pontos:** 3 | **Prioridade:** P2

### Tasks Detalhadas
```
[ ] 1. Identificar listas sem empty state
[ ] 2. Criar componente EmptyState reutilizável
[ ] 3. Adicionar em:
     - History sidebar
     - GroupedHistoryView
     - Agents list
     - Connectors list
[ ] 4. Loading states com aria-busy
```

---

# ÉPICO 6: ERROR HANDLING & UX
**Impacto:** MEDIUM | **Estimativa:** 1 semana | **Status:** Planejado

---

## STORY 6.1: Toast Notifications para Erros
**Pontos:** 8 | **Prioridade:** P0

### Análise Prévia
- **~20 operações sem feedback de erro**
- **Arquivos críticos:**
  - Folder/index.tsx (IPC calls sem toast)
  - ChatBox/index.tsx (API calls silenciosas)
  - AddWorker (MCP install failures)

### Tasks Detalhadas
```
[ ] 1. Verificar se já existe toast/notification system
[ ] 2. Se não, criar/use sonner ou similar
[ ] 3. Mapear todas operações críticas:
     - IPC: download, read-file, open-file
     - API: fetch config, human reply, skip task
     - MCP: install, uninstall
[ ] 4. Adicionar try/catch com toast:
     try {
       await ipcRenderer.invoke('download-file', path);
       toast.success('Download complete');
     } catch (error) {
       toast.error('Download failed: ' + error.message);
     }
[ ] 5. Error boundaries para componentes
```

### Critérios de Aceitação
```
[ ] TODAS as operações de escrita têm feedback
[ ] Erros mostram mensagem clara
[ ] Success states também mostrados
```

---

## STORY 6.2: Error Boundaries
**Pontos:** 3 | **Prioridade:** P1

### Tasks Detalhadas
```
[ ] 1. Criar ErrorBoundary component
[ ] 2. Wraps componentes críticos:
     - ChatBox
     - Folder
     - Trigger components
[ ] 3. Fallback UI com retry
[ ] 4. Log errors para monitoring
```

---

# ORDEM DE IMPLEMENTAÇÃO SUGERIDA

| Semana | Épico | Stories | Racional |
|--------|-------|---------|----------|
| 1 | ÉPICO 2 | 2.1 (Electron), 2.3 (Input) | Segurança CRÍTICA |
| 1-2 | ÉPICO 3 | 3.1 (Monaco), 3.2 (Pages) | Performance rápida |
| 2 | ÉPICO 3 | 3.3 (Assets) | Reduz bundle significativamente |
| 2-3 | ÉPICO 4 | 4.1 (TS Errors), 4.2 (any) | Code quality base |
| 3 | ÉPICO 5 | 5.1 (ARIA), 5.2 (Keyboard) | A11y crítico |
| 3-4 | ÉPICO 4 | 4.3 (Large files) | Refatoração pesada |
| 4 | ÉPICO 5-6 | 5.3, 6.1, 6.2 | Polish |

---

# PRÓXIMOS PASSOS

1. [ ] Revisar e validar este planejamento
2. [ ] Priorizar Stories dentro de cada Épico
3. [ ] Criar branch feature/improvements-v2
4. [ ] Implementar Story 2.1 primeiro (CRÍTICA)
5. [ ] Review iterativo

---

*Planejamento gerado via Haux Max Hermes*
*Data: 2026-04-23*
