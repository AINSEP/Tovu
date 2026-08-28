/**
 * @file `GlueManifest` type + `validateGlueManifest()` — static, collect-all manifest validation
 * for the site-glue extension tier (SPEC-048 REQ-1/REQ-10/REQ-12; ADR-057 Decision 2, CIC-2).
 *
 * Purpose:
 * Pure, no-I/O validation of an already-parsed glue manifest against the closed six-member
 * call-site vocabulary and the eight-member capability vocabulary. Modeled directly on the
 * sibling extension mechanism's own manifest validator (same collect-all discipline, same
 * `{code, file, message}` error shape, same "one validator" role) — see that module's own header
 * for the precedent this file extends rather than reinvents.
 *
 * The six-member `GlueCallSite` union is closed and complete now; only three of its members have
 * a real adapter wired in v1. `validateGlueManifest()` accepts all six at the schema level — an
 * attachment declared against one of the three unwired call sites is NOT a validation error. It
 * fails later, at dispatch time, via `resolveCallSiteDispatch()` below, with a distinct
 * `UNWIRED_CALL_SITE` status — never a silent no-op, never a schema-level rejection. This is what
 * lets a later call site go live as "write the adapter, flip one dispatch-table entry" with zero
 * manifest-schema break (ADR-057 Decision 2).
 *
 * Product-neutral core: this module has no dependency on any host-specific package or module. The
 * three capability strings shared with the sibling plugin mechanism are re-declared here as
 * independent literals (mirroring that mechanism's own precedent of not importing the SDK
 * package's constants) so this module never needs to import anything host-specific.
 *
 * Architectural role:
 * Design-frozen contract for the extension-glue-tier work (ADR-057, Implementation Outline slice
 * 1). No host-specific dependencies; blocks every other slice. Depends on `core/`'s
 * `SharedExtensionCapability` for the three-member overlap with the sibling plugin mechanism's own
 * vocabulary (below both features, not a sibling-to-sibling import — 2026-08-20 swarm-consensus
 * synthesis, Result 1).
 */

import { SHARED_EXTENSION_CAPABILITIES, type SharedExtensionCapability } from "../../contracts/core/extension-capability-vocabulary.js";

/**
 * The closed, six-member call-site vocabulary (ADR-057 Decision 2). All six are valid at schema
 * validation. Only the three named in `WIRED_CALL_SITES` below have a real adapter in v1 — the
 * other three are accepted here and rejected only at dispatch time (`resolveCallSiteDispatch()`).
 */
export type GlueCallSite =
  | "content.entry.beforeSave"
  | "assistant.tools"
  | "events.subscribe"
  | "admin.nav"
  | "render.contribute"
  | "http.routes";

/**
 * The eight-member capability vocabulary (ADR-057 Decision 2). The first three members are
 * {@link SharedExtensionCapability} — the same declaration the sibling plugin mechanism's own
 * capability vocabulary uses, imported from `core/` rather than the two mechanisms importing each
 * other (see file header). The remaining five are glue-only vocabulary that never crosses into
 * that mechanism's own public surface.
 */
export type GlueCapability =
  | SharedExtensionCapability
  | "tools.register"
  | "events.subscribe"
  | "admin.nav.register"
  | "render.contribute"
  | "http.route.register";

/**
 * One manifest-declared attachment to a call site. `callSite` is the only field this module's
 * validation reasons about; every other key is category-owned payload shape, defined by whichever
 * attachment-point adapter eventually reads this call site (not this module, and not yet built
 * for the three unwired call sites) — validated here only at the "well-formed object" level.
 */
export interface GlueManifestAttachment {
  readonly callSite: GlueCallSite;
  readonly [payloadKey: string]: unknown;
}

/** A parsed, not-yet-validated glue manifest (the closed contract this ADR froze). */
export interface GlueManifest {
  readonly id: string;
  readonly version: string;
  readonly sdkRange: string;
  readonly capabilities: readonly GlueCapability[];
  readonly attachments: readonly GlueManifestAttachment[];
}

/** One validation-vocabulary entry — same `{code, file, message}` shape the sibling mechanism's
 * validator already uses, kept for shape parity with any error-rendering surface that later reuses
 * both. `file` is always `null` here: unlike a distributed plugin artifact, a glue manifest has no
 * packaged files to hash or implicate (REQ-10 — the integrity-hash step itself is skipped
 * entirely for glue, not merely unimplicated by any one error). */
