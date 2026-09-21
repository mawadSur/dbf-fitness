import { act, renderHook } from '@testing-library/react-native';

import { SKELETON_DELAY_MS, useDelayedVisible } from './useDelayedVisible';

describe('useDelayedVisible', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('stays false for a load that finishes inside the grace period', async () => {
    const { result, rerender } = await renderHook(
      ({ active }: { active: boolean }) => useDelayedVisible(active),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(SKELETON_DELAY_MS - 1);
    });
    expect(result.current).toBe(false);

    await rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it('turns true once the load has held for the delay', async () => {
    const { result } = await renderHook(() => useDelayedVisible(true));
    await act(async () => {
      jest.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(result.current).toBe(true);
  });

  it('clears immediately when the data lands', async () => {
    const { result, rerender } = await renderHook(
      ({ active }: { active: boolean }) => useDelayedVisible(active),
      { initialProps: { active: true } },
    );
    await act(async () => {
      jest.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(result.current).toBe(true);

    await rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it('gives a second load its own grace period', async () => {
    const { result, rerender } = await renderHook(
      ({ active }: { active: boolean }) => useDelayedVisible(active),
      { initialProps: { active: true } },
    );
    await act(async () => {
      jest.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    await rerender({ active: false });
    await rerender({ active: true });
    expect(result.current).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(result.current).toBe(true);
  });

  it('honours a custom delay', async () => {
    const { result } = await renderHook(() => useDelayedVisible(true, 1000));
    await act(async () => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });
});
