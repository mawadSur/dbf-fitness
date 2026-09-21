import { fireEvent, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';

import { fontFamily, tabBarBackground, type ThemeName } from '../../theme/tokens';
import {
  MAX_FONT_SCALE,
  TAB_BAR_ICON_SIZE,
  TAB_BAR_INDICATOR_HEIGHT,
  TAB_BAR_INDICATOR_WIDTH,
  TAB_BAR_ITEM_HORIZONTAL_PADDING,
  TAB_BAR_LABEL_FONT_SIZE,
  TAB_BAR_LABEL_LINE_HEIGHT,
  TAB_BAR_LABEL_MAX_FONT_SCALE,
  TAB_BAR_MIN_HEIGHT,
  minTouchTarget,
  tabBarContentHeight,
  tabBarItemWidth,
  tabBarLabelFits,
  tabBarLabelFitScale,
  tabBarLabelLineHeight,
  tabBarLabelLines,
} from '../ui/layout';
import {
  BOTH_THEMES,
  colorsFor,
  flattenStyle,
  metricsWith,
  mockWindowDimensions,
  renderWithInsets,
} from '../ui/testing';
import { AppTabBar, DbfTabBar } from './TabBar';

/** `PHONE_METRICS` gesture bar — the inset the bar must pay exactly once. */
const BOTTOM_INSET = 34;

const TABS = [
  ['index', 'Home'],
  ['workout', 'Workout'],
  ['food', 'Food'],
  ['community', 'Community'],
  ['profile', 'Profile'],
] as const;

const emit = jest.fn(() => ({ defaultPrevented: false }));
const navigate = jest.fn();

/** A BottomTabBarProps stand-in: the five real tabs with `activeIndex` focused. */
function tabBarProps(activeIndex = 0, overrides: { preventDefault?: boolean } = {}) {
  const routes = TABS.map(([name]) => ({ key: `${name}-key`, name, params: undefined }));
  const descriptors = Object.fromEntries(
    TABS.map(([name, title]) => [
      `${name}-key`,
      {
        options: {
          title,
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <MockIcon color={color} size={size} name={name} />
          ),
        },
      },
    ]),
  );
  emit.mockImplementation(() => ({ defaultPrevented: overrides.preventDefault ?? false }));
  return {
    state: { index: activeIndex, routes },
    descriptors,
    navigation: { emit, navigate },
  } as unknown as BottomTabBarProps;
}

/**
 * Stands in for the real `TabIcon`. A bare host view is enough here: what the
 * bar is responsible for is the tint and the size it hands the icon, and those
 * ride along as props that a test can read back.
 */
function MockIcon({ color, size, name }: { color: string; size: number; name: string }) {
  return <View testID={`icon-${name}`} accessibilityLabel={color} accessibilityValue={{ now: size }} />;
}

const iconTint = (name: string) => screen.getByTestId(`icon-${name}`).props.accessibilityLabel;
const iconSize = (name: string) => screen.getByTestId(`icon-${name}`).props.accessibilityValue.now;

const bar = () => screen.getByTestId('tab-bar');
const barStyle = () => flattenStyle(bar().props.style);
const tab = (name: string) => screen.getByTestId(`tab-${name}`);

async function renderBar(
  activeIndex = 0,
  { scheme = 'light' as ThemeName, bottom = BOTTOM_INSET, preventDefault = false } = {},
) {
  return renderWithInsets(<DbfTabBar {...tabBarProps(activeIndex, { preventDefault })} />, {
    scheme,
    metrics: metricsWith({ bottom }),
  });
}

