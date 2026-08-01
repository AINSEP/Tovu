# Cross-check: Terra 5.6 xhigh vs Claude Sonnet 5, same four packets

Date: 2026-07-31. Adjudicator: Coordinator (Claude Opus 5, 1M context), reading code directly.

Two independent audits ran the same four packets with no shared context. Sonnet was explicitly
blocked from reading Terra's reports and from reading
`20260731-agent-writable-settings-foundation.md` (the design doc arguing the new code is correct),
so agreement between them is not an artifact of a shared prior.

**This document is the one to hand a fixing agent.** The individual reports say what each model
believes; this says which beliefs survived contact.

## Headline

**Each model found a real defect the other missed — and in both cases the other had affirmatively
marked that area clean.** Neither report alone was sufficient. Treat any single-auditor finding
as unconfirmed, including the batch-1 findings that only ever got one pass.

## Score

| Batch | Terra | Sonnet |
|---|---|---|
| 2 — Tovu (37 files) | 2 HIGH, 2 MED, 1 LOW | 0 HIGH, 1 MED, 1 LOW |
| 2 — Jini (13 files) | 3 HIGH, 5 MED, 1 LOW | 0 HIGH, 5 MED, 2 LOW |
| 3 — Tovu (36 files) | **1 CRITICAL**, 4 HIGH, 4 MED | 1 HIGH, 1 MED, 1 LOW |
| 4 — Jini (61 files) | 6 HIGH, 4 MED | 3 HIGH, 3 MED |

Terra reports more, and rates higher. The severity gap has a consistent, identifiable cause — see
"Why they disagree" below.

## Adjudicated: three contested findings, verified by reading the code

### 1. Cross-tenant settings write — TERRA RIGHT, SONNET MISSED IT

Terra: CRITICAL. Sonnet: reported 0 CRITICAL.

**Verified CONFIRMED** (full analysis in
`20260801-critical-cross-tenant-settings-write-verification.md`). `set.ts:79`, `clear.ts:48`, and
`reset.ts:48` take the write-target `workspaceId` from the **request body** while pinning
`authWorkspaceId` to the route's ambient workspace. Authorization and mutation target different
tenants and nothing requires them to match.

Terra also got the *line* wrong — it filed against `write-service.ts:264`, a fallback that never
fires for an HTTP request because every route supplies `authWorkspaceId` explicitly. Right bug,
wrong location.

**Why Sonnet missed it, fairly:** the three route files were not in batch 3's file list. The packet
said to read siblings freely; Terra did, Sonnet didn't. A scope-edge miss, not a judgment error —
but it is exactly why "the second opinion found nothing" is not clearance.

### 2. `listRevisionsSince` has no workspace predicate — SONNET RIGHT, TERRA CLEARED IT

Sonnet: MEDIUM. Terra: not reported, and its "assessed and found clean" affirmatively blessed the
area — *"each ledger query is ordered, indexed by `seq`, and limited."*

**Verified: Sonnet is correct.** `repo.sqlite.ts:445` filters on `gt(seq, sinceSeq)` and nothing
else. It is the only query in that file without a workspace predicate; every sibling scopes
correctly. The SSE feed takes `limit` rows **globally**, then `change-feed.ts` filters for
visibility in JS.

Consequence: disclosure is still correct (no value leaks), but a busy tenant's revision volume fills
the page and delays another tenant's own visible changes — an observable cross-tenant timing
channel. **Same root cause as Terra's `Last-Event-ID` HIGH**: the cursor and the query both operate
on the global ledger and only the payload is scoped. Fix them together.

### 3. Privacy "Don't share" preserves unknown telemetry scopes — BOTH PARTLY WRONG

Terra: HIGH. Sonnet: affirmatively clean.

**Verified: the truth is in between, and neither model got it right.**

Terra is factually correct about the code. `nextStateForDeclineAll` (`privacy/rules.ts:70`) is
`{ ...state.telemetry, metrics: false, content: false }` — the spread does preserve any additional
key, so a persisted `diagnostics: true` would survive a decline.

Sonnet is correct that it is not exploitable. I grepped the whole repo: `TelemetryPreferences` is
`{ metrics?: boolean; content?: boolean }` and **only those two keys are ever assigned anywhere**
(`rules.ts:59`, `:70`, `:89` are the only assignment sites). No third scope exists, so Terra's
scenario requires a key nothing in this codebase produces.

Worth noting for whoever fixes it: the module is already internally split on the question.
`isSharingEnabled` checks exactly `metrics`/`content` (closed-set assumption) while
`shouldHaveInstallationId` uses `Object.values(telemetry).some(v => v === true)` (open-set
assumption). They agree today only because there are two keys. That inconsistency is the real
defect and it is cheap to fix by normalizing to a closed, versioned scope set.

**Verdict: downgrade HIGH → LOW.** Latent hazard, not a live consent violation.

## Where they converged — highest confidence in the whole exercise

These have two independent votes and should be treated as established:

- **All four structural bounds of `settings_set_ui_preference`: PROVEN.** Both models were told to
  assume the JSON Schema `enum` was bypassed and to attack the bounds structurally. Both proved all
  four. Sonnet contributed evidence Terra did not have: `proxyRunStart` in `modules/assistant.ts`
  *unconditionally overwrites* any client-supplied `principalId` in `contextRef` before it reaches
  the daemon, so bound 4 (unspoofable ledger actor) is enforced server-side rather than by
  convention. **The new agent-write tool is the best-verified code in this entire review.**

