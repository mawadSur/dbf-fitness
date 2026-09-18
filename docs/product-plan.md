# DBF Fitness — Product Plan (Draft v0.2)

Status: scope and key architecture decisions locked with you across two review
rounds. Ready for `/autoplan` (or straight into scaffolding) once you sign off
on this version. Two small items remain open (marked in section 6) — everything
else below is decided, not proposed.

## 1. Vision

DBF Fitness ("Transform Your Body & Mind") helps people train consistently, eat
well, and stay accountable — **with** others who share their mindset, not just
alone with a checklist. The reference pattern (daily plan → checklist → score →
streak) stays as the emotional core, but v1 is now one integrated system: train
together, never miss a session even if you can't attend live, and get seen for
the effort you actually put in — judged by a coach who knows you, not just a
sensor.

## 2. Reference pattern (from the screenshots you shared)

- **Home/dashboard**: greeting, a "Daily activities" card, a score ring
  ("6 of 40 days", "2 Completed / 3 Missed"), a "Today's Goals" checklist
  (1/6 complete), and a "Good Job!" affirmation state.
- **Workout day view**: "Day 6 Workout", duration estimate (25 min), a named
  block ("Cardio in Place — Foundation & Technique"), and a checklist of
  exercises each with reps/duration (e.g. High Knees 30s, Burpees 5 reps).
- **Nav**: Home / Workout / Food / (something) / Profile.

This pattern is the backbone every v1 feature below extends, not replaces.

## 3. Core loop (v1)

1. User opens app → sees today's plan (workout + coach's nutrition guidance +
   any live class happening today) and current streak/score.
2. User does the workout (live in class, or solo against the day's plan),
   checking off exercises as they go.
3. If they missed a live session, the recording's auto-generated workout notes
   let them do the same session solo and still check it off.
4. On completion: reward/affirmation moment (with milestone tiers, not just a
   single "good job") + score updates, including a coach-assigned effort score
   for that session.
5. Calendar shows history; user can see trend over time, see who else in their
   group is showing up, and see upcoming live classes to join.
6. Repeat daily; streak, score, and the people training alongside them create
   the pull to come back.

Wearable/health-platform sync is the one deferred layer — nice-to-have
precision on top of a loop that already works without it.

## 4. Feature breakdown (updated)

| # | Feature | What it does | v1/v2 | Notes |
|---|---|---|---|---|
| 1 | Workout tracking + scoring/streak | Day-plan + checklist + score/streak | v1 | Core loop, unchanged |
| 6 | Per-exercise detail view | Tap any exercise/workout for more info | v1 | Needed to make #1 usable |
| 7 | Post-workout reward | Affirmation + milestone-tiered rewards on completion/streak milestones | v1 | Expanded from a single "good job" state to tiered milestones |
| 8 | Calendar view | Completed/missed days over time | v1 | Cheap once #1's data model exists |
| 5 | Recording upload → workout notes | Upload a session recording; async transcription (managed ASR API) generates a draft checkable workout-notes list; coach/trainer reviews and edits before it's published to the group | v1 | Your most distinctive idea — see section 5 for the longer-term "searchable coaching library" angle |
| 3 | Community | Find/connect with users sharing your goals or mindset; train together, see who's showing up | v1 (pulled up from v2) | Now core to the loop, not a bolt-on — needs moderation/safety thought at build time |
| 10 | Live classes + notifications + 1-click join | Push/alert before a live class starts, join in one tap | v1 (pulled up from v2) | Recommend embedding a managed video platform (e.g. Mux, Zoom SDK) rather than building streaming — see section 6 |
| 9 | Effort ranking | Leaderboard/score reflecting how hard someone pushed — **coach-assigned RPE**, not wearable HR-derived | v1 (unblocked) | Reframed to remove the wearable dependency; coach scores effort after reviewing the session |
| 2 | Diet — coach's plan | Digitized version of the nutrition plan a trainer already prescribes; checkable like the workout, not a generic food-logging tool | v1 (reframed, pulled up from v2) | Cheap because it reuses the trainer-authoring UI already needed for #9's review flow, and skips competing with MyFitnessPal's food database |
| 4 | Wearable + health platform sync | Pull data from Apple Watch, Whoop, Apple Health, Samsung Health | v2 | Real SDK/OAuth work per platform; do this once the core loop has real users, as an *enhancement* layer now that #9 no longer depends on it |
| 2b | Generic self-logged diet/macro tracking | Free-form meal/macro logging beyond what a coach prescribes | v2 | Superset of the v1 coach's-plan feature, for users who want more |

## 5. Vision extensions worth carrying into the build (not new scope, framing)

- **Milestone rewards**: reward moments should scale — first day, 7-day streak,
  30-day streak, etc. — not just a flat "good job" on every single completion.
- **Coaching content library**: because transcripts + trainer-edited notes
  accumulate over time, the recording→notes pipeline can become a searchable
  library ("everything Coach X taught about shoulders") later, without any
  extra build now — just don't throw the transcripts away.
- **Monetization**: subscription bundle (app + core coaching access) as the
  primary plan, with a marketplace layer for add-ons (extra 1:1 sessions,
  specialty classes, trainer-authored programs) — confirmed direction from our
  scope review; exact pricing/packaging is a business decision for later, not
  a v1 build blocker.

## 6. Decisions made

1. **Platform**: React Native (cross-platform). Ships iOS + Android from one
   codebase; the native-SDK gaps for wearables (HealthKit, Whoop) don't matter
   yet since wearable sync stays in v2.
2. **Existing assets**: fully greenfield software. The DBF business exists,
   but there is no existing app, codebase, or user database to build on or
   migrate from — this is a clean build, though real member data will need to
   be onboarded once it ships.
3. **Transcription**: buy, not build — a managed ASR API (Whisper API /
   Deepgram / AssemblyAI class of service), run as an **async background job**
   after upload rather than real-time, since nothing in the loop needs the
   notes instantly. Coach/trainer reviews and can edit the auto-generated
   notes before they're published to the group.
4. **Diet tracking**: reframed as a coach-prescribed plan viewer and pulled
   into v1 (see feature #2 above).
5. **Effort ranking**: reframed to coach-assigned RPE instead of
   wearable-HR-derived, unblocking it for v1 (see feature #9 above).
6. **Community + live classes**: both pulled into v1 as core to the loop,
   not deferred bolt-ons.
7. **Monetization**: bundle + marketplace model (see section 5).

### Still open (small, not blocking a plan review)

- **Backend**: no existing DBF backend/auth to build on (confirmed
  greenfield), so this is a build choice — recommend a managed
  backend-as-a-service (e.g. Supabase or Firebase) to match the React Native
  choice and avoid standing up custom infra before there are real users.
  Flag if you'd rather go custom.
- **Live class video platform**: recommend embedding a managed platform (e.g.
  Mux, Zoom SDK, Agora) rather than building live streaming — building your
  own streaming infra is rarely the right v1 call. Flag if you have a
  preference or existing relationship with a vendor.

## 7. Next steps

This plan is ready for `/autoplan` (or `/plan-eng-review` for architecture
specifically) to turn sections 4-6 into a reviewed technical plan, or straight
into scaffolding if you'd rather move fast and iterate. Say the word and I'll
kick it off.
