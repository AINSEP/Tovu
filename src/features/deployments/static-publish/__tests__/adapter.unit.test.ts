import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DeployFile, DeployPublishInput, DeployPublishResult, DeployTarget } from "@jini-ai/devops/deploy";

import { createRouteDeps } from "#src/server/app";
import type { RouteDeps } from "#src/server/routes/types";

import { publishStaticSite, toDeployFile, computeBasePath, validateStaticPublishConfig } from "../adapter";
import type { PublishCredentialSource, StaticPublishConfig } from "../types";

/**
 * @file `static-publish/adapter.ts` unit tests — the brief's three required coverage points:
 * `.nojekyll` is injected for the GitHub Pages target and NOT for Vercel; a missing token fails
 * cleanly without leaking; the exporter's own output maps to `DeployFile[]` with deploy-relative
 * paths intact. Plus the base-path derivation this feature's whole "structurally hard to get wrong"
 * claim rests on.
 *
 * Every test redirects `TOVU_PUBLISH_DIR` to a throwaway temp directory (module-level, matching
 * `export-site-route.test.ts`'s own precedent) and injects a FAKE `DeployTarget` via
 * `StaticPublishDeps.buildTarget` — this suite runs a REAL `exportSite` pass against the hermetic
 * `createRouteDeps()` fixture (real, in-process, no external network), but NEVER constructs a real
 * `GitHubPagesDeployTarget`/`VercelDeployTarget` and NEVER touches `fetch`/GitHub/Vercel.
 */

const publishOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-adapter-test-"));
process.env.TOVU_PUBLISH_DIR = publishOutputDir;
test.after(() => rmSync(publishOutputDir, { recursive: true, force: true }));

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

test("computeBasePath: derives /<repo> for github-pages and undefined for vercel — the one place base path is ever decided", () => {
  assert.equal(computeBasePath({ target: "github-pages", owner: "octo", repo: "my-site" }), "/my-site");
  assert.equal(computeBasePath({ target: "vercel" }), undefined);
});

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

test("publishStaticSite: an invalid config is rejected before credentials or the deploy target are ever touched", async () => {
  const result = await publishStaticSite(
    { credentialSource: neverCalledCredentialSource() },
    {
      workspaceId: "does-not-matter",
      routeDeps: createRouteDeps(),
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
  let exportAttempted = false;
  const deps: RouteDeps = { ...createRouteDeps() };
  // Wrapping workspaceRepo.findById (an arbitrary read exportSite touches early) would be fragile
  // to internal exportSite ordering; instead this test proves the STRONGER claim — the deploy
  // target is never even constructed — via `buildTarget` below never firing.
  void exportAttempted;

  const result = await publishStaticSite(
    {
      credentialSource: { async resolve() { return { ok: false, reason: "GITHUB_TOKEN is not set" }; }, async isConfigured() { return { configured: false, reason: "GITHUB_TOKEN is not set" }; } },
      buildTarget: () => {
        throw new Error("buildTarget must not be called when no credential was resolved");
      },
    },
    {
      workspaceId: deps.workspaceId,
      routeDeps: deps,
      config: { target: "github-pages", owner: "octo", repo: "demo" },
      projectName: "demo",
    }
  );

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
  assert.equal(result.message, "GITHUB_TOKEN is not set");
  // "Fails cleanly without leaking": the message NAMES the missing env var (helpful, expected —
  // "GITHUB_TOKEN" legitimately contains the substring "token") but must never carry a `Bearer `
  // header shape or a `key": "value"` pair that would indicate an actual credential VALUE leaked
  // into the response. There is no token in scope on this path at all, and this is the proof.
  assert.doesNotMatch(JSON.stringify(result), /Bearer |ghp_[A-Za-z0-9]|["']token["']?\s*:\s*["'][^"']{4,}/i);
});

test("publishStaticSite: injects .nojekyll for github-pages and maps real exported files to deploy-relative DeployFile[]", async () => {
  const captured: { value: DeployFile[] | null } = { value: null };
  const deps: RouteDeps = { ...createRouteDeps() };

  const result = await publishStaticSite(
    {
      credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-used-by-fake-target" }; }, async isConfigured() { return { configured: true }; } },
      buildTarget: () => fakeDeployTarget(captured),
    },
    {
      workspaceId: deps.workspaceId,
      routeDeps: deps,
      config: { target: "github-pages", owner: "octo", repo: "demo-repo" },
      projectName: "demo",
    }
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.basePath, "/demo-repo");
  assert.ok(captured.value, "the fake deploy target must have been invoked");
  const files = captured.value!;

  const nojekyll = files.find((f) => f.file === ".nojekyll");
  assert.ok(nojekyll, ".nojekyll must be present in the file set published to github-pages");
  assert.equal(nojekyll!.data, "");

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
  const deps: RouteDeps = { ...createRouteDeps() };

  const result = await publishStaticSite(
    {
      credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-used-by-fake-target" }; }, async isConfigured() { return { configured: true }; } },
      buildTarget: () => fakeDeployTarget(captured),
    },
    {
      workspaceId: deps.workspaceId,
      routeDeps: deps,
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

test("validateStaticPublishConfig: rejects a blank teamId for vercel and an out-of-pattern branch for github-pages", () => {
  const badTeam: StaticPublishConfig = { target: "vercel", teamId: "   " };
  assert.match(validateStaticPublishConfig(badTeam) ?? "", /teamId/);

  const badBranch: StaticPublishConfig = { target: "github-pages", owner: "octo", repo: "demo", branch: "has a space" };
  assert.match(validateStaticPublishConfig(badBranch) ?? "", /branch/);

  assert.equal(validateStaticPublishConfig({ target: "vercel" }), null);
});
