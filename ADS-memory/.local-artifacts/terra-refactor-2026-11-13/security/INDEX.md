# Security review index — hard item #5 (2026-11-16, revision 2)

Full text: [`REVIEW.md`](./REVIEW.md). Docs only; no source edited; **no test, lint or type-check was
run** (every statement about a test is from reading it). Status: **COMPLETE** — all items A1–A3, B1–B3,
C, D written; revision 2 answers the judge.

Reviewed at: Tovu `integ/wave-b-r2` `65302ee5`, Jini `integ/wave-b-r2` `02edbb68`, plus the branch
heads named in `REVIEW.md`.

## What changed in revision 2

An adversarial judge (Codex gpt-6.1-sol, high; `CODEX-JUDGE.md`) returned "needs rework": 5 majors,
3 minors. Each was checked against the code before anything was changed.

- **Accepted (7 of 8 in full):** A1 owner check skipped for a falsy owner after the type was
  generalised (new A1-F5); A06 budget windows not seen by the limiter cache (new B1-F10); A06's Tovu
  step never connects the binding to the executor (new B1-F11, **high**); A51 loses its hostname
  admission tests (new B3-F5); saved-keys test inventory was wrong (two suites exist); A37 hands out
  the pinned object itself (A3-F1 widened); B2 wildcard fix was too broad (narrowed).
- **Accepted in part (finding 5, owner rules):** required tables in the optional argument — accepted
  (new B1-F13). The "factories over 50 lines" claim — **rebutted**: the rule and the lint setting do not
  count blank lines or comments; counted that way they are 48 and 43. The "no barrels" claim — fact
  accepted, violation not shown (no written rule against a Jini subpath entry file); raised as an
  **owner question**.
- **Owner decision applied:** B2-F1 / A50 — the same-origin check compares the **full origin** (scheme
  + host + port). Resolved as a decision; the sheet still has to be rewritten to it.
- **Second adversarial pass** over every "safe" / "safe with fixes" verdict, for the judge's three
  classes: four more findings (A1-F6 low, B1-F12 medium, B3-F6 low, C-F4 low).

**Changed verdicts:** B3 highest severity low → medium (verdict stays "safe with fixes", now with a
must-fix). C (dependency age gates) "safe" → "safe with fixes". B1 stays "unsafe" and gains a second
high. B2-F1 moves from "owner decision needed" to "resolved". All other verdicts unchanged.

## Verdicts

