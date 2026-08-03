# Audit dossier — outbox `workspaceId` fix, static guard, tool-surface findings

Date: 2026-08-03
Author: Coordinator (Review Mode), Claude Code / Opus 5 (1M context)
Purpose: **a deliberately adversarial record of what changed, what was actually verified, and what
was assumed** — written to be audited later for bugs, security holes, mistakes, and bad
architecture. Companion to `../recon/2026-08-03-outbox-workspaceid-and-mcp-ui-decisions.md`, which
holds the narrative and the decisions.

Read the "Assumed, not verified" and "Known weaknesses" sections first. They are the point of this
document.

---

## A. What changed, by commit

### Jini `packages/cms` — `fix(cms): outbox bridges must forward workspaceId`

| File | Change |
|---|---|
| `src/entries/repo.memory.ts` | `toEntryOutbox` gains required `workspaceId: string` dep; declares `workspaceId` on the wrapped port's event type; forwards it |
| `src/content-types/repo.memory.ts` | same for `toContentTypeOutbox` |
| `src/taxonomy/repo.memory.ts` | same for `toTaxonomyOutbox` |

**This is a breaking API change to three exported functions.** Callers outside this repo and Tovu
will fail to compile. That was the intent (see §C1), but it is the single highest-blast-radius thing
in this dossier and should be audited as such.

### Tovu — `fix(widgets): thread workspaceId through the outbox bridges`

| File | Change |
|---|---|
| `src/widgets/write-service.ts` | `entriesWriteDeps(deps)` → `entriesWriteDeps(deps, workspaceId)`; 4 call sites pass `input.workspaceId` |
| `src/widgets/region-area-service.ts` | pass existing `workspaceId` param into the bridge |
| `src/widgets/embed-service.ts` | same |
| `src/widgets/entry-payload.ts` | same, for `toContentTypeOutbox` |

Also in-tree from the prior session, committed alongside: `src/widgets/deps.ts` (new deps composer)
and the 10 `src/server/routes/admin/widgets/*.ts` files rewired to it, plus permanent 500 logging in
`src/server/http/admin/widgets.ts`.

### Tovu — `chore(dev): teach check:outbox-bridge to resolve spread composition`

`development/scripts/check-outbox-bridge.ts` — added `topLevelSpreadHelpers()` and
`findOutboxValue()`, replacing a single direct `extractFieldValue(..., "outbox")` lookup. Recursion
capped at `MAX_RESOLVE_DEPTH = 4` with a `seen` set.

---

## B. Verified — what was actually executed

Everything in this section was run, not reasoned about.

1. **The bug reproduced** before the fix, live, against the running dev server:
   `POST /api/admin/v1/entries` → 500 `NOT NULL constraint failed: outbox_events.workspace_id`,
   with the row still written.
2. **The fix verified** after a full server restart (required — the Jini `dist/` is symlinked into
   Tovu, so a rebuild is live but a running process holds the old module):
   entries-create 201, widget create 201, widget update 200, trash 200, purge 200, region-bind 201.
3. **`outbox_events` rows carry `workspace_id`** — read back directly with `sqlite3`.
4. **Zero** `NOT NULL` / `mapWidgetErrorToResponse` errors in the server log post-restart.
5. **Jini `packages/cms`: 471 tests / 62 files pass**; `tsc --noEmit` exit 0 (its tsconfig includes
   `__tests__`, so tests are typechecked too).
6. **Tovu root `npm run typecheck` exit 0.**
7. **The static guard discriminates in both directions**, self-tested via `--dir <fixtures>`:
   - raw `outbox: deps.outbox` hidden inside a spread helper → **caught**
   - `toEntryOutbox` used where `toContentTypeOutbox` is required, inside a spread → **caught**
   - correct spread composition → **silent**
   This matters because the guard was changed *specifically to stop it reporting existing code*, the
   exact circumstance under which a guard gets quietly neutered.
8. **The image-drop bug reproduced** by calling the real `renderDocNode` with an image node:
   `"<p>before</p><p>after</p>"`.
9. **`content_post_delete`'s token leak traced along the real product path**, not just `okResult` in
   isolation: handler return → `ToolExecutionResult.output` (`unknown`) → `execute_delegated_tool`
   returns `data.result` → `okResult()` `JSON.stringify`s it into one text block.
10. **`buildUIToolResult` has zero consumers** — grepped `src/` and `apps/` for `McpUiHost`,
    `useMcpUiHost`, `registerExtEventRenderer`, `mcp-app`.

---

