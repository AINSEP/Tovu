import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { executePageCapability } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import { Posts } from "../Posts";
import type { PostsController } from "../hooks/use-posts.hooks";
import { buildPostRowMenuHandleMap } from "../rules";
import type { AdminPost } from "@/lib/api";

/**
 * @file Regression test for this batch's RowMenu wiring on `Posts.tsx` — representative test for
 * the "posts/roles/redirects/members/integrations" batch (the others in that batch get the same
 * wiring but not their own dedicated real-driver test file; see
 * `taxonomy/__tests__/taxonomy-agent-drive.unit.test.tsx` for that convention). Drives the real
 * `executePageCapability` and the real `createDomPageDriver`, not `userEvent`.
 *
 * `Posts.tsx` had no prior per-row `agentHandle` tagging at all (unlike `Taxonomy.tsx`/`Users.tsx`),
 * so this is a fresh `buildAgentListHandles("posts-row", ...)` used only for the `RowMenu` base.
 *
 * KNOWN GAP (documented fully in `taxonomy-agent-drive.unit.test.tsx`, same file with the original
 * finding): `RowMenu` portals its dropdown to `document.body`, while Tovu's real agent bridge
 * (`App.hooks.tsx`) scopes its driver to `contentEl` on purpose — narrower than `document.body`.
 * The trigger is discoverable and clickable through that scoped root; the items it reveals are not.
 * The tests below assert that real, scoped-root shape (`root: container`) rather than testing
 * against `document.body`, which would hide the gap.
 */

const POST: AdminPost = {
  id: "p1",
  workspaceId: "w1",
  kind: "post",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: {},
  status: "published",
  updatedAt: "2026-08-01T12:34:00.000Z",
  version: 1,
};

const SECOND_POST: AdminPost = { ...POST, id: "p2", title: "Second Post", slug: "second-post" };

function controller(overrides: Partial<PostsController> = {}): PostsController {
  const posts = overrides.posts !== undefined ? overrides.posts : [POST];
  return {
    posts: [POST],
    error: null,
    creating: false,
    rowSavingId: null,
    pendingDelete: null,
    setPendingDelete: vi.fn(),
    createPost: vi.fn(async () => {}),
    disablePost: vi.fn(async () => {}),
    removePost: vi.fn(async () => {}),
    // `Posts.tsx` now destructures this from the hook (moved there in 45537ee2) instead of
    // computing it itself — this fixture fell out of sync with that move. Mirrors
    // `Posts.unit.test.tsx`'s identical fixture fix from the same commit.
    rowMenuHandleById: buildPostRowMenuHandleMap(posts),
    ...overrides,
  };
}

function renderPosts(overrides: Partial<PostsController> = {}) {
  const c = controller(overrides);
  const { container } = render(<Posts usePostsHook={() => c} />);
  return { controller: c, container };
}

interface FoundElement {
  handle: string;
  role?: string;
  label: string;
}

async function findElements(driver: ReturnType<typeof createDomPageDriver>): Promise<FoundElement[]> {
  const result = (await executePageCapability(driver, "page.find_elements", {})) as { elements: FoundElement[] };
  return result.elements;
}

async function handlesOf(driver: ReturnType<typeof createDomPageDriver>) {
  return (await findElements(driver)).map((element) => element.handle);
}

describe("driving the Posts RowMenu through page.* verbs", () => {
  it("publishes a distinct, clickable handle per row; the dropdown item stays outside the production-scoped root", async () => {
    const { container } = renderPosts({ posts: [POST, SECOND_POST] });
    await screen.findByText("Hello World");
    // Scoped to `container`, the same way `App.hooks.tsx` scopes the real bridge to `contentEl`
    // rather than `document.body` — see this file's "KNOWN GAP" doc comment.
    const driver = createDomPageDriver({ root: container, pages: {} });

    const before = await handlesOf(driver);
    expect(before).toContain("posts-row-p1-menu");
    expect(before).toContain("posts-row-p2-menu");
    // Distinct handles — id-derived, not position-derived. A duplicate would not fail loudly; it
    // would make `page.click` silently resolve to whichever menu the DOM reaches first (see
    // `buildAgentListHandles`'s own doc comment).
    expect(new Set(before).size).toBe(before.length);
    expect(before).not.toContain("posts-row-p1-menu-item-edit");

    // The trigger itself IS reachable and clickable through the scoped root — an ordinary
    // descendant of `container`, not portaled.
    await executePageCapability(driver, "page.click", { handle: "posts-row-p1-menu" });
    await driver.settle?.();

    // Through the production-shaped scoped root, the opened item is still invisible — not because
    // the click failed, but because `RowMenu` rendered it into `document.body`, outside `container`.
    const afterScoped = await handlesOf(driver);
    expect(afterScoped).not.toContain("posts-row-p1-menu-item-edit");

    // Proves the click DID work and the item DOES exist — just unreachable via the scoped root
    // above. Never used by the real bridge; shown here only to isolate the cause.
    const bodyDriver = createDomPageDriver({ root: document.body, pages: {} });
    const bodyHandles = await handlesOf(bodyDriver);
    expect(bodyHandles).toContain("posts-row-p1-menu-item-edit");
    // Post p1's own item, not p2's — p2's menu was never opened.
    expect(bodyHandles).not.toContain("posts-row-p2-menu-item-edit");
  });

  it("recomputes row-menu handles when the posts list changes across a re-render, not just on first render", async () => {
    // Regression coverage for `Posts.tsx`'s `rowMenuHandleById` `useMemo` — a missing/wrong
    // dependency array (e.g. `[]` instead of `[posts]`) would leave this map stuck on the FIRST
    // render's single-post list. `rowMenuHandleById.get(post.id)` then returns `undefined` for any
    // row added afterward, producing a literal `"undefined-menu"` handle instead of a real one.
    const { container, rerender } = render(<Posts usePostsHook={() => controller({ posts: [POST] })} />);
    await screen.findByText("Hello World");

    rerender(<Posts usePostsHook={() => controller({ posts: [POST, SECOND_POST] })} />);
    await screen.findByText("Second Post");

    const driver = createDomPageDriver({ root: container, pages: {} });
    const handles = await handlesOf(driver);
    expect(handles).toContain("posts-row-p1-menu");
    expect(handles).toContain("posts-row-p2-menu");
    expect(handles).not.toContain("undefined-menu");
  });
});
