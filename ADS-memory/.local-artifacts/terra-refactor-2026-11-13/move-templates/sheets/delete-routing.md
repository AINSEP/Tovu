id: DL-routing-1   (template T-DELETE, reduce form; written 2026-11-15 from Tovu 54dac1ff3 / Jini af2389793, refactor/terra; replaces delete-routing.skip.md)
feature: website/platform/routing
decision: REDUCE, not delete. reserved-paths.ts IS the Tovu binding and stays: RESERVED_SEGMENTS plus checkSitePathname/checkSiteRelativeTarget, each one call to @jini-ai/http-kit/verified-origin with Tovu's RESERVED_SEGMENTS and a narrowed verdict type. The survey note "keep only RESERVED_SEGMENTS" (callers pass reservedSegments themselves) is NOT taken: it would spread the reserved-set argument to 7 call sites in 5 files (pages.ts is 2.9k lines and arg-lane hot), and the file header's own why is that one shared rule refused in several places "slightly differently is how a bypass gets built". Removed: (1) hasControlCharacter, a pure forwarder with no Tovu value (COMMON rule 19), its one caller imports Jini directly; (2) the duplicated SitePathCheck/SiteRelativeTargetCheck arm definitions, now the Jini types with only the `reserved` arm narrowed (the arm doc comments are identical on the Jini declarations, site-path.ts:19-35).
tovu_file: apps/website/src/platform/routing/reserved-paths.ts | blob 91c8af0cc159d489a85f4051830ac59b33dbe27d
precondition: reserved-paths.ts still imports from "@jini-ai/http-kit/verified-origin" (untangle C4 row C4.repoint.tsv:240 not applied yet); else SKIP "C4 landed first: redo sheet with the new specifier"
non_reexport_statements: 4 (RESERVED_SEGMENTS, hasControlCharacter, checkSitePathname, checkSiteRelativeTarget) + 3 types; kept: RESERVED_SEGMENTS, checkSitePathname, checkSiteRelativeTarget, ReservedSurface, SitePathCheck, SiteRelativeTargetCheck
why_dead: forwarder: hasControlCharacter only calls @jini-ai/http-kit/verified-origin hasControlCharacter with no host value
tovu_file_after: keep only: RESERVED_SEGMENTS, ReservedSurface, SitePathCheck, SiteRelativeTargetCheck, checkSitePathname, checkSiteRelativeTarget
file_after: "block FILE_AFTER below"
moved_bodies: -

other guarded files (blob at HEAD 54dac1ff3; any mismatch = SKIP):
  - apps/website/src/platform/routing/index.ts | blob 10faa9274f885f8e1ed6fedb3979e4cda199778e
  - apps/website/src/platform/routing/__tests__/reserved-paths.test.ts | blob d78428fab83cf9eb9585c12f91b5a5296503699e
  - apps/website/src/features/site-inspection/published-page.ts | blob c4932fd848785bc64da086b5810137eff83e60cb
  - Jini packages/http-kit/src/verified-origin/site-path.ts | blob a70743eba823d6aaee450c010d50e7dec9ca137a (read-only: exports hasControlCharacter, SitePathCheck, SiteRelativeTargetCheck; re-exported by verified-origin/index.ts:34-35)
  - Jini packages/http-kit/src/__tests__/verified-origin-site-path.test.ts | blob a4a948444f161cca6f6115695c9678af4ce594ea (read-only)

census:                                    # python3 scripts/census.py /Users/la/Programming/tovu-codex-trial-terra apps/website/src/platform/routing/reserved-paths.ts  (14)
  - apps/website/src/platform/routing/index.ts:1 | reexport | "./reserved-paths.js"
  - apps/website/src/platform/routing/index.ts:2 | reexport | "./reserved-paths.js"
  - apps/website/src/platform/routing/__tests__/reserved-paths.test.ts:4 | static | "../reserved-paths.js"
  - apps/website/src/features/redirects/__tests__/agent-tools.tombstone-confirmation.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/features/redirects/__tests__/phase-handler.multi-site-lifecycle.test.ts:2 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/features/redirects/__tests__/phase-handler.disposer-scope.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/features/redirects/__tests__/tool-registrations.model-facing-errors.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/features/redirects/__tests__/publish-content.characterization.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/features/redirects/__tests__/publish-content.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/server/runtime/composition/deps.ts:79 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts:3 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/server/runtime/composition/app.ts:47 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/assistant/__tests__/tool-registrations.redirects.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  (the 11 RESERVED_SEGMENTS importers are unchanged; only the three hasControlCharacter lines below change)
