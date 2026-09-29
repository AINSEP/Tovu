import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import type { DeployTarget } from "@jini-ai/devops/deploy";

import { PUBLIC_PAGE_SECURITY_HEADERS } from "#src/contracts/core/public-page-security-headers";
import { createDeployHostKit } from "#src/features/deployments/deploy-targets/host-kit";
import type {
  DeployHostKit,
  DeployTargetCreateContext,
  DeployTargetModule,
  DeployTargetRegistry,
  HostDeployPublishInput,
  LoadedDeployTarget,
} from "#src/features/deployments/deploy-targets/types";
import { renderHeadersFile } from "#src/features/site-export/static-security-headers";
import { createRouteDeps } from "#src/server/runtime/composition/app";

import { publishStaticSite, type StaticPublishDeps } from "../adapter.js";
import type { PublishCredentialSource, StaticPublishConfig } from "../types.js";

/**
 * @file The static-publish adapter's plugin path (deploy plan T2, strangler): a target id the
 * deploy-target registry knows is built by the plugin's module and handed the security headers as
 * DATA (`responseHeaders`); the adapter itself no longer adds a host header file for it. Ids the
 * registry does not know keep the legacy branches, unchanged, until their own slices move them.
 *
 * Runs a REAL export of the hermetic fixture (same as `adapter.unit.test.ts`), never a real network.
 */

const publishOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-plugin-targets-"));
test.after(() => rmSync(publishOutputDir, { recursive: true, force: true }));

const NETLIFY_MODULE_PATH = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/deploy/targets/netlify.mjs");

function credentialSource(extra: Record<string, string> = {}): PublishCredentialSource {
  return {
    async resolve() {
      return { ok: true, token: "tok", ...extra };
    },
    async isConfigured() {
      return { configured: true };
    },
  };
}

function registryOf(targets: readonly LoadedDeployTarget[]): DeployTargetRegistry {
  return { get: (id) => targets.find((target) => target.descriptor.id === id), list: () => targets, refusals: [] };
}

function loaded(id: string, module: DeployTargetModule): LoadedDeployTarget {
  return { descriptor: { id, label: id, module: `targets/${id}.mjs` }, pluginId: "deploy", module };
}

async function publishWith(deps: Omit<StaticPublishDeps, "credentialSource"> & { credentialSource?: PublishCredentialSource }, config: StaticPublishConfig) {
  const routeDeps = createRouteDeps();
  routeDeps.publishOutputRootDir = publishOutputDir;
  return publishStaticSite(
    { credentialSource: credentialSource(), ...deps },
    { workspaceId: routeDeps.workspaceId, publishOutputRootDir: publishOutputDir, idGen: routeDeps.idGen, exportSiteBound: routeDeps.exportSiteBound, config, projectName: "demo" },
  );
}

test("a registry-known target is built by its plugin module, gets responseHeaders as data, and the adapter adds no header file", async () => {
  const seen: { context?: DeployTargetCreateContext; input?: HostDeployPublishInput; workspaceId?: string } = {};
  const kit = { marker: "kit" } as unknown as DeployHostKit;
  const module: DeployTargetModule = {
    create(context) {
      seen.context = context;
      return {
        id: "netlify",
        async publish(input: HostDeployPublishInput) {
          seen.input = input;
          return { targetId: "netlify", url: "https://demo.netlify.app", status: "ready" };
        },
        async checkReachability() {
          return { reachable: true };
        },
      } satisfies DeployTarget;
    },
  };

  const result = await publishWith(
    {
      loadDeployTargets: async (workspaceId) => {
        seen.workspaceId = workspaceId;
        return registryOf([loaded("netlify", module)]);
      },
      hostKit: kit,
    },
    { target: "netlify" },
  );

  assert.deepEqual(result, { ok: true, targetId: "netlify", url: "https://demo.netlify.app", status: "ready" });
  assert.equal(seen.workspaceId, createRouteDeps().workspaceId);
  assert.equal(seen.context?.credential.token, "tok");
  assert.equal(seen.context?.kit, kit);
  assert.deepEqual(seen.input?.responseHeaders, PUBLIC_PAGE_SECURITY_HEADERS);
  assert.ok(seen.input?.files.some((file) => file.file === "index.html"));
  assert.deepEqual(seen.input?.files.filter((file) => file.file === "_headers" || file.file === "vercel.json"), []);
});

