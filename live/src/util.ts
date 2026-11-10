export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Poll `fn` every `everyMs` until it returns a truthy value or `timeoutMs` passes. Returns the value or undefined. */
export async function waitFor<T>(fn: () => Promise<T | undefined | false | null>, timeoutMs: number, everyMs = 250): Promise<T | undefined> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() >= end) return undefined;
    await sleep(everyMs);
  }
}
