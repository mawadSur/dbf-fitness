import { View } from 'react-native';

import { Icon, Text } from './ui';
import { useOptionalTheme } from '../theme/ThemeProvider';

const AFFIRMATIONS = [
  'Every workout is a deposit in your future self.',
  "Consistency beats intensity — you're building something that lasts.",
  'Strong is a feeling you earn one rep at a time.',
  'Showing up today is the hardest part. You did it.',
  'Progress, not perfection — keep going.',
  'Your only competition is who you were yesterday.',
];

const randomAffirmation = AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];

type AffirmationCardProps = {
  message?: string;
};

/**
 * One quiet line of encouragement.
 *
 * It used to be a tinted card the size of the real call to action, which is
 * why Home led with "Progress, not perfection" instead of with the workout.
 * The redesign demotes it to a line: same content, no visual claim on the page.
 * The name and the `message` prop are unchanged so callers are untouched.
 */
export function AffirmationCard({ message }: AffirmationCardProps) {
  const { colors } = useOptionalTheme();
  const displayMessage = message ?? randomAffirmation;

  return (
    <View
      testID="affirmation-line"
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
    >
      <View style={{ paddingTop: 2 }}>
        <Icon name="heart" size={16} color={colors.brand} />
      </View>
      <Text role="bodySm" tone="muted" style={{ flex: 1 }}>
        {displayMessage}
      </Text>
    </View>
  );
}
