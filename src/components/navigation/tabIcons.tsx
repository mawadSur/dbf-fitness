import { Icon } from '../ui/Icon';
import { nearestIconSize, type IconName } from '../ui/icons';

/**
 * The five bottom-nav destinations (design system §6). Kept as its own union so
 * a typo in `app/(tabs)/_layout.tsx` is a type error, and kept EXPORTED under
 * the original name so every existing importer keeps working.
 */
export type TabIconName = 'home' | 'workout' | 'food' | 'community' | 'profile';

/** Tab names happen to match icon names one-to-one; the map makes that explicit. */
const TAB_ICON: Record<TabIconName, IconName> = {
  home: 'home',
  workout: 'workout',
  food: 'food',
  community: 'community',
  profile: 'profile',
};

type Props = { name: TabIconName; color: string; size: number };

/**
 * Thin adapter over the shared `Icon` primitive.
 *
 * The hand-rolled SVG paths that used to live here moved into
 * `src/components/ui/icons.ts`, so the tab bar and the rest of the app now draw
 * from exactly one icon set (design system §4). Tab icons are decorative: the
 * tab button itself carries the accessible name.
 */
export function TabIcon({ name, color, size }: Props) {
  return <Icon name={TAB_ICON[name]} size={nearestIconSize(size)} color={color} />;
}
