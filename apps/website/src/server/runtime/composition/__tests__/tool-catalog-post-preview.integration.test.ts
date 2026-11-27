/**
 * @file The composed `content_post_preview` renderer adapter in `tool-catalog-manifest.ts`: a theme-state
 * refusal from the shared renderer reaches the assistant as a tool input error carrying the renderer's copy,
 * and every other failure propagates unchanged. Built through the full production tool catalog on real deps.
 */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createContributionRegistry, ToolInputError } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { createRouteDeps } from "../app.js";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/** The composed preview tool on fresh deps whose authorizer admits every read; also returns a non-bare post id. */
async function composedPreview(adjust: (deps: ReturnType<typeof createRouteDeps>) => void) {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const routeDeps = createRouteDeps();
  routeDeps.authorize = async () => ({ allowed: true, reason: "test principal may read" });
  adjust(routeDeps);
  const preview = buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps }), { surfaces: undefined, options: { contributions } })
    .find((registration) => registration.descriptor.id === "content_post_preview");
  assert.ok(preview, "precondition: the production catalog composes content_post_preview");
  const post = (await routeDeps.postRepo.list({ workspaceId: routeDeps.workspaceId }))[0];
  assert.ok(post, "precondition: the composed site has a post to preview");
  return { preview, routeDeps, postId: post.id };
}

function call(input: unknown) {
  return { principal: { id: "owner-p" }, input, signal: new AbortController().signal } as never;
}

test("a site with its theme switched off answers a template preview with a tool input error naming the theme-off reason", async () => {
  const { preview, routeDeps, postId } = await composedPreview(() => {});
  const current = await routeDeps.presentationRepo.findByWorkspaceId({ workspaceId: routeDeps.workspaceId });
  assert.ok(current, "precondition: the composed site stores presentation settings");
  assert.notEqual(current.activeThemeId, NO_THEME_ID, "precondition: a theme is active before it is switched off");
  await routeDeps.presentationRepo.save({ ...current, activeThemeId: NO_THEME_ID });

  const failure = await preview.handler(call({ postId, templateChoice: "article.html" })).then(() => undefined, (error: unknown) => error);
  assert.ok(failure instanceof ToolInputError, `expected a ToolInputError, got ${String(failure)}`);
  assert.equal(failure.message, "content_post_preview: this site has no active theme, so there is no template to preview — activate a theme to use the template picker");
});

test("a preview failure that is not a template-render refusal propagates unchanged, not as a tool input error", async () => {
  const outage = new Error("presentation store offline");
  const { preview, postId } = await composedPreview((deps) => {
    deps.presentationRepo = { ...deps.presentationRepo, findByWorkspaceId: async () => { throw outage; } };
  });

  const failure = await preview.handler(call({ postId, templateChoice: "article.html" })).then(() => undefined, (error: unknown) => error);
  assert.equal(failure, outage);
});
