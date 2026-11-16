import type { TestContext } from "node:test";
import type { ChatMessage } from "@jini-ai/chat/core";
import type { SupervisorScheduler } from "@jini-ai/sidecar/supervisor";
import type { ChatRunLedger } from "#src/assistant/index";

/**
 * @file Fakes of the run finalizer's ports for the Phase 0 characterization suites
 * (run-finalizer design 2026-11-16, section 7). Every fake stands in for an injected interface:
 * the daemon client, the scheduler, the clock, the ledger. No module is mocked.
 */

const encoder = new TextEncoder();
export const frame = (runId: string, kind: string, payload: unknown): string =>
  `event: ${kind}\ndata: ${JSON.stringify({ runId, kind, payload })}\n\n`;
export const text = (runId: string, delta: string): string => frame(runId, "agent", { type: "text_delta", delta });
export const end = (runId: string, status: "succeeded" | "failed" | "canceled" = "succeeded"): string =>
  frame(runId, "end", { status, code: status === "succeeded" ? 0 : 1 });

/** A complete events response: the frames, then the daemon closes the stream. */
export const ended = (...frames: string[]): Response => new Response(frames.join(""), { status: 200 });
/** A 200 response whose stream closes with no end frame: a dropped connection. */
export const droppedStream = (): Response => new Response("", { status: 200 });
export const missing = (): Response => new Response(null, { status: 404 });

export interface Deferred<T> { readonly promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void }
export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

/** Lets queued microtasks and stream pipes run. `setImmediate` is never faked in these suites. */
export async function flush(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn++) await new Promise<void>((done) => { setImmediate(done); });
}

/** Collects unhandled rejections for one test; the listener is removed when the test ends. */
export function unhandledRejections(t: TestContext): unknown[] {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => { seen.push(reason); };
  process.on("unhandledRejection", listener);
  t.after(() => { process.off("unhandledRejection", listener); });
  return seen;
}

/** Waits for a condition without sleeping; a condition never reached fails the test by name. */
export async function until(check: () => boolean, label: string): Promise<void> {
  for (let turn = 0; turn < 400; turn++) {
    if (check()) return;
    await flush(1);
  }
  throw new Error(`never happened: ${label}`);
}

/** An events stream the test feeds frame by frame and closes from the daemon side. */
export function liveStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let open = true;
  // A reader that cancels (an aborted watch) closes the stream too; `close` is then a no-op.
  const body = new ReadableStream<Uint8Array>({ start(started) { controller = started; }, cancel() { open = false; } });
  return {
    response: new Response(body, { status: 200 }),
    push: (...frames: string[]) => { controller.enqueue(encoder.encode(frames.join(""))); },
    close: () => { if (open) { open = false; controller.close(); } },
  };
}

interface TimerEntry { readonly delayMs: number; readonly run: () => void; state: "armed" | "fired" | "canceled" }

/** The scheduler port with manual firing. `auto` fires matching entries on the next microtask. */
export function manualScheduler(optional: { auto?: (entry: { delayMs: number }) => boolean } = {}) {
  const entries: TimerEntry[] = [];
  let dropped = false;
  const fire = (entry: TimerEntry) => {
    if (dropped || entry.state !== "armed") return;
    entry.state = "fired";
    entry.run();
  };
  const scheduler: SupervisorScheduler = {
    schedule({ delayMs, run }) {
      const entry: TimerEntry = { delayMs, run, state: "armed" };
      entries.push(entry);
      if (optional.auto?.(entry)) queueMicrotask(() => fire(entry));
      return () => { if (entry.state === "armed") entry.state = "canceled"; };
    },
  };
  return {
    scheduler,
    armed: () => entries.filter((entry) => entry.state === "armed"),
    fireWhere(match: (entry: { delayMs: number }) => boolean) {
      const entry = entries.find((candidate) => candidate.state === "armed" && match(candidate));
      if (!entry) throw new Error("no armed scheduler entry matches");
      fire(entry);
    },
    fireAll() { for (const entry of [...entries]) fire(entry); },
    /** Process death: callbacks registered so far, and later ones, never run. */
    drop() { dropped = true; },
  };
}

interface GlobalTimer { readonly run: () => void; readonly delayMs: number; unrefs: number; state: "armed" | "cleared" }

/** Replaces the global `setTimeout`/`clearTimeout` for one test and records every handle, so a
 * test can count pending global timers, count `unref()` calls and fire a captured callback. */
export function captureGlobalTimers(t: TestContext) {
  const handles: GlobalTimer[] = [];
  const realClear = globalThis.clearTimeout;
  t.mock.method(globalThis, "setTimeout", ((run: () => void, delayMs = 0) => {
    const handle: GlobalTimer & { unref(): unknown } = { run, delayMs, unrefs: 0, state: "armed", unref() { handle.unrefs += 1; return handle; } };
    handles.push(handle);
    return handle;
  }) as unknown as typeof setTimeout);
  t.mock.method(globalThis, "clearTimeout", ((handle: unknown) => {
    const mine = handles.find((candidate) => candidate === handle);
    if (mine) mine.state = "cleared";
    else realClear(handle as Parameters<typeof clearTimeout>[0]);
  }) as typeof clearTimeout);
  return { handles, armed: () => handles.filter((handle) => handle.state === "armed") };
}

export interface LedgerCall { readonly op: "checkpoint" | "settle"; readonly runId: string; readonly content: string; readonly status?: string }

/** A ledger with no durable store: the finalizer's no-recovery arm. Records each write in order;
 * `onCheckpoint` / `onSettle` let a test hold or reject a single call. */
export function recordingLedger() {
  const calls: LedgerCall[] = [];
  const hooks: { onCheckpoint?: (call: number) => Promise<boolean> | undefined; onSettle?: (call: number) => Promise<boolean> | undefined } = {};
  let checkpoints = 0;
  let settles = 0;
  const ledger = {
    durable: undefined,
    checkpoint: async (input: { runId: string; content: string }) => {
      calls.push({ op: "checkpoint", runId: input.runId, content: input.content });
      return await hooks.onCheckpoint?.(++checkpoints) ?? true;
    },
    settle: async (input: { runId: string; content: string; status: string }) => {
      calls.push({ op: "settle", runId: input.runId, content: input.content, status: input.status });
      return await hooks.onSettle?.(++settles) ?? true;
    },
    reconcileInterrupted: async () => 0,
    hasActiveRuns: async () => false,
    unlessSettled: async () => ({ written: false as const }),
  } as unknown as ChatRunLedger;
  return { ledger, calls, hooks };
}

export function runningMessage(runId = "run-1", optional: Partial<ChatMessage> = {}): ChatMessage {
  return { id: "answer", role: "assistant", content: "", events: [], runId, runStatus: "running", ...optional };
}
