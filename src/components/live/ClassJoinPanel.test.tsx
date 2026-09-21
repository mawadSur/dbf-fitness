import { fireEvent, render, screen } from '@testing-library/react-native';

import { ClassJoinPanel } from './ClassJoinPanel';

const BASE = {
  enabled: true,
  joining: false,
  errorMessage: null,
  disabledReason: null,
  infoMessage: null,
  onPress: () => {},
};

describe('ClassJoinPanel', () => {
  it('offers Join class when the member may join, with no hint to explain away', async () => {
    const onPress = jest.fn();
    await render(<ClassJoinPanel {...BASE} onPress={onPress} />);
    const join = screen.getByLabelText('Join class');
    expect(join.props.accessibilityState.disabled).toBe(false);
    expect(join.props.accessibilityHint).toBeUndefined();
    await fireEvent.press(join);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a disabled Join says why, on screen and to a screen reader', async () => {
    await render(
      <ClassJoinPanel
        {...BASE}
        enabled={false}
        disabledReason="Your subscription has lapsed. Renew to join live classes."
        infoMessage="This class has ended."
      />,
    );
    const join = screen.getByLabelText('Join class');
    expect(join.props.accessibilityState.disabled).toBe(true);
    expect(join.props.accessibilityHint).toBe(
      'Your subscription has lapsed. Renew to join live classes.',
    );
    expect(screen.getByText('This class has ended.')).toBeTruthy();
  });

  it('shows a busy, non-pressable action while the join is in flight', async () => {
    const onPress = jest.fn();
    await render(<ClassJoinPanel {...BASE} joining onPress={onPress} />);
    const join = screen.getByLabelText('Join class');
    expect(join.props.accessibilityState.busy).toBe(true);
    expect(screen.getByText('Connecting you to the class…')).toBeTruthy();
    await fireEvent.press(join);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('announces a failed join and turns the action into Try again', async () => {
    await render(<ClassJoinPanel {...BASE} errorMessage="Could not reach the server." />);
    expect(screen.getByLabelText('Try joining again')).toBeTruthy();
    expect(screen.getByText('Could not join the class')).toBeTruthy();
    expect(screen.getByText('Could not reach the server.')).toBeTruthy();
    expect(screen.getByTestId('class-join-error').props.accessibilityRole).toBe('alert');
  });
});
