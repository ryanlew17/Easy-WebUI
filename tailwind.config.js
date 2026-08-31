/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
        panel: '1rem',
        control: '0.75rem',
        pill: '999px',
      },
    },
  },
  plugins: [],
};
