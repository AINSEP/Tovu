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

for (const p of ["", "pages/../theme.json", "../x", "pages\\x.html"]) {
  test(`non-canonical path ${JSON.stringify(p)} is refused`, () => {
    assert.deepEqual(validateFileIdentityChange(THEME, p, { kind: "editable" } as never, "trashed"), {
      status: 400, code: "NON_CANONICAL_PATH",
      error: `'${p}' is not a canonical theme path — remove empty, '.' and '..' segments`,
    });
  });
}

test("canonical paths exercise each identity lock and compiled source exceptions", () => {
  const editable = { kind: "editable" } as const;
  for (const action of ["renamed", "deleted", "trashed"] as const) {
    for (const p of requiredThemeFiles(2)) {
      assert.deepEqual(validateFileIdentityChange(THEME, p, editable as never, action), {
        status: 409, code: "REQUIRED_FILE_LOCKED",
        error: `'${p}' cannot be ${action} — every theme requires it at this exact path`,
      });
    }
    assert.deepEqual(validateFileIdentityChange(THEME, "render/pages/custom.html", { kind: "generated-readonly", reason: "compiled output" } as never, action), {
      status: 409, code: "GENERATED_READONLY", error: "'render/pages/custom.html' is read-only: compiled output",
    });
    assert.deepEqual(validateFileIdentityChange(THEME, "scripts/main.js", editable as never, action), {
      status: 409, code: "READ_ONLY_FILE", error: `'scripts/main.js' is read-only in Explore and cannot be ${action}`,
    });
    assert.equal(validateFileIdentityChange(THEME, "css/custom.css", editable as never, action), null);
    const compiled = { manifest: { apiVersion: 2 as const, build: { source: "compiled" as const } } };
    assert.equal(validateFileIdentityChange(compiled, "src/App.tsx", editable as never, action), null);
    assert.equal(validateFileIdentityChange(compiled, "src/main.js", editable as never, action)?.code, "READ_ONLY_FILE");
    assert.equal(validateFileIdentityChange(compiled, "theme.json", editable as never, action)?.code, "REQUIRED_FILE_LOCKED");
  }
});
