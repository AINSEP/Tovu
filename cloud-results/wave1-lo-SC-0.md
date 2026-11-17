# wave1 lo-SC-0 — source-control gate tests (TESTS sheet, Tovu only)

Branch `wave1/lo-SC-0` (Tovu). Base `origin/integ/merge-final-2026-11-16` 232764af; Jini clone on the same branch at 65d73b0d, **no Jini change** (no Jini commit, no Jini V1/V2 guard run needed).
Plan: `plan/left-out-areas-2026-11-16` — INDEX.md, COMMON-LO.md, sheet SC-0 (`sheets/SC-source-control.md`), sidecars `SC-0.files.tsv`, `SC-0.importers.tsv`.

## Status: DONE (all six sheet items committed; one item's wording differs from today's behaviour, see Deviations)

## Commits (pushed to origin/wave1/lo-SC-0)
| SHA | Content |
|---|---|
| a73e9a77 | new `features/source-control/__tests__/gates.characterization.unit.test.ts` (16 tests; sheet items 1, 2, 3, 4, 6) |
| d224bff8 | 3 added cases in `server/inbound/admin-http/routes/system/__tests__/source-control-credentials.unit.test.ts` (sheet item 5) |
| (this report) | `cloud-results/wave1-lo-SC-0.md` |

## Setup and baseline (V0/V1)
- Node v24.22.3 (nodejs.org, `~/.local/node24`), pnpm 10.33.2 via corepack. Jini `pnpm install --frozen-lockfile` and `pnpm --no-bail -r build`: exit 0. Tovu `npm ci`, `link-jini` (71 links), `packages/contracts` and `packages/sdk` built.
- S-BLOB (`SC-0.files.tsv`: provider-registry.ts c6387f06, provider-kit.ts ff2109f5): prints nothing. Precondition: none.
- Baseline on the unmodified tree: `npx tsc -p tsconfig.json --noEmit` exit 0; `tsc -p tsconfig.tests.json --noEmit` (6 GB) exit 0; the three existing test files the sheet extends (route, provider-registry, provider-kit.observability): 36 pass, 0 fail.

