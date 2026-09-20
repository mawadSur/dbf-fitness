-- Demo data: one coach, one member linked to that coach, one workout plan
-- with a few days/exercises, and one diet plan with a few items.

-- auth.users rows are required first since public.profiles.id references them.
-- Password for both demo accounts (local dev only): "password123".
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'coach@dbf.demo',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  ),
  (
    '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'member@dbf.demo',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '{"sub":"11111111-1111-1111-1111-111111111111","email":"coach@dbf.demo"}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    '{"sub":"22222222-2222-2222-2222-222222222222","email":"member@dbf.demo"}',
    'email', now(), now(), now()
  );

insert into public.profiles (id, role, coach_id, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'coach', null, 'Coach Dana Reyes'),
  ('22222222-2222-2222-2222-222222222222', 'member', '11111111-1111-1111-1111-111111111111', 'Jordan Lee');

insert into public.workout_plans (id, member_id, coach_id, title, description) values
  (
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Foundations — Month 1',
    'Three-day starter split focused on technique before load.'
  );

insert into public.workout_days (id, workout_plan_id, day_number, block_name, duration_minutes) values
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333333', 1, 'Cardio in Place — Foundation & Technique', 25),
  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333333', 2, 'Lower Body — Foundation & Technique', 30),
  ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333333', 3, 'Upper Body — Foundation & Technique', 25);

insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, detail) values
  ('44444444-4444-4444-4444-444444444401', 'High Knees', '30s', 1, 'Drive knees to hip height, stay on the balls of your feet.'),
  ('44444444-4444-4444-4444-444444444401', 'Burpees', '5 reps', 2, 'Full extension at the top, chest to floor at the bottom.'),
  ('44444444-4444-4444-4444-444444444401', 'Mountain Climbers', '30s', 3, 'Keep hips level, drive knees toward the chest.'),
  ('44444444-4444-4444-4444-444444444402', 'Bodyweight Squats', '12 reps', 1, 'Knees tracking over toes, full depth.'),
  ('44444444-4444-4444-4444-444444444402', 'Walking Lunges', '10 reps/leg', 2, 'Torso upright, step long enough to load the front leg.'),
  ('44444444-4444-4444-4444-444444444403', 'Push-Ups', '10 reps', 1, 'Elbows at roughly 45 degrees, full lockout at the top.'),
  ('44444444-4444-4444-4444-444444444403', 'Plank Hold', '45s', 2, 'Neutral spine, brace through the core.');

insert into public.diet_plans (id, coach_id, title, description) values
  (
    '55555555-5555-5555-5555-555555555555',
    '11111111-1111-1111-1111-111111111111',
    'Lean Foundations Nutrition',
    'Simple, checkable daily targets to pair with the Month 1 workout plan.'
  );

insert into public.diet_items (diet_plan_id, name, description, order_index) values
  ('55555555-5555-5555-5555-555555555555', 'Protein at every meal', 'Aim for a palm-sized portion at breakfast, lunch, and dinner.', 1),
  ('55555555-5555-5555-5555-555555555555', '2L water', 'Spread intake across the day, more on training days.', 2),
  ('55555555-5555-5555-5555-555555555555', 'Vegetables at lunch and dinner', 'Half the plate, any variety.', 3);

insert into public.diet_plan_assignments (diet_plan_id, member_id) values
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222');

-- Second demo member (Sam Rivera) for community/group screenshots. Deliberately
-- has no workout_plans/diet_plans/workout_completions rows so Phase 3's
-- already-verified effort leaderboard behavior is unaffected.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'sam@dbf.demo',
  crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '66666666-6666-6666-6666-666666666666',
  '66666666-6666-6666-6666-666666666666',
  '{"sub":"66666666-6666-6666-6666-666666666666","email":"sam@dbf.demo"}',
  'email', now(), now(), now()
);

insert into public.profiles (id, role, coach_id, full_name) values
  ('66666666-6666-6666-6666-666666666666', 'member', '11111111-1111-1111-1111-111111111111', 'Sam Rivera');

-- "People you train with": a group both demo members belong to.
insert into public.groups (id, name, description, created_by) values
  (
    '77777777-7777-7777-7777-777777777777',
    'Morning Crew',
    'Early risers keeping each other accountable.',
    '11111111-1111-1111-1111-111111111111'
  );

insert into public.group_members (group_id, member_id) values
  ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222'),
  ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666');

