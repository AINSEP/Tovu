import assert from "node:assert/strict";
import test from "node:test";

import type { AdminPost } from "../contracts.js";

/**
 * @file SPEC-047/ADR-056 REQ-3 — compile-time proof that `AdminPost`'s discriminated union makes
 * constructing a TipTap editor's props from an `"html"`-format row a COMPILE ERROR, not a runtime
 * `if` a future refactor could quietly delete or get backwards.
 *
 * `buildTiptapProps` below stands in for the real admin editor component's props contract
 * (`apps/admin/src/sections/PostEditor.tsx`'s TipTap integration expects a non-null document body) —
 * declared locally rather than imported, because `apps/admin` is a separate TypeScript project (its
 * own `tsconfig.json` includes `src` and, separately, `src/contracts/headless` from this repo's root) that
 * cannot import from `src/server`/`src/features`, and this test lives in the shared project
 * alongside `AdminPost` itself. The SHAPE below (`bodyJson: Record<string, unknown>`, required,
 * non-null) is the real contract, confirmed by direct read of `apps/admin/src/lib/api.ts`'s own
 * `AdminPost.bodyJson` and `PostEditor.tsx`'s `editor.commands.setContent(post.bodyJson as never)`
 * call.
 *
 * IMPORTANT CAVEAT, disclosed rather than silently worked around: this repo's root `tsconfig.json`
 * excludes every `__tests__` directory and every `.test.ts` file (see its own `exclude` array), and
 * `npm run typecheck` runs against that same config — so the `@ts-expect-error` directive below is NOT
 * type-checked by any command this repo currently runs (`npm test` uses `tsx`, which strips types
 * without checking them; ~10 other files in this codebase already carry the identical pattern and
 * the identical gap, e.g. `widgets/__tests__/unit/registry.unit.test.ts`). This file's directive was
 * independently verified with a scratch tsconfig that includes test files
 * (`tsc --noEmit` against this file alone, `strict: true`, same compiler options as the root
 * config) — confirmed to fail with "Unused '@ts-expect-error' directive" BEFORE `AdminPost` became a
 * discriminated union, and to pass cleanly after. That verification is not repeatable by a checked-in
 * script in this dispatch's scope; flagged in the handoff for the Coordinator/Architect to decide
 * whether test files should join `npm run typecheck`'s coverage project-wide.
 */

/** Stand-in for the real TipTap editor's props contract — see this file's header. */
interface TiptapEditorProps {
  bodyJson: Record<string, unknown>;
}

/** Only the `"doc"` branch of `AdminPost` satisfies this — the whole point of the union. */
function buildTiptapProps(post: Extract<AdminPost, { bodyFormat: "doc" }>): TiptapEditorProps {
  return { bodyJson: post.bodyJson };
}

const htmlPost: AdminPost = {
  id: "page-1",
  workspaceId: "ws-1",
  kind: "page",
  title: "About",
  slug: "about",
  status: "published",
  updatedAt: "2026-08-04T00:00:00.000Z",
  version: 3,
  bodyFormat: "html",
  bodyJson: null,
  bodyHtml: "<section data-agent-element=\"hero\">Hi</section>",
};

const docPost: AdminPost = {
  id: "post-1",
  workspaceId: "ws-1",
  kind: "post",
  title: "Hello",
  slug: "hello",
  status: "draft",
  updatedAt: "2026-08-04T00:00:00.000Z",
  version: 1,
  bodyFormat: "doc",
  bodyJson: { type: "doc", content: [] },
  bodyHtml: null,
};

test("REQ-3: constructing Tiptap props from the un-narrowed AdminPost union is a type error — an html-format row must be excluded by the type system, not a forgettable runtime check", () => {
  // @ts-expect-error — `AdminPost` (the full union) is not assignable to the "doc"-only branch
  // `buildTiptapProps` requires; this line only compiles because tsx does not type-check (see this
  // file's header for how the directive itself was independently verified against a real tsc pass).
  const props = buildTiptapProps(htmlPost);
  assert.ok(props, "reached at runtime only because tsx strips types — the real assertion is the @ts-expect-error line above");
});

test("REQ-3: narrowing on bodyFormat === 'doc' is what makes the doc branch constructible at all — the union is restrictive, not broken", () => {
  assert.equal(docPost.bodyFormat, "doc");
  if (docPost.bodyFormat === "doc") {
    const props = buildTiptapProps(docPost);
    assert.deepEqual(props.bodyJson, { type: "doc", content: [] });
  } else {
    assert.fail("docPost must narrow to the 'doc' branch");
  }
});

test("REQ-3: exhaustive switch over bodyFormat — a third format value would be a compile error at the 'never' branch below, matching the spec's own exhaustiveness claim", () => {
  function describe(post: AdminPost): string {
    switch (post.bodyFormat) {
      case "doc":
        return `doc:${Object.keys(post.bodyJson).length}`;
      case "html":
        return `html:${post.bodyHtml.length}`;
      default: {
        // If a third `bodyFormat` value is ever added to the union, `post` here is not `never` and
        // this line stops compiling — exactly the protection REQ-3's spec text claims.
        const exhaustive: never = post;
        return exhaustive;
      }
    }
  }

  assert.equal(describe(docPost), "doc:2");
  assert.equal(describe(htmlPost), `html:${htmlPost.bodyHtml!.length}`);
});
