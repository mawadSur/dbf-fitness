import { View } from 'react-native';

import type { ChooseCoachErrorCode } from '../../features/coaching/types';
import { Banner, Button, FixedFooter, Heading, Text } from '../ui';
import { chooseCoachErrorMessage, isRetryable } from './confirmFlow';

type Props = {
  coachName: string;
  hasCurrentCoach: boolean;
  saving: boolean;
  errorCode?: ChooseCoachErrorCode;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * "Choose this coach?" as a bottom confirmation.
 *
 * `FixedFooter` keeps it in normal flow at the bottom edge, so it can never float over the tab bar
 * and pays the gesture-bar inset once (design system §6). The two actions stack: at 200% text a
 * side-by-side pair would clip.
 */
export function ConfirmPanel({ coachName, hasCurrentCoach, saving, errorCode, onConfirm, onCancel }: Props) {
  const showConfirm = !errorCode || isRetryable(errorCode);
  return (
    <FixedFooter testID="choose-coach-confirm">
      <View accessibilityViewIsModal style={{ gap: 12 }}>
        <Heading level={3}>{`Choose ${coachName} as your coach?`}</Heading>
        {hasCurrentCoach ? (
          <Text role="bodySm" tone="secondary">
            Switching coaches changes which classes and notes you can access
          </Text>
        ) : null}
        {errorCode ? <Banner tone="danger" title={chooseCoachErrorMessage(errorCode)} /> : null}
        {showConfirm ? (
          <Button
            label={errorCode ? 'Retry' : 'Confirm'}
            onPress={onConfirm}
            disabled={saving}
            loading={saving}
            fullWidth
          />
        ) : null}
        <Button
          label={showConfirm ? 'Cancel' : 'Close'}
          variant="ghost"
          onPress={onCancel}
          disabled={saving}
          fullWidth
        />
      </View>
    </FixedFooter>
  );
}
