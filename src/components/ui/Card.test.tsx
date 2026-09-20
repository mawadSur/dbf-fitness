import { fireEvent, screen } from '@testing-library/react-native';

import { tokens } from '../../theme/tokens';
import { Card } from './Card';
import { colorsFor, mockReducedMotion, pressableStyle, pressIn, renderInTheme } from './testing';
import { Text } from './Typography';

describe('Card', () => {
  it('is a plain surface with radius 12 and a soft border', async () => {
    await renderInTheme(
      <Card testID="c">
        <Text>Body</Text>
      </Card>,
      'light',
    );
    const style = pressableStyle(screen.getByTestId('c'));
    const colors = colorsFor('light');
    expect(style.backgroundColor).toBe(colors.surface);
    expect(style.borderRadius).toBe(tokens.radii.lg);
    expect(style.borderWidth).toBe(1);
    expect(style.borderColor).toBe(colors.borderSoft);
    expect(style.padding).toBe(16);
  });

  it('accepts the roomy 24 padding', async () => {
    await renderInTheme(
      <Card testID="c" padding={24}>
        <Text>Body</Text>
      </Card>,
    );
    expect(pressableStyle(screen.getByTestId('c')).padding).toBe(24);
  });

  it('switches surface for the raised and soft tones', async () => {
    await renderInTheme(
      <Card testID="c" tone="raised">
        <Text>Body</Text>
      </Card>,
      'light',
    );
    expect(pressableStyle(screen.getByTestId('c')).backgroundColor).toBe(colorsFor('light').surfaceRaised);
  });

  it('uses the tinted section background for the soft tone', async () => {
    await renderInTheme(
      <Card testID="c" tone="soft">
        <Text>Body</Text>
      </Card>,
      'light',
    );
    expect(pressableStyle(screen.getByTestId('c')).backgroundColor).toBe(colorsFor('light').bgSoft);
  });

  it('takes its surface and border from the dark theme', async () => {
    await renderInTheme(
      <Card testID="c">
        <Text>Body</Text>
      </Card>,
      'dark',
    );
    const style = pressableStyle(screen.getByTestId('c'));
    expect(style.backgroundColor).toBe(colorsFor('dark').surface);
    expect(style.borderColor).toBe(colorsFor('dark').borderSoft);
  });

  it('drops the shadow in dark mode and separates with the border instead', async () => {
    await renderInTheme(
      <Card testID="c">
        <Text>Body</Text>
      </Card>,
      'dark',
    );
    const style = pressableStyle(screen.getByTestId('c'));
    expect(style.shadowOpacity).toBeUndefined();
    expect(style.elevation).toBeUndefined();
    expect(style.borderWidth).toBe(1);
  });

  it('carries the sm shadow in light mode', async () => {
    await renderInTheme(
      <Card testID="c">
        <Text>Body</Text>
      </Card>,
      'light',
    );
    expect(pressableStyle(screen.getByTestId('c')).elevation).toBe(tokens.shadows.sm.elevation);
  });

  it('exposes no button role when it is not pressable', async () => {
    await renderInTheme(
      <Card testID="c">
        <Text>Body</Text>
      </Card>,
    );
    expect(screen.getByTestId('c').props.accessibilityRole).toBeUndefined();
  });

  it('becomes one labelled button when given onPress', async () => {
    const onPress = jest.fn();
    await renderInTheme(
      <Card testID="c" onPress={onPress} accessibilityLabel="Open today's workout">
        <Text>Body</Text>
      </Card>,
    );
    const card = screen.getByTestId('c');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe("Open today's workout");
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('gives a pressable card a 44pt minimum target', async () => {
    await renderInTheme(
      <Card testID="c" onPress={() => undefined} accessibilityLabel="Open">
        <Text>Body</Text>
      </Card>,
    );
    expect(pressableStyle(screen.getByTestId('c')).minHeight as number).toBeGreaterThanOrEqual(44);
  });

  it('dims and shrinks a pressable card on press', async () => {
    await renderInTheme(
      <Card testID="c" onPress={() => undefined} accessibilityLabel="Open">
        <Text>Body</Text>
      </Card>,
    );
    await pressIn(screen.getByTestId('c'));
    expect(pressableStyle(screen.getByTestId('c')).transform).toEqual([{ scale: 0.98 }]);
  });

  it('stops scaling under reduced motion', async () => {
    mockReducedMotion(true);
    await renderInTheme(
      <Card testID="c" onPress={() => undefined} accessibilityLabel="Open">
        <Text>Body</Text>
      </Card>,
    );
    await pressIn(screen.getByTestId('c'));
    expect(pressableStyle(screen.getByTestId('c')).transform).toEqual([{ scale: 1 }]);
  });
});
