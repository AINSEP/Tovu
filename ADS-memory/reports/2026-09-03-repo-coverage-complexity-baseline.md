# Repo coverage/complexity baseline — 2026-09-03

Dispatched by team-lead to `measure-coverage-complexity`. Persona: Code Inspection agent
(`AI-Dev-Shop/agents/code-inspection/skills.md`, v1.3.0).

**Scope (owner-specified):** `apps/website/src/**`, `apps/admin/src/**`, `apps/site-chat/src/**`
production source only. Excludes test files, `development/scripts/**`, `node_modules/**`,
`dist/**`, `ADS-memory/**`, `sites/**`, `content/**`, and the Jini repo.

**Measurement task only.** No production code changed, no tests written, no refactors.

This file is committed incrementally — each section below is filled in and committed
separately as it is measured, per the owner's explicit instruction not to hold results only
in agent context.

---

## 1. Complexity blind-spot map

Verified against the live gate scripts (`check-src-complexity-drift.ts`, `check-admin-complexity-drift.ts`), not the dispatch brief's guess.

**Correction to the brief's premise:** `check:src-complexity-drift`'s own SCOPES array lists
`apps/website/src/widgets`, `/seo`, `/analytics`, `/media` as literal top-level paths — none of
those directories exist any more. The `apps/website` restructure moved them to
`apps/website/src/features/{widgets,seo,analytics,media}`. This is **not** a coverage gap: those
4 SCOPES entries are dead/redundant (ESLint silently no-ops on them via
`--no-error-on-unmatched-pattern`), but `apps/website/src/features` — itself a live SCOPES entry —
already recurses into all four as subdirectories, so the content is still scanned. Worth cleaning
up the stale strings, not worth reporting as a blind spot. The file's own header prose (lines
35–38) is also stale: it says these areas are "still NOT covered," which was true before the
2026-08-20 widening but contradicts the SCOPES array below it today.

| Directory (apps/website/src/\*\*) | Files | Gate |
|---|---|---|
| `server/` | 363 | `check:src-complexity-drift` |
| `assistant/` | 71 | `check:src-complexity-drift` |
| `features/` (incl. nested `seo/`, `widgets/`, `analytics/`, `media/`) | 392 | `check:src-complexity-drift` |
| `platform/export/` | 4 | `check:src-complexity-drift` |
| `cli/` | 14 | **NONE** |
| `contracts/` | 30 | **NONE** |
| `platform/connectors/` | 8 | **NONE** |
| `platform/db/` | 39 | **NONE** |
| `platform/http/` | 5 | **NONE** |
| `platform/mail/` | 6 | **NONE** |
| `platform/oauth/` | 14 | **NONE** |
| `platform/observability/` | 5 | **NONE** |
| `platform/routing/` | 4 | **NONE** |
| `platform/site-dir/` | 13 | **NONE** |
| `index.ts` (top-level) | 1 | **NONE** |
| `__tests__/` | — | excluded by design (test code) |

**Blind spot total: 139 of 969 production files in `apps/website/src` (~14%) — `cli/`, `contracts/`,
`platform/*` minus `export/`, and the top-level `index.ts` — sit under no complexity gate at all.**
The brief's guessed blind spots (`/contracts`, `/lib`, `/core`) were half right: `contracts/` is
correct, but `apps/website/src` has no `lib/` or `core/` directory at all (those exist only under
`apps/admin/src`, which is fully gated). The real, unguessed blind spot is `platform/*`
(8 subdirectories, 94 files) — 9x the size of `contracts/`.

| App | Coverage |
|---|---|
| `apps/admin/src` (469 files) | Fully scanned by `check:admin-complexity-drift` (whole tree, `.ts`/`.tsx`), minus an 8-file grandfathered exempt list |
| `apps/site-chat/src` (9 files) | Fully scanned by `check:src-complexity-drift` (whole tree) |
| `apps/website/src` (969 files) | Partially scanned — see table above |

Confirmed by running the same ESLint rule override (`complexity`/`sonarjs/cognitive-complexity`
hard-set to `error`/9) across the *entire* in-scope tree, then cross-referencing every violation's
file path against each gate's real prefix list — see §2.

## 2. Every function over 9/9 (cyclomatic and/or cognitive)

Measured live: `npx eslint --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}' -f json` across `apps/website/src`, `apps/admin/src/**/*.{ts,tsx}`, `apps/site-chat/src`, excluding `__tests__/` and `__measurements__/` (same exclusion the two live gates apply). **36 distinct functions** violate the 9/9 ceiling; **12 are grandfathered/baselined**, **24 are not** — and every one of those 24 sits in a directory with **no gate at all** (§1). `apps/site-chat/src` has zero violations. Worst first:

