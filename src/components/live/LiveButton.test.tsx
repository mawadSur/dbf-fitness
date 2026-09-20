import { render, screen } from '@testing-library/react-native';

import { CallControlsBar } from './CallControlsBar';
import { LiveButton } from './LiveButton';

describe('LiveButton disabled contrast', () => {
  it('uses a dark label on a light background (not white on slate-300)', async () => {
    await render(<LiveButton label="Subscription required" onPress={() => {}} disabled />);
    const label = screen.getByText('Subscription required');
    expect(label.props.className).toContain('text-slate-600');
    expect(label.props.className).not.toContain('text-white');
    const button = screen.getByLabelText('Subscription required');
    expect(button.props.className).toContain('bg-slate-200');
    expect(button.props.className).not.toContain('bg-slate-300');
  });
});

describe('CallControlsBar', () => {
  it('does not add a bottom safe-area inset inside the tab shell', async () => {
    await render(
      <CallControlsBar muted={false} cameraOff={false} onToggleMute={() => {}} onToggleCamera={() => {}} onLeave={() => {}} />,
    );
    expect(screen.getByLabelText('Leave')).toBeTruthy();
    const bar = screen.getByLabelText('Leave').parent;
    expect(JSON.stringify(bar?.props.style ?? null)).not.toContain('paddingBottom');
  });
});
