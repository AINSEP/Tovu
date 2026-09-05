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
