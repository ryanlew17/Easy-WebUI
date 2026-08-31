import type { EasyUiApi } from '@shared/types';
import { mockApi } from './mock';

/**
 * UI 代码只依赖 getApi()，不感知 Electron / Web 预览差异（契约 §6）。
 * window.easyui 存在（Electron preload）→ 返回真实桥；否则返回 mock。
 */
export function getApi(): EasyUiApi {
  return window.easyui ?? mockApi;
}
