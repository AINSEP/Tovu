# Handoff — 2026-09-10, session `tovu-ac` → next session

Read this whole file before acting. It supersedes `2026-09-10-deploy-handoff.md` (written by `tovu-ad`,
now ended) wherever they disagree — several of that file's claims were tested and found wrong; those
corrections are recorded below.

---

## THE ONE THING STILL BLOCKING EVERYTHING

**`tovu.fly.dev` still serves the 2026-09-03 image.** Prod is healthy (200) but stale.

`main` is **23 commits behind** `restructure/apps-website-phased`, and 0 ahead — a clean
fast-forward. Verify with `git rev-list --left-right --count origin/main...HEAD` (left must be 0).

**The build blocker itself is believed FIXED but has never been proven in CI.** See "Deploy" below.

---

## STATE OF THE TREE

- Branch `restructure/apps-website-phased`, 23 commits ahead of `origin/main`.
- `apps/admin` tsc: **0**. Scoped vitest across panels/nav-wiring/workspace/settings/plugins/providers/media: green (351/351 on the last full sweep).
- `apps/admin` working tree: **clean**.
- `apps/website` working tree: **NOT clean** — five files were already modified when this session
  started and are **not mine**; I never touched them. Do not assume they are safe to commit:
  ```
  apps/website/src/assistant/tool-registrations.ts
  apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  apps/website/src/features/agent-plugins/activation.ts
  apps/website/src/features/agent-plugins/tool-registrations.ts
  apps/website/src/features/agent-plugins/__tests__/unit/activation.unit.test.ts
  ```
  Find out whose they are before touching them.

---

## WHAT LANDED (23 commits, none pushed)

