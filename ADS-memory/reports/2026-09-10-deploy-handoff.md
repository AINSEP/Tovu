# Handoff — 2026-09-10, Tovu deploy + admin nav work

Written by session `tovu-ad` for the incoming peer session. Read this whole file before acting.

## THE ONE THING BLOCKING EVERYTHING

**Getting `leonaburime-ucla/Tovu@main` to deploy to Fly so the owner can demo tovu.fly.dev.**
Prod is currently HEALTHY (200) but serving the **2026-09-03** image. Every failed deploy so far left
prod untouched — a failed build never swaps the machine.

### Current state of the deploy chain

- `origin` IS the deploy repo (`https://github.com/leonaburime-ucla/Tovu.git`). There is NO separate
  mirror to sync — an older memory claiming two disjoint repos is WRONG and has been corrected.
- `.github/workflows/fly-deploy.yml` triggers on `push: branches: [main]` + `workflow_dispatch`.
  Committing or pushing any other branch deploys nothing.
- `main` can fast-forward from `restructure/apps-website-phased` (verify with
  `git rev-list --left-right --count origin/main...HEAD` — left must be 0).
- `ci.yml` is `disabled_manually` and full of red/report-only gates. Leave it off.

### Deploy attempts tonight, and what each taught

| run | outcome | cause |
|---|---|---|
| 34412312961 | failed 15s | Fly token was `root banned`. Fixed by another session. |
| 34501346139 | **success** | Redeploy of the same commit — proved the chat/agent-plugin path works. |
| 34506663942 | failed | 102 TS errors: Tovu depended on **unpublished** `@jini-ai/*` source. |
| 34511570890 | gate failed | New gate false-positived: it never built `packages/sdk`. Fixed in `c9f856af`. |
| 34512029902 | gate PASSED, **deploy failed** | rollup: `"agentHandleProps" is not exported by @jini-ai/agentic` |

## THE ROOT CAUSE YOU MUST UNDERSTAND

`node_modules/@jini-ai/*` in Tovu are **symlinks** into `/Users/la/Programming/Jini/packages/*`.
Local typecheck therefore compiles against live local Jini source. The Docker build runs
`npm install` and pulls **published** tarballs. So local green ≠ CI green.

**Version strings do NOT track content in the Jini workspace.** Several packages had a local version
*lower* than npm's while containing *newer* code. Never conclude "in sync" from a version match —
unpack the published tarball and grep for the symbol.

### Published tonight, all verified against the registry (not the `+` line)

`agent-runtime, daemon, http-kit, ui, chat, cms, integrations` → **0.3.6**
`admin` → **0.3.6** (8th, needed `DataTableSortState`/`DataTableSortDirection`)
`agentic` → **0.3.6** (9th, needed `agentHandleProps`)

**TRAP:** `pnpm` printed `+ @jini-ai/ui@0.3.6` for a publish the registry never accepted. It went
undetected until an agent re-checked. **Always verify with `npm view <pkg>@<version> version`, and for
export gaps unpack the tarball.** Registry visibility can also lag a few minutes — recheck, don't assume.

### Publishing is now frictionless — do it yourself

`/Users/la/Programming/Jini/.npmrc` previously held a **2FA-bound** token that outranked the
2FA-exempt automation token, causing `EOTP`. The owner replaced it with the automation token
(backup at `.npmrc.bak-2fa`). This command is allowlisted and works with no credential in the command:

```
pnpm publish -C /Users/la/Programming/Jini/packages/<name> --no-git-checks --access public
```

**CORRECTED 2026-09-10 by tovu-ac — the command above is NOT unconditional.** `pnpm publish -C <jini-path>`
changes the *package* directory but NOT where npm resolves config from. Run with cwd in Tovu,
`npm config get userconfig` returns `~/.npmrc` (2FA-bound) and Jini's project `.npmrc` is never read —
which is what produced the EOTP. It was never a 2FA wall. The fix is to point config at Jini explicitly:

```
NPM_CONFIG_USERCONFIG=/Users/la/Programming/Jini/.npmrc pnpm publish -C /Users/la/Programming/Jini/packages/<name> --no-git-checks --access public
```

