# DBF Fitness

A mobile-first (iOS, Android, web) coaching app. Coaches assign workout plans and diets, host live video classes for their members, and review AI-drafted notes from recorded classes. Members track workouts, food, and community (groups, report/block), and join live classes while subscribed.

Stack: Expo SDK ~57, TypeScript, Expo Router, NativeWind, TanStack Query, Supabase (Postgres, Auth, Storage, Realtime, Edge Functions).

## Status (a final pass updates this table)

| Area | Status |
|---|---|
| Auth, workouts, food, calendar, effort, milestones | Built |
| Community (groups, presence, report/block) | Built |
| Live classes + subscription gating (DB, Realtime, token function, UI) | Built, see [Subscription model](#subscription-model) |
| Notes pipeline (upload, transcribe, draft, review, publish) | Built; real vendors UNVERIFIED |
| Coach-selection screen | IN PROGRESS |
| Subscription-gated notes | IN PROGRESS |
| Role/ownership integrity hardening | IN PROGRESS (migration + pgTAP suite present) |
| Account deletion, EULA/UGC filtering, monitoring | Not built, see [docs/release-checklist.md](docs/release-checklist.md) |
| Payment provider webhook (writes `subscriptions`) | Not built (rows are seeded/manual) |

## Prerequisites

| Tool | Notes |
|---|---|
| Node + npm | Current LTS |
| Docker | Required by the local Supabase stack |
| Supabase CLI | `supabase start`, `db reset`, `test db`, `functions serve` |
| Xcode + iOS Simulator | macOS only, for iOS |
| Android Studio + SDK + an emulator | For Android |
| Expo Go vs dev client | Expo Go runs the UI, but `react-native-agora` (real video) and remote push are NOT available in Expo Go. Use a dev client / EAS build (`eas build --profile development`). Without them the app uses mock video/push adapters. |

## Install

```bash
npm install
cp .env.example .env
```

## Environment

`.env.example` documents every variable in two groups: public `EXPO_PUBLIC_*` (bundled into the app) and server-only secrets for Edge Functions (never `EXPO_PUBLIC_`, set with `supabase secrets set`). For local dev set only:

```bash
supabase status -o env      # copy ANON_KEY into EXPO_PUBLIC_SUPABASE_ANON_KEY
```

## Local Supabase

```bash
supabase start              # API 54321, DB 54322, Studio 54323, Inbucket 54324
supabase db reset           # applies supabase/migrations/* then supabase/seed.sql
```

Studio: http://127.0.0.1:54323

If, after the very first `supabase start`, `pg_policies` on `realtime.messages` is empty, run as postgres:

```sql
select public.apply_realtime_presence_policies();
```

### Seed users (password `password123`, local only)

| Email | Name | Role | Subscription state |
|---|---|---|---|
| coach@dbf.demo | Coach Dana Reyes (`1111...`) | coach | staff (no row, exempt) |
| member@dbf.demo | Jordan Lee (`2222...`) | member of Dana | active (period ends +20d) |
| sam@dbf.demo | Sam Rivera (`6666...`) | member of Dana | grace (period ended 3d ago, past_due) |
| riley@dbf.demo | Riley Park (`9999...`) | member of Dana | expired (ended 30d ago) |

Seed also has group `7777...` and live class `8888...` "Saturday Conditioning" (Dana, +2 days).

### Migrations

`supabase/migrations/`: init extensions/profiles, workout, diet, community, live classes schemas; RLS recursion fix; community blocks/roster; push tokens + reminders; Realtime presence authorization; subscriptions and live access; recordings pipeline; role and ownership integrity; profile provisioning (server-side trigger on sign-up).

## Edge functions locally

The local Edge Runtime serves `supabase/functions` (or `supabase functions serve --env-file .env` for secrets). Get keys with `supabase status -o env`.

| Function | Call | Notes |
|---|---|---|
| `agora-rtc-token` | `POST /functions/v1/agora-rtc-token` with user JWT, body `{"class_id":"<uuid>"}` | 200 `{mode:"live"\|"mock",...}`; 401 unauthorized; 403 `subscription_required` / `not_entitled`; 404 `class_not_found`; 409 `class_not_joinable`. Mock mode when `AGORA_APP_ID`/`AGORA_APP_CERTIFICATE` unset. |
| `transcribe-recording` | `POST` with user JWT, body `{"recording_id":"<uuid>"}` | Mock ASR/drafter unless `DEEPGRAM_API_KEY` / `ANTHROPIC_API_KEY` set. |
| `live-class-reminder` | `POST` with `Authorization: Bearer <service role key>` | Sends "starting soon" Expo pushes; skips non-entitled members. Scheduling (pg_cron/pg_net) is NOT configured. |

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/agora-rtc-token \
  -H "Authorization: Bearer <member access token>" -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" -d '{"class_id":"88888888-8888-8888-8888-888888888888"}'
```

Get a member access token by signing in via `POST /auth/v1/token?grant_type=password`.

## Running the app

```bash
npm run web       # web
npm run ios       # iOS Simulator (Expo Go or dev client)
npm run android   # Android emulator
```

## Tests

| Command | What |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest (app + portable Edge Function logic) |
| `supabase test db` | pgTAP: `supabase/tests/database/01_role_integrity.test.sql` (rolled back, needs local DB running) |
| `npm run screenshot:web` | Playwright script `scripts/screenshot-web.ts`: starts Expo web on port 8231, signs in as the seed users, writes `docs/screenshots/` (needs seeded local DB) |

## Repo map

| Path | Contents |
|---|---|
| `app/` | Expo Router screens: `(auth)`, `(tabs)` (home, workout, food, community, profile), `notes/`, `calendar`, `effort`, `effort-review` |
| `src/features/` | community, liveClasses, milestones, notes, subscriptions |
| `src/services/` | supabase client, video, push, recordings, transcription |
| `src/components`, `src/theme` | Shared UI, tokens |
| `supabase/` | `migrations`, `seed.sql`, `functions` (+ `_shared` portable helpers), `tests/database`, `config.toml` |
| `scripts/` | Screenshot script |
| `docs/` | Product plan, screenshots, release checklist |

## Architecture

- Client talks to Supabase directly (RLS is the authorization layer) and to Edge Functions for privileged work.
- Native-only modules (agora, notifications) are lazily `require`d behind `Platform` guards so web, Jest and Expo Go never load them.
- Deno code lives only in each function's `index.ts`; other function files are portable TS tested by Jest.

### Subscription model

| State | Rule | Live access |
|---|---|---|
| active | `now() <= current_period_end` (a canceled sub keeps access until period end) | Yes |
| grace | Up to 10 days past period end, status active/past_due; member sees payment reminders on joining a call | Yes |
| expired / none | Past grace, canceled past period, or no row | Blocked |
| staff | Profile role coach/admin | Exempt |

Computed in SQL (`get_subscription_state()`, `has_live_access()`, `can_join_live_class()`); `public.subscriptions` is written only by service role/postgres. Enforced at:
1. DB policies on `live_class_participants` (insert/update).
2. Private Realtime channel policy (`can_use_live_class_presence_topic`).
3. `agora-rtc-token` function (the real enforcement point for video).
4. `live-class-reminder` skips non-entitled members.
5. UI gating and grace reminders (`src/features/subscriptions`, `src/features/liveClasses`).

### Notes pipeline

Coach uploads a class recording (`app/notes/upload.tsx`) -> private Storage bucket `recordings` (path `<coach uid>/<recording id>/<file>`, 500 MB limit) -> `transcribe-recording` (Deepgram ASR, then Anthropic drafter; mocks when keys unset) -> draft note -> coach review -> publish. Member visibility of published notes is via RLS (`can_read_published_notes`).

### Security model

- `profiles.role` and `coach_id` are immutable to clients (trigger `profiles_guard_privileged_columns`); profiles are provisioned server-side on sign-up.
- RLS on all tables; service role only in Edge Functions, never in the client.
- Realtime presence channels are private, authorized by policies on `realtime.messages`.
- **HARD RULE: never `REVOKE EXECUTE` from `anon`/`authenticated` on functions.** It segfaults this Postgres 17.6 (signal 11) when a role calls a SECURITY DEFINER function it cannot execute. Use `revoke all ... from public` only, `set search_path = public`, and gate inside the function body (`auth.uid()` null / not entitled).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Presence/Realtime join denied on fresh stack | `select public.apply_realtime_presence_policies();` as postgres if `pg_policies` on `realtime.messages` is empty |
| Backend crash "signal 11" | Someone revoked EXECUTE on a function; see Security model |
| `[supabase] ... not set` warning | Fill `EXPO_PUBLIC_SUPABASE_*` in `.env`, restart Expo (env is inlined at start) |
| Video is a local preview / push does nothing | Expo Go: use a dev client; set `EXPO_PUBLIC_AGORA_APP_ID`, `EXPO_PUBLIC_REAL_PUSH=true` |
| Function returns mock | Secrets unset (see `.env.example` section B) |
| Sign-in fails for demo users | `supabase db reset` to re-seed |

Real vendor integrations (Agora, Deepgram, Anthropic, Expo push) are UNVERIFIED: never exercised with real keys.
