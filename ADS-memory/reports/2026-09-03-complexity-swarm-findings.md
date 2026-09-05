# Complexity swarm — bug findings register (2026-09-03)

Findings surfaced by the `apps/website` complexity-debt swarm. These are BUGS found while
refactoring, reported rather than silently fixed. Each needs an owner decision.

Status legend: OPEN = reported, not fixed. FIXED = fixed with a regression test.

---

## F-1 — `disconnected` status left with a live sealed token (OPEN)

- **File:** `apps/website/src/assistant/external-mcp-oauth.ts:917-918`
- **Found by:** batch A, while refactoring `setOAuthStatus`
- **Verified by coordinator:** commit `f1fbc88a` reviewed; finding is in `createExternalMcpOAuthService`'s
  closure, a different function from the one refactored — so it is pre-existing, not introduced.

In `pollDeviceAuthorization`'s non-retryable-failure catch branch:

```
deps.devices.delete(input.serverId);
await setOAuthStatus(deps, input.serverId, "disconnected");   // <-- no { clearToken: true }
throw error;
```

`disconnect()` sets the same `"disconnected"` status but passes `{ clearToken: true }`. The
device-poll terminal-failure path therefore leaves a previously-sealed token intact, breaking the
implicit invariant "disconnected implies no live token" that `disconnect()` maintains.

**Exploitability:** not currently an access-control bypass. `createExternalMcpConnectionGate` and
the token refresher's `load()` both gate ONLY on `oauthStatus === "needs_reauth"`, never on
`"disconnected"` — so a stale-but-unexpired token surviving a failed reconnect would be usable via
those paths regardless of the `clearToken` omission. The bug is the broken invariant, and the risk
is that a future caller starts trusting `"disconnected"` to mean "no token".

**Decision needed:** add `{ clearToken: true }` to match `disconnect()`, or document that
`"disconnected"` deliberately does not imply token clearance.

---

## F-2 — `completeAuthorizationCallback` has no catch; row stuck in `pending` (OPEN)

- **File:** `apps/website/src/assistant/external-mcp-oauth.ts` (`completeAuthorizationCallback`)
- **Found by:** batch A

The authorization-code path has NO catch around `completeAuthorizationCode`. A terminal failure
leaves the row in `"pending"` indefinitely, rather than reverting to `"disconnected"` as the
device-code path does. Second instance of the same status-lifecycle inconsistency as F-1.

**Exploitability:** `"pending"` is not gated either, same caveat as F-1.

**Decision needed:** whether the two OAuth completion paths should converge on one failure contract.

---

## F-3 — six CI gates are RED and invoked by no workflow (OPEN)

Measured by the coordinator, not an agent. `package.json` defines 19 `check:*` scripts; **nine are
referenced in zero `.github/workflows/` files**, and six of those nine currently FAIL:

| Gate | rc |
|---|---|
| `check:secret-scan` | FAIL(1) — credential-shaped strings in git HISTORY, at pre-restructure path `src/integrations/__tests__/secret-sealer.aesgcm.test.ts` (absent from the working tree) |
| `check:openapi-secret-leaks` | FAIL(1) |
| `check:openapi-contract` | FAIL(1) |
| `check:embed-marker-drift` | FAIL(1) |
| `check:outbox-bridge` | FAIL(1) |
| `check:theme-replaced-elements` | FAIL(1) |
| `check:seal-aad` | PASS |
| `check:default-credential` | PASS |
| `check:coverage-integrity` | PASS |

`ci.yml` additionally contains 26 `continue-on-error` occurrences.

**Measurement caveat:** `timeout` does not exist on this macOS box. An earlier probe using it
returned rc=127 for all nine and looked exactly like nine real failures. The table above is the
rerun without it.

---

## F-4 — three gate-backing files are dual-purpose (library + CLI entrypoint)

Not a bug; a hazard the swarm was warned about. These `package.json` scripts point directly at
source files being refactored this session:

- `check:secret-scan` -> `apps/website/src/features/webhooks/secret-scan-guard.ts` (batch C)
- `check:seal-aad` -> `apps/website/src/features/webhooks/seal-aad-invariant.ts` (batch C)
- `check:default-credential` -> `apps/website/src/features/identity/default-credential-exposure.ts` (batch D)

