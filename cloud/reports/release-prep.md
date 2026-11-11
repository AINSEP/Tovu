# release-prep

Branch `cloud/integ-1110` in both repos. This job prepared the release commits only: nothing was published, no tag, no push to main, no force-push.

Bases: Jini `4ffe93fc` (FIX-AGY), Tovu `2f392afc` (FIX-AGY report).

## Result

- Jini release version: **0.7.0** for the whole fixed `@jini-ai/*` group (41 packages, 40 public).
- All gates pass: build, `guard:plugins`, `guard:plugins:packed`, `check:cross-package` (XP1–XP5 clean), plugin-catalog tests, publish plan, and a pack of every pending package with all of publish-pending's tarball checks.
- Tovu desktop: 0.1.30 → **0.1.31**, with a release note.

## Commits

Jini (`cloud/integ-1110`, all pushed):

| SHA | Commit |
| --- | --- |
| `3a9fcc6c` | chore(changeset): record the retired @jini-ai/cms consent subpaths as a minor change |
| `de6f8365` | chore(release): prepare plugin-extraction release 0.7.0 |
| `62c30e2b` | chore(release): seal plugin-extraction release catalog metadata |
| `bb44f52d` | fix(release): eight packages leave source maps out of their tarballs |

Tovu (`cloud/integ-1110`, pushed): `eb737af8` chore(desktop): prepare 0.1.31 plugin-extraction release; plus the commit carrying this report.

## Method (copied from ad4e836a9 + a958739c2)

1. `pnpm changeset version` consumes the pending changesets (45 found, plus 1 added here = 46; `.changeset/` now holds only `README.md` and `config.json`).
2. provider-plugins: the versioned export paths in `package.json` (`./plugins/<id>/<version>/jini.plugin.json`) and the "npm release is **x**" line in three provider READMEs follow the new version, as ad4e836a9 did.
3. Rebuild, then seal: `pnpm --filter @jini-ai/plugin-catalog run generate` rewrites `packages/plugin-catalog/catalog.json` from the built payload. `packages/provider-plugins/catalog.json` has no generator; it is `{id, version, path: plugins/<id>/<version>}` per provider (its test `distribution-manifest.test.ts` pins exactly that), so the version and path move to 0.7.0, as a958739c2 did by hand. The lockfile follows the 0.7.0 internal ranges and is in the seal commit.

## Bump-type decisions

- **Release is a minor, 0.6.x → 0.7.0.** `.changeset/config.json` has `"fixed": [["@jini-ai/*"]]`, so every member moves together to one version, set by the highest bump. Many changesets are `minor` (breaking in 0.x: new required ports, moved subpaths).
- **`changeset version` computed 1.0.0, not 0.7.0.** No changeset asks for `major`. Changesets majors any package whose `^0.6.x` peer range a 0.x minor leaves, and the fixed group then carries every package to that version. I relabelled the computed `1.0.0` to `0.7.0` in exactly three patterns, in only the files it touched: each package's `"version"`, each `## 1.0.0` CHANGELOG heading, and each `@jini-ai/*` `^1.0.0` range / `@jini-ai/*@1.0.0` dependency line. Before the edit every `1.0.0` in the diff matched one of those three; after it none remain. The section types changesets wrote (Minor Changes / Patch Changes) are unchanged. The coordinator may want to settle this for future 0.x minors (for example a pre-version step that keeps peer dependents at minor), since every 0.x minor will hit it.
- **Missing changeset added (minor): `@jini-ai/cms`.** Comparing each package's published `exports` keys with the current ones (`exports-diff.txt`) found one removal: cms no longer exports `./consent`, `./consent/html`, `./consent/node`, `./consent/express` (retired in `31dc35b1`), and no changeset said so. Added `.changeset/cms-retire-consent-subpaths.md` as `minor`, naming `@jini-ai/cookie-consent` as the replacement. No other package removed an export key; 14 only added keys.
- **Patch changesets reviewed and kept as patch** (additive only, checked against the published packages where in doubt):
  - `devops-deploy-contribution-contracts`: the `Plugin*` deploy types are new names. The published 0.6.22 tarball has `DeployHostKit` / `DeployTargetModule` and those still exist, so nothing was renamed away.
  - `calm-credential-tools-s9`: new files and a new entry only (`ed7901c5`); the required ports belong to the new API.
  - `quiet-library-deploy-s9`: release note for the new deploy-tool host ports; the runtime moved in additively.
  - `commerce-core-tool-permissions`: drops an optional peer, which cannot break a consumer.
  - `agent-plugin-search-host-tools`: description text changes; the new `messages` argument is optional.
  - The rest add entries or exports.
