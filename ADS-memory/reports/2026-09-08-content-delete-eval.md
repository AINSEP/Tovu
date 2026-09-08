# `content_delete` parent-tool eval + design

Date: 2026-09-08
Dispatched by: Coordinator (team-lead), measurement + design only. Build was later gated to "finish the eval first, then message before touching any shared file" — **no shared file has been touched.** This report is that message.
Persona: Software Architect (`AI-Dev-Shop/agents/software-architect/skills.md` v2.3.0, loaded).
Methodology mirrors `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md` (the read-family eval) exactly, per dispatch instruction. `tool-search-parent-tool-read.eval.ts` was **read, never edited** — it is held by another agent.

**Status: COMPLETE, revision 2.** Revision 1 was corrected on three points by the coordinator and a peer before being accepted as final: the family count (11 → 13, independently re-verified here → 8 real candidates after explicit scope calls), the eval's RICH arm (was self-graded on query-visible vocabulary, replaced with two fully blind arms), and a `content_read`-collapse scoring exposure (fixed here; the read eval's own equivalent fix is the model). The confirmation-flow design is a **proposal**, not a decision — build is not started.

---

## Flagged for Leona: newsletter subscriber lists have no un-archive path — a product bug, not a tool-design finding

Found in passing while enumerating the delete family (§1.1) and deliberately kept separate here so it survives being read for something other than tool design.

`newsletter_archive_list` (`features/newsletter/agent-tools.ts:261-262`) archives a subscriber list. **No tool, route, or write-service function anywhere in `features/newsletter/` un-archives one.** The domain's list-lifecycle surface is exactly `newsletter_create_list` / `newsletter_archive_list` — nothing else touches a list's archived state. This means archiving a list is a one-way door **today, at the product level, independent of whether an agent is ever allowed to call it**: a human using the admin UI directly has the identical no-way-back problem. Confirmed by the same full-name listing used to build §1.1's table; not something this pass found only by looking for tool-design gaps.

This report's own scope call (§1.2) is to keep `newsletter_archive_list` OUT of the `content_delete` family regardless of this finding — a fifth verb on an already-ambiguous family is retrieval noise the eval doesn't need, and excluding a tool from an agent's reach is orthogonal to whether the underlying product capability is missing for humans too. The two questions are independent: this one is for Leona to route to whoever owns the newsletter feature, not something a tool-family design should absorb or fix.

---

## 0. Pre-flight

- Read `AI-Dev-Shop/agents/software-architect/skills.md` (persona bootstrap) — confirmed in first reply.
- Read the three Eval Work mandatory pre-reads (`bug-taxonomy.md`, `eval-design-playbook.md`, `harness-engineering/agent-evals/README.md`) per `AI-Dev-Shop/CLAUDE.md`. Those three govern *seeded bug-injection* evals (code-review style); this task is a *retrieval* eval in the shape of `tool-search-parent-tool-read.eval.ts`, a different family living in `development/evals/`. Read as instructed; the methodology actually mirrored is the read report's.
- Repair scope, per explicit correction: **only this file's own contributor installation was fixed** (`installFirstPartyToolContributors()` call), the same narrow fix the read eval made to itself. The other 19 of 21 dead evals in `development/evals/` are not touched — `tovu-eval-harness` owns that.
- `uptime` at last eval run: `load averages: 11.18 29.50 39.89` on 8 cores — elevated throughout this dispatch. The harness is deterministic in-memory SQLite FTS5 scoring with no timing-sensitive assertion (confirmed again on this run), so load does not affect the numbers.
- No shared file touched: `tool-catalog-manifest.ts`, the tool registry, `assistant/tool-registrations.ts`, `assistant/content-read-tool.ts`, `assistant/tool-search-keywords.ts`, `apps/admin/src/lib/agent-pages.ts`, and `development/evals/tool-search-parent-tool-read.eval.ts` are all held by `tovu-content-read-2` or are otherwise off-limits, and none is edited by this report or `development/evals/tool-search-parent-tool-delete.eval.ts`.

## 1. Verified inventory

Enumerated by mechanical grep, run twice at increasing breadth (`delete|trash|tombstone|destroy|purge|remove|revoke|disable|deactivate` first, then widened to `archive|wipe|cancel|expire|detach|unassign|clear|deprovision|terminate|decommission|erase|discard|reject|decline|unpublish|unlink|evict|prune`) across every `agent-tools.ts` in `apps/website/src/features/*` and `/Users/la/Programming/Jini/packages/cms/src/*` (media, identity, workspace, content-types, and entries live in `@jini-ai/cms`, re-exported by a Tovu shim — same pattern the read report documents). Independently re-derived per the coordinator's instruction that the family count "has now been wrong once (11 → 13), so yours is the authority."

### 1.1 Full verb sweep — every candidate found, before scope calls

| id | verb | reversible? | notes |
|---|---|---|---|
| `content_post_delete` | delete | Soft, restorable by reverting the change set | ships a confirmation flow (ADR-055) |
| `media_trash_asset` | trash | Soft, "first step of the deletion ladder"; no purge tool exists | |
| `comments_trash_comment` | trash | Soft, `comments_restore_comment` exists | |
| `widgets_trash_instance` | trash | Soft, unconditional (never blocked by references); no purge tool exists | |
| `theme_trash_file` | trash | Soft, `theme_restore_trashed_file` exists | |
| `redirects_tombstone` | tombstone | Soft ("disables"), idempotent | |
| `collections_content_type_tombstone` | tombstone | **No un-tombstone tool** — tears down provisioned indexes | |
| `identity_role_delete` | delete | Hard, no undo, fail-safe (refused while assigned) | |
| `identity_policy_delete` | delete | Hard, no undo, fail-safe (refused while referenced/attached) | |
| `webhooks_delete_subscription` | delete | Soft at storage, **no un-disable path anywhere in the domain** — self-classified `deletes-durable-state` because "as final as a hard delete" | |
| `workspace_delete` | delete | N/A — **not wired**, see §1.3 | |
| `widgets_remove_embed` | remove | Removes a placement *reference*; the widget instance itself is untouched | not a resource delete — different verb-shape |
| `newsletter_remove_subscription` | remove | Reversible via `newsletter_create_subscription` | unsubscribe, not a resource delete |
| `identity_user_disable` | disable | Reversible, `identity_user_enable` exists | account toggle, not a delete |
| `members_disable` | disable | Reversible in principle, but **no `members_enable` tool exists anywhere** in `features/members/agent-tools.ts` | account toggle; the asymmetry is a real finding but not a delete-family one |
| `newsletter_archive_list` | archive | **No un-archive/reactivate tool exists anywhere in `features/newsletter/agent-tools.ts`** (only `newsletter_create_list`/`newsletter_archive_list` in the list-lifecycle group) | **new discovery, a fifth verb — `archive`.** Structurally the same shape as `webhooks_delete_subscription`: soft at storage, terminal in practice. Not in the coordinator's 13-item list. **Decided OUT** (§1.2) — the missing inverse is flagged separately, as its own product-bug finding, not as a reason to fold it into this family (see "Flagged for Leona" below). |
| `newsletter_cancel_campaign` | cancel | The campaign row persists in a `cancelled` status; nothing is removed | pipeline safety stop, not a resource delete |
| `collections_entry_unpublish` | unpublish | `collections_entry_publish` is its exact undo — file's own comment: "publishing and unpublishing are each other's own undo" | not a delete |
| `settings_clear` | clear | N/A — declared but **never wired** (`settings/tool-registrations.ts:180`, `EXCLUDED BY DESIGN`) | not part of any live family |
| `plugins_uninstall` | uninstall | **Hard, explicitly "NOT reversible... no revision history or trash to restore it from"** | verb doesn't match the sweep pattern (no delete/trash/tombstone/remove token), so not a family member by this report's own criterion — but load-bearing for §3 as a cited anti-pattern. Its own description: *"Confirm with the human before calling this; it does not raise its own confirmation dialog."* Wording-only guard, no mechanism. |

