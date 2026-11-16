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
| Bearer answers only for the exact pinned URL | Tovu `:47-50` | `pinned-capability.ts:63` | yes |
| First capability is immutable; same value may be re-delivered | Tovu `:51-56` | `:65-70` | yes |
| Handoff token shape (64 hex) or dropped | Tovu `:42` | `:44`, `:58` (fixed in Jini) | yes |
| Keys removed from the environment object | Tovu `:43` | `:59` | yes, see F2 |
| Real process environment scrubbed | Tovu `startup-secrets.ts:18-23` (token + handoff) and `desktop-mcp-runtime.ts:75` (URL) | **not in Jini** | **Tovu must keep** |
| Handoff token minted per main, 32 random bytes, never stored | Tovu `desktop-mcp-http.ts:35` | host-supplied | **Tovu must keep** |
| Delivery only to a loopback admin URL, fixed path | Tovu `desktop-mcp-http.ts:56` | host-supplied `endpoint` | **Tovu must keep** |
| Delivery never follows redirects; 5 s timeout; cancellable | Tovu `:67-69` | `:102-105` | yes |
| Receiving route: browser origin refused, loopback peer, timing-safe bearer, refused when no token is configured, 1 KiB body, shape check, pin check | Tovu `desktop-mcp-handoff.ts:15-27`; Jini `packages/daemon/src/http/tool-execution-routes.ts:69-79` | not touched | yes |
| Receiving route runs before the public JSON parser | Tovu `app.ts:2005-2006` (internal router mounted first) | not touched | yes |
| Connection handed to the tool layer carries the URL only, never the token | Tovu `desktop-mcp-runtime.ts:57-63` (`headers: {}`) | — | **Tovu must keep** |
| Bearer is attached by the HTTP adapter for the configured URL only, redirects refused | Jini `packages/mcp/src/federation/adapter.http.ts:336`, `:502` | not touched | yes |

### Findings

**A3-F1 — medium — a new accessor hands out the raw token without the endpoint check.**
- Class: token scope widened by API shape.
- Location: Jini `pinned-capability.ts:29` (interface) and `:64` (`capability()`).
- Fact: the Tovu runtime exposes the token only through `bearerToken({ url })`, which checks the exact
  URL. The Jini runtime adds `capability()`, which returns `{ url, token }` to any caller in the
  process. The file's own header says the supplier "answers only for the exact pinned endpoint"; this
  accessor is a second way to the same secret with no such check, and it returns a plain object that is
  easy to log or serialise by accident. Tovu only needs the URL from it (to build `connection()`).
- Fix: replace `capability()` with an accessor that returns the pinned URL only (for example
  `endpointUrl()`); keep the token reachable only through `bearerToken`. Must-fix before the Jini API
  is published, because narrowing it later is a breaking change.
- Regression test: a type-level and runtime test that no member of the runtime other than
  `bearerToken` and `handoffToken` returns a 64-hex token — **missing**.

**A3-F2 — medium — the "scrubbed before any child can inherit" promise depends on what the host passes.**
- Class: security property stated by the port but only true for one binding.
- Location: Jini `pinned-capability.ts:35-36` (doc) and `:59`; Tovu `desktop-mcp-runtime.ts:74-75`,
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
  before the host resolves or during a POST. Removing `redirect: "error"` at `:102`, or the abort
  check at `:100`, leaves all five tests green. Tovu's desktop tests do not assert the redirect mode
  either (no match for `redirect` in `desktop-mcp-http*.test.ts`).
- Fix: add four cases with a fake `fetch`: (1) `init.redirect === "error"`; (2) the signal aborts on
  `disconnect` during a POST; (3) `disconnect` before the host resolves subscribes nothing; (4) the
  timeout aborts a hung POST. Each fails when its line is removed.
- Also missing: malformed URL or token values are still deleted from the environment object (a mutant
  that scrubs only valid values survives test 1); a handoff-only runtime gives no bearer before
  `accept` and the right bearer after.

**A3-F4 — low — failures are reported with no cause.**
- Class: swallowed error (owner practice).
- Location: Jini `pinned-capability.ts:88` (`onUnavailable` takes no error), `:108` (`catch` drops it),
  `:106` (fixed message, HTTP status dropped).
- Fact: this copies the Tovu behaviour, but it now fixes it into a port signature, so no host can log
  a redacted cause even if it wants to.
- Fix: pass `{ error }` to `onUnavailable` and include the HTTP status in the delivery error. The
  handoff token and capability token must never appear; the host words and redacts.

**A3-F5 — low — the handoff token format is fixed in the engine while everything else is host policy.**
- Location: Jini `pinned-capability.ts:44`.
- Fact: a host that mints a different format gets `handoffToken: undefined` and `owned: false` with no
  signal. It fails closed, so this is not exploitable; it is a silent behaviour trap.
- Fix: take the handoff predicate from the host like `isCapability`, or document the fixed format.

**A3-F6 — low — `accept` copies every enumerable property of the delivered object.**
- Location: Jini `pinned-capability.ts:68` (`{ ...input }`), same as Tovu `:54`.
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
| `process.env` holds none of the three names after first use | **missing** (F2) |
| Receiving route: origin, non-loopback peer, wrong bearer, no token configured, oversized body, second different capability → refused | not checked in this review (route is unchanged); confirm before the Tovu half merges |

### Not verified

- I could not read the Tovu half: `13400b01` exists only in the executor's container. Everything
  under "What the Tovu half must do" is derived from today's Tovu code, not from that commit.
- No test was run. The executor reports Jini 5/5 and hosted 12/12.
- I did not check Tovu-Runner or Zana for a second consumer of this module.
