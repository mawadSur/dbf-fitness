import { screen } from '@testing-library/react-native';

import type { ThemeName } from '../../theme/tokens';
import {
  MilestoneBadge,
  MILESTONE_MEDALLION_SIZE,
  MILESTONE_TONES,
  type MilestoneTone,
} from './MilestoneBadge';
import { BOTH_THEMES, colorsFor, flattenStyle, INCLUDING_HIDDEN, renderInTheme } from './testing';

const TONES = Object.keys(MILESTONE_TONES) as MilestoneTone[];
const TONE_CASES: [MilestoneTone, ThemeName][] = TONES.flatMap((tone) =>
  BOTH_THEMES.map((scheme): [MilestoneTone, ThemeName] => [tone, scheme]),
);

describe('MilestoneBadge', () => {
  it('reads as one image whose name includes the title, caption and state', async () => {
    await renderInTheme(<MilestoneBadge title="7-day streak" caption="One week" />);
    const badge = screen.getByTestId('milestone-badge');
    expect(badge.props.accessibilityRole).toBe('image');
    expect(badge.props.accessibilityLabel).toBe('7-day streak, One week, earned');
  });

  it('drops the caption from the name when there is none', async () => {
    await renderInTheme(<MilestoneBadge title="First day" />);
    expect(screen.getByTestId('milestone-badge').props.accessibilityLabel).toBe('First day, earned');
  });

  it('says "locked" and shows a padlock when the milestone is not earned', async () => {
    await renderInTheme(<MilestoneBadge title="30-day streak" earned={false} />);
    const badge = screen.getByTestId('milestone-badge');
    expect(badge.props.accessibilityLabel).toBe('30-day streak, locked');
    expect(badge.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('icon-lock', INCLUDING_HIDDEN)).toBeTruthy();
    expect(flattenStyle(badge.props.style).opacity).toBe(0.6);
  });

  it('shows the earned icon rather than the padlock', async () => {
    await renderInTheme(<MilestoneBadge title="First day" icon="flame" />);
    expect(screen.getByTestId('icon-flame', INCLUDING_HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('icon-lock', INCLUDING_HIDDEN)).toBeNull();
  });

  it('defaults to the trophy', async () => {
    await renderInTheme(<MilestoneBadge title="Champion" />);
    expect(screen.getByTestId('icon-trophy', INCLUDING_HIDDEN)).toBeTruthy();
  });

  it.each(TONE_CASES)('gives the %s tier its own hue in %s', async (tone, scheme) => {
    await renderInTheme(<MilestoneBadge title={tone} tone={tone} />, scheme);
    expect(flattenStyle(screen.getByText(tone).props.style).color).toBe(
      colorsFor(scheme)[MILESTONE_TONES[tone].fg],
    );
  });

  it('keeps distinct tone pairs, so tiers never collapse into one colour', () => {
    const keys = TONES.map((tone) => MILESTONE_TONES[tone].fg);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('draws a 56pt medallion', async () => {
    await renderInTheme(<MilestoneBadge title="First day" />);
    const medallion = screen.getByTestId('icon-trophy', INCLUDING_HIDDEN).parent;
    expect(flattenStyle(medallion?.props.style).width).toBe(MILESTONE_MEDALLION_SIZE);
  });

  it('wraps long titles and captions on two lines', async () => {
    await renderInTheme(
      <MilestoneBadge title="Thirty consecutive training days" caption="A whole month of showing up" />,
    );
    expect(screen.getByText('Thirty consecutive training days').props.numberOfLines).toBe(2);
    expect(screen.getByText('A whole month of showing up').props.numberOfLines).toBe(2);
  });
});