- Because the group is fixed, the CHANGELOG section a changeset lands in is the only thing its type changes; the released version is 0.7.0 either way.
- **Every package whose source changed gets a new version:** the fixed group bumps all members, so all 40 public packages (and `@jini-ai/cms-forms`) go to 0.7.0, including those with no changeset of their own (e.g. `sqlite`, local 0.6.23 vs npm 0.6.19). No package is left behind.

## Package versions

Old = repo before this job; npm = `npm view` on 2026-11-11 (`npm-view.txt`).

| Package | old | npm | new |
| --- | --- | --- | --- |
| `@jini-ai/admin` | 0.6.22 | 0.6.22 | 0.7.0 |
| `@jini-ai/agent-plugins` | 0.6.24 | 0.6.23 | 0.7.0 |
| `@jini-ai/agent-runtime` | 0.6.23 | 0.6.23 | 0.7.0 |
| `@jini-ai/agentic` | 0.6.23 | 0.6.23 | 0.7.0 |
| `@jini-ai/analytics` | 0.6.22 | 0.6.22 | 0.7.0 |
| `@jini-ai/artifacts` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/capability-providers` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/chat` | 0.6.23 | 0.6.23 | 0.7.0 |
| `@jini-ai/cli` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/cms` | 0.6.22 | 0.6.22 | 0.7.0 |
| `@jini-ai/commerce` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/cookie-consent` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/core` | 0.6.23 | 0.6.23 | 0.7.0 |
| `@jini-ai/daemon` | 0.6.23 | 0.6.23 | 0.7.0 |
| `@jini-ai/db` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/desktop-host` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/devops` | 0.6.22 | 0.6.22 | 0.7.0 |
| `@jini-ai/diagnostics` | 0.6.22 | 0.6.22 | 0.7.0 |
| `@jini-ai/http-kit` | 0.6.22 | 0.6.22 | 0.7.0 |
| `@jini-ai/infra` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/integrations` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/mcp` | 0.6.23 | 0.6.23 | 0.7.0 |
| `@jini-ai/memory` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/oauth` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/platform` | 0.6.23 | 0.6.23 | 0.7.0 |
| `@jini-ai/plugin-catalog` | 0.6.24 | 0.6.23 | 0.7.0 |
| `@jini-ai/plugin-fixture-provider` | 0.6.19 | not published (private) | 0.7.0 |
| `@jini-ai/plugins` | 0.6.22 | 0.6.22 | 0.7.0 |
| `@jini-ai/protocol` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/provider-plugins` | 0.6.24 | 0.6.23 | 0.7.0 |
| `@jini-ai/registry` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/sandbox` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/search` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/server` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/sidecar` | 0.6.22 | 0.6.22 | 0.7.0 |
| `@jini-ai/sqlite` | 0.6.23 | 0.6.19 | 0.7.0 |
| `@jini-ai/ui-kit` | 0.6.23 | 0.6.23 | 0.7.0 |
| `@jini-ai/ui` | 0.6.23 | 0.6.23 | 0.7.0 |
| `@jini-ai/user-management` | 0.6.22 | 0.6.22 | 0.7.0 |
| `@jini-ai/vibecoding` | 0.6.19 | 0.6.19 | 0.7.0 |
| `@jini-ai/cms-forms` | 0.6.19 | 0.6.19 | 0.7.0 |

## Fix made: source maps in eight tarballs

The first full pack stopped: `@jini-ai/agentic: tarball contains source maps, e.g. package/dist/core/ag-ui.d.ts.map`. A dry-run pack of every public package found the same gap in eight: `agent-plugins` (238 maps), `agentic` (106), `commerce` (176), `oauth` (70), `plugins` (130), `sandbox` (48), `search` (32), `server` (30). `tsconfig.base.json` emits `sourceMap` and `declarationMap`, and these packages' `files` lists had no `.map` negation. Their last published versions ship 0 maps (checked from the npm tarballs). Fix `bb44f52d`: each adds `"!dist/**/*.map"`, the pattern core already uses. After it, all eight dry-run packs have 0 maps and the full pack passes.

## Publish plan (`pnpm exec tsx scripts/publish-pending.ts --plan`, exit 0)

The plan runs `assertCompatiblePeerRanges` over the whole public set (passed) and prints the closure order (dependency-first over `dependencies` and `peerDependencies`). All 40 are `pending` at 0.7.0, in this order:

```
pending          @jini-ai/protocol@0.7.0
pending          @jini-ai/core@0.7.0
pending          @jini-ai/agentic@0.7.0
pending          @jini-ai/ui-kit@0.7.0
pending          @jini-ai/platform@0.7.0
pending          @jini-ai/ui@0.7.0
pending          @jini-ai/db@0.7.0
pending          @jini-ai/commerce@0.7.0
pending          @jini-ai/agent-plugins@0.7.0
pending          @jini-ai/http-kit@0.7.0
pending          @jini-ai/cms@0.7.0
pending          @jini-ai/admin@0.7.0
pending          @jini-ai/oauth@0.7.0
pending          @jini-ai/integrations@0.7.0
pending          @jini-ai/agent-runtime@0.7.0
pending          @jini-ai/analytics@0.7.0
pending          @jini-ai/artifacts@0.7.0
pending          @jini-ai/capability-providers@0.7.0
pending          @jini-ai/diagnostics@0.7.0
pending          @jini-ai/chat@0.7.0
pending          @jini-ai/sidecar@0.7.0
pending          @jini-ai/cli@0.7.0
pending          @jini-ai/cookie-consent@0.7.0
pending          @jini-ai/daemon@0.7.0
pending          @jini-ai/desktop-host@0.7.0
pending          @jini-ai/devops@0.7.0
pending          @jini-ai/infra@0.7.0
pending          @jini-ai/mcp@0.7.0
pending          @jini-ai/memory@0.7.0
pending          @jini-ai/plugin-catalog@0.7.0
pending          @jini-ai/plugins@0.7.0
pending          @jini-ai/provider-plugins@0.7.0
pending          @jini-ai/registry@0.7.0
pending          @jini-ai/sandbox@0.7.0
pending          @jini-ai/search@0.7.0
pending          @jini-ai/server@0.7.0
pending          @jini-ai/sqlite@0.7.0
pending          @jini-ai/user-management@0.7.0
pending          @jini-ai/vibecoding@0.7.0
pending          @jini-ai/cms-forms@0.7.0

40 of 40 package(s) to publish.
```

`--plan` does not pack. To get the pack checks, a scratch driver (not committed) called the script's own exported `preparePluginRelease` for those 40 in that order. That function is what a real run does before uploading: `pnpm pack` for each package (with prepack, so provider-plugins rebuilds and plugin-catalog regenerates), then publish-pending's `packAndCheck` on each tarball (no `workspace:` range, `assertPackedExports` (exports resolve inside the tarball), no `.map`, no compiled tests), then `checkPluginReleaseConsistency` of the packed catalog against the packed provider-plugins and agent-plugins archives. No upload. Result, exit 0 (`pack-checks.txt`):

| Package | files | workspace: | .map | tests | packed exports |
| --- | --- | --- | --- | --- | --- |
| `@jini-ai/protocol@0.7.0` | 28 | none | 0 | 0 | resolve |
| `@jini-ai/core@0.7.0` | 268 | none | 0 | 0 | resolve |
| `@jini-ai/agentic@0.7.0` | 110 | none | 0 | 0 | resolve |
| `@jini-ai/ui-kit@0.7.0` | 69 | none | 0 | 0 | resolve |
| `@jini-ai/platform@0.7.0` | 232 | none | 0 | 0 | resolve |
| `@jini-ai/ui@0.7.0` | 1486 | none | 0 | 0 | resolve |
| `@jini-ai/db@0.7.0` | 219 | none | 0 | 0 | resolve |
| `@jini-ai/commerce@0.7.0` | 181 | none | 0 | 0 | resolve |
| `@jini-ai/agent-plugins@0.7.0` | 590 | none | 0 | 0 | resolve |
| `@jini-ai/http-kit@0.7.0` | 56 | none | 0 | 0 | resolve |
| `@jini-ai/cms@0.7.0` | 574 | none | 0 | 0 | resolve |
| `@jini-ai/admin@0.7.0` | 763 | none | 0 | 0 | resolve |
| `@jini-ai/oauth@0.7.0` | 74 | none | 0 | 0 | resolve |
| `@jini-ai/integrations@0.7.0` | 236 | none | 0 | 0 | resolve |
| `@jini-ai/agent-runtime@0.7.0` | 288 | none | 0 | 0 | resolve |
| `@jini-ai/analytics@0.7.0` | 28 | none | 0 | 0 | resolve |
| `@jini-ai/artifacts@0.7.0` | 24 | none | 0 | 0 | resolve |
| `@jini-ai/capability-providers@0.7.0` | 60 | none | 0 | 0 | resolve |
| `@jini-ai/diagnostics@0.7.0` | 94 | none | 0 | 0 | resolve |
| `@jini-ai/chat@0.7.0` | 445 | none | 0 | 0 | resolve |
| `@jini-ai/sidecar@0.7.0` | 30 | none | 0 | 0 | resolve |
| `@jini-ai/cli@0.7.0` | 36 | none | 0 | 0 | resolve |
| `@jini-ai/cookie-consent@0.7.0` | 56 | none | 0 | 0 | resolve |
| `@jini-ai/daemon@0.7.0` | 284 | none | 0 | 0 | resolve |
| `@jini-ai/desktop-host@0.7.0` | 139 | none | 0 | 0 | resolve |
| `@jini-ai/devops@0.7.0` | 184 | none | 0 | 0 | resolve |
| `@jini-ai/infra@0.7.0` | 30 | none | 0 | 0 | resolve |
| `@jini-ai/mcp@0.7.0` | 170 | none | 0 | 0 | resolve |
| `@jini-ai/memory@0.7.0` | 22 | none | 0 | 0 | resolve |
| `@jini-ai/plugin-catalog@0.7.0` | 5 | none | 0 | 0 | resolve |
| `@jini-ai/plugins@0.7.0` | 134 | none | 0 | 0 | resolve |
| `@jini-ai/provider-plugins@0.7.0` | 245 | none | 0 | 0 | resolve |
| `@jini-ai/registry@0.7.0` | 38 | none | 0 | 0 | resolve |
| `@jini-ai/sandbox@0.7.0` | 53 | none | 0 | 0 | resolve |
| `@jini-ai/search@0.7.0` | 35 | none | 0 | 0 | resolve |
| `@jini-ai/server@0.7.0` | 34 | none | 0 | 0 | resolve |
| `@jini-ai/sqlite@0.7.0` | 6 | none | 0 | 0 | resolve |
| `@jini-ai/user-management@0.7.0` | 228 | none | 0 | 0 | resolve |
| `@jini-ai/vibecoding@0.7.0` | 58 | none | 0 | 0 | resolve |
| `@jini-ai/cms-forms@0.7.0` | 24 | none | 0 | 0 | resolve |