This reconciles against the coordinator's given 13: `content_post_delete`, `comments_trash_comment`, `identity_policy_delete`, `identity_role_delete`, `media_trash_asset`, `newsletter_remove_subscription`, `redirects_tombstone`, `theme_trash_file`, `webhooks_delete_subscription`, `widgets_remove_embed`, `widgets_trash_instance`, `workspace_delete`, plus `collections_content_type_tombstone` — all 13 are in the table above. Independent sweep found the same 13 **plus one likely fifth-verb candidate** (`newsletter_archive_list`) not on that list, and confirmed no additional verb beyond those already covered.

### 1.2 Scope calls — explicit, with reasons, per instruction not to settle these silently

| id | in/out | reason |
|---|---|---|
| `content_post_delete` | **IN** | already ships a confirmation flow; the reference implementation |
| `media_trash_asset` | **IN** | soft delete, single-row scope, no confirmation today |
| `comments_trash_comment` | **IN** | soft delete, reversible via restore, no confirmation today |
| `widgets_trash_instance` | **IN** | soft delete, single-row scope, no confirmation today |
| `theme_trash_file` | **IN** | soft delete, reversible via restore, no confirmation today |
| `redirects_tombstone` | **IN** | soft delete, single-row scope, no confirmation today |
| `collections_content_type_tombstone` | **IN, flagged** | irreversible schema-level index teardown, no undo tool — the closest call in the family (§3.4); still single-resource scope, not whole-tenant, so exclusion is not clearly required, but this one deserves explicit sign-off before ship, not a default yes |
| `webhooks_delete_subscription` | **IN** | soft at storage but no un-disable path; single-integration scope, not whole-tenant |
| `identity_role_delete` | **OUT — per Leona** | identity stays narrow; a product decision, not an architecture judgment call. Not designed into `content_delete` at all. |
| `identity_policy_delete` | **OUT — per Leona** | same reason as above |
| `workspace_delete` | **OUT — recommended** | deletes an entire tenant: whole-scope, irreversible, no per-domain undo. Already unwired today (§1.3) — the recommendation is to leave it that way, not a change from the status quo. |
| `widgets_remove_embed` | **OUT** | removes a placement reference inside a document; the referenced widget instance is untouched. This is an edit operation on a document body, not a delete of a resource — a different verb-shape entirely, not merely a softer case of the same one. |
| `newsletter_remove_subscription` | **OUT** | reversible unsubscribe on a subscription record; the subscriber and subscription rows both persist. Not a resource deletion. |
| `newsletter_archive_list` | **OUT — decided, per the coordinator** | genuine discovery (§1.1), same finality shape as `webhooks_delete_subscription` — but excluded: no un-archive/reactivate tool exists anywhere in the domain, so it is irreversible in practice regardless of what the word "archive" implies, and a fifth verb on an already-ambiguous family adds retrieval noise for one member's sake. The missing inverse is a real finding, but it is a product bug independent of this family's tool design — flagged on its own, below, not folded in here. |

**Final candidate family for `content_delete`: 8 tools** — `content_post_delete`, `media_trash_asset`, `comments_trash_comment`, `widgets_trash_instance`, `theme_trash_file`, `redirects_tombstone`, `collections_content_type_tombstone`, `webhooks_delete_subscription`. This is the family the eval (§2) and build plan (§4) below are built against.

### 1.3 Deliberately unwired — 1 tool, and a correction to how it is actually enforced

**Correction, replacing an inaccurate citation in revision 2.** That revision described `workspace_delete`'s exclusion as enforced by a hand-maintained "`UNWIRED_WORKSPACE_TOOL_IDS` set" at `workspace/tool-registrations.ts:64-73`, framed as if that Set were itself the safety gate. Two things were wrong with that framing, corrected here:

1. **The path was ambiguous and easy to misread as living under `apps/website/src/features`, where it does not exist** — a control grep for `workspace_delete`/`UNWIRED_WORKSPACE_TOOL_IDS` under `apps/website/src/features` correctly returns zero hits. The real file is `/Users/la/Programming/Jini/packages/cms/src/workspace/tool-registrations.ts` (the `@jini-ai/cms` package, symlinked via `node_modules`, not copied into `apps/website/src/features`). Re-verified directly: the file and the Set both exist exactly as first cited, at that path.
2. **`UNWIRED_WORKSPACE_TOOL_IDS` is real code, but it is not the enforcement mechanism** — it is a **domain-local completeness list**, passed as `unwiredToolIds` into `buildDomainRegistrations` (`Jini/packages/cms/src/core/tools/registration-kit.ts:427-441`) purely so that function's own drift check does not throw "catalog entry neither wired nor declared unwired" for `workspace_create`/`workspace_delete`. `buildDomainRegistrations` only ever calls a handler — and only ever calls `assertToolIsWirable` — for ids present in the `handlers` record it is given; `workspace_create`/`workspace_delete` simply have no handler defined in `buildWorkspaceRegistrations`, so neither ever reaches that per-domain check at all.

**The actual, tested, fail-closed mechanism is risk-classification absence.** `workspaceDerivedRisk` (`workspace/tool-registrations.ts:53-61`) declares exactly 2 entries — `workspace_get`, `workspace_update` — and does not mention `workspace_create`/`workspace_delete`. `assertToolIsWirable` (`Jini/packages/cms/src/core/tools/registration-kit.ts:366-385`) is the single function that would refuse either tool if a handler for it were ever added without a matching risk entry: `params.derivedRisk.get(toolId)` absent throws `"has no entry in DERIVED_RISK_BY_TOOL_ID — classify what its handler actually does before wiring it (unknown operations are refused, never assumed safe)"` (line 372-375). At the assistant-wide layer this is wrapped, not reimplemented, as `assertRiskMetadataIsWirable` (`apps/website/src/assistant/tool-registrations.ts:604-619`): *"same gate, consulting every domain's classification at once instead of one domain's... exported because the contract tests assert this layer's refusals directly."* Those tests are real and specific: `apps/website/src/assistant/__tests__/tool-registrations.workspace.test.ts` asserts `workspace_create is never registered — refused for lack of a DERIVED_RISK_BY_TOOL_ID classification` and the identical test for `workspace_delete` (lines ~96-106 of that file), each calling `assertRiskMetadataIsWirable` directly and asserting it throws `/has no entry in DERIVED_RISK_BY_TOOL_ID/`.

