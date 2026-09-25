import assert from "node:assert/strict";
import test from "node:test";

import { requiredThemeFiles, validateFileIdentityChange } from "../file-identity-lock.js";

/**
 * @file `validateFileIdentityChange` refuses a non-canonical path (an empty, `.`, or `..` segment,
 * or a `\` separator) BEFORE any of its other checks — see that function's own doc comment. Refusing
 * is the fix, not normalizing: silently collapsing `..` would turn a containment refusal into a
 * different (still non-canonical-looking, but now resolved) target.
 */

const THEME = { manifest: { apiVersion: 2 as const } };

test("a path with a '.' segment is refused as non-canonical, not normalized and allowed", () => {
  const req = requiredThemeFiles(2)[0];
  const p = req.includes("/") ? req.replace("/", "/./") : `./${req}`;

  assert.deepEqual(validateFileIdentityChange(THEME, p, { kind: "editable" } as never, "trashed"), {
    status: 400,
    code: "NON_CANONICAL_PATH",
    error: `'${p}' is not a canonical theme path — remove empty, '.' and '..' segments`,
  });
});

test("a path with an empty segment (double slash) is refused as non-canonical", () => {
  const p = "pages//x.html";

  assert.deepEqual(validateFileIdentityChange(THEME, p, { kind: "editable" } as never, "trashed"), {
    status: 400,
    code: "NON_CANONICAL_PATH",
    error: `'${p}' is not a canonical theme path — remove empty, '.' and '..' segments`,
  });
});
