import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import type { DeployFile, DeployPublishInput, DeployPublishResult, DeployTarget } from "@jini-ai/devops/deploy";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import type { RouteDeps } from "#src/server/routes/types";

import { publishStaticSite, readStaticPublishConfig, toDeployFile, publishOutputDir as computePublishOutputDir } from "../adapter.js";
import type { HostDeployPublishInput } from "#src/features/deployments/deploy-targets/types";
import type { PublishCredentialSource, StaticPublishConfig } from "../types.js";
import { PUBLIC_PAGE_SECURITY_HEADERS } from "#src/contracts/core/public-page-security-headers";

/**
 * @file `static-publish/adapter.ts` unit tests: a missing token fails cleanly without leaking; the
 * exporter's own output maps to `DeployFile[]` with deploy-relative paths intact and NO host file
 * added by core (`.nojekyll`, `_headers`, `vercel.json` are each target module's job, covered by the
 * `bundled-deploy-*` plugin tests); the base path comes from the registry's target module.
 *
 * Every test redirects `RouteDeps.publishOutputRootDir` to a throwaway temp directory (via
 * {@link testRouteDeps} below, matching `export-site-route.test.ts`'s own precedent for
 * `exportOutputRootDir`) and injects a FAKE `DeployTarget` via `StaticPublishDeps.buildTarget` —
 * this suite runs a REAL `exportSite` pass against the hermetic `testRouteDeps()` fixture (real,
 * in-process, no external network), but NEVER constructs a real
 * `GitHubPagesDeployTarget`/`VercelDeployTarget` and NEVER touches `fetch`/GitHub/Vercel.
 */

const publishOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-adapter-test-"));
test.after(() => rmSync(publishOutputDir, { recursive: true, force: true }));

/** The hermetic fixture, with `publishOutputRootDir` redirected to this file's own throwaway temp
 *  dir — `publishStaticSite` reads this field instead of `process.env.TOVU_PUBLISH_DIR` (adapter.ts
 *  no longer reads env vars at all), so overriding it here is what keeps this suite's real
 *  `exportSite` writes off the checked-out repo, same as every other `RouteDeps` field a test
 *  overrides.
 *
 *  MUTATES the object `createRouteDeps()` returns rather than spreading a copy — deliberately, since
 *  2026-08-20 (RouteDeps-narrowing fix): `RouteDeps.exportSiteBound` is a closure bound to ONE object
 *  identity, at construction time, inside `createRouteDeps()` itself. A spread here would produce a
 *  logically-overridden but DIFFERENT object that closure never sees, so ANY later override of a
 *  field the real `exportSite` reads internally (e.g. `createSiteApp`, see the "an asset that fails
 *  to export" test below) would silently never apply. See `routes/types.ts`'s `exportSiteBound` doc
 *  for this same gotcha, generalized. Every call site below therefore also takes `testRouteDeps()`'s
 *  return value directly (`const deps = testRouteDeps()`), never re-spreading it a second time. */
/** The bundled deploy plugin's targets, read from source — what decides config fields, validation
 *  and base path for every publish below (a test's `buildTarget` replaces only the module's `create`). */
const hermeticDeployTargets = createRouteDeps().loadDeployTargets;

function testRouteDeps(): ReturnType<typeof createRouteDeps> {
  const deps = createRouteDeps();
  deps.publishOutputRootDir = publishOutputDir;
  return deps;
}

/** Records every `publish()` call's file set and returns a canned success result — the "faked deploy
 *  target" the brief asks for. Never touches `fetch`. */
function fakeDeployTarget(capturedFiles: { value: DeployFile[] | null }): DeployTarget {
  return {
    id: "fake",
    async publish(input: DeployPublishInput): Promise<DeployPublishResult> {
      capturedFiles.value = input.files;
      return { targetId: "fake", url: "https://example.test/published", status: "ready" };
    },
    async checkReachability() {
      return { reachable: true, status: "ready" as const };
    },
  };
}

/** Wraps the real `createApp` so ONE exact asset path always 500s, while every other route/asset
 *  still round-trips through the real app unchanged — the asset-side analog of
 *  `site-exporter.test.ts`'s own `FailingSlugPostRepo` (routes), injected via
 *  `RouteDeps.createSiteApp` since neither `/theme-assets/*` nor `/agent-icons/*` is backed by an
 *  injectable Port (only `/m/...` media renditions are, and the seeded demo workspace never
 *  references one — confirmed by discovery pass before writing this test).
 *
 *  Takes `routeDeps` as an explicit argument (not a parameter of the returned function) since
 *  2026-08-20 (RouteDeps-narrowing pass 2): `RouteDeps.createSiteApp` itself is now NULLARY (`() =>
 *  Express`, closed over its own `routeDeps` at composition-root construction time — see that
 *  field's doc in `server/routes/types.ts`), so the fake assigned to `deps.createSiteApp` below must
 *  match that same nullary shape. */