So: `assertToolIsWirable` is the one real function underneath both this check and the confirmation-transport check in §3.1 — `assertRiskMetadataIsWirable` is its assistant-wide wrapper, and it is the wrapper the regression tests exercise. Both names are accurate at their own layer; the tested guard a Programmer should cite going forward is `assertRiskMetadataIsWirable`.

**This is a second, and now more precisely understood, precedent for deliberate exclusion**, alongside `taxonomy_execute_merge_term` (§3.1) — and a materially better one for a build plan to rest on than a hand-maintained list, since it fails closed structurally rather than by someone remembering to update a Set. None of the 8 in-scope tools (§1.2) meets `workspace_delete`'s own exclusion reason (whole-scope, irreversible, no per-domain undo), so this remains context, not a blocker, for `content_delete` — but §4.2 now states the concrete build-time requirement this mechanism imposes on any new resource added to the family.

### 1.4 No user/member/identity-entity delete tool exists to accidentally wire

Confirmed by grep across `identity/agent-tools.ts`, `members/agent-tools.ts`, and the whole `apps/website/src/features` tree for `user_delete`/`deleteUser`/`identity_user_delete` — zero hits beyond an unrelated SQLite settings-repo helper (`deleteUserValue`, a per-setting cleanup call, not an entity delete). Identity/user/member/role/token deletion is out of scope per instruction, and there is nothing of that shape in the candidate family to begin with — `identity_role_delete`/`identity_policy_delete` operate on RBAC objects (roles, policies), not user accounts, and both are excluded anyway (§1.2, per Leona).

## 2. Retrieval eval

Eval: `development/evals/tool-search-parent-tool-delete.eval.ts` — measurement-only, rewritten this revision to be fully blind (see §2.4). Run: `npx tsx development/evals/tool-search-parent-tool-delete.eval.ts`.

### 2.1 Pre-check: harness installs the first-party contributors, and catalog size is *observed*, not assumed

`installFirstPartyToolContributors()` is called in the eval; the observed catalog size at this run is **170** wired tools — stated as observed, per instruction not to hardcode either 170 or 177 as a fact, since the catalog grows daily. 170 reflects the `content_read` collapse (36 Tier-1 read tools → 29 cards) already shipped by default in `tool-registrations.ts:703-710`. All 8 in-scope delete-family ids resolve in this catalog.

### 2.2 `content_read`-collapse scoring exposure — checked and fixed

Per the coordinator's warning: `tool-search-heldout-v2.ts`'s ground truth predates the `content_read` collapse, so ~38 of 130 cases name a now-retired Tier-1 read id. This eval redirects any such id to its shipped `content_read.<resource>` card before scoring (`redirectReadCollapse`, using the same blind `resourceKeyOf` rule `tool-search-parent-tool-read.eval.ts` documents — copied as a small inline function since that file is not to be imported from or edited, not re-derived independently). After the fix: **`unresolvable case ids AFTER read-collapse redirection: 0`**, and the corrected whole-set baseline is **87% top-10** — matching the accepted read-report figure, confirming the fix is consistent with the accepted number rather than a new, unverified one. Before the fix (revision 1 of this eval, run before this correction), the same baseline read as 66% top-10, entirely due to this unrelated cause — the earlier report's absolute whole-set numbers are superseded by this revision; the restricted-to-affected-cases comparisons were not affected, since none of the 38 stale ids belong to the delete family.

### 2.3 Held-out coverage of the (now 8-tool) family

