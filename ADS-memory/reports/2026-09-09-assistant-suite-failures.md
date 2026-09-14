# Assistant-suite pre-existing failures — reproduction, diagnosis, fixes

## Baseline (confirmed before any change)

```
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test \
  --experimental-test-module-mocks \
  "apps/website/src/assistant/__tests__/byok-google-catalog.test.ts" \
  "apps/website/src/assistant/__tests__/tool-registrations.authorization.test.ts" \
  "apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts"
```
3 files, 53 tests, **44 pass / 9 fail** — exactly matched the expected baseline. No stop needed.

Failing tests (9): 5× `tool-registrations.authorization.test.ts` (`collections_content_type_{define,update_fields,deprecate,reactivate,tombstone}`), 3× `tool-registrations.contracts.test.ts`, 1× `byok-google-catalog.test.ts`.

Root tsc (`npx tsc -p tsconfig.json --noEmit`): exit 0 before any change, exit 0 after every commit below.

## Group 1 — authorization (5 failures) — SECURITY-RELEVANT, production code was correct, test was stale

**Root cause: the test's expectation was wrong, not the production code.** The five content-type mutation tools live in `@jini-ai/cms/content-types` (a symlinked local Jini package, `node_modules/@jini-ai/cms -> ../../../Jini/packages/cms`), not in Tovu — which is why an earlier grep of Tovu's own `apps/website/src/features/content-types/*` found zero `authorize()` calls and got relayed as "authorization never invoked." That grep was searching the wrong repo for this logic.

