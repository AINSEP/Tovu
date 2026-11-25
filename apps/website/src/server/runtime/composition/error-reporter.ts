/**
 * @file Tovu's binding of Jini's one incident path (`createErrorReporter`): Tovu's error-ID minter,
 * Tovu's redaction policy, and the adapter that turns core's `ErrorReport` into a `Tracker.error`
 * call a third-party provider may see.
 *
 * Why the adapter redacts, not core: core hands the ORIGINAL error to `observability.reportError`
 * (with the incident's exact secrets on `context.exactSecrets`), because only the host knows its own
 * secret shapes (`tovu_ak_…`). So `trackerReportPort` is the last point before data leaves the
 * process: it consumes the exact secrets, redacts, and forwards a clean, bounded view only.
 */
import { randomBytes } from "node:crypto";
import type { ErrorReport, ObservabilityPort, OperationAttributes } from "@jini-ai/core/contracts/observability";
import type { Tracker, TrackerErrorContext } from "@jini-ai/core/contracts/site/diagnostics-observability";
import { createErrorCatalog } from "@jini-ai/core/errors/catalog";
import { mintToolErrorId } from "@jini-ai/core/errors/error-id";
import { createErrorReporter, type ErrorReporter } from "@jini-ai/core/errors/reporter";
import type { Clock, Logger } from "@jini-ai/core/primitives";
import { redactedTovuError } from "@tovu/contracts/diagnostics-redaction";
import { redactSecretShapes, TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";

export interface TovuErrorReporterPorts {
  readonly logger: Pick<Logger, "warn" | "error">;
  /** The site-scoped tracker; a multi-site daemon passes each site's own, never a shared one. */
  readonly tracker: Pick<Tracker, "error">;
  readonly clock: Clock;
  /** From `build-constants.ts`, resolved once at host startup. */
  readonly versions: { readonly app: string; readonly jini: string };
}

/** Provider dimensions are bounded so an attribute cannot smuggle a whole payload out. */
const MAX_ATTRIBUTES = 32;
const MAX_ATTRIBUTE_TEXT = 256;
const DEFAULT_OPERATION = "application.error";

/**
 * True when `text` is fit to leave the process verbatim: short, free of every exact secret, and
 * untouched by Tovu's secret-shape rules. Why drop rather than redact: attributes are dimensions a
 * provider indexes, and a half-blanked value is still an unbounded, user-derived dimension.
 */
function exportable({ text, secrets }: { text: string; secrets: readonly string[] }): boolean {
  if (text.length > MAX_ATTRIBUTE_TEXT) return false;
  if (secrets.some(secret => text.includes(secret))) return false;
  return redactSecretShapes({ text }).redactions === 0;
}

/**
 * Caller attributes that pass {@link exportable} (keys and string values), then the incident's own
 * fixed fields last, so a caller attribute can never spoof the incident ID.
 */
function boundedAttributes({ context, secrets }: { context: Omit<ErrorReport["context"], "exactSecrets">; secrets: readonly string[] }): OperationAttributes {
  const accepted = Object.entries(context.attributes ?? {})
    .filter(([key, value]) => exportable({ text: key, secrets }) && (typeof value === "number" || exportable({ text: value, secrets })))
    .slice(0, MAX_ATTRIBUTES);
  const fixed: Array<[string, string | undefined]> = [
    ["incidentId", context.incidentId], ["errorLabel", context.label], ["traceId", context.trace?.traceId], ["spanId", context.trace?.spanId],
  ];
  const own = fixed.filter((entry): entry is [string, string] => typeof entry[1] === "string" && exportable({ text: entry[1], secrets }));
  return Object.fromEntries([...accepted, ...own]);
}

/**
 * A fresh `Error` holding only the redacted name, message and stack. Why a copy even when nothing was
 * redacted: provider SDKs serialize `cause` chains and enumerable own fields (a request body, a
 * header bag), none of which went through redaction; `redactedError` returns the original object
 * unchanged when message and stack were clean.
 */
function cleanErrorView({ error, secrets }: { error: Error; secrets: readonly string[] }): Error {
  const view = new Error(error.message);
  // Non-enumerable like `Error.prototype.name`, so the view carries no own enumerable field at all.
  Object.defineProperty(view, "name", { value: exportable({ text: error.name, secrets }) ? error.name : "Error", writable: true, configurable: true, enumerable: false });
  if (error.stack === undefined) delete view.stack;
  else view.stack = error.stack;
  return view;
}

function forwardReport({ tracker, report }: { tracker: Pick<Tracker, "error">; report: ErrorReport }): boolean {
  try {
    // Consumed first and kept local: the exact secrets are redaction input, never a forwarded field.
    const { exactSecrets, ...context } = report.context;
    const secrets = (exactSecrets ?? []).filter(secret => typeof secret === "string" && secret.length > 0);
    const error = cleanErrorView({ error: redactedTovuError({ error: report.error }, { exactSecrets: secrets }), secrets });
    const attributes = boundedAttributes({ context, secrets });
    const operation = exportable({ text: context.operation, secrets }) ? context.operation : DEFAULT_OPERATION;
    const forwarded: TrackerErrorContext = {
      operation, ...(context.level === undefined ? {} : { level: context.level }), ...(Object.keys(attributes).length === 0 ? {} : { attributes }),
    };
    tracker.error({ error }, { context: forwarded });
    return true;
  } catch {
    // The reporter already wrote the host record; a provider failure must not replace the incident.
    return false;
  }
}

/**
 * Core's `ObservabilityPort.reportError` over a Tovu tracker. Never throws; false when the tracker
 * refused or failed.
 * @complexity O(message + stack + attribute text) per report.
 */
export function trackerReportPort({ tracker }: { tracker: Pick<Tracker, "error"> }, _optional: Record<string, never> = {}): Pick<ObservabilityPort, "reportError"> {
  return { reportError: (report) => forwardReport({ tracker, report }) };
}

/**
 * The site's error reporter. Its catalog carries empty `admin`, `http` and `ipc` scopes because the
 * host already owns its refusals at those boundaries (C115 disk-space, auth); every other value the
 * reporter sees is an incident.
 * @complexity O(1) to build; see `createErrorReporter` per call.
 */
export function createTovuErrorReporter(required: TovuErrorReporterPorts, _optional: Record<string, never> = {}): ErrorReporter {
  const { logger, tracker, clock, versions } = required;
  const catalog = createErrorCatalog({ sentences: [], scopes: [{ scope: "admin", bindings: [] }, { scope: "http", bindings: [] }, { scope: "ipc", bindings: [] }] });
  const ids = { newId: () => mintToolErrorId({ randomHex: ({ bytes }) => randomBytes(bytes).toString("hex") }) };
  return createErrorReporter(
    { ids, clock, logger, observability: trackerReportPort({ tracker }), catalog, versions },
    { redaction: TOVU_ERROR_REDACTION_OPTIONS },
  );
}