function createSiteAppWithFailingAsset(failingPath: string, routeDeps: ReturnType<typeof createRouteDeps>): () => ReturnType<typeof createApp> {
  return () => {
    const wrapper = express();
    wrapper.get(failingPath, (_req, res) => {
      res.status(500).json({ error: "forced failure for export-engine asset regression test" });
    });
    wrapper.use(createApp(routeDeps));
    return wrapper;
  };
}

function neverCalledCredentialSource(): PublishCredentialSource {
  return {
    async resolve() {
      throw new Error("credentialSource.resolve must not be called for an already-invalid config");
    },
    async isConfigured() {
      throw new Error("credentialSource.isConfigured must not be called by publishStaticSite (it always resolves for real)");
    },
  };
}

test("toDeployFile: preserves deploy-relative path and data, normalizing to forward slashes", () => {
  assert.deepEqual(toDeployFile({ outputFile: "about/index.html", data: "<html></html>", contentType: "text/html" }), {
    file: "about/index.html",
    data: "<html></html>",
    contentType: "text/html",
  });
  // No contentType supplied -> field omitted, never `undefined` (an explicit-undefined field would
  // still serialize as a key in some downstream JSON paths; omission is the honest "not present").
  const withoutContentType = toDeployFile({ outputFile: "robots.txt", data: "User-agent: *" });
  assert.deepEqual(withoutContentType, { file: "robots.txt", data: "User-agent: *" });
  assert.ok(!("contentType" in withoutContentType));
});

test("toDeployFile: a literal null contentType (a fetched response with no Content-Type header) is omitted, same as undefined", () => {
  const withNullContentType = toDeployFile({ outputFile: "404.html", data: "<html></html>", contentType: null });
  assert.deepEqual(withNullContentType, { file: "404.html", data: "<html></html>" });
  assert.ok(!("contentType" in withNullContentType));
});

test("publishStaticSite: an invalid config is rejected before credentials or the deploy target are ever touched", async () => {
  const deps = testRouteDeps();
  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets, credentialSource: neverCalledCredentialSource() },
    {
      workspaceId: "does-not-matter",
      publishOutputRootDir: deps.publishOutputRootDir,
      idGen: deps.idGen,
      exportSiteBound: deps.exportSiteBound,
      config: { target: "github-pages", owner: "not valid owner!!", repo: "demo" },
      projectName: "demo",
    }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "INVALID_CONFIG");
  assert.match(result.message, /invalid GitHub owner/);
});

test("publishStaticSite: a missing token fails cleanly with NO_CREDENTIALS_CONFIGURED, before any export or publish attempt", async () => {
  let exportAttempts = 0;
  const deps: RouteDeps = testRouteDeps();

  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: { async resolve() { return { ok: false, reason: "GITHUB_TOKEN is not set" }; }, async isConfigured() { return { configured: false, reason: "GITHUB_TOKEN is not set" }; } },
      buildTarget: () => {
        throw new Error("buildTarget must not be called when no credential was resolved");
      },
    },
    {
      workspaceId: deps.workspaceId,
      publishOutputRootDir: deps.publishOutputRootDir,
      idGen: deps.idGen,
      exportSiteBound: async (options) => { exportAttempts += 1; return deps.exportSiteBound(options); },
      config: { target: "github-pages", owner: "octo", repo: "demo" },
      projectName: "demo",
    }
  );

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
  assert.equal(result.message, "GITHUB_TOKEN is not set");
  assert.equal(exportAttempts, 0);
  // "Fails cleanly without leaking": the message NAMES the missing env var (helpful, expected —
  // "GITHUB_TOKEN" legitimately contains the substring "token") but must never carry a `Bearer `
  // header shape or a `key": "value"` pair that would indicate an actual credential VALUE leaked
  // into the response. There is no token in scope on this path at all, and this is the proof.
  assert.doesNotMatch(JSON.stringify(result), /Bearer |ghp_[A-Za-z0-9]|["']token["']?\s*:\s*["'][^"']{4,}/i);
});

