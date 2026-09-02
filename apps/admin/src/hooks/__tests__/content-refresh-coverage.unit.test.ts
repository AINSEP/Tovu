import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file The guard against a fourth occurrence of the staleness bug this pass fixed a fifth time
 * (taxonomy first, then posts/pages/media/forms/access-tokens): a list hook whose resource is
 * genuinely agent-writable but never adopts `useContentRefreshSubscription` — or has it deleted
 * later, in a refactor that touches the hook for an unrelated reason and drops the one line with no
 * compiler or test to catch it.
 *
 * ## Why this is a maintained checklist, not a discovery mechanism, and why it still earns its place
 *
 * `WIRED_HOOKS` below is hand-written, the same way `TAXONOMY_RESOURCE`/`POSTS_RESOURCE`/etc. are
 * hand-written constants rather than derived from some canonical list of "content resources" — no
 * such list exists in `apps/admin` today, and inventing a cross-cutting registry nobody but this test
 * maintains would be exactly the kind of unmaintained ceremony the dispatch brief for this pass
 * warned against building. A genuinely new agent-writable screen that forgets to add its hook to
 * `WIRED_HOOKS` passes this test silently — that gap is real, and worth stating plainly rather than
 * papering over with a check that only LOOKS complete.
 *
 * What this guard converts into a real, enforced regression is narrower but still worth having: EVERY
 * hook already known to need this subscription staying wired to it. Before this pass, that promise
 * existed only as a comment in `use-taxonomy.hooks.ts` and a behavioral test exercising ONE hook — a
 * second hook's subscription line could be deleted by an unrelated refactor (an import cleanup, a
 * lint-driven removal of an apparently-unused `useCallback`) and nothing would fail except a human
 * noticing a stale screen in production, which is the exact failure mode that shipped this bug twice
 * already. A textual `toMatch` against the hook's own source is a weak signal on its own — it cannot
 * prove the subscription is wired CORRECTLY, only that the call did not vanish — but it is a real,
 * cheap, always-run tripwire for the specific regression this pass is most likely to suffer, and each
 * hook already carries its OWN behavioral `describe("... — content refresh bus", ...)` suite (see
 * `use-posts.unit.test.ts` et al.) that proves correctness; this file only proves the wiring survives.
 *
 * Extending coverage: when a new admin list/detail hook starts reading state an agent tool can write,
 * add its resource constant to the feature's `rules.ts` (mirroring `TAXONOMY_RESOURCE`), wire
 * `useContentRefreshSubscription` in the hook, add its own behavioral suite, and add the hook's path
 * to {@link WIRED_HOOKS} below.
 */

const ADMIN_SRC = path.resolve(__dirname, "..", "..");

/** Every hook this pass wired, relative to `apps/admin/src`. */
const WIRED_HOOKS: readonly string[] = [
  "features/taxonomy/hooks/use-taxonomy.hooks.ts",
  "features/posts/hooks/use-posts.hooks.ts",
  "features/pages/hooks/use-pages.hooks.ts",
  "features/media/hooks/use-media.hooks.ts",
  "features/forms/hooks/use-forms-list.hooks.ts",
  "features/security/hooks/use-access-tokens.hooks.ts",
  // Coverage-extension pass (see this file's own header "Extending coverage" note): Comments,
  // Database, Deployments, Redirects, Members, Widgets, Webhooks (admin's "integrations" feature),
  // and Recovery. Comments Settings, Deployment's Dockerfile tab, SEO (both screens), Themes, Theme
  // Explore, and Recovery's own restore-flow wizard were deliberately left OUT of this list — each
  // either has no agent-writable field this hook exposes, or carries an editable draft/uncontrolled
  // form a bus-driven reload would clobber. See each excluded hook's own file header (or, for ones
  // never touched at all, `rules.ts`'s resource-constant doc in the sibling feature) for the specific
  // reason.
  "features/redirects/hooks/use-redirects.hooks.ts",
  "features/comments/hooks/use-comment-queue.hooks.ts",
  "features/database/hooks/use-restore-points-section.hooks.ts",
  "features/deployment/hooks/use-static-export.hooks.ts",
  "features/members/hooks/use-members.hooks.ts",
  "features/widgets/hooks/use-widgets-library.hooks.ts",
  "features/widgets/hooks/use-widget-regions.hooks.ts",
  "features/integrations/hooks/use-integrations.hooks.ts",
  "features/recovery/hooks/use-recovery.hooks.ts",
];

/** Matches a call to either the shared hook, or `subscribeToContentRefresh` directly — taxonomy
 *  predates the shared hook and still calls the bus function by hand; see its own file header. */
const SUBSCRIBES_TO_CONTENT_REFRESH = /useContentRefreshSubscription\s*\(|subscribeToContentRefresh\s*\(/;

describe("content-refresh coverage (staleness-bug guard)", () => {
  it.each(WIRED_HOOKS)("%s subscribes to the content-refresh bus", (relativePath) => {
    const source = readFileSync(path.join(ADMIN_SRC, relativePath), "utf8");
    expect(source).toMatch(SUBSCRIBES_TO_CONTENT_REFRESH);
  });
});