Each ends with `main()` + `process.exit(1)` behind
`if (import.meta.url === pathToFileURL(process.argv[1]).href)`. A refactor can leave the library
API perfect and silently disable the gate, and eslint, `tsc`, and the test suite all stay green.
Batches C and D were messaged to run the gate before and after their changes.

---

## F-5 — the MANDATORY governance ADR tier is not in version control (OPEN)

**CORRECTED 2026-09-03.** An earlier version of this finding claimed the registry "indexes 4 of ~80
ADRs". That was wrong and is retracted — see Part 3. The real finding is more serious.

**Part 1 — `ADS-memory/governance/` is untracked.**

```
$ git check-ignore -v ADS-memory/governance/adrs/ADR-INDEX.md
.gitignore:118:ADS-memory/*    ADS-memory/governance/adrs/ADR-INDEX.md
$ git ls-files ADS-memory/governance/
(empty)
```

Commit `7363fd4a "chore: track only the pipeline artifacts in ADS-memory"` deliberately narrowed
tracking to `ADS-memory/reports/**`. So the four GOV-ADRs — three of them MANDATORY and ACCEPTED —
and the index that `skills/adr-governance/SKILL.md` directs **every implementation agent** to consult
exist only on this machine. Not in any teammate's clone, not in CI, not on the deploy mirror.

A governance layer that is mandatory, machine-scannable, and untracked is a rule set that silently
does not exist for anyone but this checkout. Six agents "checked ADR-INDEX.md" during this session;
all six read a file no one else has.

**Part 2 — the four scope globs were dead paths, and have been repointed.** As measured earlier
today they read `src/features/**`, `src/core/gated-mutations/**`, `src/infra/**`, `src/identity/**` —
none of which exist, `src/` having gone away in the 2026-09-02 `apps/website` restructure. Identical
failure to `check-src-complexity-drift.ts`'s SCOPES, documented in its own SCOPE HISTORY header.
An agent has since repointed them to `apps/website/src/...` in the working tree. **That fix cannot be
committed** while the path is gitignored.

Note the repoint was NOT a blanket `src/` -> `apps/website/src/` prepend: `src/core/...` resolved to
`apps/website/src/contracts/core/...`, `src/infra/**` to `apps/website/src/platform/**`, and
`src/features/storage/**` to `apps/website/src/features/database/**`.

**Part 3 — RETRACTED: the architecture tier is indexed.** `ADS-memory/reports/architecture/ADR-INDEX.md`
exists, holds **57 indexed rows** including `| [030](ADR-030-members.md) |`, and IS tracked (104 files
under that directory). The structure is two tiers each with its own index, in different formats —
plausibly deliberate, not drift:

| Tier | Index | Rows | Tracked |
|---|---|---|---|
| `governance/adrs/` | `ADR-INDEX.md` (scope-glob format) | 4 | **NO** |
| `reports/architecture/` | `ADR-INDEX.md` (link/status format) | 57 | yes |
| `reports/pipeline/<NNN>-<feature>/adr.md` | none found | — | yes |

Both `ADR-030` and `ADR-PIPE-008` are valid citations, not dangling — two sessions independently
suspected each of being phantom before locating them.

**Part 4 — `dead-path-sweep.ts` structurally cannot catch the dead globs.** Its `RAW_SKIP_RULES`
reject any literal containing glob metacharacters (`/[*?{}[\]!()|^$+\\]/`, ~line 360); every scope
glob contains `*`. It also scans TypeScript string literals, not markdown tables.

**Part 5 — two further stale copies on disk**, neither authoritative:
`AI-Dev-Shop/ADS-memory/governance/adrs/ADR-INDEX.md` and
`AI-Dev-Shop/project-knowledge-template/governance/adrs/ADR-INDEX.md` (framework template,
read-only during feature work).

**Owner decisions:** (a) should `ADS-memory/governance/` be tracked? It is small, slow-changing,
high-value, and every agent is told to obey it — but `7363fd4a` narrowed tracking deliberately, so
reversing it is not an agent's call. (b) Does `reports/pipeline/*/adr.md` need an index?

---

## F-6 — ADR records a deploy blocker that was since cleared (CLOSED — the ADR is stale, not the code)