test("the REAL plugin Netlify module, fed through the adapter, uploads exactly one _headers rendered from the live header set", async (t) => {
  const netlify = ((await import(pathToFileURL(NETLIFY_MODULE_PATH).href)) as { default: DeployTargetModule }).default;
  const uploads = new Map<string, string>();
  let manifestPaths: string[] = [];
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    // The export itself fetches every page from the in-process app over loopback: let those through.
    if (!url.includes("netlify")) return realFetch(input, init);
    const method = init.method ?? "GET";
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (method === "GET" && url.includes("/sites?")) return json(200, [{ id: "site_1", name: "jini-demo", ssl_url: "https://jini-demo.netlify.app" }]);
    if (method === "POST" && url.endsWith("/deploys")) {
      const manifest = JSON.parse(String(init.body)).files as Record<string, string>;
      manifestPaths = Object.keys(manifest);
      return json(200, { id: "deploy_1", state: "preparing", required: [...new Set(Object.values(manifest))] });
    }
    if (method === "PUT") {
      uploads.set(decodeURIComponent(url.split("/files/")[1]!), Buffer.from(init.body as Buffer).toString("utf8"));
      return json(200, {});
    }
    if (method === "GET" && url.endsWith("/deploys/deploy_1")) return json(200, { id: "deploy_1", state: "ready", ssl_url: "https://jini-demo.netlify.app" });
    return new Response("", { status: 200 });
  });

  const result = await publishWith(
    { loadDeployTargets: async () => registryOf([loaded("netlify", netlify)]), hostKit: { ...createDeployHostKit(), sleep: async () => undefined } },
    { target: "netlify" },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(manifestPaths.filter((file) => file === "/_headers").length, 1);
  assert.equal(uploads.get("_headers"), renderHeadersFile());
});

test("an id the registry does not know keeps the legacy branch (cloudflare-pages still demands an accountId there)", async () => {
  const result = await publishWith(
    { loadDeployTargets: async () => registryOf([loaded("netlify", { create: () => assert.fail("netlify module must not be used") })]) },
    { target: "cloudflare-pages" },
  );
  assert.deepEqual(result, {
    ok: false,
    code: "NO_CREDENTIALS_CONFIGURED",
    message: "credential is not usable for cloudflare-pages: Cloudflare account ID is required but was not resolved from the saved credential.",
  });
});

test("a module's validateConfig refusal is returned as INVALID_CONFIG before any credential or export work", async () => {
  const result = await publishWith(
    {
      credentialSource: { resolve: async () => assert.fail("no credential lookup"), isConfigured: async () => assert.fail("unused") },
      loadDeployTargets: async () => registryOf([loaded("netlify", { validateConfig: () => "site must be chosen", create: () => assert.fail("not built") })]),
    },
    { target: "netlify" },
  );
  assert.deepEqual(result, { ok: false, code: "INVALID_CONFIG", message: "site must be chosen" });
});

test("a module whose create() throws is reported like a legacy unusable credential", async () => {
  const result = await publishWith(
    {
      loadDeployTargets: async () =>
        registryOf([
          loaded("netlify", {
            create: () => {
              throw new Error("Netlify token is required.");
            },
          }),
        ]),
    },
    { target: "netlify" },
  );
  assert.deepEqual(result, { ok: false, code: "NO_CREDENTIALS_CONFIGURED", message: "credential is not usable for netlify: Netlify token is required." });
});

test("a registry that fails to load falls back to the legacy branch instead of failing the publish", async () => {
  const result = await publishWith(
    {
      loadDeployTargets: async () => {
        throw new Error("EACCES: packages dir unreadable");
      },
    },
    { target: "cloudflare-pages" },
  );
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "NO_CREDENTIALS_CONFIGURED");
});

test("a supplied buildTarget (the target-construction test seam) still wins over the registry", async () => {
  let built = false;
  const result = await publishWith(
    {
      loadDeployTargets: async () => registryOf([loaded("netlify", { create: () => assert.fail("registry must not be consulted") })]),
      buildTarget: () => {
        built = true;
        return {
          id: "fake",
          async publish() {
            return { targetId: "fake", url: "https://fake.test/", status: "ready" as const };
          },
          async checkReachability() {
            return { reachable: true };
          },
        };
      },
    },
    { target: "netlify" },
  );
  assert.equal(built, true);
  assert.equal(result.ok, true);
});
