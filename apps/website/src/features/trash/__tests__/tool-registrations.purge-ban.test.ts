import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { PERMANENT_DELETE_TOOLS } from "#src/contracts/headless/index";
import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import type { SiteStore } from "#src/server/runtime/composition/open-site-store";

import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { readAssistantPermanentDeletesPolicy } from "#src/assistant/permanent-delete-settings";
import { NON_TRASH_DELETE_TOOL_IDS } from "../agent-delete-policy.js";
import { toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";

/** gapb supersedes the earlier confirmed-delete policy: even an approved hard delete is not Trash.
 * The new contract deliberately replaces the prior assertions requiring those registrations.
 * Keep the real manifest/assembly seam, so an uninstalled filter fails these tests.
 */
const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/** The durable root owns the table-backed member adapter; the hermetic root intentionally
 * serves members through an in-memory store. Verify the actual production schema here. */
async function productionDeps(t: TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-delete-catalog-"));
  let store: SiteStore | undefined;
  let deps: Awaited<ReturnType<typeof createSiteRouteDeps>> | undefined;
  t.after(async () => {
    if (deps) await Promise.allSettled(Object.entries(deps).filter(([key]) => key.endsWith("Ready")).map(([, value]) => value));
    await store?.close();
    await rm(dir, { recursive: true, force: true });
  });
  deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
    siteBinding: { dir, name: "delete-catalog", dirOverridden: true, switcherCompatible: false },
    onStoreOpened: opened => { store = opened; },
  });
  return deps;
}

for (const collapse of [true, false]) {
  test(`gapb: real assistant composition exposes only recoverable deletion (content_read collapse=${collapse})`, async t => {
    installFirstPartyToolContributors({ contributions });
    const deps = toAssistantRegistryDeps({ routeDeps: await productionDeps(t) });
    const policy = await readAssistantPermanentDeletesPolicy({ ...deps, settingsReady: deps.settingsUiTabsReady });
    assert.deepEqual(policy, { enabled: false, allowedToolIds: [] }, "the real site setting defaults OFF");
    const tools = buildAssistantToolRegistrations(deps, undefined,
      { contributions, includeContentReadCollapse: collapse });
    const ids = new Set(tools.map(tool => tool.descriptor.id));
    // Independent expected set: a mistaken removal from the policy cannot weaken this contract.
    for (const id of ["trash_empty", "trash_purge_item", "media_purge_asset", "comments_purge_comment",
      "identity_user_delete", "identity_role_delete", "identity_policy_delete", "workspace_delete",
      "external_mcp_delete", "custom_credential_delete", "webhooks_delete_subscription",
      "deployment_delete_provider_credential", "source_control_delete_credential", "deployment_ops_unset_secret", "collections_execute_cleanup"]) {
      assert.equal(ids.has(id), false, `${id} must not be agent-callable`);
      assert.ok(NON_TRASH_DELETE_TOOL_IDS.has(id));
    }
    assert.deepEqual([...ids].filter(id => /purge|hard_?delete|permanently/i.test(id)), []);
    for (const id of ["trash_item", "trash_restore_item", "trash_list_items", "content_post_delete", "media_trash_asset", "comments_trash_comment"]) {
      assert.ok(ids.has(id), `${id} must remain available`);
    }
    const trashItem = tools.find(tool => tool.descriptor.id === "trash_item")!;
    const schema = trashItem.descriptor.inputSchema as { properties: { entityType: { enum: string[] } } };
    assert.ok(schema.properties.entityType.enum.includes("member"), "production composition must wire member Trash");
    // pdel permits only checked tools after opt-in; recoverable deletion remains the default.
    const optedIn = buildAssistantToolRegistrations(deps, undefined, { contributions,
      includeContentReadCollapse: collapse, permanentDeletePolicy: { enabled: true, allowedToolIds: ["trash_empty", "identity_role_delete"] },
    });
    for (const tool of PERMANENT_DELETE_TOOLS) {
      const registration = optedIn.find(entry => entry.descriptor.id === tool.id);
      assert.equal(Boolean(registration), ["trash_empty", "identity_role_delete"].includes(tool.id), tool.id);
      if (registration) assert.equal(registration.descriptor.metadata?.approval?.confirmation, "plan", `${tool.id} requires a card`);
    }
    for (const id of ["workspace_delete", "collections_execute_cleanup"]) assert.equal(optedIn.some(tool => tool.descriptor.id === id), false);
  });
}


test("opt-in absorbs the old ban: only checked tools return, forbidden tools never do", () => {
  installFirstPartyToolContributors({ contributions });
  const deps = toAssistantRegistryDeps({ routeDeps: createRouteDeps() });
  const tools = buildAssistantToolRegistrations(deps, undefined, { contributions,
    permanentDeletePolicy: { enabled: true, allowedToolIds: ["trash_empty", "identity_role_delete", "workspace_delete", "collections_execute_cleanup"] },
  });
  const ids = new Set(tools.map(tool => tool.descriptor.id));
  for (const tool of PERMANENT_DELETE_TOOLS) assert.equal(ids.has(tool.id), ["trash_empty", "identity_role_delete"].includes(tool.id), tool.id);
  for (const id of ["workspace_delete", "collections_execute_cleanup"]) assert.equal(ids.has(id), false);
  for (const id of ["trash_empty", "identity_role_delete"]) {
    const tool = tools.find(tool => tool.descriptor.id === id)!;
    assert.equal(tool.descriptor.metadata?.approval?.confirmation, "plan");
  }
});
