import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createPost, updatePost, type PostRepoPort } from "../../post/post.js";
import { postRepoFor } from "../../post/repo.js";
import { InMemoryPostRepo } from "../../post/repo.memory.js";
import { InMemoryPagesHtmlDocumentStore } from "../html-document-store.memory.js";
import { PageConcurrentEditError, SqlPagesHtmlDocumentStore, type PagesHtmlDocumentStorePort } from "../html-document-store.js";

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
    await createPost({ deps: { repo, clock }, input: { ...key, title: "About", kind: "page" } });
    await makeStore().ensureHtmlFormat("<p>original</p>");
    const before = await repo.findById(key);
    assert.ok(before);
    const history = await repo.listRevisions(scope);
    const deps = { repo, clock, outbox: new InMemoryOutbox() };
    const input = { ...key, title: before.title, slug: before.slug, status: before.status,
      bodyJson: before.bodyJson, expectedVersion: before.version };
    assert.deepEqual((await updatePost({ deps, input })).post, before);
    assert.deepEqual(await repo.listRevisions(scope), history);
    const changed = (await updatePost({ deps, input: { ...input, title: "New title" } })).post;
    assert.equal(changed.bodyHtml, before.bodyHtml);
    assert.equal(changed.bodyFormat, "html");
    assert.equal(changed.version, before.version + 1);
    assert.equal((await repo.listRevisions(scope)).length, history.length + 1);
  });

  test("identical HTML skips the row, revision and reference writes; a real change still advances once", async () => {
    const { repo, refs, store: makeStore } = make();
    await createPost({ deps: { repo, clock }, input: { ...key, title: "About", kind: "page" } });
    const store = makeStore();
    await store.ensureHtmlFormat("<p>original</p>");
    const before = await repo.findById(key);
    const history = await repo.listRevisions(scope);
    const replacements = refs.replacements;

    await store.write(await store.read());
    await store.write("<p>original</p>");
    assert.deepEqual(await repo.findById(key), before);
    assert.deepEqual(await repo.listRevisions(scope), history);
    assert.equal(store.capturedVersion(), before?.version);
    assert.equal(refs.replacements, replacements);

    await store.write("<p>changed</p>");
    const changed = await repo.findById(key);
    assert.equal(changed?.version, before!.version + 1);
    assert.equal((await repo.listRevisions(scope)).length, history.length + 1);
    assert.equal(refs.replacements, replacements + 1);
    await store.write("<p>changed</p>");
    assert.deepEqual(await repo.findById(key), changed);
    assert.equal((await repo.listRevisions(scope)).length, history.length + 1);
  });

  test("embed-marker quoting is normalized before detecting unchanged HTML", async () => {
    const { repo, store: makeStore } = make();
    await createPost({ deps: { repo, clock }, input: { ...key, title: "About", kind: "page" } });
    const store = makeStore();
    const canonical = `<div data-embed-config='{"type":"widget","slug":"contact-form"}'></div>`;
    await store.ensureHtmlFormat(canonical);
    const before = await repo.findById(key);
    const history = await repo.listRevisions(scope);
    await store.write(`<div data-embed-config="{&quot;type&quot;:&quot;widget&quot;,&quot;slug&quot;:&quot;contact-form&quot;}"></div>`);
    assert.deepEqual(await repo.findById(key), before);
    assert.deepEqual(await repo.listRevisions(scope), history);
  });

  test("a stale store conflicts even when its incoming HTML equals the latest stored HTML", async () => {
    const { repo, store: makeStore } = make();
    await createPost({ deps: { repo, clock }, input: { ...key, title: "About", kind: "page" } });
    const stale = makeStore();
    await stale.ensureHtmlFormat("<p>original</p>");
    const before = await repo.findById(key);
    await stale.write("<p>original</p>");
    assert.deepEqual(await repo.findById(key), before);
    const winner = makeStore();
    await winner.read();
    await winner.write("<p>winner</p>");
    const current = await repo.findById(key);
    const history = await repo.listRevisions(scope);
    await assert.rejects(stale.write("<p>winner</p>"), PageConcurrentEditError);
    await assert.rejects(stale.write("<p>original</p>"), PageConcurrentEditError);
    assert.deepEqual(await repo.findById(key), current);
    assert.deepEqual(await repo.listRevisions(scope), history);
  });
}

describe("HTML no-op saves: memory", () => saveContract(() => {
  const repo = new InMemoryPostRepo();
  const refs = new CountingEntryRefs();
  return { repo, refs, store: () => new InMemoryPagesHtmlDocumentStore(scope, { repo, clock, entryRefsRepo: refs }) };
}));

describeEachDialect("HTML no-op saves: SQL", {
  tables: ["posts", "post_revisions"], make: (kernel) => ({ kernel, repo: postRepoFor(kernel) }),
}, (make) => {
  saveContract(() => {
    const { kernel, repo } = make();
    const refs = new CountingEntryRefs();
    return { repo, refs, store: () => new SqlPagesHtmlDocumentStore(scope, { kernel, clock, revisions: repo, entryRefsRepo: refs }) };
  });

  test("identical HTML without the optional revision port also preserves the row version", async () => {
    const { kernel, repo } = make();
    await createPost({ deps: { repo, clock }, input: { ...key, title: "About", kind: "page" } });
    const store = new SqlPagesHtmlDocumentStore(scope, { kernel, clock });
    await store.ensureHtmlFormat("<p>original</p>");
    const before = await repo.findById(key);
    await store.write("<p>original</p>");
    assert.deepEqual(await repo.findById(key), before);
    assert.equal(store.capturedVersion(), before?.version);
  });
});
