/**
 * @file `GlueHostPort` — the seam every host-specific concern (persistence, admin surface,
 * permissions) is reached through (ADR-057 Decision 6).
 *
 * Purpose:
 * This interface is the entire boundary between the product-neutral glue mechanism (`manifest.ts`,
 * `capability-gate.ts`, and this file) and whatever concrete host wires it up. No file in this
 * directory may reach a host mechanism any other way — not by importing a host module directly,
 * not by reading a host-specific config value, not by assuming a particular database or admin
 * shell exists. A future port-implementing host supplies one object satisfying this shape; that is
 * the entire integration surface.
 *
 * This is why a later move of this directory to a different host is "copy the directory, write one
 * new adapter satisfying this interface" rather than a rewrite: every method here names a
 * capability the mechanism needs, not a concrete subsystem it depends on.
 *
 * Three of the nine methods below (`registerAdminNav`, `contributeRender`, `registerHttpRoute`)
 * correspond to the three call sites that are schema-valid but dispatch-unwired in v1
 * (`resolveCallSiteDispatch()` in `./manifest`). Their signatures are real and stable now — wiring
 * one later means a host's adapter implementation stops throwing and starts doing real work,
 * never a signature change here.
 *
 * Excluded from CIC designation (ADR-057's own note): this interface is pure delegation with no
 * internal logic — no implementation lives in this file, only the contract shape.
 *
 * Architectural role:
 * Design-frozen contract for the extension-glue-tier work (ADR-057, Implementation Outline slice
 * 1). No implementation is provided here — the one real adapter is later, out-of-slice work.
 */
import type { GlueCallSite, GlueCapability } from "./manifest.js";

/** One glue-module-declared field, in the same four-JSON-primitive-type shape the sibling
 * mechanism's own field declarations use. Kept local (not imported) for the same
 * zero-host-dependency reason `manifest.ts`'s capability/call-site literals are re-declared rather
 * than imported. */
export interface GlueFieldDecl {
  readonly path: string;
  readonly type: "string" | "integer" | "number" | "boolean";
}

/** A content-lifecycle filter's signature — structurally identical to the sibling mechanism's own
 * before-save filter contract (same entry/patch shape), declared independently here so this port
 * has no import from that mechanism. */
export type GlueContentLifecycleFilter = (
  entry: Readonly<Record<string, unknown>>,
  ctx: { readonly moduleId: string; readonly workspaceId: string }
) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;

/** One tool registration a glue module contributes, merged in after the host's own core tool list
 * is fully assembled (ADR-057 Decision 4 — fail-isolated, never inside the host's own fail-fast
 * registration pass). */
export interface GlueToolRegistration {
  readonly toolId: string;
  readonly handler: (...args: readonly unknown[]) => unknown;
}

/** An owner- or system-attributed state transition, routed through the same change-set gateway
 * every other mutation in the host already uses (ADR-057 Decision 5 — no new mutation-safety
 * mechanism). Left as an opaque command value: the gateway's own contract, not this port's, owns
 * its shape. */
export type GlueChangeSetCommand = unknown;

export interface GlueHostPort {
  /** Attaches a glue module's content-lifecycle filter to the `content.entry.beforeSave` call
   * site. WIRED in v1. */
  attachContentLifecycleFilter(
    moduleId: string,
    filter: GlueContentLifecycleFilter,
    declaredFields: readonly GlueFieldDecl[]
  ): void;

  /** Merges a glue module's tool registrations onto the host's already-assembled core tool list.
   * WIRED in v1; fail-isolated per module (ADR-057 Decision 4 — a throwing or duplicate-id
   * registration drops and quarantines only that module, never the host's own registration pass). */
  registerTools(moduleId: string, registrations: readonly GlueToolRegistration[]): void;

  /** Subscribes a glue module's handler to one async "this happened" event. WIRED in v1; contained
   * by the host's existing outbox retry/dead-letter semantics — no new mechanism. */
  subscribeEvent(moduleId: string, eventName: string, handler: (payload: unknown) => Promise<void> | void): void;

  /** Registers a nav entry routing to a server-rendered page. UNWIRED in v1 — the one real host
   * adapter throws for this method until this call site is wired; the signature itself does not
   * change when it is. */
  registerAdminNav(moduleId: string, payload: Readonly<Record<string, unknown>>): void;

  /** Contributes server-rendered data to a rendering region. UNWIRED in v1 — same status as
   * `registerAdminNav` above. */
  contributeRender(moduleId: string, payload: Readonly<Record<string, unknown>>): void;

  /** Registers a capability-gated HTTP route. UNWIRED in v1 — same status as `registerAdminNav`
   * above. */
  registerHttpRoute(moduleId: string, payload: Readonly<Record<string, unknown>>): void;

  /** Runs one control-loop state transition (propose/approve/revert/quarantine) through the host's
   * existing change-set gateway. */
  runChangeSet(command: GlueChangeSetCommand): Promise<unknown>;

  /** Persists a glue module's prior file content, content-addressed, before a new-content write is
   * issued (ADR-057 CIC-4's required ordering — this method must be awaited and confirmed durable
   * before the corresponding write proceeds; enforcing that ordering is the later control-loop
   * slice's job, not this port's). */
  snapshotBlob(content: Uint8Array | string): Promise<{ readonly hash: string }>;

  /** Restores previously snapshotted content by its content hash. */
  restoreBlob(hash: string): Promise<Uint8Array>;
}

/** Re-exported for callers that want the port's shape alongside the vocabulary it's parameterized
 * over, without a second import line. */
export type { GlueCallSite, GlueCapability };
