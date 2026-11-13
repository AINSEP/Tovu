# Jini errors: the owner's error rule applied to a library

Status 2026-11-13: design + 3 worked examples on Jini clone `jini-terra-d5` branch `design-d5`
(commits 1d14bb8a2 DR, c9a3383a7 L, 4717ae478 U). Terra prompt: `jini-errors.terra-prompt.md`
(READY, 287 sites to classify-and-fix, every one listed with its variant). Tovu counterpart:
`user-facing-errors.md` (branch w3-dc). Survey: owner-rules-audit.mjs on design-d5 gives the same
293 sites as the 11-11 survey (180 swallowed-error, 113 generic-error-catch).

## 1. Rule (same as Tovu)
Plain words (what failed + what to do) + Copy details (error ID, step, redacted cause, versions,
time); the incident is logged redacted under the same ID; never a catch-all that drops the cause;
never log secrets/tokens/cookies/bodies. Not an incident: invalid input / untrusted payload parse
(never attach the parse error: it quotes the input), expected refusals (not found, permission,
browser storage/clipboard refusals, bad webhook signature).

## 2. Why Jini differs
Jini is a library. It does not own the user's screen or the incident store: the HOST does. So a Jini
site either hands the real error to the host (typed throw with `cause`, an injected sink/port) or,
when nobody receives it, logs it redacted. Jini never mints a UI incident for a failure the host's
port already reports (double Copy-details blocks).

## 3. Mechanism per surface
| Surface | Mechanism | Variant |
|---|---|---|
| Library function that throws | typed error + `{ cause: error }`; widen the class's optional arg to `{ cause?: unknown } = {}` if needed | R |
| Same, cause may carry a secret (why-comment says so: oauth upstream, sealer, login-shell env, signed URLs) | `{ cause: new Error(describeErrorForLog({ err: error })) }` (class + code only) | RS |
| Library function that returns a result (`{ ok:false, reason }`, `providerUnknown`, `failBeforeSpawn`) | keep the result text exactly; add one log line with the cause before returning | RES |
| Best-effort step nobody sees | the module's existing `warn`/`log` port, else `console.warn`, with `formatErrorForLog({ error })` (2nd arg; one-string port: append `` ` Cause: ${...}` ``) | L |
| Same on a secret path | `describeErrorForLog({ err: error })` instead | LS |
| Daemon HTTP route, unexpected failure | `reportRouteInternalError({ source, error, message }, { onInternalError })` (new, `packages/daemon/src/http/internal-error.ts`): host sink or redacted `console.error` gets the error + request ID; caller gets `message` + `requestId` | DR |
| Jini admin controller, failed host API call | `describeApiError({ e: error, fallback: "<same text>" })` (admin `core/transport/errors.ts`). The host's API port publishes the incident; never publish here | U |
| Jini UI hook (ui/chat), failed host API call | no change: the host port owns the incident; inline text stays | VH |
| Visitor-facing self-contained bundle (worker/browser) | worker: `crypto.randomUUID()` reference in the page + `error.name` in the log; browser storage/clipboard: refusal text only | P / V |
| Intentional drop (queue tail, observed elsewhere, best-effort cleanup, stream release, optional read, expected timeout, failure of a report) | no behaviour change; a why-comment INSIDE the handler (`() => { /* why */ }`, `catch { /* why */ }`; keep `return null;`/`return undefined;` when the expression form returned a value) | C-* |
| Tools | model-fixable → `ToolInputError`; server fault → throw with cause, daemon tool-recovery mints `ERR-` ID (exists) | (T: none in this list) |

## 4. Counts (293 audit sites on design-d5)
V 56 + VH 3 no change; C 149 comment-only (cleanup 47, observed 28, optional 26, queue 17,
drain 14, report 13, wait 4); L 35, LS 6, RES 15, R 5, RS 6, U 8, S 3, P 1; DONE 6 (examples).
Code changes: 79 sites; comment-only: 149.

## 5. Findings while designing (all also in the prompt)
- `formatErrorForLog` with default options does NOT redact host-specific token shapes (e.g. a Tovu
  `tovu_ak_…` key passed straight through in the DR test). Jini's defaults cover vendor shapes and
  labeled secrets (`api_key=…`). Hosts must inject sinks/ports that apply their own options
  (Tovu: `TOVU_ERROR_REDACTION_OPTIONS`). Owner decision D1.
- The audit misses method-form handlers that drop the error behind a fixed message
  (`.catch(() => { warn("fixed") })`); found one in settlement-worker.ts and fixed it. Terra fixes
  same-file instances it sees.
- `reportInternalError` + `defaultInternalErrorSink` are copied in daemon `attachments.ts`,
  `runs.ts`, `delegated-tools.ts`, `remote-run-events.ts` (and `db-ops.ts` has the sink type).
  They should move onto `reportRouteInternalError` (dedupe lane, not this prompt).
- `describeErrorForLog` hardening (Jini 501da27d4) is only on `jini-terra-w3-dc` branch w3-dc, NOT on
  design-d5 or Jini main. On design-d5 it reads `constructor.name` unguarded; RS/LS sites are safe
  for ordinary errors. Land 501da27d4 first or with this work.
- Main Jini checkout's `packages/core/dist` is stale (Oct 18: no `formatErrorForLog`, no
  `trimCharsEnd`). Tests that import `@jini-ai/core` through the symlinked node_modules fail unless
  core resolves to source; I used an untracked per-package vitest config / tsconfig `paths` (see
  prompt §0). The cloud gate builds core first, so it is unaffected.

## 6. Owner decisions (defaults applied in the prompt; say if you want otherwise)
- D1 Host token shapes in Jini logs: default = Jini logs use default redaction; hosts inject sinks
  (`onInternalError`, `warn` ports) that apply host options. Alternative: a host-registered pattern
  list in core (global state; not recommended).
- D2 Comment-only for 149 intentional drops vs. changing the audit to accept them: default =
  comments (the why is the documentation; mechanical, zero behaviour change).
- D3 Visitor browser bundles (cookie-consent client, commerce/browser): default = no console
  logging and no `@jini-ai/core` import (bundle size). Alternative: L with `console.warn`.
- D4 Jini UI local failures (clipboard, local code) have no Jini failure channel port; default = inline
  refusal text only (as `use-form-editor` copy). Alternative: an optional `reportFailure` port on
  Jini UI hooks, mirroring Tovu's `publishLocalAdminFailure`.
- D5 `chat` transport `persistUserTurn` failure (the user's message silently not saved): default = L
  log only. Should the user see it? It needs a chat UI notice (separate design).

## 7. Remaining (handoff)
- Run `jini-errors.terra-prompt.md` on Codex Terra; one reviewer; commit; rebuild only after review.
- Type-check (no-emit) of daemon/commerce/admin not run locally (stale core dist); cloud gate.
- Single test files run for the 3 examples only (listed in commits).
