import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOptionalTheme, useReducedMotion } from '../../theme/ThemeProvider';
import { fontFamily, tabBarBackground, themes, type ThemeName } from '../../theme/tokens';
import { Text } from '../ui/Typography';
import {
  TAB_BAR_GAP,
  TAB_BAR_ICON_SIZE,
  TAB_BAR_INDICATOR_HEIGHT,
  TAB_BAR_INDICATOR_WIDTH,
  TAB_BAR_ITEM_HORIZONTAL_PADDING,
  TAB_BAR_LABEL_FONT_SIZE,
  TAB_BAR_LABEL_LINE_HEIGHT,
  TAB_BAR_VERTICAL_PADDING,
  clampLabelFontScale,
  pressedStyle,
  tabBarContentHeight,
  tabBarLabelFitScale,
  tabBarLabelLines,
  widestLabel,
} from '../ui/layout';

/**
 * Layout lives on a STATIC style object, never on the `style={({pressed}) => …}`
 * function form.
 *
 * Every JSX element in this app is compiled with `jsxImportSource: 'nativewind'`,
 * so `Pressable` is the react-native-css-interop wrapper rather than the bare
 * RN one. On Android that wrapper did not pass the function-style's layout
 * props through to Yoga: the five tabs came out content-sized and left-packed
 * (Home 33dp, Food 31dp, Profile 36dp — all under the 48dp Android minimum),
 * the labels ran together as one string and the brand pill sat at x=0 instead
 * of over the Home icon. Web, which takes a different render path, looked fine.
 *
 * So the flex share sits in a plain object on the `Pressable`, the rest of the
 * box sits in a plain object on an inner `View`, and only the press feedback —
 * which is opacity and transform, never layout — is computed per press.
 */
const TAB_ITEM: ViewStyle = { flex: 1 };

const TAB_ITEM_CONTENT: ViewStyle = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'flex-start',
  paddingVertical: TAB_BAR_VERTICAL_PADDING,
  paddingHorizontal: TAB_BAR_ITEM_HORIZONTAL_PADDING,
  gap: TAB_BAR_GAP,
};

/**
 * The DBF bottom tab bar (design system §5).
 *
 * Replaces the stock bar so the app owns three things the stock one cannot do:
 * the translucent off-white/dark fill with a hairline top border, the 32×4
 * brand pill over the active tab, and a height that grows with the system font
 * scale so a 200% label is never clipped. The gesture-bar inset is added here
 * and in exactly one other place (`FixedFooter`, outside the tab shell) — never
 * twice on the same edge.
 */
