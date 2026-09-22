import { fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { motion, type ThemeName } from '../../theme/tokens';
import { Button } from './Button';
import { minTouchTarget, screenGutter, TITLE_MAX_LINES } from './layout';
import { ScreenHeader } from './ScreenHeader';
import { ScreenShell } from './ScreenShell';
import { ScreenShellContext, type ScreenShellState } from './ScreenShellContext';
import {
  BOTH_THEMES,
  colorsFor,
  flattenStyle,
  metricsWith,
  mockReducedMotion,
  mockWindowDimensions,
  pressIn,
  pressableStyle,
  renderWithInsets,
} from './testing';

/** `PHONE_METRICS` has a 47pt notch — the number the header must pay at most once. */
const TOP_INSET = 47;

const headerStyle = (testID = 'header') => flattenStyle(screen.getByTestId(testID).props.style);
const backButton = () => screen.getByTestId('screen-header-back');

function shellState(topInsetApplied: boolean): ScreenShellState {
  return { topInsetApplied, insideTabShell: false };
}

describe('ScreenHeader', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the title as the screen h1', async () => {
    await renderWithInsets(<ScreenHeader title="Today" testID="header" />);
    const title = screen.getByText('Today');
    expect(title.props.accessibilityRole).toBe('header');
  });

  it('renders an eyebrow above the title when given one', async () => {
    await renderWithInsets(<ScreenHeader title="Today" eyebrow="Monday" testID="header" />);
    expect(screen.getByText('Monday')).toBeTruthy();
  });

  it('renders no eyebrow when there is none, so the h1 is not pushed down', async () => {
    await renderWithInsets(<ScreenHeader title="Today" testID="header" />);
    expect(screen.queryByText('Monday')).toBeNull();
    expect(screen.getAllByText(/./)).toHaveLength(1);
  });

  // A coach-written block name ("Cardio in Place — Foundation & Technique") is
  // three h1 lines on a 390pt phone: at two the day screen's header read
  // "Cardio in Place — Foundation & …" and hid which block the member opened.
  it('lets a long title wrap over three lines rather than truncating it', async () => {
    // jest-expo's default Dimensions mock reports fontScale 2, which is the
    // unclamped branch — this test is about the ordinary text size.
    mockWindowDimensions({ fontScale: 1 });
    await renderWithInsets(
      <ScreenHeader title="Cardio in Place — Foundation & Technique" testID="header" />,
    );
    expect(screen.getByText(/Cardio in Place/).props.numberOfLines).toBe(TITLE_MAX_LINES);
  });

  it('drops the line clamp entirely once the member enlarges text', async () => {
    mockWindowDimensions({ fontScale: 2 });
    await renderWithInsets(
      <ScreenHeader title="Cardio in Place — Foundation & Technique" testID="header" />,
    );
    const title = screen.getByText(/Cardio in Place/);
    expect(title.props.numberOfLines).toBeUndefined();
    expect(title.props.ellipsizeMode).toBeUndefined();
  });

  describe('safe area', () => {
    it('pays the notch inset itself when no shell has already done so', async () => {
      await renderWithInsets(<ScreenHeader title="Today" testID="header" />);
      expect(headerStyle().paddingTop).toBe(TOP_INSET);
    });

    it('adds NO top inset when a shell says it already applied one', async () => {
      await renderWithInsets(
        <ScreenShellContext.Provider value={shellState(true)}>
          <ScreenHeader title="Today" testID="header" />
        </ScreenShellContext.Provider>,
      );
      expect(headerStyle().paddingTop).toBe(0);
    });

    it('is not double-padded when it is a real ScreenShell header', async () => {
      await renderWithInsets(
        <ScreenShell testID="shell" header={<ScreenHeader title="Today" testID="header" />}>
          {null}
        </ScreenShell>,
      );
      // The shell pays the notch...
      expect(flattenStyle(screen.getByTestId('shell').props.style).paddingTop).toBe(TOP_INSET);
      // ...so the header inside it pays nothing.
      expect(headerStyle().paddingTop).toBe(0);
    });

    it('adds nothing on a device with no notch', async () => {
      await renderWithInsets(<ScreenHeader title="Today" testID="header" />, {
        metrics: metricsWith({ top: 0 }),
      });
      expect(headerStyle().paddingTop).toBe(0);
    });
  });

  describe('back control', () => {
    it('is absent unless an onBack handler is given', async () => {
      await renderWithInsets(<ScreenHeader title="Today" testID="header" />);
      expect(screen.queryByTestId('screen-header-back')).toBeNull();
    });

    it('is a button with a default accessible name and fires onBack', async () => {
      const onBack = jest.fn();
      await renderWithInsets(<ScreenHeader title="Today" onBack={onBack} testID="header" />);
      const back = backButton();
      expect(back.props.accessibilityRole).toBe('button');
      expect(back.props.accessibilityLabel).toBe('Go back');
      fireEvent.press(back);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('takes a caller-supplied accessible name', async () => {
      await renderWithInsets(
        <ScreenHeader
          title="Today"
          onBack={() => undefined}
          backAccessibilityLabel="Back to workouts"
          testID="header"
        />,
      );
      expect(backButton().props.accessibilityLabel).toBe('Back to workouts');
    });

    it('meets the platform minimum touch target', async () => {
      const target = minTouchTarget(Platform.OS);
      await renderWithInsets(<ScreenHeader title="Today" onBack={() => undefined} testID="header" />);
      const style = pressableStyle(backButton());
      expect(style.width).toBe(target);
      expect(style.height).toBe(target);
      expect(target).toBeGreaterThanOrEqual(44);
      // Plus hitSlop, so the tappable area is larger still.
      expect(backButton().props.hitSlop).toBeGreaterThan(0);
    });

    it('gives pressed feedback that dims and scales without shifting layout', async () => {
      await renderWithInsets(<ScreenHeader title="Today" onBack={() => undefined} testID="header" />);
      const back = backButton();
      await pressIn(back);
      const style = flattenStyle(back.props.style);
      expect(style.opacity).toBe(motion.pressOpacity);
      expect(style.transform).toEqual([{ scale: motion.pressScale }]);
      // The box itself is unchanged, so nothing around it moves.
      expect(style.width).toBe(minTouchTarget(Platform.OS));
    });

    it('drops the scale under reduced motion but keeps the dim', async () => {
      mockReducedMotion(true);
      await renderWithInsets(<ScreenHeader title="Today" onBack={() => undefined} testID="header" />);
      const back = backButton();
      await pressIn(back);
      const style = flattenStyle(back.props.style);
      expect(style.opacity).toBe(motion.pressOpacity);
      expect(style.transform).toEqual([{ scale: 1 }]);
    });

    it('grows the target to the 48dp Android minimum on Android', async () => {
      // RN's Pressable strips `android_ripple` from the host node off Android,
      // so the platform-dependent thing that IS observable here is the size.
      jest.replaceProperty(Platform, 'OS', 'android');
      await renderWithInsets(<ScreenHeader title="Today" onBack={() => undefined} testID="header" />);
      const style = pressableStyle(backButton());
      expect(style.width).toBe(48);
      expect(style.height).toBe(48);
    });
  });

  describe('actions and surface', () => {
    it('renders trailing actions', async () => {
      await renderWithInsets(
        <ScreenHeader
          title="Today"
          actions={<Button label="Edit" size="sm" onPress={() => undefined} />}
          testID="header"
        />,
      );
      expect(screen.getByText('Edit')).toBeTruthy();
    });

    it.each(BOTH_THEMES)('sits on the page background in the %s theme', async (scheme: ThemeName) => {
      await renderWithInsets(<ScreenHeader title="Today" testID="header" />, { scheme });
      expect(headerStyle().backgroundColor).toBe(colorsFor(scheme).bg);
    });

    it('goes transparent when it has to float over content', async () => {
      await renderWithInsets(<ScreenHeader title="Today" translucent testID="header" />);
      expect(headerStyle().backgroundColor).toBe('transparent');
    });

    it('lets a caller add style without losing the inset', async () => {
      await renderWithInsets(
        <ScreenHeader title="Today" style={{ marginBottom: 12 }} testID="header" />,
      );
      const style = headerStyle();
      expect(style.marginBottom).toBe(12);
      expect(style.paddingTop).toBe(TOP_INSET);
    });

    /*
     * The header must share its left edge with the shell's scroll content, so
     * it pays the SAME width-dependent gutter (16, or 24 from 600dp) rather
     * than a hard-coded 16 — otherwise the h1 and the body are 8pt apart on a
     * tablet or the web build.
     */
    it('uses the phone gutter on a phone and the wide gutter from 600dp', async () => {
      mockWindowDimensions({ width: 390, height: 844 });
      const view = await renderWithInsets(<ScreenHeader title="Today" testID="header" />, {
        metrics: metricsWith({}, { width: 390 }),
      });
      expect(headerStyle().paddingHorizontal).toBe(screenGutter(390));
      view.unmount();

      mockWindowDimensions({ width: 1280, height: 900 });
      await renderWithInsets(<ScreenHeader title="Today" testID="header" />, {
        metrics: metricsWith({}, { width: 1280 }),
      });
      expect(headerStyle().paddingHorizontal).toBe(screenGutter(1280));
    });
  });
});
