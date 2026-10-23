import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, createPost, updatePost, type PostKind, type PostRecord } from "../../post/index.js";
import { EMAIL_TEMPLATE_KIND } from "../../post/post.js";
import { InMemoryPagesHtmlDocumentStore, PageConcurrentEditError, PageNotFoundError, PageKindMismatchError, type PagesHtmlDocumentStoreFactory } from "../../pages/index.js";
import {
  createEmailTemplate,
  editEmailTemplate,
  EmailTemplateInputError,
  EmailTemplateNotFoundError,
  EmailTemplateVersionConflictError,
  getEmailTemplate,
  listEmailTemplates,
  previewEmailTemplate,
  readFieldValues,
  renderEmailTemplateForSend,
  requireText,
  type EmailTemplateDeps,
} from "../operations.js";

const WS = "ws-1";
const HTML = '<html><head><meta name="email-fields" content="name=Ada"><title>Hi {{name}}</title></head><body><p>Hello {{name}} {{code}}</p><script>x()</script></body></html>';

function harness(options: { storeFactory?: (repo: InMemoryPostRepo, clock: { nowMs: () => number }) => PagesHtmlDocumentStoreFactory } = {}) {
  const repo = new InMemoryPostRepo([]);
  let ms = Date.parse("2026-10-22T00:00:00.000Z");
  const clock = { nowMs: () => ms };
  let n = 0;
  const deps: EmailTemplateDeps = {
    workspaceId: WS,
    postRepo: repo,
    clock,
    idGen: { newId: () => `tpl-${++n}` },
    pagesHtmlStore: options.storeFactory?.(repo, clock) ?? ((scope, options = {}) => new InMemoryPagesHtmlDocumentStore(scope, { ...options, repo, clock })),
  };
  return { repo, deps, tick: () => { ms += 1000; } };
}

test("create with html stores a draft html row of the email-template kind through the Pages store", async () => {
  const { repo, deps } = harness();
  const created = await createEmailTemplate({ deps, input: { name: "  Welcome  ", html: HTML }, actorId: "u1" });
  assert.deepEqual({ ...created, updatedAt: undefined }, {
    id: "tpl-1", name: "Welcome", subject: "Hi {{name}}", fields: [{ name: "name", sample: "Ada" }], version: 2, updatedAt: undefined, html: HTML, undeclaredFields: ["code"],
  });
  const row = await repo.findById({ workspaceId: WS, id: "tpl-1" });
  assert.equal(row?.kind as string, EMAIL_TEMPLATE_KIND);
  assert.equal(row?.status, "draft");
  assert.equal(row?.bodyFormat, "html");
  assert.equal(row?.slug, "email-template:tpl-1");
});

test("create without html builds the starter from subject and fields (subject defaults to the name)", async () => {
  const { deps } = harness();
  const a = await createEmailTemplate({ deps, input: { name: "Receipt", fields: ["orderId", { name: "name", sample: "Ada" }, { name: "plain" }] }, actorId: "u1" });
  assert.equal(a.subject, "Receipt");
  assert.deepEqual(a.fields, [{ name: "orderId" }, { name: "name", sample: "Ada" }, { name: "plain" }]);
  const b = await createEmailTemplate({ deps, input: { name: "B", subject: "Your {{code}}", fields: "code=X1" }, actorId: "u1" });
  assert.equal(b.subject, "Your {{code}}");
  assert.deepEqual(b.fields, [{ name: "code", sample: "X1" }]);
  const c = await createEmailTemplate({ deps, input: { name: "C" }, actorId: "u1" });
  assert.deepEqual(c.fields, []);
});

test("create refuses malformed input before writing anything", async () => {
  const { repo, deps } = harness();
  const cases: Record<string, unknown>[] = [
    {},
    { name: "   " },
    { name: "x".repeat(201) },
    { name: "n", html: 5 },
    { name: "n", subject: 5 },
    { name: "n", fields: 5 },
    { name: "n", fields: [{ sample: "s" }] },
    { name: "n", fields: [null] },
  ];
  for (const input of cases) {
    await assert.rejects(createEmailTemplate({ deps, input, actorId: "u1" }), EmailTemplateInputError, JSON.stringify(input));
  }
  assert.deepEqual(await repo.list({ workspaceId: WS }), []);
});