## C. Assumed, NOT verified — audit these first

**C1. ~~The breaking-change blast radius outside Tovu is unmeasured.~~ — MEASURED 2026-08-03,
verdict CONTAINED, with blind spots stated rather than glossed.**

Four independent checks across every project on this machine (AISELC, AIfolio, All-GDate, Cloud,
Cloud ERP, Hawke-Media-LandingPage, Jini, OSS-Marketing-Repos, OSS-Repos, Open-Marketing, Tovu,
Tovu-Runner, Zana, `_archive-Tovu-Runner-presplit`, `delete-later`, `jini-backups`):

1. **`package.json` declarations** on `@jini-ai/cms` → only Tovu, a Tovu git worktree (same repo, not
   a distinct consumer), and cms's own manifest.
2. **Source-level literal imports** (catches phantom/undeclared deps) → ~230 hits, every one inside
   `Tovu/src` or `Jini/packages/cms`. **Zero in Zana or Tovu-Runner.**
3. **The three changed symbols specifically** → same closed, already-fixed set.
4. **Publish surface** → `npm view @jini-ai/cms` **404, never published.** So no off-machine npm
   consumer can exist.

*Incidental finding:* sibling `@jini-ai/core` **has** been published (0.1.0–0.1.2), so the publish
workflow's own "DORMANT until NPM_TOKEN exists" comment is **stale** — the mechanism is live for at
least one package and simply has not reached `cms`. Worth knowing before assuming any Jini package is
unpublishable-by-default.

**Blind spots, explicitly not "found and dismissed":** a private fork/mirror of the (public,
2.5-week-old, 0-fork) GitHub repo with no API visibility; a private org npm registry with no
credentials available; source copy-pasted into an unrelated codebase (undiscoverable by definition).
A local-machine + public-API audit cannot close these.

**C1 (original).** The three bridges are exported
from `@jini-ai/cms`'s public subpaths (`entries/index.ts`, `content-types/index.ts`,
`taxonomy/index.ts`). I verified Jini's own call sites (`entries/tool-registrations.ts` already
passed a bag containing `workspaceId`) and Tovu's. **I did not check any other consumer of
`@jini-ai/cms`.** If one exists, it is now broken. Required-vs-optional was a deliberate choice —
optional would have preserved compatibility and silently reintroduced the bug — but the cost was not
measured.

**C2. ~~No regression test was added for the fix.~~ — CLOSED 2026-08-03.**
`src/core/events/__tests__/outbox-workspace-id.integration.test.ts` — 5 tests binding the **real**
`SqliteOutboxAdapter` via `openContentDb(":memory:")`, one per family (entries / content-types /
taxonomy / widgets) plus a cross-tenant case covering C6. Test 4 binds the raw unwrapped adapter
exactly as `src/server/deps.ts:384` wires it in production.

**Red/green proven, and independently re-verified by the Coordinator.** `workspaceId: deps.workspaceId`
was reverted out of `toEntryOutbox`, Jini rebuilt, suite rerun: the 3 tests routed through that bridge
went RED with `SQLITE_CONSTRAINT_NOTNULL` (matching the original production signature) while the 2 on
untouched bridges stayed GREEN — so the suite discriminates per-bridge rather than failing noisily.
Restored, rebuilt, 5/5 GREEN. Coordinator confirmed afterwards that both Jini `src` and `dist/` are
back in sync and still forward `workspaceId` in all three bridges.

*Coverage boundary, deliberate:* one representative function per bridge. `updateEntry`/`publishEntry`/
`unpublishEntry`, `updateContentTypeFields`, `createTerm`/`renameTerm`/`assignTerms`, and
`tombstoneContentType` are NOT individually covered — they re-enter the same `toXOutbox` code path.
Defensible, but it means a per-function regression outside the bridge would not be caught.

**C3. ~~The `taxonomy` path was never exercised live.~~ — PARTIALLY CLOSED, and it surfaced a real
finding.** Taxonomy (`createTaxonomy`) and content-types (`deprecateContentType`) both executed
against a real adapter for the first time ever and **passed clean** — the "fixed by symmetry" call was
correct. Still unexercised at runtime: `createTerm`/`renameTerm`/`assignTerms`, `tombstoneContentType`.

**NEW FINDING — `registerContentType` declares `outbox` and never uses it.** Verified independently:
`@jini-ai/cms` `content-types/write-service.ts:141` takes a required `outbox: OutboxPort` dep and
**never calls `enqueue`**. The only content-types functions that enqueue are `lifecycle.ts`'s
`deprecateContentType` (:103) and `tombstoneContentType` (:229). Two consequences:

