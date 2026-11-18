# C12-OBS — observability contract into core (O/DESIGN M1)

**Revision 2 (2026-11-18, run r13b-c12obs-fix): EXECUTABLE on `origin/refactor/terra` = Jini `4c1892368` / Tovu `ada11733f`.** Revision 1 (2026-11-16) was guarded on a local `-X ours` integration view. The executor (Jini `origin/wave1/xpkg-C9c-C12OBS:cloud-results/xpkg-wave1d.md`) stopped before any commit because the census had drifted. Revision 2 re-read every guard, re-ran the applier dry run, added the 4 unlisted importers, dropped 2 rows, and took the executor's prepared patch as step 1. Its plan-side trial on the two SHAs: patch + applier, then core build, core noop test, the analytics and diagnostics suites, and a diagnostics/analytics/daemon/http-kit `tsc` (results in §6). Source design: `../observability/DESIGN.md` §2.1, §2.2 (the "moved verbatim" part only) and §4 row M1.

Owner rules that apply: move + delete, **no shells, forwarders or aliases**; core has zero dependencies and no module state (L6); `(required, optional)` args; tests in a Jini package import only `/testing` and `/conformance` from other packages (core is base, so core's main subpath is fine).

**Behaviour change: none** (pure type move + one value move). M2 (facade, composer, recording fake, `Tracker` deletion) is a separate lane and is **not** in this sheet.

## 0. Placement and prerequisites

| | |
|---|---|
| Base | `origin/refactor/terra` in both repos (Jini `4c1892368`, Tovu `ada11733f`) or a descendant |
| Waits on it | **R12c, then R12b** (xpkg sheets, `R12-providers.md`): they edit the same provider `contract.ts` / `otel-port.ts` files after the restatements are gone |
| Size | Sonnet ~70k (patch already prepared: restatement deletions + MANUAL rows + gates) |
| TSV | `C12-OBS.repoint.tsv`: **167 rows** (152 `wave` rows scripted to core, 1 KEEP, 13 MANUAL, 1 `C-lane` row that the patch's `git mv` does), Jini + Tovu |
| Patch | `C12-OBS.prepared-jini.patch` (next to this sheet; copy of the executor's `cloud-results/xpkg-wave1d-C12-OBS-prepared-jini-hand-edits.patch`). It applies cleanly on `4c1892368` (`core/package.json` hunks at offset 1 and 7) |
| Branch | `xpkg/C12-OBS` in Jini and Tovu |

Run these first. Every line must print what its comment says; any other output is a **STOP**:
```bash
# in Jini
git merge-base --is-ancestor 4c1892368 HEAD && echo ok
for f in packages/diagnostics/src/observability/ports.ts packages/diagnostics/src/observability/noop.ts packages/analytics/src/product/index.ts packages/analytics/src/product/browser.ts packages/daemon/src/tool-recovery/observability.ts packages/http-kit/src/observability.ts packages/provider-plugins/src/observability-opentelemetry/contract.ts packages/diagnostics/src/__tests__/package-surface.integration.test.ts; do echo "$(git rev-parse HEAD:$f | cut -c1-12) $f"; done
# expected, in order: 176e9848dee5 195da886c3d8 a8b747389984 bb36f5fe158c 009d368dc51d 53efb9b78a27 c3b9898ac004 ab9529051f6b
git apply --check <U>/sheets/C12-OBS.prepared-jini.patch && echo patch-ok
# in Tovu
git merge-base --is-ancestor ada11733f HEAD && echo ok
```
`packages/core/package.json` is **not** guarded by blob any more. It changes with every core lane, and the patch only appends one export and one `jini.entries` line, so `git apply --check` is its guard.

Applier dry run on the unpatched pair (it must match exactly; `<U>` = `ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle` on the Tovu plan branch):
```bash
node <U>/scripts/apply-repoint.mjs --tsv <U>/sheets/C12-OBS.repoint.tsv --repo-root jini=<Jini> --repo-root tovu=<Tovu> --phase all --dry-run | tail -1
# SUMMARY (dry run, nothing written): rows 167; applied 153, already 0, keep 1, manual 13, other-phase 0, STALE 0, ERROR 0; files changed 129
```
Completeness check. It must print nothing; a line it prints is an importer of a moved name with no TSV row: **STOP**. It printed nothing on `4c1892368` / `ada11733f`:
```bash
python3 -I <U>/sheets/C12-OBS.completeness.py.txt <Jini> <Tovu> <U>/sheets/C12-OBS.repoint.tsv
```

## 1. What moves (exact names)

NEW `packages/core/src/contracts/observability.ts` (universal). Every name moves **verbatim with its doc comment** (no shape change in M1; the M3 fields `usage`, `parent`, `root`, `activeCarrier`, `browserObservability` are NOT added here).

From `diagnostics/src/observability/ports.ts` (`176e9848dee5`), 27 names:
`RequestTrackingInput`, `RequestTrackingOptions`, `RequestTrackingOutcome`, `TrackerScope`, `RequestTracker`, `DbQueryTrackingInput`, `DbQueryTrackingOutcome`, `DbQueryTracker`, `OutboundCallTrackingInput`, `OutboundCallTrackingOutcome`, `OutboundCallTracker`, `AgentRunTrackingInput`, `AgentRunTrackingOptions`, `AgentRunStatus`, `AgentRunTrackingOutcome`, `AgentRunTracker`, `OperationAttributes`, `OperationTrackingInput`, `OperationTrackingOutcome`, `OperationTracker`, `TraceIds`, `ErrorReport`, `CrashUpload`, `MetricInput`, `MetricOptions`, `ObservabilityPort`, `ObservabilityAdapter`.
- The file's header comment ("Consumers speak in request lifecycle terms…") moves with them; leave a one-line pointer comment in `ports.ts` only if the remaining names need the context.
- **Stays** in `ports.ts` (per O/DESIGN §4 "old file keeps only…"): `RequestObservation` (now `extends` the core `RequestTrackingOutcome`), `RequestLogPort`, `RequestMetricsPort`, `RequestIdGenerator`, `TraceSpanPort`, `SpanScopePort`. `ports.ts` gets `import type { RequestTrackingOutcome, TraceIds } from '@jini-ai/core/contracts/observability';`.

From `diagnostics/src/observability/noop.ts` (`195da886c3d8`): `createNoopObservabilityPort`, `isNoopObservabilityPort`. `noop.ts` is **deleted** (`git rm`).
- **L6 fix (required, not optional):** today's `NOOP_PORTS = new WeakSet` + `.add(port)` is module state the base-purity gate reports as `mutable NOOP_PORTS` (`scripts/lib/base-purity.ts:89`). In core it becomes one frozen `NOOP_PORT` built at module load; `createNoopObservabilityPort(_required)` returns it and `isNoopObservabilityPort({…})` is `port === NOOP_PORT`. Keep the existing doc comments ("Creates disabled telemetry; every request shares one frozen tracker without allocation." / "True for a port this module built…").
  - Observable difference: two calls now return the same object. `rg` over Jini packages/examples and Tovu found no caller that mutates the port or asserts distinct identity. **STOP** if the lane finds one.
  - Keep the positional signature `isNoopObservabilityPort(port)` unchanged (pure move; the `(required, optional)` reshape is M2's, together with its 30+ call sites).

From `analytics/src/product/index.ts` (`a8b747389984`): `ProductEventProperties`, `ProductEvent`, `ProductIdentity`, `ProductAiGeneration`, `ProductAnalyticsPort`, `ProductAnalyticsAdapter`.
From `analytics/src/product/browser.ts` (`bb36f5fe158c`): `BrowserAnalyticsContribution` (the port's `browserAnalytics?` returns it, so it must move with the port; its inline `import('./browser.js').BrowserAnalyticsContribution` becomes a plain reference).
- **Stay** in analytics: `createNoopProductAnalytics`, `isNoopProductAnalytics`, `ProductAnalyticsConsent*`, guards, fan-out, `createAiGenerationSink`, `BrowserAnalyticsMode`, `BrowserAnalyticsConsent`, the browser renderers (O/DESIGN §2.1: "guards + fan-out stay in analytics").
- `analytics/product/index.ts` imports the moved types it still uses from core; its `export type { … BrowserAnalyticsContribution } from './browser.js'` loses that name (DROP row).

**Not moved in M1:** `tracker-types.ts`, `Tracker`, `createNoopTracker`, `createTracker` (deleted by M2, not moved), `TraceSpanPort`/`SpanScopePort` (diagnostics-internal SPI), `config.ts`, `otel.ts` helpers, `fanout.ts`, `hooks.ts`, `instrumentation.ts`, `report-error.ts`.

## 2. Steps: one Jini commit, then one paired Tovu commit (every commit green alone)

Owner rules that apply to every step:
- tests are written first and run RED;
- move + delete, with no shell, barrel, forwarder or alias;
- why-comments move with their code;
- declared deps are imported statically;
- fakes, not `vi.mock`;
- no new `eslint-disable`, `@ts-ignore`, `@ts-expect-error` or `as unknown as`;
- functions ≤ 50 lines, complexity ≤ 10, files ≤ 500 (§4, S8 block);
- errors are never swallowed (this lane adds no `catch`).

Signature note (S9): `createNoopObservabilityPort(_required)` and `isNoopObservabilityPort(port)` keep their **existing** signatures. This is a pure move; the `(required, optional = {})` reshape is M2's, together with its 30+ call sites. The report lists both under S9 with this sentence.

**Jini commit `C12-OBS: observability contract into core (M1)`**
1. **Tests first:** `git apply <U>/sheets/C12-OBS.prepared-jini.patch` stages the moved noop test at `core/src/contracts/__tests__/observability-noop.test.ts` (6 cases, including the two new identity cases). Before the source exists it must fail with `Failed to load url ../observability.js`. Reproduce that RED and paste it into the report:
   ```bash
   git apply <U>/sheets/C12-OBS.prepared-jini.patch
   mv packages/core/src/contracts/observability.ts /tmp/c12-observability.ts
   (cd packages/core && npx vitest run src/contracts/__tests__/observability-noop.test.ts)   # RED: Failed to load url ../observability.js
   mv /tmp/c12-observability.ts packages/core/src/contracts/observability.ts
   (cd packages/core && npx vitest run src/contracts/__tests__/observability-noop.test.ts)   # 6 passed
   ```
   The patch carries:
   - §1's new `core/src/contracts/observability.ts`: 163 lines, 27 + 2 + 7 names moved verbatim with their comments, and the L6 fix as one frozen `NOOP_PORT`;
   - the deletions in `ports.ts`, `git rm noop.ts`, and the `noop.js` line removed from `diagnostics/src/observability/index.ts`;
   - the analytics `product/index.ts` and `browser.ts` edits;
   - `core/package.json` (`exports["./contracts/observability"]` + `jini.entries` `universal`) and the `core/README.md` row.
   Verified by the executor on `65d73b0d` and by this plan run on `4c1892368`: core build green, noop test 6/6, analytics 224/224. Mutations of the new cases (a fresh object per call, a structural noop check, an unfrozen port) each turn 1-2 cases red.
2. **Applier, wave rows** (after the patch). It must print exactly this; `already 2` are the two rows the patch already did, and `other-phase 1` is the `C-lane` test move:
   ```bash
   node <U>/scripts/apply-repoint.mjs --tsv <U>/sheets/C12-OBS.repoint.tsv --repo-root jini=<Jini> --repo-root tovu=<Tovu> --phase wave | tail -1
   # SUMMARY: rows 167; applied 150, already 2, keep 1, manual 13, other-phase 1, STALE 0, ERROR 0; files changed 126
   ```
   It edits both repos in one pass. The Jini paths go in this commit and the Tovu paths in the paired commit (§2 Tovu).
3. **Restatement deletions** (hand edits; the names are deleted, not moved, so they are not TSV rows):
   - daemon `tool-recovery/observability.ts`: delete `ToolCallObservability` and its local `Attributes` alias. The decorator's required object becomes `observability: Pick<ObservabilityPort, 'trackOperation' | 'reportError'>` (`import type { ObservabilityPort } from '@jini-ai/core/contracts/observability'`). Rewrite the header sentence "The port is taken structurally ({@link ToolCallObservability}), not imported: this package does not depend on `@jini-ai/diagnostics`…" to: "The port type comes from `@jini-ai/core/contracts/observability`, which keeps this package free of `@jini-ai/diagnostics`." Its two test importers (`__tests__/observability.test.ts:4,13`, `forced-confirmation-forwarding.test.ts:11,25`) type their fakes as that `Pick`. `observability-w2g.unit.test.ts:21` passes an inline object and needs no edit. `rg -n "ToolCallObservability" packages examples` printed only these on `4c1892368`: no re-export to drop.
   - http-kit `observability.ts`: delete `HttpRequestObservabilityPort`. Both functions take `observability: Pick<ObservabilityPort, 'trackRequest'>`. The only other mentions are `http-kit/README.md:71` and `docs/spec/api.spec.md:126`: reword both to name the core port.
   - provider-plugins `observability-opentelemetry/contract.ts`: delete `TraceIds`, `AgentRunStatus`, `RequestTracker`, `ObservabilityPort`, and their private `TrackerScope`/`OperationAttributes` helpers if nothing else in the file uses them. Import them type-only from core. The OTel-only shapes stay (Q6: provider-local).
   - `provider-plugins/package.json` already has `"@jini-ai/core": "workspace:^"` in `devDependencies` on `4c1892368` (revision 1 said it had none). **No manifest edit.**
4. **MANUAL rows (13), Jini part.** These edits are by hand:
   - `diagnostics/src/__tests__/package-surface.integration.test.ts:39`: remove `"createNoopObservabilityPort"` and `"isNoopObservabilityPort"` from the `observability` list. They are the only moved runtime names in it, and this is the one red diagnostics test after steps 1-2 in the plan trial (992/993).
   - `provider-plugins/__tests__/observability-otel-operations.test.ts`: only `:117` (`isNoopObservabilityPort`) changes its spec to core. The other 7 dynamic imports take `combineObservabilityPorts`, which stays.
   - `provider-plugins/__tests__/observability-sentry.test.ts:318` (`createNoopObservabilityPort`) changes to core.
   - These rows need **no edit**:
     - `analytics/__tests__/product-browser.test.ts:8` (takes `withProductAnalyticsGuards`);
     - `diagnostics/.../optional-analytics.integration.test.ts`: its `vi.mock` factory returns values only. It is an existing mock; add none.

   For every row, `node <U>/scripts/apply-repoint.mjs … --phase wave --dry-run` lists all 13 with file and line. The report states the action taken for each.
5. **Shared files, in this same commit** (there are no coordinator-only files):
   - `scripts/injection-debt.json`: delete by hand the three keys whose import now goes to core:
     - `provider-plugins/src/analytics-posthog/browser.ts` → `@jini-ai/analytics/product`;
     - `…/consent.ts` → `@jini-ai/analytics/product`;
     - `…/posthog.ts` → `@jini-ai/analytics/product`.

     Keep `opentelemetry.ts` → `diagnostics/observability`, `sentry.ts` → `diagnostics/observability` and `index.ts` (`resolveObservabilityConfig`): they still import diagnostics helpers. Delete any other key only if `pnpm guard` reports it stale.
   - `pnpm api:update`: commit the regenerated `api-baseline/jini-ai__{core,diagnostics,analytics,daemon,http-kit,provider-plugins}.json`. Revert any other baseline it rewrites (pre-existing drift; `pnpm api:check` exits 0 on the base).
   - `.changeset/core-observability-contract.md`: core minor (new subpath); diagnostics + analytics major (names removed from their subpaths); daemon, http-kit and provider-plugins patch (types only).
   - **No `/testing` subpath in M1.** O/DESIGN §2.3 puts `createRecordingObservability`, the fake of the M2 facade, there. An empty subpath would be a shell, so M2 adds `./contracts/observability/testing`.

**Tovu commit `C12-OBS (Tovu): repoint observability imports to core (checked against Jini <sha>)`**: the Tovu files the applier changed in step 2 (92 on `ada11733f`), and nothing else. The one Tovu MANUAL row (`agent-daemon-core-rpc.integration.test.ts:89`, `createNoopTracker`) needs no edit in M1. Typecheck it linked to the Jini commit. Push it in the same run, before the report: between the two commits, Tovu is red against the Jini SHA by construction.

## 3. Behaviour

**No behaviour change**, except one observable difference that the sheet accepts: two `createNoopObservabilityPort` calls now return the same frozen object. On `4c1892368` no caller mutates the port or compares two noop ports. Every caller spreads it (`{ ...noop, x }`), and `isNoopObservabilityPort` only gets `===` against the one frozen port.

## 4. Gates (run before every push; paste each output; copy commands only from these blocks)
`BASE` = the Jini SHA you started from (Tovu: its own base).
```bash
# S1 per commit (Jini), then Tovu linked to the Jini SHA
pnpm --filter @jini-ai/core --filter @jini-ai/diagnostics --filter @jini-ai/analytics --filter @jini-ai/daemon --filter @jini-ai/http-kit --filter @jini-ai/provider-plugins build
for p in core diagnostics analytics daemon http-kit provider-plugins; do npm --prefix packages/$p run test || echo "RED $p"; done
pnpm guard && pnpm typecheck && pnpm api:check && pnpm check:size && pnpm check:complexity
npm run typecheck   # in Tovu
```
```bash
# S3 no shells or forwarders, S4 no lazy import, S6 no new mock, S10 no suppression or cast, S11 no empty catch: each prints nothing
git diff $BASE..HEAD -- packages apps | rg '^\+\s*export (\*|\{[^}]*\}) from '
git diff $BASE..HEAD -- packages apps | rg '^\+.*(await import\(|loadOptionalPeer\(|\brequire\()'
git diff $BASE..HEAD -- packages apps | rg '^\+.*vi\.(mock|doMock)\('
git diff $BASE..HEAD -- packages apps | rg '^\+.*(eslint-disable|@ts-ignore|@ts-expect-error|as any|as unknown as)'
git diff $BASE..HEAD -- packages apps | rg '^\+.*catch\s*(\(\w*\))?\s*\{\s*\}'
```
```bash
# S7 why-comments that vanished: each printed line gets its new wording and location in the report
git diff $BASE..HEAD -U0 -- packages apps | rg '^-\s*(//|/?\*)' | sed 's/^-\s*//' | sort -u > /tmp/c-del
git diff $BASE..HEAD -U0 -- packages apps | rg '^\+\s*(//|/?\*)' | sed 's/^+\s*//' | sort -u > /tmp/c-add
comm -23 /tmp/c-del /tmp/c-add
```
```bash
# S8 owner limits 50/10/500 on every changed source file vs BASE (prints only new or changed findings)
LIM='{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true}],"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}'
FILES=$(git diff --name-only --diff-filter=AM $BASE..HEAD -- packages apps | rg '\.(ts|tsx|mts|mjs|js)$' | rg -v '(__tests__|__mocks__|/fixtures/|\.test\.|\.spec\.|\.typecheck\.|\.d\.ts$)')
msgs() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s||"[]"))for(const m of r.messages)console.log(`${m.ruleId} ${m.message}`)})' | sort; }
for f in $FILES; do
  npx eslint --no-inline-config --rule "$LIM" -f json "$f" | msgs > /tmp/lim-after
  { git show "$BASE:$f" 2>/dev/null || true; } | npx eslint --no-inline-config --rule "$LIM" -f json --stdin --stdin-filename "$f" | msgs > /tmp/lim-before
  comm -13 /tmp/lim-before /tmp/lim-after | sed "s|^|$f: |"
done
```
```bash
# S9 exported functions added or re-signed (expect exactly the two noop functions, kept signatures; see §2)
git diff $BASE..HEAD -U0 -- packages | rg '^\+export (async )?function \w+'
# S13 test count per package before/after, then every removed case or assertion (each gets its new home in the report)
git diff $BASE..HEAD -- '**/*.test.*' '**/__tests__/**' | rg '^-\s*(it|test|expect)\('
# base purity: core stays free of module state
pnpm guard 2>&1 | rg -n "contracts/observability" ; echo "must print nothing above"
```

## 5. STOP

Each condition comes with the command that shows it:
- A prerequisite line in §0 prints something other than what its comment says: a guard blob, the patch check, the dry-run summary, or the completeness script.
- A caller mutates the noop port or depends on distinct noop identity:
  ```bash
  rg -n "createNoopObservabilityPort\(" packages apps examples -g '!**/node_modules/**' -g '!**/dist/**' -A2 | rg -n "Object\.(assign|defineProperty)\(\w*[Nn]oop|[Nn]oop\w*\.\w+\s*=[^=]|!==?\s*createNoop|toBe\(createNoop\w*\([^)]*\)\)|not\.toBe\("
  ```
  It must print nothing.
- `core/src/contracts/observability.ts` imports anything:
  ```bash
  rg -n "^import" packages/core/src/contracts/observability.ts
  ```
  It must print nothing.
- The base-purity gate reports anything in that file (§4 last block).
- A step cannot be green alone. Report the step; do not push red.

## 6. Tests and plan-trial results (2026-11-18, Jini `4c1892368` + Tovu `ada11733f`, Node 24.11.1)

| check (patch + applier `--phase wave`, no restatement deletions yet) | result |
|---|---|
| `git apply` of the prepared patch | clean |
| applier | rows 167; applied 150, already 2, keep 1, manual 13, other-phase 1, STALE 0, ERROR 0; files changed 126 (Jini 34, Tovu 92) |
| `pnpm --filter @jini-ai/core build` | exit 0 |
| core `observability-noop.test.ts` | 6/6 |
| analytics suite | 15 files, 224/224 |
| diagnostics suite | 992/993; the 1 red is `package-surface.integration.test.ts` (MANUAL row, §2 step 4) |
| `tsc --noEmit` diagnostics, analytics, daemon, http-kit | 0 errors each |
| provider-plugins `tsc` | 81 errors, all ENV (`Cannot find module @jini-ai/commerce/…, plugins/host, cookie-consent`: those packages were not built in the trial). None of them names `core/contracts/observability` |
| Tovu typecheck | not run in the plan trial (no `npm ci`); the executor runs it |

The lane runs the suites of diagnostics, analytics, daemon (`tool-recovery`), http-kit, provider-plugins (otel, sentry, posthog) and core, plus the Tovu typecheck and the Tovu suites of the 92 changed files' folders. Expected: no behaviour change; injection debt only goes down.
