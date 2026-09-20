export interface PushService {
  /**
   * True for the console-logging stand-in adapter. Its token is a fixed fake string shared by
   * every device, so callers must never write it to `push_tokens` — the reminder Edge Function
   * would then send real pushes to a token Expo cannot deliver to, and (worse) every dev/test
   * device would collide on the same row. Checked explicitly rather than sniffing the token text.
   */
  readonly isMock: boolean;
  /**
   * Requests notification permission and returns this device's Expo push token, or null when the
   * user denies it or push is unavailable (simulator, web, adapter not installed). Never throws.
   */
  registerForPushAsync(): Promise<string | null>;
  /** @deprecated Alias of registerForPushAsync, kept so older call sites keep compiling. */
  registerForPushNotifications(): Promise<string | null>;
  scheduleLocalNotification(title: string, body: string, triggerSeconds?: number): Promise<string>;
}
