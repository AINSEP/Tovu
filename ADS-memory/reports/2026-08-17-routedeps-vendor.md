# routedeps-vendor — 2026-08-17

Dispatched with two tasks: (A) Sol's architecture step 3 — narrow `RouteDeps` in feature
tools, move/inject the surface-exchange contract out of `assistant`; (B) the two
vendor-credentials Phase 3 agent-tool cutover points left over from session 9. Repo:
`/Users/la/Programming/Tovu`, branch `general-work`, working alongside 3+ other agents in
the same checkout.

---

## Task B — vendor-credential agent-tool cutover: DONE

Commit `7dc7cae9`. Both cutover points named in the brief are shipped:

- **`deployment_get_static_publish_capabilities`** (`src/features/deployments/publish-agent-tools.ts`)
  now dual-reads `vendor_credential_sets` first per provider's mapped `VendorId`, falling
  back to the legacy `publish_credential_sets` rows only when that vendor's group is
  empty — same precedence `vendor-credentials/dual-read.ts` documents for its own
  (decrypting) resolve path, **reimplemented at the non-decrypting list level** rather than
  calling that module directly: `dual-read.ts`'s function decrypts (it exists to hand back
  a real connection for a publish attempt), and this handler's own tested "never decrypts"
  contract forbids that. Verified this distinction matters BEFORE writing code — using
  `resolveDefaultForVendorDualRead` here would have silently broken a structurally-enforced,
  tested guarantee.

  `tokenTail` is now on every `savedCredentials` entry: populated for a vendor-table row,
  `null` for a legacy-table-only row (no `token_tail` column exists there, and deriving one
  would mean decrypting). The catalog description's **"NEVER a token, ciphertext, or masked
  tail"** promise is rewritten in the SAME commit, per the brief's explicit requirement —
  it was true when written and would have become a lie the moment `tokenTail` shipped in a
  separate commit.

  Also merges `credentialConfigured`/`ready` off the new table first. Without this, a
  credential saved ONLY through the new write path (the second bullet below) would have
  shown up in `savedCredentials` while `credentialConfigured` still read `false` off the
  old-table-only `credentialSource.isConfigured()` — a self-contradictory result the two
  cutover points would have produced together the moment both shipped. Caught this by
  tracing the interaction between B1 and B2 before writing either, not by a test failing
  after the fact.

  `deployment_execute_static_publish`'s real resolve/publish path
  (`static-publish/credentials.ts`'s `composePublishCredentialSource`) is **deliberately
  untouched** — out of scope for this brief, and a much larger, separately-consequential
  cutover (it feeds the actual publish attempt, not just a read-only report).

- **`deployment_propose_custom_provider_credential`** (s3-compatible only) now writes
  through `vendor-credentials/store.ts`'s `createVendorCredential`/`updateVendorCredential`
  instead of the legacy `publish-credentials/store.ts`. The tool's model-facing wire
  contract (schema, `{ providerId: 's3-compatible', ... }` response shape) is unchanged —
  only the storage target moves. Verified `probeAccountLabel` (vendor-credentials/store.ts)
  is a no-op for every vendor but `github` — no network call — so this s3-compatible-only
  handler can never trigger the agent-reachable-probe hazard `store.ts`'s own header flags
  as the reason this table had no agent-facing write path before now.

  A workspace whose existing s3-compatible credential still sits ONLY in the legacy table
  is not found by `findDefaultByVendor` (new table), so a re-save creates a fresh
  vendor-table row rather than updating the stale legacy one — the legacy row is simply
  left behind, unread from now on (the capabilities cutover above reports the new table's
  row exclusively the moment it has any row for a vendor). One harmless orphaned row, the
  same temporary cost `dual-read.ts`'s own header already accepts for the read side. Not a
  new class of bug.

- **Permission left unchanged, deliberately.** `deployment_propose_custom_provider_credential`
  keeps `deployments.credentials.write` rather than being renamed to `vendor-credentials.write`.
  That string is used nowhere else in the repo (verified — the only two occurrences were
  this tool's own catalog entry and its own handler), so renaming it is not required for
  correctness, and I have no visibility into the real RBAC grants in a live `infra/content.db`
  to know whether renaming would silently lock out a principal. Flagging this as a call
  worth revisiting with the owner, not something I decided unilaterally deserved a rename.

### Tests

5 new/updated tests in `publish-agent-tools.unit.test.ts` (54/54 pass):
- tokenTail surfaced from the vendor table, `null` from a legacy-only row.
- `credentialConfigured`/`ready` true for a vendor-table-only save (the self-contradiction
  this dispatch's own interaction-tracing caught, proven fixed).
- vendor table wins outright over a stale legacy row for the same provider.
- The 4 pre-existing propose-credential tests that asserted against
  `deps.publishCredentialSetRepo` updated to assert against `deps.vendorCredentialSetRepo`
  (per-file negative check: each migrated site checked individually, not just an aggregate
  pass count) — one of them (`tokenTail` on the first save) is a genuinely new assertion,
  not just a renamed one.

**Proven RED first, correctly**: saved the production diff as a patch, `git apply -R`'d it
in the working tree only (never staged, never stashed), reran the suite — 5 tests failed
with the exact expected assertions (old-table row count, `credentialConfigured: false`,
stale-row leakage), 49 still passed. Reapplied the patch, reran: 54/54 green.

### Architecture regression — flagged, not fixed by me

The new `listVendorCredentials`/`createVendorCredential`/`updateVendorCredential` imports
are genuine VALUE imports from `features/deployments` into `features/vendor-credentials`.
`vendor-credentials/dual-read.ts` already imports back into
`features/deployments/publish-credentials/store.ts` for its own legacy-fallback read (its
own header calls this "intentionally temporary... should be deleted once every install is
confirmed migrated"). My new forward edge closes that into a real cycle:

    + features/deployments <-> features/vendor-credentials

Measured against `arch-scc-cuts`'s current (uncommitted, mid-refactor) `check-architecture.ts`:
module cycles +1 pair, propagation cost (all-import) 10.50% → 10.51%, propagation cost
(runtime-only) 2.25% → 2.31%. `check:architecture` now reports FAILED on these 3 metrics.
Back-edges into the composition root are unaffected.

I do not own `check-architecture.ts` or its baseline, and `arch-scc-cuts` was actively
editing both live during this dispatch — touching either myself risked colliding with their
in-flight work on a shared git index. **Sent them the exact numbers and reasoning via
SendMessage rather than running `--update` myself.** The cycle is self-resolving: it
disappears the day `dual-read.ts`'s legacy fallback is deleted (the plan already recorded
elsewhere in this repo's continuity docs), since only the backward leg is temporary.

---

## Task A — RouteDeps narrowing / surface-exchange relocation: INVESTIGATED, NOT EXECUTED

**Verdict up front: the RouteDeps narrowing this step asks for is already at its safe
ceiling for the files in scope, and it was reached deliberately, not by omission.** The
surface-exchange half is genuinely narrowable but the safe execution path does not exist
within this dispatch's file ownership without either (a) rippling into ~8 files I do not
own, several actively edited by another agent, or (b) hitting the identical structural trap
that already forced the RouteDeps exception. Below is the evidence, not just the
conclusion — this brief invited pushback if the premise turned out wrong, and I want the
next reader to be able to check my work rather than re-derive it.

### RouteDeps: already narrowed everywhere it safely can be

`assistant/tool-registrations.ts:176-190` states the intended architecture directly: every
domain except a few genuinely exceptional ones declares its own narrow structural type
instead of naming `RouteDeps`; `AssistantToolRegistryDeps` (the union of all of them) is
assembled in exactly ONE file, on purpose, so no individual domain has to see the whole bag.
This is already-completed, previously-shipped work (ADR-049), not something this dispatch
needed to newly discover.

The exceptions — `features/deployments/tool-registrations.ts` (`DeploymentsToolDeps =
RouteDeps`), `features/deployments/publish-agent-tools.ts` (`StaticPublishToolDeps extends
RouteDeps`), `features/source-control/tool-registrations.ts` (`SourceControlToolDeps
extends RouteDeps`), and `features/source-control/commit-site.ts` (`CommitSiteInput.routeDeps:
RouteDeps`) — all share ONE cause, and it is already fully documented in each file with a
specific, checkable claim: each one threads `routeDeps` into `exportSite()` (directly, or via
`publishStaticSite`/`commitSiteToSourceControl`), which needs the FULL composition-root bag
to boot an in-process `createApp(routeDeps)` and fetch every route. `deployments/tool-
registrations.ts:44-65`'s own comment states the exact experiment already run: a
self-referential narrower stand-in (`ExportEngine<DeploymentsToolDeps>` instead of
`ExportEngine<RouteDeps>`) fails `tsc` outright, because `RouteDeps.runExportSite`'s
parameter position is contravariant.

**I independently re-derived this rather than trusting the comment at face value** (this
repo's own memory: a prior long evidence-shaped comment here turned out to encode a false
inference). Under TypeScript's strict function-type variance rules, a value of type
`(options: {routeDeps: RouteDeps}) => Promise<ExportReport>` is assignable to a slot
expecting `(options: {routeDeps: Narrow}) => Promise<ExportReport>` only if `Narrow` is
itself assignable TO `RouteDeps` — i.e., `Narrow` would need to be a superset of every field
`RouteDeps` has, the OPPOSITE of what "narrow" means. The math checks out; this is a real,
provable constraint, not an inherited assumption. I did not additionally re-run the failing
`tsc` experiment myself (budget), but the derivation is independent of the comment's own
wording.

The import itself is already `type`-only everywhere in this set (confirmed by grep — no
value import of `RouteDeps` exists in any of the four files), so it carries zero
circular-load risk, exactly as the brief's own framing said. It is change-time coupling
only. **Nothing here was left undone by a previous session; it is a deliberate, proven,
documented boundary.** Re-attempting it would only reproduce the same `tsc` failure.

### Surface-exchange contract: genuinely narrowable, but not safely within this dispatch

`askOnce`/`askThenReport`/`SURFACE_EXCHANGE_ID_PARAM`/`SURFACE_DISMISSED_PARAM`/
`AssistantSurfaceDeps`/`SurfaceExchange`/`SurfaceMessage` are imported directly from
`assistant/surface-exchanges.ts` by exactly two files in my ownership —
`features/deployments/publish-agent-tools.ts:102` and
`features/source-control/tool-registrations.ts:17` — each via ONE mixed (value + type)
import statement. That file's own header already says outright: "assistant layer,
domain-agnostic — it names no post, page, or content concept," which is precisely the kind
of code that should not have to live inside `src/assistant/` at all.

Two ways to remove the edge, both examined:

1. **Move `surface-exchanges.ts` out of `src/assistant/`.** Blocked by ownership, not
   difficulty: ~10 files import it (`byok-tool-surface.ts`, `agent-daemon-server.ts`,
   `a2ui-actions-route.ts`, `pending-confirmations.ts`, `demo-a2ui-tool.ts`,
   `demo-choices-tool.ts`, `mcp-ui-tool-calls-route.ts`, `index.ts`,
   `features/post/tool-registrations.ts`), and only 3 of them
   (`assistant/tool-registrations.ts`, `assistant/mcp-ui-tool-calls.ts`, and the file
   itself) are mine. Several of the rest are daemon-adjacent files `assistant-selfheal` was
   actively editing during this same dispatch (confirmed via `git status` mid-session —
   `apps/admin/src/features/ai-assistant/*` daemon-restart work in flight). Moving a
   shared file out from under a module another agent is live inside is exactly the
   collision this session's git rules exist to prevent.

2. **Inject `askOnce`/`askThenReport`/the two param constants through the `surfaces`
   parameter instead of importing them**, so the two feature files declare a purely local
   structural type (same pattern as the RouteDeps narrowing) and never name
   `assistant/surface-exchanges.ts` at all. Traced this all the way through:
   `assistant/tool-registrations.ts`'s `DomainSlice.build` field is typed
   `(routeDeps: AssistantToolRegistryDeps, surfaces: AssistantSurfaceDeps) =>
   ToolRegistration[]` and is shared, uniformly, by all 24 domains at ONE call site
   (`slice.build(routeDeps, surfaces)`). For `buildSourceControlRegistrations`/
   `buildStaticPublishRegistrations` to declare a WIDER surfaces requirement (adding
   `askOnce` etc. as required fields) while remaining assignable to that shared slot hits
   the **identical contravariance failure** already proven for `RouteDeps` above: the
   slot's param type would need to be assignable TO the function's own (wider) param type,
   which fails unless `AssistantSurfaceDeps` itself grows those fields — for ALL 24
   domains, not just mine. Making the new fields optional-with-a-runtime-assert avoids the
   type error but trades a real architecture-metric edge for a defensive branch nobody in
   production will ever hit and a new "unreachable in practice" test case — exactly the
   shape this codebase's own culture (visible in nearly every file I read) tends to avoid
   without a strong reason.

### Was it worth forcing anyway? Measured, not guessed

Checked what eliminating the edge would actually buy before deciding not to chase it.
`check:architecture --list` at HEAD (before Task B) showed exactly these two files as the
ONLY edges from `features/deployments`/`features/source-control` into `assistant` (grepped
the full source tree for `assistant` imports in both feature directories — confirmed, one
import statement each, nothing else). Removing them would break the `assistant <->
features/deployments` and `assistant <-> features/source-control` cycle PAIRS specifically
(2 of the 13/7 counted at the time) — real and worth something. It would NOT shrink the
largest SCC: both `features/deployments` and `features/source-control` stay in it regardless,
via their OWN separate `<-> server` cycles from the (non-narrowable) `RouteDeps` imports
documented above. `features/post/tool-registrations.ts` imports the identical symbols from
the identical file and is out of my ownership entirely, so `assistant <-> features/post`
would survive unchanged either way.

**Net assessment: a real but small, isolated win (module-cycle count only, not SCC or
propagation), reachable only by widening a shared 24-domain contract or moving a file out
from under an actively-editing agent.** Recommending this stay a named, deferred follow-up
rather than something I forced through today. If a future pass wants it: the correct order
is (1) confirm with `assistant-selfheal` that `src/assistant/**` is quiet, (2) move
`surface-exchanges.ts` to a neutral home (not `src/core/` — that directory is a
spec-governed CIC layer with a different, unrelated purpose; needs its own home), (3) update
all ~10 importers in one pass so nothing is left half-migrated.

---

## Addendum — post-dispatch follow-ups from team-lead, all done

Three more items landed after the original two tasks above, all requested mid-session:

### 1. Architecture regression fixed properly (not just reported) — `a751ed04`

Team-lead asked for the cycle itself to be fixed, not accept-and-tracked, since a new
*runtime* module cycle is the exact defect class that already killed the agent daemon once
in this repo (`server/app.ts:641`, a mutual dynamic require). Fixed via injection:
`publish-agent-tools.ts` now imports NOTHING (type or value) from `features/vendor-
credentials` — it declares a local `VendorCredentialPort` structural interface (same
narrowing discipline this file already documents for `RouteDeps`, extended to a
cross-feature edge) and reads the real implementation off a new optional
`StaticPublishToolDeps.vendorCredentials` field. `assistant/tool-registrations.ts`'s
`buildAssistantToolRegistrations` — the one file already documented as needing to see every
domain at once — is the one place that imports the real `createVendorCredential`/
`listVendorCredentials`/`updateVendorCredential`/`PUBLISH_PROVIDER_TO_VENDOR` and injects
them. Unset in production is a wiring bug (throws a named error), never a silent
legacy-only degrade — matches `commit-site.ts`'s existing "no adapter configured"
precedent.

Verified `features/deployments <-> features/vendor-credentials` is gone from
`check:architecture`'s cycle list. The remaining propagation-cost drift (all-import
10.5→10.51, runtime-only 2.25→2.28-2.31) is **not attributable to this work at all** —
proven by checking an isolated worktree at `88e061c3` (the true parent of my first Task B
commit, before any vendor-credentials wiring touched the tree) and finding the identical
regression already present there. Reported to team-lead/`arch-scc-cuts` rather than
baselined.

Had to also fix 2 other test files that construct `StaticPublishToolDeps` directly
(bypassing the assistant-level wiring) with the same injected-port fixture:
`publish-agent-tools.unit.test.ts` (mine) and
`src/assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts` (not
formally in my ownership list, but it broke without the fix and the fix is a narrow,
obviously-correct test-fixture addition). 87 combined tests green.

### 2. Syntax fix — `6dc742a4`

`static-publish/__tests__/adapter.unit.test.ts:208` had an invalid `for (const config:
StaticPublishConfig of [...])` type annotation on a for-of binding. Confirmed low-priority
per team-lead's own correction: `tsconfig.json` excludes test files, so `tsc` never saw it,
and `tsx`/esbuild strips the annotation without validating (all 15 tests passed
regardless) — an ESLint-only latent finding, not a live break. Dropped the annotation.

### 3. GitHub repo-list probe — `64949d75`

New `listGitHubReposByCredentialId` in `static-publish/verify.ts`, backing
`source-control-ui`'s owner/repo picker via `route-quality`'s admin route adapter. Built to
the exact contract `route-quality` specified: same resolve-then-probe shape
`verifyPublishCredentialById` already uses in this file, deliberately not reusing that
function (a repo listing must never have a side effect on the verification cache).
`truncated` checks GitHub's `Link: rel="next"` header first, falls back to "page came back
exactly full" only when absent — deliberately biased toward over-reporting truncation
rather than under-reporting it, since a silently-truncated picker is the same class of
defect as the invented-account-name bug this whole picker workstream exists to prevent.
9 new tests, proven RED first, 21/21 green in the file.

## For the next reader

- Task B's two cutover points are complete, tested, and committed (`7dc7cae9`).
- The architecture regression from Task B was real and small; the cycle half is now FIXED
  (`a751ed04`), not merely reported — see the addendum above. The propagation-cost half was
  proven, with an isolated worktree, to predate this work entirely.
- Task A produced a negative result on purpose: both proposed moves were investigated
  rigorously (including independently re-deriving the TypeScript variance argument rather
  than trusting the existing comment) and found to be either already done or not safely
  executable within this dispatch's ownership boundary. Nothing was left half-finished —
  the RouteDeps piece has no further safe move, and the surface-exchange piece has a
  concrete, sequenced follow-up plan for whoever picks it up next.
- Three follow-up requests from team-lead (architecture fix, syntax fix, repo-list probe)
  are all done — see the addendum above for each.
