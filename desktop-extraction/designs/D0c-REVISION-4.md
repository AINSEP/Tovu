# D0c revision 4, 2026-11-19

Status: **DESIGN, unjudged. Edits no product code.** Written by an unattended Opus run. It revises `D0c-REVISION-3.md` after `D0c3-CODEX-JUDGE-3.md` (REJECT: G1 G2 S1 O1 H1 blockers). Executable form: `d0c-v4/` (start with `d0c-v4/COMMON.md`). Sections 2-4 of revision 3 (Q1 option C, module destinations, Q2-a) are **kept unchanged** (coordinator decision) and not repeated here; where v3 and v4 differ, v4 wins.

Base read (checked with `git show`/`git grep`/`rg` on these trees; nothing installed, built or run): Tovu `origin/integ/merge-3-2026-11-18` **2d82735a6**, Jini `origin/integ/merge-3-2026-11-18` **d37821a46**.

## 1. What changed, in two kinds

**(A) Gates: the design changed, not the details.** Every revision so far was sunk by the same class (a bespoke gate that can pass the wrong thing: judge 1 B3, judge 2 B1/B2, judge 3 G1/G2/G3). Owner rule: repeated same-class findings = change the design. v4 deletes every bespoke gate (no `set -e` blocks, no count parsing, no `npm pkg get` test, no extra `ln` loop, no `bash -n` step, no census script). COMMON section 3 is now one short list of the repos' **own** commands (Tovu: typecheck, typecheck:tests, check:architecture, check:size, check:complexity, check:hooks, check:errors, check:why-comments, desktop `npm run gates`, the sheet's named tests, the staging list; Jini: `pnpm -r build`, guard, api:check, check:size, check:complexity, check:hooks, check:errors, check:why-comments, the named package tests), run on the parent `P` and on the candidate `C`. **PASS = every exit status no worse than on `P`, and no error line in `C` that `P` lacks** (a plain diff the verifier reads). A command that cannot run is **UNPROVEN**, never PASS. The Codex executor runs **no** gate; an Opus cloud test-and-fix run is the verifier. Linking uses only `development/scripts/link-jini.mjs`, after `npm ci`, with a fixed order (COMMON section 2). Sheets now hold only: files to change, callers/tests to repoint, characterization tests to add (each with a one-line red check), STOP conditions, plus the named tests and the expected staging list the gate needs.

**(B) Behaviour: smallest fix per finding.**
- **S1** (startup secrets): Jini gets only the two **synchronous** halves (`takeNodeStartupSecrets`: split, case-insensitive scrub on both sides, marker; `allowedNodeStartupSecrets`: validate a received record). The website keeps its own `async` IIFE line for line, so inherited credentials are assigned **before** IPC starts and the promise settles as before (one `await`, same memo). Release inventory listed (J3, COMMON section 6).
- **O1** (checkout parity): the product-root walk moves to `@tovu/contracts/product-root` with the probe as a port and the limit private; the desktop's checkout fact starts the walk at the **same origin** it had on `P` (the staged bundle folder `Resources/website/src/server/runtime/composition`, via `legacyWebsiteModuleDir`), same probe, same limit. A packaged app inside a checkout stays a checkout; `deployedProduction` keeps `!checkout && !isDevelopmentLaunch` (rule body byte-identical). Inside/outside/boundary layouts are pinned on `P` (website walk) and on `C` (contracts and desktop).
- **H1** (host signals): `parseHostSignalDeclaration` is public at `@jini-ai/agent-plugins/lifecycle/node` (J4 exports three functions); the desktop fallback root uses the same legacy origin (`desktopProductRoot`); the walk limit stays private.

## 2. Finding -> fix (judge 3: `D0c3-CODEX-JUDGE-3.md`)

