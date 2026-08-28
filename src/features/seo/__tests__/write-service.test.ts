import assert from "node:assert/strict";
import test from "node:test";

import { ForbiddenError } from "@jini-ai/cms/core";
import { InMemoryPostRepo, type PostRecord } from "../../post/index.js";
import {
  SeoEntryNotFoundError,
  SeoFieldValidationError,
  SeoInvalidCanonicalUrlError,
} from "../errors.js";
import { setEntrySeoOverrides } from "../write-service.js";

/**
 * @file T014 — failing-first unit certification of `setEntrySeoOverrides`
 * (ADR-PIPE-008 Decision §4, C-004): authorize -> validate (registered-key
 * only, length/URL-scheme) -> merge -> save, nothing persisted on rejection.
 */

const WORKSPACE = "workspace-1";
const ENTRY_ID = "post-1";

function seedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: ENTRY_ID,
    workspaceId: WORKSPACE,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    updatedAt: "2026-07-13T00:00:00.000Z",
    version: 1,
    seoExtJson: null,
    ...overrides,
  };
}

const alwaysAllow = async () => ({ allowed: true, reason: "matched" });
const alwaysDeny = async () => ({ allowed: false, reason: "no_grant" });
const noopInvalidate = () => {};

test("setEntrySeoOverrides: authorize() runs first — unauthorized caller gets FORBIDDEN, zero writes", async () => {
  const repo = new InMemoryPostRepo([seedPost()]);

  await assert.rejects(
    () =>
      setEntrySeoOverrides({
        deps: { postRepo: repo, authorize: alwaysDeny, invalidateSitemapCache: noopInvalidate },
        input: { workspaceId: WORKSPACE, entryId: ENTRY_ID, patch: { title: "New Title" }, callerPrincipalId: "p1" },
      }),
    ForbiddenError
  );

  const after = await repo.findById({ workspaceId: WORKSPACE, id: ENTRY_ID });
  assert.equal(after?.seoExtJson, null);
});

test("setEntrySeoOverrides: an unregistered key is rejected, existing row unchanged (AC-04)", async () => {
  const repo = new InMemoryPostRepo([seedPost({ seoExtJson: JSON.stringify({ title: "Existing" }) })]);

  await assert.rejects(
    () =>
      setEntrySeoOverrides({
        deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate },
        input: {
          workspaceId: WORKSPACE,
          entryId: ENTRY_ID,
          patch: { notARealField: "x" } as never,
          callerPrincipalId: "p1",
        },
      }),
    SeoFieldValidationError
  );

  const after = await repo.findById({ workspaceId: WORKSPACE, id: ENTRY_ID });
  assert.equal(after?.seoExtJson, JSON.stringify({ title: "Existing" }));
});

test("setEntrySeoOverrides: a 500-char title string is accepted", async () => {
  const repo = new InMemoryPostRepo([seedPost()]);
  const title = "a".repeat(500);

  const result = await setEntrySeoOverrides({
    deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate },
    input: { workspaceId: WORKSPACE, entryId: ENTRY_ID, patch: { title }, callerPrincipalId: "p1" },
  });

  assert.equal(result.overrides.title, title);
});

test("setEntrySeoOverrides: a 501-char title string is rejected", async () => {
  const repo = new InMemoryPostRepo([seedPost()]);
  const title = "a".repeat(501);

  await assert.rejects(
    () =>
      setEntrySeoOverrides({
        deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate },
        input: { workspaceId: WORKSPACE, entryId: ENTRY_ID, patch: { title }, callerPrincipalId: "p1" },
      }),
    SeoFieldValidationError
  );
});

test("setEntrySeoOverrides: a 2048-char canonical URL is accepted", async () => {
  const repo = new InMemoryPostRepo([seedPost()]);
  const canonical = "https://example.com/" + "a".repeat(2048 - "https://example.com/".length);
  assert.equal(canonical.length, 2048);

  const result = await setEntrySeoOverrides({
    deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate },
    input: { workspaceId: WORKSPACE, entryId: ENTRY_ID, patch: { canonical }, callerPrincipalId: "p1" },
  });

  assert.equal(result.overrides.canonical, canonical);
});

