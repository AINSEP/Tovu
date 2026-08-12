# Boundary Lint Plan — `no-deep-imports` (ADR-009 §1) — 2026-08-13

**Role:** Software Architect. **Mandate:** Phase 1 only — triage + design + report. No production
source file was touched to produce this report; `.dependency-cruiser.cjs` was not touched either
(the designed rule lives in a scratch prototype, referenced by path below, not in the real config).

**Why this exists:** `npm run check:architecture` catches aggregate API-surface drift after the
fact, as a number. `npm run check:boundaries` (dependency-cruiser) is the mechanism that could catch
it at authorship — but every existing rule is `severity: "warn"`, and ADR-009 §1's actual claim
("boundary lint forbids deep imports") was never implemented as a rule at all. This is that missing
rule's design, plus a first look at whether the three rules that do exist are ready to actually block
anything.

**Verified against committed `HEAD`** (via `git archive HEAD` into an isolated snapshot, not the
working tree) throughout, per the dispatch's instruction — the working tree has three other agents
mid-flight rewriting exactly the modules this report is about.

---

## 0. Executive summary

- **The 51 existing violations are 90% test files exercising concrete adapters** (contract/
  integration tests instantiating `db/sqlite/*`/`db/schema.ts` directly — a legitimate, standard
  pattern, not boundary erosion). The other 10% (5 lines, 3 files) split into one real, unresolved
  architectural finding (`core/commands/appliers.ts` importing two feature-module barrels — §1.1) and
  two config gaps where a legitimate adapter file just doesn't match the existing `repo.*`/
  `search-index.*` exemption regex (§1.2).
- **Recommend excluding test files from the 3 existing rules** (§2) — every violation they'd still
  catch after that is real. With that change plus the two config-gap exemptions,
  `only-composition-constructs-concrete-adapters`, `feature-no-express-or-admin-imports`, and
  `site-dir-no-server-express-or-cli-imports` all reach **zero** violations and are safe to promote
  to `error`. `core-no-server-or-app-imports` cannot — it would still carry the one real,
  unresolved `appliers.ts` finding.
