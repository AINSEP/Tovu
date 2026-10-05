import assert from "node:assert/strict";
import test from "node:test";

import { ForbiddenError } from "@jini-ai/cms/core";
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import type { SiteListEntry } from "#src/platform/site-dir/index";

import type { SitesToolDeps } from "../deps.js";
import { SITE_SWITCH_RESTART_INSTRUCTIONS } from "../site-admin.js";
import { buildSitesRegistrations } from "../tool-registrations.js";

/**
 * @file `sites_create_site` / `sites_switch_site` — the chat half of the admin Sites screen's
 * Create / Activate, through the same `site-admin.ts` functions. Fake `SitesToolDeps` only. Every
 * refusal also asserts the side-effecting fake never ran.
 */

const PRINCIPAL_ID = "principal-under-test";
const SITE: SiteListEntry = { name: "alpha", dir: "/repo/sites/alpha", displayName: "Alpha", createdAt: "2026-10-05T00:00:00.000Z", active: false };

function ctxFor(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-sites",
    principal: { id: PRINCIPAL_ID } as ToolExecutionContext["principal"],
    run: { id: "run-1" } as ToolExecutionContext["run"],
    input,
    signal: new AbortController().signal,
  };
}

interface Fake {
  deps: SitesToolDeps;
  creates: unknown[];
  persists: unknown[];
  authorizeCalls: number;
}

function fake(options: { allow?: boolean; switcherEnabled?: boolean; switcherCompatible?: boolean } = {}): Fake {
  const state: Fake = { creates: [], persists: [], authorizeCalls: 0, deps: undefined as never };
  state.deps = {
    workspaceId: "ws-sites",
    authorize: async () => (state.authorizeCalls++, { allowed: options.allow ?? true, reason: options.allow === false ? "denied" : "matched" }),
    isSiteSwitcherEnabled: () => options.switcherEnabled ?? true,
    listSites: () => [SITE],
    createSite: async (required, optional) => (state.creates.push([required, optional]), { name: required.name, dir: `/repo/sites/${required.name}`, siteId: "new-id" } as never),
    persistActiveSite: (required, optional) => void state.persists.push([required, optional]),
    siteBinding: options.switcherCompatible === false
      ? { dir: "/some/site", name: "some-site", dirOverridden: true, switcherCompatible: false }
      : { dir: "/repo/sites/served", name: "served", dirOverridden: false, switcherCompatible: true },
  };
  return state;
}

function handlerFor(deps: SitesToolDeps, id: string): ToolRegistration["handler"] {
  const found = buildSitesRegistrations(deps).find((registration) => registration.descriptor.id === id);
  assert.ok(found, `expected a registration for '${id}'`);
  return found.handler;
}

test("sites_create_site: creates under the served tree and returns the new site", async () => {
  const env = fake();
  const result = await handlerFor(env.deps, "sites_create_site")(ctxFor({ name: "beta" }));
  assert.deepEqual(env.creates, [[{ name: "beta" }, { cwd: "/repo" }]]);
  assert.deepEqual(result, { name: "beta", dir: "/repo/sites/beta", siteId: "new-id" });
});

test("sites_create_site: a name outside the folder pattern is refused before anything runs", async () => {
  const env = fake();
  await assert.rejects(() => handlerFor(env.deps, "sites_create_site")(ctxFor({ name: "../x" })), (err: unknown) => err instanceof Error && err.name === "SitesInputError");
  assert.equal(env.authorizeCalls, 0);
  assert.equal(env.creates.length, 0);
});

test("sites_create_site: flag off refuses SITE_SWITCHING_DISABLED before authorize", async () => {
  const env = fake({ switcherEnabled: false });
  await assert.rejects(
    () => handlerFor(env.deps, "sites_create_site")(ctxFor({ name: "beta" })),
    (err: unknown) => err instanceof Error && (err as { code?: string }).code === "SITE_SWITCHING_DISABLED" && err.message === "site switching is disabled on this deployment",
  );
  assert.equal(env.authorizeCalls, 0);
  assert.equal(env.creates.length, 0);
});

test("sites_create_site: an occupied name comes back with the schema attached (a retry with another name fixes it)", async () => {
  const env = fake();
  env.deps.createSite = async () => {
    const { InitDirNotEmptyError } = await import("#src/platform/site-dir/index");
    throw new InitDirNotEmptyError("sites/beta already exists");
  };
  await assert.rejects(
    () => handlerFor(env.deps, "sites_create_site")(ctxFor({ name: "beta" })),
    (err: unknown) => err instanceof Error && err.name === "ToolInputError" && err.message.includes("sites/beta already exists"),
  );
});

test("sites_create_site: a caller without system.write is refused and nothing is created", async () => {
  const env = fake({ allow: false });
  await assert.rejects(() => handlerFor(env.deps, "sites_create_site")(ctxFor({ name: "beta" })), (err: unknown) => err instanceof ForbiddenError);
  assert.equal(env.creates.length, 0);
});

test("sites_switch_site: persists the choice and returns the restart instructions", async () => {
  const env = fake();
  const result = await handlerFor(env.deps, "sites_switch_site")(ctxFor({ name: "alpha" }));
  assert.deepEqual(env.persists, [[{ name: "alpha" }, { cwd: "/repo" }]]);
  assert.deepEqual(result, { activeSiteName: "alpha", restartRequired: true, restartInstructions: SITE_SWITCH_RESTART_INSTRUCTIONS });
});

test("sites_switch_site: an unknown site is a schema-attached refusal and nothing is persisted", async () => {
  const env = fake();
  await assert.rejects(
    () => handlerFor(env.deps, "sites_switch_site")(ctxFor({ name: "ghost" })),
    (err: unknown) => err instanceof Error && err.name === "ToolInputError" && err.message.includes("site 'ghost' was not found"),
  );
  assert.equal(env.persists.length, 0);
});

test("sites_switch_site: an install-dir boot refuses SITE_BINDING_NOT_SWITCHABLE before authorize", async () => {
  const env = fake({ switcherCompatible: false });
  await assert.rejects(
    () => handlerFor(env.deps, "sites_switch_site")(ctxFor({ name: "alpha" })),
    (err: unknown) => err instanceof Error && (err as { code?: string }).code === "SITE_BINDING_NOT_SWITCHABLE",
  );
  assert.equal(env.authorizeCalls, 0);
  assert.equal(env.persists.length, 0);
});
