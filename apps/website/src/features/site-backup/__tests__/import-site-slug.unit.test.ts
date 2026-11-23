/** B165: a display name ending in "." or a space is fine as a label; only the derived folder name
 * has to be portable. Windows device names are still refused through the slug check. */
import assert from "node:assert/strict";
import test from "node:test";
import { importSiteSlug } from "../import-backend-steps.js";

test("display names ending in a dot or a space import under a portable slug", () => {
  assert.equal(importSiteSlug({ displayName: "Acme Inc." }), "acme-inc");
  assert.equal(importSiteSlug({ displayName: "  Field notes  " }), "field-notes");
});

test("a Windows device name is still refused", () => {
  assert.throws(() => importSiteSlug({ displayName: "CON" }));
});
