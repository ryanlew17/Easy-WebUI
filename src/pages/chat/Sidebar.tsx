/**
 * 左栏：新建会话、搜索（过滤标题）、会话列表（置顶+更新时间排序），
 * 行内重命名 / 删除（确认对话框）/ 置顶；底部齿轮进设置。
 * 列表行用半透明纯色（不占玻璃模糊层配额）。
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Conversation } from '@shared/types';
import { useConversationsStore } from '../../store/conversations';
import { useUiStore } from '../../store/ui';
import { ConfirmDialog } from '../../components/Modal';
import { getApi } from '../../bridge';
import { formatDateTime, displayTitle } from '../../lib/format';
import { parseIpcError } from '../../lib/errors';

function ConversationRow({
  conv,
  active,
  onSelect,
}: {
  conv: Conversation;
  active: boolean;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const patch = useConversationsStore((s) => s.patch);
  const applyTitle = useConversationsStore((s) => s.applyTitle);
  const remove = useConversationsStore((s) => s.remove);
  const toast = useUiStore((s) => s.toast);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);

  const title = displayTitle(conv.title, t('sidebar.untitled'));

  const commitRename = async (): Promise<void> => {
    const next = draft.trim();
    setRenaming(false);
    if (!next || next === conv.title) return;
    try {
      await patch(conv.id, { title: next });
    } catch {
      toast('error', t('toast.errorGeneric'));
    }
  };

  /**
   * ✨ 手动生成标题（重命名编辑框旁）：强制覆盖现有标题，忽略 auto_title 开关。
   * 后端成功即落库并广播 title:updated；这里用返回值覆盖编辑框 + 同步本地列表。
   * 失败：无可用模型 → toast 引导去设置；其他 → 三段式警告。
   */
  const onGenerateTitle = async (): Promise<void> => {
    setGeneratingTitle(true);
    try {
      const updated = await getApi().generateTitle(conv.id);
      setDraft(updated.title);
      applyTitle(conv.id, updated.title);
      toast('success', t('toast.titleGenerated', { title: updated.title }));
    } catch (e) {
      // 统一走 parseIpcError：主进程 EASYUI_ERR: 编码 / mock 裸 code 抛法都能识别
      const err = parseIpcError(e);
      if (err.code === 'title_model_unavailable') toast('warning', t('toast.titleNoModel'));
      else if (err.code === 'title_no_user_message')
        toast('warning', t('toast.titleNoUserMessage'));
      else toast('error', t('toast.titleFailed'));
    } finally {
      setGeneratingTitle(false);
    }
  };

  return (
    <li>
      <div
        className="row-surface row-surface-hover group relative mb-1 flex items-center gap-1 px-2.5 py-2"
        style={{
          background: active ? 'var(--row-bg-active)' : undefined,
          borderColor: active ? 'var(--accent)' : undefined,
        }}
      >
        {conv.pinned ? (
          <span className="flex-none text-tertiary" aria-hidden="true" title={t('sidebar.unpin')}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9.828 1.172a2 2 0 012.828 0l2.172 2.172a2 2 0 010 2.828l-1.414 1.414-5-5L9.828 1.172zM7.757 4.343l5 5-2.121.707-3.536 5.303-2.121-2.121 2.121-3.536-2.829-2.828 3.486-3.525z" />
            </svg>
          </span>
        ) : null}

        {renaming ? (
          <>
            <input
              className="input-surface min-w-0 flex-1"
              style={{ minHeight: '1.625rem', padding: '0.0625rem 0.375rem' }}
              value={draft}
              autoFocus
              aria-label={t('sidebar.rename')}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
            />
            {/* ✨ 生成标题：onMouseDown 阻止默认行为，避免 input blur 提前提交退出编辑态 */}
            <button
              type="button"
              className="btn btn-ghost icon-btn flex-none"
              style={{ width: '1.75rem', height: '1.75rem', minHeight: '1.75rem', minWidth: '1.75rem' }}
              title={t('sidebar.generateTitle')}
              aria-label={t('sidebar.generateTitle')}
              disabled={generatingTitle}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void onGenerateTitle()}
            >
              {generatingTitle ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M8 1.8l1.5 4.1 4.1 1.5-4.1 1.5L8 13l-1.5-4.1-4.1-1.5 4.1-1.5L8 1.8z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12.6 1.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6z"
                    fill="currentColor"
                  />
                </svg>
              )}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className="min-w-0 flex-1 rounded text-left"
            style={{ minHeight: '2rem' }}
            aria-current={active}
          >
            <span className="block truncate text-[0.8125rem]">{title}</span>
            <span className="block text-[0.6875rem] text-tertiary">
              {formatDateTime(conv.updated_at, i18n.language)}
            </span>
          </button>
        )}

        {!renaming ? (
          <div
            className="flex flex-none items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
            role="toolbar"
            aria-label={t('aria.conversationActions')}
          >
            <button
              type="button"
              className="btn btn-ghost icon-btn"
              title={conv.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
              aria-label={conv.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
              onClick={() =>
                void patch(conv.id, { pinned: !conv.pinned }).catch(() =>
                  toast('error', t('toast.errorGeneric')),
                )
              }
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M9.828 1.172a2 2 0 012.828 0l2.172 2.172a2 2 0 010 2.828l-1.414 1.414-5-5L9.828 1.172zM7.757 4.343l5 5-2.121.707-3.536 5.303-2.121-2.121 2.121-3.536-2.829-2.828 3.486-3.525z"
                  fill="currentColor"
                  opacity={conv.pinned ? 1 : 0.45}
                />
              </svg>
            </button>
            <button
              type="button"
              className="btn btn-ghost icon-btn"
              title={t('sidebar.rename')}
              aria-label={t('sidebar.rename')}
              onClick={() => {
                setDraft(conv.title);
                setRenaming(true);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M11.7 1.9l2.4 2.4L4.8 13.6l-3 .6.6-3L11.7 1.9z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-danger icon-btn"
              title={t('sidebar.delete')}
              aria-label={t('sidebar.delete')}
              onClick={() => setConfirming(true)}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      {confirming ? (
        <ConfirmDialog
          title={t('sidebar.deleteTitle')}
          body={t('sidebar.deleteBody')}
          confirmLabel={t('common.delete')}
          danger
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setBusy(true);
            remove(conv.id)
              .catch(() => toast('error', t('toast.errorGeneric')))
              .finally(() => {
                setBusy(false);
                setConfirming(false);
              });
          }}
        />
      ) : null}
    </li>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const { conversations, currentId, loaded, select, create } = useConversationsStore();
  const openSettings = useUiStore((s) => s.openSettings);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.title || '').toLowerCase().includes(q));
  }, [conversations, query]);

  const onCreate = async (): Promise<void> => {
    setCreating(true);
    try {
      await create();
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside className="flex min-h-0 flex-col" aria-label={t('aria.conversationList')}>
      {/* 左栏顶栏：玻璃模糊层 ① */}
      <div className="glass-bar flex flex-none flex-col gap-2 px-3 pb-3 pt-3.5">
        <button
          type="button"
          className="btn btn-accent btn-pill w-full"
          onClick={() => void onCreate()}
          disabled={creating}
          aria-label={t('aria.newConversation')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {t('sidebar.new')}
        </button>
        <input
          type="search"
          className="input-surface"
          placeholder={t('sidebar.searchPlaceholder')}
          aria-label={t('common.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loaded && conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-secondary">
            <p className="mb-1 font-medium text-primary">{t('sidebar.empty')}</p>
            <p>{t('sidebar.emptyHint')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-secondary">{t('sidebar.noMatch')}</div>
        ) : (
          <ul className="m-0 list-none p-0">
            {filtered.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                active={conv.id === currentId}
                onSelect={() => select(conv.id)}
              />
            ))}
          </ul>
        )}
      </nav>

      <div className="flex-none border-t hairline px-2 py-2">
        <button
          type="button"
          className="btn btn-ghost w-full justify-start"
          onClick={() => openSettings()}
          aria-label={t('aria.openSettings')}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 10a2 2 0 100-4 2 2 0 000 4z"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path
              d="M13.3 10a1.5 1.5 0 00-.3 1.65l.05.09a1.7 1.7 0 11-2.4 2.4l-.09-.05a1.5 1.5 0 00-1.65-.3 1.5 1.5 0 00-.91 1.38V15.3a1.7 1.7 0 11-3.4 0v-.14A1.5 1.5 0 003.7 13.8a1.5 1.5 0 00-1.65.3l-.09.05a1.7 1.7 0 11-2.4-2.4l.05-.09a1.5 1.5 0 00.3-1.65 1.5 1.5 0 00-1.38-.91H2.4a1.7 1.7 0 110-3.4h.14A1.5 1.5 0 003.9 4.4a1.5 1.5 0 00-.3-1.65l-.05-.09a1.7 1.7 0 112.4-2.4l.09.05a1.5 1.5 0 001.65.3H7.7a1.5 1.5 0 00.91-1.38V1.1a1.7 1.7 0 113.4 0v.14a1.5 1.5 0 00.91 1.38 1.5 1.5 0 001.65-.3l.09-.05a1.7 1.7 0 112.4 2.4l-.05.09a1.5 1.5 0 00-.3 1.65V6.4a1.5 1.5 0 001.38.91h.14a1.7 1.7 0 110 3.4h-.14a1.5 1.5 0 00-1.38.91z"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
          {t('nav.settings')}
        </button>
      </div>
    </aside>
  );
}
