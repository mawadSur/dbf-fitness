import type { RtcErrorCode } from '../../services/video/credentials';
import type { SubscriptionInfo } from '../subscriptions/state';
import { canJoinLive } from '../subscriptions/state';
import type { LiveClassStatus } from './status';

/** Why a member is blocked: `expired` = had a subscription that lapsed, `required` = none/unknown. */
export type BlockedReason = 'expired' | 'required';

export type JoinDecision =
  /** Joining is fine (active or staff). */
  | { kind: 'allowed' }
  /** Late payer inside the grace window: may join, but is shown the payment notice first. */
  | { kind: 'needs-grace-notice' }
  /** No live access for this member. */
  | { kind: 'blocked'; reason: BlockedReason }
  /** The server (agora-rtc-token) refused although the client thought access was fine. */
  | { kind: 'server-denied'; reason: 'not_entitled' }
  /** The class cannot be joined any more (or never existed). */
  | { kind: 'closed'; reason: 'ended' | 'cancelled' | 'not_found' }
  /** Session expired; the member has to sign in again. */
  | { kind: 'reauth' }
  | { kind: 'signed-out' };

export type JoinDecisionInput = {
  classStatus: LiveClassStatus;
  signedIn: boolean;
  /** null while the subscription query has not answered (or failed): the server stays the authority. */
  subscription: SubscriptionInfo | null;
  /** The last refusal from agora-rtc-token, if any. Beats whatever the client believes. */
  denial: RtcErrorCode | null;
};

function blockedReasonFor(subscription: SubscriptionInfo | null): BlockedReason {
  return subscription?.state === 'expired' ? 'expired' : 'required';
}

/**
 * What the class screen should offer. The server's refusal always wins over the client's cached
 * subscription state; unknown subscription state is treated as allowed because the join itself
 * asks the server (fail-closed there, not here).
 */
export function decideJoin(input: JoinDecisionInput): JoinDecision {
  const { classStatus, signedIn, subscription, denial } = input;

  if (classStatus === 'ended' || classStatus === 'cancelled') return { kind: 'closed', reason: classStatus };
  if (denial === 'class_not_joinable') return { kind: 'closed', reason: 'ended' };
  if (denial === 'class_not_found') return { kind: 'closed', reason: 'not_found' };
  if (!signedIn) return { kind: 'signed-out' };
  if (denial === 'unauthorized') return { kind: 'reauth' };
  if (denial === 'subscription_required') return { kind: 'blocked', reason: blockedReasonFor(subscription) };
  if (denial === 'not_entitled') return { kind: 'server-denied', reason: 'not_entitled' };

  if (subscription && !canJoinLive(subscription.state)) {
    return { kind: 'blocked', reason: blockedReasonFor(subscription) };
  }
  if (subscription?.state === 'grace') return { kind: 'needs-grace-notice' };
  return { kind: 'allowed' };
}

/** True when the Join control should be usable at all. */
export function canAttemptJoin(decision: JoinDecision): boolean {
  return decision.kind === 'allowed' || decision.kind === 'needs-grace-notice';
}

/** Schedule-list variant: is a Join button enabled for this subscription? Unknown means yes. */
export function canOpenClassFromList(subscription: SubscriptionInfo | null): boolean {
  return subscription === null || canJoinLive(subscription.state);
}

/** Spoken/visible reason a blocked member cannot join (mirrors the blocked panel's body). */
export function blockedReasonText(reason: BlockedReason): string {
  return reason === 'expired'
    ? 'Your subscription has lapsed. Renew to join live classes.'
    : 'Live classes are for subscribed members.';
}