Jini commit `a93e7b62` ("fix(cms): thread entityType through entries/content-types authorize chokepoints", already on `general-work` and already present in the built `dist/` Tovu's symlink resolves to) added `entityType: "content-type"` to the `authorize()` calls in `registerContentType`, `updateContentTypeFields` (`write-service.ts`) and `deprecateContentType`/`reactivateContentType`/`tombstoneContentType` (`lifecycle.ts`). Jini's own integration test (`content-types/__tests__/write-service.authorize-entitytype.integration.test.ts`) documents why: before the fix, these five domain functions omitted `entityType` while their fronting HTTP admin routes pre-checked WITH it — a principal holding only a `resourceType: "content-type"`-scoped grant could pass the route but be denied at the chokepoint with `resource_scope_mismatch`. This is a real, deliberate, already-shipped security fix.

Tovu's test asserted the old 3-key shape (`principalId`, `permission`, `workspaceId`) via a strict `deepEqual`, predating that Jini fix, and its own comment incorrectly claimed only `collections_content_type_list` carries `entityType`.

**Fix** (`apps/website/src/assistant/__tests__/tool-registrations.authorization.test.ts`): added `entityType: string` to the `AuthorizeCall` interface, added `entityType: "content-type"` to the expected object in the shared per-tool `deepEqual` assertion, corrected the stale comment, with a doc note explaining the Jini fix this now matches. Test intent preserved as a security guard — this is the correct, current authorization contract, not a relaxation.

Verified: 23/23 tests pass in this file alone.

## Group 2 — contracts (3 failures) — bigger drift than the dispatch brief described; NOT a missing import

The brief's framing ("`content_read.backup_restore_point` is missing from `CATALOGS_BY_DOMAIN`... add that domain's own catalog import") is **not the real cause**. I verified directly (temporary probe test, removed before commit): `content_read.backup_restore_point` is only the *first* of **28** `content_read.<resource>` collapsed ids that `catalogEntry()`'s literal `tool.name === toolId` lookup cannot resolve. All three affected tests iterate with fail-fast `for` loops, so each one reports whichever id it hits first (always `backup_restore_point`, first in `CONTENT_READ_CARDS`) and never reaches the other 27 — that's why the error always names the same id.

`CATALOGS_BY_DOMAIN` already has a `recovery` entry (line 176) — the completeness test (line 240, which checks *domain* names, not tool ids) already passes and is not among the 9 failures. Adding another import would change nothing. The real issue: `deriveContentReadRegistrations` (`content-read-tool.ts`) is the composition root's *last* step — it replaces each Tier-1 read tool's original id (e.g. `backup_list_restore_points`) with a synthesized `content_read.<resource>` card whose `inputSchema`/`description` are a **union/concatenation** of its member(s)' own already-published values, computed at build time — never a literal `AgentToolDefinition` under that name in any domain's static catalog. Worse: even a correctly-resolved catalog entry could not satisfy the classification-agreement test, because `assertRiskMetadataIsWirable`'s `derivedRiskByToolId()` map is keyed by each tool's *original* id (populated during that domain's own `buildDomainRegistrations`, which runs *before* the collapse) — it has no entry at all under any `content_read.*` key, so that check would throw "no entry in DERIVED_RISK_BY_TOOL_ID" regardless of what `catalogEntry()` returned. In production, every member tool's risk/actorClassRule was already validated pre-collapse, under its real id — re-checking under the relabeled id is unsatisfiable by construction, not real drift.

**Fix** (`apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`): added `DERIVED_CONTENT_READ_IDS` (derived from the already-exported `RETIRED_READ_TOOL_TO_CARD`'s values, not a hand-copied prefix check) and excluded those ids from the three generic loops (inputSchema-equality, classification-agreement, actorClassRule), each with an inline comment plus one shared doc block explaining why. This mirrors the exact carve-out `tool-registrations.authorization.test.ts` already uses for `collections_content_type_list`. The `assert.ok(inputSchema)` truthy check is kept for every id, including derived ones — only the catalog-equality comparison is skipped. No loss of real coverage: every member tool is still validated pre-collapse under its own domain's wiring.

Verified: 27/27 tests pass in this file alone.

## Group 3 — byok-google-catalog (1 failure) — real bug in the Gemini schema sanitizer

`seo_set_entry_overrides.properties.ogType.enum`: "every 'enum' member must be a string, got object" (`typeof null === "object"` in JS — that's what "object" meant).

Root cause: `ogType`/`twitterCard` (`apps/website/src/features/seo/agent-tools.ts`) use the JSON-Schema nullable-enum idiom: `type: ["string","null"]` paired with `enum: [...VALUES, null]`, so passing the literal value `null` clears the override. `sanitizeGoogleSchema` (`byok-provider-turn.ts`) already collapses the `type` array via `collapseGoogleTypeArray` (`["string","null"]` → `{type:"string", nullable:true}`), but nothing did the equivalent for `enum`: the generic fallback path recursed into the array via `sanitizeGoogleSchema`, and for the `null` entry `isRecord(null)` is `false`, so it returned `null` unchanged — reaching Gemini's wire format as a literal `null` `enum` member, which Gemini rejects (its `enum` is `repeated string` only).

Only two real catalog sites have this shape (confirmed by repo-wide grep): `seo`'s `ogType` and `twitterCard`. The baseline's single reported failure was, again, just the first one hit by the fail-fast assertion loop over schema nodes — `twitterCard` carries the identical bug and would have failed next.

**Fix** (`apps/website/src/assistant/byok-provider-turn.ts`): added `isGoogleNullableEnumKey`/`applyGoogleSchemaEnum`, wired into `applyGoogleSchemaEntry` right after the existing type-array branch. Drops the `null` member from `enum` rather than converting it — safe because the sibling `type` array on the same node already sets `nullable: true` in the same entries-loop pass, which is where Gemini expresses "this field may be absent/null"; nothing is lost.

Verified: 3/3 tests in `byok-google-catalog.test.ts`, and all 24 tests in the sibling `byok-provider-turn.test.ts` (including the numeric-enum round-trip for `redirects_create`) still pass — no regression.

## Final state

Full target command re-run after all three fixes: **3 files, 53 tests, 53 pass, 0 fail.**

Root `npx tsc -p tsconfig.json --noEmit`: exit 0, no output, after every commit.

`npx eslint apps/website/src/assistant/byok-provider-turn.ts`: 0 errors, 1 pre-existing warning at line 964 (unrelated `sonarjs/no-inconsistent-returns`, not touched by this change).

## Commits (3, one per group)

1. `c1ea6d01` — `fix(assistant): update content-type authorize() expectations for entityType`
2. `c1e2e57a` — `fix(assistant): exclude collapsed content_read.* ids from catalogEntry() cross-checks`
3. `d7f29dc4` — `fix(assistant): strip the nullable-enum's literal null before it reaches Gemini`

All via `git add <explicit path>` (never `-A`), each commit message written to a uniquely-named scratch file and applied with `-F`.

## Scope notes

- Did not touch `apps/website/src/features/pages/**`, anything under `apps/admin/`, the 19-tool-id redact-validation sweep, or the two `pages_write_region` bugs — all explicitly out of scope, and none of my three fixes touched those paths.
- Group 2's fix imports `RETIRED_READ_TOOL_TO_CARD` from `../content-read-tool.js` into the test file — no production file in that area was touched, so no collision risk with another agent's `content-read-tool.ts` work, if any.
- No Jini repo changes were made — Jini's `general-work` branch already has the correct fix (`a93e7b62`) built into `dist/`; Group 1 only updated the Tovu-side test.