8 cases in the held-out set touch the family (one per tool, all direct `expect` matches); **`theme_trash_file` has zero coverage** — no case names it in `expect` or `alsoAcceptable`. Included in every arm below regardless (excluding it would understate the collapse's footprint); flagged as an open gap in the shared fixture, not fixed here.

### 2.4 Blindness — corrected from revision 1

Revision 1's "RICH" arm was authored with the (then 10) affected queries in context and had to be discounted as self-graded, mirroring a mistake the read eval's own first pass made and disclosed. Per instruction, that arm is **removed, not merely re-caveated**. Four arms are measured, all mechanically derived with zero query-authored vocabulary:

- **A-thin** — a short, generic description, written without reference to any held-out query (same discipline as the read eval's own THIN arm, which was never in dispute).
- **A-concat** — every surviving member tool's own live `indexedDescriptionFor` text, concatenated into ONE document. No word authored for this eval; same "no authored vocabulary" discipline the read eval's D1/D2/D3 per-resource cards use, applied here to a single fat document instead of many.
- **B** — 8 resource-keyed thin cards, one shared handler (Option A from the read report). Card text is `indexedDescriptionFor` per surviving member — construction method identical to A-concat, just not merged into one document. Scored **strictly**: a hit requires the query's OWN resource's card to rank, not merely any `content_delete.*` card.
- **B-LENIENT** — the same 8 cards, scored **leniently**: any `content_delete.*` card ranking counts, regardless of whether it names the query's actual resource. Added this revision specifically to quantify the strict/lenient scoring asymmetry (§2.6), mirroring the read eval's own `D1-LENIENT` control.

### 2.5 Results, n=130 held-out, restricted to the 8 cases whose ground truth touches the family

| configuration | top-1 | top-5 | top-10 | top-20 |
|---|---|---|---|---|
| **BASELINE (real catalog, 170 tools observed, shipped)** | 2/8 25% ±30 | 5/8 63% ±34 | 6/8 **75%** ±30 | 6/8 75% ±30 |
| A-thin — one fat card, generic desc | 1/8 13% ±23 | 1/8 13% ±23 | 1/8 **13%** ±23 | 4/8 50% ±35 |
| A-concat — one fat card, real text concatenated (blind) | 1/8 13% ±23 | 8/8 100% ±0 | 8/8 **100%** ±0 | 8/8 100% ±0 |
| B — 8 resource-keyed cards (strict) | 2/8 25% ±30 | 5/8 63% ±34 | 6/8 **75%** ±30 | 6/8 75% ±30 |
| B-LENIENT — any card counts | 5/8 63% ±34 | 8/8 100% ±0 | 8/8 **100%** ±0 | 8/8 100% ±0 |

Whole-set (n=130): BASELINE 55/85/87/95, A-thin 55/81/83/95, A-concat 54/87/88/97, B 55/85/87/95, B-LENIENT 57/87/88/96 (top-1/5/10/20, all ±3-9 points). Full paired McNemar tests are in the eval's own stdout. **Small-sample caveat, stated plainly and held to throughout this section**: n=8 with ±23-35 point confidence-interval half-widths is not enough to call any single-case delta a real effect — every number below is evidence, not a ruling, exactly as instructed.

### 2.6 What survives after the read eval's own retraction — and what does not

The read eval's original NO-GO and its top-5 mechanism claim have been **formally retracted by their own author**, and this report's earlier text (revision before this one) cited the now-retracted claim as if settled — corrected here. The retraction, read directly from `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md`'s "Addendum 2": their original arm comparing one fat entry against 29 cards varied TWO things at once — document count AND text provenance (a hand-authored, query-visible description vs. the tools' real shipped text) — and wrongly attributed the whole gap to document count. Their control arm (**C2**: one fat entry, but built from the SAME real, mechanically-concatenated text as the card design) overturned it: *"With the same real text, one fat entry scores 97% top-10 and 100% top-20 on the affected cases — better than baseline, not 26 points worse."* Explicitly retracted alongside it: the top-5 mechanism claim this report's own prior revision repeated ("`_get`/`_list` cards no longer competing" as the source of a top-5 gain) — their own words: *"C2 gets the same +12 (76% → 88%) with no merging at all, so the gain comes from removing near-duplicate documents from the index, not from merging pairs."* **That sentence in the prior revision of this report is retracted along with theirs; it should not be treated as an established mechanism.**

Their report's own "Reconciliation with the peer's `content_delete` result" section addresses this eval directly: *"C2 collapses 36 tools and reaches 97% top-10, essentially matching the delete eval's 100% at n=8... Collapse-set size is not the variable. The two results agree; both say a mechanically-concatenated fat entry retrieves fine."* No further reconciliation is needed — the two independent measurements (their C2 on 36 tools, A-concat here on 8) agree, and neither NO-GO nor an unqualified GO for either family is the honest reading.

**What their retraction narrows their own finding to, and what this eval's data says about the same question, on this family:**

1. **Top-1 is the cutoff where a granularity signal survives, on both datasets.** Their restricted view: C2 38% vs. cards' 65% (baseline's own top-1 too) — not significant (p=0.48), but directionally consistent on their whole-set view too (52% vs. 55-57%). This eval's restricted view shows the same direction: **A-concat 13% vs. baseline's 25%** — a 12-point gap on 8 cases (literally one case), even noisier than their n=34/130 signal and equally not any kind of proof, but pointing the same way. **Every arm's whole-set top-1 (54-57% across BASELINE/A-thin/A-concat/B/B-LENIENT) is flat — the signal is only visible on the restricted view**, same as theirs.
2. **The "always present, rarely first" signature they describe is visible in this data too.** A-concat's own spread: 13% top-1 → 100% top-5/10/20, a 87-point spread on the restricted view (theirs: 38% → 97%, a 59-point spread) — a single document occupying one rank slot, present by top-5 but not reliably first. Given the 2026-08-24 selection finding both reports cite (the agent forms a plan early and takes a matching result rather than reading down the list), this matters more in practice than the p-value: rank #1 is worth more than rank #5 for an agent that behaves that way.
3. **The strict/lenient scoring asymmetry, quantified on this family's own data, not assumed from theirs.** B-LENIENT (any of the 8 cards counts) vs. strict B: **top-10 75% → 100%, a 25-point gap; top-1 25% → 63%, a 38-point gap** — larger than their measured 15-point gap at top-10, though on a far noisier n=8. **A-concat's 100% (§2.5) is an upper bound in the identical sense theirs is**: it is scored a hit whenever the single `content_delete` entry ranks, with no requirement that the model would go on to fill the `resource` argument correctly — a cost this eval, like theirs, defers entirely to argument-filling and does not measure. Stated plainly, as required: **the 100% for A-concat should not stand unqualified; it is a retrieval-only ceiling, not a measurement of correct end-to-end tool use.**
4. **A finding this eval adds that theirs did not isolate: B-LENIENT vs. A-concat, holding "does it have to be the right one" constant, still shows a real top-1 gap in cards' favor — 63% vs. 13%, a 50-point spread with BOTH arms scored under the same lenient rule.** This is a cleaner comparison than card-strict-vs-fat-lenient (which conflates "granularity" with "must be correct"): both arms here are equally forgiving about correctness, and the cards still win at top-1 by a wide margin. The reason is visible in the construction, not merely inferred: B-LENIENT has 8 independent, short, term-dense documents, each with its own real chance at rank #1 for a matching query; A-concat has exactly one document that must out-rank everything else in a 170-tool catalog by itself. This is the "one document, one slot" mechanism their report also names, isolated here from the scoring-leniency confound that complicates every strict-vs-lenient comparison across the two designs.
5. **A-thin (no real vocabulary) still collapses hard at every cutoff** — 75%→13% top-10, 63%→13% top-5 — confirming, as before, that the finding is about keeping real vocabulary, not about fat entries being free of cost regardless of content.

### 2.7 What this pass changed

- **Rewrote** `development/evals/tool-search-parent-tool-delete.eval.ts` — measurement-only, same shipping guarantees as before (nothing registered into the real catalog).
- Fixed this file's own `content_read`-collapse scoring exposure (§2.2).
- **Added the `B-LENIENT` arm** this revision, to quantify the strict/lenient scoring asymmetry on this family's own data (§2.6) rather than only citing the read eval's.
- No shipping prompt or tool description anywhere in this report or the build plan carries a measured percentage — retrieval numbers stay in this report and the eval; any proposed card text (§4) points at neither number.

## 3. Confirmation-flow design — a PROPOSAL for Leona, not a decision

Per instruction: this section proposes; it does not settle, and nothing here is built.

### 3.1 The `taxonomy_execute_merge_term` precedent, re-verified against the exact cited files — the reason matters more than the fact

Re-checked directly, not assumed from the first pass:

- `apps/website/src/features/taxonomy/tool-registrations.ts:6-7` (file header): *"`taxonomy_execute_merge_term` is declared unwired — see `agent-tools.ts`'s own header for the full `mergeTerm` safety analysis (destructive, agent-cannot-confirm by the gateway's own actor-class rule, no confirmation transport exists anyway)."*
- Tripwire at line 104 (the id sits in an unwired-ids list, not the handler map); `sideEffects`-derivation comment at line 110 asserts it "appears NOWHERE" in the wiring.
- `ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md` §9, "CONFIRMED DELIBERATE": *"Declared unwired... own header: destructive, fails the gateway's actor-class rule for agent-initiated destructive ops, no confirmation transport exists for it. `taxonomy_plan_merge_term` (the safe preview half) IS wired."*

Both sources agree on the reasoning, and the coordinator's framing is the correct read of it: **the operation was withheld because no confirmation transport existed for it, not because destructive operations are forbidden in principle.** The mechanical gate is `registration-kit.ts:130`'s `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT = Set(["confirmer-must-equal-own-delegatedBy"])`, enforced by `assertToolIsWirable` (`registration-kit.ts:366-385`, the same underlying function §1.3 corrects the risk-classification citation against — this function performs BOTH checks, risk-absence and confirmation-transport, in one pass), which throws at build time for any tool declaring that rule with the message *"requires a human-confirmation transport this host has not wired — leave it unwired until one exists."*

