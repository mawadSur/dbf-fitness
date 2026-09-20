import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { GraceBanner } from './GraceBanner';
import { SubscriptionRequiredPanel } from './SubscriptionRequiredPanel';

const OLD = process.env.EXPO_PUBLIC_BILLING_URL;
afterEach(() => {
  if (OLD === undefined) delete process.env.EXPO_PUBLIC_BILLING_URL;
  else process.env.EXPO_PUBLIC_BILLING_URL = OLD;
  jest.restoreAllMocks();
});

describe('SubscriptionRequiredPanel', () => {
  it('expired copy + contact-coach fallback when no billing URL', async () => {
    delete process.env.EXPO_PUBLIC_BILLING_URL;
    await render(<SubscriptionRequiredPanel state="expired" />);
    expect(screen.getByText('Your subscription has lapsed')).toBeTruthy();
    expect(screen.getByText('Contact your coach to renew.')).toBeTruthy();
    expect(screen.queryByLabelText('Renew subscription')).toBeNull();
  });

  it('none copy; CTA opens the billing URL', async () => {
    process.env.EXPO_PUBLIC_BILLING_URL = 'https://pay.example/dbf';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    await render(<SubscriptionRequiredPanel state="none" />);
    expect(screen.getByText('Subscribe to unlock workout notes')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Subscribe'));
    expect(open).toHaveBeenCalledWith('https://pay.example/dbf');
  });
});

describe('GraceBanner', () => {
  it('shows the grace reminder copy', async () => {
    delete process.env.EXPO_PUBLIC_BILLING_URL;
    await render(<GraceBanner info={{ state: 'grace', currentPeriodEnd: null, daysOverdue: 3, graceDaysLeft: 7 }} />);
    expect(screen.getByText('Payment overdue')).toBeTruthy();
    expect(screen.getByText(/3 days overdue/)).toBeTruthy();
    expect(screen.getByText('Contact your coach to renew.')).toBeTruthy();
  });
});
