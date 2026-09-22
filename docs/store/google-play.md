# Google Play Console — DBF Fitness submission pack (DRAFT)

> Every field and declaration Play Console asks for, with the answers and the reasoning.
> `{{PLACEHOLDER}}` / `TODO_OWNER:` = the owner must supply it; never invent these.
> **Every policy statement cites the official page it came from — re-verify each at submission**,
> Play's forms change often.

- App: **DBF Fitness** — package `com.dbffitness.app`
- Developer account: **organization (company)** account, already held
- Default language: **English (United States)**; English only for v1
- App or game: **App**. Free or paid: **Free**. Contains ads: **No**.

---

## 1. Store listing

| Field | Value | Limit |
|---|---|---|
| App name | `DBF Fitness` | 30 chars (11 used) |
| Short description | `Your coach's plan, live classes and class notes — all in one app.` | 80 chars (65 used) — https://support.google.com/googleplay/android-developer/answer/1078870 |
| Full description | see below | 4000 chars |
| App category | **Health & Fitness** | |
| Tags | Fitness, Personal training, Workout `TODO_OWNER: pick up to 5 in console` | |
| Contact email | `{{SUPPORT_EMAIL}}` | required, shown publicly |
| Contact website | `{{SUPPORT_URL}}` | |
| Contact phone | `{{SUPPORT_PHONE}}` | optional |
| Privacy policy URL | `{{PRIVACY_POLICY_URL}}` | required |

### Full description

```
DBF Fitness is the private coaching app for DBF members.

Your coach builds your plan. You follow it on your phone. Everything you and your coach need is in one place.

YOUR WORKOUT PLAN
See the day your coach planned for you, exercise by exercise, with sets, reps and notes. Tick each exercise off as you finish it, then mark the day done. Your coach follows your progress as it happens.

YOUR NUTRITION PLAN
Your diet plan, split into daily items you can check off. Simple daily accountability, not calorie maths.

LIVE CLASSES
Join your coach's live class from your phone, see your coach and your group, and train together. Live classes are for members with an active DBF membership.

CLASS NOTES
After a session your coach publishes the notes: what was covered, the cues that mattered and what to work on next.

YOUR GROUP
See who trains with your coach and who is online right now. Report or block anyone who behaves badly — our staff review every report and act within 24 hours.

EFFORT AND MILESTONES
Log effort, watch milestones land, and look back at the calendar to see the weeks you showed up.

MEMBERSHIP AND PAYMENT
DBF memberships are arranged and paid directly with DBF, outside the app. The app never asks for payment details — it only shows whether your membership is active.

PERMISSIONS
Camera and microphone are used only while you are in a live class, and only if you allow them. Notifications are used only to remind you that a class is starting.

IMPORTANT
DBF Fitness is not a medical service and does not provide medical advice, diagnosis or treatment. Talk to a doctor before starting or changing any exercise or nutrition programme, and stop if you feel unwell.

An account is required. DBF Fitness is for DBF members and coaches.

Privacy Policy: {{PRIVACY_POLICY_URL}}
Terms of Service: {{TERMS_URL}}
Support: {{SUPPORT_EMAIL}}
```

---

## 2. Graphic assets

Specs verified 2026-09-21 at
https://support.google.com/googleplay/android-developer/answer/1078870 — re-verify at submission.

| Asset | Spec | Status |
|---|---|---|
| App icon | **512 x 512 px**, 32-bit PNG **with** alpha, max 1024 KB | `TODO_OWNER:` export from the brand mark — `assets/icon.png` is the in-app icon, not the store asset |
| Feature graphic | **1024 x 500 px**, JPEG or 24-bit PNG (**no** alpha) | `TODO_OWNER:` design needed. Keep the logo out of the centre (it is cropped in some layouts) and never say "Best", "#1", "Top", "New", "Free", "Discount", "Sale" or download counts |
| Phone screenshots | JPEG or 24-bit PNG, no alpha; min dimension 320 px, max 3840 px, and no side may exceed twice the other. **At least 2 required**; Google recommends **at least 4 at 1080 px+**, portrait 9:16 (min 1080 x 1920) | plan: the same 6 screens as iOS, exported at **1080 x 1920** |
| 7" / 10" tablet screenshots | only if you claim tablet support | not needed — phone-only release |
| Alt text | supply for every asset | `TODO_OWNER:` |

Screenshot set and captions — use the same six screens and the same order as the App Store
(`docs/store/app-store-connect.md` §7): home, workout day, live class, class notes, food
check-ins, community roster. Source QA captures live in `docs/screenshots/` but are the wrong size
and were taken in the web harness; recapture on an Android emulator/device at 1080 x 1920.

