# DBF Fitness — Privacy Policy (DRAFT)

> **STATUS: FIRST DRAFT — NOT LEGAL ADVICE.** Written by the build team from the actual
> code in this repository. Every `{{PLACEHOLDER}}` and `TODO_OWNER:` must be filled in by the
> owner, and the whole document must be reviewed by a lawyer in `{{GOVERNING_LAW}}` before it is
> published at the public Privacy Policy URL that Apple and Google require.
>
> Publish at: `{{PRIVACY_POLICY_URL}}` (must be a live, public, non-authenticated page — App Store
> Connect and Play Console both reject placeholder or 404 URLs).

**Effective date:** `{{EFFECTIVE_DATE}}`
**Last updated:** `{{EFFECTIVE_DATE}}`
**App:** DBF Fitness (iOS bundle id / Android package `com.dbffitness.app`)
**Controller:** `{{LEGAL_ENTITY}}`, `{{REGISTERED_ADDRESS}}`
**Contact:** `{{SUPPORT_EMAIL}}`

---

## 1. Who this policy covers

DBF Fitness is a private coaching app. You can only use it with an account created with an email
address and password. There are three kinds of account:

- **Members** — people coached by a DBF coach.
- **Coaches** — staff who build plans, run live classes and publish class notes.
- **Admins** — staff who manage roles, memberships and moderation.

This policy explains what `{{LEGAL_ENTITY}}` ("we") collects through the app, why, who processes it
on our behalf, how long we keep it, and how you delete it.

---

## 2. What we collect — summary

| What | Examples | Where it lives |
|---|---|---|
| Account credentials | email address, password (stored only as a hash by our auth provider) | Supabase Auth |
| Profile | full name, role (member/coach/admin), which coach you belong to, your device's timezone | `profiles` |
| Coach profile (coaches only) | bio, specialties, whether accepting members | `coach_profiles` |
| Training activity | workout plans assigned to you, completed workout days, completed exercises, effort/milestone records | `workout_plans`, `workout_days`, `workout_completions`, `exercise_completions`, `milestones` |
| Nutrition activity | diet plan assigned to you, which diet items you ticked off and on what date | `diet_plans`, `diet_plan_assignments`, `diet_items`, `diet_checkins` |
| Community | your group membership, users you block, reports you file about other users (reason text) | `groups`, `group_members`, `user_blocks`, `moderation_reports` |
| Live classes | which class you joined, when you joined and left; your live audio and video while you are in a class | `live_classes`, `live_class_participants`; audio/video streamed via Agora |
| Class recordings (coaches) | video/audio files a coach uploads, the transcript produced from them, and the class notes drafted from the transcript | `recordings` (private storage bucket), `transcripts`, `workout_notes` |
| Membership status | whether your membership is active, past due or cancelled, and the date your paid period ends | `subscriptions` |
| Push notifications | your Expo push token and the platform (ios/android) of the device it belongs to | `push_tokens` |

**We do not sell your data and we do not use it for advertising or tracking.**

---

## 3. What we collect, in detail

### 3.1 Account and profile
When you sign up you give us your **full name**, an **email address** and a **password**.
Authentication is handled by Supabase Auth; we never see or store your password in readable form.
Your profile row also records your **role** (member by default) and, for members, the **coach you
are assigned to** (set by staff, not by you).

**Your timezone.** The app reads the **IANA timezone name your device reports** (for example
`Europe/Berlin`) and stores it on your profile. It is refreshed after you sign in and each time the
app returns to the foreground, so it follows you if you travel. We use it for one thing: working out
which calendar day a workout or diet check-in belongs to, so your streak does not break when you
train late at night or move between countries. It is a **timezone name, not a location** — it is not
GPS, not an address, and it is no more precise than the region your phone is set to. We do not keep
a history of previous timezones; the field holds only the current value.

### 3.2 Training and nutrition activity
When you tick an exercise, finish a workout day, log effort, or tick a diet item, we store that the
tick happened, which item it was for, and the date/time. Your coach and admins can see this — that
is the point of the product: it is how your coach follows your progress.

