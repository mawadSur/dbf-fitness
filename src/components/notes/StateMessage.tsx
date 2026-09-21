import { View } from 'react-native';

import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { Banner, Button, EmptyState } from '../ui';

type StateMessageProps = {
  kind: 'loading' | 'error' | 'empty' | 'denied';
  title?: string;
  message?: string;
  onRetry?: () => void;
};

/**
 * One loading / error / empty / permission-denied block for the notes screens.
 *
 * Loading is a skeleton in the shape of the list that is coming, never a bare full-screen spinner
 * (design system §5). Errors are an alert-role `Banner` with a retry that names the action; empty
 * and denied are an `EmptyState` so the member always sees a next step.
 */
export function StateMessage({ kind, title, message, onRetry }: StateMessageProps) {
  if (kind === 'loading') {
    return (
      <View style={{ padding: 16 }}>
        <LoadingSkeleton label={title ?? 'Loading'} lines={4} />
      </View>
    );
  }

  if (kind === 'error') {
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <Banner tone="danger" title={title ?? 'Something went wrong'} message={message} />
        {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} fullWidth /> : null}
      </View>
    );
  }

  return (
    <View style={{ padding: 16 }}>
      <EmptyState
        icon={kind === 'denied' ? 'lock' : 'file-text'}
        title={title ?? (kind === 'denied' ? 'Not available' : 'Nothing here yet')}
        message={message}
        actionLabel={onRetry ? 'Try again' : undefined}
        onAction={onRetry}
      />
    </View>
  );
}
