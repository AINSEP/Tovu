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
| Bearer answers only for the exact pinned URL | Tovu `:47-50` | `pinned-capability.ts:60` | yes |
| First capability is immutable; same value may be re-delivered | Tovu `:51-56` | `:62-67` | yes |
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

**A3-F1 — medium — a new accessor hands out the raw token without the endpoint check.**
- Class: token scope widened by API shape.
- Location: Jini `pinned-capability.ts:28` (interface) and `:61` (`capability()`).
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
| Rate limit: per-address first, then per-site, serialised, ceiling change keeps counts (`visitor-tool-budgets.ts:39-53`) | B11 | yes, see F5, F6 |
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
- A06 must also carry forward the A1 fixes (escaped bidi class, Jini gate tests) or it will copy the
  gaps.

#### Tests

The sheet's S1 list is good and mostly mutation-proof by construction (it asserts handler call counts
and audit content, not internals). Missing cases are named in F1–F8. Tovu keeps
`visitor-executor.unit`, `visitor-executor-confirmation.unit`, `visitor-page-confirmation.unit` and
`visitor-tools.integration` as tests of the binding — that is the right call and must not be weakened.

### B2 — `split-a50-web-security-predicates.md` (CSP declared hosts + same-origin write check → Jini)

**Verdict: safe with fixes.** Highest severity: **medium**. The move keeps both call sites and their
surrounding gates; the problems are a self-contradicting test, a name that promises more than the
function does, and a weakness that becomes more important once the helper is shared.

#### Does the plan keep each gate?

| Gate | Where today | In the sheet | Kept? |
|---|---|---|---|
| Write refused unless `Origin` is a bare http(s) origin whose host equals `Host`, and fetch metadata (if sent) is same-origin | `features/agent-plugins/admin-surfaces/same-origin.ts:14-33` | moved byte-identical, renamed | yes |
| Admin-surface writes: CSRF check, then session-credential-only check | `admin-surfaces.ts:71-77` | call renamed only | yes |
| Saved-keys reveal: workspace, session credential, owner identity, CSRF check, **plus scheme equality** | `site-share-password.ts:20-24` | call renamed, line 24 kept | yes |
| Declared hosts cannot add policy syntax | `contracts/core/public-page-security-headers.ts:64-85` | moved | yes, see F2, F3 |
| Rate limit, session rotation, token scope, audit | not in these files | — | not affected |

#### Findings

**B2-F1 — medium — the moved function is named "same-origin" but compares host and port only.**
- Class: security contract over-stated by its name; a weakness pinned as intended.
- Location: code `same-origin.ts:17`, `:32`; sheet finding 4 and S1 test "an `http:` vs `https:` origin
  with the same host ACCEPTED".
- Fact: the scheme of `Origin` is not compared with the scheme the server is serving. One caller adds
  its own scheme check (`site-share-password.ts:24`); the other (`admin-surfaces.ts:72`) does not. The
  sheet proposes to export this to every Jini host as `isSameOriginBrowserWrite` and to add a test that
  pins the cross-scheme case as accepted. Modern browsers' fetch metadata and schemeful cookies cover
  most of the gap, which is why this is not higher, but a shared primitive must do what its name says.
- Fix (owner decision needed before execution, as the sheet itself asks): make the Jini function take
  the expected scheme (or the full expected origin from the host's origin registry) as a **required**
  input and compare the whole origin; Tovu `admin-surfaces.ts` then gains the scheme check that
  `site-share-password.ts` already has — a tightening that needs a changeset line. If the owner wants
  no behaviour change now, name it for what it is (same host) and say so in the doc; do not ship the
  "same-origin" name with a host-only body.
- Tests: route-level guard for admin surfaces **exists**
  (`agent-plugin-admin-surfaces.security.integration.test.ts:129`, asserts the refusal code; it fails
  if the gate call is removed). I did **not** find a route-level test for the saved-keys path (only
  `features/site-backup/__tests__/saved-keys-quality.test.ts` references it) — confirm one exists that
  fails when line 23-24 is removed, or add it, because the unit test file is deleted from Tovu.

**B2-F2 — medium — a new "tests first" case contradicts "bodies move byte-identical".**
- Location: sheet S1 step 1 ("an `http:` host in `script` … dropped") versus code
  `public-page-security-headers.ts:83` (accepts `http:` and `https:`), and the type doc at `:13`
  ("Exact https origins").
- Fact: with the body moved unchanged, an `http:` origin is **not** dropped, so that test is red
  forever. The executor must then either change the predicate (unreviewed behaviour change), delete
  the assertion, or stop. The sheet's STOP list does not cover it.
- Fix: decide it in the sheet. Recommended: drop `http:` for `script` and `connect` (keep it only where
  a real need is shown), state it as a behaviour change, and keep the test.

**B2-F3 — medium (low today) — wildcard-shaped hosts pass the "exact origin" check.**
- Class: allow-list entry that is policy syntax.
- Location: code `public-page-security-headers.ts:80-85` (`isDeclaredFrameOrigin`), used at `:44`, `:69`.
- Fact: the check is "parses as a URL, http(s), and equals its own origin". A host made of or
  containing the wildcard character satisfies that, and in a content security policy such a source is
  a wildcard, not one host. So "a declaration can never become policy syntax" (`:60-61`) is not fully
  true. Today the policy is report-only (`:53`), so the effect is limited to reporting; once this is a
  shared Jini helper another host may enforce the policy with it.
- Fix: in the moved `isDeclaredOrigin`, accept only hosts whose labels are letters, digits and hyphens
  (plus an optional port), and reject a trailing dot. Add the case to the S1 injection list — it is
  **missing** there.

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
values, directive prefix). Add: wildcard host (F3), scheme decision (F1, F2). In Tovu keep one test per
call site that fails when the gate call is deleted (see F1).

