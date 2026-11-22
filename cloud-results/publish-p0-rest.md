# publish-p0-rest: publish engine Phase 0, P0.5a rest + P0.5b (P0.8 remainder blocked)

Status: **P0.5a DONE (one recorded exemption), P0.5b DONE (two recorded exemptions), P0.8 for the four remaining files BLOCKED on P0.4/P0.7.**
Branch: Tovu `wave2/publish-p0-rest` from `origin/refactor/terra` @ `232764af5`. Jini `refactor/terra` @ `65d73b0d5`, built (`pnpm --no-bail -r build`) and linked (`link-jini.mjs`); no Jini change.
Plan: `plan/publish-engine-design-2026-11-16:designs/publish-engine/DESIGN.md` 2.4, P0.5a/P0.5b, OD-12. Prior reports: `cloud-results/publish-p0.md` (runs 1 and 2).
Owner decisions: none of the 2026-11-17 IDs touch this sheet. OD-12 (convert port methods) has no ruling in the answered file; I proceeded per the design's Rec ("Yes, before the move") and say so here.

## Commits (all pushed; last pushed SHA = the commit that adds this report)

| SHA | Step | What |
|---|---|---|
| `d18fc4cf` | tooling | AST census + language-service codemod scripts (`cloud-results/publish-p0-args-census.mjs`, `-args-codemod.mjs`) |
| `355ddd83` | P0.5a | publish-trust: session, challenge, keys |
| `fb87248b` | P0.5a | publish-trust: connect, handshake client, provisioning, revocations |
| `9177678d` | P0.5a | peers, destination connect, pull, bundle staging, composite blob source |
| `98093108` | P0.5a | peer transport, export bundle, report labels |
| `e6f1ff2f` | P0.5a | policy, reference, label and hash helpers; raw contributors take no args; `createFileBlobIndex` optional-only |
| `df3fb804` | P0.5a | planner, import hooks, apply port, repo handler, run repo, tool registrations |
| `e90eb464` | P0.5a | type registry (162 `registerPublishContentContributor` sites) |
| `4636b3c8` | P0.5a | whitespace reflow so `check:size` / `check:complexity` equal the base again (see "Gate history") |
| `5175fbdf` | P0.5b | repo/store port writes: baseline `upsert`, bundle `save`, peer `insert`/`update`, run `save`, challenge `put` -> `{ record }` |
| `c4956cc6` | P0.5b | repo-handler config/codec members (`versionOf`, `packOrder`, `requiredBlobs`, `pick`, `hashOf`) |
| `91df34e9` | P0.5b | 50 remaining port members gain `optional?: {}` |
| (this commit) | report | this file |

## Census (exit gate 4 of Phase 0)

