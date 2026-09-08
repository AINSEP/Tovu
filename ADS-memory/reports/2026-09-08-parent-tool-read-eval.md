# Collapsing the read tools into one `content_read` parent tool — measured

Date: 2026-09-08
Eval: `development/evals/tool-search-parent-tool-read.eval.ts` (added by this pass, measurement-only)
Run: `npx tsx development/evals/tool-search-parent-tool-read.eval.ts` — free, deterministic, no model
calls, no network. `uptime` at run time: `load averages: 5.79 7.12 8.19` on 8 cores — elevated but the
eval is a pure in-memory SQLite FTS5 scoring pass with no timing-sensitive assertion, so load does not
affect the result.

**Verdict: NO-GO.** Collapsing makes retrieval materially worse on exactly the queries the collapse is
supposed to serve, and the recovery lever only gets partway back — measured with the recovery
deliberately rigged in its own favour.

---

## 0. Contradictions to the framing, stated first

The dispatch asked to hear these before the experiment. Three, in descending order of importance.

### 0.1 The 98% / 100% figure does not exist and never did

`byok-tool-surface.ts:146-147` tells the model, inside a shipping tool description:

> measured on a 130-case blind set, the right tool is in the top 10 98% of the time but in the top 20
> 100% of the time, so the remaining misses are ranked just below the default cutoff, not absent.

That number is not reproducible and has no traceable source:

- The n=130 blind set is `development/evals/tool-search-heldout-v2.ts`, scored by
  `tool-search-heldout-v2.eval.ts`. That eval measures cutoffs **1, 3, 5, 10 only** — `CUTOFFS = [1, 3,
  5, 10]`. **It has never measured top-20.** The "100% in the top 20" half of the sentence cannot have
  come from it.
- That eval's own module header states its result for the shipped index: **25% top-1**, not 98%
  anything. Its header is explicit that the earlier, higher n=20 numbers were inflated because that set
  was authored by the same agent that wrote the keywords being graded.
- `git log -S "in the top 20 100% of the time"` returns exactly one commit, `708e81b2` — the
  `src/` → `apps/website/src/` rename. The claim predates the rename and no commit introduces it as new
  text; it was carried through, never derived.
- `grep -rn "98%" ADS-memory/reports/` finds no tool-search result. Every hit is coverage-gate
  percentages from unrelated test runs.

Measured today with a working harness (§1), the real figures are **87% top-10 and 94% top-20**. So the
shipping description overstates top-10 by 11 points and asserts a perfect top-20 recall that is 8 cases
short. This is a live defect independent of the collapse question — it is instruction text the model
acts on, telling it that re-searching at limit 20 is guaranteed to find any tool, when 6% of the time
it is not there. **This should be corrected whether or not anything else here is acted on.**

It also propagates: `ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md` §5 cites "the
measured 98%-top-10/100%-top-20 accuracy on a 130-case blind set (`byok-tool-surface.ts`'s own
comment)" as evidence that the retrieval layer works well. That report's conclusion survives (§0.3),
but that particular supporting fact does not.

### 0.2 The question was substantially answered on 2026-09-07, one day ago

`ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md` §5 already ruled:

> **Do not consolidate for the reason given.** … If some consolidation is still wanted … restrict it to
> families that pass two tests: (1) every verb in the family shares ONE permission … and (2) every
> verb's required-field shape is a strict subset/superset of the others'.

That report also anticipated the narrower argument this exercise is testing, and named it as the *only*
version worth entertaining: "to reduce the number of near-identical descriptions competing in the search
index — a real, narrower argument `search_tools`'s BM25 ranking could benefit from." So this experiment
is not redundant: it is the measurement of the one open sub-question the audit left open, and it
resolves it against the collapse. But the owner should know the general consolidation question was
closed a day earlier, and that this run confirms rather than reopens it.

### 0.3 The 2026-08-24 report reframes the exercise but does not obviate it

`ADS-memory/reports/2026-08-24-capability-discovery-retrieval-is-not-the-problem.md` found that the
correct tool was **rank #1 in the agent's own self-authored query and was ignored anyway**, and
concluded: "This is not a retrieval problem, not a ranking problem, and not a vocabulary problem… It is
a *preference* between two things it can see. The agent prefers an executable native verb over guidance
content whenever one plausibly fits the goal it has already formed."