reach_check (removed name):
  - rg -n --no-heading -w "hasControlCharacter" apps content development --glob '!**/node_modules/**' --glob '!**/cloud/reports/**'
    expected before: reserved-paths.ts (lines 25, 61-68), index.ts:1, reserved-paths.test.ts:4,143,148,150,151,152, published-page.ts:7,199. After: only published-page.ts:7 (new Jini import line) and published-page.ts:199 (the call, unchanged; it now resolves to Jini).

importers:
  - apps/website/src/platform/routing/index.ts:1 | "export { checkSitePathname, checkSiteRelativeTarget, hasControlCharacter, RESERVED_SEGMENTS } from './reserved-paths.js';" -> "export { checkSitePathname, checkSiteRelativeTarget, RESERVED_SEGMENTS } from './reserved-paths.js';"
  - apps/website/src/features/site-inspection/published-page.ts:7 | "import { checkSitePathname, hasControlCharacter } from \"#src/platform/routing/index\";" -> two lines: "import { hasControlCharacter } from \"@jini-ai/http-kit/verified-origin\";" then "import { checkSitePathname } from \"#src/platform/routing/index\";"
  - apps/website/src/platform/routing/__tests__/reserved-paths.test.ts:4 | "import { checkSitePathname, checkSiteRelativeTarget, hasControlCharacter } from \"../reserved-paths.js\";" -> "import { checkSitePathname, checkSiteRelativeTarget } from \"../reserved-paths.js\";"
  (published-page.ts:199 `hasControlCharacter({ value: raw })` is unchanged: the Jini signature is ({ value }, _optional = {}). the Tovu root package.json already depends on @jini-ai/http-kit (package.json:148 "@jini-ai/http-kit": "^0.7.0"; there is no apps/website/package.json).)
