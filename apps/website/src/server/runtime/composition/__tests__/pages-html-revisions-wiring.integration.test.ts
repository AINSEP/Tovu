import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createContributionRegistry, type ToolContributor as OwnedToolContributor, type DerivedToolContributor as OwnedDerivedToolContributor, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { type AssistantToolRegistryDeps, buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";


import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";

import { createPost } from "@jini-ai/cms/posts/post-create";
import { createRouteDeps } from "../app.js";
import { createSiteRouteDeps } from "../deps.js";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
};

/**
 * @file S1 (fix plan 2026-09-24 row 14) — the composition roots actually connect `pages_write_html`
 * to the `post_revisions` ledger. `features/pages/__tests__/html-document-store.revisions.test.ts`
 * proves the store appends when it is HANDED `deps.revisions`; this file proves the real roots hand
 * it over (`deps.ts`'s `revisions: postRepo`, `app.ts`'s in-memory double over the same `postRepo`)
 * and that the tool passes the calling principal through as the revision's `actorId`. Either wire
 * dropped leaves the store test green and html Page edits silently unledgered.
 */

type RegistryDeps = Parameters<typeof buildAssistantToolRegistrations>[0];
type RootDeps = ReturnType<typeof createRouteDeps> | Awaited<ReturnType<typeof createSiteRouteDeps>>;

const PRINCIPAL_ID = "principal-pages-wiring";
const HTML = `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section>`;
const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };

function pagesWriteHtml(routeDeps: RootDeps): ToolRegistration {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const allowAll: RegistryDeps["authorize"] = async () => ({ allowed: true, reason: "test" });
  const registrations = buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter, authorize: allowAll } as RegistryDeps, { surfaces: undefined, options: { contributions } });
  const registration = registrations.find((r) => r.descriptor.id === "pages_write_html");
  assert.ok(registration, "pages_write_html must be registered by the real first-party registry");
  return registration;
}

/**
 * Writes through the real tool on the basis the model would have read: the guard requires
 * `expectedVersion`, so the fixture reads the row's current version rather than the tool relaxing it.
 */
async function writeThroughTool(routeDeps: RootDeps, id: string): Promise<Record<string, unknown>> {
  const basis = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id });
  assert.ok(basis, "the page must exist before the tool writes it");
  const ctx: ToolExecutionContext = {
    executionId: "exec-pages-wiring",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-pages-wiring" },
    input: { id, html: HTML, expectedVersion: basis.version },
    signal: new AbortController().signal,
  };
  const result = (await pagesWriteHtml(routeDeps).handler(ctx)) as Record<string, unknown>;
  assert.equal(result.written, true, "the fixture's write must actually land");
  return result;
}

async function assertLedgered(routeDeps: RootDeps, id: string): Promise<void> {
  const revisions = await routeDeps.postRepo.listRevisions({ workspaceId: routeDeps.workspaceId, postId: id });
  const latest = revisions.at(-1);
  assert.ok(latest, "the page must have revisions at all");
  assert.equal(latest.stateJson.bodyHtml, HTML, "the tool's html write must be the ledger's latest row");
  assert.equal(latest.actorId, PRINCIPAL_ID, "the revision must be attributed to the calling principal, not SYSTEM_ACTOR_ID");
  const row = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id });
  assert.equal(latest.seq, row?.version, "the latest revision must capture the row's current version");
}

test("createSiteRouteDeps: pages_write_html on a doc page appends its html state to post_revisions, attributed to the caller", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-pages-revisions-wiring-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const deps = await createSiteRouteDeps({}, { dbPath: path.join(dir, "content.db") });
  await deps.identityReady;

  await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo: deps.postRepo, clock: deps.clock }, input: { workspaceId: deps.workspaceId, id: "page-w", title: "Landing", kind: "page", bodyJson: DOC } });
  await writeThroughTool(deps, "page-w");

  await assertLedgered(deps, "page-w");
});

test("createRouteDeps (in-memory root): pages_write_html is unavailable and appends nothing to post_revisions (FIX 11)", async () => {
  const deps = createRouteDeps();

  await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo: deps.postRepo, clock: deps.clock }, input: { workspaceId: deps.workspaceId, id: "page-m", title: "Landing", kind: "page", bodyJson: DOC } });
  const before = await deps.postRepo.listRevisions({ workspaceId: deps.workspaceId, postId: "page-m" });
  await assert.rejects(writeThroughTool(deps, "page-m"), /not available.*Nothing was written/s);
  assert.deepEqual(await deps.postRepo.listRevisions({ workspaceId: deps.workspaceId, postId: "page-m" }), before);
});

/**
 * P1-T2.T — each root records the tool's write as one scoped `page-html` change set AND has the
 * matching non-forceable `page-html/update` reverter on its one revert registry, bound to the page
 * store the write used. Either half missing leaves a recorded Undo that cannot be resolved, or a
 * reverter nothing ever records for.
 */
test("the transactional root records and can resolve a page-html change set; the in-memory root binds recorded writes disabled (FIX 11)", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-pages-html-changeset-wiring-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sqlite = await createSiteRouteDeps({}, { dbPath: path.join(dir, "content.db") });
  await sqlite.identityReady;
  assert.equal(createRouteDeps().recordedHtmlWrites, "disabled", "in-memory: no shared rollback boundary, so no recorded write");
  assert.equal(sqlite.recordedHtmlWrites, "enabled");
  const roots: Array<[string, RootDeps]> = [["sqlite", sqlite]];
  for (const [label, deps] of roots) {
    await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo: deps.postRepo, clock: deps.clock }, input: { workspaceId: deps.workspaceId, id: "page-cs", title: "Landing", kind: "page", bodyJson: DOC } });
    const before = (await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: "page-cs" }))!.version;
    const result = await writeThroughTool(deps, "page-cs");
    assert.equal(typeof result.changeSetId, "string", `${label}: a committed write names its change set`);
    const recorded = await deps.changeSets.findById({ workspaceId: deps.workspaceId, id: result.changeSetId as string });
    assert.ok(recorded, `${label}: the change set is stored in this root's ledger`);
    assert.equal(recorded.items.length, 1, `${label}: exactly one scoped item`);
    const [item] = recorded.items;
    assert.equal(item!.entityType, "page-html");
    assert.equal(item!.operation, "update");
    assert.equal(item!.entityId, "page-cs");
    assert.equal(item!.entityVersionAtApply, before + 1, `${label}: the post-write version the reverter's CAS will check`);
    assert.deepEqual(item!.inversePayload, { format: "doc", bodyJson: DOC }, `${label}: the pre-conversion doc, not rendered HTML`);
    const reverter = deps.revertRegistry.resolve("page-html", "update");
    assert.ok(reverter, `${label}: the root registers the page-html reverter`);
    assert.deepEqual(reverter.policy, { permission: "pages.edit_html", authorizationEntityType: "post", allowForce: false });
    assert.equal(await reverter.currentVersion({ workspaceId: deps.workspaceId, entityId: "page-cs" }), before + 1, `${label}: resolves the live scoped page`);
  }
});
