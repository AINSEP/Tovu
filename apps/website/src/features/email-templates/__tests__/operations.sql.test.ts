import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { postRepoFor } from "#src/features/post/repo";
import { SqlPagesHtmlDocumentStore } from "#src/features/pages/html-document-store";
import { createEmailTemplate, editEmailTemplate, getEmailTemplate, listEmailTemplates, type EmailTemplateDeps } from "../operations.js";

/**
 * @file The shared operations over the REAL Pages storage: `SqlPostRepo` + `SqlPagesHtmlDocumentStore`
 * on the `posts` table, so the table's constraints (body-format shape, workspace+slug uniqueness)
 * and the store's compare-and-set and revision ledger are exercised, not a memory twin's.
 */

const WS = "ws-mail";
const HTML = '<html><head><meta name="email-fields" content="name"><title>Hi {{name}}</title></head><body><p>{{name}}</p></body></html>';

describeEachDialect("email templates on Pages storage", { tables: ["posts", "post_revisions"], make: (kernel) => kernel }, (makeKernel) => {
  test("create births an html row through the store; edit is version-conditioned and ledgered", async () => {
    const kernel = makeKernel();
    const clock = createFakeClock({ startIso: "2026-10-22T00:00:00.000Z" });
    const postRepo = postRepoFor(kernel);
    let n = 0;
    const deps: EmailTemplateDeps = {
      workspaceId: WS,
      postRepo,
      clock,
      idGen: { newId: () => `tpl-${++n}` },
      pagesHtmlStore: (scope) => new SqlPagesHtmlDocumentStore(scope, { kernel, clock, revisions: postRepo }),
    };
    const a = await createEmailTemplate({ deps, input: { name: "A", html: HTML }, actorId: "u1" });
    await createEmailTemplate({ deps, input: { name: "B", fields: ["code"] }, actorId: "u1" });
    assert.equal(a.subject, "Hi {{name}}");
    const edited = await editEmailTemplate({ deps, input: { id: a.id, html: HTML.replace("<p>", "<p>Dear "), expectedVersion: a.version }, actorId: "u1" });
    assert.equal(edited.version, a.version + 1);
    assert.match((await getEmailTemplate({ deps, id: a.id })).html, /Dear/);
    assert.deepEqual((await listEmailTemplates({ deps })).templates.map((t) => t.name).sort(), ["A", "B"]);
    const revisions = await postRepo.listRevisions({ workspaceId: WS, postId: a.id });
    assert.ok(revisions.length >= 2, "the store's revision ledger records the template's history");
  });
});