test("setEntrySeoOverrides: a 2049-char canonical URL is rejected", async () => {
  const repo = new InMemoryPostRepo([seedPost()]);
  const canonical = "https://example.com/" + "a".repeat(2049 - "https://example.com/".length);

  await assert.rejects(
    () =>
      setEntrySeoOverrides({
        deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate },
        input: { workspaceId: WORKSPACE, entryId: ENTRY_ID, patch: { canonical }, callerPrincipalId: "p1" },
      }),
    SeoFieldValidationError
  );
});

test("setEntrySeoOverrides: a javascript: canonical scheme is rejected with SeoInvalidCanonicalUrlError", async () => {
  const repo = new InMemoryPostRepo([seedPost()]);

  await assert.rejects(
    () =>
      setEntrySeoOverrides({
        deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate },
        input: {
          workspaceId: WORKSPACE,
          entryId: ENTRY_ID,
          patch: { canonical: "javascript:alert(1)" },
          callerPrincipalId: "p1",
        },
      }),
    SeoInvalidCanonicalUrlError
  );

  const after = await repo.findById({ workspaceId: WORKSPACE, id: ENTRY_ID });
  assert.equal(after?.seoExtJson, null);
});

test("setEntrySeoOverrides: a data: canonical scheme is rejected with SeoInvalidCanonicalUrlError", async () => {
  const repo = new InMemoryPostRepo([seedPost()]);

  await assert.rejects(
    () =>
      setEntrySeoOverrides({
        deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate },
        input: {
          workspaceId: WORKSPACE,
          entryId: ENTRY_ID,
          patch: { canonical: "data:text/html,<script>" },
          callerPrincipalId: "p1",
        },
      }),
    SeoInvalidCanonicalUrlError
  );
});

test("setEntrySeoOverrides: entry-not-found rejects with SeoEntryNotFoundError", async () => {
  const repo = new InMemoryPostRepo([]);

  await assert.rejects(
    () =>
      setEntrySeoOverrides({
        deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate },
        input: { workspaceId: WORKSPACE, entryId: "missing", patch: { title: "x" }, callerPrincipalId: "p1" },
      }),
    SeoEntryNotFoundError
  );
});

test("setEntrySeoOverrides: merges the patch into an existing override bag rather than replacing it", async () => {
  const repo = new InMemoryPostRepo([seedPost({ seoExtJson: JSON.stringify({ title: "Old Title", noindex: true }) })]);

  const result = await setEntrySeoOverrides({
    deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate },
    input: { workspaceId: WORKSPACE, entryId: ENTRY_ID, patch: { description: "New description" }, callerPrincipalId: "p1" },
  });

  assert.equal(result.overrides.title, "Old Title");
  assert.equal(result.overrides.noindex, true);
  assert.equal(result.overrides.description, "New description");
});

test("setEntrySeoOverrides: a noindex-affecting write invalidates the sitemap cache directly", async () => {
  const repo = new InMemoryPostRepo([seedPost()]);
  let invalidatedFor: string | undefined;

  await setEntrySeoOverrides({
    deps: {
      postRepo: repo,
      authorize: alwaysAllow,
      invalidateSitemapCache: (input) => {
        invalidatedFor = input.workspaceId;
      },
    },
    input: { workspaceId: WORKSPACE, entryId: ENTRY_ID, patch: { noindex: true }, callerPrincipalId: "p1" },
  });

  assert.equal(invalidatedFor, WORKSPACE);
});

test("setEntrySeoOverrides: a write that touches neither noindex nor canonical does not invalidate the sitemap cache", async () => {
  const repo = new InMemoryPostRepo([seedPost()]);
  let invalidateCalls = 0;

  await setEntrySeoOverrides({
    deps: {
      postRepo: repo,
      authorize: alwaysAllow,
      invalidateSitemapCache: () => {
        invalidateCalls++;
      },
    },
    input: { workspaceId: WORKSPACE, entryId: ENTRY_ID, patch: { title: "New title" }, callerPrincipalId: "p1" },
  });

  assert.equal(invalidateCalls, 0);
});

test("setEntrySeoOverrides: bumps the post's version (audit signal)", async () => {
  const repo = new InMemoryPostRepo([seedPost({ version: 3 })]);

  await setEntrySeoOverrides({
    deps: { postRepo: repo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate },
    input: { workspaceId: WORKSPACE, entryId: ENTRY_ID, patch: { title: "New title" }, callerPrincipalId: "p1" },
  });

  const after = await repo.findById({ workspaceId: WORKSPACE, id: ENTRY_ID });
  assert.equal(after?.version, 4);
});