### 3.3 Community
The app has a group roster, the ability to **block** another user, and the ability to **report** a
user. A report stores who reported whom and the free-text **reason** you type. Reports are visible
to coaches and admins for moderation.

### 3.4 Live classes (audio and video)
Live classes run over **Agora**'s real-time audio/video service. While you are in a class, your
camera and microphone streams are sent through Agora to the other people in that class. Access is
authorised per class by our `agora-rtc-token` server function; you can only get a token for a class
run by your own coach and only while your membership gives you access.

- Camera and microphone are used **only inside a live class**, and only after iOS/Android asks you
  for permission. You can decline; you will still be able to use everything else in the app.
- **We do not record live classes automatically.** Recording is a separate action taken by a coach
  who uploads a file themselves (see 3.5).

### 3.5 Class recordings, transcripts and AI-drafted notes
A **coach** can upload a recording of a class. The file goes to a private storage bucket that only
the uploader (and our server functions) can read. Our `transcribe-recording` function then:

1. creates a short-lived signed URL for the file,
2. sends that URL to **Deepgram** (`https://api.deepgram.com/v1/listen`, model `nova-2`), which
   fetches the media and returns a text transcript,
3. sends the transcript text to **Anthropic** (`https://api.anthropic.com/v1/messages`) to draft
   structured class notes,
4. stores the transcript and the draft notes in our database for the coach to review, edit and
   publish to members.

If a class you attended is recorded by your coach, **your voice and image may be in that recording
and your words may appear in the transcript and in the notes.** Coaches must tell the class before
recording (see the Terms of Service).

### 3.6 Membership status
Memberships are sold and collected by DBF **outside the app**. Your membership record holds the
**status** (`active` / `past_due` / `canceled`), the **end date of the paid period**, and an
optional internal reference.

**Payment records entered by staff.** When DBF records that you have paid, that action is logged in
a staff-only membership history (`subscription_events`) which can also hold the **amount and
currency** of the payment DBF received from you, together with who recorded it and when. This is a
bookkeeping note typed in by an administrator — it is **not** a card transaction and it is never
entered by you. `TODO_OWNER:` see Appendix B — whether the staff screen that writes these amounts
ships in the first release decides whether both stores must also declare "financial information"
(see `docs/store/app-store-connect.md` §3 and `docs/store/google-play.md` §7).

**No card numbers, bank details or payment credentials are ever entered into or stored by the
app.** There is no payment form anywhere in the app and no payment processor is integrated.

### 3.7 Push notifications
If you allow notifications, the app registers an **Expo push token** and stores it with the platform
name so we can send you live-class reminders. Reminders are delivered through the **Expo push
service**, which hands them to **Apple Push Notification service (APNs)** or **Firebase Cloud
Messaging (FCM)**. You can turn notifications off in your device settings at any time.

---

## 4. What we do NOT collect

Checked against the code in this repository on 2026-09-21:

- **No advertising or tracking SDKs.** There is no analytics, attribution or advertising library in
  the app, and no advertising identifier is read. We do not track you across other companies' apps
  or websites.
- **No crash-reporting or performance SDK** (no Sentry, no Firebase Crashlytics) is installed in the
  app today. Apple and Google may still give us aggregate, anonymous crash and performance data
  through App Store Connect and Play Console; that is standard platform reporting and is not linked
  to your account by us. `TODO_OWNER:` if you add Sentry (a `SENTRY_DSN` placeholder exists in the
  deploy runbook), this section and the store privacy forms must be updated before that build ships.
- **No location data.** The app never asks for or reads location.
- **No contacts, calendar, photo library or health-kit data.** The app does not integrate with Apple
  Health or Google Health Connect.
- **No profile photos.** The database has an unused `avatar_url` column; nothing in the app uploads
  or displays a profile picture today.
- **No card or bank data, and no payment processor.** The app has no payment form and integrates no
  payment SDK. The one money-shaped field that exists is a staff-typed amount in the membership
  history described in 3.6 — read that section, not this bullet, for the full picture.

---

## 5. Why we use your data (purposes)

