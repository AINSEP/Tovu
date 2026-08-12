# Handoff — session 6, 2026-08-12 (four bug fixes, the fetch-query cost audit, App extraction, public-render hardening)

Generated: 2026-08-12, end of session
Source: Claude Code, Opus 5 (1M context), Coordinator + 3 Sonnet 5 subagents
Target: Claude Code (Opus for routing, Sonnet subagents for implementation)

**Status: ~40 commits this session. 4 UNPUSHED at cutoff — the owner asked for commit-only, no push. Zero open blockers in THIS session's scope.**

---

## ⚠️ READ FIRST

**1. The cadence directive still stands.** Sweep the slice, commit as you go, one test pass at the end.
No per-file test authoring. Keep `tsc --noEmit` and existing scoped suites green throughout.
**Exception that keeps earning itself:** a bug an audit finds ships its regression test *with* the fix,
proven RED first.

**2. Another actor commits to this branch.** A parallel window ran an entire Postgres-migration
workstream today, including its own 5-auditor external audit. Do not assume every commit on
`general-work` is yours and do not "clean up" unfamiliar uncommitted work.

**3. `general-work` carries 4 open blockers that are NOT from this session** — see the section below.

---

## WHAT SHIPPED — four real defects, all independently re-verified

Every fix below had its RED **re-run by the Coordinator** (revert the source, run the suite, confirm the
failure) rather than accepted on the implementing agent's report. That check has now caught a false
"fixed" claim twice across two sessions; it stays mandatory.

### 1. Comments concurrent lost-update — `df109b5`
`use-comment-settings.hooks.ts:66-68` re-seeded the save-diff baseline from **every** successful load,
including the background refetch that fires for **any mounted observer** of that key — not only the
operator who saved. The form is uncontrolled (`defaultValue`/`defaultChecked`), and changing
`defaultValue` on a mounted input does not change its value, so the baseline moved while the DOM stood
still. A later save then diffed form-vs-advanced-baseline and silently reverted a concurrent operator's
committed write. Fixed with a one-shot `useRef` seed guard; `save()`'s own `setSettings(updated)` stays,
because that IS this operator's committed write.

### 2. Media lost-update — the SAME defect with the operands mirrored — `4c71c3f`
Found by auditing the other 10 migrated features for the Comments shape. `EditMediaPanel`'s `draft` is
correctly seeded once and never re-seeds — so the three-ingredient pattern literally did not match. The
bug was on the **other side of the diff**: `item` is recomputed from the query cache every render
(`use-media.hooks.ts:182,204`), and `key={editingItem.id}` only remounts when the **id** changes, never
when the same asset's other fields move. Fixed by freezing `item` in a `baselineRef` at mount.

**This is the lesson worth carrying:** the auditing agent pushed back on the Coordinator's
three-ingredient framing instead of forcing the finding into it. A rigid pattern definition would have
missed a real defect.

### 3. `safeImageSrc` bypasses — `9c8d86f`
Two confirmed, chased empirically for the first time after two auditors raised them and nobody checked:
- **Dot-segment evasion.** The admin-media rejection tested the RAW string with a regex whose `[^/]+`
  cannot span a slash, so `/media/id/./original` and `/media/x/../id/original` passed — while browsers
  normalise both back to the exact blocked path. Fixed by testing `new URL(src).pathname`.
- **Userinfo credentials** (`https://user:pass@host/x.png`) reached public HTML. Fixed via
  `parsed.username || parsed.password`. `safeHref`'s identical allowance was deliberately left alone:
  an `<img>` auto-fires with no click and no address-bar text; an `href` needs a navigation gesture.

**Closed as non-issues, with reasoning:** punycode homographs (an `<img>` shows the reader no URL text,
so there is nothing to spoof) and backslash host-confusion (probed against Node's real WHATWG parser, no
instance found). **Two disclosed residuals:** `%2F`-encoded slashes and doubled `//` still evade the
regex; traced — not curled — to Express matching route segments on the raw undecoded path.

### 4. `renderDocNode` stack crash — worklist #5, agreed in a prior round and never done — `1bef1fa`
**Not a performance concern — a hard crash reachable by ordinary content.** Nested `bulletList > listItem`
(what repeated list indentation produces) renders at depth 500 in ~2ms and throws `RangeError` at 1000.
Coordinator reproduced independently. Exact boundary found by binary search: **501 isolated, 561 via
HTTP** — higher through HTTP, not lower; the agent's `await`-continuation explanation is flagged as a
guess in the code, not asserted.

`MAX_RENDER_DEPTH = 200` (~40% of the lower boundary). Past it, a placeholder — the page serves 200
instead of the 500 that `pages.ts`'s try/catch used to produce. Verified per-branch: a shallow sibling
still renders normally beside a degraded one.

**Node-count bound deliberately deferred, with argument:** 100k siblings block the event loop ~250-650ms
but do not crash, and are not organically authorable, unlike 501-deep nesting.

---

## THE FETCH-QUERY COST AUDIT — the owner's long-standing question, answered

