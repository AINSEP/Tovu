# more-jini-1 — complete

Both items done in order. Item 1 was fully verified before item 2 began. Owner job `origin/cloud-plans-1105:cloud/jobs/more-jini-1.md` overrides COMMON. Work ran approximately 17:45–18:07 UTC on 2026-11-07, about 22 minutes, below the three-hour cap.

## Branches and pushed commits

Both branches are `cloud/more-jini-1`, created from the exact requested `origin/cloud/combine` bases:

- Tovu base: `b45d2ee759009b08d04268ef9ddcf2b6d0f60671`.
- Jini base: `32e9c9c2128805b20d1a562d6f0053d1c4604b52`.
- Tovu production tip: `721bce46c382e46a903d0fb18b00225b1a05a5a8`; this final report is a subsequent documentation-only commit. Its SHA is supplied in the final chat response.
- Jini final tip: `2364f89e71c09953ac63227f7f8cfa854c930e6f`.

Pushed Tovu commits before this final report: `0c6f34b49afa0441898dc276497583553540369f`, `68d48040d0e98ad37f3a35969bf1eb40ee38debd`, `74082b6ec861205e95bcddfa26808fa34999d812`, `721bce46c382e46a903d0fb18b00225b1a05a5a8`.

Pushed Jini commits: `66bf2d2bff60590aeea6a752f66a5e5d4a979413`, `85573e837777155c0076a4300e89b4c2dd4a4824`, `2364f89e71c09953ac63227f7f8cfa854c930e6f`.

Pushes used pull --rebase first; on each first push only, that pull reported the new remote branch did not yet exist. All pushes succeeded. Tovu used the owner-approved --no-verify only on this branch. No force-push, main/combine push, deploy, publish, or portable-fin access occurred.

## Delivered behavior and line accounting

| Item | Status | Original lines moved | Jini destination production lines | Net Jini production lines beyond originals | New Tovu shim lines | New test/helper lines |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 commands | Done | 382 | 385 | 3 | 10 | 41 |
| 2 dataModule | Done | 1,593 | 1,626 | 33 | 36 | 81 |
| Total | Done | 1,975 | 2,011 | 36 | 46 | 122 |

These are physical source-line counts, including comments/blanks. New production is 82 net lines beyond moved originals (36 Jini + 46 shims), all API adaptation/export wiring, with no new business algorithm. Manifest changes are separate: CMS 7 added/1 replaced lines; DB 8 added lines. Two five-line minor changesets were added. Report lines are excluded.

Each source file was moved with git mv into a temporary path in Tovu, then transferred into the separate Jini repository; source was not retyped. Temporary staged paths were removed before commits. All 30 item-1 comments and all 131 item-2 explanatory comments match the originals byte-for-byte. The one inherited, ineffective eslint-disable directive was omitted to honor the no-disables rule; no explanatory comment was removed.

Item 1: `@jini-ai/cms/core/commands` is universal, alongside the existing command/change-set modules. It exports the revert executor, errors, registry, and in-memory repo. No database driver or kysely enters this entry. Original Tovu paths remain shims. Registry factory has the required/optional object API in Jini and its old zero-argument call in Tovu; methods and repository constructor remain unchanged. Strict optional-property type adaptations retain the original runtime outbox/event shapes, including the explicit actorId key when undefined.

Item 2: `@jini-ai/db/data-modules` is a Node entry. All nine specified files moved; scalar helper APIs take required/optional objects in Jini, with old signatures restored by Tovu wrappers. Private algorithms were not reshaped. `recoveryPoint` typing now explicitly admits the undefined value the original implementation already returns. TYPES is typed ReadonlySet, reflecting its existing read-only use. Snapshot-before-journal-before-transaction ordering, transactional verification/commit marker, rollback, and newest-first recovery are unchanged.

Persisted table names `_plugin_migration_journal`, `_plugin_identity`, `_plugin_migrations`, the `p_{pluginId}__` prefix, and all phase text are unchanged and pinned literally in new public-API tests. sourceUrl/publisher/signature comparison bodies are unchanged. SourceUrl and publisher mismatches fail closed, preserving stored identity. SQLite memory/file-backed behavior and PGlite/Postgres behavior pass tests.