test("publishStaticSite: github-pages gets the module's /<repo> base path, core adds no .nojekyll, and real exported files map to deploy-relative DeployFile[]", async () => {
  const captured: { value: DeployFile[] | null } = { value: null };
  const deps: RouteDeps = testRouteDeps();

  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-used-by-fake-target" }; }, async isConfigured() { return { configured: true }; } },
      buildTarget: () => fakeDeployTarget(captured),
    },
    {
      workspaceId: deps.workspaceId,
      publishOutputRootDir: deps.publishOutputRootDir,
      idGen: deps.idGen,
      exportSiteBound: deps.exportSiteBound,
      config: { target: "github-pages", owner: "octo", repo: "demo-repo" },
      projectName: "demo",
    }
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.basePath, "/demo-repo");
  assert.ok(captured.value, "the fake deploy target must have been invoked");
  const files = captured.value!;

  // The marker is the github-pages MODULE's job (its publish adds it); a `buildTarget` fake replaces
  // that module, so what arrives here is exactly what core produced.
  assert.ok(!files.some((f) => f.file === ".nojekyll"), "core must not add a host marker file");

  // Deploy-relative paths intact: the hermetic fixture always renders a home page at "/", which
  // this exporter writes to "index.html" (site-exporter.ts's own pretty-URL convention) — never an
  // absolute path, never carrying the outputDir prefix.
  const index = files.find((f) => f.file === "index.html");
  assert.ok(index, "index.html must be present in the mapped file set");
  assert.ok(!index!.file.startsWith("/"), "DeployFile.file must be deploy-relative, never absolute");
  assert.ok(files.every((f) => !f.file.includes(publishOutputDir)), "no DeployFile.file may leak the local outputDir path");
});

test("publishStaticSite: does NOT inject .nojekyll for vercel, and never sets a base path", async () => {
  const captured: { value: DeployFile[] | null } = { value: null };
  const deps: RouteDeps = testRouteDeps();

  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-used-by-fake-target" }; }, async isConfigured() { return { configured: true }; } },
      buildTarget: () => fakeDeployTarget(captured),
    },
    {
      workspaceId: deps.workspaceId,
      publishOutputRootDir: deps.publishOutputRootDir,
      idGen: deps.idGen,
      exportSiteBound: deps.exportSiteBound,
      config: { target: "vercel" },
      projectName: "demo",
    }
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.basePath, undefined);
  assert.ok(captured.value, "the fake deploy target must have been invoked");
  assert.ok(!captured.value!.some((f) => f.file === ".nojekyll"), ".nojekyll must never be published to vercel");
});

/** Publishes the hermetic fixture to `config`'s target through a fake deploy target and returns what
 *  its `publish()` received. */
async function publishInputFor(config: StaticPublishConfig): Promise<HostDeployPublishInput> {
  let received: HostDeployPublishInput | undefined;
  const deps = testRouteDeps();
  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-used-by-fake-target", accountId: "acct-1" }; }, async isConfigured() { return { configured: true }; } },
      buildTarget: () => ({
        id: "fake",
        // The devops port passes response headers as its optional second argument.
        async publish(input: DeployPublishInput, optional?: Parameters<DeployTarget["publish"]>[1]): Promise<DeployPublishResult> {
          received = { ...input, ...optional };
          return { targetId: "fake", url: "https://example.test/published", status: "ready" };
        },
        async checkReachability() {
          return { reachable: true, status: "ready" as const };
        },
      }),
    },
    { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config, projectName: "demo" }
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(received, "the fake deploy target must have been invoked");
  return received!;
}

/** Static publishes carry the live server's security headers (see `static-security-headers.ts`) as
 *  DATA (`responseHeaders`) for every target — each module renders its own host's form — plus a
 *  `<meta name="referrer">` in every exported HTML page. Core writes no header file itself. */
test("publishStaticSite: every target gets the live security headers as data, and core adds no header file", async () => {
  const configs: StaticPublishConfig[] = [
    { target: "netlify" },
    { target: "vercel" },
    { target: "cloudflare-pages" },
    { target: "github-pages", owner: "octo", repo: "demo-repo" },
    { target: "s3-compatible" },
  ];
  for (const config of configs) {
    const input = await publishInputFor(config);
    assert.deepEqual(input.responseHeaders, PUBLIC_PAGE_SECURITY_HEADERS, config.target);
    assert.deepEqual(input.files.filter((f) => f.file === "_headers" || f.file === "vercel.json"), [], config.target);
    for (const page of ["index.html", "404.html"]) {
      const html = String(input.files.find((f) => f.file === page)?.data ?? "");
      assert.ok(html.includes(`<meta name="referrer" content="${PUBLIC_PAGE_SECURITY_HEADERS["Referrer-Policy"]}">`), `${config.target} ${page}`);
    }
  }
});

/**
 * HIGH audit finding (2026-08-19, Codex sol bug/architecture audit): `publishStaticSite` used to
 * reject only `report.routes.failed`, ignoring `report.assets.failed` entirely — a page could
 * export fine while its stylesheet or hero image 404s, and publishing would still report success
 * and deploy the broken HTML. Mirrors the existing "a missing token fails cleanly... before any
 * export or publish attempt" test's proof style: the FAKE deploy target must never fire.
 */
