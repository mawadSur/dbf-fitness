/**
 * Pure effort-leaderboard maths, kept out of the screen so it can be tested
 * without a Supabase stand-in.
 *
 * The ranking rule is unchanged from the pre-redesign screen: highest average
 * effort first, and anyone with no score yet goes last (they have not been
 * scored, which is not the same as scoring zero).
 */

export type EffortStat = {
  member_id: string;
  completed_count: number;
  missed_count: number;
  total_effort_score: number;
  avg_effort_score: number | null;
  current_streak: number;
};

export type EffortRow = EffortStat & { fullName: string };

/** One decimal place, or an em dash when nobody has scored the member yet. */
export function formatAvgEffort(score: number | null): string {
  return score != null ? `${Math.round(score * 10) / 10}/10` : '—';
}

/** The rounded number the ring draws; 0 reads as an empty ring, which is honest. */
export function avgEffortValue(score: number | null): number {
  return score != null ? Math.round(score * 10) / 10 : 0;
}

export function withNames(
  stats: readonly EffortStat[],
  nameById: ReadonlyMap<string, string>,
): EffortRow[] {
  return stats.map((row) => ({
    ...row,
    fullName: nameById.get(row.member_id) ?? 'Unknown member',
  }));
}

/** Highest average first, unscored members last, in a new array. */
export function rankByEffort(rows: readonly EffortRow[]): EffortRow[] {
  return [...rows].sort((a, b) => {
    if (a.avg_effort_score == null && b.avg_effort_score == null) return 0;
    if (a.avg_effort_score == null) return 1;
    if (b.avg_effort_score == null) return -1;
    return b.avg_effort_score - a.avg_effort_score;
  });
}

/**
 * The accessible name of a leaderboard row.
 *
 * The rank is spoken as a number, never implied by position or colour: a screen
 * reader hears "Rank 2" the same way a sighted member reads "#2" (§9).
 */
export function leaderboardRowLabel(rank: number, row: EffortRow): string {
  return `Rank ${rank}, ${row.fullName}, ${row.completed_count} completed, average effort ${formatAvgEffort(
    row.avg_effort_score,
  )}`;
}
