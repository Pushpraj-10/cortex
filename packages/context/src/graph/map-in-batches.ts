/**
 * Maps `items` through an async `fn`, at most `batchSize` at a time, returning results in
 * input order. Bounds how many files are open at once so indexing a big workspace can't
 * exhaust file handles, and checks `signal` between batches so a cancelled turn stops promptly.
 */
export async function mapInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = [];

  for (let start = 0; start < items.length; start += batchSize) {
    signal?.throwIfAborted();
    results.push(...(await Promise.all(items.slice(start, start + batchSize).map(fn))));
  }

  return results;
}