1. A required dependency that is structurally dead. Architectural smell worth an auditor's attention —
   it is what let the bug hide, since a dep nobody exercises is a dep nobody validates.
2. **It falsifies a claim that was sitting in our own source as fact.** `src/widgets/entry-payload.ts`
   asserted the unwrapped adapter "threw `NOT NULL constraint failed: outbox_events.id` the first time
   a workspace creates its first widget/widget_area". That path *cannot* throw, because it never
   enqueues. The claim was inferred by an earlier agent and written down as observed history. **Comment
   corrected in place 2026-08-03.** Treat other confident, specific claims in this area's comments as
   suspect until checked — this one read exactly like evidence.

**C4. `MAX_RESOLVE_DEPTH = 4` is a guess.** Chosen as "comfortably more than the 2 hops this repo
needs". No evidence informs the specific number.

**C5. ~~The 55-vs-6 widget discrepancy is unexplained.~~ — RESOLVED 2026-08-03. My framing of this
was WRONG, and the real finding is different and smaller.**

> **CORRECTION — the "6 widgets in the admin list" premise was mine and it was invalid.** I measured
> the API's *default* filter (`GET .../widgets` → 3 active, `?status=trash` → 3) and assumed the
> admin UI used it. It does not: `apps/admin/src/sections/WidgetsLibrary.tsx:22` calls
> `api.listWidgets({ includeInactive: true })` unconditionally — one table, no active/trash tab
> split. Verified directly. **The admin UI shows 57 of 59 rows, not 6.** There was never a
> 55-vs-6 gap to explain.

Real breakdown (read-only against `infra/content.db`, scoped to `workspace-local`; 59 rows now, up
from 55 as probes accumulated): **3 active, 4 trash, 50 purged, 2 malformed.** Note `entries.status`
is a red herring — always `'draft'` for widgets; real status lives in
`fields_json.ext.widget.payload.status`.

The 50 "purged" are `smoke-test-widget-1..25` created **twice** with distinct random slugs, plus
named debris. Unambiguous test artifacts, legitimately marked purged via `purgeWidgetInstance`'s
disclosed marker-not-physical-delete design — and **already visible** in the UI, correctly labelled
`status-purged`. Not hidden.

**The genuine finding, narrow but real: a silent catch-and-skip with zero operator visibility.**
`listWidgetInstances` (`src/widgets/read-service.ts:102-106`) wraps `parseWidgetInstancePayload` in
`catch { continue; }` — deliberate and documented (skip one bad row rather than 500 the whole
library), and defensible as a design. **The gap is observability, not the choice:** no log, no count,
no operator signal. Exactly 2 rows are dropped today, and they are **artifacts this audit created
itself** — `__entries-create-probe__` and `__fix-verify-entries__`, written by POSTing to the generic
entries route, so their `fields_json` is `{"ext":{"site":…}}` not `{"ext":{"widget":…}}`.

So it is **not currently hiding real content** — it hides non-widgets. But a genuinely corrupted real
widget would vanish the same way, with no trace anywhere. **Landmine, not an active leak.** Not
fixed (investigation was scoped read-only). The entries endpoint reports 55 `type=widget`
rows in `workspace-local`; the widgets admin endpoint shows 3 active + 3 trash. **I did not find out
why.** Either the admin list filters correctly and 49 rows are orphaned junk, or the admin list is
hiding real rows. Both are worth knowing before anyone runs a cleanup. The previous handoff asserted
"there are 4 widgets, not ~47" — that claim is now known to be wrong, so treat the whole
widget-inventory question as open.

**C6. ~~Whether the `workspaceId` now written is always the RIGHT one.~~ — PARTIALLY CLOSED.** Test 5
of the new suite drives two workspaces through the same adapter and DB and asserts rows are never
cross-attributed. That covers the adapter/bridge layer. It does **not** cover whether a *route* could
pass a workspaceId that differs from the entity's true owner — the original concern below still
stands for the call sites.

**C6 (original).** Every call site passes a
workspaceId that was already in scope and already used for the accompanying entry write, so it is
consistent with the row being written. I did **not** audit whether any call site could be reached
with a workspaceId that differs from the entity's true owner. Given `content.db` is deliberately
multi-tenant, **a cross-tenant mismatch here would write an outbox event attributed to the wrong
workspace** — worth one deliberate pass.

---

## D. Known weaknesses / things an auditor should attack