test("list returns only live templates, newest first, id breaking ties", async () => {
  const { repo, deps, tick } = harness();
  await createPost({ deps: { repo, clock: deps.clock }, input: { workspaceId: WS, id: "page-1", title: "A page", kind: "page" } });
  await createEmailTemplate({ deps, input: { name: "Old", html: HTML }, actorId: "u1" });
  tick();
  await createEmailTemplate({ deps, input: { name: "New B", html: HTML }, actorId: "u1" });
  await createEmailTemplate({ deps, input: { name: "New C", html: HTML }, actorId: "u1" });
  await createEmailTemplate({ deps, input: { name: "Trashed", html: HTML }, actorId: "u1" });
  const trashed = await repo.findById({ workspaceId: WS, id: "tpl-4" });
  await repo.save({ ...(trashed as PostRecord), deletedAt: "2026-10-22T01:00:00.000Z" });
  const { templates } = await listEmailTemplates({ deps });
  assert.deepEqual(templates.map((t) => t.name), ["New B", "New C", "Old"]);
});

test("get returns one template and refuses missing, trashed, non-template and not-yet-html rows", async () => {
  const { repo, deps } = harness();
  await createEmailTemplate({ deps, input: { name: "T", html: HTML }, actorId: "u1" });
  assert.equal((await getEmailTemplate({ deps, id: "tpl-1" })).html, HTML);
  await createPost({ deps: { repo, clock: deps.clock }, input: { workspaceId: WS, id: "page-1", title: "P", kind: "page" } });
  const docRow: PostRecord = { id: "raw", workspaceId: WS, title: "r", slug: "email-template:raw", bodyJson: { type: "doc", content: [] }, status: "draft", kind: EMAIL_TEMPLATE_KIND as unknown as PostKind, bodyFormat: "doc", bodyHtml: null, updatedAt: "2026-10-22T00:00:00.000Z", version: 1 };
  await repo.save(docRow);
  await repo.save({ ...docRow, id: "nohtml", bodyFormat: "html" });
  for (const id of ["nope", "page-1", "raw", "nohtml"]) {
    await assert.rejects(getEmailTemplate({ deps, id }), EmailTemplateNotFoundError, id);
  }
});

test("edit writes through compare-and-set and honours a stated expectedVersion", async () => {
  const { deps } = harness();
  const created = await createEmailTemplate({ deps, input: { name: "T", html: HTML }, actorId: "u1" });
  const edited = await editEmailTemplate({ deps, input: { id: "tpl-1", html: "<title>New</title><p>x</p>", expectedVersion: created.version }, actorId: "u1" });
  assert.equal(edited.subject, "New");
  assert.equal(edited.version, created.version + 1);
  await assert.rejects(
    editEmailTemplate({ deps, input: { id: "tpl-1", html: "<p>y</p>", expectedVersion: created.version }, actorId: "u1" }),
    EmailTemplateVersionConflictError,
  );
  const unconditioned = await editEmailTemplate({ deps, input: { id: "tpl-1", html: "<p>z</p>" }, actorId: "u1" });
  assert.equal(unconditioned.html, "<p>z</p>");
});

test("edit refuses bad input and unknown ids", async () => {
  const { deps } = harness();
  await createEmailTemplate({ deps, input: { name: "T", html: HTML }, actorId: "u1" });
  for (const input of [{ html: "x" }, { id: "tpl-1" }, { id: "tpl-1", html: "x", expectedVersion: 0 }, { id: "tpl-1", html: "x", expectedVersion: 1.5 }]) {
    await assert.rejects(editEmailTemplate({ deps, input, actorId: "u1" }), EmailTemplateInputError, JSON.stringify(input));
  }
  await assert.rejects(editEmailTemplate({ deps, input: { id: "nope", html: "x" }, actorId: "u1" }), EmailTemplateNotFoundError);
});

test("edit maps a concurrent write to a version conflict and lets any other failure through", async () => {
  for (const [thrown, expected] of [[new PageConcurrentEditError("raced"), EmailTemplateVersionConflictError], [new Error("disk"), Error]] as const) {
    const { deps } = harness({
      storeFactory: (repo, clock) => (scope, options = {}) => {
        const store = new InMemoryPagesHtmlDocumentStore(scope, { ...options, repo, clock });
        return Object.assign(store, { write: async () => { throw thrown; } });
      },
    });
    await createEmailTemplate({ deps, input: { name: "T", html: HTML }, actorId: "u1" });
    await assert.rejects(editEmailTemplate({ deps, input: { id: "tpl-1", html: "<p>x</p>" }, actorId: "u1" }), (err: unknown) => err instanceof expected && (expected === Error ? err === thrown : true));
  }
});

