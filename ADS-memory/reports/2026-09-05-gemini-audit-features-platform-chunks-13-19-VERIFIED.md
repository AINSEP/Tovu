# Gemini Audit VERIFICATION — features/ + platform/, chunks 13-19

Verifier: Claude Opus 5. Input: `2026-09-05-gemini-audit-features-platform-chunks-13-20-RAW.md`
(41 unverified claims, 7 chunks, all from coverage-padding test commits of 2026-09-04 17:11-17:35).

Method: open each cited file:line, confirm the code says what was claimed, then trace callers to
decide whether the claimed failure is genuinely reachable. Verdicts: CONFIRMED / REFRAMED /
UNVERIFIED / DISCARDED. No tests, no tsc, no coverage were run (box OOMs).

## Status: IN PROGRESS

- [x] Chunk 18 (`991217ab`, handlebars-allowlist.ts) — CRITICAL + HIGH, priority 1
- [ ] Chunk 17 (`4b35a008`, github-git-provider.ts) — 2 HIGH, priority 2
- [ ] Chunk 13 (`1378c7e4`, structure.ts)
- [ ] Chunk 14 (`239a90a5`, s3-compatible-target.ts)
- [ ] Chunk 15 (`54c65bc6`, store.ts)
- [ ] Chunk 16 (`383befbc`, verify.ts)
- [ ] Chunk 19 (`438ada6a`, site-exporter.ts)

## Findings

_(appended per chunk)_

---

## Chunk 18 — `991217ab` `handlebars-allowlist.ts` (priority 1, security-boundary file)

Governing doc read: `ADS-memory/reports/architecture/ADR-020-theme-capability-tiers.md`.
Call sites traced: `lintHandlebarsTemplate` has exactly two production callers —
`apps/website/src/features/theme/theme.ts:997` (`loadHandlebarsTemplateFile` ←
`loadTemplateSources` ← `loadTheme()` ← `discoverThemes()` at `theme.ts:1190`, MAIN thread) and
`apps/website/src/server/inbound/public-http/http/site/handlebars-worker.ts:160` (worker thread,
pre-compile re-check). Both confirmed by enumeration, not grep-guessing.

Runtime second layer confirmed present, not assumed:
`handlebars-worker.ts:132-133` sets `allowProtoPropertiesByDefault: false` /
`allowProtoMethodsByDefault: false`, and these are passed in the **runtime-options** position at
`handlebars-worker.ts` (`template(buildTemplateRenderData(siteCtx), RUNTIME_OPTIONS)`).
`handlebars@4.7.9` (installed version checked) routes **every** path segment, data paths included,
through `container.lookupProperty`: `javascript-compiler.js:480` `lookupData` →
`:490` `resolvePath('data', …)` → `:29` `nameLookup` → `:66` `internalNameLookup` →
`lookupProperty(parent, name)`. `internal/proto-access.js:28-32` denylists `constructor`,
`__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__` as methods and
`:24` `__proto__` as a property, regardless of the `defaultValue`.

### 18.1 — CRITICAL claim: `@`-data path bypasses `FORBIDDEN_PATH_SEGMENTS` → **REFRAMED (CRITICAL → LOW)**

**The code fact is real and I reproduced it.** `handlebars-allowlist.ts:215-221`: when
`path.data === true`, `checkPath` tests only `parts[0]` against `ALLOWED_HANDLEBARS_DATA_VARS` and
then `return`s at line 220, so the `FORBIDDEN_PATH_SEGMENTS` loop at `:223-227` is never reached for
any `@`-prefixed path. Direct invocation of the real `lintHandlebarsTemplate`:

```
{{@index.constructor}}              -> []          (clean — should have been a violation)
{{@key.__proto__.polluted}}         -> []          (clean)
{{@index.constructor.constructor}}  -> []          (clean)
{{this.constructor}}                -> ["disallowed path segment \"constructor\" in \"this.constructor\""]
```

The AST confirms the mechanism: `Handlebars.parse("{{@index.constructor}}")` yields
`{type:"PathExpression", data:true, parts:["index","constructor"], original:"@index.constructor"}` —
`parts[0]` is the allowlisted `index`, and `constructor` is never examined.

**But the claimed severity does not follow, for three independent reasons:**

1. **No write primitive exists.** Prototype *pollution* requires assignment. A Handlebars template
   expression is a read that is escaped and emitted. `{{@index.constructor}}` cannot assign to
   anything; there is no template syntax in this tier that can. The claim's own name for the barrier
   ("prototype-pollution barrier") mislabels what `FORBIDDEN_PATH_SEGMENTS` does — the file's
   docstring at `:122-131` is accurate and the claim is not: it says this is "the static half of a
   two-layer guarantee — the layer that turns 'the render would have returned empty' into 'the theme
   never loads'". Reviewability, not containment.
2. **The runtime half blocks the read**, and I verified it in the installed dependency rather than
   trusting the comment (chain above). `lookupProperty(<@index value>, "constructor")` →
   not an own property → `resultIsAllowed` → `checkWhiteList(methods, "constructor")` →
   whitelist entry is `false` → returns `undefined`. Same for `__proto__` via the properties list.
3. **The compiler half also holds.** `COMPILE_OPTIONS` (`handlebars-worker.ts:110-123`) sets
   `knownHelpersOnly: true` with `log:false`/`lookup:false`, and `env.partials` is replaced by a
   Proxy that resolves nothing (`:95-100`), so there is no dynamic-key escape hatch to pair the
   read with.

Also note the raw-output arm still fires independently: `{{{@index.constructor}}}` **is** rejected
(verified above), so the gap does not widen the XSS surface either.

