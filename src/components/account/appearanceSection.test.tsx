import { fireEvent, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';

import { renderInTheme, mockWindowDimensions } from '../ui/testing';
import {
  AppearanceSection,
  appearanceCaption,
  PREFERENCE_LABEL,
  shouldStackOptions,
  STACK_FONT_SCALE,
} from './AppearanceSection';

afterEach(() => jest.restoreAllMocks());

describe('appearance copy and layout rules', () => {
  it('stacks the three options only from the large-text threshold up', () => {
    expect(shouldStackOptions(1)).toBe(false);
    expect(shouldStackOptions(1.29)).toBe(false);
    expect(shouldStackOptions(STACK_FONT_SCALE)).toBe(true);
    expect(shouldStackOptions(2)).toBe(true);
  });

  it('says what the choice actually means', () => {
    expect(appearanceCaption('system', 'dark')).toMatch(/Following your device, which is dark/);
    expect(appearanceCaption('system', 'light')).toMatch(/which is light/);
    expect(appearanceCaption('light', 'dark')).toBe('Always light, whatever your device is set to.');
    expect(appearanceCaption('dark', 'light')).toBe('Always dark, whatever your device is set to.');
  });

  it('labels every preference', () => {
    expect(Object.values(PREFERENCE_LABEL)).toEqual(['System', 'Light', 'Dark']);
  });
});

describe('AppearanceSection', () => {
  it('starts on System, marks the selection with state (not colour alone) and switches theme', async () => {
    await renderInTheme(<AppearanceSection />, 'light');

    const system = await screen.findByLabelText('System');
    expect(system.props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Light').props.accessibilityState.selected).toBe(false);
    expect(screen.getByText(/Following your device, which is light/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Dark'));
    expect(screen.getByLabelText('Dark').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('System').props.accessibilityState.selected).toBe(false);
    expect(screen.getByText('Always dark, whatever your device is set to.')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Light'));
    expect(screen.getByLabelText('Light').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('Always light, whatever your device is set to.')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('System'));
    expect(screen.getByLabelText('System').props.accessibilityState.selected).toBe(true);
  });

  it('lays the options out in a row at normal text size', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    await renderInTheme(<AppearanceSection />);
    expect((await screen.findByTestId('appearance-options')).props.style.flexDirection).toBe('row');
  });

  it('stacks the options at 200% text so nothing clips', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    mockWindowDimensions({ width: 360, height: 640, fontScale: 2 });
    await renderInTheme(<AppearanceSection />);
    expect((await screen.findByTestId('appearance-options')).props.style.flexDirection).toBe('column');
    expect(screen.getByTestId('appearance-dark')).toBeTruthy();
  });
});
