id: DL-routing-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/platform/routing
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (RESERVED_SEGMENTS, hasControlCharacter, checkSitePathname, checkSiteRelativeTarget); likely DEDUPE/reduce-to-binding or a fold with moved bodies
tovu_file: apps/website/src/platform/routing/reserved-paths.ts | blob 91c8af0cc159d489a85f4051830ac59b33dbe27d
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "reserved-paths" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/platform/routing/reserved-paths.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*reserved\-paths(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/platform/routing/reserved-paths.ts
importers (4 prod, 10 test; resolved to this file):
  - apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/assistant/__tests__/tool-registrations.redirects.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/features/redirects/__tests__/agent-tools.tombstone-confirmation.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/features/redirects/__tests__/phase-handler.disposer-scope.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/features/redirects/__tests__/phase-handler.multi-site-lifecycle.test.ts:2 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/features/redirects/__tests__/publish-content.characterization.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/features/redirects/__tests__/publish-content.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/features/redirects/__tests__/tool-registrations.model-facing-errors.test.ts:1 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/platform/routing/__tests__/reserved-paths.test.ts:4 | static | "../reserved-paths.js"
  - apps/website/src/platform/routing/index.ts:1 | reexport | "./reserved-paths.js"
  - apps/website/src/platform/routing/index.ts:2 | reexport | "./reserved-paths.js"
  - apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts:3 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/server/runtime/composition/app.ts:47 | static | "#src/platform/routing/reserved-paths"
  - apps/website/src/server/runtime/composition/deps.ts:79 | static | "#src/platform/routing/reserved-paths"
path_literals (rg -F "routing/reserved-paths", not already importers):
  - apps/website/src/features/site-inspection/published-page.ts:307: *   (`platform/routing/reserved-paths.ts`), so `/%61dmin` is refused while `/administer-survey`
  - apps/website/src/features/redirects/INFO.md:26:`platform/routing/reserved-paths.ts` exports the existing admin/api set. Jini
  - apps/website/src/features/site-inspection/__tests__/published-page.unit.test.ts:290:  // Widened from `/api/` only when `platform/routing/reserved-paths.ts` became the single copy of
baselines (json files naming the path): -
declarations (name | line | kind):
  - ReservedSurface | apps/website/src/platform/routing/reserved-paths.ts:31 | type
  - SitePathCheck | apps/website/src/platform/routing/reserved-paths.ts:34 | type
  - SiteRelativeTargetCheck | apps/website/src/platform/routing/reserved-paths.ts:44 | type
  - RESERVED_SEGMENTS | apps/website/src/platform/routing/reserved-paths.ts:59 | const
  - hasControlCharacter | apps/website/src/platform/routing/reserved-paths.ts:66 | function
  - checkSitePathname | apps/website/src/platform/routing/reserved-paths.ts:76 | function
  - checkSiteRelativeTarget | apps/website/src/platform/routing/reserved-paths.ts:86 | function
folds: TODO(judge)
tests:
  - apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts | blob 02203dff513f97498f32fec53afc387ea6d1df4c | TODO(judge) delete|repoint
  - apps/website/src/assistant/__tests__/tool-registrations.redirects.test.ts | blob a4251cc9963a68d3a7449c2ef503f868769b3fec | TODO(judge) delete|repoint
  - apps/website/src/features/redirects/__tests__/agent-tools.tombstone-confirmation.test.ts | blob ec2299ff3992153ce84b480247cf85fd06b0a97f | TODO(judge) delete|repoint
  - apps/website/src/features/redirects/__tests__/phase-handler.disposer-scope.test.ts | blob e8f5b6dfa98b6639b91642836fd5e769ec85222b | TODO(judge) delete|repoint
  - apps/website/src/features/redirects/__tests__/phase-handler.multi-site-lifecycle.test.ts | blob f37305159c9aae938627cc189f3ae85a40590151 | TODO(judge) delete|repoint
  - apps/website/src/features/redirects/__tests__/publish-content.characterization.test.ts | blob 44a29e4f7bf1c077e7fc2d077a4ad71bb9313067 | TODO(judge) delete|repoint
  - apps/website/src/features/redirects/__tests__/publish-content.test.ts | blob 076e80d0aa4f27e6c38d9e0048a4dd87440f054d | TODO(judge) delete|repoint
  - apps/website/src/features/redirects/__tests__/tool-registrations.model-facing-errors.test.ts | blob 99643620ca65be348c065925dc10da3ab65b1cc7 | TODO(judge) delete|repoint
  - apps/website/src/platform/routing/__tests__/reserved-paths.test.ts | blob d78428fab83cf9eb9585c12f91b5a5296503699e | TODO(judge) delete|repoint
  - apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts | blob 1e479d33a7a16e488ac92264d0963f634ec46d18 | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
