import assert from "node:assert/strict";
import test from "node:test";
import { buildDeleteConfirmationResource, type DeleteConfirmationSubject } from "../delete-confirmation-ui.js";

for (const kind of ["post", "page"] as const) {
  for (const status of ["draft", "published"] as const) {
    test(`${kind} ${status} delete surface pins the version, displayed subject and both callback decisions`, () => {
      const subject: DeleteConfirmationSubject = { id: "entry-7", kind, status, version: 9, title: "Rock & <Roll>", slug: "rock-roll" };
      const ui = buildDeleteConfirmationResource({ subject, exchangeId: "delete-42" });
      assert.equal(ui.resource.uri, "ui://tovu/content-post-delete/entry-7/9");
      const html = ui.resource.text;
      assert.ok(html);
      assert.equal(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1], `Delete this ${kind}?`);
      assert.ok(html.includes("<dt>Title</dt><dd>Rock &amp; &lt;Roll&gt;</dd>"));
      assert.ok(html.includes("<dt>Slug</dt><dd>rock-roll</dd>"));
      assert.ok(html.includes(`<dt>Status</dt><dd>${status}</dd>`));
      assert.equal(html.includes(`This ${kind} is currently published.`), status === "published");
      const match = html.match(/var PLAN = (.*);/);
      assert.ok(match);
      const plan = JSON.parse(match[1]);
      assert.deepEqual(plan.confirm, { toolName: "content_post_delete", params: { __exchangeId: "delete-42", decision: "confirm" } });
      assert.deepEqual(plan.cancel, { toolName: "content_post_delete", params: { __exchangeId: "delete-42", decision: "cancel" } });
    });
  }
}
