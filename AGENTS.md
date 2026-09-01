# AGENTS.md — Easy WebUI

Electron + React 18 + TypeScript local-first multi-provider LLM chat client (GitHub: `ryanlew17/Easy-WebUI`). Windows dev machine, Git Bash.

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

## Architecture boundaries (strict)

- **Three layers**: `electron/` (main process, tsc → `dist-electron/`), `src/` (renderer), `shared/` (cross-process types/logic — the ONLY shared location). `shared/types.ts` (`EasyUiApi`) is the single source of truth for the IPC contract; see `docs/impl-contract.md`.
- **Renderer must never import `electron/` or any node module.** `vite.config.ts` `base: './'` is required for Electron `file://` loading — don't change.
- **API keys never reach the renderer** — `Provider` carries only `has_key`; all outbound LLM requests go through the main-process `electron/gateway/`. Every IPC payload is zod-validated (`electron/ipc.ts`); all error/log paths go through `crypto/redact` masking.
- **Bridge duality**: `src/bridge/index.ts` returns `window.easyui` (Electron) or `mockApi` (web preview). Bug fixes in main-process logic usually need a **matching fix in `src/bridge/mock.ts`** (e.g. branch-deletion path restoration lives in both `electron/db/messages.ts` and `mock.ts`).
- Messages are a **tree** (`parent_id` + `active_leaf_id`); path resolution walks leaf→root. Changes here need regression tests (`tests/db-messages.test.ts`).

## UI / design rules (v1.0.1 glass system)

- Design tokens live in `src/styles/tokens.css` (`.glass`, `.glass-bar`, `.drawer`, `.glass-pop` — directional edges + specular highlights). Layout language: rounded cards/drawers, **no full-width hairline dividers**.
- **backdrop-filter gotcha**: an ancestor with `backdrop-filter` forms a backdrop root — descendant blur samples only ancestor content and visually fails. All floating layers (dropdowns, popovers, tooltips, Generate pill) MUST portal to `document.body` via `src/components/Popover.tsx` (`AnchoredPopover`), never stay DOM-descendants of `.glass-bar`.
- **Flex `min-width:auto` defeats `max-width`** — keep the `min-w-0` chain on flex ancestors of content, or long code/tables cause horizontal scrollbars. Bubbles: user `min-width: 7.5rem`, assistant `12rem`, max 85% of the `max-w-7xl` content column.
- Focus: global `:focus-visible` inset outline (2px, offset −1px) — outlines must not grow the occupied area; no blue input borders.
- Icons: `src/components/icons.tsx`, Lucide-style 16×16 viewBox with ink optically centered (~12×12). Audit centering via `getBBox()` + `getScreenCTM()` if an icon looks off.
- **i18n: every user-facing string goes through i18next, added to BOTH `src/i18n/zh-CN.json` and `en-US.json`** (labels sometimes already include emoji — check before duplicating).
- Comments: concise, Chinese is fine.

## Docs to read before touching sensitive areas

- `docs/prd.md` — PRD (product requirements & design, authoritative; wins over impl-contract.md on conflict). Supersedes the old `kimi.md`; code comments referencing `prd.md §x` map to it.
- `docs/impl-contract.md` — cross-process IPC contract (§2 preload whitelist, params/preset semantics).
- `docs/release.md` — release process. Release notes **pure English from v1.0.1 on** (version description, not install instructions). `latest.yml` MUST be uploaded (electron-updater). `gh` CLI is not installed — use GitHub REST API with a token from `git credential fill` (capture to a variable, never print/echo it).

## Deliberate quirks — do not "clean up"

- `build.npmRebuild: false` and `build.electronDist: node_modules/electron/dist` are measured workarounds (pre-rebuilt better-sqlite3 ABI; Windows EPERM on rename-after-unzip). See README "Packaging".
- Windows build PATH needs PowerShell; winCodeSign cache may need manual 7z extraction (README has details).
