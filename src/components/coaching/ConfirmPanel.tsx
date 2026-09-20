import { ActivityIndicator, Text, View } from 'react-native';

import type { ChooseCoachErrorCode } from '../../features/coaching/types';
import { chooseCoachErrorMessage, isRetryable } from './confirmFlow';
import { PressableBase } from '../ui/PressableBase';

type Props = {
  coachName: string;
  hasCurrentCoach: boolean;
  saving: boolean;
  errorCode?: ChooseCoachErrorCode;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmPanel({ coachName, hasCurrentCoach, saving, errorCode, onConfirm, onCancel }: Props) {
  const showConfirm = !errorCode || isRetryable(errorCode);
  return (
    <View
      accessibilityViewIsModal
      style={{ backgroundColor: '#F0FDF4', borderTopWidth: 1, borderColor: '#A7F3D0', padding: 16, gap: 10 }}
    >
      <Text style={{ fontSize: 17, fontWeight: '700', color: '#0F172A' }}>{`Choose ${coachName} as your coach?`}</Text>
      {hasCurrentCoach ? (
        <Text style={{ fontSize: 14, color: '#334155' }}>Switching coaches changes which classes and notes you can access</Text>
      ) : null}
      {errorCode ? (
        <Text accessibilityRole="alert" style={{ fontSize: 14, color: '#B91C1C' }}>
          {chooseCoachErrorMessage(errorCode)}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PressableBase
          onPress={onCancel}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          accessibilityState={{ disabled: saving }}
          android_ripple={{ color: '#E2E8F0' }}
          pressFeedback={0.7}
          // Layout NEVER goes in a style callback — see `PressableBase`.
          style={{
            flex: 1,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#94A3B8',
          }}
        >
          <Text style={{ fontWeight: '600', color: '#334155' }}>{showConfirm ? 'Cancel' : 'Close'}</Text>
        </PressableBase>
        {showConfirm ? (
          <PressableBase
            onPress={onConfirm}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={errorCode ? 'Retry' : 'Confirm'}
            accessibilityState={{ disabled: saving, busy: saving }}
            android_ripple={{ color: '#A7F3D0' }}
            pressFeedback={0.85}
            // Layout NEVER goes in a style callback — see `PressableBase`.
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              backgroundColor: saving ? '#6EE7B7' : '#047857',
            }}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontWeight: '600', color: '#FFFFFF' }}>{errorCode ? 'Retry' : 'Confirm'}</Text>}
          </PressableBase>
        ) : null}
      </View>
    </View>
  );
}
