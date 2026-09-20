import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
});
