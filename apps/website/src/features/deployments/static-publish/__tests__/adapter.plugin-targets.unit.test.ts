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
 * DATA (`responseHeaders`); the adapter itself adds no host header file. An id the registry does not
 * know, or a registry that will not load, is refused (T7b: there is no legacy branch left).
 *
 * Runs a REAL export of the hermetic fixture (same as `adapter.unit.test.ts`), never a real network.
 */

const publishOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-plugin-targets-"));
test.after(() => rmSync(publishOutputDir, { recursive: true, force: true }));

const NETLIFY_MODULE_PATH = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/deploy/targets/netlify.mjs");
const CLOUDFLARE_MODULE_PATH = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/deploy/targets/cloudflare-pages.mjs");
const VERCEL_MODULE_PATH = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/deploy/targets/vercel.mjs");
const GITHUB_PAGES_MODULE_PATH = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/deploy/targets/github-pages.mjs");

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
  return { descriptor: { id, label: id, module: `targets/${id}.mjs`, configFields: [] }, pluginId: "deploy", module };
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

test("every field the resolved credential carries reaches the module under its own name, whatever the host declares", async () => {
  let credential: DeployTargetCreateContext["credential"] | undefined;
  const module: DeployTargetModule = {
    create(context) {
      credential = context.credential;
      throw new Error("stop after create");
    },
  };

  await publishWith(
    { credentialSource: credentialSource({ siteId: "site-1", apiRegion: "eu" }), loadDeployTargets: async () => registryOf([loaded("acme-host", module)]) },
    { target: "acme-host" } as unknown as StaticPublishConfig,
  );

  assert.deepEqual(credential, { token: "tok", siteId: "site-1", apiRegion: "eu" });
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

test("the REAL plugin Cloudflare Pages module, fed through the adapter, sends _headers as a config form field, never an asset", async (t) => {
  const cloudflare = ((await import(pathToFileURL(CLOUDFLARE_MODULE_PATH).href)) as { default: DeployTargetModule }).default;
  let deployForm: FormData | undefined;
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    // The export itself fetches every page from the in-process app over loopback: let those through.
    if (!url.includes("cloudflare") && !url.includes("pages.dev")) return realFetch(input, init);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (/\/pages\/projects\/jini-demo$/.test(url)) return json(200, { success: true, result: { name: "jini-demo" } });
    if (url.endsWith("/upload-token")) return json(200, { success: true, result: { jwt: "jwt" } });
    if (url.endsWith("/pages/assets/check-missing")) return json(200, { success: true, result: [] });
    if (url.endsWith("/pages/assets/upsert-hashes")) return json(200, { success: true });
    if (url.endsWith("/deployments") && init.method === "POST") {
      deployForm = init.body as FormData;
      return json(200, { success: true, result: { id: "d1", url: "jini-demo.pages.dev" } });
    }
    if (url.startsWith("https://jini-demo.pages.dev")) return new Response("", { status: 200 });
    throw new Error(`unexpected Cloudflare call: ${init.method ?? "GET"} ${url}`);
  });

  const result = await publishWith(
    { credentialSource: credentialSource({ accountId: "acct" }), loadDeployTargets: async () => registryOf([loaded("cloudflare-pages", cloudflare)]) },
    { target: "cloudflare-pages" },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(await (deployForm?.get("_headers") as File).text(), renderHeadersFile());
  assert.equal(Object.keys(JSON.parse(String(deployForm?.get("manifest")))).includes("/_headers"), false);
});

test("the REAL plugin Vercel module, fed through the adapter, posts exactly one vercel.json rendered from the live header set", async (t) => {
  const vercel = ((await import(pathToFileURL(VERCEL_MODULE_PATH).href)) as { default: DeployTargetModule }).default;
  let posted: string[] = [];
  let vercelJson: string | undefined;
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    // The export itself fetches every page from the in-process app over loopback: let those through.
    if (!url.includes("vercel")) return realFetch(input, init);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (init.method === "POST" && url.includes("/v13/deployments")) {
      const files = JSON.parse(String(init.body)).files as Array<{ file: string; data: string }>;
      posted = files.map((file) => file.file);
      vercelJson = Buffer.from(files.find((file) => file.file === "vercel.json")?.data ?? "", "base64").toString("utf8");
      return json(200, { id: "dpl_1", readyState: "QUEUED", url: "demo.vercel.app" });
    }
    if (url.includes("/v13/deployments/dpl_1")) return json(200, { id: "dpl_1", readyState: "READY", url: "demo.vercel.app" });
    if (url.startsWith("https://demo.vercel.app")) return new Response("", { status: 200 });
    throw new Error(`unexpected Vercel call: ${init.method ?? "GET"} ${url}`);
  });

  const result = await publishWith(
    { loadDeployTargets: async () => registryOf([loaded("vercel", vercel)]), hostKit: { ...createDeployHostKit(), sleep: async () => undefined } },
    { target: "vercel" },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(posted.filter((file) => file === "vercel.json").length, 1);
  const rule = { source: "/(.*)", headers: Object.entries(PUBLIC_PAGE_SECURITY_HEADERS).map(([key, value]) => ({ key, value })) };
  assert.ok(vercelJson !== undefined, "the publish must have posted a vercel.json");
  assert.deepEqual(JSON.parse(vercelJson), { headers: [rule] }, "vercel.json carries the live server's public-page header set on every path");
});

