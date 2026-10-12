/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@referendum/ui/preset')],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
