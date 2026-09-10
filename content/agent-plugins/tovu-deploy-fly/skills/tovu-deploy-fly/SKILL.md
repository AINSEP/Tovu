---
name: tovu-deploy-fly
description: Deploy this Tovu instance to fly.io without the operator installing flyctl, Docker, or any other CLI. Encodes the Tovu-and-fly-specific rules that generic fly.io knowledge gets wrong — one machine only (SQLite), the volume shadowing the image's whole sites/ tree, secrets never in fly.toml, the sealed-credential master key, and the fact that deploying ships code and not content. The deploy runs through a GitHub Actions workflow, so flyctl only ever runs on GitHub's runner; every GitHub step it needs — writing the two files, the repository secret, the dispatch, following the run — belongs to the separate `github` plugin and is not repeated here.
---

# Deploying Tovu to fly.io

## The one thing to say before anything else

**Deploying ships CODE, not CONTENT.**

`sites/*/content.db` is in `.gitignore` (line 57). It is not in the repo, so it is not in the
build context, so it is not in the image, so it does not reach the server. The same is true of
`sites/*/chat.db` (`.gitignore` line 70).

An operator who deploys expecting to see the pages they just wrote in the admin UI **will not
see them.** Say this in your first reply, before you touch a file. Do not bury it in a summary
at the end, and do not soften it — being wrong about this costs them a confused hour and,
if they then "fix" it by overwriting the volume, their actual content.

What a fresh deployment *does* get is the stock seed: `sites/<site>/content.seed.db` **is**
tracked, the Dockerfile copies it to `dist/content/seed-sites/<site>/`, and
`hydrateContentDbFromSeed()` copies it into the mounted volume **on the first boot where
`content.db` does not exist, and never again.** Its gate is `existsSync(dbPath)` — the file's
presence, never its contents. So:

| Situation | What the operator gets |
|---|---|
| First deploy, fresh volume | The stock seed content, not their local content |
| Every later deploy | Whatever is already on the volume, untouched |
| Local content they authored | Stays local. Nothing in this procedure moves it. |

If they want their local content on the server, that is a **content migration**, a different
job from this one. Do not improvise one inside a deploy.

---

## What this plugin does, and what it refuses to do

It deploys via **CI**: two files go into the operator's repo (`fly.toml` and
`.github/workflows/fly-deploy.yml`), the operator adds one repository secret by hand, and the
workflow is fired through the workspace's saved GitHub credential. `flyctl` runs on GitHub's
runner. Fly's remote builder builds the image. **Nobody downloads or installs anything locally** —
that is the whole point.

**This plugin does not describe the GitHub half.** Writing files into a repository, repository
secrets, dispatching a workflow, following a run, and reading a failed run belong to the separate
bundled **`github`** plugin, which owns all of it in one place. Read that plugin's skill for every
GitHub step below; this document names *what* has to happen and *why it is Fly-specific*, and
deliberately never restates *how*. (The Agent Plugins v1.0.0 manifest schema has no dependency
field — `plugin.json` accepts only `$schema`, `name`, `version`, `description`, `author`,
`license`, and `keywords` — so this paragraph is the dependency declaration. If the `github`
plugin is not installed and enabled, say so and stop rather than improvising GitHub procedure
from memory.)

There is a second path in principle — driving the Machines API directly to create an app,
volume, secrets, and machines with `config.image`. It is **not implemented here**, for one
concrete reason: it needs a prebuilt, published Tovu image to point `config.image` at, and no
such image exists. See `references/machines-api-path.md` before you consider improvising it.

**Do not improvise the Machines API path.** If CI cannot be used, say so and stop, rather than
half-building a deploy that has no image to run.

---

## The five rules

These are the reason this plugin exists. Generic fly.io advice gets every one of them wrong.

### Rule 1 — Exactly one machine. Never autoscale.

Tovu stores each site's content in **SQLite** (`sites/<site>/content.db`) on the mounted volume.

A fly volume attaches to **one machine**. Scaling to two machines does not give you two
processes sharing a database — it gives you a **second machine with its own separate volume and
its own separate, divergent `content.db`**. Writes land in one or the other depending on which
machine served the request, and neither is complete. Nothing errors. Nothing warns. The
operator discovers it when content they saved is intermittently missing.

