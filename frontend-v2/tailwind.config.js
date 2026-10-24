/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { sus: { 950: '#001b36', 900: '#003366', 700: '#0055A4', 600: '#0876c9' }, clinical: { 700: '#0f766e', 600: '#0d9488', 100: '#ccfbf1' } }, boxShadow: { panel: '0 1px 3px rgba(15, 23, 42, .06)' } } },
  plugins: []
};