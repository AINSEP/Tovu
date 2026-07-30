# Code Review Report — SPEC-003 site-install-dir

- Feature: FEAT-003 — site-install-dir (`tovu init` / `tovu serve` / `tovu --help`)
- Spec ID / Version: SPEC-003 v1.0.0
- Active Spec Hash: `sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142`
- ADR: ADR-PIPE-003 v1.1.0
- Reviewed by: Code Review Agent
- Reviewed at: 2026-07-28
- Review pass: **first ever for this feature** (no prior CR findings to check for recurrence)
- Overall verdict: **CHANGES REQUIRED — not ship-ready**

## Skills Loaded

Bootstrap `AI-Dev-Shop/agents/code-review/skills.md` loaded before any work, plus the conditional
skills named in the dispatch: `general-behavior`, `code-review`, `architecture-decisions`,
`test-design`, `coding-foundations`, `testable-design-patterns`, `function-quality-assessment`,
`spec-writing`.

**Activation check on the two skills the dispatch predicted would not activate — I agree, with one
qualification.** `frontend-accessibility` does not activate: the diff contains zero frontend
components (`apps/admin/**` changes in the working tree belong to SPEC-043/SPEC-005, not this
feature). `api-design` does not activate for the HTTP surface — SPEC-003 adds no routes and changes
no response shapes. It is worth recording that this feature *does* introduce a new **public
contract** — the CLI exit-code/stderr registry and the two install-dir JSON file schemas, which
`api.spec.md` §7 explicitly designates a compatibility surface shared with the future desktop host.
I reviewed that contract under Spec Alignment and Architecture Adherence rather than under
`api-design`, whose subject matter (pagination, HTTP error model, webhook semantics, SDK
ergonomics) genuinely does not apply.

---

## Workflow Step 0 — Verification Packet Validation

Packet: `ADS-memory/reports/pipeline/003-site-install-dir/verification-packet.md`
(created 2026-07-29T00:25:00Z, Coordinator-owned).

| Check | Result |
|---|---|
| Verification PASS for the active spec hash | PASS — hash matches `feature.spec.md` line 15 |
| Advisory-only review requested | No — full evidence expected and supplied |
| Mechanical spec-hash verification | Present (`validate_spec_package.py --phase spec --print-hash`) |
| Certified test-file hashes match on-disk | PASS — 13/13, with the 4 post-recert digests re-verified by Coordinator |
| Executed vs expected test count | 71/71 — at expected, not below |
| Required suites (unit, integration) | Both PASS with fresh coverage artifacts |
| E2E | N/A with a recorded `tasks.md` reason (no browser surface on a CLI/filesystem feature) — acceptable per the skill's N/A rule |
| Coverage gates | PASS on owner-accepted real-source-arm figures |
| Flaky tests | None found or registered |
| Zero-test / empty-suite check | PASS (0 skipped, 0 cancelled) |

**Packet accepted as fresh and complete.** No workflow finding blocks the implementation review.

Two evidence-integrity notes, neither of which changes the verdict:

1. **Packet/certification numeric disagreement on integration branches (see CR-R11).** The packet
   reports `273/334 raw (81.74%) / 273/288 real (94.79%)`; `test-certification.md` §Coverage Gates
   reports `272/333 as measured / 155/171 real (90.64%)`. The packet is supposed to be *derived
   from* the certification, so the two should agree. Both figures clear the 90% integration gate, so
   the conclusion is unaffected — but a derived artifact disagreeing with its source is worth
   correcting before it is cited again.
2. **Coverage-gate mechanical analysis sanity-checked, not re-litigated** (per dispatch
   instruction). The esbuild/CommonJS-interop attribution argument is sound and independently
   verifiable: I confirmed the claim's load-bearing premise — that `resolve-workspace.ts` and
   `schema-guard.ts` report 100% lines *and* 100% functions while reporting 85.71% / 82.61%
   branches. A function with full line and full function coverage has no unexecuted source in it, so
   the residual arms cannot be reachable source behavior. The owner-accepted conclusion stands.

---

# Findings

Ordered by severity. Required findings block progression; Recommended findings do not.

---

## REQUIRED

### CR-R01 — `tovu serve` is non-functional outside the repo checkout (HTTP 500), and media writes escape the install dir

```
ID:          CR-R01
Severity:    Required
Dimension:   Spec Alignment / Non-Functional Characteristics
File:        src/server/deps.ts:106-113 (mediaUploadsDir, builtInThemesDir)
             src/cli/commands/serve.ts:83-85 (the serve path's wiring into them)
```

**Finding**

`tovu serve <dir>` resolves both the theme directory and the media blob root from
`process.cwd()`, not from the install dir:

```typescript
// src/server/deps.ts:106-113
export function mediaUploadsDir(): string {
  return process.env.TOVU_MEDIA_UPLOADS_DIR ?? join(process.cwd(), "uploads");
}
export function builtInThemesDir(): string {
  return process.env.TOVU_THEMES_DIR ?? join(process.cwd(), "themes");
}
```

The install dir's own `themes/` and `uploads/` directories are created by `init` (AC-14) and then
never read or written by `serve`.

**Evidence — reproduced directly, not inferred**

Serving a freshly-initialized install dir from a working directory that is not the Tovu repo root:

```
$ cd "$(mktemp -d)"
$ tovu serve /tmp/.../site --port 57010
tovu serve: dir=/tmp/.../site port=57010 schemaVersion=18 workspaceId=workspace-local
$ curl http://127.0.0.1:57010/
status=500
<h1>No themes installed</h1>
```

The same install dir served from the repo root returns 200 — the only difference is `process.cwd()`.
`discoverThemes` returns `[]` when its directory does not exist (`src/features/theme/theme.ts:200`),
and the seeded site's `activeThemeId` is `tovu-official`, which lives in the repo's `themes/`.

**Impact**

This defeats the feature's own stated success signal (`feature.spec.md` line 40: *"From a clean
checkout: `tovu init demo && tovu serve demo` serves the seeded site…"*) for every invocation that
is not run from inside the Tovu repo — which is every invocation of the `bin` executable REQ-09
exists to ship. It also breaks:

