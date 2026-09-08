# `content_delete` parent-tool eval + design — IN PROGRESS

Date: 2026-09-08
Dispatched by: Coordinator (team-lead), measurement + design only, no build.
Persona: Software Architect (`AI-Dev-Shop/agents/software-architect/skills.md` v2.3.0, loaded).
Methodology mirrors `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md` (the read-family eval) exactly, per dispatch instruction.

**Status: inventory + eval in progress. This file is being written incrementally per dispatch rules.**

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

## 3. Confirmation-flow design — PENDING

## 4. Build plan — PENDING

## 5. Recommendation — PENDING
