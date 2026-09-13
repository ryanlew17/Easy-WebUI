# AGENTS.md — Easy WebUI

Electron + React 18 + TypeScript local-first multi-provider LLM chat client (GitHub: `ryanlew17/Easy-WebUI`). Windows dev machine, Git Bash. Product positioning, scope and non-goals live in `docs/prd.md`.

## Context Loading Order

Always read this file first, then route by task type — read ONLY the listed docs plus the related code/tests:

| Task type | Read |
| --- | --- |
| Requirement work | `docs/requirements/index.md` → locate the REQ/Issue → that requirement file + its linked design docs + related code/tests |
| Architecture / cross-module | `docs/prd.md` + `docs/architecture.md` + related ADRs (`docs/adr/`) |
| UI / visuals | `docs/design/ui-liquid-glass.md`; floating layers also `docs/design/popover.md`; interaction rules `docs/design/ux-guidelines.md` |
| Protocol / adapter layer | `docs/design/gateway.md` + `docs/contracts/protocol-mapping.md` |
| Cross-process interface / IPC / shared types | `docs/contracts/impl-contract.md` (+ mock bridge §6) |
| Storage / data directory / backup | `docs/design/storage.md` + `docs/contracts/db-schema.md` (backup format: `docs/contracts/backup-format.md`) |
| Security (keys / logs / error exits) | `docs/design/security.md` |
| i18n (any user-visible string) | `docs/design/i18n.md` |
| Message tree / branching | `docs/design/message-tree.md` (changes need regression in `tests/db-messages.test.ts`) |
| Other module work (provider / chat / params / context-trim / title …) | `docs/design/README.md` → the specific module doc |
| Testing / verification | `docs/testing.md` |
| Release | `docs/release.md` |

Do NOT read all of `docs/` by default, and do NOT read archived versions (`docs/archive/` — historical snapshots only, never authoritative).

## Requirement Source Priority

GitHub Issue > `docs/requirements/active/*.md` > design docs. Register every new requirement first (Issue or `docs/requirements/`); never write requirement bodies into the PRD. Implemented behavior is described by design docs.

## Comment Conventions

- New/modified business code must tag comments with `@req REQ-YYYY-NNN` or `@issue #123`; test code inherits the same requirement ID.
- Do NOT reference PRD section numbers or "Part X" in comments — cite stable doc paths (e.g. `docs/design/chat.md`) or requirement IDs instead.
- Existing cross-references in code point to current design/contracts docs (doc-level, no section numbers); new code must not add PRD-section style references.

## Hard Constraints

1. API keys are **never written to disk in plaintext and never enter the renderer**; backups exclude keys by default, key-including backups must be password-encrypted, and safeStorage machine ciphertext is never exported → `docs/design/security.md`
2. All provider requests go through the main-process gateway; every IPC payload is zod-validated and every error is redact()ed → `docs/design/gateway.md`, `docs/contracts/impl-contract.md` §4
3. Protocol differences (top_k, system field placement, penalty semantics, reasoning-off payload) are absorbed inside the adapter layer; the UI only hints → `docs/contracts/protocol-mapping.md`
4. Light UI preferences use the Cookie (`easyui_prefs`, incl. anti-FOUC appearance keys); business data uses SQLite — never mix → `docs/design/ui-liquid-glass.md` §5
5. All sizes are rem-based; in-app zoom 50%–250% and browser zoom 67%–200% must not break the layout; at most 5 glass blur layers on screen → `docs/design/ui-liquid-glass.md`
6. Every user-visible string goes through i18n (added to BOTH language packs); no hardcoded copy → `docs/design/i18n.md`
7. Do not implement PRD non-goals (multi-user / RAG / plugins / image & voice / mobile) → `docs/prd.md` §2
8. **Messages are a tree**: branch operations and deletions must not break reachability of other branches; after deletion the active path must resolve to a surviving branch → `docs/design/message-tree.md`
9. **Every floating layer portals to `document.body`** (backdrop-root rule); focus outlines are inset and must not grow the occupied area → `docs/design/popover.md`, `docs/design/ux-guidelines.md` §1
10. Main-process behavior fixes get a matching mock-bridge fix; release process in `docs/release.md` (release notes in pure English) → `docs/contracts/impl-contract.md` §6

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

