import { isDeepStrictEqual } from "node:util";
import { postPublicPath } from "#src/platform/routing/index";
import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import { createPageHtmlStatements } from "#src/features/pages/html-document-store.sqlite";
import { restoredEntryRefs } from "@jini-ai/cms/pages/html-inverse";
import { warnUnindexedEntryRef } from "#src/contracts/core/entry-refs/unindexed-ref-warning";
import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { InMemoryEntryRefsRepo } from "@jini-ai/cms/widgets";
import { InMemoryOutbox } from "@jini-ai/infra/events/memory-bus";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { type PostRepoPort } from "@jini-ai/cms/posts/post";
import { createPost } from "@jini-ai/cms/posts/post-create";
import { updatePost } from "@jini-ai/cms/posts/post-update";
import { postRepoFor } from "../../post/repo.js";
import { InMemoryPostRepo } from "../../post/repo.memory.js";
import { InMemoryPagesHtmlDocumentStore } from "@jini-ai/cms/pages/html-document-store.memory";
import { PageConcurrentEditError, SqlPagesHtmlDocumentStore } from "@jini-ai/cms/pages/html-document-store";
import { type PagesHtmlDocumentStorePort } from "@jini-ai/core/contracts/site/page-html-store";

const clock = { nowMs: () => Date.parse("2026-10-10T12:00:00Z") };
const key = { workspaceId: "ws-html-noopsave", id: "page-1" };
const scope = { workspaceId: key.workspaceId, postId: key.id };

class CountingEntryRefs extends InMemoryEntryRefsRepo {
  replacements = 0;
  override async replaceForSource(input: Parameters<InMemoryEntryRefsRepo["replaceForSource"]>[0]): Promise<void> {
    this.replacements++;
    await super.replaceForSource(input);
  }
}

interface Harness {
  repo: PostRepoPort;
  refs: CountingEntryRefs;
  store: () => PagesHtmlDocumentStorePort;
}

function saveContract(make: () => Harness): void {
  test("HTML page metadata saves skip unchanged content and preserve HTML on a real metadata edit", async () => {
    const { repo, store: makeStore } = make();
    await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo, clock }, input: { ...key, title: "About", kind: "page" } });
    await makeStore().ensureHtmlFormat({ seedHtml: "<p>original</p>" });
    const before = await repo.findById(key);
    assert.ok(before);
    const history = await repo.listRevisions(scope);
    const deps = { repo, clock, outbox: new InMemoryOutbox() };
    const input = { ...key, title: before.title, slug: before.slug, status: before.status,
      bodyJson: before.bodyJson, expectedVersion: before.version };
    assert.deepEqual((await updatePost({ deps: { ...deps, reservedSegments: RESERVED_SEGMENTS, postPublicPath, isDeepStrictEqual, }, input })).post, before);
    assert.deepEqual(await repo.listRevisions(scope), history);
    const changed = (await updatePost({ deps: { ...deps, reservedSegments: RESERVED_SEGMENTS, postPublicPath, isDeepStrictEqual, }, input: { ...input, title: "New title" } })).post;
    assert.equal(changed.bodyHtml, before.bodyHtml);
    assert.equal(changed.bodyFormat, "html");
    assert.equal(changed.version, before.version + 1);
    assert.equal((await repo.listRevisions(scope)).length, history.length + 1);
  });

  test("identical HTML skips the row, revision and reference writes; a real change still advances once", async () => {
    const { repo, refs, store: makeStore } = make();
    await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo, clock }, input: { ...key, title: "About", kind: "page" } });
    const store = makeStore();
    await store.ensureHtmlFormat({ seedHtml: "<p>original</p>" });
    const before = await repo.findById(key);
    const history = await repo.listRevisions(scope);
    const replacements = refs.replacements;

    await store.write({ html: await store.read() });
    await store.write({ html: "<p>original</p>" });
    assert.deepEqual(await repo.findById(key), before);
    assert.deepEqual(await repo.listRevisions(scope), history);
    assert.equal(store.capturedVersion(), before?.version);
    assert.equal(refs.replacements, replacements);

    await store.write({ html: "<p>changed</p>" });
    const changed = await repo.findById(key);
    assert.equal(changed?.version, before!.version + 1);
    assert.equal((await repo.listRevisions(scope)).length, history.length + 1);
    assert.equal(refs.replacements, replacements + 1);
    await store.write({ html: "<p>changed</p>" });
    assert.deepEqual(await repo.findById(key), changed);
    assert.equal((await repo.listRevisions(scope)).length, history.length + 1);
  });

  test("embed-marker quoting is normalized before detecting unchanged HTML", async () => {
    const { repo, store: makeStore } = make();
    await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo, clock }, input: { ...key, title: "About", kind: "page" } });
    const store = makeStore();
    const canonical = `<div data-embed-config='{"type":"widget","slug":"contact-form"}'></div>`;
    await store.ensureHtmlFormat({ seedHtml: canonical });
    const before = await repo.findById(key);
    const history = await repo.listRevisions(scope);
    await store.write({ html: `<div data-embed-config="{&quot;type&quot;:&quot;widget&quot;,&quot;slug&quot;:&quot;contact-form&quot;}"></div>` });
    assert.deepEqual(await repo.findById(key), before);
    assert.deepEqual(await repo.listRevisions(scope), history);
  });

  test("a stale store conflicts even when its incoming HTML equals the latest stored HTML", async () => {
    const { repo, store: makeStore } = make();
    await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo, clock }, input: { ...key, title: "About", kind: "page" } });
    const stale = makeStore();
    await stale.ensureHtmlFormat({ seedHtml: "<p>original</p>" });
    const before = await repo.findById(key);
    await stale.write({ html: "<p>original</p>" });
    assert.deepEqual(await repo.findById(key), before);
    const winner = makeStore();
    await winner.read();
    await winner.write({ html: "<p>winner</p>" });
    const current = await repo.findById(key);
    const history = await repo.listRevisions(scope);
    await assert.rejects(stale.write({ html: "<p>winner</p>" }), PageConcurrentEditError);
    await assert.rejects(stale.write({ html: "<p>original</p>" }), PageConcurrentEditError);
    assert.deepEqual(await repo.findById(key), current);
    assert.deepEqual(await repo.listRevisions(scope), history);
  });
}