test("updatePost treats an email template as not found, so it can never be published", async () => {
  const { repo, deps } = harness();
  await createEmailTemplate({ deps, input: { name: "T", html: HTML }, actorId: "u1" });
  await assert.rejects(
    updatePost({ deps: { repo, clock: deps.clock }, input: { workspaceId: WS, id: "tpl-1", title: "T", slug: "t", bodyJson: { type: "doc", content: [] }, status: "published" } } as never),
    /was not found/,
  );
  assert.equal((await repo.findById({ workspaceId: WS, id: "tpl-1" }))?.status, "draft");
});

test("preview (admin mode) fills samples, keeps scripts, reports missing and undeclared fields", async () => {
  const { deps } = harness();
  await createEmailTemplate({ deps, input: { name: "T", html: HTML }, actorId: "u1" });
  const preview = await previewEmailTemplate({ deps, input: { id: "tpl-1" } });
  assert.equal(preview.subject, "Hi Ada");
  assert.match(preview.html, /<script>x\(\)<\/script>/);
  assert.deepEqual([preview.mode, preview.scriptsStripped, preview.missingFields, preview.undeclaredFields, preview.text], ["admin", false, ["code"], ["code"], undefined]);
  assert.equal((await previewEmailTemplate({ deps, input: { id: "tpl-1", mode: "admin", values: { name: "Bo", code: 7 } } })).subject, "Hi Bo");
});

test("preview (sent mode) of unsaved html is the static send render, samples unused", async () => {
  const { deps } = harness();
  const preview = await previewEmailTemplate({ deps, input: { html: HTML, mode: "sent", values: { code: true } } });
  assert.equal(preview.subject, "Hi");
  assert.doesNotMatch(preview.html, /script/);
  assert.equal(preview.text, "Hello true");
  assert.deepEqual([preview.mode, preview.scriptsStripped, preview.missingFields], ["sent", true, ["name"]]);
});

test("preview refuses a bad mode, bad values, and a request naming neither id nor html", async () => {
  const { deps } = harness();
  for (const input of [{ html: HTML, mode: "live" }, { html: HTML, values: [] }, { html: HTML, values: null }, { html: HTML, values: "x" }, { html: HTML, values: { a: {} } }, {}]) {
    await assert.rejects(previewEmailTemplate({ deps, input }), EmailTemplateInputError, JSON.stringify(input));
  }
  await assert.rejects(previewEmailTemplate({ deps, input: { id: "nope" } }), EmailTemplateNotFoundError);
});

test("renderEmailTemplateForSend returns subject, static html and text for a saved template", async () => {
  const { deps } = harness();
  await createEmailTemplate({ deps, input: { name: "T", html: HTML }, actorId: "u1" });
  const sent = await renderEmailTemplateForSend({ deps, id: "tpl-1", values: { name: "Ada", code: "C" } });
  assert.deepEqual({ subject: sent.subject, text: sent.text, missingFields: sent.missingFields }, { subject: "Hi Ada", text: "Hello Ada C", missingFields: [] });
  assert.doesNotMatch(sent.html, /script|email-fields/);
  await assert.rejects(renderEmailTemplateForSend({ deps, id: "nope", values: {} }), EmailTemplateNotFoundError);
});

test("readFieldValues and requireText contracts", () => {
  assert.deepEqual(readFieldValues({ value: undefined }), {});
  assert.deepEqual(readFieldValues({ value: { a: "x", b: 2, c: false } }), { a: "x", b: "2", c: "false" });
  assert.equal(requireText({ value: " a ", key: "k", max: 1 }), "a");
  assert.throws(() => requireText({ value: 3, key: "k", max: 1 }), /k is required/);
  assert.throws(() => requireText({ value: "ab", key: "k", max: 1 }), /at most 1/);
});

test("a Pages conversion failure rolls back the template and permits a clean retry", async () => {
  let broken = true;
  const { deps, repo } = harness({ storeFactory: (repo, clock) => (scope, options = {}) => {
    const store = new InMemoryPagesHtmlDocumentStore(scope, { ...options, repo, clock });
    return { read: () => store.read(), capturedVersion: () => store.capturedVersion(), write: html => store.write(html), ensureHtmlFormat: async seed => { if (broken) throw new Error("conversion failed"); return store.ensureHtmlFormat(seed); } };
  } });
  await assert.rejects(createEmailTemplate({ deps, input: { name: "Atomic", html: HTML }, actorId: "u" }), /conversion failed/);
  assert.deepEqual(await repo.list({ workspaceId: WS }), []);
  broken = false; const created = await createEmailTemplate({ deps, input: { name: "Atomic", html: HTML }, actorId: "u" }); assert.equal(created.name, "Atomic");
  assert.equal((await listEmailTemplates({ deps })).templates.length, 1);
});

