/**
 * preload：contextBridge 暴露 window.easyui（kimi.md §2.2 约束 4）。
 * 方法集与契约 §2 完全一致；事件订阅返回取消订阅函数。
 * 注意：nodeIntegration:false + contextIsolation:true，这里只做白名单转发。
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { IPC, EVT } from '../shared/ipc';
import type { EasyUiApi } from '../shared/types';

const invoke = (channel: string, ...args: unknown[]): Promise<unknown> =>
  ipcRenderer.invoke(channel, ...args);

function subscribe<T>(channel: string): (cb: (payload: T) => void) => () => void {
  return (cb) => {
    const listener = (_event: IpcRendererEvent, payload: T) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  };
}

const api: EasyUiApi = {
  // —— 平台管理 ——
  listProviders: () => invoke(IPC.listProviders) as ReturnType<EasyUiApi['listProviders']>,
  createProvider: (draft) =>
    invoke(IPC.createProvider, draft) as ReturnType<EasyUiApi['createProvider']>,
  updateProvider: (id, patch) =>
    invoke(IPC.updateProvider, id, patch) as ReturnType<EasyUiApi['updateProvider']>,
  deleteProvider: (id) =>
    invoke(IPC.deleteProvider, id) as ReturnType<EasyUiApi['deleteProvider']>,
  getPresets: () => invoke(IPC.getPresets) as ReturnType<EasyUiApi['getPresets']>,
  fetchModels: (input) =>
    invoke(IPC.fetchModels, input) as ReturnType<EasyUiApi['fetchModels']>,
  testModel: (providerId, modelId) =>
    invoke(IPC.testModel, providerId, modelId) as ReturnType<EasyUiApi['testModel']>,
  testAllModels: (providerId) =>
    invoke(IPC.testAllModels, providerId) as ReturnType<EasyUiApi['testAllModels']>,
  detectFormat: (input) =>
    invoke(IPC.detectFormat, input) as ReturnType<EasyUiApi['detectFormat']>,

  // —— 会话与消息 ——
  listConversations: () =>
    invoke(IPC.listConversations) as ReturnType<EasyUiApi['listConversations']>,
  createConversation: () =>
    invoke(IPC.createConversation) as ReturnType<EasyUiApi['createConversation']>,
  updateConversation: (id, patch) =>
    invoke(IPC.updateConversation, id, patch) as ReturnType<EasyUiApi['updateConversation']>,
  deleteConversation: (id) =>
    invoke(IPC.deleteConversation, id) as ReturnType<EasyUiApi['deleteConversation']>,
  listMessages: (conversationId) =>
    invoke(IPC.listMessages, conversationId) as ReturnType<EasyUiApi['listMessages']>,
  switchBranch: (input) =>
    invoke(IPC.switchBranch, input) as ReturnType<EasyUiApi['switchBranch']>,
  setActiveLeaf: (input) =>
    invoke(IPC.setActiveLeaf, input) as ReturnType<EasyUiApi['setActiveLeaf']>,
  updateMessageContent: (input) =>
    invoke(IPC.updateMessageContent, input) as ReturnType<EasyUiApi['updateMessageContent']>,
  deleteMessages: (input) =>
    invoke(IPC.deleteMessages, input) as ReturnType<EasyUiApi['deleteMessages']>,
  generateTitle: (conversationId) =>
    invoke(IPC.generateTitle, conversationId) as ReturnType<EasyUiApi['generateTitle']>,
  onTitleUpdated: subscribe(EVT.titleUpdated),
  onTitleFailed: subscribe(EVT.titleFailed),

  // —— 参数预设 ——
  listParamPresets: () =>
    invoke(IPC.listParamPresets) as ReturnType<EasyUiApi['listParamPresets']>,
  createParamPreset: (input) =>
    invoke(IPC.createParamPreset, input) as ReturnType<EasyUiApi['createParamPreset']>,
  updateParamPreset: (id, patch) =>
    invoke(IPC.updateParamPreset, id, patch) as ReturnType<EasyUiApi['updateParamPreset']>,
  deleteParamPreset: (id) =>
    invoke(IPC.deleteParamPreset, id) as ReturnType<EasyUiApi['deleteParamPreset']>,
  resetGlobalPreset: () =>
    invoke(IPC.resetGlobalPreset) as ReturnType<EasyUiApi['resetGlobalPreset']>,

  // —— 对话生成 ——
  sendMessage: (input) => invoke(IPC.sendMessage, input) as ReturnType<EasyUiApi['sendMessage']>,
  regenerateMessage: (input) =>
    invoke(IPC.regenerateMessage, input) as ReturnType<EasyUiApi['regenerateMessage']>,
  continueMessage: (input) =>
    invoke(IPC.continueMessage, input) as ReturnType<EasyUiApi['continueMessage']>,
  generateResponse: (input) =>
    invoke(IPC.generateResponse, input) as ReturnType<EasyUiApi['generateResponse']>,
  stopGeneration: (conversationId) =>
    invoke(IPC.stopGeneration, conversationId) as ReturnType<EasyUiApi['stopGeneration']>,
  onChatDelta: subscribe(EVT.chatDelta),
  onChatDone: subscribe(EVT.chatDone),
  onChatError: subscribe(EVT.chatError),
  onModelCheck: subscribe(EVT.modelCheck),

  // —— 通用设置 / 系统信息 ——
  getSettings: () => invoke(IPC.getSettings) as ReturnType<EasyUiApi['getSettings']>,
  setSettings: (patch) => invoke(IPC.setSettings, patch) as ReturnType<EasyUiApi['setSettings']>,
  getSystemInfo: () => invoke(IPC.getSystemInfo) as ReturnType<EasyUiApi['getSystemInfo']>,

  // —— 数据目录（Electron 独占） ——
  pickDataDir: () => invoke(IPC.pickDataDir) as ReturnType<EasyUiApi['pickDataDir']>,
  setDataDir: (input) => invoke(IPC.setDataDir, input) as ReturnType<EasyUiApi['setDataDir']>,
  relaunchApp: () => invoke(IPC.relaunchApp) as ReturnType<EasyUiApi['relaunchApp']>,
  openExternal: (url) => invoke(IPC.openExternal, url) as ReturnType<EasyUiApi['openExternal']>,

  // —— 在线升级 ——
  updateCheck: () => invoke(IPC.updateCheck) as ReturnType<EasyUiApi['updateCheck']>,
  updateDownload: () => invoke(IPC.updateDownload) as ReturnType<EasyUiApi['updateDownload']>,
  updateInstall: () => invoke(IPC.updateInstall) as ReturnType<EasyUiApi['updateInstall']>,
  updateGetState: () =>
    invoke(IPC.updateGetState) as ReturnType<EasyUiApi['updateGetState']>,
  onUpdateProgress: subscribe(EVT.updateProgress),
  onUpdateAvailable: subscribe(EVT.updateAvailable),

  // —— 备份 ——
  listBackups: () => invoke(IPC.listBackups) as ReturnType<EasyUiApi['listBackups']>,
  createBackup: (input) =>
    invoke(IPC.createBackup, input) as ReturnType<EasyUiApi['createBackup']>,
  restoreBackup: (input) =>
    invoke(IPC.restoreBackup, input) as ReturnType<EasyUiApi['restoreBackup']>,
  deleteBackup: (filename) =>
    invoke(IPC.deleteBackup, filename) as ReturnType<EasyUiApi['deleteBackup']>,
  openBackupsDir: () => invoke(IPC.openBackupsDir) as ReturnType<EasyUiApi['openBackupsDir']>,
  pickBackupFile: () => invoke(IPC.pickBackupFile) as ReturnType<EasyUiApi['pickBackupFile']>,
};

contextBridge.exposeInMainWorld('easyui', api);