test("publishStaticSite: an asset that fails to export blocks publishing, the same as a failed route", async () => {
  const deps = testRouteDeps();
  // MUTATED in place, not spread into a copy — `deps.exportSiteBound` is a closure bound to THIS
  // exact object identity (see `testRouteDeps`'s own doc above). A spread here would silently lose
  // the override, the same gotcha `commit-site.unit.test.ts`'s identical fixture documents. As of
  // 2026-08-20 pass 2, `createSiteApp` ITSELF is also closure-bound (not just `exportSiteBound`) —
  // one more reason this must stay a mutation.
  deps.createSiteApp = createSiteAppWithFailingAsset("/theme-assets/tovu-starter/css/theme.css", deps);

  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-used-by-fake-target" }; }, async isConfigured() { return { configured: true }; } },
      buildTarget: () => {
        throw new Error("buildTarget must not be called when the export had a failed asset");
      },
    },
    {
      workspaceId: deps.workspaceId,
      publishOutputRootDir: deps.publishOutputRootDir,
      idGen: deps.idGen,
      exportSiteBound: deps.exportSiteBound,
      config: { target: "github-pages", owner: "octo", repo: "demo" },
      projectName: "demo",
    }
  );

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "EXPORT_FAILED");
  assert.equal(
    result.message,
    "refused to publish: 1 asset(s) failed to export (first: '/theme-assets/tovu-starter/css/theme.css' — GET /theme-assets/tovu-starter/css/theme.css -> 500)"
  );
});

/**
 * MEDIUM audit finding (2026-08-19, Codex sol bug/architecture audit): `publishOutputDir` used to
 * return one FIXED directory per target, so two publishes overlapping for the SAME target — the
 * admin UI and a confirmed agent tool call, or two processes (`publish-run.ts`'s own header
 * discloses its single-flight guard is process-local only) — shared one on-disk directory that
 * either could `clean:true` and rewrite out from under the other.
 *
 * `publishOutputDir` now takes a per-run id and is exported specifically so this is a direct,
 * deterministic proof of the actual fix mechanism (unique isolation), not an attempt to reproduce
 * the underlying race's on-disk symptom through timing — a same-process concurrent-corruption test
 * was tried and deliberately dropped: `ExportedRoute`/`ExportedAsset.data` (`site-exporter.ts`) are
 * captured in memory at write time and never re-read from disk afterward, and Node's synchronous
 * `mkdirSync`/`writeFileSync`/`rmSync` calls cannot interleave with each other WITHIN one process
 * (only the `await fetch()` points yield), so two same-process runs never actually corrupted the
 * returned `DeployFile[]` payload even before this fix — only the on-disk artifact, which is
 * disposable (see {@link cleanupPublishRunDir}'s own doc) and never read again by this function. The
 * REAL, previously-disclosed exposure is CROSS-process (the admin server and the agent daemon each
 * hold an independent, unguarded slot — `publish-run.ts`'s own header) and a genuine OS-level
 * concurrent-write race, which a single Node test process cannot reproduce directly; unique-per-run
 * isolation closes that gap structurally (no two runs, same or different process, ever share a
 * directory) without needing a lock.
 */
test("publishOutputDir: two different run ids for the SAME target produce two DIFFERENT, non-overlapping directories", () => {
  const a = computePublishOutputDir("/publish-root", "github-pages", "run-a");
  const b = computePublishOutputDir("/publish-root", "github-pages", "run-b");
  assert.notEqual(a, b);
  assert.equal(a, path.join("/publish-root", "github-pages", "run-a"));
  assert.equal(b, path.join("/publish-root", "github-pages", "run-b"));
  assert.ok(!a.startsWith(b) && !b.startsWith(a), "neither run's directory may be a parent/child of the other's");
});

/** End-to-end smoke test alongside the direct `publishOutputDir` proof above — two concurrent runs
 *  against the identical fixture must both still succeed with a correct, non-empty file set once
 *  `idGen.newId()` is a required part of computing `outputDir`. */
test("publishStaticSite: two concurrent publishes to the SAME target both still succeed with correct file sets", async () => {
  const capturedA: { value: DeployFile[] | null } = { value: null };
  const capturedB: { value: DeployFile[] | null } = { value: null };
  const deps: RouteDeps = testRouteDeps();
  const config: StaticPublishConfig = { target: "github-pages", owner: "octo", repo: "demo-repo" };

  const [resultA, resultB] = await Promise.all([
    publishStaticSite({ loadDeployTargets: hermeticDeployTargets, credentialSource: { async resolve() { return { ok: true, token: "fake-token-a" }; }, async isConfigured() { return { configured: true }; } }, buildTarget: () => fakeDeployTarget(capturedA) },
      { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config, projectName: "demo-a" }
    ),
    publishStaticSite({ loadDeployTargets: hermeticDeployTargets, credentialSource: { async resolve() { return { ok: true, token: "fake-token-b" }; }, async isConfigured() { return { configured: true }; } }, buildTarget: () => fakeDeployTarget(capturedB) },
      { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config, projectName: "demo-b" }
    ),
  ]);

  assert.equal(resultA.ok, true, `run A must succeed: ${JSON.stringify(resultA)}`);
  assert.equal(resultB.ok, true, `run B must succeed: ${JSON.stringify(resultB)}`);
  assert.ok(capturedA.value && capturedA.value.length > 0, "run A's deploy target must have received a non-empty file set");
  assert.ok(capturedB.value && capturedB.value.length > 0, "run B's deploy target must have received a non-empty file set");
  // Both runs export the SAME hermetic fixture, so a shared, colliding directory (one run's
  // clean:true deleting the other's in-flight writes) is exactly what would make these counts
  // diverge — a per-run isolated directory keeps them identical regardless of interleaving.
  assert.equal(capturedA.value!.length, capturedB.value!.length, "both concurrent runs against the identical fixture must produce the SAME file count");
  assert.ok(capturedA.value!.some((f) => f.file === "index.html"), "run A must still have its home page");
  assert.ok(capturedB.value!.some((f) => f.file === "index.html"), "run B must still have its home page");
});

