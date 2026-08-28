/**
 * @file SPEC-022 C-003/C-004 — the boot-time containment gate (REQ-03/04/05/06/07/08,
 * INV-01, INV-03, EC-03).
 *
 * behavior.spec.md §2.1: every failing check is aggregated, never short-circuited on the first
 * failure, so an operator fixes everything in one pass. §2.1 step 1: entirely inert outside
 * `production` mode.
 */

import type { CapabilityInventoryEntry } from "../configuration/capability-inventory.js";
import { findCapabilityEntry } from "../configuration/capability-inventory.js";
import type { RuntimeMode } from "#src/contracts/core/runtime-mode";

export interface EnvSnapshot {
  hasDevSecretPlaceholder: boolean;
  hasLocalhostEgressAllowance: boolean;
  hasAlwaysOnAnalyticsStub: boolean;
  /** SPEC-022 §4.2: true when the seeded owner account still has the publicly-documented default password. */
  hasDefaultOwnerPassword: boolean;
}

export type BootRefusalCode =
  | "PRODUCTION_BOOT_UNSAFE_DEFAULT"
  | "PRODUCTION_CAPABILITY_NOT_DURABLE"
  | "SHARP_READINESS_FAILED";

export interface BootRefusalFailure {
  code: BootRefusalCode;
  message: string;
  occurredAt: string;
  correlationId: string | null;
  details: Record<string, unknown>;
}

export interface RunProductionReadinessGateOptions {
  mode: RuntimeMode;
  inventory: readonly CapabilityInventoryEntry[];
  envSnapshot: EnvSnapshot;
  /** REQ-08: media transform-route readiness. Absent = not checked (no media-transform gate). */
  sharpReadiness?: () => Promise<boolean>;
}

export type ProductionReadinessGateResult = { ok: true } | { ok: false; failures: BootRefusalFailure[] };

function nowIso(): string {
  return new Date().toISOString();
}

function unsafeDefaultFailure(checkName: string): BootRefusalFailure {
  return {
    code: "PRODUCTION_BOOT_UNSAFE_DEFAULT",
    message: `Refusing to boot in production mode: ${checkName} detected.`,
    occurredAt: nowIso(),
    correlationId: null,
    details: { checkName },
  };
}

/**
 * EC-03/INV-03: `hasDurableAdapter` must resolve as a checked value, never trusted blindly — a
 * throwing check (or a non-boolean shape reaching here despite the type) is always a failure,
 * never interpreted as a passed check.
 */
function resolveDurability(entry: CapabilityInventoryEntry): boolean {
  try {
    const raw = entry.hasDurableAdapter as unknown;
    if (typeof raw === "function") {
      return (raw as () => boolean)() === true;
    }
    return raw === true;
  } catch {
    return false;
  }
}

// §2.1 step 2: dev-only unsafe defaults.
function collectUnsafeDefaultFailures(envSnapshot: EnvSnapshot): BootRefusalFailure[] {
  const failures: BootRefusalFailure[] = [];
  if (envSnapshot.hasDevSecretPlaceholder) failures.push(unsafeDefaultFailure("dev-secret-placeholder"));
  if (envSnapshot.hasLocalhostEgressAllowance) failures.push(unsafeDefaultFailure("localhost-egress-allowance"));
  if (envSnapshot.hasAlwaysOnAnalyticsStub) failures.push(unsafeDefaultFailure("always-enabled-analytics-stub"));
  if (envSnapshot.hasDefaultOwnerPassword) failures.push(unsafeDefaultFailure("default-owner-password"));
  return failures;
}

// §2.1 step 3: every production-classified capability must be durable.
function collectDurabilityFailures(inventory: readonly CapabilityInventoryEntry[]): BootRefusalFailure[] {
  const failures: BootRefusalFailure[] = [];
  for (const capability of inventory) {
    if (capability.classification !== "production") continue;
    if (resolveDurability(capability)) continue;
    failures.push({
      code: "PRODUCTION_CAPABILITY_NOT_DURABLE",
      message: `Refusing to boot in production mode: capability "${capability.name}" is classified production but has no durable adapter configured.`,
      occurredAt: nowIso(),
      correlationId: null,
      details: { capabilityName: capability.name, missingRequirement: "durable-adapter" },
    });
  }
  return failures;
}

/**
 * REQ-08: sharp readiness gates media-transform route registration specifically, not the whole
 * boot — but an unready sharp still contributes to the aggregated failure report. Absent
 * `sharpReadiness` means "not checked", not "ready".
 */
async function checkSharpReadiness(
  sharpReadiness: (() => Promise<boolean>) | undefined
): Promise<BootRefusalFailure | null> {
  if (!sharpReadiness) return null;

  let ready: boolean;
  try {
    ready = await sharpReadiness();
  } catch {
    ready = false;
  }
  if (ready) return null;

  return {
    code: "SHARP_READINESS_FAILED",
    message: "Media transform routes disabled: sharp readiness check failed (native-binary-load).",
    occurredAt: nowIso(),
    correlationId: null,
    details: { checkName: "native-binary-load" },
  };
}

export async function runProductionReadinessGate(
  options: RunProductionReadinessGateOptions
): Promise<ProductionReadinessGateResult> {
  // §2.1 step 1: entirely inert outside production mode.
  if (options.mode !== "production") {
    return { ok: true };
  }

  const failures: BootRefusalFailure[] = [
    ...collectUnsafeDefaultFailures(options.envSnapshot),
    ...collectDurabilityFailures(options.inventory),
  ];

  const sharpFailure = await checkSharpReadiness(options.sharpReadiness);
  if (sharpFailure) failures.push(sharpFailure);

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

export interface CapabilityRouteGuardOptions {
  capabilityName: string;
  mode: RuntimeMode;
}

export interface CapabilityRouteGuardDecision {
  register: boolean;
  classification?: "local-only" | "experimental";
}

/**
 * REQ-04/05: per-route registration decision. REQ-07: webhooks are unconditionally contained
 * in production mode regardless of classification/durability, until a Phase-1 spec supersedes
 * this — a special case ahead of the general inventory lookup.
 */
export function capabilityRouteGuard(options: CapabilityRouteGuardOptions): CapabilityRouteGuardDecision {
  if (options.mode !== "production") {
    return { register: true };
  }

  if (options.capabilityName === "webhooks") {
    return { register: false };
  }

  const entry = findCapabilityEntry(options.capabilityName);
  if (!entry) {
    // REQ-12/CAPABILITY_INVENTORY_STALE — belt-and-suspenders; no basis to register a capability
    // with no inventory entry at all.
    return { register: false };
  }

  if (entry.classification === "production") {
    return { register: true };
  }

  return { register: false, classification: entry.classification };
}
