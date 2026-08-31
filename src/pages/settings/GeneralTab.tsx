/**
 * 通用标签页：语言 / 主题（即时生效）、自动标题（含标题模型指定）、Enter 发送、
 * 快捷键表、数据存储路径与加密状态显示。
 *
 * 外观分组（页面最上方，即时生效、写 cookie 防 FOUC）：
 * - 界面缩放 50%–250% 步长 10%（CSS zoom，web/Electron 同路径；浏览器默认缩放手势已禁用）。
 *   滑块为 ZoomControl 自绘增量滑块：不能用原生 range —— 原生滑块按「指针相对轨道当前
 *   位置」算值，拖动中页面实时缩放会改变轨道几何，形成「值变 → 缩放变 → 轨道变 → 值再变」
 *   正反馈，轻轻一拖就冲到极值。增量模型以按下瞬间的指针位置/轨道宽度/值为基准，
 *   值 = 基准值 + 累计位移 ÷ 基准轨道宽 × 量程，只取决于鼠标累计位移，与实时布局解耦，
 *   数学上不可能失控；两侧另有 −/＋ 按钮按 10% 步进。
 * - 界面字体 / 代码块字体：blur/Enter 提交，空值恢复默认；输入过 shared/appearance.ts
 *   白名单消毒，非法字符拒绝并 toast（三段式）+ 控制台 warn + 回退默认；
 * - 界面字号 / 代码块字号：blur/Enter 提交，空值 = null 恢复默认；非法值 toast 警告
 *   不回写；界面字号改 documentElement 的 rem 基准，代码块字号落 --font-code-size 变量；
 * - 代码块背景：Auto/Light/Dark（documentElement data-code-theme，auto=跟随页面主题）。
 *
 * 标题模型：auto_title 开启后显示「标题模型」行——复用聊天页 ModelPicker 选
 * provider+model（写 settings.title_provider_id/title_model）；「清除」回退为
 * 跟随各会话当前模型；无任何已启用模型时显示引导（跳平台管理 Tab）。
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FONT_CODE_SIZE_MAX,
  FONT_CODE_SIZE_MIN,
  FONT_UI_SIZE_MAX,
  FONT_UI_SIZE_MIN,
  clampZoom,
  parseFontSize,
  sanitizeFontStack,
  ZOOM_MAX,
  ZOOM_MIN,
} from '@shared/appearance';
import { parseIpcError } from '@shared/errors';
import { getApi } from '../../bridge';
import { useSettingsStore } from '../../store/settings';
import { enabledModelsByProvider, useProvidersStore } from '../../store/providers';
import { useUiStore } from '../../store/ui';
import { SegmentedControl, TextField, Toggle } from '../../components/controls';
import { Modal } from '../../components/Modal';
import { ModelPicker } from '../chat/ModelPicker';

/** 缩放步长：滑块取整、−/＋ 按钮、键盘方向键统一 10%（clampZoom 内已按 0.1 取整） */
const ZOOM_STEP = 0.1;

/**
 * 界面缩放控件：− 按钮 + 自绘增量滑块 + ＋ 按钮 + 百分比读数。
 * 增量拖拽见文件头注释；键盘：←/↓ −10%，→/↑ ＋10%，Home/End 至极值。
 */