**Corrected framing:** a genuine completeness gap in the static lint — a theme containing
`{{@index.constructor}}` loads and renders empty instead of failing review, which is exactly the
outcome the file says the static layer exists to prevent. Worth fixing (move the
`FORBIDDEN_PATH_SEGMENTS` loop above the `path.data` branch, or run it before the early `return`);
worth fixing *more* because it is the only layer that would survive someone dropping
`RUNTIME_OPTIONS` at a future third call site. **Not a security bypass. Severity LOW.**

### 18.2 — HIGH claim: bare built-in helper (`{{log}}`) passes the lint → **REFRAMED (HIGH → LOW)**, plus **CONFIRMED MEDIUM** on the tautological test

Code fact CONFIRMED and reproduced. `handlebars-allowlist.ts:265` reads
`isInvocation(node) || ALLOWED_HANDLEBARS_HELPERS.has(name)`; `isInvocation` (`:198-200`) is false
for a no-argument mustache (`Handlebars.parse("{{log}}")` → `params: []`, no `hash`), so control
falls to `checkPath`, which finds nothing because `log` is not a forbidden path segment:

```
{{log}}            -> []
{{lookup}}         -> []
{{helperMissing}}  -> []
{{render_block}}   -> []
```

**Reachability disproves the HIGH framing.** At render, `knownHelpersOnly: true` with
`knownHelpers.log = false` / `knownHelpers.lookup = false` makes the compiler classify a bare
`{{log}}` as a *simple path lookup*, not a helper invocation — the helper is never called, the
expression resolves against the render data and emits nothing. So "let any bare disallowed built-in
helper through … a console/IO side-effecting helper" is wrong about the consequence: the lint lets
the *text* through, the compiler does not let the *call* happen. Same lint gap, no I/O.
(`{{helperMissing}}` is the one name that does stay a helper call under `knownHelpersOnly`, because
Handlebars seeds it into `knownHelpers`; invoked with no params its own implementation returns
`undefined`.) **Severity LOW** — same class as 18.1: a lint-completeness gap behind a working
compiler-level control.

**The test half of this claim is CONFIRMED at MEDIUM.** The new test added by this commit
(`handlebars-allowlist.test.ts:148-150`) is named *"…isInvocation() is false here, so it is the
allowlisted-helper-name arm of the OR, not the invocation arm, that lets it through"* — and that is
precisely what it cannot show. Deleting `|| ALLOWED_HANDLEBARS_HELPERS.has(name)` from `:265` leaves
`{{render_block}}` falling to `checkPath`, which returns clean, so the assertion `deepEqual(…, [])`
still passes. The mutation the test names as its subject survives it. This is a real
mutation-survivable test whose title asserts a property it does not test.

### 18.3 — HIGH claim: unbounded subexpression recursion → **CONFIRMED (HIGH)**

Code fact confirmed by reading: `walkParamsAndHash` (`:232-237`) forwards `depth` unchanged, and
`walkExpression`'s `SubExpression` arm (`:342-347`) calls `walkParamsAndHash(node, depth, …)`. Neither
checks `MAX_BLOCK_NESTING_DEPTH`; only `walkHandlebarsNodes` (`:323`) does, and subexpression
recursion never re-enters it. So the ceiling documented at `:153-164` does not constrain this path.

**Reproduced against the real function.** Template shape
`{{render_block x=(render_block x=(… ) )}}`:

| nesting | source bytes | `Handlebars.parse()` | `lintHandlebarsTemplate()` |
|---|---|---|---|
| 1,000 | 17,020 | OK | returned `[]` |
| 5,000 | 85,020 | **OK** | **THREW `RangeError: Maximum call stack size exceeded`** |