describe("HTML no-op saves: memory", () => saveContract(() => {
  const repo = new InMemoryPostRepo({});
  const refs = new CountingEntryRefs();
  return { repo, refs, store: () => new InMemoryPagesHtmlDocumentStore({ scope, deps: { repo, clock, entryRefsRepo: refs, reportUnindexedRef: warnUnindexedEntryRef, restoredEntryRefs: (required: Omit<Parameters<typeof restoredEntryRefs>[0], "report">) => restoredEntryRefs({ ...required, report: warnUnindexedEntryRef })} }) };
}));

describeEachDialect("HTML no-op saves: SQL", {
  tables: ["posts", "post_revisions"], make: (kernel) => ({ kernel, repo: postRepoFor(kernel, { mediaAccessEvidence: createMediaAccessEvidence() }) }),
}, (make) => {
  saveContract(() => {
    const { kernel, repo } = make();
    const refs = new CountingEntryRefs();
    return { repo, refs, store: () => new SqlPagesHtmlDocumentStore({ scope, deps: { statements: createPageHtmlStatements({ kernel }), clock, revisions: repo, entryRefsRepo: refs, reportUnindexedRef: warnUnindexedEntryRef, restoredEntryRefs: (required: Omit<Parameters<typeof restoredEntryRefs>[0], "report">) => restoredEntryRefs({ ...required, report: warnUnindexedEntryRef })} }) };
  });

  test("identical HTML without the optional revision port also preserves the row version", async () => {
    const { kernel, repo } = make();
    await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo, clock }, input: { ...key, title: "About", kind: "page" } });
    const store = new SqlPagesHtmlDocumentStore({ scope, deps: { statements: createPageHtmlStatements({ kernel }), clock, reportUnindexedRef: warnUnindexedEntryRef, restoredEntryRefs: (required: Omit<Parameters<typeof restoredEntryRefs>[0], "report">) => restoredEntryRefs({ ...required, report: warnUnindexedEntryRef })} });
    await store.ensureHtmlFormat({ seedHtml: "<p>original</p>" });
    const before = await repo.findById(key);
    await store.write({ html: "<p>original</p>" });
    assert.deepEqual(await repo.findById(key), before);
    assert.equal(store.capturedVersion(), before?.version);
  });
});
