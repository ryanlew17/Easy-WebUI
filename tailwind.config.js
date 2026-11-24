// @req REQ-2026-006：语义排版阶梯由 Tailwind 工具类共享。
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        caption: ['var(--type-caption)', { lineHeight: 'var(--leading-caption)' }],
        control: ['var(--type-control)', { lineHeight: 'var(--leading-control)' }],
        body: ['var(--type-body)', { lineHeight: 'var(--leading-body)' }],
        title: ['var(--type-title)', { lineHeight: 'var(--leading-control)', fontWeight: 'var(--weight-semibold)' }],
        xs: ['var(--type-caption)', { lineHeight: 'var(--leading-caption)' }],
        sm: ['var(--type-body)', { lineHeight: 'var(--leading-control)' }],
      },
      colors: {
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'glass-bg': 'var(--glass-bg)',
        'row-bg': 'var(--row-bg)',
        danger: 'var(--danger)',
        'danger-text': 'var(--danger-text)',
        success: 'var(--success)',
        'success-text': 'var(--success-text)',
        warning: 'var(--warning)',
        'warning-text': 'var(--warning-text)',
        separator: 'var(--separator)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        s: 'var(--radius-s)',
        m: 'var(--radius-m)',
        l: 'var(--radius-l)',
        panel: 'var(--radius-panel)',
        control: 'var(--radius-l)',
        pill: 'var(--radius-pill)',
      },
    },
  },
  plugins: [],
};