This is the load-bearing detail, and it is the one that could have gone the other way: the jison
parser is table-driven and survives the nesting, so the `try/catch` at `:378-382` — which wraps
**only** `Handlebars.parse` — does not catch it. The `RangeError` escapes `lintHandlebarsTemplate`,
directly violating the documented contract at `:365-368` ("every caller can treat this function as a
total, non-throwing predicate"). 85 KB is ~8% of the `MAX_TEMPLATE_SOURCE_BYTES` (1,000,000) cap, so
the size ceiling does not mitigate it either.

**Reachability CONFIRMED, main thread.** `loadTheme()` (`theme.ts:1109-1155`) wraps nothing in
`try/catch`; `loadTemplateSources` → `loadHandlebarsTemplateFile` → `lintHandlebarsTemplate` throws
straight out of `loadTheme`, and `discoverThemes` (`theme.ts:1190`) maps `loadTheme` over every
directory in a themes root — so one crafted `.hbs` takes out discovery for **every** theme in that
root, not just its own. This is the exact scenario `MAX_BLOCK_NESTING_DEPTH`'s own rationale names
("a stack overflow during the *lint* would happen on the main thread, outside any worker"), left
open on the one recursion path the ceiling does not cover. Theme content is untrusted by the file's
own declaration (`:362-363`, "raw `.hbs` template text (untrusted — third-party theme content)"), so
the precondition is inside the declared threat model.

**Severity HIGH stands.** Availability, not confidentiality; the fix is to thread `depth + 1` through
`walkParamsAndHash`/`walkExpression` and check the ceiling there.

### 18.4 — MEDIUM claim: the fixture "fix" papers over 18.2 → **DISCARDED**

Facts partly right, conclusion wrong. The fixture at `handlebars-allowlist.test.ts:257-299` belongs
to the test *"handles unknown statement kinds by traversing nested program and inverse bodies"* —
its subject is `handleUnknownStatement` descending into `program`/`inverse`, not the `isInvocation`
classification. Its inline comment states it is simulating `{{lookup this key}}`, and real
Handlebars does produce non-empty `params` for that source, so the post-fix fixture matches the
shape the test names. The pre-fix empty-`params` shape was a valid AST for a *different* source
(`{{lookup}}`) than the one the test claims to exercise, and with it the traversal assertion could
not fire at all. Correcting it was right. The substantive observation underneath — that
`{{lookup}}` yields no violation — is real but is 18.2, already recorded; it is not a second finding.

Sub-claim on the mocked `PathExpression`s: accurate but immaterial. `pathText` (`:203-205`) falls
back to `original`, which the mocks supply, so the omitted `parts`/`depth`/`data` do not change the
outcome. The depth-mutation point is fair and minor: changing `handleUnknownStatement`'s
`depth + 1` to `depth` would leave these tests green. **INFO, not a defect.**

### 18.5 — LOW claim: coverage-padding of dead defensive code at `:329` → **REFRAMED (LOW → INFO, not a defect)**

Runtime-redundancy claim is correct: `STATEMENT_HANDLERS[undefined]` coerces to the `"undefined"`
key and yields `undefined` without throwing, so `node.type !== undefined ? … : undefined` changes
nothing at runtime. But the branch is **compile-time required**: `HbsNode.type` is `string |
undefined` (`:179`) and indexing `Readonly<Record<string, …>>` with it is a type error, so the check
cannot simply be deleted. The branch rests on the structural typing the walker deliberately adopts
(`:166-177`) to stay total over unrecognized node kinds — which is the repo's own
"keep + direct-invoke-test" case, not its "delete" case. The test
(`handlebars-allowlist.test.ts:316-336`) discloses the unreachability in its own title. Not a defect.

### 18.6 — LOW claim: three tests mutate the `Handlebars` module singleton → **CONFIRMED, severity INFO**

Fact confirmed: `handlebars-allowlist.test.ts:258-260`, `:302-304`, `:317-319` each assign
`(Handlebars as unknown as { parse: unknown }).parse = …` on the shared module object. Each is
wrapped in `try { … } finally { …parse = originalParse }`, and `node:test` runs the tests within one
file sequentially and isolates files in separate processes, so no current execution mode makes this
flake. It is a latent constraint (these three tests can never be made `concurrency`-enabled), not a
present defect. **INFO.**

### Chunk 18 counts

6 claims: **1 CONFIRMED at claimed severity** (18.3 HIGH), **1 CONFIRMED at reduced severity + 1
newly-confirmed test finding** (18.2 → LOW production / MEDIUM test), **2 REFRAMED down** (18.1
CRITICAL→LOW, 18.5 LOW→INFO), **1 CONFIRMED-as-INFO** (18.6), **1 DISCARDED** (18.4).
Every cited line number in this chunk was accurate — the failure mode was severity/framing, not
fabrication, exactly as the dispatch predicted.

---

## Chunk 17 — `4b35a008` `github-git-provider.ts` (priority 2)

Every line number Gemini cited in this chunk is exact: prod `302`, `310`, `365`, `574`, `687`;
tests `1100`, `1128`, `1381`. Nothing fabricated. The failures here are all framing.

Caller chain for everything below:
`tool-registrations.ts` (`source_control_commit_site`, human-gated dialog) →
`commit-site.ts:436` `gitAdapter.commit(...)` → `createGitHubCommitAdapter().commit()`
(`github-git-provider.ts:788-828`). `commit-site.ts` wraps that call in **no** `try/catch`
(`:425-466`), so anything thrown inside the adapter rejects out to the tool handler.

### 17.1 — HIGH: `fetchBranchTip` treats a 200 with no `object.sha` as a fresh branch → **REFRAMED (HIGH → MEDIUM)**; test claim **CONFIRMED**

Code fact CONFIRMED, `github-git-provider.ts:309-311`:
`const sha = typeof object?.sha === "string" ? object.sha : undefined; return { ok: true, tipSha: sha };`

The claimed asymmetry with siblings is real and I checked all four:
`fetchParentTree:331-332`, `createBlob:490-491`, `createTreeObject:612-613`,
`createCommitObject:~688-689` each return
`{ok:false, code:"provider-error", message:"… did not include a sha"}` for the identical
200-but-missing-field shape. `fetchBranchTip` is the only step function that swallows it, and it
swallows it in the more dangerous direction ("no parent" rather than "error").

Downstream chain CONFIRMED end to end: `commit():795-796` sets
`parentSha = tipResult.tipSha` and `branchCreated = parentSha === undefined` →
`resolveCommitPrerequisites:764-767` short-circuits on `parentSha === undefined` and returns
`baseTreeSha: undefined, previousManagedFiles: undefined, parents: []` → `buildTree` builds a tree
with **no `base_tree`** (`createTreeObject:605`) → `createCommitObject` with `parents: []` (an
orphan commit) → `writeRef(..., "create")` → `POST /git/refs`.

**Where the HIGH framing breaks.** Gemini's stated consequence is "would actually 422 on real
GitHub… or, worse, succeed and wipe history." The second half is speculation and the first half is
not data loss — it is the *safe* outcome. GitHub's create-ref refuses an existing ref with a 422, so
the branch is never moved; the commit fails with `provider-error` after wasting blob/tree/commit
creations. This suite's own test at `:1100` encodes exactly that expectation (a create against an
existing ref → 422 → `provider-error`). Nothing is overwritten, because `writeRef` never passes
`force` and never PATCHes in this path.

**Trigger probability is also low.** Real GitHub always returns `object.sha` on a 200 from
`GET /git/ref/heads/{branch}`; reaching this needs a misbehaving gateway or proxy between us and it.

**Corrected severity: MEDIUM** — a real defensive-fallback inconsistency, chosen in the unsafe
direction, whose worst realistic outcome is a failed commit with a misleading cause, not history
loss.

