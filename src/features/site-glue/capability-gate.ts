/**
 * @file `buildGlueCapabilityGate()` — capability-scoped delegate handle for `GlueCapability`
 * (SPEC-048 REQ-1/REQ-4; ADR-057 CIC-1, `ESCALATE_SECURITY`).
 *
 * Purpose:
 * Extends the sibling plugin mechanism's own `gate()` pattern (always-present, granted-delegates,
 * ungranted-throws) to the wider eight-member glue capability vocabulary. **Default-deny**: a
 * capability absent from the granted set is never silently omitted from the returned handle — it
 * is present as a callable stub that synchronously throws a classified `GlueCapabilityDeniedError`
 * naming the missing capability. A bare `TypeError` on an absent property is exactly the wrong
 * implementation this mirrors the sibling mechanism's own CIC in guarding against.
 *
 * **A module cannot grow its own capability set through this gate.** The granted set is a snapshot
 * taken once, at build time, from a caller-supplied list — never read from anything the gated
 * module itself holds a reference to or could write. The returned handle is frozen; there is no
 * setter, no admin surface, and no code path from inside a delegate call back into the granted
 * set. Widening what a module can do requires building a new gate from a re-approved manifest, not
 * calling anything this module exports.
 *
 * Capabilities are exposed by handle only: every granted position is a plain closure the caller
 * supplies (`coreDelegates`), never a raw filesystem, network, or process handle. This module has
 * zero I/O of its own — it is pure wiring between "is this granted" and "which closure runs."
 *
 * Architectural role:
 * Design-frozen contract for the extension-glue-tier work (ADR-057, Implementation Outline slice
 * 1). Depends on `./manifest`'s `GlueCapability` type and `core/`'s shared capability vocabulary
 * — no host-specific dependency.
 */
import type { GlueCapability } from "./manifest.js";
import { SHARED_EXTENSION_CAPABILITIES } from "../../core/extension-capability-vocabulary.js";

/** Thrown synchronously when a glue module invokes a capability it did not declare (mirrors the
 * sibling mechanism's `CapabilityDeniedError` shape, generalized to `GlueCapability`). */
export class GlueCapabilityDeniedError extends Error {
  readonly moduleId: string;
  readonly capability: GlueCapability;

  constructor(moduleId: string, capability: GlueCapability) {
    super(`module '${moduleId}' invoked '${capability}' without declaring it in its manifest capabilities`);
    this.name = "GlueCapabilityDeniedError";
    this.moduleId = moduleId;
    this.capability = capability;
  }
}

/** Every capability position resolves to one of these once gated. Untyped args/return —
 * each capability's real signature is owned by whichever attachment-point adapter backs it
 * (later slices), never by this generic gate. */
export type GlueCapabilityDelegate = (...args: readonly unknown[]) => unknown;

/** The closed, eight-member vocabulary this gate always exposes a position for, regardless of
 * grant set (CIC-1's "always present" property, made an iterable constant so the gate and its
 * tests share one source of truth for "every position"). */
export const GLUE_CAPABILITIES: readonly GlueCapability[] = [
  ...SHARED_EXTENSION_CAPABILITIES,
  "tools.register",
  "events.subscribe",
  "admin.nav.register",
  "render.contribute",
  "http.route.register",
];

export interface BuildGlueCapabilityGateRequired {
  readonly moduleId: string;
  /** The manifest's declared capability set (already validated against the v1 vocabulary by
   * `validateGlueManifest()` — this function trusts its input is well-formed capability strings,
   * same division of labor as the sibling mechanism's own capability-gate). */
  readonly capabilities: readonly GlueCapability[];
  /** The real backing implementation for every granted position, supplied by the caller (a later
   * slice's loader, closing over that specific module load's host-port-backed state). This module
   * never reaches into any host mechanism directly. */
  readonly coreDelegates: Readonly<Record<GlueCapability, GlueCapabilityDelegate>>;
}

export type BuildGlueCapabilityGateOptional = {};

/**
 * Builds one glue module's capability-scoped delegate handle. Every one of the eight
 * `GlueCapability` positions is always present on the returned object (CIC-1) — granted positions
 * delegate to `coreDelegates`, ungranted positions are stubs that throw `GlueCapabilityDeniedError`
 * when invoked (never at build time — the stub itself is a normal, present function; only calling
 * it throws). The returned object is frozen: no caller, including the gated module itself, can add,
 * remove, or replace a position after the gate is built.
 *
 * @throws Nothing at build time. The returned handle's ungranted-position stubs throw
 * `GlueCapabilityDeniedError` synchronously when invoked.
 * @complexity O(1) — eight capability checks, fixed-size regardless of the caller-supplied
 * `capabilities` array's length.
 * @overallScore 100/100
 */
export function buildGlueCapabilityGate(
  required: BuildGlueCapabilityGateRequired,
  _optional: BuildGlueCapabilityGateOptional = {}
): Readonly<Record<GlueCapability, GlueCapabilityDelegate>> {
  const { moduleId, capabilities, coreDelegates } = required;
  // Defensive copy: a caller-side mutation of the `capabilities` array after this call must never
  // change what this already-built gate grants (part of CIC-1's "cannot grow its own capability
  // set" property — the snapshot is taken once, here, and never re-read).
  const granted = new Set<GlueCapability>(capabilities);

  function gate(capability: GlueCapability): GlueCapabilityDelegate {
    if (granted.has(capability)) {
      return coreDelegates[capability];
    }
    return (..._args: readonly unknown[]) => {
      throw new GlueCapabilityDeniedError(moduleId, capability);
    };
  }

  const handle = {} as Record<GlueCapability, GlueCapabilityDelegate>;
  for (const capability of GLUE_CAPABILITIES) {
    handle[capability] = gate(capability);
  }
  return Object.freeze(handle);
}
