import { screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Pressable, Text as RNText } from 'react-native';

import { Banner } from './Banner';
import { Button } from './Button';
import { Card } from './Card';
import { ChecklistRow } from './ChecklistRow';
import { Chip } from './Chip';
import { Input } from './Input';
import { ListRow } from './ListRow';
import { ScreenHeader } from './ScreenHeader';
import {
  BOTH_THEMES,
  BOX_STYLE_KEYS,
  pressableStyle,
  renderInTheme,
  renderWithInsets,
} from './testing';

/**
 * ANDROID'S `Pressable`, not Jest's.
 *
 * React Native's own `Pressable` resolves a function-form `style` ITSELF
 * (`typeof style === 'function' ? style({ pressed }) : style`) before the host
 * node ever sees it, so in Jest the broken pattern arrives at the host view as
 * a perfectly ordinary object and every assertion below passes. That is exactly
 * how the bug shipped, and — measured on a scratch copy with `Button.tsx`
 * reverted to the function form — it is why this suite stayed green while only
 * the source scan went red.
 *
 * On device the component that receives the `style` prop is the
 * react-native-css-interop wrapper (`jsxImportSource: 'nativewind'`), which
 * does NOT call it: `getOpaqueStyles` returns `[fn]`, the function lands inside
 * a style ARRAY on the host view, and React Native ignores it there. This mock
 * models that: `style` is forwarded verbatim, wrapped in an array, never
 * called. A component that puts its box inside a callback therefore resolves to
 * `{}` here, and the `Object.keys(style).length` assertion trips.
 */
jest.mock('react-native/Libraries/Components/Pressable/Pressable', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./androidPressableMock'),
);

/**
 * Every design-system Pressable, checked the way ANDROID sees it.
 *
 * The component tests each assert their own details; this one asserts the
 * single property that broke on device and that nothing else was positioned to
 * catch: the box lives on the Pressable's OWN host node, resolved WITHOUT
 * calling any style function.
 *
 * `pressableStyle` models the device (a function anywhere in the style prop
 * contributes `{}`, because react-native-css-interop hands it to the host view
 * inside an array and React Native never calls it there). The old helper called
 * the function itself, so these same components passed their tests while they
 * rendered as bare text on the emulator. Asserting on a CHILD would not catch
 * it either — the children kept rendering; it was the parent's box that went.
 */

type Case = {
  name: string;
  element: ReactElement;
  /** How to find the Pressable's own host node. */
  find: () => { props: { style?: unknown } };
  /** Keys that must be present on that node, resolved. */
  required: readonly (typeof BOX_STYLE_KEYS)[number][];
  /** Components that read `useSafeAreaInsets` need a provider to render at all. */
  needsInsets?: true;
};

const cases: Case[] = [
  {
    name: 'Button',
    element: <Button label="Start" testID="p" onPress={() => undefined} />,
    find: () => screen.getByTestId('p'),
    required: ['backgroundColor', 'minHeight', 'borderRadius', 'paddingHorizontal'],
  },
  {
    name: 'Card (pressable)',
    element: (
      <Card testID="p" onPress={() => undefined} accessibilityLabel="Card">
        <RNText>Body</RNText>
      </Card>
    ),
    find: () => screen.getByTestId('p'),
    required: ['backgroundColor', 'borderRadius', 'padding', 'minHeight'],
  },
  {
    name: 'Chip',
    element: <Chip label="Mobility" testID="p" onPress={() => undefined} />,
    find: () => screen.getByTestId('p'),
    required: ['backgroundColor', 'borderRadius', 'minHeight', 'paddingHorizontal'],
  },
  {
    name: 'ListRow',
    element: <ListRow title="Week 1" testID="p" onPress={() => undefined} />,
    find: () => screen.getByTestId('p'),
    required: ['backgroundColor', 'minHeight', 'flexDirection', 'paddingHorizontal'],
  },
  {
    name: 'Banner dismiss',
    element: <Banner title="Late payment" onDismiss={() => undefined} />,
    find: () => screen.getByTestId('banner-dismiss'),
    required: ['width', 'height'],
  },
  {
    name: 'ScreenHeader back',
    element: <ScreenHeader title="Notes" onBack={() => undefined} />,
    find: () => screen.getByTestId('screen-header-back'),
    required: ['width', 'height'],
    needsInsets: true,
  },
  {
    name: 'Input reveal',
    element: (
      <Input label="Password" value="hunter2" secureTextEntry onChangeText={() => undefined} />
    ),
    find: () => screen.getByTestId('input-reveal'),
    required: ['width', 'height'],
  },
  {
    name: 'ChecklistRow checkbox',
    element: <ChecklistRow label="Warm up" checked={false} onToggle={() => undefined} />,
    find: () => screen.getByRole('checkbox'),
    required: ['width', 'height'],
  },
  {
    name: 'ChecklistRow label button',
    element: (
      <ChecklistRow
        label="Warm up"
        checked={false}
        onToggle={() => undefined}
        onPress={() => undefined}
      />
    ),
    find: () => screen.getByRole('button', { name: 'Warm up, details' }),
    required: ['minHeight', 'flex', 'paddingVertical'],
  },
];

describe.each(BOTH_THEMES)('design-system Pressables carry their own box (%s)', (scheme) => {
  it.each(cases.map((one) => [one.name, one] as const))('%s', async (_name, one) => {
    if (one.needsInsets) await renderWithInsets(one.element, { scheme });
    else await renderInTheme(one.element, scheme);
    const style = pressableStyle(one.find());

    // Nothing resolved at all is the exact shape of the Android bug.
    expect(Object.keys(style).length).toBeGreaterThan(0);
    for (const key of one.required) {
      expect(style).toHaveProperty(key);
      expect(style[key]).not.toBeUndefined();
    }
  });
});

describe('the helper models Android, not the web', () => {
  it('treats a function style as contributing nothing', () => {
    const asFunction = () => ({ backgroundColor: '#022C22', minHeight: 48 });
    expect(pressableStyle({ props: { style: asFunction } })).toEqual({});
    expect(pressableStyle({ props: { style: [{ flex: 1 }, asFunction] } })).toEqual({ flex: 1 });
  });
});

/**
 * THE CANARY — proves the `jest.mock` above is still intercepting.
 *
 * Everything in this file rests on `jest.mock` replacing the module that
 * `import { Pressable } from 'react-native'` resolves to. That path
 * (`react-native/Libraries/Components/Pressable/Pressable`) is a React Native
 * INTERNAL: an upgrade that moves or re-exports it differently would make the
 * mock a silent no-op, real RN would resolve the function styles itself again,
 * and every case above would go back to passing while Android broke — the exact
 * failure this suite was written to end.
 *
 * So this renders the broken pattern deliberately, through the very same import
 * the design system uses. Under the mock it must resolve to `{}`. If the mock
 * ever stops applying, real RN calls the callback, the box comes back, and this
 * test fails loudly instead of the suite going quietly useless.
 */
describe('the Android Pressable mock is in effect', () => {
  it('drops a function-form box the way the device does', async () => {
    const Broken = () => (
      <Pressable
        testID="canary"
        style={({ pressed }) => ({
          minHeight: 48,
          backgroundColor: pressed ? '#000000' : '#022C22',
        })}
      />
    );

    await renderInTheme(<Broken />, 'light');

    expect(pressableStyle(screen.getByTestId('canary'))).toEqual({});
  });
});
