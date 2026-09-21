import { screen, within } from '@testing-library/react-native';

import type { Coach } from '../../features/coaching/types';
import type { ThemeName } from '../../theme/tokens';
import { BOTH_THEMES, colorsFor, flattenStyle, INCLUDING_HIDDEN, renderInTheme } from '../ui/testing';
import { CoachCard } from './CoachCard';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const DANA: Coach = {
  coachId: 'c1',
  fullName: 'Coach Dana Reyes',
  bio: 'Strength and conditioning.',
  specialties: ['Strength'],
  acceptingMembers: true,
  memberCount: 4,
};

function renderCard(isCurrent: boolean, scheme: ThemeName = 'light') {
  return renderInTheme(
    <CoachCard coach={DANA} currentCoachId={isCurrent ? DANA.coachId : null} onSelect={() => {}} />,
    scheme,
  );
}

function badgeBackground(testID: string): unknown {
  return flattenStyle(screen.getByTestId(testID, INCLUDING_HIDDEN).props.style).backgroundColor;
}

/**
 * The "Your coach" chip shipped as the `info` tone: blue text on a blue wash — the only
 * blue anywhere in a deep-emerald brand — sitting on the same row as a green
 * "Accepting members" pill. Two unrelated hues read as two unrelated kinds of fact.
 * This pins the chip to the palette so it cannot drift back off-brand.
 */
describe('CoachCard — "Your coach" stays on the DBF palette', () => {
  it.each(BOTH_THEMES)('uses the emerald success pair in %s, never the blue info pair', async (scheme) => {
    await renderCard(true, scheme);
    const palette = colorsFor(scheme);
    expect(badgeBackground('coach-current-badge')).toBe(palette.successBg);
    expect(badgeBackground('coach-current-badge')).not.toBe(palette.infoBg);
  });

  it('leads with "Your coach" and demotes the accepting pill once they are yours', async () => {
    await renderCard(true);
    expect(screen.getByText('Your coach')).toBeTruthy();
    expect(screen.getByText('Accepting members')).toBeTruthy();
    // Two success-green pills abreast would read as two equal facts, so the
    // availability pill goes neutral for the coach you already have.
    expect(badgeBackground('coach-current-badge')).toBe(colorsFor('light').successBg);
  });

  it('shows no current-coach chip at all for a coach who is not yours', async () => {
    await renderCard(false);
    expect(screen.queryByTestId('coach-current-badge', INCLUDING_HIDDEN)).toBeNull();
    expect(screen.getByText('Accepting members')).toBeTruthy();
  });

  it('never states the fact by colour alone — the icon and the word are both there', async () => {
    await renderCard(true);
    const badge = screen.getByTestId('coach-current-badge', INCLUDING_HIDDEN);
    expect(screen.getByLabelText('Your coach')).toBeTruthy();
    // The check mark lives INSIDE the chip: the fact is never colour alone.
    expect(within(badge).getByTestId('icon-check-circle', INCLUDING_HIDDEN)).toBeTruthy();
  });
});
