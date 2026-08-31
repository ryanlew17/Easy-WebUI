import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
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
  plugins: [react(), stripCspInDev()],
  resolve: {
    alias: {
      '@shared': r('./shared'),
      '@': r('./src'),
    },
  },
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
