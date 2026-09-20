import type { SubscriptionInfo } from '../subscriptions/state';

/**
 * What the notes screens do for the signed-in user, given their subscription.
 *
 * Published workout notes sit behind the subscription exactly like live classes: `active` and
 * `grace` members read them, `expired` / `none` members are blocked, coaches and admins are not
 * affected. The server is the enforcement point (it returns zero rows / denies), so this only
 * chooses the screen — it exists so a blocked member sees a reason and a way to renew instead of
 * an empty list or a raw error.
 */
export type NotesGate =
  | { kind: 'open' }
  | { kind: 'checking' }
  | { kind: 'grace'; info: SubscriptionInfo }
  | { kind: 'blocked'; reason: 'expired' | 'none' };

export function notesGate(input: {
  isCoach: boolean;
  info: SubscriptionInfo | undefined;
  loading: boolean;
}): NotesGate {
  if (input.isCoach) return { kind: 'open' };
  if (!input.info) {
    // Still asking: hold the screen. A failed lookup opens it — the server still filters rows, and
    // hiding notes from a paying member because the state RPC blipped would be the worse failure.
    return input.loading ? { kind: 'checking' } : { kind: 'open' };
  }
  switch (input.info.state) {
    case 'expired':
      return { kind: 'blocked', reason: 'expired' };
    case 'none':
      return { kind: 'blocked', reason: 'none' };
    case 'grace':
      return { kind: 'grace', info: input.info };
    default:
      return { kind: 'open' };
  }
}
