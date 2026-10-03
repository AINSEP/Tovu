import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
/** @file t02: mechanical list-schema union and id dispatch retain the new list inputs. */
import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";
import { InMemoryPostRepo } from "../../features/post/index.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";

import type { AssistantToolRegistryDeps } from "../tool-registrations.js";
import { deriveContentReadRegistrations } from "../content-read-tool.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

function fixture() {
  installFirstPartyToolContributors({ contributions });
  const contributor = contributions.contributors.list({}).find((entry) => entry.domain === "post");
  assert.ok(contributor);
  const source = contributor.build(
    {
      workspaceId: "ws",
      postRepo: new InMemoryPostRepo(),
      authorize: async () => ({ allowed: true, reason: "matched" }),
    } as AssistantToolRegistryDeps,
    { surfaceExchanges: createSurfaceExchangeStore() },
  );
  const dispatched: Array<{ id: string; input: unknown }> = [];
  const wrapped = source.map((r) => ({
    ...r,
    handler: async (ctx: ToolExecutionContext) => {
      dispatched.push({ id: r.descriptor.id, input: ctx.input });
      return r.handler(ctx);
    },
  }));
  const card = deriveContentReadRegistrations(wrapped).find(
    (r) => r.descriptor.id === "content_read.content_post",
  );
  assert.ok(card);
  return { card, dispatched };
}

function context(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec",
    principal: { id: "owner" },
    run: { id: "run" },
    input,
    signal: new AbortController().signal,
  };
}

test("t02: content_read.content_post accepts optional query/status/fields from the list schema", () => {
  const { card } = fixture();
  const schema = card.descriptor.inputSchema as {
    properties: Record<string, Record<string, unknown>>;
    required: string[];
    additionalProperties: boolean;
  };
  assert.equal(schema.properties.query?.type, "string");
  assert.deepEqual(schema.properties.status?.enum, ["draft", "published"]);
  assert.equal(schema.properties.fields?.type, "array");
  assert.deepEqual(schema.required, ["kind"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.id.type, "string");
});

test("t02: content_read.content_post forwards query/fields/status unchanged to list when id is absent", async () => {
  const { card, dispatched } = fixture();
  const input = { kind: "page", query: "Guide", fields: ["slug"], status: "draft", limit: 200 };
  assert.deepEqual(await card.handler(context(input)), { posts: [], total: 0, hasMore: false });
  assert.deepEqual(dispatched, [
    {
      id: "content_post_list",
      input: { kind: "page", query: "Guide", fields: ["slug"], status: "draft", limit: 200 },
    },
  ]);
});

test("t02: present id still selects get rather than list with the new optional fields", async () => {
  const { card, dispatched } = fixture();
  const input = { kind: "page", id: "missing", query: "Guide", fields: ["slug"] };
  await assert.rejects(card.handler(context(input)), /page|post.*missing/);
  assert.deepEqual(dispatched, [
    { id: "content_post_get", input: { kind: "page", id: "missing", query: "Guide", fields: ["slug"] } },
  ]);
});
