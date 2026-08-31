import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeDetailRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { PostRecord } from "#src/features/post/index";

/**
 * @file The theme-page/content-slug collision signal `describeThemeFile` reports as
 * `collidingContent` (2026-08-30) — the backend half of the Explore screen's slug-collision
 * warning (`ThemeExplorePublishToggle`, `ThemeExplore.tsx`).
 *
 * Live bug this exists to surface (found tonight, not fixed here — `pages.ts`'s
 * `resolveMarketingPageOrOverride` precedence is out of scope for this change): a theme page can
 * read `published` here and a visitor can STILL get a different resource at that URL, because a
 * live Post/Page row at the same slug can win independent of this toggle. This suite pins the
 * signal `describeThemeFile` reports so the Explore UI can warn about that gap without this route
 * ever CHANGING who wins.
 *
 * Mirrors `getPublishedPostBySlug`'s own collision-candidate filter exactly (only a published,
 * non-trashed row counts) — see `contentRecordsBySlug`'s own doc in `explore.ts` for why a draft or
 * trashed row must NOT be reported as a collision here.
 */

const WORKSPACE_ID = "ws-detail-collision";

/** A theme with five candidate pages (`about`/`pricing`/`contact`/`signin`, plus the required
 *  `index`) — enough distinct slugs to exercise every collision outcome (published-collides,
 *  draft-does-not, trashed-does-not, no-record-at-all) against ONE theme, one request. */
function makeThemeWithCandidatePages(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-detail-collision-"));
  const dir = path.join(root, "static", "collision-fixture");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  for (const page of ["index", "about", "pricing", "contact", "signin"]) {
    fs.writeFileSync(path.join(dir, "pages", `${page}.html`), `<html><body>${page}</body></html>`, "utf8");
  }
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "collision-fixture", name: "Collision Fixture", version: "1.0.0", tier: "static", engine: 1 })
  );
  return root;
}

function seedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE_ID,
    title: "Untitled",
    slug: "untitled",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    updatedAt: "2026-08-30T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as PostRecord;
}

/** Wraps a real `InMemoryPostRepo` to count `list()` calls — the N+1 regression check below needs
 *  to prove the detail route calls it exactly ONCE per request, not once per theme page file. */
function countingPostRepo(posts: PostRecord[]): { repo: ContentRouteDeps["postRepo"]; listCalls: () => number } {
  const inner = new InMemoryPostRepo(posts);
  let calls = 0;
  return {
    repo: {
      ...inner,
      list: async (required: { workspaceId: string }) => {
        calls += 1;
        return inner.list(required);
      },
    } as ContentRouteDeps["postRepo"],
    listCalls: () => calls,
  };
}

function buildTestApp(deps: ContentRouteDeps): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeDetailRoute(app, deps);
  return app;
}

const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/collision-fixture`;

interface FileEntry {
  path: string;
  published: boolean | null;
  collidingContent: { id: string; slug: string; title: string; kind: string } | null;
}

test("a published post at a theme page's slug is reported as collidingContent", async (t) => {
  const themesDir = makeThemeWithCandidatePages();
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const { repo } = countingPostRepo([
    seedPost({ id: "post-about", slug: "about", title: "What Is Tovu?", kind: "post", status: "published" }),
  ]);
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
    postRepo: repo,
  } as unknown as ContentRouteDeps;

  const app = buildTestApp(deps);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { files: FileEntry[] };
  const about = body.files.find((f) => f.path === "pages/about.html");
  assert.ok(about, "fixture must list pages/about.html");
  assert.deepEqual(about!.collidingContent, {
    id: "post-about",
    slug: "about",
    title: "What Is Tovu?",
    kind: "post",
  });
});

test("a draft post at a theme page's slug is NOT reported as a collision", async (t) => {
  const themesDir = makeThemeWithCandidatePages();
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const { repo } = countingPostRepo([
    seedPost({ id: "post-pricing", slug: "pricing", title: "Pricing Draft", status: "draft" }),
  ]);
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
    postRepo: repo,
  } as unknown as ContentRouteDeps;

  const app = buildTestApp(deps);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}`);
  const body = (await res.json()) as { files: FileEntry[] };
  const pricing = body.files.find((f) => f.path === "pages/pricing.html");
  assert.equal(pricing!.collidingContent, null, "a draft never wins a live slug collision — see getPublishedPostBySlug");
});

