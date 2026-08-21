# comments / webhooks / redirects / connectors / http / mail — coverage baseline

Generated 2026-08-21 · Branch `general-work`. **No handoff in this project has ever named or measured
these six areas.** This is a **measurement-only** report — no coverage tests were written in this pass.

## Command used

```
TEST_CONCURRENCY=2 node --import tsx --test \
  --experimental-test-coverage \
  --test-reporter=lcov --test-reporter-destination=<out>.lcov \
  --test-reporter=dot --test-reporter-destination=stdout \
  "src/comments/**/*.test.ts" "src/webhooks/**/*.test.ts" "src/redirects/**/*.test.ts" \
  "src/connectors/**/*.test.ts" "src/http/**/*.test.ts" "src/mail/**/*.test.ts"
```

257/257 tests passed (confirmed via a second run with `--test-reporter=tap`: `# tests 257 / # pass 257 /
# fail 0`). **Do not use the withdrawn full-repo figures** for these areas (comments 77.60, redirects
74.57, webhooks 77.49, connectors 84.48, http 89.87, mail 75.71) — those came from a full-repo
`test:cov` run and are corrupted by dual module instantiation for 89% of the repo. This report is a
**scoped** run only.

## Integrity checks (performed before trusting any number below)

- **esbuild/CJS interop shim markers (`__toCommonJS`/`__copyProps`/`__toESM`/`__export`) across all 58
  `SF:` blocks in the six target areas: 0.** The dual-instantiation artifact is absent from this run.
- **Duplicate `SF:` blocks for the same file (the dual-instantiation symptom itself): 0.** Every file in
  the six areas appears exactly once.
- **Duplicate `FN:` names within one file, checked and read individually, not assumed:**
  - `composio-config-store.ts`, `redirects/types.ts`, `webhooks/subscriptions.ts` — `<static_initializer>`
    colliding on name only (2×, 5×, 2× respectively), same category as the analytics/export/media
    report's own finding. All instances hit; no effect on `FNH/FNF`.
  - `webhooks/repo.memory.ts` — **real, non-`<static_initializer>` duplicate names**: `save` (2×),
    `findById` (2×), `<instance_members_initializer>` (3×). Read in context: this file defines **three**
    classes (`InMemoryWebhookSubscriptionRepo`, `InMemoryWebhookDeliveryRepo`,
    `InMemoryDeliveryEnvelopeStore`), each with its own `save`/`findById` method — genuinely distinct
    functions sharing a name across sibling classes, not one function double-counted. Confirmed by
    reading each `FNDA` line individually: each occurrence has its own independent hit count (e.g. one
    `findById` reads `FNDA:20`, the other `FNDA:5` — two different numbers, so they are not merged echoes
    of one entry). `FNH/FNF` (28/30) is a real number; the 2 misses are `listByWorkspace` and one
    anonymous callback (`FNDA:0` each), unrelated to the name collision.
- **`class X extends Error {}` with no explicit constructor gets no `FN:` entry (known defect) — present
  here.** 11 such classes exist across these six areas and none of them produces its own named `FN:`
  entry (only the enclosing `<static_initializer>` bookkeeping shows up): `comments/errors.ts` (1),
  `webhooks/subscriptions.ts` (2), `webhooks/delivery.ts` (1), `redirects/types.ts` (5),
  `connectors/composio-config-store.ts` (2). Where this lands a file at "100% func," that percentage is
  computed over a **smaller true denominator** than the file's real function count — not a false 100%,
  just a 100% that doesn't count these 11 classes at all. Flagging per the standing caveat register
  rather than treating it as new tooling news.

## Files with nothing to measure (confirmed, not assumed)

**10 of the 58 source files across these six areas never appear in the lcov output at all** — not a
gap, confirmed by reading each one: every one is `export type`/interface-only with zero runtime
declarations (`function`/`class`/assigned-`const` count = 0), so TypeScript's `export type` erasure
removes them entirely before esbuild ever sees a statement to instrument:

`comments/ports.ts`, `webhooks/ports.ts`, `webhooks/types.ts`, `redirects/ports.ts`, `http/index.ts`,
`http/ports.ts`, `http/types.ts`, `mail/index.ts`, `mail/ports.ts`, `mail/types.ts`.

