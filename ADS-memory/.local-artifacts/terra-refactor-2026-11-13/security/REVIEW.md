# Security review — hard item #5 (2026-11-16)

Docs only. No source was edited. Personas: security (lead), red-team, software-architect, tdd.
Skills: security-review, secure-input-handling, test-design, hexagonal-architecture.

The repositories are public, so every finding is given as **class, location, fix** only. There are no
attack steps, payloads, request examples or proof-of-concept code in this file.

**Revision 2 (2026-11-16).** An adversarial judge (Codex gpt-6.1-sol, high; security + red-team)
reviewed revision 1 and returned "needs rework": 5 majors and 3 minors (`CODEX-JUDGE.md`, same folder).
I checked each one against the code myself before changing anything. Result: 7 accepted in full, 1
accepted in part (one of its four sub-claims is rebutted with a measurement). The changes are in place
in the items below; the finding-by-finding answer is in [Judge response](#judge-response) at the end,
followed by a second adversarial pass over every "safe" and "safe with fixes" verdict and a new section
of owner-rule acceptance checks. One owner decision arrived with this revision and is applied: **B2-F1
is resolved — the same-origin check compares the full origin (scheme + host + port).**

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

**Verdict: safe with fixes.** Highest severity: **medium**. (Revision 2: verdict unchanged, but the
must-fix list grew — F5 is a new must-fix before the Jini half is published, and the "owner check kept"
row below was wrong for the generalised type.)

Must fix: **F1** before the Tovu half merges; **F2 and F5** before the Jini half is published.

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
| Owner check before the claim; a mismatch does not consume the prompt | `visitor-confirmations.ts:71` (old `confirm`) | `bound-confirmations.ts:128` | **yes for Tovu's binding (owners are objects); not for the generalised owner type — F5** |
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

**A1-F5 — medium — the owner check is skipped for a present owner whose value is falsy (added in revision 2; judge finding 1, verified).**
- Class: authorization check that depends on value truthiness after the owner type was generalised.
- Location: Jini `packages/daemon/src/bound-confirmations.ts:128`
  (`if (held.owner && !deps.sameOwner(…)) return false;`), with the unrestricted type parameter at
  `:15`, `:20`, `:35`, `:43` and `:50`.
- Fact: the line was copied from Tovu (`visitor-confirmations.ts:71` on `integ/wave-b-r2`), where the
  owner type is `FrontendSessionOwner`, always an object, so "truthy" and "present" were the same thing.
  Jini made the owner any `TOwner`. For a host whose owner is a scalar (a number, a string, a boolean),
  one legal owner value is falsy, and for that owner `sameOwner` is never called: the prompt is then
  answerable by anyone who holds the exchange ID, which is exactly the "no owner bound" mode. The
  exchange ID is still an unguessable single-use bearer delivered only on the owner's own stream, so
  this removes the second factor for one owner value, not the first — that is why it is medium and not
  high. **Tovu is not affected** (its owners are objects; `022e1d5b:…/visitor-confirmations.ts:27`
  binds `createBoundConfirmations<FrontendSessionOwner>`).
- Why revision 1 missed it: I compared the line with the old Tovu line, saw them identical, and marked
  the gate "kept". Identical text is not identical behaviour once the type under it widens.
- Fix (either; the first is preferred because it removes the trap for every later edit):
  1. Record presence explicitly. Store `hasOwner: 'owner' in binding && binding.owner !== undefined`
     (or keep `owner` and test `held.owner !== undefined`) and compare whenever an owner was bound.
     Decide and document what `null` means; recommended: `null` is "bound to nobody" and is refused at
     `request`.
  2. Or constrain the contract: `TOwner extends object`, so the truthiness test is sound by type. This
     is the smaller diff; it narrows the public API, so it must be chosen before publication.
  Note for the implementer: `createBoundConfirmations` measures 48 lint-counted lines against a limit of
  50 (see "Owner-rule acceptance checks"). Fix 1 must not push it over; extract the owner test into a
  named helper if needed.
- Regression tests needed — **all missing** in Jini (`bound-confirmations.test.ts:7` uses only an
  object owner, and the six cases of F2 do not touch this line): for every owner representation the
  contract admits (object, and under fix 1 also string, number and boolean including each falsy value):
  (a) matching owner answers; (b) a different owner is refused; (c) an **omitted** owner is refused when
  one was bound; (d) after each refusal the prompt is still answerable by its owner (a refusal must not
  consume it). Under fix 2 instead: a type test that a scalar owner does not compile, plus (a)–(d) for
  the object case. Each of (b) and (c) must fail on today's line 128 for a falsy owner.
- Tovu keeps `visitor-confirmations.unit.test.ts:33,134` as the binding test; no Tovu change is needed.

**A1-F6 — low — the bound owner is held by reference (added in revision 2; found in the second pass).**
- Class: caller-owned mutable object retained as the authority for a later check.
- Location: Jini `bound-confirmations.ts:109` (`owner: binding.owner` stored in the held prompt) and
  `:128` (compared up to the exchange lifetime later).
- Fact: the value compared at answer time is whatever the caller's object holds by then, not what it
  held when the prompt was opened. Tovu passes the owner produced by its own session binding for that
  request (`composition/modules/site-assistant.ts:715`), which nothing mutates, so there is no effect
  today. As a published generic API the note belongs on the type.
- Fix: say on `BoundConfirmationBinding.owner` that the value must be immutable for the life of the
  prompt, or take an owner *key* (a primitive the host derives) instead of an object and compare keys.
  Not blocking.

### Regression tests that must exist

| Test | Exists? |
|---|---|
| Forged / replayed / wrong-owner answer refused; owner mismatch does not consume | object owners: yes (Jini `bound-confirmations.test.ts:50`; Tovu `visitor-confirmations.unit:33,134`). **Omitted owner, and every non-object or falsy owner: missing (F5)** |
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

---

## A3 — Jini moves/audit2-desktop "A37": pinned capability and bearer handoff (`1b5af586`)

**Verdict (Jini half): safe with fixes.** Highest severity: **medium**.
**The move as a whole is not mergeable yet:** the Tovu half (`13400b01`) was never pushed, was built on
`refactor/desktop-args` (not `integ/wave-b-r2`), and two of its tests could not load. Until the Tovu
half exists on the integration base, the Jini code has no consumer and the security claim "Tovu's
desktop bearer handling runs on Jini" is unproven.

### What the change is

A new Jini module, `packages/mcp/src/federation/hosted/pinned-capability.ts`, with two functions:

- `createPinnedCapabilityRuntime` — reads `{ url, token }` and a handoff token from an environment
  object, deletes those keys, pins the first valid capability, and returns a bearer supplier that
  answers only for the exact pinned URL.
- `startCapabilityDelivery` — POSTs each capability the host publishes to one child, with the handoff
  token as bearer, until disconnected.

It is a generic copy of Tovu `apps/website/src/assistant/desktop-mcp-runtime.ts:38-65` and
`apps/desktop/src/desktop-mcp-http.ts:54-75` (`integ/wave-b-r2`).

### Gates traced across the whole chain (verified by reading)

| Gate | Where today | In the Jini half | Kept? |
|---|---|---|---|
| Capability shape: canonical loopback URL, port range, 64-hex token | Tovu `desktop-mcp-runtime.ts:11-22` | host-supplied `isCapability` | **Tovu must keep** |
| Bearer answers only for the exact pinned URL | Tovu `:47-50` | `pinned-capability.ts:60` | yes |
| First capability is immutable; same value may be re-delivered | Tovu `:51-56` | `:62-67` | **partly** — `accept` refuses a replacement, but `capability()` (`:61`) hands out the pinned object itself, so a holder can change it — F1 |
| Handoff token shape (64 hex) or dropped | Tovu `:42` | `:40`, `:55` (fixed in Jini) | yes |
| Keys removed from the environment object | Tovu `:43` | `:56` | yes, see F2 |
| Real process environment scrubbed | Tovu `startup-secrets.ts:18-23` (token + handoff) and `desktop-mcp-runtime.ts:75` (URL) | **not in Jini** | **Tovu must keep** |
| Handoff token minted per main, 32 random bytes, never stored | Tovu `desktop-mcp-http.ts:35` | host-supplied | **Tovu must keep** |
| Delivery only to a loopback admin URL, fixed path | Tovu `desktop-mcp-http.ts:56` | host-supplied `endpoint` | **Tovu must keep** |
| Delivery never follows redirects; 5 s timeout; cancellable | Tovu `:67-70` | `:103-106` | yes |
| Receiving route: browser origin refused, loopback peer, timing-safe bearer, refused when no token is configured, 1 KiB body, shape check, pin check | Tovu `desktop-mcp-handoff.ts:15-27`; Jini `packages/daemon/src/http/tool-execution-routes.ts:69-79` | not touched | yes |
| Receiving route runs before the public JSON parser | Tovu `app.ts:2005-2006` (internal router mounted first) | not touched | yes |
| Connection handed to the tool layer carries the URL only, never the token | Tovu `desktop-mcp-runtime.ts:57-63` (`headers: {}`) | — | **Tovu must keep** |
| Bearer is attached by the HTTP adapter for the configured URL only, redirects refused | Jini `packages/mcp/src/federation/adapter.http.ts:336`, `:502` | not touched | yes |

### Findings

**A3-F1 — medium — a new accessor hands out the raw token without the endpoint check, and hands out the pin itself.**
- Class: token scope widened by API shape; accessor returning a live internal object (the second half
  was added in revision 2: judge finding 7, verified).
- Location: Jini `pinned-capability.ts:28` (interface) and `:61` (`capability()`); the object it returns
  is created at `:52-53` or `:65` and read by the bearer supplier at `:60` and by the pin check at `:64`.
- Fact 1 (token): the Tovu runtime exposes the token only through `bearerToken({ url })`, which checks
  the exact URL. The Jini runtime adds `capability()`, which returns `{ url, token }` to any caller in
  the process. The file's own header says the supplier "answers only for the exact pinned endpoint";
  this accessor is a second way to the same secret with no such check, and it returns a plain object
  that is easy to log or serialise by accident. Tovu only needs the URL from it (to build
  `connection()`).
- Fact 2 (pin): `capability()` returns `capability ?? null` — the **same object** the runtime keeps,
  not a copy and not frozen. `PinnedCapability` is `readonly` in TypeScript only; that is a compile-time
  promise, not a runtime one. Whoever receives the object can assign to its two properties, and the
  bearer supplier (`:60`) and the "is it the same capability" check (`:64`) then use the new values.
  So the accessor carries the authority to move the pin, which `accept` exists to refuse. Revision 1
  marked "first capability is immutable" as kept; that was wrong and the gate row above is corrected.
  The existing tests compare returned values only (`pinned-capability.test.ts:18`, `:31`) and would not
  notice.
- Fix: replace `capability()` with an accessor that returns the pinned URL only, as a string (for
  example `endpointUrl()`); keep the token reachable only through `bearerToken`. A string return closes
  both halves at once. As defence in depth, freeze the object the runtime holds and build it from the
  two named fields only (this also closes F6). Must-fix before the Jini API is published, because
  narrowing it later is a breaking change.
- Regression tests — both **missing**: (a) a type-level and runtime test that no member of the runtime
  other than `bearerToken` and `handoffToken` returns a 64-hex token; (b) nothing a caller can obtain
  from the runtime, and no later change to the object passed to `accept` or to the `env` object, can
  change what `bearerToken` answers for the pinned URL or make it answer for another URL. (b) must fail
  on today's `:61`.

**A3-F2 — medium — the "scrubbed before any child can inherit" promise depends on what the host passes.**
- Class: security property stated by the port but only true for one binding.
- Location: Jini `pinned-capability.ts:33` (doc) and `:56`; Tovu `desktop-mcp-runtime.ts:74-75`,
  `server/runtime/boot/startup-secrets.ts:41-43`.
- Fact: Jini deletes the three keys from the object it is given. Tovu gives it a **detached copy**
  (`startupSecretEnvironment` returns `{ ...env, ...credentials }`). So in Tovu the Jini scrub changes
  nothing a child could inherit; the real protection is Tovu's startup-secret capture (token and
  handoff) plus the explicit delete of the URL key at `:75`. A second host that reads the Jini doc and
  passes a copy would believe its environment is clean when it is not.