**The premise has changed since that ruling was written.** A confirmation transport now exists and ships in production: ADR-055's held-open MCP-UI exchange (§3.2). `taxonomy_execute_merge_term` itself still could not simply be flipped on — it is built around a *different* mechanism (a human-minted token via `/merge/confirm`, redeemed by a second tool call under the `confirmer-must-equal-own-delegatedBy` rule), and that specific mechanism is still the one `assertToolIsWirable` refuses. But the *reason* the ruling gives — "no transport exists" — is no longer true of this codebase in general, only of that one tool's own chosen mechanism. This is the load-bearing distinction the design below rests on: it does not attempt to revive the token mechanism; it generalizes the mechanism that already works.

### 3.1a Every deliberately-unwired family, enumerated — does the argument survive, or does it need to?

Per instruction: enumerate every family `tool-search-keywords.ts` marks deliberately-UNWIRED (annotations at lines 96, 111, 193, 235, 280, 294-297, 305), verified against each one's own source, and say what each was excluded for. Four distinct reason-classes, not one:

**Class A — token-gated, `confirmer-must-equal-own-delegatedBy`, no transport (directly adjacent to this proposal).** Verified by grepping the literal `actorClassRule: "confirmer-must-equal-own-delegatedBy"` declaration across the whole codebase — **exactly 4 tools carry it**, not the 2-3 either this report's first pass or the coordinator's peer estimated: `taxonomy_execute_merge_term` (`taxonomy/agent-tools.ts:202`), `collections_execute_cleanup` (`content-types/agent-tools.ts:147` — its sibling `collections_plan_cleanup` is ALSO unwired, unlike `taxonomy_plan_merge_term`/`database_plan_migrate_forward`, which are wired safe-preview halves; this divergence is a real content-types-specific choice, not resolved here), `database_execute_migrate_forward` (`apps/website/src/features/database/agent-tools.ts:189`), and `backup_execute_restore` (`apps/website/src/features/recovery/agent-tools.ts:142`). **The canonical invariant comment itself is stale**: `registration-kit.ts:118-127`'s own doc on `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` says *"today none is — `collections_execute_cleanup`, `database_execute_migrate_forward`, and `backup_execute_restore` all carry it and all three are declared unwired"* — enumerating only 3, omitting `taxonomy_execute_merge_term`, which does carry the identical literal declaration. A live instance of the "verify comment claims" discipline this report otherwise applies to others' text: even the source-of-truth comment drifted once a fourth tool adopted the rule it describes.

**Class A, positive case — the migration this proposal recommends has already shipped once.** `deployment_execute_static_publish` (`features/deployments/publish-agent-tools.ts:27-55`) **used to carry this exact `actorClassRule` and was unwired for the identical reason** — its own header: *"This used to be declared with `actorClassRule: 'confirmer-must-equal-own-delegatedBy'` and deliberately left unwired... What changed is that this domain does NOT need that transport at all: `content_post_delete` already proved a working confirmation gate exists that needs no `ExecutionDelegate` — the MCP-UI held-open surface exchange (ADR-055 Decisions 1/2)... So this tool deliberately carries NO `actorClassRule`."* This is not a hypothetical migration path this report is proposing for the first time — it is a **third live example**, alongside `content_post_delete` and `external_mcp_save` (§3.2), of a tool moving from Class A's dead mechanism to ADR-055's working one, for a genuinely irreversible, publicly-visible operation. It also names a build step this report's own plan needs: publishing through the held-open exchange requires the tool id be added to `mcp-ui-tool-calls.ts`'s `MCP_UI_REDEEMABLE_TOOL_IDS` allowlist (§4.2).

**Class B — bulk-write blast radius, not a transport problem.** `redirects_import` (up to 500 rows in one call) is unwired "never agent-callable, bulk write" — a different dimension entirely: even with a confirmation transport, one click approving 500 rows is a bad safety shape. Orthogonal to this proposal — none of the 8 in-scope delete-family tools (§1.2) operate on more than one row per call.

**Class C — whole-scope / single-addressable-row structural risk.** `workspace_create`/`workspace_delete` (§1.3) — already covered, already excluded from this family's scope (§1.2).

**Class D — generic/bulk/schema-level settings access.** `settings_set`, `settings_clear`, `settings_reset`, `settings_register_definitions` — unwired because they are generic key-value or schema-level levers too broadly scoped for one permission check to meaningfully gate, not because of a missing confirmation mechanism. Also orthogonal — no settings tool is in the delete family.

**Does the central argument survive?** Yes, and it is stronger for having enumerated all of it. Every family withheld for want of a confirmation transport (Class A, 4 tools) is either directly analogous to this proposal or — in `deployment_execute_static_publish`'s case — literal proof the proposed migration works in production today. Every OTHER exclusion (Classes B, C, D) is withheld for a reason that does not apply to any of the 8 in-scope tools: none is a bulk operation, none is whole-tenant-scope, none is a generic settings lever. **Nothing in this codebase was withheld "on principle" in the sense of "destructive operations must never be agent-callable"** — `content_post_delete`, `external_mcp_save`, and `deployment_execute_static_publish` are all genuinely destructive or irreversible and all three are wired, once the right mechanism existed.

### 3.2 The held-open MCP-UI surface family — verified as already multi-domain, not a one-off

Re-derived per instruction to find and design from the real precedent, not invent around it. There is ONE shared transport and (at least) two shipped surface flavors built on it:

**Shared transport** (`apps/website/src/contracts/core/tool-surface-exchanges.ts`): `SurfaceExchangeStore`, one instance wired at boot (`agent-daemon-server.ts`) and passed to every surface-raising domain via `AssistantSurfaceDeps`. `askOnce` (line 204) parks a call until a human answers out-of-band, through `mcp-ui-tool-calls-route.ts` — a route the model cannot reach. `askThenReport` (line 265) is the richer variant: it keeps the exchange open a second time so the handler can report the real *outcome* (not just "your click arrived") back to the same `ui://` surface, fixing a documented defect where a confirming click resolved before the handler had done anything.

