import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Text } from '../ui';

const DOT_SIZE = 10;

/**
 * Presence as a dot AND the word, because colour is never the only signal (§9).
 * The dot is decorative: the text next to it is what a screen reader announces.
 */
export function PresenceLabel({ online }: { online: boolean }) {
  const { colors, tokens } = useOptionalTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        testID={online ? 'presence-online' : 'presence-offline'}
        // Decorative: an empty View carries no accessible text, and the word next
        // to it is what a screen reader announces. `accessibilityElementsHidden`
        // is deliberately NOT used — it would also hide the dot from queries, and
        // the state matrix asserts on this testID.
        accessible={false}
        importantForAccessibility="no"
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: tokens.radii.pill,
          backgroundColor: online ? colors.success : colors.textMuted,
        }}
      />
      <Text role="caption" tone={online ? 'success' : 'muted'}>
        {online ? 'Online' : 'Offline'}
      </Text>
    </View>
  );
}