-- One upcoming coach-hosted live class, left unjoined so the screenshot flow
-- can capture the join action itself.
insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at, status) values
  (
    '88888888-8888-8888-8888-888888888888',
    '11111111-1111-1111-1111-111111111111',
    'Saturday Conditioning',
    'dbf-demo-saturday-conditioning',
    now() + interval '2 days',
    'scheduled'
  );

-- ---------------------------------------------------------------------------
-- Subscriptions demo data: one member per entitlement state.
-- ---------------------------------------------------------------------------

-- Third demo member (Riley Park): coached by Dana and in Morning Crew like the others, but with a
-- subscription that lapsed a month ago. Exists so the "blocked / renew to rejoin" live-class path
-- is reachable in the app and in tests without mutating Jordan or Sam.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'riley@dbf.demo',
  crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '99999999-9999-9999-9999-999999999999',
  '99999999-9999-9999-9999-999999999999',
  '{"sub":"99999999-9999-9999-9999-999999999999","email":"riley@dbf.demo"}',
  'email', now(), now(), now()
);

insert into public.profiles (id, role, coach_id, full_name) values
  ('99999999-9999-9999-9999-999999999999', 'member', '11111111-1111-1111-1111-111111111111', 'Riley Park');

insert into public.group_members (group_id, member_id) values
  ('77777777-7777-7777-7777-777777777777', '99999999-9999-9999-9999-999999999999');

-- One member per state the UI has to handle. Coach Dana deliberately has NO row: staff are exempt,
-- and the absence proves the exemption is driven by profiles.role, not by a hidden subscription.
--   Jordan - paid, 20 days left            -> 'active'
--   Sam    - payment 3 days late           -> 'grace' (7 of the 10 days left)
--   Riley  - lapsed a month ago            -> 'expired'
insert into public.subscriptions (member_id, status, current_period_end, provider) values
  ('22222222-2222-2222-2222-222222222222', 'active',   now() + interval '20 days', 'manual'),
  ('66666666-6666-6666-6666-666666666666', 'past_due', now() - interval '3 days',  'manual'),
  ('99999999-9999-9999-9999-999999999999', 'past_due', now() - interval '30 days', 'manual');

-- ---------------------------------------------------------------------------
-- Coach directory demo data (20260919153000_coach_directory_and_notes_gating.sql).
-- ---------------------------------------------------------------------------

-- Second coach (Marcus Bell) with NO members of his own, so the "pick a coach" and
-- "switch coach" flows have a real, empty destination and member_count has something
-- other than Dana's three to report. Staff need no subscription row.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'marcus@dbf.demo',
  crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"marcus@dbf.demo"}',
  'email', now(), now(), now()
);

insert into public.profiles (id, role, coach_id, full_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'coach', null, 'Coach Marcus Bell');

-- Directory entries. Both coaches are accepting, so choose_coach() succeeds for either
-- one out of the box; flip accepting_members to false to exercise coach_not_accepting.
insert into public.coach_profiles (coach_id, bio, specialties, accepting_members) values
  (
    '11111111-1111-1111-1111-111111111111',
    'Twelve years coaching beginners into consistent lifters. Technique first, load second.',
    array['Strength', 'Technique', 'Beginners'],
    true
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Endurance and conditioning coach. Former 10k runner, now mostly interested in making hard things feel easy.',
    array['Conditioning', 'Endurance', 'Mobility'],
    true
  );

-- Pin the bundled pictogram for each seeded exercise (exercises.image_key; null = resolve from name).
--
-- Scoped to the days of THIS seed's plan (33333333-…). `exercises.name` is not
-- unique — nothing stops a coach creating their own "Push-Ups" in the app, or a
-- later seed adding another plan with the same movement names — so a bare
-- `where name = …` reached out of the seed and rewrote rows it does not own.
update public.exercises as e
set image_key = pin.image_key
from (
  values
    ('Bodyweight Squats', 'bodyweight-squat'),
    ('Burpees', 'burpee'),
    ('High Knees', 'high-knees'),
    ('Mountain Climbers', 'mountain-climber'),
    ('Plank Hold', 'plank'),
    ('Push-Ups', 'push-up'),
    ('Walking Lunges', 'walking-lunge')
) as pin (name, image_key)
where e.name = pin.name
  and e.workout_day_id in (
    select id
    from public.workout_days
    where workout_plan_id = '33333333-3333-3333-3333-333333333333'
  );
