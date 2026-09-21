import type { ReactNode } from 'react';
import { View } from 'react-native';

import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { Banner, Button, Card as UiCard, Eyebrow } from '../ui';

/**
 * Loading / error / card / button blocks shared by the account and coaching screens.
 *
 * Every one of them is now a thin composition over `src/components/ui` — the hand-rolled slate
 * palette these used to carry is gone, so they follow the member's light/dark preference.
 */
export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return <LoadingSkeleton label={label} lines={2} />;
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Banner tone="danger" title={message} icon="alert-triangle" />
      {onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** A titled section card. The title is an eyebrow, so the screen keeps one `h1`. */
export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <UiCard>
      <View style={{ gap: 12 }}>
        {title ? <Eyebrow accessibilityRole="header">{title}</Eyebrow> : null}
        {children}
      </View>
    </UiCard>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  variant = 'solid',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'solid' | 'outline';
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      loading={!!busy}
      disabled={!!disabled}
      variant={variant === 'solid' ? 'primary' : 'secondary'}
      fullWidth
    />
  );
}
