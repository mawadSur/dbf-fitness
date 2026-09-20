import Svg, { Circle, Path } from 'react-native-svg';

export type TabIconName = 'home' | 'workout' | 'food' | 'community' | 'profile';

type Props = { name: TabIconName; color: string; size: number };

// Simple 24x24 stroke icons (non-text, so tint only needs 3:1).
export function TabIcon({ name, color, size }: Props) {
  const p = {
    stroke: color,
    strokeWidth: 2,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {name === 'home' && (
        <Path {...p} d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
      )}
      {name === 'workout' && <Path {...p} d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12" />}
      {name === 'food' && <Path {...p} d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M15 21V3c3 1 4 4 4 8h-4" />}
      {name === 'community' && (
        <>
          <Circle {...p} cx={9} cy={8} r={3} />
          <Path
            {...p}
            d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c1.8.8 3 2.6 3 5"
          />
        </>
      )}
      {name === 'profile' && (
        <>
          <Circle {...p} cx={12} cy={8} r={4} />
          <Path {...p} d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </>
      )}
    </Svg>
  );
}
