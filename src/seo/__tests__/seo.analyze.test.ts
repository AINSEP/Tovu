import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo } from "../../features/post";
import type { PostRecord } from "../../features/post/post";
import { InMemorySettingsRepo } from "../../features/settings/repo.memory";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media";
import { ensureSeoSettingDefinitions } from "../settings";
import { analyzeEntry } from "../seo";

/**
 * @file T025 — failing-first unit certification of `analyzeEntry`
 * (REQ-14, AC-28): missing title/description -> issue present; nothing
 * missing -> `score: 100, issues: []`.
 */

const WORKSPACE = "workspace-1";
const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `seo-analyze-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function seedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body text." }] }] },
    status: "published",
    kind: "post",
    updatedAt: "2026-07-13T00:00:00.000Z",
    version: 1,
    seoExtJson: null,
    ...overrides,
  };
}

async function makeDeps(posts: PostRecord[]) {
  const postRepo = new InMemoryPostRepo(posts);
  const settingsRepo = new InMemorySettingsRepo();
  const settingsDeps = { settingsRepo, clock, ids, authorize: alwaysAllow, principals: { findById: async () => null } as never };
  await ensureSeoSettingDefinitions(settingsDeps, { workspaceId: WORKSPACE, systemPrincipalId: "system-seo" });

  return {
    postRepo,
    settingsRepo,
    media: {
      mediaRepo: new InMemoryMediaRepo([]),
      assetRenditionRepo: new InMemoryAssetRenditionRepo([]),
      transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
    },
  };
}

test("analyzeEntry: nothing missing -> score 100, issues []", async () => {
  const deps = await makeDeps([seedPost()]);
  const analysis = await analyzeEntry(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(analysis.score, 100);
  assert.deepEqual(analysis.issues, []);
});

test("analyzeEntry: a missing description produces an issue", async () => {
  const deps = await makeDeps([seedPost({ bodyJson: { type: "doc", content: [] } })]);
  const analysis = await analyzeEntry(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.ok(analysis.issues.some((issue) => issue.field === "description"));
  assert.ok(analysis.score < 100);
});

test("analyzeEntry: carries the fully-resolved SeoMeta in `resolved`", async () => {
  const deps = await makeDeps([seedPost()]);
  const analysis = await analyzeEntry(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(analysis.resolved.title, "Hello World");
  assert.equal(analysis.entryId, "post-1");
});
