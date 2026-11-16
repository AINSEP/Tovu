# Security review — hard item #5 (2026-11-16)

Docs only. No source was edited. Personas: security (lead), red-team, software-architect, tdd.
Skills: security-review, secure-input-handling, test-design, hexagonal-architecture.

The repositories are public, so every finding is given as **class, location, fix** only. There are no
attack steps, payloads, request examples or proof-of-concept code in this file.

## What was reviewed (exact commits)

| Repo | Ref | SHA |
|---|---|---|
| Tovu | `integ/wave-b-r2` ("today's code") | `65302ee5` |
| Jini | `integ/wave-b-r2` ("today's code") | `02edbb68` |
| Tovu | `moves/audit-x1` | `022e1d5b` |
| Jini | `moves/audit-x1` | `8cab4e0f` (A03 = `af6779fb`) |
| Jini | `moves/audit2-a` | `b5e48106` (B07 = `ab0ef93c`) |
| Jini | `moves/audit2-desktop` | `d78fb1c6` (A37 = `1b5af586`) |
| Tovu | `plan/audit2-sheets-a` / `-a3` | `dbcf15e8` / `45764eac` |
| Tovu / Jini | `cloud/small-fixes-2026-11-15` | `52ac8c1b` / `2bf74b9f` |
| Tovu | `plan/daemon-untangle-design-2026-11-16` | `0c7fd1e4` |

## How to read the verdicts

- **safe** — merge as is.
- **safe with fixes** — the security behaviour is right, but the listed fixes must land (before merge
  where marked *must-fix*).
- **unsafe - do not merge** — a gate is lost, weakened or unproven.

Severity follows the security-review skill: critical / high block release; medium is tracked; low is
defence in depth.

"Verified" below means I read the code at the named commit. **No test was run in this review** (no
install or build was done), so every statement about what a test would catch is from reading the test,
not from a mutation run. Where that matters it is said again in the item.

---

## A1 — moves/audit-x1 "A03": bound visitor confirmations (Jini `af6779fb`, Tovu `022e1d5b`)

**Verdict: safe with fixes.** Highest severity: **medium**.

### What the change is

The visitor "ask first" confirmation logic moved from Tovu into Jini as two generic pieces
(`packages/daemon/src/bound-confirmations.ts`): `createBoundConfirmations` (single-use reply routing with
caps) and `createBoundConfirmationGate` (binds an approval to a policy snapshot and an input digest).
Tovu keeps the policy decision, the publication check, the copy, the caps and the channel names.

Two deviations from the sheet were declared by the executor: the digest crypto port is now a required
argument, and the tail of `confirm` was split out as `settleHeld`.

### Gates traced across the whole chain (all verified by reading)

| Gate | Before (Tovu `9ec4ad4a`) | After | Kept? |
|---|---|---|---|
| Reply route rate limit, enabled check, closed body shape, JSON content type, same-origin | `site-assistant-confirm.ts:31-41` | not touched | yes |
| Body shape depends on the ID format (22 base64url chars) | route regex `site-assistant-confirm.ts:23`; generator `site-assistant.ts:584` (16 random bytes) | not touched | yes |
| Dedicated exchange store, never the admin store | `site-assistant.ts:581-585` | not touched | yes |
| Owner check before the claim; a mismatch does not consume the prompt | `visitor-confirmations.ts` (old `confirm`) | `bound-confirmations.ts:127-130` | yes |
| Claim before any await (no double answer) | old `confirm` | `bound-confirmations.ts:130` then `settleHeld` | yes |
| Expiry checked before and after the host validation; answer always delivered | old `confirm` | `settleHeld`, `bound-confirmations.ts:61-73` | yes |
| Caps: 20 held, 2 per client address, 1 per run | literals in Tovu | `limits` passed from Tovu `visitor-confirmations.ts:27-28`; no Jini default | yes |
| Default deny when policy or channel is missing, mode off, or not ask and not forced | inline in old `confirm` | `decideVisitorConfirmation`, Tovu `visitor-confirmation-gate.ts:46-55` | yes |
| Snapshot revision + publication + input digest re-checked after the click and right before the handler; single use | old gate | `bound-confirmations.ts:176-181` and `isApproved` `:199-206`; Tovu `isCurrent` `:66-69` | yes |
| No resume after abort; a failed resume is reported, not thrown | old `resumeSafely` | `bound-confirmations.ts:160-164` | yes |

**Port/adapter behaviour (not just types).** `DigestCryptoPort` is `{ subtle: { digest } }`
(`packages/core/src/records.ts:175`). Tovu passes `globalThis.crypto`, the same object the old code
passed. The signature of `canonicalArgumentDigest` is identical on `moves/audit-x1` and on
`integ/wave-b-r2`, so the "required after wave B" deviation is a type-only tightening with no behaviour
change. `settleHeld` is a verbatim extraction; the synchronous claim stays in `confirm`.

Both commits merge onto `integ/wave-b-r2` without conflicts (`git merge-tree` check).

### Findings

**A1-F1 — medium — invisible control characters written into a security filter (silent change).**
- Class: source integrity / unannounced change to an output-sanitising filter.
- Location: Tovu `apps/website/src/assistant/site/visitor-confirmation-gate.ts:39` at `022e1d5b`.
- Fact: the base file strips bidirectional-text controls with an escaped character class
  (`‎‏‪-‮⁦-⁩`). The commit replaced the escapes with the **raw invisible
  characters themselves** (verified at byte level). The commit message and the executor's report say the
  copy function is "unchanged". Today it matches the same characters, but: the line now cannot be
  reviewed by eye, any formatter, editor or copy-paste that drops or normalises invisible characters
  turns the filter into something else with no diff a person can read, and raw bidi controls in source
  are themselves a known review-spoofing hazard that scanners flag.
