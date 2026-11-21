# AGENTS.md — Easy WebUI

Electron + React 19 + TypeScript local-first multi-provider LLM chat client. Windows + Git Bash. Product scope: `docs/prd.md`.

## Context

Route by task type below — do NOT read all of `docs/` by default. Full doc map for humans: `docs/README.md`.

| Task type | Read |
| --- | --- |
| Requirement work | `docs/requirements/index.md` → locate the REQ/Issue → that file + its linked design docs + related code/tests |
| Architecture / build / dirs / deps | `docs/architecture.md` (+ related ADRs in `docs/adr/`) |
| Chat page / generation / streaming / stats | `docs/design/chat.md` |
| Message tree / branching / deletion | `docs/design/message-tree.md` |
| Params & presets | `docs/design/params.md` |
| Keys / redaction / CSP / privacy | `docs/design/security.md`（接触密钥的改动必读） |
| Protocol adapters / SSE / URL mapping | `docs/contracts/protocol-mapping.md` |
| Data dir / migration / backup UX | `docs/design/storage.md` + `docs/contracts/backup-format.md` |
| Providers / model checks | `docs/design/provider.md` |
| Visual tokens / themes / zoom / motion | `docs/design/ui-liquid-glass.md` |
| Floating layers / focus / a11y / shortcuts | `docs/design/popover.md` + `docs/design/ux-guidelines.md` |
| IPC / shared types / mock bridge | `docs/contracts/impl-contract.md` + `shared/types.ts` |
| Title generation / context trim / gateway limits / i18n | `docs/design/{title,context-trim,gateway,i18n}.md` |
| Testing / packaging / release | `docs/release.md`；版本历史 `docs/changelog.md`；候选方向 `docs/roadmap.md` |

- Requirement authority: GitHub Issue > `docs/requirements/active/` > current design docs. Register requirements before implementation.
- `docs/requirements/archive/` contains completed requirements, not current behavior. Older snapshots live in Git history.

## Hard constraints

1. API keys never persist in plaintext or enter the renderer. Backups exclude keys by default; key-including backups require password encryption; machine ciphertext is never exported.
2. Provider requests go through the main-process gateway. Validate every IPC payload with zod and redact every error.
3. Absorb protocol differences in adapters; the UI only provides hints.
4. UI preferences use the `easyui_prefs` cookie; business data uses SQLite.
5. Use rem sizing. In-app zoom 50%–250% and browser zoom 67%–200% must not break layout; at most 5 glass blur layers.
6. Add every user-visible string to both i18n language packs.
7. Do not implement PRD non-goals: multi-user, RAG, plugins, image/voice, or mobile.
8. Messages are a tree. Branch operations and deletion must preserve other branches and resolve the active path to a survivor.
9. Every floating layer portals to `document.body`; focus outlines are inset and must not grow occupied area.
10. Match main-process behavior fixes in `src/bridge/mock.ts`; release notes are pure English.

Details and current behavior live in the linked documents from `docs/README.md`. Do not duplicate them here.

## Project conventions

- Three layers: `electron/` (main), `src/` (renderer), `shared/` (only cross-process location). `shared/types.ts` defines the IPC contract.
- Renderer never imports `electron/` or Node modules. Keep Vite `base: './'` for Electron `file://` loading.
- New/modified business code and tests tag comments with `@req REQ-YYYY-NNN` or `@issue #123` where applicable; cite stable paths, not PRD section numbers.
- Keep the `min-w-0` chain on flex ancestors. Icons use `src/components/icons.tsx`; concise Chinese comments are acceptable.
- `build.npmRebuild: false` and `build.electronDist` are measured workarounds—see `docs/architecture.md`; do not clean them up.

## Commands

```bash
npm run dev            # browser preview with mock bridge
npm run dev:electron   # desktop dev; run npm run build once first
npm run typecheck      # Web + Electron configs
npm test               # Vitest
npm run build          # dist/ + dist-electron/ + preload
npm run perf           # build + isolated main/renderer performance baselines
npm run perf:electron  # build + 3 cold starts in temporary app/userData dirs
npx electron-builder --win portable nsis --publish never
node scripts/probe-verify-portal.mjs
node scripts/e2e-ui-polish.mjs
npm run shot
```

E2E requires a prior build. Verification and release gates: `docs/release.md`.
