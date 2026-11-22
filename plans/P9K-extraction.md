# P9K — finish the Tovu → Jini extraction under the owner's K1–K5 answers (plan)

**Author:** Opus cloud planning run, 2026-11-22 (unattended). **Scope:** planning only — no code edits, tests, builds or installs. Extends `plans/P9-extraction.md` (its §1 step contract, owner rules and STOP list still apply to every step) and replaces its §K "blocked" verdict.

**FILES LEFT: 2,486 Jini-bound files still in Tovu (re-measure, old rules) → 2,446 after the Codex/K STAYS reclassification → 0 after batch B180.**

## 0. Bases and re-measure

- Tovu `origin/integ/merge-12-2026-11-22` `41e948ee4` + `codex/ex-sh-tovu` + `codex/ex-core-tovu` + `codex/ex-export-tovu`, merged locally (`-X theirs` on the two content conflicts, `contracts/core/index.ts` and `publish-content/blob-put.ts`; file existence and import lines are what the plan reads). 8,577 files scanned.
- Jini `origin/integ/merge-12-2026-11-22` `6b8e0d48a` + `codex/ex-core-jini`, `ex-export-jini`, `ex-html-jini`, `ex-sh-jini`, `codex/jx-chatlinks` (merged cleanly; treated as landed in `integ/merge-13`).
- Tools: `plans/P9-data/tools/scan.mjs` + `plan.mjs` (unchanged, old rules) for the re-measure; **`planK.mjs`** (new) applies K1–K5 per import edge and writes the sheets, `k-data.json`, `k-work.json`; **`appxK.mjs`** writes the appendices and the INDEX tables. Refresh:
  ```
  node -I plans/P9-data/tools/scan.mjs <Tovu> tv.json
  ROOT=<Tovu> JROOT=<Jini> node -I plans/P9-data/tools/plan.mjs tv.json out
  DONEJ=C-platform-html-1.J,T-post-1.J ROOT=<Tovu> JROOT=<Jini> OLD=plans/P9-steps node -I plans/P9-data/tools/planK.mjs tv.json k
  node -I plans/P9-data/tools/appxK.mjs tv.json out k <plan-repo> <fragments>
  ```
- **Verification:** every importer/K-item `file:line` in the 425 generated sheets was checked against the Tovu tree by script: **12,445 of 12,445 match** (one multi-line `import(` cited by the scanner one line late was corrected to `preview-refresh.test.ts:137`). All 2,059 move sources exist. Hand sheets cite lines checked with `grep -n`/`sed -n`.
- **Re-measure (old rules): 2,486** = 2,483 movable + 3 shells (start 2,509 at merge-12; −18 shells SH-1/SH-2, −5 C-contracts-core-1/2 moves). Exactly the expected ~2,486.
- **After reclassification: 2,446.** 40 more files STAY: 31 Codex FIX/BLOCK policy files (`plans/P9-codex-verify-N1-N4.md`), 7 Express auth/session/static helpers that become the host's route ports under K1, 2 K3 files with product copy and no args object (`contracts/core/admin-locales.ts`, `contracts/core/secret-redaction.ts`). Full list: `plans/P9-data/stays-in-tovu.md` (412 files).

### Files left per area

| area | Jini-bound files left (after Codex/K STAYS) | verbatim (no own K work) | K1 route spec | K2 injected kit | K3 copy arg | K4 type → core | K5 injected collaborator | stays in Tovu (files) | of which newly STAYS (Codex FIX, K1 host ports, K3 no-args) | steps |
|---|---|---|---|---|---|---|---|---|---|---|
| themes | **111** | 80 | 0 | 4 | 0 | 12 | 19 | 0 | 0 | 11 |
| publish-content | **82** | 55 | 0 | 1 | 3 | 21 | 12 | 2 | 1 | 11 |
| post | **109** | 75 | 0 | 10 | 0 | 14 | 15 | 1 | 1 | 12 |
| newsletter | **25** | 13 | 0 | 0 | 0 | 9 | 5 | 0 | 0 | 3 |
| site-backup | **44** | 9 | 0 | 0 | 7 | 19 | 28 | 0 | 0 | 8 |
| deployments | **70** | 32 | 0 | 8 | 7 | 19 | 20 | 0 | 0 | 10 |
| security (admin → Jini admin/security) | **39** | 20 | 0 | 9 | 2 | 8 | 6 | 0 | 0 | 4 |
| rendering/routes | **463** | 71 | 340 | 0 | 6 | 74 | 207 | 7 | 7 | 174 |
| admin screens (other) | **485** | 286 | 0 | 127 | 5 | 54 | 50 | 122 | 0 | 56 |
| admin shell/transport/roles | **266** | 134 | 0 | 105 | 13 | 18 | 31 | 2 | 0 | 32 |
| desktop | **17** | 12 | 0 | 0 | 0 | 3 | 4 | 235 | 0 | 2 |
| users U (members, member-login) | **31** | 17 | 0 | 0 | 0 | 12 | 7 | 0 | 0 | 4 |
| devops other (source-control, site-export, domain-dns) | **37** | 12 | 0 | 0 | 2 | 17 | 18 | 1 | 1 | 6 |
| shared contracts + platform helpers | **110** | 17 | 0 | 0 | 2 | 77 | 34 | 30 | 30 | 19 |
| other generic features (X lane) | **557** | 241 | 0 | 0 | 17 | 208 | 197 | 12 | 0 | 116 |
| **TOTAL** | **2446** | 1074 | 340 | 264 | 64 | 565 | 653 | 412 | 40 | 468 |
Re-measure with the old columns: `plans/P9-data/files-left-table.md`.

## 1. How the answers became rules (per import edge, `planK.mjs`)

Every import of every Jini-bound file gets one mechanism. A file is moved by the step that owns it; a file with no mechanism of its own is a verbatim move that only waited on its dependencies.

| edge | mechanism | owner answer | count (files with it) |
|---|---|---|---|
| route file → `RouteDeps`, `inbound/shared/*`, `platform/express/*`, `request-cookie`, `error-mapping`, admin auth guards | **K1** route spec + its own deps type; host ports from RT-K1-0 | K1 | 340 |
| admin file → `@jini-ai/ui` / `ui-kit` / `chat` | **K2** kit facade (import line only) or a new kit field (A-K2-0a/b/0) | K2, K5 | 264 |
| any file → `@tovu/contracts/*`, admin product dictionaries | **K3** a new field on an existing args/props object; no args object → STAYS | K3 | 64 (2 stay) |
| type-only → Tovu-kept file or another Jini package | **K4** type moves to `@jini-ai/core/contracts/site/*` in a K4 seam step (23 steps); DB schema types → a structural table slice beside the user; `COMMON_I18N` → K4-i18n-common; a type whose definer also moves → lands in core with its definer | K4 | 565 |
| value → Tovu-kept file, another Jini package, a custom hook, a Tovu stylesheet | **K5** collaborator becomes a field of the function's existing args/props; the hook arrives as a prop; the host imports the stylesheet at the mount. Every caller that must pass it is listed in the sheet | K5 | 653 |

Totals overlap (a file can need several). 1,074 of 2,443 movable files need none.

**The 669 "blocked only through blocked deps" (old `via`):** 633 are now plain verbatim moves scheduled after their dependency's step; 36 have K work of their own; none stay.

**The 1,942 formerly blocked files:** every one is assigned — `plans/P9-data/blocked-files.md` lists file → old reason → K work → step (or STAYS with the reason).

## 2. K recipes (what an implementer does; sheets name the specifics)

