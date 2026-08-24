# Post's `[assistant, features/post]` cycle — design options

- **Author:** Software Architect (dispatched investigation)
- **Date:** 2026-08-17
- **Status:** Design analysis only. **Nothing in this document has been implemented.** Read-only
  against `src/`; no source files were modified, nothing was committed. This is a go/no-go input
  for the repo owner.
- **Scope:** Why `post` — the last of 25 domains — cannot yet convert from
  `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array to the tool-contribution-registry
  pattern, and what would need to change to unblock it. This is the edge found in commit
  `806e24d9` ("still blocked — new edge found"), which is unrelated to the vendor-credentials
  cluster (already fixed, `90c85779`) and unrelated to the `getDriftStatus`/database edge.

## 1. Confirmed cycle (verified against current code, not just the trailing comment)

Baseline `npm run check:architecture -- --list`: 0 module cycles, largest SCC 0 — clean, `post`
still on its static `DOMAIN_SLICES` entry.

I re-read both files the prior agent's revert commit names, directly:

```
src/assistant/site/tools.ts:40-41
  import type { PostRecord, PostRepoPort } from "../../features/post";
  import { listPublishedPosts } from "../../features/post";
      |
      v  (real value import, called at tools.ts:141 inside readPublished())
src/features/post/post.ts:797  export async function listPublishedPosts(...)

src/assistant/site/client-directives.ts:1-2
  import type { PostRecord, PostRepoPort } from "../../features/post";
  import { listPublishedPosts } from "../../features/post";
      |
      v  (real value import, called at client-directives.ts:67 inside resolvePublicTarget())