---

## 3. App content declarations (Policy → App content)

Page: https://support.google.com/googleplay/android-developer/answer/9859455 — re-verify at
submission.

| Declaration | Answer |
|---|---|
| **Privacy policy** | `{{PRIVACY_POLICY_URL}}` |
| **Ads** | No, the app contains no ads (no ad SDK in the code) |
| **App access** | **All or some functionality is restricted** — see §4 |
| **Content ratings** | IARC questionnaire — see §5 |
| **Target audience and content** | see §6 |
| **News app** | No |
| **COVID-19 contact tracing / status** | No |
| **Data safety** | see §7 |
| **Government apps** | No |
| **Financial features** | **No** — the app has no payment form, no payment SDK, no lending and no crypto; membership payment happens outside the app. (This answer is about *features*, so it stays No either way. The separate Data safety question about *financial information* is a pending decision — see §7) |
| **Health apps** | see §8 — mandatory for every app, even one with no health features |
| **Advertising ID permission** | Not declared — the app does not use `AD_ID` (no ad or analytics SDK) |

---

## 4. App access (sign-in instructions)

Play: "If your entire app or parts of your app are restricted based on login credentials, sign in
details, memberships, location, or other forms of authentication, you must provide all required
details to enable access to your app."
(https://support.google.com/googleplay/android-developer/answer/9859455)

Add these instructions in Play Console → App content → App access → "All or some functionality is
restricted":

**Instruction 1 — Member account (whole app)**
```
Name: Member account (full app)
Username: TODO_OWNER_DEMO_MEMBER_EMAIL
Password: TODO_OWNER_DEMO_MEMBER_PASSWORD
Any other instructions:
  Sign in with the credentials above. This member has an active membership, a workout plan, a diet
  plan and a group, so every screen has content.
  Live class: Community tab -> Live -> open the class -> Join. A demo class runs daily at
  TODO_OWNER_DEMO_CLASS_TIME (TODO_OWNER_TIMEZONE) for 60 minutes. Camera and microphone
  permission is requested on join; you can decline and still enter as a viewer.
  Report/block: Community tab -> open a group -> a person's row -> Report or Block.
  Account deletion: Profile tab -> Danger zone -> Delete account (type DELETE + password).
  Memberships are paid to the gym outside the app; the app contains no purchase flow.
```

**Instruction 2 — Coach account (live class host)**
```
Name: Coach account (starts live classes)
Username: TODO_OWNER_DEMO_COACH_EMAIL
Password: TODO_OWNER_DEMO_COACH_PASSWORD
Any other instructions:
  Use this account on a second device to start a live class and see the coach side (schedule,
  roster, class notes). Contact TODO_OWNER_SUPPORT_EMAIL and we will start a class on request
  within TODO_OWNER_REVIEW_RESPONSE during TODO_OWNER_REVIEW_HOURS.
```

---

## 5. Content rating (IARC questionnaire)

Category: **Utility, Productivity, Communication, or Other** (the app is a coaching utility with
real-time communication, not a game).

| Question area | Answer | Reasoning |
|---|---|---|
| Violence, sexuality, profanity, controlled substances, gambling, horror | **No** to all | none of this content exists; the Terms forbid it and staff moderate |
| Does the app allow users to **interact or exchange content** with each other? | **Yes** | live audio/video classes; a shared group roster |
| Can users **share their location** with other users? | **No** | no location feature at all |
| Does the app allow the purchase of digital goods? | **No** | no IAP, no purchase surface (see the iOS pack §2 for the parallel Apple question) |
| Does the app share user-provided personal information with third parties? | **No** (processors only) | Supabase/Agora/Deepgram/Anthropic/Expo act as our processors, not independent recipients |
| Does the app contain **user-generated content** that is shared publicly? | **No — private groups only** | content is visible only to a member's own coach and group, never publicly |
| Miscellaneous: does the app have a **moderation** system? | **Yes** | in-app report + block, staff review within 24 h |

Expected rating: **PEGI 3 / ESRB Everyone / USK 0** on content, adjusted upward by the
interaction/UGC answers (typically an "Users interact" descriptor rather than a higher age band).
`TODO_OWNER:` whatever IARC returns, keep the store-facing minimum age consistent with the App
Store rating and the Privacy Policy (`{{MINIMUM_AGE}}`, recommended 16+).

---

## 6. Target audience and content

- **Target age groups:** `{{MINIMUM_AGE}}`+ only. With the recommended minimum of **16**, tick
  **16–17** and **18 and over** and nothing else; with a minimum of 18, tick only **18 and over**.
  **Do not tick any age band below 13** — that pulls the app into the Families policy and Designed
  for Families requirements, which this app cannot meet (live video with adults, UGC, no parental
  controls).
- **Could the app unintentionally appeal to children?** No — it is a private gym-member app; the
  store listing shows adults training.
- **Ads:** none.
- Keep this consistent with the Privacy Policy (§9) and the App Store age rating.

---

## 7. Data safety form

Definitions used: "**Collection**: transmitting data from your app off a user's device";
"**Sharing**: transferring user data collected from your app to a third party" — with an exception
for service providers processing on the developer's behalf
(https://support.google.com/googleplay/android-developer/answer/10787469 — re-verify at submission).

**Security practices**
- Is all of the user data collected by your app **encrypted in transit**? → **Yes** (HTTPS/TLS to
  Supabase, Agora, Deepgram, Anthropic and the push services).
- Do you provide a way for users to **request that their data be deleted**? → **Yes** — deletion is
  available **in the app** (Profile → Danger zone → Delete account) and by emailing
  `{{SUPPORT_EMAIL}}`. Give `{{ACCOUNT_DELETION_URL}}` as the web deletion-request URL
  (`TODO_OWNER:` a page that explains the in-app path and offers the email route is acceptable and
  is what `docs/legal/support-page.md` provides).
- Has your app been independently validated against a global security standard? → **No**.

**Data types** — declare each as Collected = Yes, Shared = No (processors are not "sharing"),
Processed ephemerally = No unless noted, and mark whether it is required.

| Category → type | Collected | Shared | Required? | Purposes | Code evidence |
|---|---|---|---|---|---|
| Personal info → **Name** | Yes | No | Required | App functionality | `profiles.full_name` |
| Personal info → **Email address** | Yes | No | Required | App functionality, Account management | Supabase Auth |
| Personal info → **User IDs** | Yes | No | Required | App functionality | account UUID; Agora uid derived from it |
| Health and fitness → **Fitness info** | Yes | No | Required | App functionality | workout/exercise completions, effort, milestones, diet check-ins |
| Photos and videos → **Videos** | Yes | No | Optional | App functionality | live-class camera via Agora; coach-uploaded class recordings |
| Audio → **Voice or sound recordings** | Yes | No | Optional | App functionality | live-class microphone; coach recordings; transcripts |
| App activity → **App interactions** | Yes | No | Required | App functionality | class join/leave times, check-in timestamps |
| App activity → **Other user-generated content** | Yes | No | Required | App functionality | report reason text, coach bio/specialties, class notes |
| App activity → **Other actions** (device timezone) | Yes | No | Required | App functionality | `profiles.timezone` — the IANA zone name the device reports, synced after sign-in and on every foreground (`src/features/auth/timezoneSync.ts`, migration `20260921112000_timezone_local_dates.sql`). Used only to decide which calendar day a check-in falls on. Declared here rather than under Location: it is a region name, not a position, and no location API is called |
| Device or other IDs → **Device or other IDs** | **Yes** | No | Optional | App functionality | the **Expo/FCM push token** stored per device with its platform (`push_tokens.expo_push_token`, `platform`; `upsertPushToken` in `src/features/liveClasses/api.ts`). Google's Data safety definition covers "identifiers that relate to an individual device", and a push token does, so this is declared **Yes** rather than argued away. It is used solely to deliver class reminders, is never shared with a third party for their own purposes, and is deleted with the account. Only set when the member grants notification permission, hence Optional (https://support.google.com/googleplay/android-developer/answer/10787469 — re-verify at submission) |
| Messages → any | **No** | | | | no messaging/chat feature exists |
| Location, Contacts, Calendar, Files and docs, Web browsing | **No** | | | | no such collection in the code; no advertising ID |
| App info and performance → Crash logs / Diagnostics | **No** | | | | no crash or analytics SDK in the app today (`TODO_OWNER:` changes if Sentry is added) |
| Financial info → Purchase history / Other financial info | **DECISION PENDING** | | | | see the note below — currently **No** |

**DECISION PENDING — Financial info.** Declared *No* above, which is true **only while the staff
"mark as paid" screen does not ship**. `subscription_events.amount_cents` and `currency` exist
(migration `20260921130000_admin_payments.sql`) and the `admin_mark_paid` RPC is reachable from
`src/features/admin/api.ts`, but no screen calls it today (grep of `src/` + `app/` for `markPaid`
finds no `.tsx` call site, verified 2026-09-21).

- **Option A — the admin payments UI does NOT ship in v1 (current assumption):** keep *No*. Record
  the decision against the migration and treat any PR adding a UI on `admin_mark_paid` as a
  blocker that requires an updated Data safety form.
- **Option B — it ships (or may ship in a v1.x update):** declare **Financial info → Purchase
  history** as *Collected = Yes, Shared = No, Optional, purpose App functionality*, and add the
  payment-record paragraph to the privacy policy §3.6 (already drafted). Note this also flips
  "Financial features" in §5 of this document.

Same decision, same two options, as `docs/store/app-store-connect.md` §3 and
`docs/legal/privacy-policy.md` Appendix B item 15. The owner must pick one before submission.

Ephemeral-processing note: the **live** audio/video stream is relayed by Agora in real time and is
not stored by us — but because a coach-uploaded recording and its transcript **are** stored, the
video and audio types are declared as collected rather than ephemeral. This is the conservative and
truthful answer.

---

## 8. Health apps declaration

Mandatory for every published app — including apps with no health features — since
31 August 2024 (https://support.google.com/googleplay/android-developer/answer/14738291 —
re-verify at submission).

| Question | Answer |
|---|---|
| Does your app provide health features? | **Yes** |
| Which categories? | **Health and Fitness → Activity and Fitness**, and **Health and Fitness → Nutrition and Weight Management** |
| Any Medical category? | **No** — no diseases/conditions management, no clinical decision support, no medication management, no telehealth-style medical consultation |
| Is the app a regulated **medical device**? | **No** — no diagnosis, treatment, monitoring or measurement of a medical condition; the EEA medical-device fields do not apply |
| Health subjects research / clinical trials? | **No** |

Supporting facts: the app records completed workouts/exercises and diet-item check-ins and shows
coach-written plans and notes; it reads no sensors, no HealthKit/Health Connect data, and gives no
clinical advice. `TODO_OWNER:` Play may ask for supporting documentation or a description of the
app's health claims — point them at the description's IMPORTANT paragraph and the Terms §9.

---

## 9. Permissions justification

Declared in `app.json` → `android.permissions` (verified 2026-09-21). Play shows these to users and
may ask why each is needed.

| Permission | Why the app needs it | When it is requested |
|---|---|---|
| `android.permission.CAMERA` | send your video to your coach and group during a live class | only when joining a live class; declinable |
| `android.permission.RECORD_AUDIO` | send your voice during a live class | only when joining a live class; declinable |
| `android.permission.MODIFY_AUDIO_SETTINGS` | let the real-time video SDK route audio correctly (speaker/earpiece/headset) during a class | implicit, needed by the Agora SDK |
| `android.permission.BLUETOOTH_CONNECT` | let audio play through a connected Bluetooth headset during a class | only when a Bluetooth audio device is in use |
| `android.permission.POST_NOTIFICATIONS` | send live-class reminders | on first launch / first notification opt-in; declinable |

No sensitive-permission declaration form is required: the app requests no SMS, Call Log, location,
all-files access, `QUERY_ALL_PACKAGES` or `AD_ID`.

---

## 10. User-generated content policy compliance

Play's UGC policy requires moderation that (verbatim, re-verified 2026-09-21 at
https://support.google.com/googleplay/android-developer/answer/9876937 — re-verify at submission):
"Requires users accept the app's terms of use and/or user policy before users can create or upload
UGC"; "Defines objectionable content and behaviors … and prohibits them in the app's terms of use or
user policies"; "Conducts UGC moderation, as is reasonable and consistent with the type of UGC
hosted by the app. This includes providing an in-app system for reporting and blocking objectionable
UGC and users, and taking action against UGC or users where appropriate"; "Provides safeguards to
prevent in-app monetization from encouraging objectionable user behavior".

| Requirement | How DBF Fitness meets it |
|---|---|
| In-app reporting | Community → group → person's row → **Report** → reason (Harassment / Spam / Inappropriate content / Other) + up to 500 characters of detail (`src/components/community/ReportPanel.tsx`, `src/features/community/reportReasons.ts`, `moderation_reports` table) |
| In-app blocking | same row → **Block** → "Yes, block"; the pair disappear from each other's rosters (`user_blocks` table) |
| Moderation and action | staff review queue; action within **24 hours**; removal, suspension or account termination |
| Terms of use that users accept, with prohibited content defined | `docs/legal/terms-of-service.md` §4–7, **actively accepted in the app**: sign-up shows a required checkbox with tappable Terms and Privacy links and keeps the submit button disabled until it is ticked (`src/components/legal/TermsCheckbox.tsx`, `app/(auth)/sign-up.tsx`), and the acceptance is recorded server-side in `terms_acceptances` through the `accept_terms` RPC. Accounts that predate the terms and every future version bump are caught by `TermsGate` (`src/features/legal/TermsGate.tsx`), which blocks the app until the current `TERMS_VERSION` is accepted and offers a Sign-out escape |
| Published contact information | `{{SUPPORT_EMAIL}}` on the support page and in the listing |
| Content is private, not public | groups are visible only to a coach's own members (row-level security) |
| Safeguards against monetization encouraging objectionable behaviour | nothing in the app is monetised: no IAP, no ads, no gifting, no rewards, no leaderboard prizes; membership is paid to the gym outside the app |
| In-app reporting and blocking from the live class too | the live-class participant list carries the same Report and Block actions as the community roster, reusing the same `ReportPanel` and `user_blocks` (`src/features/moderation/ParticipantModeration.tsx`) |
| Proactive filtering of objectionable material (Apple 1.2 asks for this explicitly; Play asks for moderation "as is reasonable") | **A curated word-list filter runs on the sign-up display name** (`src/features/moderation/contentFilter.ts` + `objectionableWords.ts`, wired at `app/(auth)/sign-up.tsx`): locale-neutral matching (NFKD fold, diacritics stripped, leet digits mapped, repeated letters collapsed, whole words only) that refuses the name inline before the account exists. **Limits, stated honestly:** a word list misses obfuscation, context, other languages, images and live speech; and it is wired to the display name **only** — the coach bio and the live-class title are not filtered yet (open work). Structural controls remain the larger part: private groups, known members, staff-only report text, coach-hosted classes. Human review is the backstop. See `docs/store/app-store-connect.md` §6a |

---

## 10a. Target API level — BLOCKING, and the deadline has already passed

Google Play refuses an upload whose `targetSdkVersion` is below the current floor. From
https://support.google.com/googleplay/android-developer/answer/11926878 (fetched 2026-09-21 —
re-verify at submission):

| Who | Requirement | From |
|---|---|---|
| **New apps and app updates** | must target **Android 16 (API level 36)** or higher | **31 August 2026** |
| Existing apps (to stay available to new users on newer Android versions) | Android 15 (API level 35) | 31 August 2026 |
| Wear OS / Android Automotive | Android 15 (API level 35) | 31 August 2026 |
| Android TV | Android 14 (API level 34) | 31 August 2025 |

The page also notes an extension mechanism: developers "will be able to request an extension to
November 1, 2026" if they need more time.

**Today is 2026-09-21, so the 31 August 2026 date is in the past.** This is not a future deadline
to plan around — it gates the very first AAB upload. An upload below API 36 is rejected by the
Play Console before any review happens.

**Status in this repo: UNVERIFIED.** `app.json` pins no `compileSdkVersion` or `targetSdkVersion`
and the project carries no `expo-build-properties` plugin (`plugins` lists only `expo-router`,
`expo-splash-screen` and `expo-notifications`), so the value is whatever Expo SDK ~57
(`package.json`: `"expo": "~57.0.24"`) defaults to. That is *plausibly* API 36, but nothing in
this repo asserts it and the value cannot be read without generating the native project. **Do not
assume it.**

**[VERIFY] before the first AAB upload** — run either of these and read the number:

```bash
# A. From the generated native project (run in a scratch copy, never in the repo):
CI=1 npx expo prebuild --platform android --no-install --clean
grep -rn "targetSdkVersion\|compileSdkVersion" android/build.gradle android/app/build.gradle

# B. Or from the introspected config, without a full prebuild:
npx expo config --type introspect | grep -i -A3 "buildProperties\|targetSdk"
```

**If it is below 36**, pin it explicitly rather than relying on a default — add
`expo-build-properties` to `app.json` → `plugins`:

```json
["expo-build-properties", { "android": { "compileSdkVersion": 36, "targetSdkVersion": 36 } }]
```

`TODO_OWNER:` adding that plugin needs `npx expo install expo-build-properties`, which is a
dependency change outside the store lanes' scope — raise it with the build team if step A or B
reports anything under 36. Then re-run the Android behaviour checks on a real device: a target
API bump changes runtime behaviour (notification, foreground-service and media permissions are
the usual casualties), so the real-device checklist in `docs/deploy/production.md` §D must be
repeated after any change here.

---

## 11. Release tracks and rollout plan (company account)

**The 12-testers / 14-days rule.** Google's official page is titled *"App testing requirements for
new **personal** developer accounts"* and states the requirement applies to "personal developer
accounts created after November 13, 2023", which must "run a closed test … with a minimum of 12
testers who have been opted in continuously for at least 14 days"
(https://support.google.com/googleplay/android-developer/answer/14151465 — re-verify at submission).

**This app is published from an organization (company) account, so that page does not impose the
12-tester / 14-day closed test on it.** Caveats, stated honestly:

- Google's page does not say organization accounts are *exempt*; it only scopes itself to personal
  accounts. Developers have reported org accounts being asked for production access anyway
  (Play Console community threads, e.g.
  https://support.google.com/googleplay/android-developer/thread/398243168). **UNVERIFIED** for this
  account until the owner opens Play Console → the app → Production and reads what the console
  actually asks for. Check this **before** promising a launch date.
- Whatever the console says, a real closed test is still the right engineering move for a first
  release with live video and push.

**Plan:**

1. **Internal testing** (up to 100 testers, no review wait): upload the first AAB here. Verify on
   real Android phones — sign-up, live class with camera and mic, class reminder push, recording
   upload as a coach, account deletion.
2. **Closed testing** — `{{CLOSED_TEST_TESTERS}}` testers (use **at least 12 for at least 14 days**
   if the console asks for it, or simply to be safe) on real devices across at least two Android
   versions and one low-end phone.
3. **Production**, staged rollout: **5% → 20% → 50% → 100%**, at least 24 hours per step, watching
   crashes and ANRs in Play Console → Quality → Android vitals. Halt and fix before continuing if
   the crash rate moves.
4. First review of a new app typically takes days, not hours — plan for it and do not schedule a
   launch announcement until the app is approved and live.
5. Rollback: you cannot un-publish a released version's users, so use **halt rollout** on the
   staged release and ship a fixed version; keep `appVersionSource: remote` (already set in
   `eas.json`) so version codes always increase.

---

## 12. Submission checklist

1. **owner** — Play Console organization account verified (D-U-N-S, legal name, address, contact
   email confirmed under Account details).
2. **owner** — publish `{{PRIVACY_POLICY_URL}}`, `{{TERMS_URL}}`, `{{SUPPORT_URL}}`.
3. Create the app in Play Console (App name `DBF Fitness`, default language English (US), App,
   Free).
4. Store listing (§1) + graphic assets (§2).
5. App content declarations (§3–§8): privacy policy, ads, app access, content rating, target
   audience, data safety, financial features, health apps.
6. **[VERIFY] target API level ≥ 36 (§10a) — do this BEFORE building the AAB.** The 31 August
   2026 deadline has already passed, so a lower target is rejected at upload.
7. **[VERIFY] no external-billing steering**: `grep -rn 'EXPO_PUBLIC_BILLING_URL' eas.json .env`
   must return nothing, and `EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK` must be unset or `false`
   (see `docs/store/app-store-connect.md` §2 for why, including the four ungated legacy surfaces).
8. **[VERIFY] no placeholders in the legal env vars**: `grep -n 'REPLACE_' eas.json` must return
   nothing. A release build with a `REPLACE_` privacy/terms/support URL, or with no
   `EXPO_PUBLIC_SUPPORT_EMAIL`, now refuses to start (`src/config/ConfigGate.tsx`) — but catch it
   here rather than after the upload.
9. Set up the **app signing** key (Play App Signing, managed by EAS — see
   `docs/deploy/production.md` §B) and upload the first AAB to **internal testing**.
10. Verify on real devices (§11 step 1).
11. Closed test if required/desired (§11 step 2).
12. Apply for production access if the console asks, then roll out staged (§11 step 3).
13. Keep the demo accounts in §4 alive for as long as the app is listed — Play re-reviews updates.

### Known risks

| Risk | Mitigation |
|---|---|
| Data safety form does not match app behaviour | §7 is derived from the code, table by table; re-check it whenever a data-touching feature ships |
| Health apps declaration missing or wrong | §8; it is mandatory even for non-health apps |
| UGC enforcement | Report/Block exist in the app; the missing piece is the Terms link on sign-up (§10) |
| Permissions look excessive | §9 explains each; none is in a sensitive-permission programme |
| Production access blocked by a testing requirement | verify in the console early (§11) |
