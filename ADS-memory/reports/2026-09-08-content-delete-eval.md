# `content_delete` parent-tool eval + design

Date: 2026-09-08
Dispatched by: Coordinator (team-lead), measurement + design only, no build.
Persona: Software Architect (`AI-Dev-Shop/agents/software-architect/skills.md` v2.3.0, loaded).
Methodology mirrors `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md` (the read-family eval) exactly, per dispatch instruction.

**Status: COMPLETE.** Verified inventory (§1), retrieval eval (§2), confirmation-flow design (§3), build plan (§4), recommendation (§5), open items (§6).

---

## 0. Pre-flight

- Read `AI-Dev-Shop/agents/software-architect/skills.md` (persona bootstrap) — confirmed in first reply.
- Read the three Eval Work mandatory pre-reads (`bug-taxonomy.md`, `eval-design-playbook.md`, `harness-engineering/agent-evals/README.md`) per `AI-Dev-Shop/CLAUDE.md`. Note: those three govern *seeded bug-injection* evals (code-review style); this task is a *retrieval* eval in the shape of `tool-search-parent-tool-read.eval.ts`, which is a different eval family living in `development/evals/`, not `harness-engineering/agent-evals/`. Read as instructed; the retrieval-eval methodology actually being mirrored is the read report's, not the bug-taxonomy playbook's.
- `uptime` at start: `load averages: 8.44 44.80 64.27` on 8 cores — very elevated. Per the read eval's own precedent this is a deterministic in-memory FTS5 scoring pass with no timing-sensitive assertion, so load should not affect the numeric result, but flagging it per the "check uptime" rule.
- Not editing `tool-catalog-manifest.ts`, the tool registry, or any tool-registration file, per dispatch constraint.

## 1. Verified inventory

Enumerated by mechanical grep for `name:\s*"[a-z_]*(delete|trash|tombstone|destroy|purge|remove|revoke|disable|deactivate)[a-z_]*"` across every `agent-tools.ts` in both `apps/website/src/features/*` and `/Users/la/Programming/Jini/packages/cms/src/*` (media, identity, workspace, content-types, and entries live in the `@jini-ai/cms` package, re-exported by a Tovu `tool-registrations.ts` shim — same "converted domain" pattern the read report already documented). Every id below is verified at its source declaration; wiring is verified by checking whether a handler exists in the matching `tool-registrations.ts` (or an explicit exclusion set).

### 0.1 Correction to the dispatch's framing

The dispatch's count ("11 tools spread across THREE verb names") is off in two ways, stated first per the read report's own §0 convention:

1. **`workspace_delete` is not a wired tool.** It is declared in `cms/workspace/agent-tools.ts:127` with description `"Deletes a workspace row. NEVER agent-callable — see file header."`, and is explicitly excluded from the handler map at `cms/workspace/tool-registrations.ts:64-73`'s `UNWIRED_WORKSPACE_TOOL_IDS` set — absent from `workspaceDerivedRisk` too, so it "cannot be wired at all" (that file's own comment). Reason recorded there: it is INV-03-guarded to always refuse today (v1 has exactly one workspace row) but "the lever removes the only addressable workspace scope the moment that guard's precondition ever changes — whole-scope, no per-domain undo, same exclusion class as a forward database migration or a backup restore." **This is a second precedent for a deliberately-unwired destructive tool, alongside `taxonomy_execute_merge_term`** — the dispatch only named one.
2. **The verb count is at least five, not three**, once the sweep is widened past `delete`/`trash`/`tombstone` to catch everything a plain-language "get rid of X" query could plausibly hit: `remove` (`widgets_remove_embed`, `newsletter_remove_subscription`), and `disable` (`identity_user_disable`, `members_disable`). Both of the last two are excluded from the delete family below on inspection (§1.3) — but a retrieval eval or a human reading tool names would not know that without opening the code, which is itself a discoverability data point for the recommendation in §5.

### 1.1 The wired delete family — 10 tools

