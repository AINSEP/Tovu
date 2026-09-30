import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";
import type { AdminSitesDeps } from "../../inbound/admin-http/routes/system/sites.js";

/**
 * @file Create-site onboarding's optional `agentPluginTokens` on `POST .../system/sites`
 * (`inbound/admin-http/routes/system/sites.ts`), plus `GET .../system/sites/token-sign-in-plugins`.
 * The token check, the seal into the new site and `createSite` are injected on the route deps (the
 * route's own DI seams, which `RouteDeps` does not declare — hence the cast), so this proves the HTTP
 * contract only: a bad or rejected token refuses the create with nothing made; a good one is checked,
 * the site is made, and the token is sealed for it; a seal failure still reports the created site.
 */

const TOKEN = "sbp_route_token_never_echoed";

type TokenDeps = Required<Pick<AdminSitesDeps, "checkAgentPluginAccessToken" | "sealPendingAgentPluginTokens">>;

function setup(overrides: Partial<TokenDeps> & { listTokenSignInPlugins?: AdminSitesDeps["listTokenSignInPlugins"] } = {}) {
  const created: string[] = [];
  const checked: Array<{ pluginId: string; token: string }> = [];
  const sealed: Array<{ siteDir: string; siteKeyId: string; tokens: Readonly<Record<string, string>> }> = [];
  const tokenDeps: TokenDeps = {
    checkAgentPluginAccessToken: async (_deps, input) => (checked.push(input), "ok"),
    sealPendingAgentPluginTokens: async (required) => void sealed.push(required),
    ...overrides,
  };
  const deps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    createSite: async (required: { name: string }) => {
      created.push(required.name);
      return { name: required.name, dir: `/repo/sites/${required.name}`, siteId: "generated-id" };
    },
    ...tokenDeps,
    ...(overrides.listTokenSignInPlugins ? { listTokenSignInPlugins: overrides.listTokenSignInPlugins } : {}),
  } as RouteDeps;
  return { deps, created, checked, sealed };
}

async function create(deps: RouteDeps, t: Parameters<typeof bootAuthenticated>[1], body: unknown) {
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

test("a malformed agentPluginTokens is a 400 VALIDATION_ERROR: no check, no site, no seal", async (t) => {
  const env = setup();
  const res = await create(env.deps, t, { name: "new-site", agentPluginTokens: ["sbp_x"] });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.text).code, "VALIDATION_ERROR");
  assert.deepEqual([env.checked, env.created, env.sealed], [[], [], []]);
});

test("a token the vendor rejects is a 400 naming the plugin: no site is made, and the token is not echoed", async (t) => {
  const env = setup({ checkAgentPluginAccessToken: async () => "invalid" });
  const res = await create(env.deps, t, { name: "new-site", agentPluginTokens: { supabase: TOKEN } });
  assert.equal(res.status, 400);
  const body = JSON.parse(res.text);
  assert.equal(body.code, "AGENT_PLUGIN_TOKEN_INVALID");
  assert.match(body.error, /Supabase access token didn't work.*No site was created\./);
  assert.ok(!res.text.includes(TOKEN));
  assert.deepEqual([env.created, env.sealed], [[], []]);
});

test("a plugin that takes no token is a 400 AGENT_PLUGIN_TOKEN_UNSUPPORTED: no site is made", async (t) => {
  const env = setup({ checkAgentPluginAccessToken: async () => "unsupported" });
  const res = await create(env.deps, t, { name: "new-site", agentPluginTokens: { nope: TOKEN } });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.text).code, "AGENT_PLUGIN_TOKEN_UNSUPPORTED");
  assert.deepEqual(env.created, []);
});

test("a checked token: 201, the site is made, and the token is sealed with the new site's key into its folder", async (t) => {
  const env = setup();
  const res = await create(env.deps, t, { name: "new-site", agentPluginTokens: { supabase: `  ${TOKEN}  `, other: "   " } });
  assert.equal(res.status, 201);
  assert.deepEqual(JSON.parse(res.text), {
    site: { name: "new-site", dir: "/repo/sites/new-site", siteId: "generated-id" },
    agentPluginTokens: { status: "saved", pluginIds: ["supabase"] },
  });
  assert.ok(!res.text.includes(TOKEN));
  assert.deepEqual(env.checked, [{ pluginId: "supabase", token: TOKEN }], "trimmed, blanks dropped, checked before create");
  assert.deepEqual(env.created, ["new-site"]);
  assert.deepEqual(env.sealed, [{ siteDir: "/repo/sites/new-site", siteKeyId: "generated-id", tokens: { supabase: TOKEN } }]);
});

test("an unreachable vendor does not block the create: the token is still stored for the first boot", async (t) => {
  const env = setup({ checkAgentPluginAccessToken: async () => "unavailable" });
  const res = await create(env.deps, t, { name: "new-site", agentPluginTokens: { supabase: TOKEN } });
  assert.equal(res.status, 201);
  assert.equal(JSON.parse(res.text).agentPluginTokens.status, "saved");
});

test("a seal failure after create is reported, not thrown: 201 with status failed, and the error names no token", async (t) => {
  const env = setup({
    sealPendingAgentPluginTokens: async () => {
      throw new Error("could not prepare the new site's key to store its access tokens (refuse)");
    },
  });
  const logged: string[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => void logged.push(args.map(String).join(" ")));
  const res = await create(env.deps, t, { name: "new-site", agentPluginTokens: { supabase: TOKEN } });
  assert.equal(res.status, 201);
  assert.deepEqual(JSON.parse(res.text).agentPluginTokens, { status: "failed", pluginIds: ["supabase"] });
  assert.deepEqual(env.created, ["new-site"]);
  assert.ok(logged.some((line) => line.includes("the new site's access tokens could not be stored")));
  assert.ok(!logged.join("").includes(TOKEN));
});

test("GET token-sign-in-plugins lists the plugins that take a pasted token", async (t) => {
  const plugins = [{ pluginId: "supabase", displayName: "Supabase", helpUrl: "https://supabase.com/dashboard/account/tokens" }];
  const env = setup({ listTokenSignInPlugins: async () => plugins });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(env.deps), t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${env.deps.workspaceId}/system/sites/token-sign-in-plugins`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { plugins });
});