**Surface flavor 1 — confirm/cancel dialog** (`@jini-ai/ui/mcp-ui/surfaces`' `buildConfirmationSurface`), used by `content_post_delete` (`features/post/delete-confirmation-ui.ts`, `features/post/tool-registrations.ts:407-475`): opens a `SurfaceExchange`, sends a dialog describing the row (keyed `ui://tovu/content-post-delete/{id}/{version}` — versioned so a row edited mid-dialog invalidates it), parks, and on `decision === "confirm"` (fail-closed — anything else, including a missing/malformed field, is not-confirmed) re-checks the entity's version and only then deletes. No-answer (TTL expiry, abandoned run) returns an explicit result, never a thrown error (ADR-055 Decision 6).

**Surface flavor 2 — editable form** (`@jini-ai/ui/mcp-ui/surfaces`' `buildFormSurface`), used by `external_mcp_save` (`features/external-mcp/save-form.ts`): the model's call opens a form pre-filled from its own input merged over any existing row's current (non-secret) values, the human reviews/edits/submits, and the submission becomes the write. Secrets are never pre-filled (`secret: true` fields carry no `value`, ever). The file's own header names another user of the same primitive: `deployment_propose_custom_provider_credential`'s `buildProposeCredentialForm`.

**A third confirm/cancel-flavor user, and the strongest precedent for this proposal**: `deployment_execute_static_publish` (§3.1a) — a genuinely irreversible, publicly-visible publish action, migrated from Class A's dead token mechanism to this exact flavor. Its own header states the required extra wiring step a Programmer must not skip: the tool id must be added to `mcp-ui-tool-calls.ts`'s `MCP_UI_REDEEMABLE_TOOL_IDS` allowlist, or the held-open exchange has no route back to the handler regardless of everything else being correct.

**For delete specifically, flavor 1 is the right fit** — a delete needs a yes/no plus the entity's identifying details, not an editable form. This is `content_post_delete`'s own precedent almost exactly as it stands; the design question is only how to make it resource-agnostic rather than Posts/Pages-specific (§4).

**ADR-055 status, load-bearing**: the ADR this rests on (`ADS-memory/reports/architecture/ADR-055-mcp-ui-return-path.md`) is marked `DRAFT — not accepted`. It is nonetheless the live, shipped behavior of `content_post_delete` and `external_mcp_save` today (verified against the handler code, not just the ADR prose). Recommend Leona accept or revise ADR-055 before this proposal is used to justify wiring the pattern onto more tools — there is currently no accepted architectural record for the two tools already depending on it.

### 3.3 The anti-pattern to explicitly not copy — `plugins_uninstall`

`plugins_uninstall` (`plugin-runtime/agent-tools.ts:139-146`) is a genuinely hard, irreversible delete ("PERMANENTLY removes a site-installed plugin... NOT reversible — there is no revision history or trash to restore it from") guarded by exactly one sentence in its own description: *"Confirm with the human before calling this; it does not raise its own confirmation dialog."* That is wording aimed at the model, not a mechanism — nothing enforces it, and a model that skips the instruction (or is prompt-injected past it) has no gate stopping it. This is cited here as the "no bare wire-through" instruction made concrete: the 8-tool family (§1.2) must not gain a `content_delete` entry that is safer-*sounding* than the status quo without actually being safer. Any of the 8 wired without a real confirmation mechanism would be `plugins_uninstall`'s pattern, not `content_post_delete`'s.

### 3.4 Applying `workspace_delete`'s exclusion test to the 8 in-scope tools

Restated with the corrected, smaller family (identity and workspace already removed at §1.2):

| id | irreversible? | whole-scope? | verdict |
|---|---|---|---|
| `content_post_delete`, `media_trash_asset`, `comments_trash_comment`, `widgets_trash_instance`, `theme_trash_file`, `redirects_tombstone` | No — soft, reversible (restore tool, or "revert the change set") | No — single row | Confirmation is proportionate |
| `webhooks_delete_subscription` | Soft at storage, but no un-disable path — "as final as a hard delete" | No — single integration | Confirmation, not exclusion — blast radius is one integration, not the whole tenant |
| `collections_content_type_tombstone` | **Yes** — tears down provisioned indexes, no un-tombstone tool | No — one content type | **Closest call.** Not whole-scope like `workspace_delete`, so exclusion is not clearly required — but this is the one tool in the family a reviewer should look at hardest. Proposed for confirmation, flagged for explicit sign-off, not a default yes (repeated from §1.2). |

None of the 8 meets the exclusion bar (whole-scope + irreversible + no per-domain undo, together). The proposal below is confirmation for all 8, `collections_content_type_tombstone` flagged.

### 3.5 A concrete, already-present maintenance gap the proposal would close

`content_post_delete`'s own `resolveDeleteDecision` shape (park → `decision === "confirm"` fail-closed → branch → freshness re-check) is already copy-pasted at least 3 times: `custom-credentials/tool-registrations.ts:262` (self-described: "mirrors `features/post/tool-registrations.ts`'s own `resolveDeleteDecision` exactly, adapted to this domain's shape"), and the identical self-description in `source-control/tool-registrations.ts:310` and `deployments/publish-agent-tools.ts:1211` (confirmed present by grep in this domain; not diffed line-by-line for behavioral drift beyond what each file's own comment discloses). Building 8 more copies for this family would be the 4th through 11th instance of the same drift risk (one copy gets a bugfix — the function's own comment records one, the `decision !== "confirm"` fail-closed fix — and the others silently don't). A shared, resource-agnostic version of this function is the concrete piece §4 designs, independent of whether the catalog-shape half of the proposal is adopted.

### 3.6 Proposal, stated for Leona's decision

**Generalize flavor 1 (confirm/cancel dialog, §3.2) into a resource-agnostic gate, reusing the existing shared transport, for the 8 tools in §1.2, with `collections_content_type_tombstone` requiring explicit sign-off.** Do not revive the token/`actorClassRule` mechanism (§3.1) — it remains structurally refused by `assertToolIsWirable` and reviving it would mean building a second, unreviewed transport instead of reusing the one already shipped. Do not copy `plugins_uninstall`'s wording-only pattern (§3.3). This is a proposal, not a build: §4 is the plan for if and when Leona approves it.

## 4. Build plan — for IF the proposal in §3.6 is approved

For a Programmer to execute without re-deriving anything. Follows `duplicate-resource-registry.ts`'s pattern, per instruction — the one precedent in this codebase for "one generic tool, N resources, per-resource permission resolved at dispatch time, registered at the composition root." **Not started.** All boundary rules below are stated as constraints for whoever eventually builds this, not as claims about what exists today.

### 4.1 Card list (retrieval layer — §2's Option A / Arm B, retrieval-neutral; Arm A-concat's finding means a single-entry design is also retrieval-viable if wanted, see §5)

8 thin descriptors, ids `content_delete.<resource>`, dispatching into one shared handler — the same id scheme `content-read-tool.ts` already ships for `content_read.*`:

```
content_delete.content_post            <- content_post_delete
content_delete.media_asset             <- media_trash_asset
content_delete.comment                 <- comments_trash_comment
content_delete.widget_instance         <- widgets_trash_instance
content_delete.theme_file              <- theme_trash_file
content_delete.redirect                <- redirects_tombstone
content_delete.collection_content_type <- collections_content_type_tombstone
content_delete.webhook_subscription    <- webhooks_delete_subscription
```

Card text: `indexedDescriptionFor(oldToolId, oldDescription)` per surviving member (0 merges — no `_get`/`_list` pairs in this family). No card text proposed here carries a measured percentage (per instruction); if a Programmer later writes `TOOL_SEARCH_KEYWORDS.content_delete`, it should point at this eval file for evidence, never inline a number.

### 4.2 Handler shape

One new registry, `apps/website/src/assistant/delete-resource-registry.ts`, structurally identical to `duplicate-resource-registry.ts`:

```ts
export interface DeleteConfirmationSubject {
  readonly id: string;
  readonly display: Record<string, string>;   // resource-specific dialog fields
  readonly version?: number;                  // present only for resources with optimistic concurrency
}

export interface DeleteResourceHandler {
  readonly permission: string;   // resolved per-resource, never one flat permission (§4.3)
  readonly noun: string;         // "post" | "media asset" | ... — for the dialog copy
  readonly load: (id: string) => Promise<DeleteConfirmationSubject>;
  readonly execute: (id: string) => Promise<Record<string, unknown>>;  // resource's OWN existing
                                                                          // trash/tombstone/delete call,
                                                                          // unchanged
}

export interface DeleteResourceHandlerContributor {
  readonly resource: string;     // matches §4.1's card keys
  readonly build: (routeDeps: AssistantToolRegistryDeps) => DeleteResourceHandler;
}
```

`registerDeleteResourceHandler`/`listDeleteResourceHandlers`/`resetDeleteResourceHandlersForTests` — same trio, same "last registration wins" semantics `duplicate-resource-registry.ts` already documents.

**Boundary constraint, verified against `.dependency-cruiser.mjs`'s `domain-no-direct-assistant-tool-registration` rule (an agent tripped this today, `check:boundaries` moved 19 → 20; baseline must stay 19):** `features/**` must NOT value-import from `assistant/**`. This registry lives in `assistant/`, so each resource's `features/<domain>/tool-registrations.ts` contributes a `DeleteResourceHandlerContributor` via a **type-only** import (erased at compile time, zero runtime edge) — mirrors `duplicate-resource-registry.ts`'s own documented split exactly (`features/post -> assistant` had a real value edge once, closed a module cycle, and had to be removed by dependency injection instead; a naive "each resource calls register itself" design reopens it). The actual `registerDeleteResourceHandler(...)` calls belong at the composition root, `tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, glued from data each resource returns.

**The shared confirmation gate**, closing §3.5's gap:

```ts
async function resolveContentDeleteDecision(
  exchange: SurfaceExchange,
  subject: DeleteConfirmationSubject,
  handler: DeleteResourceHandler,
): Promise<{ confirmed: true } | { confirmed: false; result: unknown }>
```

Generalizes `content_post_delete`'s own logic (§3.2), varying only the dialog copy (built from `subject.display`/`handler.noun`, parameterizing `delete-confirmation-ui.ts`'s `buildDeleteConfirmationResource`) and the freshness re-check (`if (subject.version !== undefined)` only — not every resource in this family was verified to carry an optimistic-concurrency version; §6).

