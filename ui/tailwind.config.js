/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        acc: {
          bg:      '#050508',
          panel:   '#0d0d14',
          border:  '#1a1a2e',
          green:   '#1aff8c',
          cyan:    '#00F2FF',
          amber:   '#FFAB00',
          red:     '#FF1744',
          purple:  '#D1C4E9',
          text:    '#e2e8f0',
          muted:   '#64748b',
          dim:     '#2a2a3a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow':    'spin 4s linear infinite',
        'glow-green':   'glowPulse 2.5s ease-in-out infinite',
        'float':        'float 4s ease-in-out infinite',
        'blink':        'blink 1.1s step-end infinite',
        'radar':        'radarSweep 4s linear infinite',
        'scanline':     'scanline 6s linear infinite',
        'count-in':     'countIn 0.5s ease forwards',
        'row-in':       'rowIn 0.35s ease forwards',
        'ripple':       'ripple 1.5s ease-out infinite',
      },
      keyframes: {
        glowPulse:   { '0%,100%': { boxShadow: '0 0 6px rgba(26,255,140,.25)' }, '50%': { boxShadow: '0 0 24px rgba(26,255,140,.6)' } },
        float:       { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-5px)' } },
        blink:       { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.15' } },
        radarSweep:  { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        scanline:    { '0%': { transform: 'translateY(-100%)', opacity: '0' }, '10%': { opacity: '0.6' }, '90%': { opacity: '0.4' }, '100%': { transform: 'translateY(400%)', opacity: '0' } },
        countIn:     { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        rowIn:       { from: { opacity: '0', transform: 'translateX(-12px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        ripple:      { '0%': { transform: 'scale(0.8)', opacity: '0.8' }, '100%': { transform: 'scale(2.2)', opacity: '0' } },
      },
      backgroundImage: {
        'grid-green': "linear-gradient(rgba(26,255,140,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(26,255,140,.025) 1px,transparent 1px)",
      },
      backgroundSize: {
        'grid-48': '48px 48px',
      },
    },
  },
  plugins: [],
};
