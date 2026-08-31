/**
 * 输入坞（玻璃模糊层 ③）：
 * - 多行自适应 textarea（最高 10rem 后内部滚动）；
 * - Enter 发送 / Shift+Enter 换行（可在通用设置翻转，翻转后 Ctrl/Cmd+Enter 发送）；
 * - 生成中禁用输入 + 停止按钮（Esc 亦可停，见 App 快捷键）。
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settings';

export function Composer({
  disabled,
  generating,
  hasModel,
  onSend,
  onStop,
}: {
  disabled: boolean;
  generating: boolean;
  hasModel: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const enterSend = useSettingsStore((s) => s.settings.enter_send);
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 自适应高度
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160) / 16}rem`;
  }, [text]);

  const canSend = !disabled && !generating && hasModel && text.trim().length > 0;

  const doSend = (): void => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return; // Shift+Enter 恒为换行
    if (enterSend) {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        doSend();
      }
    } else if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      doSend();
    }
  };

  return (
    <div className="glass-bar flex-none px-4 py-3" style={{ borderTop: '0.5px solid var(--glass-border)', borderBottom: 'none' }}>
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={taRef}
          rows={1}
          className="input-surface flex-1"
          style={{ resize: 'none', maxHeight: '10rem', minHeight: '2.25rem', padding: '0.4375rem 0.75rem' }}
          placeholder={
            !hasModel
              ? t('chat.input.placeholderNoModel')
              : enterSend
                ? t('chat.input.placeholder')
                : t('chat.input.placeholderAlt')
          }
          aria-label={t('aria.composer')}
          value={text}
          disabled={disabled || generating}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {generating ? (
          <button
            type="button"
            className="btn btn-danger-solid flex-none"
            style={{ minHeight: '2.25rem' }}
            onClick={onStop}
            aria-label={t('aria.stopGeneration')}
          >
            ■ {t('chat.input.stop')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-accent flex-none"
            style={{ minHeight: '2.25rem' }}
            onClick={doSend}
            disabled={!canSend}
            aria-label={t('aria.sendMessage')}
          >
            {t('chat.input.send')}
          </button>
        )}
      </div>
    </div>
  );
}