No Tovu, TOVU_, or tovu literal was found in either moved source group; none needed converting to a new host input. Provenance was already host input. Existing Tovu declarations, including publisher: "tovu-core", lipay/manifest.ts, and store/manifest.ts are unedited. No Tovu imports remain in Jini. Historic explanatory comments still refer to source feature/ADR vocabulary, as required by the byte-exact comment rule.

No new dependency was added. Existing kysely/core dependencies suffice. No manifest dependency ranges, lockfiles, schema, migration registrations, layer/isolation rules, Tovu importers, or Tovu tests were edited. New exports have minor changesets under the existing release process.

No I/O, polling, database-read/write frequency, payload size, snapshots, or retained-memory cost changed. Required-object adapters do add small transient argument/default-object allocations; asymptotic time and space remain unchanged. No new read was added on any hot path.

## Setup and red-at-base evidence

Loaded `/workspace/cloud/ai-dev-shop/AGENTS.md` and Software Architect, Programmer, and TDD skills.md. Sidekick assisted only with checks/read-only audits. Codebase Memory/Graphify indexes were absent; understand-anything was queried with no relevant result, then current source was inspected.

All shell verification sourced `/workspace/.tovu-build/env.sh`. Scratch logs and argument lists are at `/workspace/work/more-jini-1`. PostgreSQL was needed for requested tests; `bash /workspace/.tovu-build/start-postgres.sh` succeeded, select 1 returned 1.

Unmodified-base rebuild:

```bash
# /workspace/Jini
pnpm --filter @jini-ai/core run build
pnpm --no-bail -r build
```

Core passed. Recursive rebuild exited 1: 38 packages passed, four failed. No full test suite was run.

- agent-plugins: ERR_MODULE_NOT_FOUND for esbuild in build-cloudflare.mjs.
- provider-plugins: TS2307 for jsdom and @jini-ai/cms/forms; TS7031 for config in formspree/google-forms providers.
- chat: TS2307 for @jini-ai/ui-kit/react in AgentRuntimePicker.agent-handles.test.tsx.
- user-management: TS2307 for @simplewebauthn/browser, @simplewebauthn/server, otplib; TS2339 for optionsJSON on unknown.

Both touched packages' base tsc passed. Base layers passed. Base isolation had seven SI-resolution findings; base guard had 14 findings. Final layers, isolation and guard outputs match these base outputs byte-for-byte:

- R8-package-metadata (six): stale package directories missing package.json: plugin-ai-trace-langfuse, plugin-analytics-posthog, plugin-observability-opentelemetry, plugin-observability-sentry, plugin-payments-stripe, plugin-ui-ux-design.
- SI-resolution (seven): Cloudflare forms.mjs cannot resolve ./cms-forms.mjs in closures for cloudflare-d1.mjs, lib/forms.mjs, lib/target.mjs, lib/workers-upload.mjs, targets/cloudflare-pages.mjs, targets/cloudflare-workers.mjs; worker/forms-receiver.mjs cannot resolve ./portable-validation.mjs.
- R10-chatpane-public-surface (one): ChatPane imports private Icon absent from the public react barrel.
- Existing guard diagnostics also report MF3 unavailable Claude and agy ENOENT, and MF3 inapplicable to pi/aider/opencode; these are unchanged informational skips. HW1–HW9 have zero new findings.

Setup errors encountered and resolved: initial fetch populated only FETCH_HEAD, so git show first reported invalid object name origin/cloud-plans-1105; explicit destination-ref fetch fixed it. One pnpm command from Tovu triggered a Corepack EAI_AGAIN registry lookup; running the pinned pnpm from Jini fixed it. Default npm cache produced EROFS; a writable scratch npm cache fixed it. Frozen pnpm install encountered ERR_PNPM_EROFS on its inherited read-only store and was terminated (143), not retried unchanged. Missing existing auth dependencies were installed at their declared versions in a scratch npm prefix and linked into existing node_modules; Tovu contracts were rebuilt. No dependency/lockfile changes resulted.