test("a trashed (soft-deleted) published post at a theme page's slug is NOT reported as a collision", async (t) => {
  const themesDir = makeThemeWithCandidatePages();
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const { repo } = countingPostRepo([
    seedPost({ id: "post-contact", slug: "contact", title: "Old Contact Page", deletedAt: "2026-08-29T00:00:00.000Z" }),
  ]);
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
    postRepo: repo,
  } as unknown as ContentRouteDeps;

  const app = buildTestApp(deps);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}`);
  const body = (await res.json()) as { files: FileEntry[] };
  const contact = body.files.find((f) => f.path === "pages/contact.html");
  assert.equal(contact!.collidingContent, null, "a trashed row is gone from every public read, collisions included");
});

test("a candidate page with no matching content record reports collidingContent: null", async (t) => {
  const themesDir = makeThemeWithCandidatePages();
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const { repo } = countingPostRepo([]);
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
    postRepo: repo,
  } as unknown as ContentRouteDeps;

  const app = buildTestApp(deps);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}`);
  const body = (await res.json()) as { files: FileEntry[] };
  const signin = body.files.find((f) => f.path === "pages/signin.html");
  assert.equal(signin!.collidingContent, null);
});

test("a Page-kind record (not just Post) is reported too, with kind: \"page\"", async (t) => {
  const themesDir = makeThemeWithCandidatePages();
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const { repo } = countingPostRepo([
    seedPost({ id: "page-signin", slug: "signin", title: "Sign In", kind: "page", status: "published" }),
  ]);
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
    postRepo: repo,
  } as unknown as ContentRouteDeps;

  const app = buildTestApp(deps);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}`);
  const body = (await res.json()) as { files: FileEntry[] };
  const signin = body.files.find((f) => f.path === "pages/signin.html");
  assert.deepEqual(signin!.collidingContent, { id: "page-signin", slug: "signin", title: "Sign In", kind: "page" });
});

test("non-page files (e.g. a stylesheet) never report a collision even if their name matches a slug", async (t) => {
  // `about.css` deliberately shares a basename with the `about` slug below — proves `collidingContent`
  // is gated on the SAME `group === \"page\"` + candidate check `published` already uses, not on a
  // bare filename match.
  const themesDir = makeThemeWithCandidatePages();
  fs.mkdirSync(path.join(themesDir, "static", "collision-fixture", "css"), { recursive: true });
  fs.writeFileSync(path.join(themesDir, "static", "collision-fixture", "css", "about.css"), "body{}", "utf8");
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const { repo } = countingPostRepo([seedPost({ id: "post-about", slug: "about", status: "published" })]);
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
    postRepo: repo,
  } as unknown as ContentRouteDeps;

  const app = buildTestApp(deps);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}`);
  const body = (await res.json()) as { files: FileEntry[] };
  const css = body.files.find((f) => f.path === "css/about.css");
  assert.equal(css!.collidingContent, null, "a stylesheet is never a candidate page, regardless of its name");
});

/**
 * The N+1 regression check this whole feature was built to avoid: an `urlFor`-per-row bug was just
 * fixed elsewhere in this codebase for the identical shape (one DB call per listed row instead of
 * one for the whole list). `postRepo.list()` must be called exactly ONCE per detail request, no
 * matter how many theme page files that request lists.
 */
test("postRepo.list() is called exactly once per request, not once per theme page file", async (t) => {
  const themesDir = makeThemeWithCandidatePages();
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const { repo, listCalls } = countingPostRepo([seedPost({ slug: "about" })]);
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
    postRepo: repo,
  } as unknown as ContentRouteDeps;

  const app = buildTestApp(deps);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}`);
  const body = (await res.json()) as { files: FileEntry[] };
  // Five candidate pages plus `index` plus `tokens.json`/`theme.json` — several files in this one
  // listing, so a per-file lookup would show up here as more than one call.
  assert.ok(body.files.length > 5, "sanity: this fixture lists more than one file");
  assert.equal(listCalls(), 1, "one postRepo.list() call for the WHOLE listing, never one per file");
});
