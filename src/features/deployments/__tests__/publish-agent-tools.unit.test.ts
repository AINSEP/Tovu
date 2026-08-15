import assert from "node:assert/strict";
import test from "node:test";

import { buildDomainRegistrations, indexCatalogById } from "@jini-ai/cms/core";

import {
  buildStaticPublishRegistrations,
  staticPublishAgentToolCatalog,
  staticPublishDerivedRisk,
} from "../publish-agent-tools";

/**
 * @file `publish-agent-tools.ts` wiring proof: the read-only preview tool actually wires and works,
 * and — the load-bearing claim of this file's whole risk story — `deployment_execute_static_publish`
 * genuinely CANNOT be wired, not merely documented as excluded. `@jini-ai/cms/core`'s
 * `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` guard is what enforces that; this test proves
 * it fires for real if a future edit ever tries to add a handler for the excluded id.
 */

function alwaysAllowAuthorize() {
  return async () => ({ allowed: true as const });
}

test("buildStaticPublishRegistrations wires exactly one tool: the read-only preview", () => {
  const registrations = buildStaticPublishRegistrations({ authorize: alwaysAllowAuthorize(), workspaceId: "ws-1" });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0]!.descriptor.id, "deployment_preview_static_publish");
  assert.ok(registrations[0]!.descriptor.inputSchema, "a wired tool must publish an inputSchema");
});

test("deployment_preview_static_publish reports validity, computed base path, and credential presence — never a token", async () => {
  const registrations = buildStaticPublishRegistrations({
    authorize: alwaysAllowAuthorize(),
    workspaceId: "ws-1",
    credentialSource: { async resolve() { return { ok: true, token: "should-never-appear-in-output" }; } },
  });
  const preview = registrations.find((r) => r.descriptor.id === "deployment_preview_static_publish")!;

  const result = (await preview.handler({
    principal: { id: "principal-1" },
    input: { target: "github-pages", owner: "octo", repo: "my-site" },
  } as never)) as Record<string, unknown>;

  assert.equal(result.valid, true);
  assert.equal(result.basePath, "/my-site");
  assert.equal(result.credentialsConfigured, true);
  assert.equal(result.willInjectNojekyll, true);
  assert.doesNotMatch(JSON.stringify(result), /should-never-appear-in-output/);
});

test("deployment_preview_static_publish reports invalid config and false credentials without throwing", async () => {
  const registrations = buildStaticPublishRegistrations({
    authorize: alwaysAllowAuthorize(),
    workspaceId: "ws-1",
    credentialSource: { async resolve() { return { ok: false, reason: "GITHUB_TOKEN is not set" }; } },
  });
  const preview = registrations.find((r) => r.descriptor.id === "deployment_preview_static_publish")!;

  const result = (await preview.handler({
    principal: { id: "principal-1" },
    input: { target: "github-pages", owner: "not valid!!", repo: "demo" },
  } as never)) as Record<string, unknown>;

  assert.equal(result.valid, false);
  assert.match(result.validationError as string, /invalid GitHub owner/);
  assert.equal(result.basePath, null);
  assert.equal(result.credentialsConfigured, false);
});

test("the catalog's own risk map has an entry for the wired tool, matching its declared sideEffects", () => {
  assert.equal(staticPublishDerivedRisk.get("deployment_preview_static_publish"), "none");
  const previewEntry = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_preview_static_publish")!;
  assert.equal(previewEntry.sideEffects, "none");
});

test("deployment_execute_static_publish is declared with the confirmation-gated actor-class rule and is structurally impossible to wire", () => {
  const executeEntry = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_execute_static_publish")!;
  assert.equal(executeEntry.actorClassRule, "confirmer-must-equal-own-delegatedBy");
  assert.equal(executeEntry.sideEffects, "mutates-durable-state");

  // Proves the exclusion is enforced by the shared registration kit, not merely by this file
  // choosing not to add a handler — the same guard `recovery`/`database` rely on for their own
  // excluded tools. Reach in and try to wire it anyway; it must throw.
  assert.throws(
    () =>
      buildDomainRegistrations({
        domain: "static-publish",
        catalogModule: "features/deployments/publish-agent-tools.ts",
        catalog: indexCatalogById(staticPublishAgentToolCatalog),
        handlers: { deployment_execute_static_publish: async () => ({}) },
        derivedRisk: new Map([["deployment_execute_static_publish", "mutates-durable-state"]]),
      }),
    /confirmation/i
  );
});