- **`use-settings-slice.hooks.ts` unmount flush captures a stale diff base.** Both HIGH, same
  mechanism: edit A→B (save in flight), revert B→A, unmount before either resolves; the flush's
  diff base is stale, computes "unchanged", and silently drops the write. The operator's revert is
  lost permanently. **This hook is now 5-for-5 on audits finding data loss in it** — restructure it
  rather than patching a fifth time.

- **`execution/rules.ts` `isValidApiBaseUrl` is scheme-only.** Both HIGH. Sonnet added the fix path:
  `packages/agent-runtime/src/providers/connection-guard.ts` is *already* a DNS-aware SSRF guard for
  this exact BYOK-base-URL shape, and `ui-core` neither reuses nor references it. The fix is
  reuse, not new code.

- **`media-providers/rules.ts` has no URL validation at all.** Both HIGH. Strictly worse than
  `execution`'s weak check, on a field paired with a real API key and persisted.

- **`source-config-list` barrel omits `SourceUpdateInput`.** Both LOW. Trivial, but two cold reads
  landing on the same export gap is a good calibration signal.

### 4. Editor stale-response race — CONVERGED, severity split

Terra: HIGH, 6 editors. Sonnet: MEDIUM, 5 editors. **Both found it independently from cold** — the
strongest convergence outside the agent-tool bounds.

Sonnet's mechanism detail is better and raises the real stakes: in `PostEditor.tsx` a stale resolve
means Save overwrites the *correct* record with the *wrong* record's title/slug/body; in
`CollectionEntryEditor`, `WidgetInstanceEditor`, and `MenuEditor`, `save()` reads the id from stale
state, so it targets a different record entirely. No error, no conflict, no warning.

Take Terra's HIGH rating: silent cross-record data corruption from ordinary fast navigation.

**Also relevant to the CRITICAL:** Sonnet independently traced `requireAdminSession` mounting order
through `app.ts`/`core.ts` and confirmed `authorize()` on the four assistant execution routes is a
real fail-closed workspace-scoped RBAC check — and specifically that **the untrusted URL
`workspaceId` param is never passed into it**. So the execution routes do *not* have the bug the
settings routes do. That is a useful negative result: the defect is local to the settings surface,
not a house style.

## Found by only one model — single vote, needs verification

**Sonnet only:**
- **`validateSourceDraft` is wired into the Add form only; the Edit path never calls it.**
  **VERIFIED CONFIRMED by the Coordinator.** `validateSourceDraft` has exactly one non-test call
  site in the entire repo: `useSourceConfigAddForm.ts:44`. `SourceConfigItemCard.saveEditing`
  (`:74`) calls `onUpdate({ label: editLabel, fields: editFields })` with raw component state, and
  `useSourceConfigList.update` (`:145-151`) passes it straight to `port.updateSource`. Not even the
  permissive `isValidHttpUrl` runs on the edit path.

  One correction to Sonnet's framing: it called this "contradicted directly by the file's own doc
  comment." The comment actually says only that "a host that needs it supplies its own extra
  validation before calling `addSource`" — it never speaks to `updateSource`. So the library never
  *promised* update validation; the gap is that the contract is silent where it should be explicit.
  Real finding, slightly weaker rhetoric than claimed.

  This is worse than Terra's finding on the same file. Terra said the validator is too permissive;
  the truth is that on the edit path it does not run at all. **Fix these two together.**
- `isTrustedConnectorCallbackOrigin` trusts any port on localhost for the OAuth postMessage callback.
- `project-locations` has no path-traversal or absoluteness check, undocumented in `ports.ts`.

**Terra only:**
- `memory/formatters.ts` renders raw provider/connector errors (bearer tokens, `postgres://user:pass@`).
- `maskedKeyLabel` trusts a server-supplied `apiKeyTail` without length-clamping.
- Unbounded concurrent SSE streams with `Last-Event-ID: 0` (Sonnet rated the same area LOW).
- `resetNamespace` clears keys in separate transactions — partial reset on a mid-loop failure.
- Analytics config read amplification after the cache removal (12 SQLite reads per beacon).
- The six batch-2-Tovu and batch-1 findings, pending Sonnet's batch-2-Tovu run.

## Why they disagree on severity

Consistent and diagnosable, not noise.

**Terra rates on assumed host behavior.** Its three batch-2-Jini HIGHs all depend on the host adapter
placing a secret into `SourceTestResult.message`. Plausible, unproven from inside that repo.

**Sonnet refuses to rate on unverifiable assumptions.** Its stated criterion for its lead finding was
*"100% verifiable from the code alone, no host-side assumptions needed."* It found the same code and
rated it MEDIUM as an error-handling defect rather than HIGH as a credential leak.

Neither is wrong. It means **Terra's conditional HIGHs are checkable** — read what Tovu's actual
adapter puts in `message` — and until someone does, they are hypotheses with a severity attached.

The same pattern explains `integrations/rules.ts` (`serverName` shell injection): Terra HIGH, Sonnet
MEDIUM because `serverName` is a fixed constant today. Sonnet's read is better supported.

## Recommended order for a fixing agent

1. **Cross-tenant write** (verified CRITICAL, 3 routes + a write-service backstop + 3 tests).
2. **`use-settings-slice.hooks.ts`** (two votes, 5-for-5 history — restructure, don't patch).
3. **Endpoint validation policy**, once, reusing `connection-guard.ts` — closes `execution`,
   `media-providers`, and `source-config-list` together (two votes each).
4. **Verify Sonnet's Edit-path validation bypass**, then fix with #3.
5. **SSE global-ledger pair**: `listRevisionsSince` scoping + the `Last-Event-ID` cursor. One root cause.
6. Everything single-vote, only after verification.

**Do not fix the privacy rule as a HIGH.** It is a LOW-severity latent hazard; normalize the scope
set when convenient.
