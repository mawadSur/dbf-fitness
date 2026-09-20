import { Text, View } from 'react-native';
import { Circle, Svg } from 'react-native-svg';

import { colors } from '../theme/tokens';

type ScoreRingProps = {
  value: number;
  max: number;
  label: string;
};

const SIZE = 120;
const STROKE_WIDTH = 10;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreRing({ value, max, label }: ScoreRingProps) {
  const clampedValue = Math.max(0, Math.min(value, max));
  const progress = max > 0 ? clampedValue / max : 0;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  return (
    <View
      className="items-center gap-2"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label} ${clampedValue} of ${max}`}
      accessibilityValue={{ min: 0, max, now: clampedValue }}
    >
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.primaryMuted}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.primaryStrong}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-2xl font-bold text-slate-900">{clampedValue}</Text>
          <Text className="text-xs text-slate-500">/ {max}</Text>
        </View>
      </View>
      <Text className="text-sm font-medium text-slate-700">{label}</Text>
    </View>
  );
}
