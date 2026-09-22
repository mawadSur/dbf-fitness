# DBF Fitness — Terms of Service and End User Licence Agreement (DRAFT)

> **STATUS: FIRST DRAFT — NOT LEGAL ADVICE.** Fill every `{{PLACEHOLDER}}` / `TODO_OWNER:` and have
> a lawyer in `{{GOVERNING_LAW}}` review it before publishing at `{{TERMS_URL}}`.
>
> **Why this document matters for the stores.** Apple App Review Guideline 1.2 requires apps with
> user-generated content to include "a method for filtering objectionable material from being posted
> to the app", "a mechanism to report offensive content and timely responses to concerns", "the
> ability to block abusive users from the service" and "published contact information so users can
> easily reach you" (https://developer.apple.com/app-store/review/guidelines/ — quoted verbatim,
> re-verified 2026-09-21, re-verify at submission). The guideline text does **not** itself use the
> words "zero tolerance" or mandate a EULA — that is App Review's standard ask when it rejects a UGC
> app under 1.2, so section 4 below carries a zero-tolerance clause anyway. Google Play's
> User Generated Content policy requires "terms of use and/or user policy" that users accept, an
> in-app reporting and blocking system, and a moderation process
> (https://support.google.com/googleplay/android-developer/answer/9876937 — re-verify at submission).
> Sections 4–7 below are written to satisfy both.
>
> **Engineering note on §10 (not part of the published text).** An earlier draft carried a
> `TODO_OWNER` *inside* §10 describing a "Renew now" button that opened
> `EXPO_PUBLIC_BILLING_URL`. That note has been removed from the body — §10 is destined for the
> public `{{TERMS_URL}}` and a developer TODO naming an env var and a source file does not belong
> in a published legal document. It was also out of date. The current state, on branch
> `store/l1b`:
> - The external billing link is governed by `billingLinkAllowed()`
>   (`EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK`), which **defaults to false**, and
>   `EXPO_PUBLIC_BILLING_URL` has been removed from the preview and production profiles in
>   `eas.json`. With the flag off the subscription surfaces show the neutral `MANAGED_BY_DBF`
>   copy — *"Your membership is managed by DBF. Contact your coach or DBF to renew."*
>   (`src/components/subscription/billing.ts`) — with no purchase call to action. §10's wording
>   matches that copy.
> - **Known gap, must be closed or accepted before submission:** the flag governs only
>   `src/components/subscription/**`. `src/features/liveClasses/billing.ts`,
>   `src/components/live/SubscriptionBlockedPanel.tsx`, `src/components/live/GraceNotice.tsx` and
>   `src/components/coaching/SubscriptionCard.tsx` still read `EXPO_PUBLIC_BILLING_URL` directly
>   and would render "Subscribe" / "Renew now" external-link CTAs if that variable were ever set.
>   Today it is set nowhere, which is the only reason the build is compliant. See
>   `docs/store/app-store-connect.md` §2 (Payments).

**Effective date:** `{{EFFECTIVE_DATE}}`
**Provider:** `{{LEGAL_ENTITY}}`, `{{REGISTERED_ADDRESS}}` ("DBF", "we", "us")
**App:** DBF Fitness (`com.dbffitness.app`)
**Contact:** `{{SUPPORT_EMAIL}}`

---

## 1. Agreement

By creating an account or using DBF Fitness you agree to these Terms and to our Privacy Policy at
`{{PRIVACY_POLICY_URL}}`. If you do not agree, do not use the app.

These Terms are between you and `{{LEGAL_ENTITY}}` only. **Apple Inc. and Google LLC are not parties
to this agreement and are not responsible for the app or its content.** Apple and Google are
third-party beneficiaries of these Terms and may enforce them against you. To the extent these
Terms conflict with the Apple Media Services Terms of Use or the Google Play Terms of Service, the
platform terms govern for that platform.

## 2. Who may use DBF Fitness

- You must be at least `{{MINIMUM_AGE}}` years old. (`TODO_OWNER:` same number as the Privacy Policy,
  the App Store age rating and Play's target-audience declaration.)
- DBF Fitness is a **private app for DBF members and staff**. You need an account, and members are
  connected to a DBF coach.
- You are responsible for your account credentials and for everything done under your account. Tell
  us at `{{SUPPORT_EMAIL}}` immediately if you think someone else has access.

## 3. Your licence

We grant you a personal, non-exclusive, non-transferable, revocable licence to use DBF Fitness on
devices you own or control, for your own non-commercial use as a DBF member or as DBF staff. You may
not copy, resell, sublicense, reverse-engineer, or use the app to build a competing service, and you
may not use automated means to scrape or bulk-download content.

---

## 4. Acceptable use and prohibited content — ZERO TOLERANCE

DBF Fitness contains user-generated content: your name and activity are visible to your coach and to
your group, you appear on camera and microphone in live classes, and you can type free text in
reports. **We have zero tolerance for objectionable content and abusive behaviour.**

You must not, in any part of the app — including live video and audio, your display name, group
chat/roster presence and report text:

- harass, bully, threaten, stalk or intimidate anyone;
- post or transmit hateful content, or attack anyone because of race, ethnicity, national origin,
  religion, disability, age, sex, gender identity or sexual orientation;
- post or transmit sexual content, nudity, or sexually suggestive behaviour; expose yourself on
  camera; or make sexual advances towards another user;
- post or transmit violent, graphic, or self-harm content, or content that encourages any of these;
- impersonate another person, a coach, or DBF;
- share content you do not have the right to share, or infringe anyone's intellectual property;
- record, screenshot, re-stream or redistribute a live class or another member's image, voice or
  personal information without their consent and DBF's permission;
- share medical claims, sell products or services, or promote another business;
- upload malware, attempt to break the app's security, probe our systems, or access another member's
  data;
- use the app for anything illegal.

Coaches additionally must not upload a recording of a class without having told the participants
that the class is being recorded (see 8).

## 5. Reporting, blocking and how we respond

- **Report** — every member list entry has a **Report** action. Tell us who and why; the report goes
  straight to DBF staff.
- **Block** — every member list entry has a **Block** action. A blocked user disappears from your
  roster and you disappear from theirs. Blocking is yours to control and does not need our approval.
- **Email** — you can always email `{{SUPPORT_EMAIL}}`.

**Our commitment: we review every report and act on objectionable content and abusive users within
24 hours of the report being filed.** Acting may mean removing content, warning the user, removing
them from a group or live class, suspending them, or terminating their account and ejecting them
from the service. We may act without notice where someone is at risk.

If you are in danger, contact your local emergency services first.

## 6. Moderation and removal

We may review, remove or restrict any content or account that breaks these Terms, and we may keep a
record of a report and the action taken for safety and legal reasons even after an account is
deleted. We are not obliged to pre-screen content, and we make no promise that everything you see
has been reviewed.

## 7. Suspension and termination

We may suspend or terminate your access immediately if you break these Terms, if your membership
ends, or if we must do so by law. You may stop using the app at any time and delete your account in
the app (see 11). Sections 6, 9, 12, 13, 14, 15 and 16 survive termination.

---

## 8. Live classes — conduct and consent

- Live classes are audio/video sessions with your coach and other members. **Assume other people can
  see and hear you** whenever your camera or microphone is on. You can leave a class at any time,
  and you can deny camera/microphone permission and still use the rest of the app.
- Be dressed appropriately and in an appropriate setting. Anything in 4 applies on camera.
- **Recording:** DBF does not record classes automatically. A coach may upload a recording of a class
  so that class notes can be produced from it. A coach must tell participants **before** recording.
  If you do not want to be recorded, tell your coach before the class; you may be asked to keep your
  camera and microphone off for that class.
- Recordings are transcribed by an automated speech-to-text service and turned into draft notes by an
  AI service; a coach reviews and edits the notes before they are published. See the Privacy Policy
  section 3.5.
- **You may not record, screenshot or re-stream a class.**

## 9. Health and fitness disclaimer — read this

**DBF Fitness is not a medical service. Nothing in the app is medical advice, diagnosis or
treatment, and no coach is acting as your doctor.**

- Consult a qualified healthcare professional before starting or changing any exercise or nutrition
  programme, especially if you are pregnant, have an injury, a heart condition, or any other medical
  condition.
- Exercise carries a risk of injury. You take part at your own risk, you are responsible for judging
  what is safe for you, and you must stop immediately and seek medical help if you feel unwell.
- Nutrition guidance in the app is general and is not a prescribed diet.
- In an emergency, call your local emergency number. The app is not for emergencies.

## 10. Membership and payments

- **Memberships are arranged and paid directly with DBF, outside the app.** The app does not sell
  anything, does not take payment, and does not store payment details. It only reflects whether your
  membership is currently active.
- Live classes require an active membership. If your payment is late you keep access for a **10-day
  grace period** and the app reminds you when you join a class. After the grace period, live classes
  are locked until your membership is brought up to date. Coaches and admins always have access.
- Prices, billing cycles, refunds, cancellations and any disputes about payment are handled under
  your DBF membership agreement with `{{LEGAL_ENTITY}}` — `TODO_OWNER: link or attach the membership
  agreement/refund policy`, not these Terms.
- The app itself will not send you to a payment page. Where your membership needs renewing, the app
  says so and points you at DBF: *"Your membership is managed by DBF. Contact your coach or DBF to
  renew."*

## 11. Your account and deletion

You may delete your account at any time: **Profile → Delete account**, type `DELETE`, confirm with
your password. This permanently deletes your account and your personal records — see Privacy Policy
section 8 for exactly what is and is not removed. Deletion is immediate and cannot be undone.
Deleting your app account does not by itself cancel a DBF membership arranged outside the app;
contact DBF for that.

## 12. Our content and yours

- DBF and its licensors own the app, the plans, the exercises and the class notes. You get a licence
  to use them (section 3), not ownership.
- You keep ownership of the content you create. You grant DBF a worldwide, non-exclusive, royalty-free
  licence to host, store, reproduce and display that content **for the purpose of operating the app
  and delivering coaching to you and your group**, and to keep records required for safety and law.
  This licence ends when your content is deleted, except for copies in backups and records we must
  keep.
- If a coach records a class you are in, you grant DBF the licence above for your appearance and
  voice in that recording, its transcript and the class notes made from it, for the same purposes.

## 13. Availability, changes and third-party services

We may change, suspend or discontinue features. We do not promise the app will be uninterrupted or
error-free. The app depends on third-party services (hosting, real-time video, speech-to-text, AI
drafting, push delivery) and on your device, network and operating system.

## 14. Disclaimers and limitation of liability

To the fullest extent permitted by law:

- The app is provided **"as is" and "as available"**, without warranties of any kind, express or
  implied, including merchantability, fitness for a particular purpose and non-infringement.
- DBF is not liable for indirect, incidental, special, consequential, exemplary or punitive damages,
  or for lost profits, data or goodwill.
- DBF's total liability for any claim relating to the app is limited to the greater of
  `{{LIABILITY_CAP}}` or the amount you paid DBF for membership in the `{{LIABILITY_WINDOW}}` months
  before the claim.
- Nothing in these Terms excludes liability that cannot be excluded by law, including for death or
  personal injury caused by negligence or for fraud. Some jurisdictions do not allow some of these
  exclusions, so they may not apply to you.

`TODO_OWNER:` a lawyer must set `{{LIABILITY_CAP}}`, `{{LIABILITY_WINDOW}}`, and check whether a
consumer-law carve-out is needed in `{{GOVERNING_LAW}}`.

## 15. Indemnity

You agree to indemnify `{{LEGAL_ENTITY}}` against claims, damages and costs arising from your
content, your use of the app, or your breach of these Terms — except where the law does not allow it.

## 16. Governing law and disputes

These Terms are governed by the laws of `{{GOVERNING_LAW}}`, and disputes go to the courts of
`{{COURTS_VENUE}}`. `TODO_OWNER:` decide whether you want arbitration and a class-action waiver (a
US-specific choice a lawyer should make); if so it must be conspicuous and must be reflected here.

## 17. Changes to these Terms

We may update these Terms. We will change the effective date and, for material changes, tell you in
the app or by email before they take effect. Continuing to use the app after that means you accept
the new Terms.

## 18. Contact

`{{LEGAL_ENTITY}}` — `{{REGISTERED_ADDRESS}}` — `{{SUPPORT_EMAIL}}` — https://dbf-fitness.com/

---

## Appendix — store requirement → clause, and where the app implements it

| Requirement | Clause here | Implemented in the app |
|---|---|---|
| Apple 1.2: zero-tolerance policy for objectionable content/abusive users (App Review's standard ask, not literal guideline text) | 4 | — |
| Apple 1.2: "a method for filtering objectionable material from being posted to the app" | 4 (prohibited content), 6 (removal) | **A curated word-list filter on the sign-up display name** (`src/features/moderation/contentFilter.ts` + `objectionableWords.ts`, wired at `app/(auth)/sign-up.tsx`), plus structural controls: private groups, known members, staff-only report text, coach-hosted classes. **Not yet applied to the coach bio or the class title** — see `docs/store/app-store-connect.md` §6a |
| Apple 1.2 / Play UGC: mechanism to report offensive content | 5 | Report action on the community roster **and in the live class** (`src/features/community/*`, `src/features/moderation/ParticipantModeration.tsx`, `moderation_reports` table) |
| Apple 1.2 / Play UGC: ability to block abusive users | 5 | Block action on the community roster **and in the live class** (`user_blocks` table, `20260919130000_community_blocks_and_roster.sql`) |
| Apple 1.2: timely responses to concerns | 5 (24 hours) | staff review queue — **UNVERIFIED as a process**: the owner must actually staff it |
| Apple 1.2 / Play: published contact information | 18, support page | `docs/legal/support-page.md`, and in-app on Profile → **Legal & support** (`src/components/account/LegalSection.tsx`) |
| Play UGC: users accept terms before creating/uploading content | 1 | **Done.** Required checkbox with tappable Terms and Privacy links on sign-up; the submit button stays disabled until it is ticked (`src/components/legal/TermsCheckbox.tsx`, `app/(auth)/sign-up.tsx`). The acceptance is recorded in `terms_acceptances` via `accept_terms(TERMS_VERSION)`, and `TermsGate` (`src/features/legal/TermsGate.tsx`) re-prompts existing accounts on every version bump |
| Apple 5.1.1(v): in-app account deletion | 11 | Profile → Delete account (`supabase/functions/delete-account/`) |
| Live-class consent and recording rules | 8 | recordings are coach-initiated uploads (`recordings` table, `transcribe-recording` function) |
| Payments outside the app, no purchase steering | 10 | `subscriptions` holds status only. The external billing link is behind `billingLinkAllowed()` (`EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK`, **default false**) and `EXPO_PUBLIC_BILLING_URL` is absent from `eas.json`, so the app shows the neutral `MANAGED_BY_DBF` copy. **Residual risk:** four legacy surfaces read `EXPO_PUBLIC_BILLING_URL` without the flag — see the engineering note at the top of this document |
| Health disclaimer (Apple 1.4.1 / Play Health apps policy) | 9 | — |
