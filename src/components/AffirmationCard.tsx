import { Text, View } from 'react-native';

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

export function AffirmationCard({ message }: AffirmationCardProps) {
  const displayMessage = message ?? randomAffirmation;

  return (
    <View className="w-full rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-4">
      <Text className="text-center text-base font-medium text-emerald-800">{displayMessage}</Text>
    </View>
  );
}
