import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, PixelRatio, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MILESTONE_TOAST_SKINS, milestoneAnnouncement } from '../features/milestones/toastCopy';
import { milestoneTiers, type MilestoneTier } from '../theme/tokens';
import { MilestoneToast } from './MilestoneToast';

function withInsets(ui: React.ReactElement, top = 47) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top, left: 0, right: 0, bottom: 34 },
      }}
    >
      {ui}
    </SafeAreaProvider>
  );
}

describe('MilestoneToast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sits below the top inset (notch) and announces itself', async () => {
    await render(
      withInsets(<MilestoneToast tier="sevenDayStreak" visible onDismiss={jest.fn()} />, 59)
    );
    // The container is intentionally not `accessible` so the Dismiss button stays reachable.
    let toast = screen.getByText('Milestone unlocked').parent;
    while (toast && toast.props.accessibilityRole !== 'alert') toast = toast.parent;
    if (!toast) throw new Error('alert container not found');
    expect(StyleSheet.flatten(toast.props.style).top).toBe(59 + 8);
    expect(toast.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText('7-Day Streak')).toBeTruthy();
  });

  it('dismiss control is a labelled button and auto-dismisses after 4s', async () => {
    const onDismiss = jest.fn();
    await render(withInsets(<MilestoneToast tier="firstDay" visible onDismiss={onDismiss} />));
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(3999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders nothing and never auto-dismisses when hidden', async () => {
    const onDismiss = jest.fn();
    await render(
      withInsets(<MilestoneToast tier="firstDay" visible={false} onDismiss={onDismiss} />)
    );
    expect(screen.queryByText('Milestone unlocked')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('tapping dismiss calls back once', async () => {
    const onDismiss = jest.fn();
    await render(withInsets(<MilestoneToast tier="firstDay" visible onDismiss={onDismiss} />));
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // Each tier is told apart by medallion + icon + words, never by hue alone.
  const tiers: MilestoneTier[] = ['firstDay', 'sevenDayStreak', 'thirtyDayStreak'];
  it.each(tiers)('gives %s its own medallion, sentence and announcement', async (tier) => {
    await render(withInsets(<MilestoneToast tier={tier} visible onDismiss={jest.fn()} />));
    const skin = MILESTONE_TOAST_SKINS[tier];
    expect(screen.getByTestId(`milestone-badge-${tier}`)).toBeTruthy();
    expect(screen.getByText(milestoneTiers[tier].label)).toBeTruthy();
    expect(screen.getByText(skin.caption)).toBeTruthy();
    expect(screen.getByText(skin.message)).toBeTruthy();

    let toast = screen.getByText('Milestone unlocked').parent;
    while (toast && toast.props.accessibilityRole !== 'alert') toast = toast.parent;
    expect(toast?.props.accessibilityLabel).toBe(milestoneAnnouncement(tier));
  });

  it('the three tiers never share a medallion tone, icon or sentence', () => {
    const skins = tiers.map((tier) => MILESTONE_TOAST_SKINS[tier]);
    for (const key of ['tone', 'icon', 'message', 'caption'] as const) {
      expect(new Set(skins.map((skin) => skin[key])).size).toBe(3);
    }
  });

  it('with reduced motion on it appears at once instead of animating', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    await act(async () => {
      await render(withInsets(<MilestoneToast tier="thirtyDayStreak" visible onDismiss={jest.fn()} />));
    });
    expect(timing).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('stacks the medallion above the copy at 130% text', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.3);
    await render(withInsets(<MilestoneToast tier="firstDay" visible onDismiss={jest.fn()} />));
    let toast = screen.getByText('Milestone unlocked').parent;
    while (toast && toast.props.accessibilityRole !== 'alert') toast = toast.parent;
    expect(StyleSheet.flatten(toast?.props.style).flexDirection).toBe('column');
    jest.restoreAllMocks();
  });
});
