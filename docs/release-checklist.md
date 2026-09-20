# Release checklist (human-owned)

Everything here needs accounts or decisions the codebase cannot provision. Every real-vendor integration below is **UNVERIFIED**: never exercised with real keys.

## OPEN GAPS (block store submission or launch quality)

| Gap | Why it matters |
|---|---|
| **In-app account deletion: NOT BUILT** | Apple 5.1.1(v) requires it for apps with account creation; Google Play has an equivalent data-deletion requirement |
| **User-generated content (Apple 1.2)** | Report and block exist. EULA/terms acceptance, objectionable-content filtering, and a published contact method do NOT |
| First-run coach onboarding | Not built; new sign-ups have `coach_id` null (coach-selection screen is in progress) |
| Monitoring / crash reporting | Not set up (no Sentry/Crashlytics, no function alerting) |
| Payment webhook | Not built; nothing writes `public.subscriptions` except manual/seed rows |
| `live-class-reminder` scheduling | pg_cron/pg_net or scheduled invocation not configured |

## Accounts and stores

- [ ] Apple Developer Program + App Store Connect app record (bundle id must match `app.json`, owned by a later final pass)
- [ ] Google Play Console app + service-account JSON for `eas submit` (`google-play-service-account.json` is NOT in `.gitignore`; add it before creating the file, never commit)
- [ ] Expo/EAS account, `eas init` project id, put it in `eas.json` and `EXPO_PUBLIC_EAS_PROJECT_ID`
- [ ] APNs key uploaded to EAS; FCM (Firebase) credentials uploaded for Android push (UNVERIFIED)
- [ ] Replace every `REPLACE_*` placeholder in `eas.json` (public values only)

## Supabase Cloud (UNVERIFIED)

- [ ] Create project; `supabase link`, `supabase db push` (all migrations, not seed)
- [ ] Run `select public.apply_realtime_presence_policies();` if `pg_policies` on `realtime.messages` is empty
- [ ] Realtime: enable private-channel authorization; confirm the `realtime.messages` policies exist
- [ ] Function secrets: `supabase secrets set AGORA_APP_ID AGORA_APP_CERTIFICATE DEEPGRAM_API_KEY ANTHROPIC_API_KEY` (service role/URL/anon are injected)
- [ ] Deploy functions: `agora-rtc-token`, `transcribe-recording`, `live-class-reminder`
- [ ] Auth settings: local `config.toml` has `enable_confirmations = false` and `minimum_password_length = 6`; decide hosted values (email confirmation on, stronger password rules), configure SMTP and redirect URLs
- [ ] Backups / PITR; do not run seed data in production
- [ ] Schedule `live-class-reminder` every minute with the service-role Bearer

## Vendors (each UNVERIFIED)

- [ ] Agora project + App Certificate (App ID public, certificate server-only)
- [ ] Deepgram API key (AssemblyAI would need new code in `_shared/asr.ts`; only Deepgram exists today)
- [ ] Anthropic API key (drafter uses model `claude-sonnet-5`)
- [ ] Payment provider (Stripe/RevenueCat) and a webhook that writes `public.subscriptions` with the service role (`status` active/past_due/canceled, `current_period_end`, `provider`, `provider_ref`)
- [ ] BUSINESS DECISION: Apple/Google in-app-purchase rules for digital subscriptions (IAP vs external billing); set `EXPO_PUBLIC_BILLING_URL` accordingly

## Legal and store listing

- [ ] Privacy policy, terms/EULA, support URLs (live, linked in-app and in store listings)
- [ ] App Privacy labels (Apple) and Data safety form (Google): account info, health/fitness data, video/audio recordings, push tokens, identifiers
- [ ] Permission strings: camera and microphone strings exist in `app.json`; notification explanation and Android permissions reviewed in the final `app.json` pass
- [ ] Screenshots, description, age rating (UGC + video)

## Pre-release verification

- [ ] `npm run lint && npm run typecheck && npm test`; `supabase test db`
- [ ] Real-device test on iOS and Android with a dev/preview build: video join, push, upload