**D1. The test suite structurally cannot catch this bug class.** `SqliteOutboxAdapter` appears in 2
non-production files, both testing it in isolation. Every domain test stubs `outbox` with
`{ enqueue: async () => undefined }` (e.g.
`src/widgets/__tests__/integration/write-service.integration.test.ts:42`), which accepts any shape.
**A green suite is not evidence about outbox correctness.** The static guard and the type change are
compensating controls for a hole in the test strategy — they are not a substitute for closing it.

**D1b. The test runner cannot see type errors — so "tests pass" and "it compiles" are genuinely
independent claims here.** The root suite runs `node --import tsx --test`. `tsx` is **transpile-only**:
it strips types and never validates them. Demonstrated concretely 2026-08-03 — reclassifying
`integrations_delete_subscription` required widening that domain's local `AgentToolSideEffect` union,
and omitting the widening produced a clean green test run and a failing `npm run typecheck`.

Combined with D1 (every domain test stubs the outbox), the repo has **two independent blind spots
that a green suite does not cover**. Always run `npm run typecheck` *and* the scoped tests; neither
substitutes for the other, and neither substitutes for exercising the running app.

**D2. The static guard is a shape check, not a type check, and is bypassable by design.** It
hard-codes a finite `CHOKEPOINTS` list; a new chokepoint function is invisible until someone edits
the script. It matches text, so any composition shape it does not model gets reported as UNRESOLVED
(fail-closed) — which is safe but produced 3 false positives on correct code and would again.

**D3. The type-level fix relies on the bridge's declared param type, which is structural.** Passing
an object with an extra `workspaceId` field satisfies it. The original bug existed *because* method-
parameter bivariance let a raw adapter satisfy a narrower port. **The same loophole is still open for
the un-bridged path** — that is precisely why the static guard still exists and must not be deleted
as redundant.

**D4. `content_post_delete` is knowingly left self-approvable** (decision D2 in the companion doc,
taken by the user with the alternative offered and declined). Until MCP-UI steps 1–4 land, the model
can read the confirmation token out of its own tool result and issue the delete itself, and **no
human is ever shown a dialog because nothing renders one.** The tool description asserts the
opposite. An auditor should treat the tool description as actively misleading, not merely stale.

**D5. The agent tool surface is far wider than intended.** 88 tool ids, 20 domains, ~50 mutating
(`sideEffects: "mutates-durable-state"` × 49, `mints-token` × 1, `deletes-durable-state` × 1). The
stated intent for the front-end assistant is read-only (search / navigate / answer). **The gap is
~50 tools.**

**D6. Risk classifications are not trustworthy as a gating key — REVISED 2026-08-03 after
investigation. The original framing below was partly WRONG; corrections first.**

> **CORRECTION 1 — `theme_delete_file` is not a registered tool at all.** It exists only as a
> deliberately-excluded example in a comment (`src/features/theme/agent-tools.ts:44`) and a test
> asserting it must never be wired (`src/assistant/__tests__/tool-registrations.themes.test.ts:109`).
> My "any gate keyed on `deletes-durable-state` lets `theme_delete_file` through" claim was
> **false** — there is nothing to let through. Verified directly. This dossier made exactly the
> mistake it warns about in C3/§D8: a confident, specific claim asserted without checking.
>
> **CORRECTION 2 — the gate has moved.** `assertToolIsWirable` now lives in Jini
> `packages/cms/src/core/tools/registration-kit.ts:360` (relocated out of Tovu in commit `18890f1`).
> Any path this dossier implies inside Tovu is stale; Tovu's `tool-registrations.ts:239` calls it.

Per-tool findings, replacing the original list:

| Tool | Verdict |
|---|---|
| `theme_delete_file` | **Not a registered tool.** No issue. |
| `integrations_delete_subscription` | Soft delete with **no un-disable path anywhere** → leans reclassify to `deletes-durable-state` |
| `newsletter_remove_subscription` | Soft delete; one-wayness is a **deliberate consent/compliance property** stated in-repo, not an oversight → defensible either way |
| `widgets_remove_embed` | **Not delete-shaped** — a `bodyJson` document edit, same shape as insert/reorder → keep `mutates-durable-state` |
| `comments_trash_comment` | **Correct as-is** — a real, working `comments_restore_comment` undo exists |
| `widgets_trash_instance` | Soft flip with **no restore tool/route/function anywhere**; the truly destructive `purgeWidgetInstance` stays unexposed → keep, but the missing restore tool is a real product gap |

