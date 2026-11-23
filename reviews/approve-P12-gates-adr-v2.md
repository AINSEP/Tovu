APPROVED WITH FIXES

# Approval — `plans/P12-gates-adr-v2.md` (Gate C1, Gate B, Gate C2/DECL, HTTPKIT-MAXBODY, ADR-071, DR-006)

This is the second-agent approver's verdict: an Opus run, unattended in the cloud, on 2026-11-23. The review was read-only. It ran no builds, no tests and no codebase-memory queries.

Role bootstrap: `AI-Dev-Shop/agents/code-review/skills.md` does not exist in this AI-Dev-Shop checkout, so I read the fallback, `AI-Dev-Shop/agents/software-architect/skills.md` (v2.3.2).

I read the plan at Tovu `origin/plan/whats-left-1122` `ad83629191` (the plan cites `a65df40afd`). I checked it against the earlier verdict, `reviews/approve-P12-gates-adr.md`, using these trees:
- Jini `origin/integ/merge-14-2026-11-22` `4902a6a1a`
- Jini `origin/codex/ex2-holds-jini`
- Tovu `origin/integ/merge-13-2026-11-22` `f7185f153a`
- the plan inventory at `a65df40afd`

| Item | Verdict |
|---|---|
| Gate C1 (Jini resolved-source ratchet) | **APPROVED WITH FIXES** (GC.1–GC.2) |
| Gate C2 / DECL (XP3 declarations) | **APPROVED** as a separate, capped run after C1 |
| Gate B (Tovu extraction ratchet) | **APPROVED WITH FIXES** (GB.1–GB.4). Theme exclusion is now exact. |
| HTTPKIT-MAXBODY | **APPROVED WITH FIXES** (GH.1) |
| ADR-071 (Tovu) | **APPROVED WITH FIXES** (GA.1) |
| DR-006 (Jini) | **APPROVED**. It is neutral, with zero hits for Tovu, `@tovu`, 690, 334 or 137. |

None of these fixes reopens a design question. They supply exact data the plan left to the executor, and they align
the plan with cut decisions approved since v2 was written (`reviews/approve-P12-cutplan2.md`, rv-g FIX 2). This is not a
second same-class fix round. The v1 classes (policy undecided, seed bootstrap, Tovu in the Jini ADR, server-specific
example) are all closed.

## Every earlier fix, checked