test("publishStaticSite: does NOT inject .nojekyll for netlify or cloudflare-pages, and never sets a base path", async () => {
  for (const config of [{ target: "netlify" }, { target: "cloudflare-pages" }] as const) {
    const captured: { value: DeployFile[] | null } = { value: null };
    const deps: RouteDeps = testRouteDeps();

    const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
        credentialSource: {
          async resolve() {
            return { ok: true, token: "fake-token-never-used-by-fake-target", accountId: "acct-1" };
          },
          async isConfigured() {
            return { configured: true };
          },
        },
        buildTarget: () => fakeDeployTarget(captured),
      },
      { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config, projectName: "demo" }
    );

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.basePath, undefined);
    assert.ok(!captured.value!.some((f) => f.file === ".nojekyll"), `.nojekyll must never be published to ${config.target}`);
  }
});

test("publishStaticSite: passes the resolved credential's accountId through to buildTarget for cloudflare-pages", async () => {
  const deps: RouteDeps = testRouteDeps();
  let observedCredential: { token: string; accountId?: string } | null = null;

  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: {
        async resolve() {
          return { ok: true, token: "cf-token", accountId: "acct-42" };
        },
        async isConfigured() {
          return { configured: true };
        },
      },
      buildTarget: (_config, credential) => {
        observedCredential = credential;
        return fakeDeployTarget({ value: null });
      },
    },
    { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config: { target: "cloudflare-pages" }, projectName: "demo" }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(observedCredential, { token: "cf-token", accountId: "acct-42" });
});

test("publishStaticSite: a resolved credential for vercel/github-pages/netlify never carries accountId through to buildTarget", async () => {
  const deps: RouteDeps = testRouteDeps();
  let observedCredential: { token: string; accountId?: string } | null = null;

  await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: {
        async resolve() {
          return { ok: true, token: "vercel-token" };
        },
        async isConfigured() {
          return { configured: true };
        },
      },
      buildTarget: (_config, credential) => {
        observedCredential = credential;
        return fakeDeployTarget({ value: null });
      },
    },
    { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config: { target: "vercel" }, projectName: "demo" }
  );

  assert.notEqual(observedCredential, null, "buildTarget must have received a credential");
  assert.equal(Object.hasOwn(observedCredential ?? {}, "accountId"), false);
});

// ---- credential fields + StaticPublishOutcome's "partial" branch (spec §3a/§4/§10) ----

test("publishStaticSite: forwards all six s3-compatible credential fields through to buildTarget, with token carrying secretAccessKey's role", async () => {
  const deps: RouteDeps = testRouteDeps();
  let observedCredential: Record<string, unknown> | null = null;

  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: {
        async resolve() {
          return {
            ok: true,
            token: "s3cr3t",
            accessKeyId: "AKIAEXAMPLE",
            bucket: "my-bucket",
            region: "us-east-1",
            endpoint: "https://s3.us-east-1.amazonaws.com",
            publicUrl: "https://my-bucket.s3.us-east-1.amazonaws.com",
          };
        },
        async isConfigured() {
          return { configured: true };
        },
      },
      buildTarget: (_config, credential) => {
        observedCredential = credential;
        return fakeDeployTarget({ value: null });
      },
    },
    { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config: { target: "s3-compatible" }, projectName: "demo" }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(observedCredential, {
    token: "s3cr3t",
    accessKeyId: "AKIAEXAMPLE",
    bucket: "my-bucket",
    region: "us-east-1",
    endpoint: "https://s3.us-east-1.amazonaws.com",
    publicUrl: "https://my-bucket.s3.us-east-1.amazonaws.com",
  });
});

test("publishStaticSite: an omitted endpoint is never forwarded to buildTarget as an explicit undefined key", async () => {
  const deps: RouteDeps = testRouteDeps();
  let observedCredential: Record<string, unknown> | null = null;

  await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: {
        async resolve() {
          return { ok: true, token: "s3cr3t", accessKeyId: "AKIAEXAMPLE", bucket: "my-bucket", region: "us-east-1", publicUrl: "https://my-bucket.example.test" };
        },
        async isConfigured() {
          return { configured: true };
        },
      },
      buildTarget: (_config, credential) => {
        observedCredential = credential;
        return fakeDeployTarget({ value: null });
      },
    },
    { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config: { target: "s3-compatible" }, projectName: "demo" }
  );

  assert.notEqual(observedCredential, null, "buildTarget must have received a credential");
  assert.equal(Object.hasOwn(observedCredential ?? {}, "endpoint"), false);
});