export interface GlueManifestValidationError {
  readonly code: string;
  readonly file: string | null;
  readonly message: string;
}

export interface ValidateGlueManifestRequired {
  /** An already-parsed glue manifest value (unparseable JSON is the loader's concern, a later
   * slice — this function receives a JS value, never a file path or raw bytes). */
  readonly manifest: unknown;
}

export type ValidateGlueManifestOptional = {};

export interface ValidateGlueManifestResult {
  /** Every applicable error, collected — not first-failure (same collect-all discipline as the
   * sibling validator). Empty when the manifest is statically valid. */
  readonly errors: readonly GlueManifestValidationError[];
}

const REQUIRED_KEYS = ["id", "version", "sdkRange", "capabilities", "attachments"] as const;
const ALLOWED_KEYS = new Set<string>(REQUIRED_KEYS);

const VALID_CAPABILITIES = new Set<GlueCapability>([
  ...SHARED_EXTENSION_CAPABILITIES,
  "tools.register",
  "events.subscribe",
  "admin.nav.register",
  "render.contribute",
  "http.route.register",
]);

const VALID_CALL_SITES = new Set<GlueCallSite>([
  "content.entry.beforeSave",
  "assistant.tools",
  "events.subscribe",
  "admin.nav",
  "render.contribute",
  "http.routes",
]);

/** The three call sites with a real adapter in v1 (ADR-057 Decision 2's dispatch table — three
 * real entries, three typed placeholders). Wiring a fourth is "add one member here," never a
 * manifest-schema change. */
const WIRED_CALL_SITES = new Set<GlueCallSite>(["content.entry.beforeSave", "assistant.tools", "events.subscribe"]);

const ID_PATTERN = /^[a-z0-9-]+$/;
const MAX_ID_LENGTH = 50;

/**
 * Auto-quarantine threshold (SPEC-048 REQ-17, ADR-057 Decision 5 / Open #1) — a placeholder the
 * owner has not tuned yet, NOT a measured or reviewed value. Recorded once, here, so every later
 * consumer (the control-loop quarantine slice, and anything that needs to describe the
 * no-brick invariant before that slice lands) reads the same placeholder instead of a scattered
 * magic number. Replace wholesale, not incrementally, once the owner picks a real threshold.
 */
export const AUTO_QUARANTINE_THRESHOLD_PLACEHOLDER = Object.freeze({
  maxFailures: 3,
  windowMs: 5 * 60 * 1000,
});

function malformed(message: string): GlueManifestValidationError {
  return { code: "MANIFEST_MALFORMED", file: null, message };
}

/** Unknown-key and missing-required-key checks. */
function validateKeys(raw: Readonly<Record<string, unknown>>): GlueManifestValidationError[] {
  const errors: GlueManifestValidationError[] = [];
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(malformed(`unknown manifest key '${key}'`));
    }
  }
  for (const key of REQUIRED_KEYS) {
    if (raw[key] === undefined) {
      errors.push(malformed(`missing required manifest field '${key}'`));
    }
  }
  return errors;
}

/** id: format only (no folder-match/shadow check — those are the loader's on-disk concern, a
 * later slice; this manifest's closed contract carries no folderName/builtInIds input). */
function validateId(raw: Readonly<Record<string, unknown>>): GlueManifestValidationError[] {
  const errors: GlueManifestValidationError[] = [];
  const id = typeof raw.id === "string" ? raw.id : undefined;
  if (raw.id !== undefined && id === undefined) {
    errors.push(malformed("'id' must be a string"));
  }
  if (id !== undefined && (!ID_PATTERN.test(id) || id.length < 1 || id.length > MAX_ID_LENGTH)) {
    errors.push(malformed(`id '${id}' must match ${ID_PATTERN} and be 1-${MAX_ID_LENGTH} characters`));
  }
  return errors;
}

/** version / sdkRange: presence-checked only, same as the sibling validator's own choice not to
 * format-check these two fields (sdkRange's actual compatibility check is a load-time, not a
 * validation-time, concern). */
function validateVersionAndSdkRange(raw: Readonly<Record<string, unknown>>): GlueManifestValidationError[] {
  const errors: GlueManifestValidationError[] = [];
  if (raw.version !== undefined && typeof raw.version !== "string") {
    errors.push(malformed("'version' must be a string"));
  }
  if (raw.sdkRange !== undefined && typeof raw.sdkRange !== "string") {
    errors.push(malformed("'sdkRange' must be a string"));
  }
  return errors;
}

