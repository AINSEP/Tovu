# Jini errors: the owner's error rule applied to a library

Status 2026-11-13 (rev 2, after the Sol review `review-d5.md`): design + worked examples on Jini
clone `jini-terra-d5` branch `design-d5` (DR/CN owner c88af7d03 + 76447baa5; L c9a3383a7; U 4717ae478,
bf4043fce, c55eec038). Terra prompt: `jini-errors.terra-prompt.md`, two parts: **Part A** Jini (293 audit
sites + CN route packs + 5 sites the audit missed), **Part B** Tovu (T1-T6 host wiring, run after the
Jini release + Tovu bump). Tovu counterpart: `user-facing-errors.md` (branch w3-dc). Survey:
owner-rules-audit.mjs on design-d5 = the same 293 sites as the 11-11 survey.

## 1. Rule (same as Tovu)
Plain words (what failed + what to do) + Copy details (error ID, step, redacted cause, versions,
time); the incident is logged redacted under the same ID; never a catch-all that drops the cause;
never a generic "an internal error occurred"; never log secrets/tokens/cookies/bodies. Not an
incident: invalid input / untrusted payload parse (never attach or log the parse error with its
message: it quotes the input), expected refusals (not found, permission, browser storage/clipboard
refusals, bad webhook signature).

## 2. Why Jini differs
Jini is a library. It does not own the user's screen, the incident store or the host's token
shapes: the HOST does. So a Jini site either hands the real error to the host (typed throw with
`cause`, an injected sink/port) or, when nobody receives it, logs it redacted with Jini's default
policy. Jini never mints a UI incident for a failure the host's port already reports. The host
redacts its own token shapes in the sinks it injects and at its process log boundary (Part B).

## 3. Mechanism per surface
| Surface | Mechanism | Variant |
|---|---|---|
| Library function that throws | typed error + `{ cause: error }`; classes take it object-first `(required, { cause } = {})` | R |
| Same, cause may carry a secret (oauth upstream, sealer, login-shell env, URL with a key) | `{ cause: new Error(describeErrorForLog({ err: error })) }` (class + code only) | RS |
| Library function that returns a result | keep the result text exactly; one log line with `formatErrorForLog` before returning | RES |
| Same, the error can quote untrusted input or a secret (manifest parser, launch config, payment call) | log `describeErrorForLog` instead | RES-LS |
| Best-effort step nobody sees | existing `warn`/`log` port, else `console.warn`, with `formatErrorForLog({ error })`; retry loops keep an optional port optional (no default console flood) | L |
| Same on a secret path | `describeErrorForLog({ err: error })` | LS |
| HTTP route, unexpected failure | ONE owner, `reportRouteInternalError({ report, logSource, message }, { onInternalError })` in `@jini-ai/http-kit`: host sink (or the redacted default line, which also logs a failing sink) gets the error + request ID; caller gets operation-specific `message` + `requestId` | DR |
| Every existing route pack with its own sink copy (runs, attachments, attachment lookup, media, terminals, db-ops, connectors, remote-run-events, research, xai, delegated-tools, model-proxy, frontend-sessions, http-kit adapter) | consolidated onto the same owner, keeping each pack's context type, `onInternalError` dep and why-comments; no `"an internal error occurred"` left | CN |
| Jini admin controller, failed host API call | `describeApiError({ e, fallback })`: only an `AdminApiError`'s words reach the screen (the host port already reported it); anything else shows the fallback and logs class/code only | U |
| Queued/polled work whose rejection nobody receives (composer history writes, durable-run checkpoint reads) | report through the module's channel once per failure streak; queue/poll keeps running | Q |
| Jini UI hook (ui/chat), failed host API call | no change: the host port owns the incident | VH |
| Visitor-facing self-contained bundle | worker: `crypto.randomUUID()` reference + `error.name` in the log; browser storage/clipboard: refusal text only | P / V |
| Intentional drop | no behaviour change; a why-comment INSIDE the handler | C-* |
| Route response consumers | flat `{ error: string, requestId }` kept on the wire; consumers decode with `@jini-ai/protocol` `decodeApiError` and show `message (request ID x)` | S1 consumer, T4 |

## 4. Counts (293 audit sites on design-d5)
V 56 + VH 3 no change; C 145 comment-only (cleanup 47, optional 26, observed 25, drain 14, queue 16,
report 13, wait 4); L 35, LS 6, RES 10, RES-LS 5, R 5, RS 6, U 8, S 3, P 1, Q 4; DONE 6. Extra: 14 CN
route packs, 2 wording rows, 5 missed sites (mcp http-tool-server.adapter 68/212/236, memory
llm-provider 242/249).

