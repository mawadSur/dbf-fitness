import {
  crossedTiers,
  DB_TO_TIER,
  pickHeadlineTier,
  type MilestoneProgress,
  type MilestoneTierDb,
} from "./logic";

const progress = (
  completedCount: number,
  currentStreak: number,
  existing: MilestoneTierDb[] = [],
): MilestoneProgress => ({
  memberId: "m1",
  completedCount,
  currentStreak,
  existingTiers: new Set(existing),
});

describe("crossedTiers thresholds (1 completion / 7-day streak / 30-day streak)", () => {
  it.each([
    [0, 0, []],
    [1, 0, ["first_day"]],
    [1, 6, ["first_day"]],
    [6, 6, ["first_day"]],
    [7, 7, ["first_day", "seven_day_streak"]],
    [29, 29, ["first_day", "seven_day_streak"]],
    [30, 30, ["first_day", "seven_day_streak", "thirty_day_streak"]],
    [100, 31, ["first_day", "seven_day_streak", "thirty_day_streak"]],
  ])("completed=%s streak=%s -> %j", (completed, streak, expected) => {
    expect(crossedTiers(progress(completed, streak))).toEqual(expected);
  });

  it("a streak alone does not award first_day when there are no completions (malformed stats)", () => {
    expect(crossedTiers(progress(0, 7))).toEqual(["seven_day_streak"]);
  });

  it("ignores negative and NaN numbers instead of awarding anything", () => {
    expect(crossedTiers(progress(-1, -5))).toEqual([]);
    expect(crossedTiers(progress(Number.NaN, Number.NaN))).toEqual([]);
  });
});

describe("crossedTiers latch on already-recorded tiers", () => {
  it("never re-awards a tier that already exists", () => {
    expect(
      crossedTiers(
        progress(40, 30, [
          "first_day",
          "seven_day_streak",
          "thirty_day_streak",
        ]),
      ),
    ).toEqual([]);
  });

  it("only returns the missing tiers", () => {
    expect(crossedTiers(progress(40, 30, ["first_day"]))).toEqual([
      "seven_day_streak",
      "thirty_day_streak",
    ]);
    expect(crossedTiers(progress(40, 30, ["seven_day_streak"]))).toEqual([
      "first_day",
      "thirty_day_streak",
    ]);
  });

  it("a streak reset to 0 does not revoke or re-award (no-op)", () => {
    expect(
      crossedTiers(progress(40, 0, ["first_day", "seven_day_streak"])),
    ).toEqual([]);
  });
});

describe("pickHeadlineTier", () => {
  it("returns null for nothing inserted", () => {
    expect(pickHeadlineTier([])).toBeNull();
  });

  it("maps a single db tier to its UI tier", () => {
    expect(pickHeadlineTier(["first_day"])).toBe("firstDay");
    expect(pickHeadlineTier(["seven_day_streak"])).toBe("sevenDayStreak");
    expect(pickHeadlineTier(["thirty_day_streak"])).toBe("thirtyDayStreak");
  });

  it("picks the most significant tier regardless of order", () => {
    expect(pickHeadlineTier(["first_day", "seven_day_streak"])).toBe(
      "sevenDayStreak",
    );
    expect(
      pickHeadlineTier(["thirty_day_streak", "first_day", "seven_day_streak"]),
    ).toBe("thirtyDayStreak");
  });

  it("DB_TO_TIER covers exactly the three tiers", () => {
    expect(Object.keys(DB_TO_TIER).sort()).toEqual([
      "first_day",
      "seven_day_streak",
      "thirty_day_streak",
    ]);
  });
});
