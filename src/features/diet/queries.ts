/**
 * The Food screen's data layer, lifted out of the screen so the screen file is
 * markup and the queries are readable (and mockable) on their own.
 *
 * Nothing here is React: the screen owns the TanStack wiring.
 */

import { supabase } from '../../services/supabase/client';

export type DietItemRow = {
  id: string;
  name: string;
  description: string | null;
  order_index: number;
};

export type DietPlanDetail = {
  title: string;
  description: string | null;
  items: DietItemRow[];
} | null;

/** The member's most recently assigned diet plan, or null when they have none. */
export async function fetchDietPlan(memberId: string): Promise<DietPlanDetail> {
  const { data: assignment, error: assignmentError } = await supabase
    .from('diet_plan_assignments')
    .select('diet_plan_id')
    .eq('member_id', memberId)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assignmentError) throw assignmentError;
  if (!assignment) return null;

  const { data: plan, error: planError } = await supabase
    .from('diet_plans')
    .select('title, description')
    .eq('id', assignment.diet_plan_id)
    .single();
  if (planError) throw planError;

  const { data: items, error: itemsError } = await supabase
    .from('diet_items')
    .select('id, name, description, order_index')
    .eq('diet_plan_id', assignment.diet_plan_id)
    .order('order_index', { ascending: true });
  if (itemsError) throw itemsError;

  return {
    title: plan.title,
    description: plan.description,
    items: items ?? [],
  };
}

/** The item ids this member has already ticked off on `todayDateString` (UTC). */
export async function fetchTodaysCheckins(
  memberId: string,
  todayDateString: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('diet_checkins')
    .select('diet_item_id')
    .eq('member_id', memberId)
    .eq('checkin_date', todayDateString);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.diet_item_id));
}

/** Tick or untick one item for today. The UTC day matches the RLS window. */
export async function toggleCheckin(input: {
  memberId: string;
  itemId: string;
  isChecked: boolean;
  todayDateString: string;
}): Promise<void> {
  const { memberId, itemId, isChecked, todayDateString } = input;

  if (isChecked) {
    const { error } = await supabase
      .from('diet_checkins')
      .delete()
      .eq('member_id', memberId)
      .eq('diet_item_id', itemId)
      .eq('checkin_date', todayDateString);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('diet_checkins').insert({
    member_id: memberId,
    diet_item_id: itemId,
    checkin_date: todayDateString,
  });
  if (error) throw error;
}
