DONE T e59a735e0 J 64a936a23

# w3-ext-w1w2 — review, test, fix and intake of Sol's round-1 ext-w1/ext-w2 builds (2026-11-25)

Branches: Tovu and Jini `integ/w3-ext-w1w2-2026-11-25`, both cut from `origin/integ/merge-23-2026-11-25`
(Tovu `f81b1839a`, Jini `6390c018e`). Pushed heads: **Tovu `e59a735e0`** (the commit carrying this report sits on top of it), **Jini `64a936a23`**.
Personas loaded first: `AI-Dev-Shop/agents/code-inspection/skills.md` (reviewer; there is no `code-review/skills.md`)
and `AI-Dev-Shop/agents/programmer/skills.md`.
Unattended run. Opus coordinated and reviewed. Four Sonnet (high) subagents built the eleven ext-w2 Tovu sheets in one shared checkout. Each committed only its own paths, under a lock.

## Merge and intake

- **Jini merge:** `codex/w3-ext-w1j` (`fe7bf8cc1`) then `codex/w3-ext-w2j` (`7ccdb01e9`). The only conflicts were the package.json maps for `cms`, `devops`, `platform` and `user-management`. They were resolved as the **union** of both sides, for both `jini.entries` and `exports` (merge `a519b7ac4`).
- **Tovu merge:** `codex/tv-w3-ext-w1x` (`e5074b9ce`) merged cleanly (`5d3b4f704`).
- **Package intake** followed the combine-23 flow:
  - Jini: `pnpm install` (the lockfile was refreshed for the new optional peers, `b9692c81c`), then `pnpm -r build`, green.
  - Tovu: `npm ci --ignore-scripts` in the root, admin, desktop and site-chat, then `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` (83 links), the hooks, and a build of `packages/{contracts,sdk}`.
  - No Tovu `package.json` or lockfile change was needed. The Jini packages are still `0.7.3-next.2`, which satisfies Tovu's `^0.7.3-next.2`, and the new J01–J09 subpaths resolve through the link.
  - Nothing was published or tagged.

## Per-sheet table

### ext-w1 (Sol-built; Opus-reviewed, then tested and fixed)

| sheet | status | note |
|---|---|---|
| J01, J02, J16, T01, T15 | REJECTED by the sheet check (X1/X3) | Not built. Correct. |
| J03 + T02 core declarations | built by Sol, **fixed** | The Tovu half is OK. The fix is to the db `drift.ts` type re-export: `export type` from core, which is not a shell. |
| J04 + T03 database doubles and transfer store | built by Sol, **fixed** | Faithful move with injected `scope`/`parseMeta`/`normalizeAddress`. The in-memory store stays in Tovu, per the FIX. Fixed: the partial `db` `jini.entries` broke R8 (24 guard rows), and host paths were left in comments. |
| J06 + T05 consent | built by Sol, OK | Byte-faithful SQL with an injected table map. |
| J07 hosted-MCP SQL owner | built by Sol, **fixed** | Two pins failed spuriously because of the fixture's lowercase `select`. Guard SI-domain: the repo moved to `mcp/src/federation/hosted/`, so the subpath is now `@jini-ai/mcp/federation/hosted/external-mcp-repo`. Mutation `join-without-workspace` gives 1 red. The **T06 Tovu cutover is not built** (Sol did not build it). |
| J08 identity SQL + permission list | built by Sol, **fixed** | Did not compile: missing `../index.js` and explicit `undefined` keys. The denial test passed for the wrong reason (boolean authorize). The **T07 Tovu cutover is not built.** |
| J11 + T10 form destinations | built by Sol, **fixed** | Test typecheck: an implicit `any`. |
| J14 + T13 media provider credentials | built by Sol, **fixed** | The host port type broke Tovu `tsc` (4 errors). Sol's new witness expected the wrong error class. Risk table switched to `ReadonlyMap`. |
| J15 + T14 deploy host kit | built by Sol, **fixed** | The test invoked optional members. |
| J17 + T16 screenshot | built by Sol, **fixed** | Boolean authorize fixture. Risk table switched to `ReadonlyMap`. |
| J18 + T17 web fetch | built by Sol, **fixed** | Boolean authorize fixture. Risk table switched to `ReadonlyMap`. The host builds one limiter and the contributor builds none, matching the FIX. |
| J05/T04, J09/T08, J10/T09 | **left** | Sol did not build them. |
| J12/T11, J13/T12 | **left** | Blocked on ext-crp CRP-02 (X1). |

### ext-w2 (Jini built by Sol; Tovu built by Opus via subagents)

