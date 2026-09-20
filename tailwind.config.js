/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 'class' (not the default 'media') so react-native-css-interop's internal
  // colorScheme.set() doesn't throw "Cannot manually set color scheme" on
  // web — see https://github.com/nativewind/nativewind/issues/1489.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Global AA fix: default emerald-600 (#059669) is only 3.77:1 on white; #047857 is 5.48:1,
        // so green text/buttons using the primary shade pass WCAG AA for body text.
        emerald: { 600: '#047857', 700: '#065f46' },
      },
    },
  },
  plugins: [],
};