test("object-field samples with unsupported delimiters are refused instead of silently changing declarations", async () => {
  const { deps, repo } = harness();
  for (const field of [{ name: "name", sample: "Doe, Jane" }, { name: "first,last" }, { name: "name=alias" }]) {
    await assert.rejects(createEmailTemplate({ deps, input: { name: "N", fields: [field] }, actorId: "u" }), EmailTemplateInputError);
  }
  assert.deepEqual(await repo.list({ workspaceId: WS }), []);
  const created = await createEmailTemplate({ deps, input: { name: "N", fields: [{ name: "name", sample: "Jane Doe" }] }, actorId: "u" });
  assert.deepEqual(created.fields, [{ name: "name", sample: "Jane Doe" }]);
});

test("template listing is bounded and cursor-based, excludes unrelated bodies, and validates pagination", async () => {
  const { deps, repo } = harness();
  for (let i = 0; i < 4; i++) await createEmailTemplate({ deps, input: { name: `Template ${i}`, html: HTML }, actorId: "u" });
  const first = await listEmailTemplates({ deps, input: { limit: 2 } }); assert.equal(first.templates.length, 2); assert.ok(first.nextCursor);
  const second = await listEmailTemplates({ deps, input: { limit: 2, cursor: first.nextCursor } });
  assert.equal(second.templates.length, 2); assert.equal(second.nextCursor, undefined);
  assert.equal(new Set([...first.templates, ...second.templates].map(row => row.id)).size, 4);
  for (const input of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { cursor: "bad" }, { cursor: Buffer.from("{}").toString("base64url") }]) await assert.rejects(listEmailTemplates({ deps, input }), EmailTemplateInputError);
  const original = repo.list.bind(repo); repo.list = async () => { throw new Error("unbounded list must not run"); };
  assert.equal((await listEmailTemplates({ deps })).templates.length, 4); repo.list = original;
  const missing = Object.assign(Object.create(repo), { listHtmlByKind: undefined });
  await assert.rejects(listEmailTemplates({ deps: { ...deps, postRepo: missing } }), /listing is unavailable/);
});

test("generic Trash classifies an email template through the existing Post lifecycle", async () => {
  const { TRASH_ITEM_DELEGATES } = await import("../../trash/trash-item-tool.js");
  const { deps, repo } = harness(); const template = await createEmailTemplate({ deps, input: { name: "Trash me", html: HTML }, actorId: "u" });
  const delegate = TRASH_ITEM_DELEGATES.get("post")!;
  assert.deepEqual(await delegate.toDelegateInput({ workspaceId: WS, postRepo: repo } as never, template.id), { id: template.id, kind: "post" });
});


test("Pages stores cannot read, convert or write templates; template-scoped stores cannot read Pages", async () => {
  const { deps, repo } = harness();
  const template = await createEmailTemplate({ deps, input: { name: "Private template", html: HTML }, actorId: "owner" });
  const page = new InMemoryPagesHtmlDocumentStore({ workspaceId: WS, postId: template.id }, { repo, clock: deps.clock });
  await assert.rejects(page.read(), PageNotFoundError);
  await assert.rejects(page.ensureHtmlFormat("<p>bypass</p>"), PageKindMismatchError);
  await assert.rejects(page.write("<p>bypass</p>"), /before read/);
  assert.equal((await getEmailTemplate({ deps, id: template.id })).html, HTML);
  await createPost({ deps: { repo, clock: deps.clock }, input: { workspaceId: WS, id: "only-page", title: "Page", kind: "page" } });
  const pageScope = { workspaceId: WS, postId: "only-page" };
  await new InMemoryPagesHtmlDocumentStore(pageScope, { repo, clock: deps.clock }).ensureHtmlFormat("<p>page</p>");
  const templateStore = deps.pagesHtmlStore(pageScope, { allowedKinds: new Set([EMAIL_TEMPLATE_KIND]) });
  await assert.rejects(templateStore.read(), PageNotFoundError);
  await assert.rejects(templateStore.ensureHtmlFormat("<p>bypass</p>"), PageKindMismatchError);
});
