import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Button } from './Button';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Heading, Text } from './Typography';

export type EmptyStateProps = {
  title: string;
  message?: string;
  icon?: IconName;
  /** One primary action at most (design system §5). */
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Icon + h3 + body + one primary action (design system §5). */
export function EmptyState({
  title,
  message,
  icon = 'info',
  actionLabel,
  onAction,
  style,
  testID,
}: EmptyStateProps) {
  const { colors, tokens } = useOptionalTheme();

  return (
    <View
      testID={testID ?? 'empty-state'}
      style={[
        {
          alignItems: 'center',
          gap: tokens.space.md,
          paddingVertical: tokens.space['2xl'],
          paddingHorizontal: tokens.space.lg,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 56,
          height: 56,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: tokens.radii.pill,
          backgroundColor: colors.bgSoft,
        }}
      >
        <Icon name={icon} size={28} color={colors.brand} />
      </View>
      <Heading level={3} align="center">
        {title}
      </Heading>
      {message ? (
        <Text role="body" tone="muted" align="center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="primary" size="md" />
      ) : null}
    </View>
  );
}