| sheet | status | witness → mutation (red after mutation, green after revert) |
|---|---|---|
| J01–J09 | built by Sol, reviewed. **Fixed:** J06 `media-original-urls` needed an optional `kind` (`f4b35b19d`). `export-html-policy` changed to a `node` entry. | J01 (vault/sealer) is a faithful move. Grant before read, re-check after open, and the create-only vs replacement split are all preserved. J02 OIDC admission is faithful. |
| T01a `52058f224` | built (Opus) | "composed owner keyring cannot derive for the site" → TOVU-PK-RAW-KEYRING, 1 red |
| T01b `6b2cda87c` | built (Opus) | "host create conflict retains the host typed error" → TOVU-PK-GENERIC-CONFLICT, 1 red |
| T01c `941f56b55` | built (Opus). Removed 3 project-key owners and `contracts/core/site-granted-vault.ts`. G2 rows retired. | "mail provider primary save never receives a replacement writer" → TOVU-PK-MAIL-USE-REPLACE-PORT, 1 red |
| T02 `8068c8619` | built (Opus). Added `bindings.ts`. Removed `credentials`, `ready-providers` and `index`. G2 baseline/debt rows and CONTRACTS.md updated. | "a second host readiness call re-admits the installed provider" → TOVU-OIDC-REUSE-FIRST-PROJECTION, 1 red (temporary bundled root; see `W3X-oidc-bundled-namespace`) |
| T03 `120aa546f` | built (Opus) | "a capture arriving after preview survives the confirmed clear" → TOVU-MAIL-CLEAR-REBIND-LIVE-PLAN, 2 red (one per dialect) |
| T04 `983b1ed94` + `bf9cc4f5d` | built (Opus). Added `candidate-policy.ts`, which declares `PUBLIC_URL_KEY`. env-read-debt re-keyed and the pin updated. | "candidate reads the committed destination rather than the current process origin" → TOVU-PUBLISH-CANDIDATE-ENV-OVERRIDE, 1 red |
| T05 `5a69b14a5` | built (Opus) | "a newly configured store cannot revoke a share saved on another binding" (selector test plus host-wiring test) → TOVU-SHARE-REVOKE-IGNORE-RECORDED-PROVIDER, 1 red |
| T06 `54c8154e0` | built (Opus). Added `media-url-bindings.ts`. G2 baseline/debt rows and the dependency-cruiser reviewed pairs updated. | "export headers still derive from the live public-page policy" → TOVU-EXPORT-FIXED-HEADER-SET, 1 red |
| T07 `ff95dd30d` | built (Opus). Added `push-manifest.ts`. The landing bytes match, and the sha256 pin was added. | "host chooses the same byte-pinned landing" → TOVU-BACKUP-LANDING-RENAME-CLASS, 2 red. "repository push manifest remains last and keeps its host name" → TOVU-BACKUP-GENERIC-MANIFEST-PATH, 2 red |
| T08 `7ce398468` | built (Opus). Added a cutover test with a compile-time `NewsletterErrorMapper` assignment. | "unknown failure is left to the route failure reporter" → TOVU-NEWSLETTER-MAP-UNKNOWN, 1 red |
| T09 `c55eb3655` | built (Opus). The CLI, exemptions and entry guard stay in the host. The `ts` import stays out of the app graph (`app-runtime-dependencies.test.ts` 6/6). | "the CLI refuses a matching call text in a different path" → TOVU-AAD-EXEMPT-BY-TEXT-ONLY, 3 red |

The subagents applied and reverted every mutation and checked `git diff` for residue. Opus re-ran the J07 mutation itself.

## Review against the owner rules

- **Faithful moves:** checked by diff against the merge-23 Tovu sources for J01, J02, J03(w2), J04(w1), J06(w1), J07(w1) and the media host.
- **Security and credentials:** No grant, re-check, refusal order, CAS or lock was weakened.
  - Vault owner scope (`project`/`tovu`/kinds) and all refusal copy are host policy (`vault-policy.ts`), byte-identical.
  - OIDC admission keeps `requireActive`, `orderByPluginId` and `LOGIN_PROVIDER_UNTRUSTED`, with no boot cache.
  - The backup abort check and refusal order are unchanged.
  - The database-destination vault scope is injected, and the Jini check compares kind, ownerKey and null principal.
