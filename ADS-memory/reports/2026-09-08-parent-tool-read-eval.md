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

`byok-tool-surface.ts:146-147` told the model, inside a shipping tool description (**removed since, by
`37a78494`, which also pinned a structural guard asserting no `NN%`-shaped string appears in either
surface — quoted below only as the historical artifact it now is**):

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
- **[CORRECTED 2026-09-08]** This bullet previously said `git log -S "in the top 20 100% of the time"`
  returns exactly one commit, `708e81b2` (the `src/` → `apps/website/src/` rename), and concluded the
  claim "predates the rename and no commit introduces it as new text". **That was a false negative, and
  the origin is traceable: `d6ac6975`, 2026-08-08, "refactor(assistant): rework execution model-listing
  and test-connection routes".** Verified directly — `git show d6ac6975` carries the phrase as brand-new
  `+` lines, and adds it to BOTH surfaces in one stroke: `src/assistant/agent-daemon-server.ts` (from
  which `assistant-system-overlay.ts` was later extracted, `e38da66d`) and
  `src/assistant/byok-tool-surface.ts`. A commit about model-listing routes, carrying no eval run and no
  citation. The finding is *sharper* for this, not weaker: the figure was invented on a specific day, in
  a change about something else entirely, and installed in two shipping surfaces simultaneously.

  **Methodological note, worth more than the correction.** `-S` *scoped to a path that was later renamed*
  truncates the trail at the rename and returns a result that reads like a finding — "nothing introduced
  this, it was always here" — when the real answer is one flag away. Either add `--follow` (which takes
  exactly one pathspec, so it cannot be used to search two files at once), or simply drop the pathspec:

  ```
  git log --oneline -S '<phrase>' -- apps/website/src/assistant/byok-tool-surface.ts   # stops at 708e81b2
  git log --follow --oneline -S '<phrase>' -- apps/website/src/assistant/byok-tool-surface.ts   # finds d6ac6975
  git log --oneline -S '<phrase>'                                                      # also finds d6ac6975
  ```

  The pathspec caused the false negative, not the absence of `-M`. Absence of evidence from a
  path-scoped `git log -S` is not evidence of absence.
- `grep -rn "98%" ADS-memory/reports/` finds no tool-search result. Every hit is coverage-gate
  percentages from unrelated test runs.