No lint script. E2E scripts use puppeteer-core + system Edge headless (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, hardcoded path) + an in-process static server over `dist/` — always `npm run build` before running them.

## Architecture Boundaries (strict)

- **Three layers**: `electron/` (main process, tsc → `dist-electron/`), `src/` (renderer), `shared/` (cross-process types/logic — the ONLY shared location). `shared/types.ts` (`EasyUiApi`) is the single source of truth for the IPC contract; see `docs/contracts/impl-contract.md`.
- **Renderer must never import `electron/` or any node module.** `vite.config.ts` `base: './'` is required for Electron `file://` loading — don't change.
- **API keys never reach the renderer** — `Provider` carries only `has_key`; all outbound LLM requests go through the main-process `electron/gateway/`. Every IPC payload is zod-validated (`electron/ipc.ts`); all error/log paths go through `crypto/redact` masking.
- **Bridge duality**: `src/bridge/index.ts` returns `window.easyui` (Electron) or `mockApi` (web preview). Bug fixes in main-process logic usually need a **matching fix in `src/bridge/mock.ts`** (e.g. branch-deletion path restoration lives in both `electron/db/messages.ts` and `mock.ts`).
- Messages are a **tree** (`parent_id` + `active_leaf_id`); path resolution walks leaf→root. Changes here need regression tests (`tests/db-messages.test.ts`).

## UI / Design Rules (v1.0.1 glass system)

- Design tokens live in `src/styles/tokens.css` (`.glass`, `.glass-bar`, `.drawer`, `.glass-pop` — directional edges + specular highlights). Layout language: rounded cards/drawers, **no full-width hairline dividers**.
- **backdrop-filter gotcha**: an ancestor with `backdrop-filter` forms a backdrop root — descendant blur samples only ancestor content and visually fails. All floating layers (dropdowns, popovers, tooltips, Generate pill) MUST portal to `document.body` via `src/components/Popover.tsx` (`AnchoredPopover`), never stay DOM-descendants of `.glass-bar`.
- **Flex `min-width:auto` defeats `max-width`** — keep the `min-w-0` chain on flex ancestors of content, or long code/tables cause horizontal scrollbars. Bubbles: user `min-width: 7.5rem`, assistant `12rem`, max 85% of the `max-w-7xl` content column.
- Focus: global `:focus-visible` inset outline (2px, offset −1px) — outlines must not grow the occupied area; no blue input borders.
- Icons: `src/components/icons.tsx`, Lucide-style 16×16 viewBox with ink optically centered (~12×12). Audit centering via `getBBox()` + `getScreenCTM()` if an icon looks off.
- **i18n: every user-facing string goes through i18next, added to BOTH `src/i18n/zh-CN.json` and `en-US.json`** (labels sometimes already include emoji — check before duplicating).
- Comments: concise, Chinese is fine.

## Docs Pointers

- `docs/prd.md` — product positioning/users/non-goals (authoritative for scope conflicts).
- `docs/architecture.md` — tech stack, process architecture, directory layout, build.
- `docs/design/` — per-module behavior snapshots (start from `docs/design/README.md`).
- `docs/contracts/` — executable details: IPC/types, protocol mapping, db schema, backup format.
- `docs/requirements/` — incremental requirements; `docs/adr/` — decision records.
- `docs/release.md` — release process. `latest.yml` MUST be uploaded (electron-updater). `gh` CLI is not installed — use GitHub REST API with a token from `git credential fill` (capture to a variable, never print/echo it).

## Deliberate Quirks — do not "clean up"

- `build.npmRebuild: false` and `build.electronDist: node_modules/electron/dist` are measured workarounds (pre-rebuilt better-sqlite3 ABI; Windows EPERM on rename-after-unzip). See README "Packaging".
- Windows build PATH needs PowerShell; winCodeSign cache may need manual 7z extraction (README has details).