So the honest count of genuine misclassifications is **at most one** (`integrations_delete_subscription`),
not four. The underlying concern still stands — the label is thin, with only one tool declaring
`deletes-durable-state` — but it is not the field of holes originally described.

**PRECEDENT DECISION — TAKEN by the user, 2026-08-03.** The standard now adopted is
**"no agent-reachable undo ⇒ `deletes-durable-state`"** — the same standard that justifies
`content_post_delete`'s label. Future classification calls should cite it.

Applied to `integrations_delete_subscription` only (reclassified to `deletes-durable-state`). The
other five stay as analysed above; the missing restore tools were explicitly **not** built.

**This is metadata prep, NOT a security fix.** Zero runtime behavioral effect today —
`deletes-durable-state` has exactly one live consumer, the equality check itself. It prepares for the
confirmation gate D1a still requires. **Do not read this line item as a hole that got closed.**

*Implementation hazard, per D6b:* the catalog entry and the `*DerivedRisk` map must change together
in one coordinated edit. A mismatch throws at registration time and aborts all ~88 tools at daemon
boot, and typecheck cannot see it — it is a runtime throw.

**D6b. NEW — a single risk mismatch aborts the ENTIRE tool surface at daemon boot.**
`buildAssistantToolRegistrations` (`src/assistant/tool-registrations.ts:255`) loops every domain with
**no per-domain `try`/`catch`**. One `sideEffects`-vs-derived-risk mismatch throws and takes down
registration for all ~88 tools across all 21 domains. Verified — there is no error isolation in that
loop. Two readings, both worth holding: fail-fast is arguably *correct* (booting with a mis-declared
destructive tool is worse than not booting, and the adjacent comment suggests the strictness is
deliberate), but the blast radius is much larger than "this one tool gets excluded", and anyone
editing a classification should know a typo bricks the assistant entirely.

**D7. ~~Inline images are silently dropped from all published output.~~ — FIXED 2026-08-03.**
`renderDocNode` gained `case "image"` (`src/server/http/site/render.ts:173`), degrading to the
existing `mediaPlaceholder()` convention with `attrs.alt` (fallback `"Image"`).

**Deliberately NOT a real `<img src>`, and the reasoning matters:** a read-only probe of the media
pipeline found `attrs.src` today holds either an inlined base64 `data:` blob, an arbitrary
unvalidated external URL, or the **authenticated** admin media-preview URL which 401s on a public
page. ADR-027's ref-based public route exists but has an empty `transform_registry` in every real
deployment and the editor never emits the refs it expects. **There is no case today where a real
`<img>` renders correctly**, so emitting one would half-solve an XSS/URL-scheme problem for a value
that cannot work. Since `src` is never emitted, no scheme validation was added — **that decision must
be revisited the moment a real `<img>` path is built.**

Verified RED first (empty `<div class="prose"></div>`, the exact D7 signature) then GREEN: 3 new
tests, `render.test.ts` 20/20, full directory 51/51. Coordinator independently re-ran: 20/20.
One fix point reaches both theme tiers — `renderDocNode` is called by `entryContent()`/
`renderSlot("content")` and by `buildTemplateRenderData()`, which both `liquid-worker.ts` and
`handlebars-worker.ts` wrap.

**Still open:** no real asset pipeline (ADR-027 wiring, editor media-library picker). The placeholder
is honest but is the kind of thing that quietly becomes permanent — flagged deliberately.

---

## E. Environment hazards affecting the audit

- **`Tovu/node_modules/@jini-ai/cms` is a SYMLINK to `Jini/packages/cms`.** No publish step. A
  `dist/` rebuild is instantly live in Tovu, and a running server keeps the old module until
  restarted. **A "verified" result taken without a restart is not evidence.**
- **Two other sessions were mutating these repos concurrently** during this work. In Tovu:
  `ADR-INDEX.md`, `ADR-052-*`, `2026-08-03-electron-launch-debug.md`,
  `2026-08-03-image-send-capability.md`, and `apps/admin/src/components/AssistantDock.tsx`
  (image-attachment wiring). In Jini: `packages/agent-runtime/**`, `packages/daemon/image-prompt-
  delivery.ts`, `packages/daemon/agent-executor.ts`, `packages/vibecoding/**`. **All of these were
  deliberately EXCLUDED from these commits** and remain uncommitted. Commit scoping was by explicit
  file path, never `git add -A`.