`ADS-memory/reports/pipeline/008-seo/adr.md:3` records blanket human approval across
`ADR-PIPE-008..015`, notes "Red-Team has NOT run for SPEC-011 — accepted with that acknowledged
gap", and calls a failure/rollback test against Newsletter's real 5-table manifest "a hard
precondition, not optional, before any non-dev deploy", describing `declareDataModule()` as
"spike-quality code now load-bearing".

**RESOLVED — not a live blocker.** The required test exists and passes:
`apps/website/src/features/newsletter/__tests__/data-module-manifest.failure-rollback.test.ts`
(8598 bytes, dated 2026-08-28 — written after the ADR, closing the precondition), plus
`features/plugins/__tests__/migration-recovery.test.ts` on the recovery side; 8/8 pass. Three further
suites (`data-module.test.ts`, `data-module-indexes.test.ts`,
`data-module-column-reconciliation.test.ts`) cover `declareDataModule`, so "spike-quality code"
is no longer accurate either. Verified independently by two sessions.

**The finding is therefore inverted, and is still worth acting on:** the ADR's status line records a
blocker that was cleared over a month ago and a code-quality claim that is no longer true. An ADR
asserting a stale blocker is its own false signal — it will scare off the next reader exactly as it
did here, costing two sessions a verification round. Registry work should treat "status line drifted
out of date" as a failure mode alongside "scope glob points nowhere".

**Still unverified:** the same status line's "Red-Team has NOT run for SPEC-011" acknowledgement.
That is a process gap and cannot be confirmed from the tree.

---

## F-7 — path-only router-stack matching returns the wrong handler (reported by peer session)

A route-test helper that matches on path alone silently grabs the wrong handler: `posts/get-by-id.ts`
(GET), `delete.ts` (DELETE) and `update.ts` (PUT) share one path string, so a test aimed at PUT
quietly exercised GET and returned a plausible 200. It reports **false coverage** rather than
erroring. The shared `extractRouteHandler` already filters on `route.methods[method]`; any local
reimplementation must too. No batch in this campaign touches route files, so this does not affect
the complexity swarm's own results.

---

## F-8 — an orphaned, untracked test has been sitting in the shared tree all session (OPEN)

`apps/website/src/features/comments/__tests__/data-module-install.test.ts` — 1805 bytes, written
2026-09-03 09:47, **untracked** (`git ls-files --error-unmatch` fails on it). It belongs to neither
the complexity campaign nor the route-coverage campaign; it predates both and was written by an
earlier session that never committed it.

Left uncommitted it is invisible to every gate and one `git clean` from gone. It is NOT to be
swept up by another agent's commit — batch F is actively editing `comments/ingress.ts` and
`comments/__tests__/ingress.test.ts` in the same directory, and is under instruction to `git add`
exact paths only, so it will not be captured accidentally.

**Owner decision:** commit it, or delete it. Committing another session's unreviewed work is not a
call an agent should make.

---

## F-9 — legacy presentation-settings migration silently keeps only the last row (OPEN)

`apps/website/src/features/settings/migration.ts`, `migrateLegacyPresentationSettings`'s
`for (const row of rows)` loop (~lines 203-241).

Every legacy row writes to the SAME `core.presentation.activeThemeId` **global** setting — deliberate
per the file's own header. But each row's skip-if-unchanged check compares against whatever the
*previous row in the same loop* just wrote. With N rows carrying different `activeThemeId` values,
only the last-iterated row's value survives, while `migratedCount` counts every row that differed
from the in-progress state as a success. The count therefore means "N writes happened", not "N
workspace preferences were preserved" — most are clobbered by the next iteration.

No existing test exercised more than one row with differing `activeThemeId`, so this was untested.

**Reported, not fixed** — genuinely ambiguous: it turns on whether multi-row is a real production
scenario after the consolidation to a global setting. If it is, the migration loses data silently.
If it isn't, the loop is over-general and `migratedCount` is merely misleading.

---

## F-10 — exit-code masking: three independent instances in one session (PROCESS)

Piping a checker through another command replaces its exit code with the pipe's. This bit three
times today, each time producing a *confident but unfounded* verification claim:

1. **Coordinator:** probed 9 `check:*` gates wrapped in `timeout`, which does not exist on macOS.
   All nine returned rc=127 and read as nine real failures. They were one shell error.
