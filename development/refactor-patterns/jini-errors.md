# Jini errors: the owner's error rule applied to a library

Status 2026-11-13 (rev 3, after the re-review `review-d5r.md`): design + worked examples on Jini
clone `jini-terra-d5` branch `design-d5` (DR/CN owner c88af7d03 + 76447baa5; LS c9a3383a7; U 4717ae478,
bf4043fce, c55eec038; metadata-only default e4061b9de red, ef09da3c3 fix, 898ec8a21). Terra prompt: `jini-errors.terra-prompt.md`, two parts: **Part A** Jini (293 audit
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

**Logging default (rev 3): safe metadata only.** A log line or diagnostic cause carries fixed text,
the error's class + constant code (`describeErrorForLog`) and the request/incident ID: never the
error's message, stack, `name` or other fields. Full message + stack (`formatErrorForLog`, "L-full")
is opt-in per row, only where the row shows the thrown error cannot carry untrusted input or a
secret (three operator-run CLI script lines qualify). Why: a caught error's text can quote untrusted
input (a parsed manifest, a request, a tool argument) or a credential no redaction pattern knows
(a bare random listener token). Rev 1 and rev 2 both defaulted to full redacted text and both
reviews found the same class of leak in rows nobody had re-checked; with metadata as the default, a
missed row costs diagnostic detail, not a leak. Detail is not lost: the host sink/port still
receives the original error object, and the request ID joins the log line to what the user copied.
Where `@jini-ai/core` cannot be imported (self-contained bundles, `@jini-ai/memory`) a fixed label
from built-in class checks is used (LB), never the value's own `name`.

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
| Library function that returns a result | keep the result text exactly; one log line with `describeErrorForLog` before returning | RES-LS |
| Best-effort step nobody sees | existing `warn`/`log` port, else `console.warn`, with `describeErrorForLog({ err: error })` | LS |
| Retry loop that fails every few seconds | LS once per failure streak (flag set before reporting, cleared on success), default console when the port is omitted, reporter cannot throw | MR |
| Row proven unable to carry untrusted input or a secret (opt-in, reason in the row) | `formatErrorForLog({ error })` | L-full |
| No core import possible (bundles, memory) | fixed label from built-in class checks, never `.name` | LB |
| HTTP route, unexpected failure | ONE owner, `reportRouteInternalError({ report, logSource, message }, { onInternalError })` in `@jini-ai/http-kit`: host sink gets the error + request ID (else the default line logs class/code + request ID, and also a failing sink's class); caller gets operation-specific `message` + `requestId` | DR |
| Every existing route pack with its own sink copy (runs, attachments, attachment lookup, media, terminals, db-ops, connectors, remote-run-events, research, xai, delegated-tools, model-proxy, frontend-sessions, http-kit adapter) | consolidated onto the same owner, keeping each pack's context type, `onInternalError` dep and why-comments; no `"an internal error occurred"` left | CN |
| Jini admin controller, failed host API call | `describeApiError({ e, fallback })`: only an `AdminApiError`'s words reach the screen (the host port already reported it); anything else shows the fallback and logs class/code only | U |
| Queued/polled work whose rejection nobody receives (composer history writes, durable-run checkpoint reads) | report through the module's channel once per failure streak (flag set before reporting); a throwing reporter is contained; queue/poll keeps running | Q |
| Jini UI hook (ui/chat), failed host API call | no change: the host port owns the incident | VH |
| Visitor-facing self-contained bundle | worker: `crypto.randomUUID()` reference + LB class label in the log; browser storage/clipboard: refusal text only | P / V |
| Intentional drop | no behaviour change; a why-comment INSIDE the handler | C-* |
| Route response consumers | flat `{ error: string, requestId }` kept on the wire; consumers decode with `@jini-ai/protocol` `decodeApiError` and show `message (request ID x)` | S1 consumer, T4 |

## 4. Counts (293 audit sites on design-d5)
V 56 + VH 3 no change; C 145 comment-only (cleanup 47, optional 26, observed 25, drain 14, queue 16,
report 13, wait 4); LS 41, RES-LS 15, R 5, RS 6, U 8, S 3, P 1, Q 4; DONE 6. Rev 3 moved L 35 -> LS
and RES 10 -> RES-LS; L-full in the 293: 0. Extra: 14 CN route packs, 2 wording rows, 5 missed sites
(mcp http-tool-server.adapter 68 LS, 212/236 MR; memory llm-provider 242 RS via LB, 249 R), and 49
existing full-text log lines outside the audit that become LS (prompt section 9b; 3 operator-script
lines stay L-full with their reason, 15 per-pack default lines go with the CN consolidation).

## 5. Review findings (review-d5) and how rev 2 resolves them
1. Host token shapes reached logs. Evidence: Tovu's website server and daemon already redact their
   whole console with Tovu's policy (`installServerLogCapture`, console tee); child output is framed
   and redacted. Real gaps: Electron main has no tee and runs Jini code; no Tovu sink is injected
   anywhere; commerce's warn default. Fix = Part B: T1 one Tovu sink wired at every Jini sink
   (11 places), T2 commerce default, T3 a redacting console in Electron main, T4/T5 tests with the real
   bare-key shape. Sink failure: the shared owner catches a throwing host sink and logs both incidents'
   class/code with the request ID (rev 3: metadata only).
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

Re-review `review-d5r.md` (rev 3). The same class came back (full text logged where it can quote
input or a credential), so rev 3 changes the default instead of patching rows (section 1 above):
1. capability-projection plugin.json: read and parse split; the read logs class/code, the parse
   logs fixed text only.
2. MCP listener/delivery retries: LS once per failure streak, rearmed on success, default console
   when `warn` is omitted, through one reporter that cannot throw (`warn` promises value-free text).
3. memory: fixed labels from built-in class checks (LB), never `.name`; same fix for the forms worker.
4. Q1 sets its streak flag before reporting; Q2 contains a throwing reporter.
5. frontend-control facade's `session` Pick exposes `onInternalError`; Tovu wires both facade callers.
6. `logJiniRouteIncident(required, optional = {})`, metadata only.
7. Red evidence: see section 7; the worked examples are not accepted until the cloud gate records it.
Also: http-kit's default incident line and the settlement worked example now log class/code only
(e4061b9de, ef09da3c3, 898ec8a21); Part B T2 dropped (nothing hands error text to that port now).

Other findings while designing:
- The audit misses method-form handlers (`.catch(() => { warn("fixed") })`); Terra searches every
  touched file for them and lists the extras.
- Main Jini checkout's `packages/core/dist` is stale; local tests resolve core to source with an
  untracked per-package config. The cloud gate builds core first.

## 6. Owner decisions (defaults applied in the prompt; say if you want otherwise)
- D1 Host token shapes: rev 3 default = Jini logs carry no error text at all (class/code + IDs), so
  host shapes cannot reach them; hosts inject sinks (which receive the error object) and still redact
  their process console (Part B T3). Alternative: a host-registered pattern list in core (global
  state; not recommended).
- **D8 (new, rev 3) Metadata-only logs.** Coordinator decision after two review rounds: a log line
  says what failed, the class/code and the request ID, never the error text. Cost: a log alone no
  longer shows the message (debugging uses the host sink, which gets the error object, or a
  reproduction). Tovu's own sink (T1) follows the same rule. Say if you want full text in Tovu's
  sink, which only Tovu's redaction would then protect.
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
`tool-execution-rpc.test.ts`; commerce `settlement-worker.unit.test.ts`; admin `core/__tests__/transport.test.ts`,
`media/__tests__/controllers.test.ts`; `scripts/check-package-layers.ts` (admin core peer, chat protocol dep);
no-emit tsc of every touched Jini package (the `reportRouteInternalError` generic inference is unverified);
then every test file Terra touched in Part A and Part B.

**Red, then green, recorded (owner's failing-test-first rule).** The design commits were written on a
machine that runs no tests, so their "red" is unproven. The cloud gate checks out each test-only
revision and runs its test file, records the failing assertion (RED), then runs the same file on the
fix revision and records the pass (GREEN). Pairs: c88af7d03 -> 76447baa5 (http-kit owner);
bf4043fce -> c55eec038 (admin describeApiError); e4061b9de -> ef09da3c3 (metadata-only default; the
daemon catalog test file from 898ec8a21 runs against e4061b9de's sources for RED and at 898ec8a21 for GREEN). The worked examples are not
accepted, and Part A does not start, until every pair has both records. Part A and Part B reports
carry the same red/green records per test file (prompt section 1).
