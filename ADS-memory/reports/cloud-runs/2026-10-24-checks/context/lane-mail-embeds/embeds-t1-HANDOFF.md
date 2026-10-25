Programmer(Direct): Programmer persona loaded for the approved T1 host integration.

Inputs: owner PEER_DISPATCH; OPUS-REVIEW.md T1 row (SHA-256
`b265853d87a238e98469fcc9623e1dfc3f91cfa371daaf94b977037c92221adb`), overriding the earlier design;
linked Jini source and built declarations in jini-int2; canonical architecture chapters 13/14 and
project memory. The clone's architecture/memory paths are absent; canonical Tovu copies were used.
Graph MCP tools were unavailable; discovery used rg and direct source reads.

Status: T1 implementation prepared for review. Runtime/tests have NOT been executed, per dispatch.
One required upstream template-policy gap remains; do not call this runtime-verified or release-ready.

Behavior:
- Admits bundled-digest packages through Jini's existing lifecycle, with active and disabled catalogs
  kept separate. Canonical manifest ids, renamedFrom and component aliases resolve without guesses;
  ambiguous identities/components refuse rendering. Unknown config fields are ignored.
- Reuses Jini's bounded props validation at save and render. Known enabled invalid props reject both
  seed and write with a typed ToolInputError/HTTP 400; unknown/disabled/unsupported/unready exports
  save with safe warnings. Assistant full/region/move writes and the authenticated HTML save response
  expose those warnings. HTTP preflight prevents a refused first save from converting a doc body.
- Preserves the captured CAS basis before awaiting validation. A focused test source covers a slower
  second validation resuming after the first write advanced the same store instance.
- Threads the CMS port through all four existing HTML resolution sites. The renderer returns the
  structured plugin IR props, allowing CMS to preserve wrappers/fallback, stamp canonical attribution,
  and keep the existing consent gate in the response path. Existing embed arms are unchanged.
- Collects declared CSS once per export stylesheet per public request, including nested renders,
  using the existing extraHead insertion helper. Static fallback-only keeps authored HTML and ships
  declared CSS/artwork via stylesheet/preload links. Full/link-only share the v1 native, script-free
  template path; readiness still applies when host links are needed.
- Serves only enabled exports' declared CSS/PNG/SVG files at /api/agent-plugin-exports/v1. Templates and
  undeclared/traversal paths are refused, limiting happens before I/O, SVG gets sandbox CSP/nosniff.
  The existing static exporter crawls this prefix and rewrites its URLs for base paths.
- Adds exports[] (component/version/minVersion/schema/consent/availability/snippet) to existing
  plugins_list rows, preserving the admin.plugins.read permission and failure isolation. A snippet is
  ready only when empty props satisfy the contract and host readiness succeeds; required props are
  reported as props-required rather than invented by the host.

Decisions and open work:
- Google manifest/template/CSS/G mark/SKILL.md and editor preview/card work belong to U1 in the binding
  review, so none were changed. No vendor-specific code was added outside a plugin.
- REQUIRED upstream J2 gap: linked cms/src/widgets/html/plugin-export.ts fillSlotText checks URL
  results for local paths, but accepts a static href="/static". The dispatch says static hrefs are
  refused. T1 deliberately keeps the HTML-policy owner in Jini, and the render suite contains the
  expected refusal assertion. Source review predicts that assertion currently fails; no test was run.
  Coordinator should return that rule to J2, then rerun the scoped commands below.
- TrustedPluginFile is UTF-8 only. PNG uses Node readFile after the SAME lifecycle containment owner;
  CSS/SVG/template/manifest reads use readTrustedPluginFile. A binary trusted-file port is logged in
  ../tovu-to-jini-extract/SURVEY.md for Jini; no second path validator was created here.
- The full root tsc was interrupted without a result. One broader compile also showed four diagnostics
  in concurrent ask-choice work (missing chat exports/accepted-input surfaceUri), left untouched.
  Selected-file semantic checks subsequently report zero diagnostics for all changed production
  functions/composition roots and separately for the new/updated test sources. This is scoped
  compilation evidence, not a green repository-wide baseline.

