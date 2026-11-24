// @req REQ-2026-006：Chrome/Edge 139+ 保留 corner-shape 渐进增强。
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * 开发服务器依赖 inline preamble（@vitejs/plugin-react 的 fast-refresh）
 * 与 HMR WebSocket（ws:// 不在 default-src 'self' 覆盖范围内），
 * 二者都会被 index.html 里用于生产的严格 CSP meta 阻断。
 * 取舍：仅在 dev serve 阶段剥离该 meta；生产构建（file:// 加载）保留。
 */
function stripCspInDev(): Plugin {
  return {
    name: 'easyui-strip-csp-in-dev',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>\s*/i, '');
    },
  };
}

export default defineConfig({
  base: './', // Electron 生产环境以 file:// 加载，必须相对路径
  plugins: [react(), tailwindcss(), stripCspInDev()],
  resolve: {
    alias: {
      '@shared': r('./shared'),
      '@': r('./src'),
    },
  },
  server: { port: 5173 },
  /*
   * CSS 压缩 targets 双保险（修复：生产构建丢失无前缀 backdrop-filter 致安装版玻璃模糊全失效）：
   * - 压缩步骤（cssMinify 默认 lightningcss）以 build.cssTarget 为准
   *   （优先级高于 css.lightningcss.targets，缺省回落 build.target 的旧浏览器档 ——
   *   该档会误把无前缀 backdrop-filter 当冗余声明丢掉，只留 -webkit 版，
   *   而 Electron 的 Chromium（事故时 44/Chrome 152，现行 45/Chromium 156）不支持 -webkit-backdrop-filter）；
   * - 显式现代浏览器档后，LightningCSS 认定各目标均支持无前缀 backdrop-filter，
   *   压缩产物保留无前缀版（Safari ≥16 亦无需自动补 -webkit 前缀）；
   * - css.lightningcss.targets 同步声明同一档，作为压缩器行为变更时的兜底。
   * Tailwind 4 由 @tailwindcss/vite 处理，无需 PostCSS/autoprefixer；
   * Safari 16.4 / Firefox 128 是 Tailwind 4 官方最低浏览器档。
   */
  css: {
    lightningcss: {
      targets: {
        chrome: 139 << 16,
        edge: 139 << 16,
        safari: (16 << 16) | (4 << 8),
        firefox: 128 << 16,
      },
    },
  },
  build: {
    outDir: 'dist',
    cssTarget: ['chrome139', 'edge139', 'safari16.4', 'firefox128'],
  },
});