That does not make this experiment unnecessary — it measures degradation, not improvement, which is a
different question. But it does add a **second, independent cost that this eval structurally cannot
measure**: `content_read` is the generic thing, and the 42 tools it replaces are precisely the
"executable native verbs" the August finding says the agent preferentially selects. The retrieval loss
below is therefore a *lower bound on the total damage*. A selection penalty stacks on top of it, in the
same direction, and no free deterministic eval can see it.

---

## 1. Baseline: does not reproduce, and the reason is a repo-wide eval outage

Running the existing eval verbatim, as its own header instructs:

```
$ npx tsx development/evals/tool-search-heldout-v2.eval.ts

Blind held-out set v2 — integrity

  cases                          130
  distinct tools as `expect`     130 of 9 wired
  domains touched                21
  cases with alsoAcceptable      13
  unresolvable ids               143 -> backup_create_restore_point (case: "before i mess with the
                                 site's data can we just make sure we have a copy of everything right
                                 now"), backup_list_restore_points (...), [141 more]
  overlap with the original 20   0 (none — set is independent)
  duplicate queries within v2    0 (none)

  Retrieval, n=130   (± is the 95% CI half-width on that proportion)

  configuration                 top-1               top-3               top-5               found@10
  no keywords (pre-fix index)   0/130 0% ±0         0/130 0% ±0         0/130 0% ±0         0/130 0% ±0
  shipped keywords (raw query)  0/130 0% ±0         0/130 0% ±0         0/130 0% ±0         0/130 0% ±0
  + HyDE via prompt (free)      0/130 0% ±0         0/130 0% ±0         0/130 0% ±0         0/130 0% ±0
```

**`130 of 9 wired`.** The catalog holds nine tools. Every case is a permanent miss. Every configuration
scores zero. This is not a retrieval result; it is a dead harness.

### Root cause

`buildAssistantToolRegistrations(deps)` was the whole composition root on 2026-08-05, when these
numbers were measured. It stopped being so on **2026-08-17**, when the tool-contribution-registry
rollout moved 25 domains behind
`apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`'s
`installFirstPartyToolContributors()`. `tool-registrations.ts:42` records the intended composition:
"`buildAssistantToolRegistrations(createRouteDeps())` after `installFirstPartyToolContributors()`
returns **154** distinct tool ids."

**No file in `development/evals/` calls `installFirstPartyToolContributors()`** — verified by grep
across all 21 files. Every one of them builds a 9-tool catalog and has done so for three weeks. The
production code paths and the `__tests__/` suites do it correctly
(`tool-search-keywords.backfill-ranking.test.ts:98` is the reference); only `development/evals/` was
left behind. This is a textbook instance of the correct primitive with an unwired call site.

### Repaired baseline

Adding the one missing call yields **177 wired tools** and a real measurement:

```
Parent-tool read collapse — integrity

  wired tools in catalog         177
  held-out cases                 130
  unresolvable case ids          0 (all resolve)
  tier ids not in catalog        0 (all resolve)

  Retrieval, n=130   (± is the 95% CI half-width on that proportion)

  configuration                     top-1              top-5              top-10             top-20
  BASELINE (177 tools, shipped)     75/130 58% ±8      108/130 83% ±6     113/130 87% ±6     122/130 94% ±4
```

**This is the number the 98%/100% claim should have been.** 87% top-10, 94% top-20. It is also
substantially *better* than the 25% top-1 the heldout-v2 header records for 2026-08-05 — 58% now — which
is real progress from doc2query adoption and keyword backfill since, and which nobody could see because
the eval that would have shown it was dead.

Composition used: `installFirstPartyToolContributors()` + `buildAssistantToolRegistrations(fakeRouteDeps())`,
retaining the existing evals' permissive `fakeRouteDeps()` stub rather than `createRouteDeps()`, which
needs a live DB. 177 vs. the 154 recorded in `tool-registrations.ts:42` is accounted for by the domains
added after that 2026-08-26 measurement (that file's own header lists five such additions, none
re-measured into the 154).

---

## 2. The honest collapse set: 42 of 56, not 40 of 57

The owner's working estimate was ~40 of 57. Both figures need small corrections.

**The denominator is 56, not 57.** 33 ids contain `_list` and 25 contain `_get`, totalling 58 — but two
of the 33 are writes caught by a suffix match: `newsletter_create_list` (creates a mailing list) and
`newsletter_archive_list` (archives one). Neither is a read. 56 genuine read tools.

