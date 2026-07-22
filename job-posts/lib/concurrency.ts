// Runs `fn` over `items` with at most `limit` in flight at once. Plain
// Promise.all with hundreds of items (OpenAI calls, DB upserts over Neon's
// HTTP driver) either blows the serverless function's time budget running
// sequentially, or floods the target running fully in parallel — this caps it.
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