So:

- Never run `fly scale count` above 1.
- Never enable autoscaling, `auto_start_machines` beyond a single machine, or any
  "scale to zero and back up to N" configuration.
- Before firing a deploy, **read the current machine count** and refuse to proceed if it is
  not 0 or 1 (see the pre-flight step below).

The template's `min_machines_running = 1` and `auto_stop_machines = false` keep the one
machine up. They do **not** cap the maximum — nothing in `fly.toml` does. The cap is
operational discipline, which is why it is written here.

### Rule 2 — The volume shadows the image's ENTIRE `sites/` tree.

`fly.toml` mounts the volume at `/workspace/Tovu/sites`. That mount **replaces** whatever the
image has at that path. Anything the build left under `sites/` is **invisible** the moment the
volume is attached — not merged, not shadowed per-file, gone.

This is why the Dockerfile copies stock data to `dist/content/`, **outside** `sites/`, and
hydrates it in at boot:

- `content.seed.db` → `dist/content/seed-sites/<site>/content.seed.db`, copied in by
  `hydrateContentDbFromSeed()` on first boot only.
- The site's `uploads/` → `dist/content/seed-sites/<site>/uploads`, copied in by
  `hydrateBlobStoreFromSeed()`. This was added 2026-09-02 to close a real incident: the seed DB
  ships media **rows** but until that copy existed nothing shipped the **bytes** those rows
  point at, so every admin media preview 500'd.
- Themes take the same route via `seedSiteThemes()`.

The rule to apply: **if you ever add something the deployed server needs to read at boot, it
must live outside `sites/` in the image and be copied in at runtime.** Putting it under
`sites/` in the Dockerfile looks right, builds fine, and is silently unreachable in production.

### Rule 3 — Secrets go through fly secrets. Never `fly.toml`.

`fly.toml` is committed to the repo. `[env]` in it is **public**. Only non-secret values belong
there — the template ships `TOVU_RUNTIME_MODE` and `PORT`, and nothing else.

Everything below goes through `flyctl secrets set` (or the equivalent API call), never the
committed file:

| Secret | Status | What happens without it |
|---|---|---|
| `TOVU_ADMIN_PASSWORD` | **Boot-blocking** | The production readiness gate refuses to boot. `hasDefaultOwnerPassword` is true whenever it is unset **or still equal to the default**, and that is one of the `collectUnsafeDefaultFailures` checks. |
| `ANALYTICS_ROOT_KEY_SEED` | **Boot-blocking** | `hasDevSecretPlaceholder` is literally `!process.env.ANALYTICS_ROOT_KEY_SEED`. Unset means the app falls back to the dev placeholder seed, and the gate refuses to boot. |
| `TOVU_INTEGRATIONS_ROOT_KEY` | **Boot-blocking.** See Rule 4. | `hasMissingIntegrationsRootKey` is `!process.env.TOVU_INTEGRATIONS_ROOT_KEY`. Unset in production and the gate refuses to boot with `PRODUCTION_BOOT_UNSAFE_DEFAULT` (`missing-integrations-root-key`) — it must be set in fly secrets **before** the first deploy. |

Both boot-blocking checks only run when `TOVU_RUNTIME_MODE=production`, which the template
sets. Generate either value as 32 random bytes hex:

