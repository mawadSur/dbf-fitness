import { render, screen } from '@testing-library/react-native';
import * as RN from 'react-native';
import { PixelRatio, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenShellContext } from '../ui';
import { CallControlsBar } from './CallControlsBar';

const FRAME = { x: 0, y: 0, width: 390, height: 844 };
const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };

/** The bar always lives inside the tab shell, so the tests put it there too. */
async function renderBar(props: Partial<Parameters<typeof CallControlsBar>[0]> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: FRAME, insets: INSETS }}>
      <ScreenShellContext.Provider value={{ topInsetApplied: true, insideTabShell: true }}>
        <CallControlsBar
          muted={false}
          cameraOff={false}
          onToggleMute={() => {}}
          onToggleCamera={() => {}}
          onLeave={() => {}}
          {...props}
        />
      </ScreenShellContext.Provider>
    </SafeAreaProvider>,
  );
}

describe('CallControlsBar', () => {
  it('offers all three controls with labels, not icons alone', async () => {
    await renderBar();
    expect(screen.getByText('Mute')).toBeTruthy();
    expect(screen.getByText('Camera off')).toBeTruthy();
    expect(screen.getByText('Leave')).toBeTruthy();
    expect(screen.getByLabelText('Mute my microphone')).toBeTruthy();
    expect(screen.getByLabelText('Turn my camera off')).toBeTruthy();
    expect(screen.getByLabelText('Leave the class')).toBeTruthy();
  });

  it('states a toggled control in its words and its icon, never by colour alone', async () => {
    await renderBar({ muted: true, cameraOff: true });
    expect(screen.getByText('Unmute')).toBeTruthy();
    expect(screen.getByText('Camera on')).toBeTruthy();
    expect(screen.getByLabelText('Unmute my microphone')).toBeTruthy();
    // Icons are decorative (hidden from screen readers), so ask for them explicitly.
    expect(screen.getByTestId('icon-mic-off', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('icon-camera-off', { includeHiddenElements: true })).toBeTruthy();
  });

  it('every control clears the 44pt minimum', async () => {
    await renderBar();
    for (const label of ['Mute my microphone', 'Turn my camera off', 'Leave the class']) {
      const box = StyleSheet.flatten(screen.getByLabelText(label).props.style) as {
        minHeight?: number;
      };
      expect(box.minHeight ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  it('pairs the two toggles in a row at normal text size', async () => {
    const scale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    try {
      await renderBar();
      const row = StyleSheet.flatten(screen.getByTestId('call-controls-row').props.style) as {
        flexDirection?: string;
      };
      expect(row.flexDirection).toBe('row');
    } finally {
      scale.mockRestore();
    }
  });

  it('keeps Leave out of the toggle row and full width, so no label has to wrap', async () => {
    // Three labelled controls abreast wrapped "Camera off" mid-word on a 390pt
    // phone; Leave owns the row below, where the destructive action is also
    // harder to hit by accident.
    await renderBar();
    const leave = screen.getByTestId('call-controls-leave');
    expect(leave).toBeTruthy();
    const row = screen.getByTestId('call-controls-row');
    const inRow = (node: unknown): boolean => {
      let current = (node as { parent?: unknown }).parent as { parent?: unknown } | undefined;
      while (current) {
        if (current === row) return true;
        current = current.parent as { parent?: unknown } | undefined;
      }
      return false;
    };
    expect(inRow(leave)).toBe(false);
    expect(inRow(screen.getByLabelText('Mute my microphone'))).toBe(true);
    expect(inRow(screen.getByLabelText('Turn my camera off'))).toBe(true);
  });

  it('stacks the toggles on a 360pt phone, where "Camera off" would wrap mid-word', async () => {
    const dims = jest
      .spyOn(RN, 'useWindowDimensions')
      .mockReturnValue({ width: 360, height: 640, scale: 2, fontScale: 1 });
    try {
      await renderBar();
      const row = StyleSheet.flatten(screen.getByTestId('call-controls-row').props.style) as {
        flexDirection?: string;
      };
      expect(row.flexDirection).toBe('column');
    } finally {
      dims.mockRestore();
    }
  });

  it('stacks the toggles at 130% text so they cannot squash on a 360pt row', async () => {
    const scale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.3);
    try {
      await renderBar();
      const row = StyleSheet.flatten(screen.getByTestId('call-controls-row').props.style) as {
        flexDirection?: string;
      };
      expect(row.flexDirection).toBe('column');
      expect(screen.getByText('Leave')).toBeTruthy();
    } finally {
      scale.mockRestore();
    }
  });

  it('adds no bottom safe-area inset inside the tab shell (the tab bar already pays it)', async () => {
    await renderBar();
    const flat = StyleSheet.flatten(screen.getByTestId('call-controls').props.style) as {
      paddingBottom?: number;
    };
    // The 34pt home-indicator inset is NOT added on top of the footer's own padding.
    expect(flat.paddingBottom ?? 0).toBeLessThan(34);
  });
});
