import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { hitSlopFor, Icon, PressableBase, Text, type IconName } from '../ui';

/** Minimum box height: 24pt icon + 4pt gap + a 20pt label line + 2x8pt padding. */
export const CALL_CONTROL_MIN_HEIGHT = 64;

export type CallControlButtonProps = {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** `neutral` for the toggles, `danger` for Leave. */
  tone?: 'neutral' | 'danger';
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * One in-call control: the icon ABOVE its label.
 *
 * A labelled `Button` puts the icon beside the text, so three of them never
 * fit abreast on a phone and the bar grew to three rows — which pushed the
 * video stage below the fold on a 360x640 device. Stacking icon over label
 * makes a control only as wide as its widest word, so all three fit on one row
 * from 360pt, while the box stays well past the 48dp Android target.
 *
 * This lives under `components/live` rather than `components/ui` because it is
 * specific to the call surface; `uiRequests` in the report flags it for the
 * integrator if the pattern turns out to be general.
 */
export function CallControlButton({
  label,
  icon,
  onPress,
  tone = 'neutral',
  accessibilityLabel,
  style,
  testID,
}: CallControlButtonProps) {
  const { colors, tokens } = useOptionalTheme();
  const content = tone === 'danger' ? colors.danger : colors.text;
  const background = tone === 'danger' ? colors.dangerBg : colors.bgSoft;
  const border = tone === 'danger' ? colors.danger : colors.borderStrong;

  return (
    <PressableBase
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlopFor(CALL_CONTROL_MIN_HEIGHT, Platform.OS)}
      android_ripple={{ color: background }}
      // Layout NEVER goes in a style callback — see `ui/PressableBase`.
      style={[
        {
          minHeight: CALL_CONTROL_MIN_HEIGHT,
          paddingHorizontal: 8,
          paddingVertical: 8,
          borderRadius: tokens.radii.md,
          backgroundColor: background,
          borderWidth: 1,
          borderColor: border,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        },
        style,
      ]}
    >
      <Icon name={icon} size={24} color={content} />
      <View style={{ flexShrink: 1 }}>
        <Text role="labelSm" color={content} align="center" numberOfLines={2}>
          {label}
        </Text>
      </View>
    </PressableBase>
  );
}