| Purpose | Data used |
|---|---|
| Create and secure your account | email, password hash, role |
| Deliver coaching: show you your plan, let your coach follow your progress | profile, workout/diet activity, effort |
| Run live classes | class participation, live audio/video, membership status |
| Produce class notes from a coach's recording | recording file, transcript, drafted notes |
| Control access to live classes (active membership, 10-day grace period) | membership status and period end |
| Send live-class reminders | push token, platform, class schedule |
| Keep the community safe | blocks, reports, moderation decisions |
| Meet legal obligations and defend legal claims | any of the above, as required |

`TODO_OWNER:` if you serve users in the EU/UK, a lawyer should map each purpose to a GDPR legal
basis (performance of a contract for coaching delivery; legitimate interests for safety and
moderation; consent for push notifications, camera and microphone).

---

## 6. Who processes your data (processors and sub-processors)

| Processor | What they process | Why |
|---|---|---|
| **Supabase** (`{{SUPABASE_REGION}}`) | everything stored: auth, database, private file storage, server functions, realtime | our hosting and backend |
| **Agora** | live audio and video during a class; a per-class channel name and a numeric user id derived from your account id | real-time video for live classes |
| **Deepgram** | the audio/video of a coach-uploaded recording (fetched by Deepgram from a short-lived signed URL) and the transcript it returns | speech-to-text |
| **Anthropic** | the text transcript of a coach-uploaded recording | drafting class notes for the coach to review |
| **Expo** (Expo push service) | your push token and the notification text | delivering push notifications |
| **Apple (APNs) / Google (FCM)** | your push token and the notification text | final delivery to your device |
| `{{EMAIL_PROVIDER}}` | your email address | sending account emails (confirmation, password reset) |

`TODO_OWNER:` confirm this list is complete and add each provider's DPA/sub-processor page. If you
add Sentry or any analytics later, add it here **before** the build ships.

---

## 7. How long we keep it

| Data | Retention |
|---|---|
| Account, profile, training/nutrition history | for as long as your account exists |
| Live-class participation records | for as long as your account exists |
| Class recordings and transcripts | `TODO_OWNER: choose a period, e.g. 12 months, then automatic deletion` — there is no automatic deletion job in the code today |
| Moderation reports | `TODO_OWNER: choose a period, e.g. 24 months` — kept while needed for safety and to defend claims |
| Push tokens | until you delete your account, or the token stops working |
| Backups | `TODO_OWNER: state the Supabase backup/PITR retention you buy, e.g. 7 days` |

**UNVERIFIED:** nothing in the code automatically deletes old recordings, transcripts or reports
today. Either the owner commits to a manual/scheduled deletion process, or the retention wording
above must say "until deleted by us or by you".

---

## 8. Deleting your account

You can delete your account **inside the app**: Profile → Delete account, type `DELETE` to confirm,
and re-enter your password. This calls our `delete-account` server function, which deletes the
account that owns the session — never anyone else's — and removes:

- your auth user (email, password hash, sessions),
- your profile and everything that hangs off it by cascade: workout and exercise completions, effort
  and milestones, diet check-ins, group memberships, blocks you created, reports you filed, live
  class participation, your push tokens and your membership row,
- the files you uploaded to the private recordings bucket under your own user folder.

What this does **not** remove:

- **Content other people created about you** — for example a report another member filed naming you,
  or a coach's recording/transcript/notes that you appear in. Those belong to the other account.
- **Backups**, until they age out (see 7).
- `TODO_OWNER:` if you must remove a member from a coach's recording, that is a manual request to
  `{{SUPPORT_EMAIL}}` — describe the process and the response time you commit to.

You can also email `{{SUPPORT_EMAIL}}` and we will delete the account for you.

---

## 9. Children

DBF Fitness is **not intended for children**. You must be at least `{{MINIMUM_AGE}}` years old to
create an account.

`TODO_OWNER: choose the minimum age and use the SAME number everywhere` — in this policy, in the
Terms, in the App Store age rating and in Play's "Target audience and content" declaration.
Recommendation from the build team: **16+**, because the app has live video with other people,
user-generated reports and free-text content, and no parental-control layer. 13+ is the floor if you
want a lower number; below 13 is not an option (COPPA in the US, and Play's Families policy would
apply). We do not knowingly collect data from anyone under that age; if we learn that we have, we
delete the account.

