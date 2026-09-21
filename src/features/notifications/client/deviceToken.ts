/**
 * Reads this device's Expo push token WITHOUT ever prompting.
 *
 * The live-class screen still owns the permission prompt (it asks in context,
 * where the member understands why). The root-level registrar must stay
 * silent: it only picks the token up when permission is already granted, so
 * opening the app never produces a cold, contextless iOS dialog.
 *
 * expo-notifications / expo-device are native-only, so they are lazily
 * `require`d inside platform guards — web, Jest and Expo Go never load them.
 */

import { Platform } from 'react-native';

import { isPhysicalDevice, resolveProjectId } from '../../../services/push/realPushService';

type NotificationsModule = typeof import('expo-notifications');

/** Lazy, guarded load. Returns null on web or when the module is absent (Expo Go/Jest). */
export function loadNotifications(): NotificationsModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

/** True only when the user has ALREADY granted notification permission. Never asks. */
export async function hasGrantedNotificationPermission(): Promise<boolean> {
  const Notifications = loadNotifications();
  if (!Notifications) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * This device's Expo push token, or null for every non-fatal reason there is:
 * web, simulator, permission not granted yet, no EAS projectId, module missing.
 * Never throws — a missing token only ever means "no push", never a broken app.
 */
export async function getExistingPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const Notifications = loadNotifications();
    if (!Notifications || !isPhysicalDevice()) return null;
    if (!(await hasGrantedNotificationPermission())) return null;

    const projectId = resolveProjectId();
    if (!projectId) return null;

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token?.data ?? null;
  } catch {
    return null;
  }
}
