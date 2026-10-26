import assert from "node:assert/strict";
import test from "node:test";

import { buildCreateForm } from "../custom-credential-create-ui.js";
import { siteOnlyScope, withSiteOnlyField } from "../site-only-field.js";

/** @file "Only for this site" on key cards (owner 2026-10-25): offered only with a project store, unticked by default. */

test("the box is appended, last and unticked, only where a project store is attached", () => {
  const form = buildCreateForm({ prefill: {} });
  assert.equal(withSiteOnlyField({ form, shared: false }), form);
  const shared = withSiteOnlyField({ form, shared: true });
  assert.deepEqual(shared.fields.slice(0, -1), form.fields);
  assert.deepEqual(shared.fields.at(-1), { kind: "boolean", name: "onlyThisSite", label: "Only for this site",
    hint: "Leave unticked so every site in this project can use this key.", value: false });
});

test("only a ticked box (true) scopes the save to this site", () => {
  assert.equal(siteOnlyScope({ values: { onlyThisSite: true } }), "site");
  for (const value of [false, undefined, "true", 1]) assert.equal(siteOnlyScope({ values: { onlyThisSite: value } }), undefined);
});
