# Easy WebUI

**English** | [简体中文](./README.zh-CN.md)

A lightweight, **local-first** multi-provider LLM chat client for the desktop (PC), built with **Electron + React 18 + TypeScript**. All data lives on your machine; API keys are encrypted at rest and never touch the renderer process.

Design doc: [docs/kimi.md](./docs/kimi.md) · Cross-process contract: [docs/impl-contract.md](./docs/impl-contract.md)

> No Electron handy? `npm run dev` gives you a **pure-browser preview** powered by a localStorage mock bridge — the full UI flow works without any native modules.

## Features

- **12 preset providers** out of the box (as quick-fill templates, nothing is pre-written to the DB): OpenAI, Anthropic, OpenRouter, DeepSeek, Kimi (Moonshot AI), 智谱 (Bigmodel), 小米 (Xiaomi MiMo), MiniMax, 硅基流动 (SiliconFlow), 魔搭 (ModelScope), 火山引擎 (Ark), 阿里云百炼 (Alibaba Cloud Bailian) — plus fully custom base URL / API format (`openai-chat` / `openai-responses` / `anthropic`, with auto-detection).
- **Streaming chat with reasoning display** — SSE streaming with a typing indicator, incremental Markdown rendering (GFM tables, code highlighting), and collapsible reasoning blocks for models like DeepSeek that emit `reasoning_content`. Stop/regenerate supported.
- **LM Studio-style parameter preset system** — user presets on top of a global preset, per-conversation overrides with highlighted labels and one-click reset-to-preset; system prompt, temperature, optional response-length limit, context overflow strategy (rolling window / truncate middle / stop at limit), stop strings, top_k / repeat / presence / top_p / min_p sampling toggles, and JSON-Schema structured output. The global preset is edited (and resettable to factory defaults) on the Settings page.
- **Liquid-glass dual-theme UI** — light/dark/system themes, glassmorphism with a strict on-screen blur budget, full `prefers-reduced-motion` / `prefers-reduced-transparency` fallbacks.
- **Appearance customization** — UI zoom (50%–250% in 10% steps, via a delta-based slider that cannot run away while dragging, plus stepper buttons) with guarded viewport compensation (modals/popovers stay put, Ctrl+wheel / pinch zoom intercepted), custom interface and code fonts (strict font-stack whitelist with rejection toast), independent interface (10–24px) and code-block (6–40px) font sizes with one-click reset, and an independent code-block background (follow / light / dark) that overrides the syntax theme. Everything applies instantly and is restored before first paint (no FOUC).
- **Encrypted key storage** — keys are encrypted via Electron `safeStorage` (DPAPI / Keychain / libsecret); a machine-fingerprint scrypt + AES-256-GCM fallback covers systems without a keyring. The renderer only ever sees a `has_key` boolean.
- **Encrypted backup & restore** — one-click zip backups; key-including backups are protected by an independent password (scrypt + AES-256-GCM). Merge or overwrite restore.
- **Self-managed data location** — the portable build keeps data in a `data/` workspace next to the exe; the installed build defaults to the per-user directory (reinstalling or overwrite-installing never wipes it, and uninstall leaves it alone). A custom location can be picked with automatic migration of all data (backups included), effective after restart; legacy data from older versions (install dir, %Temp% extraction dirs) is rescued automatically on first launch; the storage layout carries a version marker so future upgrades can migrate structure.
- **About page & online updates** — Settings → About ships an info card (version / license / author / GitHub) and a live update card: checks against the GitHub Releases channel (electron-updater; the Beta toggle maps to GitHub pre-releases), auto-downloads new versions with automatic sha512 verification from latest.yml, then shows a fixed-height scrollable release summary with a data-backup warning, and installs silently with a restart on confirm. Startup self-checks when "auto check" is on and announces new versions via toast. The update card renders disabled in the web preview (desktop-only).
- **Bilingual UI** — 简体中文 / English, with system-locale detection.
- **Model management** — fetch remote model lists, per-model connectivity checks (latency + status), batch "test all".

## Screenshots

| Chat (light, 中文) | Chat (dark, 中文) |
| --- | --- |
| ![Chat light](docs/screenshots/05-chat-light-zh.png) | ![Chat dark](docs/screenshots/07-chat-dark-zh.png) |

| Model picker (liquid-glass blur) | Add provider (12 presets) |
| --- | --- |
| ![Model picker](docs/screenshots/04-model-picker-blur-zh.png) | ![Add provider](docs/screenshots/03-provider-modal-light-zh.png) |