Verification (no tests run):
- Selected-file TypeScript syntax/semantic diagnostics: 0 (production-types.log).
- Test-source TypeScript syntax/semantic diagnostics: 0 (test-source-types.log); this did not execute tests.
- Syntax parsing: 30 scoped TypeScript files, 0 diagnostics.
- ESLint complexity rule: all checked new/materially changed logic functions <=10. Existing
  composeSiteRouteDeps is 13 on both HEAD and working source; T1 adds wiring, no branches there.
  Its unrelated existing complexity was not refactored. Detailed scoped output: complexity.json.
- git diff --check passed. No installs, manifest version-range changes, commits or test processes.
- Tests added cover wrapper/fallback and stamps, two occurrences, JSON attribute/slot escaping,
  explicit/ambiguous renames, version range/null handling, props refusal and warnings, CAS timing,
  workspace/provider ownership, consent gate, legacy parity, public file security, catalog rows,
  bundled-template validation, and a real static export with base path/CSS/PNG.

Reuse:
- Admission/paths: inspected lifecycle/trusted-plugin-files.ts and Tovu admin-surfaces/surfaces.ts;
  calls findTrustedPluginPackages/readTrustedPluginFile/assertContainedOnDisk. Owner: review T1/J1.
- Props: inspected agent-plugins lifecycle/exports.ts and admin-surfaces/action-schema.ts;
  calls parseAgentPluginManifest/validateAgentPluginExportProps, no schema validator copied.
- HTML/snippets: inspected CMS html/plugin-export.ts, html-embeds.ts and markers/marker.ts;
  calls node-only resolveHtmlPageEmbeds, structured substitution and embedMarkerSnippetFromConfig.
- Readiness: inspected member-login/providers.ts, credentials.ts and composition/modules/members.ts;
  moved its existing listProviders composition into member-login/ready-providers.ts and calls it from
  both OIDC composition and the export runtime. MEMBER_OIDC_PATH now lives in the member-login feature
  and remains re-exported from the HTTP module to avoid a feature-to-server dependency.
- Styles/assets/export: inspected extraHead insertion, public surface files route, and static exporter;
  uses the existing insertion helper, limiter, containment owner, exporter crawler and base-path policy.

Architecture audit: WARNING pending the upstream J2 rule, with no known new dependency-direction
violation. CMS owns filling/HTML safety and does not gain a Tovu dependency. Tovu owns site admission,
public member URLs/readiness, persistence checks and HTTP composition. GOV-ADR-001 was consulted;
no new gated mutation, watermark mechanism or persistence writer was introduced. Existing SQL/memory
store variants remain separate because they write different repository implementations and must share
only validation policy, not pretend to share persistence state. Existing positional store/render APIs
remain compatible; new factories/ports use object arguments and optional options objects.

Function quality (grouped assessment):
| Unit | Disposition | Findings / local fix |
|---|---|---|
| Source/admission/assets | NO_RECORDED_FINDINGS | Containment delegated; binary API gap tracked upstream. |
| Selection/props/version diagnostics | NO_RECORDED_FINDINGS | Version check separated to keep CCN <=10. |
| Runtime/host links/catalog/styles | NO_RECORDED_FINDINGS | Request-scoped state; one readiness/catalog load; no secret projection. |
| Save adapters/editor projection | NO_RECORDED_FINDINGS | Captured CAS basis before async validation; typed errors; no new writes. |
| Render/session/route wiring | NO_RECORDED_FINDINGS | Structured IR helper preserves stamps; missing IR retains fallback. |
| composeSiteRouteDeps | EXISTING_DEBT | CCN 13 unchanged; smallest fix is a separate composition cleanup. |
| Jini template policy | REQUIRED_UPSTREAM | Static local URLs accepted despite host-only dispatch contract. |

