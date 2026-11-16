# SPLIT-A50: CSP host-declaration helpers + same-origin write predicate -> `@jini-ai/core/contracts/server` (templates T-SPLIT, T-MOVE)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A50`. The listed blocker "C4 core/contracts/server (wave B)" **has landed at integ/wave-b**: `packages/core/src/contracts/server/origin.ts` (`guardSameOrigin`, :29) and `server/verified-origin/*` exist and `server.ts:122` already barrels `./server/origin.js`. No remaining blocker; still **execute after wave B merge** because both Tovu files sit in the applier-pass area (blobs below must be re-taken on the merged tree).

Tier: Sonnet + Opus security review (CSRF gate, policy syntax injection). est. executor tokens ≈ 34k (S1 17k, S2 17k). No Chrome look.

## Findings that change the audit row
1. **Two independent moves, one Jini file each.** (a) CSP-declaration helpers: `DeclaredPageHosts`, `SecurityHeaderSet`, `REPORT_ONLY_HEADER`, `addDeclaredHostsToPolicy`, `withDeclaredHosts`, private `isDeclaredFrameOrigin`, `HOST_DIRECTIVES` (`public-page-security-headers.ts:12-83`) -> new `core/contracts/server/security-headers.ts`. (b) `isSameOriginAdminWrite` + private `originHost` (`same-origin.ts:14-33`) -> new `core/contracts/server/same-origin-write.ts`. Neither is a drop-in for `guardSameOrigin` (a different policy: configured-origin settings vs exact canonical `Origin` equals `Host` + Fetch-Metadata). Do not merge them into `origin.ts`.
2. **`createPublicPageSecurityHeaderSet`, `PublicThemeResources` STAY** (baseline CSP, YouTube/Vimeo defaults, report-only choice: row STAYS list). They keep one dependency on the moved code: the literal key `"Content-Security-Policy-Report-Only"` (:47) -> becomes `CSP_REPORT_ONLY_HEADER` imported from core, and `isDeclaredFrameOrigin` is used at :40 by the stayer, so it becomes an EXPORTED helper `isDeclaredOrigin` in core (renamed; "frame" was a misnomer: the same check guards script/connect hosts).
3. **Renames at the Jini boundary (owner rule 1, neutral names):** `isSameOriginAdminWrite` -> `isSameOriginBrowserWrite` (nothing about it is admin-specific); `REPORT_ONLY_HEADER` -> `CSP_REPORT_ONLY_HEADER`; the CSRF gate's doc loses "admin surface"/"bootstrap issue" wording.
4. **Parity gap that is NOT closed here (security, record for review):** `site-share-password.ts:23-24` adds `req.get("origin") !== req.protocol + "://" + req.get("host")` AFTER the predicate (scheme must match too); `admin-surfaces.ts:72` does not. The Jini function stays host-only (parity). The review point for Opus: should the Jini predicate take an optional `protocol` and enforce scheme equality for both callers? Out of scope (behaviour change on `admin-surfaces`); open question for the owner.
5. **Importer fan-out for the CSP types is wide but mechanical** (7 files, 12 references, census below); the old file keeps no re-export (rule 19) so every one is repointed.

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/website/src/contracts/core/public-page-security-headers.ts | blob fc2c823fcc01d4acea0b29b0eb8f0d04ca740f23 | keep-reduced (lines 12-23 types + 55-83 helpers leave; createPublicPageSecurityHeaderSet + PublicThemeResources stay)
  - apps/website/src/features/agent-plugins/admin-surfaces/same-origin.ts | blob 64b7c2a9bcf17341559dae4e461d7b515057dd50 | delete
tovu_importers_edited:
  - apps/website/src/server/routes/types.ts | blob 7550dea672daae39bf135201588dbbd8f678176b | 2 refs :1661,1662
  - apps/website/src/features/deployments/static-publish/adapter.ts | blob c1cbf124e117a8547bc37a79ef09c1eb9fe6bc02 | import :10 (withDeclaredHosts) + 4 type refs :227,229,452,479
  - apps/website/src/server/inbound/public-http/routes/site/pages.ts | blob 8d158d7389fb1e4cbbe842233704d3701daeeeac | import :1 + type ref :2512
  - apps/website/src/server/inbound/public-http/middleware/public-page-security-headers.ts | blob f7d38c031996cd22508f2b08a4cdd1956c9acd8b | import :3
  - apps/website/src/features/agent-plugins/exports/runtime.ts | blob fb94305b1310231f29a3cba15c3010551347c709 | import :12
  - apps/website/src/features/site-export/static-security-headers.ts | blob bc17811776571b64f511745485b7b7bad54a3d79 | import :1
  - apps/website/src/features/theme/public-page-security-headers.ts | blob f8e3f06ac79148099bf2733623b921b4e0cf7e21 | import :5 (mixed: createPublicPageSecurityHeaderSet stays from the old file, SecurityHeaderSet from core)
  - apps/website/src/server/inbound/admin-http/routes/system/site-share-password.ts | blob 0331e31a2919dacbd74d18a46bde17df99ef2a75 | import :7, call :23
  - apps/website/src/server/inbound/admin-http/routes/agent-plugins/admin-surfaces.ts | blob 3754df981daa8bf8da92bb8c47e82992f8a5e004 | import :23, call :72
