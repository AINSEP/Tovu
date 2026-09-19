import assert from "node:assert/strict";
import test from "node:test";

import { confirm, ForbiddenError, type GatedMutationHooks, type GatewayDeps } from "#src/contracts/core/gated-mutations/gateway";
import type { ConfirmationTokenRecord, TokenStorePort } from "#src/contracts/core/gated-mutations/token";
import { buildConfirmOnlyHooks, resolveActorClassIdentity } from "#src/contracts/core/gated-mutations/composition";
import { gatedPrincipalKindFor, type AuthCredentialKind } from "../dev-auth.js";

/**
 * @file Provenance of a gated publish-content import (item 7 of the zero-setup publishing auth
 * work — `ADS-memory/reports/2026-09-19-publish-zero-setup-auth-design.md`, "Provenance").
 *
 * The property under test is that automation is RECORDED as automation. Before this, three call
 * sites in `routes/publish-content/import.ts` passed the literal `principalKind: "user"` for every
 * caller, so a cross-site publish driven by a machine credential was written into the gated
 * ceremony as a human act.
 *
 * Two halves, because the mapping and the widened type can each fail on their own:
 * 1. the credential -> principal-class mapping is total and does not collapse to `"user"`;
 * 2. widening `PrincipalKind` did not move `gateway.confirm()`'s agent refusal — a publishing
 *    installation may confirm its own ceremony, an agent still may not.
 */
const FIXED_NOW = "2026-09-19T12:00:00.000Z";

function makeGatewayDeps(allowed: boolean): { deps: GatewayDeps; saved: ConfirmationTokenRecord[] } {
  const saved: ConfirmationTokenRecord[] = [];
  const tokens: TokenStorePort = {
    save: async (token) => {
      saved.push(token);
    },
    findByToken: async () => null,
    tryRedeem: async () => false,
  };
  return {
    saved,
    deps: {
      clock: { nowIso: () => FIXED_NOW },
      idGen: { newId: () => "plan-1" },
      authorize: async () => ({ allowed, reason: allowed ? "ok" : "denied" }),
      tokens,
    },
  };
}

function hooks(): GatedMutationHooks<unknown, unknown> {
  return buildConfirmOnlyHooks({
    domain: "publish_content.import",
    readPermission: "publish_content.read",
    mutatePermission: "publish_content.apply",
    scopeId: "ws-1",
  });
}

test("every credential kind maps to its own principal class, never collapsing to 'user'", () => {
  assert.equal(gatedPrincipalKindFor("session"), "user");
  assert.equal(gatedPrincipalKindFor("api_key"), "api_key");
  assert.equal(gatedPrincipalKindFor("publish_key"), "publish_key");

  const kinds: readonly AuthCredentialKind[] = ["session", "api_key", "publish_key"];
  const mapped = kinds.map(gatedPrincipalKindFor);
  assert.equal(new Set(mapped).size, kinds.length, "two credential kinds must never share one principal class");
});

test("a machine credential is not labelled 'user'", () => {
  assert.notEqual(gatedPrincipalKindFor("api_key"), "user");
  assert.notEqual(gatedPrincipalKindFor("publish_key"), "user");
});

test("a publishing installation may confirm its own gated import", async () => {
  const { deps, saved } = makeGatewayDeps(true);
  const record = await confirm({
    deps,
    principalId: "pub:install-a",
    principalKind: gatedPrincipalKindFor("publish_key"),
    hooks: hooks(),
    planId: "plan-1",
    planHash: "sha256:" + "a".repeat(64),
  });
  assert.equal(record.confirmerPrincipalId, "pub:install-a");
  assert.equal(saved.length, 1);
});

test("widening PrincipalKind did not open the agent-confirm arm", async () => {
  const { deps } = makeGatewayDeps(true);
  await assert.rejects(
    confirm({
      deps,
      principalId: "agent-1",
      principalKind: "agent",
      hooks: hooks(),
      planId: "plan-1",
      planHash: "sha256:" + "a".repeat(64),
    }),
    (err: unknown) => err instanceof ForbiddenError && err.reasonCode === "AGENT_CANNOT_CONFIRM"
  );
});

test("a publish_key's actor-class identity is itself, so only the confirming installation can redeem", async () => {
  assert.equal(
    await resolveActorClassIdentity({ principalId: "pub:install-a", principalKind: "publish_key" }),
    "pub:install-a"
  );
  assert.notEqual(
    await resolveActorClassIdentity({ principalId: "pub:install-b", principalKind: "publish_key" }),
    "pub:install-a"
  );
});