Coverage metrics unavailable because test execution was prohibited. Direct test seams are the injected
source/readiness/validator, the real CMS resolver + Tovu renderer, the existing store port, and HTTP
asset/export routes. Documentation: public host contracts and non-obvious containment/CAS decisions
are documented inline; existing why comments remain. Runtime self-validation: NOT RUN by explicit
user instruction, no runtime PASS claimed. No certified tests were removed or weakened; the older
catalog projection assertion was updated to the approved added exports field. Suggested next routing:
Coordinator -> J2 static-URL fix -> scoped TestRunner -> U1 + Chrome across two themes.

Files changed (T1 only; concurrent chat/mail edits are excluded):
- `apps/website/src/features/agent-plugins/exports/diagnostics.ts`
- `apps/website/src/features/agent-plugins/exports/runtime.ts`
- `apps/website/src/features/agent-plugins/exports/source.ts`
- `apps/website/src/features/agent-plugins/__tests__/fixtures/plugin-exports.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-bundled.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-export.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-render.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-save.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-source.test.ts`
- `apps/website/src/features/pages/html-document-store.ts`
- `apps/website/src/features/pages/html-document-store.memory.ts`
- `apps/website/src/features/pages/tool-registrations.ts`
- `apps/website/src/features/plugin-runtime/agent-tools.ts`
- `apps/website/src/features/plugin-runtime/tool-registrations.ts`
- `apps/website/src/features/plugin-runtime/__tests__/unit/plugins-list.agent-plugins-rows.test.ts`
- `apps/website/src/features/member-login/ready-providers.ts`
- `apps/website/src/features/member-login/public-path.ts`
- `apps/website/src/features/site-export/site-exporter.ts`
- `apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/export-files.ts`
- `apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/__tests__/export-files.security.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/render.ts`
- `apps/website/src/server/inbound/public-http/routes/site/pages.ts`
- `apps/website/src/server/inbound/public-http/routes/members/oidc-deps.ts`
- `apps/website/src/server/inbound/admin-http/routes/pages/update-html.ts`
- `apps/website/src/server/inbound/admin-http/routes/content/deps.ts`
- `apps/website/src/server/routes/types.ts`
- `apps/website/src/server/runtime/composition/deps.ts`
- `apps/website/src/server/runtime/composition/app.ts`
- `apps/website/src/server/runtime/composition/modules/members.ts`
- `apps/website/src/server/runtime/composition/modules/agent-plugins.ts`
- `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md` (binary-file port backlog)
- This local handoff and verification logs.

Exact scoped commands for the central runner (not executed here), from the Tovu lane root:

```bash
node --import tsx --test --test-concurrency=1 --experimental-test-module-mocks \
  apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-*.test.ts \
  apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/__tests__/export-files.security.test.ts \
  apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts \
  apps/website/src/server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts \
  apps/website/src/features/site-export/__tests__/site-exporter.test.ts \
  apps/website/src/features/pages/__tests__/html-document-store.memory.test.ts \
  apps/website/src/features/plugin-runtime/__tests__/unit/plugins-list.agent-plugins-rows.test.ts
```

Upstream J2 focused command, from jini-int2 (not executed here):

```bash
pnpm --filter @jini-ai/cms exec vitest run --maxWorkers=2 --minWorkers=1 src/widgets/__tests__/plugin-export.unit.test.ts
```

Zero-findings skepticism pass for the new host units (source review only): variable names were checked
against computed values; active packages are keyed by packageRoot rather than manifest identity;
canonical attribution comes from the selected declaration; static/live mode is selected from the
existing static-export request signal; head state is per request. Review specifically challenged
ambiguous aliases, a valid+invalid marker batch, a provider owned by another plugin, and an async
validator resuming after another write. The latter required preserving the pre-await version basis;
that fix and its unexecuted test source are included. No remaining local finding was identified by this
pass; runtime confidence remains limited by the explicit no-tests constraint and upstream URL gap.