| id | file:line | handler | permission | soft/hard | wired? |
|---|---|---|---|---|---|
| `content_post_delete` | `apps/website/src/features/post/agent-tools.ts:500` | `features/post/tool-registrations.ts` (`resolveDeleteDecision`, :426) | `content.write` | **Soft** — row marked trashed, hidden from all lists/get-by-id/public site, restorable by reverting the change set | **Yes** — human-gated, holds the call open (ADR-055 Decision 2) |
| `media_trash_asset` | `Jini/packages/cms/src/media/agent-tools.ts:140` | `media/tool-registrations.ts` | `media.delete` | **Soft** — "first, reversible-in-principle step of the deletion ladder"; file header: no purge/force-delete tool exists in this domain at all | Yes — plain call, no confirmation dialog |
| `comments_trash_comment` | `apps/website/src/features/comments/agent-tools.ts:184` | `comments/tool-registrations.ts` | `comments.delete` | **Soft** — reversible via `comments_restore_comment`; "no agent-callable tool for a permanent removal; that stays human-UI-only" | Yes — plain call, no confirmation dialog |
| `widgets_trash_instance` | `apps/website/src/features/widgets/agent-tools.ts:225` | `widgets/tool-registrations.ts` | `widgets.delete` | **Soft**, revisioned status flip; UNCONDITIONAL — never blocked by references (referencing placements degrade to a placeholder at render time); "the only delete-adjacent tool in this catalog — no purge/force-delete tool" | Yes — plain call, no confirmation dialog |
| `theme_trash_file` | `apps/website/src/features/theme/agent-tools.ts:329` | `theme/tool-registrations.ts` | `THEME_WRITE_PERMISSION` | **Soft** — moves into a `.trash/...` path, bytes untouched, fully reversible via `theme_restore_trashed_file`; "no agent-callable hard delete in this domain at all; permanent removal is a human-only action in the Explore screen" | Yes — plain call, no confirmation dialog |
| `redirects_tombstone` | `apps/website/src/features/redirects/agent-tools.ts:206` | `redirects/tool-registrations.ts` | `admin.redirects.manage` | **Soft** — "disables" the rule, retained for audit, never matched again; idempotent | Yes — plain call, no confirmation dialog |
| `collections_content_type_tombstone` | `Jini/packages/cms/src/content-types/agent-tools.ts:200` | `content-types/tool-registrations.ts:249` | `admin.collections.manage` | **Effectively harder than the others**: "tombstones a deprecated content type and tears down its provisioned queryable-field indexes" — an irreversible schema-level teardown, not a row flag. Only reachable after `collections_content_type_deprecate` (a separate lifecycle step) | Yes — plain call, no confirmation dialog |
| `identity_role_delete` | `Jini/packages/cms/src/identity/agent-tools.ts:269` | `identity/tool-registrations.ts:456` | `role.manage` | **Hard delete of a custom role row.** Fails safe: refused if the role is still assigned to any user ("this system has no unassign operation, so a role in use cannot be removed at all") | Yes — plain call, no confirmation dialog |
| `identity_policy_delete` | `Jini/packages/cms/src/identity/agent-tools.ts:315` | `identity/tool-registrations.ts:501` | `role.manage` | **Hard delete of a custom policy row.** Same fail-safe: refused if referenced by any role or attached to any user | Yes — plain call, no confirmation dialog |
| `webhooks_delete_subscription` | `apps/website/src/features/webhooks/agent-tools.ts:182` | `webhooks/tool-registrations.ts:150` | `admin.integrations.manage` | **Soft at storage (never row-deleted), but classified `deletes-durable-state` — not `mutates-durable-state` — deliberately**, because there is no un-disable/reactivate path anywhere in the domain (`webhooks_pause_subscription` explicitly refuses once `status === "disabled"`). File's own comment: "from an agent's ... perspective the effect is as final as a hard delete, even though the row survives for audit." | Yes — plain call, no confirmation dialog |

**Only 1 of these 10 (`content_post_delete`) has a shipped confirmation flow.** The other 9 are directly callable in a single turn with no human-in-the-loop step, including two hard deletes (`identity_role_delete`, `identity_policy_delete`) and one irreversible schema teardown (`collections_content_type_tombstone`).

### 1.2 Deliberately unwired — 1 tool

| id | file:line | why unwired |
|---|---|---|
| `workspace_delete` | `Jini/packages/cms/src/workspace/agent-tools.ts:127`; excluded at `workspace/tool-registrations.ts:64-73` | Whole-scope, irreversible, no per-domain undo — same exclusion class as a forward DB migration or backup restore. See §0.1. |

This is the second precedent (with `taxonomy_execute_merge_term`) for the confirmation-flow design in §3: the codebase's answer to "this destructive op cannot be made safe enough to hand an agent" is **exclusion**, not a weaker confirmation. That matters for the recommendation.

### 1.3 Found in the sweep but NOT part of the delete family — 4 tools

Verb-matched by the broadened grep (§0.1.2) but excluded on inspection — kept here because the dispatch said not to trust any pre-existing list, and because a retrieval query for "get rid of this" would plausibly surface these too:

| id | file:line | why excluded |
|---|---|---|
| `widgets_remove_embed` | `apps/website/src/features/widgets/agent-tools.ts:295` | Removes one inline embed *reference* from a host entry's body; "the referenced widget instance itself is untouched." An edit op on a document, not a resource delete. `sideEffects: mutates-durable-state`, not `deletes-durable-state`. |
| `newsletter_remove_subscription` | `apps/website/src/features/newsletter/agent-tools.ts:292` | Unsubscribes one subscription; reversible via `newsletter_create_subscription`; explicitly "only ever narrows a subscriber's access to future sends, never grants or re-adds it" but is not a resource deletion — the subscriber and subscription row both persist. |
| `identity_user_disable` | `Jini/packages/cms/src/identity/agent-tools.ts:214` | Reversible account toggle — paired with `identity_user_enable` (:222). Not a delete of the user entity. |
| `members_disable` | `apps/website/src/features/members/agent-tools.ts:109` | Reversible-in-principle account toggle, same shape as `identity_user_disable`. **Side note, not in scope for this eval:** no `members_enable` tool exists anywhere in `features/members/agent-tools.ts` (only `members_list`, `members_get_by_id`, `members_disable`, `members_request_magic_link`) — unlike `identity_user_disable`/`enable`, this domain's disable has no agent-reachable undo today. Worth a separate look; not a delete-family finding. |

**No user/member-entity delete tool exists anywhere in the codebase.** Confirmed by grep across `identity/agent-tools.ts`, `members/agent-tools.ts`, and the whole `apps/website/src/features` tree for `user_delete`/`deleteUser`/`identity_user_delete` — zero hits beyond the SQLite settings repo's internal `deleteUserValue` (an unrelated per-setting cleanup helper, not an entity delete). This confirms the dispatch's exclusion instruction was preemptive scope-fencing, not a discovered-and-excluded tool — there was nothing to find.

### 1.4 Total: **10 wired + 1 deliberately-unwired = 11**, matching the dispatch's count by coincidence of arithmetic, not by list accuracy — `workspace_delete` was miscounted as wired.

## 2. Retrieval eval