| Earlier fix | Applied? | Evidence |
|---|---|---|
| C1 approved Core runtime list | **Yes** | The policy seeds `metadata.approvedRuntime` with `<entry>#<symbol>` pairs from the public `exports`. It can grow only in the same change that adds the export, checked against the trusted base. |
| C2 Protocol stays a base package | **Yes** | Stated in the policy and in both ADRs. Protocol `exports` are exactly `.`, `./mcp-ui` and `./a2ui` (verified). `injection-edges.ts:12` is `BASE_PACKAGES = core, protocol`. |
| C3 seed bootstrap | **Yes** | New rule ids `L5-resolved` and `XP4-runtime`. Seeding requires zero entries and no initialized marker, the marker persists, and entries only shrink after that. I verified the pinned debt at 71 `L5-injected-edge` keys and 72 occurrences. |
| C4 baseline invocation | **Yes** | `pnpm exec tsx scripts/injection-baseline.ts` |
| C5 split out XP3 | **Yes** | GATE-DECL has a 45–75 min estimate with a 90 min cap, the asset tag is `xp3-35c4961af` (`publish.yml:28` triggers only on `release-*`), and the C1 CI step does not reference it. Pin `35c4961af` exists. Combine-14 records 3,308 mappings and XP3 112. |
| C6 devops reader is additive | **Yes** | New fields are optional, with a changeset and `api:check`. `RuntimeImportRef` is at `typescript.ts:6` and `createTypeScriptImportReader` at `:122`. |
| C7 function limits | **Yes** | Warn at 50 lines, error above 80, complexity cap 10. |
| C8 anchors by test name | **Yes** | All 7 named tests exist on `ex2-holds-jini`. |
| B1 themes stay in Tovu | **Partly**. The 85 + 1 + 25 rows are exact. The other-area theme rows are left as an executor "reconcile" step. | Fixed below in **GB.1** |
| B2 root overlap | **Yes** for the rule. The kept destinations are now stale. | Fixed below in **GB.2** |
| B3 real admin transport files | **Yes** | The three `owner-*-api.ts` files are bound (`adm-shell-lib`), and `admin-http` holds `config`, `request` and `urls`, all verified. |
| B4 `bound-tovu-contracts` | **Yes** | Covers type and value, aliases and relative spellings. |
| B5 inventory schema | **Yes** | Keys are `area`, `dest`, `f`, `k` and `step` (2,443 rows at `a65df40afd`). |
| B6 `--write-shrink` | **Yes** | One sorted entry per line, run in the same commit. |
| B7 CI comments | **Yes** | Covers both `ci.yml:114` ("always exits 0") and the report-only comment at `:136–137`. |
| ADR1 DR-006 names no host | **Yes** | Zero host mentions in the DR-006 section. Jini `docs/decisions` also has zero. |
| ADR2 server-neutral mount | **Yes** | `app: Server`, `app.route(jsonRoute({ spec, deps, reportInternalError }, { host }))`. This matches `json-route.ts:169–180`. |
| ADR3 named route imports, ports unset | **Yes** | Core `defineJsonRoute` (`json-route.ts:132`) is distinct from http-kit's Express-bound one (`adapter.ts:23`). `mountJsonRoute` is at `adapter.ts:37`. |
| ADR4 plain words, no `@tovu/contracts` in bound code | **Yes** | Both ADRs |
| ADR5 Wiring check and same-change author | **Yes** | Both ADRs. ADR-071 says "each Jini-bound feature folder". |
| ADR6 Gate C wording | **Yes** | Both ADRs |
| ADR7 indexes | **Mostly** | The ADR-071 row and the DR-006 line are supplied. ADR-070 is confirmed missing from the index but not added. Fixed below in **GA.1** |
| maxBodyBytes defect | **Yes** | HTTPKIT-MAXBODY. http-kit has zero `maxBodyBytes` references, and Core reads it at `json-route.ts:97,199`. |

Beyond the table above, I spot-checked 12 more anchors, and all matched:

**Jini**
- These files exist: `import-sites.ts`, `spec-aliases.ts`, `injection-debt.ts`, `injection-gate.ts` and `debt-base.mjs`.
- Core `./contracts/server` (`package.json:26,187`) re-exports `json-route.js` and `result.js`. `Result` is at `result.ts:9`.
- `rejectOversizedJsonBody` is at http-kit `middleware.ts:23`.
- `ci.yml:48,82,85,86` hold `quality-gates`, `id: guard`, `INJECTION_BASE_REF` and `INJECTION_FIRST_PUSH_COMMIT`.

**Tovu**
- These files exist: `.dependency-cruiser.mjs`, `check-feature-ranks.mjs`, `dependency-cruiser.test.ts`, `apps/desktop/tsconfig.main.json` and `json-body-parsers.ts`.
- `ci.yml:116–118` is `gate-boundaries` with `continue-on-error`, and `:309` is the final outcome check.
- `SIZE_BASE_REF` is at `:153`, with the zero-SHA fallback.
- `package.json:59` is `check:boundaries`.
- There are 14 platform rows and 17 desktop rows.
- ADR-070 exists, ADR-071 does not yet, and the index has no 070 row.

## Gate C1: fixes

- **GC.1: debt-file schema.** At the pin, `scripts/injection-debt.json` is `{ _comment, entries }` and has no `metadata`.
  - In step 4, `injection-debt.ts` must parse and validate `metadata: { approvedRuntime: string[], initialized: string[] }`.
  - `approvedRuntime` must be sorted and unique.
  - `initialized` holds rule ids. Reject unknown top-level and metadata keys.
  - In step 6, `injection-baseline.ts` prints that full shape. A printed seed must never drop the metadata.
  - Add one test row: when a head file drops `metadata.approvedRuntime` entries that the base had, and the matching exports are still present, the check fails. Silent narrowing is a policy change too.