| # | File:line | Function | Cyclomatic | Cognitive | Gate | Status |
|---|---|---|---|---|---|---|
| 1 | `apps/admin/src/features/seo/Seo.tsx:120` | `SeoEntryPanel` | 25 | – | admin-drift | grandfathered |
| 2 | `apps/website/src/platform/db/migration/manifest.ts:691` | `topologicalTableCopyOrder` | 15 | **21** | NONE | — |
| 3 | `apps/admin/src/App.tsx:253` | `App` | 15 | 20 | admin-drift | grandfathered (worse, see §3) |
| 4 | `apps/admin/src/lib/assistant-transport.ts:503` | `buildLocalCliContextRef` | **18** | 13 | admin-drift | grandfathered |
| 5 | `apps/website/src/features/external-mcp/save-form.ts:73` | `mergeExternalMcpSavePrefill` | **18** | – | src-drift | grandfathered (exact match, see §3) |
| 6 | `apps/website/src/platform/oauth/device-code.ts:110` | `beginDeviceAuthorization` | **18** | 14 | NONE | — |
| 7 | `apps/admin/src/lib/api.ts:1759` | `request` | 17 | 16 | admin-drift | grandfathered (worse, see §3) |
| 8 | `apps/website/src/platform/db/sqlite/external-mcp-repo.sqlite.ts:89` | `upsert` | 17 | – | NONE | — |
| 9 | `apps/admin/src/features/media/Media.tsx:709` | `Media` | 14 | 16 | admin-drift | grandfathered |
| 10 | `apps/website/src/cli/errors.ts:103` | `mapErrorToCliOutcome` | 14 | 15 | NONE | — |
| 11 | `apps/website/src/contracts/core/commands/revert.ts:51` | `revertChangeSet` | 15 | 13 | NONE | — |
| 12 | `apps/website/src/contracts/core/entry-refs/extractor.ts:106` | `extractEntryRefs` | 11 | 15 | NONE | — |
| 13 | `apps/website/src/platform/http/client.ts:111` | `resolvePinnedPeer` | 12 | 15 | NONE | — |
| 14 | `apps/admin/src/lib/assistant-transport.ts:117` | `translateRunAgentPayload` | 13 | – | admin-drift | grandfathered (worse, see §3) |
| 15 | `apps/website/src/platform/db/sqlite/jsonb-column.ts:229` | `decodeContainerPayload` | – | 13 | NONE | — |
| 16 | `apps/website/src/platform/oauth/discovery.ts:410` | `discoverAuthorizationServer` | 13 | 10 | NONE | — |
| 17 | `apps/admin/src/lib/assistant-transport.ts:647` | `startRun` | 12 | – | admin-drift | grandfathered, undocumented (see §3) |
| 18 | `apps/website/src/cli/commands/theme/migrate.ts:18` | `formatSummary` | 12 | – | NONE | — |
| 19 | `apps/website/src/platform/connectors/connector-credential-store.ts:187` | `hydrate` | – | 12 | NONE | — |
| 20 | `apps/website/src/platform/db/sqlite/change-set-repo.sqlite.ts:81` | (arrow fn) | 12 | – | NONE | — |
| 21 | `apps/website/src/platform/http/client.ts:46` | `classifyIpv4` | 12 | 10 | NONE | — |
| 22 | `apps/website/src/platform/oauth/token-endpoint.ts:134` | `requestOAuthToken` | 12 | – | NONE | — |
| 23 | `apps/admin/src/features/pages/Pages.tsx:98` | `Pages` | 11 | – | admin-drift | grandfathered |
| 24 | `apps/website/src/platform/http/client.ts:60` | `classifyIpv6` | 11 | – | NONE | — |
| 25 | `apps/website/src/platform/oauth/authorization-code.ts:94` | `beginAuthorizationCode` | 11 | – | NONE | — |
| 26 | `apps/admin/src/features/settings/ComposioKeyField.tsx:38` | `ComposioKeyField` | 10 | – | admin-drift | grandfathered |
| 27 | `apps/admin/src/features/settings/SettingsUi.tsx:231` | `SettingsUi` | 10 | – | admin-drift | grandfathered |
| 28 | `apps/admin/src/lib/api.ts:1668` | `fetchOrThrowUnreachable` | – | 10 | admin-drift | grandfathered, undocumented (see §3) |
| 29 | `apps/website/src/cli/commands/theme/validate.ts:43` | `runThemeValidateCommand` | – | 10 | NONE | — |
| 30 | `apps/website/src/contracts/core/rate-limit/rate-limit.ts:352` | `resolveClientIp` | 10 | – | NONE | — |
| 31 | `apps/website/src/index.ts:265` | `main` | – | 10 | NONE | — |
| 32 | `apps/website/src/platform/connectors/composio-config-store.ts:241` | `saveComposioApiKey` | 10 | – | NONE | — |
| 33 | `apps/website/src/platform/db/migration/manifest.ts:457` | `classifyCoreColumn` | 10 | 10 | NONE | — |
| 34 | `apps/website/src/platform/db/sqlite/jsonb-column.ts:193` | `decodeScalarPayload` | 10 | – | NONE | — |
| 35 | `apps/website/src/platform/mail/adapters/smtp.nodemailer.ts:85` | `classifySmtpError` | 10 | – | NONE | — |
| 36 | `apps/website/src/platform/site-dir/init-site.ts:135` | `initSite` | – | 10 | NONE | — |