---

## 10. Health and fitness information

The app records training and nutrition activity (workouts finished, exercises completed, diet items
ticked). That is **health and fitness information** for the purposes of Apple's App Privacy label
and Google Play's Data safety form, and we declare it as such.

**DBF Fitness is not a medical device and does not provide medical advice, diagnosis or treatment.**
Coaching content is general fitness guidance. Talk to a doctor before starting any programme, and
stop and seek help if you feel unwell. See the Terms of Service for the full disclaimer.

---

## 11. International transfers

Our backend runs in `{{SUPABASE_REGION}}`. Agora, Deepgram, Anthropic, Expo, Apple and Google
process data in the countries where they operate, which may be outside your country.
`TODO_OWNER:` if you serve the EU/UK, name the transfer mechanism (Standard Contractual Clauses /
UK IDTA) that each provider's DPA relies on.

---

## 12. Your rights

Depending on where you live you may have the right to access, correct, delete, restrict or object to
our use of your data, to data portability, and to complain to your data-protection regulator. Email
`{{SUPPORT_EMAIL}}`. We answer within `{{RIGHTS_RESPONSE_DAYS}}` days (`TODO_OWNER:` 30 days is the
usual commitment; abuse reports are answered within 24 hours — see the Terms).

---

## 13. Security

- All traffic between the app and our backend uses HTTPS/TLS.
- Database access is protected by row-level security: members can only read their own records and
  what their coach shares with them.
- Class recordings sit in a **private** storage bucket; nobody can read a file by guessing its URL.
- Server-side keys (Agora certificate, Deepgram, Anthropic) live only in server-side secrets and are
  never shipped inside the app.
- No security is perfect; we cannot guarantee absolute security.

---

## 14. Changes to this policy

If we change this policy we will update the "Last updated" date and, for material changes, tell you
in the app or by email before the change takes effect.

---

## 15. Contact

`{{LEGAL_ENTITY}}`
`{{REGISTERED_ADDRESS}}`
`{{SUPPORT_EMAIL}}`
Website: https://dbf-fitness.com/

---

## Appendix A — Claim → where verified in code

Every factual claim in this policy, checked against the repository. Paths are relative to the repo
root.

> **Audit basis.** The first pass of this appendix was run against commit `020fa7c`, which is the
> branch point of this document's worktree — not the tip of `main`. That produced at least one
> confidently wrong negative claim ("no timezone collection"), because
> `supabase/migrations/20260921112000_timezone_local_dates.sql` had not landed at `020fa7c`
> (`git ls-tree -r --name-only 020fa7c | grep timezone` is empty). **The whole appendix was
> re-audited against `main` on 2026-09-21** and the affected rows rewritten. Anyone re-running this
> audit must grep the tip of `main`, not this branch — and must re-run it again after the store
> branches merge, because a negative claim in a privacy policy is the expensive kind of wrong.

