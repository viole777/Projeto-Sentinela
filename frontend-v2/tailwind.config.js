/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { ink: { 950: '#101820', 900: '#18232d', 700: '#293b48', 600: '#3d5360' }, copper: { 700: '#9a4f32', 600: '#b66a4a' }, clinical: { 700: '#607c75', 600: '#78958c', 100: '#dce7e1' } }, boxShadow: { panel: '0 1px 3px rgba(15, 23, 42, .06)' } } },
  plugins: []
};