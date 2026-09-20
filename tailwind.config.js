/** @type {import('tailwindcss').Config} */

// Semantic colours come from the CSS variables in global.css (`:root` = light,
// `.dark:root` = dark) so one utility works in both themes; `<alpha-value>` keeps
// `bg-surface/80` style opacity modifiers working. Hex copies for React Native
// style props and SVG live in src/theme/tokens.ts.
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

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
        // Still needed: the screens shipped before the design system use
        // `emerald-600`/`emerald-700` directly, and Tailwind's default
        // emerald-600 (#059669) is only 3.77:1 on white. Remapping it to
        // #047857 (5.48:1) keeps those screens AA-compliant until they are
        // migrated to the semantic tokens below.
        emerald: { 600: '#047857', 700: '#065f46' },

        bg: { DEFAULT: token('bg'), soft: token('bg-soft') },
        surface: { DEFAULT: token('surface'), raised: token('surface-raised') },
        text: {
          DEFAULT: token('text'),
          secondary: token('text-secondary'),
          muted: token('text-muted'),
        },
        brand: token('brand'),
        cta: token('cta'),
        'on-cta': token('on-cta'),
        sage: token('sage'),
        progress: { arc: token('progress-arc'), track: token('progress-track') },
        border: { soft: token('border-soft'), strong: token('border-strong') },
        focus: token('focus'),
        success: { DEFAULT: token('success'), bg: token('success-bg') },
        warning: { DEFAULT: token('warning'), bg: token('warning-bg') },
        danger: { DEFAULT: token('danger'), bg: token('danger-bg') },
        info: { DEFAULT: token('info'), bg: token('info-bg') },
      },
      // React Native has no synthetic bolding: every weight is its own family.
      fontFamily: {
        heading: ['Manrope_800ExtraBold'],
        'heading-bold': ['Manrope_700Bold'],
        body: ['Inter_400Regular'],
        'body-medium': ['Inter_500Medium'],
        'body-semibold': ['Inter_600SemiBold'],
        'body-bold': ['Inter_700Bold'],
      },
      // 4/8 rhythm from the design system (§3). Tailwind's numeric scale stays
      // available; these named steps are the ones the spec talks about.
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '32px',
        '3xl': '48px',
        gutter: '16px',
        'gutter-wide': '24px',
      },
      maxWidth: { content: '640px' },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        pill: '999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(17, 17, 17, 0.05)',
        md: '0 4px 6px rgba(17, 17, 17, 0.05)',
        lg: '0 10px 15px rgba(17, 17, 17, 0.05)',
      },
    },
  },
  plugins: [],
};
