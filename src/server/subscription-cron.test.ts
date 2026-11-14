import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { getSubscriptionCronSnapshot, getSubscriptionCronStatus, startSubscriptionCron } from "./subscription-cron";

const fetcher = vi.hoisted(() => ({ refreshMany: vi.fn() }));
vi.mock("@/server/fetcher", () => fetcher);
const timers: NodeJS.Timeout[] = [];

afterEach(() => {
  for (const timer of timers.splice(0)) clearInterval(timer);
  delete (globalThis as { __clashdashSubscriptionCron?: NodeJS.Timeout }).__clashdashSubscriptionCron;
  delete (globalThis as { __clashdashSubscriptionCronStatus?: unknown }).__clashdashSubscriptionCronStatus;
  vi.useRealTimers();
  vi.restoreAllMocks();
  fetcher.refreshMany.mockReset();
});

describe("subscription cron", () => {
  it("runs immediately and on each tick without registering duplicate timers", async () => {
    vi.useFakeTimers();
    fetcher.refreshMany.mockResolvedValue([]);
    const db = {} as Db;
    const timer = startSubscriptionCron(db, 1000);
    timers.push(timer);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher.refreshMany).toHaveBeenCalledWith(db, "all");
    expect(fetcher.refreshMany).toHaveBeenCalledTimes(1);

    expect(startSubscriptionCron(db, 1000)).toBe(timer);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher.refreshMany).toHaveBeenCalledTimes(2);
  });

  it("does not re-enter while a scheduled refresh is still running", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    fetcher.refreshMany.mockImplementation(() => new Promise<never[]>((resolve) => (finish = () => resolve([]))));
    const timer = startSubscriptionCron({} as Db, 1000);
    timers.push(timer);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetcher.refreshMany).toHaveBeenCalledTimes(1);
    expect(getSubscriptionCronStatus().running).toBe(true);

    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher.refreshMany).toHaveBeenCalledTimes(2);
  });

  it("counts refreshes and consecutive failures while retaining the latest success", async () => {
    vi.useFakeTimers();
    fetcher.refreshMany.mockResolvedValue([
      { id: 1, ok: true, count: 2 },
      { id: 2, ok: false, count: 0, error: "HTTP 500" },
    ]);
    const timer = startSubscriptionCron({} as Db, 1000);
    timers.push(timer);
    await vi.advanceTimersByTimeAsync(0);

    expect(getSubscriptionCronStatus()).toMatchObject({
      running: false,
      totalRefreshes: 2,
      consecutiveFailures: 1,
      lastRun: { attempted: 2, succeeded: 1, failed: 1 },
      lastError: "订阅 #2：HTTP 500",
    });
    expect(getSubscriptionCronStatus().lastSuccessfulRefreshAt).not.toBeNull();
  });

  it("resets consecutive failures after a fully successful run", async () => {
    vi.useFakeTimers();
    fetcher.refreshMany
      .mockResolvedValueOnce([{ id: 1, ok: false, count: 0, error: "HTTP 500" }])
      .mockResolvedValueOnce([{ id: 1, ok: true, count: 2 }]);
    const timer = startSubscriptionCron({} as Db, 1000);
    timers.push(timer);
    await vi.advanceTimersByTimeAsync(0);
    expect(getSubscriptionCronStatus().consecutiveFailures).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(getSubscriptionCronStatus()).toMatchObject({ totalRefreshes: 2, consecutiveFailures: 0 });
    expect(getSubscriptionCronStatus().lastSuccessfulRefreshAt).not.toBeNull();
  });

  it("reports scheduler errors and recovers the running state", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetcher.refreshMany.mockRejectedValue(new Error("database offline"));
    const timer = startSubscriptionCron({} as Db, 1000);
    timers.push(timer);
    await vi.advanceTimersByTimeAsync(0);

    expect(getSubscriptionCronStatus()).toMatchObject({
      running: false,
      totalRefreshes: 0,
      consecutiveFailures: 1,
      lastRun: null,
      lastError: "database offline",
    });
  });

  it("calculates the earliest next refresh across enabled subscriptions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-01-01T00:00:00.000Z");
    fetcher.refreshMany.mockResolvedValue([]);
    const timer = startSubscriptionCron({} as Db, 1000);
    timers.push(timer);
    await vi.advanceTimersByTimeAsync(0);
    const now = Date.now();
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [
            { lastAttemptAt: new Date(now - 30_000), refreshInterval: 60 },
            { lastAttemptAt: new Date(now - 10_000), refreshInterval: 120 },
          ],
        }),
      }),
    } as unknown as Db;

    expect((await getSubscriptionCronSnapshot(db)).nextRefreshAt).toBe(new Date(now + 30_000).toISOString());
  });
});
