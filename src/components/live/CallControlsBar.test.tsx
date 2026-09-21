import { render, screen } from '@testing-library/react-native';
import { PixelRatio, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenShellContext } from '../ui';
import { mockWindowDimensions } from '../ui/testing';
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

/** True when `node` sits anywhere under the single control row. */
function inRow(node: unknown, row: unknown): boolean {
  let current = (node as { parent?: unknown }).parent as { parent?: unknown } | undefined;
  while (current) {
    if (current === row) return true;
    current = current.parent as { parent?: unknown } | undefined;
  }
  return false;
}

describe('CallControlsBar', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('every control clears the 48dp Android minimum', async () => {
    await renderBar();
    for (const label of ['Mute my microphone', 'Turn my camera off', 'Leave the class']) {
      const box = StyleSheet.flatten(screen.getByLabelText(label).props.style) as {
        minHeight?: number;
      };
      expect(box.minHeight ?? 0).toBeGreaterThanOrEqual(48);
    }
  });

  it('puts all three controls on ONE row at normal text, so the video stage stays above the fold', async () => {
    const scale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    try {
      await renderBar();
      const row = screen.getByTestId('call-controls-row');
      expect(
        (StyleSheet.flatten(row.props.style) as { flexDirection?: string }).flexDirection,
      ).toBe('row');
      expect(inRow(screen.getByLabelText('Mute my microphone'), row)).toBe(true);
      expect(inRow(screen.getByLabelText('Turn my camera off'), row)).toBe(true);
      expect(inRow(screen.getByLabelText('Leave the class'), row)).toBe(true);
    } finally {
      scale.mockRestore();
    }
  });

  it('keeps one row on a 360pt phone — the size that used to need three', async () => {
    mockWindowDimensions({ width: 360, height: 640 });
    const scale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    try {
      await renderBar();
      const row = screen.getByTestId('call-controls-row');
      expect(
        (StyleSheet.flatten(row.props.style) as { flexDirection?: string }).flexDirection,
      ).toBe('row');
      expect(inRow(screen.getByLabelText('Leave the class'), row)).toBe(true);
    } finally {
      scale.mockRestore();
    }
  });

  it('drops Leave to a second row at 200% text, and never past two rows', async () => {
    mockWindowDimensions({ width: 360, height: 640, fontScale: 2 });
    const font = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    try {
      await renderBar();
      const row = screen.getByTestId('call-controls-row');
      // The two toggles still share a row: only Leave moves down.
      expect(
        (StyleSheet.flatten(row.props.style) as { flexDirection?: string }).flexDirection,
      ).toBe('row');
      expect(inRow(screen.getByLabelText('Mute my microphone'), row)).toBe(true);
      expect(inRow(screen.getByLabelText('Turn my camera off'), row)).toBe(true);
      expect(inRow(screen.getByLabelText('Leave the class'), row)).toBe(false);
      // And the label is allowed to wrap rather than be clipped.
      expect(screen.getByText('Camera off').props.numberOfLines).toBe(2);
    } finally {
      font.mockRestore();
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