**The test claim is CONFIRMED.** Test at `:1381` mocks
`GET /git/ref/heads/main → 200` *and* `POST /git/refs → 201` for that same ref — a pair GitHub
cannot produce (a ref that exists cannot be created). Applying the dispatch's own distinguishing
question: **would it still pass with the bug fixed? No.** It asserts `result.ok === true` and
`branchCreated === true`, both of which a `provider-error` fix would break. So it genuinely pins the
current behavior rather than merely under-asserting it. In its favor, its JSDoc (`:1374-1379`)
discloses precisely what it pins — it is a characterization test, not a covert one; the defect is
that its impossible mock is what makes the pinned behavior look harmless.

### 17.2 — HIGH: `resolveDeletionCandidates` silently drops unverifiable candidates → **REFRAMED (HIGH → MEDIUM)**; "test masks it" → **DISCARDED**, replaced by a **CONFIRMED false-JSDoc finding**

Code fact CONFIRMED, `:573-579`: when `fetchLiveBlobSha` returns `undefined` the loop `continue`s,
adding the path to neither `deletions` nor `divergedPaths`.

**The "inconsistent with the codebase's own stated standard" framing is FALSE.** The file does not
merely fail to notice this — it argues for it, twice and specifically. The header at `:138-142`
names `fetchLiveBlobSha` as keeping "the soft-degrade… still gets (see finding 1)" in explicit
contrast to the manifest read it was hardening, and `fetchLiveBlobSha`'s own docstring
(`:452-466`) states the rule and the reason: "`undefined` on ANY failure… which always resolves to
skipping just that one path, never to failing the whole commit. That narrower blast radius is
exactly why this read gets the opposite tolerance from the manifest read itself." Gemini read a
deliberate, documented divergence as an oversight.

**What survives, and it is real.** The documented rationale covers the *deletion* decision only. It
does not address the *manifest retention* decision, and there the two outcomes are not equivalent.
The new manifest is written from `fileTree.currentFileShas` (`:636`) — this export's files alone — so
a skipped candidate, which by construction is not in this export, drops out of the manifest
permanently and is never a candidate again. The docstring's claim that a failure here "can only ever
cost one candidate's cleanup **this pass**" is therefore understated: it costs that path's
provenance for good. That is structurally the same defect the file's own header calls a CRITICAL fix
(`:127-142`, "A TRANSIENT MANIFEST READ FAILURE PERMANENTLY FORGOT STALE CONTENT"), one scope down.

The operator-visibility gap is the concrete harm, and I traced it: `divergedPaths` is surfaced all
the way to the human (`commit-site.ts:467` → `tool-registrations.ts:343`, whose tool description
instructs the model to "tell the human these need their own manual review/cleanup"). A path skipped
for an unverifiable read gets none of that — it stays published in the repo, leaves the manifest,
and nobody is ever told. Conflating a verified 404 ("already gone", correctly silent) with a
410/500/network failure ("still there, we just couldn't look") is the actual bug.

**Corrected severity: MEDIUM** — provenance/data-hygiene, needs a transient GitHub failure landing
on exactly a deletion-candidate read, and the consequence is a permanently orphaned published file
rather than any exposure.

**The masking claim is DISCARDED, but a different real defect is CONFIRMED in its place.** Test 13
(`:1128-1159`) asserts only `result.ok === true` and `filesDeleted === 0`; both would still hold if
the code pushed the path into `divergedPaths`. **It would still pass with the bug fixed**, so by the
dispatch's own test it is a *narrow* test, not a masking one. What is genuinely wrong is its JSDoc
at `:1120-1127`, which states the outcome is "the candidate is left alone, **reported as diverged**,
never deleted" — the production code does not report it as diverged, and an added
`assert.deepEqual(result.divergedPaths, ["gone.html"])` would fail against `[]` today. A comment
asserting behavior the code does not have, on the exact behavior at issue. **CONFIRMED, LOW** (and
one for the false-comment register).

### 17.3 — MEDIUM: `readJsonBody` has no plain-object guard → **REFRAMED (MEDIUM → LOW)**

Code facts CONFIRMED. `:252-257` casts `(await response.json()) as Record<string, unknown>` with no
shape check, and `isPlainObject` does exist at `:365` — used at `:371` and `:401` for manifest
parsing, never in `readJsonBody`. Every consumer (`providerErrorMessage:264`, `fetchRepo:296`,
`fetchBranchTip:309`, `createBlob:490`, and the rest) reads a property straight off it.

**The claim is broader than the truth.** Of the "valid top-level JSON primitive (`null`, a number, a
bare string)" cases, only `null` throws — property access on a number, string, boolean, or array
boxes the value and yields `undefined` harmlessly. So the crash surface is a response body that is
literally `null`, not "a JSON primitive."

Reachability: a `null` body would make `body.json.message` / `.default_branch` / `.object` throw a
`TypeError` that escapes `commit()` (no `try/catch` in the adapter) and then
`commitSiteToSourceControl` (no `try/catch` at `:436`), reaching the tool handler as a rejection
instead of a typed `provider-error`. Real GitHub does not emit a bare `null` body; a proxy could.

**Corrected severity: LOW** — a genuine robustness gap with an unused guard sitting in the same file,
but a much narrower trigger than claimed.

### 17.4 — MEDIUM: ref URLs use `enc(branch)` instead of `encPath(branch)` → **CONFIRMED as a code defect; consequence UNVERIFIED**

Code facts CONFIRMED and the internal contradiction is sharp. `encPath` exists at `:173-175` and its
own docstring (`:168-172`) states the reason: "`enc` alone would turn `/` into `%2F`, which breaks
GitHub's Contents API path routing." Yet both ref call sites use `enc`:
- `:302` `…/git/ref/heads/${enc(branch)}` (`fetchBranchTip`)
- `:687` `…/git/refs/heads/${enc(branch)}` (`writeRef`, update mode)