More in [docs/screenshots/](./docs/screenshots/) — welcome page, settings, the streaming "thinking…" state, and the multi-line composer with the liquid-glass "Generate Response" pill floating above it, 8 shots in total.

## Tech Stack

- **Desktop shell**: Electron 44 (main process in TypeScript, compiled to `dist-electron/`)
- **Renderer**: Vite + React 18 + TypeScript (strict) + Tailwind CSS 3
- **State / i18n**: zustand, i18next + react-i18next
- **Markdown**: react-markdown + remark-gfm + highlight.js + DOMPurify
- **Main-process storage**: better-sqlite3 (WAL, foreign keys, schema migrations)
- **Validation**: zod on every IPC payload; vitest for unit tests

## Getting Started

Requires **Node.js ≥ 18**.

```bash
npm install          # if better-sqlite3/electron downloads fail on your network,
                     # `npm install --ignore-scripts` still works for the web preview
npm run dev          # pure web preview (Vite, port 5173, localStorage mock bridge — fully demoable)
npm test             # vitest: gateway protocols / trim / crypto / backup round-trips
npm run typecheck    # tsconfig.web + tsconfig.electron, both must pass
npm run build        # web typecheck + vite build → dist/ + tsc → dist-electron/ + esbuild preload bundle
npm run dev:electron # desktop dev (run `npm run build` first so dist-electron/ exists)
```

### Packaging (Windows, tested)

```bash
npx electron-builder --win portable nsis --publish never
# artifacts: release/EasyWebUI_0.1.0_Portable.exe  (portable)
#            release/EasyWebUI_0.1.0_Setup.exe     (NSIS installer)
```

Artifact names come from the per-target `artifactName` in `package.json → build`
(`EasyWebUI_${version}_Setup.${ext}` / `EasyWebUI_${version}_Portable.${ext}`).

Two deliberate `package.json → build` choices (measured workarounds, do not "clean up"):

- `"npmRebuild": false` — better-sqlite3 was already rebuilt for Electron's ABI via
  `@electron/rebuild`; packaging reuses the existing binding instead of recompiling.
- `"electronDist": "node_modules/electron/dist"` — avoids electron-builder's Windows
  "rename-after-unzip EPERM" failure by copying the already-extracted Electron dist.

Environment notes: the build process PATH must include PowerShell
(`C:\Windows\System32\WindowsPowerShell\v1.0`, invoked indirectly by electron-builder when
collecting node deps). If the winCodeSign cache (`%LOCALAPPDATA%\electron-builder\Cache`)
fails to unpack due to symlink permissions, extract the corresponding `.7z` manually with
7za (darwin symlink errors are harmless). App icon: `build/icon.ico`.

## Project Structure

```
electron/            # main process (tsc → dist-electron/)
  main.ts            #   window / data-dir resolution / CSP / logging
  preload.ts         #   contextBridge → window.easyui (whitelisted API, contract §2)
  ipc.ts             #   all ipcMain.handle, zod-validated, errors redact()ed
  db/                #   better-sqlite3 (WAL + foreign_keys + schema_migrations)
  crypto/            #   safeStorage first; scrypt(machine fingerprint)+AES-256-GCM fallback
  gateway/           #   protocol adapters (openai-chat / openai-responses / anthropic),
                       #   SSE parsing, joinUrl, context trimming, timeouts & retry
  backup/            #   adm-zip export/import; pure-function core (no sqlite dependency)
  chat.ts            #   generation orchestration: persist → trim → stream → persist
shared/              # types.ts (EasyUiApi — single source of truth), presets.ts (12 providers), ipc.ts
src/                 # renderer (Vite + React 18 + TS strict + Tailwind 3)
  bridge/            #   getApi(): real window.easyui bridge, or localStorage mock
  pages/             #   chat / settings
  components/        #   Modal / Toast / Markdown / controls
  store/             #   zustand stores
  i18n/              #   zh-CN / en-US
  styles/            #   design tokens (liquid glass, dual theme)
tests/               # vitest: gateway / trim / crypto / backup
scripts/             # e2e preview, electron smoke & packaged-app verification
docs/                # kimi.md (design), impl-contract.md (IPC contract), screenshots/
```

Key constraint: **all outbound API requests go through the main-process gateway** — the
renderer never sees keys or ciphertext (`Provider` only carries a `has_key` boolean);
`nodeIntegration: false` + `contextIsolation: true`.

## Data Directory