Eval: `development/evals/tool-search-parent-tool-delete.eval.ts` (added by this pass, measurement-only, mirrors `tool-search-parent-tool-read.eval.ts`'s structure and helpers line-for-line where the shape is shared). Run: `npx tsx development/evals/tool-search-parent-tool-delete.eval.ts` — free, deterministic, no model calls, no network.

`uptime` at run time: `load averages: 10.49 25.69 43.84` on 8 cores — elevated, same as at dispatch start. Per the read eval's own precedent (and confirmed again here — the harness is pure in-memory SQLite FTS5 scoring, no wall-clock assertions), load does not affect the result.

### 2.1 Pre-check: harness installs the first-party contributors — confirmed

`installFirstPartyToolContributors()` is called (line 197 of the eval), and the observed catalog size is **170** wired tools, not 9. This is *not* 177 (the read report's own baseline) because that number predates the `content_read` collapse, which has since shipped unconditionally by default (`tool-registrations.ts:703-710`, dated 2026-09-08 — the same day as this dispatch): the collapse replaces 36 Tier-1 read tools with 29 `content_read.<resource>` cards, netting 177 − 36 + 29 = **170**. This eval's baseline deliberately measures against `buildAssistantToolRegistrations(fakeRouteDeps())` at **default options** (collapse included) — i.e. the real current catalog, not a pre-collapse hypothetical — since that is what a delete-family collapse would actually be layered on top of.

All 10 verified delete-family ids (§1.1) resolve in this catalog: `delete-family ids NOT in catalog: 0`.

**Side effect, disclosed, out of scope to fix here:** 38 of the 130 held-out cases now report an unresolvable `expect`/`alsoAcceptable` id, because `tool-search-heldout-v2.ts` was authored before the `content_read` collapse and still names pre-collapse ids like `collections_content_type_list` or `backup_list_restore_points` as ground truth. Those 38 cases score as a permanent miss in **every** arm below, baseline included, uniformly deflating every whole-set percentage by the same amount — it does not bias the comparison between arms, and none of the 38 affected ids overlap the delete family. This is a real, separate maintenance gap in the shared held-out fixture (the read collapse shipped without updating its own eval oracle) and is noted here rather than patched, since `tool-search-heldout-v2.ts` is a shared fixture other evals/agents also read.

### 2.2 Held-out coverage of the delete family

9 of the 10 wired delete tools have a direct held-out case; **`theme_trash_file` has zero coverage** in `tool-search-heldout-v2.ts` (verified by grep — no case names it in `expect` or `alsoAcceptable`). It is still included in every arm measured below (excluding it would understate the collapse's real footprint), but no case can confirm or refute its retrieval behavior. Flagged as an open gap in the held-out set, not fixed here for the same reason as §2.1.

### 2.3 Results, n=130 held-out, restricted to the 10 cases whose ground truth touches the delete family

| configuration | top-1 | top-5 | top-10 | top-20 |
|---|---|---|---|---|
| **BASELINE (real catalog, 170 tools, shipped)** | 3/10 **30%** ±28 | 7/10 **70%** ±28 | 8/10 **80%** ±25 | 8/10 **80%** ±25 |
| A — one fat `content_delete`, thin desc | 1/10 10% ±19 | 1/10 **10%** ±19 | 3/10 **30%** ±28 | 4/10 40% ±30 |
| A — one fat `content_delete`, RICH desc (self-graded, see §2.4) | 6/10 60% ±30 | 9/10 90% ±19 | 9/10 90% ±19 | 9/10 90% ±19 |
| **B — 10 resource-keyed thin cards, one shared handler** | 3/10 **30%** ±28 | 7/10 **70%** ±28 | 8/10 **80%** ±25 | 8/10 **80%** ±25 |

Whole-set (n=130) numbers and the paired McNemar tests are in the eval's own stdout; the restricted view above is the one that answers the actual question, per the read report's own methodology note (§3 of that report).

**Arm B is not merely "close to baseline" — it is baseline, case-for-case.** The McNemar table shows **zero discordant pairs at every cutoff** (`base-only=0 arm-only=0` at top-1/5/10/20). This is not a small effect that happened to wash out; it is a structural identity, and the eval demonstrates why: the card-grouping table shows **10 tools group into 10 cards, 0 merges** (`content_delete.collection_content_type`, `.comment`, `.content_post`, `.identity_policy`, `.identity_role`, `.media_asset`, `.redirect`, `.theme_file`, `.webhook_subscription`, `.widget_instance` — one card per tool, verified in the eval's own printed table). Per the read report's own §"the mechanism, corrected" finding, BM25 document-length normalization is what makes granularity the whole story, not vocabulary or id weight — and here granularity does not change at all, because **the delete family has no `_get`/`_list` pairs to merge** (unlike the read family, where 7 pairs collapsing from 2 documents to 1 is exactly what produced the read collapse's own +9-point top-5 gain). Two cases still miss at top-10 under Arm B (`comments_trash_comment`, `widgets_trash_instance`) — and they are the **same two cases baseline already misses**, confirmed by the zero-discordant-pairs result, so they are pre-existing vocabulary gaps, not collapse damage.

Arm A (one fat entry) reproduces the read eval's finding on a smaller sample: catastrophic with a thin description (80% → 30% top-10, and a worse 70% → 10% at top-5), largely recovered by a RICH description that inlines the deleted tools' own vocabulary.

### 2.4 The RICH arm is self-graded — same disclosed caveat as the read report

`RICH_DESCRIPTION` was authored with the 10 affected queries in context (phrases like "get rid of", "nobody's using it", "we don't use that... anymore" are visibly lifted from them). Per `tool-search-heldout-v2.ts`'s own documented protocol, a self-graded arm is an upper bound, not a blind estimate. Unlike the read family (where even a rigged-in-its-favor RICH arm still plateaued 22 points below baseline), here RICH arm scores *at or above* baseline on this 10-case sample — but n=10 with a ±19-28 point CI half-width is a small enough sample that "at or above baseline" is not a strong claim either way; it is not the basis for any recommendation below. **Arm B needs no such caveat**: its card text is mechanically `indexedDescriptionFor` on each surviving tool's own live description — zero words authored for this eval, same discipline as the read report's D1/D2/D3 arms.

### 2.5 What this pass changed

- **Added** `development/evals/tool-search-parent-tool-delete.eval.ts` — measurement-only, same guarantees as the read eval's own file (nothing registered into the shipping catalog, `tool-catalog-manifest.ts` untouched).
- **Changed nothing else.** `tool-search-heldout-v2.ts`'s stale post-collapse ids (§2.1) and its missing `theme_trash_file` coverage (§2.2) are left as-is, flagged for whoever owns that shared fixture next.

## 3. Confirmation-flow design

### 3.1 Two precedents already in the codebase, and they disagree — verified, not assumed

**Precedent 1 — token-minted-by-human-in-admin-UI, structurally refused for agent tools.** `taxonomy_execute_merge_term` (`Jini/packages/cms/src/taxonomy/agent-tools.ts:195-199`, unwired at `taxonomy/tool-registrations.ts:104`) needs a confirmation token a human mints through `/merge/confirm` in the admin UI. Its `actorClassRule: "confirmer-must-equal-own-delegatedBy"` is on `registration-kit.ts:130`'s `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` set, and `assertToolIsWirable` (`registration-kit.ts:366-385`) throws at build time for any tool declaring that rule: *"requires a human-confirmation transport this host has not wired — leave it unwired until one exists."* `database_execute_migrate_forward` and `backup_execute_restore` sit unwired for the identical reason. **This mechanism is structurally dead in this codebase and cannot be revived by a `content_delete` design** — any resource contributing a handler that needs a second, token-redeeming call would hit the same build-time refusal.

**Precedent 2 — a single held-open call, no token (ADR-055).** `content_post_delete` is the one delete tool that ships a confirmation flow today, and it works differently: ADR-055 (`ADS-memory/reports/architecture/ADR-055-mcp-ui-return-path.md`, **status: DRAFT — not accepted**, flagged below) explicitly supersedes the token approach ("the confirmation token is removed entirely... a blocking single call replaces 'the model must present a secret it cannot read' with 'the handler awaits an out-of-band human signal'"). The mechanism, read directly from `features/post/tool-registrations.ts:407-475` and `features/post/delete-confirmation-ui.ts`:

1. The tool call itself opens a `SurfaceExchange` (`assistant/tool-registrations.ts:661`'s shared `AssistantSurfaceDeps.surfaceExchanges`, one instance wired at boot in `agent-daemon-server.ts` and passed to every surface-raising domain) and sends a `buildConfirmationSurface` (`@jini-ai/ui/mcp-ui/surfaces`) MCP-UI resource describing the row, keyed by `ui://tovu/content-post-delete/{id}/{version}` — versioned so a row edited since the dialog opened yields a different URI (stale dialogs are never silently treated as current).
2. The call **parks** — `askOnce`/`askThenReport` (`apps/website/src/contracts/core/tool-surface-exchanges.ts:204,265`) await the human's click, which arrives out-of-band through `mcp-ui-tool-calls-route.ts`, a route the model has no access to (behind the daemon's bearer gate plus the admin-session check).
3. On `decision === "confirm"` (fail-closed: anything else, including a missing/malformed field, is treated as not-confirmed — `tool-registrations.ts:448-454`), the handler re-checks the entity's version against what the dialog showed (`assertFreshVersion`, :464-475) and only then performs the actual delete.
4. No-answer (expired TTL, abandoned run) returns an explicit result, not a thrown error (ADR-055 Decision 6).

**Recommendation: generalize precedent 2, never precedent 1.** This is not a stylistic preference — precedent 1 cannot be wired for a new resource at all without either changing `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` (a cross-cutting change to `@jini-ai/cms/core`, out of this dispatch's scope and arguably out of any single feature's scope) or declaring a different `actorClassRule` that isn't gated (which would mean building a NEW, unreviewed confirmation transport rather than reusing the one already shipped and battle-tested).

**ADR-055 status flag, load-bearing for this recommendation:** the ADR this whole mechanism rests on is marked `DRAFT — not accepted... Do not add to ADR-INDEX.md until a human accepted it`. It is nonetheless the shipped, live behavior of `content_post_delete` today (verified against the actual handler code, not just the ADR prose), so "generalize what's shipped" is sound engineering advice regardless of the document's own governance status — but a human should accept ADR-055 formally before this design is used to justify wiring the pattern onto 9 more tools, since right now there is no accepted architectural record for the ONE tool already depending on it.

### 3.2 A third, narrower precedent this family itself already applies: exclusion

`workspace_delete` (§1.2) is the delete family's OWN instance of "no confirmation flow is safe enough — leave it unwired," for a reason distinct from the token problem: whole-scope, irreversible, no per-domain undo. Applying that same test to each of the 10 wired tools:

| id | irreversible? | whole-scope? | verdict |
|---|---|---|---|
| `content_post_delete`, `media_trash_asset`, `comments_trash_comment`, `widgets_trash_instance`, `theme_trash_file`, `redirects_tombstone` | No — soft, explicitly reversible (comments/theme have an agent-callable restore; post/media/widgets/redirects are reversible "by reverting the change set" or are UNCONDITIONAL soft flips with no purge tool at all) | No — single row | Confirmation is proportionate; exclusion would be over-caution |
| `webhooks_delete_subscription` | Storage-soft but **no un-disable path exists anywhere in the domain** — classified `deletes-durable-state` specifically because it is "as final as a hard delete" (§1.1) | No — single subscription | Borderline: same finality class as a hard delete, but scoped to one integration, not the whole site. Confirmation, not exclusion — the blast radius doesn't meet `workspace_delete`'s "whole addressable scope" bar |
| `identity_role_delete`, `identity_policy_delete` | **Yes — hard delete, no undo tool** | No — one role/policy row, and both fail safe (refused while still referenced/assigned) | Confirmation, not exclusion: the fail-safe guard already does real work here (an in-use role/policy cannot be deleted at all), which is a materially different safety property than `workspace_delete`'s "always refuses today, but the guard's precondition can change" concern |
| `collections_content_type_tombstone` | **Yes — tears down provisioned queryable-field indexes; no un-tombstone tool exists** (verified: `content-types/agent-tools.ts` has `_deprecate`/`_reactivate` as a pair, but tombstone has no reactivate-from-tombstone counterpart) | No — one content type | **Closest call in the family.** It is a schema-level, irreversible teardown, same class of action as the things this codebase's OTHER precedents (database migrations, backup restores, taxonomy merges) all either exclude or gate behind the dead token mechanism. It is not whole-scope like `workspace_delete`, so exclusion is not clearly required — but it is the one tool in this family a reviewer should look at hardest before deciding confirmation is enough. Flagged as a judgment call for the owner, not resolved here. |

**None of the 10 meets `workspace_delete`'s bar for exclusion** (whole-scope + irreversible + no per-domain undo, together). The recommendation below is confirmation for all 10, with `collections_content_type_tombstone` flagged for explicit owner sign-off given its irreversible schema-teardown side effect.

### 3.3 A concrete, verified maintenance gap this design should close

`resolveDeleteDecision`'s shape — park, wait for `decision === "confirm"` fail-closed, branch, re-check freshness — is **already copy-pasted at least once** rather than shared: `custom-credentials/tool-registrations.ts:262` (`resolveMakeRequestDeleteDecision`) declares itself "mirrors `features/post/tool-registrations.ts`'s own `resolveDeleteDecision` exactly, adapted to this domain's shape," and the same self-description appears in `source-control/tool-registrations.ts:310` and `deployments/publish-agent-tools.ts:1211` (verified by grep; not read line-by-line here, out of the delete family's own scope, but the self-documentation is explicit and consistent across all three). **Adding a confirmation flow to the other 9 delete-family tools by copying `resolveDeleteDecision` a 4th through 9th time is the wrong move** — it is exactly the drifted-duplication risk (one copy gets a bugfix, like the `decision !== "confirm"` fail-closed fix documented in the function's own comment, and the others don't). A shared, resource-agnostic version of this function is the concrete deliverable §4 designs.

## 4. Build plan

For a Programmer to execute without re-deriving anything. Follows `duplicate-resource-registry.ts`'s pattern exactly, per the dispatch's own instruction, because it is the one precedent in this codebase for "one generic tool, N resources, per-resource permission resolved at dispatch time, registered at the composition root."

### 4.1 Card list (retrieval layer — §2's Option A, zero measured retrieval cost)

Register 10 thin descriptors, ids `content_delete.<resource>`, each dispatching into one shared handler — the SAME id scheme `content-read-tool.ts` already ships for `content_read.*`, so there is a live pattern to copy rather than invent:

```
content_delete.content_post           <- content_post_delete
content_delete.media_asset            <- media_trash_asset
content_delete.comment                <- comments_trash_comment
content_delete.widget_instance        <- widgets_trash_instance
content_delete.theme_file             <- theme_trash_file
content_delete.redirect               <- redirects_tombstone
content_delete.collection_content_type <- collections_content_type_tombstone
content_delete.identity_role          <- identity_role_delete
content_delete.identity_policy        <- identity_policy_delete
content_delete.webhook_subscription   <- webhooks_delete_subscription
```

Card text: `indexedDescriptionFor(oldToolId, oldDescription)` for the one surviving member — no merges exist in this family (§2.3), so this is a rename, not a consolidation, at the index layer. No schema change to `@jini-ai/sqlite` needed (Option A from the read report, unchanged reasoning: `tool_id`/`id` stay the same column).

### 4.2 Handler shape

One new registry, `apps/website/src/assistant/delete-resource-registry.ts`, structurally identical to `duplicate-resource-registry.ts`:

```ts
export interface DeleteConfirmationSubject {
  readonly id: string;
  /** Human-readable fields for the dialog — resource-specific, e.g. title/slug/status for a post,
   *  filename for a media asset, name for a role. */
  readonly display: Record<string, string>;
  /** Present only for resources with an optimistic-concurrency version; omitted ones skip the
   *  assertFreshVersion-equivalent re-check (mirrors content_post_delete's own use of `version`). */
  readonly version?: number;
}

export interface DeleteResourceHandler {
  readonly permission: string;             // resolved per-resource, never one flat permission (§4.3)
  readonly noun: string;                   // "post" | "media asset" | "role" | ... — for the dialog copy
  readonly load: (id: string) => Promise<DeleteConfirmationSubject>;   // throws NotFoundError-equivalent
  readonly execute: (id: string) => Promise<Record<string, unknown>>; // the resource's OWN existing
                                                                        // trash/tombstone/delete call —
                                                                        // e.g. post's `deletePost`, media's
                                                                        // trash function — UNCHANGED
}

export interface DeleteResourceHandlerContributor {
  readonly resource: string;               // "content_post", "media_asset", ... — matches §4.1's card keys
  readonly build: (routeDeps: AssistantToolRegistryDeps) => DeleteResourceHandler;
}
```

`registerDeleteResourceHandler`/`listDeleteResourceHandlers`/`resetDeleteResourceHandlersForTests` — same trio, same "last registration wins" semantics, same reasoning (ADR-006/ADR-009 §3) `duplicate-resource-registry.ts` already documents for why this is a plain module rather than a class or DI container.

**The shared confirmation gate itself** — the piece that closes §3.3's gap — lives beside this registry as a resource-agnostic replacement for `resolveDeleteDecision`:

```ts
async function resolveContentDeleteDecision(
  exchange: SurfaceExchange,
  subject: DeleteConfirmationSubject,
  handler: DeleteResourceHandler,
): Promise<{ confirmed: true } | { confirmed: false; result: unknown }>
```

Built from `content_post_delete`'s own logic (§3.1 steps 1-4), generalized only where the resources actually differ: the dialog copy (title/description/details built from `subject.display`/`handler.noun`, mirroring `delete-confirmation-ui.ts`'s `buildDeleteConfirmationResource` but parameterized instead of Posts/Pages-specific), and the freshness re-check (only runs `if (subject.version !== undefined)`, since not every resource in this family carries an optimistic-concurrency version — `media_trash_asset`, `comments_trash_comment`, `widgets_trash_instance`, `theme_trash_file`, `redirects_tombstone` were not verified to have one; a Programmer must check each resource's existing write-service before assuming it does, rather than adding a version field that doesn't exist).

One `content_delete` tool handler, in `assistant/content-delete-tool.ts` (mirroring `assistant/content-read-tool.ts`'s own file), parameterized as `content_delete.<resource>({ id })`: resolves the resource's registered handler, authorizes with `handler.permission`, loads the subject, opens the exchange, calls `resolveContentDeleteDecision`, and on confirmation calls `handler.execute(id)` — never a resource-specific code path inside this file.

### 4.3 Permission resolution per resource — exact map, read from §1.1

| resource key | permission | source |
|---|---|---|
| `content_post` | `content.write` | `features/post/agent-tools.ts:522` |
| `media_asset` | `media.delete` | `Jini/packages/cms/src/media/agent-tools.ts:146` |
| `comment` | `comments.delete` | `features/comments/agent-tools.ts:188` |
| `widget_instance` | `widgets.delete` | `features/widgets/agent-tools.ts:232` |
| `theme_file` | `THEME_WRITE_PERMISSION` | `features/theme/agent-tools.ts:333` |
| `redirect` | `admin.redirects.manage` | `features/redirects/agent-tools.ts:209` |
| `collection_content_type` | `admin.collections.manage` | `Jini/packages/cms/src/content-types/agent-tools.ts:203` |
| `identity_role` | `role.manage` | `Jini/packages/cms/src/identity/agent-tools.ts:273` |
| `identity_policy` | `role.manage` | `Jini/packages/cms/src/identity/agent-tools.ts:319` |
| `webhook_subscription` | `admin.integrations.manage` | `features/webhooks/agent-tools.ts:193` |

Matches `duplicate-resource-registry.ts`'s own stated rule exactly: "the SINGLE permission `content_duplicate`'s own handler checks before invoking `duplicate` — resolved from the resource's OWN existing declared permission... never a single flat permission shared by the whole generic tool." Same here: at least 7 distinct permissions across 10 resources, and `content_delete`'s outer authorization gate must look each one up per call, exactly as `content_duplicate` already does.

### 4.4 Composition root wiring

`registerDeleteResourceHandler(...)` calls for all 10 resources live in `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, glued next to the existing `registerDuplicateResourceHandler` calls — same file, same function, same pattern, per the dispatch's explicit "look at `duplicate-resource-registry.ts`" instruction. **Not touched by this dispatch** (build-clearance boundary); listed here so the Programmer knows exactly where the wiring goes.

### 4.5 What does NOT change

- `content_post_delete`'s own existing id, handler, and dialog (`delete-confirmation-ui.ts`) — a Programmer should decide whether to retire it in favor of `content_delete.content_post` or keep both during a transition; not resolved here, since it affects a shipped, human-facing tool name and is a product decision, not an architecture one.
- Every resource's own underlying delete/trash/tombstone function (`deletePost`, the media trash function, etc.) — `execute` in `DeleteResourceHandler` calls them unchanged.
- No identity/member/user delete tool is registered anywhere in this plan (§1.3 — none exists to wire).

## 5. Recommendation, with the case against

**GO on the retrieval/catalog-shape question (§2). NO real decision to make there** — Arm B is retrieval-identical to baseline, not just close, because the delete family has no `_get`/`_list` pairs to merge. There is no 22-point tradeoff to weigh the way there was for `content_read`; adopting the `content_delete.<resource>` card scheme costs nothing measurable at the retrieval layer.

**GO, conditionally, on building the shared confirmation gate (§3-4) — but recommend sequencing it AHEAD of, not bundled with, the retrieval-layer rename.** The actual prize here is not smaller/better retrieval (§2 proves there isn't one) and not even primarily "one handler instead of ten" (the read report's own conclusion about `content_read` — that the model's view is unchanged in size, so there's no context prize — applies with equal force here). The real prize is **closing a live safety gap**: 9 of 10 wired destructive tools, including 2 hard deletes and 1 irreversible schema teardown, ship today with **no confirmation of any kind** — a single, unconfirmed model call permanently removes data. That is a materially bigger deal than the retrieval question the dispatch was framed around, and it is fixable with a design this codebase already has proof-of-concept for (ADR-055) and a registry pattern already shipped for a structurally identical problem (`duplicate-resource-registry.ts`).

**The case against, stated fairly:**
1. **ADR-055 is still DRAFT, not accepted** (§3.1). Building 9 more tools on an unaccepted architectural decision compounds the exposure if a human reviewer later wants to change the mechanism. Get ADR-055 accepted (or revised) before or alongside this work, not after.
2. **`collections_content_type_tombstone`'s irreversible index teardown (§3.2) deserves explicit owner sign-off**, not a default "confirmation dialog is enough" — it is the one tool in this family whose blast radius rhymes with the things this codebase otherwise excludes entirely.
3. **This is real new code**, not a config change: a new registry, a new generic handler, a resource-agnostic confirmation-decision function, and 10 call sites wiring resources into it. It is bounded and has a direct precedent to copy, but it is not free, and the retrieval eval alone (§2) does not justify it — the safety argument does.
4. **A narrower, cheaper alternative exists**: extract `resolveDeleteDecision` into a shared, resource-agnostic function (closing §3.3's duplication) WITHOUT building the full `content_delete.<resource>` catalog/registry layer, and wire it into each of the 9 unconfirmed tools' EXISTING tool ids one at a time. This gets the safety win with less new surface, at the cost of leaving the 10-tools-under-10-names status quo (which §2 shows is retrieval-neutral anyway, so there is little cost to leaving it). **If the owner's priority is closing the confirmation gap fast, this narrower path is the recommended one**; the full `content_delete` registry in §4 is the right shape if the owner also wants the `content_read`-style catalog uniformity for its own sake.

**Bottom line:** retrieval says GO with zero cost either way; the decision that actually matters is whether to build the shared confirmation gate now, and if so, whether to bundle it with the catalog rename (§4's full plan) or ship it narrower (point 4 above) first. Both are legitimate; this report recommends the narrower path first specifically because it captures the entire safety prize without waiting on ADR-055 acceptance or the `collections_content_type_tombstone` sign-off blocking the catalog-rename half.

## 6. What could not be verified

- Whether `media_trash_asset`, `comments_trash_comment`, `widgets_trash_instance`, `theme_trash_file`, or `redirects_tombstone`'s underlying write-services carry an optimistic-concurrency `version` field the way `PostRecord` does — needed to know whether `assertFreshVersion`'s pattern applies to them (§4.2). Not checked here; flagged for the Programmer.
- Whether any of the 4 `resolveDeleteDecision` copies (§3.3) have drifted from each other in behavior beyond what their own comments disclose — confirmed only that all three declare themselves faithful copies; did not diff them line-by-line.
- Live-model selection-cost of a `content_delete` parent tool (the August 24 finding the read report cited: the agent sometimes ignores a correctly-ranked tool in favor of one it already has in mind) — same caveat the read report gave, needs a live model run, not a free eval.

---

**Status: COMPLETE.** All five requested deliverables (inventory, eval, confirmation-flow design, build plan, recommendation) are above.
