import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerPublishContentContributor, resetPublishContentContributorsForTests } from "#src/features/publish-content/type-registry";
import type { PublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";
import type { PublishContentRouteDeps } from "../deps.js";
import { registerPublishContentCapabilitiesRoute } from "../capabilities.js";

/**
 * @file S-F1 of `ADS-memory/.local-artifacts/publish-files-plan-2026-09-24.md` §5/§6.
 *
 * Certifies `GET .../capabilities` at the real HTTP boundary `peer-transport.ts`'s (feature)
 * `pushBundleToPeer` probe reads: the mount-path 404 guard, the `publish_content.apply` gate (the
 * same permission `bundle-create.ts` asks for the rest of the push ceremony), the registered-type
 * allowlist, and the grant intersection for a caller that authenticated through a publishing token
 * versus one that did not.
 */

const WORKSPACE_ID = "ws-capabilities";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/publish-content/capabilities`;

function stubHandler(entityType: string, schemaVersion: number) {
  return {
    entityType,
    dependsOn: [],
    build: () => ({
      entityType,
      schemaVersion,
      permission: "content.write",
      dependsOn: [],
      pack: async function* () {},
      inspect: async () => null,
      precheck: async () => null,
      apply: async () => ({ changeSetId: "cs-1" }),
    }),
  };
}

function buildApp(options: {
  allow?: boolean;
  publishTrust?: PublishTrustContext;
  askedPermissions?: string[];
} = {}): express.Express {
  const askedPermissions = options.askedPermissions ?? [];
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async ({ permission }: { permission: string }) => {
      askedPermissions.push(permission);
      return { allowed: options.allow ?? true, reason: "matched" };
    },
    clock: { nowIso: () => "2026-09-24T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    postRepo: {},
    outbox: {},
    pluginBeforeSaveHook: undefined,
  } as unknown as PublishContentRouteDeps;

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    if (options.publishTrust) res.locals.publishTrust = options.publishTrust;
    next();
  });
  registerPublishContentCapabilitiesRoute(app, deps);
  return app;
}

function publishTrust(entityTypes: readonly string[]): PublishTrustContext {
  return {
    sourceInstallationId: "src-1",
    capabilities: ["publish_content.apply"],
    entityTypes,
    generation: 1,
  };
}

test("404s on a mismatched workspace id before doing anything else", async (t) => {
  resetPublishContentContributorsForTests();
  const askedPermissions: string[] = [];
  const app = buildApp({ askedPermissions });
  const server = await startTestServer(app, t);

  const res = await fetch(`${server}/api/admin/v1/workspaces/not-real/publish-content/capabilities`);
  assert.equal(res.status, 404);
  assert.deepEqual(askedPermissions, [], "a mismatched workspace must never reach an authorize call");
});

test("403s when the permission is denied, naming publish_content.apply — the same gate bundle-create.ts uses", async (t) => {
  resetPublishContentContributorsForTests();
  const app = buildApp({ allow: false });
  const server = await startTestServer(app, t);

  const res = await fetch(`${server}${BASE}`);
  assert.equal(res.status, 403);
  assert.match(((await res.json()) as { error: string }).error, /'publish_content\.apply'/);
});

test("with no publishing grant on the request, answers every registered type — the same reading bundle-create.ts gives that absence", async (t) => {
  resetPublishContentContributorsForTests();
  registerPublishContentContributor(stubHandler("post", 1));
  registerPublishContentContributor(stubHandler("media", 2));
  const app = buildApp();
  const server = await startTestServer(app, t);

  const res = await fetch(`${server}${BASE}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { entityTypes: string[]; schemaVersions: Record<string, number> };
  assert.deepEqual(body.entityTypes.sort(), ["media", "post"]);
  assert.deepEqual(body.schemaVersions, { post: 1, media: 2 });
});

test("with a publishing grant, answers the intersection of registered types and the grant's own entityTypes", async (t) => {
  resetPublishContentContributorsForTests();
  registerPublishContentContributor(stubHandler("post", 1));
  registerPublishContentContributor(stubHandler("media", 2));
  registerPublishContentContributor(stubHandler("redirect", 1));
  const app = buildApp({ publishTrust: publishTrust(["post", "redirect"]) });
  const server = await startTestServer(app, t);

  const res = await fetch(`${server}${BASE}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { entityTypes: string[]; schemaVersions: Record<string, number> };
  // `media` is registered but not in the grant, and must not appear — the same "media" this grant
  // never opted into staying absent from `bundle-create.ts`'s own door check.
  assert.deepEqual(body.entityTypes.sort(), ["post", "redirect"]);
  assert.deepEqual(body.schemaVersions, { post: 1, redirect: 1 });
});

test("a grant naming a type nobody registered names nothing this instance does not actually have", async (t) => {
  resetPublishContentContributorsForTests();
  registerPublishContentContributor(stubHandler("post", 1));
  const app = buildApp({ publishTrust: publishTrust(["post", "theme-files"]) });
  const server = await startTestServer(app, t);

  const res = await fetch(`${server}${BASE}`);
  const body = (await res.json()) as { entityTypes: string[] };
  assert.deepEqual(body.entityTypes, ["post"]);
});
