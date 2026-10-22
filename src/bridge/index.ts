import type { EasyUiApi } from '@shared/types';
import { mockApi } from './mock';

/**
 * UI 代码只依赖 getApi()，不感知 Electron / Web 预览差异（docs/contracts/impl-contract.md，Mock 桥）。
 * window.easyui 存在（Electron preload）→ 返回真实桥；否则返回 mock。
 */
export function getApi(): EasyUiApi {
  if (window.easyui) return window.easyui;
  // @req REQ-2026-001：Electron 下 preload 注入失败时静默跑 mock 会把业务数据写进
  // localStorage 且用户无感知——至少留下可见告警（UI 不阻断，web 预览不受影响）
  if (/electron/i.test(navigator.userAgent)) {
    console.warn(
      '[easyui] preload bridge missing under Electron — falling back to mock bridge; data will NOT persist to the app database.',
    );
  }
  return mockApi;
}