**The criterion**, applied mechanically rather than by judgment call. A tool fits
`content_read({ resource, id?, filters? })` iff (a) it reads a named collection of persisted rows owned
by one domain, (b) a member is addressed by a **single** opaque id, or the whole collection by no id,
and (c) every remaining parameter is an optional filter. It fails (b) on a compound key; it fails (a) if
it returns state, capability, or resolved configuration rather than rows.

### Tier 1 — collapses unconditionally: 36

`backup_list_restore_points`, `collections_content_type_list`, `collections_entry_list`,
`comments_list_moderation_queue`, `content_post_get`, `content_post_list`, `custom_credential_list`,
`database_list_pending_migrations`, `database_list_restore_points`, `deployment_list`,
`external_mcp_list`, `forms_list_definitions`, `identity_policy_list`, `identity_role_list`,
`identity_user_list`, `media_list_assets`, `members_get_by_id`, `members_list`, `menus_get_menu`,
`menus_list_menus`, `newsletter_get_campaign`, `newsletter_list_campaigns`, `newsletter_list_lists`,
`plugins_list`, `redirects_get`, `redirects_list`, `seo_get_entry_meta`, `settings_list_definitions`,
`taxonomy_list`, `theme_list`, `webhooks_list_subscriptions`, `widgets_get_instance`,
`widgets_get_region`, `widgets_list_instances`, `widgets_list_regions`, `workspace_get`.

`content_post_list`/`content_post_get` require `kind`, but `kind` is a resource discriminator — it maps
onto `resource`, not onto a filter, so these still fit cleanly.

### Tier 2 — collapses only if a *required* per-resource filter is allowed: 6

`forms_list_submissions` (`formId`), `newsletter_list_subscriptions` (`listId`),
`newsletter_list_send_log` (`campaignId`), `webhooks_get_deliveries` (`subscriptionId`),
`theme_list_files` (`themeId`), `redirects_get_hits` (`id`).

Each is a sub-collection addressed by a parent id. The shape fits `filters` mechanically, but the
**requiredness cannot be expressed in one static JSON schema**: `resource:"form_submissions"` must have
`filters.formId` while `resource:"members"` must have nothing. The model has to learn that from
`describe_tool` prose rather than from schema validation — which is the same "conditional monster" the
2026-09-07 audit §4 objected to for `content_post_create`/`update`.

### Tier 3 — does not collapse: 14

| Tool | Why not |
|---|---|
| `forms_get_submission` | compound key — `formId` **and** `submissionId`; no single `id` to carry |
| `settings_get_raw` | compound key — `namespace` **and** `key` |
| `settings_get_effective` | resolves a precedence stack for a principal; not a row read |
| `database_get_health` | system state |
| `database_get_schema_state` | system state |
| `recovery_get_status` | system state |
| `deployment_get_export_status` | system state |
| `backup_get_capabilities` | capability probe |
| `source_control_get_capabilities` | capability probe |
| `deployment_get_static_publish_capabilities` | capability probe |
| `deployment_get_dockerfile` | generated artifact, not a stored row |
| `comments_get_settings` | singleton config object |
| `seo_get_settings` | singleton config object |
| `site_get_profile` | cross-domain aggregate with `sections`/`pageLimit` |

**36 + 6 + 14 = 56.** So the honest answer is **36 collapse cleanly, 42 if the parent tool may carry
per-resource required filters, 14 never**. The owner's ~40 was close and slightly optimistic on the
denominator.

### Permissions

Read directly from the domain catalogs: the 42-tool collapse set spans **at least a dozen distinct
declared permissions** (`content.read`, `database.read`, `backup.read`, `widgets.read`, `system.read`,
`comments.moderate`, `admin.newsletter.read`, `admin.newsletter.subscriber.read`,
`admin.forms.submissions.read`, `custom-credentials.read`, `admin.redirects.manage`, `member.manage`,
and more). This is *not* a blocker — it is exactly the problem `duplicate-resource-registry.ts` already
solves, resolving each resource's own permission before dispatch. But it does mean `content_read` cannot
be a flat-permission tool, and it inherits the audit's §4 objection that a permission which is today
visible to a security reviewer at the catalog level moves inside a registry lookup.

---

## 3. Re-measurement

