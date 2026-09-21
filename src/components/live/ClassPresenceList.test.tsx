import { render, screen } from '@testing-library/react-native';

import { ClassPresenceList } from './ClassPresenceList';

const ENTRIES = [
  { userId: 'u-jordan', fullName: 'Jordan Lee' },
  { userId: 'u-sam', fullName: 'Sam Rivera' },
];

describe('ClassPresenceList', () => {
  it('lists everyone in the call and marks the viewer', async () => {
    await render(
      <ClassPresenceList entries={ENTRIES} unavailable={false} currentUserId="u-jordan" />,
    );
    expect(screen.getByText('In this class (2)')).toBeTruthy();
    expect(screen.getByText('Jordan Lee (you)')).toBeTruthy();
    expect(screen.getByText('Sam Rivera')).toBeTruthy();
  });

  it('truncates a long name rather than pushing the row off screen', async () => {
    await render(
      <ClassPresenceList
        entries={[{ userId: 'u-x', fullName: 'Bartholomew Fitzgerald-Montgomery III' }]}
        unavailable={false}
      />,
    );
    expect(screen.getByText('Bartholomew Fitzgerald-Montgomery III').props.numberOfLines).toBe(1);
  });

  it('reserves space while presence is still connecting, and never claims an empty class', async () => {
    await render(<ClassPresenceList entries={[]} unavailable={false} />);
    expect(screen.getByTestId('presence-connecting')).toBeTruthy();
    expect(screen.getByText('Connecting…')).toBeTruthy();
    expect(screen.getByText('In this class (0)')).toBeTruthy();
  });

  it('says the list is unavailable in words and an icon, and reassures about the call', async () => {
    await render(<ClassPresenceList entries={[]} unavailable />);
    expect(screen.getByText('Participant list unavailable')).toBeTruthy();
    expect(screen.getByText('You are still in the class.')).toBeTruthy();
    // No count is claimed when the channel could not report one.
    expect(screen.getByText('In this class')).toBeTruthy();
    expect(screen.queryByText('In this class (0)')).toBeNull();
    expect(screen.getByTestId('presence-unavailable').props.accessibilityRole).toBe('alert');
  });
});
