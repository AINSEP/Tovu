import assert from "node:assert/strict";
import test from "node:test";
import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor, DerivedToolContributor } from "#src/assistant/index";
import { TOOL_SEARCH_KEYWORDS } from "#src/assistant/tool-search-keywords";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";

test("first-party catalog registers both install families and forwards the scoped attachment reader", async () => {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  let reads = 0;
  installFirstPartyToolContributors({ contributions }, { readInstallAttachment: async () => { reads++; return { ok: false, refusal: "not-owner" }; } });
  const previous = process.env.TOVU_PLUGIN_LOCAL_INSTALL;
  process.env.TOVU_PLUGIN_LOCAL_INSTALL = "1";
  try {
    for (const [domain, id] of [["plugins-install", "plugins_install"], ["agent-plugins-install", "agent_plugins_install"]]) {
      const contribution = contributions.contributors.list({}).find(entry => entry.domain === domain);
      assert.ok(contribution);
      const registration = contribution.build({ workspaceId: "workspace-local", authorize: async () => ({ allowed: true, reason: "matched" }), pluginInstaller: {} } as never, {} as never)
        .find(entry => entry.descriptor.id === id);
      assert.ok(registration);
      assert.equal(contribution.risk.get(id), "mutates-durable-state");
      assert.match(TOOL_SEARCH_KEYWORDS[id]!, /attachment/);
      await assert.rejects(() => registration.handler({ executionId: "exec", principal: { id: "owner" }, run: { id: "accepted" }, input: { source: { kind: "zip", attachmentRef: "attachment:12345678" } }, signal: new AbortController().signal }, {}));
    }
    assert.equal(reads, 2);
  } finally {
    if (previous === undefined) delete process.env.TOVU_PLUGIN_LOCAL_INSTALL; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = previous;
  }
});