Same 130 cases, same index, same scoring. In each collapsed arm the replaced tools are removed from the
catalog and one synthetic `content_read` entry is added; a case whose ground truth was inside the
collapse set is scored as a hit if `content_read` ranks (any non-collapsed acceptable id stays
acceptable, since that tool still exists).

Two description variants per arm. `thin` is a plain generic description. `RICH` appends the full resource
noun list plus operator vocabulary — which is what a shipped `content_read` would carry via its own
`TOOL_SEARCH_KEYWORDS` entry, inlined into the description here only because a synthetic id has no
keyword-table row to read. The RICH arm **is the recovery lever from step 5**, run up front rather than
only after failure.

### Whole set, n=130

| configuration | top-1 | top-5 | top-10 | top-20 |
|---|---|---|---|---|
| **BASELINE (177 tools, shipped)** | 75/130 **58%** ±8 | 108/130 **83%** ±6 | 113/130 **87%** ±6 | 122/130 **94%** ±4 |
| T1 only (36 collapsed) / thin desc | 56/130 43% ±9 | 83/130 64% ±8 | 89/130 68% ±8 | 95/130 73% ±8 |
| T1 only (36 collapsed) / RICH desc | 59/130 45% ±9 | 98/130 75% ±7 | 106/130 82% ±7 | 119/130 92% ±5 |
| T1+T2 (42 collapsed) / thin desc | 51/130 39% ±8 | 78/130 60% ±8 | 84/130 65% ±8 | 90/130 69% ±8 |
| T1+T2 (42 collapsed) / RICH desc | 58/130 45% ±9 | 97/130 75% ±7 | 106/130 82% ±7 | 118/130 91% ±5 |

Paired McNemar exact test against the baseline on the identical 130 cases (`*` = significant at .05):

| configuration | top-1 | top-5 | top-10 | top-20 |
|---|---|---|---|---|
| T1 / thin | base-only=23 arm-only=4 **p=0.0003\*** | 25/0 **p=6.0e-8\*** | 27/3 **p=8.4e-6\*** | 29/2 **p=4.6e-7\*** |
| T1 / RICH | 21/5 **p=0.0025\*** | 11/1 **p=0.0063\*** | 10/3 p=0.0923 | 5/2 p=0.4531 |
| T1+T2 / thin | 28/4 **p=1.9e-5\*** | 30/0 **p=1.9e-9\*** | 33/4 **p=1.1e-6\*** | 34/2 **p=1.9e-8\*** |
| T1+T2 / RICH | 22/5 **p=0.0015\*** | 12/1 **p=0.0034\*** | 12/5 p=0.1435 | 6/2 p=0.2891 |

### Restricted to the 41 cases whose ground truth is inside the collapse set

The whole-set view dilutes the effect across 89 cases the collapse does not touch. This is the view that
answers the actual question:

| configuration | top-1 | top-5 | top-10 | top-20 |
|---|---|---|---|---|
| **BASELINE** | 28/41 **68%** ±14 | 32/41 **78%** ±13 | 35/41 **85%** ±11 | 39/41 **95%** ±7 |
| T1 only / thin desc | 8/41 **20%** ±12 | 8/41 20% ±12 | 9/41 **22%** ±13 | 10/41 **24%** ±13 |
| T1 only / RICH desc | 13/41 32% ±14 | 23/41 56% ±15 | 26/41 **63%** ±15 | 34/41 83% ±12 |
| T1+T2 / thin desc | 3/41 **7%** ±8 | 3/41 7% ±8 | 3/41 **7%** ±8 | 5/41 12% ±10 |
| T1+T2 / RICH desc | 12/41 29% ±14 | 22/41 54% ±15 | 24/41 **59%** ±15 | 34/41 83% ±12 |

**The hypothesis is confirmed, not falsified.** With a plain description the collapse is catastrophic:
85% → 22% at top-10, and 85% → 7% for the 42-tool version. The richer description recovers most of it
but plateaus **22 points below baseline at top-10** (85% → 63%) and 12 points below at top-20.

### Why thin fails so completely

One catalog entry has to beat 135 surviving competitors on 41 different queries. BM25 scores a document
by term overlap; a generic description contains none of the domain nouns, so for "what widgets have we
built for the sidebar" it is outranked by every widget-adjacent tool that *does* contain "widget" —
including the write tools that were not collapsed. The collapse does not merely fail to rank
`content_read`; it hands those queries to the sibling *write* tools of the same domain, which is worse
than a miss.

