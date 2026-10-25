import { describe, expect, it } from "vitest";
import { mapInBatches } from "../../src/graph/map-in-batches.js";

describe("mapInBatches", () => {
  it("returns results in input order", async () => {
    const result = await mapInBatches([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("never runs more than batchSize at once", async () => {
    let running = 0;
    let peak = 0;

    await mapInBatches(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
    });

    expect(peak).toBe(3);
  });

  it("returns an empty array for no items", async () => {
    expect(await mapInBatches([], 4, async (x) => x)).toEqual([]);
  });

  it("stops between batches once the signal aborts", async () => {
    const controller = new AbortController();
    const seen: number[] = [];

    const run = mapInBatches(
      [1, 2, 3, 4],
      2,
      async (n) => {
        seen.push(n);
        controller.abort();
      },
      controller.signal,
    );

    await expect(run).rejects.toThrow();
    expect(seen).toEqual([1, 2]);
  });
});
