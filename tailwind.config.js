module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#0f172a',
        },
      },
      boxShadow: {
        glow: '0 10px 30px -5px var(--glow, rgba(0,170,255,0.35))',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)'
      },
      keyframes: {
        'modal-in': {
          '0%': { transform: 'translateY(8px) scale(0.98)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' }
        }
      },
      animation: {
        'modal-in': 'modal-in 240ms var(--tw-ease-out) both'
      }
    },
  },
  plugins: [],
};