folds: -
comment_refs: -   (no comment gives a live path to a removed name; features/origin/INFO.md:191 names checkSitePathname, which stays)
path_literals: -
tests:
  - apps/website/src/platform/routing/__tests__/reserved-paths.test.ts | blob d78428fab83cf9eb9585c12f91b5a5296503699e | drop block lines 143-154 (the test "hasControlCharacter finds C0 and C1 but not printable ASCII" through its closing `});` plus the blank line after it): identical assertions at Jini packages/http-kit/src/__tests__/verified-origin-site-path.test.ts:150-160 (differs only by the explicit `, {}` second argument), check:
      cd /Users/la/Programming/tovu-codex-trial-terra && python3 -c 't=open("apps/website/src/platform/routing/__tests__/reserved-paths.test.ts").read().split("\n")[142:153]; j=[l.replace("}, {})","})") for l in open("/Users/la/Programming/jini-terra-base/packages/http-kit/src/__tests__/verified-origin-site-path.test.ts").read().split("\n")[149:160]]; print("OK" if t==j else "DIFF")'
    Run the check BEFORE editing line 4 of that file (line numbers are pre-edit). Every other test in the file stays untouched (they test the bound wrappers with Tovu's segments, and the published_page_fetch pin).
relocations: -
why_moves: -   (hasControlCharacter's wrapper doc "C0/C1 check delegated to the generic site-path owner" is a pointer; the why is on the Jini declaration site-path.ts:57-66. The removed type arm comments are verbatim on site-path.ts:19-35.)
baselines: -   (rg -n -F "platform/routing/reserved-paths" over *.json/*.mjs/*.cjs/*.yml/*.yaml: no hit at HEAD)
jini_commit: -
untangle_followup: C4.repoint.tsv (untangle/sheets/) must be updated by the coordinator after this lands:
  - row 240 (tovu, reserved-paths.ts): names becomes "checkSitePathname as sharedCheckSitePathname,checkSiteRelativeTarget as sharedCheckSiteRelativeTarget,type SitePathCheck as SharedSitePathCheck,type SiteRelativeTargetCheck as SharedSiteRelativeTargetCheck" (hasControlCharacter removed, two types added).
  - new row: tovu	apps/website/src/features/site-inspection/published-page.ts	@jini-ai/http-kit/verified-origin	hasControlCharacter	@jini-ai/core/contracts/server/verified-origin		wave
tovu_msg: "refactor(routing): drop the hasControlCharacter forwarder and narrow the shared site-path verdicts"

Order of work: blob checks; precondition; the test-drop check (must print OK); write FILE_AFTER over reserved-paths.ts; importers; drop the test block; reach_check; eslint; one Tovu commit with:
  apps/website/src/platform/routing/reserved-paths.ts
  apps/website/src/platform/routing/index.ts
  apps/website/src/platform/routing/__tests__/reserved-paths.test.ts
  apps/website/src/features/site-inspection/published-page.ts
Cloud run owes: Tovu typecheck (the narrowed types; published-page.ts:249 disallowedFormReason switches on SitePathCheck exhaustively), reserved-paths.test.ts, Jini http-kit verified-origin-site-path.test.ts. No behaviour change, no RED test.
Open questions for the owner: none. (If the owner prefers the survey's "keep only RESERVED_SEGMENTS", that is a separate sheet: 7 call sites pass reservedSegments, and the header's single-rule why must be reworded.)

FILE_AFTER (the whole new apps/website/src/platform/routing/reserved-paths.ts, verbatim, ending with one newline):
```ts
/**
 * @file The ONE rule for "does this site path belong to the admin application rather than to the
 * public site".
 *
 * Purpose:
 * The site app and the admin application share a single Express app —
 * `admin-static.ts` mounts the admin SPA at `app.use("/admin", ...)` and `core.ts` mounts the
 * session gate at `app.use("/api/admin", ...)`, alongside `/api/runs`, `/api/tools` and friends.
 * So a "site path" a caller hands to a public-site feature can silently name the authenticated
 * surface instead. Several features need to refuse that, and each one refusing it slightly
 * differently is how a bypass gets built: `site-inspection`'s `published_page_fetch` (which claims
 * to fetch a PUBLISHED PAGE) and `redirects` (its write chokepoint, which stores a `Location`
 * target, and its read gate, which checks the interpolated `Location` a visitor's browser receives)
 * are the live consumers today.
 *
 * Generic decoding and origin-tracking rationale lives in @jini-ai/http-kit/verified-origin.
 *
 * Architectural role:
 * Platform library, no I/O. `routing` already owns the shared URL vocabulary Menus/SEO/Redirects
 * were deliberately stopped from each reinventing (see this directory's INFO.md), which is the same
 * reason this rule lives here rather than inside either consumer.
 */

import {
  checkSitePathname as sharedCheckSitePathname,
  checkSiteRelativeTarget as sharedCheckSiteRelativeTarget,
  type SitePathCheck as SharedSitePathCheck,
  type SiteRelativeTargetCheck as SharedSiteRelativeTargetCheck,
} from "@jini-ai/http-kit/verified-origin";

/** A path that lands on the admin application instead of the public site. */
export type ReservedSurface = "admin" | "api";

/** {@link checkSitePathname}'s verdict: the shared verdict, its `reserved` arm narrowed to this app's
 *  surfaces. Every arm is a refusal except `ok`; each arm is documented on the shared type. */
export type SitePathCheck = Exclude<SharedSitePathCheck, { kind: "reserved" }> | { kind: "reserved"; surface: ReservedSurface };

/** {@link checkSiteRelativeTarget}'s verdict: the shared verdict, its `reserved` arm narrowed to this
 *  app's surfaces. */
export type SiteRelativeTargetCheck = Exclude<SharedSiteRelativeTargetCheck, { kind: "reserved" }> | { kind: "reserved"; surface: ReservedSurface };

/**
 * The segment names the admin application owns. Compared case-folded, one segment deep.
 * Content cannot claim these surfaces: explicit slugs are refused (BR-03), and derived slugs
 * skip them through the normal collision suffix search (BR-02).
 */
export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set<ReservedSurface>(["admin", "api"]);

/** Check an already-parsed URL against this app's reserved surfaces.
 * @param required.url a URL already established to be on this site's origin.
 * @returns The unchanged reserved-path verdict, narrowed to Tovu's two surfaces.
 * @complexity O(url.pathname.length).
 * @example checkSitePathname(new URL("http://site.invalid/admin")); // reserved: admin
 */
export function checkSitePathname({ url }: { url: URL }, _optional = {}): SitePathCheck {
  return sharedCheckSitePathname({ url, reservedSegments: RESERVED_SEGMENTS }, {}) as SitePathCheck;
}

/** Check an untrusted relative target against this app's reserved surfaces.
 * @param required.raw a raw site-relative reference; parsing and origin tracking belong to the shared owner.
 * @returns The unchanged relative-target verdict, narrowed to Tovu's two surfaces.
 * @complexity O(raw.length).
 * @example checkSiteRelativeTarget("/new"); // ok
 */
export function checkSiteRelativeTarget({ raw }: { raw: string }, _optional = {}): SiteRelativeTargetCheck {
  return sharedCheckSiteRelativeTarget({ raw, reservedSegments: RESERVED_SEGMENTS }, {}) as SiteRelativeTargetCheck;
}
```
