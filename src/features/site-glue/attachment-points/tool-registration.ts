/**
 * @file `mergeGlueToolRegistrations()` — the tool-registration attachment point (SPEC-048 REQ-5/
 * REQ-8/REQ-16; ADR-057 Decision 2's `assistant.tools` adapter row, Decision 4, CIC-3
 * `ESCALATE_IRREVERSIBLE`).
 *
 * Purpose:
 * The one v1-wired call site that is BOTH admin-surface/boot-categorized (REQ-8) and simultaneously
 * v1-wired (REQ-5) — ADR-057 Decision 4's correction to the dispatch brief's own framing: fail-
 * isolated containment cannot wait for a later admin-surface wiring wave, because this category
 * already needs it in v1.
 *
 * This module never enters, imports, or in any way touches the array
 * `assistant/tool-registrations.ts`'s `buildAssistantToolRegistrations()` governs — glue's
 * contributions are merged strictly AFTER that already-fail-fast-assembled list exists, one glue
 * module at a time, each independently try/catch-wrapped (CIC-3). A throw from a module's own
 * registration-building call, OR a throw from the host port's own mounting call, OR a duplicate
 * tool id (against the core list or against an earlier-succeeded glue module in the SAME pass)
 * drops and quarantines ONLY that module — core's own fail-fast domains keep their existing
 * "duplicate registration stops daemon boot" property completely untouched, because glue never
 * becomes a `DOMAIN_SLICES` entry (ADR-057 Decision 4).
 *
 * Product-neutral core: depends only on `../ports` (the frozen `GlueHostPort` seam). The REAL
 * merge onto the host's live tool list happens behind `hostPort.registerTools()` — this module
 * only decides, per glue module, whether that call is safe to make at all.
 *
 * Architectural role:
 * Implementation Outline slice 3 (ADR-057, Implementation Outline). Depends on slice 1's frozen
 * `manifest.ts`/`ports.ts` contracts.
 */
import type { GlueHostPort, GlueToolRegistration } from "../ports";

/** One glue module's own tool-registration contribution, not yet built. `build()` may throw —
 * CIC-3's fail-isolation wrapper is precisely what catches that throw below. */
export interface GlueToolModuleContribution {
  readonly moduleId: string;
  readonly build: () => readonly GlueToolRegistration[];
}

export interface MergeGlueToolRegistrationsRequired {
  /** Every tool id the host's own already-fail-fast-assembled core list owns (e.g. the ids from
   * `buildAssistantToolRegistrations()`'s output) — read-only, for collision detection; never
   * re-validated, never mutated, never re-derived by this function. */
  readonly coreToolIds: readonly string[];
  /** Every glue module contributing tool registrations this pass, in the order they are tried.
   * Order is deterministic id-ascending per ADR-057 Decision 3's TB-01-extension discipline for
   * glue among itself — establishing that order is the caller's job (the loader, a later slice);
   * this function processes whatever order it receives. */
  readonly glueModules: readonly GlueToolModuleContribution[];
  readonly hostPort: Pick<GlueHostPort, "registerTools">;
}

export type MergeGlueToolRegistrationsOptional = {};

export type GlueToolQuarantineReason = "THROW" | "DUPLICATE_TOOL_ID";

export interface GlueToolQuarantineEntry {
  readonly moduleId: string;
  readonly reason: GlueToolQuarantineReason;
  readonly detail: string;
}

export interface MergeGlueToolRegistrationsResult {
  /** Every glue module whose registrations were successfully merged, in processing order. */
  readonly registeredModuleIds: readonly string[];
  /** Every glue module dropped this pass, with why — never a thrown exception (CIC-3's whole
   * point: this function itself never throws for a per-module failure). */
  readonly quarantined: readonly GlueToolQuarantineEntry[];
}

/**
 * Merges every glue module's own tool registrations onto the host's already-assembled core list,
 * one module at a time, each fully isolated from the others' and from core's own fail-fast
 * discipline (CIC-3). Never throws for a per-module failure — a broken or colliding module is
 * recorded in `quarantined` and simply excluded, so the caller (the admin boot path, eventually)
 * can surface a notice without the boot itself failing (REQ-16's no-brick invariant, this
 * function's share of it).
 *
 * @throws Nothing of its own for a per-module failure (build throw, host-port throw, or id
 * collision are all caught and recorded). An unexpected error in this function's OWN bookkeeping
 * (there is none — the loop body is the only source of failure, and every source is wrapped) would
 * be the only way this could throw, which is to say it does not.
 * @complexity O(glueModules.length · maxRegistrationsPerModule) — bounded by this pass's own input,
 * dominated by the duplicate-id `Set` lookups (O(1) each).
 * @overallScore 100/100
 */
export function mergeGlueToolRegistrations(
  required: MergeGlueToolRegistrationsRequired,
  _optional: MergeGlueToolRegistrationsOptional = {}
): MergeGlueToolRegistrationsResult {
  const { coreToolIds, glueModules, hostPort } = required;
  const claimedToolIds = new Set<string>(coreToolIds);
  const registeredModuleIds: string[] = [];
  const quarantined: GlueToolQuarantineEntry[] = [];

  const quarantine = (moduleId: string, reason: GlueToolQuarantineReason, detail: string): void => {
    quarantined.push({ moduleId, reason, detail });
  };
  const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

  for (const module of glueModules) {
    let registrations: readonly GlueToolRegistration[];
    try {
      registrations = module.build();
    } catch (error) {
      quarantine(module.moduleId, "THROW", `registration build failed: ${messageOf(error)}`);
      continue;
    }

    const duplicate = registrations.find((registration) => claimedToolIds.has(registration.toolId));
    if (duplicate) {
      quarantine(
        module.moduleId,
        "DUPLICATE_TOOL_ID",
        `tool id '${duplicate.toolId}' is already registered by core or an earlier glue module`
      );
      continue;
    }

    try {
      hostPort.registerTools(module.moduleId, registrations);
    } catch (error) {
      quarantine(module.moduleId, "THROW", `host port registration failed: ${messageOf(error)}`);
      continue;
    }

    for (const registration of registrations) claimedToolIds.add(registration.toolId);
    registeredModuleIds.push(module.moduleId);
  }

  return { registeredModuleIds, quarantined };
}
