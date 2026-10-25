# Jini guard → 0 — 2026-10-25 cloud run (unattended)

Env: host `vm`, 4 cores, Node 24.22.0 (installed per COMMON.md). Jini checkout at `/home/user/Jini` (session
mount, not `/root/Jini`); Tovu linked with `JINI_PACKAGES_DIR=/home/user/Jini/packages`.

## Result

| | before | after |
|---|---|---|
| `pnpm guard` (Jini, full `pnpm -r build` first) | **11** (all `packages/db/src/owner-store`: 7 × L1 db→platform, 4 × SI-domain) | **0** (`zero violations found`) |
| `pnpm guard:drift` | — | 0 new, 0 total |

## IMPORTANT finding: guard-2 was NOT built on guard pass 1

The brief says guard-2 b14d522d sits on pass 1 f819689f. It does not: its parent chain is
b14d522d → f3107709 → **f4f01f4f** (Codex WIP). So merging guard-2 into the overnight branch brought back the
three regressions pass 1 had reverted. Measured: `agent-runtime tests/loads-without-integrations` went **11/17 red**
(`Cannot find package 'openid-client' imported from …/@jini-ai/oauth/dist/discovery.js`). I merged f819689f too
(after `git pull --rebase` it shows as the linear commit ccbc5463, same content). That brought back 4 guard findings
(3 SI-dependency, 1 HW3). They are handled under "Escape hatches" below, so **none of the 3 regressions is
reintroduced**: loads-without-integrations is 17/17 again, and sanitize-svg is back to the module-lazy runtime.

## Commits

Jini `cloud/guard-zero-1025-jini` (from `origin/cloud/overnight-1024-jini` 3e2fbae8). Remote head verified with
`git ls-remote` = 07289148.
- `4af11564` merge guard-2 (`check-1024-jini-guard2-wip`). One conflict, in `cms/src/widgets/html/plugin-export.ts`:
  I kept the overnight `HOST_URL_SLOT` + trimmed URL_ATTRIBUTES comment, and guard-2's `ReadonlySet` types.
