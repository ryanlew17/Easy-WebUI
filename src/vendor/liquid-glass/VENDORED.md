# Vendored Liquid Glass

- Fetch date: 2026-11-21
- Glass HQ: @glass-sdk/liquid-glass@0.0.2, https://registry.npmjs.org/@glass-sdk/liquid-glass/-/liquid-glass-0.0.2.tgz, sha512-bDVDBXj6Cw++U0k9fcrSPEexnVnj/S4BjxF1t7NVQqW8La1gSVtxzPl9dG2VQxKs7Ik9kWR8Zi32JzyggI5Seg==
- vgpu: vgpu@0.5.0, https://registry.npmjs.org/vgpu/-/vgpu-0.5.0.tgz, sha512-isQfMHRTysYFfT8UWTzqQI/ROw2L7lVkj7xoUJlvIF6FjYxBNS/YNG7qp3tZ7ZvZZ3uwYjso+geQv/bEq5Hl3w==
- Lisse: @lisse/core@0.7.2, https://registry.npmjs.org/@lisse/core/-/core-0.7.2.tgz, sha512-YjGQ1JprtAry68U3jM532roxFcug8GCisQGQhcAVyC2r3WloILFECTi24eZtM2RRq8i7yQ+aDF2Cx6q+ffIGxg==

Only the Glass core/dom/gpu paths and required shared files are vendored. React, Base UI, GlassMenu, Gecko, persistent caches, remote resources and Node runtimes are excluded. vgpu and Lisse are bundled from the exact exports used by the Glass entries, then imported locally.

## Local adaptations

- Replaced IndexedDB/localStorage map persistence with the shared 4,000,000-pixel LRU and in-flight budget; evictions release decoded images and SVG map tokens.
- Replaced inline blob/data Workers with a Vite module Worker and synchronous encoder fallback; map images remain data: PNG URLs.
- Replaced progressive blur with a no-op boundary because Track B owns scroll fades; disabled Gecko at the engine capability boundary.
- Added per-surface ready/error callbacks, scene setActive, material map diagnostics and device-loss notifications.
- Changed bare vgpu/Lisse imports to local bundled modules. This file and the local patches must be reviewed on every re-vendor.

## vgpu bundle inputs

- node_modules/@vgpu/core/dist/bind-group-metadata.js
- node_modules/@vgpu/core/dist/buffer.js
- node_modules/@vgpu/core/dist/device.js
- node_modules/@vgpu/core/dist/errors.js
- node_modules/@vgpu/core/dist/gpu-constants.js
- node_modules/@vgpu/core/dist/index.js
- node_modules/@vgpu/core/dist/mock-gpu-storage.js
- node_modules/@vgpu/core/dist/mock-gpu.js
- node_modules/@vgpu/core/dist/queue.js
- node_modules/@vgpu/core/dist/readback.js
- node_modules/@vgpu/core/dist/resource-lifecycle.js
- node_modules/@vgpu/core/dist/shader.js
- node_modules/@vgpu/core/dist/texture-options.js
- node_modules/@vgpu/core/dist/texture-read-selection.js
- node_modules/@vgpu/core/dist/texture.js
- node_modules/@vgpu/wgsl/dist/compile.js
- node_modules/@vgpu/wgsl/dist/index.js
- node_modules/@vgpu/wgsl/dist/runtime/diagnostics.js
- node_modules/@vgpu/wgsl/dist/runtime/errors.js
- node_modules/@vgpu/wgsl/dist/runtime/mangler.js
- node_modules/@vgpu/wgsl/dist/runtime/parser.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-bind-layout.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-declarations.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-entry-points.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-layout.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-sampling.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-source.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-symbols.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-token-utils.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-type-parser.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-types.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-utils.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect-vars.js
- node_modules/@vgpu/wgsl/dist/runtime/reflect.js
- node_modules/@vgpu/wgsl/dist/runtime/scanner.js
- node_modules/@vgpu/wgsl/dist/runtime/scope-walker.js
- node_modules/@vgpu/wgsl/dist/runtime/wgsl-identifier-rules.js
- node_modules/@vgpu/wgsl/dist/runtime/wgsl-identifiers.js
- node_modules/@vgpu/wgsl/dist/runtime/xxh64.js
- node_modules/vgpu/dist/bind-cache.js
- node_modules/vgpu/dist/claim-validation-encode.js
- node_modules/vgpu/dist/claim-validation.js
- node_modules/vgpu/dist/draw-protocols.js
- node_modules/vgpu/dist/draw.js
- node_modules/vgpu/dist/effect.js
- node_modules/vgpu/dist/entry-metadata.js
- node_modules/vgpu/dist/errors.js
- node_modules/vgpu/dist/frame-protocols.js
- node_modules/vgpu/dist/frame-state.js
- node_modules/vgpu/dist/frame.js
- node_modules/vgpu/dist/index.js
- node_modules/vgpu/dist/indirect.js
- node_modules/vgpu/dist/init.js
- node_modules/vgpu/dist/kernel.js
- node_modules/vgpu/dist/lifecycle.js
- node_modules/vgpu/dist/live-kernel.js
- node_modules/vgpu/dist/pipeline-store.js
- node_modules/vgpu/dist/render-service.js
- node_modules/vgpu/dist/sampler.js
- node_modules/vgpu/dist/set-core.js
- node_modules/vgpu/dist/set-layouts.js
- node_modules/vgpu/dist/set-packing.js
- node_modules/vgpu/dist/set-resources.js
- node_modules/vgpu/dist/shader-source.js
- node_modules/vgpu/dist/surface.js
- node_modules/vgpu/dist/target-offscreen.js
- node_modules/vgpu/dist/target-utils.js
- vgpu-entry.mjs

## Lisse bundle inputs

- lissecore-entry.mjs
- node_modules/@lisse/core/dist/chunk-BL6ZAFLB.js
- node_modules/@lisse/core/dist/index.js

