import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Banner, Button, Text } from '../ui';

type Props = {
  /** False while the class is not joinable for any reason other than an in-flight join. */
  enabled: boolean;
  joining: boolean;
  /** Set after a failed join attempt — the button becomes "Try again". */
  errorMessage: string | null;
  /** Why the button is off (announced as the button's hint, never colour alone). */
  disabledReason: string | null;
  /** Class-level explanation: ended, cancelled, members-only, signed out. */
  infoMessage: string | null;
  onPress: () => void;
};

/**
 * The join affordance and everything that explains it.
 *
 * A disabled Join says why in its accessibility hint, and the same reason is on
 * screen as a `Banner`, so neither a screen reader nor a sighted member is left
 * with a dead button. A failed attempt is announced (`Banner` is an alert) and
 * turns the action into "Try again" rather than hiding it.
 */
export function ClassJoinPanel({
  enabled,
  joining,
  errorMessage,
  disabledReason,
  infoMessage,
  onPress,
}: Props) {
  const { tokens } = useOptionalTheme();

  return (
    <View testID="class-join-panel" style={{ gap: tokens.space.md }}>
      <Button
        label={joining ? 'Joining…' : errorMessage ? 'Try again' : 'Join class'}
        leadingIcon={errorMessage ? 'refresh' : 'video'}
        onPress={onPress}
        disabled={!enabled && !joining}
        loading={joining}
        accessibilityLabel={errorMessage ? 'Try joining again' : 'Join class'}
        accessibilityHint={disabledReason ?? undefined}
      />

      {infoMessage ? (
        <Banner tone="info" title={infoMessage} testID="class-join-info" />
      ) : null}

      {errorMessage ? (
        <Banner
          tone="danger"
          title="Could not join the class"
          message={errorMessage}
          testID="class-join-error"
        />
      ) : null}

      {joining ? (
        <Text role="caption" tone="muted">
          Connecting you to the class…
        </Text>
      ) : null}
    </View>
  );
}
