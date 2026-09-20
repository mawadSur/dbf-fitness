import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { useMilestoneCheck } from "./useMilestoneCheck";

const mockGetSession = jest.fn();
const mockFrom = jest.fn();

jest.mock("../../services/supabase/client", () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => mockGetSession(...a) },
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

type Fixture = {
  stats: { data: unknown; error: unknown };
  milestones: { data: unknown; error: unknown };
  insertErrors?: Record<string, { code: string } | null>;
};

const insert = jest.fn();
const statsEq = jest.fn();
const milestonesEq = jest.fn();

function setup(fixture: Fixture) {
  insert.mockImplementation((row: { tier: string }) =>
    Promise.resolve({ error: fixture.insertErrors?.[row.tier] ?? null }),
  );
  statsEq.mockImplementation(() => ({
    single: () => Promise.resolve(fixture.stats),
  }));
  milestonesEq.mockImplementation(() => Promise.resolve(fixture.milestones));
  mockFrom.mockImplementation((table: string) => {
    if (table === "member_workout_stats")
      return { select: () => ({ eq: statsEq }) };
    if (table === "milestones")
      return { select: () => ({ eq: milestonesEq }), insert };
    throw new Error(`unexpected table ${table}`);
  });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: "member-1" } } },
  });
});

describe("useMilestoneCheck", () => {
  it("records every newly crossed tier for the session member and headlines the biggest", async () => {
    setup({
      stats: { data: { completed_count: 45, current_streak: 30 }, error: null },
      milestones: { data: [], error: null },
    });

    const { result } = await renderHook(() => useMilestoneCheck(), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() =>
      expect(result.current.newlyAchievedTier).toBe("thirtyDayStreak"),
    );
    expect(insert.mock.calls.map(([row]) => row)).toEqual([
      { member_id: "member-1", tier: "first_day" },
      { member_id: "member-1", tier: "seven_day_streak" },
      { member_id: "member-1", tier: "thirty_day_streak" },
    ]);
    expect(statsEq).toHaveBeenCalledWith("member_id", "member-1");
    expect(milestonesEq).toHaveBeenCalledWith("member_id", "member-1");
  });

  it("latches: tiers already recorded are not inserted and nothing is announced", async () => {
    setup({
      stats: { data: { completed_count: 45, current_streak: 30 }, error: null },
      milestones: {
        data: [
          { tier: "first_day" },
          { tier: "seven_day_streak" },
          { tier: "thirty_day_streak" },
        ],
        error: null,
      },
    });

    const { result } = await renderHook(() => useMilestoneCheck(), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(milestonesEq).toHaveBeenCalled());
    expect(insert).not.toHaveBeenCalled();
    expect(result.current.newlyAchievedTier).toBeNull();
  });

  it("a missing stats row (new member) is treated as 0/0 and awards nothing", async () => {
    setup({
      stats: { data: null, error: null },
      milestones: { data: null, error: null },
    });

    const { result } = await renderHook(() => useMilestoneCheck(), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(milestonesEq).toHaveBeenCalled());
    expect(insert).not.toHaveBeenCalled();
    expect(result.current.newlyAchievedTier).toBeNull();
  });

  it("does nothing without a session (no queries fire)", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    setup({
      stats: { data: null, error: null },
      milestones: { data: [], error: null },
    });

    const { result } = await renderHook(() => useMilestoneCheck(), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.newlyAchievedTier).toBeNull();
  });

  it("a unique violation (concurrent insert) is swallowed silently and is not announced", async () => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    setup({
      stats: { data: { completed_count: 1, current_streak: 1 }, error: null },
      milestones: { data: [], error: null },
      insertErrors: { first_day: { code: "23505" } },
    });

    const { result } = await renderHook(() => useMilestoneCheck(), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    await flush();
    expect(warn).not.toHaveBeenCalled();
    expect(result.current.newlyAchievedTier).toBeNull();
    warn.mockRestore();
  });

  it("any other insert error warns, skips that tier and still announces the ones that landed", async () => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    setup({
      stats: { data: { completed_count: 9, current_streak: 7 }, error: null },
      milestones: { data: [], error: null },
      insertErrors: { seven_day_streak: { code: "42501" } },
    });

    const { result } = await renderHook(() => useMilestoneCheck(), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() =>
      expect(result.current.newlyAchievedTier).toBe("firstDay"),
    );
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("runs at most once per mount (latch) even when progress refetches", async () => {
    setup({
      stats: { data: { completed_count: 1, current_streak: 1 }, error: null },
      milestones: { data: [], error: null },
    });
    const client = newClient();

    const { result } = await renderHook(() => useMilestoneCheck(), {
      wrapper: wrapper(client),
    });
    await waitFor(() =>
      expect(result.current.newlyAchievedTier).toBe("firstDay"),
    );

    await act(async () => {
      await client.refetchQueries({
        queryKey: ["milestone-check", "progress"],
      });
    });
    await flush();
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