(`redirects/types.ts` looks like the same shape but is NOT in this list — it also carries 5 runtime
`Error` subclasses, so it does appear in coverage, at 100/100/100 modulo the `FN:`-omission caveat
above.) `http/index.ts` and `mail/index.ts` are barrel files that re-export **only** `export type { ... }`
— unlike `export/index.ts` and `analytics/index.ts` in the sibling report (which re-export live
bindings and so still register a trivial covered line), these two produce genuinely zero JS.

48 files remain measurable, tallied below.

## Per-file table

### `src/comments` (16 src / 6 test — 15 measurable, `ports.ts` type-only)

| file | line | branch | func |
|---|---:|---:|---:|
| `agent-tools.ts` | 100.00 | 100.00 | n/a (0 fns) |
| `data-module-install.ts` | 77.27 | 100.00 | 50.00 |
| `errors.ts` | 100.00 | 100.00 | 100.00 |
| `hooks.ts` | 100.00 | 77.78 | 83.33 |
| `index.ts` | 94.12 | 100.00 | 40.00 |
| `ingress.ts` | 99.42 | 94.29 | 100.00 |
| `repo.memory.ts` | 100.00 | 95.24 | 92.31 |
| `repo.sqlite.ts` | 100.00 | 92.86 | 100.00 |
| `sanitize.ts` | 100.00 | 100.00 | 100.00 |
| `settings.ts` | 91.24 | 73.33 | 100.00 |
| `spam.external.ts` | 100.00 | 81.48 | 100.00 |
| `spam.heuristic.ts` | 100.00 | 84.62 | 100.00 |
| `tool-registrations.ts` | 69.57 | 100.00 | 36.36 |
| `types.ts` | 100.00 | 100.00 | 100.00 |
| `write-service.ts` | 100.00 | 88.89 | 100.00 |
| **area total** | **94.71** | **88.11** | **87.61** |

### `src/webhooks` (14 src / 7 test — 12 measurable, `ports.ts`/`types.ts` type-only)

| file | line | branch | func |
|---|---:|---:|---:|
| `agent-tools.ts` | 100.00 | 100.00 | 100.00 |
| `delivery.ts` | 100.00 | 97.62 | 100.00 |
| `http.memory.ts` | 100.00 | 87.50 | 100.00 |
| `index.ts` | 100.00 | 100.00 | n/a (0 fns) |
| `keyring.env.ts` | 100.00 | 89.47 | 87.50 |
| `keyring.memory.ts` | 93.48 | 100.00 | 85.71 |
| `repo.memory.ts` | 98.80 | 89.80 | 93.33 |
| `secret-sealer.aesgcm.ts` | 99.29 | 93.33 | 100.00 |
| `signing.keyring.ts` | 100.00 | 100.00 | 100.00 |
| `signing.ts` | 98.70 | 88.46 | 100.00 |
| `subscriptions.ts` | 97.02 | 82.86 | 100.00 |
| `tool-registrations.ts` | 66.90 | 100.00 | 23.08 |
| **area total** | **94.61** | **91.08** | **86.27** |

### `src/redirects` (13 src / 8 test — 12 measurable, `ports.ts` type-only)

| file | line | branch | func |
|---|---:|---:|---:|
| `agent-tools.ts` | 100.00 | 100.00 | 100.00 |
| `capture.ts` | 100.00 | 100.00 | 100.00 |
| `hit-sink.ts` | 100.00 | 100.00 | 100.00 |
| `index.ts` | 100.00 | 100.00 | n/a (0 fns) |
| `matcher.ts` | 99.02 | 80.00 | 100.00 |
| `phase-handler.ts` | 99.06 | 80.00 | 87.50 |
| `ports.internal.ts` | 100.00 | 100.00 | 100.00 |
| `redirects.ts` | 99.01 | 84.85 | 100.00 |
| `repo.memory.ts` | 97.92 | 81.54 | 96.77 |
| `repo.sqlite.ts` | 92.34 | 70.91 | 90.32 |
| `tool-registrations.ts` | 64.89 | 100.00 | 30.00 |
| `types.ts` | 100.00 | 100.00 | 100.00 (see `FN:`-omission caveat — 5 `Error` subclasses uncounted) |
| **area total** | **95.07** | **82.59** | **90.91** |

### `src/connectors` (6 src / 2 test — all 6 measurable)

