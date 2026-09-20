import { screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { typeScale } from '../../theme/tokens';
import { BOTH_THEMES, colorsFor, flattenStyle, renderInTheme } from './testing';
import { Eyebrow, Heading, Text, type TextTone, type TypeRole } from './Typography';

const ROLES = Object.keys(typeScale) as TypeRole[];
const TONES: TextTone[] = ['default', 'secondary', 'muted', 'brand', 'success', 'warning', 'danger', 'info'];

function styleOf(testID: string) {
  return flattenStyle(screen.getByTestId(testID).props.style);
}

describe('Text', () => {
  it('defaults to the body role and the text colour', async () => {
    await renderInTheme(<Text testID="t">Hello</Text>, 'light');
    const style = styleOf('t');
    expect(style.fontSize).toBe(typeScale.body.fontSize);
    expect(style.color).toBe(colorsFor('light').text);
  });

  it('renders every role in the type scale at its documented size', async () => {
    await renderInTheme(
      <View>
        {ROLES.map((role) => (
          <Text key={role} role={role} testID={`t-${role}`}>
            {role}
          </Text>
        ))}
      </View>,
    );
    for (const role of ROLES) {
      const style = styleOf(`t-${role}`);
      expect(style.fontSize).toBe(typeScale[role].fontSize);
      // Never below 12px, and never boxed to a fixed height (§2, §9).
      expect(style.fontSize as number).toBeGreaterThanOrEqual(12);
      expect(style.height).toBeUndefined();
      expect(style.maxHeight).toBeUndefined();
    }
  });

  it('maps every tone onto a theme colour', async () => {
    await renderInTheme(
      <View>
        {TONES.map((tone) => (
          <Text key={tone} tone={tone} testID={`t-${tone}`}>
            {tone}
          </Text>
        ))}
      </View>,
      'light',
    );
    const colors = colorsFor('light');
    expect(styleOf('t-default').color).toBe(colors.text);
    expect(styleOf('t-secondary').color).toBe(colors.textSecondary);
    expect(styleOf('t-muted').color).toBe(colors.textMuted);
    expect(styleOf('t-brand').color).toBe(colors.brand);
    expect(styleOf('t-success').color).toBe(colors.success);
    expect(styleOf('t-warning').color).toBe(colors.warning);
    expect(styleOf('t-danger').color).toBe(colors.danger);
    expect(styleOf('t-info').color).toBe(colors.info);
  });

  it.each(BOTH_THEMES)('resolves its colour from the %s theme', async (scheme) => {
    await renderInTheme(<Text testID="t">Hello</Text>, scheme);
    expect(styleOf('t').color).toBe(colorsFor(scheme).text);
  });

  it('takes an explicit colour over the tone', async () => {
    await renderInTheme(<Text testID="t" color="#123456">Hello</Text>);
    expect(styleOf('t').color).toBe('#123456');
  });

  it('uses tabular figures for numbers on request', async () => {
    await renderInTheme(<Text testID="t" tabularNums>12:03</Text>);
    expect(styleOf('t').fontVariant).toEqual(['tabular-nums']);
  });

  it('truncates with an ellipsis only when a line limit is set', async () => {
    await renderInTheme(
      <View>
        <Text testID="clamped" numberOfLines={1}>A very long member name</Text>
        <Text testID="free">A very long member name</Text>
      </View>,
    );
    expect(screen.getByTestId('clamped').props.numberOfLines).toBe(1);
    expect(screen.getByTestId('clamped').props.ellipsizeMode).toBe('tail');
    expect(screen.getByTestId('free').props.numberOfLines).toBeUndefined();
  });
});

describe('Heading', () => {
  it('always announces itself as a header', async () => {
    await renderInTheme(<Heading testID="h">Today</Heading>);
    expect(screen.getByTestId('h').props.accessibilityRole).toBe('header');
  });

  it('maps every level onto its type-scale role', async () => {
    await renderInTheme(
      <View>
        <Heading level="display" testID="h-display">display</Heading>
        <Heading level={1} testID="h-1">one</Heading>
        <Heading level={2} testID="h-2">two</Heading>
        <Heading level={3} testID="h-3">three</Heading>
      </View>,
    );
    expect(styleOf('h-display').fontSize).toBe(typeScale.display.fontSize);
    expect(styleOf('h-1').fontSize).toBe(typeScale.h1.fontSize);
    expect(styleOf('h-2').fontSize).toBe(typeScale.h2.fontSize);
    expect(styleOf('h-3').fontSize).toBe(typeScale.h3.fontSize);
  });
});

describe('Eyebrow', () => {
  it('is the small uppercase brand-coloured signature', async () => {
    await renderInTheme(<Eyebrow testID="e">Today</Eyebrow>, 'light');
    const style = styleOf('e');
    expect(style.fontSize).toBe(typeScale.eyebrow.fontSize);
    expect(style.textTransform).toBe('uppercase');
    expect(style.letterSpacing as number).toBeGreaterThan(0);
    expect(style.color).toBe(colorsFor('light').brand);
  });

  it('accepts another tone when the brand colour is unreadable behind it', async () => {
    await renderInTheme(<Eyebrow tone="on-cta" testID="e">Today</Eyebrow>, 'light');
    expect(styleOf('e').color).toBe(colorsFor('light').onCta);
  });
});
