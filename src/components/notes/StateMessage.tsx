import { ActivityIndicator, Text, View } from 'react-native';

import { colors } from '../../theme/tokens';
import { NotesButton } from './NotesButton';

type StateMessageProps = {
  kind: 'loading' | 'error' | 'empty' | 'denied';
  title?: string;
  message?: string;
  onRetry?: () => void;
};

/** One consistent loading / error / empty / permission-denied block for the notes screens. */
export function StateMessage({ kind, title, message, onRetry }: StateMessageProps) {
  if (kind === 'loading') {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={title ?? 'Loading'}
        style={{ padding: 32, alignItems: 'center' }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
      {title ? (
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A', textAlign: 'center' }}>
          {title}
        </Text>
      ) : null}
      {message ? (
        <Text
          accessibilityRole={kind === 'error' ? 'alert' : undefined}
          style={{ fontSize: 14, color: kind === 'error' ? '#B91C1C' : '#475569', textAlign: 'center' }}
        >
          {message}
        </Text>
      ) : null}
      {onRetry ? <NotesButton label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}