describe('DbfTabBar', () => {
  beforeEach(() => {
    emit.mockClear();
    navigate.mockClear();
    // jest-expo reports a fontScale of 2 by default, which is the very thing
    // these tests vary — so the baseline has to be pinned to 100%.
    mockWindowDimensions({ fontScale: 1 });
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps the five tabs and their titles', async () => {
    await renderBar();
    for (const [name, title] of TABS) {
      expect(tab(name)).toBeTruthy();
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it('is a tablist of tabs, with only the active one selected', async () => {
    await renderBar(2);
    expect(bar().props.accessibilityRole).toBe('tablist');
    expect(tab('food').props.accessibilityRole).toBe('tab');
    expect(tab('food').props.accessibilityState).toEqual({ selected: true });
    expect(tab('index').props.accessibilityState).toEqual({ selected: false });
  });

  it('names every tab for assistive tech even though the icon is decorative', async () => {
    await renderBar();
    expect(tab('community').props.accessibilityLabel).toBe('Community');
  });

  describe('active pill', () => {
    it('puts a 32×4 brand pill over the active tab and nowhere else', async () => {
      await renderBar(1);
      const pill = flattenStyle(screen.getByTestId('tab-indicator-workout').props.style);
      expect(pill.width).toBe(TAB_BAR_INDICATOR_WIDTH);
      expect(pill.height).toBe(TAB_BAR_INDICATOR_HEIGHT);
      expect(pill.backgroundColor).toBe(colorsFor('light').brand);
      expect(screen.queryByTestId('tab-indicator-index')).toBeNull();
      expect(screen.queryByTestId('tab-indicator-profile')).toBeNull();
    });

    it('moves with the focused tab', async () => {
      await renderBar(4);
      expect(screen.getByTestId('tab-indicator-profile')).toBeTruthy();
      expect(screen.queryByTestId('tab-indicator-workout')).toBeNull();
    });

    it('reserves the pill row on every tab, so switching tabs never shifts the icons', async () => {
      await renderBar(0);
      // The inactive tabs still render a transparent 4pt spacer in its place.
      const spacer = flattenStyle(screen.getByTestId('tab-pill-food').props.style);
      expect(spacer.height).toBe(TAB_BAR_INDICATOR_HEIGHT);
      expect(spacer.backgroundColor).toBe('transparent');
    });

    it('marks the active tab with colour AND weight, not colour alone', async () => {
      await renderBar(0);
      const colors = colorsFor('light');
      const active = flattenStyle(screen.getByText('Home').props.style);
      const inactive = flattenStyle(screen.getByText('Food').props.style);
      expect(active.color).toBe(colors.text);
      expect(inactive.color).toBe(colors.textMuted);
      expect(active.fontFamily).toBe(fontFamily.bodySemibold);
      expect(inactive.fontFamily).toBe(fontFamily.bodyMedium);
    });

    it('tints the icon to match its label', async () => {
      await renderBar(0);
      const colors = colorsFor('light');
      expect(iconTint('index')).toBe(colors.text);
      expect(iconTint('food')).toBe(colors.textMuted);
      expect(iconSize('index')).toBe(TAB_BAR_ICON_SIZE);
    });
  });

  describe('navigation', () => {
    it('navigates to an unfocused tab on press', async () => {
      await renderBar(0);
      fireEvent.press(tab('food'));
      expect(emit).toHaveBeenCalledWith({
        type: 'tabPress',
        target: 'food-key',
        canPreventDefault: true,
      });
      expect(navigate).toHaveBeenCalledWith('food', undefined);
    });

    it('does not re-navigate when the focused tab is pressed', async () => {
      await renderBar(2);
      fireEvent.press(tab('food'));
      expect(navigate).not.toHaveBeenCalled();
    });

    it('honours a listener that prevents the default tabPress', async () => {
      await renderBar(0, { preventDefault: true });
      fireEvent.press(tab('food'));
      expect(navigate).not.toHaveBeenCalled();
    });

    it('emits tabLongPress so screens can hook a long press', async () => {
      await renderBar(0);
      fireEvent(tab('food'), 'longPress');
      expect(emit).toHaveBeenCalledWith({ type: 'tabLongPress', target: 'food-key' });
    });
  });

  describe('surface and safe area', () => {
    it.each(BOTH_THEMES)('uses the translucent %s bar fill with a hairline top border', async (scheme: ThemeName) => {
      await renderBar(0, { scheme });
      const style = barStyle();
      expect(style.backgroundColor).toBe(tabBarBackground[scheme]);
      expect(style.borderTopWidth).toBe(StyleSheet.hairlineWidth);
      expect(style.borderTopColor).toBe(colorsFor(scheme).borderSoft);
    });

    it('pays the gesture-bar inset exactly once: as padding inside its own height', async () => {
      await renderBar(0);
      const style = barStyle();
      expect(style.paddingBottom).toBe(BOTTOM_INSET);
      // Height = content + inset, so the padding is inside the box, not added twice.
      expect(style.height).toBe(tabBarContentHeight(1, 1) + BOTTOM_INSET);
    });

    it('adds no bottom padding on a device with no gesture bar', async () => {
      await renderBar(0, { bottom: 0 });
      expect(barStyle().paddingBottom).toBe(0);
      expect(barStyle().height).toBe(tabBarContentHeight(1, 1));
    });

    /*
     * The shipped bar (AppTabBar) is pinned to the chrome palette: every
     * product screen still paints the hard-coded white legacy page, so a bar
     * that followed the member's dark theme sat dark under a white page — the
     * visible half of the bug that also made the Android status bar vanish.
     */
    it('honours an explicit scheme override, whatever the active theme is', async () => {
      await renderWithInsets(<DbfTabBar {...tabBarProps(0)} scheme="light" />, {
        scheme: 'dark',
        metrics: metricsWith({ bottom: 0 }),
      });
      expect(barStyle().backgroundColor).toBe(tabBarBackground.light);
      expect(barStyle().borderTopColor).toBe(colorsFor('light').borderSoft);
      expect(flattenStyle(screen.getByText('Home').props.style).color).toBe(colorsFor('light').text);
    });

    /*
     * The bar used to be pinned to the light palette because the tab screens
     * painted a hard-coded white page. Stage 2 migrated them, so the shipped bar
     * follows the theme: under the dark theme it must be the DARK bar, and it
     * must no longer come back light.
     */
    it('mounts the app bar on the dark chrome under the dark theme', async () => {
      await renderWithInsets(<AppTabBar {...tabBarProps(0)} />, {
        scheme: 'dark',
        metrics: metricsWith({ bottom: 0 }),
      });
      expect(barStyle().backgroundColor).toBe(tabBarBackground.dark);
      expect(barStyle().backgroundColor).not.toBe(tabBarBackground.light);
    });
  });

  /*
   * Regression (Android, 1080px device, font_scale 1.0): the tabs came out
   * content-sized and left-packed — Home[0,92] Workout[92,222] Food[222,306]
   * Community[306,483] Profile[483,582], leaving the right 46% of the bar
   * empty, running the five labels together as one string, pinning the brand
   * pill to x=0 and leaving Home/Food/Profile at 33/31/36dp, under the 48dp
   * Android minimum. Web was fine, so nothing that only renders once caught it.
   *
   * The cause was `style={({ pressed }) => [...]}` on a Pressable that
   * `jsxImportSource: 'nativewind'` replaces with the css-interop wrapper: the
   * function form's layout props never reached Yoga on Android. Layout now
   * lives on static style objects, and that is what these tests pin.
   */
  describe('horizontal layout', () => {
    it('gives every tab an equal share of the row from a STATIC style object', async () => {
      await renderBar(0);
      for (const [name] of TABS) {
        // Not the function form: a plain object is what survives the interop
        // wrapper on Android.
        expect(typeof tab(name).props.style).not.toBe('function');
        expect(flattenStyle(tab(name).props.style).flex).toBe(1);
        expect(flattenStyle(screen.getByTestId(`tab-content-${name}`).props.style).flex).toBe(1);
      }
    });

    it('keeps the press feedback off the layout props', async () => {
      await renderBar(0);
      const content = flattenStyle(screen.getByTestId('tab-content-food').props.style);
      // Opacity/transform only; the box itself never moves when pressed.
      expect(content.opacity).toBe(1);
      expect(content.transform).toEqual([{ scale: 1 }]);
      expect(content.alignItems).toBe('center');
      expect(content.paddingHorizontal).toBe(TAB_BAR_ITEM_HORIZONTAL_PADDING);
    });

    /*
     * Landscape on a notched phone: the layout model already narrowed the bar
     * by the left/right insets to decide how wide a label may be, but the bar
     * itself still spanned the full window — so the outer tabs sat under the
     * notch and the gesture rails, and the modelled width was a fiction.
     */
    it('pays the landscape notch insets as real horizontal padding', async () => {
      await renderWithInsets(<DbfTabBar {...tabBarProps(0)} />, {
        metrics: metricsWith({ left: 44, right: 44, bottom: 21 }),
      });
      const style = barStyle();
      expect(style.paddingLeft).toBe(44);
      expect(style.paddingRight).toBe(44);
      // The bottom inset is still paid exactly once, and only on the bottom.
      expect(style.paddingBottom).toBe(21);
    });

    it('adds no horizontal padding in portrait, where there is no side inset', async () => {
      await renderBar(0);
      expect(barStyle().paddingLeft).toBe(0);
      expect(barStyle().paddingRight).toBe(0);
    });

    it('lays the row out as a stretched flex row so the shares are real', async () => {
      await renderBar(0);
      expect(barStyle().flexDirection).toBe('row');
      expect(barStyle().alignItems).toBe('stretch');
    });

    it('clears the 48dp Android touch minimum on the narrowest supported phone', async () => {
      // Five equal tabs on a 360dp screen: 72dp wide, and the bar is >= 56 tall.
      expect(tabBarItemWidth(360, TABS.length)).toBeGreaterThanOrEqual(
        minTouchTarget('android'),
      );
      expect(tabBarContentHeight(1, 1)).toBeGreaterThanOrEqual(minTouchTarget('android'));
    });
  });

  describe('font scaling', () => {
    it('clears the 56pt minimum with one line of label at the default scale', async () => {
      await renderBar(0, { bottom: 0 });
      expect(barStyle().height).toBe(tabBarContentHeight(1, 1));
      expect(barStyle().height).toBeGreaterThanOrEqual(TAB_BAR_MIN_HEIGHT);
      expect(screen.getByText('Community').props.numberOfLines).toBe(1);
    });

    it('grows the bar but keeps every label on ONE line at a 200% font scale', async () => {
      mockWindowDimensions({ fontScale: 2 });
      await renderBar(0, { bottom: 0 });

      // The OS asks for 200%; the label takes the largest scale its own tab
      // can hold on one line (a tab label is one word, so the only break the
      // platform can make is BETWEEN LETTERS — at 200% the emulator drew
      // "Commu" over "nity" while the other four tabs stayed single-line).
      const labelScale = tabBarLabelFitScale(390, TABS.length, 'Community');
      expect(labelScale).toBeGreaterThan(1);
      expect(labelScale).toBeLessThan(TAB_BAR_LABEL_MAX_FONT_SCALE);
      expect(tabBarLabelLines(labelScale, 390, TABS.length, 'Community')).toBe(1);

      const expectedLineHeight = tabBarLabelLineHeight(labelScale);
      const expectedHeight = tabBarContentHeight(labelScale, 1);

      // The bar is taller than the default so the bigger text has somewhere to go.
      expect(expectedHeight).toBeGreaterThan(tabBarContentHeight(1, 1));
      expect(barStyle().height).toBe(expectedHeight);

      const label = flattenStyle(screen.getByText('Community').props.style);
      // Both the font size and the line height go to the OS UNSCALED: React
      // Native multiplies each by the font scale under the same
      // `maxFontSizeMultiplier` cap. Handing it the already-scaled line height
      // scaled it twice — measured on the Android emulator at font_scale 2.0
      // as ink rows 94px apart where the model reserved 65px, which dropped
      // the second line of "Community" into the gesture-bar inset.
      expect(label.fontSize).toBe(TAB_BAR_LABEL_FONT_SIZE);
      expect(label.lineHeight).toBe(TAB_BAR_LABEL_LINE_HEIGHT);
      expect(label.lineHeight).toBeLessThan(expectedLineHeight);
      // What the OS will actually draw is what the bar reserved.
      expect(Math.ceil(Number(label.lineHeight) * labelScale)).toBe(expectedLineHeight);
      expect(screen.getByText('Community').props.numberOfLines).toBe(1);
      expect(screen.getByText('Community').props.maxFontSizeMultiplier).toBe(labelScale);

      // Nothing is clipped VERTICALLY: the reserved height covers the scaled
      // line plus the pill, the icon and the gaps around them.
      expect(expectedHeight).toBeGreaterThanOrEqual(expectedLineHeight + TAB_BAR_ICON_SIZE);

      // ...and nothing is clipped HORIZONTALLY either. The label is a
      // tail-truncating box (`ellipsizeMode="tail"`), so the height assertions
      // above would happily pass while the device rendered "Comm…". The check
      // is DISCRETE: it wraps the word the way the platform does.
      for (const [, title] of TABS) {
        for (const width of [360, 390, 412]) {
          expect({ title, width, fits: tabBarLabelFits(width, TABS.length, 2, title) }).toEqual({
            title,
            width,
            fits: true,
          });
        }
      }
    });

    it('keeps one line — and the short bar — at 105% on a 412pt phone', async () => {
      // Regression: any scale above 100% used to force two lines everywhere,
      // which cost 19pt of screen on a phone where the label still fits one.
      mockWindowDimensions({ width: 412, fontScale: 1.05 });
      await renderBar(0, { bottom: 0 });
      // 1.05 is under the 412pt one-line fit (~1.16), so nothing is capped here.
      expect(tabBarLabelFitScale(412, TABS.length, 'Community')).toBeGreaterThan(1.05);
      expect(screen.getByText('Community').props.numberOfLines).toBe(1);
      expect(barStyle().height).toBe(tabBarContentHeight(1.05, 1));
      expect(barStyle().height).toBeLessThan(tabBarContentHeight(1.05, 2));
    });

    it('holds one line on a 360pt phone by capping the label, not by wrapping it', async () => {
      // 360pt is the narrowest viewport we support: five tabs leave the label
      // 67.5pt, and "Community" needs 66.9pt at its BASE size. So the label
      // cannot grow here at all — but it still fits, and one whole word beats
      // "Commu" / "nity".
      mockWindowDimensions({ width: 360, fontScale: 1.05 });
      await renderBar(0, { bottom: 0 });
      const labelScale = tabBarLabelFitScale(360, TABS.length, 'Community');
      expect(labelScale).toBeCloseTo(1, 1);
      expect(labelScale).toBeLessThan(1.05);
      expect(screen.getByText('Community').props.numberOfLines).toBe(1);
      expect(barStyle().height).toBe(tabBarContentHeight(labelScale, 1));
    });

    it('never shrinks a tab label below its base 12pt', async () => {
      // A bar too narrow to hold the label at 100% takes the two-line box
      // rather than sub-12pt glyphs.
      mockWindowDimensions({ width: 240, fontScale: 2 });
      await renderBar(0, { bottom: 0 });
      expect(tabBarLabelFitScale(240, TABS.length, 'Community')).toBe(1);
      expect(screen.getByText('Community').props.maxFontSizeMultiplier).toBe(1);
      expect(screen.getByText('Community').props.numberOfLines).toBe(2);
    });

    it('would fail if a tab were wider than its share — the fit helper is not vacuous', () => {
      // One tab is not five: a full-width label obviously fits, a fifth-width
      // one does not if it is long enough.
      expect(tabBarLabelFits(390, 1, 2, 'Community')).toBe(true);
      expect(tabBarLabelFits(390, TABS.length, 2, 'Accountability Partners')).toBe(false);
    });

    it('stops reserving height past the label cap, so a 400% scale does not eat the screen', async () => {
      mockWindowDimensions({ fontScale: 4 });
      await renderBar(0, { bottom: 0 });
      const labelScale = tabBarLabelFitScale(390, TABS.length, 'Community');
      expect(barStyle().height).toBe(tabBarContentHeight(labelScale, 1));
      expect(barStyle().height).toBeLessThan(tabBarContentHeight(MAX_FONT_SCALE, 2));
    });

    it('caps the glyphs at the one-line fit, and never past 150%', async () => {
      mockWindowDimensions({ fontScale: 4 });
      await renderBar(0, { bottom: 0 });
      // At 200% "Community" is 134pt of glyphs in a 74pt tab: the label, not
      // just the box, has to stop scaling. The full name stays in the tab's
      // accessibilityLabel at any OS text size.
      const labelScale = screen.getByText('Community').props.maxFontSizeMultiplier;
      expect(labelScale).toBe(tabBarLabelFitScale(390, TABS.length, 'Community'));
      expect(labelScale).toBeLessThanOrEqual(TAB_BAR_LABEL_MAX_FONT_SCALE);
      expect(TAB_BAR_LABEL_MAX_FONT_SCALE).toBeLessThan(MAX_FONT_SCALE);
      expect(tab('community').props.accessibilityLabel).toBe('Community');
      expect(tabBarLabelFits(360, TABS.length, MAX_FONT_SCALE, 'Community')).toBe(true);
    });
  });
});