### The 17 cases the best arm still loses at top-10

```
backup_list_restore_points      "what snapshots of the site do we have saved from before"
collections_entry_list          "show me all the recipes we've added so far"
comments_list_moderation_queue  "what comments are waiting for me to approve"
database_list_restore_points    "what points in time can we roll the site back to"
identity_policy_list            "what are all the custom permission sets we've built here"
webhooks_get_deliveries         "did that zapier hookup actually go through the last few times or is it failing"
menus_get_menu                  "show me everything that's currently in the header menu"
newsletter_list_send_log        "did that email actually reach everyone or did some bounce"
redirects_get                   "show me where that one old link is supposed to send people"
redirects_get_hits              "is anybody actualy still using that old link we set up"
seo_get_entry_meta              "what shows up when someone shares our about page on facebook"
settings_list_definitions       "what site settings even exist that we could tweak"
theme_list                      "what themes do we have available for the site and are any of them broken"
widgets_list_instances          "what widgets have we built for the sidebar and stuff"
widgets_get_instance            "where all is that one widget actually being used on the site"
widgets_get_region              "what's currently sitting in the sidebar slot"
workspace_get                   "what's this site actually called and what's its url slug"
```

These are not exotic. They are the plainest "show me X" phrasings in the set — which is precisely the
category the collapse was proposed to *improve*.

### The RICH arm is rigged in the collapse's favour — deliberately

I wrote `RICH_DESCRIPTION` while the 130 queries were in context, and some of its vocabulary is visibly
lifted from them: `zapier slack`, `vip list`, `who signed up`, `pull up`, `who filled out`. By the
standard `tool-search-keywords.ts`'s own header sets — "deliberately NOT by reading the eval's query
list and reverse-engineering terms that would score well… an earlier throwaway experiment DID write
keywords against the eval queries and scored 96% top-1, which is a self-graded number, not a result" —
**the RICH arm is self-graded and is an upper bound, not an estimate.** Real keywords written blind
would land somewhere between the thin and RICH arms.

I left it that way on purpose, because it makes the finding stronger rather than weaker: **even with the
recovery lever tuned against the answer key, the collapse still loses 22 points of top-10 accuracy on
the cases it exists to serve.** The honest range for a blind implementation is 22%-63% against a
baseline of 85%.

---

## 4. Recommendation: NO-GO

Do not collapse the read family. The evidence, in order of weight:

1. **The measured cost is large and lands on the target cases.** 85% → 63% at top-10 under the most
   favourable assumptions available; 85% → 22% under realistic ones. The whole-set top-10/top-20
   deltas are not statistically significant, but that is dilution across 89 untouched cases — top-1
   and top-5 degrade significantly even on the whole set (p=0.0025, p=0.0063).
2. **The stated motivation is not actually served.** The motivation given was that "show me X" depends
   on whether a domain happened to call it `list`, `get`, or `search`. But every one of the 17
   remaining failures above is a "show me X" query, and today's baseline answers 85% of them. The
   inconsistent naming is invisible to the model — it never sees ids, only ranked descriptions — and
   `tool-search-keywords.ts` + `tool-search-doc2query.ts` already exist to bridge exactly this gap. The
   `list`/`get`/`search` inconsistency is a *human*-facing readability issue, and it is not what is
   costing retrieval accuracy.
3. **`content_duplicate` is not the precedent it looks like.** It generalises over **4** resources with
   a **new** capability that had no per-resource tools to displace — it *added* a retrieval target
   rather than removing 42 of them. `content_read` would remove 42 distinct BM25 documents and replace
   them with one. The two moves are opposite in the only dimension that matters here.
4. **The 2026-09-07 audit reached the same conclusion a day earlier on independent grounds**
   (permission visibility, schema union validation, and the `page.navigate` over-consolidation
   incident). Two independent methods agreeing is stronger than either alone.
5. **A selection penalty stacks on top, unmeasured** (§0.3).

### If the owner proceeds anyway — the conditions

Should the owner decide the ergonomic or architectural gain outweighs 22 points of retrieval accuracy,
these are the conditions under which it is survivable:

- **Tier 1 only (36 tools). Do not include Tier 2.** Tier 2 buys 6 tools and costs a JSON schema that
  cannot express its own required fields. The T1+T2 arm is worse than T1 at every cutoff in both
  description variants.