- **GC.2: approval key form.**
  - `<public-entry>` is the manifest `exports` key as written, for example `@jini-ai/core/contracts/server#defineJsonRoute`, not a source path.
  - Record the seed SHA in `metadata`. The "adds the export in the same change" check diffs the export sets at the trusted base and at the head for that entry key.

## Gate B: fixes

- **GB.1: theme exclusion is exact, not "reconcile".**
  - **Root rows.** All 85 `apps/website/src/features/theme/**` rows and `contracts/core/tool-metadata/theme.ts` (area `theme`) go host-owned, with disposition `stays: owner 2026-11-22`. So do all 25 `apps/admin/src/features/themes/**` rows (area `adm-themes`).
  - **Other-area rows.** These 34 rows, labelled under other areas at `a65df40afd`, go host-owned with the same disposition:
    - `apps/admin/src/features/admin-themes/{AdminThemes.tsx,admin-themes-i18n.ts,admin-themes.css,index.ts}`
    - `apps/admin/src/features/pages/{ThemePageDetailsModal.hooks.tsx,ThemePageDetailsModal.tsx,ThemePagesTab.tsx}`
    - `apps/admin/src/features/pages/hooks/{theme-canvas-dependencies.hooks.ts,theme-canvas-port.hooks.ts,theme-canvas-wrapper.ts,theme-pages-dependencies.hooks.ts,theme-pages-port.hooks.ts,use-theme-canvas-styling.hooks.ts,use-theme-pages.hooks.ts}`
    - `apps/admin/src/features/pages/lib/theme-page-publish-state.ts`
    - `apps/admin/src/features/plugins/admin-surface-theme.ts`
    - `apps/website/src/features/presentation/set-active-theme.ts`
    - `apps/website/src/features/site-export/{theme-preview-manifest.ts,theme-preview-report.ts}`
    - `apps/website/src/features/trash/adapters/theme.ts`
    - `apps/website/src/server/inbound/admin-http/routes/presentation/{patch-active-theme.ts,rescan-themes.ts}`
    - `apps/website/src/server/inbound/admin-http/routes/themes/{duplicate,explore,list,preview}.ts`
    - `apps/website/src/server/inbound/public-http/middleware/{render-theme-override,theme-asset-dirs,theme-content-security-headers,theme-page-preview,theme-preview-refresh,theme-preview-static,theme-preview-switcher,theme-static-assets}.ts`
  - **Changing a row back.** An executor may change one of these rows back to bound only by splitting it at the seam: the theme part stays, and the generic part gets a new row with an owner note.
  - **Theme roots.** The four roots that apply the disposition automatically to future files:
    - `apps/website/src/features/theme/`
    - `apps/admin/src/features/themes/`
    - `apps/admin/src/features/admin-themes/`
    - `apps/website/src/server/inbound/admin-http/routes/themes/`
  - **Fixture.** Add one row: a file inside any of the four roots is host-owned, and a bound row pointing into one fails inventory validation.
- **GB.2: apply approved overlays to the destinations the plan keeps.** "Keep the 14 bound platform rows and three bound `admin-http` rows and their destinations" no longer holds for five of those rows:

  | Row | Inventory says | Approved since | Inventory disposition |
  |---|---|---|---|
  | `apps/admin/src/lib/admin-http/config.ts` | → Jini `shell/lib/admin-http/config.ts` | rv-g FIX 2 (Jini `c54d9e24`): workspace and URL constants stay in the host | host-owned |
  | `apps/admin/src/lib/admin-http/urls.ts` | → Jini | cut #4: kept at its path because the route-check script reads it | host-owned |
  | `apps/admin/src/lib/admin-http/request.ts` | → Jini, whole file | cut #4: the factory goes to Jini, and the host composition, `ApiError`, `describeApiError` and the listener registry stay | mixed: host symbols listed, behavior → `createAdminHttp` |
  | `apps/website/src/platform/html/escape.ts` | → `packages/cms/src/html/site/escape.ts` | cut #7: retired to `@jini-ai/core/text` | retired, destination `@jini-ai/core/text` |
  | `apps/website/src/platform/html/slug.ts` | → `packages/cms/src/html/site/slug.ts` | cut #7: identical blob already in CMS | retired, destination `@jini-ai/cms/html/site/slug` |

  The other 12 platform rows keep their destinations. The root-overlap exemption still applies.
