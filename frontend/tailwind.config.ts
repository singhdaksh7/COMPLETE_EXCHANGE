import type { Config } from 'tailwindcss';

/**
 * Dark "fintech / crypto exchange" palette (Binance / CoinDCX inspired).
 * Semantic tokens so components stay readable: bg / panel / line / brand / up / down.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0e11', // page background
        panel: '#161a1e', // card surface
        'panel-2': '#1e2329', // raised surface / inputs
        line: '#2b3139', // borders / dividers
        brand: '#fcd535', // accent yellow
        'brand-dark': '#e3bd30',
        up: '#0ecb81', // buy / positive
        down: '#f6465d', // sell / negative
        muted: '#848e9c', // secondary text
        'muted-2': '#5e6673', // tertiary text
        ink: '#eaecef', // primary text

        // ---- Exora "Luxury Black + Metallic Gold" theme (auth / marketing) ----
        noir: '#0B0B0D', // deepest page background
        'noir-2': '#111114', // raised surface background
        gold: '#F5C242', // primary metallic gold
        'gold-glow': '#FFCC4D', // accent / glow gold
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'gold-glow': '0 0 60px -15px rgba(245, 194, 66, 0.45)',
        'gold-soft':
          '0 0 0 1px rgba(245, 194, 66, 0.18), 0 20px 60px -20px rgba(0, 0, 0, 0.85)',
      },
      keyframes: {
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-14px) rotate(3deg)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '0.95' },
        },
      },
      animation: {
        'float-slow': 'float-slow 6s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
