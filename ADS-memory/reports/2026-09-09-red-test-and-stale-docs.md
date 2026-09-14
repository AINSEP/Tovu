# RED test fix + stale docs — 2026-09-09

Three independent items, three commits, on `restructure/apps-website-phased`.

## 1. RED test: `bundled-inactive-gating.integration.test.ts`

**Before**: 5 pass / 1 fail. `re-seeding is idempotent` failed with `actual: 2, expected: 1`
at the `digests.length` assertion.

**Cause confirmed**: `layout.forWorkspace(WORKSPACE_ID).packages` (`<root>/packages/sha256/`)
is one flat, content-addressed directory shared by every bundled plugin in the workspace, not
scoped per plugin (`layout.ts`). The old assertion did a raw `readdir` count against that shared
directory. Adding `tovu-deploy-fly` as a second bundled plugin means a correct re-seed now
legitimately produces 2 digest directories (one per plugin), not 1 — the product is fine, the
assertion's premise ("this directory only ever holds this one plugin's digest") was already
false before this pass and just hadn't been exercised yet.

**Fix**: replaced the raw digest count with `listInstalledPlugins(packages)` (already imported
and used by "test 1" in the same file) filtered to `pluginId === PLUGIN_ID`, asserting that
filtered list has length 1. This answers "did site-compliance specifically get a second digest
published for it" regardless of how many other bundled plugins share the directory — survives a
third, fourth, etc. bundled plugin without needing another bump.

**After**: 6/6 pass.

Commit: `526681b7` — `test(agent-plugins): scope re-seed digest count to the plugin under test`

## 2. `tovu-deploy-fly` SKILL.md — stale `TOVU_INTEGRATIONS_ROOT_KEY` guidance

Verified against `git show ddfa5e07` (full diff read, not just the subject line). That commit:
- Added `hasMissingIntegrationsRootKey` to `production-readiness-gate.ts`, wired from
  `process.env.TOVU_INTEGRATIONS_ROOT_KEY` via `boot-readiness-gate.ts`.
- Reclassified `TOVU_INTEGRATIONS_ROOT_KEY` from `"recommended"` to `"boot-blocking"` in
  `deploy-config.ts`'s `REQUIRED_SECRETS`.
- A production boot with the var unset now refuses with `PRODUCTION_BOOT_UNSAFE_DEFAULT`
  (`missing-integrations-root-key`) instead of booting and silently minting a fresh key.

The SKILL.md (`content/agent-plugins/tovu-deploy-fly/skills/tovu-deploy-fly/SKILL.md`) still
said, verbatim, "Not boot-blocking — and that is the danger... Nothing fails at boot. Something
much worse happens quietly" — exactly the behavior the fix removed. Corrected:

- Rule 3's secrets table: `TOVU_INTEGRATIONS_ROOT_KEY` row now says "Boot-blocking", names the
  real gate check and error code.
