import type { MilestoneTier } from "../../theme/tokens";

export type MilestoneTierDb =
  "first_day" | "seven_day_streak" | "thirty_day_streak";

export const DB_TO_TIER: Record<MilestoneTierDb, MilestoneTier> = {
  first_day: "firstDay",
  seven_day_streak: "sevenDayStreak",
  thirty_day_streak: "thirtyDayStreak",
};

// Least → most significant, used to pick one headline tier when several are newly crossed at once.
export const TIER_SIGNIFICANCE: MilestoneTierDb[] = [
  "first_day",
  "seven_day_streak",
  "thirty_day_streak",
];

// Thresholds mirror public.has_earned_milestone (1 completion / 7-day streak / 30-day streak).
export const FIRST_DAY_MIN_COMPLETED = 1;
export const SEVEN_DAY_STREAK = 7;
export const THIRTY_DAY_STREAK = 30;

export type MilestoneProgress = {
  memberId: string;
  completedCount: number;
  currentStreak: number;
  existingTiers: Set<MilestoneTierDb>;
};

export function crossedTiers(progress: MilestoneProgress): MilestoneTierDb[] {
  const { completedCount, currentStreak, existingTiers } = progress;
  const crossed: MilestoneTierDb[] = [];

  if (
    completedCount >= FIRST_DAY_MIN_COMPLETED &&
    !existingTiers.has("first_day")
  )
    crossed.push("first_day");
  if (
    currentStreak >= SEVEN_DAY_STREAK &&
    !existingTiers.has("seven_day_streak")
  ) {
    crossed.push("seven_day_streak");
  }
  if (
    currentStreak >= THIRTY_DAY_STREAK &&
    !existingTiers.has("thirty_day_streak")
  ) {
    crossed.push("thirty_day_streak");
  }

  return crossed;
}

/** The single most significant tier among those actually recorded, mapped to the UI tier. */
export function pickHeadlineTier(
  inserted: readonly MilestoneTierDb[],
): MilestoneTier | null {
  const headline = [...TIER_SIGNIFICANCE]
    .reverse()
    .find((tier) => inserted.includes(tier));
  return headline ? DB_TO_TIER[headline] : null;
}
