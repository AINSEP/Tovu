/**
 * Moves the b-g6 run claimed complete must stay complete: once a module is deleted in favour of its
 * new owner, no source may reach the old path again under any specifier form (`#src/…`, relative
 * with or without `.js`, cross-app relative, or a bare package subpath). The still-open shell groups
 * (OAuth args/ports, mail, secrets, `cms/settings`) are deliberately NOT listed here; they are
 * tracked in `development/open-bugs.md` until their moves land.
 */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { MOVED_MODULES, findOldSpecifierImports, scanRepoForOldSpecifiers } from "../check-moved-specifiers.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

test("old-specifier: no source in apps/, packages/, content/ or development/ imports a moved module's old path", () => {
  assert.deepEqual(scanRepoForOldSpecifiers({ repoRoot: REPO_ROOT }), []);
});

test("old-specifier: the listed old paths are the deleted shells, not live files", () => {
  assert.deepEqual(MOVED_MODULES.map(entry => entry.oldPath).sort(), [
    "@jini-ai/cms/seo/xml-escape",
    "apps/website/src/features/post/contracts",
    "apps/website/src/platform/oauth/ports",
  ]);
});

test("old-specifier: every specifier form that reaches a deleted shell is caught", () => {
  const cases: { file: string; specifier: string }[] = [
    { file: "apps/website/src/features/post/post-trash.ts", specifier: "./contracts.js" },
    { file: "apps/website/src/features/post/__tests__/x.test.ts", specifier: "../contracts" },
    { file: "apps/website/src/features/trash/a.ts", specifier: "#src/features/post/contracts" },
    { file: "apps/admin/src/a.ts", specifier: "../../website/src/features/post/contracts.js" },
    { file: "apps/website/src/platform/oauth/__tests__/helpers.ts", specifier: "../ports.js" },
    { file: "apps/website/src/x.ts", specifier: "@jini-ai/cms/seo/xml-escape" },
    { file: "apps/website/src/x.ts", specifier: "@jini-ai/cms/seo/xml-escape.js" },
  ];
  for (const { file, specifier } of cases) {
    const text = `import { x } from "${specifier}";\nconst y = await import('${specifier}');`;
    assert.equal(findOldSpecifierImports({ file, text }).length, 2, `${file} -> ${specifier}`);
  }
});

test("old-specifier: new owners and look-alike names are not flagged", () => {
  for (const { file, specifier } of [
    { file: "apps/website/src/features/post/a.ts", specifier: "#src/platform/publish-contracts" },
    { file: "apps/website/src/features/forms/a.ts", specifier: "./contracts.js" },
    { file: "apps/website/src/platform/oauth/a.ts", specifier: "./endpoint-safety.js" },
    { file: "apps/website/src/x.ts", specifier: "@jini-ai/core/text" },
    { file: "apps/website/src/x.ts", specifier: "@jini-ai/cms/seo" },
  ]) assert.deepEqual(findOldSpecifierImports({ file, text: `import { x } from "${specifier}";` }), [], specifier);
});
