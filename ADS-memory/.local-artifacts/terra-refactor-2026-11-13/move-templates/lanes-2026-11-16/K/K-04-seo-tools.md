# K-04 SEO agent tools -> `@jini-ai/cms/seo` (one run, est 160k)
files: `K-04.files.tsv` (`seo/agent-tools.ts`, `seo/tool-registrations.ts`; `agent-tools.ts` is 280 lines on refactor/terra, 11 more than merge-a: sidecars regenerated 2026-11-17, row in `BLOB-DRIFT.tsv`). tools: `K-04.tools.tsv` = 6 (round 1 said 7), longest 22. pkg: cms. THIRD_PARTY_ALLOWED: none.
writes: `development/scripts/size-debt.json` entry `buildSeoRegistrations#1`, deleted in S1. (`check-architecture.baseline.json` is NOT edited: the gate fails only on an introduced edge, `check-architecture.ts:277-281`; a removed edge needs no baseline change, and `--update` is forbidden.) tests: `apps/website/src/features/seo/**/*.test.ts`.
revision 4 (sheet-fixes-2, 2026-11-18): the 2026-11-18 run (`origin/wave3/kt-k03-k04:cloud-results/kt-k03-k04.md`) STOPPED because `agent-tools.ts:3-10` imports six bounds from `./settings.js` (STAY) and no BINDINGS row covered it. Fixed: row `own-limit` below + step S0b (pattern). Rerun from S0 on a fresh branch from refactor/terra. Facts re-checked on Tovu ada11733f: blobs unchanged (28ed80b5, 261697ee).
also-writes (S0b-T only): `apps/website/src/features/seo/settings.ts` (blob 1358ae09, 411 lines: delete lines 187-195 = the 3-line comment + six constants; add the six names to the line-12 import from `@jini-ai/cms/seo`). `agent-tools.ts`: lines 3-10 are deleted and the six names join the line-2 import from `@jini-ai/cms/seo`. No test imports these names. Jini new: `packages/cms/src/seo/settings-limits.ts`, `packages/cms/src/seo/__tests__/settings-limits.test.ts`, one line in `packages/cms/src/seo/index.ts`, `.changeset/cms-seo-settings-limits.md`. The comment's reference to "write-service.ts's identical export note" stays true in Jini (`seo/write-service.ts:43-44` holds `STRING_FIELD_MAX_LENGTH`/`URL_FIELD_MAX_LENGTH`).
S0b census (Tovu root; prints nothing, else STOP):
```bash
git grep -n -w -E "DEFAULT_DESCRIPTION_MAX_LENGTH|DEFAULT_OG_IMAGE_MAX_LENGTH|MAX_ROBOTS_RULES|MAX_RULE_PATH_ENTRIES|TITLE_TEMPLATE_MAX_LENGTH|TWITTER_SITE_MAX_LENGTH" -- apps development scripts | rg -v "^apps/website/src/features/seo/(settings|agent-tools)\.ts:"
git -C {JINI_CLONE} grep -n -w -E "DEFAULT_DESCRIPTION_MAX_LENGTH|DEFAULT_OG_IMAGE_MAX_LENGTH|MAX_ROBOTS_RULES|MAX_RULE_PATH_ENTRIES|TITLE_TEMPLATE_MAX_LENGTH|TWITTER_SITE_MAX_LENGTH" -- packages
```
S0b V3: `MAX_ROBOTS_RULES = 49` in the Jini leaf -> `seo/__tests__/settings.test.ts:126` ("robotsRules with exactly 50 entries is accepted") RED and S0 (b) RED on `seo_set_settings`.
over the limit: `buildSeoRegistrations` 88. (`getSeoAgentToolCatalog` 51 is already split on refactor/terra into `seoEntryTools()` + `seoSettingsTools()`, `agent-tools.ts:219-280`; `K-04.fnsize.tsv` no longer lists it, so S1 does not split it again.)
BINDINGS:
| import | class | action |
|---|---|---|
| `toolMetadata` (`tool-metadata/seo.js`) | host | `withToolMetadata` |
| `DEFAULT_DESCRIPTION_MAX_LENGTH`, `DEFAULT_OG_IMAGE_MAX_LENGTH`, `MAX_ROBOTS_RULES`, `MAX_RULE_PATH_ENTRIES`, `TITLE_TEMPLATE_MAX_LENGTH`, `TWITTER_SITE_MAX_LENGTH` (`agent-tools.ts:3-10`, from `./settings.js`, STAY; `SET_SETTINGS_SCHEMA` bounds + description text) | own-limit | S0b moves them to Jini leaf `cms/src/seo/settings-limits.ts` (values 500, 2048, 50, 100, 500, 100); `settings.ts`'s validators (lines 232-303) read them from `@jini-ai/cms/seo`; in the S3 Jini catalog they are `own` (`./settings-limits.js`) |
| `getSeoSettings`, `setSeoSettings` (`./settings.js`, STAY) | port | `deps.seoSettings: { get(input), set(input) }`: types = the second parameter and return type of the two functions today; Tovu binding closes over the settings deps the handler builds today |
| `PostRepoPort`, `SettingsRepoPort`, four media ports, `PrincipalRepoPort` (type-only) | structural | declared locally ONLY if a handler calls a member; a port only forwarded into `seoSettings`/host bindings leaves the Jini deps type |
| `SeoHostBindings` (`./index.js`) | host | stays a Tovu type; Jini gets the resolved values as fields (list them in the report) |
| `OriginRegistryPort`, `@jini-ai/core/*` | core | as is |
| `@jini-ai/cms/seo`, `@jini-ai/cms/core` | own | leaf files |
no surfaces (`ToolContributor<SeoToolDeps, unknown>`).
S0 extra: (f) the settings tool refuses an unknown key with the same message; (g) a write with a stale `expectedVersion` returns the same version-conflict envelope.
changeset: cms minor.