## Verification after the commits (V2)
- `tsc -p tsconfig.json --noEmit` exit 0; `tsc -p tsconfig.tests.json --noEmit` exit 0 (run once on the final tree that holds both commits; the two files are independent, nothing imports across them, and each file's tests were run alone).
- Tests: `source-control-credentials.unit.test.ts` 14 pass (was 11, +3); `gates.characterization.unit.test.ts` 16 pass; whole `features/source-control/__tests__/*.test.ts` plus the route file: 265 pass, 0 fail (246 before, 0 deleted or edited assertions: the route file only gained appended cases).
- `npx eslint` on both touched files: 0 errors; 1 warning `sonarjs/assertions-in-tests` at route test line 70, in an EXISTING test (not mine).
- No test process left alive (`pgrep` for `node --test` / `vitest`: 0).

## V3: the mutation that turns each test red (every one run, failing assertion seen, file restored)
Source mutations restored with `git show HEAD:<path>`-equivalent; mutations of Jini code were applied to the gitignored `dist/` JS of the linked clone and restored from a backup copy (tracked trees show only the two test files in `git status`).
| id | mutation | RED test, failing assertion |
|---|---|---|
| M1 | `provider-registry.ts`: drop the `onInactive` body | inactive: `switchedOff` actual `[]`, expected `[["gate-host","gate-git"]]` |
| M2 | Jini `trusted-plugin-files.js`: digest comparison -> `false` | digest mismatch: `registry.list()` non-empty |
| M3 | Jini `trusted-plugin-files.js`: skip `assertContainedOnDisk` for the module path | escape: refusal is a "Cannot find module ..." sentence instead of "escapes the plugin root" |
| M4 | Jini devops `registry.js`: accept any module path (drop the `.mjs` test) | non-.mjs: `registry.list()` non-empty |
| M5 | `provider-registry.ts`: pass an extra argument to the bundled `load` | bundled: arg count actual 2, expected 1 |
| M6 | append the caught error text to the bundled refusal | throwing sources: refusal has the error text appended |
| M7 | delete `providers.delete(id)` in the duplicate sweep | duplicates: `get("example-git")` is an object, expected `undefined` |
| M8 | `provider-kit.ts`: `"caller"` -> `"guard"` | kit.fetch: init has `redirect: 'manual'` added |
| M9a | `provider-kit.ts`: `kit.httpClient` sends through native fetch | httpClient: not reference-equal / recorder mismatch |
| M9b | `NO_HTTP_CLIENT.send` resolves | "Missing expected rejection" |
| M10 | `describeTransportError`: non-refusal returns its message as `refusal` | refusal actual = the error text, expected `undefined` |
| M11 | `commit-site.ts`: swallow the default-lookup failure so the saved key is asked | store throws: "asked" was non-empty |
| M12 | `commit-site.ts`: drop the `!credential &&` condition | explicit wins: `asked` actual `[{workspaceId,providerId}]`, expected `[]` |
| M13 | `source-control-key-binding.ts`: label falls back to the provider id | binding: the undeclared id reached the store |
| M14 | `tool-registrations.ts`: label falls back to the provider id | commit tool: undeclared-id commit succeeded (`committed` true, expected false) |
| M15 | route: delete the foreign-workspace refusal | foreign workspace: status 500, expected 404 |
| M16 | route: ignore the authorize denial | permission: status 500, expected 403 |
| M17 | route: change `PERMISSION` | permission: recorded `permission` is `system.publish`, expected `source-control.credentials.write` |

## STOP matrix (revision 3 commands, run on the final diff `origin/integ/merge-final..HEAD`)
- S-BLOB: nothing. S-PRE: none (sheet has no precondition).
- S-CENSUS: not applicable (no file moved or deleted).
- S-IMPORT, S-BARREL, S-TEXT, S-RUNTIME, S-ARGS, S-GUARD: not applicable (no Jini file, no Jini commit).
- S-SUPPRESS: nothing. S-MOCK: nothing (no `vi.mock` / `mock.module`; `t.mock.method` on `console.warn` and one in-memory vault `list` only, node:test's own spy).
- S-LIM: no production file changed (the file filter excludes `__tests__`), so the per-file eslint block prints nothing. The repo ratchets `npm run check:size` and `npm run check:complexity` exit 1 with violations that are all in files this run did not touch (examples: `server/runtime/composition/deps.ts`, `commerce.ts`, `provider-plugins.ts`, `features/external-mcp/tool-registrations.ts`, `routes/members/list.ts`, `assistant-byok.ts`, `publish-content/backstop.ts`); none names a source-control file or the new test. I did not run the ratchets separately on the unmodified tree; this is reported as "ratchet red on files outside this sheet", not fixed.
- S-FORWARD: nothing. S-SCHEMA: no `.sql`, drizzle or migration path in the diff. S-BOOT: nothing. S-CRED: nothing (no credential-store mutator added). S-DELETE: nothing (temp dirs are removed through the existing `forceRemove` fixture).
- S-NET: hits are only strings given to fakes (`https://api.example.test/...`, `https://git.example.test/...`, the plugin schema URL in a generated `plugin.json`); every transport in these tests is a recording fake (`fetchFn`, `HttpClientPort`, `SourceControlCommitAdapter`), nothing is fetched.

## Deviations from the sheet
1. Item 1, "non-.mjs module ... drop only that provider": today a non-`.mjs` module path makes the whole descriptor FILE invalid (`providers[i].module must be a relative path ending in .mjs`), so every provider that file declares is dropped, not only the offending one. The committed test pins today's behaviour (whole file refused, no module of that plugin imported). The sheet's wording is a requirement, not current behaviour: it belongs to a HARDEN sheet if the owner wants per-provider drops.
2. Item 1 loader tests use the REAL plugin lifecycle with real installed packages (as the existing `provider-registry.unit.test.ts` does), not a hand-written `loadContributions` fake: the activation, digest and containment gates live in the lifecycle, so a fake would not exercise them. All other ports are recording fakes.
3. Item 3: "without `httpClient`, `send` rejects with a transport error" is pinned by its exact message `no outbound HTTP client is wired for this call` (the production `NO_HTTP_CLIENT` text), plus no native fetch call.
4. Item 6 is covered at three levels: `resolveCommitCredential` (store failure never asks the saved key; explicit credential never overridden), `sourceControlKeyBinding` (only the declared id reaches the store), and the commit tool end to end (a custom key labelled with an undeclared provider id is never used for it; positive control with `github`). `sourceControlSavedApiKeyLabels` contents are pinned (`[["github","github"]]`).
5. Item 5's enumeration reads `app._router.stack` (Express 4, as `extractRouteHandler` does) and a separate vacuity guard asserts the four verbs and the providers path are present, so the loop cannot silently match nothing.
6. Counts were recomputed here, not copied from the plan: 3 tests added to the route file, 16 to the new file, 0 removed.

## Security notes (class and location only)
- Item 2 pins that the BUNDLED provider loader applies no activation or digest check; its only gate is the product-payload root (`provider-registry.ts`, bundled loader). Item 3 pins that the site-commit and account-label transport is the native `fetch` with the caller's redirect policy (the guard is the plugin's job), while the guarded client serves custom file writes and backup calls. The SC-H1 class (a credentialed account-label request without the redirect guard) is unchanged; it is the open hardening item D-SC4, not touched by this tests-only sheet.

## Not done / next step
- Nothing left for SC-0. Next sheets per INDEX: SC-1 (Jini HARDEN), SC-2a (TESTS); SC-3d later takes these loader tests as its input.
- Not run: Jini guard/typecheck/tests (no Jini change); the Tovu full test suite (only the source-control folder and the route file, per the sheet's V2 list).