## 5. Review findings (review-d5) and how rev 2 resolves them
1. Host token shapes reached logs. Evidence: Tovu's website server and daemon already redact their
   whole console with Tovu's policy (`installServerLogCapture`, console tee); child output is framed
   and redacted. Real gaps: Electron main has no tee and runs Jini code; no Tovu sink is injected
   anywhere; commerce's warn default. Fix = Part B: T1 one Tovu sink wired at every Jini sink
   (11 places), T2 commerce default, T3 a redacting console in Electron main, T4/T5 tests with the real
   bare-key shape. Sink failure: the shared owner catches a throwing host sink and logs both through
   the redacted default (which the process tee then redacts with host policy).
2. Parse input exposed: identity read split from parse (read keeps its cause, parse has none);
   contribution parser failure logged as RES-LS.
3. Consumers: S1 keeps the flat string + `requestId`; the chat caller decodes with `decodeApiError`
   (never `[object Object]`); Tovu's site-catalog read keeps the site's words + request ID (T4).
4. The four comment-only Q sites now report once per failure streak (Q1 composer, Q2 checkpoint reads).
5. Dependencies declared: cookie-consent (runtime core), provider-plugins (dev core, bundled), chat
   (protocol becomes a dependency). memory keeps zero runtime deps: its RS site uses an inline
   class-name cause.
6. Prerequisite: `describeErrorForLog` hardening (Jini ad856dba3, on `refactor/terra`) is precondition
   P1; Part A runs on `refactor/terra` + design-d5.
7. Parallel owners: consolidated (CN). `run-lifecycle.ts` stays separate (not a route; it already
   contains a throwing sink).
8. U showed arbitrary messages: fixed in c55eec038 (only `AdminApiError` words).
9. Test assertions per variant (table in the prompt).
10. Positional APIs: `PluginInstallError`, `ExternalMcpSecretStoreUnconfiguredError` object-first;
    `RenderServiceError` gains an optional `{ cause }`; the local `fail(code, message)` helpers keep
    their private signature (no 36-call churn).

Other findings while designing:
- The audit misses method-form handlers (`.catch(() => { warn("fixed") })`); Terra searches every
  touched file for them and lists the extras.
- Main Jini checkout's `packages/core/dist` is stale; local tests resolve core to source with an
  untracked per-package config. The cloud gate builds core first.

## 6. Owner decisions (defaults applied in the prompt; say if you want otherwise)
- D1 Host token shapes: default = Jini logs use Jini's default redaction; hosts inject sinks and
  redact their process console (Part B). Alternative: a host-registered pattern list in core
  (global state; not recommended).
- D2 Comment-only for the 145 intentional drops (vs. teaching the audit to accept them).
- D3 Visitor browser bundles (cookie-consent client, commerce/browser): no console logging, no core import.
- D4 Jini UI local failures (clipboard): inline refusal text only (vs. an optional `reportFailure` port).
- D5 chat `persistUserTurn` failure: L log only. Should the user see it? Needs a chat UI notice (separate design).
- **D6 (new) chat takes `@jini-ai/protocol` as a hard dependency** (today an optional peer) so the
  frontend-request caller can decode errors. Alternative: a local 10-line decoder in chat (duplicates protocol).
- **D7 (new) `PluginInstallError` becomes object-first** `({ code, message }, { cause })`: breaking
  change for hosts; ~17 Tovu callers (5 source, 12 tests) move in Part B T6. Alternative: keep the
  positional `(code, message)` and add a third `{ cause }` arg (breaks the API-args rule, no host churn).
  Same question, smaller: `ExternalMcpSecretStoreUnconfiguredError` (3 Jini callers, 4 Tovu tests).

## 7. Sequence
1. P1 base: branch from Jini `refactor/terra` (has the hardening) with design-d5 merged.
2. Part A on Codex Terra (Jini). One reviewer. Commit. Cloud gate (below).
3. Jini release; Tovu bumps `@jini-ai/*`.
4. Part B on Codex Terra (Tovu). One reviewer. Commit. Cloud gate.

Cloud gate (nothing ran locally): http-kit `internal-error.test.ts`, `index.test.ts`; daemon
`tool-execution-rpc.test.ts`; admin `core/__tests__/transport.test.ts`, `media/__tests__/controllers.test.ts`;
`scripts/check-package-layers.ts` (admin core peer, chat protocol dep); no-emit tsc of every touched
Jini package (the `reportRouteInternalError` generic inference is unverified); then every test file
Terra touched in Part A and Part B.
