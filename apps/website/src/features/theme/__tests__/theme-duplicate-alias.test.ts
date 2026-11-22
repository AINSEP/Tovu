import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, type ToolRegistration } from "@jini-ai/core";
import { authorizeToolInvocation } from "@jini-ai/core/composition";

import { buildDuplicateThemeRegistrations, type DuplicateThemeToolDeps } from "../duplicate-theme-tool.js";

/**
 * @file The audit's `theme_duplicate({ sourceId })` refusal: the model names the source `sourceId`
 * (as `theme_list` and the other theme tools name a theme `id`/`themeId`), the schema declares
 * `sourceThemeId`, and the shared normalizer's near-miss rule cannot bridge the two. The schema now
 * declares `sourceId` as an alias, so the call runs as `sourceThemeId` and says so. Only the
 * normalization is exercised: the handler never runs, so nothing is copied.
 */

const PRINCIPAL = { id: "principal-1" };
const RUN = { id: "run-1" };

/** The real registration with its handler swapped for one that records the input it would have received. */
function registryRecording(): { registry: ReturnType<typeof createToolRegistry>; received: unknown[] } {
  const deps = { authorize: async () => ({ allowed: true, reason: "matched" }), workspaceId: "ws-1", themes: [], themesDir: "/unused" } as unknown as DuplicateThemeToolDeps;
  const received: unknown[] = [];
  const registry = createToolRegistry({});
  for (const registration of buildDuplicateThemeRegistrations(deps)) {
    registry.register({ ...registration, handler: async (ctx) => { received.push(ctx.input); return "recorded"; } } as ToolRegistration);
  }
  return { registry, received };
}

test("theme_duplicate accepts sourceId as the source theme and notes the rename", async () => {
  const { registry } = registryRecording();
  const authorized = await authorizeToolInvocation({ registry, toolId: "theme_duplicate", principal: PRINCIPAL, run: RUN, input: { sourceId: "plain", newName: "Copy" } });
  assert.equal(authorized?.decision, "allow");
  assert.deepEqual(authorized?.input, { sourceThemeId: "plain", newName: "Copy" });
  assert.deepEqual(authorized?.normalizationNotes, ["sourceId→sourceThemeId"]);
});

test("theme_duplicate still refuses a name that is not a declared input or alias, naming the declared inputs", async () => {
  const { registry } = registryRecording();
  await assert.rejects(
    () => authorizeToolInvocation({ registry, toolId: "theme_duplicate", principal: PRINCIPAL, run: RUN, input: { source: "plain", newName: "Copy" } }),
    /Unknown input 'source'\. Declared inputs: sourceThemeId \(required\), newName \(required\)/,
  );
});

test("theme_duplicate with both the canonical name and the alias for different themes is refused as conflicting", async () => {
  const { registry } = registryRecording();
  await assert.rejects(
    () => authorizeToolInvocation({ registry, toolId: "theme_duplicate", principal: PRINCIPAL, run: RUN, input: { sourceThemeId: "a", sourceId: "b", newName: "Copy" } }),
    /Conflicting inputs 'sourceThemeId' and 'sourceId' both name 'sourceThemeId'/,
  );
});