2. **Batch E:** ran `npx tsc --noEmit 2>&1 | tail -80` backgrounded, then read the task's reported
   exit code — which was `tail`'s (~always 0), not `tsc`'s. Reported "tsc clean" and committed on
   that basis. The tree in fact had a TS7022 error in the file it had just edited.
3. **Coordinator:** ran `npm run check:secret-scan ... | tail -6` and read `rc=$?` — again the
   pipe's status, not the gate's.

**Rule:** never read `$?` or a harness-reported exit code through a pipe. Run the checker bare,
capture to a file, then read the file. Where a summary line exists (ESLint's
`✖ N problems (E errors, W warnings)`) it is a total across every scanned file and is authoritative
even when the terminal truncates the display — a separate question from exit-code masking, and one
that does NOT invalidate batched runs.

---

## F-11 — PRIVILEGE ESCALATION: `resetUserPassword` has no seeded-owner guard (DISPATCHED)

**Repo: `/Users/la/Programming/Jini`** (not Tovu).
`packages/cms/src/identity/admin-crud-service.ts`, lines 188-247.

```ts
input: { workspaceId: UUID; callerPrincipalId: UUID; principalId: UUID; password: string }
```

No `seededOwnerPrincipalId`, and no owner check anywhere in the function's 59 lines. Its sibling
`disablePrincipal` (line 61) DOES take that parameter and refuses at line 75 with
`OwnerRequiredError` (REQ-11/REQ-13), plus a second INV-08 guard refusing any change that drops the
workspace's active owner-`*` count to zero.

**Attack:** `user.manage` is independently grantable and explicitly NOT owner-exclusive
(`permissions.ts:80` — "Create/disable operator users and principals"). Grant a mid-level admin that
one permission as a routine delegation and they can call `RESET_USER_PASSWORD` against the seeded
owner, set a password of their choosing, and log in as owner. Full takeover from a delegated
permission.

Verified independently by two sessions by direct read of the live checkout.

Note `apps/website/src/server/inbound/admin-http/routes/users/reset-password.ts` reached 100/100
coverage today under `2dc4ff89`, and that agent deliberately did NOT write a test asserting the
escalation succeeds — it recognised the behavior as wrong instead of enshrining it. That judgment
must not be undone: the test to write is the one proving the reset is REFUSED.

---

## F-12 — STORED XSS: menu hrefs are escaped but never scheme-checked (DISPATCHED)

`apps/website/src/features/theme/static-render.ts`. `escapeHtml` (line ~159) encodes only
`& < > " '` and never inspects a URL scheme — correctly, that is not its job. Menu rendering calls
only `escapeHtml`, so `href: "javascript:alert(1)"` renders verbatim as
`<a href="javascript:alert(1)">` on the **public site**, byte-identically in BOTH the flat
(`renderMenuLinks`) and tree (`menuItemBody`) paths. Verified by direct probe through both.

Anyone able to set a menu link href stores script that executes in every visitor's browser,
including an admin's.

**The fix already exists and was never wired in.** `safeHref` at
`apps/website/src/server/inbound/public-http/http/site/render.ts:244` allows `#…`, same-origin
`/…`, `http(s)://` and `mailto:`, and collapses everything else — "notably `javascript:` and
`data:`" — to `"#"`. It is mature, not a sketch: a 2026-08-20 audit fix hardened its `/…` branch
against protocol-relative bypass (`//evil.example`, `/\evil.example`). `render.ts:501` uses it.
The menu renderer does not.

Constraint on the fix: `features/theme/` must NOT deep-import from
`server/inbound/public-http/http/site/` — wrong direction across a module boundary, and
`check:boundaries` already reports 11 real no-deep-import errors. Either promote `safeHref` to a
shared location or duplicate it with an explicit cross-reference comment; the two must not diverge.

---

## F-13 — THE DOMINANT DEFECT PATTERN: correct primitive, unwired call site (META)

Five independent instances in one session, found by five different agents across two repos:

| # | Primitive that exists and works | Call site that never adopted it |
|---|---|---|
| 1 | `access-resolver.ts`'s `decide()` (verified sound by a 15-cell truth table) | one public content route never gated — live paywall bypass |
| 2 | Newsletter OCC chokepoint implementing `expectedVersion` | route never passed the field — the check was a permanent no-op |
| 3 | `disablePrincipal`'s `seededOwnerPrincipalId` owner guard | `resetUserPassword` takes no such parameter — F-11 |
| 4 | comments' documented publication/`closed` contract | submission path has no publish check at all |
| 5 | `safeHref`'s scheme allowlist | menu rendering calls only `escapeHtml` — F-12 |