**Question:** before `lib/fetch-query` there was no state or fetch manager, so the admin re-requested
constantly. Did the migration fix it, and is anything still costing us?

**Answer, measured — harness committed at `apps/admin/src/__measurements__/`, re-runnable:**

- **The migration worked.** Migrated screens cost exactly 1 write + 1 necessary refresh. The one screen
  that never migrated (`settings-raw`) still burns **8 unconditional requests** on a principal switch
  with four namespaces open. That contrast is the proof.
- **But it never added cross-navigation caching.** `staleTime: 0` meant every query was stale on mount:
  leaving a screen and returning cost a full refetch (redirects 1→1, collections entry-editor reopen
  3→3). **That is what the owner was still feeling.** Fixed by `staleTime: 0 → 10_000` (`289e722`,
  corrected from an agent's 30s to the owner's chosen 10s in `0636f77`/`289e722`). Both remount cases
  now cost **0**. Every save/create/delete count is byte-identical — verified, not assumed.
- **Why it is safe:** `invalidateQueries` calls `refetchQueries({type:"active"})` immediately and never
  consults `staleTime` (`queryClient.js:159-171`); `isStaleByTime` short-circuits on `isInvalidated`
  BEFORE comparing elapsed time (`query.js:138-148`). Coordinator read both directly.
- **Worklist #7 (render churn) is CLOSED, not deferred.** Zero `React.memo`/`PureComponent` anywhere in
  `apps/admin`, `Jini/packages/admin`, or `Jini/packages/ui`. Nothing to defeat. The real fact underneath:
  **this app has no memoization boundary at all**, so every state change re-renders its full subtree.
  Also ruled out empirically: no cross-key re-render bleed — a probe on an unrelated key recorded **0
  commits** during another key's write, so TanStack subscribes per-query, not via broad context.
- `useStableHandler` exists in `@jini-ai/ui`, exported, purpose-built for this, **zero consumers**.

### Public-render cost (the deployment question)
- **Every public HTML route set no `Cache-Control`.** All are structurally cacheable — proven by
  byte-diffing responses across cookies and `Accept-Language`, and the render path never even *receives*
  `req`. Fixed in `800bf20`: `public, max-age=60, stale-while-revalidate=300` on `/`, all three `/:slug`
  branches, `/products`, `/products/:id`, `/sitemap.xml`, `/robots.txt`.
- **Deliberately excluded and asserted `null` in tests:** `/store` (varies by `?msg=`), **`/store/buy`
  (a GET that mutates — caching or prefetching it would be actively dangerous)**, and `media-rendition.ts`
  (already correct: `max-age=31536000, immutable`).
- **A page render costs 13 repo calls** (15 for a post). `menuRepo` is 6 of 13 — likely ~3 with menus
  actually configured (**inferred, not measured**). The static-theme "short-circuit" is **not cheaper** —
  still 13.
- **Express's ETag is dead weight.** It computes a weak ETag on every response, but a matching
  `If-None-Match` still returns 200 with a full body — reproduced independently on a bare Express 4.22.2
  app. Making conditional GET work is its own task, not a config flag.

---

## OTHER WORK

- **`App.tsx` fully extracted** (`42b5389`) — zero `useState`/`useEffect`/`useRef` left; five named hooks
  in `App.hooks.tsx`. Then **all five seamed** as injectable props (`3c9e2c4`), per `INFO.md` rule 3.
- **A stale doc caused a wrong decision today.** `AssistantDock.hooks.tsx` claimed none of its hooks were
  seamed; `INFO.md` rule 3 says every DOM/IO hook must be. The agent followed the committed doc and chose
  under-compliance. Both are now corrected, and rule 3's scope explicitly states it covers root-level
  components. **Complexity moved 13/12 → 19/12**, entirely from `= default` parameter expressions, which
  ESLint counts as branches and the cognitive metric does not. Debt ledger updated to the true number.
- **New test that could not previously exist:** `app-chat-dock-seam.unit.test.tsx`. `setup.ts` forbids
  stubbing jsdom's missing `ResizeObserver`, so **no App test had ever opened the chat dock**. The seam
  sidesteps it.
- **CI gate fix** (`b658e1d`) — the complexity gate went red the moment a measurement harness landed:
  both the ESLint block and the drift checker excluded only `__tests__/`, and `__measurements__/` is a
  sibling, not a child. Caught by running the gate directly, NOT by trusting an agent's report that it
  passed.

---

## ⚠️ NOT THIS SESSION'S WORK — 4 open blockers on this branch

A parallel window's Postgres-migration workstream ran its own 5-auditor audit (`38cda3e`): **unanimous
FAIL**, scores 3 / 3.5 / 5 / 6.5 / 7.5, all below the 8.5 floor. Four confirmed blockers:
`reseedSequenceSql` emitting `setval(COALESCE(max(id),1))` (rejected by Postgres for SQLite-valid ids of
0 or -1, with rows copying before the reseed aborts); `verifyClassifiedValue` validating only the
destination, so valid JSON can become *different* valid JSON and pass; identity/FK parity being token
counts, so a generator emitting `.primaryKey()` instead of an identity passes every gate; and CI running
`npm test` with no Postgres service.

