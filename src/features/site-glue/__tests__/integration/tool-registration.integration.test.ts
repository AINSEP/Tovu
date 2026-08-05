import assert from "node:assert/strict";
import test from "node:test";

import { mergeGlueToolRegistrations } from "../../attachment-points/tool-registration";
import type { GlueToolModuleContribution } from "../../attachment-points/tool-registration";
import type { GlueToolRegistration } from "../../ports";

/**
 * @file Tool-registration attachment point, exercised against a realistic stand-in for
 * `assistant/tool-registrations.ts`'s own fail-fast `DOMAIN_SLICES` assembly — SPEC-048 REQ-5/
 * REQ-8/REQ-16; ADR-057 Decision 4, CIC-3.
 *
 * `assembleCoreLikeRegistry()` below mirrors `buildAssistantToolRegistrations()`'s own documented
 * discipline exactly (`assistant/tool-registrations.ts:283-302`): concatenate every domain's own
 * registrations, refusing outright — a thrown `Error`, not a quarantine — on any id collision.
 * This file does not import the real 21-domain function (constructing its full
 * `AssistantToolRegistryDeps` union is unrelated to what this adapter needs to prove); it proves
 * the SAME property the real function has — glue never touches this fail-fast pass — against a
 * faithful, smaller stand-in built the same way.
 */

interface CoreDomain {
  readonly domain: string;
  readonly toolIds: readonly string[];
}

function assembleCoreLikeRegistry(domains: readonly CoreDomain[]): readonly string[] {
  const ids: string[] = [];
  const owner = new Map<string, string>();
  for (const domain of domains) {
    for (const toolId of domain.toolIds) {
      const existingOwner = owner.get(toolId);
      if (existingOwner) {
        throw new Error(`'${toolId}' is registered by both ${existingOwner} and ${domain.domain}`);
      }
      owner.set(toolId, domain.domain);
      ids.push(toolId);
    }
  }
  return ids;
}

function registration(toolId: string): GlueToolRegistration {
  return { toolId, handler: () => `handled:${toolId}` };
}

test("ADR-057 Decision 4/CIC-3: a deliberately-throwing glue module alongside real core domains — the full core tool list still assembles, the broken module is absent, and healthy glue + core registrations all survive", () => {
  // "Real core domains": three fail-fast-assembled domains, exactly like DOMAIN_SLICES.
  const coreDomains: readonly CoreDomain[] = [
    { domain: "content-types", toolIds: ["content_types_list", "content_types_create"] },
    { domain: "identity", toolIds: ["identity_users_list"] },
    { domain: "widgets", toolIds: ["widgets_list"] },
  ];
  const coreToolIds = assembleCoreLikeRegistry(coreDomains);
  assert.deepEqual(coreToolIds, ["content_types_list", "content_types_create", "identity_users_list", "widgets_list"]);

  // The final mounted list, as a real GlueHostPort.registerTools implementation would build it —
  // core's own list plus every module the merge accepts, in acceptance order.
  const mounted: Array<{ moduleId: string; registrations: readonly GlueToolRegistration[] }> = [];
  const hostPort = {
    registerTools(moduleId: string, registrations: readonly GlueToolRegistration[]) {
      mounted.push({ moduleId, registrations });
    },
  };

  const brokenModule: GlueToolModuleContribution = {
    moduleId: "broken-glue-module",
    build: () => {
      throw new Error("this glue module's own registration builder is broken");
    },
  };
  const healthyModule: GlueToolModuleContribution = {
    moduleId: "healthy-glue-module",
    build: () => [registration("glue_custom_export")],
  };

  let result: ReturnType<typeof mergeGlueToolRegistrations>;
  assert.doesNotThrow(() => {
    result = mergeGlueToolRegistrations({
      coreToolIds,
      glueModules: [brokenModule, healthyModule],
      hostPort,
    });
  }, "REQ-16's no-brick invariant: one broken glue module must never throw past this merge, or every domain above it — including core's own tool list — would be unreachable");

  // The broken module contributed nothing and is recorded as quarantined, not silently dropped.
  assert.deepEqual(result!.registeredModuleIds, ["healthy-glue-module"]);
  assert.equal(result!.quarantined.length, 1);
  assert.equal(result!.quarantined[0].moduleId, "broken-glue-module");
  assert.equal(result!.quarantined[0].reason, "THROW");

  // Core's own list is untouched by this pass — this function never re-derives or mutates it.
  assert.deepEqual(coreToolIds, ["content_types_list", "content_types_create", "identity_users_list", "widgets_list"]);

  // The host port was called exactly once, for the healthy module only — the broken module never
  // reached the mounting step at all, so "the full core tool list still assembles" (core was never
  // touched by this merge in the first place) and "the healthy module still registers" both hold.
  assert.deepEqual(
    mounted.map((m) => ({ moduleId: m.moduleId, toolIds: m.registrations.map((r) => r.toolId) })),
    [{ moduleId: "healthy-glue-module", toolIds: ["glue_custom_export"] }]
  );

  // Assembling the final effective tool surface (core + accepted glue), the way a real composition
  // root would: core's fail-fast list is unaffected, and only the healthy glue module is present.
  const finalToolIds = [...coreToolIds, ...mounted.flatMap((m) => m.registrations.map((r) => r.toolId))];
  assert.deepEqual(finalToolIds, [
    "content_types_list",
    "content_types_create",
    "identity_users_list",
    "widgets_list",
    "glue_custom_export",
  ]);
  assert.ok(!finalToolIds.includes("broken-glue-module"), "the broken module contributes nothing to the final surface");
});

test("ADR-057 Decision 4: core's own fail-fast discipline is completely untouched by this module — a real core-domain id collision still throws BEFORE glue is ever considered, exactly as buildAssistantToolRegistrations() already does today", () => {
  const collidingCoreDomains: readonly CoreDomain[] = [
    { domain: "database", toolIds: ["backup_create_restore_point"] },
    { domain: "recovery", toolIds: ["backup_create_restore_point"] },
  ];

  assert.throws(
    () => assembleCoreLikeRegistry(collidingCoreDomains),
    /registered by both database and recovery/,
    "core's own fail-fast assembly must still refuse a real cross-domain id collision unchanged — glue never enters this pass at all"
  );
});
