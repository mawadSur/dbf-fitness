import { act, renderHook } from '@testing-library/react-native';

import { createPushService } from '../../services/push';
import type { PushService } from '../../services/push';
import { fetchCurrentMember, upsertPushToken } from './api';
import { NO_PUSH_TOKEN_MESSAGE, resetPushTokenWarning, usePushRegistration } from './usePushRegistration';

jest.mock('./api', () => ({
  fetchCurrentMember: jest.fn(),
  upsertPushToken: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/push', () => ({ createPushService: jest.fn() }));

const JORDAN = { id: 'u-jordan', fullName: 'Jordan Lee', role: 'member' as const };
const COACH = { id: 'u-dana', fullName: 'Dana Reyes', role: 'coach' as const };

function pushService(overrides: Partial<PushService> = {}): PushService {
  return {
    isMock: false,
    registerForPushAsync: jest.fn().mockResolvedValue('ExponentPushToken[real-device]'),
    registerForPushNotifications: jest.fn().mockResolvedValue('ExponentPushToken[real-device]'),
    scheduleLocalNotification: jest.fn().mockResolvedValue('id'),
    ...overrides,
  };
}

/** Lets the registration promise chain inside the effect settle. */
const flush = () => act(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
  (fetchCurrentMember as jest.Mock).mockResolvedValue(JORDAN);
  resetPushTokenWarning();
});

describe('usePushRegistration', () => {
  it('persists the token from a real adapter', async () => {
    (createPushService as jest.Mock).mockReturnValue(pushService());

    await act(async () => {
      renderHook(() => usePushRegistration());
    });
    await flush();

    expect(upsertPushToken).toHaveBeenCalledTimes(1);
    expect(upsertPushToken).toHaveBeenCalledWith(JORDAN.id, 'ExponentPushToken[real-device]');
  });

  // The mock adapter returns one fixed fake token for every device; writing it to push_tokens
  // would give the reminder function an undeliverable row shared by every dev machine.
  it('never persists a token from the mock adapter, even though one is returned', async () => {
    const service = pushService({
      isMock: true,
      registerForPushAsync: jest.fn().mockResolvedValue('ExponentPushToken[mock-dbf-device]'),
    });
    (createPushService as jest.Mock).mockReturnValue(service);

    await act(async () => {
      renderHook(() => usePushRegistration());
    });
    await flush();

    expect(service.registerForPushAsync).toHaveBeenCalled();
    expect(upsertPushToken).not.toHaveBeenCalled();
  });

  it('does not register coaches, and does not persist when no token is available', async () => {
    (createPushService as jest.Mock).mockReturnValue(pushService());
    (fetchCurrentMember as jest.Mock).mockResolvedValue(COACH);
    await act(async () => {
      renderHook(() => usePushRegistration());
    });
    await flush();
    expect(upsertPushToken).not.toHaveBeenCalled();

    (fetchCurrentMember as jest.Mock).mockResolvedValue(JORDAN);
    (createPushService as jest.Mock).mockReturnValue(
      pushService({ registerForPushAsync: jest.fn().mockResolvedValue(null) })
    );
    await act(async () => {
      renderHook(() => usePushRegistration());
    });
    await flush();
    expect(upsertPushToken).not.toHaveBeenCalled();
  });

  it('reports a null token from a real adapter as a one-time console.error, not a quiet warn', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (createPushService as jest.Mock).mockReturnValue(
      pushService({ registerForPushAsync: jest.fn().mockResolvedValue(null) })
    );
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        renderHook(() => usePushRegistration());
      });
      await flush();
    }
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(NO_PUSH_TOKEN_MESSAGE);
    expect(NO_PUSH_TOKEN_MESSAGE).toMatch(/EAS projectId/);
    expect(warn).not.toHaveBeenCalled();
    expect(upsertPushToken).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });

  it('stays quiet about a null token from the mock adapter', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (createPushService as jest.Mock).mockReturnValue(
      pushService({ isMock: true, registerForPushAsync: jest.fn().mockResolvedValue(null) })
    );
    await act(async () => {
      renderHook(() => usePushRegistration());
    });
    await flush();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