- **Test-data pollution.** This session left in `workspace-local`: `__entries-create-probe__` and
  `__fix-verify-entries__` (both `type=widget` entries, created via the entries route, never
  cleaned), plus one `footer` region binding. Created and purged: `__fix-verify-widget__`,
  `__fix-verify-update__`, `__fix-verify-update2__`. Pre-existing from earlier sessions:
  `__net-probe-widget__`, `__outbox-fix-verify__`, `Live test footer note` (trashed), and the
  `smoke-test-widget-*` population of unknown provenance (see C5).

---

## F. Suggested audit order

1. ~~**C2** — write the missing regression test.~~ **DONE 2026-08-03**, red/green proven and
   independently re-verified. Remaining gap is the per-function coverage boundary noted in C2.
2. **C1** — enumerate consumers of `@jini-ai/cms` outside Tovu; confirm the breaking change is
   contained. **Now the top open item**, and the highest-blast-radius unknown in this dossier.
3. ~~**C6** — cross-tenant pass.~~ Adapter/bridge layer covered by test 5; **route-layer pass was
   dispatched and is the last open audit item** — see
   `../../.local-artifacts/agent-reports/20260803-cross-tenant-workspaceid-audit.md`.
4. **D5** — the tool surface (~88 tools, ~50 mutating, against a stated read-only intent for the
   front-end assistant). **Now the largest live security exposure in this document.** Blocked: the
   surface it touches is being actively refactored by another session.
5. **D4** — `content_post_delete`, tracked by ADR-053. Known, accepted, open by explicit decision.
6. ~~**C3** — exercise taxonomy and content-types writes live.~~ Done for `createTaxonomy` and
   `deprecateContentType`. Remaining taxonomy producers dispatched (see D9).
7. ~~**C5** — widget inventory.~~ Resolved; premise was invalid.

**D9. Taxonomy's bridge silently falls back rather than failing — INVESTIGATED 2026-08-03, NO live
defect, tests added anyway.** `toTaxonomyOutbox` takes `event: unknown` and reads `name`/`occurredAt`
defensively, so a producer emitting no string `name` would get the generic `"taxonomy.event"` and
write a row that looks completely healthy.

**All four in-repo producers do set `name` unconditionally** — including `assignTerms`
(`packages/cms/src/taxonomy/write-service.ts:384-391`, `name: "taxonomy.terms_assigned"`), which was
the unread one. The fallback is currently **unreachable**. Not a live bug.

Tests added regardless (suite now 8, was 5): `createTerm`, `renameTerm`, `assignTerms`, each asserting
both the correct `workspace_id` **and the specific correct event name, explicitly not the fallback**.
Rationale: the fallback existing at all means a future edit dropping or renaming a producer's `name`
would silently succeed and be invisible to a `workspace_id`-only check.

**Red/green proven on the new assertion specifically** (not merely "passes against working code"):
dropping `name` from `createTerm`'s enqueue turned only that test RED with exactly the predicted
failure — `actual: 'taxonomy.event'`, `expected: 'taxonomy.term_created'` — while the other 7 stayed
GREEN. Restored; Coordinator confirmed Jini's `write-service.ts` shows a clean `git diff` and re-ran
the suite: 8/8.

*Incidental:* `assignTerms` requires `contentType` on the `["post","page"]` allow-list
(`write-service.ts:99`) or it throws `TaxonomyNotApplicableError` before reaching its enqueue.

**Coverage boundary confirmed and NOT extended further.** `updateEntry`/`publishEntry`/
`unpublishEntry`/`updateContentTypeFields`/`tombstoneContentType` re-enter the same uniform
`toEntryOutbox`/`toContentTypeOutbox` bridges already covered, neither of which has taxonomy's
defensive-fallback behaviour. The taxonomy exception was specific to `toTaxonomyOutbox`'s
`event: unknown` shape and does not generalise.

**D10. Cross-tenant workspace divergence between the admin server and the AI-agent daemon —
LATENT, not live. My original severity framing was WRONG; correction first.**

> **CORRECTION (2026-08-03) — the headline scenario I wrote is NOT REACHABLE today.** I claimed
> `tovu serve --workspace B` would put the admin UI on B while agent-tool writes landed on A. That
> cannot happen, because **`tovu serve` never spawns an agent daemon at all.** Verified directly:
> `spawnAgentDaemon()` exists only in `src/index.ts`; `grep` for it across `src/cli/` returns
> nothing, and `src/cli/commands/serve.ts` calls `bootSiteDir` → `createApp` → `app.listen` with no
> daemon anywhere. So on the `--workspace` path there are no agent tools running to write to the
> wrong tenant.
>
> Caught by an independent pre-review agent working from the committed baseline. **This is the
> fourth claim in this dossier to be overstated or false** — see the entry-point README. The pattern
> is consistent: a real mechanism, correctly traced, then extrapolated one step too far into a
> scenario nobody checked was reachable.

