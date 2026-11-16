import assert from "node:assert/strict";
import test from "node:test";

import { slugifyFormName } from "@jini-ai/cms/forms";
import { formSlugPolicy } from "../../index.js";

test("formSlugPolicy.slugify takes the plain name string Jini's duplicate-slug derivation passes", () => {
  // Jini's `slugifyFormName` calls its `slugify: (name: string) => string` slot positionally, so the
  // policy must adapt Tovu's `toSlug({ text })` at this boundary instead of passing it by reference.
  assert.equal(formSlugPolicy.slugify("Contact Us"), "contact-us");
  assert.equal(slugifyFormName({ name: "Contact Us", slugify: formSlugPolicy.slugify }), "contact-us");
});