- `506196f8` owner-store move: re-applied db→server (reverting b14d522d's compat restore). It keeps 03dec0ae's
  overnight backup-hint/path-alias fixes; I diffed the moved files against the overnight db copies, and only the
  import paths and Codex's repo binding differ. `OwnerStoreService`'s `repo` is **optional** (it defaults to the
  `SqlSecretsVaultRepo` it built before), so kernel-only `new OwnerStoreService(...)` still works. db/server
  READMEs, CAPABILITIES.md, migration line in the db README.
- `ccbc5463` pass 1 f819689f (the 3 regression reverts), see above.
- `323efb68` reviewed exceptions for the 4 reopened findings, plus guard self-tests.
- `07289148` changeset for the guard pass 1–2 package changes.

Tovu `cloud/guard-zero-1025-tovu` (from overnight 61d219a5 + brief 03c0e736):
- `fe76d1d5` `apps/website/src/cli/commands/owner-store.ts` imports from `@jini-ai/server/owner-store`. It also adds the
  dependency `"@jini-ai/server": "^0.6.12"`, with package-lock resolving 0.6.12 from the registry. That was the
  only `@jini-ai/db/owner-store` import in Tovu: I grepped every .ts/.json/.mjs outside node_modules, and the
  desktop owner-store tests don't import Jini.
- this report.

## Verification (measured)

- Jini `pnpm -r build`: exit 0, both before and after the final change. I rebuilt db/server from a clean `dist`.
  db's build does not clean, so a stale `dist/owner-store/open.js` lingered. It can't be reached through the
  exports map, but **release from a clean dist**.
- `tsc --noEmit` errors = 0 for the tsconfig.json of every touched package: admin, agent-plugins, agent-runtime,
  chat, cms, commerce, core, daemon, db, diagnostics, integrations, mcp, memory, oauth, platform, search, server,
  ui, vibecoding. Also 0 for server's tsconfig.tests.json and for scripts/tsconfig.json.
- vitest (`--maxWorkers=2 --minWorkers=1`):

  | suite | result |
  |---|---|
  | server owner-store | 42/42 (test declarations 22 = overnight db copy 22) |
  | db owner-store + secrets-vault | 12/12 |
  | cms plugin-export + resolve-html-page-embeds (merge-conflict file) | 69/69 |
  | cms src/media | 380/380 |
  | agent-runtime model-discovery + claude-filesystem-policy | 193/193 |
  | agent-runtime loads-without-integrations | 17/17 |
  | daemon full | 3562/3562 |
  | integrations full | 1938/1938 |
  | vibecoding full | 301/301 |
  | diagnostics full | 770/770 |
  | oauth full | 705/705 |
  | platform full | 2709 pass / **1 fail** / 6 skip |
  | scripts check-subpath-isolation | 33/33 (3 new) |

  The platform failure is **pre-existing and unrelated**: `secrets/__tests__/exports.test.ts:17` expects
  `@jini-ai/core: ^0.6.11` and the manifest says `^0.6.12`, a stale pin from the 0.6.12 release. Neither file
  differs from overnight, so I didn't fix it.
- ESLint `complexity`/`sonarjs/cognitive-complexity` ≤ 10 on server+db owner-store and plugin-export.ts: 0 errors.
- Tovu with Jini linked:

  | check | result |
  |---|---|
  | `owner-store.integration.test.ts` | **5/5**, re-run after the final Jini change, 5/5 again |
  | root `tsc -p tsconfig.json` | 0 errors |
  | `tsconfig.tests.json` | 344 errors (pre-existing, same as the 10-24 runs), 0 in owner-store files |

  Negative control: against the new Jini, `@jini-ai/db/owner-store`'s `openOwnerStore` is `undefined`. So the old
  import really is gone, and the migration was required. I ran `npm run unlink:jini` afterwards.
- What this does NOT catch: no full cms/chat/ui/admin suites (only the touched or conflict files), no Tovu
  website-wide suite (only owner-store), no desktop gates, and no published-package typecheck (needs a publish).

## Escape hatches (documented, one-line why each — owner please review)

1. `scripts/check-subpath-isolation.ts`: the existing inline `agent-runtime → @jini-ai/oauth` exception is now a
   reviewed table, `REQUIRED_SUBSET_DEPENDENCIES`, with its reason comment. It adds:
   - **oauth → openid-client, oauth4webapi.** The root protocol client loads them, and agent-runtime's required root
     imports that root. As optional peers, a fresh agent-runtime install fails (measured 11/17). agent-runtime can't
     declare them itself: the rule then flags it at 0/N, because closures only count a package's own imports.
   - **diagnostics → js-tokens.** `./redaction/secrets-only` and `./observability` load it, and their published
     consumers don't declare it (chat's user-text redaction, Tovu's 14 `./observability` imports).

   Tests prove each entry is exempt and that other dependencies are still flagged.
2. `scripts/hardwiring-debt.json`: one reviewed HW3 entry for `cms/src/media/sanitize-svg.ts:42` (`let runtime`).
   It is a process-lifetime lazy JSDOM/DOMPurify runtime with no tenant or request state. Per call it would be
   8.3 ms vs 1.1 ms, and Tovu sanitizes on every public media request. A real fix means threading a sanitizer
   instance through cms media-service/rendition-service/replace-media-file and Tovu's two routes.

No rule table, threshold or other check was changed. The guard also reports 25 stale debt entries (pre-existing,
same count before). I left them alone.

## Breaking changes + changesets (Jini `.changeset/`)

- `owner-store-to-server.md` (db, server). **BREAKING import path**: the composition moved from
  `@jini-ai/db/owner-store` to `@jini-ai/server/owner-store`, with a migration snippet. The server entry now uses
  the optional peers `@jini-ai/platform` + `kysely`. Other consumers: grep of the Jini repo (docs, READMEs,
  examples) found **none** besides Tovu. Open Marketing/Zana repos are not in this session, so **owner: check those
  hosts**.
- `guard-host-ports.md` (vibecoding, integrations). **BREAKING host composition**: vibecoding node
  `openFileTreeProject` requires `filesystem: ProjectFilesystemPort`, and saved-requests `SavedRequestDeps`
  requires `executeCredentialedRequest`. **No default given**, because a default would re-add exactly the
  platform/credentialed-http edge the guard removed. That's why these are changelog lines. Tovu is unaffected
  (it only uses `vibecoding/html*`).
- `guard-cleanup-passes.md` (14 packages): guard pass 1–2 changes. Additive public API: `@jini-ai/core/filesystem`,
  `useFetchQueryScope`, and the chat/react re-exports.

All are `patch` because the `@jini-ai/*` group is fixed and stays on 0.6.x. Tovu's `^0.6.12` range is satisfied by
0.6.13. **Owner decision:** promote to `minor` if 0.x breaking changes should bump the minor. That moves the whole
group to 0.7.0, and Tovu's ranges would then need bumping.

## Not done / follow-ups

- Release order: publish Jini, then bump Tovu's lockfile so `@jini-ai/server` and `@jini-ai/db` resolve ≥ 0.6.13
  together. Until then, Tovu's **published** (unlinked) build fails at the import: server 0.6.12 has no
  `./owner-store`. The linked dev setup works now.
- The stale platform exports-test pin (`^0.6.11`), above.
- A real (non-hatch) fix for the 4 findings needs the owner to decide whether consumers declare those peers
  (cascading breaking changes) and whether to thread a sanitizer instance.

GUARD DONE 2026-10-25T20:00Z. Wall ≈ 28 min (19:32 → 20:00Z). Rough tokens ≈ 0.25M, no subagents.