One `content_delete` tool handler, `assistant/content-delete-tool.ts` (mirrors `assistant/content-read-tool.ts`), parameterized `content_delete.<resource>({ id })`: resolves the registered handler, authorizes with `handler.permission`, loads the subject, opens the exchange, calls `resolveContentDeleteDecision`, and on confirmation calls `handler.execute(id)` — no resource-specific branch inside this file.

**Two required, fail-closed build steps, not optional polish (§1.3, §3.1a):**

1. **Every `content_delete.<resource>` id needs its own `DERIVED_RISK_BY_TOOL_ID` entry.** `assertRiskMetadataIsWirable`/`assertToolIsWirable` (§1.3) refuse to build ANY tool id absent from the merged risk map, unconditionally — this is the same structural gate that keeps `workspace_delete` unwired today, and it will refuse `content_delete.<resource>` exactly as readily if a Programmer forgets the entry. This is not a suggestion to remember; a missing entry fails the build with `"has no entry in DERIVED_RISK_BY_TOOL_ID"`, verified by the same class of regression test `tool-registrations.workspace.test.ts` already runs for `workspace_create`/`workspace_delete`. Each resource's risk entry should be derived from what its `execute` actually calls (mirrors every domain's own existing `xDerivedRisk` map), independent of its `permission` (§4.3).
2. **Every `content_delete.<resource>` id must be added to `mcp-ui-tool-calls.ts`'s `MCP_UI_REDEEMABLE_TOOL_IDS` allowlist** (§3.2) — without it, the held-open exchange has no delivery route back to the handler, confirmed as a real, named step by `deployment_execute_static_publish`'s own change.

### 4.3 Permission resolution per resource — exact map

| resource key | permission | source |
|---|---|---|
| `content_post` | `content.write` | `features/post/agent-tools.ts:522` |
| `media_asset` | `media.delete` | `Jini/packages/cms/src/media/agent-tools.ts:146` |
| `comment` | `comments.delete` | `features/comments/agent-tools.ts:188` |
| `widget_instance` | `widgets.delete` | `features/widgets/agent-tools.ts:232` |
| `theme_file` | `THEME_WRITE_PERMISSION` | `features/theme/agent-tools.ts:333` |
| `redirect` | `admin.redirects.manage` | `features/redirects/agent-tools.ts:209` |
| `collection_content_type` | `admin.collections.manage` | `Jini/packages/cms/src/content-types/agent-tools.ts:203` |
| `webhook_subscription` | `admin.integrations.manage` | `features/webhooks/agent-tools.ts:193` |

At least 6 distinct permissions across 8 resources — `content_delete`'s outer gate must look each one up per call, matching `duplicate-resource-registry.ts`'s own rule ("never a single flat permission shared by the whole generic tool"). No identity permission (`role.manage`) appears — `identity_role_delete`/`identity_policy_delete` are out per §1.2.

### 4.4 Tool-id-retirement sweep — required IF any existing id is retired, and measured to be larger than it looks

Applies only if a future build retires any of the 8 tools' existing ids in favor of `content_delete.<resource>` (§4.5 leaves this undecided) — **the narrow-path build (§3.6/§5: extract `resolveDeleteDecision`, wire confirmation onto the 8 EXISTING ids, no rename) retires nothing and needs none of this section.** That is an additional, concrete point in the narrow path's favor beyond what §5 already argues: it sidesteps this entire risk class rather than merely managing it.

If the full rename IS built, the actual scope of a retirement sweep was measured on `content_read`'s own migration (29 tools retired, this family would be 8) and came in far larger than it first looked — four specific traps, each confirmed against that migration, not generic caution:

1. **The sweep is most of the work, not the tail.** `content_read`'s retirement was ~15% done when three commits looked like they'd nearly finished it — the real scope was 22 of 29 files and 130 tests. A Programmer should budget the retirement sweep as a comparably-sized phase to the build itself, not a cleanup pass at the end, even at this family's smaller 8-tool scale.
2. **Tool DESCRIPTIONS are the largest class of dangling reference, not code.** ~30 dangling references across 19 domains in the read migration were `description` text — model-facing prose in OTHER tools' catalogs that names a retired id (a related tool's description referencing `content_post_delete` by name, e.g.), plus the base system prompt and `page.navigate`'s refusal text. A sweep that only checks code (imports, handler maps, tests) misses this class entirely; description text must be a first-class grep target across every `agent-tools.ts` in the repo, not just the 8 domains being retired.
3. **Grep is not sufficient — run the suites.** One retired id in the read migration existed only as two concatenated string fragments (`'{"toolId":"workspace_'` + `'get","input":{}}'`, deliberately split to test incremental argument reassembly) and no grep pattern could find it; it only surfaced by running the test suites. A retirement sweep must include a full scoped test run, not stop at a clean grep result.
4. **Regex-alternation assertions hide survivors.** A test asserting three ids in one alternation stays green forever if even one of the three still resolves, silently tolerating the other two being retired-but-still-referenced. Any test asserting multiple tool ids together must be split one-assertion-per-id and each proven to go RED against the retired id before the retirement is trusted.