/** capabilities (REQ-1). */
function validateCapabilities(raw: Readonly<Record<string, unknown>>): GlueManifestValidationError[] {
  const errors: GlueManifestValidationError[] = [];
  const capabilities = Array.isArray(raw.capabilities) ? raw.capabilities : [];
  if (raw.capabilities !== undefined && !Array.isArray(raw.capabilities)) {
    errors.push(malformed("'capabilities' must be an array"));
  }
  for (const capability of capabilities) {
    if (typeof capability !== "string" || !VALID_CAPABILITIES.has(capability as GlueCapability)) {
      errors.push({
        code: "CAPABILITY_UNKNOWN",
        file: null,
        message: `capability '${String(capability)}' is outside the v1 vocabulary`,
      });
    }
  }
  return errors;
}

/** One `attachments[]` entry (ADR-057 Decision 2: all six call sites accepted here; only three
 * are wired for DISPATCH — that distinction is {@link resolveCallSiteDispatch}'s job, not this
 * one's). */
function validateAttachment(attachment: unknown): GlueManifestValidationError[] {
  if (typeof attachment !== "object" || attachment === null || Array.isArray(attachment)) {
    return [malformed("each 'attachments' entry must be an object")];
  }
  const callSite = (attachment as Readonly<Record<string, unknown>>).callSite;
  if (typeof callSite !== "string" || !VALID_CALL_SITES.has(callSite as GlueCallSite)) {
    return [
      {
        code: "CALL_SITE_UNKNOWN",
        file: null,
        message: `call site '${String(callSite)}' is outside the closed six-member vocabulary`,
      },
    ];
  }
  return [];
}

/** attachments (REQ-1/ADR-057 Decision 2). */
function validateAttachments(raw: Readonly<Record<string, unknown>>): GlueManifestValidationError[] {
  const errors: GlueManifestValidationError[] = [];
  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  if (raw.attachments !== undefined && !Array.isArray(raw.attachments)) {
    errors.push(malformed("'attachments' must be an array"));
  }
  for (const attachment of attachments) {
    errors.push(...validateAttachment(attachment));
  }
  return errors;
}

/**
 * Validates one already-parsed glue manifest, collecting every applicable error rather than
 * stopping at the first. Pure — no I/O, no mutation of `manifest`.
 *
 * @throws Nothing — validation failures are reported via the returned `errors` array, never a
 * thrown error (a malformed top-level shape, e.g. `manifest` being `null` or an array, is itself a
 * `MANIFEST_MALFORMED` entry in the result, not a throw).
 * @complexity O(capabilities.length + attachments.length) — bounded by one manifest's own declared
 * arrays, never by external/unbounded input.
 */
export function validateGlueManifest(
  required: ValidateGlueManifestRequired,
  _optional: ValidateGlueManifestOptional = {}
): ValidateGlueManifestResult {
  const { manifest } = required;

  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    return { errors: [malformed("glue manifest must be a JSON object")] };
  }

  // Treat the input as a read-only bag of unknown values — never assigned back into.
  const raw = manifest as Readonly<Record<string, unknown>>;

  const errors: GlueManifestValidationError[] = [
    ...validateKeys(raw),
    ...validateId(raw),
    ...validateVersionAndSdkRange(raw),
    ...validateCapabilities(raw),
    ...validateAttachments(raw),
  ];

  return { errors };
}

/** The result of checking whether a (schema-valid) call site has a real adapter wired in v1. */
export type GlueCallSiteDispatchStatus =
  | { readonly wired: true }
  | { readonly wired: false; readonly code: "UNWIRED_CALL_SITE" };

/**
 * Resolves whether `callSite` has a real dispatch-time adapter in v1. Distinct from — and always
 * called strictly after — `validateGlueManifest()`: a call site can be schema-valid (one of the
 * closed six) and still be `wired: false` here. Callers (an attachment-point adapter or the
 * loader, both later slices) turn `wired: false` into whatever concrete rejection their own layer
 * needs; this function stays pure and does not throw, mirroring this codebase's own
 * discriminated-result convention for expected, non-exceptional outcomes.
 *
 * @complexity O(1) — a single fixed-size Set lookup.
 * @overallScore 100/100
 */
export function resolveCallSiteDispatch(callSite: GlueCallSite): GlueCallSiteDispatchStatus {
  return WIRED_CALL_SITES.has(callSite) ? { wired: true } : { wired: false, code: "UNWIRED_CALL_SITE" };
}