| Claim in the policy | Verified in |
|---|---|
| Email + password sign-up; name captured at sign-up | `app/(auth)/sign-up.tsx` (sends `options.data.full_name`), `src/features/auth/signUpName.ts` |
| Password never stored by us in readable form | Supabase Auth owns `auth.users`; the app only calls `supabase.auth.signUp/signInWithPassword` |
| Profile stores name, role, coach link | `supabase/migrations/20260919114447_init_extensions_and_profiles.sql` (`profiles`: `role`, `coach_id`, `full_name`, `avatar_url`) |
| Profile auto-provisioned with role `member` | `supabase/migrations/20260919152100_profile_provisioning.sql` |
| Coach bio/specialties | `supabase/migrations/20260919153000_coach_directory_and_notes_gating.sql` (`coach_profiles`) |
| Workout/exercise/effort records | `supabase/migrations/20260919114448_workout_schema.sql` (`workout_plans`, `workout_days`, `exercises`, `workout_completions`, `exercise_completions`, `milestones`) |
| Diet check-ins store member, item and date | `supabase/migrations/20260919114449_diet_schema.sql` (`diet_checkins`) |
| Blocks and reports (free-text reason) | `supabase/migrations/20260919114450_community_schema.sql` (`moderation_reports.reason`), `20260919130000_community_blocks_and_roster.sql` (`user_blocks`) |
| Live-class join/leave times | `supabase/migrations/20260919114451_live_classes_schema.sql` (`live_class_participants.joined_at/left_at`) |
| Live A/V via Agora, token gated per class | `supabase/functions/agora-rtc-token/`, `EXPO_PUBLIC_AGORA_APP_ID` in `src/types/env.d.ts` |
| Camera/mic only for live classes, with OS permission strings | `app.json` → `ios.infoPlist.NSCameraUsageDescription` / `NSMicrophoneUsageDescription`, `android.permissions` CAMERA / RECORD_AUDIO |
| Recordings land in a **private** bucket | `supabase/migrations/20260919151000_recordings_pipeline.sql` (`insert into storage.buckets … public = false`, object policies `recordings_objects_*`) |
| Deepgram transcribes from a signed URL | `supabase/functions/_shared/asr.ts` (`DEEPGRAM_URL = https://api.deepgram.com/v1/listen`, `DEEPGRAM_MODEL = nova-2`, "Deepgram fetches the media itself from the signed URL") |
| Anthropic drafts the notes from the transcript text | `supabase/functions/_shared/drafter.ts` (`ANTHROPIC_URL = https://api.anthropic.com/v1/messages`) |
| Transcript text stored | `supabase/migrations/20260919114451_live_classes_schema.sql` (`transcripts.raw_text`) |
| Membership row holds status and period end only | `supabase/migrations/20260919150000_subscriptions_and_live_access.sql` (`subscriptions`: `status`, `current_period_end`, `provider`, `provider_ref` — no payment fields) |
| Staff membership history can hold an amount and currency | `supabase/migrations/20260921130000_admin_payments.sql` (`subscription_events.amount_cents integer`, `currency text`, `check currency ~ '^[A-Z]{3}$'`), written through `rpc('admin_mark_paid')` in `src/features/admin/api.ts` (`p_amount_cents`) |
| No staff payment screen ships today | grep of `src/` + `app/` for `markPaid` finds only `src/features/admin/api.ts` and `types.ts` — **no `.tsx` call site, no `app/admin` route** (verified 2026-09-21). This is what makes the exposure latent; see Appendix B |
| No card data, no payment form, no payment SDK | no payment provider package in `package.json`; no payment input anywhere in `src/` or `app/` |
| Push token + platform stored | `supabase/migrations/20260919130100_push_tokens_and_reminders.sql` (`push_tokens.expo_push_token`, `platform`), `src/features/liveClasses/api.ts` `upsertPushToken` |
| Push delivered through Expo | `supabase/functions/live-class-reminder/index.ts` (`EXPO_PUBLIC_… exp.host/--/api/v2/push/send`), `src/services/push/realPushService.ts` (`getExpoPushTokenAsync`) |
| No analytics / ads / crash SDK | repo-wide grep for `sentry`, `analytics`, `amplitude`, `firebase` over `src/`, `app/`, `package.json` → no matches (2026-09-21) |
| No location / contacts / calendar / HealthKit | no such permission in `app.json`; no matching API use in `src/` |
| Device timezone (IANA name) stored on the profile | `supabase/migrations/20260921112000_timezone_local_dates.sql` (`profiles add column if not exists timezone text not null default 'UTC'`, validated against `pg_timezone_names`); written by `src/features/auth/timezoneSync.ts` (`deviceTimezone()` = `Intl.DateTimeFormat().resolvedOptions().timeZone`, then `.update({ timezone })`) |
| Timezone refreshed after sign-in and on foreground; only the current value kept | `src/features/auth/useTimezoneSync.ts`, mounted at `src/features/auth/SessionEffects.tsx`; the column is a single `text`, overwritten in place — no history table |
| Timezone used only for the local check-in day | the 20260921112000 migration header: streaks and the one-completion-per-day rule are computed in the member's timezone |
| `avatar_url` unused | column exists in `profiles`; repo-wide grep for `avatar_url` in `src/` and `app/` → no matches |
| In-app deletion: type `DELETE` + password, deletes the session owner only | `supabase/functions/delete-account/logic.ts` ("the account being deleted is ALWAYS the owner of the verified JWT"; confirm word is case-sensitive `DELETE`), `logic.test.ts` ("returns NO user identifier, so a forged body cannot retarget the delete") |
| Deletion cascades to member data | every table above declares `references public.profiles (id) on delete cascade` |
| Deletion removes the user's own storage objects | `supabase/functions/delete-account/logic.ts` (`storagePrefix(userId)` = `<uid>/`, `collectUserObjectPaths`), `index.ts` step 4 |
| Storage cleanup can lag behind the delete | `logic.ts` `buildSuccessBody(true)` → `{ ok: true, storage_cleanup_pending: true }` |
| Row-level security limits who reads what | `20260919120000_fix_rls_infinite_recursion.sql`, `20260919140000_realtime_presence_authorization.sql`, `20260919154100_admin_read_and_hardening.sql` |
| Server secrets never in the app bundle | Deepgram/Anthropic/Agora certificate are read via `Deno.env.get(...)` inside `supabase/functions/**`; only `EXPO_PUBLIC_*` values ship in the app |