**Correction to this report's own earlier guidance**: do NOT delete `tool-search-keywords.ts` entries for ids this family retires. `cardDescription`-style card builders (mirroring `content-read-tool.ts`'s own) fold each surviving card's vocabulary via `indexedDescriptionFor(<old id>, "")` — keyed on the OLD, retired id — so an entry for a retired id is still read and must be **kept**, not swept away. A Programmer must check what the card-building function actually reads before deleting any keyword entry, not assume "id retired" implies "keyword entry dead." The rest of the sweep target list stands: `apps/website/src`, `apps/admin/src`, `development/`, docs, and any base system prompt / refusal-text strings, checked with a control grep proven to hit a known-present key first (that file's keys are unquoted identifiers, so a `"quoted"` grep silently matches nothing).

Two process notes from the read migration, unrelated to the sweep itself but worth carrying into whichever build happens: a background test loop can die silently and still report "completed, exit 0" with zero output — check for an empty results file, never trust the exit code alone; and parallel work racing on one shared scratch filename will clobber itself — use a unique path per run.

### 4.5 What does NOT change / is not decided here

- `content_post_delete`'s own existing id, handler, and dialog — whether to retire it in favor of `content_delete.content_post` or keep both is a product decision, not resolved here.
- Every resource's own underlying delete/trash/tombstone function — `execute` calls them unchanged.
- No identity/member/user delete tool is registered anywhere in this plan (§1.4).
- `newsletter_archive_list` is not included (§1.2, decided) — its missing un-archive path is a separate, flagged product bug, not a delete-family design question.

## 5. Recommendation

**Retrieval (§2): both designs are retrieval-viable — the choice is not forced by an accuracy penalty either way.** Neither the original NO-GO framing nor an unqualified GO for the fat entry is the honest reading of the corrected data (§2.6), matching the read eval's own retracted-and-narrowed conclusion. Asked for my own view rather than deference: **I would build the 8 resource-keyed cards, not the single fat entry, for this family** — for reasons different from, and in one respect stronger than, the read family's own case for cards:

1. **The read family's cards bought two things at once — a real retrieval effect AND a real handler-count reduction (36→29).** For delete, cards buy neither in the same way: there are no `_get`/`_list` pairs to merge (§2.3), so cards do not reduce the executable surface at all (8 tools stay 8 registrations either way — §4.2's registry needs one entry per resource regardless of catalog shape), and B is retrieval-identical to baseline rather than an improvement. So the case for cards here rests on a narrower foundation than it did for `content_read` — but §2.6 point 4 gives it a cleaner one than the read report ever had: **B-LENIENT vs. A-concat, both scored under the same forgiving rule, still shows cards winning at top-1 by 50 points (63% vs. 13%).** That comparison isolates the actual "one document, one slot" mechanism from the scoring-leniency confound that complicates every strict-fat-vs-lenient-cards comparison in both reports. It is still n=8 and not proof, but it is the cleanest signal either investigation has produced for this specific question.
2. **The stakes are asymmetric in a way retrieval accuracy alone does not capture, and this family is more stakes-sensitive than the read family was.** A-concat's 100% is explicitly an upper bound (§2.6 point 3) — it never has to identify the CORRECT resource at retrieval time, because it only ever returns one id; that disambiguation is deferred entirely to the model correctly filling a `resource` argument afterward, a step neither eval measures. For a read, filling the wrong `resource` returns the wrong (harmless) data, is visible in the result, and is trivially recoverable by asking again. For a delete, filling the wrong `resource` on a call already past a human's confirmation dialog deletes the wrong thing — and while the confirmation dialog itself is the real safety backstop regardless of catalog shape (§3), a design that makes the pre-confirmation resource selection MORE explicit (a card literally named `content_delete.comment`) rather than LESS (one polymorphic tool with an internal enum) is the more conservative choice for a destructive-operation family specifically, independent of what the retrieval numbers alone say.
3. **Cost is genuinely near-zero either way** — this is not a case where caution trades away something valuable. §4.1's card list is a rename of existing catalog entries, not new code; the backend registry and confirmation gate (§4.2) are identical either way. Given retrieval doesn't force the answer and the cost of picking cards is not materially higher than picking one entry, the stakes-asymmetry argument in point 2 is enough to decide it.

This is a recommendation on a non-significant signal, exactly as the read eval's own author characterized their parallel judgment call — offered as my view, not as a settled measurement. Leona's call either way; §4 is written for the cards design (matching this recommendation) but nothing here forecloses a single-entry build if she weighs it differently.

**Confirmation (§3): proposed, not decided — Leona's call, per instruction.** The case for building it: 7 of 8 in-scope tools, including one irreversible schema teardown, ship today with no confirmation of any kind, guarded at most by `plugins_uninstall`-style wording (§3.3) which this report does not recommend copying. The mechanism to reuse is shipped and multi-domain already (§3.2), and the reason the codebase's own precedent withheld a similar operation (`taxonomy_execute_merge_term`) no longer applies in general, only to that operation's own chosen (and still-refused) transport (§3.1). Against building it now: ADR-055 is still DRAFT (§3.2); `collections_content_type_tombstone` needs explicit sign-off (§3.4); it is real new code, not a config change, even though it has a direct precedent to copy (§4).

**If Leona approves building it**, the narrower first step — extracting `resolveDeleteDecision` into the shared `resolveContentDeleteDecision` (§3.5/§4.2) and wiring it onto the 8 tools' EXISTING ids — captures the entire safety benefit without requiring a decision on the catalog-shape question first, since §2.6 shows that question no longer has a forced answer for this family. The full `content_delete.<resource>` catalog rename (§4.1) can follow independently, on its own merits, once ADR-055 is accepted.

## 6. What could not be verified

- Whether `media_trash_asset`, `comments_trash_comment`, `widgets_trash_instance`, `theme_trash_file`, or `redirects_tombstone`'s underlying write-services carry an optimistic-concurrency `version` field the way `PostRecord` does — needed for `resolveContentDeleteDecision`'s freshness re-check (§4.2). Flagged for whoever builds this.
- Whether the 3 `resolveDeleteDecision` copies (§3.5) have drifted from each other beyond what their own comments disclose — confirmed only that all three declare themselves faithful copies; not diffed line-by-line.
- Live-model selection cost of a `content_delete` parent tool (the read report's own August 24 finding: the agent sometimes ignores a correctly-ranked tool in favor of one already in mind) — needs a live model run, not a free eval; not attempted here.

---

**Status: COMPLETE.** Awaiting the coordinator's review of this eval + proposal before any build clearance is used.