### K1 — routes (RT-K1 lane, 172 steps, 445 files, 386 route registrations)
- **Base:** RT-K1-0 (sheet `plans/P9-steps/RT-K1-0.md`). Core's `jsonRoute` answers an `err` as `{ error: ServerApiError }` (`packages/core/src/contracts/server/json-route.ts:152`); Tovu routes answer `{ error: string, code }`. Bodies stay byte-identical through the host `onError` port (http-kit `JsonRoutePorts`, `packages/http-kit/src/types.ts:14-18`), using the pattern Tovu already runs for settings (`routes/settings/shared.ts:157,167,209-230`). Its generic half (`RouteRefusalError`) moves to core (K4 split); the Tovu half (`adminJsonRoutePorts`, `publicJsonRoutePorts`) is composition and stays.
- **J:** each Express registrar becomes `export const <name>Route = defineJsonRoute<Input, Output, <Name>RouteDeps, Principal>({ method, path, parse, handle })` (core, `json-route.ts:132`) in `@jini-ai/<pkg>/admin-http/...` or `/public-http/...`. `<Name>RouteDeps` is a NEW small type next to the route naming only the `deps.*` fields the sheet lists (types restated from Jini types; never `RouteDeps`). `rejectForeignWorkspace`/`authorizeOrRespond`/`getAuthedPrincipal` calls disappear into the ports; `sendAdminFailure(res, …)` becomes a thrown error the host `onError` maps; `rejectRoute(...)` for every hand-written status/body; `res.status(201).json(x)` → `successStatus: 201`, `ok({ value: x })`. **Tests first:** one Jini unit test per route (`parse` + `handle` with fake deps) before the conversion.
- **Non-JSON (57 files: streams, uploads, HTML, redirects, SSE, static):** a `ServerRoute` factory (core `contracts/server.ts`, `ServerHandler`: web `Request` → `Response`); the host mounts it through `@jini-ai/http-kit/node-bridge` `createNodeDispatcher` (`node-bridge.ts:387`). Public middleware (theme preview, consent, security headers) follows core `contracts/server/middleware.ts`.
- **T:** delete sources; the registrar that called `register…Route({ app, deps })` calls `mountJsonRoute({ app, spec: { ...spec, ports: adminJsonRoutePorts }, deps: { <only the listed fields from RouteDeps> } })` (`packages/http-kit/src/adapter.ts:37`). **Every Tovu route test stays in Tovu, unchanged — it is the wire-parity proof.** Owner 11-20 holds: no global `RouteDeps` re-wiring; `RouteDeps` is only read at registration.
- Route groups: one feature dir (`routes/<feature>`) plus its `admin-http/http/<feature>.ts` helper per step; split at ≤ ~105 min J / ≤ 110 min T.

### K2 — admin screens on the injected kit (A-K2 lane, 80 steps; one screen per step, split when large)
- Base: A-K2-0a/0b/0 (+0.T) complete `AdminKit` with the 214 missing names (`plans/P9-data/k2-kit-gaps.md`). Names with a facade change only the import line (`packages/admin/src/react/kit.tsx:227`+). The `admin → ui`/`admin → chat` edges disappear. Tests first: the screen's existing vitest suite moves with it and renders under `AdminKitProvider` with Tovu's kit; behaviour changes only if the sheet says so.

### K3 — product copy through args
- No standalone steps: the copy becomes a new field on an args/props object the file already has, inside the step that moves the file; the host passes the Tovu string. 64 files; 2 have no args object and STAY. A step that finds no reachable args object at the use site follows STOP (stays, listed).