```
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

**Never** put a token, key, or password into a `custom_credential_make_request` call, a file you
write, a commit message, or your reply. If a secret value has to exist, the operator types it —
into GitHub's secret form, or into `custom_credential_set_token`'s masked field.

### Rule 4 — `TOVU_INTEGRATIONS_ROOT_KEY` must be set before the first deploy, or the boot refuses.

**This is a boot-blocking prerequisite, not a footnote — read it before you set app secrets.** A
production boot with this var unset now fails loudly (`PRODUCTION_BOOT_UNSAFE_DEFAULT`,
`missing-integrations-root-key`), fixed 2026-09-09 after this used to fail silently — the
history below is why it matters, not a description of today's behavior.

`EnvOrFileKeyring.resolveRootKey()` resolves the master key in this order:

1. `process.env.TOVU_INTEGRATIONS_ROOT_KEY`, hex-decoded. If present, done.
2. Otherwise — and `allowFileFallback` defaults to **true** outside production — it looks for
   `~/.tovu/integrations-root-key.hex`.
3. If that file does not exist, it generates 32 random bytes, writes them to that path, and uses
   them.

In the container, `USER node`, so `~` is `/home/node` — **not** on the volume, which is mounted
at `/workspace/Tovu/sites`. The container filesystem is ephemeral, so step 2/3's fallback file
never survives a redeploy. That used to matter silently: every deploy and every machine restart
would generate a brand-new random master key, and every credential sealed under the previous key
became permanently undecryptable, with nothing reporting it. The production readiness gate now
closes exactly that gap by refusing to boot instead of falling back — the fallback itself still
exists (for local dev, where it's harmless), it is just no longer reachable in production.

So, before the first deploy, set it explicitly:

```
fly secrets set TOVU_INTEGRATIONS_ROOT_KEY=$(openssl rand -hex 32) -a <app>
```

**Never rotate it casually once set.** Treat it as the one value whose loss is unrecoverable —
every credential sealed under the old key becomes undecryptable the moment the key changes,
boot-blocking gate or not. If the operator already deployed without it, before this fix shipped,
say plainly that credentials saved on the server so far are gone and must be re-entered — do not
imply they can be recovered.

### Rule 5 — Migrations apply themselves. Do not add a migration step.

`openContentDb()` runs drizzle's `migrate()` unconditionally, before `app.listen()`. A new table
arriving in a migration is created on the first boot after that deploy. There is no separate
migration command to run before or after, and adding one to the workflow is wrong.

---

## Procedure

Every GitHub step below is deliberately one line, naming *what* and pointing at the `github`
plugin for *how*. Do not reconstruct the GitHub procedure here.

### Step 0 — Establish what you are deploying to, before you write anything

Ask, or confirm from the conversation, and **do not guess any of these**:

1. **Which GitHub repo** the deploy runs from — `owner/repo`. It must be the repo whose default
   branch the workflow will run on.
2. **The fly app name.** This is the app the config points at, and getting it wrong deploys into
   the wrong place or creates a stray app.
3. **The region.** There is no correct default. The template ships `iad` marked
   `PLACEHOLDER` — if you leave it as-is, say so explicitly rather than letting them assume it
   was chosen for them.
4. **The volume name**, which must match `fly.toml`'s `[[mounts]] source` **exactly**.

If a saved credential can answer one of these, use it rather than asking:
`content_read` with `resource: "custom_credential"` lists every saved credential's label, base
URL, and additional hosts. A workspace with `fly.io` and `github` labels already saved is the
expected case.

### Step 1 — Pre-flight against the live fly API (reads only)

The workspace's saved `fly.io` credential is host-bound to both `https://api.fly.io` **and**
`https://api.machines.dev`, so the Machines API is reachable through
`custom_credential_make_request` today with no CLI. Use it to check reality before writing
config that assumes something false.

**Never call an org-wide or account-wide listing endpoint** — `GET /v1/apps` with an `org_slug`
filter, or anything else that enumerates every app in an organization. Everything this pre-flight
needs is available **per-app** once the app name is known, from the two calls below. Resolve the
app name from Step 0 — the operator, an existing `fly.toml` already in the repo, or by asking —
never by listing the org to search for it. Many real deploy tokens are **app-scoped**: they can
fully manage that one app but 403 on any call that lists the whole org. That 403 looks
exactly like a broken or invalid credential. It is neither — it is a normal, expected permission
boundary, and hitting it here would falsely block a deploy that would otherwise succeed.

```
custom_credential_make_request({
  label: "fly.io",
  method: "GET",
  url: "https://api.machines.dev/v1/apps/<app>/machines"
})
```

Read the result and apply **Rule 1**: if the app already runs more than one machine, **stop and
report it.** Do not deploy into a split-brain and do not "fix" it by deleting a machine —
whichever one you delete may be the one holding content. That is the operator's call, with the
facts in front of them.

Check the volume the same way (`GET /v1/apps/<app>/volumes`). A missing volume is the single
most consequential pre-flight failure: **the app will boot with no persistent storage, and
every write is lost on the next deploy.** The workflow does not create volumes. Either the
operator creates it, or you create it explicitly and say that you did — never silently.