- **Neutrality:** `pnpm guard` is green, and an `rg -i "tovu|open design|OD_"` over every added or changed Jini file is empty.
- **Deletions:** every deleted Tovu file had zero importers left (`git grep` across ts/tsx/mts/mjs/js/json/md, including mocks and dynamic imports). No forwarding shells were added.
- **Deviation recorded:** the w1 J07 subpath is now `./federation/hosted/external-mcp-repo` instead of `./external/external-mcp-repo`. The guard forbids the `external` → `federation` domain crossing that the sheet's "canonical federation envelope helpers" require. ext-w1 T06 must import the new path.

## Tests and gates

All comparisons are against `integ/merge-23-2026-11-25`. For the base, a worktree of merge-23 was run with the same `node_modules`, which means it is linked to this branch's Jini build.

**Jini**

| check | result |
|---|---|
| `pnpm -r build` | green |
| `pnpm guard` | **green**. Sol's merge showed 33 violations; all 33 were fixed in `32e8dc566`. |
| strict `typecheck` (touched packages and `scripts/`) | green |
| changed test files in cms, cookie-consent, core, db, devops, diagnostics, integrations, mcp, platform and user-management | 29 files, all pass (mcp 4/4 after the fixture fix) |
| `api:check` | exit 0. The baseline was regenerated in `64a936a23`, which also records the drift api:check reported for admin, chat, daemon and infra. That commit is separate so it can be dropped. |

**Tovu**

| check | result |
|---|---|
| `typecheck` (`tsc` + e2e) | base 0, Sol's merge 4 (**new**, fixed), final **0** |
| admin `tsc` | **0** |
| `typecheck:tests` | base 736, final 743. Every extra error is the old `ContentKernel`/`MailSqlKernel` family in `capture-clear-retention.dialects.test.ts`, repeated 8 times by the new T03 witness. **No new error class.** Two other new ones (T10 implicit any, the newsletter `#src` specifier) were fixed. |
| changed/related test files (89, all changed `.test.ts`/`.test.mjs`) | 1150 tests: 1131 pass, 17 fail, 1 skip |

Of the 17 test failures:
- **1 was new:** Sol's T13 witness. It is fixed: the file is now 37/37 pass.
- **16 fail at base as well:**
  - `tool-registrations.postgres` ×7 (6 tests plus the file)
  - member-login ×5 (the OIDC namespace bug)
  - `hosted-forms-static` ×1
  - site-sharing H3 ×1
  - s3-compatible overlays ×2
- The `probe-card-binding` B199 entry is a `todo` pin.

**Not run**
- The full Tovu suite and the desktop gates. No `apps/desktop` changes, so the pre-push hook skipped them.
- `check-architecture.ts`, which crashes in `cruise` in this container (`W3X-check-architecture-crash`).

## Bugs found

All are logged in `development/open-bugs.md` under "Found in the w3-ext-w1w2 review run". Fixed here:

- `W3X-identity-repo-missing-barrel`
- `W3X-identity-repo-explicit-undefined`
- `W3X-boolean-authorize-fixtures`
- `W3X-host-kit-optional-members`
- `W3X-lockfile-optional-peers`
- `W3X-guard-33`
- `W3X-mcp-sql-fixture-case`
- `W3X-media-host-port-optional`
- `W3X-media-reason-witness-class`
- `W3X-export-media-kind`
- two test-typecheck reds

Pre-existing and left alone:

- **`W3X-oidc-bundled-namespace` (HIGH, owner decision).** Tovu admits bundled login presets only as `tovu/<id>`, while Jini's google-login manifest now says `jini/google-login`. As a result, no bundled OIDC provider loads.
- `W3X-site-sharing-h3`
- `W3X-hosted-forms-static-determinism`
- `W3X-db-transfer-postgres-suite`
- `W3X-s3-overlay-suites`
- `W3X-mail-kernel-test-types`
- `W3X-check-architecture-crash`
- The known merge-23 duplicate export keys. Those files were not touched.

## FILES LEFT

- **ext-w1 still to build:**
  - J05/T04: API connections. Note the J05 rename `parseApiConnectionsWithAlternateNamespace`.
  - J09/T08: member-login member tools.
  - J10/T09: publish contributors.
  - Tovu cutovers T06 (hosted-MCP SQL; the Jini owner is ready at the new subpath) and T07 (identity SQL; Jini is ready, see the fixture note in `W3X-identity-repo-explicit-undefined`).
  - J12/T11 and J13/T12, which wait for ext-crp CRP-01/CRP-02.
  - Planner count: not computed precisely in this run; see the ext-w1 sheet rows for the exact move sources.
- **NOT-SHEETED residuals:** ext-w1 6, ext-w2 63, as listed in the sheets.
- **Owner decision:** the trusted bundled login namespace (`tovu/` vs `jini/`).