- **Portable build**: a `data/` workspace next to the exe (located via `PORTABLE_EXECUTABLE_DIR`,
  immune to the %Temp% extraction dir); a custom-location pointer file
  `easywebui-data-dir.json` lives next to the exe too.
- **Installed build**: defaults to `%APPDATA%/easy-webui/data` — reinstalling, overwrite-installing
  and uninstalling never touch it.
- **Custom location**: Settings → General → Data storage path → Change…; all data is migrated
  automatically and takes effect after a restart.
- **Upgrade migration**: legacy data from older versions (install dir, %Temp% extraction dirs) is
  rescued automatically on first launch; `storage-layout.json` carries a storage-layout version so
  future structural upgrades migrate automatically.
- Layout: `easyui.db` (WAL), `keyring.bin` (fallback-encryption salt, mode 600),
  `backups/` (backup zips), `logs/app.log` (daily rotation, 7-day retention).

## Releasing a New Version (update channel)

The update channel is GitHub Releases (`build.publish` points to `ryanlew17/Easy-WebUI`):

1. Bump `version` → `npm run build` → `npx electron-builder --win`;
2. Create a GitHub Release with tag `vX.Y.Z` (tick **Set as a pre-release** for betas — only
   Beta-channel users will see it);
3. Upload `release/latest.yml`, `EasyWebUI_X.Y.Z_Setup.exe` and
   `EasyWebUI_X.Y.Z_Setup.exe.blockmap` (updates consume the installer; the portable build is
   replaced wholesale and keeps its data next to the exe);
4. Client flow: startup/manual check → auto-download on new version → sha512 verification against
   `latest.yml` → release summary + backup warning → silent install and restart on confirm.

## Security & Privacy

1. **API keys are never written in plaintext** — encrypted by `safeStorage`
   (DPAPI/Keychain/keyring) into `providers.api_key_cipher` with self-describing
   `v1:ss:` / `v1:mf:` prefixes; the fallback derives an AES-256-GCM key via scrypt from a
   machine fingerprint (SHA-256 of hostname+username+platform) plus a random salt in
   `keyring.bin`.
2. All known secrets are registered in a `crypto/redact` registry — logs, IPC errors and
   provider error messages are masked to `first3chars + ***`.
3. Backups **exclude keys by default**; key-including backups use an independent password
   (≥8 chars) with scrypt(N=2^15,r=8,p=1)+AES-256-GCM — safeStorage machine ciphertext is
   **never** exported; keys are re-encrypted with the local encryption service on restore.
4. CSP: `default-src 'self'` in production (stripped by a Vite plugin in dev for HMR).
5. Renderer code (including the mock bridge) never imports `electron/` or any node module.

### CSP hash

The anti-FOUC inline script in `index.html` is allowlisted via `script-src 'sha256-…'`
(no `unsafe-inline`). **If you touch that script — any whitespace included — recompute the hash:**

```bash
node -e "const fs=require('fs'),c=require('crypto');const m=fs.readFileSync('index.html','utf8').match(/<script>(\(function[\s\S]*?)<\/script>/);console.log(c.createHash('sha256').update(m[1],'utf8').digest('base64'))"
```

(Use this exact command matching the attribute-less `<script>`; a loose `/<script>.../`
regex can match text inside comments.)

## Development Notes

- **`package.json → main` is `dist-electron/electron/main.js`**: the contract text says
  `dist-electron/main.js`, but `tsc` preserves the `electron/` + `shared/` directory
  structure in its output; the field reflects the real artifact so the desktop app starts.
- **`dev:electron` requires a prior `npm run build`** (an allowed simplification). The
  preload is bundled self-contained with esbuild (`--external:electron`) as the last build
  step. If a future `tsx`/`esbuild` loader runs TS directly, the pre-build step can go away.
- **better-sqlite3 must match Electron's ABI** (electron-builder handles this when
  packaging; during development, if `electron .` throws an ABI error, run
  `npx electron-rebuild -f -w better-sqlite3` once). The web preview and `npm test` do not
  need the native module. **Note**: Electron 44+'s V8 API is incompatible with
  better-sqlite3 ≤ 11 (C2668/C2039 compile errors) — better-sqlite3 ≥ 12 is required
  (this project uses v13).
- All user-visible strings go through i18next `t()`; error copy follows the
  "what happened / likely cause / suggested action" pattern.

## Roadmap

- More protocol adapters and provider presets as APIs evolve
- Richer conversation organization (search, folders)
- See [docs/kimi.md](./docs/kimi.md) for the full design direction

## License

MIT
