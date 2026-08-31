/**
 * 共享 SVG 图标集（16×16 viewBox，stroke=currentColor，线性图标统一 1.3~1.5 描边）。
 * 全部操作按钮走 IconButton + 这里的图标；新增图标一律加在本文件，不内联散写。
 */
import type { ReactElement } from 'react';

interface IconProps {
  /** 视觉尺寸 px（默认 14；命中区由 IconButton 保证 ≥24px） */
  size?: number;
}

function base(
  size: number,
  children: ReactElement | ReactElement[],
  filled = false,
): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={filled ? { fill: 'currentColor', stroke: 'none' } : undefined}
    >
      {children}
    </svg>
  );
}

/** 分叉（git-fork 三节点） */
export function IconBranch({ size = 14 }: IconProps) {
  return base(size, [
    <circle key="a" cx="5" cy="3.5" r="1.6" />,
    <circle key="b" cx="5" cy="12.5" r="1.6" />,
    <circle key="c" cx="11" cy="3.5" r="1.6" />,
    <path key="d" d="M5 5.1v5.8M11 5.1c0 2.2-1.8 3.2-3.6 3.4" />,
  ]);
}

/** 复制（双矩形） */
export function IconCopy({ size = 14 }: IconProps) {
  return base(size, [
    <rect key="a" x="5.5" y="5.5" width="8" height="8" rx="1.5" />,
    <path key="b" d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1" />,
  ]);
}

/** 编辑（铅笔） */
export function IconEdit({ size = 14 }: IconProps) {
  return base(size, [
    <path key="a" d="M9.7 3.3l3 3L6 13H3v-3l6.7-6.7z" />,
    <path key="b" d="M8.5 4.5l3 3" />,
  ]);
}

