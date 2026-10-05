import assert from "node:assert/strict";
import test from "node:test";

import { createContributionRegistry, type ToolRegistration } from "@jini-ai/core";

import type { ToolContributor, DerivedToolContributor } from "#src/assistant/index";
import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { type RegistryDepsWithoutLimiter, toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";
import { createRetiredReadToolIdRewriter, RETIRED_READ_TOOL_TO_CARD } from "#src/assistant/content-read-tool";
import { KEYWORD_MARKER } from "#src/assistant/tool-search-keywords";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";

/**
 * @file The content_read collapse retires read tools like `menus_list_menus`, but package catalogs
 * still name them ("The menu's id, as returned by menus_list_menus, menus_get_menu, or
 * menus_create_menu"), so the model was pointed at tools that do not exist (capability inventory
 * 2026-10-05, `menus_assign_location`). The collapse now rewrites those names to the card.
 */

function registration(description: string, inputSchema: Record<string, unknown> = { type: "object", properties: {} }): ToolRegistration {
  return { descriptor: { id: "probe_tool", description, inputSchema }, handler: async () => ({}), policy: {} } as unknown as ToolRegistration;
}

const MENU_RETIRED = new Set(["menus_list_menus", "menus_get_menu"]);

test("a retired id in a schema description is pointed at its card, and a repeat of the same card collapses", () => {
  const rewrite = createRetiredReadToolIdRewriter({ retiredIds: MENU_RETIRED });
  const out = rewrite(
    registration("Assigns a menu.", {
      type: "object",
      properties: { menuId: { type: "string", description: "The menu's id, as returned by menus_list_menus, menus_get_menu, or menus_create_menu." } },
    })
  );
  assert.deepEqual(out.descriptor.inputSchema, {
    type: "object",
    properties: { menuId: { type: "string", description: "The menu's id, as returned by content_read.menu, or menus_create_menu." } },
  });
});

test("only the plain text is rewritten; the indexed keyword tail is left exactly as scored", () => {
  const rewrite = createRetiredReadToolIdRewriter({ retiredIds: MENU_RETIRED });
  const out = rewrite(registration(`See menus_get_menu first.${KEYWORD_MARKER}menus_get_menu navigation`));
  assert.equal(out.descriptor.description, `See content_read.menu first.${KEYWORD_MARKER}menus_get_menu navigation`);
});

test("an id that was not retired, or that only starts with a retired id, keeps its name and the registration is returned as-is", () => {
  const rewrite = createRetiredReadToolIdRewriter({ retiredIds: MENU_RETIRED });
  const untouched = registration("Use menus_get_menu_items or menus_create_menu.");
  assert.equal(rewrite(untouched), untouched);
});

test("with nothing retired, nothing is rewritten", () => {
  const rewrite = createRetiredReadToolIdRewriter({ retiredIds: new Set() });
  const untouched = registration("See menus_get_menu.");
  assert.equal(rewrite(untouched), untouched);
});

test("SINK AUDIT: in the real assistant catalog no published description or input-schema text names a retired read tool", () => {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const routeDeps = createRouteDeps() as unknown as RegistryDepsWithoutLimiter;
  const registrations = buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps }), { surfaceExchanges: createSurfaceExchangeStore() }, { contributions });
  const published = new Set(registrations.map((entry) => entry.descriptor.id));
  const retired = [...RETIRED_READ_TOOL_TO_CARD.keys()].filter((id) => !published.has(id));
  assert.ok(retired.includes("menus_list_menus"), "the menu card must be collapsed in this composition for the audit to mean anything");

  const offenders: string[] = [];
  for (const entry of registrations) {
    const plain = entry.descriptor.description.split(KEYWORD_MARKER)[0];
    const text = `${plain} ${JSON.stringify(entry.descriptor.inputSchema ?? {})}`;
    for (const id of retired) if (new RegExp(`\\b${id}\\b`).test(text)) offenders.push(`${entry.descriptor.id} -> ${id}`);
  }
  assert.deepEqual(offenders, []);
});