Method: `node cloud-results/publish-p0-args-census.mjs --list`. TypeScript AST over every production file of
`features/publish-content` and `features/publish-trust` (not `ui/`, not tests): 171 exported functions and exported arrow constants
(the design's regex counted 128 `export function`; the arrow constants and the files split since add the rest).
Conforming = no parameters, or an object-bag first parameter (destructured, an inline object type, or a `*Input|*Deps|*Args|...`
type) followed by `optional = {}` / `_optional = {}`, or a lone optional object with a `{}` default.

| | Count |
|---|---|
| Non-conforming at the start (base) | **85** (bag without options 30, two required bags 21, positional 15, two positional 19) |
| Non-conforming now | **0** by the script; **1 recorded exemption** below |

The design's number was 87 by regex; the AST number on the base is 85. Class mix and names are in `cloud-results/publish-p0-args-census.mjs` output.

Conversion rule (behaviour-free, names preserved): a function that already took one named bag gains `_optional = {}` (callers unchanged);
positional values and `(deps, input)` pairs become `({ deps, input }: { deps: D; input: I }, _optional = {})`, so the body keeps its
names and no body changed. Every caller and test is rewritten through the language service; calls reached through a dynamic
`import()` or a spread were fixed by hand (13 sites, listed in the commit messages).

**Exemption (P0.5a).** `buildRegistrations(deps)` in `publish-content/disconnect-tool.ts` stays positional: it is the `build` member of the
`ToolContributor` contract (`(deps, surfaces)`, a test asserts `contributor.build === buildRegistrations`). Converting it needs the
contract changed or an adapter lambda plus a test change; the owner or the tool-contract lane should rule. (The script's own rule
counts it as conforming because `Deps` is a bag type with `_optional`; the contract mismatch is the reason it was not given the `{ deps }` shape.)

## P0.5b

Method: `node cloud-results/publish-p0-port-census.mjs --list` (interfaces and object types, production files). Base: **65 members**
(the design said about 39): 51 took one named object but no optional boundary, 12 positional, 2 two-positional.
Port-method convention used: `(required: { ... }, optional?: {})`, the newest repo style (run-finalizer ports) and the design's
"never `Record<string, never>`" rule. The 388 older `optional?: Record<string, never>` members in the repo were not touched.

- `5175fbdf`: six repo/store writes became `{ record }`; SQL repos, in-memory implementations, fakes and callers in the same commit.
- `c4956cc6`: six repo-handler members became named objects; the default, media and taxonomy configs changed with them.
- `91df34e9`: 50 members gained `optional?: {}`; declaration-only (an implementer with fewer parameters stays assignable).
- Now: census 2 members, both recorded exemptions: `PublishContentHandler.isApplyConflict(error)` is a **type predicate** (TypeScript cannot
  name a destructured element in `error is X`; error TS1230 hit it when tried) and `ProvisioningFile.onEvent(event)` is a sink the caller of
  `createFileProvisioning` supplies (tried; reverted, three event-port tests went red when call sites were rewritten wrongly, then green after reverting).

## Gates (exact commands; all run in this container, Node 24.11.1, pnpm 10.33.2)

| Command | Base | Final |
|---|---|---|
| `npx tsc -p tsconfig.json --noEmit` | 0 errors | 0 errors |
| `npm run typecheck:tests` | 0 errors | 0 errors |
| publish suites: `node --test` over `features/publish-content/__tests__`, `features/publish-trust/__tests__`, `server/__tests__/routes/publish-*.test.ts` (+ every test file the working diff touched) | 1362 tests, 1361 pass, 1 skipped | 1362 / 1361 / 1 skipped on the last commit (touched-file extras raised it to 1537 mid-run); no test deleted |
| broad sweep: every `apps/website/src/**/*.test.ts` that names publish-content / publish-trust (194 files) | not run on base | 2425 tests, 2424 pass, 0 fail, 1 skipped (twice: after P0.5b-2 and on the final tree) |
| `npm run check:size`, `check:complexity`, `check:architecture`, `check:errors`, `check:boundaries` | exit 1, 1, 1, 0, 16 (BASE-RED) | **identical output** (diff after stripping line numbers is empty) |
| `node development/scripts/args-object-audit.mjs .` run on the base and on the final tree | 2098 violations, 2130 unsure | 2097 / 2094; by (file, name, kind): **0 new**, 37 gone |

Test count parity: 1362 -> 1362 on the shared suites; 8 test files were edited only at call sites; none deleted or weakened.
Failing-test-first does not apply: no behaviour changed (every conversion is a signature change under an unchanged suite). The
mutation proof (`publish-p0-mutation-proof.mjs`) was not re-run: no checked predicate moved.

### Gate history (honest)

Commits `98093108` .. `e90eb464` each worsened one `check:size` line against the base for that commit alone (the codemod re-indented
four `callPeer` calls: `peer-transport.ts` counted 501 code lines against 500; `buildPublishContentRegistrations` 103 vs 100;
`registerPublishContentDestinationRoutes` 139 vs 133). They were pushed before I diffed the gates. `4636b3c8` fixes them with whitespace only
(no history rewrite, no force push). The final tree equals the base on all five repository gates.

## Findings

1. **P0.8 stays blocked** for `type-registry.ts`, `peers.ts`, `peer-transport.ts`, `file-tree-policy.ts`: P0.4 (registry per composition root) and
   P0.7 (ports in place, `PeerStorePort`, `redact`, config ports) have not landed on `refactor/terra` (no commit, no `peer-vault-store.ts`,
   no `jini-publish.ts`). I did not start either; they are separate sheets.
2. Untyped test fakes hid four mismatches that `tsc` could not see (a dynamic-import `stageBundle`/`planImport` call, a `sessionAnswering` fake
   typed `(_deps, input)`, two `registerPublishContentContributor` calls). The execution of the suites found them; keep running the
   suites, not just `tsc`, after each conversion.
3. A flaky test, **unrelated**: `publish-site-listing.unit.test.ts` "refusals are logged" fails when the whole set runs together because its
   console spy also catches `[plugin-runtime] bundled initialization failed for 'charts-recharts'` (an unbuilt plugin bundle in this container);
   it passes alone and in both sweeps.
4. Carried from run 1/2 and still open: the apply bag lacks the plugin before-save hook (needs the owner's yes), K6c, the stale
   `apply-loop.ts` path in error messages, the `check:architecture` baseline rewrite after P0.8.
5. Overlap with parallel runs: this run touched `publish-content` / `publish-trust` production files, their tests, `apps/website/src/server/inbound/admin-http/routes/publish-content/*` (callers), `routes/system/publish-site.ts`, `platform/db/repos/publish-content-*`, `features/{post,media,theme,taxonomy,menu,...}/publish-content.ts` (config members), `composition/publish-content-manifest.ts`, `memory-deps/slices/publish-*`. Any parallel run editing those files will conflict textually on call lines.

## Next step

1. Owner: rule on the `ToolContributor.build` exemption and on OD-12 (this run assumed yes).
2. Dispatch P0.4 (registry per composition root); it removes the 162 `registerPublishContentContributor({ contributor })` call shapes this run produced, which is expected churn.
3. Dispatch P0.7a-e; then P0.8 for `type-registry.ts`, `peers.ts`, `peer-transport.ts`, `file-tree-policy.ts`, then one `check-architecture.baseline.json` rewrite.
4. Re-run `node cloud-results/publish-p0-args-census.mjs` and `publish-p0-port-census.mjs` as exit gate 4 once those land.

## Run notes

Scratch only: no worktree or test process was left running (the base worktree used for the audit was removed). The tests leave an untracked
`sites/tovu-dev/.form-files-protected-v1`; it was deleted before every commit and is not committed.
