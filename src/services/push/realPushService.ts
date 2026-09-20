import { Platform } from 'react-native';

import type { PushService } from './types';

type NotificationsModule = typeof import('expo-notifications');

const ANDROID_CHANNEL_ID = 'default';
let handlerInstalled = false;

/** Lazy, guarded load: expo-notifications must never be imported by web/Jest/shared paths. */
function loadNotifications(): NotificationsModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

/** True on a physical device (simulators/emulators cannot receive Expo push tokens). */
export function isPhysicalDevice(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Device = require('expo-device') as typeof import('expo-device');
    return Device.isDevice === true;
  } catch {
    return false;
  }
}

/** EAS projectId from EXPO_PUBLIC_EAS_PROJECT_ID or expo-constants (extra.eas.projectId / easConfig). */
export function resolveProjectId(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (fromEnv) return fromEnv;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = (require('expo-constants') as typeof import('expo-constants')).default;
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
  } catch {
    return undefined;
  }
}

function installForegroundHandler(Notifications: NotificationsModule) {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Real Expo Notifications adapter (physical iOS/Android device builds). Never throws from
 * registration: denial or any failure yields null, which callers treat as non-fatal.
 */
export function createRealPushService(): PushService {
  const registerForPushAsync = async (): Promise<string | null> => {
    try {
      const Notifications = loadNotifications();
      if (!Notifications || !isPhysicalDevice()) return null;

      installForegroundHandler(Notifications);

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: 'Class reminders',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        });
      }

      let { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        ({ status } = await Notifications.requestPermissionsAsync());
      }
      if (status !== 'granted') return null;

      const projectId = resolveProjectId();
      if (!projectId) {
        console.warn('[push:real] No EAS projectId (extra.eas.projectId / EXPO_PUBLIC_EAS_PROJECT_ID); push token skipped.');
        return null;
      }
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      return token.data;
    } catch (error) {
      console.warn('[push:real] push registration failed:', error);
      return null;
    }
  };

  return {
    isMock: false,
    registerForPushAsync,
    registerForPushNotifications: registerForPushAsync,

    async scheduleLocalNotification(title, body, triggerSeconds = 0) {
      const Notifications = loadNotifications();
      if (!Notifications) throw new Error('[push:real] expo-notifications is unavailable on this platform.');
      installForegroundHandler(Notifications);
      return Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger:
          triggerSeconds > 0
            ? {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: triggerSeconds,
                channelId: ANDROID_CHANNEL_ID,
              }
            : null,
      });
    },
  };
}
