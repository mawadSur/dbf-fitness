import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SubscriptionInfo } from '../../features/subscriptions/state';
import { GraceNotice } from './GraceNotice';

const info: SubscriptionInfo = {
  state: 'grace',
  currentPeriodEnd: '2026-09-16T00:00:00Z',
  daysOverdue: 3,
  graceDaysLeft: 7,
};

describe('GraceNotice', () => {
  it('lets the member back out to Join without joining', async () => {
    const onJoinAnyway = jest.fn();
    const onDismiss = jest.fn();
    await render(<GraceNotice info={info} onJoinAnyway={onJoinAnyway} onDismiss={onDismiss} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onJoinAnyway).not.toHaveBeenCalled();
  });

  it('joins on "Join anyway" and hides "Not now" when no dismiss handler is given', async () => {
    const onJoinAnyway = jest.fn();
    await render(<GraceNotice info={info} onJoinAnyway={onJoinAnyway} />);
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Join anyway' }));
    expect(onJoinAnyway).toHaveBeenCalledTimes(1);
  });
});
