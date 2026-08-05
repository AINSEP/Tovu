import { vi } from "vitest";

/**
 * @file Shared fakes for `assistant-transport.*.unit.test.ts`.
 *
 * Not itself a suite (no `.test.ts` suffix, so vitest's default include glob skips it) — a plain
 * module the four sibling files import from, so the `EventSource`/`ReadableStream` shapes stay
 * identical across the daemon and BYOK paths rather than drifting between hand-rolled copies.
 */

/**
 * A controllable `EventSource` stand-in. jsdom has no native `EventSource`, and even where one
 * exists it offers no way to inject frames from a test — so `subscribeToRun`'s tests construct one
 * of these via `vi.stubGlobal("EventSource", FakeEventSource)` and drive it with `.emit(...)`.
 */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  closed = false;
  private readonly listeners = new Map<string, Array<(event: { data: string }) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: { data: string }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(): void {
    // Unused by assistant-transport.ts — present only to satisfy any consumer that checks for it.
  }

  close(): void {
    this.closed = true;
  }

  /** Fires every handler registered for `type`, mirroring a real `MessageEvent`'s `.data`. */
  emit(type: string, data: string): void {
    for (const handler of this.listeners.get(type) ?? []) handler({ data });
  }
}

/** Resets the instance registry between tests so `FakeEventSource.instances[0]` always means "the
 *  one this test's own call opened", not a leftover from a previous test. */
export function resetFakeEventSource(): void {
  FakeEventSource.instances = [];
}

/**
 * A real `ReadableStream<Uint8Array>` that yields `chunks` one at a time, each `read()` call
 * returning the next chunk until exhausted. Using the platform's actual stream type (not a hand
 * rolled duck-type) so `readSseFrames`'s `body.getReader()` call exercises the real contract.
 */
export function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i += 1;
      } else {
        controller.close();
      }
    },
  });
}

/** Lets in-flight microtasks (promise chains, `void (async () => {...})()` bodies) settle before
 *  a test asserts on their side effects. */
export async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export function stubFetchJsonOk(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}