tovu_tests:
  - apps/website/src/contracts/core/__tests__/unit/public-theme-resource-policy.contract.test.ts | blob acead5911d97e4488da9b7adc63492df1b36ba0f | edit: the test at :47-53 moves to Jini; import :7 removed
  - apps/website/src/features/agent-plugins/admin-surfaces/__tests__/unit/same-origin.unit.test.ts | blob 7784884f0a59c27125c39965d4b051ddd5d67f97 | moves to Jini, delete here
jini_guards:
  - packages/core/src/contracts/server.ts | blob a67a090fa1d15393bbbfda38a3ffc9760194ec89
  - packages/core/src/contracts/server/origin.ts | blob d60739f8c22082022d5d56a3dc9678445783818f
  - packages/core/package.json | blob 3829d4e032640f9914ad4110a5ec11a5d43d9f71 (NO new subpath: both new files ride the existing "./contracts/server" entry, runtime tag `universal`; both new files are pure, no `node:` import)
  - `rg -n "isSameOriginBrowserWrite|addDeclaredHostsToPolicy|CSP_REPORT_ONLY_HEADER" packages --glob '!**/dist/**'` prints nothing
```
Census (re-run, expect exactly the lists above): `rg -n "public-page-security-headers" apps/website/src -g '*.ts' | rg "SecurityHeaderSet|DeclaredPageHosts|REPORT_ONLY_HEADER|addDeclaredHostsToPolicy|withDeclaredHosts"` and `rg -n "isSameOriginAdminWrite|admin-surfaces/same-origin" apps -g '*.ts'`. A hit in any other file = STOP.

## Contracts (Jini)
```ts
// core/src/contracts/server/security-headers.ts
export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';
export type SecurityHeaderSet = Readonly<Record<string, string>>;
export interface DeclaredPageHosts { readonly script: readonly string[]; readonly frame: readonly string[]; readonly connect: readonly string[] }
/** An exact http(s) origin string (no path, no policy syntax). */
export function isDeclaredOrigin(required: { value: string }, optional: Record<string, never> = {}): boolean;
export function addDeclaredHostsToPolicy(required: { policy: string; hosts: DeclaredPageHosts }, optional: Record<string, never> = {}): string;
export function withDeclaredHosts(required: { headers: SecurityHeaderSet; hosts: DeclaredPageHosts }, optional: Record<string, never> = {}): SecurityHeaderSet;
// core/src/contracts/server/same-origin-write.ts
export function isSameOriginBrowserWrite(
  required: { readonly origin: string | undefined; readonly host: string | undefined; readonly fetchSite: string | undefined },
  optional: Record<string, never> = {},
): boolean;
```
Parity: signatures of the Tovu functions already match `(required, optional = {})`. Bodies move byte-identical apart from the three renames; `isDeclaredFrameOrigin(value)` (positional) becomes `isDeclaredOrigin({ value })` (rule 10), so the two internal call sites and the stayer's `frameOrigins.filter(isDeclaredFrameOrigin)` (:40) change to `frameOrigins.filter(value => isDeclaredOrigin({ value }))`.

```
id: SPLIT-A50-1 .. SPLIT-A50-2
feature: web security predicates
jini_target: core src/contracts/server/{security-headers.ts,same-origin-write.ts}; server.ts + 2 export lines after :122
changeset: @jini-ai/core: minor | "contracts/server: CSP declared-host helpers and isSameOriginBrowserWrite"
```

## SPLIT-A50-1 — Jini (commit 1, Opus security review)
0. Branch rule; blobs; guard `rg` prints nothing.
1. Tests first: `server/__tests__/same-origin-write.test.ts` = all cases of Tovu `same-origin.unit.test.ts` (read it; keep every assertion) PLUS NEW: `Origin: null` refused, `Origin` with a path / trailing slash / uppercase host / userinfo refused (the `url.origin === origin` canonical check), `Sec-Fetch-Site: same-site` and `cross-site` refused, `none`+valid origin refused, missing `host` refused, port mismatch refused, an `http:` vs `https:` origin with the same host ACCEPTED (pin the documented host-only behaviour of finding 4). `server/__tests__/security-headers.test.ts` = Tovu test lines 47-53 (two assertions) PLUS NEW: `withDeclaredHosts` leaves headers without the report-only key unchanged (same object identity); injection attempts (`"https://c.test; object-src *"`, `"'unsafe-eval'"`, a path origin, a `javascript:` URL, an `http:` host in `script`) are dropped; duplicate hosts appear once; a policy with no `script-src` gains none; directive match is exact-or-prefix-with-space (`script-src-elem` is NOT extended: pin it).
2. Code: move bodies; `README`/docs line in `packages/core` server contract section; export lines in `server.ts` after :122; changeset. Why-comments move reworded neutral (the CSRF paragraph: "SameSite=Strict cookie, plus a browser request must prove it came from this origin's own scripts; `Origin: null` never matches; this is browser protection, not proof against a client that forges every header").
3. Checks COMMON 2-9: `rg -n -i "tovu|admin surface|plugin export|youtube|vimeo" <both new files + tests>` prints nothing (say "page" and "declared hosts"). Commit `feat(core/contracts/server): CSP declared-host helpers and isSameOriginBrowserWrite`.

## SPLIT-A50-2 — Tovu (commit 2, Sonnet; after S1)
1. `public-page-security-headers.ts` (edit): delete lines for `SecurityHeaderSet`, `DeclaredPageHosts`, `REPORT_ONLY_HEADER`, `HOST_DIRECTIVES`, `addDeclaredHostsToPolicy`, `withDeclaredHosts`, `isDeclaredFrameOrigin`; add `import { CSP_REPORT_ONLY_HEADER, isDeclaredOrigin, type SecurityHeaderSet } from "@jini-ai/core/contracts/server";`; in `createPublicPageSecurityHeaderSet` replace the key literal `"Content-Security-Policy-Report-Only"` (appears once as the returned key, :47) with `[CSP_REPORT_ONLY_HEADER]` and the filter at :40 as in the contracts note. The file header comment keeps its Tovu-specific paragraph (live vs static export).
2. Repoint importers (exact edits): `types.ts` 1661-1662, `adapter.ts` 227/229/452/479 (inline `import("#src/contracts/core/public-page-security-headers").X` -> `import("@jini-ai/core/contracts/server").X`), `adapter.ts:10` -> `import { withDeclaredHosts } from "@jini-ai/core/contracts/server";`, `pages.ts:1` -> `import { addDeclaredHostsToPolicy, CSP_REPORT_ONLY_HEADER } from "@jini-ai/core/contracts/server";` and the use at :2515 `REPORT_ONLY_HEADER` -> `CSP_REPORT_ONLY_HEADER` (rg the identifier first: exactly the use(s) in that function), `pages.ts:2512` inline type, the four type-only imports (`middleware/public-page-security-headers.ts:3`, `exports/runtime.ts:12`, `static-security-headers.ts:1`, `theme/public-page-security-headers.ts:5`). `site-share-password.ts:7,23` and `admin-surfaces.ts:23,72`: import `isSameOriginBrowserWrite` from `@jini-ai/core/contracts/server` and rename the two call sites; the extra scheme check at `site-share-password.ts:24` is KEPT untouched.
3. `git rm` `same-origin.ts` and `same-origin.unit.test.ts`; edit `public-theme-resource-policy.contract.test.ts` (delete the `addDeclaredHostsToPolicy` test at :47-53 and its import at :7: moved to Jini; record test counts before/after in the commit body).
4. Census: `rg -n "isSameOriginAdminWrite|isDeclaredFrameOrigin|REPORT_ONLY_HEADER|admin-surfaces/same-origin" apps` prints nothing except `CSP_REPORT_ONLY_HEADER`; for `SecurityHeaderSet|DeclaredPageHosts` no remaining import from the old file path (the Tovu `createPublicPageSecurityHeaderSet` tests import the function only); eslint on all touched files (unresolved-import for the new core specifier is expected until linked: record); commit `refactor(website): CSP host helpers and same-origin write gate from @jini-ai/core/contracts/server`.

## untangle overlap (execute after wave B merge)
- C4 already added `contracts/server/{origin,verified-origin}` at integ/wave-b; if a later applier pass renames those files, only the export-line anchor (`export * from './server/origin.js'`) changes.
- Website applier passes (R-BARRELS, C3) edit `server/routes/types.ts` and `adapter.ts`: re-take both blobs; the edits here are single-line import/type-ref swaps, applied by text with exact counts (1,2 / 1,4 / ...).
- A56 (`agent-plugins/exports`, hard-blocked) edits `exports/runtime.ts`; this sheet's only edit there is the `DeclaredPageHosts` import line at :12: land A50 first, A56 re-takes the blob.

## STOP specific to this sheet
- A census hit outside the lists.
- The same-origin test file contains an assertion that contradicts the host-only behaviour documented above.
- Any need to touch `guardSameOrigin`.
