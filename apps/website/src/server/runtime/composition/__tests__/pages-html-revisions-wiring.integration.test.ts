import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resetToolContributorsForTests } from "#src/assistant/tool-contribution-registry";
import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { createPost } from "#src/features/post/post";
import { createRouteDeps } from "../app.js";
import { createSqliteRouteDeps } from "../deps.js";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";

/**
 * @file S1 (fix plan 2026-09-24 row 14) — the composition roots actually connect `pages_write_html`
 * to the `post_revisions` ledger. `features/pages/__tests__/html-document-store.revisions.test.ts`
 * proves the store appends when it is HANDED `deps.revisions`; this file proves the real roots hand
 * it over (`deps.ts`'s `revisions: postRepo`, `app.ts`'s in-memory double over the same `postRepo`)
 * and that the tool passes the calling principal through as the revision's `actorId`. Either wire
 * dropped leaves the store test green and html Page edits silently unledgered.
 */

type RegistryDeps = Parameters<typeof buildAssistantToolRegistrations>[0];
type RootDeps = ReturnType<typeof createRouteDeps> | ReturnType<typeof createSqliteRouteDeps>;

const PRINCIPAL_ID = "principal-pages-wiring";
const HTML = `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section>`;
const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };

function pagesWriteHtml(routeDeps: RootDeps): ToolRegistration {
  resetToolContributorsForTests();
  installFirstPartyToolContributors();
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const allowAll: RegistryDeps["authorize"] = async () => ({ allowed: true, reason: "test" });
  const registrations = buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter, authorize: allowAll } as RegistryDeps);
  const registration = registrations.find((r) => r.descriptor.id === "pages_write_html");
  assert.ok(registration, "pages_write_html must be registered by the real first-party registry");
  return registration;
}

async function writeThroughTool(routeDeps: RootDeps, id: string): Promise<void> {
  const ctx: ToolExecutionContext = {
    executionId: "exec-pages-wiring",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-pages-wiring" },
    input: { id, html: HTML },
    signal: new AbortController().signal,
  };
  await pagesWriteHtml(routeDeps).handler(ctx);
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

test("createSqliteRouteDeps: pages_write_html on a doc page appends its html state to post_revisions, attributed to the caller", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-pages-revisions-wiring-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const deps = createSqliteRouteDeps(path.join(dir, "content.db"));
  await deps.identityReady;

  await createPost({ deps: { repo: deps.postRepo, clock: deps.clock }, input: { workspaceId: deps.workspaceId, id: "page-w", title: "Landing", kind: "page", bodyJson: DOC } });
  await writeThroughTool(deps, "page-w");

  await assertLedgered(deps, "page-w");
});

test("createRouteDeps (in-memory root): pages_write_html appends its html state to post_revisions, attributed to the caller", async () => {
  const deps = createRouteDeps();

  await createPost({ deps: { repo: deps.postRepo, clock: deps.clock }, input: { workspaceId: deps.workspaceId, id: "page-m", title: "Landing", kind: "page", bodyJson: DOC } });
  await writeThroughTool(deps, "page-m");

  await assertLedgered(deps, "page-m");
});
