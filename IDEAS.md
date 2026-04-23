# Feature Ideas - Akasha-0/eigent

*Análise gerada via Haux Max Hermes /ideation skill*
*Data: 2026-04-23*

---

## 🎯 Code Quality

| Ideia | Impacto | Esforço | Prioridade |
|-------|---------|---------|------------|
| Corrigir 107 TypeScript errors (implicit any, null types) | HIGH | MEDIUM | P0 |
| Reduzir 242 usages de `any` type para unknown + type guards | HIGH | HIGH | P1 |
| Extrair componentes de arquivos >500 linhas (22 arquivos críticos) | MEDIUM | MEDIUM | P1 |
| Consolidar imports duplicados (button: 53x, utils: 47x) | LOW | LOW | P2 |
| Habilitar regras ESLint desabilitadas (no-unused-vars, no-undef) | MEDIUM | LOW | P1 |
| Aumentar coverage de testes (atualmente 63, muito baixo) | HIGH | HIGH | P1 |
| Adicionar Prettier config consistente | LOW | LOW | P2 |

**Arquivos críticos para refatoração:**
- `electron/main/index.ts` (3637 linhas)
- `src/store/chatStore.ts` (3575 linhas)
- `src/pages/Agents/Models.tsx` (2100 linhas)

---

## 🎨 UI/UX

| Ideia | Impacto | Esforço | Prioridade |
|-------|---------|---------|------------|
| Adicionar aria-labels para botões de ícone (~25 instances) | HIGH | LOW | P0 |
| Implementar focus trap em modais/dialogs | MEDIUM | LOW | P1 |
| Adicionar skip-to-content link | MEDIUM | LOW | P2 |
| Implementar keyboard navigation alternativa (Ctrl+/- para zoom) | MEDIUM | MEDIUM | P1 |
| Adicionar estados vazios (empty states) para listas | MEDIUM | LOW | P1 |
| Melhorar contraste de cores para WCAG AA | MEDIUM | LOW | P1 |
| Implementar toast notifications para erros de API/IPC | HIGH | MEDIUM | P0 |
| Adicionar aria-live regions para updates dinâmicos | MEDIUM | LOW | P1 |
| Mobile-first responsive design para dialogs | MEDIUM | MEDIUM | P1 |

---

## 📚 Documentation

| Ideia | Impacto | Esforço | Prioridade |
|-------|---------|---------|------------|
| Adicionar CONTRIBUTING.md com guidelines de código | HIGH | LOW | P0 |
| Criar ARCHITECTURE.md explicando estrutura do projeto | HIGH | MEDIUM | P1 |
| Documentar APIs internas com exemplos | MEDIUM | MEDIUM | P1 |
| Criar CHANGELOG.md seguindo conventional commits | MEDIUM | LOW | P2 |
| Adicionar badges de status (CI, coverage, version) no README | LOW | LOW | P2 |

---

## 🔒 Security

| Ideia | Impacto | Esforço | Prioridade |
|-------|---------|---------|------------|
| **URGENTE: Upgrade Electron** (18+ CVEs conhecidas) | CRITICAL | HIGH | P0 |
| Remover `'unsafe-inline'` e `'unsafe-eval'` do CSP (faseada) | HIGH | HIGH | P1 |
| Reduzir CDN allowlist no CSP (50+ domínios) | MEDIUM | MEDIUM | P1 |
| Executar `npm audit fix --force` para tar/cookie/uuid | HIGH | LOW | P0 |
| Adicionar CSP reporting endpoint (report-uri) | MEDIUM | LOW | P2 |
| Adicionar validação explícita de estrutura JSON no webhook | MEDIUM | LOW | P2 |

**npm audit - 23 vulnerabilidades:**
- 6 High: Electron, tar, @tootallnate/once, cookie, elliptic, uuid
- 10 Moderate: cookie, uuid, elliptic, builder-util
- 7 Low

---

## ⚡ Performance

| Ideia | Impacto | Esforço | Prioridade |
|-------|---------|---------|------------|
| Mover vídeos para CDN (~27MB em assets) | HIGH | MEDIUM | P0 |
| Lazy load Monaco Editor em MCPAddDialog.tsx | HIGH | LOW | P0 |
| Lazy load páginas pesadas (Connectors, Agents) | HIGH | LOW | P0 |
| Converter imagens PNG para WebP (background.png: 220KB→20KB) | MEDIUM | LOW | P1 |
| Adicionar manualChunks no vite.config.ts | MEDIUM | MEDIUM | P1 |
| Lazy load Terminal component (@xterm) | MEDIUM | LOW | P1 |
| Remover dependências não usadas (three, postprocessing) | LOW | LOW | P2 |
| Comprimir vídeos com FFmpeg | MEDIUM | LOW | P1 |

**Bundle atual:**
- Main bundle: 1.7MB
- History chunk: 3.4MB
- Home chunk: 1.1MB
- Vídeos: 27MB

**Potencial de economia: ~25-30MB**

---

## 🏆 Quick Wins (1 dia)

1. **Adicionar aria-label a botões de ícone** (~10 min por arquivo)
2. **Lazy load MCPAddDialog Monaco** (~15 min)
3. **Corrigir catch blocks com error: any** → `error: unknown` + type guard (~30 min)
4. **Adicionar .env.example** com todas variáveis necessárias (~5 min)
5. **Converter background.png para WebP** (~5 min com script)
6. **Mover vídeos para URL externa** no código (~10 min)

---

## 📋 Próximos Steps Recomendados

1. **Story 3.1:** Fix TypeScript errors P0
2. **Story 3.2:** Lazy load Monaco Editor
3. **Story 3.3:** Upgrade Electron + audit fix
4. **Story 3.4:** Adicionar error handling com toasts
5. **Story 3.5:** Accessibility audit completo

---

*Quer que eu implemente alguma dessas ideias? Ou prefere criar um epic/stories para uma feature específica?*
