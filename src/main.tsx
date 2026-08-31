import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/params.css'; // 参数面板/预设分块样式（独立于 tokens.css）
import './i18n'; // i18next 同步初始化（cookie → 系统 locale），首帧即为正确语言
import { initTheme } from './lib/theme';
import { initZoomGuards } from './lib/appearance';

// 防 FOUC 内联脚本已落定初始 data-theme；这里挂上 system 档的媒体查询监听
initTheme();
// 禁用浏览器默认缩放手势（ctrl+wheel / ctrl/cmd±0），缩放只允许走设置里的应用内缩放
initZoomGuards();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
