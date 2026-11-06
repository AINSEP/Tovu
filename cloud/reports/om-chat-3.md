# om-chat-3 — Tovu implementation complete; push blocked

Branch: `cloud/om-chat-3`. Base: `origin/cloud/combine` at `5358aa594fb6e8c0ca107b1106fbf9ae43871d50`.
Implementation commits below are local. No Tovu push succeeded. The report-only commit is branch HEAD.

## Implementation commits

- `ce0e198d75ee023631d7ba3a4a6949b225df72b8` — Wire desktop attachment delivery and agent connector setup
- `a5168690d675cc4de06a5152da954c67f849e4d2` — Scope agent connection checks to the selected runtime

## Changes

Desktop forwards trusted image contents and read-only folders on Jini's existing executor contract. Antigravity's static connector is installed before dispatch using Jini's existing `installOwnedJsonAgent` owner, and only with the effective personal-MCP grant. The same static launch spec configures execution and registration. Denied setup starts no run or CLI and persists no run credentials.
The Test agent route passes only the selected ID to discovery, preserving forced refresh and existing unavailable/unknown outcomes.

## Exact changed files

- `apps/desktop/src/desktop-agent.test.ts`
- `apps/desktop/src/desktop-agent.ts`
- `apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/test-agent-mock-module.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/assistant/test-agent.ts`
- `cloud/reports/om-chat-3.md`

## Verification

Source `/workspace/.tovu-build/env.sh` first. Jini rebuilt with `pnpm install --frozen-lockfile` and `pnpm -r build`; Tovu relinked with `JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini`. `npm --prefix packages/contracts run build` also passed. No tracked manifest/lockfile changes.

From `/workspace/Tovu/apps/desktop` (loopback enabled):

```sh
node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test src/desktop-agent.test.ts
```

20 passed (base 19 passed; red-first new cases failed before implementation). Covers pixel/folder forwarding, connector setup before dispatch, static credential-free spec, and denial without personal-MCP consent.

From `/workspace/Tovu`:

```sh
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/test-agent-mock-module.test.ts
node --import tsx --test apps/website/src/server/inbound/assistant/__tests__/ensure-json-agent-install.unit.test.ts
./node_modules/.bin/tsc -p tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/desktop/tsconfig.main.json --noEmit
./node_modules/.bin/eslint --no-inline-config --rule 'complexity:[error,9]' --rule 'sonarjs/cognitive-complexity:[error,9]' apps/desktop/src/desktop-agent.ts
./node_modules/.bin/eslint --no-inline-config --rule 'complexity:[error,10]' --rule 'sonarjs/cognitive-complexity:[error,10]' apps/website/src/server/inbound/admin-http/routes/assistant/test-agent.ts
```

Route tests: 2 passed after a genuine selected-ID assertion failure. Existing installer tests: 1 passed. Both typechecks and both complexity checks passed after refreshing stale build outputs. `git diff --check` passed.

## Delivery blocker

The push was attempted only to `cloud/om-chat-3`. The local `apps/desktop/scripts/hooks/pre-push` hook invokes `apps/desktop/scripts/check-gates.ts`, whose enabled gates include the full desktop tests and coverage. The first isolated push checkout lacked dependencies, so the hook failed before those gates ran. The job explicitly limits tests to changed/affected code and reserves full suites for later. User clarification was requested before running the full gates; it remains pending. No `--no-verify`, hook configuration change, disabled rule, or test bypass was used. There is no remote Tovu job branch yet.

## Open

LIMIT: final push awaits a decision on the required full desktop gates.
LIMIT: Jini's report records seven reproduced original-base fixture failures and its existing executor complexity finding; none were hidden or weakened here.
LIMIT: no real authenticated CLI smoke or release adoption; tests used rebuilt local links.

No main/combine push, force push, deployment, tag, publication, schema change, staging service, picker lifecycle or additional cache. Open Marketing was not touched. Tests use temporary fixtures, without live/owner data or billed CLI calls.

## State and I/O cost

- Discovery reuses the existing cache; selected batches avoid unrelated CLI probes. Cancellation detaches the caller and leaves a coalesced probe available to other observers. No added cache or polling.
- Image arrays and read-only folders are forwarded once per run, without copying pixels or adding persistence. Existing path/sandbox validation remains authoritative; folder grants never enter writable extra directories.
- Antigravity setup performs one existing locked config read per applicable desktop turn; only a changed/missing static connector causes backup plus atomic write. Persisted env contains only ELECTRON_RUN_AS_NODE=1, never run IDs, URLs or tokens.
- Parser retention is bounded per physical JSON line at 8 Mi UTF-16 code units. Oversized lines emit one error and are discarded through newline; ACP multiline candidates enforce the existing 128000-character/256-line bounds before parsing. No added I/O.
- Required HTTP is opt-in (`httpPolicy: 'required'`); omission preserves prelaunch stdio fallback. Required failures stop before dispatch and mint no stdio credential.
