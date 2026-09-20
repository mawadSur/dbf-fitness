import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "../../services/supabase/client";
import type { MilestoneTier } from "../../theme/tokens";
import {
  crossedTiers,
  pickHeadlineTier,
  type MilestoneProgress,
  type MilestoneTierDb,
} from "./logic";

const UNIQUE_VIOLATION = "23505";

type MilestoneCheckResult = {
  newlyAchievedTier: MilestoneTier | null;
  isLoading: boolean;
};

async function getMemberId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Checks the current member's progress against milestone tiers and records
 * any newly-crossed ones. Generic/reusable — safe to call from any screen
 * (e.g. later from the workout-finish flow), not just the calendar screen.
 */
export function useMilestoneCheck(): MilestoneCheckResult {
  const [newlyAchievedTier, setNewlyAchievedTier] =
    useState<MilestoneTier | null>(null);
  const hasRunRef = useRef(false);

  const sessionQuery = useQuery({
    queryKey: ["milestone-check", "session"],
    queryFn: getMemberId,
  });

  const memberId = sessionQuery.data ?? null;

  const progressQuery = useQuery({
    queryKey: ["milestone-check", "progress", memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<MilestoneProgress> => {
      const [statsResult, milestonesResult] = await Promise.all([
        supabase
          .from("member_workout_stats")
          .select("completed_count, current_streak")
          .eq("member_id", memberId)
          .single(),
        supabase.from("milestones").select("tier").eq("member_id", memberId),
      ]);

      if (statsResult.error) throw statsResult.error;
      if (milestonesResult.error) throw milestonesResult.error;

      const existingTiers = new Set<MilestoneTierDb>(
        (milestonesResult.data ?? []).map(
          (row: { tier: MilestoneTierDb }) => row.tier,
        ),
      );

      return {
        memberId: memberId as string,
        completedCount: statsResult.data?.completed_count ?? 0,
        currentStreak: statsResult.data?.current_streak ?? 0,
        existingTiers,
      };
    },
  });

  useEffect(() => {
    if (hasRunRef.current || !progressQuery.data) return;
    hasRunRef.current = true;

    const progress = progressQuery.data;
    const crossed = crossedTiers(progress);
    if (crossed.length === 0) return;

    void (async () => {
      const inserted: MilestoneTierDb[] = [];

      for (const tier of crossed) {
        const { error } = await supabase
          .from("milestones")
          .insert({ member_id: progress.memberId, tier });

        if (error) {
          // A concurrent call (e.g. this hook also mounted elsewhere) may have
          // inserted the same tier first — that's fine, not a real failure.
          if (error.code !== UNIQUE_VIOLATION) {
            console.warn(
              "[useMilestoneCheck] failed to record milestone",
              tier,
              error,
            );
          }
          continue;
        }

        inserted.push(tier);
      }

      const headline = pickHeadlineTier(inserted);
      if (headline) setNewlyAchievedTier(headline);
    })();
  }, [progressQuery.data]);

  return {
    newlyAchievedTier,
    isLoading:
      sessionQuery.isLoading || (!!memberId && progressQuery.isLoading),
  };
}