| commit | what |
|---|---|
| `c25d824f` | dropped "not by Tovu" from the federated tool-description prefix (owner's call) |
| `eb35cad2` | corrected a FALSE claim in a styles.css comment |
| `917a4351` | re-grounded that comment after its cited example was deleted |
| `754b69af` | `showPageHeader` prop — kills the doubled heading on the Workspace tab |
| `bcf70d17` | Workspace folded into Settings as its 10th tab; `/admin/workspace` redirects |
| `14f94e9c` | per-server Tools modal replaces the Connection/Tools TabBar; `showTitle` prop |
| `1039d694` | dropped duplicate media-provider modules left in `features/providers` |
| `1f80ce6b` | tab-row spacing 44.8px → 24px; Recovery ack checkbox green → accent orange |
| `065c3d39` | Add-Ons group; Providers→Integrations absorbing APIs & Webhooks; External Providers tab on Media |
| `341938e8` | plugin file viewer wraps by default; "Tovu Deploy Fly" → "Fly.io Deploy" |
| `44ee915d` | (coordinator checkpoint — rescued an unresponsive agent's 9 uncommitted files) |
| `06375f84` | Chrome autofill fix on the Composio key field + Supabase key stub |
| `f9e57657` | Agent Plugins aligned flush with sibling screens |
| `f164cd53` | Authentication taken out of the UI card |
| `b6402a65` | nav restructure + "APIs & Webhooks" label (4th attempt; earlier three never landed) |
| `2815f643` | **@jini-ai/ui, chat, admin → 0.3.7 + Tovu pins + 4 lockfiles — THE DEPLOY BLOCKER** |
| `f68abe68` | plugin source catalog: the remaining three active plugins |
| `c3c33369` | plugin source catalog: site-compliance |
| `5f7febc1` | agentic → 0.3.6 (necessary but not sufficient) |
| `7bd61706` | ghcr.io image publish workflow (never run) |

---

## 1. DEPLOY — NOT DONE. Highest priority.

### What was actually wrong, and what fixed it

Nine `@jini-ai/*` packages were published at 0.3.6. Bumping Tovu's **top-level** `agentic` pin did
not fix the build, because three published 0.3.6 manifests carried an **exact** pin back to the OLD
`agentic@0.3.0`:

```
ui@0.3.6     -> agentic 0.3.0            <- the actual importer in the rollup error
chat@0.3.6   -> agentic 0.3.0, ui 0.3.6
admin@0.3.6  -> agentic 0.3.0, ui 0.3.6
```

Root cause: these are pnpm workspace packages whose manifests say `workspace:*`. `pnpm publish`
rewrites that to the **then-current local version at pack time**. They were packed while `agentic`
still read 0.3.0, freezing it. **Republishing a dependency does NOT retroactively fix an
already-published dependent's manifest.**

Fixed by republishing `ui` → `chat` → `admin` at **0.3.7** in that order (chat and admin pin ui
exactly, so ui had to be on the registry and verified first), then bumping Tovu's pins in **four**
manifests and regenerating four lockfiles. All verified from the registry, not from publish output.

### What to do

1. **Re-scan for secrets.** The only scan that returned GO covered **4** commits. There are 23.
   The repo is PUBLIC. Do not push without scanning the other 19.
2. `git push origin HEAD:main` (clean fast-forward).
3. Watch: the `jini-published-typecheck` gate runs ~1 min, then `fly-deploy` ~6.5 min.
4. Acceptance: run completes `success`, `https://tovu.fly.dev/health` returns 200, and the admin
   shows the **Site Token tab** (added 2026-09-09, never yet deployed).

### The owner wanted the CHAT-DRIVEN deploy, and it is still unattempted

She chose to deploy through the assistant panel (`tovu-deploy-fly` plugin) rather than a plain push,
because that path is the product feature she wants to demo.

**Critical point she and I established late: the chat plugin TRIGGERS the workflow, it does not move
code.** Pointing it at `main` today rebuilds the stale tree. So either push to `main` first, or
dispatch `fly-deploy.yml` against `restructure/apps-website-phased` (it has `workflow_dispatch`,
which can target any ref) — in which case `main` stays behind and prod runs code that is not on the
default branch.

My recommendation, not yet accepted or rejected: **push to main first, then run the chat path as a
rehearsal against a tree that already builds** — so "is the build fixed" and "does the plugin
composition work" fail separately rather than together.

### Chat-deploy procedure (from `tovu-ad`, unverified by me)

Admin → assistant panel (floating button bottom-right) → Conversations icon → existing
"Deploy This Tovu Instance Fly.io" thread. The plugin's Step 0 refuses to guess four facts —
**I verified all four against source**:

```
fly.toml:46  app = "tovu"
fly.toml:47  primary_region = "iad"   (comment still calls it a PLACEHOLDER; prod has served from it for a week)
fly.toml:67  volume source = "tovu_sites" -> /workspace/Tovu/sites
repo         leonaburime-ucla/Tovu
```

**Unproven risk:** `a6264465` split `tovu-deploy-fly`, moving all GitHub knowledge into a new bundled
`github` plugin. `plugin.json` has **no dependency field** — I checked its keys: `$schema, author,
description, keywords, license, name, version`. So the two plugins are linked by **prose only**, and
the composition has never completed a deploy end to end. If it stalls, "the two plugins didn't
compose" is a first-class hypothesis, not an excuse.

**A 204 dispatch means QUEUED, not deployed.** Confirm against the actual run.

---

## 2. COMPOSIO KEY IS NOT WORKING — owner's next task

The owner says the Composio API key is not working and intends to **regenerate it and test**.
She wants this done in the next session.

**Read this before debugging it as a bad key:** commit `06375f84` fixed a Chrome autofill bug on
exactly this field. `ComposioKeyField.tsx` had `autoComplete="off"`, and **Chrome deliberately
ignores `off`** — it was stuffing a saved password into the API-key field. The app then sends that
string to the vendor, the vendor rejects it, and the operator sees a genuine-looking "invalid key"
error for a key that was never tested.

So: the fix is in, but **any key she tested BEFORE `06375f84` may never have been sent at all.**
Re-test the existing key on the fixed field before concluding it is dead. If it still fails,
regenerating is the right next step.

Field is at `/admin/providers?tab=composio` — note the tab moved; see §3.

---

## 3. ADMIN NAV — RESTRUCTURED THIS SESSION (so old paths in older docs are stale)

```
ADD-ONS
  Plugins
  Agent Plugins
  Integrations        (route id stays `providers`)
      External MCP | Composio | MCP Server | Webhooks

/admin/media          All | Images | Videos | External Providers
Settings              ... 10 tabs, Workspace added before About
```

- `/admin/integrations` **redirects** to `/admin/providers?tab=webhooks`. `/admin/integrations/:id`
  (deliveries drill-down) still renders directly.
- `/admin/workspace` **redirects** to `/admin/settings?tab=workspace`.
- **Route ids did not move.** The row labelled "Integrations" has id `providers`; the id literally
  called `integrations` is the retired one. This is deliberate and matches the file's existing
  convention (`id: "access-tokens"` is labelled "Secrets").
- Nav labels are localized across **21 locales** in `lib/admin-nav-i18n.ts`; a copy string IS its own
  i18n key.

---

## 4. NOT DONE / OPEN

**Owner-discussed, never dispatched:**
- Consolidating **Collections, Menus, Widgets, Categories & Tags** into one Content sub-item. I
  recommended the name **"Structure"** (those four are the only Content items that are not content —
  they arrange it). She has not accepted or rejected it. Touches `panels.tsx` + 21 locales.

**Verified-but-unrun:**
- **ghcr.io image workflow** (`7bd61706`) has never executed. And
  `gh api repos/leonaburime-ucla/Tovu/actions/permissions/workflow` returns
  `{"default_workflow_permissions":"read"}`. Whether the workflow's explicit `permissions: packages: write`
  elevates past that repo default, or is capped by it, **decides whether the first publish 403s**. I
  did not assert which. The honest test is one `workflow_dispatch` run once it is on `main`. Do not
  record the image ref as *available* in `machines-api-path.md` until a run goes green.
- Image refs, once it works: `ghcr.io/leonaburime-ucla/tovu:<40-char-sha>` (use this in `config.image`)
  and `:latest` (do not). Note the **lowercase** `tovu` — GHCR rejects the repo's capital T.

**Known and deliberately accepted:**
- `@jini-ai/sqlite@0.3.0` (the only published version) pins `chat@0.3.0`, which drags a nested
  `agentic@0.3.0` into the ROOT lockfile only. `apps/admin`, `apps/site-chat`, `apps/desktop` are
  clean. `sqlite` is imported by `apps/website` source, so the root build now has `chat@0.3.7` and
  `chat@0.3.0` side by side — a skew that did not exist before. The rollup failure we fixed was in
  the admin bundle, which is clean; the residual risk is **tsc type identity across duplicate package
  instances**, not a missing export. **Owner's call: let the 1-minute CI gate decide.** If the gate
  fails on this, republishing `sqlite` is the fix.
- Settings has **no working dark mode** — its Dark/System controls are inert and it pins
  `data-theme="light"`. Pre-existing, owner's 2026-09-06 decision. Workspace nested inside it does
  NOT regress, because Tovu's own tokens redefine at `:root[data-theme="dark"]` and ignore a non-root pin.
- Agent Plugins dark mode has pre-existing invisible text. Untouched.
- `SettingsDialogShell`'s grid clip affects **8 other screens**; only Recovery/Plugins were fixed.
  The real fix is a `flat`/`chromeless` prop upstream in `@jini-ai/ui`, not a third per-screen CSS override.
- `SourceConfigItemCard` (Jini) has no actions slot, which is why the Tools button renders as a Tovu
  sibling. Clean fix is an optional `actions?: ReactNode` prop. Not filed anywhere.
- One new sentence in `providers-i18n.ts` (the merged screen's page description) was translated by an
  agent into 21 locales and is **lower-confidence** than the reused strings. Worth a native check.
- Deliveries drill-down has no sidebar highlight now that its nav row is gone. Documented tradeoff.

**Deferred by the owner earlier, still deferred:**
- Login needs two tabs: Website first, then Admin.
- The green "Fast restore" pill reads as *safe* when it means *cheap*.
- The disabled `ci.yml` has the same missing-`packages/sdk`-build gap; it will false-positive if enabled.

---

## 5. PREMISES TO RE-VERIFY, NOT INHERIT

Everything below was believed true and turned out false **this session**:

1. **`pnpm publish -C <jini-path>` "works with no credential"** — only when the working directory is
   INSIDE Jini. `-C` changes the package dir, NOT where npm resolves config. Run from Tovu's cwd,
   `npm config get userconfig` returns `~/.npmrc` (2FA-bound) and Jini's automation token is never
   read → `EOTP`, which looks exactly like a 2FA wall. Fix:
   `NPM_CONFIG_USERCONFIG=/Users/la/Programming/Jini/.npmrc pnpm publish -C ... --no-git-checks --access public`
2. **`npm view <pkg> versions` gives FALSE NEGATIVES.** The packument's `versions` array lags behind
   a direct `<pkg>@<version>` lookup — they are served from different caches. Use
   `npm view <pkg>@<version> dependencies --json`; it confirms existence AND the thing you care about.
   An agent idled twice waiting on the stale field.
3. **The card-chrome "regression" on Agent Plugins was not one.** It was the owner's own approved
   change (`82622870`, "drop the outer card"). The real defect was alignment — and both symptoms had
   one cause: zeroing the shell's outer chrome while leaving its inner padding, which then stacked on
   the page's own.
4. **`tovu-ad`'s nested-pin list was wrong in both directions** — it missed `ui` (the actual importer;
   fixing only `chat` would have changed nothing) and invented `sqlite@0.3.6`, which does not exist.
   Its method was the bug: it read nested pins from the LOCAL lockfile, which resolves through the
   Jini symlinks. **The local tree cannot tell you what a Docker `npm install` will do.**
5. **`kill` is NOT blocked by the harness.** An older note said to ask the owner to run kills herself.
   `kill -TERM <pid>` returned exit 0. Memory corrected.
6. **Instantaneous `%CPU 0.0` is not evidence of a stall.** A publish showing 0.0% had consumed 1:02
   of CPU over 2:46 wall — it was working. Read cumulative `TIME`, not `%CPU`. I called it hung and
   was wrong.
7. **The Jini `ByokProviderForm` autofill bug is already fixed** and ships in the published
   `ui@0.3.7` dist (verified by unpacking the tarball). An older memory said otherwise.

---

## 6. HOUSE RULES THAT BIT US, WITH ONE CORRECTION

- **Put the pathspec on the COMMIT, not just the `git add`:**
  `git commit -F <uniquely-named-msg-file> -- <explicit paths>`. A bare `git commit` takes whatever
  is in the shared index. This fired **four times** today; twice it went unnoticed until after the
  fact, and once four renamed files landed inside an unrelated commit. Then `git show --stat` your
  own commit and READ it — that is the only reason any of them were caught.
- Never `git add -A`/`.`, never `git stash`, never revert a file you did not write.
- **A move is not committed until its deletions are.** `065c3d39` committed the additions of a file
  move but left the deletions staged, so HEAD carried duplicate modules while the working tree looked
  clean. Check `git ls-tree -r HEAD <dir>` after any move.
- **Mid-flight messages to running agents fail silently.** Several never arrived. Require a one-line
  acknowledgement in every dispatch, and if an agent has not acked, assume it has not heard you.
- **In-process teammates have no OS process** — you cannot `ps` them. Use file mtimes, commit
  activity, and an explicit ack instead.
- `apps/website` tests run from the repo **ROOT**; `apps/admin` from `apps/admin`. Never unscoped.
- `apps/admin` tsc baseline is **0** and it DOES typecheck test files. No `check:boundaries` there.
- Saves under `apps/admin/src` full-reload the admin and **destroy a live chat run** — so the
  chat-driven deploy cannot run while any agent is editing that tree.
- Saves under `apps/website/src` kill the agent daemon (respawns ~3s). The daemon reads plugin config
  at **START**, so any plugin edit needs a respawn.
- Several agents ran against one dev server; one agent's normal mid-refactor state white-screened the
  admin for everyone. Expect it, and check whether a "broken app" is someone else's uncommitted state
  before debugging it.

---

## 7. THE OWNER

Wants terse replies and hates being asked to run commands the assistant could run. Uses voice
dictation, so proper nouns garble. Wants work done by **subagents**, not by the coordinator directly —
she said so explicitly this session. She is fine with small coordinator-level commits (rescuing an
agent's uncommitted work, a two-word string edit) but not with the coordinator doing implementation.

Corrections she or the work issued to me today: I over-relied on a peer's relayed claim about what she
wanted; I reported an agent as hung on a misread signal; I told an agent a tree was exclusively its own
and then dispatched another agent into the same directory.
