import { render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { svgAccessibilityProps } from './a11y';
import { Icon } from './Icon';
import { ICON_NAMES, ICON_SIZES } from './icons';
import { BOTH_THEMES, colorsFor, INCLUDING_HIDDEN, renderInTheme, svgStrokes } from './testing';

function strokeOf(testID: string): string | null {
  return svgStrokes(screen.getByTestId(testID, INCLUDING_HIDDEN))[0];
}

/*
 * RNTL 13 renders into one concurrent root per test, so a second `render()` in
 * the same test throws the first one's act() scope away and the third returns
 * an empty tree. Every test below therefore does exactly ONE render and puts
 * the variations side by side in that single tree.
 */
describe('Icon', () => {
  it('renders every icon in the set without throwing', async () => {
    await render(
      <View>
        {ICON_NAMES.map((name) => (
          <Icon key={name} name={name} />
        ))}
      </View>,
    );
    for (const name of ICON_NAMES) {
      expect(screen.getByTestId(`icon-${name}`, INCLUDING_HIDDEN)).toBeTruthy();
    }
  });

  it('is decorative by default: hidden from screen readers', async () => {
    await render(<Icon name="flame" />);
    const svg = screen.getByTestId('icon-flame', INCLUDING_HIDDEN);
    // `accessible` is never passed as `false`: react-native-svg forwards it to
    // the DOM <svg> on web and React rejects a non-boolean attribute.
    expect(svg.props.accessible).toBeUndefined();
    expect(svg.props.accessibilityElementsHidden).toBe(true);
    expect(svg.props.importantForAccessibility).toBe('no-hide-descendants');
    // Decorative icons are invisible to the default (non-hidden) queries too.
    expect(screen.queryByTestId('icon-flame')).toBeNull();
  });

  /*
   * Regression: on web every icon logged four React DOM warnings per render
   * ("Received `false` for a non-boolean attribute `accessible`", "React does
   * not recognize the `accessibilityElementsHidden` prop", …), which in dev
   * painted a LogBox overlay across the bottom of every screen.
   */
  it('passes no React-Native-only accessibility props on web', () => {
    const decorative = svgAccessibilityProps(undefined, 'web');
    const labelled = svgAccessibilityProps('Streak', 'web');
    for (const props of [decorative, labelled]) {
      expect(Object.keys(props)).not.toContain('accessible');
      expect(Object.keys(props)).not.toContain('accessibilityElementsHidden');
      expect(Object.keys(props)).not.toContain('importantForAccessibility');
    }
    expect(decorative).toEqual({ 'aria-hidden': true });
    expect(labelled).toEqual({ role: 'img', 'aria-label': 'Streak' });
  });

  it('keeps the native accessibility props on native', () => {
    expect(svgAccessibilityProps(undefined, 'android')).toEqual({
      accessible: undefined,
      accessibilityRole: undefined,
      accessibilityLabel: undefined,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    expect(svgAccessibilityProps('Streak', 'ios')).toEqual({
      accessible: true,
      accessibilityRole: 'image',
      accessibilityLabel: 'Streak',
      accessibilityElementsHidden: false,
      importantForAccessibility: 'yes',
    });
  });

  it('becomes an image element once it is given a label', async () => {
    await render(<Icon name="flame" accessibilityLabel="Streak" />);
    const svg = screen.getByTestId('icon-flame');
    expect(svg.props.accessible).toBe(true);
    expect(svg.props.accessibilityRole).toBe('image');
    expect(svg.props.accessibilityLabel).toBe('Streak');
    expect(svg.props.accessibilityElementsHidden).toBe(false);
  });

  it('honours all four sizes', async () => {
    await render(
      <View>
        {ICON_SIZES.map((size) => (
          <Icon key={size} name="check" size={size} testID={`i-${size}`} />
        ))}
      </View>,
    );
    for (const size of ICON_SIZES) {
      const svg = screen.getByTestId(`i-${size}`, INCLUDING_HIDDEN);
      expect(svg.props.width).toBe(size);
      expect(svg.props.height).toBe(size);
    }
  });

  it.each(BOTH_THEMES)('defaults to the %s theme text colour', async (scheme) => {
    await renderInTheme(<Icon name="check" />, scheme);
    expect(strokeOf('icon-check')).toBe(colorsFor(scheme).text);
  });

  it('takes an explicit colour over the theme', async () => {
    await renderInTheme(<Icon name="check" color={colorsFor('light').danger} />, 'light');
    expect(strokeOf('icon-check')).toBe(colorsFor('light').danger);
  });
});