/** 删除（垃圾桶，与 FieldRow 重置按钮同形） */
export function IconTrash({ size = 14 }: IconProps) {
  return base(size, <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4" />);
}

/** 重新生成（refresh-ccw 双弧箭头） */
export function IconRegenerate({ size = 14 }: IconProps) {
  return base(size, [
    <path key="a" d="M2 8a6 6 0 0 1 10.5-4L14 5.5M14 2v3.5h-3.5" />,
    <path key="b" d="M14 8a6 6 0 0 1-10.5 4L2 10.5M2 14v-3.5h3.5" />,
  ]);
}

/** 续写（箭头推向右缘竖线 = 继续往后写） */
export function IconContinue({ size = 14 }: IconProps) {
  return base(size, [
    <path key="a" d="M3 8h8.5M7.5 4l4 4-4 4" />,
    <path key="b" d="M13.5 2.5v11" />,
  ]);
}

/** 发送（向上箭头，圆形 accent 按钮内） */
export function IconSend({ size = 14 }: IconProps) {
  return base(size, <path d="M8 13.5v-11M3.5 7L8 2.5 12.5 7" />);
}

/** 停止（实心方块） */
export function IconStop({ size = 12 }: IconProps) {
  return base(size, <rect x="3" y="3" width="10" height="10" rx="2" />, true);
}

/** 确认（对勾；编辑态保存 / 复制成功反馈） */
export function IconCheck({ size = 14 }: IconProps) {
  return base(size, <path d="M2.5 8.5l3.5 3.5 7.5-8" />);
}

/** 取消（叉；编辑态取消） */
export function IconClose({ size = 14 }: IconProps) {
  return base(size, <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />);
}

/** 思考（灯泡；Composer Think 胶囊） */
export function IconBulb({ size = 14 }: IconProps) {
  return base(size, [
    <path
      key="a"
      d="M8 2.5a4 4 0 0 1 2.3 7.2c-.5.4-.8.9-.8 1.4v.4h-3v-.4c0-.5-.3-1-.8-1.4A4 4 0 0 1 8 2.5z"
    />,
    <path key="b" d="M6.5 13.5h3" />,
  ]);
}

/** 置顶（图钉；原内联 path 墨迹偏右 1.8 单位，经 translate 校正居中） */
export function IconPin({ size = 12 }: IconProps) {
  return base(
    size,
    <g transform="translate(-1.84 0)">
      <path d="M9.828 1.172a2 2 0 012.828 0l2.172 2.172a2 2 0 010 2.828l-1.414 1.414-5-5L9.828 1.172zM7.757 4.343l5 5-2.121.707-3.536 5.303-2.121-2.121 2.121-3.536-2.829-2.828 3.486-3.525z" />
    </g>,
  );
}

/** ✨（生成标题）。四芒星几何居中（墨迹 12×12，中心 8,8） */
export function IconSparkle({ size = 12 }: IconProps) {
  return base(size, <path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6L8 2z" />);
}

/** 文档（预设分块） */
export function IconDoc({ size = 13 }: IconProps) {
  return base(size, <path d="M3 2.5h7.5L13 5v8.5H3V2.5zM10 2.5V5h2.5" />);
}

/** 文档带行（系统提示词分块） */
export function IconNote({ size = 13 }: IconProps) {
  return base(size, <path d="M3 2.5h10v11H3V2.5zM5.5 5.5h5M5.5 8h5M5.5 10.5h3" />);
}

/** 滑杆组（设置分块） */
export function IconSliders({ size = 13 }: IconProps) {
  return base(size, <path d="M2.5 4.5h11M2.5 11.5h11M6 2.8v3.4M10 9.8v3.4" />);
}

/** 花括号（结构化输出分块） */
export function IconBraces({ size = 13 }: IconProps) {
  return base(
    size,
    <path d="M5.5 3C4 3 3.5 4 3.5 5v1.5c0 .8-.5 1.5-1.5 1.5 1 0 1.5.7 1.5 1.5V11c0 1 .5 2 2 2M10.5 3c1.5 0 2 1 2 2v1.5c0 .8.5 1.5 1.5 1.5-1 0-1.5.7-1.5 1.5V11c0 1-.5 2-2 2" />,
  );
}

/** 上一分支 ‹ */
export function IconChevronLeft({ size = 12 }: IconProps) {
  return base(size, <path d="M10.5 3.5L5.5 8l5 4.5" />);
}

/** 下一分支 › */
export function IconChevronRight({ size = 12 }: IconProps) {
  return base(size, <path d="M5.5 3.5l5 4.5-5 4.5" />);
}

/** 速率表盘（统计行 tok/s）。弧+底线+针在 16 视口内几何居中（墨迹中心 8,8），
 *  与统计行其余图标基线一致 —— 此前半圆画在下半部，首个图标视觉偏低错位 */
export function IconGauge({ size = 12 }: IconProps) {
  return base(size, [
    <path key="a" d="M2.5 11a5.5 5.5 0 1 1 11 0" />,
    <path key="b" d="M5 11h6" />,
    <path key="c" d="M8 11l2.4-3.9" />,
  ]);
}

/** 时钟（统计行 TTFT / 总用时） */
export function IconClock({ size = 12 }: IconProps) {
  return base(size, [
    <circle key="a" cx="8" cy="8" r="5.5" />,
    <path key="b" d="M8 5v3l2 1.5" />,
  ]);
}

/** token 计数（# 形；统计行 tokens） */
export function IconTokens({ size = 12 }: IconProps) {
  return base(size, <path d="M6 2.5L4.5 13.5M11.5 2.5L10 13.5M3 6h10.5M2.5 10.5h10.5" />);
}

/** 结束原因（旗帜；统计行 finish_reason） */
export function IconFlag({ size = 12 }: IconProps) {
  return base(size, <path d="M3.5 13.5v-11M3.5 3h9l-2.5 3 2.5 3h-9" />);
}

/** 设置（齿轮；中心圆 (8,8) r=2，外齿以 8 为中心严格对称 —— 侧栏「设置」） */
export function IconSettings({ size = 14 }: IconProps) {
  return base(size, [
    <circle key="a" cx="8" cy="8" r="2" />,
    <path
      key="b"
      d="M12.93 10a1.1 1.1 0 00.22 1.21l.04.04a1.33 1.33 0 11-1.89 1.89l-.04-.04a1.1 1.1 0 00-1.21-.22 1.1 1.1 0 00-.67 1.01V14a1.33 1.33 0 11-2.67 0v-.06A1.1 1.1 0 006 12.93a1.1 1.1 0 00-1.21.22l-.04.04a1.33 1.33 0 11-1.89-1.89l.04-.04a1.1 1.1 0 00.22-1.21 1.1 1.1 0 00-1.01-.67H2a1.33 1.33 0 110-2.67h.06A1.1 1.1 0 003.07 6a1.1 1.1 0 00-.22-1.21l-.04-.04a1.33 1.33 0 111.89-1.89l.04.04a1.1 1.1 0 001.21.22H6a1.1 1.1 0 00.67-1.01V2a1.33 1.33 0 112.67 0v.06a1.1 1.1 0 00.67 1.01 1.1 1.1 0 001.21-.22l.04-.04a1.33 1.33 0 111.89 1.89l-.04.04a1.1 1.1 0 00-.22 1.21V6a1.1 1.1 0 001.01.67H14a1.33 1.33 0 110 2.67h-.06a1.1 1.1 0 00-1.01.67z"
    />,
  ]);
}
