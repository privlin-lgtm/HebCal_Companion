import { describe, expect, it, vi } from "vitest";
import { nextObservance, refreshUpcoming } from "./remembrances.js";

const tevet = { id: "a", hm: "Tevet", hd: 10 };

describe("nextObservance", () => {
  it("skips a past date in the current Hebrew year", async () => {
    const convertFn = vi.fn(async ({ hy }) => (
      hy === 5786
        ? { gy: 2026, gm: 1, gd: 1 }
        : { gy: 2026, gm: 12, gd: 20 }
    ));
    const next = await nextObservance(tevet, 5786, convertFn, "2026-08-30");
    expect(next.iso).toBe("2026-12-20");
    expect(convertFn).toHaveBeenCalledTimes(2);
  });

  it("skips an absent month such as Adar II and tries the next year", async () => {
    const convertFn = vi.fn(async ({ hy }) => {
      if (hy === 5786) throw new Error("invalid date");
      return { gy: 2027, gm: 3, gd: 8 };
    });
    const next = await nextObservance({ id: "b", hm: "Adar II", hd: 14 }, 5786, convertFn, "2026-08-30");
    expect(next.iso).toBe("2027-03-08");
  });
});

describe("refreshUpcoming", () => {
  it("does not refetch records whose next date is still in the future", async () => {
    const convertFn = vi.fn(async () => ({ gy: 2026, gm: 12, gd: 20 }));
    const updates = await refreshUpcoming(
      [
        { id: "fresh", hm: "Av", hd: 9, nextIso: "2026-08-31" },
        { id: "stale", hm: "Tevet", hd: 10, nextIso: "2026-01-01" },
      ],
      5786,
      convertFn,
      "2026-08-30",
    );
    expect(updates.has("fresh")).toBe(false);
    expect(convertFn).toHaveBeenCalledTimes(1);
    expect(updates.get("stale")).toMatchObject({ nextIso: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it("refreshes pending records in parallel", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const convertFn = async () => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await Promise.resolve();
      inflight -= 1;
      return { gy: 2026, gm: 12, gd: 20 };
    };
    await refreshUpcoming(
      [
        { id: "one", hm: "Tevet", hd: 10 },
        { id: "two", hm: "Nisan", hd: 15 },
      ],
      5786,
      convertFn,
      "2026-08-30",
    );
    expect(maxInflight).toBe(2);
  });
});
