import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { SUPPORT_EMAIL } from '../../config/legal';
import { billingLinkAllowed, billingUrl, MANAGED_BY_DBF } from './billing';
import { GraceBanner } from './GraceBanner';
import {
  NEUTRAL_BODY,
  REQUIRED_COPY,
  SubscriptionRequiredPanel,
} from './SubscriptionRequiredPanel';

const OLD_URL = process.env.EXPO_PUBLIC_BILLING_URL;
const OLD_FLAG = process.env.EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK;

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  restore('EXPO_PUBLIC_BILLING_URL', OLD_URL);
  restore('EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK', OLD_FLAG);
  jest.restoreAllMocks();
});

/** A store build: the flag is unset, exactly as eas.json leaves it. */
function storeBuild() {
  delete process.env.EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK;
  process.env.EXPO_PUBLIC_BILLING_URL = 'https://pay.example/dbf';
}

/** Off-store distribution that has explicitly opted in. */
function linkAllowedBuild() {
  process.env.EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK = 'true';
  process.env.EXPO_PUBLIC_BILLING_URL = 'https://pay.example/dbf';
}

const grace = { state: 'grace', currentPeriodEnd: null, daysOverdue: 3, graceDaysLeft: 7 } as const;

describe('billingLinkAllowed (store-compliance flag)', () => {
  it('defaults to false, and suppresses the URL even when one is configured', () => {
    storeBuild();
    expect(billingLinkAllowed()).toBe(false);
    expect(billingUrl()).toBeNull();
  });

  it('is false for any value other than the exact string "true"', () => {
    process.env.EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK = 'TRUE';
    expect(billingLinkAllowed()).toBe(false);
    process.env.EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK = '1';
    expect(billingLinkAllowed()).toBe(false);
  });

  it('opts in only on the exact string, and then returns the URL', () => {
    linkAllowedBuild();
    expect(billingLinkAllowed()).toBe(true);
    expect(billingUrl()).toBe('https://pay.example/dbf');
  });

  it('still has no URL when the opt-in is on but nothing is configured', () => {
    process.env.EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK = 'true';
    delete process.env.EXPO_PUBLIC_BILLING_URL;
    expect(billingUrl()).toBeNull();
  });
});

describe('SubscriptionRequiredPanel — store build (no purchase link)', () => {
  it.each(['expired', 'none'] as const)('%s: neutral copy, support mailto, no CTA', async (state) => {
    storeBuild();
    await render(<SubscriptionRequiredPanel state={state} />);

    expect(screen.getByText(new RegExp(MANAGED_BY_DBF.slice(0, 40)))).toBeTruthy();
    expect(screen.getByTestId('membership-support')).toBeTruthy();
    // No purchase call to action of any kind (Apple 3.1.1 / Play Payments).
    expect(screen.queryByText('Renew subscription')).toBeNull();
    expect(screen.queryByText('Subscribe')).toBeNull();
  });

  it('the only link on the panel opens the mail app, never a payment page', async () => {
    storeBuild();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    await render(<SubscriptionRequiredPanel state="expired" />);

    await fireEvent.press(screen.getByTestId('membership-support'));

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toContain(`mailto:${SUPPORT_EMAIL}`);
  });

  it('keeps the "I’ve renewed — check again" recheck, which is not a purchase link', async () => {
    storeBuild();
    const onRecheck = jest.fn();
    await render(<SubscriptionRequiredPanel state="expired" onRecheck={onRecheck} />);

    await fireEvent.press(screen.getByText('I’ve renewed — check again'));
    expect(onRecheck).toHaveBeenCalled();
  });
});

describe('SubscriptionRequiredPanel — opted-in build', () => {
  it('none: the CTA opens the billing URL', async () => {
    linkAllowedBuild();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    await render(<SubscriptionRequiredPanel state="none" />);

    expect(screen.getByText('Workout notes are for members')).toBeTruthy();
    await fireEvent.press(screen.getByText('Subscribe'));
    expect(open).toHaveBeenCalledWith('https://pay.example/dbf');
  });
});

describe('GraceBanner', () => {
  it('grace: keeps the overdue reminder but drops the "Renew now" button in a store build', async () => {
    storeBuild();
    await render(<GraceBanner info={grace} />);

    expect(screen.getByText('Payment overdue')).toBeTruthy();
    expect(screen.getByText(/3 days overdue/)).toBeTruthy();
    expect(screen.getByText(MANAGED_BY_DBF)).toBeTruthy();
    expect(screen.getByTestId('membership-support')).toBeTruthy();
    expect(screen.queryByText('Renew now')).toBeNull();
  });

  it('grace: shows "Renew now" only in an opted-in build', async () => {
    linkAllowedBuild();
    await render(<GraceBanner info={grace} />);

    expect(screen.getByText('Renew now')).toBeTruthy();
    expect(screen.queryByTestId('membership-support')).toBeNull();
  });
});

describe('active and staff states', () => {
  it('have no subscription surface to soften: the panel only accepts expired and none', () => {
    // `active` and `staff` members never reach these components — the screens render their
    // real content instead — so the store-compliance contract for those states is that no
    // billing copy exists for them at all. The key set is that contract, checked statically.
    expect(Object.keys(REQUIRED_COPY).sort()).toEqual(['expired', 'none']);
    expect(Object.keys(NEUTRAL_BODY).sort()).toEqual(['expired', 'none']);
  });
});
