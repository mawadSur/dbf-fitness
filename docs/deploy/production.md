# DBF Fitness — production deployment runbook (DRAFT)

> Exact commands, in order, to take DBF Fitness from this repo to the App Store and Google Play.
> Every step is marked:
>
> - **[OWNER]** — needs something only the owner has (an account, a card, a key, a decision).
> - **[RUN]** — a command anyone with the repo and the credentials can run.
> - **[VERIFY]** — a check that must pass before moving on.
>
> `{{PLACEHOLDER}}` / `TODO_OWNER:` = never invent these values.
>
> **Scope note:** section **A11** (cron scheduling for the class-reminder pushes) is now finalised:
> migration `20260921142000_notification_scheduling.sql` installs the extensions, the tick
> functions and the two cron jobs. The only owner input left there is the pair of Vault secrets.
>
> Nothing here is destructive to local development: this runbook only touches the **cloud** project.

Facts this runbook is built on (re-counted against `main` on 2026-09-21):
**29 migrations** in `supabase/migrations/` (30 once the store lane's `20260921150000` merges),
**5 Edge Functions** (`agora-rtc-token`, `delete-account`, `live-class-reminder`,
`notification-drain`, `transcribe-recording`), one private storage bucket `recordings`, and
**11 `EXPO_PUBLIC_*`** variables read by the app (§B2).

> **These counts go stale — recount, do not trust them.** The first version of this runbook said
> "19 migrations, 4 Edge Functions" because it was written against commit `020fa7c`, the branch
> point of its own worktree, rather than `main`. Following §A8 verbatim would have silently
> skipped deploying `notification-drain`, so class-reminder pushes would never have been sent.
> Recount before every deploy:
>
> ```bash
> ls supabase/migrations/*.sql | wc -l
> ls -d supabase/functions/*/ | grep -v _shared
> grep -rho 'EXPO_PUBLIC_[A-Z_]*' src app | sort -u
> ```

---

# A. Supabase Cloud

## A1. Create the project — [OWNER]

1. https://supabase.com/dashboard → **New project** in the `{{LEGAL_ENTITY}}` organization.
2. Name: `dbf-fitness-prod`. Database password: generate and store in the owner's password manager
   (`TODO_OWNER: store it somewhere you will still have in a year`).
3. **Region:** `{{SUPABASE_REGION}}` — pick the region closest to where members live; it is
   permanent and it is quoted in the Privacy Policy §11.
4. **Plan:** Pro or above. "Free projects are paused after 1 week of inactivity" and the Free plan
   includes no automatic backups and no point-in-time recovery; Pro includes **daily backups with
   7-day retention**, with PITR as a paid add-on (https://supabase.com/pricing — verified
   2026-09-21, re-verify before you buy). A paused project means members cannot sign in.
5. Database → Backups: confirm daily backups; enable **Point-in-Time Recovery** if you buy the
   add-on. `TODO_OWNER:` write the retention window down — the Privacy Policy §7 quotes it.
6. Copy the **project ref** (`{{SUPABASE_PROJECT_REF}}`), the **anon key** and the **service_role
   key** (Settings → API). The service_role key never leaves the owner's password manager and
   **never** goes in `eas.json`, the app, or git.

## A2. Link the CLI — [RUN]

```bash
cd /path/to/dbf
supabase login                                  # opens a browser, one-time
supabase link --project-ref {{SUPABASE_PROJECT_REF}}
supabase projects list                          # [VERIFY] the linked project is marked
```

## A3. Push the schema — [RUN]

```bash
supabase migration list                         # [VERIFY] local vs remote; remote should be empty
supabase db push                                # applies every file in supabase/migrations/
supabase migration list                         # [VERIFY] every local file is applied remotely
# Compare against the real count rather than a number written here:
ls supabase/migrations/*.sql | wc -l            # 29 on main at 2026-09-21; 30 with the store lane
```

**Never run `supabase db reset` against production. Never push `supabase/seed.sql` to production** —
it contains demo people (Dana, Jordan, Sam, Riley) and demo classes. `supabase db push` does not
apply the seed; do not add `--include-seed`.

[VERIFY] in the SQL editor:

```sql
select count(*) from public.profiles;                      -- expect 0
select tablename, rowsecurity from pg_tables
 where schemaname='public' order by 1;                     -- expect rowsecurity = true everywhere
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and proname in
 ('subscription_grace_days','get_subscription_state','has_live_access','can_join_live_class');
```

## A4. Auth settings — [OWNER] + Dashboard

Authentication → Providers / Sign In / Providers:

| Setting | Production value | Why |
|---|---|---|
| Email provider | **Enabled** | the only sign-in method the app implements |
| **Confirm email** | **On** | stops sign-ups with other people's addresses |
| Minimum password length | **`{{MIN_PASSWORD_LENGTH}}`** — use at least **10** | the app's own validator is the floor, not the ceiling `TODO_OWNER: confirm` |
| Password strength / leaked-password protection | **On** (HaveIBeenPwned check) | free, blocks the worst credentials |
| Sign-ups | **Enabled** `TODO_OWNER:` disable only if every account is created by staff | |
| Phone / OAuth providers | Off | not implemented in the app |
| **MFA** | `TODO_OWNER:` enable TOTP for **staff** accounts at minimum | The app implements no MFA challenge screen, so enabling it org-wide would lock members out — **UNVERIFIED**; test with one staff account before turning it on broadly |
| JWT expiry | default (1 h) with refresh rotation on | |

Authentication → URL Configuration:

- **Site URL:** `{{SITE_URL}}` (the marketing site, e.g. https://dbf-fitness.com/)
- **Redirect allow-list:** add the app scheme `dbf://` and `dbf://*` (the app's scheme is `dbf`,
  `app.json`), plus `{{SITE_URL}}/**` for web. Email confirmation and password reset links must
  land somewhere the member can actually open.

Authentication → Emails: set a **custom SMTP** provider (`{{EMAIL_PROVIDER}}`). Supabase's built-in
email sender is rate-limited and not for production. Set the sender name to "DBF Fitness" and the
from-address to `{{SUPPORT_EMAIL}}` or `noreply@{{EMAIL_DOMAIN}}`; customise the confirmation and
reset templates so they mention DBF Fitness.
[VERIFY] sign up with a real address and confirm the email arrives and the link works on a phone.

## A5. Realtime (private presence channels) — [VERIFY]

The live-class roster uses **private** Realtime channels authorised by policies on
`realtime.messages` (`supabase/migrations/20260919140000_realtime_presence_authorization.sql`).
Nothing to configure in the dashboard beyond the defaults, but verify after the push:

```sql
select policyname, cmd from pg_policies
 where schemaname='realtime' and tablename='messages' order by 1;
```

[VERIFY] expect the policies from that migration to be present. If they are missing, the live-class
roster will silently show nobody.

## A6. Storage — [VERIFY]

The `recordings` bucket is created by migration `20260919151000_recordings_pipeline.sql` as a
**private** bucket with a size ceiling and a media MIME allow-list. After `db push`:

```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='recordings';
select policyname from pg_policies where schemaname='storage' and tablename='objects'
 and policyname like 'recordings_objects_%';
```

[VERIFY] `public = false` and the four `recordings_objects_*` policies exist. A public bucket here
would expose every class recording — treat that as a launch blocker.

## A7. Function secrets — [OWNER] + [RUN]

```bash
supabase secrets set \
  AGORA_APP_ID={{AGORA_APP_ID}} \
  AGORA_APP_CERTIFICATE={{AGORA_APP_CERTIFICATE}} \
  DEEPGRAM_API_KEY={{DEEPGRAM_API_KEY}} \
  ANTHROPIC_API_KEY={{ANTHROPIC_API_KEY}}

supabase secrets list            # [VERIFY] names only — values are never printed
```

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions
  automatically; do not set them yourself.
- Behaviour without these secrets, from the code: `agora-rtc-token` returns `mode:"mock"` with
  `token:null` (no real video), and `transcribe-recording` falls back to a mock transcriber/drafter.
  **Both must be set before launch or live classes and notes will not work.**
- `TODO_OWNER:` obtain an Agora project (App ID + **primary certificate enabled**), a Deepgram key
  and an Anthropic key. Note each provider's billing and rate limits.
- Never paste a key into a shell that logs history to a shared machine; use `supabase secrets set`
  from an interactive prompt or a `.env` file you delete afterwards.

## A8. Deploy the Edge Functions — [RUN]

```bash
supabase functions deploy agora-rtc-token
supabase functions deploy delete-account
supabase functions deploy live-class-reminder
supabase functions deploy notification-drain
supabase functions deploy transcribe-recording

supabase functions list          # [VERIFY] 5 functions, all ACTIVE, verify_jwt on
```

**Deploy whatever is actually on disk, not this list.** `notification-drain` was missing from an
earlier version of this section, which would have left the reminder queue with nothing to drain.
Check first:

```bash
ls -d supabase/functions/*/ | grep -v _shared   # must match the deploy commands above, one for one
```

[VERIFY] with a real user JWT (never the service_role key from a client):

```bash
# 401 without a token
curl -i -X POST "https://{{SUPABASE_PROJECT_REF}}.supabase.co/functions/v1/agora-rtc-token" \
  -H "apikey: {{PROD_ANON_KEY}}" -H "content-type: application/json" -d '{"class_id":"…"}'
# expect 401 {"error":"unauthorized"}
```

Then, signed in as the demo member with a real class id, expect `200` with `"mode":"live"` and a
non-null token. `"mode":"mock"` means A7 did not take effect.

---

## A9. Create the real people — [OWNER] + SQL

Production gets **no seed data**. Create accounts deliberately, in this order.

**Step 1 — create the auth users.** Either have each person sign up in the app and confirm their
email (preferred), or create them in Dashboard → Authentication → Users → *Add user* with
"Auto Confirm User" ticked. Note each user's UUID.

**Step 2 — promote staff.** In the SQL editor (runs as `postgres`, which is the only role allowed
to change roles):

```sql
-- the first admin
update public.profiles set role = 'admin'
 where id = '{{ADMIN_USER_UUID}}';

-- each coach
update public.profiles set role = 'coach'
 where id in ('{{COACH_1_UUID}}' /*, '{{COACH_2_UUID}}' */);

-- optional coach directory entry (bio <= 500 chars)
insert into public.coach_profiles (coach_id, bio, specialties, accepting_members)
values ('{{COACH_1_UUID}}', '{{COACH_1_BIO}}', array['{{SPECIALTY_1}}'], true)
on conflict (coach_id) do update
  set bio = excluded.bio, specialties = excluded.specialties,
      accepting_members = excluded.accepting_members;

select id, role, full_name from public.profiles order by role;   -- [VERIFY]
```

**Step 3 — attach members to a coach** (members can also pick a coach in the app):

```sql
update public.profiles set coach_id = '{{COACH_1_UUID}}' where id = '{{MEMBER_UUID}}';
```

**Step 4 — mark a member as paid.** `subscriptions` is writable only by `service_role`/`postgres`
— the app can never write it. One row per member:

```sql
insert into public.subscriptions
  (member_id, status, current_period_end, cancel_at_period_end, provider, provider_ref)
values
  ('{{MEMBER_UUID}}', 'active', now() + interval '30 days', false, 'manual', '{{RECEIPT_REF}}')
on conflict (member_id) do update
  set status = excluded.status,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      provider_ref = excluded.provider_ref,
      updated_at = now();
```

Access rules this drives (single source of truth, `20260919150000_subscriptions_and_live_access.sql`):
`active` while `now() <= current_period_end`; then a **10-day grace period** while the status is
`active`/`past_due`; then locked. `canceled` gets no grace. Coaches and admins always have access.

**Step 5 — the store-review demo accounts.** Both stores need working credentials that stay alive.

```sql
-- demo coach
update public.profiles set role = 'coach', full_name = 'DBF Demo Coach'
 where id = '{{DEMO_COACH_UUID}}';
-- demo member, coached by the demo coach, membership active for a long window
update public.profiles set coach_id = '{{DEMO_COACH_UUID}}', full_name = 'DBF Demo Member'
 where id = '{{DEMO_MEMBER_UUID}}';
insert into public.subscriptions (member_id, status, current_period_end, provider)
values ('{{DEMO_MEMBER_UUID}}', 'active', now() + interval '365 days', 'manual')
on conflict (member_id) do update set current_period_end = excluded.current_period_end,
                                      status = 'active', updated_at = now();
```

`TODO_OWNER:` also give the demo member a workout plan, a diet plan and a group so no screen is
empty, and schedule a recurring demo live class (§A11) — a reviewer who finds an empty app or a
class they cannot join rejects the build (Apple Guideline 2.1).
**Set a calendar reminder to renew the demo membership before it expires.**

## A10. A daily demo live class — [OWNER]

```sql
insert into public.live_classes (id, coach_id, title, starts_at, status)
values (gen_random_uuid(), '{{DEMO_COACH_UUID}}', 'Demo class for app review',
        date_trunc('day', now()) + interval '{{DEMO_CLASS_HOUR}} hours', 'scheduled');
```

`TODO_OWNER:` confirm the exact `live_classes` columns in
`supabase/migrations/20260919114451_live_classes_schema.sql` before running this — the insert above
is a template, not a verified statement (**UNVERIFIED**). Either create the class in the coach UI
instead (safer), or schedule a daily insert.

## A11. Scheduled work — [RUN]

Class reminders are driven every minute from the database, not from an external scheduler. The
work is split in two: `enqueue_live_class_reminders_tick()` queues the reminders, and
`drain_notifications_tick()` POSTs to the `notification-drain` Edge Function through `pg_net`,
fire-and-forget (the drain is idempotent — leases plus dedupe — so a lost response costs at most
one lease period).

The service-role key lives in **Supabase Vault**, never inline in the cron command: a cron
definition is readable by anyone with SQL access.

**The migration already does almost all of this.** `supabase/migrations/20260921142000_notification_scheduling.sql`
(applied by the `supabase db push` in §A3) creates `pg_net` and `pg_cron`, defines
`public.notification_setting(text)`, `public.drain_notifications_tick()` and
`public.enqueue_live_class_reminders_tick()`, and — when `pg_cron` is available — calls
`public.schedule_notification_jobs()`, which idempotently (re)creates two every-minute jobs,
`dbf-notification-drain` and `dbf-live-class-reminders`.

**The only thing left is owner input: the two Vault secrets.** Until they exist, each tick logs
`notification drain is not configured` and returns — deliberately a no-op, not an error, so an
unwired environment does not log a failure every minute.

```sql
-- [OWNER] Both values come from your own project. Run once, as the service role.
select vault.create_secret(
  'https://{{SUPABASE_PROJECT_REF}}.supabase.co/functions/v1/notification-drain',
  'notification_drain_url');
select vault.create_secret('{{SUPABASE_SERVICE_ROLE_KEY}}', 'notification_service_role_key');
```

The secret **names are fixed** — `notification_setting()` looks them up by exactly
`notification_drain_url` and `notification_service_role_key`. A typo is silent: the tick treats a
missing secret as "not configured".

```sql
-- [VERIFY]
select jobname, schedule, active from cron.job
 where jobname in ('dbf-notification-drain', 'dbf-live-class-reminders');   -- expect 2 active rows
select name from vault.secrets
 where name in ('notification_drain_url', 'notification_service_role_key'); -- expect 2 rows
-- After a minute, confirm requests are actually going out:
select id, created from net._http_response order by created desc limit 5;
```

If `cron.job` is empty (for example `pg_cron` was not yet enabled when the migration ran), re-run
the scheduler by hand — it is idempotent and unschedules by name first:

```sql
select public.schedule_notification_jobs();
```

> A previous revision of this section said `pg_cron`, `pg_net` and Vault were "**not** set up by
> any migration in this repo today". That was true at commit `020fa7c` and false on `main`:
> `grep -l 'pg_cron\|vault\|pg_net' supabase/migrations/*.sql` matches
> `20260921142000_notification_scheduling.sql`. Re-verify with that grep rather than trusting
> either statement.

Transcription is triggered by the coach's upload flow calling `transcribe-recording`, not by a
schedule.

## A12. Post-deploy smoke test — [VERIFY]

```sql
select count(*) from public.profiles;                    -- your real people only
select member_id, status, current_period_end from public.subscriptions;
select id, title, starts_at, status from public.live_classes order by starts_at desc limit 5;
```

Then, from a real device build (§B): sign in, open every tab, join the demo class, delete a
throwaway account.

---

# B. EAS — builds and store submission

## B1. Accounts and project — [OWNER] + [RUN]

```bash
npx eas-cli@latest login            # the owner's Expo account
npx eas-cli@latest whoami           # [VERIFY]
npx eas-cli@latest init             # creates/links the EAS project, writes extra.eas.projectId
npx eas-cli@latest project:info     # [VERIFY] copy the project id -> {{EAS_PROJECT_ID}}
```

`eas.json` already exists with `development` / `preview` / `production` build profiles and a
`submit.production` block. **`npm install` / `expo install` are out of scope for this lane** — if a
step needs a dependency that is not installed, stop and raise it.

## B2. Environment variables per profile — [OWNER]

The app reads the **eleven** variables below. Regenerated after the store branches merged, from
`grep -rho 'EXPO_PUBLIC_[A-Z_]*' src app | sort -u` (2026-09-21).

> An earlier revision of this table claimed "exactly these six variables" and listed six. That was
> true at commit `020fa7c` and wrong by the time anyone read it: lane L1b added the four legal
> values and the billing flag. An owner following the old table verbatim would have shipped the
> `REPLACE_WITH_*` placeholder legal URLs straight to App Review. **Re-run the grep whenever this
> runbook is touched; do not trust a counted list.**

| Variable | development | preview (staging) | production | Notes |
|---|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | staging project URL | `https://{{SUPABASE_PROJECT_REF}}.supabase.co` | **REQUIRED.** A release build with this missing, localhost or a `REPLACE_` placeholder shows the blocking "This build is not configured" screen (`src/config/ConfigGate.tsx`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | local anon key | staging anon key | `{{PROD_ANON_KEY}}` | **REQUIRED**, same gate. The anon key is public by design; the **service_role** key must never appear here |
| `EXPO_PUBLIC_PRIVACY_URL` | unset | `{{PRIVACY_POLICY_URL}}` | `{{PRIVACY_POLICY_URL}}` | **REQUIRED, RELEASE-BLOCKING.** Read by `src/config/legal.ts`; shown on sign-up, sign-in, Profile and the TermsGate. A `REPLACE_` value blocks the build at launch. Apple 2.1 rejects placeholder URLs outright |
| `EXPO_PUBLIC_TERMS_URL` | unset | `{{TERMS_URL}}` | `{{TERMS_URL}}` | **REQUIRED, RELEASE-BLOCKING.** Same gate. Apple guideline 1.2 expects a reachable EULA for a UGC app |
| `EXPO_PUBLIC_SUPPORT_URL` | unset | `{{SUPPORT_URL}}` | `{{SUPPORT_URL}}` | **REQUIRED, RELEASE-BLOCKING.** Same gate. This is the "Support URL" both consoles fetch |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | unset | `{{SUPPORT_EMAIL}}` | `{{SUPPORT_EMAIL}}` | **REQUIRED, RELEASE-BLOCKING, NO DEFAULT.** Deliberately has no fallback — inventing a mailbox would send every abuse report into a black hole. Unset ⇒ the blocking screen. Apple 1.2: "published contact information so users can easily reach you" |
| `EXPO_PUBLIC_AGORA_APP_ID` | unset (mock video) | `{{AGORA_APP_ID}}` | `{{AGORA_APP_ID}}` | App ID only — the **certificate** stays server-side (A7). Missing in a release build ⇒ "Live video is not available in this build" instead of a silent mock call |
| `EXPO_PUBLIC_REAL_PUSH` | `false` | `true` | `true` | Off in a release build ⇒ the live-class screen shows a visible "Class reminders are off" banner rather than silently using the no-op adapter |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | — | `{{EAS_PROJECT_ID}}` | `{{EAS_PROJECT_ID}}` | needed by `getExpoPushTokenAsync` |
| `EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK` | unset | unset | **unset / `false`** | Default false. `true` re-enables "Subscribe"/"Renew" external-purchase CTAs, which Apple guideline 3.1.3 forbids for digital services. Set it only for internal distribution that never goes through review |
| `EXPO_PUBLIC_BILLING_URL` | unset | unset | **unset** | Superseded by the flag above and removed from the store profiles in `eas.json`. **Leave it unset.** It is read *directly*, with no flag check, by `src/features/liveClasses/billing.ts`, `src/components/live/SubscriptionBlockedPanel.tsx`, `src/components/live/GraceNotice.tsx` and `src/components/coaching/SubscriptionCard.tsx`, so setting it reinstates payment steering on those screens **regardless of the flag**. See `docs/store/app-store-connect.md` §2 |

**[VERIFY] before any store build** — both of these must return nothing:

```bash
grep -n 'REPLACE_' eas.json                               # no placeholder survived
grep -rn 'EXPO_PUBLIC_BILLING_URL' eas.json .env 2>/dev/null   # no billing steering
```

`eas.json` ships `REPLACE_…` strings for the owner-supplied values — replace them, or move them to
EAS environment variables (`eas env:create`) so the real values are not committed to git.
**[VERIFY]** after a build: `npx eas-cli@latest build:inspect` or simply confirm the built app
talks to the production Supabase URL and gets real (non-mock) Agora tokens.

## B3. Credentials — [OWNER]

```bash
npx eas-cli@latest credentials            # interactive; run once per platform
```

iOS (needs the Apple Developer account, `{{APPLE_ID}}`, `{{APPLE_TEAM_ID}}`):
- **Distribution certificate** and **App Store provisioning profile** — let EAS create and store
  them unless the owner wants to manage them manually.
- **Push key (APNs .p8)** — required for class reminders. One key per team; EAS can create it.
- Register the bundle id `com.dbffitness.app` first (EAS will offer to do it).

Android:
- **Upload keystore** — let EAS generate and store it, and **back it up** (Play App Signing means
  losing the upload key is recoverable, losing the app-signing key is not).
- **FCM credentials** — create a Firebase project for `com.dbffitness.app`, download
  `google-services.json`, and upload the **FCM V1 service account key** to EAS so Expo can deliver
  pushes to Android.
- **Play service account JSON** for `eas submit` — Play Console → Setup → API access → create a
  service account with "Release manager" rights, download the JSON, and store it at the path in
  `eas.json` (`./google-play-service-account.json`). That filename is already in `.gitignore`
  (line 53, verified 2026-09-21) — keep it that way and never commit the key.

## B4. Build — [RUN]

```bash
npx eas-cli@latest build --platform all --profile production
```

`production` builds an **app-bundle** for Android and a store build for iOS, with
`autoIncrement: true` and `appVersionSource: "remote"`, so build numbers increase on their own.
Bump the marketing version in `app.json` (`expo.version`, currently `1.0.0`) for each public
release.

[VERIFY] both builds finish green; download the Android `.aab` and the iOS build page URL.

## B5. Submit — [RUN]

```bash
npx eas-cli@latest submit --platform ios     --profile production
npx eas-cli@latest submit --platform android --profile production
```

Fill in `eas.json` → `submit.production.ios` first: `appleId` = `{{APPLE_ID}}`,
`ascAppId` = `{{ASC_APP_ID}}` (App Store Connect app id), `appleTeamId` = `{{APPLE_TEAM_ID}}`.
Android submits to the **internal** track first (already configured).

## B6. Testing tracks — [OWNER]

**iOS / TestFlight**
1. Internal testing (up to 100 team members, no Beta App Review): install on a real iPhone and
   run §D.
2. External testing (up to 10,000 testers; the first build needs Beta App Review — 
   https://developer.apple.com/testflight/ , re-verify): optional for v1, useful
   for a few real members.
3. Then submit the same build for App Store review with **manual release** and **phased release**.

**Android / Play**
1. **Internal testing** → real-device pass (§D).
2. **Closed testing** if Play asks for it (see `docs/store/google-play.md` §11 — the 12-tester /
   14-day rule is documented for **personal** accounts; verify what the console demands of this
   organization account).
3. **Production**, staged rollout 5% → 20% → 50% → 100%.

## B7. Rollback — [OWNER]

- **Play:** halt the staged rollout in Play Console, then ship a fixed build with a higher version
  code. You cannot downgrade users who already updated.
- **App Store:** with phased release, pause the rollout; to stop distribution entirely, remove the
  version from sale. There is no downgrade — ship a fix.
- **Backend:** migrations are forward-only. A bad migration is fixed by another migration (plus
  PITR restore if data was lost). Never `db reset` production.
- **Secrets:** rotate with `supabase secrets set` and redeploy the functions; rotate the anon key
  only with a coordinated app release, since it is baked into the build.

---

# C. Monitoring — day 1

| Watch | Where | What is bad |
|---|---|---|
| Crashes / ANRs | Play Console → Quality → Android vitals; App Store Connect → Analytics | any crash cluster at all on day 1; Play's core-vitals bad-behaviour thresholds: 1.09% user-perceived crash rate and 0.47% user-perceived ANR rate across all devices, or 8% on a single device model (https://support.google.com/googleplay/android-developer/answer/9844486 — re-verify) |
| Edge Function errors | Supabase → Edge Functions → Logs (per function) | 5xx on `agora-rtc-token` (nobody can join), 5xx on `delete-account` (a store-compliance feature), repeated failures on `transcribe-recording` |
| Auth | Supabase → Authentication → Logs | sign-up spikes (abuse), confirmation emails not sending |
| Database | Supabase → Reports | connection saturation, slow queries, storage growth from recordings |
| Push delivery | `live-class-reminder` logs (`{classes, sent, failed}`) | `failed > 0`, or no rows arriving at all — then check `cron.job` and the two Vault secrets (A11) |
| Agora | Agora console usage/minutes | unexpected minute burn = a stuck client or an unauthorised channel |
| Deepgram / Anthropic | provider dashboards | cost spikes, 429s |
| Moderation | `select * from public.moderation_reports where status='open' order by created_at;` | anything open for more than 24 hours breaks the commitment made in the Terms and to Apple |
| Support inbox | `{{SUPPORT_EMAIL}}` | must be read daily |

`TODO_OWNER:` decide whether to add Sentry before launch. If you do: add `{{SENTRY_DSN}}` to the EAS
production env, **and** update Privacy Policy §4/§6, App Store App Privacy (Diagnostics) and Play
Data safety (App info and performance) before that build ships.

---

# D. Real-device verification (must pass before public release)

Run the whole list on **one real iPhone and one real Android phone**, on the production build,
against the production backend. Simulators do not exercise camera, microphone or push.

| # | Check | iOS | Android |
|---|---|---|---|
| 1 | Install from TestFlight / internal track, cold start | ☐ | ☐ |
| 2 | Sign up, receive and open the confirmation email, sign in | ☐ | ☐ |
| 3 | Pick a coach; see the assigned workout and diet plan | ☐ | ☐ |
| 4 | Tick exercises, finish a day, log effort — values persist after a restart | ☐ | ☐ |
| 5 | **Join a live class**: camera + microphone permission prompts appear with the DBF wording, two participants see and hear each other, leaving works | ☐ | ☐ |
| 6 | Deny camera/microphone → the app still works and the class can be entered as a viewer | ☐ | ☐ |
| 7 | **Push**: allow notifications, receive a "starting soon" reminder, tapping it opens the class (requires the A11 Vault secrets to be set) | ☐ | ☐ |
| 8 | **Coach flow**: upload a recording, transcript appears, AI-drafted notes appear, publish them, the member sees them | ☐ | ☐ |
| 9 | Report and Block from the community roster; the blocked person disappears | ☐ | ☐ |
| 10 | Expired membership: live class is locked with the right message, and no purchase link appears on iOS | ☐ | ☐ |
| 11 | Grace period: a member 3 days past due still gets in and sees the reminder | ☐ | ☐ |
| 12 | **Delete account** end to end; signed out; the credentials no longer work; the member disappears from the coach's roster | ☐ | ☐ |
| 13 | Android hardware **back** button behaves everywhere; no screen is a dead end | n/a | ☐ |
| 14 | Notch / home indicator / status bar: nothing clipped; large-font accessibility setting does not break layouts | ☐ | ☐ |
| 15 | Offline and flaky network: errors are readable, nothing crashes | ☐ | ☐ |
| 16 | App icon, splash and app name are correct on the home screen | ☐ | ☐ |

---

# E. Everything the owner must supply

Collect these before starting; the runbook stops without them.

**Company and legal:** `{{LEGAL_ENTITY}}`, `{{REGISTERED_ADDRESS}}`, `{{SUPPORT_EMAIL}}`,
`{{SUPPORT_PHONE}}`, `{{GOVERNING_LAW}}`, `{{COURTS_VENUE}}`, `{{MINIMUM_AGE}}`,
`{{EFFECTIVE_DATE}}`, published `{{PRIVACY_POLICY_URL}}` / `{{TERMS_URL}}` / `{{SUPPORT_URL}}`.

**Supabase:** `{{SUPABASE_PROJECT_REF}}`, `{{SUPABASE_REGION}}`, `{{PROD_ANON_KEY}}`, the
service_role key (owner's vault only), `{{EMAIL_PROVIDER}}` SMTP credentials, `{{SITE_URL}}`,
backup/PITR retention, `{{MIN_PASSWORD_LENGTH}}`, `{{ACCOUNT_DELETION_URL}}` (the web page Play's
Data safety form asks for — the support page covers it).

**Third-party keys:** `{{AGORA_APP_ID}}`, `{{AGORA_APP_CERTIFICATE}}`, `{{DEEPGRAM_API_KEY}}`,
`{{ANTHROPIC_API_KEY}}`, optional `{{SENTRY_DSN}}`, optional `{{BILLING_URL}}`.

**Apple:** `{{APPLE_ID}}`, `{{APPLE_TEAM_ID}}`, `{{ASC_APP_ID}}`, `{{SKU}}`, the App Store icon and
screenshots, and the demo credentials `{{DEMO_MEMBER_EMAIL}}` / `{{DEMO_MEMBER_PASSWORD}}` /
`{{DEMO_COACH_EMAIL}}` / `{{DEMO_COACH_PASSWORD}}` plus `{{DEMO_CLASS_HOUR}}` and the review
on-call window.

**Google:** Play organization account, the Play API service-account JSON, Firebase project + FCM V1
key, the 512 px icon, the 1024 x 500 feature graphic and phone screenshots.

**Expo:** Expo account, `{{EAS_PROJECT_ID}}`.

**Release:** `{{CLOSED_TEST_TESTERS}}` (how many closed testers, if Play asks) and `{{YEAR}}` for the
App Store copyright line.

**People:** `{{ADMIN_USER_UUID}}`, each coach UUID and bio, the demo account UUIDs.

---

## Related documents

- `docs/legal/privacy-policy.md` — what the app collects, with a claim-by-claim code audit
- `docs/legal/terms-of-service.md` — UGC/EULA terms Apple 1.2 and Play's UGC policy require
- `docs/legal/support-page.md` — the public support page content
- `docs/store/app-store-connect.md` — iOS listing, App Privacy, age rating, review notes
- `docs/store/google-play.md` — Play listing, Data safety, health declaration, tracks
- `docs/release-checklist.md` — owned by another lane; this runbook does not duplicate it