Catalog consistency against the packed archives: passed. Peer ranges: compatible. After packing, `git status` was clean, so prepack's rebuild and regeneration reproduce the sealed catalogs byte for byte.

## Gates (Jini, after all commits)

| Gate | Result | Raw |
| --- | --- | --- |
| `pnpm install` | exit 0 (baseline and after version) | `jini-install.txt`, `jini-install-post.txt` |
| `pnpm --no-bail -r build` | exit 0 on the unmodified tree, and exit 0 at 0.7.0 | `jini-build.txt`, `jini-build-post.txt` |
| plugin-catalog `generate` + `test` | exit 0, 66/66 | `catalog-generate.txt`, `plugin-catalog-test.txt` |
| provider-plugins `distribution-manifest.test.ts` | 2/2 | (run inline) |
| `pnpm guard:plugins` | exit 0 | `guard-plugins.txt` |
| `pnpm guard:plugins:packed` | exit 0 | `guard-plugins-packed.txt` |
| `pnpm check:cross-package` | exit 0, "XP1–XP5 clean" | `check-cross-package.txt` |
| `publish-pending.ts --plan` | exit 0, 40 of 40 pending | `publish-plan.txt` |
| pack + tarball checks (above) | exit 0, 40 packed | `pack-checks.txt` |

XP baseline as in `cloud/reports/fix-1110.md`: a separate `git worktree` at `35c4961af718f0f30591c46d2ea2756c4484a731`, frozen install (0), core build (0), recursive build (0), `--write-baseline /home/user/xp3-baseline` → **3308 source mappings**, the same count as FIX-1110 (`xp3-*.txt`). The gate ran with `JINI_DECLARATION_BASELINE_DIR` set to that snapshot. Without the variable it fails with "absolute JINI_DECLARATION_BASELINE_DIR required", which is the expected setup error, not a finding.

`pnpm guard` (the full guard) was not run; the brief did not list it.

## Tovu

- `apps/desktop/package.json` 0.1.30 → 0.1.31. The 0.1.30 bump (`bab8d746`) changed only that file, the release note, a report and a root `package.json` override that tracks the Jini range. That override is a Jini dependency range, so it is left for the coordinator.
- `apps/desktop/package-lock.json` still says 0.1.30 in its own two version lines. In the last release that moved in the post-publish lockfile commit (`8d3fe13e`), and lockfiles are out of scope here, so it is left for the same step.
- Release note: `apps/desktop/RELEASE-NOTES-0.1.31.md`, next to the earlier ones.
- No Jini dependency range or lockfile changed.

## Left for the coordinator

- Publish Jini 0.7.0 from `cloud/integ-1110` (40 packages, order above).
- Then move Tovu's `@jini-ai/*` ranges to `^0.7.0`, update the root `overrides` keys, and refresh the lockfiles (root, admin, desktop, site-chat). This also sets the desktop lockfile's own version to 0.1.31.
- The local worktree `/home/user/xp3-src` (baseline source) is still registered in the container's Jini clone. It is not pushed anywhere.

RELEASE-PREP DONE