Plus a sixth in Jini: the widgets domain uses a `baseVersion` OCC pattern; `renameTerm` has none.

**The primitives in this codebase are generally good. The wiring is what fails.** Consequences for
how this repo should be audited: a review that verifies a security primitive in isolation and
concludes "the mechanism is sound" is answering the wrong question. The question is *which call
sites reach this primitive, and which reach the same sink without it*. Every instance above would
have been missed by primitive-level review and was only caught by asking "what else reaches this
sink?"

Corollary for tests: a passing test proving the primitive works is not evidence the system is safe.
Instance 1's primitive had a clean 15-cell truth table while the bypass was live.

---

## F-14 — CORRECTION: `continue-on-error` does NOT neutralise these gates (and a false belief was acted on)

**This corrects an error made twice by this coordinator during the session, and one embedded in the
repo itself.**

The coordinator asserted that `check:inventory`, wired at `ci.yml:318` with `continue-on-error: true`,
was therefore non-blocking and its crash silently swallowed. **That is wrong.** An agent pushed back
with the mechanism and was right:

- `ci.yml:460` reads `steps.gate-inventory.outcome`.
- In GitHub Actions, **`.outcome` is a step's result BEFORE `continue-on-error` is applied**;
  `.conclusion` is the field forced to `success`.
- The "Gate summary (build-and-test)" step `exit 1`s at `ci.yml:477` on any non-success outcome.

Reading `.outcome` is exactly what defeats the swallowing. `ci.yml`'s own header (lines 198-200)
states this plainly: *"They are NOT non-blocking: the Gate summary step… reads every outcome and
fails the job if any of them failed. The change is WHEN you learn, not WHETHER it blocks."* The
pattern exists so all gates run and report together, rather than the job halting at the first red
step — not to make them advisory. This applies to all 12 aggregator-summary gates, not just one.

**The consequence is not academic.** The same misreading was independently written into
`development/scripts/__tests__/dead-path-sweep.test.ts`'s `KNOWN_BROKEN_PENDING_OWNER_DECISION`
register, verbatim: *"ci.yml's continue-on-error swallows the crash."* **Three genuinely broken gate
scripts were parked as "the owner's call, not a mechanical repair" on the strength of that false
premise** — the register reasoned the breakage was invisible to CI, so tolerating it was safe. It was
not invisible; it was failing the job. The remaining 18 register entries need re-auditing for the
same reasoning.

**Lesson, and it generalises past this repo:** a wrong belief about tooling semantics does not stay a
comment. It becomes a *disposition* — work deliberately not done, recorded as a decision, inheriting
the authority of a written rationale. The false-comment problem (F-6, F-13, and three separate doc
comments today) is the visible half; this is the expensive half.

**Still true from F-3:** nine `check:*` scripts are referenced in **zero** workflow files. Being
unwired is a different failure from being wired-but-tolerated, and that count is unaffected by this
correction.

**Resolved since F-3:** four of the five crashing scripts are now green and verified by direct run —
`check:inventory` (25 entries), `check:embed-marker-drift` (105 theme files), `check:outbox-bridge`,
`check:openapi-secret-leaks` (79/132 ops, 0 leaks). `check:openapi-contract` remains genuinely red on
**27 real spec mismatches** — instrument repaired, readings not yet acted on. Commit `99635013`.

---

## F-15 — the owner's live production admin password is exported in `~/.bash_profile` (OWNER ACTION)

`~/.bash_profile:91` exports `TOVU_ADMIN_PASSWORD`; line 90's own comment identifies it as the
Fly-deployed credential and gives the rotation command. **Every Bash call in every agent session
inherits it**, and its literal value has been echoed into at least one agent transcript.

**Recommended: rotate it** (`fly secrets set TOVU_ADMIN_PASSWORD=<new> -a tovu-ai-cms`) and move it
somewhere not inherited by every subprocess. Not actioned — the owner's shell profile is not an
agent's to edit.

**It also invalidated conclusions all session.** `apps/website/src/features/identity/wiring.ts:120`
seeds the test owner with `process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD`, while
`http-test-server.ts:55` and 14 other test files hardcode `"tovu-dev"`. So every admin-authenticated
test 401s **in setup**, before exercising anything.