If a call comes back 401 or 403, read the `authDiagnostic` field before reporting a bare
failure; follow the remedy it names, and retry at most **once**.

### Step 2 — Write the two files into the repo

Both templates live beside this file:

- `references/fly.template.toml` → the repo root, as `fly.toml`
- `references/fly-deploy.template.yml` → `.github/workflows/fly-deploy.yml`

**How to write them into the repository is the `github` plugin's job** — including the
read-before-replace rule when a file already exists, and the extra confirmation a
`.github/workflows/` path carries.

What is Fly-specific, and what this document is responsible for:

- Every value the operator must decide is marked `<<PLACEHOLDER: ...>>`. **Replace every one of
  them** with the values from Step 0, then re-read what you wrote and confirm no `<<PLACEHOLDER`
  marker survives — a leftover marker is a deploy that fails confusingly, or worse, one that
  succeeds against the wrong app.
- Two build args in the workflow are load-bearing and must never be dropped:
  `--build-arg TOVU_BUILD_SHA=${{ github.sha }}` (the build context sent to the remote builder
  excludes `.git`, so without this the runtime manifest records no provenance at all) and
  `--build-arg TOVU_INSTALL_BROWSER=0` (skips a ~150MB headless Chromium download). Both have
  been silently lost once already, in a history force-push, and two deploys failed before anyone
  noticed. If you are editing an existing workflow rather than writing a fresh one, this is the
  concrete thing the `github` plugin's diff-the-modified-files rule is protecting.

### Step 3 — The operator adds `FLY_API_TOKEN` by hand

**You cannot do this step, and you should not try.** Setting a repository secret would require
the token to pass through your context; the `github` plugin states the full rule and the exact
words to give the operator.

What is Fly-specific: the secret's name is exactly `FLY_API_TOKEN`, and its value is a fly.io
deploy token. Then **wait** — do not fire the workflow until they confirm it is set. A dispatch
without the secret fails on the runner in a way that reads like a config problem rather than a
missing secret.

### Step 4 — Set the app secrets

Rule 3's table lists them. These go through fly secrets, not the committed file, and the
operator supplies each value — you generate the random ones only if they ask you to, and even
then the value goes to them, not into a file you write.

Confirm all three are set before dispatching. All three are now boot-blocking and fail loudly if
missing — but Rule 4's still deserves the deliberate check the others don't: a *rotated* key
(set, but different from the one credentials were sealed under) boots fine and fails later,
which the gate cannot distinguish from "never configured".

### Step 5 — Fire the workflow, then watch it land

The two files must be on the branch the workflow's own trigger names; the template triggers on
`push: [main]` and on `workflow_dispatch`. **Dispatching and polling the run are the `github`
plugin's procedure** — including the rule that a 204 means queued and never deployed, and how to
find the failing step when a run fails.

What is Fly-specific, once the run reaches `success`: **confirm the app itself is actually
serving before you say it is deployed.** `/readyz` returns 503 until migrations and seeding
finish, which makes it a real readiness signal where `/health` is only liveness. A green workflow
plus a 503 `/readyz` is a deploy that has not landed yet, not a deploy that failed.

---

## Reporting rules

- **A queued dispatch is not a deploy.** Report what you observed, at the stage you observed it.
- **Never print, echo, or reconstruct a secret**, including in a summary of what the operator did.
- **Say which values you left as placeholders.** `primary_region = "iad"` is an unverified
  default; if you did not change it, that is a thing the operator needs to know, not a detail.
- **Repeat the code-not-content rule at the end**, once the site is up and they are about to go
  looking for their pages.

## References

- `references/fly.template.toml` — the `fly.toml` to write, placeholders marked.
- `references/fly-deploy.template.yml` — the workflow to write, placeholders marked.
- `references/machines-api-path.md` — the CLI-free Machines API path, what it would take, and
  the one thing that blocks it today. Read this before proposing it; do not implement it.
- The bundled **`github`** plugin's skill — every GitHub step this procedure names. It is a
  separate plugin on purpose: its rules are not Fly's, and repeating them here would turn one
  instruction into two slightly different ones.