Introduced compile/check findings, all fixed without runtime behavior changes: TS2412 optional outbox field, TS2375 explicit undefined actorId/recoveryPoint, and HW3-module-state for the existing lookup set (fixed with accurate ReadonlySet typing). Original item-2 lint had one ineffective-disable warning; final moved source has no disables and no warning. No new layer or isolation refusal occurred.

## Exact type/build/static commands and results

CWD `/workspace/Jini` unless shown otherwise:

```bash
pnpm --filter @jini-ai/cms exec tsc --noEmit
pnpm --filter @jini-ai/db exec tsc --noEmit
pnpm --filter @jini-ai/cms run build
pnpm --filter @jini-ai/db run build
node --import tsx --input-type=module -e 'import {checkPackageLayers} from "./scripts/check-package-layers.ts"; const r=checkPackageLayers(); console.log(JSON.stringify(r,null,2)); process.exitCode=Number(r.length>0)'
node --import tsx --input-type=module -e 'import {checkSubpathIsolation} from "./scripts/check-subpath-isolation.ts"; const r=checkSubpathIsolation(); console.log(JSON.stringify(r,null,2)); process.exitCode=Number(r.length>0)'
pnpm guard
pnpm exec eslint packages/cms/src/core/commands/*.ts
pnpm exec eslint packages/db/src/data-modules/*.ts
# /workspace/Tovu
npx eslint apps/website/src/contracts/core/commands/*.ts
npx eslint apps/website/src/features/plugins/{data-module,migration-journal,plugin-identity,snapshot,migration-recovery,disk-headroom,plugin-store,restore,index}.ts
npm --prefix packages/contracts run build
JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini
```

Both final tsc/build checks exit 0. Both repositories' complexity lint exits 0. Layers exit 0, zero findings. Isolation exits 1, unchanged seven base findings. Guard exits 1, unchanged 14 base findings. Relinking after each package rebuild exits 0. The rule scripts have no CLI invocation at top level, so the exported-function calls above execute their actual checks.

## Every test command and exact result

CWD `/workspace/Jini`:

```bash
pnpm --filter @jini-ai/cms exec vitest run src/core/commands/__tests__/public-entry.test.ts --maxWorkers=2 --minWorkers=1
```

RED before export: exit 1, one suite failed collection, Error: Missing "./core/commands" specifier in @jini-ai/cms; no tests executed. This proves the entry was absent before implementation.

```bash
pnpm --filter @jini-ai/cms exec vitest run src/core/commands/__tests__/public-entry.test.ts src/core/commands/__tests__/command.test.ts src/core/commands/__tests__/command-post-mutation-rollback.test.ts --maxWorkers=2 --minWorkers=1
```

Executed twice (initial implementation and after type-only fixes): both exit 0, three files/26 tests passed, zero failed/skipped. New public test checks reverse application order, force guard and repository behavior; imports only public @jini-ai APIs.

```bash
pnpm --filter @jini-ai/db exec vitest run src/data-modules/__tests__/public-entry.test.ts --maxWorkers=2 --minWorkers=1
```

RED before export: exit 1, one suite failed collection, Error: Missing "./data-modules" specifier in @jini-ai/db. GREEN after export/build: exit 0, one file/two tests passed (SQLite and PGlite), zero failed/skipped, 2.19 seconds.

```bash
pnpm --filter @jini-ai/db exec vitest run --config vitest.postgres.config.ts src/data-modules/__tests__/public-entry.postgres.test.ts --maxWorkers=2 --minWorkers=1
```

Exit 0, one file/one real Postgres test passed, zero failed/skipped, 3.18 seconds. Disposable fixture database created and dropped. All three backend proofs exercise only public @jini-ai exports, literal persisted names/phases, idempotency, and sourceUrl/publisher mismatch refusal.

CWD `/workspace/Tovu`:

```bash
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 'apps/website/src/contracts/core/commands/__tests__/**/*.test.ts' 'apps/website/src/contracts/core/commands/__tests__/*.test.ts'
```

Exit 0: 91 tests passed, zero failed/skipped, 12.63 seconds. Every existing command test is unedited and runs through its old path.