Misattributed to "pre-existing repo issues" by three separate agents before the cause was found. One
proved it via revert-and-rerun — a valid method that reached the wrong conclusion, because the
variable was set in both runs. It also crashes both openapi gate scripts outright.

**Workaround: `env -u TOVU_ADMIN_PASSWORD <command>`.** The empty-string form does NOT work —
`wiring.ts` uses `??`, which falls back only on null/undefined.

**The sharpest risk is a false green:** two agents were proving that a duplicate restore-point POST
and a comment on a draft entry are *refused*. Under the poisoned environment both 401 in setup, which
is indistinguishable from the refusal they were sent to demonstrate.

**Not everything was this.** `comments/__tests__/data-module-install.test.ts` fails identically under
`env -u` — a real, unrelated, pre-existing bug in a raw `better-sqlite3` table-install assertion.

---

## F-16 — two verification traps that produce a GREEN suite over a dead server, and a RED gate that proves nothing

Both found by peer session `tovu-f7`, recorded here because both defeat the normal check.

**(a) `posts-*/pages-*` written in JSDoc PROSE terminates the comment block.** The `*/` inside
`posts-*/pages-*` closes the comment. esbuild throws `Unexpected "*"`, and because `tsx watch`
re-runs on save, the API **crash-loops**. It cost the owner's dev server ~2 minutes and was
initially misattributed to an unrelated TLS change.

**It does not appear in test output.** `node --test` spawns its own process, so the suite passes
GREEN while the server is dead. Only a repo-root `tsc` catches it.
Detect with: `grep -n '^\s\*.*[a-z-]\*/[a-z]' <file>`

**(b) `check:route-coverage-floor` runs no tests.** It reads whatever
`development/coverage/lcov.info` happens to be on disk — one observed run used a 2-hour-stale file
— and its raw `funcs` figure is a known Node test-file-name-collision artifact. It reported
`funcs 44.67% (floor 93%)` when the script's own header records the corrected baseline as
**97.52%**. **A red from that gate proves nothing until the lcov is regenerated on a quiet tree.**

Same family as F-10 (exit-code masking) and F-14 (a false tooling belief becoming a disposition):
the check runs, produces a confident number, and the number is about something other than what the
reader assumes.

---

## F-17 — the `static-render.ts` duplicate never needed to exist, and its own comment says why wrongly

`features/theme/static-render.ts` carries a deliberate duplicate of `safeHref`, justified in its own
header as avoiding a forbidden import. Peer verification found the cited cause is wrong:

- `render.ts` and `features/theme/` **already import `@jini-ai/cms/core` today**.
- `.dependency-cruiser.mjs` sets `doNotFollow: { path: "node_modules" }`, and **no rule anywhere
  names `@jini-ai/cms`**.
- The rule actually in play is `feature-no-server-or-framework-imports` — `features/theme` may not
  deep-import `server/inbound/**`. That says nothing about an **external package**.

So the duplicate was created to satisfy a constraint that does not apply to the shape it took.
**Fourth instance today of a comment asserting something untrue** (after `types.ts`'s referential-
integrity claim, `ci.yml`'s "always exits 0", and `parse.ts`'s "no clear semantics").

**Resolved by promotion, not duplication:** canonical `isAllowedHref` +
`ALLOWED_HREF_SHAPES_DESCRIPTION` now live in `@jini-ai/cms/navigation` (Jini `cadcb4bd`), with a
sync gate at Tovu `20112f69` (`check:menu-href-allowlist-sync`). The gate does NOT hand-copy the two
Tovu copies' logic — that would be a fourth copy — it derives a callable from each file's live
source text and throws if either is renamed past its anchor. Proven three ways, including a RED
against the pre-fix denylist reconstructed via `git show 7ca73018~1` that produced 11 mismatches and
correctly did NOT flag the 2 rows the old `.trim().toLowerCase()` legitimately caught.

**Disclosed limitation:** the gate asserts against `dist`, because `@jini-ai/cms`'s `exports` map
has no `src` path — so it goes stale against an unbuilt Jini edit until
`pnpm --filter @jini-ai/cms build` runs.

**Still open:** retiring the two Tovu copies to import the predicate (file:line and replacement body
are in `20112f69`'s commit message).
