import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:    '#14110E',
        paper:  '#FBF7EF',
        brand:  '#D6492F',   // paprika — the one bold color
        'brand-dark': '#B33A23',
        edge:   '#E7DECB',   // warm hairline borders
        muted:  '#8C8579',
        state: {
          live:     '#1FA463',
          scheduled:'#E0992A',
          catering: '#7C5CD6',
          off:      '#9A938A',
        },
      },
      fontFamily: {
        display: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
        sans:    ['var(--font-hanken)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { ticket: '10px' },
      boxShadow: {
        ticket: '0 1px 0 #E7DECB, 0 6px 20px -12px rgba(20,17,14,0.25)',
      },
    },
  },
  plugins: [],
};
export default config;