- Fix: restore the `\u` escapes exactly as on `integ/wave-b-r2:…/visitor-confirmation-gate.ts:37`.
  This is a **must-fix before merge**.
- Regression test needed: (a) a source guard that fails when any file under `apps/website/src` contains
  a raw character in U+200E-200F, U+202A-202E or U+2066-2069 — **missing**; (b) the behaviour test
  `visitor-confirmation-gate.unit.test.ts:114` ("confirmation copy … strips controls, links and excess
  text") **exists** and covers six of the eleven code points. Extend it to all eleven. It fails if the
  class is emptied (the summary then still contains the controls).

**A1-F2 — medium — the moved security logic did not bring its guards into the package that now owns it.**
- Class: test gap on a security gate (regression protection lives only in one consumer).
- Location: Jini `packages/daemon/src/__tests__/bound-confirmations.test.ts` (4 tests).
- Fact: Tovu's suites (`visitor-confirmations.unit`, `visitor-confirmation-gate.unit`,
  `visitor-executor-confirmation.unit`, `visitor-page-confirmation.unit`) still drive the composed
  behaviour and are thorough. Jini's own test is thin. Reading it, these changes to
  `bound-confirmations.ts` would **not** fail the Jini suite:
  1. `isApproved` never returns true (the positive path is never asserted there);
  2. the single-use delete in `isApproved` is removed (no second call with the approved input);
  3. the abort checks at `:179`, `:204` and `:161` are removed (no abort case);
  4. `decide` returning `'deny'` still prompts (the fake always returns `'ask'`);
  5. `deliver` is moved out of the `finally` in `settleHeld` (no throwing `validate` case; the waiting
     execution would stay parked until expiry);
  6. `releaseHeld` stops releasing the per-key slot (no request is made after the slots are answered).
  Any future Jini-only change can therefore remove a gate with a green Jini build; Tovu would only
  notice after a dependency bump.
- Fix: add the six cases above to the Jini test, using the real exchange store and fakes of the ports
  (as the file already does). Each must be shown to fail when its gate line is removed. Must-fix before
  the Jini half is published; it does not block the Tovu merge.

**A1-F3 — low — the bearer-strength requirement is not stated on the Jini API.**
- Class: undocumented security precondition on a port.
- Location: Jini `packages/daemon/src/bound-confirmations.ts:38-47` (`BoundConfirmationsDeps`).
- Fact: with no `owner` on the binding, the exchange ID is the only credential (`:127-128`). The safety
  of that depends on the host giving the exchange store a cryptographically random ID generator. Tovu
  does (`site-assistant.ts:583-584`). The Jini note only tells hosts to reserve `principalId` and
  `channel`.
- Fix: add to the `@agent-note` that the store's `idGenerator` must be unguessable (at least 128 random
  bits) and that the store should be dedicated to these prompts. Optional: a contract test in Jini that
  runs the same suite against any host-supplied store.

**A1-F4 — low — the structural allowlist scan no longer sees the visitor exchange.**
- Class: lost visibility in a structural guard.
- Location: Tovu `apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` (entry
  removed at old line 90-92).
- Fact: removing the entry is correct (the `open` call now lives in Jini). But the comment that recorded
  *why* the visitor exchange is kept off the admin reply route went with it, and nothing asserts that
  property. Verified today: the store is separate (`site-assistant.ts:581-585`).
- Fix: add one Tovu test that the admin MCP-UI reply endpoint cannot deliver to an exchange opened with
  the visitor principal/channel, and that the site-assistant module builds its own store. **Missing.**

### Regression tests that must exist

| Test | Exists? |
|---|---|
| Forged / replayed / wrong-owner answer refused; owner mismatch does not consume | yes (Jini `bound-confirmations.test.ts`; Tovu `visitor-confirmations.unit:33,134`) |
| Caps (run, per key, total) and slot release on every terminal path | Tovu yes (`:52,73,117`); Jini release path **missing** (F2.6) |
| Expiry during validation, validation error, abort after claim | Tovu yes (`:19,33,102`); Jini throw/abort **missing** (F2.3, F2.5) |
| Approval bound to revision and exact input; single use | Tovu yes (`visitor-confirmation-gate.unit:44,72,80`); Jini positive + single-use **missing** (F2.1, F2.2) |
| Deny decisions never prompt | Tovu yes (`visitor-executor-confirmation.unit:122,133`); Jini **missing** (F2.4) |
| Crypto comes only from the injected port (fake `DigestCryptoPort`, no global read) | **missing** in both |
| No raw bidi controls in source | **missing** (F1) |
| Visitor exchanges unreachable from the admin reply route | **missing** (F4) |

### Not verified

- No test was run. The executor's report says Jini 63 green and Tovu 56/57 with one failure that also
  fails on the base; I did not reproduce either number.
- The executor says the Jini subpath isolation script "printed nothing (not independently confirmed)".
  I checked by reading that `bound-confirmations.ts` imports only `@jini-ai/core`,
  `@jini-ai/core/records` and a type from `./tool-executor.js`; I did not run the script.
