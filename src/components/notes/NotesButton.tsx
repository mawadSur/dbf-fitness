import type { StyleProp, ViewStyle } from 'react-native';

import { Button, type ButtonVariant, type IconName } from '../ui';

type NotesButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  leadingIcon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  /** Full-width by default; the notes screens stack their actions. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The notes screens' action button.
 *
 * Nothing but a name now: the hand-rolled palette, ripple and busy state it used to carry all live
 * in the design system's `Button`, which is themed, keeps a 48pt target and announces
 * `disabled`/`busy` for us.
 */
export function NotesButton({
  label,
  onPress,
  variant = 'primary',
  leadingIcon,
  disabled = false,
  busy = false,
  accessibilityLabel,
  fullWidth = true,
  style,
  testID,
}: NotesButtonProps) {
  return (
    <Button
      label={label}
      onPress={onPress}
      variant={variant}
      leadingIcon={leadingIcon}
      disabled={disabled}
      loading={busy}
      accessibilityLabel={accessibilityLabel}
      fullWidth={fullWidth}
      style={style}
      testID={testID}
    />
  );
}