| ID | Sev | Finding | v4 fix | Where |
|---|---|---|---|---|
| G1 | Blocker | Gate demands green under `set -e` while known reds must stay; count-only architecture check accepts a different regression; empty `npm pkg get` passes | Bespoke gate deleted. Parent-vs-candidate rule on the repos' own commands: same-or-better exit status **and** no new error line (regression identity, not counts). Command status is read first, nothing parsed. Unrunnable = UNPROVEN. Executor runs nothing; verifier proves | COMMON 1, 3 |
| G2 | Blocker | Sibling build + `ln` loop over existing entries only; T1 adds a dependency not installed; no removal of real dirs | One order: Jini build -> `npm ci` (root, desktop, admin) -> `link-jini.mjs` only (it links declared-but-missing direct deps and replaces installed copies) -> contracts/sdk build. Each sheet names its new desktop dependency (T1 `@jini-ai/server`, T5 `zod`, others none) and the manifests its landing bump touches | COMMON 2, 6; T1, T5 |
| G3 | Major | Import test skips some files; staging drops missing targets; no 50-line/suppression check; no archive proof | Staging list compared per sheet (expected list written in each T sheet); verifier review items: functions <= 50 lines, complexity <= 10, no added suppressions/skips, declared runtime deps. Archive resolution is stated as **not** covered by T (P owed), not claimed | COMMON 3, 5 |
| J1 | Minor | Wrong `presetRouteHost` anchor; request-facts removal and Jini's extra registration/validation unstated; no test fixture | Anchor `route-host.ts:34`; T1 states each difference with its line (`jini-routes.ts:33-37`, `mount-routes.ts:21-23,36,39-43`, `route-registration-guard.ts:121-122`); J1 test uses `createTestRouteHost` (`@jini-ai/core/contracts/server/testing`, as `route-host.test.ts:4`); T1 adds fall-through and route-error characterization cases written from values observed on `P` | J1, T1 |
| J2 | Major | "Verbatim TSDoc" + "neutral" conflict; comments name website wiring and stale callers; executor reads a second checkout | J2 carries the exact neutral header and TSDoc text and the pinned source lines to copy; no second checkout; explicit debt edits (Jini `error-gate-debt` row +3, Tovu row -3, Tovu why-comment entries by the verifier for the listed blocks) | J2, T2 |
| S1 | Blocker | IPC started before credentials assigned; extra `.then` turn; scrub compares one side only; no API-baseline/release edits | See section 1 (B). Lowercase declared key test; red check restores the one-sided comparison. J3 lists `api-baseline/jini-ai__sidecar.json` + changeset; T4 lists the landing manifests (root `:166`, desktop `:41`) and lockfiles. New Tovu child-process test pins "credentials before IPC answers" | J3, T4 |
| S2 | Major | T3 leaves `@jini-ai/core` (type) undeclared, regenerates one lock; T5 changes a `file:` package's deps without saying which locks | T3 declares `@jini-ai/core` and `@jini-ai/daemon`; T3 and T5 regenerate **all three** locks that record `packages/contracts` (root `:14310`, desktop `:69`, admin `:85`) after the final manifest edit, with npm 11.12.1, never by hand | T3, T5 |
| O1 | Blocker | `!app.isPackaged` breaks packaged-in-checkout parity; `deployedProduction` lacks the development condition; baseline row replaced | See section 1 (B). Rule body unchanged; the desktop port keeps its one-argument shape so `product-telemetry-boot.test.ts:137,146,156` stay byte-identical; the real-default case (packaged, from a checkout -> no export) is green on `P` and `C`; no `P` result is replaced | T6 |
| H1 | Blocker | T7 imports an unexported parser; fallback origin moved to desktop source; walk limit exported for docs | See section 1 (B); red check proves the desktop-source origin (3 levels shallower) would flip a 15-level layout | J4, T6, T7 |
| Dispatch | - | Sheet overlaps (`dist-import-check.test.ts`; T2/T6 boot; T3/T6 website telemetry; T4/T5 supervisor; T6/T7 product root) | Serialize T1 -> T7 (one sheet lands before the next starts; each re-reads its STOP census on its own `P`). J1-J4 independent, parallel | section 3 |

## 3. Finding -> fix (judges 1 and 2, as judge 3 left them)

