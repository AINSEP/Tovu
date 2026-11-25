import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminMediaProviderCatalogRoute, registerAdminMediaPutProvidersRoute } from "#src/server/runtime/composition/modules/media";
import type { MediaProviderRouteDeps } from "../deps.js";
import { mediaProviderDefinition, type MediaProviderContribution, type MediaProviderRegistry } from "@jini-ai/integrations/media-providers";
import { createHostMediaProviderRegistry } from "#src/features/media-generation/host-media-providers";

/**
 * @file `GET .../media/providers/catalog`: the admin External Providers cards, projected from the
 * composed (boot) media-provider registry that generation dispatches through. Pins one card for the
 * `grok`/`xai-grok-imagine` alias pair and that no key, token or raw provider error reaches the body.
 */

const WORKSPACE_ID = "workspace-local";
const CATALOG = `/api/admin/v1/workspaces/${WORKSPACE_ID}/media/providers/catalog`;
const PROVIDERS = `/api/admin/v1/workspaces/${WORKSPACE_ID}/media/providers`;
const SECRET_KEY = "xai-SECRET-KEY-0123456789";
const RAW_ERROR = "upstream 401: bearer xai-RAW-TOKEN-999 rejected";

type CatalogBody = { providers: Array<{ id: string; label: string; defaultBaseUrl?: string; models?: string[] }> };

function buildApp(depsOverrides: Partial<MediaProviderRouteDeps> = {}): express.Express {
  const routeErrors = createRouteIncidentReporter().errors;
  const base = createRouteDeps();
  const deps: MediaProviderRouteDeps = {
    workspaceId: base.workspaceId,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: base.clock,
    mediaProviderCredentialRepo: base.mediaProviderCredentialRepo,
    siteAssistantSecretSealer: base.siteAssistantSecretSealer,
    mediaProviderRegistry: base.mediaProviderRegistry,
    siteAssistantSecretKeyring: base.siteAssistantSecretKeyring,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminMediaProviderCatalogRoute({ errors: routeErrors, app, deps });
  registerAdminMediaPutProvidersRoute({ errors: routeErrors, app, deps });
  return app;
}

async function call(t: import("node:test").TestContext, app: express.Express, path: string, init: RequestInit = {}) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text || "{}") as unknown };
}

/** A legacy-spelled plugin build that still registers the old public id `grok`. */
function legacyGrokContribution(): MediaProviderContribution {
  return {
    provider: { id: "grok", label: "Grok (legacy)", hint: "", integrated: true },
    models: [{ id: "legacy-grok-image", label: "legacy", hint: "", provider: "grok", caps: ["t2i"] }],
    adapters: {},
  } as unknown as MediaProviderContribution;
}

/** A contribution whose provider getter throws a raw upstream error: the registry records a refusal. */
function throwingContribution(): MediaProviderContribution {
  return { get provider(): never { throw new Error(RAW_ERROR); }, models: [], adapters: {} } as unknown as MediaProviderContribution;
}

test("boot lists one xAI provider without leaking a key or raw provider error", async (t) => {
  const registry = createRouteDeps().mediaProviderRegistry as MediaProviderRegistry;
  registry.providers.contribute({ definition: mediaProviderDefinition({ contribution: legacyGrokContribution() }), pluginId: "legacy-grok" });
  registry.providers.contribute({ definition: { id: "broken_vendor", label: "Broken", provider: throwingContribution() }, pluginId: "broken" });
  const app = buildApp({ mediaProviderRegistry: registry });
  const saved = await call(t, app, PROVIDERS, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ "xai-grok-imagine": { apiKey: SECRET_KEY } }) });
  assert.equal(saved.status, 200, saved.text);

  const { status, text, json } = await call(t, app, CATALOG);
  assert.equal(status, 200, text);
  const ids = (json as CatalogBody).providers.map((provider) => provider.id);
  assert.deepEqual(ids.filter((id) => /grok|xai/i.test(id)), ["xai-grok-imagine"], "one xAI card for both aliases");
  assert.equal(new Set(ids).size, ids.length, "every card id is unique, so the tab count is one per provider");
  const xai = (json as CatalogBody).providers.find((provider) => provider.id === "xai-grok-imagine");
  assert.ok((xai?.models ?? []).length > 0, "model choices come from the live contribution");
  for (const leak of [SECRET_KEY, "SECRET", RAW_ERROR, "RAW-TOKEN", "apiKey"]) assert.ok(!text.includes(leak), `catalog leaked ${leak}`);
});

test("catalog keeps disabled-for-settings vendors out and integrated:false vendors in", async (t) => {
  const { text, json } = await call(t, buildApp({ mediaProviderRegistry: createHostMediaProviderRegistry() }), CATALOG);
  const ids = (json as CatalogBody).providers.map((provider) => provider.id);
  assert.ok(!ids.includes("hyperframes"), text);
  assert.ok(!ids.includes("stub"), text);
  assert.ok(ids.includes("bfl"), "a real vendor whose adapter is not ported yet still takes a key");
});

test("catalog copies only safe fields from a plugin contribution", async (t) => {
  const registry = createHostMediaProviderRegistry();
  const contribution = {
    provider: { id: "acme-media", label: "Acme", hint: "", integrated: true, defaultBaseUrl: "https://api.acme.test/v1?key=acme-SECRET", apiKey: "acme-SECRET", lastError: RAW_ERROR },
    models: [{ id: "acme-1", label: "Acme 1", hint: "", provider: "acme-media", caps: ["t2i"] }],
    adapters: {},
  } as unknown as MediaProviderContribution;
  assert.equal(registry.providers.contribute({ definition: mediaProviderDefinition({ contribution }), pluginId: "acme" }), true);
  const { text, json } = await call(t, buildApp({ mediaProviderRegistry: registry }), CATALOG);
  assert.deepEqual((json as CatalogBody).providers.find((provider) => provider.id === "acme-media"), { id: "acme-media", label: "Acme", models: ["acme-1"] });
  assert.ok(!text.includes("SECRET") && !text.includes("RAW-TOKEN"), text);
});

test("catalog: media.read denied 403s", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no-match" }) as never });
  const { status } = await call(t, app, CATALOG);
  assert.equal(status, 403);
});
