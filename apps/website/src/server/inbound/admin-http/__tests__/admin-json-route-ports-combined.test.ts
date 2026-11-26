import assert from "node:assert/strict";
import test from "node:test";
import { defineJsonRoute, ok } from "@jini-ai/core/contracts/server";

import { createAdminJsonRoutePorts, mountAdminJsonRoute } from "../admin-json-route-ports.js";
import { fakeAdminApp } from "./fixtures/port-harness.js";

/**
 * rv1123l T6: `deferMissingPrincipal` lets a sessionless request reach `parse`; `sessionCredentialOnly`
 * must refuse every non-session credential before parse. Together the deferral would skip the
 * credential gate, so the combination is refused at registration; each alone still mounts.
 */
type Deps = { workspaceId: string; authorize: (input: unknown) => Promise<{ allowed: boolean; reason: string }> };
const deps: Deps = { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }) };
const gate = { message: "Sessions only.", permission: "probe.write" };
const spec = defineJsonRoute<unknown, unknown, Deps, { id: string }>({ method: "post", path: "/api/admin/v1/workspaces/:workspaceId/combined", parse: () => ok({ value: {} }), handle: async () => ok({ value: {} }) });

test("deferMissingPrincipal + sessionCredentialOnly is refused at registration", () => {
  assert.throws(() => mountAdminJsonRoute({ errors: createRouteIncidentReporter().errors, app: fakeAdminApp(), spec: spec as never, deps }, { deferMissingPrincipal: true, sessionCredentialOnly: gate }), /deferMissingPrincipal.*sessionCredentialOnly/);
  assert.throws(() => createAdminJsonRoutePorts({ deferMissingPrincipal: true, sessionCredentialOnly: gate }), /deferMissingPrincipal.*sessionCredentialOnly/);
});

test("each option alone still mounts", () => {
  assert.doesNotThrow(() => mountAdminJsonRoute({ errors: createRouteIncidentReporter().errors, app: fakeAdminApp(), spec: spec as never, deps }, { deferMissingPrincipal: true }));
  assert.doesNotThrow(() => mountAdminJsonRoute({ errors: createRouteIncidentReporter().errors, app: fakeAdminApp(), spec: spec as never, deps }, { sessionCredentialOnly: gate }));
  assert.doesNotThrow(() => mountAdminJsonRoute({ errors: createRouteIncidentReporter().errors, app: fakeAdminApp(), spec: spec as never, deps }, { deferMissingPrincipal: false, sessionCredentialOnly: gate }));
});