- **The `no-deep-imports` rule is designed and prototype-verified against committed HEAD** (§3),
  scoped to the 27 modules that actually have an `index.ts` today, with four evidence-backed
  exemption classes (composition roots, `db/sqlite` type-only port imports, the codebase-wide
  tool-registration seam, and `assistant/mcp-federation`'s plugin-registration seam).
- **The single biggest finding of this report: three architecture-trace documents already exist,
  dated today, covering 9 of the 27 guarded modules in exhaustive per-file Category 1/2/3 detail**
  (`2026-08-13-api-surface-trace-{A,B,assistant}.md`). They are the authoritative source for this
  rule's exception list, not something to re-derive — and they reveal that a single mechanical
  "forbid everything except the door" rule is **wrong for some modules and right for others**. Two
  modules (`comments`, `features/entries`) are fully clean **today** once the generic exemptions are
  applied — verified by running the prototype rule, not assumed. `features/taxonomy` is clean with
  one named exemption. `assistant` still shows 68 violations, all expected — the trace's own fix
  (a six-section `index.ts`) is what `FixAssistant` is mid-flight building right now. `widgets` and
  `features/recovery` are **deliberately excluded** from the guarded-module list — the trace read
  every file in both and found no barrel to bypass would be real narrowing (§3.4).
- **18 of the 27 guarded modules have not been traced.** Running the rule against them today
  produces 130 further violations (§3.5) that may be exactly like `appliers.ts` (real) or exactly
  like `widgets` (a module that shouldn't be guarded this way at all) — I don't know yet, and I did
  not guess. This is the main open item, not a footnote.
- **Phase 2 gate: HOLD.** Confirmed against live `git status`, not assumed — see §4.

---

## 1. Triage of the 51 existing violations

Verified live: `cd` into a clean `git archive HEAD` snapshot (not the working tree — see §4 for why
that distinction matters right now) and ran `npx depcruise --config .dependency-cruiser.cjs
--output-type json src`. **51 violations, 0 errors, 51 warnings** — matches the dispatch brief's
count exactly, confirming HEAD hasn't drifted on this axis since dispatch.

| rule | violation count | real / accepted / noise | disposition |
|---|---|---|---|
| `core-no-server-or-app-imports` | 24 | 22 accepted (test files) + **2 real** (`core/commands/appliers.ts`) | Exclude test files (→ 2 remaining). The 2 real ones need an owner decision — see §1.1. Do not promote to `error` until resolved. |
| `feature-no-express-or-admin-imports` | 1 | 1 accepted (test file, type-only) | Exclude test files (→ 0). Safe to promote to `error`. |
| `only-composition-constructs-concrete-adapters` | 25 | 22 accepted (test files) + **3 noise** (2 files: `adapter.sqlite.ts`, `html-document-store.ts`) | Exclude test files AND extend the `pathNot` naming exemption (→ 0). Safe to promote to `error`. See §1.2. |
| `site-dir-no-server-express-or-cli-imports` | 1 | 1 accepted (test file) | Exclude test files (→ 0). Safe to promote to `error`. |

### 1.1 The two real violations — `core/commands/appliers.ts`

`src/core/commands/appliers.ts` imports `PostRepoPort`/`classifyStatusTransition`/`PostStatus` from
`src/features/post` (via its barrel — this is a **layering** violation, not a deep-import one; going
through the door doesn't fix "core importing features" at all) and `SettingsRepoPort` from
`src/features/settings`. This is the inverse-applier registry for change-set reverts (ADR-018
C-005/C-006) — a compensation/rollback mechanism, which ADR-009 Decision §4 names as a legitimate
pattern ("multi-step operations needing rollback → compensation steps"). But the compensator itself
needs concrete entity-type knowledge (`PostRecord`, `classifyStatusTransition`) that only a feature
module owns, which is exactly the coupling `core-no-server-or-app-imports` exists to prevent.

**This is a real, unresolved architectural tension, not a false positive.** I did not fix it —
outside this report's surface (no production source changes) and it's a design decision, not a
mechanical one. Two directions an Architect could take, stated so the finding isn't just "there's a
problem":
1. **Invert the dependency.** `defaultRevertRegistry()` (which does the importing) could move to a
   composition-root file (`server/deps.ts`/`server/app.ts`, both already blessed to reach anywhere)
   that imports `createRevertRegistry` from `core` and `postUpdateReverter`/`postDeleteReverter`
   from `features/post`, wiring them together — composition is exactly a composition root's job.
   `core/commands/appliers.ts` itself would keep only `RevertRegistry`'s interface and the registry
   factory, dropping the feature imports entirely.
2. **Grant an explicit, documented exception** in `.dependency-cruiser.cjs`, on the reasoning that
   ADR-009 §4's compensation pattern is a named, accepted exception to §1's general rule — but this
   needs the same kind of explicit "why" comment the existing config already gives its other
   exceptions, not a silent `pathNot`.

I lean toward (1) — it doesn't require carving an exception into the rule at all, and the registry
pattern already exists specifically to decouple "what a reverter does" from "who wires it up" — but
this is an Architect/owner call, not mine to make unilaterally here.

### 1.2 The two config gaps — `adapter.sqlite.ts` and `html-document-store.ts`

Both are genuine concrete-adapter-behind-a-port files, same category the config's own comment
already carves out for `repo.*`/`search-index.*` ("a concrete storage adapter behind a port, under a
different name... exempted by name for the same reason `repo.*` is, not as a loosening"):

- `src/features/database/adapter.sqlite.ts` — its own header: "Infrastructure adapter, co-located
  with its port under `features/database`... the port here is this adapter's own invention." Same
  shape, different naming convention (`adapter.*.ts` vs `repo.*.ts`).
- `src/features/pages/html-document-store.ts` — its own header: "Bypasses `PostRepoPort`/
  `SqlitePostRepo`/... entirely, on purpose (ADR-056 Decision 4 & CIC-3): this store is the ONLY
  writer of `body_html`." Doesn't match any existing naming convention at all (no `.sqlite.ts`/
  `.memory.ts` suffix), so needs adding by name rather than by broadening the suffix pattern —
  consistent with the file's own precedent of exempting by name, not by loosening the regex.

**Recommended `pathNot` addition** (not yet applied — Phase 1 is design, not action):
```js
pathNot: "^src/features/.*/(repo|search-index)\\.(sqlite|memory)\\.ts$|^src/features/database/adapter\\.sqlite\\.ts$|^src/features/pages/html-document-store\\.ts$"
```

### 1.3 The test-file question

All 46 test-file violations are contract/integration tests instantiating a concrete adapter
(`db/sqlite/content-db.ts`, `db/schema.ts`) to exercise a real implementation against its port
contract — you cannot write a contract test without a concrete implementation. This is standard,
expected, and orthogonal to what these three rules exist to catch (production-code layering and
adapter-selection discipline). **Recommend `pathNot: ".*/__tests__/.*"` on `from` for all three
existing rules that still carry any test-file violations.** This is a config change, not yet
applied — Phase 1 is design, Phase 2 is action, and this specific change wasn't asked for in Phase 1,
so it's recorded here as a ready-to-apply recommendation rather than done unilaterally.

**This does NOT extend to the new `no-deep-imports` rule** — see §3.3 for why that's a deliberately
different call, not an inconsistency.

---

## 2. Severity recommendation

| rule | violations after test-exclusion + config-gap fix | promote to `error`? |
|---|---|---|
| `feature-no-express-or-admin-imports` | 0 | **Yes.** |
| `only-composition-constructs-concrete-adapters` | 0 | **Yes**, contingent on both the test-exclusion and the two-file `pathNot` addition landing first — promoting before that would immediately break `check:boundaries`. |
| `site-dir-no-server-express-or-cli-imports` | 0 | **Yes.** |
| `core-no-server-or-app-imports` | 2 (`appliers.ts`) | **No.** Promoting now means either CI goes red on landing, or the one real violation this rule exists to catch gets silently `pathNot`-ed away — the exact "tuned until it passes" anti-pattern the owner has flagged twice this session. Promote once §1.1 is resolved (either direction). |

A rule nobody can fail is documentation, not enforcement — REQ-11's Phase-0 "no CI pipeline exists
yet" justification for blanket `warn` no longer applies to three of these four rules; it still
applies to the fourth, honestly, not by omission.

---

## 3. The `no-deep-imports` rule

### 3.0 Scope: which modules have a door, at HEAD

Only modules with a committed `index.ts` are guarded — a module without a door has no door to
bypass. 30 `index.ts` files exist at HEAD; **3 are aggregator barrels, not domain modules, and are
excluded**: `src/index.ts` (the process entrypoint — also a blessed composition root, §3.1),
`src/core/index.ts` (`export * from "@jini-ai/cms/core"; export * from "./events"` — two lines,
nothing of its own to protect), and `src/features/index.ts` (`export * as <name> from "./<name>"`
per feature — purely re-exports its children's own doors). Guarding either would misfire: e.g.
`src/features/index.ts` guarded naively would flag `import {...} from "../../features/post"`
(resolving to `features/post/index.ts`, a legitimate door) as a violation of the `features` umbrella,
because the regex can't distinguish "the umbrella's own internals" from "a child's own front door."

**27 guarded modules** (leaf/domain modules only): `analytics`, `assistant`, `comments`,
`core/commands`, `core/events`, `features/commerce`, `features/content-types`,
`features/deployments`, `features/entries`, `features/pages`, `features/post`,
`features/presentation`, `features/settings`, `features/taxonomy`, `features/theme`,
`features/workspace`, `headless`, `http`, `integrations`, `mail`, `media`, `members`, `navigation`,
`origin`, `redirects`, `routing`, `seo`, `widgets/resolvers`.

Notably **not yet guardable** because they have no door at HEAD (untracked, mid-flight):
`forms`, `newsletter`, `site-dir` — `FixLeakyA` is actively adding these three right now.

### 3.1 Same-module and composition-root imports stay allowed

Same-module: `from.pathNot` excludes the module's own path prefix — a file importing its own
sibling (including its own tests, which live inside the module's directory) is never a boundary
crossing.

Composition roots: `src/index.ts`, `src/server/app.ts`, `src/server/deps.ts` are exempted from the
`from` side of every rule, globally. This isn't a new concept — it's the existing config's own
"only-composition-constructs-concrete-adapters" rule naming this exact set ("Only bootstrap/
composition modules... may select production implementations directly"). Verified necessary, not
assumed: `server/app.ts`/`server/deps.ts` deep-import `assistant/persistence/store-factory`,
`assistant/*.memory.ts`, `assistant/public-assistant-settings`, `assistant/execution-mode-settings`;
`src/index.ts` deep-imports `assistant/daemon-auth` and `assistant/daemon-exit-codes` — both of which
**are** already re-exported through `assistant/index.ts`, so without this exemption the process
entrypoint itself would immediately trip the rule it's supposed to help enforce.

### 3.2 Type-only imports: in scope, not exempted

Decision: a type-only deep import is still a deep import and is still forbidden by the general rule
(the two narrow carve-outs in §3.1/§3.3 for `db/sqlite` are the only place type-only status changes
the outcome). Reasoning:
- A type-only import is still a compile-time contract — if the internal type's shape changes, the
  importer breaks, even with zero runtime coupling. ADR-009 §1 doesn't qualify "public surface" by
  dependency kind.
- `.dependency-cruiser.cjs`'s existing `options.tsPreCompilationDeps: true` already makes the tool
  resolve type-only edges as first-class dependencies — the config already treats them as real.
- `check:architecture`'s `moduleApiSurfaceFiles` metric (which this rule is meant to make failable
  at authorship, not just after the fact) already counts type-only edges. A lint that stayed silent
  on type-only deep imports while the metric it's supposed to gate keeps counting them would be
  incoherent — CI green, ratchet still moving.

### 3.3 Test files: in scope for THIS rule, unlike the three existing rules

This is a deliberately different call from §1.3, not an inconsistency, and the reasoning is
different too: the existing 3 rules are about **production architecture** (layering, adapter
selection) — concerns a contract test's own concrete-adapter need is legitimately orthogonal to.
`no-deep-imports` is about **module surface** — and a test reaching past another module's door into
its internals creates exactly the same fragile coupling a production file would: if the internal
file moves, the test breaks even though nothing about the module's actual contract changed. The
modules most of these violations reach into (`src/db/*`) have no door in the first place, so this
distinction turns out to matter less in practice than it sounds — but where it does matter (see
§3.5's `assistant`-adjacent test files), the rule still fires, and I did not special-case it away
without evidence.

One narrow, evidence-driven exception to this: §3.5's tool-registration **contract tests**
specifically (not test files in general) get the same broad access their production counterpart's
seam implies — see §3.5.

### 3.4 `db/sqlite`: type-only yes, value no

`db/sqlite/*.ts` adapters implement other modules' port interfaces by definition (ports-and-adapters)
and legitimately need the port TYPE from wherever it's declared — even when that declaration isn't
exported through the module's general barrel — but never a runtime VALUE, which would be reaching
for behavior instead of a contract. Evidenced today, all `import type`:
`execution-credential-repo.sqlite.ts`, `external-mcp-repo.sqlite.ts`, `site-credential-repo.sqlite.ts`
(→ `assistant` internals), `origin-repo.sqlite.ts` (→ `origin/types`, `origin/ports`),
`analytics-sink.sqlite.ts` (→ `analytics/ports`, `analytics/types`),
`media-provider-credential-repo.sqlite.ts` (→ `media/provider-credential-store`). Confirmed
independently and then found stated as settled architecture in
`2026-08-13-api-surface-trace-assistant.md` §3.2, verbatim: *"This is the textbook-correct hexagonal
direction: the consumer of a port defines its shape; the adapter imports that shape to implement
it."* That same section also names the one case this exemption must NOT cover:
`db/sqlite/database-journal-repo.ts` importing from `features/database` was separately flagged
(2026-08-13-architecture-audit.md, not re-verified here, cited as input) as backwards, because those
port types describe infrastructure concerns that arguably belong to `db` itself. This doesn't
collide with the exemption as designed: `features/database` has no `index.ts` at HEAD, so it isn't a
guarded module in the first place — the exemption can't accidentally launder an already-flagged bad
case it structurally can't reach.

**Encoding:** dependency-cruiser's `dependencyTypesNot: ["type-only"]` matcher (confirmed valid
usage — it's in the tool's own `init-config` template, not invented) lets this be one precise,
structural rule rather than a per-file allowlist: `db/sqlite` is excluded from each guarded module's
main rule, then re-policed by a second rule scoped to `from: db/sqlite` that fires only on non-
type-only (`dependencyTypesNot: ["type-only"]`) targets.

### 3.5 The tool-registration seam — codebase-wide, not module-specific

**The largest single pattern in the raw violation data**, and it is deliberate, not scattered debt.
Confirmed by reading `assistant/tool-registrations.ts` directly: **all 22 domains** are imported as
`../<domain>/tool-registrations`, a hardcoded uniform block — and `features/taxonomy/index.ts`'s own
header names it explicitly: *"`tool-registrations.ts`... is the seam `assistant/tool-registrations.ts`
reaches uniformly across domains."* All three trace reports independently confirm the same for their
own modules (comments, forms, newsletter, widgets, entries, recovery). This is a second, deliberate
public surface, parallel to a module's `index.ts` — one this rule needs to recognize by convention,
not by an ever-growing per-module allowlist.

Two callers, two different access levels, both evidence-driven (found by running the prototype, not
assumed up front):
- **`assistant/tool-registrations.ts`** (production): restricted to files literally named
  `tool-registrations.ts` or `agent-tools.ts` within the target module — the declared seam, nothing
  wider.
- **`assistant/__tests__/tool-registrations.*.test.ts`** (the seam's own contract tests): full access
  to their target module, matching the existing contract-test pattern (§1.3). Found necessary by
  running the prototype: `tool-registrations.comments.test.ts` reaches `comments/{hooks,repo.memory,
  settings,types,write-service}.ts` — well past the seam files — to build realistic fixtures and
  verify registered-tool behavior end-to-end, the same category of need as a repo-contract test
  needing the real concrete adapter.

### 3.6 `assistant/mcp-federation` — a named plugin-registration seam

`2026-08-13-api-surface-trace-assistant.md` §3.2 confirms `mcp-federation/{config,presets}.ts` by
name as Category 3 ("a first-party plugin module registering itself against a public registry...
correct today and needs no fix"), citing the file's own header: *"the seam that lets a concrete
vendor integration live OUTSIDE `src/assistant/`... a preset imports core and announces itself; core
never learns any vendor's name."* Running the prototype found two more files in the same seam that
the trace's own 59-edge metric doesn't count (because that metric excludes test files by design):
`supabase-mcp-plugin.test.ts` also imports `mcp-federation/ports.ts` and `mcp-federation/trust.ts`.
Extended the exemption to all four for the same reason the trace gives the first two.
`adapter.stdio.ts`, `adapter.memory.ts`, `registrations.ts`, `bootstrap.ts` are not reached from
outside `assistant` anywhere in the codebase today and stay guarded.

### 3.7 `widgets` and `features/recovery` — deliberately not guarded

Both have real, large internals (16 files/45 edges and 8 files/12 edges) and **no `index.ts`** at
HEAD. `2026-08-13-api-surface-trace-B.md` read every file in both and found genuine
one-capability-per-file, one-consumer-per-file shapes with no pre-existing barrel being bypassed —
verbatim: *"Adding an `index.ts` that re-exports all of it and redirecting every current importer
would relabel the exact same 16 files' worth of commitment under one file path without removing
anything."* This matters for the rule design specifically: it's the clearest evidence that "does the
module have a door" cannot be the only criterion for whether a mechanical no-deep-imports rule is
even the right tool for a given module — sometimes the honest finding is that a door would be
theater. Both stay outside `GUARDED_MODULES`, matching the trace's own recommendation.

### 3.8 Full prototype-verified results (against committed HEAD)

Ran the fully-assembled rule (generic exemptions §3.1–3.6 + module-specific exemptions sourced from
the three trace reports for the 4 modules they cover that currently have a door — `comments`,
`features/entries`, `features/taxonomy`, `assistant`) against the same HEAD snapshot as §1.

**The 4 traced-and-guarded modules:**

| module | violations | what's left |
|---|---|---|
| `features/entries` | **0** | Fully clean — the entries→barrel migration (`c3c030a`, already committed) plus the generic exemptions fully resolve it. |
| `features/taxonomy` | **0** | Clean with one named exemption (`gated-hooks.ts`, per the module's own header — §1.1-style composition-over-a-host-owned-kernel). |
| `comments` | **5** | All 5 are exactly `2026-08-13-api-surface-trace-A.md`'s Category-1 "wrong door" findings (`ports.ts`/`types.ts`/`write-service.ts` reached by `server/routes/admin/comments/*` and `comments-submit.ts`) — the fix `FixLeakyA` is mid-flight on right now (uncommitted in the working tree as of this report). Expected to reach 0 once that lands. |
| `assistant` | **68** | Matches `2026-08-13-api-surface-trace-assistant.md`'s own count almost exactly (59 edges via its test-excluding metric; 68 here because this rule doesn't exclude tests, §3.3). All traced, all Category 2 ("route through `assistant/index.ts`") or already-exempted Category 3. This is `FixAssistant`'s in-flight six-section barrel — expected to collapse toward the trace's own target (0–3) once that lands. |

**The 14 untraced guarded modules with residual violations** (130 total, sample-checked, not
individually triaged): `integrations` (53), `features/post` (25), `features/content-types` (13),
`analytics` (10), `media` (7), `origin` (5), `widgets/resolvers` (3), `features/commerce` (2),
`features/theme` (2), `features/settings` (1), `members` (1), `redirects` (1), `routing` (1), `seo`
(1). Sample-checked `features/post` (largest non-`assistant`/`integrations` entry) to see whether the
pattern looks like known-safe residue or something new: it is something new — `src/seo/{seo,sitemap,
types,write-service}.ts` and `src/routing/{ports,routing}.ts`, all **production** files (not tests,
not composition roots), import `features/post/post.ts` directly. This may well turn out to be exactly
the kind of thing the rule should catch (a real missing door), or it may be a `widgets`-shaped case
(genuinely fine, barreling would be theater) — **I don't know, and did not guess.** The other 13
modules were not sample-checked at this depth; 5 (`seo`, `http`, `mail`, `members`, `navigation`,
`media` — 6, per `2026-08-13-api-surface-trace-assistant.md`'s own citation) already have a curated
`index.ts` per that report, so their residue is plausibly small/known-shaped, but that's an inference
from a citation about a different metric, not a checked fact — flagging the distinction rather than
blurring it.

### 3.9 Prototype implementation

The full generator (module list, exemption constants, per-module rule generation) is written and
verified working at
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/277dec4a-e3ce-449c-b55b-4e91a6236db9/scratchpad/head-snapshot/.dependency-cruiser.prototype.cjs`
(scratchpad — not committed, not the real config). It is not reproduced inline here because it is
~100 lines and this report is long enough; the design decisions it encodes are all in §3.1–3.7 above
and are what should be reviewed, not the JS syntax. It is ready to be adapted into
`.dependency-cruiser.cjs` once Phase 2 is unblocked and the module list in §3.8 is either accepted as
a first pass or expanded with more trace work first (see §5).

---

## 4. Phase 2 gate — HOLD

Checked live, not assumed from the dispatch brief's snapshot: `src/features/taxonomy/**` and
`src/features/entries/**` are clean (both fixes landed as commits `67885ab` and `c3c030a` since
dispatch). But `src/forms/index.ts`, `src/newsletter/index.ts`, `src/site-dir/index.ts` are still
**untracked** (`FixLeakyA` hasn't committed them), and dozens of files across
`src/server/routes/admin/{comments,forms,newsletter}/**`, `src/server/routes/site/{comments,forms,
newsletter}*.ts`, `src/server/modules/{assistant,assistant-byok,site-assistant}.ts`,
`src/server/{app,deps}.ts`, `src/index.ts`, and `src/server/routes/types.ts` are modified but
uncommitted — `FixLeakyA` and `FixAssistant` are both still actively redirecting edges as of this
report. Per the dispatch brief's explicit instruction, **holding — not implementing the rule in the
real `.dependency-cruiser.cjs` this session.**

---

## 5. What's next (not started, for whoever picks this up)

1. **Land `FixLeakyA`/`FixAssistant`**, then re-run the §3.8 prototype against the new HEAD.
   `comments` should reach 0; `assistant` should collapse toward 0–3; `forms`/`newsletter`/`site-dir`
   become guardable for the first time.
2. **Owner decision on `core/commands/appliers.ts`** (§1.1) — blocks promoting
   `core-no-server-or-app-imports` to `error`.
3. **Apply the test-exclusion + two-file exemption to the 3 existing rules** (§1.3, §1.2) and promote
   3 of the 4 to `error` (§2) — this part has no dependency on the churn and could happen
   independently of everything else in this report.
4. **Trace the remaining 14 modules with residual violations** (§3.8) the same way the three existing
   reports did, before trusting the new rule's count for them, let alone promoting any of them past
   `warn`. `features/post` is the natural next target — it's the largest untraced module and the one
   sample-check already found a real, non-composition-root, non-test production coupling
   (`seo`/`routing` → `features/post/post.ts`) that needs the same file-by-file judgment call the
   existing traces gave `comments`/`forms`/`newsletter`/`site-dir`/`assistant`.