`fetchLiveBlobSha:467` in the same file correctly uses `encPath` for its path.

**Reachability CONFIRMED.** `BRANCH_PATTERN` in `commit-site.ts:61` is
`/^[A-Za-z0-9._/-]{1,250}$/` — `/` is explicitly permitted, so `feature/update-copy` passes
validation and reaches `enc()`. The suite only ever uses single-segment names (`main`, `feature-x`),
which is why no test sees it.

**What I could not settle:** whether GitHub's router 404s on `heads/feature%2Fupdate-copy` or decodes
it back to a working ref. Confirming that needs a live authenticated GitHub call, which is outside
what I can do here. The *defect* — one of two encoding helpers used against its own documented
purpose — is confirmed regardless; the claimed 404→422 cascade is **UNVERIFIED**.
Suggested severity **MEDIUM**, pending that check.

### 17.5 — LOW: orphaned JSDoc + disputed commit-message characterization → **CONFIRMED (orphaned JSDoc)**

CONFIRMED: at `:1348-1351` a JSDoc describing `fetchRepo`'s `default_branch` fallback is immediately
followed by a second JSDoc describing `githubFetch`'s timeout branch, and only the second one's test
follows. The `default_branch` block is orphaned from the test it describes. Cosmetic, real.

The commit-message-characterization dispute is not independently checkable without a coverage run
(barred here) and is, in any case, a claim about a commit message rather than about code. **Not
adjudicated.**

### Chunk 17 counts

5 claims: **0 CONFIRMED at claimed severity**, **3 REFRAMED down** (17.1 HIGH→MEDIUM, 17.2
HIGH→MEDIUM, 17.3 MEDIUM→LOW), **1 CONFIRMED as a code defect with its consequence UNVERIFIED**
(17.4), **1 CONFIRMED** (17.5, cosmetic). One sub-claim **DISCARDED** (17.2's masking-test framing)
and replaced by a newly confirmed false-JSDoc defect; one sub-claim **CONFIRMED** (17.1's impossible
mock, which does pin the behavior). Neither of the two flagged "production bug + masking test" pairs
survives as a HIGH.

---

## Chunk 13 — `1378c7e4` `theme/validation/structure.ts`

Reachability baseline for the whole chunk (checked once, applies to every claim below).
`walkThemePackage` has exactly one production consumer: `validate-theme-package.ts:237`
(`validateThemePackage`), whose own three call sites are
`marketplace.ts:265` (`downloadMarketplaceTheme`, validating a **repo-local** marketplace fixture
directory), `migration/migrate-theme.ts:281` (a staging dir our own migrator produced), and
`cli/commands/theme/validate.ts:64`. **There is no HTTP upload route into this validator.** So every
"a hostile theme package could…" argument in this chunk requires an actor who can already write into
the themes root or the repo. That does not make the defects unreal, but it caps their severity, and
Gemini's severities do not reflect it.

Also checked once: `resolveFindings` (`validate-theme-package.ts:199-211`) only maps and filters —
**there is no issue de-duplication anywhere**, so duplicate issues do reach the caller.

### 13.1 — HIGH: the `if (truncated) return` guard is dead, duplicate `structure-max-files` issues → **CONFIRMED as fact, REFRAMED (HIGH → LOW)**

**Both halves are correct, and I proved the unreachability rather than pattern-matching it.**
`truncated` is assigned in exactly one place, `structure.ts:159`, immediately after
`files.length >= MAX_PACKAGE_FILES` tested true at `:158`; `files` only ever grows. Therefore
`truncated === true` implies `files.length >= MAX_PACKAGE_FILES` for the remainder of the walk. The
only recursive call to `walk` is `:164`, which every iteration reaches only *after* passing `:158`.
So `walk` can never be entered with `truncated === true`, and `:145`'s guard is **provably dead
code**. The initial call at `:167` runs with `truncated === false`.

The duplicate-emission half follows from the same fact: when a saturating subdirectory returns, the
parent's loop advances to its next entry, re-tests `:158` (still true), and pushes a **second**
`structure-max-files` issue — once per ancestor level that still has an unvisited sibling. With no
de-duplication downstream, those duplicates reach the caller.

**The test's comment is what's actually wrong.** `structure.test.ts:98-99` states "by the time the
top-level walk reaches this entry, `truncated` is already `true`, so `walk()`'s own leading
`if (truncated) return;` guard must fire for it." It does not fire; `:158` returns from the
top-level walk first. The test's *assertion* (`:108`, that `b-after/should-not-be-counted.txt` is
absent) is correct — it just holds for a different reason than the comment claims. And because the
issue check uses `.find()` rather than a length assertion, the duplicate emission is invisible to it.

**Corrected severity: LOW.** Nothing breaks: the ceiling still holds, the walk still stops, no extra
files are admitted. The impact is dead code plus repeated identical messages shown to a theme
author. Actionable under this repo's own rule for unreachable branches — this one is provable
locally, so it is a delete candidate, not a keep-and-direct-invoke-test one. The test comment should
go with it, and one `length === 1` assertion would pin the de-duplication if that is wanted.

### 13.2 — HIGH: `statSync` follows symlinks, so a circular symlink throws `ELOOP` → **CONFIRMED, REFRAMED (HIGH → MEDIUM)**

Code facts CONFIRMED. `:108` `statSync(full, { throwIfNoEntry: false })` — `throwIfNoEntry`
suppresses only the no-such-entry case, so `ELOOP` from a symlink cycle (`a → b`, `b → a`) throws.
`:111` `realpathSync(full)` would throw `ELOOP` on the same input too. The `readdirSync` try/catch at
`:151-156` shows the function's intended totality, and the contract is stated twice: `:87-88`
("Never throws on a bad theme — … a symlink is reported as an issue, not an exception") and
`validate-theme-package.ts:214` ("Never throws"). A symlink cycle is exactly a "bad theme," so this
is a genuine contract violation, not a hypothetical.

