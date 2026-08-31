import type { EasyUiApi } from '@shared/types';

declare global {
  interface Window {
    /** Electron preload 注入；纯 Web 预览时不存在，走 mock（见 bridge/index.ts） */
    easyui?: EasyUiApi;
  }
}

export {};