- **AC-10 / REQ-08** — *"moved to a different absolute path and served… all content, settings, and
  behavior are identical."* A moved dir served from a different CWD returns 500 instead of the site.
- **INV-01** (absolute invariant: *"`init` and `serve` must never write any file outside the target
  install dir"*). `LocalFsBlobStore` is constructed with `rootDir: mediaUploadsDir()` and writes on
  `put()` (`src/media/blob-store.fs.ts:37-42`). A media upload during `tovu serve <dir>` therefore
  lands in `$CWD/uploads/`, outside the install dir. The media *pipeline* is out of scope per the
  spec, but the routes are wired and live in the served app, so the path is reachable today.

Per finding-classification rule 3a, a code path that can violate a spec-defined invariant is
Required, not Recommended — and here the headline user journey is broken outright, independent of
the invariant question.

**Required Action**

Scope both roots to the resolved install-dir target on the `serve` path. `resolveInstallDirTarget`
already gives `runServeCommand` the correct `target`; pass `path.join(target, "themes")` and
`path.join(target, "uploads")` through to the composition root the same way `dbPath` already is.
Theme discovery likely needs to merge built-in repo themes with the site's `themes/` rather than
replace them — that is a design decision the Architect should confirm, since SPEC-004 owns the
themes-dir contract and this feature only promised to *create* the directory.

**Suggested Next Route**

Software Architect to rule on built-in-vs-site theme precedence (this touches SPEC-004's boundary),
then Programmer. Coordinator classification: `ARCHITECTURE_REVIEW_REQUIRED`, then
`IMPLEMENTATION_FIX_REQUIRED`.

---

### CR-R02 — `tovu serve` writes files into the install dir beyond the REQ-01 layout (INV-04)

```
ID:          CR-R02
Severity:    Required
Dimension:   Spec Alignment
File:        src/server/deps.ts:141-143 (defaultDatabaseJournalDbPath)
             src/server/deps.ts:355-357 (mkdirSync + openDatabaseJournalDb)
             src/cli/commands/serve.ts:83-84 (dbPath now points inside the install dir)
```

**Finding**

REQ-01 defines the install dir as *"exactly"* seven entries and states *"No other files are required
or created."* INV-04 is tighter still: *"`content.db` must be the only file inside the install dir
that `serve` writes to… plus the `schemaVersion` and `schemaTag` fields of `.site-meta.json`."*

`serve` violates both.

**Evidence — reproduced directly**

```
after init:                          after serve:
  .site-meta.json                      .site-meta.json
  config.json                          config.json
  content.db                           content.db
  overrides/                           content.db-shm
  plugins/                             content.db-wal
  themes/                              content.db.snapshot-comments-1785284817219
  uploads/                             content.db.snapshot-newsletter-1785284817123
                                       ops/          <-- database-journal.db{,-shm,-wal}
                                       overrides/
                                       plugins/
                                       themes/
                                       uploads/
```

`ops/database-journal.db` is created because `defaultDatabaseJournalDbPath` derives from
`dirname(contentDbPath)`, and SPEC-003 is the first feature to make `contentDbPath` point *inside* an
install dir. The `content.db.snapshot-*` files are `declareDataModule()` pre-migration snapshots that
are never cleaned up. (I verified the snapshots do not accumulate across restarts — a second serve
produced no new ones — but they persist permanently.) The WAL sidecars (`-shm`/`-wal`) are inherent
to SQLite WAL mode and I do not consider them a violation.

Note that `deps.ts:135-140`'s own comment asserts the journal *"lives as a sibling of `content.db` in
the install-dir tree, never inside it"* — accurate about the *file* (it is a separate SQLite file),
but the directory it creates does land inside the install dir, which is what INV-04 constrains.

**Impact**

`state.spec.md` §1 is the ADR-011 portability contract with the desktop host, and `feature.spec.md`
line 38 says freezing that layout early *is the point of the feature*. Shipping a layout whose real
post-serve contents differ from the frozen contract means the host integration will be written
against a spec that the runtime does not honor. The spec's Agent Directives also require *"Ask
before: adding any field to `config.json` or `.site-meta.json` beyond REQ-01 (each is a
compatibility-surface change)"* — adding whole directories is a strictly larger change than adding a
field, and it was not surfaced.

**Required Action**

Decide and record which of these is intended, then make the spec and the code agree:
(a) amend REQ-01 / `state.spec.md` §1 / INV-04 to include `ops/` and the snapshot files as part of
the frozen layout; or (b) relocate the ops journal and snapshots outside the install dir on the
serve path. Option (a) is probably right — an ops journal that survives a `content.db` restore is
genuinely site-scoped state and belongs in the folder — but it is a compatibility-surface decision,
not a Programmer call.

**Suggested Next Route**

Spec Agent (layout contract) with Software Architect input on ADR-041's sidecar placement.
Coordinator classification: `SPEC_REVISION_REVIEW_REQUIRED`.

---

### CR-R03 — the install-dir serve path skips ADR-023 §2's mandatory boot-time dataModule migration recovery

```
ID:          CR-R03
Severity:    Required
Dimension:   Architecture Adherence
File:        src/site-dir/boot-site-dir.ts:77
Compare:     src/server/deps.ts:175-186 (legacy path)
```

**Finding**

The legacy composition path passes a recovery hook that the codebase itself documents as mandatory:

```typescript
// src/server/deps.ts:175-186 — legacy default branch
openContentDb(dbPath, { workspace: seededWorkspace, ... },
  // ADR-023 §2 — mandatory, blocking boot-time recovery for any crash-interrupted dataModule
  // DDL attempt, before the site opens to end users.
  recoverIncompleteDataModuleMigrations
);
```

The install-dir path does not:

```typescript
// src/site-dir/boot-site-dir.ts:77
db = openContentDb(dbPath);
```

Because the `overrides.db` branch hands `createSqliteRouteDeps` an already-open handle, the legacy
call site is bypassed entirely — and `recoverIncompleteDataModuleMigrations` must run *before* any
connection opens the file (`content-db.ts:65`: `if (recover) recover(filePath)` precedes
`new Database(filePath)`), so it cannot be retrofitted downstream in `deps.ts`.

**Impact**

`tovu serve` — the only supported way to run a real site — never recovers a crash-interrupted
dataModule DDL. The snapshot files this recovery mechanism restores from are demonstrably being
*created* on this path (see CR-R02's evidence: `content.db.snapshot-comments-*`,
`content.db.snapshot-newsletter-*`), so the write half of the mechanism is live while the recovery
half is silently absent. A site that crashes mid-`declareDataModule` serves a half-migrated schema
with no recovery, indefinitely.

This is an architectural violation in the precise sense the skill defines: an ADR-recorded,
explicitly-mandatory boot step is absent from a new boot path. ADR-PIPE-003's own framing — that the
new path *"wraps, not redesigns, the existing composition root"* — is what makes this a defect: a
wrapper that drops a mandatory step of the thing it wraps is not a wrapper.

**Required Action**

Inject the recovery hook into `bootSiteDir`'s `openContentDb` call. To keep `site-dir` decoupled
from `features/plugins/**` (consistent with the module's stated design and with ADR-042 item 3's
dependency-inversion rationale in `content-db.ts:54-61`), prefer passing it in as an optional
parameter from `cli/commands/serve.ts` rather than importing it inside `site-dir`. Add a
regression test asserting the hook runs on the `bootSiteDir` path.

**Suggested Next Route**

Programmer, then TDD for the regression test. Coordinator classification:
`IMPLEMENTATION_FIX_REQUIRED`.

---

### CR-R04 — the built `tovu` executable cannot run: `npm run build` does not emit the Drizzle assets

```
ID:          CR-R04
Severity:    Required
Dimension:   Spec Alignment (REQ-09 / AC-12) / Non-Functional
File:        package.json (build script, bin entry)
             src/site-dir/schema-guard.ts:26
             src/infra/sqlite/content-db.ts:45
```

**Finding**

REQ-09 requires *"a `tovu` executable (`bin` in package.json → built CLI)"*, and AC-12 is written
*"Given the built package."* The built package does not work.

Both `schema-guard.ts:26` (`path.resolve(__dirname, "../infra/drizzle/meta/_journal.json")`) and
`content-db.ts:45` (`path.resolve(__dirname, "../drizzle")`) resolve non-TypeScript assets relative
to their own emitted location. `tsc` emits only `.js`/`.d.ts`; the build script copies only
`templates/`:

```
"build": "tsc -p tsconfig.json && mkdir -p dist/templates && cp -R templates/. dist/templates/"
"bin":   { "tovu": "dist/src/cli/main.js" }
```

**Evidence — built to a scratch outDir and inspected**

```
$ npx tsc -p tsconfig.json --outDir /tmp/cr-dist
tsc exit=0
$ ls /tmp/cr-dist/src/cli/main.js
/tmp/cr-dist/src/cli/main.js                      <-- emitted
$ ls /tmp/cr-dist/src/infra/drizzle/meta/_journal.json
MISSING                                            <-- not emitted
$ ls /tmp/cr-dist/src/infra/drizzle/
MISSING                                            <-- whole directory absent
```

**Impact**

The installed `tovu` binary fails on **both** commands, not just an edge case:
`tovu init` calls `runtimeSchemaVersion()` at BR-01 step 8 and `tovu serve` calls it at BR-05 step 4
/ the boot log; each hits `ENOENT` on `_journal.json` and exits 1 with `tovu: INTERNAL: …`. Even had
that resolved, `migrate()` would then find no migrations folder.

This is a pre-existing repo packaging gap (`npm start` → `node dist/src/index.js` has the same
defect), not something SPEC-003 introduced. But SPEC-003 is what makes it in-scope: this feature adds
the `bin` entry and asserts REQ-09/AC-12 against "the built package." The build script's existing
`cp -R templates/.` line shows the author was already aware assets need explicit copying and simply
missed the second asset tree.

Test quality note: AC-12's test (`help-and-unknown-command.integration.test.ts:31`) spawns
`node --import tsx src/cli/main.ts` — the TypeScript source — so it cannot detect this. That is a
reasonable choice for fast tests but it means AC-12's "Given the built package" clause is unverified.

**Required Action**

Extend the build script to copy `src/infra/drizzle/` into `dist/src/infra/drizzle/` (same pattern as
the existing `templates/` copy). Add one smoke test that runs the **built** `dist/src/cli/main.js`
for at least `--help` and one real `init`, so REQ-09/AC-12's "built package" clause has actual
coverage.

**Suggested Next Route**

Programmer for the build script; TDD for the built-binary smoke test. Coordinator classification:
`IMPLEMENTATION_FIX_REQUIRED` + `TDD_RECERTIFICATION_REQUIRED`.

---

### CR-R05 — no test asserts install-dir state or served behavior after `serve`; AC-10 is only proven at the `site-dir` layer

```
ID:          CR-R05
Severity:    Required
Dimension:   Test Quality
File:        src/site-dir/__tests__/integration/init-site.integration.test.ts:36-38
             src/site-dir/__tests__/integration/portability-moved-dir.integration.test.ts:31-70
             src/cli/__tests__/integration/serve-command.integration.test.ts (all cases)
```

**Finding**

The suite asserts the exact REQ-01 layout **after init**:

```typescript
// init-site.integration.test.ts:37-38
const entries = fs.readdirSync(target).sort();
assert.deepEqual(entries, [".site-meta.json", "config.json", "content.db",
                           "overrides", "plugins", "themes", "uploads"].sort());
```

There is no equivalent assertion **after serve**, and no test exercises `serve` from a working
directory other than the repo root. Every CLI test spawns via `spawnSync(process.execPath, …)`,
inheriting the runner's CWD — which is always the repo root, where `themes/` happens to exist.

`portability-moved-dir.integration.test.ts` is the designated AC-10 test, but it calls `bootSiteDir`
directly and asserts only db rows, `config.name`, and the absence of stale absolute paths in the two
JSON files. AC-10's actual wording is *"all content, settings, **and behavior** are identical"* — no
assertion covers served behavior.

**Impact**

These two gaps are precisely why CR-R01 and CR-R02 reached a PASS verification with 71/71 green and
both coverage gates satisfied. This is the case the skill describes as the core value of code
review: the tests are green and the requirement is unmet. Both gaps are cheap to close and would
have caught real defects, so they are not "more coverage for its own sake."

Per the skill's P1 assertion-coverage rule: AC-10 is a P1 acceptance criterion whose asserted values
(db rows, config name) do not trace to the AC's stated outcome ("behavior"). It does not currently
have inspectable P1 coverage.

**Required Action**

1. Assert the post-serve install-dir contents against an explicit expected set, so any future
   addition to the frozen layout must be a deliberate spec change rather than a silent one.
2. Add an AC-10 case that spawns `tovu serve` with `cwd` set to a directory outside the repo and
   asserts a 200 on the seeded route — the same shape as the existing
   `AC-08 (CLI-specific slice)` test, plus a `cwd` option on the spawn.
3. Keep the existing `bootSiteDir`-level portability test; it is good and should not be replaced,
   only supplemented.

**Suggested Next Route**

TDD Agent. Coordinator classification: `TDD_RECERTIFICATION_REQUIRED`.

---

### CR-R06 — every assessed unit scores 100/100 with no handoff table and no score-skepticism pass, and the review found real defects inside those units

```
ID:          CR-R06
Severity:    Required
Dimension:   Function Quality Assessment
File:        (process artifact — no Programmer handoff table or progress ledger exists)
```

**Finding**

All 20 annotated assessment units across ~1,100 lines of new production code carry
`@overallScore 100`. `function-quality-assessment` requires that a non-trivial change where every
unit scores 100/100 be accompanied by a documented **score skepticism pass** re-checking
requirements, edge cases, scale, hidden dependencies, error paths, and coverage. It also requires a
compact function-quality handoff table.

Neither exists. The dispatch confirms no Programmer handoff table or progress ledger is known for
this feature (built in a prior session).

**Impact**

Ordinarily a missing process artifact would be a Recommended finding. Here it is substantiated: the
skepticism pass is exactly the mechanism that would have surfaced CR-R01, CR-R02, and CR-R03, and
all three sit inside units annotated `@overallScore 100`:

| Unit | Claimed | This review | Defect the 100 concealed |
|---|---:|---:|---|
| `runServeCommand` (`cli/commands/serve.ts:76`) | 100 | **72** | CR-R01 — serve returns 500 outside the repo CWD; media writes escape the install dir |
| `bootSiteDir` (`site-dir/boot-site-dir.ts:58`) | 100 | **78** | CR-R03 — skips ADR-023's mandatory recovery hook |
| `readSiteDir` (`site-dir/read-site-dir.ts:81`) | 100 | **85** | CR-R09 — `.site-meta.json` bare-cast at a compatibility boundary |
| `initSite` (`site-dir/init-site.ts:113`) | 100 | **88** | CR-R07 — CC ≈ 9, undocumented |
| `mapErrorToCliOutcome` (`cli/errors.ts:84`) | 100 | **86** | CR-R07 — CC ≈ 11, undocumented; one unreachable defensive branch |
| `resolveInstallDirTarget` (`site-dir/resolve-install-dir-target.ts:40`) | 100 | **88** | CR-R07 — CC = 5, undocumented |

This is not score-padding in the abstract; two units scored 100/100 contain defects that make the
feature's headline command non-functional for its intended users.

I want to be fair about what the annotations get right: the `@complexity` and `@throws` docblocks
throughout `site-dir/**` are unusually good — they document ordering constraints, CIC references,
and deliberate deviations with real reasoning. The problem is narrow and specific: the *numeric
score* was not earned, and the skepticism pass that exists to catch exactly that was not run.

**Required Action**

Programmer to produce the function-quality handoff table and a documented score-skepticism pass
covering at minimum the six units above, re-scored honestly, alongside the CR-R01/R02/R03 fixes.

**Suggested Next Route**

Programmer. Coordinator classification: `IMPLEMENTATION_FIX_REQUIRED`.

---

### CR-R07 — cyclomatic complexity > 4 without documented justification in three units

```
ID:          CR-R07
Severity:    Required
Dimension:   Test Quality (coverage-friendly design) / Code Quality
File:        src/site-dir/init-site.ts:113-182            (CC ≈ 9)
             src/cli/errors.ts:84-126                     (CC ≈ 11)
             src/site-dir/resolve-install-dir-target.ts:40-66 (CC = 5)
```

**Finding**

`testable-design-patterns` sets CC > 4 in any in-scope function as a hard refactor trigger, and the
`code-review` skill lists "CC > 4 without documented justification" among the coverage anti-patterns
that are **Required** findings. All three units exceed it; none documents a CC justification.

The `@complexity` tags present on all three describe *algorithmic* complexity ("Bounded", "O(1)"),
which is a different property and does not satisfy the requirement.

**Impact — differentiated per unit, because the right remedy differs**

- `mapErrorToCliOutcome` (CC ≈ 11) is a flat `instanceof` dispatch chain. High CC here is not mixed
  concerns and decomposition would make it worse. The honest remedy is either a documented
  justification or a table-driven map from error constructor to `{code, exitCode}`. I would not
  block on this one alone. It does contain one genuinely unreachable defensive branch (`errors.ts:98`
  — the "any other commander-internal error" fallback, unreachable once the two code sets above it
  are exhaustive for a two-command program), which is a separate banned anti-pattern.
- `initSite` (CC ≈ 9) is the one where the trigger is doing real work: the function interleaves name
  validation, target validation, six ordered mutation steps, a `wroteAnything` flag, nested
  try/catch, and a three-way `instanceof` re-throw. The cleanup semantics are correct and
  well-tested, but the branch density is why they needed a 20-line file-header essay to explain. An
  extraction of the cleanup/rethrow tail into a named helper would cut CC materially without
  touching the ordering guarantees U-003 pins.
- `resolveInstallDirTarget` (CC = 5) is marginally over and clearly written; a documented
  justification is sufficient.

**Required Action**

Either reduce CC to ≤ 4 or record a concrete justification in each function's docblock (not a
generic note). Prioritize the `initSite` extraction; documentation is an acceptable resolution for
the other two. Remove or convert the unreachable `errors.ts:98` branch.

**Suggested Next Route**

Refactor Agent or Programmer. Coordinator classification: `REFACTOR_RECOMMENDED` for the mechanism,
but the finding itself is Required per the skill's enumerated anti-pattern list.

---

### CR-R08 — `createSqliteRouteDeps` (Contract Map C-010 / CIC U-001) carries no function-quality assessment

```
ID:          CR-R08
Severity:    Required
Dimension:   Function Quality Assessment
File:        src/server/deps.ts:156
```

**Finding**

`createSqliteRouteDeps` is a materially changed, logic-bearing unit — new signature, new
`overrides` parameter, new together-or-neither validation branch, and the U-001 workspace-id
resolution — and it is a **designated Critical Internal Constraint unit**. It has no
`@overallScore`, no severity findings, and no complexity note.

**Impact**

The skill treats missing assessments on in-scope units as Required. The elevated concern here is
specifically that this is a CIC-designated unit, where the assessment is part of the constraint's
review surface.

To be clear about scope: I am **not** asking for a full quality assessment of a ~400-line brownfield
composition root — that would be theater and the certification's own triage correctly declines
similar make-work. The obligation is on the *changed slice* (`deps.ts:145-194`).

**Required Action**

Add an assessment covering the `overrides` contract: the together-or-neither validation, the
`overrides?.db ?? openContentDb(...)` branch, and the single `resolveWorkspace` call site. I score
that slice **92** on my own re-assessment (see CR-R10 for the one deduction).

**Suggested Next Route**

Programmer. Coordinator classification: `IMPLEMENTATION_FIX_REQUIRED`.

---

## RECOMMENDED

### CR-R09 — `.site-meta.json` is bare-cast, not validated, while `config.json` beside it is fully validated

```
ID:          CR-R09
Severity:    Recommended
Dimension:   Code Quality / Security Surface (boundary input validation)
File:        src/site-dir/read-site-dir.ts:84
```

`readSiteDir` validates `config.json` thoroughly (required `name`, 1..200 after trim, type checks,
regular-file check, 64 KiB guard) and then does this to the file beside it:

```typescript
const meta = readJsonFile(dir, ".site-meta.json") as SiteMetaJson;
```

A `.site-meta.json` of `{}` parses fine, so `meta.schemaVersion` is `undefined`.
`compareSchemaVersion` then evaluates `undefined > runtime.index` → false and
`undefined === runtime.index` → false, falls through to `"migrate"`, and `bootSiteDir:86-89`
**overwrites the stamp with the runtime's values**. A structurally corrupt compatibility stamp is
silently healed rather than refused, and INV-05's "never decrease" property cannot be checked
because there is no valid prior value to compare against.

This is defensible against REQ-04's literal wording ("present and parseable"), which is why it is
Recommended and not Required — but `state.spec.md` §2 declares typed required fields for
`SiteMetaJson`, and §5 specifies "missing/**corrupt** file ⇒ `SITE_DIR_INVALID` detail". This is
also a genuine trust boundary: install dirs are explicitly designed to travel between machines and
be created by a separate desktop host.

**Recommended Action:** validate `SiteMetaJson`'s required fields and types symmetrically with
`validateConfig`, throwing `SiteDirInvalidError`. Add unit cases to
`read-site-dir.unit.test.ts` for a missing/wrong-typed `schemaVersion` and `schemaTag`.

---

### CR-R10 — `createSqliteRouteDeps` throws a raw `Error` at a module boundary

```
ID:          CR-R10
Severity:    Recommended
Dimension:   Code Quality
File:        src/server/deps.ts:151-155
```

`testable-design-patterns` Test Seam Rules: *"Error paths must return typed outcomes or throw typed
errors — no raw `Error` or opaque string messages at module boundaries."* The together-or-neither
guard throws a bare `Error`, and its two tests
(`create-sqlite-route-deps-overrides.integration.test.ts:96-111`) consequently have to assert on
message text via `/overrides/i` — exactly the fragility the rule exists to prevent.

The guard itself is correct and genuinely well-tested in both directions; this is about the error
type only. Raw-`Error`-at-a-boundary is not in the skill's enumerated Required anti-pattern list,
hence Recommended.

**Recommended Action:** introduce a typed error and assert on its `.name`, matching the convention
`site-dir/errors.ts` already establishes for this feature.

---

### CR-R11 — verification packet's integration branch figures disagree with the certification they derive from

```
ID:          CR-R11
Severity:    Recommended
Dimension:   Test Quality (evidence integrity)
File:        ADS-memory/reports/pipeline/003-site-install-dir/verification-packet.md:62
             ADS-memory/reports/pipeline/003-site-install-dir/test-certification.md:278
```

Packet: `273/334 raw (81.74%) / 273/288 real (94.79%)`.
Certification: `272/333 as measured / 155/171 real (90.64%)`.

Both clear the 90% gate, so the verdict is unaffected and this does not block. But a
Coordinator-owned artifact that is defined as a summary of the certification should not carry
different numbers than its source — if these are re-derived from a different run, the packet should
say so.

**Recommended Action:** reconcile the two, or annotate the packet with the provenance of its figures.

---

### CR-R12 — `template.json.defaultConfig` is specified as merged at init but is never read

```
ID:          CR-R12
Severity:    Recommended
Dimension:   Spec Alignment
File:        src/site-dir/init-site.ts:137, src/site-dir/types.ts:47-52
```

`state.spec.md` §2 documents `TemplateJson.defaultConfig` as *"merged under CLI flags at init"*.
`initSite` hardcodes `{ name: resolvedName, domain: null, port: null }` and never reads
`template.defaultConfig`; `grep -rn defaultConfig src/` returns exactly one hit — the type
declaration. Behavior is identical today only because `templates/starter/template.json` sets both
fields to `null`.

**Recommended Action:** either implement the merge (`defaultConfig.port` as a tier below `--name`
/basename and above the hardcoded `null`), or drop `defaultConfig` from the template schema. An
unimplemented field in a frozen compatibility surface is worse than no field.

---

### CR-R13 — `config.json` optional fields are null-serialized, contradicting `behavior.spec.md` §3

```
ID:          CR-R13
Severity:    Recommended
Dimension:   Spec Alignment (spec-internal ambiguity, per classification rule 3b)
File:        src/site-dir/init-site.ts:137
```

`behavior.spec.md` §3 Default Values: *"`config.json.domain` / `config.json.port` | absent |
… absence means 'unset', not null-serialized."* `initSite` writes `domain: null, port: null`.
`state.spec.md` §2 and `types.ts` both type these as `string|null` / `integer|null`, so the spec
package contradicts itself and the implementation picked one side without recording the choice.

Impact is nil today (`readSiteDir:66-67` handles both via `?? null`), which is why this is
Recommended — but no test pins which shape `init` writes, so a future change could flip it
undetected. Per classification rule 3b, pinning the chosen behavior with a test is the part that
matters.

**Recommended Action:** Spec Agent to resolve the contradiction; add an assertion in
`init-site.integration.test.ts` pinning the written shape either way.

---

### CR-R14 — AC-02's spec text is stale relative to the seed it certifies against

```
ID:          CR-R14
Severity:    Recommended
Dimension:   Spec Alignment
File:        ADS-memory/specs/003-site-install-dir/feature.spec.md:99 (AC-02)
```

AC-02 names *"welcome post, glass-demo post, `about` page, presentation `paper`"*. The actual seed
has 8 posts and `activeThemeId: "tovu-official"`. `read-template.unit.test.ts:51-57` correctly binds
to REQ-02's operative rule (content-equality with the live `server/seed.ts`) and **discloses the
drift explicitly** in its file header rather than hiding it — good practice, correctly handled at
the TDD layer. The spec text should now catch up.

**Recommended Action:** Spec Agent to refresh AC-02's illustrative content list.

---

### CR-R15 — `commander` adoption is authorized by ADR-PIPE-003 v1.1.0 but contradicts the still-active spec text

```
ID:          CR-R15
Severity:    Recommended
Dimension:   Architecture Adherence (documentation drift, not a violation)
File:        ADS-memory/specs/003-site-install-dir/feature.spec.md:178, 231
```

`feature.spec.md` Article I reads *"no CLI framework dependency justified at two commands"* and its
Agent Directives say *"Ask before: Introducing a CLI dependency (commander/yargs)."* The
implementation uses `commander@^15`.

**The code is compliant, not in violation.** ADR-PIPE-003 v1.1.0 records an explicit owner override
with unusually thorough reasoning (re-derived Constitution Check, re-verified zero-transitive-dep
claim against the npm registry at revision time, two named drivers: SPEC-005's committed subcommand
growth and Tovu-Runner's programmatic invocation). The "ask before" directive was satisfied by that
override. The `cli/errors.ts` mapping also correctly preserves the public exit-code contract
independent of commander's own defaults, which is the right seam.

The only issue is that the APPROVED, hash-locked spec still asserts the superseded position, so a
future reader hitting the spec first would conclude the code violates it.

**Recommended Action:** Spec Agent to amend Article I's row and the Agent Directive with a pointer
to ADR-PIPE-003 v1.1.0. Code change: none.

---

### CR-R16 — `writeJsonFileAtomic` leaks its temp file if `rename` fails

```
ID:          CR-R16
Severity:    Recommended
Dimension:   Code Quality
File:        src/site-dir/atomic-write.ts:32-37
```

If `renameSync` throws after `writeFileSync` succeeds, the
`.{name}.{pid}.{uuid}.tmp` file is left in the install dir. On the `init` path this is moot (cleanup
removes the target). On the `serve` stamp-rewrite path it would persist, adding to the CR-R02 layout
drift.

The temp-file-plus-rename approach itself is correct and exactly what `state.spec.md` §7 asks for,
and the `U-002-B2` test proves the important property (a blocked write leaves the old stamp
byte-identical). This is only about the cleanup tail.

**Recommended Action:** wrap the rename in try/catch and `fs.rmSync(tempPath, { force: true })` on
failure before rethrowing.

---

### CR-R17 — verification packet's `EACCES`/`PORT_IN_USE` advisory appears to be a misattribution

```
ID:          CR-R17
Severity:    Recommended
Dimension:   Test Quality (evidence accuracy)
File:        verification-packet.md:86; src/cli/commands/serve.ts:90-96
```

The packet carries forward an advisory that *"`EACCES` privileged-port refusal surfaced as
`PORT_IN_USE`."* Reading the code, `serve.ts:91` maps **only** `EADDRINUSE` to `PortInUseError`;
any other `ErrnoException` is rejected raw and lands on `mapErrorToCliOutcome`'s final branch as
`INTERNAL`. Since `PORT_IN_USE` and `INTERNAL` share exit code 1, a run distinguishing them only by
exit status would look identical — which is the likeliest source of the inference.

`errors.spec.md` §4 specifies `PORT_IN_USE | Produced By: HTTP listener EADDRINUSE`, so the
implementation is **correct as written** and no code change is warranted.

**Recommended Action:** correct or drop the advisory so it is not carried into a future round as a
known issue. If distinguishing `EACCES` is desired later, that is a spec change to
`errors.spec.md`, not a defect fix.

---

## Dimension Coverage Summary

| Dimension | Verdict | Notes |
|---|---|---|
| 1. Spec Alignment | **FAIL** | CR-R01 (AC-10/REQ-08/INV-01), CR-R02 (REQ-01/INV-04), CR-R04 (REQ-09/AC-12); CR-R12/R13/R14/R15 documentation drift |
| 2. Architecture Adherence | **FAIL** | CR-R03 (ADR-023 §2 recovery hook dropped). Otherwise strong — see below |
| 3. Test Quality | **FAIL** | CR-R05 (no post-serve layout or foreign-CWD assertion; AC-10 P1 coverage incomplete) |
| 4. Code Quality / Maintainability | **PARTIAL** | CR-R07 (CC > 4 ×3), CR-R09, CR-R10, CR-R16 |
| 5. Security Surface | **PASS with flags** | See Security section |
| 6. Non-Functional | **FAIL** | CR-R01 (500 on the primary path), CR-R02 (unbounded-ish artifact accumulation in a frozen layout) |
| 7. Function Quality Assessment | **BLOCKED** | CR-R06, CR-R08 |

### What is genuinely good (recorded so a fix pass does not regress it)

- **CIC U-001 verified by structural audit — PASSES.** U-001-B1 is explicitly a Code Review
  responsibility (audit-only, per `critical-internal-constraints.md` line 48). `grep -n
  seededWorkspace src/server/deps.ts` inside the function body (lines 156-554) returns exactly one
  hit: line 178, `workspace: seededWorkspace` — the seed *data* object in the legacy branch, not a
  workspace **id**. Zero `seededWorkspace.id` references remain. The refactor is complete.
- **INV-06 architectural boundary — PASSES.** `depcruise` reports 0 errors; the only warning against
  either new SPEC-003 rule is test-only (`read-template.unit.test.ts → server/seed.ts`), matching the
  packet's advisory. Production `site-dir/**` has zero `cli`/`server`/`express` imports.
- **CIC U-002 (schema guard + atomic stamp) — correctly implemented and genuinely well-tested.** The
  guard runs before the db is opened (`boot-site-dir.ts:72` precedes `:77`), the stamp writes both
  fields together only after `migrate()` returns, and `boot-site-dir.integration.test.ts:225-254`
  proves the blocked-write case leaves the old stamp byte-identical and a retry completes cleanly.
- **CIC U-003 / U-004 — correctly implemented and genuinely well-tested.** The `wroteAnything`
  discipline, marker-last ordering, and the cleanup-failure-names-the-path behavior are all real, and
  the fault-injection suite reaches them with actual `ulimit -f` resource exhaustion and real
  `chmod`, not mocks. The `NODE_V8_COVERAGE` redirection note (lines 60-82) diagnoses a subtle
  cross-test coverage-corruption bug that most suites would never have found.
- **The two TDD-recertified tests are genuinely assertive, not superficially passing** (dispatch asked
  me to check this specifically):
  - **EC-05** (`boot-site-dir.integration.test.ts:185-223`) asserts both `SiteCorruptError` **and**
    `match(message, /lock/i)`, and takes a real OS-level `locking_mode = EXCLUSIVE` lock. The
    no-op `UPDATE workspaces SET name = name` is a genuinely clever touch: it forces real page
    access so the lock actually engages, while keeping the row count at one so a lock failure
    surfaces as a loud test failure rather than a wrong-reason pass.
  - **serve-command port boundary** (`serve-command.integration.test.ts:130-161`) asserts
    `notEqual(status, 2)` and `doesNotMatch(/VALIDATION/)` unconditionally, and — when the port is
    actually held — the strictly stronger `status === 1` + `PORT_IN_USE`. The conditional guard is
    correctly reasoned (port 1 is privileged), and the weaker assertion still holds when it degrades.
    Both are real assertions.

---

## Function Quality Assessment

- Status: **BLOCKED**
- Functions assessed: 22 assessment units (20 carrying `@overallScore`, plus `createSqliteRouteDeps`
  and `createProgram` with none)
- Lowest score: **72** (`runServeCommand`)
- Critical findings: **1** (CR-R01 — `runServeCommand` wiring makes the primary command
  non-functional outside the repo checkout and lets writes escape the install dir)
- High findings: **3** (CR-R02 layout/INV-04; CR-R03 ADR-023 recovery hook; CR-R04 built-binary
  asset gap)
- Missing assessments: **1** (`createSqliteRouteDeps`, a CIC-designated unit — CR-R08)
- Missing handoff-table evidence: **yes**
- Missing score-skepticism evidence: **yes** (required: all 20 annotated units are 100/100 on a
  non-trivial change)
- Missing adversarial aggregate/cross-item evidence: **n/a** — no rule-engine, batch, reducer, or
  cross-record workflow exists in this feature. The nearest analogue, `resolveWorkspace`'s
  cross-record row-count rule (0 / 1 / >1), **is** covered adversarially at both unit and
  integration tiers.
- Debt-band fix verification (step 2a): **n/a** — no debt-band fix was claimed, because no handoff
  table exists to claim one.
- Required fixes: CR-R01, CR-R02, CR-R03, CR-R04, CR-R05, CR-R06, CR-R07, CR-R08
- Recommended refactors: CR-R09 through CR-R17
- Suggested Coordinator classification: **`IMPLEMENTATION_FIX_REQUIRED`** (primary), with
  `ARCHITECTURE_REVIEW_REQUIRED` (CR-R01 theme precedence, CR-R03 boundary placement),
  `TDD_RECERTIFICATION_REQUIRED` (CR-R05, and re-verification after CR-R01…R04), and
  `SPEC_REVISION_REVIEW_REQUIRED` (CR-R02, CR-R13, CR-R14, CR-R15)

### Re-scored units

| Unit | File:line | Claimed | Re-scored | Below-100 reason |
|---|---|---:|---:|---|
| `runServeCommand` | `cli/commands/serve.ts:76` | 100 | **72** | Critical: CWD-coupled theme/uploads wiring (CR-R01) |
| `bootSiteDir` | `site-dir/boot-site-dir.ts:58` | 100 | **78** | High: ADR-023 recovery hook dropped (CR-R03) |
| `readSiteDir` | `site-dir/read-site-dir.ts:81` | 100 | **85** | Bare cast of `.site-meta.json` at a compat boundary (CR-R09) |
| `mapErrorToCliOutcome` | `cli/errors.ts:84` | 100 | **86** | CC ≈ 11 undocumented + one unreachable branch (CR-R07) |
| `initSite` | `site-dir/init-site.ts:113` | 100 | **88** | CC ≈ 9 undocumented (CR-R07) |
| `resolveInstallDirTarget` | `site-dir/resolve-install-dir-target.ts:40` | 100 | **88** | CC = 5 undocumented (CR-R07) |
| `writeJsonFileAtomic` | `site-dir/atomic-write.ts:32` | 100 | **94** | Temp-file leak on rename failure (CR-R16) |
| `createSqliteRouteDeps` (changed slice) | `server/deps.ts:156` | — | **92** | No assessment (CR-R08); raw `Error` (CR-R10) |
| `readTemplate` | `site-dir/read-template.ts:52` | 100 | **95** | `defaultConfig` returned but never consumed (CR-R12) |
| `compareSchemaVersion` | `site-dir/schema-guard.ts:74` | 100 | **100** | Confirmed — exhaustive, correct, well-tested |
| `runtimeSchemaVersion` | `site-dir/schema-guard.ts:48` | 100 | **100** | Confirmed |
| `resolveWorkspace` | `site-dir/resolve-workspace.ts:40` | 100 | **100** | Confirmed |
| `runInitCommand` | `cli/commands/init.ts:27` | 100 | **100** | Confirmed — reading config back rather than re-deriving is the right call |
| Remaining helpers (`resolveSiteName`, `validateInitTarget`, `readJsonFile`, `validateConfig`, `parsePort`, `resolveServePort`, `warnIfLegacyEnvVarsIgnored`, `createProgram`, `printBareUsageAndExit`, `printUsageToStderr`) | — | (parent-inherited) | **95-100** | No findings |

---

## Verification Evidence

| Item | Value |
|---|---|
| Verification packet | `ADS-memory/reports/pipeline/003-site-install-dir/verification-packet.md` |
| Source TestRunner report | `ADS-memory/reports/test-runs/TESTRUN-003-site-install-dir-2026-07-28-1712.md` |
| Test certification | `ADS-memory/reports/pipeline/003-site-install-dir/test-certification.md` (recertified 2026-07-28T17:40:00Z) |
| Active spec hash | `sha256:c2547dc…1846142` — matches `feature.spec.md` |
| Executed vs expected tests | 71 / 71 |
| Test-file hash status | 13/13 match |
| Required-suite status | unit PASS (23/23), integration PASS (48/48), e2e N/A with recorded reason |
| Coverage status | PASS on owner-accepted real-source-arm figures (see CR-R11 for a numeric inconsistency between packet and certification) |
| Flaky-test status | None |
| Regression baseline | 19/19 PASS (U-001-B2, 5 named suites, unmodified) |
| CIC U-001-B1 structural audit | **PASS** (performed by this review — zero `seededWorkspace.id` references remain) |
| Architectural boundary check | **PASS** — `depcruise` 0 errors; 1 test-only SPEC-003-rule warning |
| **Review gate verdict** | **CHANGES REQUIRED** |

**Note on green-vs-correct.** The packet is valid and the suite is genuinely green. Four Required
findings (CR-R01, R02, R03, R04) are nonetheless real defects that a green suite could not have
caught, because no test asserts the properties they break. This is the intended function of this
gate, not a contradiction of TestRunner's result.

---

## Security Surface Changes — Flagged for Security Agent

A parallel Security Agent dispatch is running; no coordination was performed, per the dispatch. The
new/changed surfaces worth its attention:

1. **New filesystem write surface (`site-dir/**`, `cli/**`).** Containment is centralized in
   `resolveInstallDirTarget` and every write derives from the single resolved `target`. Reviewed and
   found sound, including deliberate non-canonicalization of ancestor segments (documented at
   `resolve-install-dir-target.ts:14-25`) and the dangling-symlink `readlinkSync` fallback. The
   symlink and `..`-traversal cases have real integration coverage. **No finding.**
2. **INV-01 breach via media blob writes (CR-R01).** `LocalFsBlobStore` writes to
   `$CWD/uploads/`, outside the install dir, on any media upload during `tovu serve <dir>`. This is
   the one path-containment finding of the review and the highest-value item for Security to
   confirm independently.
3. **Unvalidated parse of a portable, cross-machine file (CR-R09).** `.site-meta.json` is
   bare-cast. Install dirs are designed to move between machines and to be produced by a separate
   desktop host, so this is a trust boundary receiving unvalidated structured input. Impact today
   appears limited to a silently-healed compatibility stamp rather than anything exploitable, but
   the validation asymmetry against `config.json` is worth a second opinion.
4. **New process/network surface.** `serve` binds a listener on a user-supplied port. `parsePort`
   (`cli/commands/serve.ts:35-45`) validates `^\d+$` and the inclusive 1..65535 range at every
   precedence tier with no fall-through, and has real boundary coverage. **No finding.**
5. **New runtime dependency: `commander@^15`** (ADR-authorized, CR-R15). Re-verified
   zero-transitive-dependency in the ADR at adoption time; worth a routine supply-chain confirmation.
6. **Boot-time recovery step dropped on the new path (CR-R03).** Availability/data-integrity rather
   than confidentiality, but it is a mandatory safety step missing from a boot path.

No secrets handling, authentication, or authorization logic is added or changed by this feature
(Article VI's standing exception carries over).

---

## Escalations

| Escalation | Finding | Rationale |
|---|---|---|
| Architecture review | CR-R01 | Built-in vs site theme precedence crosses into SPEC-004's contract; not a Programmer call |
| Architecture review | CR-R03 | Where the recovery hook is injected affects the `site-dir` ↔ `features` boundary |
| Spec Agent | CR-R02 | Install-dir layout is a frozen ADR-011 compatibility surface; changing it is a spec decision |
| Spec Agent | CR-R13, CR-R14, CR-R15 | Spec-internal contradiction and two stale-text items |
| TDD | CR-R05 | AC-10 P1 assertion coverage incomplete; post-serve layout unasserted |
| Coordinator | CR-R11, CR-R17 | Two evidence-accuracy corrections in Coordinator-owned artifacts |

## Process Gap Noted (not a blocker)

No Programmer handoff table or progress ledger exists for this feature (built in a prior session),
as the dispatch anticipated. This is recorded rather than blocked on, but it is the direct cause of
CR-R06 being unresolvable by inspection, and it meant no debt-band fix claims could be verified
under workflow step 2a.