```bash
mapfile -t command_tests < <(rg -l '(from |import\().*contracts/core/commands' apps/website/src --glob '*test.ts' | sort)
printf '%s\n' "${command_tests[@]}" > /workspace/work/more-jini-1/item1-importer-tests.txt
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 "${command_tests[@]}"
```

Initial importer batch exit 1: 680 tests, 658 passed/22 failed, zero skipped, 46.99 seconds. Every failure was ERR_MODULE_NOT_FOUND: otplib (15 loader failures plus two dynamic-import failures) or stale @tovu/contracts/dist/admin-failure-copy.js (five loader failures).

```bash
mapfile -t command_tests < /workspace/work/more-jini-1/item1-importer-tests.txt
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 "${command_tests[@]}"
```

After otplib/contracts setup repair: exit 1, 749 tests, 740 passed/nine failed, zero skipped, 82.74 seconds. The remaining nine loaders started before the SimpleWebAuthn links were repaired and reported ERR_MODULE_NOT_FOUND @simplewebauthn/server.

```bash
mapfile -t retry_tests < <(sed -n 's/^✖ \(apps\/[^ ]*\.test\.ts\) .*/\1/p' /workspace/work/more-jini-1/item1-tovu-importers-fixed.log | sort -u)
printf '%s\n' "${retry_tests[@]}" > /workspace/work/more-jini-1/item1-importer-retry-tests.txt
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 "${retry_tests[@]}"
```

After auth links resolved: exit 0, all nine files/180 tests passed, zero failed/skipped, 11.38 seconds. Thus every one of the 79 direct importer files passed unedited across the completed runs. No test needed editing and neither item was stopped.

```bash
{
  rg --files apps/website/src/features/plugins/__tests__ | rg '\.test\.ts$'
  rg -l 'from .*plugins/(data-module|migration-journal|plugin-identity|snapshot|migration-recovery|disk-headroom|plugin-store|restore)(["./])|from .*data-modules|from .*share-database|from .*data-module-install|from .*data-module-manifest|from .*migration/manifest' apps/website/src --glob '*test.ts'
} | sort -u > /workspace/work/more-jini-1/item2-tovu-tests.txt
mapfile -t module_tests < /workspace/work/more-jini-1/item2-tovu-tests.txt
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 "${module_tests[@]}"
```

Exit 0: 30 files, 561 tests/28 suites, 561 passed, zero failed/cancelled/skipped, 50.32 seconds. Includes plugins/__tests__, comments install, newsletter manifest and repo/send importers, migration manifest, composition declarations/opening, share-database repo and direct importers. Node's native equivalent --test-concurrency=2 is used because its test runner does not accept Vitest's --maxWorkers/--minWorkers; all Vitest runs use exactly --maxWorkers=2 --minWorkers=1.

## Packed packages and plain Node proof

CWD `/workspace/Jini`; destinations are throwaway scratch folders:

```bash
pnpm --filter @jini-ai/core pack --pack-destination /workspace/work/more-jini-1/pack-item1
pnpm --filter @jini-ai/cms pack --pack-destination /workspace/work/more-jini-1/pack-item1
pnpm --filter @jini-ai/core pack --pack-destination /workspace/work/more-jini-1/pack-final
pnpm --filter @jini-ai/cms pack --pack-destination /workspace/work/more-jini-1/pack-final
pnpm --filter @jini-ai/db pack --pack-destination /workspace/work/more-jini-1/pack-final
```

All exit 0. Core was packed only as the unchanged local dependency; touched packages are CMS and DB. Initial CMS consumer install hit EROFS on default npm cache; import consequently reported ERR_MODULE_NOT_FOUND @jini-ai/cms. Writable-cache retry installed 27 packages and plain Node printed "commands packed import PASS"; consumer deleted. A plain Node import of the Tovu registry shim also exited 0.

Final consumer exact install/run/cleanup:

```bash
consumer_dir=$(mktemp -d /workspace/work/more-jini-1/consumer-final.XXXXXX)
printf '%s\n' '{"private":true,"type":"module"}' > "$consumer_dir/package.json"
npm install --prefix "$consumer_dir" --cache /workspace/work/more-jini-1/npm-cache --proxy "$HTTP_PROXY" --https-proxy "$HTTPS_PROXY" --ignore-scripts --omit=optional --legacy-peer-deps /workspace/work/more-jini-1/pack-final/jini-ai-core-0.6.23.tgz /workspace/work/more-jini-1/pack-final/jini-ai-cms-0.6.22.tgz /workspace/work/more-jini-1/pack-final/jini-ai-db-0.6.19.tgz
cp /workspace/work/more-jini-1/packed-smoke.mjs "$consumer_dir/packed-smoke.mjs"
(cd "$consumer_dir" && node packed-smoke.mjs)
rm -rf "$consumer_dir"
```

Install exits 0, 29 packages added. Node exits 0: "PASS: both packed public entries import and run without a database driver". Smoke source follows; no special loader or source aliases were used.

```js
import assert from "node:assert/strict";
import { createRevertRegistry, InMemoryChangeSetRepo, revertChangeSet } from "@jini-ai/cms/core/commands";
import { isInMemoryDbPath, checkDiskHeadroom, isIncompletePhase, declareDataModule } from "@jini-ai/db/data-modules";
const registry = createRevertRegistry({}, {});
assert.equal(registry.resolve("example", "update"), undefined);
assert.equal(await new InMemoryChangeSetRepo().findById({ workspaceId: "example", id: "missing" }), null);
assert.equal(typeof revertChangeSet, "function");
assert.equal(isInMemoryDbPath({ dbPath: ":memory:" }, {}), true);
assert.deepEqual(checkDiskHeadroom({ dbPath: ":memory:" }, {}), { ok: true, requiredBytes: 0, freeBytes: null });
assert.equal(isIncompletePhase({ phase: "VERIFYING" }, {}), true);
assert.equal(isIncompletePhase({ phase: "COMMITTED" }, {}), false);
assert.equal(typeof declareDataModule, "function");
console.log("PASS: both packed public entries import and run without a database driver");
```

## Integrity, open findings and cost

Architecture audit: PASS for the requested extraction boundaries. Public functions use required/optional objects; legacy call shapes are confined to Tovu shims. Driver-neutral engine accepts host-owned kernels. No new layer/isolation finding; no rule edits. Complexity lint passes; no runtime algorithm changed. Type-only ReadonlySet accurately prevents mutation of the existing lookup constant.

Pre-completion checks: fresh package builds/types, targeted tests, packed imports, literal and comment audit, and diff checks completed. git diff against the bases confirms every Tovu test/importer and both product manifests unedited, and both lockfiles/rule scripts unedited. git diff --check passes. Consumer folders deleted. No Node test/Vitest/guard process remains running. A test-created .form-files-protected-v1 marker was removed. Tovu tree is clean apart from this final report before commit; Jini's pre-existing untracked plugin-ui-ux-design build leftovers remain untouched.

No new bug or unresolved extraction blocker remains. Full repository build and guard remain red for the named base findings above; those are not presented as green. No full suites were run. No retained-memory/I/O cost changed; only small transient object-call allocations were added. Dependency setup scratch remains outside the committed repositories for reproducibility.

BUG (pre-existing, intentionally not fixed): L079 test pins force without principalKind bypassing a stale version guard.

BUG (pre-existing, intentionally not fixed): L079 test pins a later inverse failure leaving earlier inverse writes applied.

Minor inherited documentation finding: snapshot.ts says a failed attempt leaves a non-terminal journal entry, while existing code marks ROLLED_BACK (terminal); the snapshot itself is retained. Both text and behavior were preserved as required.

Minor moved documentation finding: the original plugins/index.ts header describes the narrow host barrel; Jini's public engine entry additionally exposes helpers needed by compatibility shims. The original explanation was preserved byte-exact.

Nothing remains tied to a Tovu import or default identity in Jini. Generic persisted names deliberately retain their existing spelling. Product declaration provenance remains owned by Tovu. Work complete within the three-hour cap.

## Item 1 direct importer files (79)