test("publishStaticSite: a target's terminal status of 'ready' is a full ok:true success", async () => {
  const deps: RouteDeps = testRouteDeps();
  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: { async resolve() { return { ok: true, token: "t" }; }, async isConfigured() { return { configured: true }; } },
      buildTarget: () => ({
        id: "fake",
        async publish() {
          return { targetId: "fake", url: "https://example.test/published", status: "ready" as const };
        },
        async checkReachability() {
          return { reachable: true };
        },
      }),
    },
    { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config: { target: "vercel" }, projectName: "demo" }
  );
  assert.equal(result.ok, true);
});

for (const notReadyStatus of ["link-delayed", "protected", "failed"] as const) {
  test(`publishStaticSite: a target's terminal status of '${notReadyStatus}' is a genuine "partial" outcome — never ok:true, never ok:false`, async () => {
    const deps: RouteDeps = testRouteDeps();
    const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
        credentialSource: { async resolve() { return { ok: true, token: "t" }; }, async isConfigured() { return { configured: true }; } },
        buildTarget: () => ({
          id: "fake",
          async publish() {
            return { targetId: "fake", url: "https://example.test/published", status: notReadyStatus, statusMessage: "not reachable yet" };
          },
          async checkReachability() {
            return { reachable: false };
          },
        }),
      },
      { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config: { target: "s3-compatible" }, projectName: "demo" }
    );

    assert.equal(result.ok, "partial");
    if (result.ok !== "partial") throw new Error("unreachable");
    assert.equal(result.url, "https://example.test/published");
    assert.equal(result.status, notReadyStatus);
    assert.match(result.message, /not reachable yet/);
    // Structurally distinct from both existing branches: a caller doing `if (result.ok === true)` or
    // `if (result.ok === false)` must NOT match this outcome at all.
    assert.notEqual(result.ok, true);
    assert.notEqual(result.ok, false);
  });
}

// ---------------------------------------------------------------------------
// "Never throws" — Terra audit finding #2 (2026-08-16): two call sites used to run unguarded before
// either of this function's `try` blocks existed around them, so a genuine failure at either one
// propagated as an UNCAUGHT exception, silently breaking this function's own doc comment (and every
// caller written assuming it, per that comment's own header). Both are now caught.
// ---------------------------------------------------------------------------

test("publishStaticSite: a credentialSource.resolve() that THROWS (a genuine decrypt failure, not merely 'not configured') is caught, not left to escape as an uncaught exception", async () => {
  // `publish-credentials/store.ts`'s `resolveForPublish`/`resolveDefaultForPublish` deliberately throw
  // on a real decrypt failure (bad AAD, tampered ciphertext, missing site key) rather than resolving
  // a silent `null` — this is the exact shape that failure takes once it reaches the composed
  // `PublishCredentialSource.resolve()` this function calls.
  const deps: RouteDeps = testRouteDeps();
  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: {
        async resolve() {
          throw new Error("bad AAD: ciphertext does not match the derived key");
        },
        async isConfigured() {
          throw new Error("isConfigured must not be called by publishStaticSite (it always resolves for real)");
        },
      },
      buildTarget: () => {
        throw new Error("buildTarget must not be called when credential resolution itself failed");
      },
    },
    { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config: { target: "vercel" }, projectName: "demo" }
  );

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
  assert.match(result.message, /bad AAD/);
});

test("publishStaticSite: a buildTarget that THROWS (credential missing a target-required field) is caught, not left to escape as an uncaught exception", async () => {
  // A module's `create()` refusing a credential missing a field it needs (the s3-compatible module's
  // own check is covered by its plugin test); a plain throw isolates `publishStaticSite`'s own catch.
  const deps: RouteDeps = testRouteDeps();
  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: { async resolve() { return { ok: true, token: "t" }; }, async isConfigured() { return { configured: true }; } },
      buildTarget: () => {
        throw new Error("s3-compatible credential is missing required field 'bucket'");
      },
    },
    { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config: { target: "s3-compatible" }, projectName: "demo" }
  );

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
  assert.equal(result.message, "credential is not usable for s3-compatible");
  assert.deepEqual(result.credentialSetup, {
    setupToolId: "credential_save", remedyToolId: "credential_save", prefill: { kind: "publish-host", target: "s3-compatible" },
    hint: "A missing or rejected credential may be fixed by saving it through the secure card.",
  });
});