### Claims that are UNVERIFIED and must not be published as-is

| Claim | Why unverified |
|---|---|
| Retention periods for recordings, transcripts, reports and backups | no scheduled deletion exists in the code; these are owner policy decisions |
| The email provider used for confirmation / reset emails | depends on the SMTP the owner configures in Supabase Auth |
| The hosting region and backup/PITR window | depends on the Supabase Cloud project the owner creates |
| GDPR legal bases and transfer mechanisms | legal determinations, not code facts |
| "We answer rights requests within N days" | an owner commitment |

---

## Appendix B — Owner must confirm before publishing

1. `{{LEGAL_ENTITY}}` — exact registered company name.
2. `{{REGISTERED_ADDRESS}}` — registered address (Apple and Google both require reachable contact details).
3. `{{SUPPORT_EMAIL}}` — the monitored support address (same address in the Terms, the support page and both store listings).
4. `{{PRIVACY_POLICY_URL}}` — where this document will live (public, no login).
5. `{{EFFECTIVE_DATE}}`.
6. `{{GOVERNING_LAW}}` — country/state whose law governs, for the lawyer review and the Terms.
7. `{{MINIMUM_AGE}}` — must match the App Store age rating and Play's target-audience declaration (build team recommends 16+).
8. `{{SUPABASE_REGION}}` — hosting region, plus backup/PITR retention.
9. `{{EMAIL_PROVIDER}}` — SMTP provider for auth emails.
10. Retention periods for recordings, transcripts and moderation reports, and who runs the deletion.
11. `{{RIGHTS_RESPONSE_DAYS}}` — the response commitment for data-rights requests.
12. Whether a crash/monitoring SDK (e.g. Sentry) will be in the **first** build — if yes, sections 4 and 6 and both store privacy forms change before submission.
13. Whether members outside the EU/UK only, or also inside (drives the GDPR sections).
14. The process for removing a member from a coach's recording on request.
15. **DECISION — does the staff "mark as paid" screen ship in v1?** The database column
    (`subscription_events.amount_cents` / `currency`) and the `admin_mark_paid` RPC both exist and
    are reachable from `src/features/admin/api.ts`, but **no screen calls them today**. The answer
    changes three documents, so it must be made before submission:
    - **If it ships** (or may ship in a v1.x update without a new review): keep §3.6's payment-record
      paragraph, declare **Financial Info → Other Financial Info** on Apple's App Privacy form and
      **Financial info → Purchase history** on Play's Data safety form (both *collected, linked to
      the user, not shared, not used for tracking*).
    - **If it does not ship in v1:** §3.6's payment-record paragraph may be cut and both forms may
      stay as they are — but record that decision against
      `supabase/migrations/20260921130000_admin_payments.sql`, because the moment a UI lands on that
      RPC the declarations become false and both store forms must be resubmitted.
    The build team cannot make this call: it is a product decision about what staff tooling ships.
    Both options are written out in `docs/store/app-store-connect.md` §3 and
    `docs/store/google-play.md` §7.