**Do not start these without confirming the other window is stopped** — concurrent edits to the same
migration code through a shared index is exactly how work gets clobbered.

Two findings from that run worth stealing:
- **The most useful result was a fix that would have introduced a bug** — `COPY` bypasses
  `OVERRIDING SYSTEM VALUE` entirely, so the natural remediation is INSERT-only and becomes a syntax
  error under the mechanism a real bulk migration would use. Demand concrete patches from auditors.
- **Both Geminis raised the same false blocker from a packet omission** — recorded as a *dispatch*
  defect, not an auditor failure. Disclose known-and-accepted items in the packet or they return as
  fabricated blockers.

---

## TABLED FOR NEXT SESSION — prioritized

1. **The I5 audit** — did any of the ~62 migrated hook files quietly turn a test assertion into a
   **no-op**? Last unaudited invariant, 62 files wide, and this session found two real defects the
   migration introduced, so it is not hypothetical.
2. **redirects → hits fan-out.** `KEYS.list = ["redirects"]` is a strict prefix of
   `KEYS.hits(id) = ["redirects", id, "hits"]`, so 4 CRUD sites invalidate an unrelated row's analytics.
   Measured: 3 requests where 2 were needed. **The only one of 41 invalidation sites with a real prefix
   relation and no comment justifying it** — reads as an oversight. Small, cheap, unfixed.
3. **`/store/buy` is a GET that mutates** (stock decrement + order write). Documented as a spike
   shortcut, plugin-gated. **A hard blocker before any real storefront ships** — crawlers and
   prefetchers would trigger purchases.
4. **The external audit never dispatched.** Packet is frozen and complete at
   `ADS-memory/.local-artifacts/external-audit/packets/20260812T124425Z-audit-packet.md`
   (`TM-TOVU-2026-08-12-B`, round 1, floor 8.5, 26 files, 9 commits). Both auditor prompts are built at
   `<scratchpad>/audit-stage/` with 15 files staged for `agy`. **Resume with `reuse_packet=`** rather
   than rebuilding.
5. **roles/users combined-fetcher amplification** — 3-4 requests per single write, because several
   endpoints share one cache key. Needs a design call: splitting changes loading and error-precedence
   semantics, not just request count.
6. **Mention/YouTube node deletion** — one auditor called it a blocker, another with repo access declined
   to corroborate. An isolated repro settles it.
7. **Node-count bound** for `renderDocNode` — deferred with reasoning; revisit if real content approaches it.
8. **Conditional GET / ETag** — make it actually 304, or stop computing the ETag.
9. **The `#lib/*` codemod**; **`CX-F4`**'s media 404; **the dispatch-protocol doc** decision.

---

## HAZARDS — proven again today

**1. `SendMessage` mid-flight does not arrive.** Confirmed repeatedly again. Two messages to a working
agent vanished; a third was misread as a duplicate because it opened by acknowledging completed work.
**Send only when an agent surfaces or goes idle, and lead with the NEW instruction, not context.**

**2. The shared git index bites between the check and the commit.** An agent's `git diff --cached --stat`
came back clean and four other files still landed in its commit. **The `git show --stat HEAD` AFTER the
commit is the one that catches it** — recover with `git reset --soft HEAD^`, never a hard reset.

**3. `git stash` is banned and it bit again.** A verifier used it on a tree holding two other agents'
uncommitted work. Recovery was clean, but the technique is `git show <sha>:<path>` into scratch files, or
`git diff > patch` / `git apply -R` / `git apply`. **Put the ban in every brief** — omitting it is how it
recurred.

**4. Verify the gate yourself, not the report.** The complexity gate was red from a commit the
Coordinator had pushed. The agent correctly said "not my violation" and both would have missed that it
was *ours* without running it directly.

**5. A persisted `cd` still doubles relative paths.** Bit the Coordinator again running the drift checker
from `apps/admin`. **Prefix every command with `cd /Users/la/Programming/Tovu`.**

**6. Stale docs cause wrong decisions, not just confusion.** `AssistantDock.hooks.tsx`'s outdated comment
directly caused an agent to choose the under-compliant design. Fix docs when the code moves.

---

## Handoff Contract

- **Inputs used:** 3 Sonnet 5 subagents; committed measurement harnesses; `query-core` source read
  directly; a bare Express app for the ETag probe; independent RED re-runs of every fix; the real
  complexity gate.
- **Output summary:** four defects fixed and independently verified, the fetch-query cost question
  answered with committed measurements and one config change, `App.tsx` fully extracted and seamed,
  the public render path bounded against a crash and made cacheable, and one CI gate repaired.
- **Risks:** 4 unpushed commits; the external audit never ran, so none of today's work has outside eyes;
  4 open blockers on this branch from another workstream; `redirects → hits` known and unfixed;
  no live-browser verification of any admin change.
- **Suggested next assignee:** Claude Code (Opus) as Coordinator; Sonnet 5 subagents for implementation —
  cadence directive and the `git stash` ban in every brief, full spec inline because mid-flight messages
  do not arrive.
