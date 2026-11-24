# Third-Party Notices

## Glass HQ — Liquid Glass

- Package: `@glass-sdk/liquid-glass@0.0.2`
- Source: https://github.com/Glass-HQ/liquid-glass
- License: MIT, Copyright (c) 2026 Glass HQ
- Vendored modules: selected `core`, `dom`, `gpu`, types and `styles.css`
- Full license: `src/vendor/liquid-glass/LICENSE.liquid-glass`

## vgpu

- Package: `vgpu@0.5.0` and its required `@vgpu/*` browser modules
- Source: https://github.com/vercel-labs/vgpu
- License: MIT
- Vendored form: only the exports required by the Liquid Glass GPU entry, bundled locally
- Full license: `src/vendor/liquid-glass/LICENSE.vgpu`

## Lisse

- Package: `@lisse/core@0.7.2`
- Source: https://github.com/JaceThings/Lisse
- License: MIT
- Vendored form: only the shape, layout and effect functions used by the selected Liquid Glass modules
- Full license: `src/vendor/liquid-glass/LICENSE.lisse`

Exact package integrity values, bundle inputs and local adaptations are recorded in `src/vendor/liquid-glass/VENDORED.md`. These packages are not npm runtime dependencies of Easy WebUI.
