id: DD-site-guide-1   (template T-DEDUPE, `type-narrowing` variant + importer repoint; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton: delete-site-guide.gen.md)
feature: website/features/site-guide
kind_check: RE-KINDED DELETE -> DEDUPE. contracts.ts is type-only (4 declarations, 0 runtime), not dead (15 importers). Two of its types are exact twins of Jini `@jini-ai/agentic/core` types (`CapabilityCard` = `GuideTopic`, `SiteFact` = `GuideFact`): those are deduped. The other two (`SiteGuideService`, `SiteGuideEngine`) are Tovu's deliberately loose structural port over the probed engine namespace (`composition/site-guide.ts:36` `resolveSiteGuideEngine`): they STAY. Reason they cannot be Jini's types: Jini `SiteGuide.run` returns `Promise<GuideResult>`, Tovu's returns `Promise<unknown>`, and 5 contract tests fake the engine with results such as `{ learned: input.topic }` (`composition/__tests__/site-guide-tools.test.ts:34,85,106,139`); typing them with Jini's would force those fakes to change (COMMON rule 20). Survey note's "repoint to SiteGuide/SiteGuidePorts" is therefore taken only for the two twin types.
untangle_overlap: YES -> EXECUTE AFTER WAVE B MERGE. C10.repoint.tsv:152 (MANUAL namespace edit) touches `server/runtime/composition/site-guide.ts`; that file is guarded by TEXT below. No untangle row moves `GuideTopic`/`GuideFact` out of `@jini-ai/agentic/core` (rg over untangle/sheets: none), so the target specifier is stable.
blocked: no
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base

tovu_files:
  - apps/website/src/features/site-guide/contracts.ts | blob 49cc0a452b40e683dfc48fcf0bd2e09a4740ebcd | type-narrowing (reduced: keeps SiteGuideService, SiteGuideEngine; CapabilityCard and SiteFact removed)
jini_survivor: @jini-ai/agentic/core GuideTopic at packages/agentic/src/core/site-guide/types.ts:14, GuideFact at :29 | blob of types.ts: run `git -C {JINI_CLONE} hash-object packages/agentic/src/core/site-guide/types.ts` and compare with `git -C {JINI_CLONE} rev-parse HEAD:packages/agentic/src/core/site-guide/types.ts` (must be clean); chain: packages/agentic/package.json:39 "./core" -> src/core/index.ts:165 `export * from './site-guide/index.js';` -> site-guide/index.ts:1 `export * from './types.js';`
behaviour_diff:
  - type CapabilityCard vs GuideTopic: id/title/summary/explanation string, permissions readonly string[], pointers {label; tool?; href?; permissions}[], workflows {title; steps; permissions}[] / Jini identical except pointer `tool?: string | undefined`, `href?: string | undefined` / same (no tsconfig in the repo sets exactOptionalPropertyTypes: `rg -l exactOptionalPropertyTypes -g 'tsconfig*.json'` prints nothing)
  - type SiteFact vs GuideFact: identical union (`ok` + data + truncated? | `forbidden`/`unavailable`) / same
  - runtime: none (type-only) / same
real_caller_check: `features/*/capability-card.ts:… } as const satisfies CapabilityCard;` (10 files) relies on the topic shape being closed: `satisfies GuideTopic` keeps excess-property checks. `composition/site-guide.ts:24` `TOVU_CAPABILITY_CARDS: readonly CapabilityCard[]` is passed to `engine.createSiteGuide({ builtInTopics })`, whose Tovu port type now names `GuideTopic`: same type.
binding: |
  The WHOLE new apps/website/src/features/site-guide/contracts.ts (exact text, ending with one newline):
  ----8<----
/** Tovu's host contract for the optional Jini learning engine. Structural ports let boot defer
 * a new package export until its build exists, without taking the owner's dev server down.
 * Topic and fact shapes are Jini's; the service result stays opaque so contract tests can fake
 * the engine. */
import type { GuideFact, GuideTopic } from "@jini-ai/agentic/core";

export interface SiteGuideService {
  run(input: { caller: { principalId: string }; operation: "overview" | "explain"; topic?: string }, options?: Record<string, never>): Promise<unknown>;
}
export interface SiteGuideEngine {
  createSiteGuide(input: {
    builtInTopics: readonly GuideTopic[];
    authorize: (input: { caller: { principalId: string }; permission: string }) => Promise<boolean>;
    facts: { read(input: { caller: { principalId: string }; topics: readonly string[] }): Promise<Readonly<Record<string, GuideFact>>> };
    loadContributions: (input: { caller: { principalId: string } }) => Promise<{ items: readonly { pluginId: string; topics: readonly GuideTopic[] }[]; refusals: readonly string[] }>;
  }, options?: Record<string, never>): SiteGuideService;
  parseGuideTopics(input: { raw: string }, options?: Record<string, never>):
    { ok: true; descriptors: readonly GuideTopic[] } | { ok: false; reason: string };
}
  ----8<----
  (Lines 13-25 of the old file are kept verbatim apart from `CapabilityCard` -> `GuideTopic` (3x) and `SiteFact` -> `GuideFact` (1x). The two header lines are kept; 2 lines added to it.)
