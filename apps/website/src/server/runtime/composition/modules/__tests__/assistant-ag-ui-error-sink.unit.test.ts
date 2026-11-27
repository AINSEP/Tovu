import assert from "node:assert/strict";
import test from "node:test";
import { createAssistantAgUiModule } from "../assistant-ag-ui.js";
import { createTovuErrorReporter } from "../../error-reporter.js";

/**
 * @file Codex FIX 13: the AG-UI route's last-resort catch goes through the ONE composed incident path
 * (the P4 reporter bound at the host seam), never console or a raw tracker call. Witness: a thrown
 * error carrying a secret in its message, its `cause` and an own field reaches neither the host record
 * nor the tracker, the browser gets only the generic stream error, and one incident id is minted.
 */

const TOVU_KEY_SECRET = "Zq9Xw8Vu7Ts6Rq5Po4Nm3Lk2";
const TOVU_KEY = `tovu_ak_0123456789ab.${TOVU_KEY_SECRET}`;
const CAUSE_SECRET = "cause-secret-Hh7Gg6Ff5";
const FIELD_SECRET = "field-secret-Jj9Kk8Ll7";

/** Everything an error carries that a sink could serialize: own props (enumerable or not) and the cause chain. */
function dump(value: unknown): string {
  const seen = new Set<unknown>();
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v instanceof Error) {
      if (seen.has(v)) return "[seen]";
      seen.add(v);
      return { ...Object.fromEntries(Object.getOwnPropertyNames(v).map((k) => [k, (v as unknown as Record<string, unknown>)[k]])), cause: v.cause };
    }
    return v;
  });
}

function secretError(): Error {
  const error = new Error(`daemon refused key ${TOVU_KEY}`, { cause: new Error(`upstream said ${CAUSE_SECRET}`) });
  (error as Error & { requestBody?: unknown }).requestBody = { token: FIELD_SECRET };
  return error;
}

function harness() {
  const sinks = { logger: [] as unknown[], tracker: [] as unknown[], console: [] as unknown[], frames: [] as string[] };
  const tracker = { error: (...args: unknown[]) => { sinks.tracker.push(args); } };
  const reporter = createTovuErrorReporter({ logger: { warn: (...a: unknown[]) => { sinks.logger.push(a); }, error: (...a: unknown[]) => { sinks.logger.push(a); } },
    tracker, clock: { nowMs: () => 0 }, versions: { app: "1", jini: "1" } } as never);
  const handlers: Array<(...args: unknown[]) => void> = [];
  const app = { use: () => {}, post: (_path: string, handler: (...args: unknown[]) => void) => { handlers.push(handler); } };
  createAssistantAgUiModule({ tracker, workspaceId: "ws-1" } as never, { reporter }).registerRoutes!({ app } as never);
  return { sinks, handler: handlers[0]! };
}

test("an unhandled AG-UI error is one sanitized incident plus the generic stream error", async (t) => {
  const { sinks, handler } = harness();
  t.mock.method(console, "error", (...args: unknown[]) => { sinks.console.push(args); });
  const thrown = secretError();
  const req = { get body(): unknown { throw thrown; } };
  let ended!: () => void;
  const done = new Promise<void>((resolve) => { ended = resolve; });
  const res = { headersSent: true, locals: {}, write: (frame: string) => { sinks.frames.push(frame); return true; }, end: () => ended() };
  handler(req, res, () => { throw new Error("next must not be called once the stream started"); });
  await done;

  const everything = dump({ logger: sinks.logger, tracker: sinks.tracker, console: sinks.console });
  for (const secret of [TOVU_KEY_SECRET, CAUSE_SECRET, FIELD_SECRET]) assert.ok(!everything.includes(secret), `leaked ${secret}`);
  assert.equal(sinks.console.length, 0, "no raw console sink");
  assert.equal(sinks.tracker.length, 1, "exactly one tracker report");
  const [{ error: sent }] = sinks.tracker[0] as [{ error: Error }];
  assert.notEqual(sent, thrown, "the original Error is never forwarded");
  const ids = new Set(everything.match(/ERR-[A-Z0-9-]+/g) ?? []);
  assert.equal(ids.size, 1, "one incident id across the host record and the tracker");
  assert.equal(sinks.frames.length, 1);
  assert.match(sinks.frames[0]!, /RUN_ERROR/);
  assert.ok(!sinks.frames[0]!.includes(TOVU_KEY_SECRET));
});

test("an AG-UI error before the stream starts is one sanitized incident handed to the next error handler, with no stream frame", async (t) => {
  const { sinks, handler } = harness();
  t.mock.method(console, "error", (...args: unknown[]) => { sinks.console.push(args); });
  const thrown = secretError();
  const req = { get body(): unknown { throw thrown; } };
  const res = { headersSent: false, locals: {}, write: (frame: string) => { sinks.frames.push(frame); return true; },
    end: () => { throw new Error("end must not be called before the stream started"); } };
  const forwarded = await new Promise<unknown[]>((resolve) => { handler(req, res, (...args: unknown[]) => resolve(args)); });

  assert.deepEqual(forwarded, [thrown], "the error goes to the host's error middleware, unchanged");
  assert.deepEqual(sinks.frames, [], "no RUN_ERROR frame on a response that never started streaming");
  assert.equal(sinks.tracker.length, 1, "exactly one tracker report");
  const everything = dump({ logger: sinks.logger, tracker: sinks.tracker, console: sinks.console });
  for (const secret of [TOVU_KEY_SECRET, CAUSE_SECRET, FIELD_SECRET]) assert.ok(!everything.includes(secret), `leaked ${secret}`);
  assert.equal(sinks.console.length, 0, "no raw console sink");
});
