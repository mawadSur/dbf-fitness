import { fireEvent, screen } from '@testing-library/react-native';

import { contrastRatio } from '../../theme/contrast';
import { Input, INPUT_MIN_HEIGHT } from './Input';
import { BOTH_THEMES, colorsFor, flattenStyle, INCLUDING_HIDDEN, renderInTheme } from './testing';

const base = { label: 'Email', value: '', onChangeText: () => undefined };

/** The bordered box is the TextInput's parent; its style holds the focus ring. */
function fieldBox(testID = 'field') {
  return flattenStyle(screen.getByTestId(testID).parent?.props.style);
}

describe('Input', () => {
  it('labels the field above it and on the field itself', async () => {
    await renderInTheme(<Input {...base} testID="field" />);
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByTestId('field').props.accessibilityLabel).toBe('Email');
  });

  it('says "required" in words rather than with a colour', async () => {
    await renderInTheme(<Input {...base} required testID="field" />);
    expect(screen.getByText('Email (required)')).toBeTruthy();
  });

  it('is at least 48pt tall', async () => {
    await renderInTheme(<Input {...base} testID="field" />);
    expect(fieldBox().minHeight).toBe(INPUT_MIN_HEIGHT);
    expect(INPUT_MIN_HEIGHT).toBeGreaterThanOrEqual(48);
  });

  it('reports typing back to the caller', async () => {
    const onChangeText = jest.fn();
    await renderInTheme(<Input {...base} onChangeText={onChangeText} testID="field" />);
    await fireEvent.changeText(screen.getByTestId('field'), 'me@example.com');
    expect(onChangeText).toHaveBeenCalledWith('me@example.com');
  });

  it('rests on the strong border and grows a focus ring when focused', async () => {
    await renderInTheme(<Input {...base} testID="field" />, 'light');
    expect(fieldBox().borderColor).toBe(colorsFor('light').borderStrong);
    expect(fieldBox().borderWidth).toBe(1);

    await fireEvent(screen.getByTestId('field'), 'focus');
    expect(fieldBox().borderColor).toBe(colorsFor('light').focus);
    expect(fieldBox().borderWidth).toBe(2);
  });

  it('drops the focus ring on blur', async () => {
    await renderInTheme(<Input {...base} testID="field" />, 'light');
    await fireEvent(screen.getByTestId('field'), 'focus');
    await fireEvent(screen.getByTestId('field'), 'blur');
    expect(fieldBox().borderColor).toBe(colorsFor('light').borderStrong);
  });

  it('shows helper text with an info icon', async () => {
    await renderInTheme(<Input {...base} helperText="We never share it." testID="field" />);
    expect(screen.getByText('We never share it.')).toBeTruthy();
    expect(screen.getByTestId('icon-info', INCLUDING_HIDDEN)).toBeTruthy();
  });

  it('replaces the helper with the error, next to the field, with a warning icon', async () => {
    await renderInTheme(
      <Input {...base} helperText="We never share it." error="Enter a valid email address." testID="field" />,
    );
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.queryByText('We never share it.')).toBeNull();
    expect(screen.getByTestId('icon-alert-triangle', INCLUDING_HIDDEN)).toBeTruthy();
  });

  it('marks the field invalid and paints the danger border when it has an error', async () => {
    await renderInTheme(<Input {...base} error="Required." testID="field" />, 'light');
    expect(screen.getByTestId('field').props['aria-invalid']).toBe(true);
    expect(fieldBox().borderColor).toBe(colorsFor('light').danger);
    expect(fieldBox().borderWidth).toBe(2);
  });

  it('hands the error to the screen reader as the field hint', async () => {
    await renderInTheme(<Input {...base} error="Required." testID="field" />);
    expect(screen.getByTestId('field').props.accessibilityHint).toBe('Required.');
  });

  it('masks a password and reveals it through a labelled toggle', async () => {
    await renderInTheme(<Input {...base} label="Password" secureTextEntry testID="field" />);
    expect(screen.getByTestId('field').props.secureTextEntry).toBe(true);

    const toggle = screen.getByRole('button', { name: 'Show password' });
    await fireEvent.press(toggle);
    expect(screen.getByTestId('field').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide password' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('has no reveal toggle on a plain field', async () => {
    await renderInTheme(<Input {...base} testID="field" />);
    expect(screen.queryByTestId('input-reveal')).toBeNull();
  });

  it('passes the mobile keyboard hints straight through', async () => {
    await renderInTheme(
      <Input
        {...base}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoCapitalize="none"
        returnKeyType="done"
        testID="field"
      />,
    );
    const field = screen.getByTestId('field');
    expect(field.props.keyboardType).toBe('email-address');
    expect(field.props.autoComplete).toBe('email');
    expect(field.props.textContentType).toBe('emailAddress');
    expect(field.props.autoCapitalize).toBe('none');
    expect(field.props.returnKeyType).toBe('done');
  });

  it('submits from the keyboard', async () => {
    const onSubmitEditing = jest.fn();
    await renderInTheme(<Input {...base} onSubmitEditing={onSubmitEditing} testID="field" />);
    await fireEvent(screen.getByTestId('field'), 'submitEditing');
    expect(onSubmitEditing).toHaveBeenCalledTimes(1);
  });

  it('grows and top-aligns when multiline', async () => {
    await renderInTheme(<Input {...base} multiline testID="field" />);
    const style = flattenStyle(screen.getByTestId('field').props.style);
    expect(style.minHeight).toBe(96);
    expect(style.textAlignVertical).toBe('top');
  });

  it('is not editable when disabled, and says so', async () => {
    await renderInTheme(<Input {...base} disabled testID="field" />);
    expect(screen.getByTestId('field').props.editable).toBe(false);
    expect(screen.getByTestId('field').props.accessibilityState).toMatchObject({ disabled: true });
  });

  /**
   * `opacity: 0.45` over the live skin faded the border, the value and the
   * placeholder by the same alpha, so in dark mode a disabled field was a
   * smudge you could not read the current value out of. The disabled pair
   * replaces it — the field still SHOWS its value, it just cannot be edited.
   */
  it.each(BOTH_THEMES)('takes the disabled fill/label pair in %s, not an alpha', async (scheme) => {
    const colors = colorsFor(scheme);
    await renderInTheme(<Input {...base} value="jordan@example.test" disabled testID="field" />, scheme);
    const box = fieldBox();
    expect(box.opacity).toBeUndefined();
    expect(box.backgroundColor).toBe(colors.disabledBg);
    expect(box.borderColor).toBe(colors.disabledFg);
    const field = screen.getByTestId('field');
    expect(flattenStyle(field.props.style).color).toBe(colors.disabledFg);
    expect(field.props.placeholderTextColor).toBe(colors.disabledFg);
    expect(contrastRatio(colors.disabledFg, colors.disabledBg)).toBeGreaterThanOrEqual(3);
  });

  it('draws itself from the dark palette', async () => {
    await renderInTheme(<Input {...base} testID="field" />, 'dark');
    expect(fieldBox().backgroundColor).toBe(colorsFor('dark').surface);
    expect(flattenStyle(screen.getByTestId('field').props.style).color).toBe(colorsFor('dark').text);
  });
});