```text
apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.agent-plugins-uninstall.integration.test.ts
apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.content-search.integration.test.ts
apps/website/src/assistant/__tests__/tool-registrations.forms.test.ts
apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-busy.test.ts
apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-families.test.ts
apps/website/src/assistant/__tests__/tool-registrations.plugins-uninstall.test.ts
apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts
apps/website/src/assistant/__tests__/tool-registrations.post.test.ts
apps/website/src/features/agent-plugins/executable-tools/__tests__/admin-action-tools.test.ts
apps/website/src/features/change-sets/__tests__/tool-registrations.test.ts
apps/website/src/features/forms/__tests__/agent-tools.unit.test.ts
apps/website/src/features/forms/__tests__/common-field-tools.test.ts
apps/website/src/features/forms/__tests__/content-duplicate.form.test.ts
apps/website/src/features/forms/__tests__/tool-definition-view.unit.test.ts
apps/website/src/features/forms/__tests__/tool-registrations.model-facing-errors.test.ts
apps/website/src/features/media/__tests__/library-publish-transport.test.ts
apps/website/src/features/media/__tests__/library-publish.test.ts
apps/website/src/features/media/__tests__/publish-content.apply.test.ts
apps/website/src/features/media/__tests__/publish-content.characterization.test.ts
apps/website/src/features/media/__tests__/publish-content.overwrite.test.ts
apps/website/src/features/media/__tests__/publish-content.write.test.ts
apps/website/src/features/navigation/__tests__/publish-content.test.ts
apps/website/src/features/navigation/__tests__/reverters.test.ts
apps/website/src/features/plugin-runtime/__tests__/integration/source-runtime.integration.test.ts
apps/website/src/features/plugin-runtime/__tests__/unit/plugins-list.agent-plugins-rows.test.ts
apps/website/src/features/plugin-runtime/__tests__/unit/plugins-list.agent-plugins.test.ts
apps/website/src/features/plugin-runtime/__tests__/unit/plugins-set-enabled-consent.unit.test.ts
apps/website/src/features/post/__tests__/L156-characterization.test.ts
apps/website/src/features/post/__tests__/agent-tools.delete-confirmation.test.ts
apps/website/src/features/post/__tests__/content-duplicate.plugin-hook-failed.test.ts
apps/website/src/features/post/__tests__/content-duplicate.post-page.test.ts
apps/website/src/features/post/__tests__/content-post-list-filters.test.ts
apps/website/src/features/post/__tests__/integration/content-tools-default-kind.integration.test.ts
apps/website/src/features/post/__tests__/publish-content.round-trip.test.ts
apps/website/src/features/post/__tests__/publish-content.schedule-featured.test.ts
apps/website/src/features/post/__tests__/publish-content.test.ts
apps/website/src/features/post/__tests__/reverters.schedule-events.test.ts
apps/website/src/features/post/__tests__/tool-registrations.admin-url.test.ts
apps/website/src/features/post/__tests__/tool-registrations.author.test.ts
apps/website/src/features/post/__tests__/tool-registrations.featured-image-refusal.test.ts
apps/website/src/features/post/__tests__/tool-registrations.guards.test.ts
apps/website/src/features/post/__tests__/tool-registrations.header-navigation.test.ts
apps/website/src/features/post/__tests__/tool-registrations.html-page-body.test.ts
apps/website/src/features/post/__tests__/tool-registrations.kind-status-validation-status.integration.test.ts
apps/website/src/features/post/__tests__/tool-registrations.list-compact.test.ts
apps/website/src/features/post/__tests__/tool-registrations.list-scale.test.ts
apps/website/src/features/post/__tests__/tool-registrations.model-facing-errors.test.ts
apps/website/src/features/post/__tests__/tool-registrations.optimistic-concurrency.test.ts
apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts
apps/website/src/features/post/__tests__/tool-registrations.plugin-hook-failed.test.ts
apps/website/src/features/post/__tests__/tool-registrations.public-url.test.ts
apps/website/src/features/post/__tests__/tool-registrations.published-where.test.ts
apps/website/src/features/post/__tests__/tool-registrations.revisions-sink.test.ts
apps/website/src/features/post/__tests__/tool-registrations.schedule-featured.test.ts
apps/website/src/features/publish-content/__tests__/apply-loop.test.ts
apps/website/src/features/publish-content/__tests__/backstop-batch.apply-loop.test.ts
apps/website/src/features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts
apps/website/src/features/publish-content/__tests__/raw-file-contributor.test.ts
apps/website/src/features/publish-content/__tests__/raw-row-contributor.test.ts
apps/website/src/features/settings/__tests__/ui-locales-tool.unit.test.ts
apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts
apps/website/src/features/theme/__tests__/publish-content.apply.test.ts
apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts
apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts
apps/website/src/features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts
apps/website/src/features/widgets/__tests__/integration/tool-registrations.handler-gaps.test.ts
apps/website/src/features/widgets/__tests__/integration/tool-registrations.input-validation-status.test.ts
apps/website/src/features/widgets/__tests__/integration/tool-registrations.plugin-hook-failed.test.ts
apps/website/src/features/widgets/__tests__/integration/tool-registrations.region-gaps.test.ts
apps/website/src/features/widgets/__tests__/integration/tool-registrations.shape-rejection.test.ts
apps/website/src/server/__tests__/routes/change-sets-revert.test.ts
apps/website/src/server/__tests__/routes/html-form-authoring.test.ts
apps/website/src/server/__tests__/routes/publish-trust-apply-coverage.test.ts
apps/website/src/server/__tests__/widgets-error-code-parity.test.ts
apps/website/src/server/inbound/admin-http/routes/forms/__tests__/provider-save.unit.test.ts
apps/website/src/server/inbound/admin-http/routes/posts/__tests__/author.test.ts
apps/website/src/server/runtime/composition/__tests__/form-delivery.security.test.ts
apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts
apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts
```

