/**
 * @file Codex FIX 4 test probe: the site's composed error reporter over recording sinks, plus the one
 * assertion every bound failure site shares (one incident id, one host record, one tracker report, no
 * secret from the message, the `cause` or an own field, and never the original Error forwarded).
 * Pattern from `inbound/public-http/routes/__tests__/mail-feedback.unit.test.ts`.
 */
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { createTovuErrorReporter } from "../../runtime/composition/error-reporter.js";

const KEY = "tovu_ak_0123456789ab.Zq9Xw8Vu7Ts6Rq5Po4Nm3Lk2";
const SECRETS = ["Zq9Xw8Vu7Ts6Rq5Po4Nm3Lk2", "cause-secret-Hh7Gg6Ff5", "field-secret-Jj9Kk8Ll7"] as const;

/** A thrown error carrying a secret in its message, its `cause` and an own field. */
export function secretBearingError(_optional: Record<string, never> = {}): Error {
  return Object.assign(new Error(`store failed near ${KEY}`, { cause: new Error(`db said ${SECRETS[1]}`) }), { requestBody: { token: SECRETS[2] } });
}

export interface ComposedReporterProbe {
  reporter: ReturnType<typeof createTovuErrorReporter>;
  /** Assert the shared invariant for one failure whose reply carried `errorId`. */
  /** Assert the shared invariant for one failure. `errorId` is the reply's id; omit it for a site whose reply carries none. */
  assertOneIncident(args: { errorId?: string; thrown: Error }, optional?: { reports?: number }): void;
}

/** Build the composed reporter over recording sinks; console.error is captured for the test's duration. */
export function composedReporterProbe({ t }: { t: TestContext }, _optional: Record<string, never> = {}): ComposedReporterProbe {
  const records: unknown[][] = [];
  const reports: Array<[{ error: Error }, unknown]> = [];
  const consoleLines: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { consoleLines.push(args); });
  const reporter = createTovuErrorReporter({ logger: { warn: (...a: unknown[]) => { records.push(a); }, error: (...a: unknown[]) => { records.push(a); } },
    tracker: { error: (...a: unknown[]) => { reports.push(a as never); } }, clock: { nowMs: () => 0 }, versions: { app: "1", jini: "1" } } as never);
  const serialize = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => x instanceof Error ? { ...Object.fromEntries(Object.getOwnPropertyNames(x).map((k) => [k, (x as never)[k]])), cause: x.cause } : x);
  return {
    reporter,
    assertOneIncident({ errorId: replyId, thrown }, { reports: expectedReports = 1 } = {}) {
      const errorId = replyId ?? serialize(records).match(/ERR-[A-Z0-9-]+/)?.[0];
      assert.match(String(errorId), /^ERR-/, "the reply carries the reporter's incident id");
      assert.equal(records.length, 1, "one host record");
      assert.equal(reports.length, expectedReports, "one tracker report");
      assert.ok(!serialize(consoleLines).includes(String(errorId)), "no legacy console sink line for this incident");
      for (const [report] of reports) assert.notEqual(report.error, thrown, "the original Error is never forwarded");
      const everything = serialize({ records, reports });
      assert.ok(everything.includes(String(errorId)), "the host record carries the reply's id");
      assert.equal(new Set(everything.match(/ERR-[A-Z0-9-]+/g) ?? []).size, 1, "one incident id");
      for (const secret of SECRETS) assert.ok(!everything.includes(secret), `leaked ${secret}`);
    },
  };
}
