import assert from "node:assert/strict";
import { mock, test } from "node:test";

import type { SetValueRequired } from "@jini-ai/core/settings";

/**
 * @file The typed bindings write goes through the host settings chokepoint (`site-title-write.ts`'s
 * `set`), not the package's `set`, so every host write rule applies to it as to the settings route.
 */

test("writeFormDeliveryBindings saves the cleaned list through the host settings chokepoint", async () => {
  const seen: SetValueRequired[] = [];
  mock.module(new URL("../site-title-write.ts", import.meta.url).href, { namedExports: {
    set: async (required: SetValueRequired) => { seen.push(required); return { value: null, revisionSeq: 7 }; },
  } });
  const { writeFormDeliveryBindings } = await import("../form-delivery-write.js");
  const deps = {} as SetValueRequired["deps"]; // never read: the chokepoint is a spy here
  const result = await writeFormDeliveryBindings({ deps, workspaceId: "ws-1", callerPrincipalId: "owner",
    value: [{ bindingId: "b1", adapterId: "rows", connectionRef: "conn-1", enabled: true, config: {}, }] });
  assert.equal(result.revisionSeq, 7);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.deps, deps);
  assert.deepEqual(seen[0]?.input, { namespace: "core.forms", key: "deliveryBindings", scope: "workspace", workspaceId: "ws-1", callerPrincipalId: "owner",
    value: [{ bindingId: "b1", adapterId: "rows", connectionRef: "conn-1", enabled: true, config: {} }] });
});
