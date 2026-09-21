import { View } from 'react-native';

import { Banner, type BannerTone } from '../ui';

export type AuthAlertProps = {
  title: string;
  message?: string;
  tone?: BannerTone;
  onDismiss?: () => void;
  dismissAccessibilityLabel?: string;
  testID?: string;
};

/**
 * A `Banner` inside a polite live region.
 *
 * `Banner` announces itself with `accessibilityRole="alert"`, which TalkBack
 * reads on focus but not when the node simply appears; the wrapper adds
 * `accessibilityLiveRegion` so a submit failure is spoken the moment it renders
 * without moving focus off the field the person was in.
 * (uiRequests: fold this into `Banner` itself.)
 */
export function AuthAlert({
  title,
  message,
  tone = 'danger',
  onDismiss,
  dismissAccessibilityLabel,
  testID,
}: AuthAlertProps) {
  return (
    <View testID={testID ? `${testID}-live` : 'auth-alert-live'} accessibilityLiveRegion="polite">
      <Banner
        title={title}
        message={message}
        tone={tone}
        onDismiss={onDismiss}
        dismissAccessibilityLabel={dismissAccessibilityLabel}
        testID={testID}
      />
    </View>
  );
}
