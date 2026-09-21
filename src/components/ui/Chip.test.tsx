import { fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { contrastRatio } from '../../theme/contrast';
import { Chip, chipAccessibilityProps } from './Chip';
import { hitSlopFor, minTouchTarget } from './layout';
import {
  BOTH_THEMES,
  colorsFor,
  flattenStyle,
  INCLUDING_HIDDEN,
  mockReducedMotion,
  pressableStyle,
  pressIn,
  renderInTheme,
} from './testing';

describe('Chip', () => {
  it('is plain text when it has no press handler', async () => {
    await renderInTheme(<Chip label="Static" testID="c" />);
    expect(screen.getByTestId('c').props.accessibilityRole).toBe('text');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('becomes a button with a selected state when pressable', async () => {
    const onPress = jest.fn();
    await renderInTheme(<Chip label="Strength" selected onPress={onPress} testID="c" />);
    const chip = screen.getByTestId('c');
    expect(chip.props.accessibilityRole).toBe('button');
    expect(chip.props.accessibilityLabel).toBe('Strength');
    expect(chip.props.accessibilityState).toMatchObject({ selected: true, disabled: false });
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('adds a check icon when selected, so selection is not colour alone', async () => {
    await renderInTheme(<Chip label="Cardio" selected onPress={() => undefined} />);
    expect(screen.getByTestId('icon-check', INCLUDING_HIDDEN)).toBeTruthy();
  });

  it('keeps the caller icon instead of the check when one is given', async () => {
    await renderInTheme(<Chip label="Cardio" selected icon="flame" onPress={() => undefined} />);
    expect(screen.getByTestId('icon-flame', INCLUDING_HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('icon-check', INCLUDING_HIDDEN)).toBeNull();
  });

  it('fills with the cta colour when selected', async () => {
    await renderInTheme(<Chip label="On" selected onPress={() => undefined} testID="c" />, 'light');
    expect(pressableStyle(screen.getByTestId('c')).backgroundColor).toBe(colorsFor('light').cta);
  });

  it('stays transparent with a strong outline when not selected', async () => {
    await renderInTheme(<Chip label="Off" onPress={() => undefined} testID="c" />, 'light');
    const style = pressableStyle(screen.getByTestId('c'));
    expect(style.backgroundColor).toBe('transparent');
    expect(style.borderColor).toBe(colorsFor('light').borderStrong);
  });

  it('takes its outline from the dark theme', async () => {
    await renderInTheme(<Chip label="Off" onPress={() => undefined} testID="c" />, 'dark');
    expect(pressableStyle(screen.getByTestId('c')).borderColor).toBe(colorsFor('dark').borderStrong);
  });

  it('does not fire and reports disabled when disabled', async () => {
    const onPress = jest.fn();
    await renderInTheme(<Chip label="Nope" disabled onPress={onPress} testID="c" />);
    const chip = screen.getByTestId('c');
    await fireEvent.press(chip);
    expect(onPress).not.toHaveBeenCalled();
    expect(chip.props.accessibilityState).toMatchObject({ disabled: true });
  });

  /**
   * Same defect `Button` had: `opacity: 0.45` faded fill and label together,
   * so a disabled SELECTED chip was still a recognisable brand pill and a
   * disabled unselected one was a ghost outline. The disabled pair replaces
   * the alpha in both themes.
   */
  describe('disabled is a distinct skin, not a blanket alpha', () => {
    it.each(BOTH_THEMES)('uses the disabled fill/label pair in %s', async (scheme) => {
      const colors = colorsFor(scheme);
      await renderInTheme(<Chip label="Nope" disabled selected onPress={() => undefined} testID="c" />, scheme);
      const style = pressableStyle(screen.getByTestId('c'));
      expect(style.opacity).toBeUndefined();
      expect(style.backgroundColor).toBe(colors.disabledBg);
      expect(style.borderColor).toBe(colors.disabledFg);
      expect(flattenStyle(screen.getByText('Nope').props.style).color).toBe(colors.disabledFg);
      expect(contrastRatio(colors.disabledFg, colors.disabledBg)).toBeGreaterThanOrEqual(3);
    });

    it.each(BOTH_THEMES)('cannot be mistaken for a selected chip in %s', async (scheme) => {
      const colors = colorsFor(scheme);
      expect(contrastRatio(colors.disabledBg, colors.cta)).toBeGreaterThanOrEqual(3);
    });
  });

  /**
   * Web screen readers could not hear which chip was current: react-native-web
   * turns `accessibilityRole="button"` into `role="button"`, and `aria-selected`
   * is not allowed there, so the state was dropped. Native keeps the button
   * role; web gets radio/checkbox with `aria-checked`.
   */
  describe('selection is exposed on every platform', () => {
    it('keeps the native button + selected state on ios and android', () => {
      for (const os of ['ios', 'android'] as const) {
        const props = chipAccessibilityProps(os, {
          label: 'Dark',
          selected: true,
          disabled: false,
          selectionRole: 'radio',
        });
        expect(props.accessibilityRole).toBe('button');
        expect(props.accessibilityLabel).toBe('Dark');
        expect(props.accessibilityState).toMatchObject({ selected: true, disabled: false });
        expect(props.role).toBeUndefined();
      }
    });

    it.each([
      ['radio', 'a single-select group such as Appearance'],
      ['checkbox', 'an independent filter toggle'],
    ] as const)('maps to role=%s on web for %s', (selectionRole) => {
      const on = chipAccessibilityProps('web', {
        label: 'Dark',
        selected: true,
        disabled: false,
        selectionRole,
      });
      const off = chipAccessibilityProps('web', {
        label: 'Light',
        selected: false,
        disabled: true,
        selectionRole,
      });
      expect(on.role).toBe(selectionRole);
      expect(on['aria-checked']).toBe(true);
      expect(on['aria-label']).toBe('Dark');
      // `aria-selected` is never emitted: it is invalid on both of these roles.
      expect(on['aria-selected']).toBeUndefined();
      expect(off['aria-checked']).toBe(false);
      expect(off['aria-disabled']).toBe(true);
    });

    it('defaults to the checkbox role when the caller says nothing', async () => {
      await renderInTheme(<Chip label="Cardio" selected onPress={() => undefined} testID="c" />);
      // Native render path, so the button role is what reaches the tree…
      expect(screen.getByTestId('c').props.accessibilityRole).toBe('button');
      // …and the default the web branch would use is the toggle role.
      expect(
        chipAccessibilityProps('web', {
          label: 'Cardio',
          selected: true,
          disabled: false,
          selectionRole: 'checkbox',
        }).role,
      ).toBe('checkbox');
    });
  });

  it('adds enough hitSlop to reach the platform minimum target', async () => {
    await renderInTheme(<Chip label="Small" onPress={() => undefined} testID="c" />);
    const slop = screen.getByTestId('c').props.hitSlop as number;
    expect(slop).toBe(hitSlopFor(32, Platform.OS));
    expect(32 + slop * 2).toBeGreaterThanOrEqual(minTouchTarget(Platform.OS));
  });

  it('dims and shrinks on press', async () => {
    await renderInTheme(<Chip label="Press" onPress={() => undefined} testID="c" />);
    await pressIn(screen.getByTestId('c'));
    const style = pressableStyle(screen.getByTestId('c'));
    expect(style.transform).toEqual([{ scale: 0.98 }]);
    expect(style.opacity).toBe(0.92);
  });

  it('stops shrinking under reduced motion', async () => {
    mockReducedMotion(true);
    await renderInTheme(<Chip label="Press" onPress={() => undefined} testID="c" />);
    await pressIn(screen.getByTestId('c'));
    expect(pressableStyle(screen.getByTestId('c')).transform).toEqual([{ scale: 1 }]);
  });

  it('never shrinks below a 32pt pill', async () => {
    await renderInTheme(<Chip label="Tag" testID="c" />);
    expect(flattenStyle(screen.getByTestId('c').props.style).minHeight).toBe(32);
  });
});