**One correction to the proposed fix, which matters if anyone acts on this.** Swapping to
`lstatSync` alone is not sufficient and would make 13.3 worse: `lstatSync` does not follow the link,
so a cycle survives `:108` and then dies at `:111`'s `realpathSync`, and a *broken* link that
currently returns silently at `:109` would newly reach `:111` and throw `ENOENT`. The fix has to be
`lstatSync` plus an `isSymbolicLink()` test that reports `structure-symlink-forbidden` **before** any
`realpathSync` call.

**Corrected severity: MEDIUM.** The consequence is an exception escaping a validator documented as
total, breaking marketplace install / migration / the CLI for that package — availability of the
validation path, and it needs write access to the themes root or repo to trigger (see baseline).

### 13.3 — HIGH: a broken symlink escapes `structure-symlink-forbidden` → **CONFIRMED as fact, REFRAMED (HIGH → LOW)**

Mechanism CONFIRMED exactly as claimed: `statSync` at `:108` follows the link, a dangling target
yields `undefined`, and `:109`'s `if (!stat) return undefined;` returns before the `isLink` check at
`:111-116` ever runs. Neither flagged nor listed.

Gemini's escalation theory is mechanically coherent, and I checked the one step it depends on:
`downloadMarketplaceTheme` does `cpSync(fixture.dir, catalogDir/installedDir, { recursive: true,
filter })` (`marketplace.ts:281-282`) with a filter that only excludes generated preview paths —
`cpSync` defaults to `dereference: false`, so a symlink is copied **as a symlink**. So a relative
link that dangles at validation time and resolves after installation would indeed land in the
installed theme unflagged. That part of the argument survives.

**What does not survive is the severity.** The commit already self-disclosed this as pinned,
not-endorsed behavior (`structure.test.ts:47-61`), and the reachability baseline above is decisive:
the only thing this validator ever walks is a repo-local marketplace fixture, a directory our own
migrator produced, or a path a human typed at the CLI. Planting the crafted symlink requires the
write access the escalation would supposedly gain. The pinning test's own "blast radius: low"
rationale is right for a different reason than it states — not because the entry is merely dropped,
but because nothing untrusted reaches this walk today.

**Corrected severity: LOW**, and it is the same one-line fix as 13.2 — worth doing together, and
worth doing *before* any untrusted theme-upload path is added, at which point this becomes real.

### 13.4 — MEDIUM: `"././."` bypasses the root check → **CONFIRMED (first half), REFRAMED to LOW; second half DISCARDED**

First half CONFIRMED by hand-evaluation of `:227`. For `sourceDir = "././."`:
`startsWith("/")` false, `includes("..")` false; `replace(/^\.\/+/, "")` is non-global and strips
only the leading `./`, giving `"./."`; `replace(/\/+$/, "")` finds no trailing slash; `normalized`
is `"./."`, which is neither `""` nor `"."`, so `:228`'s `structure-sourcedir-root` never fires.
`checkSourceDirRootConflict` then splits on `/` and gets `"."` as the first segment, which is not a
reserved root. A `sourceDir` that denotes the theme root passes clean.

**Second half DISCARDED.** `sourceDir: ""` short-circuiting at `:264` via `!build.sourceDir` is
correct semantics, not a bypass — an empty `sourceDir` means "not specified," and there is nothing
to contain. Treating it as a root-conflict would be the bug.

**Corrected severity: LOW** — a normalization-completeness gap in a validator whose inputs are
first-party today.

### 13.5 — MEDIUM: the new test defeats the type system to reach a branch no real caller can → **CONFIRMED as fact, REFRAMED (MEDIUM → LOW), and it is fully disclosed**

