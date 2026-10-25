/** Builds `Response`s with a real streaming body, so tests control exactly where the network "splits" the data. */

const encoder = new TextEncoder();

/**
 * A response whose body arrives in the given chunks, one per read. Strings are UTF-8 encoded; pass `Uint8Array`s to
 * split inside a multi-byte character. `failAfter` makes the stream error once the chunks are delivered, like a dropped connection.
 */
export function streamResponse(chunks: (string | Uint8Array)[], options: { status?: number; failAfter?: Error } = {}): Response {
  let next = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next < chunks.length) {
        const chunk = chunks[next++]!;
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      } else if (options.failAfter) {
        controller.error(options.failAfter);
      } else {
        controller.close();
      }
    },
  });
  return new Response(body, { status: options.status ?? 200 });
}

/** The same text delivered one character per chunk: the harshest split a line-based reader can face. */
export function dribble(text: string): string[] {
  return [...text];
}

/** Drains a stream-event generator into an array. */
export async function collect<T>(events: AsyncGenerator<T, void, void>): Promise<T[]> {
  const all: T[] = [];
  for await (const event of events) all.push(event);
  return all;
}