// ---------------------------------------------------------------------------
// Characterization tests, added ahead of a complexity-reduction refactor of `publishStaticSite` —
// pinning branches the
// existing suite above never exercised (confirmed via `c8` branch coverage: 86.25% on this file
// before this block). Every assertion here must pass unchanged before AND after the refactor.
// ---------------------------------------------------------------------------

// ---- publishStaticSite: branches no existing test above exercises ----

test("publishStaticSite: rejects a blank projectName before credentials or export are touched", async () => {
  const deps = testRouteDeps();
  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets, credentialSource: neverCalledCredentialSource() },
    { workspaceId: "w", publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config: { target: "vercel" }, projectName: "   " }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "INVALID_CONFIG");
  assert.match(result.message, /projectName must be 1-200 characters/);
});

test("publishStaticSite: rejects a projectName over the 200-character limit", async () => {
  const deps = testRouteDeps();
  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets, credentialSource: neverCalledCredentialSource() },
    { workspaceId: "w", publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config: { target: "vercel" }, projectName: "x".repeat(201) }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "INVALID_CONFIG");
  assert.match(result.message, /projectName must be 1-200 characters/);
});

test("publishStaticSite: exportSiteBound itself throwing (not merely returning failed routes) is caught as EXPORT_FAILED, and the run directory is still cleaned up", async () => {
  const deps: RouteDeps = testRouteDeps();
  let runDir: string | undefined;
  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: { async resolve() { return { ok: true, token: "t" }; }, async isConfigured() { return { configured: true }; } },
      buildTarget: () => {
        throw new Error("buildTarget must not be called when exportSiteBound itself threw");
      },
    },
    {
      workspaceId: deps.workspaceId,
      publishOutputRootDir: deps.publishOutputRootDir,
      idGen: deps.idGen,
      exportSiteBound: async ({ outputDir }) => {
        runDir = outputDir;
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(path.join(outputDir, "partial.html"), "partially exported");
        assert.equal(existsSync(outputDir), true);
        throw new Error("simulated exportSiteBound crash");
      },
      config: { target: "vercel" },
      projectName: "demo",
    }
  );
  assert.ok(runDir, "export must have been attempted");
  assert.equal(existsSync(runDir), false, "failed export artifacts must be removed");
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "EXPORT_FAILED");
  assert.match(result.message, /export failed before publishing could start: simulated exportSiteBound crash/);
});

test("publishStaticSite: a partial outcome with no statusMessage falls back to the default not-yet-reachable message", async () => {
  const deps: RouteDeps = testRouteDeps();
  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: { async resolve() { return { ok: true, token: "t" }; }, async isConfigured() { return { configured: true }; } },
      buildTarget: () => ({
        id: "fake",
        async publish() {
          return { targetId: "fake", url: "https://example.test/published", status: "link-delayed" as const };
        },
        async checkReachability() {
          return { reachable: false };
        },
      }),
    },
    { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config: { target: "vercel" }, projectName: "demo" }
  );
  assert.equal(result.ok, "partial");
  if (result.ok !== "partial") throw new Error("unreachable");
  assert.equal(result.message, "Published to vercel, but the public URL is not confirmed reachable yet (status: link-delayed).");
});

// ---- credentialId: the chosen connection reaches the credential source verbatim ----------------
// terra review 2026-09-20, finding 1 (Critical). `publishStaticSite` used to hand `resolve()` only
// `{workspaceId, target}`, so the source picked the credential itself — whichever row was default
// when the publish landed. The chosen connection's id now rides on the input and is passed through
// unchanged; the SOURCE is what validates it (see `credentials.unit.test.ts`).

test("publishStaticSite: the input's credentialId reaches credentialSource.resolve() unchanged", async () => {
  const deps: RouteDeps = testRouteDeps();
  const seen: { value: unknown } = { value: null };

  const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: {
        async resolve(input) {
          seen.value = input;
          return { ok: false, reason: "refused for this test" };
        },
        async isConfigured() {
          return { configured: false, reason: "refused for this test" };
        },
      },
      buildTarget: () => {
        throw new Error("buildTarget must not be called when no credential was resolved");
      },
    },
    {
      workspaceId: deps.workspaceId,
      publishOutputRootDir: deps.publishOutputRootDir,
      idGen: deps.idGen,
      exportSiteBound: deps.exportSiteBound,
      config: { target: "github-pages", owner: "octo", repo: "demo" },
      projectName: "demo",
      credentialId: "cred-chosen-by-the-operator",
    }
  );

  assert.deepEqual(seen.value, { workspaceId: deps.workspaceId, target: "github-pages", credentialId: "cred-chosen-by-the-operator" });
  assert.equal(result.ok, false);
});