## Item 1 repaired-loader retry files (9)

```text
apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.agent-plugins-uninstall.integration.test.ts
apps/website/src/assistant/__tests__/tool-registrations.forms.test.ts
apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-busy.test.ts
apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-families.test.ts
apps/website/src/assistant/__tests__/tool-registrations.plugins-uninstall.test.ts
apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts
apps/website/src/assistant/__tests__/tool-registrations.post.test.ts
apps/website/src/features/change-sets/__tests__/tool-registrations.test.ts
apps/website/src/features/media/__tests__/library-publish-transport.test.ts
```

## Item 2 affected files (30)

```text
apps/website/src/features/comments/__tests__/data-module-install.test.ts
apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts
apps/website/src/features/database-transfer/__tests__/exclusions.unit.test.ts
apps/website/src/features/newsletter/__tests__/data-module-manifest.failure-rollback.test.ts
apps/website/src/features/newsletter/__tests__/repo.contract.test.ts
apps/website/src/features/newsletter/__tests__/repo.dialects.test.ts
apps/website/src/features/newsletter/__tests__/send-pipeline.test.ts
apps/website/src/features/plugins/__tests__/data-module-column-reconciliation.test.ts
apps/website/src/features/plugins/__tests__/data-module-indexes.test.ts
apps/website/src/features/plugins/__tests__/data-module.dialects.test.ts
apps/website/src/features/plugins/__tests__/data-module.test.ts
apps/website/src/features/plugins/__tests__/disk-headroom.test.ts
apps/website/src/features/plugins/__tests__/migration-journal.test.ts
apps/website/src/features/plugins/__tests__/migration-recovery.test.ts
apps/website/src/features/plugins/__tests__/plugin-identity.test.ts
apps/website/src/features/plugins/__tests__/restore.test.ts
apps/website/src/features/plugins/__tests__/snapshot.test.ts
apps/website/src/features/site-backup/__tests__/integration/share-database-blobs.integration.test.ts
apps/website/src/features/site-backup/__tests__/share-refusals.integration.test.ts
apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts
apps/website/src/platform/db/__tests__/migration-manifest.test.ts
apps/website/src/platform/db/__tests__/schema-migration-drift.test.ts
apps/website/src/platform/db/__tests__/schema-postgres-parity.test.ts
apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts
apps/website/src/platform/db/sqlite/__tests__/integration/content-db-fresh.integration.test.ts
apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts
apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts
apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts
apps/website/src/server/runtime/composition/__tests__/commerce-data-retention.integration.test.ts
apps/website/src/server/runtime/composition/__tests__/open-site-content-db.integration.test.ts
```