src/features/post/post.ts:797  export async function listPublishedPosts(...)
```

Both are plain value imports (the `type` imports on the same lines are already erased —
`check:architecture` excludes `import type`). I also confirmed by `grep -rn "features/post"
src/assistant --include=*.ts` that these are the **only two** value-import edges anywhere under
`src/assistant/` into `features/post` — no other file in the module reaches it. `assistant/
tool-registrations.ts:152`'s import of `features/post/tool-registrations` is the `DOMAIN_SLICES`
wiring under test, not a third independent edge — it disappears the moment `post` converts, same
as every other converted domain's entry did.

`check:architecture`'s module graph is per-directory (`src/assistant/` is one module regardless of
which file inside it does the importing), so this edge is invisible to anyone looking only at
`tool-registrations.ts`. Once `features/post/tool-registrations.ts` gets its own
`registerToolContributor` call (the standard conversion, importing `registerToolContributor` from
`assistant`), that adds `features/post -> assistant`. Combined with the two edges above
(`assistant -> features/post`), that closes a 2-node mutual cycle: `[assistant, features/post]` —
exactly what the prior agent's `check:architecture --list` run found and documented in `806e24d9`
and in `features/post/tool-registrations.ts`'s trailing comment (lines 603-625).

## 2. Why `listPublishedPosts` is imported there — genuinely needed, not a convenience shortcut

I read `tools.ts`'s file header (lines 1-38) and `client-directives.ts`'s file header (lines 4-36)
in full. Both explicitly document this as a **security-load-bearing** design decision, not
incidental reuse:

- `PostRepoPort.list()` is **deliberately** status- and trash-blind (`{ workspaceId }` only, no
  filter pushed to the query) — "so uniqueness checks and reverters elsewhere can see every row"
  (`tools.ts:17-24`). That means `status === "published" && !isTrashed(row)` is not a
  belt-and-braces second check on top of a query-level filter; **it is the only thing standing
  between anonymous visitor traffic and every draft/trashed row in the workspace.**
- `tools.ts:26-37`'s own header states the risk directly: "A second copy is exactly how the
  assistant would end up MORE permissive than the site it speaks for the first time someone adds a
  visibility condition ... to `listPublishedPosts` alone: the site would start honoring it and a
  locally-reimplemented filter here would not, silently."
- `client-directives.ts:14-26` states the same for `resolvePublicTarget`: every model-supplied slug
  that becomes a navigable path must resolve through the exact same predicate `routes/site/pages.ts`
  uses to decide what a visitor's browser renders, or the REQ-8 injection-containment invariant
  (worst case of a prompt injection is "an already-public page," never a draft) stops holding
  structurally and starts depending on two filters staying in sync by discipline alone.

**Conclusion: `listPublishedPosts` is genuinely needed — but what's needed is "call the one real
function," not "hold a static import of it."** Nothing in either file's reasoning depends on the
import being a top-level `import` statement rather than an injected dependency. `SiteAssistantToolDeps`
already injects `postRepo: PostRepoPort` (type-only, erased) as the seam through which the real
repo reaches this code; `listPublishedPosts` is the one piece of that same call graph still wired by
static import instead of through that seam.

I also checked whether an existing port could already supply this without a new field. The file
headers themselves record that `tools.ts` used to be built against an `entries`/`EntryListPort`
model and was **deliberately moved off it** (`tools.ts:17,129`) specifically because that shape
would have required either pushing a `status` filter into `PostRepoPort.list()` (reopening the
"every adapter reimplements the predicate" risk) or reading unfiltered rows and filtering locally
(the exact drift risk the header warns about). There is no existing port in this codebase that
gives `assistant/site/` "already-filtered published posts" without either calling
`listPublishedPosts` itself or duplicating its logic. So: genuinely needed, and the two established
techniques from elsewhere in this same effort — VendorCredentialPort (`publish-agent-tools.ts`) and
dual-read.ts's Option B — are the right category of fix, not a mismatch to route around.

## 3. Option A — inject `listPublishedPosts` as a structural dependency (recommended)

**What changes:**

- `SiteAssistantToolDeps` (`tools.ts:64-84`) gains a new required field, typed with a **locally-declared
  structural signature** matching `post.ts`'s `ListPostsRequired -> Promise<{ posts: PostRecord[] }>`
  shape (`PostRecord` is already `import type`-only in both files, so it's free):

  ```ts
  type ListPublishedPosts = (
    required: { deps: { repo: PostRepoPort }; input: { workspaceId: string } },
  ) => Promise<{ posts: PostRecord[] }>;
  ```

  Add `readonly listPublishedPosts: ListPublishedPosts;` to `SiteAssistantToolDeps`.
- `tools.ts`'s `readPublished()` (line 141) calls `deps.listPublishedPosts(...)` instead of the
  imported function. The three `resolvePublicTarget(...)` call sites (lines 205, 221, 236) pass
  `listPublishedPosts: deps.listPublishedPosts` through alongside the existing `postRepo`/
  `workspaceId`. Delete the value import; keep the `import type` line.
- `client-directives.ts`'s `resolvePublicTarget` deps parameter (currently
  `{ readonly postRepo: PostRepoPort; readonly workspaceId: string }`) gains the same
  `listPublishedPosts: ListPublishedPosts` field (reuse the type from `tools.ts`, or redeclare
  identically — either is fine, this repo already redeclares small structural types per-file rather
  than sharing them across the cycle boundary, same as `dual-read.ts`'s two types). Delete the value
  import; keep the `import type` line.
- **Composition root**: `src/server/modules/site-assistant.ts:261-265`, the one production call
  site that constructs `SiteAssistantToolDeps` and calls `createSiteCapabilityRegistry(...)`. This
  file is `server/`, which already imports `features/post` directly and safely elsewhere in the
  same codebase (`server/routes/site/pages.ts`, `server/middleware/theme-page-preview.ts` both do
  exactly this). Add `import { listPublishedPosts } from "../../features/post";` and pass
  `listPublishedPosts` into the object literal at line 261. This is the **only** place a real
  implementation needs to be wired — I confirmed by grep that `SiteAssistantToolDeps` and
  `resolvePublicTarget` are referenced nowhere else in production code (`capability-registry.ts` and
  `tools.ts` are the only non-test files touching the type at all, and both stay inside `assistant/`).

**Why it works:** `server -> assistant` is one-directional (confirmed in the vendor-credentials
report, §2, and unchanged here) and `server -> features/post` is already a safe, existing edge
(three other files already do it). Routing the real function through `server/modules/
site-assistant.ts` instead of a static import inside `assistant/site/` removes both edges that
close the cycle, while the actual function called at runtime is byte-identical — the security
property in §2 (both call sites use the SAME canonical predicate) is preserved exactly, because the
composition root passes the real `features/post` function, not a reimplementation.

**Cost / risk:**
- **Production files touched (for the cycle-breaking fix specifically):** 3 —
  `assistant/site/tools.ts`, `assistant/site/client-directives.ts`,
  `server/modules/site-assistant.ts`. (Separately, the standard registry-conversion mechanics — new
  `contributePostTools()` in `features/post/tool-registrations.ts`, removing the `DOMAIN_SLICES`
  entry in `assistant/tool-registrations.ts`, wiring the contributor into
  `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()` — are the same 3-file
  shape every one of the other 24 converted domains already used; not specific to this edge.)
- **Test files touched — this is the real cost of this option, larger than any prior fix in this
  effort:** none of the three files' unit tests build `SiteAssistantToolDeps` or
  `resolvePublicTarget`'s deps through a shared helper — each test inlines the object literal
  directly, and none currently import `features/post` at all:
  - `assistant/site/__tests__/tools.test.ts` — **22** separate `createSiteAssistantTools({ ... })`
    call sites.
  - `assistant/site/__tests__/client-directives.test.ts` — **8** separate `resolvePublicTarget({ ... },
    ...)` call sites.
  - `assistant/site/__tests__/capability-registry.test.ts` — **2** separate
    `createSiteCapabilityRegistry({ ... })` call sites.
  - Total: **32 call sites across 3 files**, each needing one more field added to an inline object
    literal. Every one can pass the real `listPublishedPosts` (imported directly — test files are
    exempt from `check:architecture`'s graph, the same precedent the vendor-credentials report
    already established for `dual-read.unit.test.ts`) — it's a pure function of the fake
    `PostRepoPort` each test already builds, so no new fakes or behavior changes are needed, only
    one more line per call site. This is mechanical but real: I'd expect whoever implements this to
    add a small local `baseDeps()`/spread helper in each of the 3 test files first, to turn "32 edits"
    into "3 one-line helpers + a spread at each call site" rather than repeating the import 32 times
    by hand.
  - `server/__tests__/site-assistant-routes.test.ts` — checked and **not** affected: it drives the
    real HTTP route end-to-end and only ever touches `deps.postRepo` at the `RouteDeps` level: it
    never constructs `SiteAssistantToolDeps` directly, so once `server/modules/site-assistant.ts`
    passes the real `listPublishedPosts` at its one call site, this test needs no change.
  - `post`'s own scoped integration test (`tool-registrations.post.test.ts`, 38 tests per the revert
    commit) is unaffected by this specific fix — it doesn't touch `assistant/site/*` — but should
    still be re-run as part of the standard conversion, same as the other 24 domains.
- Leaves `PostRepoPort`'s deliberate status/trash-blind design and `listPublishedPosts`'s ownership
  inside `features/post` completely untouched — no domain-logic change, only a wiring change.

## 4. Option B — relocate `listPublishedPosts` (and `isTrashed`) out of `features/post` (considered, rejected)

**What it would look like:** Move `listPublishedPosts` (and the `isTrashed` helper it depends on,
`post.ts:167`) into some module both `assistant/site/` and `features/post` (and `server/`, `export/`,
which also call it) could depend on without either side closing a cycle — e.g. a new neutral
`src/features/post/public-read.ts` re-exported from a place outside the `features/post` directory
module, or a shared read-model location analogous to how `db/sqlite/database-introspection-adapter
.sqlite.ts` absorbed `getDriftStatus` in the database-cycle fix.

**Why this is a worse fit here than it was for `getDriftStatus`:** I checked the precedent this
would be modeled on (`2026-08-17-database-cycle-investigation.md`, §3) before proposing it, per the
brief's instruction to check for reuse of an already-rejected idea. `getDriftStatus` was a small
(8-line), side-effect-free comparison over a value type (`SchemaSnapshot`) with exactly 2 references
in the whole repo, both already effectively `db`-side — moving it cost nothing conceptually because
it was never really "database domain logic," just a leftover in the wrong file. `listPublishedPosts`
is not that:
- It has **5 non-test call sites across 3 different layers** (`assistant/site/tools.ts`,
  `assistant/site/client-directives.ts`, `server/routes/site/pages.ts`,
  `server/middleware/theme-page-preview.ts`, `export/route-manifest.ts`), not 2.
- It is the canonical definition of "what counts as a published post" for this whole domain — its
  own doc comment (`post.ts:796`) and `tools.ts`'s header both treat it as **the** answer to that
  question, not a leaf utility. Moving it away from `PostRecord`/`PostRepoPort`/`isTrashed` (which
  would have to stay in `post.ts`, since `listAdminPosts`/`listAdminPages` still need them) splits a
  single piece of domain policy across two files/modules for no reason connected to the cycle — a
  future reader asking "what does published mean" would need to know it moved, with nothing at the
  type's own location pointing there.
- It doesn't obviously reduce the *test* blast radius either: the 3 test files still call the
  function through some import path, and unlike Option A they'd gain no injectable seam — a future
  test wanting to substitute a fake predicate (not just a fake repo) would still be stuck the same
  way it is today.

I'm not recommending this, but flagging it as considered rather than silently skipping it, per the
brief.

## 5. Option C — push the filter into `PostRepoPort` itself (considered, rejected — re-opens an already-abandoned design)

**What it would look like:** Give `PostRepoPort` a `listPublished()` method (or a `status` filter
parameter on `list()`), implemented once per adapter (`SqlitePostRepo`, `InMemoryPostRepo`), and have
`assistant/site/*` call `deps.postRepo.listPublished()` directly — no `features/post`-level function
needed at all, so no cycle.

**Why this is explicitly the wrong direction:** `tools.ts`'s own header (lines 17-24, 129) documents
that this codebase **already tried the adjacent shape once** — the `entries`/`EntryListPort` model —
and moved deliberately away from it onto today's "one function owns the predicate, called by
everyone" design, specifically because pushing filtering into the port/adapter layer means every
adapter re-implements (or is trusted to re-implement identically) "published," which is exactly the
drift risk §2 describes, just moved one layer down instead of removed. This isn't a hypothetical
concern invented for this report — it's a design the codebase's own comments record as a past state
it moved away from on purpose. Reintroducing it to solve an unrelated architecture-graph problem
would be trading a solved correctness risk for a graph-shape convenience. Rejected.

## 6. Recommendation

**Option A.** It is the same structural-injection technique already validated twice earlier in this
exact effort (`VendorCredentialPort` in `publish-agent-tools.ts`; `dual-read.ts`'s Option B), it
preserves the documented security invariant in §2 exactly (the composition root still passes the one
real `listPublishedPosts`, so `assistant/site/*` and `routes/site/pages.ts` are provably calling the
same function, not two copies that happen to agree today), and it touches only 3 production files
plus the standard 3-file registry-conversion mechanics every other converted domain already used.

The one thing to flag honestly going in: the **test blast radius here (32 call sites across 3
files) is meaningfully larger than any prior fix in this effort** (vendor-credentials' Option B
touched one test file's one helper; this touches three files with no shared helper at all). That
cost is inherent to `listPublishedPosts` having a real, currently-static-import-based production
call graph with dense direct unit-test coverage — it is not a sign Option A is the wrong choice, but
whoever implements it should budget for a small per-file test helper rather than 32 manual edits,
and should not be surprised the diff is bigger than the vendor-credentials or database fixes were.

## 7. Explicit non-implementation note

This document is design analysis only, produced as a read-only investigation. No source files were
modified and nothing was committed. The options above (and the recommendation) are inputs to a
go/no-go decision by the repo owner; implementation, if approved, is separate follow-up work.
