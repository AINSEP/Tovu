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

/** The composed reporter over recording sinks: `records` are its host-log calls, `reports` its tracker calls. */
export function recordingComposedReporter(_optional: Record<string, never> = {}) {
  const records: unknown[][] = [];
  const reports: Array<[{ error: Error }, unknown]> = [];
  const reporter = createTovuErrorReporter({ logger: { warn: (...a: unknown[]) => { records.push(a); }, error: (...a: unknown[]) => { records.push(a); } },
    tracker: { error: (...a: unknown[]) => { reports.push(a as never); } }, clock: { nowMs: () => 0 }, versions: { app: "1", jini: "1" } } as never);
  return { reporter, records, reports };
}

/** For a mapping whose input is a typed refusal: recording an incident at all is the failure. The
 * reporter-breach arm absorbs this throw into the fixed unavailable ID, so the caller's exact 4xx body
 * assertion is what goes red; the throw only keeps a stray record out of any sink. */
export const NO_INCIDENT_REPORTER = { record: (): never => assert.fail("a typed refusal is not a server incident") };

/** The host-record twin of `assertAdminDiagnostics`: one record per expected diagnostic, each under the
 * operation as its step, an ERR id, and the redacted diagnostic. */
export function assertReporterDiagnostics({ records, operation, diagnostics }: { records: readonly unknown[][]; operation: string; diagnostics: readonly RegExp[] }, _optional: Record<string, never> = {}): void {
  assert.equal(records.length, diagnostics.length);
  records.forEach((record, index) => {
    const meta = (record[1] as { meta: { errorId: string; step: string; diagnostic: string } }).meta;
    assert.match(meta.errorId, /^ERR-(?:[0-9A-F]{4}-){3}[0-9A-F]{4}$/);
    assert.equal(meta.step, operation);
    assert.match(meta.diagnostic, diagnostics[index]!);
  });
}

/** Build the composed reporter over recording sinks; console.error is captured for the test's duration. */
export function composedReporterProbe({ t }: { t: TestContext }, _optional: Record<string, never> = {}): ComposedReporterProbe {
  const { reporter, records, reports } = recordingComposedReporter();
  const consoleLines: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { consoleLines.push(args); });
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
