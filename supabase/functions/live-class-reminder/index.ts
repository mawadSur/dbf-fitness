// live-class-reminder — ENQUEUES the "Starting soon" push for live classes about to begin.
//
// Meant to be invoked EVERY MINUTE (pg_cron + pg_net, or a scheduled invocation; see
// supabase/migrations/20260921142000_notification_scheduling.sql). It no longer talks to Expo:
// it calls public.enqueue_live_class_reminders(), which inserts one notification_outbox row per
// (class, entitled recipient with a device), and the separate `notification-drain` function
// delivers them.
//
// WHY THE REWRITE (this file used to fan out to Expo itself and stamp live_classes.reminder_sent_at):
//   * reminder_sent_at was taken AFTER the side effect, so two overlapping runs — the previous
//     one still in its fan-out when the next tick fired — both saw NULL and both pushed. The
//     outbox's UNIQUE dedupe_key `live_class:<class>:<user>` makes a second enqueue a no-op, so
//     overlapping runs are now harmless by construction rather than by timing.
//   * reminder_sent_at is ONE timestamp per CLASS. A member who registered a device mid-window
//     either got nothing (class already stamped) or, if it was left unstamped, everybody else got
//     a second copy. Dedupe is now per (class, USER), so late registrants are reminded exactly
//     once and nobody is doubled.
//   * A failure mid-fan-out lost the reminder with no retry and no record. Enqueueing is one
//     transactional statement; delivery is retried by the drain with backoff and dead-lettering.
//
// ENTITLEMENT IS UNCHANGED, only moved: the SQL function reminds the class's coach plus the
// members whose profiles.coach_id is that coach AND who have live access right now
// (active | grace | staff, via public.has_live_access — the same canonical rule the old
// selectEntitledMemberIds mirrored). A lapsed member is still skipped, because agora-rtc-token
// would answer 403 subscription_required when they tapped it. ./logic.ts keeps those pure
// helpers: they are still the unit-level spec of the rule and are exercised by
// src/features/liveClasses/reminders.test.ts and ./logic.test.ts.
//
// live_classes.reminder_sent_at is neither read nor written any more; the column stays so an old
// deployment of this function keeps working.
//
// Auth: POST with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (see rejectInvocation in
// ./logic.ts); a missing key fails closed with 500. Env: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Returns JSON { enqueued }.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { rejectInvocation } from './logic.ts';

Deno.serve(async (request: Request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const rejection = rejectInvocation(
    request.method,
    request.headers.get('Authorization'),
    serviceRoleKey
  );
  if (rejection) {
    console.error(`[live-class-reminder] rejected ${request.method} with ${rejection.status}`);
    return Response.json({ error: rejection.error }, { status: rejection.status });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey!, {
    auth: { persistSession: false },
  });

  // enqueue_live_class_reminders() is SECURITY DEFINER and gates on is_privileged_writer(), so
  // this only works with the service-role client — the same reason the old version needed it.
  const { data, error } = await supabase.rpc('enqueue_live_class_reminders');
  if (error) {
    console.error('[live-class-reminder] enqueue failed', error.message);
    return Response.json({ error: 'could not enqueue reminders' }, { status: 500 });
  }

  return Response.json({ enqueued: typeof data === 'number' ? data : 0 });
});
