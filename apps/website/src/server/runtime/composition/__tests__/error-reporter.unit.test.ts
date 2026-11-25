import assert from "node:assert/strict";
import test from "node:test";
import { createNoopObservabilityPort, type ErrorReport, type OperationTracker } from "@jini-ai/core/contracts/observability";
import type { Tracker, TrackerErrorContext } from "@jini-ai/core/contracts/site/diagnostics-observability";
import { createTracker } from "@jini-ai/diagnostics/observability/node";
import { createTovuErrorReporter, trackerReportPort } from "../error-reporter.js";

// Public key ID stays visible by policy; only the tail after the dot is the secret the Tovu shape blanks.
const TOVU_KEY_SECRET = "Zq9Xw8Vu7Ts6Rq5Po4Nm3Lk2";
const TOVU_KEY = `tovu_ak_0123456789ab.${TOVU_KEY_SECRET}`;
const CANARY = "canary-secret";
const VERSIONS = { app: "1.2.3", jini: "0.7.3" };
const CLOCK = { nowMs: () => Date.UTC(2026, 10, 25) };

/** Everything an error carries that a provider SDK could serialize: own props (enumerable or not), cause, name. */
function errorDump(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  const own = Object.fromEntries(Object.getOwnPropertyNames(value).map(key => [key, (value as unknown as Record<string, unknown>)[key]]));
  return { ...own, name: value.name, message: value.message, stack: value.stack, cause: errorDump(value.cause) };
}

/** A provider below the real Jini tracker facade: the actual site-provider payload, not a mock of the tracker. */
function recordingProvider(): { reports: ErrorReport[]; tracker: Tracker; dump: () => string } {
  const reports: ErrorReport[] = [];
  const port = { ...createNoopObservabilityPort({}), reportError: (report: ErrorReport) => { reports.push(report); } };
  const tracker = createTracker({ observability: port });
  return { reports, tracker, dump: () => JSON.stringify(reports.map(report => ({ ...report, error: errorDump(report.error) }))) };
}

function recordingLogger(): { calls: unknown[]; logger: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void } } {
  const calls: unknown[] = [];
  return { calls, logger: { warn: (...args) => { calls.push(["warn", ...args]); }, error: (...args) => { calls.push(["error", ...args]); } } };
}

function recordingTracker(): { calls: Array<{ error: Error; context: TrackerErrorContext | undefined }>; tracker: Pick<Tracker, "error"> } {
  const calls: Array<{ error: Error; context: TrackerErrorContext | undefined }> = [];
  return { calls, tracker: { error: ({ error }, options) => { calls.push({ error, context: options?.context }); } } };
}

const OPERATION_TRACKER: OperationTracker = { end: () => {}, run: <T>(work: () => T): T => work() };

test("record with exactSecrets ['canary-secret'] never reaches the provider", () => {
  const provider = recordingProvider();
  const host = recordingLogger();
  const reporter = createTovuErrorReporter({ logger: host.logger, tracker: provider.tracker, clock: CLOCK, versions: VERSIONS });
  const error = new Error(`upstream rejected ${CANARY}`);
  error.stack = `${error.stack}\n    at handler (${CANARY}.js:1:1)`;
  assert.ok(error.message.includes(CANARY) && error.stack.includes(CANARY), "precondition: message and stack carry the canary");

  const { errorId } = reporter.record({ error, step: "Run nightly job", operation: "job.nightly" }, { exactSecrets: [CANARY] });

  assert.equal(provider.reports.length, 1);
  const sent = provider.reports[0]!;
  assert.ok(sent.error instanceof Error);
  assert.ok(!sent.error.message.includes(CANARY), "message redacted");
  assert.ok(!(sent.error.stack ?? "").includes(CANARY), "stack redacted");
  assert.ok(!provider.dump().includes(CANARY), "canary absent from everything the provider received");
  assert.ok(!("exactSecrets" in sent.context), "the private redaction input is never forwarded");
  assert.equal(sent.context.attributes?.incidentId, errorId);
  assert.ok(!JSON.stringify(host.calls).includes(CANARY), "host record lacks the canary");
});