(My own `--dry-run` appearing to authenticate from cwd=Tovu was weak evidence — a dry run does not
exercise the full publish auth path. Don't repeat that mistake.)

Rules: **`pnpm publish`, NEVER `npm publish`** (npm ships literal `workspace:*` and produces an
uninstallable package — that's how `http-kit@0.3.1` got burned). Publish leaf-first. Rebuild `dist/`
first with a scoped `pnpm --filter @jini-ai/<pkg> build`, never a repo-wide `pnpm -r build`.
**Do not put a token in a command line** — the classifier blocks it, correctly.

**READ PUBLISHED MANIFESTS, NOT THE LOCAL LOCKFILE.** Exact cross-pins mean republishing a dependency
does NOT fix its dependents: `ui@0.3.6` pinned `agentic@0.3.0`, so npm nested a stale copy right under
the importer that rollup died on. Diagnose with `npm view @jini-ai/<pkg>@<ver> dependencies --json`;
`npm ls` against the local tree resolves through the Jini symlinks and tells you nothing about what a
Docker `npm install` will do. I got this wrong mid-diagnosis and named the wrong packages.

Resolved 2026-09-10: `ui`, `chat`, `admin` republished at **0.3.7** (each pinning `agentic@0.3.6`;
chat/admin pinning `ui@0.3.7`), Tovu pins + all four lockfiles updated in `2815f643` — including
`apps/desktop/package.json`, a fourth manifest that was missed twice. Known residue: `sqlite@0.3.0`
(its only published version) pins `chat@0.3.0` exactly, dragging `agentic@0.3.0` in beneath it, in the
ROOT lockfile only — `apps/admin`'s is clean, so the rollup failure should be fixed. Owner's call is to
let the 1-minute CI gate decide rather than spend another publish cycle.

## IMMEDIATE NEXT STEP

Agent `jini-publish` was asked to:
1. Bump `@jini-ai/agentic` to `^0.3.6` + regenerate lockfiles (`npm install --package-lock-only`
   only — never touch node_modules or the symlinks).
2. Run a **real apps/admin vite build against registry-resolved packages** to enumerate ALL remaining
   `"X is not exported by Y"` errors in one pass, instead of discovering them one 6.5-minute deploy
   at a time.

**Why:** the CI gate typechecks, and tsc structurally CANNOT catch a missing runtime value export.
`check-jini-registry-drift` passing is not evidence the build will succeed.

Then: push `HEAD:main` and watch. Secret-scan the diff before any push — this repo is PUBLIC.

## LIVE SUB-AGENTS (leave them to finish)

- **`jini-publish`** — the agentic bump + export-gap enumeration above.
- **`integrations-nav`** — admin nav restructure (see below).
- **`github-plugin`** — creating a bundled `github` agent plugin, thinning `tovu-deploy-fly`.
- **`admin-ui-design`** — DONE (`7d223af6`, `4ead57d8`), verified in browser.

## OPEN WORK

### Admin nav restructure (owner-approved shape)

```
Integrations
  Providers         → tabs: Media | Composio | External MCP
  APIs & Webhooks   → tabs: MCP Server | Webhooks
  Plugins
  Agent Plugins
```

- Renames the `Add-Ons` group. Absorbs the loose `Integrations & API` row from Operations.
- `features/integrations/` is **webhooks** (outbound push), NOT external APIs — the label
  "External APIs" was considered and rejected as directionally backwards.
- "MCP" stays OFF the top-level nav; protocol jargon only on tabs.
- **Media Providers exists TWICE**: a LIVE tab at `/media?tab=media-providers` and a DEAD inert fake
  in Settings claiming "Tovu doesn't have a media-provider backend yet" (false). Decision: move the
  LIVE one, delete the fake, repoint `features/security/rules.ts:842`.
- Nav labels are localized across **20 locales** in `lib/admin-nav-i18n.ts`. A copy string IS its own
  i18n key here. Route ids are independent of labels — do not rename ids for a label change.

### Container image (approved direction, not started)

Publish a versioned Tovu image to **ghcr.io** (free for public images, same GitHub account/token).
This is the missing input for `machines-api-path.md` — that path is fully written and blocked only on
`config.image` having nothing to point at. It's what makes deploy work for users who installed Tovu
from npm and have no Tovu repo to build from. The Dockerfile is ALREADY generic enough (loops
`sites/*/content.seed.db`, wipes `sites/`, takes `TOVU_SITE`/`TOVU_SITE_DIR` from env).

### Noted, explicitly deferred by the owner

- Take Authentication out of the UI card.
- Login needs two tabs: **Website** first, then **Admin**.
- `SettingsDialogShell` grid clip affects **8 other screens**; only Recovery/Plugins were fixed.
- **NOT a regression, corrected 2026-09-10:** the "missing card" on Agent Plugins was not caused by
  `7d223af6`/`4ead57d8`. Measured computed styles across both widths, both themes, chat open and
  closed: `.agent-plugin-rows` keeps its border and 10px radius throughout, and `4ead57d8` doesn't
  touch Agent Plugins at all. The outer chrome was removed by `82622870` ("drop the outer card from
  Agent Plugins") — **the owner's own explicit request on 2026-09-09.** The real defect is alignment,
  not a missing card. I reported it as a likely regression on visual inspection alone; don't repeat that.
- Green "Fast restore" pill reads as *safe* when it means *cheap*.
- Agent Plugins dark mode has pre-existing invisible text.
- The disabled `ci.yml` has the same missing-`packages/sdk`-build gap; it'll false-positive if enabled.

## CONTENT CANNOT REACH A DEPLOYED SITE (confirmed by code search)

`hydrateContentDbFromSeed` gates on `existsSync(dbPath)` → `already-present`. **First boot only.**
No script, CLI, admin action, agent tool or env var can push updated local content onto a live volume.
Media is better off — `hydrateBlobStoreFromSeed` runs every boot, idempotent via `putIfAbsent`.
`npm run seed:site` produces the committable pruned `content.seed.db`; ~89% of the live 42MB
`content.db` is unreclaimed free pages, so pruning is about stripping SECRETS, not size.

## HOUSE RULES THAT BIT US TONIGHT

- Shared tree, multiple agents: **never `git add -A`, never `git stash`, never revert files you
  didn't write.** Stage explicit paths only.
- **Mid-flight SendMessage to a running agent is unreliable** — it silently did not arrive twice.
  For a correction that must land, stop and respawn, or re-send and confirm receipt.
- **A bare PID is not an identification.** An agent reported two "orphan vite" PIDs that were actually
  a 4-day-old Electron app from an unrelated project (`/Users/la/Programming/Zana`). Confirm with
  `ps -o comm` before naming or killing anything. The harness blocks `kill` — ask the owner.
- `apps/website` tests run from the repo ROOT; `apps/admin` from `apps/admin`. Never run an unscoped
  test command.
- `apps/admin` tsc baseline is **0** and it DOES check test files. It has no `check:boundaries`.
- No logic in `.tsx`; complexity ceiling 9.
- Saves under `apps/admin/src` full-reload the admin and destroy a live chat run. Saves under
  `apps/website/src` kill the agent daemon (respawns ~3s).
- Editing a bundled agent-plugin changes its digest; a plugin installed under two digests silently
  killed **every** plugin's tools. Per-plugin isolation landed in `c3632925`, but the supersession gap
  in the install path is still only patched on disk, not fixed in code.

## FILED: the agent-plugin supersession bug (root cause, unfixed)

`github` plugin is DONE and verified — all five plugins register with zero warnings, driven through
the daemon's real entry point `registerInstalledAgentPluginTools` (not just the loader, because the
daemon wraps that call in a fail-open try/catch that would swallow a wholesale throw).

**The bug:** `installAgentPlugin` (`apps/website/src/features/agent-plugins/install.ts:220-282`)
publishes to `packages/sha256/<digest>/` and returns. It never checks whether another digest already
holds the same `pluginId`, and nothing else retires one — `uninstall.ts` refuses bundled plugins
outright. So **every edit to a bundled plugin's source permanently strands its previous digest.**

**Severity:** `listInstalledPlugins` (`resolve-agent-plugin-refs.ts:160`) enumerates every digest dir;
`assertSingleDigestPerPlugin` (`tool-registrations.ts:320`) throws on the second digest for an id.
Before `c3632925` that throw aborted the whole load — one edited plugin took **every** plugin's tools
down. `c3632925` isolated it per-plugin (blast radius only); the cause is untouched.

**Fix goes in `installAgentPlugin`, after `publish()` + `freezeTree()` succeed.** Four things to get right:
1. **Retire on the dedup fast path too** (`install.ts:247-256` early-returns when `alreadyPublished`).
   Bundled seeding re-runs every boot, so the fast path is the common case — retire only on fresh
   publish and a broken workspace never self-heals.
2. **`chmod u+w` the stale root before moving it.** `freezeTree` sets `0o555` and this filesystem
   refuses to rename a read-only directory (`install.ts:266` documents the EACCES from the other
   direction). This is what blocked manual cleanup tonight.
3. **Move, don't delete.** VERIFIED: `5d6fcabc…` (site-compliance) and `f64f7a62…` (ui-ux-design) ARE
   git-tracked. They're safe only because they're currently the live digest — the moment someone edits
   `content/agent-plugins/site-compliance/`, an auto-delete would spontaneously produce a tracked-file
   deletion in everyone's working tree at boot. Move to `packages/superseded/<digest>/` instead;
   consumers only read `<root>/packages/sha256`. Separately decide whether those two should be tracked at all.
4. **Keep `assertSingleDigestPerPlugin`** — the fix reduces occurrence, the guard catches residue.
   Removing it trades a loud failure for a silent wrong-version pick.

Covers operator-installed upgrades too (v2 over v1 hits the identical path). Test to write in
`install.unit.test.ts`: install digest A for pluginId X, then digest B for the same X; assert only B
remains under `packages/sha256/` and that A was retired rather than deleted.

Current state: 5 plugins, 5 digests, stale ones moved to `packages/superseded-2026-09-10/` (reversible).

## THE OWNER

Wants terse replies and hates being asked to run commands the assistant could run. Uses voice
dictation, so proper nouns garble. Corrected me tonight for: dumping walls of text, over-gating on
permissions instead of diagnosing the allowlist, and reporting a publish as confirmed when I'd only
seen the tool's success line rather than the registry.
