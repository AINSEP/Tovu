import assert from "node:assert/strict";
import test from "node:test";

import { eq } from "drizzle-orm";

import { openContentDb, seedContentDb, type ContentDbSeedData } from "../content-db.js";
import * as schema from "../../schema.js";

/**
 * @file Direct unit coverage of `content-db.ts`'s `seedContentDb` — previously exercised only
 * indirectly, and only through `src/platform/site-dir`'s `init-site.ts` (out of this repo area), never
 * called directly by any test here. `content-db-recovery.integration.test.ts` opens content dbs
 * but never passes seed data. Covers the guard that makes seeding safe to call on every boot
 * (never overwrites an operator-edited db) and the `ext` default.
 */

function seedData(overrides: Partial<ContentDbSeedData> = {}): ContentDbSeedData {
  return {
    workspace: { id: "ws-1", name: "Test Workspace", slug: "test-workspace", createdAt: "2026-08-21T00:00:00.000Z" },
    posts: [
      {
        id: "post-1",
        workspaceId: "ws-1",
        title: "Hello",
        slug: "hello",
        bodyJson: { type: "doc", content: [] },
        status: "published",
        updatedAt: "2026-08-21T00:00:00.000Z",
        version: 1,
      },
    ],
    presentation: { workspaceId: "ws-1", activeThemeId: "default", updatedAt: "2026-08-21T00:00:00.000Z" },
    ...overrides,
  };
}

test("seeds the workspace, every post, and the presentation row on an empty db", () => {
  const db = openContentDb(":memory:");

  seedContentDb({ db, seed: seedData() });

  const workspaces = db.select().from(schema.workspaces).all();
  assert.equal(workspaces.length, 1);
  assert.equal(workspaces[0].slug, "test-workspace");

  const posts = db.select().from(schema.posts).all();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, "Hello");
  assert.deepEqual(JSON.parse(posts[0].bodyJson!), { type: "doc", content: [] });

  const presentation = db.select().from(schema.presentationSettings).all();
  assert.equal(presentation.length, 1);
  assert.equal(presentation[0].activeThemeId, "default");
});

test("a post's ext defaults to '{}' when the seed data omits it", () => {
  const db = openContentDb(":memory:");

  seedContentDb({ db, seed: seedData() });

  const [post] = db.select().from(schema.posts).where(eq(schema.posts.id, "post-1")).all();
  assert.equal(post.ext, "{}");
});

test("a post's ext is serialized verbatim when the seed data supplies one", () => {
  const db = openContentDb(":memory:");

  seedContentDb({
    db,
    seed: seedData({
      posts: [
        {
          id: "post-1",
          workspaceId: "ws-1",
          title: "Hello",
          slug: "hello",
          bodyJson: { type: "doc", content: [] },
          status: "published",
          updatedAt: "2026-08-21T00:00:00.000Z",
          version: 1,
          ext: { "plugin-x": { flag: true } },
        },
      ],
    }),
  });

  const [post] = db.select().from(schema.posts).where(eq(schema.posts.id, "post-1")).all();
  assert.deepEqual(JSON.parse(post.ext), { "plugin-x": { flag: true } });
});

test("never re-seeds (or overwrites) once a workspace with the same slug already exists", () => {
  const db = openContentDb(":memory:");

  seedContentDb({ db, seed: seedData() });
  // A second call with the SAME slug but different content -- must be a no-op, so an operator's
  // own edits (or a restart) never get clobbered.
  seedContentDb({
    db,
    seed: seedData({
      workspace: { id: "ws-2", name: "Different Workspace", slug: "test-workspace", createdAt: "2026-08-21T01:00:00.000Z" },
      posts: [
        {
          id: "post-2",
          workspaceId: "ws-2",
          title: "Should never be inserted",
          slug: "should-never-be-inserted",
          bodyJson: { type: "doc", content: [] },
          status: "published",
          updatedAt: "2026-08-21T01:00:00.000Z",
          version: 1,
        },
      ],
      presentation: { workspaceId: "ws-2", activeThemeId: "other-theme", updatedAt: "2026-08-21T01:00:00.000Z" },
    }),
  });

  const workspaces = db.select().from(schema.workspaces).all();
  assert.equal(workspaces.length, 1, "still exactly one workspace row");
  assert.equal(workspaces[0].id, "ws-1", "the original workspace is untouched");
  assert.equal(workspaces[0].name, "Test Workspace");

  const posts = db.select().from(schema.posts).all();
  assert.equal(posts.length, 1, "the second seed's post must never be inserted");
  assert.equal(posts[0].id, "post-1");
});

test("seeds multiple posts in the order given", () => {
  const db = openContentDb(":memory:");

  seedContentDb({
    db,
    seed: seedData({
      posts: [
        {
          id: "post-1",
          workspaceId: "ws-1",
          title: "First",
          slug: "first",
          bodyJson: { type: "doc", content: [] },
          status: "published",
          updatedAt: "2026-08-21T00:00:00.000Z",
          version: 1,
        },
        {
          id: "post-2",
          workspaceId: "ws-1",
          title: "Second",
          slug: "second",
          bodyJson: { type: "doc", content: [] },
          status: "draft",
          updatedAt: "2026-08-21T00:00:00.000Z",
          version: 1,
        },
      ],
    }),
  });

  const posts = db.select().from(schema.posts).all();
  assert.deepEqual(
    posts.map((p) => p.id),
    ["post-1", "post-2"]
  );
});
