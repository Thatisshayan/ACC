/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        acc: {
          bg:     '#0A0A0F',
          panel:  '#111118',
          border: '#1e1e2e',
          cyan:   '#00F2FF',
          amber:  '#FFAB00',
          green:  '#00E676',
          red:    '#FF1744',
          purple: '#D1C4E9',
          text:   '#e2e8f0',
          muted:  '#64748b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow':  'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
};