- **GB.3: keep the dependency-cruiser report byte-compatible.**
  - The new `check:boundaries` command drops the direct `depcruise --config .dependency-cruiser.mjs apps/website/src` call. `--with-report` must run that exact config and path set, and must print the same report to stdout.
  - The handoff's "compares the website report" check becomes a fixture: compare the old and new stdout with the extraction section stripped.
- **GB.4: build order with the cut plan.**
  - Seed Gate B **after** cut #7 lands, or include the #7 deletions in the seed tree. A seed taken before that leaves stale escape and slug allowances that the very next cut would have to shrink.
  - Movers that land before Gate B do not run `--write-shrink`.

## HTTPKIT-MAXBODY: fix

- **GH.1: call shape.** `mountJsonRoute` is currently `({ app, spec, deps, adapter }, _optional: Record<string, never> = {})` (`adapter.ts:37`).
  - Put the measurement port in that second object: `{ bodyBytes?: (required: { req: Request }, optional?: Record<string, never>) => number | undefined }`.
  - Keep `adapter` where it is. Do not add a third positional argument.
  - When the spec has a cap and `bodyBytes` is absent, the mount throws at registration for non-GET routes. Add `maxBodyBytes` to the Pick in http-kit's `defineJsonRoute` optional object (`adapter.ts:23`).
  - Add a changeset and an api-baseline update.

## ADR-071: fix

- **GA.1: indexes.** Add the ADR-070 row (`ADR-070-slim-agent-daemon.md`, title and status taken from its header) to `ADS-memory/reports/architecture/ADR-INDEX.md` in the same change as the ADR-071 row. The earlier verdict flagged it, and leaving a known gap open in the commit that touches the index is churn.

## Ready-to-build order

| Step | Repo | Sheet | Parallel group | Depends on |
|---|---|---|---|---|
| 1 | Tovu | **ADR-071** + index rows (GA.1) | **G1** | none |
| 2 | Jini | **DR-006** + README line | **G1** | none |
| 3 | Jini | **HTTPKIT-MAXBODY** (GH.1) | **G1** | none; disjoint from the C1 files (`packages/http-kit/**` only) |
| 4 | Jini | **Gate C1** (GC.1–GC.2) | G2 | `ex2-holds-jini`, `sec4-jini`, `ex3-c0b-jini` reconciled on the combine tree. Serialize with any Jini change to `packages/devops/src/packaging/electron/typescript.ts`. |
| 5 | Tovu | **Gate B** (GB.1–GB.4) | G2, parallel with step 4 | halves and holds reconciled; cut #7 landed or included in the seed tree (GB.4) |
| 6 | Jini | **Gate C2 / DECL** | serial | step 4 merged. One capped run (≤90 min, no retry), with the cost recorded before launch. |

Parallel-safe sets: {1, 2, 3} and {4, 5}. Steps 4 and 5 run in different repos, but Tovu's
`apps/desktop/scripts/verify-staged-closure.ts` consumes the devops reader that step 4 extends. Step 5 pins the Jini
version it links and re-runs the desktop closure check after step 4 publishes.

**NOT-CHECKED:** whether the combine-tree seed counts are executable, the XP3 digest, any test, mutation or CI run (excluded by the dispatch), and the full size of the `approvedRuntime` list at the seed.