CONFIRMED verbatim: `structure.test.ts:253` passes `schemaVersion: 1 as unknown as 2` against the
literal-`2` parameter type at `structure.ts:260`, to exercise the `if (schemaVersion === 2)` check at
`:277`. Given that parameter type, the false arm of `:277` is unreachable for every type-checked
caller — which the production doc at `:250-257` argues at length and explicitly concludes ("So
`schemaVersion: 1` was never reachable here, and the type now says so").

**But Gemini frames this as undisclosed coverage padding, and it is not.** The test file's own
comment at `:243-249` states the entire situation — that the value is no longer constructible
through the type, that the pin is restored via an unsafe cast, and why the type was not widened back.
That is a disclosed characterization test, and the dispatch's own standard says to judge it as such.

**What is actionable, at LOW:** the runtime `schemaVersion === 2` check and the cast-test are now
redundant with each other. This is the locally-provable kind of unreachable branch, so the check is a
delete candidate and the test should go with it — keeping both is the one option that carries cost
without buying anything.

### 13.6 — LOW: Windows path separators unhandled → **DISCARDED (not a defect on this platform)**

Code fact is right — `:222`'s `startsWith("/")` and `:237`'s `split("/")[0]` are POSIX-only, so
`"css\\sub"` yields the single segment `"css\sub"` and misses the `css` reserved-root collision. But
the deployment target is macOS/Linux, package-relative paths are POSIX-normalized on the way in
(`:112`, `relative(base, full).split(sep).join("/")`), and on POSIX a backslash in a manifest string
is an ordinary filename character, not a separator — so `"css\sub"` genuinely is not the `css` root.
There is no defect here to fix until Windows is a target.

### Chunk 13 counts

6 claims: **0 CONFIRMED at claimed severity**, **4 CONFIRMED as fact but REFRAMED down** (13.1
HIGH→LOW, 13.2 HIGH→MEDIUM, 13.3 HIGH→LOW, 13.5 MEDIUM→LOW), **1 split** (13.4 first half
CONFIRMED→LOW, second half DISCARDED), **1 DISCARDED** (13.6). Every code fact cited was accurate;
every severity was too high, mostly because the claims assumed an untrusted-upload reachability this
validator does not have. The most useful item is 13.1's unreachability proof, which also invalidates
a comment in the test the commit added.

---

## Chunk 19 — `438ada6a` `platform/export/site-exporter.ts`

### 19.1 — HIGH: `writeNotFoundRoute` accepts any status `>= 400` → **CONFIRMED, REFRAMED (HIGH → MEDIUM)**

Code fact CONFIRMED, `site-exporter.ts:595-596`: the probe's only rejection is
`if (res.status < 400)`. Nothing bounds it above, so a `500` from a crashed 404-page render is
accepted, its body is written to `<outputDir>/404.html` (`:606-607`), and the route is reported as
`succeeded` (`:608`).

The asymmetry is real and I checked both comparators directly:
- `writeContentRoute:516` — `if (res.status !== 200)`, strict.
- `redirectOutcomeFor:552` — `if (status < 300 || status >= 400)`, bounded on both sides.
- `writeNotFoundRoute:595` — bounded below only.

Reachability CONFIRMED: `:769` dispatches `route.kind === "not-found"` straight to it, so this is
the live path for every export that has a not-found route.

**Two corrections to the framing.** First, the cited invariant at `:136-138` is about a failed route
being *reported* rather than silently missing — a 500 body here is written and reported as success,
which is a different (and arguably worse) failure, but quoting that invariant as the thing violated
is a stretch. Second, "including a raw 500 error page/stack trace" is asserted, not shown; whether
the site app's error response carries a stack depends on an error handler I did not inspect, and the
finding does not need it.

**Corrected severity: MEDIUM.** Export correctness, not security: a site whose 404 route is broken
ships the broken output as its production `404.html` and the export reports clean.

### 19.2 — MEDIUM: the cited integration test never evaluates the `>= 400` arm → **CONFIRMED (factual half); the V8 explanation UNVERIFIED; severity INFO**

CONFIRMED by reading the test. `site-exporter.test.ts:815-826` mounts
`wrapper.get("/intercepted-non-redirect", (_req, res) => res.status(200).send("not a redirect"))`
and asserts `reason === "expected a 3xx redirect response, got 200"`. In
`if (status < 300 || status >= 400)` the first disjunct is true for 200 and short-circuits, so
`status >= 400` is never evaluated to `true` anywhere in that test. The commit message's claim that
this arm "was previously proven through" that test does not hold under a literal read.

Gemini's supporting theory — that V8 marks the whole boolean expression's byte range hit once either
disjunct's short-circuit point is reached — I could not check, because settling it needs a coverage
run and those are barred here. It is also unnecessary: the conclusion follows from reading the test.

**Severity INFO** — a claim about a commit message's accuracy, not a code defect. The commit's actual
effect (adding a direct unit assertion for the arm) was the right thing to do regardless.

### 19.3 — LOW: the new test uses only `500`, never the boundary `400` → **CONFIRMED (boundary half); second half CONFIRMED but immaterial**

Boundary half CONFIRMED and it is a genuine surviving mutant. `site-exporter.test.ts:761` passes
`500` only. Mutating `:552` from `status >= 400` to `status > 400` makes
`redirectOutcomeFor(400, null, "/target")` fall through to
`{kind: "redirect-to", location: "/target"}` — a 400 recorded as a successful redirect — and no test
in the file passes `400`. One added case closes it.

Second half does not land. Gemini argues the test's `redirectOutcomeFor(500, null, undefined)`
argument shape means a regression deleting the `>= 400` check entirely would fail "via a secondary
'no location' check rather than by falling through." True about the mechanism, immaterial about the
outcome: the assertion is a `deepEqual` against the exact object
`{kind: "failed", reason: "expected a 3xx redirect response, got 500"}`, and the secondary path
produces `reason: "redirect response carried no Location header"`, so the mutation is caught. The
test is stronger than the claim allows — this repo's "assert exact error text" rule is what saves it.

### Chunk 19 counts

3 claims: **1 CONFIRMED, REFRAMED down** (19.1 HIGH→MEDIUM), **1 CONFIRMED as fact with its
mechanism unverified and severity reduced to INFO** (19.2), **1 CONFIRMED in part** (19.3 boundary
gap real, argument-shape complaint immaterial). No fabrication.

---

## Chunk 15 — `54c65bc6` `source-control/store.ts`

This chunk has the batch's two outright-false supporting premises. Both were only findable by
opening the file Gemini reasoned *about* rather than the file it was *given*.

### 15.1 — HIGH: `isUniqueLabelViolation`'s message-match combination untested → **REFRAMED (HIGH → LOW); its central supporting claim is FALSE**

Direct-test half CONFIRMED. `store.unit.test.ts` has exactly three
`isUniqueLabelViolation` tests — `:461` (non-Error), `:467` (`.code` match), `:473` (neither) — and
no case where `.code` is absent but `err.message` contains `"UNIQUE constraint failed"`. Three of
four combinations, as claimed.

**But the claim that the arm is "untested anywhere in the repo, including integration tests, since
`InMemorySourceControlCredentialSetRepo` always sets `.code`" is FALSE, and backwards.**
`repo.memory.ts:32-34` throws a **plain** `new Error("UNIQUE constraint failed: …")` with **no
`.code` property at all** — its own header comment (`:13`) says it matches better-sqlite3's wording
deliberately. So every duplicate-label test that runs through that repo (`store.unit.test.ts:264`
and `:548`) drives precisely the message-based arm, and nothing else could be translating those
errors into `SourceControlCredentialDuplicateLabelError`. The arm is well covered; only the direct
pure-function pin for it is missing.

The attribution half — that the commit's "1 branch of 88 remains unhit, consistent with tsx BRDA
instability" explanation is wrong and this is the unhit branch — **cannot be settled here** (it needs
a coverage run, barred) and is now unlikely on the evidence above.