Row 1's function name is a caveat, not a bug: ESLint's `complexity`/`cognitive-complexity`
messages for named function expressions and arrow functions omit a name in some shapes; where the
rule message carried no name (`Arrow function has a complexity of…`) the name was recovered by
reading the source line at the reported line number (row 20 only — the source-derived name could
not be resolved better than "(arrow fn)").

**Worst five overall: rows 1–5** (`SeoEntryPanel` 25, `topologicalTableCopyOrder` 21-cognitive,
`App` 20-cognitive, `buildLocalCliContextRef` 18, `mergeExternalMcpSavePrefill` 18) — three of the
five are already grandfathered; the two live ones are `topologicalTableCopyOrder` (migration
manifest, cognitive 21 — more than double the ceiling) and, tied at 18, `beginDeviceAuthorization`
(row 6, OAuth device-code flow).

## 3. Drift check — grandfathered/baselined entries

Compared this run's live values against the values recorded in each debt file's own notes/comments (the debt files' provenance comments — see `src-complexity-debt.json` and `admin-complexity-debt.json` — are trustworthy: they document exact capture methodology and HEAD SHAs).

**`src-complexity-debt.json` (1 entry) — no drift.** `mergeExternalMcpSavePrefill`: baselined at cyclomatic 18 / no cognitive violation. Fresh measurement: **identical** (18 / –). Exact match.

**`admin-complexity-debt.json` (8 files) — 3 of 8 have drifted worse; 2 have undocumented new violations; 3 are unchanged:**

| File | Recorded (note) | Fresh | Verdict |
|---|---|---|---|
| `App.tsx` | 13 / 12 | **15 / 20** | **Worse** — both dimensions up, cognitive nearly doubled |
| `api.ts` (`request`) | 12 / 10 | **17 / 16** | **Worse** — cyclomatic +5, cognitive +6 |
| `assistant-transport.ts` (`translateRunAgentPayload`) | 12 / (n/a) | **13 / –** | **Worse** — cyclomatic +1 |
| `Media.tsx` | 13 / 21 | 14 / 16 | Mixed — cyclomatic +1, cognitive −5 (binding constraint per the note was cognitive; that improved) |
| `Pages.tsx` | 11 / 9 | 11 / – | Unchanged (cognitive was already exactly at the 9 ceiling — not a violation then or now) |
| `Seo.tsx` | 25 / 6 | 25 / – | Unchanged |
| `ComposioKeyField.tsx` | 10 / 7 | 10 / – | Unchanged |
| `SettingsUi.tsx` | 10 / 7 | 10 / – | Unchanged |

**Undocumented new violations inside already-grandfathered files** — the debt list grandfathers at
file granularity, not function granularity, so this is not a gate failure, but it is real,
unreported growth: `api.ts` now has a **second** violating function, `fetchOrThrowUnreachable`
(cognitive 10), not mentioned in the file's debt note at all. `assistant-transport.ts` now has a
**third**, `startRun` (cyclomatic 12), also undocumented. Neither appears anywhere in
`admin-complexity-debt.json`'s prose. Net across the 8 grandfathered admin files: **3 worse**
(`App.tsx`, `api.ts`, `assistant-transport.ts`), **1 mixed** (`Media.tsx`), **4 unchanged**
(`Pages.tsx`, `Seo.tsx`, `ComposioKeyField.tsx`, `SettingsUi.tsx`). The src-complexity baseline's
one entry is unchanged.

## 4. Coverage per app / per top-level directory

TBD — coverage run was already in progress (started ~18:23 by a prior agent) when this task
began; per the dispatch brief, a second run must not be started. Waiting for
`development/coverage/lcov.info` to stop being 0 bytes.

## 5. Prioritised gap list

TBD

## 6. Cost of a repo-wide gate

TBD

## Numbers not trusted / caveats

TBD

## Commit log

- Skeleton (this commit)