function ZoomControl() {
  const { t } = useTranslation();
  const zoom = useSettingsStore((s) => s.settings.zoom);
  const update = useSettingsStore((s) => s.update);
  const trackRef = useRef<HTMLDivElement | null>(null);
  /** 拖拽基准：全部取自 pointerdown 瞬间，之后不随实时缩放更新（防正反馈的关键） */
  const dragRef = useRef<{ startX: number; startValue: number; trackWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const setZoom = (v: number) => void update({ zoom: clampZoom(v) });
  const pct = Math.round(zoom * 100);
  const frac = (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    track.setPointerCapture(e.pointerId);
    // 按下即跳转到点击位置：此刻 rect 与当前缩放一致，单次有界跳转无反馈风险
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const jumped = clampZoom(ZOOM_MIN + ratio * (ZOOM_MAX - ZOOM_MIN));
    dragRef.current = { startX: e.clientX, startValue: jumped, trackWidth: rect.width };
    setDragging(true);
    if (jumped !== zoom) setZoom(jumped);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    // 增量模型：值只随鼠标累计位移变化；拖动中实时缩放导致的轨道几何变化不参与计算
    const next = d.startValue + ((e.clientX - d.startX) / d.trackWidth) * (ZOOM_MAX - ZOOM_MIN);
    const clamped = clampZoom(next);
    if (clamped !== zoom) setZoom(clamped);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    try {
      trackRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* 捕获可能已被浏览器释放 */
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = zoom - ZOOM_STEP;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = zoom + ZOOM_STEP;
    else if (e.key === 'Home') next = ZOOM_MIN;
    else if (e.key === 'End') next = ZOOM_MAX;
    if (next !== null) {
      e.preventDefault();
      setZoom(next);
    }
  };

  const btnIcon = (plus: boolean) => (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d={plus ? 'M6 2.5v7M2.5 6h7' : 'M2.5 6h7'}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );

  return (
    <div className="flex items-center gap-2" style={{ width: '15rem' }}>
      <button
        type="button"
        className="btn btn-ghost icon-btn flex-none"
        aria-label={t('settings.general.zoomDecrease')}
        title={t('settings.general.zoomDecrease')}
        disabled={zoom <= ZOOM_MIN}
        onClick={() => setZoom(zoom - ZOOM_STEP)}
      >
        {btnIcon(false)}
      </button>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        className={`zoom-slider min-w-0 flex-1${dragging ? ' is-dragging' : ''}`}
        aria-label={t('settings.general.zoom')}
        aria-orientation="horizontal"
        aria-valuemin={ZOOM_MIN * 100}
        aria-valuemax={ZOOM_MAX * 100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div className="zoom-slider-rail">
          <div className="zoom-slider-fill" style={{ width: `${frac * 100}%` }} />
        </div>
        <div className="zoom-slider-thumb" style={{ left: `${frac * 100}%` }} />
      </div>
      <button
        type="button"
        className="btn btn-ghost icon-btn flex-none"
        aria-label={t('settings.general.zoomIncrease')}
        title={t('settings.general.zoomIncrease')}
        disabled={zoom >= ZOOM_MAX}
        onClick={() => setZoom(zoom + ZOOM_STEP)}
      >
        {btnIcon(true)}
      </button>
      <span className="w-11 flex-none text-right text-xs text-secondary">{pct}%</span>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b hairline py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-[0.6875rem] text-tertiary">{hint}</p> : null}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

/**
 * 字号输入行控件（界面字号 / 代码块字号）：
 * - 数字输入框本地编辑态，blur/Enter 提交（提交语义同 TextField）；
 * - 空串提交 = null（恢复默认，输入框回显 placeholder「默认」）；
 * - parseFontSize 判非法 → toast 警告（含值域）+ 回显当前生效值，不回写；
 * - 仅在已设置（value !== null）时显示 ✕ 重置小按钮（一键回 null）。
 */
function FontSizeField({
  value,
  min,
  max,
  ariaLabel,
  onCommit,
}: {
  value: number | null;
  min: number;
  max: number;
  ariaLabel: string;
  onCommit: (v: number | null) => void;
}) {
  const { t } = useTranslation();
  const toast = useUiStore((s) => s.toast);
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);

  const commit = (): void => {
    const raw = text.trim();
    if (raw === '') {
      if (value !== null) onCommit(null);
      return;
    }
    const n = parseFontSize(raw, min, max);
    if (n === null) {
      toast('warning', t('settings.general.fontSizeInvalid', { min, max }));
      setText(value === null ? '' : String(value)); // 回显生效值，不回写
      return;
    }
    if (n !== value) onCommit(n);
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        className="input-surface w-20 flex-none text-right"
        min={min}
        max={max}
        step={1}
        value={text}
        aria-label={ariaLabel}
        placeholder={t('settings.general.fontSizePlaceholder')}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {value !== null ? (
        <button
          type="button"
          className="btn btn-ghost icon-btn flex-none"
          title={t('settings.general.fontSizeReset')}
          aria-label={t('settings.general.fontSizeReset')}
          onClick={() => onCommit(null)}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2.5 2.5l7 7M9.5 2.5l-7 7"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

export function GeneralTab() {
  const { t } = useTranslation();
  const { settings, systemInfo, update } = useSettingsStore();
  const providers = useProvidersStore((s) => s.providers);
  const setSettingsTab = useUiStore((s) => s.setSettingsTab);
  const toast = useUiStore((s) => s.toast);

  /** 标题模型可选前提：至少一个平台有已启用模型 */
  const hasAnyModel = enabledModelsByProvider(providers).length > 0;
  const titlePinned = !!(settings.title_provider_id && settings.title_model);

  /** 字体输入提交：白名单消毒；拒绝 → toast 三段式 + warn + 回退默认（空串） */
  const commitFont = (key: 'font_ui' | 'font_code') => (raw: string) => {
    const sanitized = sanitizeFontStack(raw);
    if (sanitized === null) {
      console.warn(`[appearance] ${key} rejected (illegal characters):`, raw);
      toast('warning', t('toast.fontRejected'));
      void update({ [key]: '' });
      return;
    }
    void update({ [key]: sanitized });
  };

  /* ---------- 数据存储路径变更（Electron 独占；确认 → 迁移 → 完成重启 Modal） ---------- */
  /** 确认弹窗中的目标路径 */
  const [dataDirTarget, setDataDirTarget] = useState<string | null>(null);
  /** 迁移中态（确认按钮禁用 + 文案切换） */
  const [dataDirMigrating, setDataDirMigrating] = useState(false);
  /** 迁移完成结果（adopted = switched：目标已有数据直接采用，需追加提示行） */
  const [dataDirDone, setDataDirDone] = useState<{ path: string; adopted: boolean } | null>(null);

  const onPickDataDir = async (): Promise<void> => {
    try {
      const path = await getApi().pickDataDir();
      if (path) setDataDirTarget(path); // null = 用户取消，静默中止
    } catch {
      toast('error', t('settings.general.dataPathFailed'));
    }
  };

  const onConfirmDataDir = async (): Promise<void> => {
    if (!dataDirTarget || dataDirMigrating) return;
    setDataDirMigrating(true);
    try {
      const res = await getApi().setDataDir({ path: dataDirTarget });
      setDataDirTarget(null);
      // noop（目标即当前目录）无重启语义，静默关闭；主进程一般直接报 same_dir 走失败分支
      if (res.status !== 'noop') {
        setDataDirDone({ path: res.path, adopted: res.status === 'switched' });
      }
    } catch (e) {
      const { code } = parseIpcError(e);
      const known = ['invalid_dir', 'same_dir', 'dir_not_writable', 'dir_inside_current'].includes(
        code,
      );
      toast(
        'error',
        t(known ? 'settings.general.dataPathInvalid' : 'settings.general.dataPathFailed'),
      );
      // 失败保留确认弹窗，允许用户重新选择
    } finally {
      setDataDirMigrating(false);
    }
  };

  const shortcuts: [string, string][] = [
    ['Ctrl/Cmd+N', t('settings.shortcuts.new')],
    ['Ctrl/Cmd+,', t('settings.shortcuts.settings')],
    ['Esc', t('settings.shortcuts.stop')],
    ['Enter', t('settings.shortcuts.send')],
    ['Shift+Enter', t('settings.shortcuts.newline')],
    ['Ctrl/Cmd+Enter', t('settings.shortcuts.sendAlt')],
  ];

  return (
    <section aria-label={t('settings.tabs.general')}>
      {/* 外观分组：页内现有层次 = row-surface 卡片 + h3 组标题（同「快捷键」卡） */}
      <div className="row-surface mb-3 px-4">
        <h3 className="pt-3 text-[0.8125rem] font-medium">{t('settings.general.appearance')}</h3>
        <Row label={t('settings.general.zoom')} hint={t('settings.general.zoomHint')}>
          <ZoomControl />
        </Row>
        <Row label={t('settings.general.fontUi')} hint={t('settings.general.fontUiHint')}>
          <div style={{ width: '13rem' }}>
            <TextField
              value={settings.font_ui}
              onCommit={commitFont('font_ui')}
              ariaLabel={t('settings.general.fontUi')}
              placeholder={t('settings.general.fontStackPlaceholder')}
            />
          </div>
        </Row>
        <Row label={t('settings.general.fontUiSize')} hint={t('settings.general.fontUiSizeHint')}>
          <FontSizeField
            value={settings.font_ui_size}
            min={FONT_UI_SIZE_MIN}
            max={FONT_UI_SIZE_MAX}
            ariaLabel={t('settings.general.fontUiSize')}
            onCommit={(v) => void update({ font_ui_size: v })}
          />
        </Row>
        <Row label={t('settings.general.fontCode')} hint={t('settings.general.fontCodeHint')}>
          <div style={{ width: '13rem' }}>
            <TextField
              value={settings.font_code}
              onCommit={commitFont('font_code')}
              ariaLabel={t('settings.general.fontCode')}
              placeholder={t('settings.general.fontStackPlaceholder')}
            />
          </div>
        </Row>
        <Row
          label={t('settings.general.fontCodeSize')}
          hint={t('settings.general.fontCodeSizeHint')}
        >
          <FontSizeField
            value={settings.font_code_size}
            min={FONT_CODE_SIZE_MIN}
            max={FONT_CODE_SIZE_MAX}
            ariaLabel={t('settings.general.fontCodeSize')}
            onCommit={(v) => void update({ font_code_size: v })}
          />
        </Row>
        <Row label={t('settings.general.codeTheme')} hint={t('settings.general.codeThemeHint')}>
          <SegmentedControl
            ariaLabel={t('settings.general.codeTheme')}
            value={settings.code_theme}
            onChange={(v) => void update({ code_theme: v })}
            options={[
              { value: 'auto', label: t('settings.general.codeThemeAuto') },
              { value: 'light', label: t('settings.general.themeLight') },
              { value: 'dark', label: t('settings.general.themeDark') },
            ]}
          />
        </Row>
      </div>

      <div className="row-surface mb-3 px-4">
        <Row label={t('settings.general.language')}>
          <SegmentedControl
            ariaLabel={t('settings.general.language')}
            value={settings.language}
            onChange={(v) => void update({ language: v })}
            options={[
              { value: 'system', label: t('settings.general.langSystem') },
              { value: 'zh-CN', label: '中文' },
              { value: 'en-US', label: 'English' },
            ]}
          />
        </Row>
        <Row label={t('settings.general.theme')}>
          <SegmentedControl
            ariaLabel={t('settings.general.theme')}
            value={settings.theme}
            onChange={(v) => void update({ theme: v })}
            options={[
              { value: 'light', label: t('settings.general.themeLight') },
              { value: 'dark', label: t('settings.general.themeDark') },
              { value: 'system', label: t('settings.general.themeSystem') },
            ]}
          />
        </Row>
        <Row label={t('settings.general.autoTitle')} hint={t('settings.general.autoTitleHint')}>
          <Toggle
            checked={settings.auto_title}
            label={t('settings.general.autoTitle')}
            onChange={(v) => void update({ auto_title: v })}
          />
        </Row>
        {settings.auto_title ? (
          <Row
            label={t('settings.general.titleModel')}
            hint={
              hasAnyModel
                ? titlePinned
                  ? t('settings.general.titleModelHintPinned')
                  : t('settings.general.titleModelHint')
                : t('settings.general.titleModelEmpty')
            }
          >
            {hasAnyModel ? (
              <div className="flex items-center gap-1.5">
                <ModelPicker
                  providerId={settings.title_provider_id}
                  model={settings.title_model}
                  onSelect={(pid, mid) =>
                    void update({ title_provider_id: pid, title_model: mid })
                  }
                />
                {titlePinned ? (
                  <button
                    type="button"
                    className="btn btn-ghost icon-btn flex-none"
                    title={t('settings.general.titleModelClear')}
                    aria-label={t('settings.general.titleModelClear')}
                    onClick={() => void update({ title_provider_id: null, title_model: null })}
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path
                        d="M2.5 2.5l7 7M9.5 2.5l-7 7"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-surface"
                aria-label={t('settings.general.titleModelGoProviders')}
                onClick={() => setSettingsTab('providers')}
              >
                {t('settings.general.titleModelGoProviders')}
              </button>
            )}
          </Row>
        ) : null}
        <Row label={t('settings.general.enterSend')} hint={t('settings.general.enterSendHint')}>
          <Toggle
            checked={settings.enter_send}
            label={t('settings.general.enterSend')}
            onChange={(v) => void update({ enter_send: v })}
          />
        </Row>
      </div>

      <div className="row-surface mb-3 px-4 py-3">
        <h3 className="mb-2 text-[0.8125rem] font-medium">{t('settings.general.shortcuts')}</h3>
        <table className="w-full text-xs">
          <tbody>
            {shortcuts.map(([keys, desc]) => (
              <tr key={keys} className="border-b hairline last:border-b-0">
                <td className="py-1.5 pr-3">
                  {keys.split('+').map((k, i, arr) => (
                    <span key={`${k}-${i}`}>
                      <kbd className="kbd">{k}</kbd>
                      {i < arr.length - 1 ? <span className="text-tertiary"> + </span> : null}
                    </span>
                  ))}
                </td>
                <td className="py-1.5 text-secondary">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row-surface px-4">
        <Row label={t('settings.general.dataPath')}>
          <div className="flex items-center gap-2">
            <code
              className="block max-w-xs truncate rounded-s px-1.5 py-0.5 text-[0.6875rem]"
              style={{ background: 'var(--code-bg)' }}
              title={systemInfo?.dataPath}
            >
              {systemInfo?.dataPath ?? '…'}
            </code>
            {systemInfo ? (
              <span className="badge flex-none">
                {systemInfo.dataPathSource === 'portable'
                  ? t('settings.general.dataPathSourcePortable')
                  : systemInfo.dataPathSource === 'custom'
                    ? t('settings.general.dataPathSourceCustom')
                    : t('settings.general.dataPathSourceDefault')}
              </span>
            ) : null}
            {systemInfo?.isElectron ? (
              <button
                type="button"
                className="btn btn-surface flex-none"
                style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
                onClick={() => void onPickDataDir()}
              >
                {t('settings.general.dataPathChange')}
              </button>
            ) : null}
          </div>
        </Row>
        <Row label={t('settings.general.version')}>
          <span className="text-xs text-secondary">{systemInfo?.version ?? '…'}</span>
        </Row>
        <Row label={t('settings.general.platform')}>
          <span className="text-xs text-secondary">{systemInfo?.platform ?? '…'}</span>
        </Row>
        <Row label={t('settings.general.encryption')}>
          <span
            className="badge"
            style={{
              color: systemInfo?.encryption.available
                ? 'var(--success-text)'
                : 'var(--warning-text)',
            }}
          >
            {systemInfo
              ? systemInfo.encryption.available
                ? t('settings.general.encSafe')
                : t('settings.general.encWeak')
              : '…'}
          </span>
        </Row>
      </div>

      {/* 数据路径变更：确认弹窗（迁移中态禁用按钮） */}
      {dataDirTarget ? (
        <Modal
          title={t('settings.general.dataPathConfirmTitle')}
          onClose={() => {
            if (!dataDirMigrating) setDataDirTarget(null);
          }}
          closeOnOverlay={false}
          maxWidthClass="max-w-md"
          footer={
            <>
              <button
                type="button"
                className="btn btn-surface"
                disabled={dataDirMigrating}
                onClick={() => setDataDirTarget(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-accent"
                disabled={dataDirMigrating}
                onClick={() => void onConfirmDataDir()}
              >
                {dataDirMigrating ? t('settings.general.dataPathMigrating') : t('common.confirm')}
              </button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-secondary">
            {t('settings.general.dataPathConfirmBody')}
          </p>
          <code
            className="mt-2 block break-all rounded-s px-2 py-1.5 text-[0.6875rem]"
            style={{ background: 'var(--code-bg)' }}
          >
            {dataDirTarget}
          </code>
        </Modal>
      ) : null}

      {/* 迁移完成：重启后生效（switched 追加「直接采用」提示行） */}
      {dataDirDone ? (
        <Modal
          title={t('settings.general.dataPathDoneTitle')}
          onClose={() => setDataDirDone(null)}
          maxWidthClass="max-w-md"
          footer={
            <>
              <button
                type="button"
                className="btn btn-surface"
                onClick={() => setDataDirDone(null)}
              >
                {t('settings.general.restartLater')}
              </button>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => {
                  void getApi().relaunchApp();
                  setDataDirDone(null);
                }}
              >
                {t('settings.general.restartNow')}
              </button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-secondary">
            {t('settings.general.dataPathDoneBody', { path: dataDirDone.path })}
          </p>
          {dataDirDone.adopted ? (
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              {t('settings.general.dataPathConfirmAdopt')}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </section>
  );
}
