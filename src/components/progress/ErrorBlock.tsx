import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';

export type ErrorBlockProps = {
  /** Already run through `friendlyError` — never raw server text. */
  message: string;
  onRetry: () => void;
  retryLabel?: string;
  testID?: string;
};

/**
 * The one failure treatment on the progress screens: an alert `Banner` (icon +
 * words, never colour alone) with a real retry next to it.
 *
 * `Banner` deliberately has no action slot, so the button lives here rather than
 * being added to the shared primitive.
 */
export function ErrorBlock({ message, onRetry, retryLabel = 'Try again', testID }: ErrorBlockProps) {
  const { tokens } = useOptionalTheme();

  return (
    <View testID={testID ?? 'error-block'} style={{ gap: tokens.space.md }}>
      <Banner tone="danger" title={message} />
      <Button label={retryLabel} onPress={onRetry} variant="secondary" leadingIcon="refresh" />
    </View>
  );
}
