# Security review index — hard item #5 (2026-11-16)

Full text: [`REVIEW.md`](./REVIEW.md). Docs only; no source edited; **no test was run** (every
statement about a test is from reading it). Status: **COMPLETE** — all items A1–A3, B1–B3, C, D written.

Reviewed at: Tovu `integ/wave-b-r2` `65302ee5`, Jini `integ/wave-b-r2` `02edbb68`, plus the branch
heads named in `REVIEW.md`.

## Verdicts

| Item | What | Verdict | Highest severity | Must fix before merge / execution | Tests missing |
|---|---|---|---|---|---|
| **A1** | A03 bound visitor confirmations (Jini `af6779fb`, Tovu `022e1d5b`) | safe with fixes | medium | 1. Restore the escaped bidi character class in Tovu `visitor-confirmation-gate.ts:39` (raw invisible characters were written into the filter; commit says "unchanged"). 2. Before the Jini half is published: add the six missing gate tests to Jini. | Jini: approve path, single use, abort, deny-never-prompts, deliver-on-throw, slot release. Both: crypto only from the injected port. Tovu: no raw bidi in source; visitor exchanges unreachable from the admin reply route. |
| **A2** | B07 vault rotate re-seal check (Jini `ab0ef93c`) | **unsafe - do not merge as is** | **high** | 1. Land the Tovu half with it: Tovu's key-switch recovery binds `open` to the previous key and `seal` to the new key (`site-key-recovery.ts:169-175`), so the new open-back check refuses every row. Give `rotate` an explicit source opener (preferred). 2. Keep a redacted cause on the refusal. | Sealer contract suite per binding (`open(seal(x)) === x`); Tovu `site-key-recovery.unit.test.ts:130` run against B07 (exists, not run); refusal names the step and leaks nothing; copy-overwrite verified; key-store failure on open. |
| **A3** | A37 pinned capability + bearer handoff (Jini `1b5af586`; Tovu `13400b01` never pushed) | safe with fixes (Jini half); **move not mergeable until the Tovu half exists on the integration base** | medium | 1. Remove the accessor that returns the raw token without the endpoint check (`pinned-capability.ts:61`). 2. Redo the Tovu half on `integ/wave-b-r2` per the exact list in `REVIEW.md` (keep endpoint policy, loopback assertion, both environment scrubs, URL-only connection). 3. Run the two Tovu tests the executor could not load. 4. Do not push with hooks skipped. | Delivery refuses redirects; abort on disconnect and timeout; disconnect before subscribe; malformed values still scrubbed; no accessor but the supplier returns the token; `process.env` clean after first use. |
| **B1** | Sheet A06 visitor tool engine | **unsafe - do not execute as written** | **high** | Fix the sheet: 1. Move `principalId`, `refusalReason`, `emptyPolicy`, `allowedWithoutPorts` out of the optional ports (they are needed exactly when ports are absent; today's rule is "page tools denied"). 2. Define "has a confirmation channel" in the port. 3. Pass the per-input "must confirm" function to the gate factory. 4. Keep budget-id mapping inside the budgets. 5. Add the eligibility check, the 10 s / 24 000-byte limits and the advertisement rule to the must-survive list. 6. Re-take the gate blob after A03; fix the gate function name. | No-ports deny rule; ask-without-channel charges no budget; forced confirmation reaches the gate; sentinel name collision; legacy/new id share one allowance; Jini budgets suite run against Tovu's real limiter (`burst: 0`); offerable-false never registered; timeout and output cap; own-property message lookup. |
| **B2** | Sheet A50 CSP declared hosts + same-origin write check | safe with fixes | medium | 1. Owner decision: the function is named "same-origin" but compares host and port only — either compare the full origin (tightens `admin-surfaces.ts:72`) or rename it; do not pin the cross-scheme case as "accepted" under that name. 2. Resolve the red test that contradicts "byte-identical" (`http:` in `script`). 3. Reject wildcard-shaped hosts in the moved origin check. 4. Correct the sheet's line numbers (they cut into an interface that stays). | Wildcard host dropped; scheme decision pinned either way; a Tovu route-level test for the saved-keys path that fails when the gate call is removed (not found); bare-`;` policy separator. |
| **B3** | Sheet A51 session bootstrap | safe with fixes | low | None blocking. Before execution: resolve the sheet's contradiction on who calls the loopback guard from the desktop tools host (keep the Tovu wrapper); add an optional failure callback so refused/failed bootstraps are diagnosable. | Failure callback receives the stage, result unchanged; explicit cases for alternate loopback spellings (accepted) and mapped/other loopback-range addresses (refused). |
| **C** | `cloud/small-fixes-2026-11-15`: `mcpIsolation` claim (Jini `10605caf`) | **unsafe - do not merge** | **high** | The claim "every run passes the strict flag" is **false** when the personal-MCP capability is unset: (a) no flag when nothing is staged, (b) no flag with parity + bypass, (c) the staged config already contains the project's MCP servers. 1. Drop the commit, or resolve the capability once (unset → off) for planner, argument builder and stager, and make the daemon verify the launch matches the plan. 2. Stamp a verified CLI version (the type contract requires it; nothing was run). 3. Replace the test with a matrix that inspects built arguments. | Matrix: capability {on, off, unset} × staged × parity × folder limit → every "RUN, not loading own" cell has the flag and no inheritance (red today in the unset cells); stamp format includes CLI version. |
| **C (rest)** | Dependency age gates, mail library pin (Tovu `939ee65d`, `52ac8c1b`; Jini `eff5c025`, `1a1a4d43`) | safe | low | Confirm the first-party scope exemption pattern actually matches. | — |
| **D** | Daemon judge findings 1, 2, 12 | facts only: **all three confirmed** on today's code | — | (For the design, not a merge.) 1. Mismatched principal is refused with 403 today; the rewrite happens only after the equality check; authorization runs before body-shape validation. 2. The delegated-call credential recheck at `agent-daemon-scope.ts:1433` reads the body parsed by the blanket parser at `:1407`; removing the parser breaks it (fail closed). 3. Both bearer checks use http-kit's native-bound constant-time compare; core's needs it injected. | Not found: a test that pins "internal router mounts before the public parser" (`app.ts:2005-2006`). |

## Criticals and highs

No critical. Four highs:

1. **A2-F1** — B07's new open-back check is incompatible with Tovu's key-recovery sealer binding; merging the Jini half alone breaks "switch site key" re-sealing (fails closed, nothing lost).
2. **B1-F1** — sheet A06 leaves a default-deny rule with no source when ports are absent; the executor would have to invent the default.
3. **C-F1** — `mcpIsolation` removes the consent step on paths where no isolation is applied, including project-supplied MCP server definitions loaded with no trust decision.
4. **C-F2** — the isolation stamp is an unverified claim recorded in a field whose contract requires a verified CLI version.

## What blocks merging

- **Do not merge:** Jini `10605caf` (C); Jini `ab0ef93c` (A2) without its Tovu half.
- **Do not execute yet:** sheet A06 (B1) until the sheet is fixed.
- **Merge after one fix:** A1 Tovu half (restore the escaped character class).
- **Not mergeable as a pair yet:** A3 (Tovu half does not exist on the integration base).
- **Owner decision needed:** B2-F1 (full-origin comparison vs rename).

## What I could not verify

- Any test result (none run; no install or build was done).
- The unpushed Tovu commit `13400b01` (A3) — not readable from here.
- The real behaviour of the CLI's strict-config flag for plugin, account-connector and managed MCP sources (C).
- Whether Tovu can reach the Jini executor with the personal-MCP capability unset (C).
- Every `SecretsVaultService` construction outside the three I read, and any use in Tovu-Runner or Zana (A2).
- The server routes that mint, rotate and end sessions (B3: the sheet does not touch them).
- A route-level test for the saved-keys reveal path (B2).