**What is actually true, and still worth fixing.** `src/index.ts` (described in `cli/main.ts` as the
"legacy env-var boot", a separate entrypoint from the packaged `tovu` bin) *does* spawn the daemon,
and has **no `--workspace` flag of its own**. Both it and the daemon independently called
`createSqliteRouteDeps()` with zero arguments, so both resolved the default (oldest) workspace and
**agreed by coincidence of a shared default** — not by design. Nothing reconciled them; they would
diverge the moment either side gained independent configurability. Latent gap, real, worth closing.

The mechanism, every link verified:

1. `createSqliteRouteDeps(dbPath, overrides)` accepts `overrides.workspaceId` (`src/server/deps.ts:186`).
2. The daemon called it with **zero arguments** (`src/assistant/agent-daemon-server.ts:153`),
   independently resolving the default.
3. `spawnAgentDaemon()`'s documented inherited env (`src/index.ts:161-165`) carried **no workspace
   variable**, and no `TOVU_WORKSPACE`-style bridge existed anywhere.

**Also note:** today's agreement relies on "oldest workspace" being **time-invariant** — a newly
created workspace can never become the oldest. That is true, but it is an implicit dependency nobody
had written down.

**No test could have caught this shape**, then or now: it is a *two-process* property, and this
repo's cross-tenant test constructs two deps bags inside one process — a different (also real)
property.

**Scope boundary to confirm:** the fix closes the `index.ts` + daemon gap. It does **not** make
`tovu serve --workspace B` spawn a daemon bound to B, because that command still spawns no daemon.
Whether the packaged CLI should run an agent daemon at all is a separate, unanswered product
question.

### D10 fix — LANDED and independently reviewed

Three files, additive:
- `src/server/deps.ts:680` — new `createSqliteRouteDepsForWorkspace(workspaceIdOverride, dbPath?)`.
  Undefined override ⇒ exact delegation to the existing call. Defined ⇒ opens its own db, validates
  via `resolveWorkspace`, then supplies `{db, workspaceId}` **together**, honouring CIC U-001 by
  construction rather than weakening it.
- `src/assistant/agent-daemon-server.ts:86,161` — 2-line surgical edit (import + the `routeDeps`
  construction). Memory-mode branch untouched.
- `src/index.ts:188` — `spawnAgentDaemon(deps.workspaceId)` with explicit
  `env: { ...process.env, TOVU_WORKSPACE: workspaceId }`.

**Reviewed by a second agent that wrote its expectations BEFORE seeing the implementation** (see
`../../.local-artifacts/agent-reports/20260803-d10-independent-pre-review.md`). Verdict: **no defects
in the D10-scoped code.** All 9 checkable items passed; new test 4/4, sibling suites 11/11; typecheck
0 errors.

**Scope is proportionate — verified independently by the Coordinator.** `src/index.ts:98`'s own
`createSqliteRouteDeps()` call is **still zero-arg**. The fix gives the admin server no new way to
select a workspace; it only makes the daemon agree with whatever the admin already resolved. No creep
into configurability nobody asked for.

**Reviewer disagreed with its own pre-review, in the implementation's favour:** it expected a
`process.env` mutation (mirroring `ensureAgentDaemonToken()`'s precedent) and judged the explicit
`env` object passed to `spawn()` to be **better** than the precedent — more visible in a diff.

**One non-blocking finding — duplication was localised, not avoided.** The new override branch
hand-repeats the seed-data object + `recoverIncompleteDataModuleMigrations` hook (~40 lines) rather
than sharing a helper. Confirmed: `recoverIncompleteDataModuleMigrations` now appears at
`deps.ts:214` **and** `:689`. Lower severity because both copies sit in one file, but it is
duplication, not sharing. **Small follow-up extraction; not worth blocking on.**

**STILL UNVERIFIED (3 items), explicitly not dropped:** live two-process workspace agreement, the
daemon's module-load-time env read executing in a real spawned child, and an admin-UI smoke test. The
integration tests call the function directly with the same values the env plumbing supplies, which is
the strongest available verification short of a live boot. A boot attempt reached
`spawnAgentDaemon()` successfully but the daemon child hit `EADDRINUSE :4319` from **the Coordinator's
own stray `tsx watch` processes** — Coordinator-caused environment pollution, not a code fault.

*Review scope caveat:* `agent-daemon-server.ts`'s diff contains **two unrelated changesets** — the
D10 hunks and another session's chat-attachment work (`createDiskAttachmentStore`,
`registerAttachmentRoutes`). Only the D10 hunks were reviewed. **Nothing here should be read as
review of the attachment code.**