| Item | What | Verdict | Highest severity | Must fix before merge / execution | Tests missing |
|---|---|---|---|---|---|
| **A1** | A03 bound visitor confirmations (Jini `af6779fb`, Tovu `022e1d5b`) | safe with fixes | medium | 1. Tovu half: restore the escaped bidi character class in `visitor-confirmation-gate.ts:39` (raw invisible characters were written into the filter; commit says "unchanged"). 2. Before the Jini half is published: **(new) make the owner check test presence, not truthiness** (`bound-confirmations.ts:128`), or constrain the owner type to objects. 3. Before the Jini half is published: add the six missing gate tests. | Jini: **owner cases — matching, different, omitted — for every admitted owner representation, each refusal leaving the prompt usable (new)**; approve path, single use, abort, deny-never-prompts, deliver-on-throw, slot release. Both: crypto only from the injected port. Tovu: no raw bidi in source; visitor exchanges unreachable from the admin reply route. |
| **A2** | B07 vault rotate re-seal check (Jini `ab0ef93c`) | **unsafe - do not merge as is** | **high** | 1. Land the Tovu half with it: Tovu's key-switch recovery binds `open` to the previous key and `seal` to the new key (`site-key-recovery.ts:169-175`), so the new open-back check refuses every row. Give `rotate` an explicit source opener (preferred). 2. Keep a redacted cause on the refusal. | Sealer contract suite per binding (`open(seal(x)) === x`); Tovu `site-key-recovery.unit.test.ts:130` run against B07 (exists, not run); refusal names the step and leaks nothing; copy-overwrite verified; key-store failure on open. |
| **A3** | A37 pinned capability + bearer handoff (Jini `1b5af586`; Tovu `13400b01` never pushed) | safe with fixes (Jini half); **move not mergeable until the Tovu half exists on the integration base** | medium | 1. Replace the accessor at `pinned-capability.ts:61` with one that returns the URL only: it returns the raw token with no endpoint check **and (new) the pinned object itself, which a holder can change**. 2. Redo the Tovu half on `integ/wave-b-r2` per the exact list in `REVIEW.md`. 3. Run the two Tovu tests the executor could not load. 4. Do not push with hooks skipped. | **Nothing obtainable from the runtime can change the pinned URL or bearer (new)**; delivery refuses redirects; abort on disconnect and timeout; disconnect before subscribe; malformed values still scrubbed; no accessor but the supplier returns the token; `process.env` clean after first use. |
| **B1** | Sheet A06 visitor tool engine | **unsafe - do not execute as written** | **high** (two) | Fix the sheet: 1. Move `principalId`, `refusalReason`, `emptyPolicy`, `allowedWithoutPorts` out of the optional ports. 2. **(new, high) Specify S3 completely: the surviving Tovu ports type and its file, the full adapter, the exact replacement for `capability-registry.ts:171` in both modes, and a closed second-argument type — as written the ports can be silently dropped (rollback mode: no policy, cap, budget or audit).** 3. Define "has a confirmation channel" in the port. 4. Pass the per-input "must confirm" function to the gate factory. 5. Keep budget-id mapping inside the budgets. 6. **(new) Fix the budget windows at construction, or key the limiter cache on the window too and define what happens to consumed allowance.** 7. **(new) Read input validators and forced-confirmation rules from a private map built at registration, not from the caller's list.** 8. **(new) Put the three public-error tables in the required first argument.** 9. Add the eligibility check, the 10 s / 24 000-byte limits and the advertisement rule to the must-survive list. 10. Re-take the gate blob after A03; fix the gate function name. | No-ports deny rule; **registry built with ports audits and charges; a stray `{ ports }` second argument does not compile (new)**; **window-only change under a fake clock (new)**; **caller's list emptied after construction: validator and forced confirmation still apply (new)**; **reporter cannot be built without each table (new)**; ask-without-channel charges no budget; forced confirmation reaches the gate; sentinel name collision; legacy/new id share one allowance; Jini budgets suite run against Tovu's real limiter (`burst: 0`); offerable-false never registered; timeout and output cap; own-property message lookup. Exists and must stay untouched: `visitor-tools.integration.test.ts:46-64`. |
| **B2** | Sheet A50 CSP declared hosts + same-origin write check | safe with fixes | medium | **Owner decision made: full-origin comparison.** Rewrite the sheet to it before execution: 1. The Jini function takes a required `expectedOrigin` and compares the whole serialised origin; remove the pinned "cross-scheme accepted" test and the STOP rule that protects host-only behaviour. 2. Both Tovu callers (`admin-surfaces.ts:72`, `site-share-password.ts:23`) get the expected origin from **one named helper**; the sheet must choose the scheme source on purpose (`req.protocol` refuses HTTPS behind a TLS-terminating proxy with no trusted hop count). 3. It is a behaviour change: failing tests first, changeset, release note. 4. Resolve the red test that contradicts "byte-identical" (`http:` in `script`): default is no behaviour change. 5. Reject the wildcard character in the moved origin check — **only that** (revision 1's stricter host grammar is withdrawn). 6. Correct the sheet's line numbers. | Jini: same host / different scheme refused both ways; different port refused; default port written on one side accepted; missing or malformed expected origin refused. Tovu: a scheme-only-differs case on the admin-surface route (red today); proxy cases for the chosen helper; wildcard host dropped **and** two "still accepted" pins; `http:` pin; bare-`;` policy separator. **Exists (corrected):** saved-keys route suites `site-share-password.integration.test.ts:26-48` and `site-share-password-handler.test.ts:39-75`; admin-surface guard `…security.integration.test.ts:129`. |
| **B3** | Sheet A51 session bootstrap | safe with fixes | **medium** (was low) | **(new) Before execution: keep the hostname admission cases in Tovu, driven through `readInitialAdminSession` with a bootstrap fake that succeeds and counts calls; rewrite the surviving remote-refusal test the same way (today it passes whether or not bootstrap is attempted).** Also: resolve the sheet's contradiction on who calls the loopback guard from the desktop tools host (keep the Tovu wrapper); add an optional failure callback; state that refusal is carried by control flow, not by a sentinel value. | **Per hostname: refused → zero bootstrap calls; admitted → exactly one (new)**; a direct table test of the hostname rule; **a falsy identity value after bootstrap is returned, not treated as refusal (new)**; failure callback receives the stage, result unchanged; explicit cases for alternate loopback spellings (accepted) and mapped/other loopback-range addresses (refused). |
| **C** | `cloud/small-fixes-2026-11-15`: `mcpIsolation` claim (Jini `10605caf`) | **unsafe - do not merge** | **high** | The claim "every run passes the strict flag" is **false** when the personal-MCP capability is unset: (a) no flag when nothing is staged, (b) no flag with parity + bypass, (c) the staged config already contains the project's MCP servers. 1. Drop the commit, or resolve the capability once (unset → off) for planner, argument builder and stager, and make the daemon verify the launch matches the plan. 2. Stamp a verified CLI version. 3. Replace the test with a matrix that inspects built arguments. | Matrix: capability {on, off, unset} × staged × parity × folder limit → every "RUN, not loading own" cell has the flag and no inheritance (red today in the unset cells); stamp format includes CLI version. |
| **C (rest)** | Dependency age gates, mail library pin (Tovu `939ee65d`, `52ac8c1b`; Jini `eff5c025`, `1a1a4d43`) | **safe with fixes** (was safe) | low | Not blocking the merge. **(new) The Tovu gate needs a recent npm and nothing pins npm; an older npm ignores the setting without failing (the npm in this review's environment does not know it).** Add an npm constraint and a CI step that reads the effective value. Confirm the first-party scope exemption actually matches, in both package managers. | A CI check that fails when the effective minimum release age is not 14 days. |
| **D** | Daemon judge findings 1, 2, 12 | facts only: **all three confirmed** on today's code | — | (For the design, not a merge.) 1. Mismatched principal is refused with 403 today; the rewrite happens only after the equality check; authorization runs before body-shape validation. 2. The delegated-call credential recheck at `agent-daemon-scope.ts:1433` reads the body parsed by the blanket parser at `:1407`; removing the parser breaks it (fail closed). 3. Both bearer checks use http-kit's native-bound constant-time compare; core's needs it injected. | Not found: a test that pins "internal router mounts before the public parser" (`app.ts:2005-2006`). |

## Criticals and highs

No critical. **Five highs** (four in revision 1):

1. **A2-F1** — B07's new open-back check is incompatible with Tovu's key-recovery sealer binding; merging the Jini half alone breaks "switch site key" re-sealing (fails closed, nothing lost).
2. **B1-F1** — sheet A06 leaves a default-deny rule with no source when ports are absent; the executor would have to invent the default.
3. **B1-F11 (new)** — sheet A06's Tovu step repoints an import but never rewrites the call that hands the policy ports to the executor, and deletes a type the confirmation gate still needs. One of the two possible outcomes compiles and runs with no policy, per-turn cap, budget or audit for anonymous visitors. An existing integration test would catch it if run unchanged.
4. **C-F1** — `mcpIsolation` removes the consent step on paths where no isolation is applied, including project-supplied MCP server definitions loaded with no trust decision.
5. **C-F2** — the isolation stamp is an unverified claim recorded in a field whose contract requires a verified CLI version.

Mediums added in revision 2: A1-F5, B1-F10, B1-F12, B1-F13, B3-F5.

## What blocks merging

- **Do not merge:** Jini `10605caf` (C); Jini `ab0ef93c` (A2) without its Tovu half.
- **Do not execute yet:** sheet A06 (B1) until the sheet is fixed (two highs, eight other items).
- **Do not execute yet:** sheet A50 (B2) until it is rewritten to the full-origin decision and names the scheme source.
- **Do not execute yet:** sheet A51 (B3) until the hostname admission tests are kept in Tovu (B3-F5).
- **Merge after one fix:** A1 Tovu half (restore the escaped character class).
- **Do not publish yet:** A1 Jini half (owner presence check + its tests + the six gate tests); A3 Jini half (URL-only accessor + its tests).
- **Not mergeable as a pair yet:** A3 (Tovu half does not exist on the integration base).
- **Not blocking:** C (rest) — merge, then add the npm constraint and the CI check.

## Tests that must be written first (before the code or sheet they guard moves)

1. **A1 / Jini:** owner matrix on `createBoundConfirmations` — matching, different and omitted owner, for every owner representation the contract admits, each refusal leaving the prompt answerable by its owner. Red today for a falsy owner.
2. **A3 / Jini:** nothing a caller can obtain from the pinned-capability runtime changes what the bearer supplier answers. Red today.
3. **B1 / sheet S1:** no-ports deny rule; window-only budget change under a fake clock; validator and forced confirmation survive a changed caller list; a stray `{ ports }` second argument does not compile. **Sheet S3:** registry built with ports audits and charges; keep `visitor-tools.integration.test.ts:46-64` unchanged.
4. **B2:** Jini full-origin cases (scheme, port, default port, missing expected origin); Tovu admin-surface route with only the scheme different (red today); proxy cases for the chosen scheme helper; wildcard host dropped with two "still accepted" pins.
5. **B3:** per-hostname bootstrap call counts through `readInitialAdminSession` with a succeeding fake; red when `admit` is bound to a constant `true`.
6. **A2:** run Tovu `site-key-recovery.unit.test.ts:130` against a Jini with B07; add the sealer contract suite.
7. **C:** the capability × staged × parity matrix that inspects built arguments (red today in the unset cells).

## Owner questions open

- **Entry files in Jini.** Should a new Jini subpath point its `exports` entry straight at the implementation files instead of at an `index.ts` of re-exports? The judge reads a "no-barrels" target; I could not find it written for Jini entry files (`COMMON.md` rules 5, 17, 19). Affects A1 (`surface-exchanges.ts:66`), A3 (`hosted/index.ts:14`), B1 and B3 (new `index.ts` files).
- **B2, scheme source.** The full-origin decision is made. Still to confirm: which Tovu helper supplies the expected scheme for the two admin routes (recommended: forwarded scheme when it is exactly `http` or `https`, else `req.protocol`, as the comments route does).
- **B2-F2.** Keep `http:` declared hosts accepted for `script` and `connect` (default, no behaviour change) or drop them (stricter; needs a caller check).

## What I could not verify

- Any test result, lint result or complexity number (nothing was run; no install or build was done).
- The unpushed Tovu commit `13400b01` (A3) — not readable from here.
- The real behaviour of the CLI's strict-config flag for plugin, account-connector and managed MCP sources (C).
- Whether Tovu can reach the Jini executor with the personal-MCP capability unset (C).
- Every `SecretsVaultService` construction outside the three I read, and any use in Tovu-Runner or Zana (A2).
- The server routes that mint, rotate and end sessions (B3: the sheet does not touch them).
- That the saved-keys route refuses HTTPS pages behind a TLS-terminating proxy with no trusted hop count (B2: from reading only).
- Which npm version first has the minimum-release-age setting, and whether its exclude key exists under the name used (C rest): a newer npm could not be fetched in this environment.
- Mutation sensitivity of any existing test (all "it fails if…" statements are from reading).