Measured today with a working harness (§1), the real figures are **87% top-10 and 94% top-20 —
BASELINE arm (pre-collapse, 177-tool catalog), n=130**. (See the labelling note at the head of the Ship
Report below: the top-20 half of that pair has ALREADY moved to 95% under the shipped collapse. Any
figure written down outside the eval goes stale the moment the catalog changes, which is precisely how
this section's own subject came to exist.) So the
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

---

# Addendum (2026-09-08, same day): one tool, one index card per resource

Measured at the owner's request: the design §5 raised as the strongest argument against this report's
own NO-GO. **It works.** Retrieval returns to baseline, within noise, at every cutoff.

`uptime` at run time: `load averages: 6.94 6.46 7.61` on 8 cores. Same caveat as before — the eval is
deterministic in-memory FTS5 scoring with no timing-sensitive assertion.

## The mechanism, corrected

Before running this I predicted the answer would hinge on the **id column's weight**. The tool-catalog
index is `fts5(id, description)` ranked `bm25(tool_catalog_fts, 6.0, 1.0)` (read directly from
`@jini-ai/sqlite/src/db/tool-catalog/tool-catalog.ts:58-63, 134`) — **the id is weighted 6× the
description**, which looked like a clean explanation for why the one-long-description arm plateaued:
collapsing 36 ids into the single token pair "content read" throws away 36 resources' worth of
6×-weighted vocabulary.

**That prediction was wrong**, and the eval was built to be able to say so. Arm D2 gives every card an
opaque id (`content_read.r01` … `content_read.r29`) carrying no resource nouns at all, and it scores
identically to D1, which keeps the nouns. The id weight is not the mechanism.

The mechanism is **document granularity**. BM25 normalizes by document length, and a query can only be
served by whichever document ranks — one long document listing 29 resources has low term density for
any single resource and occupies one rank slot for all of them, while 29 short documents each have high
term density for their own. This is why the RICH arm plateaued at 59% and why splitting the identical
total vocabulary across 29 cards restores 85%. **The same words, differently chunked, is the entire
difference.** Nothing was added.

## Construction — and why this arm is not self-graded

The report's earlier RICH arm was written with the 130 queries in context and was declared an upper
bound for that reason. This arm is built mechanically and the eval queries were never consulted:

- **Card membership** comes from a blind rule on tool-id morphology: strip the tokens `list`, `get`,
  `by`, `id`; singularize (drop a trailing `s` from tokens longer than 3); dedupe; join. That rule is
  in the eval as `resourceKeyOf`, written before its output was inspected.
- **Card text** is `indexedDescriptionFor(toolId, descriptor.description)` for each member tool,
  concatenated. That function is the live production folder — the text is **byte-identical to what the
  shipped index holds for those tools today**, keywords and doc2query included. Zero words are authored
  by me in this arm.
- The 36 Tier-1 tools group into **29 cards**; 7 merge, all of them a `_get`/`_list` pair over the same
  resource (`content_post`, `member`, `menu`, `newsletter_campaign`, `redirect`, `widget_instance`,
  `widget_region`).

**One disclosed deviation — a misfire left uncorrected.** `newsletter_list_lists` → `newsletter`: the
token `list` is both the read verb and this tool's own noun (mailing lists), so the blind strip removes
the noun. The description still carries the vocabulary; only the id column loses it. I left it wrong
rather than hand-fixing it, because hand-fixing is precisely the tuning this arm exists to avoid. If
anything it costs the arm a fraction of a point.

## Results

29 cards replace the 36 Tier-1 tools; the 14 Tier-3 tools and all 141 other tools are untouched. A card
is a hit **only for its own resource** — ranking `content_read.newsletter_campaign` for a media query is
scored a miss, since the model would call `content_read` with the wrong `resource`.

### Whole set, n=130

| configuration | top-1 | top-5 | top-10 | top-20 |
|---|---|---|---|---|
| **BASELINE (177 tools, shipped)** | 75/130 **58%** ±8 | 108/130 **83%** ±6 | 113/130 **87%** ±6 | 122/130 **94%** ±4 |
| C — one card, RICH desc (prior arm) | 59/130 45% ±9 | 98/130 75% ±7 | 106/130 82% ±7 | 119/130 92% ±5 |
| **D1 — resource-keyed cards** | 72/130 **55%** ±9 | 110/130 **85%** ±6 | 113/130 **87%** ±6 | 123/130 **95%** ±4 |
| D2 — opaque-keyed cards | 73/130 56% ±9 | 109/130 84% ±6 | 113/130 87% ±6 | 123/130 95% ±4 |
| D3 — id-preserving (limit case) | 73/130 56% ±9 | 110/130 85% ±6 | 114/130 88% ±6 | 123/130 95% ±4 |

### Restricted to the 34 cases whose ground truth is inside the 36-tool collapse set

Note the restricted set here is **34**, not the 41 in §3 — §3's restricted view was over Tier 1 **+**
Tier 2 (42 tools); this addendum measures Tier 1 alone (36 tools), per the report's own recommendation
to exclude Tier 2. All rows below are on the same 34 cases, so they compare like with like.

| configuration | top-1 | top-5 | top-10 | top-20 |
|---|---|---|---|---|
| **BASELINE** | 22/34 **65%** ±16 | 26/34 **76%** ±14 | 29/34 **85%** ±12 | 33/34 **97%** ±6 |
| C — one card, RICH desc (prior arm) | 8/34 24% ±14 | 17/34 50% ±17 | 20/34 **59%** ±17 | 28/34 82% ±13 |
| **D1 — resource-keyed cards** | 22/34 **65%** ±16 | 29/34 **85%** ±12 | 29/34 **85%** ±12 | 33/34 **97%** ±6 |
| D2 — opaque-keyed cards | 22/34 65% ±16 | 28/34 82% ±13 | 29/34 85% ±12 | 33/34 97% ±6 |
| D3 — id-preserving (limit case) | 22/34 65% ±16 | 29/34 85% ±12 | 30/34 88% ±11 | 33/34 97% ±6 |

### Paired McNemar exact test vs. baseline, whole set (`-b/+c` = baseline-only / arm-only wins)

| configuration | top-1 | top-5 | top-10 | top-20 |
|---|---|---|---|---|
| C — one card, RICH desc | -21/+5 **p=0.0025\*** | -11/+1 **p=0.0063\*** | -10/+3 p=0.0923 | -5/+2 p=0.4531 |
| **D1 — resource-keyed cards** | -3/+0 p=0.2500 | -1/+3 p=0.6250 | **-0/+0 p=1.0000** | -0/+1 p=1.0000 |
| D2 — opaque-keyed cards | -2/+0 p=0.5000 | -1/+2 p=1.0000 | -0/+0 p=1.0000 | -0/+1 p=1.0000 |
| D3 — id-preserving | -3/+1 p=0.6250 | -1/+3 p=0.6250 | -0/+1 p=1.0000 | -0/+1 p=1.0000 |

## Does it recover baseline? Yes — plainly

**Yes.** At top-10 on the whole set, D1 and baseline are *identical case-for-case*: zero discordant
pairs in either direction. At top-20 D1 is one case ahead. On the 34 affected cases D1 matches baseline
at top-1, top-10 and top-20, and is **9 points ahead at top-5** (85% vs 76%) — a real, if
non-significant, gain from merging each resource's `_get` and `_list` cards, which stop competing with
each other for the same query.

The only cutoff where D1 trails is top-1 (55% vs 58%, 3 discordant cases, p=0.25) — inside noise, and
mechanically explained: where a merged card serves both "list all posts" and "get this post", it can
rank #1 for only one of the two.

Five cases still miss at top-10 under D1 — `collections_entry_list`, `webhooks_list_subscriptions`,
`redirects_get`, `seo_get_entry_meta`, `workspace_get`. Baseline misses five as well. These are
pre-existing vocabulary gaps, not collapse damage.

So: the counter-argument in §5 was correct and this report's NO-GO **does not apply to this design**.
The NO-GO stands for the design that was actually proposed — one parameterized tool with one catalog
entry — and that remains a 59%-vs-85% loss.

## What it would cost to ship

Concretely, reading `@jini-ai/sqlite/src/db/tool-catalog/tool-catalog.ts`:

**Not a rewrite, not a join, not a new table. One added column, and one honest question about what
`search_tools` returns.**

The blocking fact is that `id` is the single key: `getToolCatalogEntry` is
`SELECT … FROM tool_catalog WHERE id = ?`, and `searchToolCatalog` returns `tc.id`, which is what
`describe_tool` and `execute_delegated_tool` are handed. Two ways out:

**Option A — no schema change at all (recommended if this is done).** Register 29 thin descriptors
whose ids *are* the card keys (`content_read.media_asset`, …), each dispatching into one shared
handler. Nothing in `@jini-ai/sqlite` changes; nothing in `tool-catalog-query.ts` changes;
`execute_delegated_tool` resolves the resource by splitting the id. Cost is a `content_read` handler
plus a resource registry modelled on `duplicate-resource-registry.ts` — entirely inside
`apps/website/src/`. This is what D1 literally measures, so its 85%/87% numbers are that option's
numbers, not an approximation of them.

**Option B — one tool id in the index.** Add a `tool_id` column to `tool_catalog`, make `id` the card
key, return `tc.tool_id` from `searchToolCatalog`, add the field to `ToolCatalogEntry`, add it to the
`reseedToolCatalog` INSERT, and teach `describe_tool` to accept a card key. That is roughly a dozen
lines across four functions in one file — but it is a **cross-package change to a symlinked
`@jini-ai/*` package** that requires a `dist` rebuild for Tovu to see it, and it introduces a new
result-deduplication question (two cards for one tool both ranking now return the same `tool_id`
twice). Also note `sourceForToolId` in `tool-catalog-query.ts:36-39` splits on the `_` prefix; every
card would report source `content`.

## Is the cost worth the prize? No — and the §5 concession stands

**Restating it, as asked:** if 29 distinct chunks of retrievable vocabulary must be preserved anyway —
and this addendum is the proof that they must, since collapsing them into one chunk costs 26 points of
top-10 accuracy — then the remaining prize is a **smaller executable surface and one shared handler,
for the benefit of human readers of the registry**. It is not better retrieval: D1 matches baseline, it
does not beat it. And it is not a smaller discovery surface either: `search_tools` still returns 29
distinct entries with 29 distinct descriptions, so **the model's view is unchanged in size**. Per §3 of
`2026-09-07-assistant-tool-coverage-audit.md`, the model never sees the catalog anyway, so there was
never a context prize to win here.

Against that prize:

- **Option A costs little and delivers all of it.** If the owner wants one read handler instead of 36,
  Option A is a same-package refactor with a measured zero-cost retrieval profile. That is a legitimate
  thing to want — 36 handlers doing structurally identical work is real duplication, and the
  `_get`/`_list` merge is a genuine small win (+9 points at top-5).
- **Option B costs a cross-package schema change and delivers only cosmetics** — that `search_tools`
  reports `content_read` instead of `content_read.media_asset`. Nobody benefits from that except a
  human reading the registry, and the audit's §4 objection applies at full strength: a permission that
  is visible today at the catalog level moves inside a registry lookup.

**Recommendation, unchanged in substance and now sharpened:**

| design | retrieval | verdict |
|---|---|---|
| One parameterized tool, one catalog entry (the original proposal) | 59% vs 85% top-10 | **NO-GO** |
| One handler, 29 index cards, no schema change (Option A) | 85% vs 85% top-10 | **GO, if handler dedup is wanted for its own sake** |
| One handler, 29 index cards, `tool_id` column (Option B) | same as A | **NO — cost without a prize** |

The conditions from §4 that still bind on Option A: per-resource permission map modelled on
`duplicate-resource-registry.ts` (the set spans a dozen-plus permissions); Tier 1 only, never Tier 2;
and re-run this eval as the merge gate.

## Correction to §5 of this report

§5 said "It requires the FTS index to hold entries that are not tool ids, and
`getToolCatalogEntry`/`describe` are keyed by id today — a real change to `tool-catalog-query.ts` and
`@jini-ai/sqlite`'s schema, not a configuration flag." **That is wrong for Option A**, which needs no
change to either file: 29 registered descriptors sharing one handler is entirely expressible today. The
schema change is only required if one insists the *index* hold a single tool id, which buys nothing.
The rest of §5 — that the design preserves 29 vocabulary chunks and therefore concedes the substance —
holds, and is restated above.

---

# Ship report (2026-09-08, later the same day): finishing the `content_read` rollout

Written by the agent that took over after the implementing agent rotated out without a handoff.
Everything below was re-verified from the tree, not inherited.

## 0. How to read every figure in this report

**No accuracy figure in this document is meaningful without its arm AND its denominator.** Three pairs
in the Addendum above are adjacent, similar-looking, and NOT interchangeable — a coordinator reading
them quoted two as if they were one measurement and dispatched work on the mistaken pair. That is a
defect in how they were written down, not a reading error:

| figure | arm | denominator | where |
|---|---|---|---|
| **87% top-10 / 94% top-20** | BASELINE (pre-collapse, 177-tool catalog) | **n=130**, whole set | Addendum → Results → Whole set |
| **87% top-10 / 95% top-20** | **D1 — resource-keyed cards (what shipped)** | **n=130**, whole set | Addendum → Results → Whole set |
| **85% top-10 / 97% top-20** | BASELINE *and* D1 — identical on this subset | **n=34**, the affected cases only | Addendum → Results → Restricted |

Two consequences worth stating plainly:

1. **The top-20 figure MOVES from 94% to 95% because of the change being shipped.** Any number written
   outside the eval goes stale the moment the catalog changes again. That is not hypothetical: it is
   exactly how `byok-tool-surface.ts` came to assert a 98%-top-10/100%-top-20 rate its own cited eval
   had never measured (§0.1). Where a figure appears in code or in a doc-comment here, it has been
   replaced with a pointer at the eval that recomputes it — see `content-read-tool.ts`'s header.
2. **"177 tools" and "170 tools" are both correct, for different arms.** 177 is the pre-collapse
   catalog the BASELINE row measures; 170 is what ships after the collapse removes 36 ids and adds 29
   (`raw 177 → collapsed 170`, verified against the live composition). Either number is a snapshot —
   the catalog has been growing daily — so treat any hardcoded catalog size, including these, as
   true-on-the-day rather than a constant.

Any figure below that cannot be traced to a specific arm and denominator is labelled **UNATTRIBUTED**
rather than given a confident guess.

## 1. Verdict on the shipped derivation — arm D1's figures ARE ours to claim

`content-read-tool.ts`'s `CONTENT_READ_CARDS` was checked by *running* the eval's own
`resourceKeyOf` (strip the `list`/`get`/`by`/`id` verb tokens, singularize, dedupe) over the eval's
own `TIER1_CLEAN`, then diffing the 29 resulting keys against the 29 shipped card ids:

```
ids: 36  cards: 29  merged: 7
merged: content_post, member, menu, newsletter_campaign, redirect, widget_instance, widget_region
diff derived vs shipped: EXACT MATCH
```

All 7 merges are `_get`/`_list` pairs over one resource, exactly as the addendum describes. The shipped
catalog IS the catalog that was measured, so **arm D1's figures are the ones that apply to what
shipped: 87% top-10 / 95% top-20 on the whole set (n=130), and 85% top-10 / 97% top-20 on the 34
affected cases** — the latter identical to BASELINE on those same 34, which is the actual claim worth
making (the collapse cost nothing at top-10). Note the previous revision of this paragraph wrote "the
85% top-10 / 87% whole-set figures", mixing the n=34 top-10 with the n=130 top-10 into a single
unlabelled pair. That is the exact defect §0 above exists to prevent.

**Correction to the addendum's `RESOURCE_KEY_ARTIFACTS` note.** It claimed
`newsletter_list_lists -> "newsletter"` — that the blind strip eats the noun. It does not. The tokens
are `["newsletter", "list", "lists"]`; only the exact-match verb token `"list"` is dropped, and
`"lists"` singularizes to `"list"` and is kept, yielding **`newsletter_list`**. The prose described
the effect informally and was simply wrong about the function's output. Since the shipped collapse
transcribes these keys literally, a reader comparing the two would have found a card
(`content_read.newsletter_list`) the comment said should not exist. The note is corrected in place.

**Ruling on the card-derivation wart:** left as `content_read.newsletter_list`, deliberately, not by
inheritance. `newsletter_list_lists` does list newsletter's mailing lists, so "newsletter list" is an
accurate noun phrase rather than a leftover verb token, and it collides with nothing
(`content_read.newsletter_campaign` is a separate card). No hand-fix, so no eval re-run was owed.

## 2. Ruling on `includeContentReadCollapse` — KEEP, and now pinned by a test

It is correct, and its doc comment is accurate: the two production composition roots
(`agent-daemon-server.ts:364`, `byok-tool-surface.ts:434`) both leave it at its default, which is
precisely why it reads as dead code. A comment cannot stop a deletion, and deleting it fails
**silently** in the way that matters most: the eval's "baseline" arm would quietly become the
already-collapsed catalog and keep printing a plausible number while comparing the shipped design
against itself.

So it is now pinned by `apps/website/src/assistant/__tests__/content-read-tool.test.ts` — the first
tests `content-read-tool.ts` has had at all — asserting over the REAL composition that exactly the 29
cards ship, that none of the 36 retired ids survive, that the collapse is a net -7, and that
`includeContentReadCollapse: false` returns all 36 originals and ZERO cards. Verified RED by
simulating the option's deletion: the net-delta assertion reads 0 instead of 7 and 29 cards leak into
the arm that must contain none.

## 3. The sweep — what the collapse actually stranded

The three follow-up commits covered post, identity, widgets; a fourth covered newsletter. That was
about 15% of the work. Running **every** suite that builds the collapsed catalog and names a retired
id found **22 of 29 files failing, 130 tests**. All 22 are now migrated (final run: **695 pass, 10
fail**, every one of the 10 pre-existing and unrelated — see §5).

Three classes of stranded reference the collapse left behind, in ascending order of how badly a grep
handles them:

1. **Live model-facing strings.** `assistant-system-overlay.ts`'s base system prompt named
   `custom_credential_list`; `rewrap-page-navigate-error.ts`'s `page.navigate` refusal told the caller
   to use `content_post_get` / `content_post_list`. Both steered a model at ids
   `execute_delegated_tool` now rejects. The latter's regression test asserted all three ids as one
   **alternation**, which stays green while any member matches — it would have tolerated both retired
   ids indefinitely because `content_post_search` survived beside them. Split into three assertions
   including a `doesNotMatch`, verified RED against the pre-fix string.

2. **Tool DESCRIPTIONS — the largest class, and the one a sweep classifies wrongly.** ~30 of them
   across 19 domains still read "as returned by `plugins_list`", "exactly as returned by
   `theme_list`", "Use `content_post_list` first if you are not certain which kind an id belongs to".
   A `description` is shipped to the model verbatim, so it is model-facing *regardless of which layer
   the file lives in* — my own first pass classified these as domain-layer prose the collapse
   legitimately leaves alone, and that was wrong. They were found by **running a live turn and reading
   the description the server actually handed the model**, not by grepping.

3. **A tool id that exists only as two concatenated string literals.** `assistant-byok-routes.test.ts`
   splits it across two streamed argument fragments on purpose, to cover the adapter's incremental
   `arguments` reassembly:

   ```js
   openAiToolCallArgsChunk(0, '{"toolId":"workspace_'),
   openAiToolCallArgsChunk(0, 'get","input":{}}'),
   ```

   No search for a quoted tool id can ever match this — including the exhaustive one this task ran.
   Found only by running the suite. Repointed keeping the split, and therefore the coverage, intact.

**The governing distinction**, which every migration decision here turns on: the 36 ids still EXIST as
domain catalog entries and handlers. The collapse rewrites only the FINAL wired registration list. So
an assertion about a domain's own static catalog must KEEP the original id, and one about the wired
list must use the card. `tool-registrations.themes.test.ts` asserted both from a single shared list
and now carries `CATALOGUED_THEMES_TOOL_IDS` (`theme_list`) beside `WIRED_THEMES_TOOL_IDS`
(`content_read.theme`); folding them back together would make one of the two silently wrong.
`tool-registrations.external-mcp.test.ts` is the same hazard at file scale — it asserts through both
an uncollapsed domain builder and the real assembly path, and an earlier blanket rewrite of it was
reverted for flattening that difference.

Two mechanical traps worth recording: fixture and permission maps key tools as **unquoted
identifiers**, so a quoted-only sweep misses them silently (and `content_read.<resource>` contains a
dot, so those keys must become quoted); and where a **merged** get/list pair collapses, rewriting both
members to the same id produces a duplicate object key whose second entry silently overwrites the
first — plus prose that contradicts itself ("PREFER THIS OVER `content_read.content_post` —
`content_read.content_post` has no query" one clause after "call `content_read.content_post` with the
id"). Six files were reverted from the mechanical pass and rewritten by hand to describe one tool with
two modes.

## 4. Live verification (§ milestone 3)

**The admin UI could not be used.** `apps/admin/src/features/plugins/agent-plugin-source-catalog.ts`
is in git `UU` state with literal `<<<<<<< Updated upstream` markers in it, so Vite fails to transform
it and `https://localhost:5173/admin` renders only the esbuild error overlay. That file belongs to
another session and this task was explicitly instructed not to touch it, so it was left exactly as
found; the runtime dock was never switched, and therefore needed no switching back.

Verified against the **running API on :3000** instead, which is a separate process and healthy. A
scripted stub provider stands in for the model, but **every tool decision is made from the live
server's own `search_tools` ranking** — the stub reads the search result and picks from it:

```
[turn 1] model -> search_tools({ query: "show me my forms" })
[turn 1 result] content_read cards returned by LIVE search_tools: content_read.form_definition, ...
[turn 2] model -> execute_delegated_tool({ toolId: "content_read.form_definition" })
HTTP 200   tool_result isError=false   {"definitions":[ ...3 rows... ]}
```

Cross-checked against the live DB read-only (`file:sites/tovu-com/content.db?mode=ro`), never the
turn's own claim — `select id, name, slug, status from form_definitions` returns exactly the 3 rows
the tool returned, same UUIDs, same slugs.

The merged card was exercised too: `"list my recent posts"` ranked `content_read.content_post`, and
calling it with `{kind:"post"}` and no `id` dispatched to the **list** arm and returned the 1 matching
row. That live run is also what exposed class (2) above — the card description handed to the model
still said "Use `content_post_list` first". After the fix, a re-run returns **zero** retired ids
anywhere in the model-facing text.

## 5. Remaining failures — all pre-existing, none from this collapse

- `tool-registrations.contracts.test.ts` (4): `content_duplicate` / `content-duplication` missing from
  `CATALOGS_BY_DOMAIN`. From `31f83205`.
- `tool-contribution-registry.test.ts` (1): `content-duplication` and `external-mcp` missing from the
  expected installed-domain list. From `31f83205` / `0af1c873`. `content-read` correctly does NOT
  appear there — it is a post-processing pass, not a registered contributor.
- `tool-registrations.authorization.test.ts` (5): `authorize()` now reports
  `entityType: 'content-type'` and the expected object omits it. These are MUTATION tools the collapse
  never touches, and `content-read-tool.ts` contains no reference to `entityType`.

One measurement trap found while triaging: `assistant-byok-routes.test.ts` needs
`env -u TOVU_ADMIN_PASSWORD` or `loginAsOwner` 401s and 12 of its 13 tests fail for reasons unrelated
to any of this. Its real collapse-caused failure count was **1**, not the 12 a first batch run
reported.

## 6. Gates

- Root `npx tsc -p tsconfig.json --noEmit`: clean (0 lines), re-run after each milestone.
- `npm run check:boundaries`: **19 errors — the documented baseline, unchanged**; zero violation lines
  name `content-read` or `content_read`.
- Scoped test runs only, one file at a time, from the repo root. No `serve-command*.integration` suite
  was run.

## 7. RULING: the keyword/doc2query keys STAY on the retired member ids

Raised as a suspected stranded reference — `tool-search-keywords.ts:292` and
`tool-search-doc2query.ts:903` still key entries as `workspace_get` — on the reasoning that a key not
corresponding to an indexed id has its vocabulary silently dropped from the search index. **The
condition is false, and acting on it would have caused the very harm it was meant to prevent.**

`cardDescription()` in `content-read-tool.ts` composes each card's indexed text as its members' own
plain descriptions plus their own keyword/doc2query tails, looked up as `TOOL_SEARCH_KEYWORDS[memberId]`
and `DOC2QUERY[memberId]` — **by the retired member id, deliberately**. Read off the live built catalog,
`content_read.workspace`'s shipped description ends:

> … — also known as: site name title settings workspace details info about What's our workspace's name
> and id? Can you show me when this workspace was created? What's our current workspace slug? I want
> basic info about our own workspace. Do we have more than one workspace here?

That is `workspace_get`'s keyword string plus all five of its doc2query questions, verbatim, in the
card's indexed text. Those keys are not stranded — **they are load-bearing**, and re-keying them onto
card ids would make the lookup miss and delete that vocabulary from the FTS index with no error
anywhere. It is also the vocabulary the measured parity rests on: preserving 29 per-resource vocabulary
chunks is *why* D1 matched BASELINE rather than collapsing to arm C's 59% (n=34, top-10).

Swept both files for all 36 retired ids, with a control grep proving the pattern matches (the keys are
unquoted identifiers; a quoted grep matches **0**, as warned): **36/36 present in
`tool-search-keywords.ts`, 34/36 in `tool-search-doc2query.ts`** — `deployment_list` and
`external_mcp_list` have no doc2query entry, which predates the collapse and is unrelated to it.
**No change made to either file.**

Pinned by a regression test so the "cleanup" cannot happen later: every search term a retired member
contributes must appear in its card's description. Re-key the maps and the lookups miss, the checked
count falls to zero, and it fails loudly.

## 8. The shared id → card mapping (implementing the coordinator's ruling)

`content-read-tool.ts` now exports **`RETIRED_READ_TOOL_TO_CARD`** and **`currentToolIdFor()`**, derived
from `CONTENT_READ_CARDS` itself so they cannot drift from what ships. One authority, not nine
hand-maintained copies — nine copies is nine things to forget the next time an id is retired, which is
the failure this whole exercise exists to clean up.

The ruling it implements is correct and worth restating: **retired ground truth RE-KEYS onto the card,
it is not dead.** The capability still exists and is still reachable; a suite whose expected id is
`comments_list_moderation_queue` scoring a retrieval of `content_read.comment_moderation_queue` as a
miss manufactures a regression that is not real.

Its doc-comment carries an explicit warning that it is a **read-side alias map only** and must NOT be
applied to the keyword/doc2query lookups in §7 — the two look like the same problem and have opposite
correct answers.

**REMAINING, not done here:** migrating the ~9 other eval suites to resolve their expected ids through
`currentToolIdFor()`. The export is ready and tested; the migration is a separate, mechanical pass. Also
unverified by me, and still claims rather than findings: that `tool-search-doc2query.ts` covers 102 of
170 tools; that `tool-search-hierarchical-canary.eval.ts` now groups into 32 domains against a
documented 21; and the specific stale doc-comment baselines in those suites.

## 9. A gap in my own sweep, and what closed it

My first triage filtered candidate test files on their use of `buildAssistantToolRegistrations`. That
filter was wrong: it excluded every suite that builds a DIFFERENT surface over the same catalog.
`byok-tool-surface.test.ts` builds the BYOK meta-tool surface and used `workspace_get` throughout as its
stand-in "a real tool id" — 4 failures, missed entirely.

Re-swept without that filter: **51 test files name a retired id; 27 were outside the original runlist;
`byok-tool-surface.test.ts` was the only broken one among them** (the other 26 pass). Reported alongside
it was `assistant-system-overlay.unit.test.ts` — that file passes **13/13** and does not fail; the
overlay edit in `0c0befe4` did not break it.

The lesson matches §3's: the sweep's *filter* is as capable of hiding a stranded reference as the grep
pattern is. Both failures here were found by running things, not by searching them.

## 10. Commits

`0c0befe4` live model-facing strings · `6c26e0ab` 12 suites · `15a86368` forms/content-types/database
·  `3d14b025` merged get/list pairs + external-mcp · `2c55296a` last three suites incl. the split id ·
`a2fa0bfc` the `content-read-tool` contract test · `f7e44b4e` the tool descriptions · `8ad8e5e0` the
shared id→card export, the byok-tool-surface fix, and the de-figured header.

---

# Addendum 2 (2026-09-08): arm C2 — the missing control. **This OVERTURNS §3's mechanism claim.**

Eval: `development/evals/tool-search-fat-concat-arm.eval.ts`. `uptime` at run: 1-min load 7.06 on 8
cores (15-min average 29.11 — the machine had been heavily loaded; this eval is deterministic
in-memory FTS5 scoring with no timing-sensitive assertion).

## The confound, stated plainly

§3 compared arm C (**one** catalog entry, **hand-authored** `RICH_DESCRIPTION`) against arm D1 (**29**
cards, **mechanically built** from each tool's real `indexedDescriptionFor` output) and attributed the
whole 85% → 59% gap to **document granularity**. Those two arms differ in *two* variables, not one:
entry count **and** text provenance. The attribution was never established by that data. The
coordinator caught this; it is a real methodological error in my report, not a quibble.

Arm C2 removes the confound: **one** catalog entry whose description is the mechanical concatenation of
exactly the same 36 tools' folded text that D1 chunks across 29 cards. Same words, same source, same
total vocabulary. The only remaining variable is one document versus 29.

**I recorded a prediction before running it** (scratchpad, pre-measurement): C2 would land at or below
arm C's 59% top-10, because BM25 length normalization at |D|/avgdl ≈ 36 gives a fat document roughly
6.5% of a short document's per-term contribution. I also predicted C2 would fall *below* arm C, since
the mechanical concatenation is far longer than 250 hand-picked words — which would have meant the
hand-authoring *flattered* arm C rather than handicapping it.

**That prediction was wrong, in exactly the direction I said would overturn the ruling.**

## Results

Baseline here requires `includeContentReadCollapse: false` — see §"What shipped underneath this" below.

### Restricted to the 34 affected cases

| configuration | top-1 | top-5 | top-10 | top-20 |
|---|---|---|---|---|
| BASELINE (uncollapsed) | 22/34 65% ±16 | 26/34 76% ±14 | 29/34 **85%** ±12 | 33/34 97% ±6 |
| D1 — 29 cards, mechanical text | 22/34 65% ±16 | 29/34 85% ±12 | 29/34 **85%** ±12 | 33/34 97% ±6 |
| D1-SHIPPED — the real catalog | 22/34 65% ±16 | 29/34 85% ±12 | 29/34 **85%** ±12 | 33/34 97% ±6 |
| D1 LENIENT — any card counts | 25/34 74% ±15 | 34/34 100% ±0 | 34/34 **100%** ±0 | 34/34 100% ±0 |
| **C2 — ONE fat entry, same text** | 13/34 **38%** ±16 | 30/34 88% ±11 | 33/34 **97%** ±6 | 34/34 **100%** ±0 |

### Whole set, n=130

| configuration | top-1 | top-5 | top-10 | top-20 |
|---|---|---|---|---|
| BASELINE (uncollapsed) | 57% ±9 | 83% ±6 | 87% ±6 | 94% ±4 |
| D1 — 29 cards | 55% ±9 | 85% ±6 | 87% ±6 | 95% ±4 |
| D1-SHIPPED | 55% ±9 | 85% ±6 | 87% ±6 | 95% ±4 |
| D1 LENIENT | 57% ±9 | 88% ±5 | 91% ±5 | 95% ±4 |
| **C2 — ONE fat entry** | 52% ±9 | 85% ±6 | **91%** ±5 | 95% ±4 |

### Paired McNemar, whole set

| comparison | top-1 | top-5 | top-10 | top-20 |
|---|---|---|---|---|
| D1 vs baseline | -3/+0 p=0.2500 | -1/+3 p=0.6250 | -0/+0 p=1.0000 | -0/+1 p=1.0000 |
| C2 vs baseline | -12/+5 p=0.1435 | -3/+5 p=0.7266 | -3/+8 p=0.2266 | -0/+2 p=0.5000 |
| C2 vs D1 | -11/+7 p=0.4807 | -4/+4 p=1.0000 | -3/+8 p=0.2266 | -0/+1 p=1.0000 |
| C2 vs D1-LENIENT | -13/+6 p=0.1671 | -5/+0 p=0.0625 | -3/+3 p=1.0000 | -0/+0 p=1.0000 |

Document lengths, measured rather than assumed: avgdl across the 141 surviving tools is **145 words**;
the median D1 card is **96 words** (0.7× avgdl); the C2 fat entry is **3,643 words** (25.1× avgdl). The
length penalty I calculated is real and the fat entry absorbs it — **and still reaches 97% top-10.**

## What this overturns, in those words

**§3's mechanism claim is overturned.** Document granularity does **not** explain the 85% → 59% gap.
With the same real text, one fat entry scores **97% top-10 and 100% top-20** on the affected cases —
better than baseline, not 26 points worse. The gap §3 reported was caused by **my hand-authored
`RICH_DESCRIPTION` being worse than the tools' own shipped descriptions**, which is a text-quality
artifact of my own construction, not a property of collapsing.

The sentence in §3's addendum — *"The same words, differently chunked, is the entire difference.
Nothing was added"* — is **false**. They were not the same words. That is the error.

**Consequently the top-5 claim is also retracted.** I attributed D1's +9 at top-5 to `_get`/`_list`
cards no longer competing with each other. C2 gets the same +12 (76% → 88%) with **no merging at all**,
so the gain comes from removing 36 near-duplicate documents from the index, not from merging pairs.

**And the headline NO-GO in §4 does not survive on the evidence that produced it.** That ruling rested
on the 59% number. The honest restatement: **at n=130, one fat entry, 29 cards, and no collapse at all
are statistically indistinguishable at every cutoff.** Not one comparison in this addendum reaches
p<0.05. The only significant result in this entire investigation was arm C versus baseline — and arm C
is now known to be confounded.

## What survives, narrowed

One granularity effect is real and consistent, and it is **top-1 only**: C2 38% against D1's 65% and
baseline's 65% on the affected cases, and 52% vs 55%/57% on the whole set. Direction is consistent
across both views. It is *not* statistically significant (C2 vs D1 top-1: p=0.4807), so it is a signal,
not a proof.

The mechanism for it is the one I originally described, just confined to first place: a single document
can occupy only one rank slot, so where a query has an obvious specific answer the fat entry gets
crowded out of #1 while still appearing by #10. **"Always present, rarely first"** is the fat entry's
signature — visible directly in the numbers (38% top-1 → 97% top-10, a 59-point spread; baseline's
spread is 20 points).

Top-1 matters more here than the p-value suggests, because of
`2026-08-24-capability-discovery-retrieval-is-not-the-problem.md`: that report found the agent forms a
plan early and takes a result matching it rather than reading down the list. For an agent that behaves
that way, rank #1 is worth more than rank #7.

## The scoring asymmetry, quantified

C2 is scored a hit whenever its single entry ranks. D1 requires the **correct** card — ranking
`content_read.newsletter_campaign` for a media query is a miss. That is not symmetric, so I measured
the spread: **D1-LENIENT** (any `content_read.*` card counts) scores **100% top-10** against strict
D1's 85%. **The asymmetry is worth 15 points**, and it favours C2 in every table above.

Neither scoring is "the true one" — they measure different things, and the honest reading is that
**both designs relocate the same disambiguation rather than eliminating it**. D1 asks the model to pick
the right card at retrieval time (strict scoring counts that; 15 points). C2 asks it to pick the right
`resource` argument after retrieval (unmeasured here, and not free either). C2's apparent 97% is
therefore an upper bound in the same way arm C's RICH text was — just in the opposite direction.

## Reconciliation with the peer's `content_delete` result

No reconciliation is needed and my proposed one was also wrong. I predicted fat-concat viability would
scale inversely with collapse-set size (workable at n=8, not at n=36). C2 collapses 36 tools and
reaches 97% top-10, essentially matching the delete eval's 100% at n=8. **Collapse-set size is not the
variable.** The two results agree; both say a mechanically-concatenated fat entry retrieves fine.

## What shipped underneath this

While this was running, the D1 design **shipped** (`a2fa0bfc`), citing this report's Addendum arm D1:
`buildAssistantToolRegistrations` now performs the collapse unconditionally, replacing the 36 read
tools with 29 `content_read.<resource>` cards behind one shared handler. The `includeContentReadCollapse:
false` seam exists to reconstruct the pre-collapse set.

Two things follow:

1. **The shipped design is safe, and this addendum's D1-SHIPPED arm confirms it directly** — the real
   catalog scores identically to my synthetic D1 at every cutoff (65/85/85/97 on the affected cases),
   and its 29 card keys are an exact match for the blind rule's output (`0` mismatches). Nothing needs
   reverting.
2. **But it shipped on a justification that this addendum retracts.** The argument for 29 cards over
   one entry is now *top-1 precision alone* (65% vs 38%, not significant), not the 26-point top-10
   recovery §3 claimed. That is a much weaker case, and the owner should know the code is right for a
   reason other than the one recorded when it merged.

I would still choose the 29 cards, for the top-1 reason plus the fact that a card naming its resource
gives the model something to reason about that a `resource` enum inside one schema does not. But that is
a judgment call on a non-significant signal, not the settled measurement §3 presented.

## Corrections to this report, consolidated

| Claim | Location | Status |
|---|---|---|
| Granularity explains 85% → 59% | §3 addendum, "The mechanism, corrected" | **RETRACTED** — confounded by hand-authored text |
| "The same words, differently chunked, is the entire difference" | §3 addendum | **FALSE** — they were not the same words |
| D1's +9 at top-5 comes from `_get`/`_list` merging | §3 addendum, "Does it recover baseline?" | **RETRACTED** — C2 gets +12 without merging |
| NO-GO on one parameterized tool | §4 | **NOT SUPPORTED** by the corrected data; no arm differs significantly |
| id column's 6× weight is not the mechanism (arm D2) | §3 addendum | **STANDS** — independent of this confound |
| The 98%/100% figure in `byok-tool-surface.ts` is unsourced; real values 87%/94% | §0.1 | **STANDS** — reconfirmed here |
| Evals omitted `installFirstPartyToolContributors()` | §1 | **STANDS** — fixed repo-wide in `e8245891` |
| Honest collapse set is 36 clean / 6 conditional / 14 never | §2 | **STANDS** — unaffected |
