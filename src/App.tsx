/**
 * 应用壳：
 * - 启动装载：settings（主题/语言即时应用）→ providers + conversations；
 * - 桥事件统一挂载/卸载：onChatDelta/Done/Error/ModelCheck（契约 §2）；
 * - 全局快捷键（kimi.md §9）：Ctrl/Cmd+N 新会话、Ctrl/Cmd+, 设置、Esc 停止生成
 *   （模态打开时 Esc 优先关模态，经 ui.modalDepth 协调）。
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from './bridge';
import { useSettingsStore } from './store/settings';
import { useProvidersStore } from './store/providers';
import { useConversationsStore } from './store/conversations';
import { usePresetsStore } from './store/presets';
import { useMessagesStore } from './store/messages';
import { useUiStore } from './store/ui';
import { ChatPage } from './pages/chat/ChatPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { ToastHost } from './components/Toast';

export default function App() {
  const { t } = useTranslation();
  const page = useUiStore((s) => s.page);

  /* 启动装载 */
  useEffect(() => {
    const settings = useSettingsStore.getState();
    const providers = useProvidersStore.getState();
    const conversations = useConversationsStore.getState();
    void settings.load().then(() => {
      void providers.load();
      void usePresetsStore.getState().load();
      void conversations.load();
    });
  }, []);

  /* 桥事件订阅（卸载时取消） */
  useEffect(() => {
    const api = getApi();

    const offDelta = api.onChatDelta((p) => useMessagesStore.getState().handleDelta(p));
    const offDone = api.onChatDone((p) => {
      useMessagesStore.getState().handleDone(p);
      // updated_at 变化 → 本地 bump 重排序（不整表 refetch，避免旧快照覆盖
      // 紧随其后的 title:updated —— 见 conversations.ts touchLocal 注释）
      useConversationsStore.getState().touchLocal(p.conversationId);
    });
    const offError = api.onChatError((p) => {
      if (p.error.code === 'context_truncated') {
        // 契约 §5 简化允许：裁剪截断仅警告不阻断
        useUiStore.getState().toast('warning', t('toast.truncated'));
        return;
      }
      useMessagesStore.getState().handleError(p);
    });
    const offCheck = api.onModelCheck((p) =>
      useProvidersStore.getState().applyModelCheck(p.providerId, p.modelId, p.check),
    );
    // 标题生成（自动路径首轮完成后、手动 ✨ 路径）：成功即时刷新侧栏标题
    const offTitleUpdated = api.onTitleUpdated((p) =>
      useConversationsStore.getState().applyTitle(p.conversationId, p.title),
    );
    // 自动路径最终失败（已重试 1 次）：三段式警告，不阻断对话
    const offTitleFailed = api.onTitleFailed(() =>
      useUiStore.getState().toast('warning', t('toast.titleFailedAuto')),
    );
    // 启动自动检查发现新版本（About 页未挂载时由此通知；About 页自身另有监听做状态机）
    const offUpdateAvailable = api.onUpdateAvailable((info) =>
      useUiStore
        .getState()
        .toast('success', t('settings.about.updateAvailableToast', { version: info.version })),
    );

    return () => {
      offDelta();
      offDone();
      offError();
      offCheck();
      offTitleUpdated();
      offTitleFailed();
      offUpdateAvailable();
    };
  }, [t]);

  /* 全局快捷键 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        const ui = useUiStore.getState();
        if (ui.modalDepth > 0) return;
        ui.setPage('chat');
        void useConversationsStore.getState().create();
        return;
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        const ui = useUiStore.getState();
        if (ui.modalDepth > 0) return;
        ui.setPage(ui.page === 'settings' ? 'chat' : 'settings');
        return;
      }
      if (e.key === 'Escape') {
        const ui = useUiStore.getState();
        if (ui.modalDepth > 0) return; // 模态优先（Modal 自带 Esc 关闭）
        if (ui.page !== 'chat') return;
        const convId = useConversationsStore.getState().currentId;
        if (convId && useMessagesStore.getState().generating[convId]) {
          e.preventDefault();
          void useMessagesStore.getState().stop(convId);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="h-full w-full overflow-hidden">
      {page === 'chat' ? <ChatPage /> : <SettingsPage />}
      <ToastHost />
    </div>
  );
}
