# App Store Connect — DBF Fitness submission pack (DRAFT)

> Everything App Store Connect will ask for, ready to paste, plus the answers to every
> questionnaire with the reasoning behind them. `{{PLACEHOLDER}}` / `TODO_OWNER:` = the owner must
> supply it; never invent these.
>
> **Every policy statement below cites the official Apple page it came from. Re-verify each one at
> submission** — Apple changes the guidelines and the questionnaires frequently. The age-rating
> questionnaire was replaced in 2025 and Apple's deadline for answering the updated questions
> ("by January 31, 2026, to avoid an interruption when submitting your app updates in App Store
> Connect", https://developer.apple.com/news/upcoming-requirements/?id=07242025a — re-verified
> 2026-09-21) has **already passed**, so the new questionnaire must be answered for this app before
> its first submission.

- App: **DBF Fitness** — bundle id `com.dbffitness.app`
- Publisher: `{{LEGAL_ENTITY}}` (company Apple Developer Program account, already held)
- Primary language: **English (U.S.)**, English only for v1
- Platform: **iPhone only** (`app.json` → `ios.supportsTablet: false`), portrait only

---

## 1. App information

| Field | Value | Limit |
|---|---|---|
| App Name | `DBF Fitness` | 30 chars max (11 used) — https://developer.apple.com/help/app-store-connect/reference/app-information/ |
| Subtitle | `Coach, live classes, progress` | 30 chars max (29 used) |
| Primary category | **Health & Fitness** | |
| Secondary category | *(leave empty)* — `TODO_OWNER:` "Sports" is the only sensible alternative | |
| Content rights | Contains third-party content: **No** (all plans, classes and notes are DBF's own) | |
| Privacy Policy URL | `{{PRIVACY_POLICY_URL}}` | required for iOS apps |
| Support URL | `{{SUPPORT_URL}}` | required; content in `docs/legal/support-page.md` |
| Marketing URL | `https://dbf-fitness.com/` | optional |
| Copyright | `{{YEAR}} {{LEGAL_ENTITY}}` | |
| Age rating | see §4 | |
| Pricing | **Free**, all territories `TODO_OWNER: confirm territories` | |

### Promotional text (170 chars max, editable without a new build)

```
Your coach, your plan, your group — now with live classes you can join from anywhere. Tick off workouts and meals, and get the notes after every session.
```

### Description

```
DBF Fitness is the private coaching app for DBF members.

Your coach builds your plan. You follow it on your phone. Everything you and your coach need lives in one place — no spreadsheets, no lost messages.

YOUR WORKOUT PLAN
See the day your coach planned for you, exercise by exercise, with sets, reps and notes. Tick each exercise off as you finish it and mark the day done. Your coach sees your progress as it happens.

YOUR NUTRITION PLAN
Your diet plan, split into daily items you can check off. Simple daily accountability, not calorie maths.

LIVE CLASSES
Join your coach's live class from your phone. See your coach and your group, train together, and pick up the notes afterwards. Classes are for members with an active membership.

CLASS NOTES
After a session your coach publishes the notes: what was covered, the cues that mattered, what to work on next. Read them whenever you like.

YOUR GROUP
See who else trains with your coach and who is online. Report or block anyone who behaves badly — we review every report within 24 hours.

EFFORT AND MILESTONES
Log effort, watch milestones land, and look back at the calendar to see the weeks you showed up.

MEMBERSHIP
DBF memberships are arranged directly with DBF. The app never asks for payment details; it just shows whether your membership is active.

IMPORTANT
DBF Fitness is not a medical service and does not give medical advice. Talk to a doctor before starting or changing any exercise or nutrition programme, and stop if you feel unwell.

An account is required. DBF Fitness is for DBF members and coaches.

Privacy Policy: {{PRIVACY_POLICY_URL}}
Terms of Service: {{TERMS_URL}}
Support: {{SUPPORT_EMAIL}}
```

### Keywords (100 characters max, comma-separated, no spaces after commas)

```
gym,coach,workout,training,live,class,plan,diet,checkin,progress,trainer,strength,group,fitness
```

Notes: do not repeat words already in the app name or subtitle (Apple indexes those separately);
no competitor names; no plurals of words already present.

### What's New in This Version (first release)

```
First release of DBF Fitness.
```

---

## 2. Payments — read before you submit (RISK)

**Finding from the code (re-audited against `store/l1b`, 2026-09-21):** the app has no in-app
purchase and takes no payment. It stores only a membership status (`subscriptions` table: `status`,
`current_period_end`).

The external-billing link is now governed by a flag, `billingLinkAllowed()` =
`EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK === 'true'`, which **defaults to false**
(`src/components/subscription/billing.ts`). With the flag off the subscription surfaces show
neutral copy — `MANAGED_BY_DBF`: *"Your membership is managed by DBF. Contact your coach or DBF to
renew."* — plus the support mailto, and no purchase call to action. `EXPO_PUBLIC_BILLING_URL` has
also been removed from the preview and production profiles in `eas.json` (`grep -n BILLING_URL
eas.json` → no match).

> **KNOWN GAP — verify before every submission.** The flag governs only
> `src/components/subscription/**`. Four older modules still read `EXPO_PUBLIC_BILLING_URL`
> directly, with **no flag check at all**:
> `src/features/liveClasses/billing.ts` (`billingUrl()`/`openBilling()`),
> `src/components/live/SubscriptionBlockedPanel.tsx` ("Subscribe" / "Renew subscription"),
> `src/components/live/GraceNotice.tsx` ("Renew now" / "Renew"), and
> `src/components/coaching/SubscriptionCard.tsx` (which defines its own duplicate `billingUrl()`).
> Every one of those renders an `external-link` CTA the moment that variable is set. The build is
> compliant **only because the variable is set nowhere** — it is one env var away from doing
> exactly what the 3.1.3 preamble forbids.
>
> **Gate for the submission checklist:** `grep -rn 'EXPO_PUBLIC_BILLING_URL' eas.json .env` must
> return nothing before any build is uploaded. The durable fix is to point those four modules at
> the single flag-gated `billingUrl()` in `src/components/subscription/billing.ts` and delete the
> duplicate; that work sits outside lane L1b's write set and is still open.

Why that matters:

- Guideline **3.1.3(e) Goods and Services Outside of the App**: "If your app enables people to
  purchase physical goods or services that will be consumed outside of the app, you must use
  purchase methods other than in-app purchase to collect those payments."
- Guideline **3.1.3(d) Person-to-Person Services**: "If your app enables the purchase of real-time
  person-to-person services between two individuals (for example tutoring students, medical
  consultations, real estate tours, or fitness training), you may use purchase methods other than
  in-app purchase to collect those payments. **One-to-few and one-to-many real-time services must
  use in-app purchase.**"
  (https://developer.apple.com/app-store/review/guidelines/ — re-verify at submission)

DBF's live classes are **one-to-many real-time services delivered inside the app**. Read literally,
3.1.3(d) says a membership that unlocks them should be sold through in-app purchase. The counter-
argument is that the DBF membership is a gym membership for in-person/physical services under
3.1.3(e), and the app merely reflects it.

**Recommendation for v1 (lowest risk of rejection):**

1. Ship with **`EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK` unset (false) and
   `EXPO_PUBLIC_BILLING_URL` unset in every store profile** so there is no link out, no price and
   no purchase call-to-action anywhere in the app. Both are already absent from `eas.json`; the
   grep gate above is what keeps them that way. The locked state then reads *"Your membership is
   managed by DBF. Contact your coach or DBF to renew."* — no "Subscribe", no price, no URL.
2. State plainly in the App Review notes (§6) that memberships are sold by the gym outside the app,
   that the app sells nothing, and how the reviewer gets access anyway.
3. `TODO_OWNER:` if Apple still objects, the options are (a) add an in-app purchase for the digital
   live-class membership, or (b) remove live classes from the iOS build. Decide with Apple in the
   Resolution Center, do not guess.

The Android build has no such restriction for this case, but keep the wording consistent.

---

## 3. App Privacy ("nutrition label")

Filled from the code audit in `docs/legal/privacy-policy.md` Appendix A. Definitions used:
"**Collect**: transmitting data off the device in a way that allows you and/or your third-party
partners to access it for a period longer than what is necessary to service the transmitted request
in real time"; "**Tracking**: linking data collected from your app … with Third-Party Data for
targeted advertising or advertising measurement purposes, or sharing … with a data broker"
(https://developer.apple.com/app-store/app-privacy-details/ — re-verify at submission).

**Does your app collect data? → Yes.**
**Do you or your third-party partners use data for tracking? → No.** (no ads, no analytics, no
attribution SDK, no data broker — verified by repo-wide grep on 2026-09-21)

| Data type | Collected | Linked to the user | Used to track | Purposes | Why (code) |
|---|---|---|---|---|---|
| Contact Info → **Email Address** | Yes | Yes | No | App Functionality | sign-up / sign-in (Supabase Auth) |
| Contact Info → **Name** | Yes | Yes | No | App Functionality | `profiles.full_name`, shown to coach and group |
| Health & Fitness → **Fitness** | Yes | Yes | No | App Functionality | workout/exercise completions, effort, milestones, diet check-ins |
| User Content → **Audio Data** | Yes | Yes | No | App Functionality | live-class microphone (Agora); coach-uploaded recordings and their transcripts |
| User Content → **Photos or Videos** | Yes | Yes | No | App Functionality | live-class camera (Agora); coach-uploaded class recordings |
| User Content → **Other User Content** | Yes | Yes | No | App Functionality | report reason text, coach bio/specialties, class notes |
| Identifiers → **User ID** | Yes | Yes | No | App Functionality | account UUID; Agora channel uid derived from it; Expo push token is tied to the account |
| Usage Data → **Product Interaction** | Yes | Yes | No | App Functionality | class join/leave timestamps and check-in timestamps (product records, not analytics) |
| Other Data → **Other Data Types** (device timezone) | Yes | Yes | No | App Functionality | `profiles.timezone`, the IANA zone name the device reports, synced by `src/features/auth/timezoneSync.ts` after sign-in and on every foreground (migration `20260921112000_timezone_local_dates.sql`). Used solely to decide which calendar day a check-in belongs to. **Not** Location: it is a region name, not a position, and no location API is called |

**Not collected** (declare nothing): Location, Sensitive Info, Contacts, Browsing History, Search
History, Advertising Data, Diagnostics (no crash/analytics SDK in the app; App Store Connect's own
crash reporting is Apple's, not ours), Surroundings, Body.

**DECISION PENDING — Financial Info and Purchases.** These are currently declared *not collected*,
which is true **only while the staff "mark as paid" screen does not ship**. The column
(`subscription_events.amount_cents` / `currency`, migration `20260921130000_admin_payments.sql`) and
the `admin_mark_paid` RPC both exist and are reachable from `src/features/admin/api.ts`, but no
`.tsx` file calls them today (verified by grep, 2026-09-21), so nothing in the shipped app can write
an amount.

- **Option A — the admin payments UI does NOT ship in v1 (current assumption):** leave both as *not
  collected*. Record that decision against the migration, and treat any future PR that adds a UI on
  `admin_mark_paid` as a blocker requiring a resubmitted privacy label.
- **Option B — it ships (or may ship in a v1.x update):** declare **Financial Info → Other Financial
  Info** as *Collected, Linked to the user, Not used for tracking, purpose App Functionality*, and
  keep `Purchases` as *not collected* (there is no purchase in the app; the amount is a staff
  bookkeeping note). Add the matching paragraph to the privacy policy §3.6, which is already
  drafted.

The owner must pick one — see `docs/legal/privacy-policy.md` Appendix B item 15 and
`docs/store/google-play.md` §7.

Decisions worth recording:

- **Health & Fitness / Fitness, not Health.** The app records training and nutrition adherence; it
  reads no HealthKit data and no clinical measurements.
- **Everything is "Linked to you"** — every record hangs off an account id; nothing is anonymous.
- **Audio/Video are declared even though live streams are transient.** A coach-uploaded recording
  clearly persists, and the transcript of it persists, so "Collect" is satisfied.
- `TODO_OWNER:` if Sentry (or any analytics) is added, you must add **Diagnostics → Crash Data /
  Performance Data** and possibly Identifiers, and resubmit the label.

---

## 4. Age rating questionnaire

Apple replaced the old questionnaire: the ratings are now **4+, 9+, 13+, 16+, 18+**, with new
sections for In-App Controls, Capabilities, Medical or Wellness topics and Violent themes
(https://developer.apple.com/news/?id=ks775ehf). Apple's stated deadline for answering the updated
questions was **January 31, 2026** — "Provide responses to the updated age rating questions for each
of your apps by January 31, 2026, to avoid an interruption when submitting your app updates in App
Store Connect" (https://developer.apple.com/news/upcoming-requirements/?id=07242025a — re-verified
2026-09-21, re-verify at submission). That date has passed, so answer the new questionnaire in App
Store Connect → App Information before the first submission or the submission will be interrupted.

| Question area | Answer | Reasoning |
|---|---|---|
| **Capabilities → User-Generated Content** | **Yes** | members type report text; coaches publish notes; live camera/mic streams are user content |
| **Capabilities → Social media** ("redistribution, amplification, or interaction with user-generated content through a social feed or similar discovery method") | **No** | there is no feed, no posts, no likes, no sharing surface — only a group roster and live classes. `TODO_OWNER:` if you disagree after seeing the exact in-console wording, answer Yes and also answer the "disabled for under 13" follow-up |
| **Capabilities → Messaging and chat** ("users can directly communicate with one another") | **Yes** | live classes are direct real-time audio/video between users |
| **Capabilities → Unrestricted web access** | **No** | the only external link is the optional billing URL, which should be unset on iOS (§2). If you ship it, it is still a single fixed URL, not a browser |
| **Capabilities → Advertising** | **No** | no ads |
| **In-App Controls → Parental controls / Age assurance** | **No** | none implemented |
| **Medical or Wellness → Medical or treatment information** | **No** | no diagnosis, treatment or medication content |
| **Medical or Wellness → Health or wellness topics** | **Yes, infrequent/mild** | general fitness and nutrition guidance, with a disclaimer |
| Mature themes / profanity / horror / alcohol, tobacco, drugs | **None** | not present; live classes are moderated and the Terms forbid it |
| Sexuality or nudity | **None** | forbidden by the Terms and moderated |
| Violence (all kinds) | **None** | |
| Chance-based activities (gambling, loot boxes, contests) | **None** | |
| Age assurance / higher self-selected minimum | **Set the app's minimum age to `{{MINIMUM_AGE}}`** | Apple: "If your app has a policy requiring a higher minimum user age than the rating assigned by Apple, you can set a higher age rating". Build-team recommendation: **16+**, matching the Privacy Policy and Play's target audience |

Expected outcome: the UGC + real-time communication answers alone put the app at **13+**; setting
the higher minimum takes it to `{{MINIMUM_AGE}}` (recommended 16+). Use the SAME number in the
Privacy Policy, the Terms and the Play target-audience declaration.

---

## 5. Export compliance

**DONE.** `app.json` sets `ios.infoPlist.ITSAppUsesNonExemptEncryption = false` (added on branch
`store/l1b`; confirmed present in `npx expo config --type public`), so App Store Connect will
**not** ask the encryption questions on each submission. The reasoning behind that answer, which
you remain responsible for, is below.

- The app's only cryptography is HTTPS/TLS to Supabase, Agora, and the push services, all via the
  operating system's own stack. Apple: "The use of encryption that's built into the operating
  system—for example, when your app makes HTTPS connections using URLSession—is typically exempt
  from export documentation upload requirements, whereas the use of proprietary encryption is not."
  (https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption
  — re-verify at submission.)
- Apple also warns you are "responsible for all liabilities associated with misinterpretation of
  export regulations or claiming exemption inaccurately"
  (https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/).

**Action — DONE (lane L1b).** `app.json` → `ios.infoPlist` now contains:

```json
"ITSAppUsesNonExemptEncryption": false
```

`TODO_OWNER:` re-check this claim if a dependency that ships its own crypto is ever added; the
answer above is only valid while every encrypted connection goes through the OS stack.

Answers if you are asked anyway (for example on an older build):
*Does your app use encryption?* → Yes (HTTPS). *Does it qualify for an exemption?* → Yes, it only
uses encryption that is standard/built into the OS for HTTPS. `TODO_OWNER:` confirm with your legal
advisor for the countries you ship to; France still has its own declaration regime for some apps.

---

## 6. App Review notes (paste into "Notes" in the submission)

Guideline 2.1 requires a working demo account: "include demo account info (and turn on your
back-end service!) if your app includes a login"
(https://developer.apple.com/app-store/review/guidelines/ — re-verify at submission).

```
DBF Fitness is a private coaching app for a gym's members. Everything is behind a login, so
please use the demo accounts below.

DEMO ACCOUNTS (all on our production backend, kept live for review)
  Member (active membership)   email: TODO_OWNER_DEMO_MEMBER_EMAIL   password: TODO_OWNER_DEMO_MEMBER_PASSWORD
  Coach  (runs live classes)   email: TODO_OWNER_DEMO_COACH_EMAIL    password: TODO_OWNER_DEMO_COACH_PASSWORD

HOW TO SEE A LIVE CLASS
  1. Sign in as the MEMBER account.
  2. Community tab -> Live. A demo class is scheduled every day at TODO_OWNER_DEMO_CLASS_TIME
     (TODO_OWNER_TIMEZONE) and stays joinable for 60 minutes.
  3. Tap the class -> Join. iOS will ask for camera and microphone permission; you can decline and
     still enter the class as a viewer.
  4. To see both sides, sign in as the COACH account on a second device and start the class.
  If you need a class outside that window, email TODO_OWNER_SUPPORT_EMAIL and we will start one
  within TODO_OWNER_REVIEW_RESPONSE (e.g. 30 minutes) during TODO_OWNER_REVIEW_HOURS.

MEMBERSHIPS AND PAYMENTS
  The app sells nothing and never asks for payment details. DBF memberships are arranged and paid
  directly with the gym, outside the app (a coach or admin marks a member as paid). The app only
  reflects whether a membership is active, and locks live classes when it is not. There is no
  purchase flow, no price and no link to buy anything in the app.
  The demo member account is marked active, so the reviewer is never blocked.

USER-GENERATED CONTENT (Guideline 1.2)
  - Filtering: the app is not public or anonymous. Accounts are created for known gym members,
    every member is attached to a named coach, and content is visible only inside that coach's
    group - never to the public. Free-text input is limited to a member's own display name and the
    detail field of an abuse report (max 500 characters), which only DBF staff can read. Live
    classes are hosted by a DBF coach who can remove a participant.
  - Report: Community tab -> open a group -> a person's row -> Report -> pick a reason
    (Harassment / Spam / Inappropriate content / Other) -> send.
  - Block: same row -> Block -> "Yes, block". The person disappears from the roster immediately.
  - Terms of use with a zero-tolerance policy: TODO_OWNER_TERMS_URL
  - Our staff review every report and act within 24 hours. Contact: TODO_OWNER_SUPPORT_EMAIL

ACCOUNT DELETION (Guideline 5.1.1(v))
  Profile tab -> Danger zone -> Delete account -> enter password, type DELETE -> Permanently
  delete. The account and its data are removed immediately. Please use a throwaway account if you
  want to test this, or ask us and we will create one.

FEATURES THAT NEED A REAL DEVICE
  Live class audio/video (camera and microphone) and push notifications for class reminders do not
  work in the simulator. Both are exercised by the demo accounts above on a real iPhone.

HEALTH CONTENT
  The app gives general fitness and nutrition coaching, not medical advice, and says so in the app,
  in the Terms and on the product page.

Privacy Policy: TODO_OWNER_PRIVACY_POLICY_URL
Support: TODO_OWNER_SUPPORT_URL
```

`TODO_OWNER:` create the two demo accounts **on production** with the SQL in
`docs/deploy/production.md` §A9, keep them active past the review, and never point the reviewer at
a local or staging backend.

### 6a. Guideline 1.2 — the four precautions, checked one by one

Guideline 1.2 verbatim (re-verified 2026-09-21 at
https://developer.apple.com/app-store/review/guidelines/ — re-verify at submission): "apps with
user-generated content or social networking services must include: • A method for filtering
objectionable material from being posted to the app • A mechanism to report offensive content and
timely responses to concerns • The ability to block abusive users from the service • Published
contact information so users can easily reach you".

Note: the guideline text itself does **not** use the words "zero tolerance" and does not literally
require a EULA. That wording comes from App Review's rejection letters for UGC apps, and Apple's
Terms of Service template for 1.2 rejections asks for it — so `docs/legal/terms-of-service.md` §4
carries a zero-tolerance clause anyway. Do not claim the guideline says something it does not.

| Precaution | Status in DBF Fitness |
|---|---|
| Filtering objectionable material before it is posted | **An automated word-list filter runs on the sign-up display name, plus structural controls.** Implementation: `src/features/moderation/contentFilter.ts` with the curated list in `src/features/moderation/objectionableWords.ts`, wired at `app/(auth)/sign-up.tsx` — a name containing a listed slur or sexual term is refused inline, before the account is created, with a friendly reason rather than silently. Matching is locale-neutral by construction (NFKD fold, diacritics stripped, non-locale lowercase, leet digits mapped back, repeated letters collapsed, word boundaries enforced) so `f4ggot`, `f.u.c.k` and `fuuuuck` are caught while *Cockburn* and *Scunthorpe* are not. **Honest limits, state them plainly if asked:** it is a word list, so it misses novel obfuscation, context, other languages, images, and speech inside a live class; and it is currently wired to the display name only — the coach bio (`app/coach/profile.tsx`) and the live-class title (`src/components/live/ScheduleClassForm.tsx`) are **not yet filtered** (open work, see §6a note below). The structural controls remain the larger part of the answer: no public or anonymous surface, accounts created for known gym members, content scoped to one coach's group by row-level security, abuse-report text readable only by staff, and coach-hosted classes. Human admin review and the report/block flow are the real backstop |
| Mechanism to report offensive content + timely response | Report action on every community roster row **and on the live-class participant list** (`src/features/moderation/ParticipantModeration.tsx`, reusing the roster's own `ReportPanel`, so there is one report path, not two); 24-hour action commitment in the Terms, on the support page and in the review notes |
| Ability to block abusive users | Block action on every roster row and in the live class (`user_blocks`); instant and user-controlled |
| EULA / terms accepted by every user | A **required** checkbox on sign-up with tappable Terms and Privacy links (`src/components/legal/TermsCheckbox.tsx`; submit stays disabled until it is ticked) and the acceptance recorded server-side in `terms_acceptances` via the `accept_terms` RPC. Existing accounts and every future version bump are caught by `TermsGate` (`src/features/legal/TermsGate.tsx`), which re-prompts on the next launch when `has_accepted_terms(TERMS_VERSION)` is false and offers a Sign-out escape |
| Published contact information | `{{SUPPORT_EMAIL}}` on `{{SUPPORT_URL}}`, in the Terms §18, in the listing, and in-app on Profile → **Legal & support** (`src/components/account/LegalSection.tsx`: Privacy policy, Terms, Help centre, Contact support, Report a problem) |

> **§6a note — open work, tell the truth about it.** The word-list filter is wired to the sign-up
> display name only. Ticket L1b item 6 also asked for the **coach bio** and the **live-class
> title**; neither calls `validateContent` yet (`grep -rn 'validateContent' src app` outside the
> moderation feature returns exactly one hit, `app/(auth)/sign-up.tsx`). Those two files sit
> outside lane L1b's write set, so the work is open rather than done. Do not describe the filter
> to App Review as covering all three fields.
>
> **Re-run this audit after `store/l1a` and `store/l1b` merge.** This section was first written
> against commit `020fa7c`, before the moderation and legal code existed, and asserted that *no*
> automated filter and *no* sign-up terms link existed. Both statements were false by the time
> they were read, and pasting them into App Review notes would have told Apple our 1.2 compliance
> was weaker than it is. Verify each row against the merged tree before submitting.

---

## 7. Screenshots

Apple's current requirement for an iPhone-only app (verified 2026-09-21 at
https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/ —
re-verify at submission):

- **1 to 10 screenshots** per display size; `.png` or `.jpg`; **no alpha channel / transparency**.
- **6.9" display is required**: `1320 x 2868` or `1290 x 2796` or `1260 x 2736` px (portrait).
- **6.5" display is required only if you do not provide 6.9"**: `1284 x 2778` or `1242 x 2688` px.
- iPad sizes are not needed — `app.json` sets `ios.supportsTablet: false`.

**Plan: deliver 6 portrait screenshots at 1290 x 2796** (6.9"), captured on an iPhone 15/16 Pro Max
simulator or device in the app's light theme.

| # | Screen | How to capture | Caption (keep under ~45 chars so it reads on the card) |
|---|---|---|---|
| 1 | Today / home | Home tab, member signed in, a plan assigned | "Your coach's plan, every day" |
| 2 | Workout day detail | Workout tab → today's day, a few exercises ticked | "Tick off every set as you go" |
| 3 | Live class (joined) | Coach + member in a live class, two video tiles | "Train live with your coach" |
| 4 | Class notes | Notes screen with a published note | "Notes after every session" |
| 5 | Food / diet check-ins | Food tab with items ticked | "Your nutrition plan, ticked off" |
| 6 | Community roster | Community tab, group roster with online dots | "See who trains with you" |

Rules to respect: no device frame that hides the status bar content, no pricing claims, no "#1"
or award language, real UI only (no mockups of features that do not exist), and the same order on
both stores so the listings feel like one product.

**Source material:** `docs/screenshots/*.png` in this repo holds QA captures of every screen
(`tab-home.png`, `workout-day-detail.png`, `live-class-joined-multi.png`, `tab-food.png`,
`community-roster-online.png`, …). They are **not** App Store assets — wrong pixel size and
captured in the web QA harness. Recapture on an iPhone simulator at the sizes above.

`TODO_OWNER:` decide whether you want plain screenshots or captions/branding composited on top. If
composited, keep the text in the top ~20% and keep the real UI visible.

**App Preview video:** optional, skip for v1.

---

## 8. Submission checklist

Do these in order. Anything marked **owner** cannot be done by the build team.

1. **owner** — Apple Developer Program account active; `{{LEGAL_ENTITY}}` listed as the seller;
   D-U-N-S and legal entity name verified in App Store Connect → Business.
2. **owner** — Agreements, Tax, and Banking: the Free Apps agreement accepted (no paid agreement
   needed while the app is free).
3. Register the bundle id `com.dbffitness.app` and create the app record in App Store Connect
   (Platform: iOS, Primary language: English (U.S.), SKU `{{SKU}}`).
4. **owner** — publish `{{PRIVACY_POLICY_URL}}`, `{{TERMS_URL}}` and `{{SUPPORT_URL}}` as live
   public pages (content in `docs/legal/`).
5. Fill App Information (§1), Pricing (Free), and Availability.
6. Complete **App Privacy** (§3) and publish it.
7. Complete the **updated age rating** questionnaire (§4) — Apple's answer deadline (31 January
   2026) has passed, so an unanswered questionnaire interrupts the submission.
8. **[VERIFY] no external-billing steering (§2).** Both must return nothing:
   `grep -rn 'EXPO_PUBLIC_BILLING_URL' eas.json .env` and
   `grep -n 'ALLOW_EXTERNAL_BILLING_LINK.*true' eas.json`. This is a grep, not a judgement call —
   four legacy surfaces bypass the flag and read that variable directly.
8a. **[VERIFY] no placeholders in the legal env vars:** `grep -n 'REPLACE_' eas.json` returns
   nothing, and `EXPO_PUBLIC_SUPPORT_EMAIL` is a real monitored mailbox. A release build that
   fails either check now refuses to start (`src/config/ConfigGate.tsx`) rather than linking a
   reviewer to `https://REPLACE_WITH_PRIVACY_URL` — but catch it here, not in Resolution Center.
   Apple guideline 2.1 rejects placeholder URLs outright.
9. **owner** — create the demo member and coach accounts on the production backend and schedule a
   daily demo live class.
10. Build and upload: `eas build --platform ios --profile production` then
    `eas submit --platform ios --profile production` (see `docs/deploy/production.md` §B).
11. Upload the 6 screenshots (§7), description, keywords, promo text.
12. Export compliance: answered by `ITSAppUsesNonExemptEncryption: false` in the build, or answer
    the questions per §5.
13. Paste the App Review notes (§6) with the real demo credentials.
14. **TestFlight**: internal testing first; verify on a real iPhone — sign-up, sign-in, join a live
    class with camera and mic, receive a class reminder push, delete an account.
15. Submit for review. Turn on **phased release** and **manual release** so you control the launch.
16. Watch Resolution Center daily. The three most likely rejection reasons for this app, in order:
    **(a)** 3.1.3(d) live classes vs in-app purchase (§2), **(b)** 1.2 UGC — they will test Report
    and Block and check the Terms and contact info, **(c)** 2.1 demo account not working or the
    demo class not joinable.

### Known risks, with the mitigation

| Risk | Mitigation |
|---|---|
| 3.1.3(d) says one-to-many real-time services need IAP | ship with no purchase surface at all; explain the gym-membership model in the review notes; be ready to add IAP or drop live classes on iOS (§2) |
| 1.2 UGC requirements | Report + Block are in the app on **both** the community roster and the live-class participant list; a required sign-up checkbox records agreement to the Terms and Privacy Policy server-side and `TermsGate` re-prompts on version bumps; the Terms carry a zero-tolerance clause; the support page and Profile → Legal & support publish contact details; and we commit to 24-hour action. **The "filtering" precaution has a real but modest implementation** — a curated word list on the sign-up display name (`contentFilter.ts` + `objectionableWords.ts`), *not yet* on the coach bio or class title. §6a has the exact wording to give App Review, including that limit |
| Reviewer cannot join a live class | scheduled daily demo class + an on-call window in the notes |
| Camera/mic prompts look unexplained | `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` already explain the live-class purpose (`app.json`) |
| Health claims | disclaimer in the app, in the Terms and in the description |
| Placeholder URLs | guideline 2.1: "placeholder text, empty websites, and other temporary content should be scrubbed before submission" — resolve every `{{PLACEHOLDER}}` first |