test("the REAL plugin GitHub Pages module, fed through the adapter, commits one .nojekyll and reports the /<repo> base path", async (t) => {
  const githubPages = ((await import(pathToFileURL(GITHUB_PAGES_MODULE_PATH).href)) as { default: DeployTargetModule }).default;
  let treePaths: string[] = [];
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    // The export itself fetches every page from the in-process app over loopback: let those through.
    if (!url.includes("github")) return realFetch(input, init);
    const method = init.method ?? "GET";
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (method === "GET" && url.includes("/git/ref/heads/")) return json(200, { object: { sha: "parent-sha" } });
    if (method === "POST" && url.endsWith("/git/blobs")) return json(201, { sha: "blob-sha" });
    if (method === "POST" && url.endsWith("/git/trees")) {
      treePaths = JSON.parse(String(init.body)).tree.map((entry: { path: string }) => entry.path);
      return json(201, { sha: "tree-sha" });
    }
    if (method === "POST" && url.endsWith("/git/commits")) return json(201, { sha: "commit-sha" });
    if (method === "PATCH") return json(200, {});
    if (method === "GET" && url.endsWith("/pages")) return json(200, { html_url: "https://octo.github.io/demo/", source: { branch: "gh-pages" } });
    if (method === "GET" && url.includes("/pages/builds")) return json(200, { status: "built", commit: "commit-sha" });
    if (url.startsWith("https://octo.github.io")) return new Response("", { status: 200 });
    throw new Error(`unexpected GitHub call: ${method} ${url}`);
  });

  const result = await publishWith(
    { loadDeployTargets: async () => registryOf([loaded("github-pages", githubPages)]), hostKit: { ...createDeployHostKit(), sleep: async () => undefined } },
    { target: "github-pages", owner: "octo", repo: "demo" },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.ok === true && result.basePath, "/demo");
  assert.equal(treePaths.filter((file) => file === ".nojekyll").length, 1);
  assert.deepEqual(treePaths.filter((file) => file === "_headers" || file === "vercel.json"), []);
});

test("an id the registry does not know is refused as INVALID_CONFIG, naming what is installed, before any credential or export work", async () => {
  const result = await publishWith(
    {
      credentialSource: { resolve: async () => assert.fail("no credential lookup"), isConfigured: async () => assert.fail("unused") },
      loadDeployTargets: async () => registryOf([loaded("netlify", { create: () => assert.fail("netlify module must not be used") })]),
    },
    { target: "cloudflare-pages" },
  );
  assert.deepEqual(result, { ok: false, code: "INVALID_CONFIG", message: "publish target 'cloudflare-pages' is not available; choose one of: netlify" });
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

test("a registry that fails to load is refused as INVALID_CONFIG with the reason, never published some other way", async () => {
  const result = await publishWith(
    {
      credentialSource: { resolve: async () => assert.fail("no credential lookup"), isConfigured: async () => assert.fail("unused") },
      loadDeployTargets: async () => {
        throw new Error("EACCES: packages dir unreadable");
      },
    },
    { target: "cloudflare-pages" },
  );
  assert.deepEqual(result, { ok: false, code: "INVALID_CONFIG", message: "publish targets could not be loaded: EACCES: packages dir unreadable" });
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