why_moves:
  - "Tovu's host contract for the optional Jini learning engine" -> stays in Tovu above the binding (it explains the structural port that stays)
jini_test_text: -
failing_test: -
importer_edits:                            # census: python3 scripts/census.py {TOVU_CLONE} apps/website/src/features/site-guide/contracts.ts -> 15 hits (list below + index.ts:1 reexport, unchanged)
  - apps/website/src/assistant/site/capability-card.ts, apps/website/src/features/site-guide/capability-card.ts, and features/{widgets,forms,recovery,deployments,members,seo,post,plugin-runtime,theme}/capability-card.ts (11 files): "import type { CapabilityCard } from \"#src/features/site-guide/contracts\";" -> "import type { GuideTopic as CapabilityCard } from \"@jini-ai/agentic/core\";"  (each exactly once; the rest of each file is unchanged)
  - apps/website/src/assistant/__tests__/tool-guidance.live.test.ts | blob 034887240f990dc4e5154280715489955dcdfa8e: "import type { CapabilityCard } from '../../features/site-guide/contracts.js';" -> "import type { GuideTopic as CapabilityCard } from '@jini-ai/agentic/core';"
  - apps/website/src/features/site-guide/facts.ts | blob 6903e1ced74a178a71bcf280dd677e7e346f153e: "import type { SiteFact } from \"./contracts.js\";" -> "import type { GuideFact as SiteFact } from \"@jini-ai/agentic/core\";"
  - apps/website/src/features/site-guide/plugin-contributions.ts | blob ca07a6b5684d261b317de47d0e4abeb8202fde5a: "import type { CapabilityCard, SiteGuideEngine } from \"./contracts.js\";" -> two lines: "import type { GuideTopic as CapabilityCard } from \"@jini-ai/agentic/core\";" then "import type { SiteGuideEngine } from \"./contracts.js\";"
  - apps/website/src/server/runtime/composition/site-guide.ts (TEXT-guarded, hot: C10): "import { readSiteGuideFacts, loadSiteGuideContributions, type CapabilityCard, type SiteGuideEngine, type SiteGuideService } from \"#src/features/site-guide/index\";" -> two lines: "import { readSiteGuideFacts, loadSiteGuideContributions, type SiteGuideEngine, type SiteGuideService } from \"#src/features/site-guide/index\";" then "import type { GuideTopic as CapabilityCard } from \"@jini-ai/agentic/core\";". If eslint reports import/no-duplicates against the file's `import * as agentic from "@jini-ai/agentic/core";` line, SKIP (do not restructure the namespace import: C10 owns it).
  Blobs of the 11 capability-card files are not listed: guard each by its OLD line occurring exactly once.
census_after: rg -n --no-heading -w "CapabilityCard|SiteFact" apps content development -g '*.ts' -g '*.tsx' -g '!**/node_modules/**' | rg "import" -> only the 15 `GuideTopic as CapabilityCard` / `GuideFact as SiteFact` lines above. `python3 scripts/census.py {TOVU_CLONE} apps/website/src/features/site-guide/contracts.ts` -> exactly 2 hits: index.ts:1 (reexport) and plugin-contributions.ts (SiteGuideEngine).
baselines:
  - development/scripts/check-architecture.baseline.json | blob d304490c2f0d88f71447aba691c86858e3e23732: remove the 9 lines `    "apps/website/src/features/{deployments,forms,members,plugin-runtime,post,recovery,seo,theme,widgets}/capability-card.ts -> apps/website/src/features/site-guide/contracts.ts",` (today lines 80,144,220,243,252,302,309,411,439; none is the last array element, so no comma fix-up). The gate only fails on INTRODUCED edges (`check-architecture.ts:279`), so this is a ratchet tightening; then `node -e 'JSON.parse(require("fs").readFileSync("development/scripts/check-architecture.baseline.json","utf8"))'`.
bundle_check: - (type-only)
jini_msg: - | tovu_msg: "refactor(site-guide): use Jini GuideTopic and GuideFact for capability cards and facts" | body "Tovu keeps only its structural SiteGuideEngine/SiteGuideService port over the probed engine."
Commit paths (17): contracts.ts, 11 capability-card.ts files, tool-guidance.live.test.ts, facts.ts, plugin-contributions.ts, composition/site-guide.ts, check-architecture.baseline.json.
Cloud run owes: Tovu typecheck; site-guide-tools.test.ts, plugin-contributions.test.ts, tool-guidance.live.test.ts; `npm run check:architecture`. No RED test.
est_executor_tokens: ~45k Sonnet (17 edited files)
