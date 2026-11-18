import type { Config } from 'tailwindcss';

// Tokens mirror DESIGN.md. Colors resolve to CSS variables so light/dark share one palette.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        slate: 'rgb(var(--slate) / <alpha-value>)',
        ledger: 'rgb(var(--ledger) / <alpha-value>)',
        'on-ledger': 'rgb(var(--on-ledger) / <alpha-value>)',
        owed: 'rgb(var(--owed) / <alpha-value>)',
        'owed-text': 'rgb(var(--owed-text) / <alpha-value>)',
        brick: 'rgb(var(--brick) / <alpha-value>)',
      },
      borderRadius: { control: '8px', card: '12px', sheet: '20px' },
      fontFamily: {
        heading: ['var(--font-heading)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'var(--font-ethiopic)', 'system-ui', 'sans-serif'],
      },
      fontSize: { xs: '12px', sm: '14px', base: '16px', xl: '20px', '2xl': '24px', '3xl': '32px' },
      spacing: { 18: '72px', 12: '48px' },
      minHeight: { touch: '48px' },
      boxShadow: {
        bar: '0 -4px 12px rgb(0 0 0 / 0.06)',
        sheet: '0 -8px 24px rgb(0 0 0 / 0.12)',
      },
    },
  },
  plugins: [],
};
export default config;
