/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cream: 'var(--cream, #F3ECE0)',
        sidebar: 'var(--sidebar, #271A11)',
        cta: 'var(--cta, #C0613D)',
        ready: 'var(--ready, #2F7D63)',
        warn: 'var(--warn, #D39A2D)',
        ink: 'var(--ink, #33271B)',
        muted: 'var(--muted, #8A7355)',
        panel: 'var(--panel, #ffffff)',
        chip: 'var(--chip, #ede6da)',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
      },
      minHeight: {
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
      spacing: {
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'safe-t': 'env(safe-area-inset-top, 0px)',
      },
    },
  },
  plugins: [],
};