### B3 — `split-a51-session-bootstrap.md` (initial-session read, probe-then-redeem, loopback guard → Jini)

**Verdict: safe with fixes.** Highest severity: **low**. This is the best of the three sheets: the
decisions move, the transports and every credential-bearing request stay in Tovu, and each auth rule
is tied to a named test.

#### Does the plan keep each gate?

| Gate | Where today | In the sheet | Kept? |
|---|---|---|---|
| Bootstrap only from an admitted local hostname | `apps/admin/src/lib/local-owner-signin.ts:9-11`, `:21` | host-supplied `admit`, required | yes |
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

#### Tests

Named in the sheet and sufficient for the moved decisions; each fails when its rule is removed
(call-count and call-order assertions with fakes). Tovu's `desktop-auth.test.ts`,
`desktop-auth-streams.test.ts` and `local-owner-signin.unit.test.ts:31,40,73` stay as binding tests.
Add the cases in F1 and F4.

### Not verified in part B

- I did not run any of the listed Tovu tests, and did not re-run the sheets' census commands.
- For A51 I did not read the server routes that mint, rotate and end sessions; the sheet does not touch
  them, so their correctness is outside this item.
- For A50 I did not find or read a route-level test for the saved-keys reveal path.
- For A06 I did not read `capability-registry.ts` or the composition beyond the lines cited.

---

## C — cloud/small-fixes-2026-11-15: the MCP consent gap and the `mcpIsolation` claim

**Verdict: unsafe - do not merge** Jini `10605caf` ("Claude def declares mcpIsolation so planRun skips
MCP consent"). Highest severity: **high**. The other commits on the two branches are dependency
hygiene and are **safe** (notes at the end).

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
   file as skipping the CLI's own project-trust prompt (`shared.ts:45-47`). The flag isolates nothing
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

### The other commits on these branches (briefly)

- Tovu `51133f44` → `939ee65d` (mail library pinned to a release older than 14 days), `52ac8c1b`
  (`.npmrc` minimum release age); Jini `eff5c025`, `1a1a4d43` (same for pnpm). **Safe.** One low note:
  both age gates exempt the first-party `@jini-ai/*` scope, and the executor could not confirm the
  exemption pattern matches. Confirm it, and note that a compromised first-party publish is by design
  not delayed by this gate.
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
  string or there is no run store (`:231`); it passes the supplied principal into the lookup (`:232`)
  and answers 403 when the lookup returns nothing (`:233`).
- Only **after** that does it replace the request's principal with the stored id, keeping only a
  `read-only` tool-access narrowing from the caller (`:234`). Every other caller-supplied principal
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
  (`assistant-tool-exec.ts:211-215`).

(The judge cites `:233`, `:234`, `:235`; on my read the three statements are at `:232`, `:233`, `:234`.
Same code, one line off.)

### D2 — the Tovu blanket body parser gate (judge finding 2): **confirmed**

- The daemon-side app installs one unscoped JSON parser at
  `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:1407` (6 MB), after the bearer gate.
- A second credential check for delegated tool calls is registered **after** that parser, at `:1433`,
  with `validateDelegatedRunId: true`.
- That check reads the parsed body: Jini `packages/daemon/src/http/run-credentials.ts:30` passes
  `req.body` to the authorizer only in this mode, and `packages/daemon/src/run-credentials.ts:153-155`
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