test("publishStaticSite: with no credentialId on the input, resolve() is called with no credentialId key at all (the default-lookup path every other caller stays on)", async () => {
  const deps: RouteDeps = testRouteDeps();
  const seen: { value: Record<string, unknown> | null } = { value: null };

  await publishStaticSite({ loadDeployTargets: hermeticDeployTargets,
      credentialSource: {
        async resolve(input) {
          seen.value = input as unknown as Record<string, unknown>;
          return { ok: false, reason: "refused for this test" };
        },
        async isConfigured() {
          return { configured: false, reason: "refused for this test" };
        },
      },
    },
    {
      workspaceId: deps.workspaceId,
      publishOutputRootDir: deps.publishOutputRootDir,
      idGen: deps.idGen,
      exportSiteBound: deps.exportSiteBound,
      config: { target: "vercel" },
      projectName: "demo",
    }
  );

  assert.deepEqual(seen.value, { workspaceId: deps.workspaceId, target: "vercel" });
  assert.equal("credentialId" in (seen.value ?? {}), false, "an absent choice must never travel as an explicit undefined");
});


test("readStaticPublishConfig drops unknown keys, validates types, and treats optional blanks according to input mode", async () => {
  const registry = await hermeticDeployTargets("workspace-local");
  const target = registry.get("github-pages")!;
  assert.ok(target);
  assert.deepEqual(readStaticPublishConfig(target, { target: "vercel", owner: "octo", repo: "demo", injected: "secret", branch: " " }, { blankAsAbsent: true }), { ok: true, config: { target: "github-pages", owner: "octo", repo: "demo" } });
  assert.deepEqual(readStaticPublishConfig(target, { owner: "octo", repo: "demo", branch: " " }, { blankAsAbsent: false }), { ok: true, config: { target: "github-pages", owner: "octo", repo: "demo", branch: " " } });
  assert.deepEqual(readStaticPublishConfig(target, { owner: 42, repo: "demo" }, { blankAsAbsent: false }), { ok: false, message: "'owner' must be a string" });
  for (const owner of [undefined, " ", 42]) {
    const result = await publishStaticSite({ loadDeployTargets: hermeticDeployTargets, credentialSource: neverCalledCredentialSource(), buildTarget: () => assert.fail("must not build") }, {
      workspaceId: "workspace-local", publishOutputRootDir: publishOutputDir, idGen: { newId: () => assert.fail("must not allocate a run") },
      exportSiteBound: async () => assert.fail("must not export"), config: { target: "github-pages", owner, repo: "demo" } as unknown as StaticPublishConfig, projectName: "demo",
    });
    assert.deepEqual(result, { ok: false, code: "INVALID_CONFIG", message: "'owner' (non-empty string) is required for target 'github-pages'" });
  }
});

test("concurrent publishes preserve each run's route and asset bytes and clean both output directories", { timeout: 5000 }, async () => {
  const captures = [{ value: null }, { value: null }] as Array<{ value: DeployFile[] | null }>;
  const dirs: string[] = [];
  let entered = 0;
  let release!: () => void;
  const bothEntered = new Promise<void>((resolve) => { release = resolve; });
  const results = await Promise.all(["A", "B"].map((marker, index) => publishStaticSite({
    loadDeployTargets: hermeticDeployTargets,
    credentialSource: { resolve: async () => ({ ok: true, token: `token-${marker}` }), isConfigured: async () => ({ configured: true }) },
    buildTarget: () => fakeDeployTarget(captures[index]!),
  }, {
    workspaceId: "workspace-local", publishOutputRootDir: publishOutputDir, idGen: { newId: () => `content-${marker}` }, config: { target: "vercel" }, projectName: marker,
    exportSiteBound: async ({ outputDir }) => {
      dirs.push(outputDir);
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(outputDir, "index.html"), `<p>${marker}</p>`);
      if (++entered === 2) release();
      await bothEntered;
      return {
        outputDir, routes: { succeeded: [{ path: "/", kind: "page", outputFile: "index.html", data: `<p>${marker}</p>`, contentType: "text/html" }], failed: [] },
        assets: { succeeded: [{ url: "/assets/site.css", outputFile: "assets/site.css", data: Buffer.from(`body{--run:${marker}}`), contentType: "text/css" }, { url: "/assets/hero.png", outputFile: "assets/hero.png", data: Buffer.from([index, 2, 3]), contentType: "image/png" }], failed: [] },
        skippedManifestEntries: [], unreferencedThemeFiles: [],
      };
    },
  })));
  assert.deepEqual(results.map((result) => result.ok), [true, true]);
  assert.equal(new Set(dirs).size, 2);
  for (const [index, marker] of ["A", "B"].entries()) {
    assert.deepEqual(captures[index]!.value, [
      { file: "index.html", data: `<p>${marker}</p>`, contentType: "text/html" },
      { file: "assets/site.css", data: Buffer.from(`body{--run:${marker}}`), contentType: "text/css" },
      { file: "assets/hero.png", data: Buffer.from([index, 2, 3]), contentType: "image/png" },
    ]);
  }
  assert.equal(dirs.every((dir) => !existsSync(dir)), true);
});
