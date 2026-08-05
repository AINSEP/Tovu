import assert from "node:assert/strict";
import test from "node:test";

import { attachGlueContentLifecycle } from "../../attachment-points/content-lifecycle";
import type { GlueContentLifecycleFilter, GlueFieldDecl, GlueHostPort } from "../../ports";
import { attachLoadedPlugin } from "../../../plugin-runtime/loader";
import { createHookRegistry } from "../../../plugin-runtime/hook-registry";
import type { ContentEntryDraft } from "../../../../../packages/sdk/src/index";

/**
 * @file Content-lifecycle attachment point, exercised end to end against a REAL `hook-registry.ts`
 * instance — SPEC-048 REQ-5; ADR-057 Decision 2/2.1/4.
 *
 * This is the dedicated coverage the TDD dispatch requires: proof that a glue module's filter
 * actually fires through `attachLoadedPlugin`, not merely that the adapter forwards a call (the
 * unit test's job). The `GlueHostPort.attachContentLifecycleFilter` implementation below is a
 * worked example of what the host's real composition-root adapter is expected to do: translate a
 * glue-vocabulary filter (`ctx.moduleId`) into the shape `hook-registry.ts` already understands
 * (`ctx.pluginId`, via `packages/sdk`'s `HookContext`) and call `attachLoadedPlugin` with a live
 * registry and `source: "glue"`. Site-glue's own product code (`content-lifecycle.ts`) never
 * imports `plugin-runtime` directly — only this test does, to prove the composition works.
 */

function draft(overrides: Partial<ContentEntryDraft> = {}): ContentEntryDraft {
  return {
    id: "entry-1",
    workspaceId: "ws-1",
    title: "Hello",
    slug: "hello",
    status: "draft",
    bodyJson: { type: "doc", content: [] },
    ext: {},
    ...overrides,
  };
}

/** A worked example of a real `GlueHostPort.attachContentLifecycleFilter` implementation, wired to
 * a live `hookRegistry` via `attachLoadedPlugin` — this is what the host's composition root is
 * expected to do; site-glue's own core never does this itself (see file header). */
function makeRealHostPort(hookRegistry: ReturnType<typeof createHookRegistry>): Pick<GlueHostPort, "attachContentLifecycleFilter"> {
  return {
    attachContentLifecycleFilter(moduleId, filter, declaredFields) {
      attachLoadedPlugin({
        pluginId: moduleId,
        source: "glue",
        hookRegistry,
        // Adapt the glue-vocabulary filter (ctx.moduleId) to hook-registry's own ctx shape
        // (ctx.pluginId) — this translation is real, host-specific glue, deliberately not owned by
        // site-glue's own product-neutral `content-lifecycle.ts`.
        filter: (entry, ctx) => filter(entry, { moduleId: ctx.pluginId, workspaceId: ctx.workspaceId }),
        declaredFields: declaredFields.map((f) => ({ path: `ext.${moduleId}.${f.path}`, type: f.type })),
      });
    },
  };
}

test("ADR-057 Decision 2.1: a glue module's filter actually fires through attachLoadedPlugin and a real hook-registry — its returned patch is merged exactly like a built-in/site plugin's", async () => {
  const hookRegistry = createHookRegistry();
  const hostPort = makeRealHostPort(hookRegistry);

  const glueFilter: GlueContentLifecycleFilter = async (_entry, ctx) => ({ greeted: ctx.moduleId });
  const declaredFields: readonly GlueFieldDecl[] = [{ path: "greeted", type: "string" }];

  attachGlueContentLifecycle({ moduleId: "site-glue-example", filter: glueFilter, declaredFields, hostPort });

  const result = await hookRegistry.runBeforeSave(draft());
  assert.deepEqual(result, { "site-glue-example": { greeted: "site-glue-example" } });
});

test("ADR-057 Decision 4: this category stays fail-closed end to end — a throwing glue filter rejects runBeforeSave entirely, exactly like a built-in/site plugin's throw", async () => {
  const hookRegistry = createHookRegistry();
  const hostPort = makeRealHostPort(hookRegistry);

  const throwingFilter: GlueContentLifecycleFilter = async () => {
    throw new Error("glue filter exploded");
  };

  attachGlueContentLifecycle({ moduleId: "broken-glue", filter: throwingFilter, declaredFields: [], hostPort });

  await assert.rejects(() => hookRegistry.runBeforeSave(draft()), /broken-glue/);
});

test("ADR-057 Decision 3: a glue module's filter composes AFTER a built-in and a site plugin attached to the SAME registry", async () => {
  const hookRegistry = createHookRegistry();
  const hostPort = makeRealHostPort(hookRegistry);
  const callOrder: string[] = [];

  hookRegistry.attach(
    "a-built-in",
    "built-in",
    async () => {
      callOrder.push("a-built-in");
      return { marker: "built-in" };
    },
    [{ path: "ext.a-built-in.marker", type: "string" }]
  );
  hookRegistry.attach(
    "z-site",
    "site",
    async () => {
      callOrder.push("z-site");
      return { marker: "site" };
    },
    [{ path: "ext.z-site.marker", type: "string" }]
  );

  const glueFilter: GlueContentLifecycleFilter = async () => {
    callOrder.push("glue-module");
    return { marker: "glue" };
  };
  attachGlueContentLifecycle({
    moduleId: "glue-module",
    filter: glueFilter,
    declaredFields: [{ path: "marker", type: "string" }],
    hostPort,
  });

  await hookRegistry.runBeforeSave(draft());
  assert.deepEqual(callOrder, ["a-built-in", "z-site", "glue-module"]);
});