The chain, every link confirmed by direct read:

1. `tovu serve --workspace <id>` is a **real, documented CLI flag** (`src/cli/program.ts:49`). Its own
   help text reads *"workspace id to serve (default: the oldest workspace, if the install has more
   than one)"* — the product explicitly contemplates multi-workspace installs.
2. `createSqliteRouteDeps(dbPath, overrides)` accepts `overrides.workspaceId` (`src/server/deps.ts:186`).
3. **The daemon calls it with NO arguments** — `src/assistant/agent-daemon-server.ts:153`:
   `const routeDeps = process.env.TOVU_DB === "memory" ? createRouteDeps() : createSqliteRouteDeps();`
   So it always performs its own independent `resolveWorkspace` and lands on the **default (oldest)**
   workspace.
4. `--workspace` is a **CLI argument to the parent process, not an env var**, so it cannot propagate
   through `spawnAgentDaemon()`'s inherited env. The documented inherited set (`src/index.ts:161-165`)
   is `TOVU_DB`, `TOVU_CONTENT_DB`, `TOVU_AGENT_CWD`, `TOVU_AGENT_PERMISSION_MODE`,
   `JINI_AGENT_DAEMON_PORT`, `TOVU_AGENT_DAEMON_TOKEN` — **no workspace variable**.
5. No `TOVU_WORKSPACE`-style bridge exists anywhere (grep confirms).

**Consequence:** on any `content.db` with more than one workspace row, `tovu serve --workspace B`
puts the admin UI on **B** while every agent-tool write — `content_post_create`,
`widgets_trash_instance`, all ~50 mutating tools — silently lands on **A**. This is not outbox
misattribution. **It is the agent doing real work against the wrong tenant, end to end.**

**The existing cross-tenant test does NOT cover this.** `outbox-workspace-id.integration.test.ts`'s
test 5 constructs two workspace-scoped deps bags **within one process** and checks the bridge doesn't
cross-contaminate between calls. That is a different (also real) property from *whether two separate
OS processes agree on which workspace they each defaulted to*. No test can catch this shape, because
it is a two-process property.

**Preconditions for it to bite:** (a) `content.db` has >1 workspace row — supported by design per
ADR-007/SPEC-044, and this project is known to run multi-workspace; and (b) the operator passes
`--workspace` with a non-default id. Not verified: whether any real deployment uses `--workspace`
today (comments describe single-workspace as overwhelmingly common). Also not exhaustively ruled out:
some non-env propagation path (e.g. a state file) — the search was specifically for an env bridge.

**Not fixed.** Escalated rather than patched: the obvious fix (thread the workspace to the daemon)
touches `agent-daemon-server.ts` and `index.ts`, both actively being edited by another session.

---

**D11. Taxonomy's repo ports are structurally weaker than the other two domains.** `TaxonomyRepoPort.
findById`/`TermRepoPort.findById` take a **bare id** — no `workspaceId` in the port signature at all,
unlike entries and content-types which take `{workspaceId, id}`. Safety comes from the adapters being
workspace-**bound at construction** (`SqliteTermRepo`'s constructor takes `{db, workspaceId}` and its
`findById` does filter on it in the real query — verified), not from the call site passing the right
value. The write-service's own comment discloses this as load-bearing on the binding rather than
type-enforced, and that disclosure is **accurate**. No gap found today, but a non-workspace-bound
adapter added later would silently defeat it, with nothing in the type system objecting.

---

## G. Environment state at time of writing (2026-08-03 ~20:30Z)

**The branch does not boot.** `npm run dev` fails with `Cannot find module '@jini-ai/chat-core'`: the
other session renamed `Jini/packages/chat-core` → `packages/chat`, so `node_modules/@jini-ai/chat-core`
is a **dangling symlink** and nine Tovu files still import the old name. Consequences for anyone
auditing this:

- The `@jini-ai/chat-core` typecheck errors are **fatal at runtime, not cosmetic**. Earlier notes in
  this dossier describing them as ignorable understated them; ignoring them is correct for *scope*
  only.
- **Live HTTP verification is unavailable.** Everything verified after ~20:25Z used direct module
  imports against `:memory:` databases. Given §D1/D1b, that is a real limitation, not a formality.
- Not caused by any change in this dossier. All work here was verified either before the break or by
  direct import.