### K4 — seam splits (23 `K4-seam-*` steps + K4-i18n-common)
- Types only, to `@jini-ai/core/contracts/site/<slug>`; the Tovu file keeps values/policy and imports the type back; every other importer repoints. Largest: `ToolApprovalPolicy` (`contracts/core/tool-metadata/approval-policy.ts`, 58 users — this answers Codex's BLOCK on C-contracts-core-3/6/7), `HttpClientPort` (`platform/http`, 21), `TovuPublishPorts` → `PublishPorts` (16). Jini-internal type edges (`@jini-ai/daemon/surface-exchanges` 31, `integrations/webhooks` 27, `diagnostics/observability` 18, `platform/mail` 18, …) move in the same steps. A type that references a third-party type (kysely, express, react) cannot enter core (core has no dependencies): users declare the structural slice they read (the K4db rule).

### K5 — inject everything (K5 lane 135 steps; XC-1…XC-6 in Jini)
- The collaborator becomes a field of the function's existing args/deps object or a component prop (keep every `_optional = {}` pad; never a new args object — STOP). Custom hooks arrive as props. The sheet lists every caller that must now pass it (composer side). XC-6a–d (`plans/P9-steps/XC-6.md`) convert `node-adapters` and the `server` preset the same way; XC-1 is unblocked by adding `agents` to the existing `RecoveryPorts` (`packages/chat/src/core/durable-runs/ports.ts:60`).

## 3. Old P9 steps on the new bases

| status | steps |
|---|---|
| DONE (tonight) | C-contracts-core-2, C-presentation-1, D-site-export-1; J halves of C-platform-html-1 and T-post-1 (their T halves remain) |
| PART-DONE | C-contracts-core-1: `extension-capability-vocabulary.ts` held under STOP 5 (a Tovu guard regex); owner: approve rewriting the regex to the Jini specifier |
| VALID (65) | sheet stands; re-run the refresh and apply Codex's FIX notes (T-theme-1: add `handlebars`/`liquidjs` to cms, keep `entry-list-render.test.ts`, `liquid-allowlist.test.ts`, `references.test.ts` in Tovu; C-contracts-headless-1: the barrel test and the missed `@tovu/headless` consumers) |
| SUPERSEDED (22) | their files are in K steps now (C-contracts-core-3…6, C-platform-routing-1, D-*, P-publish-content-1, R-public-http-2, T-newsletter-1, T-theme-2, U-members-1, X-comments/consent/custom-credentials/database/origin/recovery/site-inspection/taxonomy-1) |
| ALL-STAY (2) | C-contracts-core-7, P-publish-content-ui-1 (Codex: Tovu policy) |

Hand lanes still open: SH-3 (owner decision, `plans/P9-steps/SH-3.md`), XC-1…5 (Jini), SEC-0 → SEC-1…n → SEC-T1, S6b, S7b (after X-media-1), RN-J1…J4/RN-T1 (last slot of a night, unchanged). **RT-1/RT-2 stay BLOCKED** (Codex: Jini `scripts/injection-exceptions.json` freezes `sqlite`/`infra` until the next major) and are not batched.

## 4. Parallel batches and the curve

`planK.mjs` batches all 1,003 items (402 K steps + 23 seam steps + 66 old steps, each J and T, plus hand lanes): ≤ 6 implementers per batch, ≤ 2 J items per Jini package, T items on disjoint Tovu files (sources + every importer), deps respected, Tovu halves first, then the lane bases (RT-K1-0, A-K2-0a/b, K4-i18n-common, K4-seam-*) so every lane opens in B1–B3, then the J items that unlock the most files. 70 step-dependency cycles were cut at the lower-level step (sheet header: "Cycle cut").

**180 batches at 6-wide ≈ 278 h of wall time** (sum of each batch's longest item); ≈ 1,060 implementer-hours in total. The dependency critical path is only 25 items: at 12-wide the same plan packs into 136 batches. No item needs a Jini publish before its Tovu half — every T runs on a linked Jini tree. Two T steps add a dependency to a Tovu manifest (**LOCK**: root/desktop gain `@jini-ai/admin`): A-K2-shell-lib-1.T, K5-publish-content-ui-1.T.

### Projected curve

| after batch | files left | cumulative wall (h, sum of batch max est) |
|---|---|---|
| start | 2,446 | 0 |
| B10 | 2,344 | 17 |
| B20 | 2,096 | 33 |
| B30 | 1,869 | 50 |
| B40 | 1,732 | 66 |
| B50 | 1,576 | 83 |
| B60 | 1,436 | 97 |
| B80 | 1,143 | 130 |
| B100 | 869 | 160 |
| B120 | 445 | 194 |
| B140 | 193 | 225 |
| B160 | 105 | 251 |
| B180 | 0 | 278 |

### First 15 batches (full table: §8; step rows with deps: `INDEX-EXTRACTION.md`)

| B1 | T-post-1.T, SH-3, SEC-0, RT-K1-0.J, A-K2-0a.J, K4-i18n-common.J | 110 min | 2,436 |
| B2 | C-platform-html-1.T, RT-K1-0.T, K4-i18n-common.T, A-K2-0b.J, K4-seam-1.J, K4-seam-2.J | 110 min | 2,433 |
| B3 | K4-seam-1.T, K4-seam-2.T, K4-contracts-core-5.J, A-K2-0.J, K4-seam-3.J, A-adm-other-1.J | 110 min | 2,433 |
| B4 | K4-contracts-core-5.T, A-adm-other-1.T, A-K2-0.T, K4-seam-3.T, K4-seam-4.J, K4-seam-5.J | 110 min | 2,403 |
| B5 | K4-seam-5.T, K4-seam-4.T, K4-seam-6.J, K4-seam-7.J, A-adm-other-2.J, A-adm-other-3.J | 89 min | 2,403 |
| B6 | A-adm-other-2.T, K4-seam-6.T, K4-seam-7.T, K4-seam-8.J, K4-seam-9.J, K5-deployments-1.J | 99 min | 2,389 |
| B7 | K5-deployments-1.T, A-adm-other-3.T, K4-seam-8.T, K4-seam-9.T, K4-seam-10.J, K4-seam-11.J | 93 min | 2,360 |
| B8 | K4-seam-10.T, K4-seam-11.T, K4-plugins-1.J, K4-seam-12.J, K4-seam-13.J, A-adm-shell-components-1.J | 110 min | 2,360 |
| B9 | A-adm-shell-components-1.T, K4-plugins-1.T, K4-seam-13.T, K4-seam-12.T, K4-seam-14.J, K4-seam-15.J | 98 min | 2,344 |
| B10 | K4-seam-15.T, K4-seam-14.T, K4-contracts-headless-1.J, K4-seam-16.J, A-adm-shell-lib-2.J, R-public-http-1.J | 91 min | 2,344 |
| B11 | A-adm-shell-lib-2.T, R-public-http-1.T, K4-contracts-headless-1.T, K4-seam-16.T, K4-seam-17.J, K4-seam-18.J | 99 min | 2,309 |
| B12 | K4-seam-17.T, K4-seam-18.T, K4-seam-19.J, K4-seam-20.J, A-adm-shell-lib-1.J, DT-desktop-1.J | 99 min | 2,309 |
| B13 | A-adm-shell-lib-1.T, DT-desktop-1.T, K4-seam-20.T, K4-seam-19.T, K4-seam-21.J, K4-seam-22.J | 91 min | 2,285 |
| B14 | K4-seam-21.T, K4-seam-22.T, K4-seam-23.J, K5-contracts-core-4.J, X-agent-plugins-1.J, K5-publish-content-1.J | 96 min | 2,285 |
| B15 | K5-contracts-core-4.T, X-agent-plugins-1.T, K4-seam-23.T, T-theme-1.J, X-identity-1.J, X-media-1.J | 76 min | 2,257 |

## 5. What stays in Tovu (412 files; `plans/P9-data/stays-in-tovu.md`)

| what | why |
|---|---|
| `apps/desktop/src` (235) | packaging, site management, owner store, `tovu-server` |
| admin product screens (122) | `ai-assistant`, `dashboard`, `playground`, `admin-ui`, `workspace`, `sites`, `voice-input` |
| admin composition and look | `App*`, `nav.ts`, `panels*`, `admin-themes/`, `styles/`, `lib/i18n*` (product half after K4-i18n-common) |
| website product features (12) | `sites`, `site-guide`, `site-evidence`, `site-glue`, `admin-parity` |
| Codex FIX/BLOCK policy files (31) | approval policy, gated-mutation gateway/composition/token, runtime mode, theme ids/slots, settings vocabulary, site-key state, scheduled publish, widget tables, menu render, safe-url, published-webmcp strip, export-failure summary, publish sections, … — their **types** move to core (K4) |
| K1 host ports (7) | `admin-http/{authorize-guard,dev-auth,local-admin-request,admin-dev-proxy,admin-static,sea-runtime,publish-trust-auth}.ts` — become `adminJsonRoutePorts`/serving |
| K3 no-args (2) | `contracts/core/admin-locales.ts`, `contracts/core/secret-redaction.ts` |
| composition | `server/runtime/**`, route registration, `assistant/**`, `platform/db` schema/migrations, `platform/site-dir`, product-named `tovu-*` files |

## 6. Risks and owner flags

1. **RouteRefusalError in core** (RT-K1-0) is the generic half of Tovu's existing settings pattern (K4 seam). The alternative — core's canonical `{ error: { code, message } }` envelope — changes ~440 route bodies and breaks visitor/theme JS; this plan does not do that.
2. **57 non-JSON routes** become core `ServerRoute`s, not `defineJsonRoute` specs (a JSON spec cannot stream, redirect or serve HTML). Still framework-neutral.
3. **Heuristics, re-checked in every step:** type-only detection reads the import statement; "has an args object" for K3 is a regex pre-screen; effort is a model (base + LOC + per-mechanism minutes, capped at 120). STOP rules catch the misses.
4. **45 Jini-bound files carry > 10 product words** (13 dictionaries, e.g. `deployment-i18n.tsx` W197): product-name strings go through K3 (args), never renamed in place; literals still go to `plans/P9-BREAKS.md`.
5. Owner decisions still open: SH-3 (drop a test block), C-contracts-core-1's held file (guard regex), RT-1/RT-2 freeze until the next major.

## 7. PARTIAL / not done in this run

- Step sheets are generated; the per-route `Input`/`Output` types and the exact `RouteDeps` field types are named by field only (the implementer restates each type from Jini sources).
- SEC-1…n are still defined only by SEC-0's parity report.
- `apps/site-chat` (26 files) remains outside AREAS (AG-UI plan).
- RN sheets unchanged; RN stays the last slot of each night.

## 8. All batches

| batch | items (≤6, one implementer each) | max est | files left after |
|---|---|---|---|
| B1 | T-post-1.T, SH-3, SEC-0, RT-K1-0.J, A-K2-0a.J, K4-i18n-common.J | 110 min | 2,436 |
| B2 | C-platform-html-1.T, RT-K1-0.T, K4-i18n-common.T, A-K2-0b.J, K4-seam-1.J, K4-seam-2.J | 110 min | 2,433 |
| B3 | K4-seam-1.T, K4-seam-2.T, K4-contracts-core-5.J, A-K2-0.J, K4-seam-3.J, A-adm-other-1.J | 110 min | 2,433 |
| B4 | K4-contracts-core-5.T, A-adm-other-1.T, A-K2-0.T, K4-seam-3.T, K4-seam-4.J, K4-seam-5.J | 110 min | 2,403 |
| B5 | K4-seam-5.T, K4-seam-4.T, K4-seam-6.J, K4-seam-7.J, A-adm-other-2.J, A-adm-other-3.J | 89 min | 2,403 |
| B6 | A-adm-other-2.T, K4-seam-6.T, K4-seam-7.T, K4-seam-8.J, K4-seam-9.J, K5-deployments-1.J | 99 min | 2,389 |
| B7 | K5-deployments-1.T, A-adm-other-3.T, K4-seam-8.T, K4-seam-9.T, K4-seam-10.J, K4-seam-11.J | 93 min | 2,360 |
| B8 | K4-seam-10.T, K4-seam-11.T, K4-plugins-1.J, K4-seam-12.J, K4-seam-13.J, A-adm-shell-components-1.J | 110 min | 2,360 |
| B9 | A-adm-shell-components-1.T, K4-plugins-1.T, K4-seam-13.T, K4-seam-12.T, K4-seam-14.J, K4-seam-15.J | 98 min | 2,344 |
| B10 | K4-seam-15.T, K4-seam-14.T, K4-contracts-headless-1.J, K4-seam-16.J, A-adm-shell-lib-2.J, R-public-http-1.J | 91 min | 2,344 |
| B11 | A-adm-shell-lib-2.T, R-public-http-1.T, K4-contracts-headless-1.T, K4-seam-16.T, K4-seam-17.J, K4-seam-18.J | 99 min | 2,309 |
| B12 | K4-seam-17.T, K4-seam-18.T, K4-seam-19.J, K4-seam-20.J, A-adm-shell-lib-1.J, DT-desktop-1.J | 99 min | 2,309 |
| B13 | A-adm-shell-lib-1.T, DT-desktop-1.T, K4-seam-20.T, K4-seam-19.T, K4-seam-21.J, K4-seam-22.J | 91 min | 2,285 |
| B14 | K4-seam-21.T, K4-seam-22.T, K4-seam-23.J, K5-contracts-core-4.J, X-agent-plugins-1.J, K5-publish-content-1.J | 96 min | 2,285 |
| B15 | K5-contracts-core-4.T, X-agent-plugins-1.T, K4-seam-23.T, T-theme-1.J, X-identity-1.J, X-media-1.J | 76 min | 2,257 |
| B16 | K5-publish-content-1.T, T-theme-1.T, X-media-1.T, K5-theme-1.J, K5-identity-1.J, K5-plugin-runtime-1.J | 101 min | 2,226 |
| B17 | K5-theme-1.T, X-identity-1.T, A-adm-shell-lib-3.J, A-adm-themes-1.J, K5-contracts-core-2.J, K5-site-backup-1.J | 107 min | 2,201 |
| B18 | K5-identity-1.T, K5-plugin-runtime-1.T, A-adm-shell-lib-3.T, K5-site-backup-1.T, A-adm-other-4.J, A-adm-other-5.J | 103 min | 2,166 |
| B19 | A-adm-other-4.T, A-adm-other-5.T, A-adm-themes-1.T, K5-contracts-core-2.T, A-adm-posts-1.J, A-adm-shell-components-2.J | 104 min | 2,121 |
| B20 | A-adm-posts-1.T, A-adm-shell-components-2.T, A-adm-pages-1.J, A-adm-shell-lib-4.J, K5-web-screenshot-1.J, X-trash-1.J | 99 min | 2,096 |
| B21 | A-adm-pages-1.T, K5-web-screenshot-1.T, X-trash-1.T, A-adm-shell-hooks-1.J, A-K2-shell-components-2.J, K5-contracts-core-1.J | 95 min | 2,071 |
| B22 | A-adm-shell-hooks-1.T, A-K2-shell-components-2.T, K5-contracts-core-1.T, K5-contracts-core-6.J, A-K2-shell-lib-1.J, A-K2-shell-components-1.J | 104 min | 2,046 |
| B23 | K5-contracts-core-6.T, A-adm-shell-lib-4.T, A-K2-plugins-1.J, A-K2-shell-lib-2.J, K5-platform-mail-1.J, X-plugin-runtime-1.J | 104 min | 2,021 |
| B24 | A-K2-plugins-1.T, K5-platform-mail-1.T, X-plugin-runtime-1.T, A-K2-shell-hooks-1.J, X-settings-1.J, K5-agent-plugins-1.J | 104 min | 1,998 |
| B25 | A-K2-shell-hooks-1.T, A-K2-shell-components-1.T, X-settings-1.T, K5-agent-plugins-1.T, K5-settings-1.J, K5-contracts-core-3.J | 92 min | 1,968 |
| B26 | K5-settings-1.T, A-K2-shell-lib-1.T, K5-contracts-core-3.T, K4-publish-content-2.J, K5-webhooks-1.J, K5-desktop-1.J | 109 min | 1,945 |
| B27 | A-K2-shell-lib-2.T, K5-webhooks-1.T, K5-desktop-1.T, K5-publish-content-ui-1.J, K5-site-backup-2.J, K5-external-mcp-1.J | 92 min | 1,926 |
| B28 | K5-external-mcp-1.T, K4-publish-content-2.T, K5-publish-content-3.J, K5-tool-audit-1.J, C-contracts-headless-1.J, P-publish-trust-1.J | 104 min | 1,918 |
| B29 | K5-publish-content-3.T, K5-site-backup-2.T, C-contracts-headless-1.T, K5-publish-trust-1.J, X-navigation-1.J, A-K2-shell-lib-3.J | 106 min | 1,891 |
| B30 | K5-publish-content-ui-1.T, K5-publish-trust-1.T, K5-tool-audit-1.T, A-K2-shell-lib-3.T, RT-K1-adm-assistant-1.J, RT-K1-adm-publish-content-1.J | 88 min | 1,869 |
| B31 | P-publish-trust-1.T, RT-K1-adm-assistant-1.T, RT-K1-adm-publish-content-2.J, RT-K1-adm-redirects-1.J, K5-contracts-core-7.J, K5-server-logs-1.J | 90 min | 1,860 |
| B32 | X-navigation-1.T, RT-K1-adm-publish-content-2.T, RT-K1-adm-redirects-1.T, K5-contracts-core-7.T, K5-custom-credentials-1.J, RT-K1-adm-redirects-2.J | 104 min | 1,843 |
| B33 | K5-custom-credentials-1.T, RT-K1-adm-redirects-2.T, A-adm-recovery-1.J, R-admin-http-1.J, SEC-adm-security-1.J, X-identity-2.J | 104 min | 1,830 |
| B34 | RT-K1-adm-publish-content-1.T, A-adm-recovery-1.T, R-admin-http-1.T, SEC-adm-security-1.T, X-identity-2.T, RT-K1-adm-forms-1.J | 89 min | 1,810 |
| B35 | RT-K1-adm-forms-1.T, K5-server-logs-1.T, RT-K1-adm-seo-1.J, RT-K1-adm-forms-2.J, X-mail-status-1.J, X-webhooks-1.J | 105 min | 1,801 |
| B36 | RT-K1-adm-seo-1.T, RT-K1-adm-forms-2.T, X-mail-status-1.T, X-webhooks-1.T, A-K2-admin-themes-1.J, RT-K1-adm-assistant-2.J | 99 min | 1,784 |
| B37 | A-K2-admin-themes-1.T, RT-K1-adm-assistant-2.T, RT-K1-adm-assistant-3.J, RT-K1-adm-assistant-4.J, X-database-transfer-1.J, X-skills-1.J | 90 min | 1,778 |
| B38 | RT-K1-adm-assistant-3.T, X-database-transfer-1.T, X-skills-1.T, K5-skills-1.J, RT-K1-adm-system-1.J, K5-platform-routing-1.J | 84 min | 1,769 |
| B39 | K5-skills-1.T, RT-K1-adm-assistant-4.T, RT-K1-adm-system-1.T, K5-platform-routing-1.T, K5-theme-2.J, RT-K1-pub-site-1.J | 99 min | 1,756 |
| B40 | K5-theme-2.T, RT-K1-pub-site-1.T, K5-theme-3.J, K5-post-1.J, A-K2-redirects-1.J, A-K2-seo-1.J | 89 min | 1,732 |
| B41 | K5-theme-3.T, K5-post-1.T, A-K2-redirects-1.T, K5-post-2.J, RT-K1-adm-skills-1.J, A-adm-deployment-1.J | 110 min | 1,715 |
| B42 | K5-post-2.T, RT-K1-adm-skills-1.T, A-K2-seo-1.T, A-adm-deployment-1.T, K5-post-3.J, K5-presentation-1.J | 97 min | 1,704 |
| B43 | K5-post-3.T, K5-settings-2.J, X-content-types-1.J, A-adm-posts-2.J, A-adm-publish-content-1.J, X-analytics-1.J | 109 min | 1,690 |
| B44 | K5-presentation-1.T, K5-settings-2.T, A-adm-posts-2.T, A-adm-publish-content-1.T, X-analytics-1.T, K5-widgets-1.J | 82 min | 1,678 |
| B45 | K5-widgets-1.T, X-entries-1.J, X-forms-1.J, X-external-mcp-1.J, X-vendor-credentials-1.J, A-K2-shell-lib-4.J | 78 min | 1,673 |
| B46 | X-content-types-1.T, X-forms-1.T, X-vendor-credentials-1.T, A-K2-shell-lib-4.T, A-K2-collections-1.J, A-K2-media-1.J | 120 min | 1,664 |
| B47 | A-K2-collections-1.T, X-entries-1.T, X-external-mcp-1.T, A-K2-posts-1.J, K5-source-control-1.J, A-K2-pages-1.J | 104 min | 1,643 |
| B48 | A-K2-media-1.T, K5-source-control-1.T, A-K2-themes-1.J, A-K2-import-export-1.J, RT-K1-adm-sites-1.J, RT-K1-adm-sites-2.J | 109 min | 1,617 |
| B49 | A-K2-posts-1.T, RT-K1-adm-sites-1.T, A-K2-shell-components-3.J, A-K2-fs-files-1.J, K5-content-types-1.J, K5-origin-1.J | 105 min | 1,603 |
| B50 | A-K2-pages-1.T, A-K2-shell-components-3.T, RT-K1-adm-sites-2.T, K5-content-types-1.T, K5-origin-1.T, A-K2-shell-components-4.J | 99 min | 1,576 |
| B51 | A-K2-shell-components-4.T, A-K2-themes-1.T, A-K2-auth-1.J, A-K2-comments-1.J, X-content-duplication-1.J, X-form-destinations-1.J | 67 min | 1,554 |
| B52 | A-K2-import-export-1.T, X-content-duplication-1.T, X-form-destinations-1.T, K4-content-duplication-1.J, A-K2-forms-1.J, A-K2-widgets-1.J | 60 min | 1,540 |
| B53 | A-K2-auth-1.T, K4-content-duplication-1.T, X-fs-files-1.J, X-pages-1.J, K5-contracts-headless-2.J, K5-observability-1.J | 60 min | 1,530 |
| B54 | A-K2-fs-files-1.T, X-fs-files-1.T, X-pages-1.T, K5-contracts-headless-2.T, K5-trash-1.J, A-K2-webmcp-1.J | 102 min | 1,521 |
| B55 | K5-trash-1.T, A-K2-comments-1.T, A-K2-webmcp-1.T, K4-trash-2.J, X-webmcp-1.J, V-agent-plugins-2.J | 101 min | 1,502 |
| B56 | K4-trash-2.T, A-K2-forms-1.T, X-webmcp-1.T, RT-K1-adm-trash-1.J, K5-settings-3.J, K5-agent-plugins-3.J | 97 min | 1,494 |
| B57 | RT-K1-adm-trash-1.T, A-K2-widgets-1.T, K5-settings-3.T, K5-agent-plugins-3.T, K5-comments-1.J, K5-analytics-1.J | 106 min | 1,482 |
| B58 | K5-comments-1.T, V-agent-plugins-2.T, K5-observability-1.T, RT-K1-adm-comments-1.J, RT-K1-adm-settings-1.J, K5-agent-plugins-4.J | 104 min | 1,470 |
| B59 | K5-analytics-1.T, RT-K1-adm-comments-1.T, RT-K1-adm-settings-1.T, K5-api-connections-1.J, RT-K1-adm-settings-2.J, RT-K1-adm-assistant-5.J | 103 min | 1,455 |
| B60 | K5-api-connections-1.T, RT-K1-adm-settings-2.T, RT-K1-adm-assistant-5.T, K5-external-mcp-2.J, X-workspace-1.J, RT-K1-adm-analytics-1.J | 88 min | 1,436 |
| B61 | K5-external-mcp-2.T, X-workspace-1.T, RT-K1-adm-analytics-1.T, K5-external-mcp-3.J, RT-K1-adm-external-mcp-1.J, K5-workspace-1.J | 108 min | 1,431 |
| B62 | K5-external-mcp-3.T, RT-K1-adm-external-mcp-1.T, K5-agent-plugins-4.T, RT-K1-adm-external-mcp-2.J, RT-K1-adm-external-mcp-5.J, K5-platform-mail-2.J | 120 min | 1,420 |
| B63 | RT-K1-adm-external-mcp-2.T, K5-workspace-1.T, K5-members-1.J, K5-newsletter-1.J, K5-domain-dns-1.J, RT-K1-adm-system-2.J | 103 min | 1,416 |
| B64 | K5-members-1.T, K5-newsletter-1.T, RT-K1-adm-system-2.T, RT-K1-adm-external-mcp-5.T, K5-contracts-core-8.J, RT-K1-adm-comments-2.J | 106 min | 1,384 |
| B65 | K5-domain-dns-1.T, K5-contracts-core-8.T, RT-K1-adm-comments-2.T, RT-K1-adm-commerce-1.J, RT-K1-adm-content-1.J, V-contracts-core-9.J | 74 min | 1,371 |
| B66 | RT-K1-adm-commerce-1.T, RT-K1-adm-content-1.T, K5-platform-mail-2.T, K5-newsletter-2.J, RT-K1-adm-workspace-1.J, RT-K1-adm-content-types-1.J | 97 min | 1,368 |
| B67 | K5-newsletter-2.T, RT-K1-adm-workspace-1.T, RT-K1-adm-content-types-1.T, K5-members-2.J, RT-K1-adm-entries-1.J, K5-contracts-core-10.J | 94 min | 1,348 |
| B68 | K5-members-2.T, RT-K1-adm-entries-1.T, K5-agent-plugins-5.J, K5-project-keys-1.J, K5-taxonomy-1.J, K5-fs-files-1.J | 82 min | 1,334 |
| B69 | K5-agent-plugins-5.T, K5-agent-plugins-6.J, K5-custom-credentials-2.J, K5-database-1.J, K5-entries-1.J, K5-identity-2.J | 109 min | 1,324 |
| B70 | K5-agent-plugins-6.T, K5-taxonomy-1.T, K5-agent-plugins-7.J, K5-custom-credentials-3.J, RT-K1-adm-api-keys-1.J, RT-K1-adm-taxonomy-1.J | 102 min | 1,306 |
| B71 | K5-agent-plugins-7.T, K5-custom-credentials-2.T, RT-K1-adm-api-keys-1.T, RT-K1-adm-taxonomy-1.T, V-contracts-core-9.T, K5-agent-plugins-8.J | 113 min | 1,278 |
| B72 | K5-agent-plugins-8.T, K5-entries-1.T, K5-mail-1.J, K5-api-connections-2.J, K5-form-destinations-1.J, K5-recovery-1.J | 87 min | 1,261 |
| B73 | K5-mail-1.T, K5-form-destinations-1.T, K5-fs-files-1.T, K5-contracts-core-10.T, K5-mail-status-1.J, RT-K1-adm-taxonomy-2.J | 81 min | 1,231 |
| B74 | K5-api-connections-2.T, RT-K1-adm-taxonomy-2.T, RT-K1-adm-users-1.J, K5-deployments-3.J, RT-K1-adm-agent-plugins-1.J, K5-mail-status-2.J | 93 min | 1,220 |
| B75 | K5-project-keys-1.T, RT-K1-adm-users-1.T, K5-deployments-3.T, RT-K1-adm-agent-plugins-1.T, RT-K1-adm-users-2.J, RT-K1-adm-users-5.J | 103 min | 1,204 |
| B76 | K5-custom-credentials-3.T, RT-K1-adm-users-2.T, RT-K1-adm-users-6.J, RT-K1-adm-agent-plugins-3.J, K5-external-mcp-4.J, V-members-3.J | 90 min | 1,195 |
| B77 | K5-database-1.T, RT-K1-adm-users-5.T, RT-K1-adm-agent-plugins-3.T, K5-member-login-1.J, RT-K1-adm-members-1.J, K5-site-search-1.J | 91 min | 1,184 |
| B78 | K5-member-login-1.T, K5-mail-status-1.T, RT-K1-adm-users-6.T, K5-site-search-1.T, RT-K1-adm-members-2.J, RT-K1-adm-agent-plugins-4.J | 102 min | 1,165 |
| B79 | K5-identity-2.T, RT-K1-adm-members-1.T, RT-K1-adm-agent-plugins-4.T, RT-K1-adm-fs-files-1.J, RT-K1-adm-newsletter-1.J, K5-newsletter-3.J | 83 min | 1,154 |
| B80 | K5-recovery-1.T, RT-K1-adm-members-2.T, RT-K1-adm-fs-files-1.T, RT-K1-adm-newsletter-1.T, RT-K1-adm-newsletter-4.J, RT-K1-adm-newsletter-2.J | 97 min | 1,143 |
| B81 | RT-K1-adm-newsletter-4.T, K5-mail-status-2.T, V-members-3.T, RT-K1-adm-newsletter-3.J, RT-K1-adm-newsletter-5.J, K5-web-screenshot-2.J | 85 min | 1,136 |
| B82 | RT-K1-adm-newsletter-2.T, K5-external-mcp-4.T, RT-K1-adm-newsletter-6.J, RT-K1-adm-newsletter-7.J, K5-webhooks-2.J, K5-webhooks-3.J | 95 min | 1,132 |
| B83 | RT-K1-adm-newsletter-3.T, K5-newsletter-3.T, K5-webhooks-2.T, K5-webhooks-4.J, RT-K1-adm-system-3.J, RT-K1-adm-taxonomy-3.J | 120 min | 1,127 |
| B84 | RT-K1-adm-newsletter-5.T, K5-webhooks-4.T, RT-K1-adm-taxonomy-3.T, K5-media-1.J, K5-publish-content-4.J, K5-database-transfer-1.J | 95 min | 1,119 |
| B85 | K5-media-1.T, RT-K1-adm-newsletter-6.T, RT-K1-adm-system-3.T, K5-web-screenshot-2.T, K5-vendor-credentials-1.J, RT-K1-adm-integrations-1.J | 92 min | 1,102 |
| B86 | K5-publish-content-4.T, K5-vendor-credentials-1.T, RT-K1-adm-integrations-1.T, RT-K1-adm-newsletter-7.T, K5-deployments-2.J, K5-source-control-2.J | 98 min | 1,079 |
| B87 | K5-database-transfer-1.T, K5-source-control-2.T, K5-deployments-4.J, RT-K1-adm-integrations-2.J, K5-source-control-3.J, RT-K1-adm-users-3.J | 95 min | 1,067 |
| B88 | K5-deployments-2.T, RT-K1-adm-integrations-2.T, RT-K1-adm-users-3.T, RT-K1-adm-system-10.J, RT-K1-adm-users-4.J, K5-custom-credentials-4.J | 88 min | 1,054 |
| B89 | K5-deployments-4.T, RT-K1-adm-system-10.T, RT-K1-adm-users-4.T, RT-K1-adm-users-7.J, RT-K1-adm-users-8.J, K5-database-transfer-2.J | 94 min | 1,043 |
| B90 | K5-source-control-3.T, RT-K1-adm-users-7.T, RT-K1-adm-users-9.J, RT-K1-adm-workspace-2.J, A-adm-members-1.J, A-adm-roles-1.J | 81 min | 1,038 |
| B91 | RT-K1-adm-users-8.T, RT-K1-adm-workspace-2.T, K5-custom-credentials-4.T, A-adm-members-1.T, A-adm-roles-1.T, A-K2-roles-1.J | 86 min | 1,031 |
| B92 | A-K2-roles-1.T, RT-K1-adm-users-9.T, K5-database-transfer-2.T, K5-webhooks-3.T, A-K2-roles-2.J, K5-media-2.J | 119 min | 1,011 |
| B93 | A-K2-roles-2.T, K5-media-2.T, RT-K1-pub-agent-plugin-surfaces-1.J, K5-settings-4.J, A-adm-source-control-1.J, A-adm-users-1.J | 70 min | 1,007 |
| B94 | RT-K1-pub-agent-plugin-surfaces-1.T, K5-settings-4.T, A-adm-source-control-1.T, A-adm-users-1.T, A-adm-other-6.J, RT-K1-adm-agent-plugins-5.J | 78 min | 1,001 |
| B95 | A-adm-other-6.T, RT-K1-adm-agent-plugins-5.T, A-K2-integrations-1.J, A-K2-menus-1.J, RT-K1-adm-api-keys-2.J, RT-K1-adm-content-types-2.J | 69 min | 988 |
| B96 | A-K2-integrations-1.T, RT-K1-adm-api-keys-2.T, RT-K1-adm-content-types-2.T, A-K2-email-1.J, A-K2-plugins-2.J, RT-K1-adm-database-1.J | 94 min | 973 |
| B97 | A-K2-email-1.T, RT-K1-adm-database-1.T, A-K2-settings-1.J, A-K2-providers-1.J, RT-K1-adm-database-recovery-1.J, RT-K1-adm-external-mcp-3.J | 91 min | 956 |
| B98 | A-K2-plugins-2.T, RT-K1-adm-database-recovery-1.T, RT-K1-adm-external-mcp-3.T, A-K2-plugins-3.J, A-K2-security-1.J, RT-K1-adm-database-2.J | 94 min | 938 |
| B99 | A-K2-plugins-3.T, A-K2-security-1.T, RT-K1-adm-database-2.T, A-K2-deployment-1.J, A-K2-skills-1.J, RT-K1-adm-recovery-1.J | 91 min | 903 |
| B100 | A-K2-deployment-1.T, A-K2-skills-1.T, RT-K1-adm-recovery-1.T, A-K2-shell-components-5.J, A-K2-source-control-1.J, RT-K1-adm-recovery-2.J | 98 min | 869 |
| B101 | A-K2-settings-1.T, RT-K1-adm-recovery-2.T, A-K2-shell-lib-5.J, A-K2-shell-lib-6.J, RT-K1-adm-owner-mfa-deps-1.J, RT-K1-adm-plugin-hook-error-1.J | 104 min | 851 |
| B102 | A-K2-shell-components-5.T, A-K2-source-control-1.T, RT-K1-adm-owner-mfa-deps-1.T, RT-K1-adm-plugin-hook-error-1.T, A-K2-settings-2.J, A-K2-shell-components-6.J | 104 min | 826 |
| B103 | A-K2-settings-2.T, A-K2-shell-lib-5.T, A-K2-providers-1.T, A-K2-shell-lib-7.J, RT-K1-adm-widgets-1.J, A-K2-shell-hooks-3.J | 96 min | 792 |
| B104 | A-K2-shell-lib-6.T, RT-K1-adm-widgets-1.T, A-K2-observability-1.J, A-K2-publish-content-1.J, RT-K1-adm-widgets-3.J, RT-K1-adm-widgets-2.J | 105 min | 778 |
| B105 | A-K2-observability-1.T, A-K2-shell-components-6.T, A-K2-shell-lib-7.T, RT-K1-adm-widgets-3.T, A-K2-shell-components-7.J, A-K2-pages-2.J | 99 min | 745 |
| B106 | A-K2-publish-content-1.T, A-K2-pages-2.T, RT-K1-adm-widgets-2.T, A-K2-posts-2.J, A-K2-consent-1.J, RT-K1-adm-publish-content-3.J | 101 min | 720 |
| B107 | A-K2-posts-2.T, A-K2-shell-components-7.T, A-K2-consent-1.T, RT-K1-adm-publish-content-3.T, A-K2-security-2.J, A-K2-email-2.J | 84 min | 682 |
| B108 | A-K2-security-2.T, A-K2-menus-1.T, A-K2-shell-hooks-3.T, A-K2-analytics-1.J, A-K2-content-analysis-1.J, RT-K1-adm-owner-passkey-routes-1.J | 104 min | 662 |
| B109 | A-K2-email-2.T, A-K2-content-analysis-1.T, RT-K1-adm-owner-passkey-routes-1.T, A-K2-settings-3.J, A-K2-themes-2.J, RT-K1-adm-skills-2.J | 99 min | 648 |
| B110 | A-K2-analytics-1.T, A-K2-settings-3.T, RT-K1-adm-skills-2.T, A-K2-authentication-1.J, A-K2-shell-hooks-2.J, RT-K1-adm-system-4.J | 112 min | 635 |
| B111 | A-K2-themes-2.T, A-K2-shell-hooks-2.T, RT-K1-adm-system-4.T, A-K2-shell-components-8.J, A-K2-shell-hooks-4.J, RT-K1-adm-system-5.J | 101 min | 625 |
| B112 | A-K2-shell-components-8.T, RT-K1-adm-system-5.T, A-K2-plugins-4.J, A-K2-database-1.J, RT-K1-adm-system-6.J, RT-K1-adm-system-7.J | 97 min | 609 |
| B113 | A-K2-plugins-4.T, RT-K1-adm-system-6.T, A-K2-shell-hooks-4.T, A-K2-recovery-1.J, A-K2-shell-components-9.J, RT-K1-adm-system-8.J | 85 min | 591 |
| B114 | A-K2-database-1.T, A-K2-shell-components-9.T, RT-K1-adm-system-7.T, A-K2-deployment-2.J, A-K2-security-3.J, RT-K1-adm-system-9.J | 101 min | 569 |
| B115 | A-K2-deployment-2.T, RT-K1-adm-system-8.T, A-K2-media-2.J, A-K2-members-1.J, RT-K1-adm-system-14.J, K5-comments-2.J | 120 min | 558 |
| B116 | A-K2-security-3.T, RT-K1-adm-system-9.T, K5-comments-2.T, A-K2-users-1.J, A-K2-shell-components-10.J, V-media-3.J | 90 min | 546 |
| B117 | A-K2-recovery-1.T, A-K2-shell-components-10.T, RT-K1-adm-system-14.T, V-media-3.T, K5-theme-4.J, K5-forms-1.J | 120 min | 530 |
| B118 | K5-theme-4.T, A-K2-media-2.T, A-K2-library-1.J, K5-media-4.J, A-K2-trash-1.J, RT-K1-adm-media-1.J | 104 min | 506 |
| B119 | K5-forms-1.T, A-K2-library-1.T, RT-K1-adm-media-1.T, A-K2-taxonomy-1.J, K5-post-4.J, A-K2-shell-components-11.J | 92 min | 478 |
| B120 | A-K2-taxonomy-1.T, K5-media-4.T, A-K2-shell-components-11.T, A-K2-authentication-1.T, K5-media-generation-1.J, RT-K1-adm-media-2.J | 93 min | 445 |
| B121 | A-K2-members-1.T, K5-post-4.T, RT-K1-adm-media-2.T, A-K2-settings-4.J, A-K2-taxonomy-2.J, RT-K1-adm-forms-3.J | 78 min | 427 |
| B122 | A-K2-trash-1.T, K5-media-generation-1.T, RT-K1-adm-forms-3.T, A-K2-collections-2.J, A-K2-pages-3.J, K5-media-import-1.J | 55 min | 412 |
| B123 | A-K2-users-1.T, K5-media-import-1.T, A-K2-posts-3.J, K5-theme-5.J, RT-K1-adm-media-3.J, C-contracts-core-1.J | 99 min | 402 |
| B124 | A-K2-posts-3.T, K5-theme-5.T, RT-K1-adm-media-3.T, C-contracts-core-1.T, K4-asset-transfer-1.J, K5-plugin-runtime-2.J | 99 min | 372 |
| B125 | K5-plugin-runtime-2.T, A-K2-collections-2.T, K5-theme-7.J, RT-K1-adm-assistant-6.J, X-object-storage-1.J, X-site-search-1.J | 85 min | 354 |
| B126 | K5-theme-7.T, A-K2-pages-3.T, RT-K1-adm-assistant-6.T, X-object-storage-1.T, X-site-search-1.T, K5-object-storage-1.J | 65 min | 337 |
| B127 | K5-object-storage-1.T, K4-asset-transfer-1.T, A-K2-settings-4.T, RT-K1-adm-media-4.J, RT-K1-adm-plugins-1.J, XC-1 | 100 min | 327 |
| B128 | A-K2-taxonomy-2.T, RT-K1-adm-media-4.T, RT-K1-adm-plugins-1.T, RT-K1-adm-plugins-2.J, RT-K1-adm-plugins-4.J, XC-2 | 104 min | 320 |
| B129 | RT-K1-adm-plugins-2.T, RT-K1-adm-plugins-5.J, RT-K1-adm-plugins-3.J, XC-3, XC-4, XC-5 | 110 min | 317 |
| B130 | RT-K1-adm-plugins-4.T, V-post-5.J, RT-K1-pub-mail-feedback-1.J, XC-6a, S6b.J | 110 min | 315 |
| B131 | RT-K1-adm-plugins-5.T, V-post-5.T, RT-K1-pub-mail-feedback-1.T, S6b.T, K5-consent-1.J, K5-publish-content-5.J | 120 min | 311 |
| B132 | K5-consent-1.T, K5-publish-content-5.T, RT-K1-adm-plugins-3.T, K5-site-backup-3.J, K5-navigation-1.J, K5-deployments-5.J | 101 min | 288 |
| B133 | K5-site-backup-3.T, K5-site-inspection-1.J, K5-site-backup-4.J, K5-plugin-runtime-3.J, RT-K1-adm-menus-1.J, K5-deployments-6.J | 100 min | 279 |
| B134 | K5-site-inspection-1.T, K5-navigation-1.T, K5-site-backup-4.T, K5-deployments-6.T, RT-K1-adm-menus-2.J, RT-K1-adm-publish-content-4.J | 92 min | 251 |
| B135 | K5-deployments-5.T, K5-plugin-runtime-3.T, RT-K1-adm-menus-1.T, RT-K1-adm-publish-content-4.T, K5-site-backup-5.J, K5-web-1.J | 64 min | 232 |
| B136 | RT-K1-adm-menus-2.T, K5-site-backup-5.T, K5-web-1.T, RT-K1-adm-publish-content-5.J, RT-K1-pub-http-1.J, K5-site-backup-6.J | 94 min | 223 |
| B137 | RT-K1-adm-publish-content-5.T, RT-K1-pub-http-1.T, K5-site-backup-6.T, RT-K1-adm-posts-1.J, K5-site-backup-7.J, K5-publish-content-6.J | 98 min | 217 |
| B138 | RT-K1-adm-posts-1.T, K5-site-backup-7.T, K5-publish-content-6.T, RT-K1-adm-pages-1.J, RT-K1-adm-system-11.J, K5-site-backup-8.J | 97 min | 205 |
| B139 | RT-K1-adm-pages-1.T, RT-K1-adm-system-11.T, K5-site-backup-8.T, RT-K1-adm-system-15.J, K5-site-inspection-2.J, K5-deployments-7.J | 88 min | 197 |
| B140 | RT-K1-adm-system-15.T, K5-site-inspection-2.T, RT-K1-adm-consent-1.J, RT-K1-adm-publish-content-6.J, XC-6b | 100 min | 193 |
| B141 | RT-K1-adm-consent-1.T, RT-K1-adm-publish-content-6.T, K5-deployments-7.T, RT-K1-adm-site-1.J, RT-K1-adm-system-12.J, XC-6c | 110 min | 190 |
| B142 | RT-K1-adm-site-1.T, RT-K1-adm-system-13.J, RT-K1-pub-oauth-1.J, XC-6d | 110 min | 189 |
| B143 | RT-K1-adm-system-12.T, RT-K1-pub-oauth-1.T, RT-K1-adm-agent-plugins-2.J, RT-K1-pub-external-mcp-1.J | 79 min | 187 |
| B144 | RT-K1-adm-agent-plugins-2.T, RT-K1-pub-external-mcp-1.T, RT-K1-adm-system-13.T, RT-K1-adm-external-mcp-4.J, RT-K1-pub-api-connections-1.J | 85 min | 182 |
| B145 | RT-K1-adm-external-mcp-4.T, RT-K1-pub-api-connections-1.T, RT-K1-pub-ops-1.J, RT-K1-pub-publish-trust-1.J | 66 min | 180 |
| B146 | RT-K1-pub-ops-1.T, RT-K1-pub-site-assistant-confirm-1.J, RT-K1-pub-site-render-context-1.J | 47 min | 179 |
| B147 | RT-K1-pub-publish-trust-1.T, RT-K1-pub-site-assistant-confirm-1.T, RT-K1-pub-site-render-context-1.T, RT-K1-pub-site-share-1.J, RT-K1-pub-site-site-chat-markup-1.J | 49 min | 176 |
| B148 | RT-K1-pub-site-share-1.T, RT-K1-pub-site-site-chat-markup-1.T, RT-K1-pub-site-worker-sandbox-1.J, RT-K1-pub-visitor-analytics-1.J | 36 min | 174 |
| B149 | RT-K1-pub-site-worker-sandbox-1.T, RT-K1-pub-visitor-analytics-1.T, RT-K1-pub-site-3.J, RT-K1-pub-site-handlebars-sandbox-1.J | 96 min | 172 |
| B150 | RT-K1-pub-site-3.T, RT-K1-pub-site-handlebars-sandbox-1.T, RT-K1-pub-site-liquid-sandbox-1.J, V-theme-6.J | 54 min | 168 |
| B151 | RT-K1-pub-site-liquid-sandbox-1.T, V-theme-6.T, K5-post-6.J, K5-pages-1.J, K5-site-export-1.J | 111 min | 166 |
| B152 | K5-post-6.T, K5-site-export-1.T, K5-email-templates-1.J, K5-site-export-2.J, RT-K1-adm-pages-2.J, RT-K1-adm-themes-1.J | 108 min | 150 |
| B153 | K5-pages-1.T, K5-site-export-2.T, RT-K1-adm-themes-1.T, RT-K1-adm-themes-2.J, RT-K1-adm-email-templates-1.J | 86 min | 138 |
| B154 | K5-email-templates-1.T, RT-K1-adm-themes-2.T, RT-K1-adm-presentation-1.J, K5-webmcp-1.J | 82 min | 131 |
| B155 | RT-K1-adm-presentation-1.T, K5-webmcp-1.T, RT-K1-pub-middleware-1.J, X-change-sets-1.J | 96 min | 126 |
| B156 | RT-K1-pub-middleware-1.T, RT-K1-adm-pages-2.T, X-change-sets-1.T, RT-K1-adm-owner-mfa-routes-1.J, RT-K1-adm-owner-recovery-routes-1.J | 77 min | 116 |
| B157 | RT-K1-adm-email-templates-1.T, RT-K1-adm-owner-mfa-routes-1.T, V-change-sets-1.J, RT-K1-pub-middleware-2.J | 112 min | 114 |
| B158 | RT-K1-adm-owner-recovery-routes-1.T, V-change-sets-1.T, RT-K1-pub-middleware-2.T, RT-K1-adm-change-sets-1.J, X-image-transform-1.J | 74 min | 111 |
| B159 | RT-K1-adm-change-sets-1.T, X-image-transform-1.T, K4-image-transform-1.J, X-permanent-delete-1.J | 60 min | 106 |
| B160 | K4-image-transform-1.T, K5-permanent-delete-1.J, X-redirects-1.J | 60 min | 105 |
| B161 | K5-permanent-delete-1.T, X-redirects-1.T, K5-redirects-1.J, X-seo-1.J | 66 min | 103 |
| B162 | K5-redirects-1.T, X-permanent-delete-1.T, X-seo-1.T, RT-K1-pub-site-2.J, K5-seo-1.J | 90 min | 97 |
| B163 | RT-K1-pub-site-2.T, K5-seo-1.T, RT-K1-pub-members-1.J, RT-K1-adm-seo-2.J | 96 min | 89 |
| B164 | RT-K1-pub-members-1.T, RT-K1-adm-seo-2.T, RT-K1-pub-members-2.J, RT-K1-pub-site-4.J | 90 min | 82 |
| B165 | RT-K1-pub-members-2.T, RT-K1-pub-site-4.T, RT-K1-pub-site-5.J, RT-K1-pub-members-3.J | 102 min | 77 |
| B166 | RT-K1-pub-site-5.T, RT-K1-pub-members-3.T, RT-K1-pub-members-4.J, RT-K1-pub-members-5.J | 85 min | 70 |
| B167 | RT-K1-pub-members-4.T, RT-K1-pub-commerce-1.J, RT-K1-pub-content-1.J | 73 min | 68 |
| B168 | RT-K1-pub-members-5.T, RT-K1-pub-commerce-1.T, RT-K1-pub-content-1.T, RT-K1-pub-members-6.J, RT-K1-pub-plugin-contributions-1.J | 58 min | 64 |
| B169 | RT-K1-pub-members-6.T, RT-K1-pub-plugin-contributions-1.T, RT-K1-pub-site-seo-render-context-1.J, X-widgets-1.J | 60 min | 62 |
| B170 | RT-K1-pub-site-seo-render-context-1.T, X-widgets-1.T, RT-K1-pub-site-render-1.J, RT-K1-pub-site-6.J | 99 min | 60 |
| B171 | RT-K1-pub-site-render-1.T, RT-K1-pub-site-6.T, RT-K1-pub-site-render-2.J | 94 min | 44 |
| B172 | RT-K1-pub-site-render-2.T, RT-K1-pub-site-7.J, RT-K1-adm-widgets-4.J | 106 min | 38 |
| B173 | RT-K1-pub-site-7.T, RT-K1-pub-site-8.J, RT-K1-pub-site-render-3.J | 97 min | 33 |
| B174 | RT-K1-pub-site-8.T, RT-K1-adm-widgets-4.T, RT-K1-pub-site-render-3.T, RT-K1-pub-site-bare-page-1.J, RT-K1-pub-site-handlebars-render-1.J | 62 min | 22 |
| B175 | RT-K1-pub-site-bare-page-1.T, RT-K1-pub-site-handlebars-render-1.T, RT-K1-adm-posts-2.J, RT-K1-pub-site-handlebars-worker-1.J | 94 min | 20 |
| B176 | RT-K1-adm-posts-2.T, RT-K1-pub-site-handlebars-worker-1.T, RT-K1-pub-site-liquid-render-1.J, RT-K1-pub-site-render-site-1.J | 45 min | 15 |
| B177 | RT-K1-pub-site-liquid-render-1.T, RT-K1-pub-middleware-3.J, RT-K1-pub-site-9.J | 98 min | 14 |
| B178 | RT-K1-pub-middleware-3.T, RT-K1-pub-site-9.T, RT-K1-pub-site-render-site-1.T, RT-K1-pub-site-10.J, RT-K1-pub-site-liquid-worker-1.J | 101 min | 6 |
| B179 | RT-K1-pub-site-10.T, RT-K1-pub-site-liquid-worker-1.T, RT-K1-pub-site-11.J | 66 min | 2 |
| B180 | RT-K1-pub-site-11.T | 41 min | 0 |
