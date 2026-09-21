import { PixelRatio, View } from 'react-native';

import { THEME_PREFERENCES, useTheme, type ThemePreference } from '../../theme/ThemeProvider';
import { Card, Chip, SectionHeader, Text } from '../ui';

/**
 * Above this OS font scale a row of three controls no longer fits side by side on a 360dp phone,
 * so the group stacks instead of letting the labels clip (design system §9).
 */
export const STACK_FONT_SCALE = 1.3;

export function shouldStackOptions(fontScale: number): boolean {
  return fontScale >= STACK_FONT_SCALE;
}

export const PREFERENCE_LABEL: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/** What the caption under the control says about the choice in force. */
export function appearanceCaption(preference: ThemePreference, scheme: 'light' | 'dark'): string {
  if (preference === 'system') {
    return `Following your device, which is ${scheme} right now.`;
  }
  return `Always ${preference}, whatever your device is set to.`;
}

/**
 * The Profile tab's theme switch: System / Light / Dark.
 *
 * Built from ui `Chip`s, so the selected option carries a CHECK ICON as well as the brand fill —
 * the choice is never signalled by colour alone (design system §9). `setPreference` is the
 * ThemeProvider's, so the whole app flips immediately and the choice is persisted there.
 */
export function AppearanceSection() {
  const { preference, setPreference, scheme } = useTheme();
  const stacked = shouldStackOptions(PixelRatio.getFontScale());

  return (
    <Card>
      <View style={{ gap: 12 }}>
        <SectionHeader
          eyebrow="Appearance"
          title="Theme"
          subtitle="Choose how DBF looks on this device."
        />
        <View
          testID="appearance-options"
          style={{
            flexDirection: stacked ? 'column' : 'row',
            flexWrap: stacked ? 'nowrap' : 'wrap',
            gap: 8,
          }}
        >
          {THEME_PREFERENCES.map((option) => (
            <Chip
              key={option}
              testID={`appearance-${option}`}
              label={PREFERENCE_LABEL[option]}
              selected={preference === option}
              onPress={() => setPreference(option)}
              style={stacked ? { alignSelf: 'stretch' } : undefined}
            />
          ))}
        </View>
        <Text role="caption" tone="muted">
          {appearanceCaption(preference, scheme)}
        </Text>
      </View>
    </Card>
  );
}