- Rule 4 (heading + body): rewritten to lead with "must be set before the first deploy, or the
  boot refuses" and the `PRODUCTION_BOOT_UNSAFE_DEFAULT` code, made prominent per the dispatch
  ("read it before Step 4"). The old file-fallback/silent-rekey mechanism is kept as *history*
  explaining why the check exists, not described as current behavior. Added the concrete
  prerequisite command:
  ```
  fly secrets set TOVU_INTEGRATIONS_ROOT_KEY=$(openssl rand -hex 32) -a <app>
  ```
  (used `<app>` to match this file's own existing placeholder convention — Step 0 already treats
  the fly app name as an operator-supplied placeholder, so a literal app name didn't belong here.)
- Step 4's summary sentence ("the two boot-blocking ones fail loudly; Rule 4's fails silently")
  updated — all three are now boot-blocking; the remaining real risk is a *rotated* key, which the
  gate genuinely cannot distinguish from "never configured".

Did not invent any other behavior claims beyond what `ddfa5e07`'s diff shows.

Commit: `1ffbbccc` — `docs(agent-plugins): correct tovu-deploy-fly's stale TOVU_INTEGRATIONS_ROOT_KEY guidance`

### Follow-up: 1ffbbccc broke a unit test that asserted the OLD three-way distinction

Flagged by a peer (`build-higgsfield-plugin`):
`bundled-tovu-deploy-fly-package.unit.test.ts`, test "SKILL.md keeps secrets out of fly.toml and
names all three, with their real blocking status", asserted `/Not boot-blocking/i` — text that
existed only because the old SKILL.md called `TOVU_INTEGRATIONS_ROOT_KEY` non-boot-blocking. Once
the doc was corrected, that phrase legitimately no longer appears. Reproduced 12/13 pass first.
Fixed by asserting the new invariant instead of relaxing the check away: all three named as
`Boot-blocking`, `Not boot-blocking` now asserted ABSENT, and the `undecryptable` rotation warning
kept (that hazard is real and distinct from what the boot gate closes). 13/13 pass after.

Commit: `4d8421de` — `test(agent-plugins): update tovu-deploy-fly's secrets-table test for the boot-blocking fix`

## 3. `fly.toml` header — stale remote claim

Verified both parts myself before editing:

- `git remote -v`: only remote is `origin` -> `https://github.com/leonaburime-ucla/Tovu.git`
  (confirmed via `.git/config` too). The header claimed "this checkout's only remote is the
  private working repo `leonaburime-ucla/Tovu-AI-CMS`" — false; `origin` is now the same public
  mirror repo the deploy workflow actually runs from. (Also confirmed the header's other claim,
  "the mirror's HEAD `e75cd098` does not exist in this tree at all," is now false too —
  `git cat-file -t e75cd098` returns `commit` — though the dispatch only asked about the remote
  claim, so I limited the rewrite to what's actually stale rather than re-litigating everything.)
- The `-a tovu-ai-cms` vs `app = "tovu"` claim: checked `.github/workflows/fly-deploy.yml`
  directly. Its setup **comments** (steps 2 and 4) already say `-a tovu`, matching `fly.toml` —
  no discrepancy there. The actual `tovu-ai-cms` reference is `concurrency.group:
  fly-deploy-tovu-ai-cms` (line 87) — **live config**, not a comment. Per the dispatch's own
  instruction, did NOT touch it.

Corrected `fly.toml`'s header prose to state the remote accurately, keep the still-true parts
(the file/workflow exist only on `restructure/apps-website-phased`, not `main`, which is the
`push:`-trigger branch), and drop the now-false "gh answers about the wrong repo" warning. No
config value (`app`, `[[mounts]]`, `[env]`, etc.) changed — diffed the file after editing to
confirm the change is comment-only.

Commit: `38f036fa` — `docs(deploy): correct fly.toml's stale remote-repo header comment`

## Config discrepancy found, deliberately NOT changed

`.github/workflows/fly-deploy.yml:87` — `concurrency: group: fly-deploy-tovu-ai-cms`. This is a
live GitHub Actions concurrency-group key, misleadingly named after the old `tovu-ai-cms` app
(the actual fly app is `tovu`, per `fly.toml`). It's harmless as-is (the string just needs to be
stable and unique to work as a concurrency key, and it is), but it's a naming leftover the owner
may want renamed to `fly-deploy-tovu` for clarity. Flagging per the dispatch's instruction rather
than changing it myself — it's live config, and the workflow file itself was out of this
dispatch's edit scope.

## Verification

- `npx tsc -p tsconfig.json --noEmit` — exit 0, before and after all four commits.
- Item 1's test file re-run explicitly (6/6 pass) after the fix; no other test files touched.
- Follow-up test fix re-run explicitly (13/13 pass) after the fix.
- No `git add -A` used; each commit staged its one explicit file path.

## Commits (4, not 3 — one follow-up)

- `526681b7` — item 1, RED test fix.
- `1ffbbccc` — item 2, SKILL.md correction.
- `38f036fa` — item 3, fly.toml header correction.
- `4d8421de` — follow-up: fixed the unit test 1ffbbccc's own correction broke, flagged by a peer.