export function DbfTabBar({
  state,
  descriptors,
  navigation,
  scheme: schemeOverride,
}: BottomTabBarProps & { scheme?: ThemeName }) {
  const theme = useOptionalTheme();
  const insets = useSafeAreaInsets();
  const { fontScale, width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const scheme = schemeOverride ?? theme.scheme;
  const colors = schemeOverride ? themes[schemeOverride] : theme.colors;

  const labelOf = (key: string, routeName: string) => {
    const { options } = descriptors[key];
    return typeof options.tabBarLabel === 'string'
      ? options.tabBarLabel
      : (options.title ?? routeName);
  };

  // The label box is sized against the width the tabs REALLY get: the bar
  // spans the window minus the landscape notch insets, split five ways. Those
  // insets are subtracted from the MODEL here and applied as real horizontal
  // padding on the bar below — modelling a narrower bar without narrowing it
  // put the outer tabs under the landscape notch/gesture rails on Android.
  const leftInset = Math.max(0, insets.left);
  const rightInset = Math.max(0, insets.right);
  const barWidth = Math.max(0, width - leftInset - rightInset);
  const longest = widestLabel(state.routes.map((route) => labelOf(route.key, route.name)));
  // The label grows with the OS text size only as far as ITS OWN TAB is wide.
  // A tab label is one word, so the only break the platform can make is
  // between letters: at font_scale 2.0 "Community" came out as "Commu" over
  // "nity" while the other four tabs stayed single-line. Capping the scale at
  // the one-line fit keeps the whole word on one line at every OS text size.
  const labelScale = Math.min(
    clampLabelFontScale(fontScale),
    tabBarLabelFitScale(barWidth, state.routes.length, longest),
  );
  // Reserved and drawn must agree, so the height model is fed the SAME scale
  // the labels are capped to — never the raw OS scale.
  const lines = tabBarLabelLines(labelScale, barWidth, state.routes.length, longest);
  const contentHeight = tabBarContentHeight(labelScale, lines);

  return (
    <View
      testID="tab-bar"
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        height: contentHeight + Math.max(0, insets.bottom),
        paddingBottom: Math.max(0, insets.bottom),
        paddingLeft: leftInset,
        paddingRight: rightInset,
        backgroundColor: tabBarBackground[scheme],
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.borderSoft,
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label = labelOf(route.key, route.name);
        const tint = focused ? colors.text : colors.textMuted;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            testID={`tab-${route.name}`}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            android_ripple={{ color: colors.bgSoft, borderless: true }}
            style={TAB_ITEM}
          >
            {({ pressed }) => (
              <View
                testID={`tab-content-${route.name}`}
                style={[TAB_ITEM_CONTENT, pressedStyle(pressed, reducedMotion)]}
              >
                {/* The pill always occupies its 4pt so switching tabs never shifts the row. */}
                <View
                  testID={focused ? `tab-indicator-${route.name}` : `tab-pill-${route.name}`}
                  style={{
                    width: TAB_BAR_INDICATOR_WIDTH,
                    height: TAB_BAR_INDICATOR_HEIGHT,
                    borderRadius: TAB_BAR_INDICATOR_HEIGHT / 2,
                    backgroundColor: focused ? colors.brand : 'transparent',
                  }}
                />
                {options.tabBarIcon?.({ focused, color: tint, size: TAB_BAR_ICON_SIZE })}
                <Text
                  role="caption"
                  color={tint}
                  align="center"
                  numberOfLines={lines}
                  // The label stops scaling at the largest size that still
                  // fits ONE tab line (never past TAB_BAR_LABEL_MAX_FONT_SCALE,
                  // and never below 100%), because a tab label is a single word
                  // and the platform can only break it BETWEEN LETTERS. The
                  // full name stays in the tab's accessibilityLabel for anyone
                  // who needs it read out at any size.
                  maxFontSizeMultiplier={labelScale}
                  style={{
                    fontSize: TAB_BAR_LABEL_FONT_SIZE,
                    // UNSCALED on purpose: React Native scales `lineHeight` by
                    // the font scale just like `fontSize`, under the same
                    // `maxFontSizeMultiplier` cap. Passing the already-scaled
                    // `tabBarLabelLineHeight()` scaled it twice and pushed the
                    // second line out of the bar; the scaled value is what the
                    // HEIGHT MODEL reserves, not what the style carries.
                    lineHeight: TAB_BAR_LABEL_LINE_HEIGHT,
                    // Android adds the font's own ascent/descent padding AROUND
                    // the line box unless this is off, so a two-line label drew
                    // a few points taller than `tabBarContentHeight` reserved
                    // and the second line ("nity", from "Community" at 200%)
                    // spilled out of the content box into the gesture-bar
                    // inset. With it off, drawn height == lineHeight × lines,
                    // which is exactly what the layout model reserves.
                    includeFontPadding: false,
                    // Weight is a second signal for the active tab, next to
                    // colour and the pill (§9: colour is never the only signal).
                    fontFamily: focused ? fontFamily.bodySemibold : fontFamily.bodyMedium,
                  }}
                >
                  {label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The bar as the APP mounts it (`app/(tabs)/_layout.tsx`).
 *
 * It used to be pinned to the light chrome palette: the tab screens painted a
 * hard-coded white page, and a dark bar under a white page was the visible half
 * of the same bug that made the Android status bar disappear in dark mode.
 * Stage 2 migrated those screens onto `useTheme()`, so the shipped bar now
 * follows the resolved theme — the same thing `DbfTabBar` has always done for
 * the gallery and the component tests.
 */
export function AppTabBar(props: BottomTabBarProps) {
  const { scheme } = useOptionalTheme();
  return <DbfTabBar {...props} scheme={scheme} />;
}
