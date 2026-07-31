# Contract: Error Reporting & Failure Handling

- Status: ACTIVE (adopted 2026-07-31)
- Applies to: Tovu (`src/`, `apps/admin/`) **and** Jini packages consumed by Tovu
  (`@jini-ai/*`), including all port adapters that bridge the two.
- Origin: a real defect. A model-discovery adapter was written as
  `} catch { return []; }`, which made "the request failed" indistinguishable from
  "this provider has no models." Caught in review, not by tests. This contract exists so
  that class of bug is a rule violation rather than a judgement call.

---

## 0. The one-line rule

**A failure must never be silently converted into a value that a success could also
produce.**

Everything below is an elaboration of that sentence.

---

## 1. The three legal responses to a caught error

When you `catch`, you must be doing exactly one of these, and it must be obvious which:

| Response | When | Requirement |
|---|---|---|
| **Surface** | The operator can act on it, or needs to know it happened | Put it in state something renders. Not `console.error`. |
| **Propagate** | The caller is better placed to decide | Rethrow, or don't catch at all. |
| **Absorb** | The "failure" is actually a **named, expected state** | Requires a comment naming that state. |

**Absorb is the narrow one.** It is legitimate for e.g. "no stored config yet on first
run" — absence is a real cold-start state, not a failure. It is *not* legitimate for
"the network call didn't work, so return empty."

**Banned justifications for absorbing**, explicitly, because each has already been used
in this codebase to rationalize a bug:

- *"It's just a convenience feature."* Convenience features fail for actionable reasons.
- *"The user can just retry / retype it."* Only if they're told to. Silence means they won't.
- *"It would be noisy."* Noise is a rendering problem, not a reason to discard information.

If you cannot write a one-sentence justification naming the expected state, you may not
absorb.

---

## 2. Distinguish empty from failed

The canonical violation:

```ts
// BANNED
try {
  return await port.listModels(config);
} catch {
  return [];                    // indistinguishable from a real empty result
}
```

If a caller cannot tell these apart, the signature is wrong. Fix the type, not the catch.

Same rule applies to: `null` on failure where `null` is also a valid value, `0` on
failure where `0` is meaningful, and `false` on failure where `false` is a real answer.

---

## 3. The layer paradigm

One direction of travel. Do not mix idioms within a layer.

```
Port / adapter  →  rejects (or returns a domain-outcome union)
      ↓
Hook / service  →  catches, converts to explicit state
      ↓
Component / route → renders that state
```

### 3.1 Ports reject; they do not return sentinels

A port method that fails **rejects**. It does not return `[]`, `null`, or a bare
`false` to mean "it broke."

The one exception — and it is a real distinction, not a loophole: when *failure is a
domain outcome the caller specifically asked about*. A credential check is the clear
case:

```ts
// A reachable endpoint that REJECTS the credentials is a successful test with a
// negative answer — that is the question being asked. Return it as a value.
testConnection(config): Promise<{ ok: boolean; message?: string }>;
// But a DNS failure, timeout, or malformed base URL is not an answer to that
// question — it is the test itself failing. Reject.
```

If you use this exception, document both branches on the method, as above.

### 3.2 Hooks convert rejections into explicit state

Never let a rejection vanish inside a hook. Model it:

```ts
export type AsyncOutcome<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; value: T }
  | { status: 'error'; message: string };
```

Prefer reusing an existing union in the same feature (`ConnectionTestState`,
`AgentScanState`) over introducing a parallel shape. Consistency beats novelty here.

**Non-blocking ≠ silent.** A failure that shouldn't stop the user still gets reported.
Degrade the *capability*, never the *reporting*: if model discovery fails, keep the field
usable with static suggestions **and** show the error.

### 3.3 Components render it

Every `{ status: 'error' }` a hook can produce must have a rendering path. An error state
no component reads is the same as swallowing it, with extra steps.

Use `role="alert"` for errors the operator must notice, `role="status"` for passive
updates. Inline near the control that failed; not a global toast for a field-level problem.

---

## 4. Never silently lose user-entered data

Writing user input — a key, a draft, a form value — to any store (`localStorage`, a DB,
an API) **must** report failure. A quota-exceeded or permission-denied write that looks
identical to success is always a bug, no exceptions, regardless of how unlikely.

---

## 5. Error messages must be actionable

An error the operator can't act on is only marginally better than silence.

- Say what was attempted and why it failed: *"Couldn't reach https://api.example.com —
  connection timed out"* beats *"Request failed."*
- Preserve the cause. `error instanceof Error ? error.message : String(error)` is the
  floor, not the ceiling — keep status codes and response bodies where you have them.
- Never interpolate a secret into a message. Redact keys and tokens.

---

## 6. `console.error` is not error reporting

Logging is for diagnostics, not for informing the operator. A `catch` whose only body is
a log has still swallowed the error as far as the user is concerned. Log **and** surface,
or don't call it handled.

---

## 7. Review checklist

Use this on any diff touching IO, adapters, or ports. Each line is a defect if it fails.

- [ ] Every `catch` Surfaces, Propagates, or Absorbs-with-a-named-state.
- [ ] No `catch {}` / `catch (e) {}` with an empty or fallback-only body lacking justification.
- [ ] No failure path returns a value a success could also return (§2).
- [ ] Every port method that can fail either rejects or documents its domain-outcome union (§3.1).
- [ ] Every hook error state has a component that renders it (§3.3).
- [ ] Every write of user-entered data reports failure (§4).
- [ ] Messages name the attempted operation and the cause; no secrets interpolated (§5).
- [ ] No `catch` whose only action is logging (§6).
- [ ] Tests cover the failure path, not just the happy path — specifically that a failure
      is *distinguishable* from an empty success.

---

## 8. Enforcement

Currently **review-time**, via §7. Not yet lint-enforced.

Candidate automation, in rough order of value-per-effort:

1. An ESLint rule banning empty `catch` blocks (`no-empty` with `allowEmptyCatch: false`)
   plus a custom rule flagging `catch` bodies whose only statement is a `return` of an
   empty literal.
2. A `scripts/guard.ts`-style grep in CI for `catch {` and `.catch(() =>` in
   adapter/port directories, requiring an adjacent justification comment.

Until then this contract is what a reviewer checks against, and what a delegated agent is
handed alongside the task.
