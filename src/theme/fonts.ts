import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';

/**
 * The only font files the app ships: Manrope 700/800 for headings, Inter
 * 400/500/600/700 for body (design system §2). They are imported one weight at a
 * time — importing the package root would bundle every weight and italic.
 *
 * The keys are the family names used by `tokens.fontFamily` and therefore by the
 * Tailwind `font-*` utilities; `src/theme/tokens.test.ts` keeps the two in step.
 */
export const brandFonts = {
  Manrope_700Bold,
  Manrope_800ExtraBold,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} as const;

export type BrandFontName = keyof typeof brandFonts;

/** Fonts must never hold the splash for long: fall through to system fonts. */
export const FONT_LOAD_TIMEOUT_MS = 4000;
