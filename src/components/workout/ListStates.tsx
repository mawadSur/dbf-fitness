import { View } from 'react-native';

import { Banner, Button, Card, Skeleton } from '../ui';

/** Reserves the height of `count` cards so nothing jumps when data lands. */
export function CardListSkeleton({
  count = 3,
  visible = true,
  testID = 'list-skeleton',
}: {
  count?: number;
  /** False during the first 300 ms: same height, nothing drawn yet. */
  visible?: boolean;
  testID?: string;
}) {
  return (
    <View
      style={{ gap: 12 }}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <View style={{ gap: 8 }}>
            {visible ? (
              <>
                <Skeleton width={72} height={12} />
                <Skeleton width="65%" height={20} />
                <Skeleton width="35%" height={14} />
              </>
            ) : (
              <>
                <View style={{ height: 12 }} />
                <View style={{ height: 20 }} />
                <View style={{ height: 14 }} />
              </>
            )}
          </View>
        </Card>
      ))}
    </View>
  );
}

/** An error that is never a dead end: it says what happened and offers a retry. */
export function RetryState({
  title,
  message,
  onRetry,
  busy = false,
  testID = 'retry-state',
}: {
  title: string;
  message?: string;
  onRetry: () => void;
  busy?: boolean;
  testID?: string;
}) {
  return (
    <View style={{ gap: 12 }} testID={testID}>
      <Banner tone="danger" title={title} message={message} />
      <Button
        label="Try again"
        variant="secondary"
        onPress={onRetry}
        loading={busy}
        testID={`${testID}-retry`}
      />
    </View>
  );
}