| file | line | branch | func |
|---|---:|---:|---:|
| `composio-config-store.memory.ts` | 100.00 | 100.00 | 100.00 |
| `composio-config-store.ts` | 99.77 | 92.19 | 100.00 |
| `composio-key-probe.ts` | 94.51 | 100.00 | 50.00 |
| `composio-service.ts` | 92.57 | 66.67 | 37.50 |
| `connector-credential-store.memory.ts` | 100.00 | 100.00 | 100.00 |
| `connector-credential-store.ts` | 96.73 | 78.57 | 88.89 |
| **area total** | **97.38** | **89.26** | **87.10** |

### `src/http` (5 src / 2 test — only 2 measurable: `index.ts`/`ports.ts`/`types.ts` type-only)

| file | line | branch | func |
|---|---:|---:|---:|
| `client.ts` | 97.06 | 85.53 | 92.31 |
| `transport.fetch.ts` | 76.79 | 100.00 | 40.00 |
| **area total** | **89.87** | **86.08** | **77.78** |

### `src/mail` (4 src / 2 test — only 1 measurable: `index.ts`/`ports.ts`/`types.ts` type-only)

| file | line | branch | func |
|---|---:|---:|---:|
| `purpose-scoped-mailer.ts` | 95.71 | 93.33 | 75.00 |
| **area total** | **95.71** | **93.33** | **75.00** |

### Grand total (48 measurable files)

```
              LINE      BRANCH      FUNC
            94.94%     87.04%     87.67%
```

## `src/http`'s structural distinctiveness (as requested)

`src/http`'s **full-repo** number (89.87 line) exactly matches its **scoped** number here — expected
and consistent with it being one of the three areas the earlier corruption check found clean, not a
coincidence to be suspicious of.

Traced why: **`src/http/client.ts` (the file containing the real `createHttpClient` factory) has
exactly one importer in the entire repository — its own test file, `src/http/__tests__/client.test.ts`.**
Verified by grepping for every import of `http/client.js` repo-wide (`src/` and `apps/`): nothing else
matches. The two real production consumers found (`comments/spam.external.ts`,
`features/deployments/ports.ts`) both `import type { HttpClientPort } from "../http/index.js"` —
**type-only**, erased at compile time, never touching the runtime module graph — and receive an
implementation via constructor injection instead. **`createHttpClient` is not called anywhere under
`src/server` (the composition root) today** — nothing currently wires a real instance into the running
app; every current caller of an `HttpClientPort`-shaped dependency must be getting it from somewhere
other than this file, or not getting a real one yet.

**Update (follow-up investigation, same session):** the causal half of this ("one import path ⇒
immune") was tested directly against `src/cli` and `apps/site-chat` and does **not** hold as a general
mechanism — both areas have files with many importers (`cli/errors.ts` has dozens across unrelated
areas; `site-chat/client-directives.ts` has 4) and stay 100% clean anyway. The single-importer fact
about `http/client.ts` itself is still true and still worth recording, but it is not shown to be *why*
the area is immune — see `2026-08-21-coverage-dual-instantiation-root-cause.md`'s "single-import-path
hypothesis" section for the full test and what's now confirmed/refuted/open.

### Separately: this is a dead-code/wiring question for a human, not a coverage gap

Independent of the corruption-immunity question: **`createHttpClient` — the one production
constructor for `HttpClientPort` — is called nowhere in this repository except its own test.**
`comments/spam.external.ts` and `features/deployments/ports.ts` both declare a dependency on
`HttpClientPort` (constructor-injected) but nothing in `src/server` (the composition root) has been
found that constructs a real one to inject. This is the **second** finding of this exact shape found
in this project tonight — `src/forms/manifest.ts` was separately found imported by nothing in `src/`
at all, despite its own file header claiming two consumers that don't exist. Two independent
"exists but nothing uses it" findings in one session is a pattern worth a human's attention, not two
coincidences. **Not a coverage gap** (no test can meaningfully "cover" a wiring decision that hasn't
been made) — flagging for a human to decide whether this is pending work, a stub for a future
consumer, or something that should be wired in now. Per the same treatment `manifest.ts` got: **not
writing a test to cover it, not deleting it.**

## What this report does NOT do

Per the dispatch brief, this is measurement only. No coverage gaps were closed, no tests were written
against these six areas, and no judgment is offered on which gaps are worth closing next. That is
explicitly left for a fresh session with this baseline in hand.