| Judge item | Judge 3 status | v4 |
|---|---|---|
| J1-B1 build order / first-use install | "first-use install setup remains open" | COMMON 2 fixes the order for every check (Jini build, `npm ci` x3, link, contracts+sdk build); release pins per COMMON 6 |
| J1-B2 atomic loader move | resolved in scope | unchanged (Q2-a; T8 outline) |
| J1-B3 / J2-B1 / J2-B2 gates (false greens, Bash 3.2, `npm ls`) | "gate failures remain"; "baseline execution blocked"; "dependency and architecture false greens remain" | design change (section 1 A): no bespoke shell left to be wrong; the verifier runs repo commands on `P` and `C` |
| J1-B4 / J2 archive proof | owed | still owed (P, COMMON 5); explicitly not claimed by T |
| J1-M parity b (signals fallback) | open | H1 fix: same origin, both markers, private limit (T7) |
| J1-M owner a (cross-package mocking) | "remains" | T2's two mocks target a Jini **public** subpath with the real module spread under the stub (existing helper pattern, `serve-command-wiring.unit.test.ts:178-180,251-253`); no mock targets a moved website file |
| J1-M owner d / J2-B3 (checkout fixtures, callers, checkout parity) | "packaged checkout parity fails" | O1 fix; all three `findAncestor` callers kept (T6 commit 2); every checkout fixture listed (T6 commit 3) |
| J1-M owner b, c; J1-m1; J1-O1, O2; J2-B4; J2-M lazy, owner, overlap; J2-m1, m2; J2-O1, O2 | resolved or deferred with T8 | unchanged from v3 (`D0c-REVISION-3.md` section 6) |
| J2-B5 published pins and clean locks | open | COMMON 6: landing commit raises the range in every manifest the sheet names, then regenerates each changed directory's lock with npm 11.12.1; Jini release inventory per J sheet |
| J1-U / J2-U budgets, snapshots, smokes | open | budgets below; smokes and archives remain P |

## 4. Sheets and Codex readiness

| Sheet | Repo edited | Codex-ready | Verifier needs | Budget |
|---|---|---|---|---|
| J1 server subpaths | Jini only | **yes** | - | 25k |
| J2 process guards | Jini only | **yes** | - | 50k |
| J3 startup secrets | Jini only | **yes** | - | 40k |
| J4 bundled sources | Jini only | **yes** | - | 60k |
| T1 routes | Tovu only | yes, after J1 lands | J1 branch linked | 40k |
| T2 process guards | Tovu only | yes, after J2 lands | J2 branch linked | 50k |
| T3 product events | Tovu only | **yes** (no Jini change) | Jini start SHA | 40k |
| T4 startup secrets | Tovu only | yes, after J3 lands | J3 branch linked | 60k |
| T5 daemon connection | Tovu only | **yes** (no Jini change) | Jini start SHA | 50k |
| T6 observability export | Tovu only | **yes** (no Jini change) | Jini start SHA | 110k |
| T7 host signals | Tovu only | yes, after J4 lands and T6 merges | J4 branch linked | 100k |
| T8, T9 | both / Tovu + CI | **no** (outlines, need owner Q2-b) | - | - |

Order: J1-J4 in parallel; T1 -> T7 serial (each on the previous one's tip). P for T1, T2, T4, T7 waits for one Jini release containing J1-J4 and the landing bumps (COMMON 6).

## 5. Not verified by this run
No install, build, typecheck or test in either repo. In particular: the observed statuses/bodies T1's new cases will pin (taken on `P` by the verifier); that `npm install --package-lock-only` resolves `@jini-ai/server@^0.7.0` with the registry's current 0.7.x (`packages/server/package.json` is 0.7.1 on d37821a46); the check:errors and why-comments counts the debt edits predict (the verifier adjusts within the stated caps); the J2/J4 file sizes; `import.meta.dirname` inside esbuild's staged bundles being the bundle folder (read from `stage-website-shared.ts:56-61`, `outbase` = `apps/website`, not run).
