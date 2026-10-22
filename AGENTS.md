# AGENTS.md — Easy WebUI

Electron + React 18 + TypeScript local-first multi-provider LLM chat client (GitHub: `ryanlew17/Easy-WebUI`). Windows dev machine, Git Bash. Product positioning, scope and non-goals: `docs/prd.md`.

## Context Loading Order

Read this file first, then route by task type — read ONLY the listed docs plus the related code/tests:

| Task type | Read |
| --- | --- |
| Requirement work | `docs/requirements/index.md` → locate the REQ/Issue → that requirement file + its linked design docs + related code/tests |
| Architecture / cross-module / build | `docs/prd.md` + `docs/architecture.md` + related ADRs (`docs/adr/`) |
| UI / visuals | `docs/design/ui-liquid-glass.md`; floating layers also `docs/design/popover.md`; interaction rules `docs/design/ux-guidelines.md` |
| Protocol / adapter layer | `docs/design/gateway.md` + `docs/contracts/protocol-mapping.md` |
| Cross-process interface / IPC / shared types | `docs/contracts/impl-contract.md` (+ mock bridge §6) |
| Storage / data directory / backup | `docs/design/storage.md` + `docs/contracts/db-schema.md` (backup format: `docs/contracts/backup-format.md`) |
| Security (keys / logs / CSP / navigation gates) | `docs/design/security.md` |
| i18n (any user-visible string) | `docs/design/i18n.md` |
| Message tree / branching | `docs/design/message-tree.md` (changes need regression in `tests/db-messages.test.ts`) |
| Other module work (provider / chat / params / context-trim / title …) | `docs/design/README.md` → the specific module doc |
| Testing / verification | `docs/testing.md` |
| Release | `docs/release.md` |

Never bulk-read `docs/`; never trust `docs/archive/` (historical snapshots, not authoritative).

## Requirement Source Priority

GitHub Issue > `docs/requirements/active/*.md` > design docs. Register every new requirement first (Issue or `docs/requirements/`); requirement bodies never go into the PRD. Design docs describe implemented behavior.

## Comment Conventions

- New/modified business code tags comments with `@req REQ-YYYY-NNN` or `@issue #123`; test code inherits the same requirement ID.
- Cite stable doc paths or requirement IDs — never PRD section numbers / "Part X".

## Hard Constraints

1. API keys are **never written to disk in plaintext and never enter the renderer**; backups exclude keys by default, key-including backups must be password-encrypted, safeStorage machine ciphertext is never exported → `docs/design/security.md`
2. All provider requests go through the main-process gateway; every IPC payload is zod-validated and every error is redact()ed → `docs/design/gateway.md`, `docs/contracts/impl-contract.md` §4
3. Protocol differences (top_k, system field placement, penalty semantics, reasoning-off payload) are absorbed inside the adapter layer; the UI only hints → `docs/contracts/protocol-mapping.md`
4. Light UI preferences use the Cookie (`easyui_prefs`, incl. anti-FOUC appearance keys); business data uses SQLite — never mix → `docs/design/ui-liquid-glass.md` §5
5. All sizes are rem-based; in-app zoom 50%–250% and browser zoom 67%–200% must not break the layout; at most 5 glass blur layers on screen → `docs/design/ui-liquid-glass.md`
6. Every user-visible string goes through i18n (added to BOTH language packs); no hardcoded copy → `docs/design/i18n.md`
7. Do not implement PRD non-goals (multi-user / RAG / plugins / image & voice / mobile) → `docs/prd.md` §2
8. **Messages are a tree**: branch operations and deletions must not break reachability of other branches; after deletion the active path must resolve to a surviving branch → `docs/design/message-tree.md`
9. **Every floating layer portals to `document.body`** (backdrop-root rule); focus outlines are inset and must not grow the occupied area → `docs/design/popover.md`, `docs/design/ux-guidelines.md` §1
10. Main-process behavior fixes get a matching mock-bridge fix (`src/bridge/mock.ts`); release notes in pure English → `docs/contracts/impl-contract.md` §6, `docs/release.md`

## ⚠️ Security Debt — read before any release

Open items from the 2026-10-22 security audit (REQ-2026-001). Do NOT remove until resolved:

1. **Electron embeds a Node.js vulnerable to CVE-2026-111497 (Brotli decoder RCE)**. As of 2026-10-22 no Electron release ships Node ≥ 24.22.1 (44.9.3 / 45.0.0 both carry Node 24.22.0). Mitigation already in code: the gateway uses Electron `net.fetch` (Chromium stack), so provider-response Brotli never touches the embedded Node. **Action: track Electron 44.x/45.x patch releases; as soon as one embeds Node ≥ 24.22.1, upgrade and repackage.** Verify with `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe -p "process.version"`.
2. **`release/` 1.0.1 installers embed Electron 44.0.0 (Node 24.18.1 — vulnerable)** and predate all REQ-2026-001 fixes. Never ship them; repackage from current code before any release.
3. **`npm audit` has 17 remaining findings, all dev-only chains** requiring breaking upgrades (tailwindcss@4 for braces/postcss-selector-parser, vitest@5 for @vitest/mocker, electron-builder chain for sprintf-js/roarr). Evaluate separately; none ship in the packaged app.

## Commands

```bash
npm run dev            # pure web preview (Vite :5173, localStorage mock bridge — fully demoable)
npm run dev:electron   # desktop dev (run `npm run build` once first so dist-electron/ exists)
npm run typecheck      # tsconfig.web + tsconfig.electron — both must pass
npm test               # vitest (tests/ — gateway, trim, crypto, backup, db, window-state…)
npm run build          # web typecheck → vite build → dist/ + tsc → dist-electron/ + esbuild preload
npx electron-builder --win portable nsis --publish never   # package → release/
node scripts/probe-verify-portal.mjs   # headless DOM/style assertions (serves dist/ — build first)
node scripts/e2e-ui-polish.mjs         # walkthrough screenshots
npm run shot           # regenerate the 8 README screenshots → docs/screenshots/
```

No lint script. E2E scripts use puppeteer-core + system Edge headless (hardcoded path) + an in-process static server over `dist/` — always `npm run build` before running them. Build/packaging internals: `docs/architecture.md` §4.

## Architecture Boundaries (strict)

- **Three layers**: `electron/` (main process), `src/` (renderer), `shared/` (the ONLY cross-process location; `shared/types.ts` `EasyUiApi` is the single source of truth for the IPC contract). Full process architecture and directory layout: `docs/architecture.md`.
- **Renderer must never import `electron/` or any node module.** `vite.config.ts` `base: './'` is required for Electron `file://` loading — don't change.
- **Bridge duality**: `src/bridge/index.ts` returns `window.easyui` (Electron) or `mockApi` (web preview) — see hard constraint 10.

## UI Reminders (details in the design docs per the routing table)

- **Flex `min-width:auto` defeats `max-width`** — keep the `min-w-0` chain on flex ancestors of content, or long code/tables cause horizontal scrollbars.
- Icons: `src/components/icons.tsx`, Lucide-style 16×16 with ink optically centered; audit centering via `getBBox()` + `getScreenCTM()`.
- Comments: concise, Chinese is fine.

## Deliberate Quirks — do not "clean up"

- `build.npmRebuild: false` and `build.electronDist: node_modules/electron/dist` are measured workarounds (pre-rebuilt better-sqlite3 ABI; Windows EPERM on rename-after-unzip) → `docs/architecture.md` §4.
- Windows build PATH needs PowerShell; winCodeSign cache may need manual 7z extraction → `docs/architecture.md` §4.
