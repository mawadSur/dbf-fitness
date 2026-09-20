import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChecklistRow } from './ChecklistRow';
import { CHECK_TARGET_SIZE } from './ui/ChecklistRow';

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return (style ?? {}) as Record<string, unknown>;
}

describe('ChecklistRow', () => {
  it('labels the checkbox with the row label and reflects checked state', async () => {
    const onToggle = jest.fn();
    await render(<ChecklistRow label="Squats" sublabel="3x10" checked onToggle={onToggle} />);
    const box = screen.getByRole('checkbox', { name: 'Squats' });
    expect(box.props.accessibilityState.checked).toBe(true);
    // The row now delegates to the design-system component, whose toggle target
    // is a single 48pt square (>= 44pt iOS and >= 48dp Android).
    const style = flatten(box.props.style);
    expect(style.width).toBe(CHECK_TARGET_SIZE);
    expect(style.height).toBe(CHECK_TARGET_SIZE);
    await fireEvent.press(box);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('only exposes a details button when onPress is provided', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(
      <ChecklistRow label="Squats" checked={false} onToggle={jest.fn()} />
    );
    expect(screen.queryByRole('button')).toBeNull();
    await rerender(
      <ChecklistRow label="Squats" checked={false} onToggle={jest.fn()} onPress={onPress} />
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Squats, details' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('truncates long labels instead of pushing the layout', async () => {
    await render(
      <ChecklistRow label={'Very long name '.repeat(20)} checked={false} onToggle={jest.fn()} />
    );
    expect(screen.getByText(/Very long name/).props.numberOfLines).toBe(2);
  });
});
