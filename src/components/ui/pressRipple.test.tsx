import { screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { rippleFor } from '../../theme/tokens';
import { Banner } from './Banner';
import { Button } from './Button';
import { Card } from './Card';
import { ChecklistRow } from './ChecklistRow';
import { Chip } from './Chip';
import { ListRow } from './ListRow';
import { Text } from './Typography';
import { BOTH_THEMES, colorsFor, renderInTheme } from './testing';

/**
 * WHAT EACH CONTROL HANDS ANDROID AS ITS PRESS INK.
 *
 * React Native's own `Pressable` turns `android_ripple` into a native
 * `nativeBackgroundAndroid` config and drops the prop entirely off Android, so
 * the prop is not observable on the host node under Jest's default platform.
 * The css-interop model (`androidPressableMock`, the same one
 * `pressableAndroidBox.test.tsx` uses) forwards every prop verbatim, which is
 * what makes the colour assertable at all.
 *
 * The regression this guards: the ripple used to be another OPAQUE palette
 * token, and in the dark theme those collide with what they are drawn on — a
 * `primary` button is `cta` #34D399 filled and was handed `brand` #34D399,
 * i.e. its own fill, so Android's press feedback drew nothing. The ink is now
 * derived from the control's CONTENT colour, which is already >= 4.5:1 against
 * that fill. `src/theme/ripple.test.ts` proves the composite stays visible on
 * every surface; this file proves the components actually pass it.
 */
jest.mock('react-native/Libraries/Components/Pressable/Pressable', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./androidPressableMock'),
);

const noop = () => undefined;

describe.each(BOTH_THEMES)('%s theme press ink', (scheme) => {
  const colors = colorsFor(scheme);

  /** `[name, element, ink source, the node that carries the ripple]`. */
  const cases: [string, ReactElement, string, string][] = [
    [
      'Button primary',
      <Button key="primary" label="Go" testID="p" onPress={noop} />,
      colors.onCta,
      'p',
    ],
    [
      'Button secondary',
      <Button
        key="secondary"
        label="Go"
        variant="secondary"
        testID="p"
        onPress={noop}
      />,
      colors.text,
      'p',
    ],
    [
      'Button ghost',
      <Button
        key="ghost"
        label="Go"
        variant="ghost"
        testID="p"
        onPress={noop}
      />,
      colors.textSecondary,
      'p',
    ],
    [
      'Button danger',
      <Button
        key="danger"
        label="Delete"
        variant="danger"
        testID="p"
        onPress={noop}
      />,
      colors.dangerBg,
      'p',
    ],
    [
      'Button danger-outline',
      <Button
        key="danger-outline"
        label="Delete"
        variant="danger-outline"
        testID="p"
        onPress={noop}
      />,
      colors.danger,
      'p',
    ],
    ['Card', <Card key="card" testID="p" onPress={noop}>
        <Text role="body">Row</Text>
      </Card>, colors.text, 'p'],
    [
      'Chip',
      <Chip key="chip" label="Dark" testID="p" onPress={noop} />,
      colors.text,
      'p',
    ],
    [
      'ListRow',
      <ListRow key="list-row" title="Row" testID="p" onPress={noop} />,
      colors.text,
      'p',
    ],
    [
      'Banner',
      <Banner
        key="banner"
        tone="info"
        title="Heads up"
        message="Check your plan"
        onDismiss={noop}
        testID="p"
      />,
      colors.text,
      'banner-dismiss',
    ],
  ];

  it.each(cases)(
    '%s draws an ink derived from its own content colour',
    async (_name, element, content, rippleNode) => {
      await renderInTheme(element, scheme);
      const { android_ripple: ripple } = screen.getByTestId(rippleNode, {
        includeHiddenElements: true,
      }).props as { android_ripple?: { color: string } };
      expect(ripple?.color).toBe(rippleFor(content));
    },
  );

  it('gives the ChecklistRow checkbox the same ink (its testID is on the wrapper)', async () => {
    await renderInTheme(
      <ChecklistRow label="Squat" checked={false} testID="p" onToggle={noop} />,
      scheme,
    );
    const { android_ripple: ripple } = screen.getByRole('checkbox').props as {
      android_ripple?: { color: string };
    };
    expect(ripple?.color).toBe(rippleFor(colors.text));
  });

  it('never hands a control an ink equal to a solid palette colour', async () => {
    await renderInTheme(
      <Button label="Go" testID="p" onPress={noop} />,
      scheme,
    );
    const { color } = screen.getByTestId('p').props.android_ripple as {
      color: string;
    };
    expect(color.startsWith('rgba(')).toBe(true);
    expect(color).not.toBe(colors.brand);
    expect(color).not.toBe(colors.cta);
  });
});
