import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { PostRecord } from "#src/features/post/index";
import { InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "#src/media/index";
import {
  MAX_CONTENT_EMBED_DEPTH,
  MAX_CONTENT_EMBED_FETCHES,
  resolveHtmlFormatContentMarkers,
  type ContentMarkerResolutionDeps,
} from "../pages.js";

/**
 * @file Guard 3 of the unified-content-marker design (`ADS-memory/reports/design/
 * 2026-08-11-unified-content-marker-and-templates.md`) — {@link resolveHtmlFormatContentMarkers}
 * must TERMINATE when a chain of `"html"`-format `content` embeds resolves back into itself, whether
 * directly (A embeds A) or through an intermediate (A embeds B embeds A).
 *
 * `MAX_HTML_EMBEDS_PER_PAGE` is a per-page COUNT and does not by itself bound a cycle — a page can
 * legally contain the SAME single marker that, once resolved, contains another one referencing back.
 * These tests exist because a per-page count alone would not have caught that: every scenario below
 * is exactly one marker per body, well under any per-page cap, yet would recurse forever without the
 * depth/budget guard this file certifies.
 *
 * Termination is proven with a real wall-clock timeout (`withTimeout`), not merely "the assertions
 * after the `await` ran" — a promise that never resolves would otherwise hang this test file (and,
 * per this session's own standing warning about `static-render.test.ts`, potentially the whole run)
 * rather than fail cleanly. `findById` call counting is the second, independent proof: it shows the
 * guard bounds actual DB work, not merely that the function eventually stops for some other reason.
 */

const WORKSPACE_ID = "ws-content-recursion";

function postRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "a",
    workspaceId: WORKSPACE_ID,
    title: "Entity",
    slug: "entity",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "html",
    bodyHtml: "",
    status: "published",
    kind: "page",
    updatedAt: "2026-08-11T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

/** Wraps `InMemoryPostRepo.findById` to count real lookups — the guard-3 budget's own claim ("bounds
 * total DB work") is only proven by watching the call count, not by watching wall-clock time alone. */
function countingPostRepo(rows: PostRecord[]): { repo: InMemoryPostRepo; callCount: () => number } {
  const repo = new InMemoryPostRepo(rows);
  let calls = 0;
  const originalFindById = repo.findById.bind(repo);
  repo.findById = async (required) => {
    calls += 1;
    return originalFindById(required);
  };
  return { repo, callCount: () => calls };
}

function deps(postRepo: InMemoryPostRepo): ContentMarkerResolutionDeps {
  return {
    workspaceId: WORKSPACE_ID,
    postRepo,
    entryRepo: new InMemoryEntryRepo(),
    mediaRepo: new InMemoryMediaRepo([]),
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
  };
}

/** Proves TERMINATION with a real deadline — a promise that never settles fails this immediately
 * instead of hanging the test run, per this session's own standing warning about a prior hang. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not terminate within ${ms}ms — guard 3 regression`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

test("GUARD 3: a self-referencing body (A embeds A) terminates", async () => {
  const { repo, callCount } = countingPostRepo([
    postRecord({ id: "a", bodyHtml: `<div data-embed-config='{"type":"content","id":"a"}'></div>` }),
  ]);

  const startHtml = `<main data-embed-config='{"type":"content","id":"a"}'></main>`;
  const result = await withTimeout(
    resolveHtmlFormatContentMarkers(deps(repo), startHtml, 0, { remaining: MAX_CONTENT_EMBED_FETCHES }),
    5000,
    "self-referencing resolution"
  );

  assert.equal(typeof result, "string");
  assert.ok(callCount() <= MAX_CONTENT_EMBED_DEPTH + 1, `expected bounded fetch count, got ${callCount()}`);
});

test("GUARD 3: a mutually-referencing chain (A embeds B, B embeds A) terminates", async () => {
  const { repo, callCount } = countingPostRepo([
    postRecord({ id: "a", bodyHtml: `<div data-embed-config='{"type":"content","id":"b"}'></div>` }),
    postRecord({ id: "b", bodyHtml: `<div data-embed-config='{"type":"content","id":"a"}'></div>` }),
  ]);

  const startHtml = `<main data-embed-config='{"type":"content","id":"a"}'></main>`;
  const result = await withTimeout(
    resolveHtmlFormatContentMarkers(deps(repo), startHtml, 0, { remaining: MAX_CONTENT_EMBED_FETCHES }),
    5000,
    "mutually-referencing resolution"
  );

  assert.equal(typeof result, "string");
  assert.ok(callCount() <= MAX_CONTENT_EMBED_DEPTH + 1, `expected bounded fetch count, got ${callCount()}`);
});

test("GUARD 3: depth alone bounds a self-reference to a FIXED fetch count, never growing with more recursion", () => {
  // A precise version of the termination proof above: for a SINGLE self-referencing marker at every
  // level (no branching), the depth cap alone determines the fetch count — this pins the exact number
  // rather than only an upper bound, so a regression that silently widened the cap would be caught
  // even if it were still finite (and therefore invisible to the timeout-based tests alone).
  //
  // The count is MAX_CONTENT_EMBED_DEPTH + 1, not MAX_CONTENT_EMBED_DEPTH: one recursive fetch per
  // depth level (0 through MAX_CONTENT_EMBED_DEPTH - 1) PLUS one more when the deepest level's still-
  // unresolved marker reaches that level's own `resolveHtmlPageEmbeds` call (every successful splice
  // step also resolves the OTHER marker types in its nested html, and the cut-off marker is still
  // sitting right there) — `resolveContentTypeEmbeds` (`resolver-service.ts`) re-fetches it once more
  // to learn it is still `"html"`-format and degrade it, logging the "reached the registry resolver
  // instead of the recursive pre-splice pass" warning. That extra fetch is a fixed, one-time cost at
  // the boundary, not a further per-level multiplier — it does not change with depth or fan-out.
  return (async () => {
    const { repo, callCount } = countingPostRepo([
      postRecord({ id: "a", bodyHtml: `<div data-embed-config='{"type":"content","id":"a"}'></div>` }),
    ]);
    await resolveHtmlFormatContentMarkers(
      deps(repo),
      `<main data-embed-config='{"type":"content","id":"a"}'></main>`,
      0,
      { remaining: MAX_CONTENT_EMBED_FETCHES }
    );
    assert.equal(callCount(), MAX_CONTENT_EMBED_DEPTH + 1, `expected a fixed fetch count, got ${callCount()}`);
  })();
});

test("GUARD 3 (resource bound): a WIDE branching structure exceeding the fetch budget is capped, not exponential", async () => {
  // The scenario depth-limiting alone does NOT bound: many DISTINCT ids at one level, each also
  // branching. Without the shared budget, a full-depth traversal of an N-way branch could fetch up to
  // N^depth entities. Every row here is a leaf (bodyFormat "html", empty body) so nothing recurses
  // past this one level — the budget must still cap the FIRST level's fan-out at
  // MAX_CONTENT_EMBED_FETCHES, proving the cap is a real ceiling and not merely "happened to be small
  // enough this time".
  const branchCount = MAX_CONTENT_EMBED_FETCHES + 25;
  const rows: PostRecord[] = [];
  let startHtml = "";
  for (let i = 0; i < branchCount; i += 1) {
    const id = `leaf-${i}`;
    rows.push(postRecord({ id, bodyHtml: "<p>leaf</p>" }));
    startHtml += `<div data-embed-config='{"type":"content","id":"${id}"}'></div>`;
  }
  const { repo, callCount } = countingPostRepo(rows);

  await withTimeout(
    resolveHtmlFormatContentMarkers(deps(repo), startHtml, 0, { remaining: MAX_CONTENT_EMBED_FETCHES }),
    5000,
    "wide-branch resolution"
  );

  assert.equal(callCount(), MAX_CONTENT_EMBED_FETCHES, "the shared budget must cap total fetches, not the branch count");
});

test("a non-recursive, non-cyclic html-format reference resolves normally and splices real content in", async () => {
  const { repo } = countingPostRepo([postRecord({ id: "a", bodyHtml: "<p>Real spliced content</p>" })]);

  const result = await resolveHtmlFormatContentMarkers(
    deps(repo),
    `<main data-embed-config='{"type":"content","id":"a"}'></main>`,
    0,
    { remaining: MAX_CONTENT_EMBED_FETCHES }
  );

  assert.ok(result.includes("Real spliced content"), "a genuinely resolvable html-format reference must still work");
  assert.ok(!result.includes("data-embed-config"), "the resolved marker must be inert to a later re-scan (withInnerContentFinal)");
});

test("a doc-format reference is left untouched for the registry resolver, not consumed by this recursive pass", () => {
  return (async () => {
    const { repo, callCount } = countingPostRepo([
      postRecord({ id: "doc-1", bodyFormat: "doc", bodyHtml: null }),
    ]);

    const startHtml = `<main data-embed-config='{"type":"content","id":"doc-1"}'></main>`;
    const result = await resolveHtmlFormatContentMarkers(deps(repo), startHtml, 0, { remaining: MAX_CONTENT_EMBED_FETCHES });

    assert.equal(result, startHtml, "a doc-format target must be left exactly as authored by this pass");
    assert.equal(callCount(), 1, "one fetch to LEARN it is doc-format, then it is left alone — no further recursion");
  })();
});