- **The keyword entry is a hard prerequisite, not a follow-up.** Ship
  `TOOL_SEARCH_KEYWORDS.content_read` and its `DOC2QUERY` questions in the *same* change. The thin arm
  is what "we'll add keywords later" measures as: 22% top-10.
- **Write those keywords blind**, by a fresh agent forbidden from reading `development/evals/`, on the
  same protocol `tool-search-heldout-v2.ts` documents. Anything else reports the self-graded number.
- **Keep a per-resource permission map**, modelled on `duplicate-resource-registry.ts`'s `permission`
  field — never a single flat permission on the parent tool. The set spans a dozen-plus permissions.
- **Re-run this eval and gate on it.** Do not merge below **80% top-10 on the 41 affected cases**. The
  best arm measured here reaches 63%, so this gate is currently failing and would have to be earned.
- **Fix `byok-tool-surface.ts:146-147` first, independently.** It currently tells the model something
  false about its own search tool.

---

## 5. The strongest argument against my own recommendation

**The eval measures BM25 over a synthetic descriptor, and a real `content_read` is not a synthetic
descriptor.**

Every collapsed arm here is one catalog document competing against 135 others. But a shipped
`content_read` would not be alone in the index the way this eval models it. The catalog is seeded from
`registry.list()`, and nothing forces a parent tool to contribute exactly one row: the same registry
pattern `duplicate-resource-registry.ts` uses could contribute **one indexed document per resource** —
`content_read` × 36 index entries, each carrying that resource's own nouns, all resolving to the same
tool id. That would preserve today's 36 distinct retrieval targets *and* collapse the executable
surface to one tool, which is the outcome the owner actually wants. My eval does not measure that
design, and its result does not rule it out. If someone builds it, the numbers here are not evidence
against it.

Two things temper that, and neither is fatal to it:

- It requires the FTS index to hold entries that are not tool ids, and `getToolCatalogEntry`/`describe`
  are keyed by id today — a real change to `tool-catalog-query.ts` and `@jini-ai/sqlite`'s schema, not
  a configuration flag.
- It concedes the point in substance: the thing that must be preserved is 36 distinct chunks of
  retrievable vocabulary. If they have to be kept anyway, the remaining gain is a smaller executable
  surface, and per §0.2/§3 of the coverage audit the model never sees that surface — so the gain is for
  human readers of the registry, which is a real but much smaller prize than the one being weighed.

A second, weaker counter-argument: the 130-case set is agent-authored proxy data, and its own author
flagged (per `tool-search-heldout-v2.ts`'s header) that "the register is suspiciously uniform across all
130 because it is one author's model of how administrators speak." A real operator population might
phrase "show me X" more generically — which would favour a generic `content_read`. That is possible, and
unfalsifiable until captured real usage exists. But it cuts both ways: it is equally an argument that
today's 87% baseline is overstated, and it does not explain why the collapse loses on 17 queries as
plain as "what themes do we have available".

---

## 6. What this pass changed

- **Added** `development/evals/tool-search-parent-tool-read.eval.ts` — measurement-only. Nothing is
  registered into the shipping catalog; `tool-catalog-manifest.ts` is untouched; no existing tool is
  removed from anything that ships. The collapsed variant is built by filtering `registry.list()` into a
  `Pick<ToolRegistry,"list">` stand-in.
- **Changed nothing else.** In particular, the 20 stale evals in `development/evals/` are left as they
  are (§7).

## 7. Open, and left undone

1. **20 of 21 files in `development/evals/` are dead** and silently report 0/130 or its equivalent. The
   fix is one import and one call per file, mechanically identical to the one this eval makes. Not done
   here because it is outside this dispatch's scope and touches files other agents may hold. It should
   be scheduled: these evals are the only instrument for every retrieval decision, and they have been
   returning zeros for three weeks.
2. **`byok-tool-surface.ts:146-147` still ships the false 98%/100% claim.** Correcting it is a
   two-number edit to a shipping tool description — deliberately not made here, because changing what
   the assistant is told about itself is a behaviour change and this dispatch was a measurement.
   Recommended values: 87% top-10, 94% top-20, citing this report.
3. **The per-resource-index design in §5 is unmeasured.** If the owner wants the collapse, that is the
   variant worth measuring next, and it is a cheap follow-up to this eval — the arms are already
   parameterised over a descriptor list.
4. **Selection cost is unmeasured** (§0.3) and needs a live model run, not a free eval.