- Fix: say in the Jini doc that the caller must pass the live environment object or scrub it itself;
  return the list of key names removed so a host can assert on it. In Tovu keep both existing scrubs
  (see "What the Tovu half must do").
- Regression test: Tovu `tovu-server.desktop-mcp.test.ts:17` ("unrelated desktop CLI children never
  inherit the desktop capability") **exists**; add a website test that after first use of
  `desktopMcpRuntime` none of the three names is in `process.env` — **missing**.

**A3-F3 — medium — the Jini tests do not pin the two properties that protect the handoff bearer in transit.**
- Class: test gap on a security gate.
- Location: Jini `packages/mcp/src/federation/hosted/__tests__/pinned-capability.test.ts`.
- Fact (from reading the test): it asserts the URL, the `authorization` header and the body. It does
  not assert `redirect: "error"`, does not assert that a signal is passed, and never disconnects
  before the host resolves or during a POST. Removing `redirect: "error"` at `:103`, or the abort
  check at `:101`, leaves all five tests green. Tovu's desktop tests do not assert the redirect mode
  either (no match for `redirect` in `desktop-mcp-http*.test.ts`).
- Fix: add four cases with a fake `fetch`: (1) `init.redirect === "error"`; (2) the signal aborts on
  `disconnect` during a POST; (3) `disconnect` before the host resolves subscribes nothing; (4) the
  timeout aborts a hung POST. Each fails when its line is removed.
- Also missing: malformed URL or token values are still deleted from the environment object (a mutant
  that scrubs only valid values survives test 1); a handoff-only runtime gives no bearer before
  `accept` and the right bearer after.

**A3-F4 — low — failures are reported with no cause.**
- Class: swallowed error (owner practice).
- Location: Jini `pinned-capability.ts:84` (`onUnavailable` takes no error), `:110` (`catch` drops it),
  `:108` (fixed message, HTTP status dropped).
- Fact: this copies the Tovu behaviour, but it now fixes it into a port signature, so no host can log
  a redacted cause even if it wants to.
- Fix: pass `{ error }` to `onUnavailable` and include the HTTP status in the delivery error. The
  handoff token and capability token must never appear; the host words and redacts.

**A3-F5 — low — the handoff token format is fixed in the engine while everything else is host policy.**
- Location: Jini `pinned-capability.ts:40`.
- Fact: a host that mints a different format gets `handoffToken: undefined` and `owned: false` with no
  signal. It fails closed, so this is not exploitable; it is a silent behaviour trap.
- Fix: take the handoff predicate from the host like `isCapability`, or document the fixed format.

**A3-F6 — low — `accept` copies every enumerable property of the delivered object.**
- Location: Jini `pinned-capability.ts:65` (`{ ...input }`), same as Tovu `:54`.
- Fact: whether extra properties are possible depends on the host's `isCapability`. Tovu's guard does
  not reject extras. They are then held on the pinned object.
- Fix: store `{ url: input.url, token: input.token }` only.

### What the Tovu half must do, exactly

The unpushed commit must be redone on `integ/wave-b-r2`. To be accepted it must:

1. **`apps/website/src/assistant/desktop-mcp-runtime.ts`**
   - Keep `isDesktopMcpCapability` and `isDesktopMcpUrl` byte-for-byte in Tovu and pass
     `isDesktopMcpCapability` as `isCapability`. The endpoint policy never moves to Jini.
   - Pass `names = { url: "TOVU_DESKTOP_MCP_URL", token: "TOVU_DESKTOP_MCP_TOKEN", handoff: DESKTOP_MCP_HANDOFF_ENV }`.
   - Keep `connection()` in Tovu, built from the pinned **URL only**, with `launch.headers` empty and
     the same three allowlists (`allowedToolNames`, `writeAllowedToolNames`, `readOnlyRemoteNames`).
   - Keep `runtimeForProcess` as is: build from `startupSecretEnvironment({ env: process.env })` and
     keep `delete process.env.TOVU_DESKTOP_MCP_URL`. Do not rely on Jini's scrub (F2).
   - Keep the `DesktopMcpRuntime` interface as it is today (`handoffToken`, `owned`, `bearerToken`,
     `connection`, `accept`). Do **not** re-export Jini's `capability()` to the rest of Tovu (F1).
   - Keep `TOVU_DESKTOP_MCP_TOKEN` and `TOVU_DESKTOP_MCP_HANDOFF_TOKEN` in `STARTUP_SECRET_KEYS`.
2. **`apps/desktop/src/desktop-mcp-http.ts`**
   - `connectSite` keeps, in this order: the `stopped` check; `assertLoopbackAdminUrl({ adminUrl })`
     before the endpoint is built; the fixed path `/internal/desktop-mcp-capability`; registration in
     the `disconnects` set and with `onExit`. Only then call `startCapabilityDelivery`.
   - The handoff token stays `randomBytes(32).toString("hex")`, minted once per main, never written to
     disk, a keyring or a log.
   - `environment()` still returns `{}` once stopped, and `close()` still disconnects every site.
   - The warning texts stay fixed strings; no token, URL with token, or request body in any warning.
3. **`apps/website/src/server/runtime/composition/modules/desktop-mcp-handoff.ts`** — no change. The
   order `rejectBrowser` → `requireToolExecutionCaller` → `json({ limit: "1kb" })` → shape check →
   `accept` must stay, and the route must stay on the internal router that mounts before the public
   parser (`app.ts:2005`).
4. **Tests that must be run and green on the integration base** (the executor could not load the
   first two): `desktop-mcp-runtime.integration.test.ts`, the startup-secrets tests,
   `desktop-mcp-capability.unit.test.ts`, `desktop-mcp-http.test.ts`,
   `desktop-mcp-http-runtime.test.ts`, `tovu-server.desktop-mcp.test.ts`.
5. **Not bypass the pre-push gates.** The executor's note proposes pushing with the hooks skipped.
   The gates failed because of the Jini base build; fix the base, then push normally.

### Regression tests that must exist

| Test | Exists? |
|---|---|
| Bearer only for the exact URL; first capability immutable; malformed handoff dropped | yes (Jini test 1-3) |
| Capability shape: loopback spelling, port bounds, token shape | yes (Tovu `desktop-mcp-capability.unit.test.ts:6`) |
| Only the spawning main can supply a capability; other children do not inherit it | yes (Tovu `tovu-server.desktop-mcp.test.ts:7,17`) |
| Delivery refuses redirects; aborts on disconnect and timeout | **missing** (F3) |
| No accessor other than the supplier returns the token | **missing** (F1) |
| Nothing obtainable from the runtime can change the pinned URL or bearer | **missing** (F1, fact 2) |
| `process.env` holds none of the three names after first use | **missing** (F2) |
| Receiving route: origin, non-loopback peer, wrong bearer, no token configured, oversized body, second different capability → refused | not checked in this review (route is unchanged); confirm before the Tovu half merges |

### Not verified

- I could not read the Tovu half: `13400b01` exists only in the executor's container. Everything
  under "What the Tovu half must do" is derived from today's Tovu code, not from that commit.
- No test was run. The executor reports Jini 5/5 and hosted 12/12.
- I did not check Tovu-Runner or Zana for a second consumer of this module.

---

## B — Sheets reviewed before execution

All three sheets were written against `integ/wave-b`. I checked every blob guard they list for the
files they move against `integ/wave-b-r2`: **all match** (the code under the sheets has not moved).
Sheets are at `origin/plan/audit2-sheets-a3` (`45764eac`); the A06 sheet is byte-identical on
`plan/audit2-sheets-a`.

### B1 — `split-a06-visitor-tool-engine.md` (anonymous visitor tool engine → Jini)

**Verdict: unsafe - do not execute as written.** The sheet's behaviour list is accurate, but its port
design cannot express two of the gates it promises to keep, and it leaves the executor to invent a
default at a deny gate. Highest severity: **high**. Fix the sheet first; the move itself is sound.

Revision 2 adds four findings: **F10** (budget windows become configurable with no cache
invalidation), **F11 — high** (the Tovu step never connects the new binding to the executor and
deletes a type the gate still needs), **F12** (two per-call checks read the caller's live capability
list) and **F13** (owner-rule conflicts in the sheet). The verdict is unchanged; it now rests on two
highs (F1 and F11).

#### Does the plan keep each gate?

| Gate (today, `apps/website/src/assistant/site/`) | In the sheet | Kept? |
|---|---|---|
| Forged caller class or unknown tool never reaches a handler (`visitor-executor.ts:94`) | B1, review point 2 | yes, see F4 |
| Turn-wide attempt cap, counted before any await (`:62-63`) | B2, `callsPerTurn` required | yes with ports; **no cap without ports today** (`:63` checks `ports &&`) and the sheet does not say so |
| Input validation before approval (`:66`) | B3 | yes |
| Policy re-read on every call; null/off deny; Auto cannot become Ask mid-turn (`:125-129`, `:154-158`) | B5 | yes |
| Ask needs a human return channel (`:128`, `:163`) | B5 | **not expressible in the new port — F2** |
| Per-input forced confirmation reaches the gate (`:47-48`) | B4 says "derived inside the engine" | **dropped from the gate's input — F3** |
| Approval checked in the handler; `forget` on every outcome (`:97`, `:140`) | B4 | yes |
| Rate limit: per-address first, then per-site, serialised, ceiling change keeps counts (`visitor-tool-budgets.ts:39-53`) | B11 | yes for the ceiling; **the window is a new variable the limiter cache does not see — F10**; see also F5, F6 |
| Input validation and per-input forced confirmation are looked up for the registered capability (`:66-67`, `:172`, `:184`) | B3, B4 | **yes today; depends on the caller never changing the list it passed — F12** |
| The policy ports actually reach the executor (`capability-registry.ts:171`) | S3 step 2 | **not specified — F11** |
| Default deny on any error in authorize (`:132-135`) | B6 | yes |
| Rollback mode with no ports: page tools denied (`:123`) | B7 | **contradicted by the port shape — F1** |
| Only explicitly offerable capabilities are registered (`:118`, runtime check) | type only | **not in the must-survive list — F7** |
| Per-call timeout 10 s and 24 000-byte output cap (`:121`) | not mentioned | **not in the must-survive list — F7** |
| Audit: fixed provenance, no input keys, no provider error text (`:70-76`) | B8 | yes |
| Uniform refusal for denied/unknown (`:99`, `:104`, `:168`) | B1, B9 | yes |
| Public error: fixed message, redaction before logging, no custom inspect or getters (`public-errors.ts:52`, `:71-73`) | B12 | yes, see F8 |
| Origin / CSRF, session, token scope | not in these four files (the routes own them) | not affected |

#### Findings

**B1-F1 — high — four values needed in rollback mode are placed on the port object that is absent in rollback mode.**
- Class: default-deny gate left to an unspecified default.
- Location: sheet "Ports and contracts" (`VisitorExecutionPorts`: `principalId`, `refusalReason`,
  `emptyPolicy`, `allowedWithoutPorts`) versus code `visitor-executor.ts:45` (`ports` optional), `:82`,
  `:88`, `:94`, `:99`, `:123`.
- Fact: today, with no ports, the executor still needs the anonymous principal id (`:94-95`), the
  refusal text (`:99`), the empty policy (`:82`, `:88`) and the "page tools denied" rule (`:123`). The
  sheet puts all four **inside** `ports`, keeps `ports` optional ("OPTIONAL as today"), and its own
  review point 4 says `allowedWithoutPorts` must be required with a deny default. Both cannot be true:
  when `ports` is missing there is nothing to read the rule from. The executor will have to pick a
  default for "no ports" — allow-all is fail-open, deny-all is a silent behaviour change — and no STOP
  rule covers it.
- Fix (in the sheet): move those four members to the **required** first argument
  (`{ capabilities, principalId, refusalReason, emptyPolicy, allowedWithoutPorts }`), keep the rest in
  the optional `ports`. State in B2 that the attempt cap does not apply without ports today, and decide
  on purpose whether Jini keeps that (then say so in the doc) or caps always (then it is a declared
  behaviour change with a changeset line).
- Test that must exist in S1: with no ports, a name refused by `allowedWithoutPorts` is denied and its
  handler is never called; with no ports and no rule the code does not compile (type test). Fails when
  the rule is defaulted to allow.

**B1-F2 — medium — "Ask needs a human return channel" has no source in the new port.**
- Class: gate input lost in a port redesign.
- Location: sheet contract (no `confirmation` member; `createConfirmationGate?` and `readSnapshot?`
  instead) versus code `visitor-executor.ts:128`, `:163`, `:174-176`, `visitor-execution-ports.ts:17`.
- Fact: the channel test today is `ports.confirmation && ports.readSnapshot`. The new type has no
  `confirmation`. If the Tovu binding always supplies the gate factory, "has a channel" becomes true
  for headless requests: Ask tools get advertised (`:163`), the per-address and per-site budgets are
  charged (`:131`), and only then does the gate refuse. It still fails closed, but it advertises a
  tool that cannot run and lets refused traffic spend the shared budget.
- Fix: add an explicit `hasConfirmationChannel: boolean` (or define the rule as "gate factory AND
  snapshot reader present" and require the binding to omit the factory when the request has no
  channel). Write the rule into B5.
- Test: Ask policy + no channel → not advertised, refused, **zero budget charges**. The S1 list has
  "B5 ask without channel" but does not say which port being absent means "no channel".

**B1-F3 — medium — the gate no longer receives the per-input "must confirm" signal.**
- Class: port/adapter behavioural mismatch.
- Location: sheet contract (`createConfirmationGate({ resume, isAborted })`; "`requiresConfirmation`
  … NOT carried into the Jini type") versus code `visitor-executor.ts:47-48` and Tovu
  `visitor-confirmation-gate.ts` (`ports.requiresConfirmation` decides `forced`).
- Fact: today the engine hands the gate a function that says whether this call's input forces a
  confirmation. Tovu's gate uses it to prompt for Auto-mode tools whose input demands it (page fill,
  select, submit). With the new factory signature the gate cannot learn that, so it would deny those
  calls outright — or the binding author "repairs" it by prompting whenever the delegate is called,
  which changes the decision rule.
- Fix: the factory must receive `requiresConfirmation: ({ toolId, input }) => boolean` from the
  engine (same as `:47`).
- Test: Tovu `visitor-page-confirmation.unit.test.ts:5` and `:43` **exist** and should catch a break
  in S3. Add the S1 twin: an Auto capability whose input forces confirmation prompts through the fake
  gate, and the fake gate sees `forced === true`.

**B1-F4 — medium — the "unavailable" sentinel can collide with a host capability name.**
- Location: code `visitor-executor.ts:94`; sheet review point 2 asks the question but gives no rule.
- Fact: Tovu controls its own names. In Jini the names are host-supplied, so a capability literally
  named like the sentinel would be reachable by a forged caller class.
- Fix: do not route through the registry for a refused caller: return the denied attempt directly
  (still audited), or refuse to register the sentinel name. Add the test.

**B1-F5 — medium — the budget key canonicalisation moves from the budget module to its caller.**
- Location: code `visitor-tool-budgets.ts:40` (applied inside `consume`); sheet puts `budgetId` on the
  executor ports and says budgets move "as is".
- Fact: today nobody can forget the canonical id, because the budget module applies it. After the
  move it is the caller's job. If it is skipped, a tool reachable under an old and a new id gets two
  separate allowances.
- Fix: keep the id mapping inside `createVisitorToolBudgets` (inject `budgetId` into the budgets
  factory, not into the executor).
- Test: charging under the legacy id and under the new id spends one shared allowance — the Jini
  budgets suite needs this case; it is **not** in the S1 list.

**B1-F6 — medium — Tovu's real limiter stops being tested with the budgets.**
- Class: adapter not covered after the tests move (types fit, behaviour unproven).
- Location: sheet S3 step 3 ("`visitor-tool-budgets.unit.test.ts` … deleted once their cases are in
  Jini (verified by name)"); code `visitor-tool-budgets.ts:33` (`burst: 0`), `:32` (store kept across a
  ceiling change).
- Fact: the Jini tests run against a fake limiter factory. "A changed ceiling keeps consumed counts"
  and "no extra burst" are properties of Tovu's **real** limiter and store. After the deletion nothing
  runs the budgets against them. The S3 text also does not say the binding must pass `burst: 0`;
  several Tovu limiter profiles use a non-zero burst (`contracts/core/rate-limit/rate-limit.ts`).
- Fix: publish the Jini budgets suite as a reusable contract suite and run it in Tovu against the real
  factory; state `burst: 0` in S3. "Verified by name" is not enough: record the assertion count before
  and after.

**B1-F7 — medium — two runtime limits and the eligibility check are not in the must-survive list.**
- Location: code `visitor-executor.ts:118` (`visitorOfferable !== true` → not registered), `:121`
  (`timeoutMs: 10_000`, `maxOutputBytes: 24_000`, read-only default true).
- Fact: the sheet's STOP rule protects only B-rows. These three are not B-rows and have no S1 test, so
  a refactor that drops them passes every check in the sheet.
- Fix: add B13 (runtime eligibility check, with a test that a capability cast to offerable-false is
  never registered) and B14 (timeout, output cap and read-only default, values host-supplied and
  required, each with a test). Also add the advertisement rule (`:81-90`, `:161-164`) as B15.

**B1-F8 — low — the public message lookup must stay own-property only once the table is host-supplied.**
- Location: code `public-errors.ts:72` (`Object.hasOwn`).
- Fix: add to B12 and to the S2 tests that an error code naming an inherited object property gets the
  default message.

**B1-F9 — low — sheet housekeeping that will stop or mislead the executor.**
- Precondition 1 names `createBoundToolConfirmationGate`; A03 shipped it as
  `createBoundConfirmationGate` (Jini `af6779fb`).
- The guard list pins `visitor-confirmation-gate.ts` at blob `a2bc520b`, but precondition 1 wants A03
  landed first, and A03 changes that file. The guard will fail after A03. Re-take the blob.
- A06 must also carry forward the A1 fixes (escaped bidi class, Jini gate tests, the explicit owner
  presence check of A1-F5) or it will copy the gaps.
- (Revision 2, second pass.) With the policy type made generic, "no policy" is tested three different
  ways today (`visitor-executor.ts:83` and `:126` by truthiness, `:89` by `!== null`, `:119` by
  `!= null`). State in B5 that "no policy" means exactly `null` and test it the same way everywhere;
  add the S1 case "a falsy but non-null policy is treated as a policy at all four places".

**B1-F10 — medium — the budget windows become configurable, but the limiter cache only knows about the ceiling (added in revision 2; judge finding 2, verified).**
- Class: cache keyed on a setting that used to be a constant.
- Location: sheet contract `VisitorBudgetLimits` (`split-a06-visitor-tool-engine.md:74`: each of `ip`
  and `site` now carries its own `windowSeconds`, supplied with every charge, `:110`) and S1 step 2
  (`:132`: budgets move "as is" with a limiter-factory substitution); code
  `visitor-tool-budgets.ts:8` (`Bucket` records `store`, `max`, `limiter`), `:29-35` (`limiterFor`),
  `:31` (a cached limiter is reused whenever `max` is unchanged), `:42` and `:44` (today the two windows
  are the literals 3600 and 86 400).
- Fact: the cache is correct today only because the window can never change. Under the sheet's
  contract a host can keep the ceiling and change the window; line 31 then returns the limiter built
  for the **old** window, silently, for the life of the process. A longer window that is ignored means
  more calls are admitted than the policy says; a shorter one that is ignored refuses calls it should
  admit. Tovu's binding passes constants (sheet S3 step 1), so Tovu itself does not change behaviour;
  the fault is in what Jini would publish. What a counter store does with a counter that was opened
  under a different window is also undefined (`@jini-ai/http-kit` `CounterStore`,
  `packages/http-kit/src/rate-limit.ts:27-33`, stores a window state per key and has no notion of the
  window length changing).
- Revision 1 missed it: F5 and F6 looked at key canonicalisation, the ceiling and the store, and took
  the cache as given.
- Fix (in the sheet; pick one and write it down):
  1. Preferred: the windows are **fixed when the budgets are built**
     (`createVisitorToolBudgets({ limiters, windows: { ipSeconds, siteSeconds } })`), and
     `VisitorBudgetLimits` carries only the two ceilings. This keeps today's behaviour exactly and
     leaves the cache correct by construction. Tovu's requirement (one hour, one day) is met.
  2. Otherwise: make the window part of the cached identity (compare `max` **and** `windowSeconds`),
     and state what happens to consumed allowance on a window change — recommended: the new window
     starts with the old window's consumed count and its own expiry, never with a fresh allowance —
     and require the limiter-factory contract to say the same.
- Regression tests needed in S1 (`budgets.test.ts`, fake clock; **not in the sheet's list**):
  under fix 1, a type test that a per-charge window does not compile, plus the existing "changed
  ceiling keeps consumed counts"; under fix 2, change **only** the window with the ceiling held, and
  assert the admission decisions before and after the old and the new window boundary. That case must
  fail against a cache that compares `max` alone.

**B1-F11 — high — the Tovu step does not connect the new host binding to the executor, and deletes a type the gate still needs (added in revision 2; judge finding 3, verified).**
- Class: migration that can silently drop a policy boundary (authorization, budget and audit wiring
  left to the executor's guesswork).
- Location: sheet S1 step 2 (`:132`: the factory becomes
  `createVisitorExecutor({ capabilities, ports }, optional = {})`), S3 steps 1–2 (`:142-143`: a new
  `visitorPorts(...)` is created; `capability-registry.ts:57` is listed as an **import** change only),
  S3 step 4 (`:145`: all four source files are removed, `visitor-execution-ports.ts` included) and the
  note at `:116` ("they stay on a Tovu `VisitorExecutionPorts extends` the Jini type"); code
  `capability-registry.ts:171`
  (`createVisitorExecutor({ capabilities: […] }, { ports: options.visitorExecution })`) and
  `visitor-confirmation-gate.ts:68`, `:76`, `:80` (the gate reads `ports.confirmation`,
  `ports.publicationRevision`, `ports.owner`).
- Fact 1: today the ports travel in the **second** argument. The sheet moves them to the first and
  never says to rewrite line 171, and never says where `visitorPorts(...)` is called. With only the
  import repointed there are two outcomes, and the sheet does not choose:
  - the new second parameter is a closed type → the old call does not compile. Safe, but the executor
    must then improvise the call, which COMMON's STOP rule forbids;
  - the new second parameter is the open `optional = {}` default → the old call still compiles, the
    ports are ignored, and the executor runs in **rollback mode**: no policy read, no per-turn cap, no
    budgets, no audit, and every capability that is not a page tool is allowed
    (`visitor-executor.ts:63`, `:70`, `:123`). That is a fail-open for anonymous visitors, reached by a
    type-correct edit.
- Fact 2: the Tovu gate needs three host-only members. The sheet deletes the file that declares them
  and gives the surviving Tovu type no file, no definition and no list of consumers to update
  (`visitor-confirmation-gate.ts:7`, `capability-registry.ts`, the composition at
  `composition/modules/site-assistant.ts:708-725`, and the four Tovu test files that build ports).
- Existing protection, from reading: `visitor-tools.integration.test.ts:46-64` builds the registry with
  real ports and asserts that an empty policy yields no schemas and a refusal, and that a tool set to
  "off" is not advertised. Both assertions fail if the ports are dropped. So the silent outcome would
  be caught **if that test is run and not edited** — the sheet does list it as kept. **I did not run
  it.**
- Fix (in the sheet, S3):
  1. Name the surviving Tovu type and its file: for example `visitor-tools-binding.ts` exports
     `TovuVisitorExecutionPorts` = the Jini ports' host inputs plus `owner`, `publicationRevision`,
     `confirmation`. List every producer and consumer to update, tests included.
  2. Give the complete adapter: `visitorPorts(tovuPorts)` → Jini ports, including how the gate
     factory closes over the three host-only members.
  3. Give the exact replacement for `capability-registry.ts:171`, for both modes: ports present →
     `createVisitorExecutor({ capabilities, …the required values of F1 }, { ports: visitorPorts(…) })`
     (or the first-argument shape, whichever F1's fix settles on); rollback → the same call with no
     ports.
  4. Close the second parameter's type in Jini (`Record<string, never>` or a named options type with
     no index signature) so a stray `{ ports }` cannot compile.
  5. Delete the four old files only after both constructions have been exercised through the real
     binding.
- Regression tests that must exist before S3 is accepted: (a) the two `visitor-tools.integration`
  cases above, unchanged, **exist**; (b) a Tovu test that the registry built with ports writes an
  audit event and charges the budget once per allowed call — **missing as a single named guard** (the
  behaviour is spread over `visitor-executor.unit`); (c) a Jini type test that
  `createVisitorExecutor(first, { ports })` does not compile once ports live in the first argument —
  **missing**; (d) rollback construction through the Tovu registry still denies page tools —
  check whether `visitor-tools.integration.test.ts:34` (`legacy`) covers a page tool; if not, add it.

**B1-F12 — medium — two per-call checks read the caller's capability list, not what was registered (added in revision 2; second pass).**
- Class: security lookup over a caller-owned mutable collection (the inbound twin of "accessor
  returning a live internal object").
- Location: code `visitor-executor.ts:172` (`capabilityNeedsApproval`) and `:184`
  (`capabilityAcceptsInput`), called per attempt from `:66-67` and through `:47`; both run
  `capabilities.find(...)` on the array the caller passed to the factory. Registration copied each
  capability's handler into the registry once (`:117-150`).
- Fact: if the array changes after construction, the registry still runs the registered handler, but
  the input validator and the "this input needs a confirmation" rule are looked up in the changed
  array. A capability that is no longer found there has **no** validator (`:185` then accepts any
  input) and **no** forced confirmation (`:172` returns false). Tovu is safe today: it passes a fresh
  array that nothing else holds (`capability-registry.ts:171` spreads the map's values). In Jini the
  list is host-supplied and the sheet says "keep the exact structure".
- Fix: at construction, copy what the per-call checks need into a private map keyed by capability
  name (`acceptsInput`, `requiresConfirmation`), built in the same loop that registers the handler,
  and read only that map afterwards. Add it to the must-survive list as B16.
- Test (S1, **not in the sheet**): after the executor is built, empty the caller's array; a call with
  input the validator rejects is still denied, and an input that forces confirmation still reaches the
  gate.

**B1-F13 — medium — the sheet conflicts with two owner rules, and neither is in its STOP list (added in revision 2; judge finding 5, the parts that verify).**
- Location: sheet S2 step 2 (`:138`: "the three Tovu tables become REQUIRED options" —
  `messages`, `defaultMessage`, `visitorCausedCodes`), against COMMON rule 10
  (`move-templates/COMMON.md:26`: exported functions take `(required, optional = {})`).
- Fact: a value that must be supplied cannot live in an argument whose default is `{}`. Either the
  executor makes the second argument non-optional (breaks rule 10), or keeps the default and has to
  invent a fallback for a missing table: a fallback message table is product copy in Jini (rule 2),
  and a missing `visitorCausedCodes` silently changes which errors raise an incident. This is the
  same class as F1 (required values on an object that may be absent).
- Fix: the three tables go in the **first** argument of `createPublicErrorReporter`, with no default.
  Add to the sheet's STOP list: "any required value ends up in the optional argument".
- Test (S2, **missing**): a type test that the reporter cannot be built without each table.
- Also for the sheet (owner rule 5 and 17, not a security finding): the new
  `visitor-tools/index.ts` (`:122`, `:132`) is a file of re-exports. The written rules allow a subpath
  entry file and forbid Jini code importing through it; they do not forbid the file. See "Owner-rule
  acceptance checks" for what must be checked and for the open owner question.

#### Tests

The sheet's S1 list is good and mostly mutation-proof by construction (it asserts handler call counts
and audit content, not internals). Missing cases are named in F1–F8 and F10–F13. Tovu keeps
`visitor-executor.unit`, `visitor-executor-confirmation.unit`, `visitor-page-confirmation.unit` and
`visitor-tools.integration` as tests of the binding — that is the right call and must not be weakened.

### B2 — `split-a50-web-security-predicates.md` (CSP declared hosts + same-origin write check → Jini)

**Verdict: safe with fixes.** Highest severity: **medium**. The move keeps both call sites and their
surrounding gates; the problems are a self-contradicting test, a name that promised more than the
function did, and a weakness that becomes more important once the helper is shared.

**Revision 2. Owner decision made (B2-F1, sheet finding 4, audit row A50): the same-origin check
compares the FULL origin — scheme, host and port.** This tightens `admin-surfaces.ts:72`. F1 is
**resolved as a decision**; the sheet as written still implements the opposite (host-only, with a test
that pins the cross-scheme case as accepted), so **the sheet must be rewritten to the decision before
it is executed**. Also changed here: the saved-keys test inventory was wrong and is corrected (judge
finding 6), and the wildcard fix in F3 is narrowed (judge finding 8).

#### Does the plan keep each gate?

| Gate | Where today | In the sheet | Kept? |
|---|---|---|---|
| Write refused unless `Origin` is a bare http(s) origin whose host equals `Host`, and fetch metadata (if sent) is same-origin | `features/agent-plugins/admin-surfaces/same-origin.ts:14-33` | moved byte-identical, renamed | yes — and by the owner decision it must become **stricter** (full origin), which the sheet does not yet do: F1 |
| Admin-surface writes: CSRF check, then session-credential-only check | `server/inbound/admin-http/routes/agent-plugins/admin-surfaces.ts:71-77` | call renamed only | yes; **gains the scheme comparison** (F1) |
| Saved-keys reveal: workspace, session credential, owner identity, CSRF check, **plus scheme equality** | `site-share-password.ts:20-24` | call renamed, line 24 kept | yes |
| Declared hosts cannot add policy syntax | `contracts/core/public-page-security-headers.ts:64-85` | moved | yes, see F2, F3 |
| Rate limit, session rotation, token scope, audit | not in these files | — | not affected |

#### Findings

**B2-F1 — medium — RESOLVED by owner decision: the check compares the full origin (scheme + host + port).**
- Class: security contract over-stated by its name; a weakness that the sheet pinned as intended.
- Location: code `same-origin.ts:17`, `:32`; `admin-surfaces.ts:72`; `site-share-password.ts:23-24`;
  sheet finding 4 (`split-a50-web-security-predicates.md:11`), the contract (`:51-54`), S1 step 1
  (`:67`, the test "an `http:` vs `https:` origin with the same host ACCEPTED"), S2 step 2 (`:73`, "the
  extra scheme check … is KEPT untouched") and the STOP rule at `:84`.
- Fact (unchanged from revision 1): the scheme of `Origin` is not compared with the scheme the server
  is serving. One caller adds its own scheme check (`site-share-password.ts:24`); the other
  (`admin-surfaces.ts:72`) does not.
- **Decision (owner, 2026-11-16):** compare the whole origin. The rename-only alternative is dropped.
- What the sheet must now say (this replaces sheet finding 4, the contract, the pinned test and the
  STOP rule at `:84`):
  1. **Jini contract.** `isSameOriginBrowserWrite` takes the **expected origin** as a required input
     and no longer takes `host`:
     `{ origin: string | undefined; expectedOrigin: string; fetchSite: string | undefined }`.
     It returns true only when `origin` is a bare http(s) origin (the existing canonical check at
     `same-origin.ts:17` stays), equals `expectedOrigin` **exactly** as a serialised origin, and fetch
     metadata, when sent, is `same-origin`. `expectedOrigin` is required and has no default: a missing
     or unparsable one refuses. Jini never reads a request, a header or the environment to work the
     expected origin out (owner rules 3 and 8); the host supplies it.
  2. **Who decides the expected scheme (Tovu, one helper for both callers).** The expected origin is
     `<scheme>://<Host header>`, normalised through the URL parser so a default port written out
     compares equal to one left off. The scheme must come from **one named Tovu helper**. Tovu already
     has two precedents and they disagree: `req.protocol` (`site-share-password.ts:24`,
     `routes/system/site-imports.ts:127`) and `resolveProtocol`, which honours the forwarded-scheme
     header (`public-http/routes/oauth/public-origin.ts:37-45`, used for the same purpose by
     `public-http/routes/site/comments-submit.ts:67-71`). Behind a proxy that terminates TLS, with no
     `trust proxy` hop count in effect (`server/inbound/shared/trust-proxy.ts:38`: hops are trusted
     only from an explicit override or a recognised platform; otherwise none), `req.protocol` reports
     the inner scheme, so a full-origin check built on it refuses
     **every** admin-surface write on such a deployment. It fails closed, but it is an outage, and from
     reading it is what the saved-keys route already does there today (**not verified by running**).
     The sheet must therefore pick the helper explicitly and say why. Recommended: the comments-route
     rule (forwarded scheme when it is exactly `http` or `https`, else `req.protocol`), because a page
     in a victim's browser cannot set that header on a cross-origin request and a client that forges
     headers needs the session cookie anyway — the same reasoning `same-origin.ts:9-10` already states.
     This is a judgment for the owner or the sheet author to confirm; it is **not** part of the
     decision already made.
  3. **Tovu callers.** `admin-surfaces.ts:72` and `site-share-password.ts:23` both pass the expected
     origin from that helper. `site-share-password.ts:24` then duplicates the shared check; delete it
     **only in the same commit** that lands the shared check with its scheme test, and only if the
     helper chosen in step 2 is at least as strict for that route as `req.protocol` is today —
     otherwise keep line 24 and say so.
  4. **It is a behaviour change, not a pure move.** COMMON rule 13 applies: failing tests first, in
     the same commit, red on the parent. Changeset line for `@jini-ai/core` (new required input) and a
     Tovu release note (admin-surface writes are refused when the page's scheme differs from the
     server's).
  5. **Remove** the S1 case that pins cross-scheme as accepted and the STOP rule that protects
     host-only behaviour (`:84`); replace with "STOP if any caller would need a host-only comparison".
- Regression tests that must exist (write these first):
  - Jini `same-origin-write.test.ts` — **missing** (file not created yet): same host, different
    scheme → refused, both directions; same scheme and host, different port → refused; default port
    written out on one side only → accepted; `expectedOrigin` missing, empty, with a path, or not
    http(s) → refused; every existing case of Tovu `same-origin.unit.test.ts` re-expressed with an
    expected origin (record the assertion count before and after).
  - Tovu admin surfaces — the route-level guard **exists**
    (`agent-plugin-admin-surfaces.security.integration.test.ts:129`, asserts the refusal code; it
    fails if the gate call is removed). **Missing:** a case on that route where only the scheme
    differs, expecting the refusal code. It must be red on today's code.
  - Tovu saved keys — two route-level suites **exist** (corrected in revision 2; judge finding 6,
    verified): `server/inbound/admin-http/routes/system/__tests__/site-share-password.integration.test.ts:26-48`
    drives the registered route with a fake backend — a foreign origin is refused (`:43`) and a
    matching origin with cross-site fetch metadata is refused (`:45`), with the reveal counter still
    zero (`:46`); `…/__tests__/site-share-password-handler.test.ts:39-75` uses the real registry,
    sealer and backend and refuses a same-host different-scheme origin, an opaque origin and
    cross-site fetch metadata (`:62`). From reading, the first fails if the predicate call at
    `site-share-password.ts:23` is removed (the fetch-metadata case) and the second fails if the scheme
    comparison at `:24` is removed. **Neither was run, and no mutation run was done.** Both must be
    kept through A50 with every assertion intact; after the change the scheme case also guards the
    shared predicate. Revision 1 said no such test was found — that was a search error on my side.
  - Tovu proxy behaviour — **missing**: one test per caller that an HTTPS page behind a
    TLS-terminating proxy is admitted under the helper chosen in step 2, and that a forwarded-scheme
    value other than `http`/`https` falls back rather than being trusted.

**B2-F2 — medium — a new "tests first" case contradicts "bodies move byte-identical".**
- Location: sheet S1 step 1 ("an `http:` host in `script` … dropped") versus code
  `public-page-security-headers.ts:83` (accepts `http:` and `https:`), and the type doc at `:13`
  ("Exact https origins").
- Fact: with the body moved unchanged, an `http:` origin is **not** dropped, so that test is red
  forever. The executor must then either change the predicate (unreviewed behaviour change), delete
  the assertion, or stop. The sheet's STOP list does not cover it.
- Fix: decide it in the sheet. With no owner decision, the default is **no behaviour change**: the
  body moves unchanged, the test is corrected to pin today's behaviour (`http:` origins accepted in
  all three directives), and the type doc at `:13` is corrected to say "http(s)". Dropping `http:` for
  `script` and `connect` is the stricter option and I still recommend it, but it is a behaviour change
  and needs its own owner decision, a caller check (which plugin exports declare `http:` hosts today)
  and a failing test first. (Revision 2: revision 1 recommended the stricter option without marking it
  as a decision; the judge's point about F3 applies here too.)

**B2-F3 — medium (low today) — wildcard-shaped hosts pass the "exact origin" check.**
- Class: allow-list entry that is policy syntax.
- Location: code `public-page-security-headers.ts:80-85` (`isDeclaredFrameOrigin`), used at `:44`, `:69`.
- Fact: the check is "parses as a URL, http(s), and equals its own origin". A host made of or
  containing the wildcard character satisfies that, and in a content security policy such a source is
  a wildcard, not one host. So "a declaration can never become policy syntax" (`:60-61`) is not fully
  true. Today the policy is report-only (`:53`), so the effect is limited to reporting; once this is a
  shared Jini helper another host may enforce the policy with it.
- Revision 2 check: I evaluated the predicate's expression on its own (no server, no test suite). It
  accepts both wildcard shapes, and it also accepts address-literal hosts, a trailing dot and an
  explicit port; it refuses a wildcard in the port position.
- Fix (narrowed in revision 2; judge finding 8, verified): in the moved `isDeclaredOrigin`, reject a
  value whose host contains the wildcard character, and change nothing else. Every origin the check
  accepts today that is not wildcard syntax stays accepted. Revision 1 proposed "labels of letters,
  digits and hyphens only, no trailing dot"; that also turns away canonical address-literal origins and
  changes trailing-dot handling — two extra policy changes nobody asked for, with no caller assessment.
  If the owner wants the stricter host grammar, it is a separate decision with its own callers check
  and tests.
- Tests for S1 (**missing** from the sheet's injection list): a host that is only the wildcard, and a
  host with a wildcard label, are dropped from all three directives; and, to pin that the fix did not
  over-narrow, one address-literal origin and one origin with an explicit non-default port are still
  accepted exactly as on today's code (take the expected values from a run on the parent commit, not
  from this document).

**B2-F4 — low — the sheet's line numbers do not match the blob it guards.**
- Location: sheet guard line "lines 12-23 types + 55-83 helpers leave", ":47" and ":40".
- Fact: at blob `fc2c823f` the constant is `:10`, the types `:11-18`, `PublicThemeResources` (which
  stays) `:20-27`, the filter `:44`, the header key `:53`, the helpers `:57-85`. An executor cutting by
  line would remove half of an interface that must stay. It would fail to compile, not fail open.
- Fix: correct the numbers or tell the executor to cut by symbol name only.

**B2-F5 — low — the separator assumption is unpinned.**
- Location: code `:65` (`policy.split("; ")`).
- Fix: add a test that a policy joined with a bare `;` is returned unchanged rather than half-extended,
  or normalise the split.

#### Tests

The S1 list is strong (opaque origin, path, trailing slash, userinfo, port mismatch, fetch-metadata
values, directive prefix). Change: the cross-scheme case flips from "accepted" to "refused" (F1,
decided). Add: the full-origin cases and the proxy cases listed under F1; wildcard host and the two
"still accepted" pins (F3); the `http:` pin (F2). In Tovu keep one test per call site that fails when
the gate call is deleted — both call sites have one today (F1).

### B3 — `split-a51-session-bootstrap.md` (initial-session read, probe-then-redeem, loopback guard → Jini)

**Verdict: safe with fixes.** Highest severity: **medium** (was low in revision 1). This is still the
best of the three sheets: the decisions move, the transports and every credential-bearing request stay
in Tovu, and each auth rule is tied to a named test. Revision 2 adds **F5 (medium, must fix in the
sheet before execution)**: the plan deletes the only tests of Tovu's hostname admission rule, and my
revision-1 statement that the tests were "sufficient" was wrong. It also adds F6 (low).

#### Does the plan keep each gate?

| Gate | Where today | In the sheet | Kept? |
|---|---|---|---|
| Bootstrap only from an admitted local hostname | `apps/admin/src/lib/local-owner-signin.ts:9-11`, `:21` | host-supplied `admit`, required | yes in code; **its tests are deleted by the plan — F5** |
| Bootstrap only after the exact "no session" error | `:39` | host-supplied `isUnauthenticated`, required | yes |
| One bootstrap, never retried; no identity read after a refusal; original error rethrown | `:22-25`, `:40-41` | finding 5, S1 tests | yes |
| Sign-in callback only after a successful identity read | `:43` | finding 5, S1 test | yes |
| Redeem only when the probe fails (no new long-lived session when one is valid) | `apps/desktop/src/desktop-auth.ts` `ensureSiteSession` | `ensureSession`, spy test | yes |
| Credential sent only to plain-HTTP loopback literals; `localhost` refused | `desktop-auth.ts:130-144` | `assertLoopbackHttpUrl`, tests | yes |
| The two different loopback lists stay different (browser admission vs desktop guard) | finding 4 | explicit | yes |
| Session creation, rotation, expiry, logout, boot-token single use, rate limit, audit | server routes (`admin-http/dev-auth.ts`), not touched | "not touched" | not affected — **and not reviewed here** |
| Origin / CSRF on the bootstrap request | server side | not touched | not affected |

Session fixation and rotation: the sheet does not move any code that creates, rotates or ends a
session. The only session-lifetime rule it moves is "do not redeem when the probe says valid", and it
pins it with a spy test. That rule is about not piling up sessions, not about fixation.

#### Findings

**B3-F1 — low — two refusal causes are dropped with no way for a host to see them.**
- Class: swallowed error (owner practice).
- Location: code `local-owner-signin.ts:25` (`catch { return null; }`); sheet finding 2a keeps "swallow
  rejection".
- Fact: a bootstrap that is refused on purpose and one that fails for a real fault (server error,
  network) both vanish, and so does a failure of the second identity read. Control flow is right (fall
  back to the ordinary login); diagnosability is not.
- Fix: add an optional `onBootstrapFailed({ stage, error })` callback to `readInitialSession`. It must
  not change the result and must run before the original error is rethrown. The host words and
  redacts. Test: it receives the stage; the returned/thrown value is unchanged.

**B3-F2 — low — the guard's refusal text echoes the whole URL.**
- Location: code `desktop-auth.ts:134` (invalid-URL message includes the input); sheet passes it on as
  `detail`.
- Fact: a URL can carry user information. Tovu's inputs are its own loopback URLs, so this is not a
  leak today, but the Jini default message should not repeat unparsed input.
- Fix: Jini default message says which rule failed and nothing else; Tovu keeps its strings through
  `message` (its tests assert them).

**B3-F3 — low — the sheet contradicts itself on who calls the guard from the desktop tools host.**
- Location: sheet finding 3 ("`desktop-mcp-http.ts:4` … repointed to the Jini guard") versus S3 ("the
  exported name stays (`desktop-mcp-http.ts:4` … call it)").
- Fix: keep the Tovu wrapper as the only caller of the Jini guard (S3's version). This also matches
  what A3 requires of the capability-delivery code.

**B3-F4 — low — pin the alternate spellings of loopback.**
- Location: sheet S1 `assertLoopbackHttpUrl` cases.
- Fact: the check compares the parsed hostname with a fixed set (`desktop-auth.ts:141`). The URL parser
  normalises short and numeric forms of the same address before that comparison, so they are accepted,
  which is correct. Mapped and other loopback-range addresses are refused, which is the safe side.
- Fix: add both groups as explicit cases so a later change to the comparison cannot widen it unseen.

**B3-F5 — medium — the plan deletes the only tests of Tovu's hostname admission rule (added in revision 2; judge finding 4, verified).**
- Class: test gap on an admission gate, created by moving the tests to a place where the gate is a fake.
- Location: sheet S2 (`split-a51-session-bootstrap.md:79`: `tryLocalOwnerSession` is deleted and "the
  `tryLocalOwnerSession` cases move to Jini"); code `apps/admin/src/lib/local-owner-signin.ts:9-11`
  (`isLocalOwnerSignInHost`, which **stays** in Tovu) and `:21`; tests
  `apps/admin/src/lib/__tests__/local-owner-signin.unit.test.ts:17-23` (four non-local hostnames: zero
  calls), `:25-29` (three local hostnames: admitted), `:31-38`, `:40-46`, and `:73-78`.
- Fact: every test that exercises the real hostname rule calls `tryLocalOwnerSession` (`:9`, `:19`,
  `:26`, `:33`, `:42`). After S2 that function is gone and those cases are rewritten in Jini, where
  `admit` is a fake that returns what the test tells it to. Jini cannot see Tovu's hostname list, so a
  wrong list, or a binding that passes the wrong hostname, is tested nowhere. The one surviving Tovu
  case that looks like a guard (`:73-78`, "initial remote refusal…") does not guard: its bootstrap fake
  throws, the code under test swallows bootstrap errors and rethrows the original error
  (`local-owner-signin.ts:25`, `:41`), so the assertion passes **whether or not** the bootstrap was
  attempted.
- What revision 1 got wrong: it said the tests were sufficient and listed `:31` and `:40` as tests
  that stay. Both call the deleted function; they do not stay. The Jini cases are sufficient for the
  **generic mechanism** only.
- Why medium and not higher: the browser-side rule exists to avoid sending the bootstrap request from
  a deployed origin; the server decides whether a bootstrap is honoured
  (`local-owner-signin.ts:1`, and the routes in `admin-http/dev-auth.ts`, which the sheet does not
  touch and this review did not read). So a broken rule sends a request it should not, to a server
  that should refuse it. That is a lost layer, not a lost boundary.
- Fix (in the sheet, S2):
  1. Keep the hostname cases **in Tovu**, re-expressed through `readInitialAdminSession`: for each of
     the four refused hostnames and each of the three admitted ones, the identity read first fails
     with the exact "no session" error, the bootstrap fake **succeeds** and counts its calls. Refused
     hostnames: zero bootstrap calls, the original error rethrown. Admitted hostnames: exactly one
     bootstrap call, then the second identity read's value.
  2. Rewrite `:73-78` the same way (successful, counting fake; assert zero calls).
  3. Keep one direct table test of `isLocalOwnerSignInHost` (it is an exported Tovu function).
  4. Jini tests the generic mechanism with fakes, as the sheet already lists.
  5. Replace "record counts" with: list each deleted Tovu case next to the Tovu or Jini case that
     replaces it, and state for each whether it runs the real hostname rule.
- These tests must be written before S2 is executed; each refused-hostname case must fail if
  `admit` is bound to a constant `true`.

**B3-F6 — low — "no session after bootstrap" must not be detected by testing the returned value (added in revision 2; second pass).**
- Class: absence check after type generalisation (the same class as A1-F5).
- Location: sheet contract `readInitialSession<T>` (`:46`); code `local-owner-signin.ts:20`
  (`Promise<T | null>`), `:25`, `:41` (`if (session === null) throw error`).
- Fact: today "bootstrap refused" travels as `null` inside a `T | null`. Tovu's identity value is
  always an object, so that is sound. In Jini `T` is whatever the host's identity read resolves to; a
  host whose read can resolve to `null` (or any value an implementation chooses to test for) would be
  treated as refused, or — if the implementer swaps the test for truthiness — a falsy identity would
  be. Either way it fails towards "ordinary login", so it is low; it is still a behaviour trap in a
  published auth helper.
- Fix: the sheet says in S1 that refusal is carried by control flow (the catch path), never by a
  sentinel value of `T`; add the S1 test "the second identity read resolves to a falsy value → that
  value is returned and `onBootstrapped` is called once".

#### Tests

Revision 2 (judge finding 4): the Jini list in the sheet is sufficient for the **generic decisions**
only; each of those cases fails when its rule is removed (call-count and call-order assertions with
fakes). It is **not** sufficient for the binding: Tovu's hostname admission rule loses all its real
tests unless F5 is applied. Tovu's `desktop-auth.test.ts` and `desktop-auth-streams.test.ts` stay as
binding tests of the desktop half. Of `local-owner-signin.unit.test.ts`, only `:48-54`, `:56-63`,
`:65-71` and `:73-78` survive as written, and `:73-78` must be rewritten (F5). Add the cases in F1,
F4, F5 and F6.

### Not verified in part B

- I did not run any of the listed Tovu tests, and did not re-run the sheets' census commands.
- For A51 I did not read the server routes that mint, rotate and end sessions; the sheet does not touch
  them, so their correctness is outside this item.
- For A50 (corrected in revision 2): the two saved-keys route suites exist and I have now read them;
  I did not run them and did no mutation run. I did not verify by running that the saved-keys route
  refuses HTTPS pages behind a TLS-terminating proxy with no trusted hop count; that is from reading.
- For A06 (revision 2): I have now read `capability-registry.ts:154-174` and the composition at
  `composition/modules/site-assistant.ts:700-731`. I did not read the other callers of
  `createSiteCapabilityRegistry`, and I did not check which npm/TypeScript settings decide whether a
  stray second-argument object compiles (F11 covers both outcomes).
- For A51 (revision 2): I did not run `local-owner-signin.unit.test.ts`; the statement that `:73-78`
  passes either way is from reading the test and the code.

---

## C — cloud/small-fixes-2026-11-15: the MCP consent gap and the `mcpIsolation` claim

**Verdict: unsafe - do not merge** Jini `10605caf` ("Claude def declares mcpIsolation so planRun skips
MCP consent"). Highest severity: **high**. The other commits on the two branches are dependency
hygiene and are **safe with fixes** (revision 2; was "safe" — notes at the end, C-F4).

Line numbers in this item are at Jini `cloud/small-fixes-2026-11-15` (`2bf74b9f`).

### The claim

`packages/agent-runtime/src/defs/claude.ts:151-153` adds
`mcpIsolation: { perRun: 'claude-strict-mcp-config@2026-11-16' }` with the comment: *every run passes
`--strict-mcp-config`, so the CLI ignores user/project MCP sources; planRun need not ask for consent.*

### Is the claim true? **No.** Three separate facts, all read from the code:

The same question — "will this run load MCP servers the owner did not grant?" — is answered in three
places, and they disagree whenever the host leaves the personal-MCP capability **unset** (it is
optional: `nativeCapabilities?: Partial<NativeCapabilities>`, `native-tool-policy.ts:53-58`).

| Place | Rule when the capability is unset | Location |
|---|---|---|
| Consent planner | "isolated": no consent key, verdict RUN | `native-tool-policy.ts:119-126` (`loadsOwnSources` returns `userMcp === true`), `:128-134` |
| Argument builder | **not** locked: the strict flag is omitted when no config is staged; and omitted with a staged config when the run has CLI parity and bypass mode | `defs/shared.ts:76-79` (`claudeUserMcpLocked`), `:69`, `:30-32`, `:71-72` |
| Config stager | **inherit**: the project's own MCP file is read and merged into the config the daemon stages | `packages/daemon/src/agent-executor/mcp-bridge.ts:283`, `launch.ts:1433`, `claude/mcp-config.ts:14`, `:21-24` |

So:

1. **No staged config** → the builder returns no strict flag at all (`shared.ts:69`). "Every run passes
   it" is false.
2. **Staged config, CLI parity + bypass mode** → the strict flag is dropped (`shared.ts:30-32`, `:71-72`).
3. **Staged config, strict flag present** → the staged file already contains the project's MCP server
   definitions (`claude/mcp-config.ts:21-24`), and passing it explicitly is documented in the same
   file as skipping the CLI's own project-trust prompt (`shared.ts:44-46`). The flag isolates nothing
   that matters here.

Before this commit the definition declared no isolation, so the planner asked for the personal-MCP
consent in all three cases and the daemon's backstop refused the launch
(`launch.ts:1121-1126`). After it, the planner answers RUN and the backstop lets the run through.

The claim **is** true for the one case the new test checks: the capability explicitly `false`
(`claudeUserMcpLocked` is then true, the strict flag is passed, and the stager does not inherit).

### Findings

**C-F1 — high — consent is skipped on paths where no isolation is applied.**
- Class: missing authorization (consent) because two components disagree about a default; untrusted
  project configuration loaded without a trust decision.
- Location: `defs/claude.ts:153`; `native-tool-policy.ts:119-126`; `defs/shared.ts:66-79`;
  `daemon/src/agent-executor/launch.ts:1113-1126`, `:1433`; `mcp-bridge.ts:283`;
  `claude/mcp-config.ts:14-24`.
- Impact: an agent run can start with MCP servers defined by the owner's own CLI setup or by the
  project folder, with no consent card and no CLI trust prompt. Those servers can carry the owner's
  credentials and can run local commands.
- Fix (all needed):
  1. Resolve the capability **once**, in `enforceNativeToolPolicy` before `planRun`, to a definite
     boolean (unset → `false`), and make the planner, the argument builder and the stager read that
     one value. No component may keep its own reading of "unset".
  2. Make the planner's answer and the launch agree by construction: when the plan says "does not load
     its own sources", the daemon must check the built arguments contain the isolation flag and that
     the staged config was built without inheritance, and otherwise fail before spawn (the planner
     already has `isolationBlocked` for this; the daemon never sets it — `launch.ts:1121` passes no
     host).
  3. Until 1 and 2 land, remove the `mcpIsolation` declaration (back to "ask").

**C-F2 — high — the isolation stamp is not what the type contract requires.**
- Class: unverified security claim recorded as verified.
- Location: `packages/agent-runtime/src/types.ts:346-347` ("A per-run claim must identify a verified
  CLI version and date"); `defs/claude.ts:153`; executor report `cloud-results/small-fixes-2026-11-15.md`
  ("a claim from the documented … behaviour, not a live CLI check").
- Fact: the stamp carries a date and no CLI version, and nothing was run. Not verified by anyone:
  whether the flag also excludes servers contributed by installed CLI plugins, by the signed-in
  account's connectors, and by managed (organisation) configuration. I could not verify these either
  (no CLI in this environment).
- Fix: verify on a named CLI version, for each of those sources, and put that version in the stamp.
  Add the check to the def's contract test: the stamp must match `<name>@<cli version>@<date>`.

**C-F3 — medium — the new test is named as a guard but does not look at the gate.**
- Location: `packages/agent-runtime/src/__tests__/plan-run.unit.test.ts:61-66` ("an isolated Claude run
  does not request MCP consent (it passes --strict-mcp-config)").
- Fact: it calls only `planRun`. It never builds arguments. Delete the strict flag from
  `buildClaudeMcpConfigArgs` and the test stays green. Its fixture sets the capability to `false`
  (`:5-7`), the one case where the claim holds, so it cannot see the gap. The date-only regex also
  locks in the stamp format that breaks the type contract.
- Fix: a matrix test over {capability true / false / unset} × {config staged / not} × {parity+bypass /
  not} × {folder limit / none}. For every cell where `planRun` returns RUN with `loadsOwn: false`,
  assert (a) the def's built arguments contain the isolation flag and (b) the stager is called with
  inheritance off. This fails today in the unset cells, and fails if the flag is ever removed.

### What must change before merge

1. Drop `10605caf` from the branch, or land it together with C-F1 fixes 1 and 2.
2. Stamp with a verified CLI version (C-F2).
3. Replace the test with the matrix (C-F3); show it red on today's code first.

### Not verified

- Whether Tovu can reach the executor with the capability unset. Tovu has a path that discards a
  stored `false` and re-applies defaults (`apps/website/src/assistant/subagent-settings.ts:38-41`,
  `cli-permission-layer.ts:25-27`); I did not trace the resolved value to the executor call. The Jini
  finding stands regardless: Jini's contract allows unset, and other hosts use it.
- The CLI's real behaviour (see C-F2).
- Existing behaviour, not changed by this commit and not assessed here: the daemon backstop does not
  run at all when a host passes neither the access switch nor any capability (`launch.ts:1120`).

### The other commits on these branches (briefly)

- Tovu `51133f44` → `939ee65d` (mail library pinned to a release older than 14 days), `52ac8c1b`
  (`.npmrc` minimum release age); Jini `eff5c025`, `1a1a4d43` (same for pnpm).
  **Verdict (revision 2): safe with fixes** — was "safe". Nothing in these commits weakens anything, so
  merging them is harmless; what changed is that I no longer accept the claim "enforced" as shown.
  - **C-F4 — low — the Tovu age gate depends on an npm version that nothing pins (added in revision 2;
    second pass, class "a control that silently depends on a setting assumed constant").** Location:
    Tovu `52ac8c1b:.npmrc:2-3` and `CONTRIBUTING.md` (states the setting needs a recent npm 11
    release); Tovu `package.json:11-13` (`engines` names Node only; there is no npm constraint and no
    `packageManager` field). Fact: an npm that does not know the setting ignores it without failing.
    The npm in this review's environment is 10.9.9 and its full configuration list has no such key, so
    here the gate does nothing. Node 24 is required by `engines`, but which npm a given Node 24 minor
    ships is not something the repository controls. Fix: add an npm constraint to `engines` (the
    first version that has the setting) **and** a CI step that reads the effective value and fails
    when it is not 14. Test: that CI step, shown failing on an older npm.
  - Jini is in better shape: `package.json:4-8` pins pnpm (`packageManager` and an `engines` range)
    to a version that has the setting. Not verified: that the pinned pnpm accepts a scope pattern in
    its exclude list.
  - Still open from revision 1 (low): both gates exempt the first-party `@jini-ai/*` scope and the
    executor could not confirm the exemption pattern matches; I could not confirm it either, nor that
    npm has an exclude key under that name at all (checking it needed a newer npm than this
    environment has). Confirm both, and note that a compromised first-party publish is by design not
    delayed by this gate.
- Jini `65c42167`, `befb207e`, `b7666092` (guard script fixes) were not reviewed here; they are the
  branch base and not part of item C.

---

## D — Cross-cutting facts from the daemon design review (judge findings 1, 2, 12)

Facts only, on today's code (Tovu `65302ee5`, Jini `02edbb68`). No design. **All three findings are
confirmed.**

### D1 — the `authorizeRun` principal rewrite (judge finding 1): **confirmed**

- The lookup refuses unless the supplied principal equals the stored one:
  `apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts:216`.
- The middleware reads the supplied run id and principal id, and answers 403 if either is not a
  string or there is no run store (`:232`); it passes the supplied principal into the lookup (`:233`)
  and answers 403 when the lookup returns nothing (`:234`).
- Only **after** that does it replace the request's principal with the stored id, keeping only a
  `read-only` tool-access narrowing from the caller (`:235`). Every other caller-supplied principal
  field is dropped.
- So "principal A, run recorded under B" is **refused with 403 and nothing executes** today. A
  characterisation that expects it to "execute as B" describes a different, weaker system. The judge
  is right.
- Ordering in Jini: the route chain is caller gate → body parser → `authorizeRun` → handler
  (`packages/daemon/src/http/tool-execution-routes.ts:234`), and the body shape is validated inside
  the handler (`:183`). So today authorization runs **before** shape validation: a well-authenticated
  caller with a malformed body and no valid run gets 403, not 400. Moving authorization after
  validation changes which refusal a caller sees.
- The lookup also requires the run to be the live attempt, the same run id, and this workspace
  (`assistant-tool-exec.ts:212`).
- The judge's line citations (`:216`, `:233`, `:234`, `:235`) match the code exactly.

### D2 — the Tovu blanket body parser gate (judge finding 2): **confirmed**

- The daemon-side app installs one unscoped JSON parser at
  `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:1407` (6 MB), after the bearer gate.
- A second credential check for delegated tool calls is registered **after** that parser, at `:1433`,
  with `validateDelegatedRunId: true`.
- That check reads the parsed body: Jini `packages/daemon/src/http/run-credentials.ts:30` passes
  `req.body` to the authorizer only in this mode, and `packages/daemon/src/run-credentials.ts:154`
  refuses a run-scoped credential unless `body.runId` equals the credential's own run.
- Therefore, if the blanket parser is removed and nothing replaces it for that path, `req.body` is
  undefined there and every delegated call from a run-scoped credential is refused (fail closed — a
  break, not a bypass). The gate's meaning depends on a parser it does not own.
- Other Tovu-owned handlers below the same parser read `req.body` directly, for example
  `tool-access-lowering-route.ts:20`, and the routes registered at `agent-daemon-scope.ts:1408` onward.
  I confirmed the first; I did not enumerate all of them.
- Related fact for the main site app (not the daemon app): the internal router that carries the
  tool-execution and capability-handoff routes is mounted **before** the public parser
  (`apps/website/src/server/runtime/composition/app.ts:2005-2006`), so those routes gate before any
  body bytes are parsed. That ordering is also load-bearing and is not pinned by a test I could find.

### D3 — the constant-time comparison port (judge finding 12): **confirmed**

- Tool execution compares the bearer with `timingSafeTokenMatch` at
  `packages/daemon/src/http/tool-execution-routes.ts:75`, imported from `@jini-ai/http-kit` (`:28`).
- Remote run events do the same at `packages/daemon/src/http/remote-run-events.ts:88`.
- The http-kit function binds Node's native comparison itself
  (`packages/http-kit/src/api-security-middleware.ts:83-85`).
- The core function of the same name requires the comparison to be injected
  (`packages/core/src/token.ts:46-50`, `timingSafeEqual: TimingSafeByteComparison`).
- So a design that removes the http-kit import from these routes must supply that comparison as a
  port (with a fake for tests). If it does not, the code either will not compile or someone will
  reach for plain equality. The judge is right.

### Not verified in D

- No request was sent to a running server; these are reads of the code.
- I did not read the design documents the judge reviewed (R7, INDEX), only the judge's findings and
  the code they cite.

---

## Owner-rule acceptance checks (added in revision 2; judge finding 5)

Revision 1 looked at security gates only and left the owner's move rules
(`move-templates/COMMON.md:16-37`, on `plan/audit2-sheets-a3`) out of its acceptance lists. They belong
there: a move that breaks them is sent back whatever its security verdict, and two of them (required
values in an optional argument; functions split "to fit") change security behaviour when done badly.
Each row is either measured here or marked not measured. No lint, type-check or test was run.

| Rule (COMMON) | Item | Result | Evidence |
|---|---|---|---|
| 11 — functions ≤ 50 lines, blank lines and comments not counted | A1, Jini `bound-confirmations.ts` | **passes — measured**: `createBoundConfirmations` (`:80-134`) is 55 physical lines = **48 counted**; `createBoundConfirmationGate` (`:161-212`) is 52 physical = **43 counted**; `settleHeld` 13 | Rule text `COMMON.md:27`; Jini lint config `eslint.config.mjs:74` (`max: 50, skipBlankLines: true, skipComments: true`). The judge counted physical lines; the rule does not. **This sub-claim is rebutted.** The headroom is 2 lines: the A1-F5 fix must not use it up (extract a helper). |
| 11 | A3, Jini `pinned-capability.ts` | passes — measured: 22 and 19 physical lines | `:48-69`, `:94-112` |
| 11 | A2, Jini `vault.service.ts` `rotate`, `assertOpensTo` | passes — measured: 10 and 6 lines of body | `ab0ef93c` `:376-387`, `:162-169` |
| 11 — complexity ≤ 10 | A1, A2, A3 | **not measured** (needs the lint run; no install was done) | must be in the executor's or integrator's report before merge |
| 11 | B1 sheet | the sheet already requires the 120-line factory to be split (`:132`). **Add:** the split must not move the synchronous attempt increment or the policy read (sheet review points 1 and 3), and F12's private map must be built in the registering loop | — |
| 10 — `(required, optional = {})`; required values never in the optional argument | B1 sheet, public-errors | **fails as written**: three required tables are placed in "options" | sheet `:138`; see B1-F13. Must fix in the sheet. |
| 10 | B1 sheet, executor | **fails as written**: four values needed when ports are absent sit on the optional ports | B1-F1 (already a must-fix) |
| 10 | A1, A3 landed code | passes by reading: every exported function has the two-argument shape with `= {}` | `bound-confirmations.ts:80`, `:161-164`; `pinned-capability.ts:48-51`, `:94-97` |
| 5 — Jini imports: own leaf files, `@jini-ai/core`, `@jini-ai/protocol` only | A1, A3 landed code | passes — measured | `bound-confirmations.ts:10-12`; `pinned-capability.ts:15` |
| 2, 7, 8 — no product text, no `console`, no `process.env` in Jini | A1, A2 (added lines), A3 | passes — measured (no match) | search over the three files at their commits |
| 17 — a new subpath needs an exports entry, a runtime tag and a README line | A1, A3 | no new subpath: both ride an existing entry. A1 adds one re-export line to `packages/daemon/src/surface-exchanges.ts:66`; A3 adds one to `packages/mcp/src/federation/hosted/index.ts:14`. README line: **not checked** | `af6779fb`, `1b5af586` |
| 5, 17, 19 — "no barrels" | A3 (`hosted/index.ts:14`), A1 (`surface-exchanges.ts:66`), B1 sheet (`visitor-tools/index.ts`, `:122`, `:132`), B3 sheet (`session-bootstrap/index.ts`, `:57`) | **not a violation of any written rule I could find — partly rebutted, and raised as an owner question.** Rule 5 forbids Jini code *importing through* a package barrel; rule 17 *prescribes* an entry per subpath; rule 19 and the R-BARRELS lane are about Tovu shells that re-export Jini. None says a Jini subpath may not have an entry file of re-exports. | `COMMON.md:21`, `:33`, `:35`; `untangle/sheets/R-BARRELS.md:1` |

Because the judge reads a "no-barrels target" into the rules and I cannot find it written down for Jini
entry files, this is an **owner question, not a silent pass**: *should a new Jini subpath point its
`exports` entry straight at the implementation files (one subpath per file) instead of at an `index.ts`
of re-exports?* Until it is answered, the acceptance check for A1, A3, B1 and B3 is the written one:
no Jini file imports the moved code through the entry file (rule 5), and no Tovu file re-exports it
(rule 19). If the owner says "no entry files", the cost is small for B1 and B3 (not executed yet) and a
follow-up for A1 and A3.

**Added to the acceptance lists** (and to `INDEX.md`): B1-F13 (required tables in the first argument);
the size headroom note on A1-F5; complexity measured for A1, A2, A3 before merge; the owner question
above.

---

## Second adversarial pass over every "safe" / "safe with fixes" verdict (revision 2)

The judge named three classes of mistake I had made. I re-read each item that I had not marked unsafe,
looking only for those three. "Checked" means I read the cited lines again with that one question.

**Class 1 — a truthiness test standing in for "is it present" after a type was generalised.**

| Item | Where I looked | Result |
|---|---|---|
| A1 | Jini `bound-confirmations.ts:128` | **finding A1-F5** (judge's). Also checked `:102` and `:171`, `:186`, `:208` (`signal?.aborted` — a boolean, sound); `:88`, `:101` (`?? 0` on counts — sound); `:206` (`Boolean(validate)` on a function — sound). |
| A3 | Jini `pinned-capability.ts:53`, `:55`, `:60`, `:64` | `:55` treats an empty handoff value as absent, which is correct (it then fails the pattern anyway). `:60` and `:64` test the held object, never a host scalar. Sound. Whether an empty URL can be a capability is the host predicate's decision (`isCapability`); Tovu's refuses it (`desktop-mcp-runtime.ts:11-22`). |
| B1 (sheet) | code `visitor-executor.ts:83`, `:89`, `:119`, `:126` | With the policy type made generic, "no policy" is tested three ways (`!policy`, `!== null`, `!= null`). A falsy but valid policy would be advertised (`:89`) and then denied (`:126`): fail-closed, so low. **Add to the sheet (B5):** "no policy" means exactly `null`, tested the same way at all four places. Folded into B1-F9 housekeeping; not a new numbered finding. |
| B2 (sheet) | code `same-origin.ts:30` | `!origin || !host` treats an empty header as absent; both mean "refuse". Sound. With the new required `expectedOrigin`, an empty value must refuse — it is in F1's test list. |
| B3 (sheet) | code `local-owner-signin.ts:41`; sheet `:46` | **finding B3-F6** (new, low). |
| C (rest) | not applicable (configuration only) | — |

**Class 2 — a cache, or a control, keyed on something that used to be constant.**

| Item | Where I looked | Result |
|---|---|---|
| A1 | `bound-confirmations.ts:81-84`, `:109` | The limits are fixed when the instance is built and the counters are keyed by run and quota key, both per request. The expiry is captured once per prompt (`:109`) from the exchange, which owns it. Sound. |
| A3 | `pinned-capability.ts:59` | `owned` is computed once at construction; it can only go from "handoff only" to "has a capability", and both are `true`. Sound. |
| B1 (sheet) | code `visitor-tool-budgets.ts:31` | **finding B1-F10** (judge's). Also checked `visitor-executor.ts:119`: "ask" is read once per turn from the initial policy — that is the documented rule B5, re-checked per call at `:129`. Sound. |
| B2 (sheet) | `public-page-security-headers.ts:50`, `:75-76` | The header set is frozen and rebuilt per call; nothing is cached across requests in the moved code. Sound. |
| B3 (sheet) | no cache in the moved code | — |
| C (rest) | Tovu `.npmrc`, `package.json:11-13` | **finding C-F4** (new, low): the control assumes an npm version nothing pins. Verdict changed to "safe with fixes". |

**Class 3 — an accessor that returns the live internal object (and its mirror: keeping the caller's live object).**

| Item | Where I looked | Result |
|---|---|---|
| A1 | `bound-confirmations.ts:109`, `:201-211` | The gate exposes no internal object. The held owner is the caller's object — **finding A1-F6** (new, low). The input is safe against later change because its digest is taken at prompt time (`:182`) and re-taken at use (`:186`). |
| A3 | `pinned-capability.ts:61` | **A3-F1, fact 2** (judge's). `:65` copies the delivered object, so the caller of `accept` holds no alias; `:53` keeps an object the runtime itself built. |
| B1 (sheet) | code `visitor-executor.ts:172`, `:184` | **finding B1-F12** (new, medium). |
| B2 (sheet) | `public-page-security-headers.ts:76` | Returns a new object, or the caller's own unchanged one. Sound. |
| B3 (sheet) | sheet `:50` | `assertLoopbackHttpUrl` returns a freshly parsed URL. Sound. |

**Verdicts after this pass.** A1: safe with fixes (unchanged; two more findings). A3: safe with fixes
for the Jini half (unchanged; F1 widened). B2: safe with fixes (unchanged; F1 decided). B3: safe with
fixes, highest severity raised from low to medium. C (rest): **safe → safe with fixes**. A2, B1 and C
were already "unsafe" and stay so; B1 gains a second high.

---

## Judge response

Judge: Codex gpt-6.1-sol, high (security + red-team), file `CODEX-JUDGE.md` in this folder, written
against revision 1 at `8f0d1c6e`. Every row below was checked by me against the code at the commits
named at the top of this file before I accepted or rebutted it.

| # | Judge finding | My check | Outcome | Where it is fixed |
|---|---|---|---|---|
| 1 (major) | A1 misses an owner-check bypass from generalising the owner type | Jini `af6779fb:packages/daemon/src/bound-confirmations.ts:128` tests `held.owner` for truthiness; `:15-20` puts no bound on the owner type; the Jini test uses an object owner only (`bound-confirmations.test.ts:7`). Tovu's own owners are objects, so Tovu is not exposed. | **Accepted.** Severity medium (the single-use bearer still stands; one owner value loses the second factor; latent in the published API, not reachable through Tovu). | New **A1-F5**; gate row corrected; test table corrected; must-fix before the Jini half is published. |
| 2 (major) | A06 makes budget windows configurable without cache invalidation | Sheet `:74`, `:110`, `:132`; code `visitor-tool-budgets.ts:31` reuses the limiter on equal `max` only; windows are literals at `:42`, `:44` today. | **Accepted.** Medium. | New **B1-F10** with the preferred fix (windows fixed at construction) and the fake-clock test. |
| 3 (major) | A06 migration does not connect the new host binding to the executor | `capability-registry.ts:171` passes ports in the second argument; sheet S3 (`:142-145`) repoints the import only, never rewrites the call, and removes `visitor-execution-ports.ts` while `visitor-confirmation-gate.ts:68`, `:76`, `:80` still read three host-only members. | **Accepted, and rated high**: one of the two possible outcomes is a silent switch to rollback mode (no policy, cap, budget or audit). I add that `visitor-tools.integration.test.ts:46-64` would catch that outcome, from reading. | New **B1-F11**; new gate row. |
| 4 (major) | B3's "sufficient" tests lose Tovu's hostname admission coverage | `local-owner-signin.unit.test.ts:17-29` call the function the sheet deletes (`:79`); `:73-78` passes whether or not bootstrap is attempted because its fake throws and the code swallows it (`local-owner-signin.ts:25`, `:41`). | **Accepted.** Medium. My "sufficient" was wrong, and two of the three tests I listed as staying do not stay. | New **B3-F5**; "Tests" paragraph rewritten; gate row corrected; B3 highest severity low → medium. |
| 5 (major) | The review omits concrete owner-rule violations | Four sub-claims, checked one by one: | **Accepted in part.** | New section "Owner-rule acceptance checks". |
| 5a | A03 factories are 55 and 52 lines, over the 50-line limit | The rule and the lint setting do not count blank lines or comments (`COMMON.md:27`; Jini `eslint.config.mjs:74`). Counted that way: **48 and 43**. | **Rebutted** with the measurement. Accepted as a note: 2 lines of headroom. | Table row 1. |
| 5b | A37 adds a forwarding export to an existing barrel | True as a fact (`hosted/index.ts:14`); A03 does the same at `surface-exchanges.ts:66`, which the judge did not list. No written rule forbids an entry file (`COMMON.md:21`, `:33`, `:35`). | **Partly rebutted**: fact accepted, "violation" not shown. Raised as an owner question. | Table last row + the owner question. |
| 5c | A06 and A51 propose new forwarding `index.ts` files | Sheet A06 `:122`, `:132`; sheet A51 `:57`. Same analysis as 5b. | **Partly rebutted**, same owner question. | Same. |
| 5d | A06 puts three required tables in "options" | Sheet `:138` against rule 10 (`COMMON.md:26`). | **Accepted.** | New **B1-F13**. |
| 6 (minor) | Saved-keys test inventory is wrong | Both suites exist and do what the judge says (`site-share-password.integration.test.ts:26-48`, `site-share-password-handler.test.ts:39-75`). | **Accepted.** My search missed them. | B2-F1 test list; "Not verified in part B"; `INDEX.md`. |
| 7 (minor) | A3's "immutable pin" overlooks a live mutable alias | `pinned-capability.ts:61` returns the held object; `readonly` is compile-time only; tests compare values (`:18`, `:31`). | **Accepted.** Stays medium inside F1. | **A3-F1** widened (fact 2), gate row corrected, new test row. |
| 8 (minor) | B2's wildcard fix over-narrows other origin classes | Evaluated the predicate expression: it accepts address-literal hosts, a trailing dot and explicit ports today; my proposed grammar would have refused the first two. | **Accepted.** | **B2-F3** fix narrowed to the wildcard character only, with two "still accepted" pins. I applied the same correction to B2-F2, which had the same fault. |

The judge's spot-check of 21 rows marked two as incomplete (findings 1 and 7) and one inventory as
incorrect (finding 6); all three are fixed above. Its remark on the highs — that A2-F1 and B1-F1 are
independently supported, and that C-F1 and C-F2 are supported on the integration code but could not be
checked against the cloud commit — needs no change: I read the cloud commit (`2bf74b9f`) directly in
revision 1 and the lines cited in item C are from it.

**Owner decision applied in this revision:** B2-F1 / audit row A50 — full-origin comparison. See B2.

**What the judge could not check and I could:** Tovu `022e1d5b`, the cloud branches and the sheets
were all readable here. **What neither of us did:** run any test, lint or type-check.
