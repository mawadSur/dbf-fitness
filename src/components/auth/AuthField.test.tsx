/**
 * The auth text field's own guarantees. The screen-level state matrix lives in
 * src/features/auth/authScreenStates.test.tsx; this file pins the two things
 * that are properties of the field itself: the focus indicator it paints, and
 * the browser focus ring it has to suppress on web so the two do not stack.
 */
import { fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { flattenStyle, renderInTheme } from '../ui/testing';
import { AuthField } from './AuthField';

const input = () => screen.getByTestId('field');
const inputStyle = () => flattenStyle(input().props.style);
/** The bordered box is the TextInput's parent view. */
const boxStyle = () => flattenStyle(input().parent?.props.style);

function field(props: Partial<React.ComponentProps<typeof AuthField>> = {}) {
  return (
    <AuthField testID="field" label="Email" value="" onChangeText={() => undefined} {...props} />
  );
}

describe('AuthField focus indicator', () => {
  it('paints a 2px token-coloured border on focus, so the field is never focused silently', async () => {
    await renderInTheme(field());
    expect(boxStyle().borderWidth).toBe(1);

    await fireEvent(input(), 'focus');
    expect(boxStyle().borderWidth).toBe(2);
  });

  it('keeps the 2px border in the error state and marks the input invalid', async () => {
    await renderInTheme(field({ error: 'Enter a valid email address.' }));
    expect(boxStyle().borderWidth).toBe(2);
    expect(input().props['aria-invalid']).toBe(true);
    expect(screen.getByTestId('field-message')).toHaveTextContent('Enter a valid email address.');
  });
});

describe('AuthField at large text sizes', () => {
  it('bounds the box with minHeight, never height, so scaled text cannot be clipped', async () => {
    await renderInTheme(field());
    const box = boxStyle();
    expect(box.minHeight).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeUndefined();
  });

  it('never truncates the label or the error, and leaves font scaling on', async () => {
    await renderInTheme(field({ error: 'Enter a valid email address, like you@example.com.' }));
    for (const node of [screen.getByText('Email'), screen.getByTestId('field-message')]) {
      expect(node.props.numberOfLines).toBeUndefined();
      expect(node.props.allowFontScaling).not.toBe(false);
    }
  });
});

describe('AuthField web focus ring', () => {
  it('suppresses the browser outline on web, because we draw our own ring', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await renderInTheme(field());
    expect(inputStyle().outlineStyle).toBe('none');
  });

  it('leaves native styling alone (there is no UA outline to suppress)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await renderInTheme(field());
    expect(inputStyle().outlineStyle).toBeUndefined();
  });
});
