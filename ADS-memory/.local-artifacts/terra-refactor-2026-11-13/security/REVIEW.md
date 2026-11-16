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
| Owner check before the claim; a mismatch does not consume the prompt | `visitor-confirmations.ts` (old `confirm`) | `bound-confirmations.ts:128` | yes |
| Claim before any await (no double answer) | old `confirm` | `bound-confirmations.ts:130` then `settleHeld` | yes |
| Expiry checked before and after the host validation; answer always delivered | old `confirm` | `settleHeld`, `bound-confirmations.ts:61-73` | yes |
| Caps: 20 held, 2 per client address, 1 per run | literals in Tovu | `limits` passed from Tovu `visitor-confirmations.ts:27-28`; no Jini default | yes |
| Default deny when policy or channel is missing, mode off, or not ask and not forced | inline in old `confirm` | `decideVisitorConfirmation`, Tovu `visitor-confirmation-gate.ts:48-55` | yes |
| Snapshot revision + publication + input digest re-checked after the click and right before the handler; single use | old gate | `bound-confirmations.ts:183-187` and `isApproved` `:202-209`; Tovu `isCurrent` `:66-69` | yes |
| No resume after abort; a failed resume is reported, not thrown | old `resumeSafely` | `bound-confirmations.ts:170-174` | yes |

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
  3. the abort checks at `:186`, `:208` and `:171` are removed (no abort case);
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
- Location: Jini `packages/daemon/src/bound-confirmations.ts:40-47` (`BoundConfirmationsDeps`).
- Fact: with no `owner` on the binding, the exchange ID is the only credential (`:128`). The safety
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

---

## A2 — Jini moves/audit2-a "B07": vault rotate verifies the re-seal (`ab0ef93c`)

**Verdict: unsafe - do not merge as is** (the Jini logic is right; it breaks a Tovu recovery path that
has no matching change). Highest severity: **high**.

### What the change is

`SecretsVaultService.rotate` (`packages/platform/src/secrets/credential-sets/vault.service.ts:376-387`)
now calls a new private `assertOpensTo` (`:162-169`) between sealing and the compare-and-set write. It
opens the fresh envelope with `this.deps.sealer.open` under the stored row's own binding and requires
the exact plaintext back. Failure throws `invalid-record` and nothing is written.

### What is right (verified by reading)

- The check runs **before** `repo.put`; the write stays compare-and-set on `expectedRevision`.
- It opens under the binding of the **stored row** (`buildVaultAad(record)`), while the seal used the
  caller's identity. A caller identity that differs from the row is therefore caught here as well as in
  `find` (`:150`).
- A row with no payload is not opened (`sealed === null` returns first).
- The error carries no envelope and no plaintext.
- The two refusal tests are real guards: each asserts the stored revision is still 1 and the stored
  envelope is unchanged. Without the gate `rotate` writes revision 2, so both fail. The executor
  recorded both failing on the parent commit (red first).

### Findings

**A2-F1 — high — the sealer port binding in Tovu's key recovery is not behaviourally compatible.**
- Class: port/adapter behavioural mismatch (types match, behaviour does not); breaks a recovery path.
- Location: Jini `vault.service.ts:167` (new `this.deps.sealer.open` call on the fresh envelope);
  Tovu `apps/website/src/server/runtime/composition/site-key-recovery.ts:169-173` and `:175`
  (`integ/wave-b-r2`), the only Tovu caller of `rotate`.
- Fact: in that composition the service's `sealer.open` is bound to the **previous** key's opener
  (`open: … input.previous.open(…)`, where `previous` is built from `previousHex` at `:90`), and
  `sealer.seal` is bound to the **new** key's sealer. That was fine while `rotate` only used `open` to
  read the existing row. B07 now also uses the same `open` to read the envelope it has just sealed
  under the new key. The previous-key opener cannot open that envelope, so every vault row moved by
  "switch to a different site key" is refused with `invalid-record`.
  `resealVaultCredentialsOpeningUnder` runs these inside one transaction
  (`apps/website/src/platform/db/vault-credential-recovery.ts:113-121`), so the whole re-seal rolls back
  and the admin route's re-seal step (`routes/system/site-key.ts:511`) fails. Nothing is lost (fail
  closed), but the key-switch recovery stops working for any site with sealed vault rows under the old
  key.
- Why it was missed: B07 was done "Jini only", and its result note says "no contract change". It is a
  contract change: the port now requires `open(seal(x))` to succeed on the same bound sealer. The
  executor's verification list does not include any Tovu site-key test.
- Note: Tovu's binding already does its own seal-then-open check with the new sealer (`:170-172`), so
  the property B07 wants was already enforced for this caller.
