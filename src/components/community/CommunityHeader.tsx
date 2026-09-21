import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { friendlyErrorMessage } from '../friendlyError';
import { Banner, Button, Card, Heading, Icon, Skeleton, Text } from '../ui';
import { NoticeBanner, type Notice } from './NoticeBanner';
import { useDelayedVisible } from '../ui/useDelayedVisible';

type CommunityHeaderProps = {
  notice: Notice | null;
  onDismissNotice: () => void;
  onOpenLiveClasses: () => void;
  isLoading: boolean;
  loadError: unknown;
  onRetry: () => void;
};

/** Three stacked placeholders: the same shape the loaded list has, so nothing jumps. */
function ListSkeleton() {
  const { colors, tokens } = useOptionalTheme();
  return (
    <View testID="community-skeleton" style={{ gap: tokens.space.md }}>
      {[0, 1, 2].map((row) => (
        <View
          key={row}
          style={{
            gap: tokens.space.sm,
            padding: tokens.space.lg,
            borderRadius: tokens.radii.lg,
            borderWidth: 1,
            borderColor: colors.borderSoft,
          }}
        >
          <Skeleton width="55%" height={20} />
          <Skeleton width="80%" height={14} />
        </View>
      ))}
    </View>
  );
}

/** Everything above the community list: the intro, the live-classes door, and the load states. */
export function CommunityHeader({
  notice,
  onDismissNotice,
  onOpenLiveClasses,
  isLoading,
  loadError,
  onRetry,
}: CommunityHeaderProps) {
  const { colors, tokens } = useOptionalTheme();
  const showSkeleton = useDelayedVisible(isLoading);

  return (
    <View style={{ gap: tokens.space.lg, paddingBottom: tokens.space.sm }}>
      <Text role="bodyLg" tone="muted">
        The people you train with.
      </Text>

      <Card
        testID="live-classes-link"
        tone="soft"
        onPress={onOpenLiveClasses}
        accessibilityLabel="Live classes"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.md }}>
          <Icon name="video" size={24} color={colors.brand} />
          <View style={{ flex: 1, gap: 2 }}>
            <Heading level={3}>Live classes</Heading>
            <Text role="bodySm" tone="muted">
              Train with your coach in real time.
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={colors.textMuted} />
        </View>
      </Card>

      {notice ? <NoticeBanner notice={notice} onDismiss={onDismissNotice} /> : null}

      {isLoading && showSkeleton ? <ListSkeleton /> : null}

      {loadError ? (
        <View style={{ gap: tokens.space.md }}>
          <Banner
            tone="danger"
            title="Community did not load"
            message={friendlyErrorMessage(loadError, 'Could not load your community.')}
          />
          <Button label="Try again" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}
