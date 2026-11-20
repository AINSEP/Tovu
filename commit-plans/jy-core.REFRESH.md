# jy-core refresh notes

## K3 scope stop

The exact-symbol grep (limited to `packages/`) found no unlisted production importer for the six deleted declarations. It did find unlisted test importers that require more than an import repoint:

- `packages/agent-plugins/src/__tests__/integration-contract.test.ts:5,21–41`: imports the deleted warning export and asserts the default legacy extension selection and warning, mixed with explicit host-namespace validation. A same repoint cannot preserve this case.
- `packages/plugins/src/host/__tests__/unit/plugin-format.unit.test.ts:5,29–80`: imports the deleted manifest constant; tests legacy discovery, dual-name install, canonical precedence and snapshot inclusion. These require case deletion or changed assertions, outside the named K3 test families.
- `packages/plugins/src/host/__tests__/unit/source-drafts.unit.test.ts:1,40–91`: imports the deleted manifest constant; scaffold test contains a legacy-file absence assertion, and two further cases require legacy draft/installed-package reads and writes. These need assertion changes or case deletion, beyond the allowed same repoint.

K3 has no edits or changeset. Its compatibility-removal breaks are not applied. The coordinator needs a refreshed test scope before the sheet can be implemented without leaving known imports of deleted exports. Calendly `mcp.json`, the allowlist, compatibility readers and trailing legacy-alias comments remain unchanged.

## K2 inventory refresh

The named manifest grep found 10 matching source manifests, rather than 12. All 10 were changed; no extra manifest was invented. Generated catalog and API baseline are reserved for OPUS-CLOUD. Unrelated telemetry/test-fixture product strings were left alone.

## K1-T residue (counts only)

Unrelated publisher-prefix occurrences remaining in the three permitted files: catalog test 0; agent lifecycle identity test 7; plugin host identity test 7. These are outside the listed 26 publisher ids. Namespace keys and unrelated literals were not broadened into K1-T.

## J08 / J09

All 82 inventoried anchors were comments or documentation with an established meaning; none stopped. Adjacent upstream references outside the audited line/same-sentence next-line scope remain untouched. K3 did not remove legacy-alias comments, so J09 retained the K3 base and changed only its own prose anchors.

No automated tests, builds, installs, type checks, linters, graph queries, review mutations, catalog generation or API regeneration were run. The scoped prose diff was read and all changed TypeScript lines are comment lines. The combine owns the owner-rules audit and full verification.