- Fix (pick one, must land with B07):
  1. Preferred (keeps one typed port per job): give `rotate` an explicit, optional **source opener**
     for reading the existing row (the same idea `transferRow` already uses with its `source` service),
     and keep `deps.sealer.open` meaning "open with the current keyring". Tovu then binds `sealer` to
     the new-key sealer, passes the previous-key opener as the source, and deletes its own duplicate
     check at `:170-172`.
  2. Minimal: Tovu binds `open` to try the new-key sealer for the envelope just produced and the
     previous-key opener otherwise. This is harder to reason about; use only as a stopgap.
- Regression tests needed:
  - Tovu `site-key-recovery.unit.test.ts:130` ("resealFrom moves the sealed row and the storage secret
    from the previous key onto the new one") **exists**. From reading, it should fail as soon as Tovu is
    linked to a Jini that contains B07 without the fix. **I did not run it** — run it first; if it stays
    green, the row in its fixture is not a vault record and a vault-record case must be added.
  - A sealer **contract test** in Jini (one reusable suite: `open(seal(x)) === x` under the same
    binding, wrong binding refused), run against every binding a host hands to `SecretsVaultService`,
    including Tovu's recovery binding — **missing**.

**A2-F2 — medium — the cause of a refused rotation is thrown away.**
- Class: swallowed error / indistinguishable failure (owner practice: errors are never swallowed or
  generic).
- Location: Jini `vault.service.ts:167` (`catch { throw invalidRecord(); }`) and `:168`.
- Fact: "the key store could not supply the key", "the envelope failed authentication" and "the
  plaintext differs" all become the same bare `invalid-record`, which is also the code for a malformed
  stored row (`:73-75`). An operator cannot tell that the **new** seal is the problem and the stored
  row is fine. Reading the existing row at `:381` lets the sealer's own error through unchanged, so the
  two halves of one method report differently.
- Fix: keep the fixed public code if the contract must not grow, but attach a redacted cause: which
  step failed (open of the new envelope, or plaintext mismatch), the active key id, and the sealer
  error's name/code. Never the envelope, the binding string or any plaintext. Say in plain words that
  the stored secret was not changed.
- Regression tests: the first refusal test already asserts the message does not contain the secret
  (**exists**). Add: the thrown error names the failing step and contains neither the envelope nor the
  plaintext (**missing**).

**A2-F3 — medium — the same unverified re-seal still exists on the copy-overwrite path.**
- Class: inconsistent gate (one write path guarded, a sibling path not).
- Location: Jini `vault.service.ts:337` and `:342` (`writeCopy`).
- Fact: copying onto an existing target with overwrite replaces the target's sealed value with a fresh
  seal and no open-back check. The source row survives, so this is less destructive than rotation, but
  the target's previous secret is gone and the new one may not open. `put` (`:228`) has the same shape;
  there the caller still holds the plaintext.
- Fix: do the open-back check once inside `seal` (`:155-161`) so every write path gets it, once F1 has
  separated "source opener" from "current sealer".
- Regression test: copy-overwrite with a sealer whose seal does not open leaves the target row
  untouched — **missing**.

**A2-F4 — low — the "real key store failure" case named in the executor's own checklist is not tested.**
- Location: Jini `packages/platform/src/secrets/__tests__/vault.service.test.ts:506-540`.
- Fact: both refusal tests fake the fault inside `seal`. No test makes `open` itself fail for a
  non-authentication reason (key not yet readable), or makes `keyring.activeKey` return a key the
  opener does not know.
- Fix: add those two cases with fakes of the `sealer` and `keyring` ports.

### Regression tests that must exist

| Test | Exists? |
|---|---|
| Re-seal that does not open is refused; row untouched | yes (`vault.service.test.ts:506`) |
| Re-seal with different plaintext is refused; row untouched | yes (`:521`) |
| Metadata-only row is rotated without opening | yes (`:534`) |
| Tovu key-switch re-seal still works against Jini with B07 | exists (`site-key-recovery.unit.test.ts:130`) — **not run against B07** |
| Sealer contract suite per binding | **missing** |
| Refusal error names the step, leaks nothing | **missing** |
| Copy-overwrite is verified | **missing** |
| Key store failure on open / unknown active key | **missing** |

### Not verified

- I did not run the Tovu recovery test against B07; F1 is from reading both sides.
- I read two other Tovu sealer bindings (`features/vendor-credentials/vault-adapter.ts:140-146`,
  `platform/secrets/vault-kinds.ts:87-88`); both pass `seal` and `open` to the same sealer, so they are
  compatible. I did not enumerate every `SecretsVaultService` construction in Tovu, Tovu-Runner or Zana.
- `ab0ef93c` merges onto Jini `integ/wave-b-r2` without conflicts (`git merge-tree`).
