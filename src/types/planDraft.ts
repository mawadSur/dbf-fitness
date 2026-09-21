/**
 * The plan-draft document.
 *
 * This is the wire shape of `workout_plan_drafts.draft` and of
 * `plan_templates.template` — one schema, validated server-side by
 * `public.plan_draft_normalize()` (migration 20260921111000). The server
 * STRIPS any field not listed here, so adding a property on the client without
 * adding it to the validator silently loses it.
 *
 * The editing contract:
 *   save_plan_draft(p_plan, p_draft, p_expected_base_rev) -> int (base rev)
 *   publish_plan(p_plan, p_expected_rev)                  -> int (new rev)
 *
 * Both take the `workout_plans.rev` the editor loaded. A mismatch is refused
 * with SQLSTATE 40001 ('stale_draft' / 'stale_plan') rather than overwriting
 * whatever the other editor did — reload and reapply.
 *
 * Row identity is the other half of the contract: an entry that carries the
 * `id` of an existing day or exercise is UPDATED IN PLACE, an entry with
 * `id: null` is inserted, and anything the draft omits is ARCHIVED, never
 * deleted. That is what keeps a member's completion history — and a member who
 * is mid-session when the coach publishes — intact.
 */

import type { PrescriptionMode } from '../features/workouts/prescription';

/** The prescription block, mirroring the structured `exercises` columns. */
export type PlanDraftPrescription = {
  mode: PrescriptionMode;
  sets?: number | null;
  reps_min?: number | null;
  reps_max?: number | null;
  seconds?: number | null;
  rest_seconds?: number | null;
  weight?: number | null;
  weight_unit?: 'kg' | 'lb' | null;
  distance_m?: number | null;
  notes?: string | null;
};

export type PlanDraftExercise = {
  /** Existing row id, or null for a new exercise. */
  id: string | null;
  /** Order within the day. The server re-derives it from array order. */
  position: number;
  name: string;
  exercise_key?: string | null;
  image_key?: string | null;
  prescription: PlanDraftPrescription;
  detail?: string | null;
  /** https:// only. */
  video_url?: string | null;
};

export type PlanDraftDay = {
  /** Existing row id, or null for a new day. */
  id: string | null;
  day_number: number;
  block_name: string;
  duration_minutes?: number | null;
  exercises: PlanDraftExercise[];
};

export type PlanDraft = {
  title: string;
  description?: string | null;
  days: PlanDraftDay[];
};

/**
 * SQLSTATEs the two RPCs raise. Anything else is a genuine server fault.
 *
 * 42501 not_your_member — the caller is not the member's CURRENT coach or an
 *       admin. Note "current": a coach who has been replaced loses the plan.
 * P0002 plan_not_found / draft_not_found
 * 40001 stale_draft / stale_plan — reload and reapply.
 * 22023 invalid_draft — the reason is in the error's DETAIL, written for the
 *       coach to read; unknown_day_id / unknown_exercise_id mean the draft
 *       referenced a row that does not belong to this plan.
 */
export const PLAN_DRAFT_ERROR_CODES = {
  notYourMember: '42501',
  notFound: 'P0002',
  stale: '40001',
  invalid: '22023',
} as const;

/** The upper bounds `plan_draft_normalize()` enforces. */
export const PLAN_DRAFT_LIMITS = {
  titleMaxLength: 200,
  descriptionMaxLength: 4000,
  maxDays: 31,
  maxExercisesPerDay: 50,
  blockNameMaxLength: 120,
  exerciseNameMaxLength: 120,
  detailMaxLength: 2000,
  documentMaxBytes: 262144,
} as const;
