import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError } from "@jini-ai/core";
import { projectKeyPermission } from "../host-bindings.js";
import { vaultRow } from "./helpers.js";

test("saved key authority follows the owning credential domain, with unknown kinds refused", () => {
  for (const [row, permission] of [
    [vaultRow({ kind: "api-connection", id: "plugin-state:posthog:provider.config" }), "admin.plugins.enable"],
    [{ ...vaultRow({ kind: "api-connection" }), meta: { credentialFormat: "oauth-token-set" } }, "admin.plugins.enable"],
    [vaultRow({ kind: "custom" }), "custom-credentials.write"],
    [vaultRow({ kind: "vendor" }), "custom-credentials.write"],
    [{ ...vaultRow({ kind: "vendor" }), meta: {} }, "deployments.credentials.write"],
    [vaultRow({ kind: "source-control" }), "source-control.credentials.write"],
  ] as const) {
    assert.equal(projectKeyPermission({ row }), permission, `${row.kind}/${row.id}`);
  }
  assert.throws(() => projectKeyPermission({ row: vaultRow({ kind: "api-connection" }) }), (error: unknown) =>
    error instanceof ToolInputError
      && error.message === "Choose an API key, provider-settings key or saved OAuth connection in Shared Keys. Details: P25_KEY_KIND_NOT_SUPPORTED.");
});