test("a Tovu key in message, stack, attribute, custom field and cause never reaches the provider", () => {
  const provider = recordingProvider();
  const port = trackerReportPort({ tracker: provider.tracker });
  const cause = new Error(`inner ${TOVU_KEY}`);
  const error = Object.assign(new Error(`request with ${TOVU_KEY} failed`, { cause }), { detail: TOVU_KEY, requestBody: { key: TOVU_KEY } });
  error.stack = `${error.stack}\n    at sign (${TOVU_KEY}:2:2)`;

  const accepted = port.reportError({ error, context: { operation: "admin.keys", level: "error", incidentId: "ERR-AAAA-BBBB-CCCC-DDDD", label: "Error",
    attributes: { query: `key=${TOVU_KEY}`, route: "/admin/keys", attempt: 2 }, trace: { traceId: "t1", spanId: "s1" } } });

  assert.equal(accepted, true);
  assert.equal(provider.reports.length, 1);
  const sent = provider.reports[0]!;
  const sentError = sent.error as Error;
  assert.ok(!provider.dump().includes(TOVU_KEY_SECRET), "Tovu key secret absent at the provider");
  assert.equal(sentError.cause, undefined, "no raw cause crosses");
  assert.deepEqual(Object.keys(sentError), [], "no enumerable custom fields cross");
  assert.ok(sentError.message.includes("tovu_ak_0123456789ab."), "public key ID stays visible for debugging");
  assert.deepEqual(sent.context.attributes, { route: "/admin/keys", attempt: 2, incidentId: "ERR-AAAA-BBBB-CCCC-DDDD", errorLabel: "Error", traceId: "t1", spanId: "s1" });
});

test("an attribute carrying an exact secret is dropped and the secret list itself never crosses", () => {
  const recorded = recordingTracker();
  const port = trackerReportPort({ tracker: recorded.tracker });
  port.reportError({ error: new Error("plain"), context: { operation: "job.x", attributes: { header: `Bearer ${CANARY}`, kind: "sync" }, exactSecrets: [CANARY] } });
  assert.equal(recorded.calls.length, 1);
  assert.deepEqual(recorded.calls[0]!.context, { operation: "job.x", attributes: { kind: "sync" } });
  assert.ok(!JSON.stringify(recorded.calls[0]!.context).includes(CANARY));
});

test("one incident writes one host record and one tracker report with the same ERR- id as describe's requestId", () => {
  const provider = recordingProvider();
  const host = recordingLogger();
  const reporter = createTovuErrorReporter({ logger: host.logger, tracker: provider.tracker, clock: CLOCK, versions: VERSIONS });

  const described = reporter.describe({ error: new Error("boom"), step: "Save settings", scope: "admin", fallback: { message: "Settings could not be saved.", action: "Try again." },
    operation: "admin.settings.save", tracker: OPERATION_TRACKER }, { audience: "signed-in" });

  assert.equal(described.kind, "incident");
  const id = described.error.requestId;
  assert.match(id ?? "", /^ERR-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(host.calls.length, 1);
  assert.equal((host.calls[0] as [string, unknown, { meta: { errorId: string } }])[2].meta.errorId, id);
  assert.equal(provider.reports.length, 1);
  assert.equal(provider.reports[0]!.context.attributes?.incidentId, id);
});

test("a throwing tracker never replaces the failure: record still returns the id", () => {
  const host = recordingLogger();
  const tracker: Pick<Tracker, "error"> = { error: () => { throw new Error("provider down"); } };
  assert.equal(trackerReportPort({ tracker }).reportError({ error: new Error("x"), context: { operation: "job.y" } }), false);
  const reporter = createTovuErrorReporter({ logger: host.logger, tracker, clock: CLOCK, versions: VERSIONS });
  const { errorId } = reporter.record({ error: new Error("job failed"), step: "Run job", operation: "job.y" });
  assert.match(errorId, /^ERR-/);
  assert.equal(host.calls.length, 1, "the host record is still written");
});
