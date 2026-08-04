import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectsExplicitNavigationIntent, resolvePublicTarget } from "../client-directives";

/**
 * SPEC-046 REQ-6/REQ-8 (`resolvePublicTarget`) and D-1 (`detectsExplicitNavigationIntent`). The
 * `FakeRow`/`row`/`fakePort` shapes below mirror `tools.test.ts` deliberately — this file proves the
 * one shared resolver `tools.ts`'s page-action tools all call, so it needs the same "leaky by
 * contract" fake `PostRepoPort` that file documents (see its header): `list()` returns every row,
 * drafts and trashed rows included, so a passing test here proves THIS function's filter, not the
 * port's.
 */

interface FakeRow {
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  bodyJson: unknown;
  status: "draft" | "published";
  kind: "post" | "page";
  updatedAt: string;
  version: number;
  deletedAt?: string | null;
}

function row(partial: Partial<FakeRow> & { slug: string; status: FakeRow["status"] }): FakeRow {
  return {
    id: `id-${partial.slug}`,
    workspaceId: "ws",
    title: partial.slug,
    bodyJson: {},
    kind: "post",
    updatedAt: "2026-01-01",
    version: 1,
    deletedAt: null,
    ...partial,
  };
}

const ROWS: FakeRow[] = [
  row({ slug: "public-post", status: "published", title: "Public Post" }),
  row({ slug: "secret-draft", status: "draft", title: "Secret Draft" }),
  row({ slug: "taken-down", status: "published", title: "Taken Down", deletedAt: "2026-02-01" }),
];

function fakePort(rows: FakeRow[] = ROWS) {
  return { list: async () => rows as never };
}

describe("resolvePublicTarget", () => {
  it("resolves a published slug to its slug/title/path", async () => {
    const target = await resolvePublicTarget({ postRepo: fakePort(), workspaceId: "ws" }, "public-post");
    assert.deepEqual(target, { slug: "public-post", title: "Public Post", path: "/public-post" });
  });

  it("path is always /<slug> — never a URL taken from anything upstream", async () => {
    const target = await resolvePublicTarget({ postRepo: fakePort(), workspaceId: "ws" }, "public-post");
    assert.equal(target?.path, "/public-post");
  });

  it("returns null for a draft slug", async () => {
    assert.equal(await resolvePublicTarget({ postRepo: fakePort(), workspaceId: "ws" }, "secret-draft"), null);
  });

  it("returns null for a trashed-but-status-published slug (deletedAt independent of status)", async () => {
    assert.equal(await resolvePublicTarget({ postRepo: fakePort(), workspaceId: "ws" }, "taken-down"), null);
  });

  it("returns null for a slug that does not exist", async () => {
    assert.equal(await resolvePublicTarget({ postRepo: fakePort(), workspaceId: "ws" }, "no-such-slug"), null);
  });

  it("returns null for a non-string or empty slug rather than throwing", async () => {
    for (const bad of [undefined, null, 42, {}, [], "", "   "]) {
      assert.equal(await resolvePublicTarget({ postRepo: fakePort(), workspaceId: "ws" }, bad), null, `${JSON.stringify(bad)} must refuse`);
    }
  });

  it("off-site URLs, schemes, and admin-shaped strings never equal a real slug, so they refuse by construction", async () => {
    const adversarial = [
      "https://evil.example/public-post",
      "//evil.example",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "admin",
      "api",
      "../../etc/passwd",
    ];
    for (const slug of adversarial) {
      assert.equal(await resolvePublicTarget({ postRepo: fakePort(), workspaceId: "ws" }, slug), null, `"${slug}" must refuse`);
    }
  });

  it("scopes the underlying list to the given workspace, matching listPublishedPosts's own contract", async () => {
    const calls: unknown[] = [];
    const port = {
      list: async (params: unknown) => {
        calls.push(params);
        return ROWS as never;
      },
    };
    await resolvePublicTarget({ postRepo: port as never, workspaceId: "ws-42" }, "public-post");
    assert.deepEqual(calls[0], { workspaceId: "ws-42" });
  });
});

describe("detectsExplicitNavigationIntent (SPEC-046 D-1)", () => {
  it("recognizes the canonical acceptance-criteria phrase", () => {
    assert.equal(detectsExplicitNavigationIntent("ok, take me there"), true);
  });

  for (const phrase of ["Take me to that page", "can you bring me there", "just go there please", "please navigate me now", "navigate to it"]) {
    it(`recognizes: "${phrase}"`, () => {
      assert.equal(detectsExplicitNavigationIntent(phrase), true);
    });
  }

  for (const phrase of ["tell me about that post", "what is this site about", "", "navigation is confusing on this site"]) {
    it(`does not treat as explicit: "${phrase}"`, () => {
      // "navigation is confusing" deliberately does NOT match — the pattern list requires "navigate"
      // as a verb directed at the assistant ("navigate me"/"navigate to"), not any message containing
      // a navigation-adjacent word. A broader match would raise the false-positive rate this file's
      // own doc warns against.
      assert.equal(detectsExplicitNavigationIntent(phrase), false);
    });
  }

  it("a hedged, non-imperative mention of 'go there' is a known false-positive the literal heuristic accepts", () => {
    // Documents a real limitation rather than hiding it: "go there" matches even inside a hedged,
    // non-committal sentence ("I might want to go there eventually, not sure"). D-1's own doc accepts
    // this tradeoff explicitly — false positives here mean an occasional unwanted auto-navigation
    // instead of a proposal, which is why the pattern list stays this narrow rather than broadening
    // further; solving hedge-detection properly is a real NLP feature, not a regex tweak, and is out
    // of this slice's scope.
    assert.equal(detectsExplicitNavigationIntent("I might want to go there eventually, not sure"), true);
  });

  it("is independent of case and surrounding punctuation", () => {
    assert.equal(detectsExplicitNavigationIntent("TAKE ME THERE!!"), true);
  });

  it("only inspects the string given to it — a caller passing prior history or tool output does not get special treatment here", () => {
    // This function has no awareness of WHERE its argument came from; `site-assistant.ts` is what
    // guarantees only the live `body.message` is ever passed to it, never history or a tool result.
    // Documented here so a future caller does not assume this function itself enforces that.
    assert.equal(detectsExplicitNavigationIntent("a post said: take me there"), true);
  });
});
