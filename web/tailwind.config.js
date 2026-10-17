/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0E2236', 900: '#0E2236', 800: '#15304A', 700: '#24425E', 500: '#4F6780', 300: '#A3B3C4' },
        brand: { DEFAULT: '#17466A', 700: '#10344F', 600: '#17466A', 100: '#DCE8F2', 50: '#EEF4F9' },
        leaf: { DEFAULT: '#449476', 100: '#DDEFE6' },
        paper: '#F5F7F9',
        line: '#E2E6EA',
        danger: '#B42318',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'], mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
      boxShadow: { card: '0 1px 2px rgba(14,34,54,.06), 0 8px 24px -12px rgba(14,34,54,.14)' },
    },
  },
  plugins: [],
};