**Corrected severity: LOW** — one missing direct-invoke case in a four-way table, not an untested
code path.

### 15.2 — HIGH (production bug): `probeAccountLabel` omits `User-Agent`, so GitHub 403s → **DISCARDED (premise disproved)**

Code fact is right: `store.ts:109-112` sends only `Authorization` and `Accept`.

**The premise is wrong.** The claim rests on "in production (real `fetch`, no `User-Agent` default)".
Node's `fetch` (undici) *does* set one. Measured directly against a local server with the exact
header set from `:110`:

```
HEADERS SEEN: {"host":"127.0.0.1:59826","connection":"keep-alive","authorization":"Bearer x",
"accept":"application/vnd.github+json","accept-language":"*","sec-fetch-mode":"cors",
"user-agent":"node","accept-encoding":"gzip, deflate"}
```

GitHub requires a `User-Agent` header to be *present*; it does not require a particular value, so
`user-agent: node` satisfies it. `accountLabel` is not permanently null in production, and the
"masked entirely in the suite" conclusion has nothing left to stand on. (Every other GitHub caller in
this feature — `github-git-provider.ts`'s `githubHeaders:177-184` — omits it for the same reason and
works.) Setting a descriptive UA would still be good practice; it is not a bug.

**DISCARDED.**

### 15.3 — HIGH (invariant violation): a provider-changing update mishandles `isDefault` → **CONFIRMED as an inconsistency, REFRAMED (HIGH → LOW); one supporting claim FALSE**

Both described outcomes follow from `store.ts:369` (`providerId = connection.providerId`) and `:380`
(`isDefault: requestedDefault === true ? true : existing.isDefault`), and I confirmed a provider
change really is supported — `UpdateSourceControlCredentialInput.isDefault`'s own doc at `:331-332`
says "the default connection for its **(possibly new) provider**".

- Move a provider's *default* credential to another provider with `isDefault` omitted → the old
  provider group is left with zero defaults. Real.
- Move a *non-default* credential to a provider that has no other credentials → that provider's only
  credential has `isDefault: false`, and `resolveDefaultForSourceControl` (`:464-472`) returns `null`
  via `findDefaultByProvider`, so `source_control_execute_commit` reports no credential configured
  despite one existing. Real, and the more user-visible of the two.

**The supporting comparison is FALSE.** Gemini contrasts this with "the delete path which is claimed
to promote" a remaining sibling. `deleteSourceControlCredential` (`:406-408`) is
`await deps.repo.delete(input);` — nothing else. There is no promotion on delete to be inconsistent
with.

**And the code matches its own field-level contract.** `:332-333` states "Omitted/`false` leaves
default status UNCHANGED," which is exactly what `:380` does. The tension is only with the *header's*
broader phrasing at `:33` ("a provider's first-ever saved connection auto-defaults"), which is
implemented in the create path (`decideCreateDefault`) and was evidently never intended to cover
arrival-by-provider-change.

**Corrected severity: LOW** — a real, reachable edge-case inconsistency between a header invariant
and the update path, with a recoverable symptom (toggle the default in the admin UI), no security
dimension, and a supporting argument that does not hold.

### 15.4 — MEDIUM (test quality): "never a plaintext write" is unasserted → **CONFIRMED, LOW**

CONFIRMED verbatim. `store.unit.test.ts:442-448` and `:450-459` each consist of a single
`assert.rejects(..., SourceControlCredentialSecretStoreUnconfiguredError)`; neither reads `deps.repo`
at all. The titles claim "never a plaintext write," which the assertions do not establish — a
regression that wrote the row before throwing would pass both.

The property does hold today (`sealConnection` throws before any `repo.create`/`repo.update`), so
this is a missing pin rather than a live bug; one `assert.deepEqual(await deps.repo.listByWorkspace(
{ workspaceId: WORKSPACE }), [])` closes it. **LOW.**

### 15.5 — LOW (comment accuracy): "no decrypt path exists" is contradicted in the same file → **CONFIRMED, LOW**

CONFIRMED, and it is worse than claimed because both halves are self-contradictory within their own
files:
- `store.ts:17-23` states "there is no `resolveForX`/decrypt function here … Adding a decrypt path
  with no caller would be dead code." `decryptRecord` is at `:429` and
  `resolveDefaultForSourceControl` at `:464`, and the latter's own doc at `:442-443` cites that very
  header sentence as the authority under which it was added. The header's escape clause was honored;
  its opening claim was simply never updated.
- `store.unit.test.ts:45-46` states "No decrypt path is tested here because none exists," while
  `:437-438` in the same file points at `store.resolve.unit.test.ts` as the place `decryptRecord`'s
  catch *is* covered (that file exists).

Two stale comments, both asserting the absence of code that is present. One for the false-comment
register. **LOW.**

### Chunk 15 counts

5 claims: **0 CONFIRMED at claimed severity**, **1 DISCARDED on a disproved premise** (15.2),
**3 CONFIRMED but REFRAMED down** (15.1 HIGH→LOW, 15.3 HIGH→LOW, 15.4 MEDIUM→LOW), **1 CONFIRMED at
claimed severity LOW** (15.5). Two of Gemini's supporting factual claims were outright wrong — that
the in-memory repo sets `.code` (it does not) and that the delete path promotes a sibling (it does
not) — and both wrong claims were load-bearing for a HIGH.
