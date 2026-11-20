# jy-core commit plan

Base: merge-6 (`d3e78b387`). No commits, staging, catalog generation, baseline regeneration, tests, builds, installs, type checks or linters were run. Changes remain for the coordinator. No new helpers, dependencies, declarations, argument pads or classes; no function conversions. No test cases added or deleted.

## K1-T — done

Updated 25 test literals: 2 in `packages/plugin-catalog/__tests__/catalog.test.ts`, 19 in `packages/agent-plugins/src/lifecycle/__tests__/unit/plugin-identity.unit.test.ts`, and 4 in `packages/plugins/src/host/__tests__/unit/plugin-identity.unit.test.ts`. Only the 26 explicitly allowed publisher identities were eligible. No changeset.

BREAKS (source K1): installed plugins/settings keyed `tovu/<name>`; saved page embeds `"plugin":"tovu/calendly"`/`tovu/google-login`; Tovu callers (j-tv-rjk T1). This test-only slice does not itself implement the manifest changes.

Diff re-read deletions: none beyond the named literal substitutions; no out-of-scope edits found to remove.

## K2 — done

Changed all 10 matching source manifests (sheet estimate: 12); 10 extension keys and one Recharts publisher id. Files:

- `packages/provider-plugins/src/ai-trace-langfuse/jini.plugin.json`
- `packages/provider-plugins/src/analytics-posthog/jini.plugin.json`
- `packages/provider-plugins/src/charts-echarts/jini.plugin.json`
- `packages/provider-plugins/src/charts-recharts/jini.plugin.json`
- `packages/provider-plugins/src/fixture-provider/jini.plugin.json`
- `packages/provider-plugins/src/formspree/jini.plugin.json`
- `packages/provider-plugins/src/google-forms/jini.plugin.json`
- `packages/provider-plugins/src/observability-opentelemetry/jini.plugin.json`
- `packages/provider-plugins/src/observability-sentry/jini.plugin.json`
- `packages/provider-plugins/src/payments-stripe/jini.plugin.json`

Other files: `packages/plugin-catalog/scripts/generate.ts`, `packages/plugin-catalog/__tests__/catalog.test.ts`, `packages/provider-plugins/src/__tests__/artifact.integration.test.ts`, `scripts/__tests__/engine-neutrality-json.test.ts`, `scripts/__tests__/plugin-release-consistency.test.ts`.

Catalog namespace is `jini`; removed the named local identity resolver and pass `jini` for agent entries. Updated provider host test namespaces (3 occurrences), catalog fixture keys (3), scripts fixture keys (3), and catalog publisher assertion/comment. No test cases added/deleted.

Changeset: `.changeset/jy-core-k2.md` (`@jini-ai/provider-plugins`, minor).

BREAKS: Tovu provider host binds `identityNamespace: "tovu"` (j-tv-rjk T2); catalog regen (OPUS-CLOUD).

Public metadata change: provider extension namespace and publisher id; exported release-tool `CATALOG_HOST_NAMESPACE` changes its literal value/type. No function signature changes. Catalog and API baseline remain untouched for OPUS-CLOUD.

Diff re-read deletions: the named local resolver and its now-orphaned explanatory comment (9 lines). No out-of-scope edits found to remove.

## K3 — STOPPED before implementation

The required symbol grep reached three unlisted test importers whose legacy behavior assertions require deletion or rewriting, rather than only the permitted same repoint: `packages/agent-plugins/src/__tests__/integration-contract.test.ts`, `packages/plugins/src/host/__tests__/unit/plugin-format.unit.test.ts`, `packages/plugins/src/host/__tests__/unit/source-drafts.unit.test.ts`. The sheet restricts test deletions to its named families. Applying the export deletions while retaining these imports would leave known unresolved exports. Stopped under the no-extra-scope rule; details in `REFRESH.md`.

Files touched by K3: none. Cases deleted: 0. Changesets: none. Compatibility readers, exports, Calendly metadata and allowlist are unchanged. No public signatures removed by this stopped sheet.

Planned BREAKS (not applied): installed plugins with `extensions.tovu`, `tovu.plugin.json` or `@tovu/sdk` stop loading; Tovu samples/built-ins (j-tv-rjk T2, T3).

Diff re-read deletions: none.

## J08 — done

56 inventoried anchors edited, 0 stopped, across 17 files under `packages/plugins/`:

- `API.md`
- `README.md`
- `src/glue/attachment-points/content-lifecycle.ts`
- `src/glue/capability-gate.ts`
- `src/host/activation.ts`
- `src/host/admin-response.ts`
- `src/host/attach-loaded-plugin.ts`
- `src/host/browser-providers.ts`
- `src/host/capability-sdk.ts`
- `src/host/capability-tools.ts`
- `src/host/contributions.ts`
- `src/host/declarative-content-types.ts`
- `src/host/declarative-enable.ts`
- `src/host/discovery-types.ts`
- `src/host/hook-registry.ts`
- `src/host/manifest-types.ts`
- `src/host/manifest.ts`

Removed upstream identifiers and neutralized host references only at audited lines and same-sentence next lines. API prose describes the host-configured mount prefix and retains literal/parameter segment grammar. Callable capability denials, resolver/source ordering and containment rationale remain. Executable lines unchanged in the reviewed diff; no mutation or behavior tests. No changeset; no BREAKS.

Existing files above 500 lines (no crossing or increase): `src/host/capability-tools.ts` (682), `src/host/declarative-content-types.ts` (510).

Diff re-read deletions: identifier-only citation lines and parentheticals required by the sheet. No out-of-scope edits found to remove.

## J09 — done

26 inventoried anchors edited, 0 stopped, across 10 files under `packages/plugins/`:

- `src/host/node/discovery.ts`
- `src/host/node/install.ts`
- `src/host/node/invocation-binding.ts`
- `src/host/node/loader.ts`
- `src/host/node/runtime-core.ts`
- `src/host/node/runtime-load-target.ts`
- `src/host/worker/import-seam.ts`
- `src/host/worker/protocol.ts`
- `src/host/worker/run-call.ts`
- `src/host/worker/start.ts`

Removed upstream identifiers only in the audited comments. Integrity and SDK compatibility still precede executable import; inert importer-factory and worker-isolation reasons remain. Executable lines unchanged in the reviewed diff; no mutation or behavior tests. No changeset; no BREAKS.

Because K3 stopped, its trailing legacy-alias comment deletions were not applied; J09 anchors were read and located on the unchanged K3 base instead. Legacy compatibility mentions outside J09 anchors remain outside this prose sheet.

Existing file above 500 lines (no crossing or increase): `src/host/node/runtime-core.ts` (552).

Diff re-read deletions: identifier-only citation line and parentheticals required by the sheet. No out-of-scope edits found to remove.
