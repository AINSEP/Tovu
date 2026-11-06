# Tovu host guidance for github

This Tovu guidance comes before the portable `github` skill. Where the two differ, this guidance is
the more specific one.

**Deploying the Tovu server with GitHub Actions.** `deployment_ops_deploy` with platform
`github-actions` resolves the branch or tag to a full SHA and dispatches the repository's Tovu deploy
workflow with `expected_sha` pinned to it. The workflow refuses to deploy if that ref moved, and a
manual dispatch without a full 40-character lowercase `expected_sha` fails before anything builds.
Say which commit will build. Setting up the Fly server itself is the `fly` plugin's job.

**`CREDENTIAL_UNREADABLE` (site backup and source control).** The Site key decides it. No Site key:
start Tovu with it (`npm run dev` from the repo root, or `npm run desktop`). Malformed: fix it under
**Secrets → Site key**. A different Site key from the one the credential was saved under: check
**Secrets → Site key**, or save the credential again.

**Static export.** `source_control_execute_commit`'s package layout does not change Tovu's static
publishing or `tovu export`, which keep their current output.

**Restore.** Tovu has no restore tool yet. Do not promise one.


## Host details for skills/github/SKILL.md

Open **Connect GitHub** with `credential_save {kind:"plugin-provider",target:"github"}`; it saves the API credential labelled `github`. For `github-source-control`, use `credential_save {kind:"plugin-provider",target:"github-source-control"}`; it saves through the source-control owner. For Pages hosting use the `github-pages` plugin’s card. These remain distinct save contracts. Each card names the repository permissions and links to fine-grained token creation. Never collect a token in chat.

To find the label, call `content_read.custom_credential` with `{}`. It returns each saved
credential's label, category, base URL and additional hosts — never a token. A workspace with a
credential labelled `github` is the expected case, but do not assume the label: read it.


## Host details for skills/github/references/auth-and-tokens.md

Open `credential_save {kind:"plugin-provider",target:"github"}` for the plugin’s own GitHub card. It saves label `github` and base URL `https://api.github.com`, with the token sealed server-side. Existing rows can still be rotated by their exact saved label.

To discover what is saved, call `content_read.custom_credential` with `{}`. It returns
each credential's label, category, base URL, and additional hosts — never a token, and never a
saved username. An empty list is the signal to ask a human to save one, not to look for another
way in.


## Host details for skills/github/references/site-backup.md

`site_backup_plan` and `site_backup_push` copy **this site** into one folder of a private GitHub
repository, in one commit: its database, media, themes, installed plugins and skills, and settings.
Both are native host tools. They push with the same saved credential `custom_credential_*` uses:
the plugin’s card: `credential_save {kind:"plugin-provider",target:"github"}`.

| Code | What it means | What to tell them |
|---|---|---|
| `CREDENTIAL_NOT_FOUND` | No saved credential has that label, or none points at `https://api.github.com` | Open `credential_save {kind:"plugin-provider",target:"github"}`, or name the right label with `credential`. Never have a token typed into the chat. |
| `CREDENTIAL_AMBIGUOUS` | More than one saved credential points at GitHub | Ask which one, then plan with `credential` |
| `CREDENTIAL_UNREADABLE` | The credential **is saved** but this server cannot decrypt it | Not a bad GitHub token, so replacing it is the wrong first move. It starts with the **Site key**, and the message names which case applies. No Site key: start the host with it (the host guidance names how). Malformed: fix it in the host's Site key setting. A different Site key from the one the credential was saved under: check that setting, or save the credential again. |
| `REPOSITORY_NOT_FOUND` | This credential cannot see that `owner/repo` | Confirm the names, then the token's repository access |
| `REPOSITORY_NOT_PRIVATE` | Public or internal | Back up to a private repository. Never offer a public one |
| `NO_PUSH_PERMISSION` | The token can read the repository but not push to it | The token needs write access to the repository's contents. That change is made on GitHub. |
| `REPOSITORY_EMPTY` | No commits yet | Add a first commit (a README) on GitHub, then plan again |
| `BRANCH_NOT_FOUND` | The named branch does not exist | Name an existing branch, or leave `branch` out for the default |
| `FOLDER_IS_FILE` | The folder's path is a file on that branch | Choose another `folder` |
| `LIMIT_EXCEEDED` | Over a limit above | See **Limits** |
| `DATABASE_SNAPSHOT_FAILED` | The host could not take a consistent copy of the database | A host-side problem, not a GitHub one. Report it |
| `PLAN_NOT_FOUND` / `PLAN_EXPIRED` | The `planId` was already used, is over 10 minutes old, or a server restart dropped it | Plan again |
| `PLAN_STALE` | A file on the site changed after the plan | Plan again, and show the new plan |
| `DIVERGED_BRANCH` | Someone pushed to the branch after the plan. Nothing was written | Plan again, and show the new plan |
| `PROVIDER_ERROR` | GitHub rejected a request | The message names what went wrong. Pass it on |
| `NETWORK_UNREACHABLE` | GitHub could not be reached, even after retries | Says nothing about the credential. Try again later, from a fresh plan |
| `UNAVAILABLE` | This runtime has no site folder on disk | A backup cannot be made from here |
| `SITE_BACKUP_FORBIDDEN` | The person lacks the backup or credential-write permission | An admin grants it. Nothing was touched |
| `SITE_BACKUP_INVALID_INPUT` | A field was malformed | The message names the field. Fix it and plan again |


## Host details for skills/github/references/source-control.md

- `custom_credential_*` reads the **Access Tokens** page's *Add custom provider* table. That is
  where a credential labelled `github` lives.
- `source_control_*` reads a **separate** table, connected with `credential_save {kind:"plugin-provider",target:"github-source-control"}`.

Ownership is recorded at `<folder>/.tovu/managed-files.json`. Changing folders creates an independent
destination, preserving the previous root export and sibling folders. A folder commit never reads
the root manifest as a fallback.


## Host operations for skills/github/SKILL.md

- **Source control and backup** — write files into a repository, commit the site's rendered export,
  back up the site, or start and follow any other workflow: the tools in the rest of this document.
- **Deploying the host's server with GitHub Actions** — use the deployment tools with platform
  `github-actions`, never a hand-built dispatch. Call `deployment_ops_deploy` with target
  `owner/repo` and the branch or tag. It resolves the ref to a full SHA and dispatches the host's
  deploy workflow pinned to that commit; the host guidance describes that workflow's own inputs and
  refusals. Say which commit will build. A started deploy is queued, never deployed: follow it with
  `deployment_ops_wait` (pass the returned runId) until `finished`, then check the live site. Use
  `deployment_ops_status` and `deployment_ops_logs` to find a failed job and step. Never retry a
  deploy whose connection dropped before checking `deployment_ops_status`. The saved
  `api.github.com` credential needs Actions write. Setting up the server host itself (its config,
  volume and secrets) is the host plugin's job, not this one's.

Two native host tools do everything below. **This plugin ships no MCP server and adds no tool.**
Its deploy half is only the `github-actions` platform behind the core `deployment_ops_*` tools.

| Tool | What it is |
|---|---|
| `custom_credential_make_request` | One authenticated `GET`/`POST`/`PUT`/`PATCH`/`DELETE` to GitHub's REST API through a saved credential. You pass a `label` and a **full absolute URL**; the server injects the real `Authorization` header. |
| `custom_credential_write_files` | A human-confirmed, atomic write of 1–25 named files onto an **existing** branch (blob → tree → commit → non-force ref update). |

Two more exist for a narrower job — `source_control_get_capabilities` and
`source_control_execute_commit` — and they are **not** general-purpose repo writes. See
`references/source-control.md` before you reach for either; the distinction between them and
`custom_credential_write_files` is the single easiest thing to get wrong in this document.

And two back up the site itself — `site_backup_plan`, then `site_backup_push` — into a private
repository. See `references/site-backup.md`.

`custom_credential_make_request` refuses any URL whose host is not on that credential's own saved
allowlist (its base URL plus any saved additional hosts), **before any request is sent**. This is
not a limitation to route around. It is the property that makes an agent-held credential safe at
all: the human decided, once, at save time, which origins this token may ever reach.

`custom_credential_write_files` replaces a file's **entire content**; it does not patch. So when
you are updating a file that already exists:

| You want to… | Use |
|---|---|
| Add or update named files — a config file, a workflow, a script, a Dockerfile | `custom_credential_write_files` |
| Read anything at all from GitHub | `custom_credential_make_request` (`GET`) |
| Deploy the host's server through its deploy workflow | `deployment_ops_deploy` with platform `github-actions` — see "Which job is this?" above |
| Start any other workflow, or follow a run | `custom_credential_make_request` — see `references/actions.md` |
| Back up the **site itself** (database, media, themes, plugins, settings) into a private repo | `site_backup_plan`, then `site_backup_push` — see `references/site-backup.md` |
| Publish the **site's rendered static export** into a repo | `source_control_execute_commit` — see `references/source-control.md` |

Conflating the last row with the rest wastes real work. `source_control_execute_commit` runs a
fresh static export of the site and commits the resulting HTML and assets, and it **deletes** paths
it previously wrote that the export no longer produces. It is a publishing target, not a way to put
a file in a repository. A container build needs app source, and a rendered export is not app
source — a build fed the wrong one either fails or, worse, succeeds and ships a site with no
server. `references/source-control.md` states the difference in full; read it before you use
either tool for the first time in a task.

- `references/repo-files.md` — writing and updating files: the confirmation dialog, the limits,
  every refusal reason, the workflow-path warning, and the read-then-replace procedure for edits.
- `references/actions.md` — dispatching a workflow, polling a run, reading a failed run's logs,
  and telling the distinct failure signatures apart.
- `references/auth-and-tokens.md` — what a saved GitHub credential can and cannot do, scopes,
  `authDiagnostic`, rate limits, and why repository secrets are the human's step.
- `references/source-control.md` — `source_control_execute_commit` versus
  `custom_credential_write_files`: two different credential stores, two different jobs, and the
  app-source-versus-rendered-export distinction.
- `references/site-backup.md` — backing up the site itself: plan then push, private repositories
  only, what the dialog shows, the limits, every code and what to tell the human, and why a refused
  push is planned again rather than forced.


## Host operations for skills/github/references/actions.md

Everything here goes through `custom_credential_make_request` against the saved GitHub credential.
Nothing here needs a new tool, and nothing here needs a shell.

```
custom_credential_make_request({
  label: "github",
  method: "GET",
  url: "https://api.github.com/repos/<owner>/<repo>/actions/workflows"
})
```

```
custom_credential_make_request({
  label: "github",
  method: "GET",
  url: "https://api.github.com/repos/<owner>/<repo>/branches/<ref>"
})
```

```
custom_credential_make_request({
  label: "github",
  method: "GET",
  url: "https://api.github.com/repos/<owner>/<repo>/actions/workflows/<file.yml>/runs?per_page=1"
})
```

```
custom_credential_make_request({
  label: "github",
  method: "POST",
  url: "https://api.github.com/repos/<owner>/<repo>/actions/workflows/<file.yml>/dispatches",
  headers: { "Accept": "application/vnd.github+json", "Content-Type": "application/json" },
  body: "{\"ref\":\"<branch>\"}"
})
```

```
custom_credential_make_request({
  label: "github",
  method: "GET",
  url: "https://api.github.com/repos/<owner>/<repo>/actions/workflows/<file.yml>/runs?per_page=1"
})
```

```
custom_credential_make_request({
  label: "github",
  method: "GET",
  url: "https://api.github.com/repos/<owner>/<repo>/actions/runs/<run_id>/jobs"
})
```

`custom_credential_make_request` follows **zero** redirects, and that object-store host is not on
the credential's saved allowlist, so you cannot follow it either. You will see the 302 and its
`Location` header, and that is where it ends. This is not a bug to work around — following an
arbitrary redirect target with a credential attached is exactly the egress hazard the single-hop
policy exists to close.


## Host operations for skills/github/references/auth-and-tokens.md

Two headers you must never set on `custom_credential_make_request`: `Authorization` and `Cookie`
(also `Host` and `Proxy-Authorization`). The server injects the real one, and a call trying to set
any of these is refused.

A 401 or 403 response from `custom_credential_make_request` carries an `authDiagnostic` object
alongside GitHub's untouched `bodyText`. **Read it before reporting a bare failure.**

- On a **401** where the scheme sent was `Bearer` and no username is stored, `hint` names the one
  narrow guess the system is willing to make: this provider may need HTTP Basic with a saved
  username. Treat it as a hypothesis. Ask the human for the username, save it with
  `custom_credential_set_username`, retry **once**. Never invent a username, and never loop past
  one retry.
- When a username is already stored, there is no hint — the cause is something else and unguessable.
- On a **403 there is no hint at all**, deliberately. 403 covers scopes, org policy, rate limits,
  and missing headers; a Basic-auth guess there would be a false lead rather than a hedge. Report
  the failure and GitHub's own message plainly.

If you suspect the credential itself, `custom_credential_verify` checks one saved credential
against its own API, live, and reports `valid` / `invalid` / `unreachable`. **`unreachable` does
not mean the credential is bad** — it is a network failure. Do not tell a human to replace a token
over a DNS error.


## Host operations for skills/github/references/repo-files.md

`custom_credential_write_files` is the only way to put a file in a GitHub repository from here.
Never shell out to `git`, and never hand-roll the Contents API through
`custom_credential_make_request` — this tool exists so you do not have to, and it carries a human
confirmation the raw API call would skip.

```
custom_credential_write_files({
  label: "github",
  owner: "<owner>",
  repo: "<repo>",
  branch: "<branch>",
  commitMessage: "<message>",
  files: [
    { path: "path/relative/to/repo/root", content: "<the file's exact full text>" }
  ]
})
```

**`custom_credential_write_files` replaces a file's entire content. It does not patch.** Whatever
you do not carry forward is gone.

1. **Read what is actually there.**
   ```
   custom_credential_make_request({
     label: "github",
     method: "GET",
     url: "https://api.github.com/repos/<owner>/<repo>/contents/<path>?ref=<branch>"
   })
   ```
   The response's `content` is base64. For a large file, `Accept: application/vnd.github.raw` gets
   you the text directly.


## Host operations for skills/github/references/site-backup.md

| The human wants… | Use |
|---|---|
| A copy of the site itself (content, members, media, settings) to keep or restore from | `site_backup_plan`, then `site_backup_push` |
| The site's **rendered** HTML published into a repository (Pages, a static host) | `source_control_execute_commit` — see `source-control.md` |
| A few named files: a config, a workflow, a script | `custom_credential_write_files` — see `repo-files.md` |

The rendered export holds no database. It is what the site *looks like*, not the site, and nothing
can be restored from it. Going the other way, `custom_credential_write_files` cannot carry a backup:
25 files and 1 MiB each, and every byte would pass through your context. The database holds members
and admin accounts, so that is not a size problem. It is a reason never to try.

```
site_backup_plan({
  owner: "<owner>",
  repo: "<repo>",
  // all optional:
  credential: "github",          // needed only when more than one saved credential points at GitHub
  branch: "<branch>",            // default: the repository's default branch; must already exist
  folder: "<folder>",            // default: the site's folder name; replaced as a whole on each backup
  include: { media: false },     // database, media, themes, plugins, settings: each defaults to true
  commitMessage: "<message>"     // default: the host's backup message with the site name and time
})
```

```
site_backup_push({ planId: "<planId>" })
```

A large site can take longer than one call. The push waits about 4 minutes; if the upload is still
running then, it returns `{ pushed: false, cancelled: false, inProgress: true, planId, progress,
message }`, where `progress` is `{ filesDone, filesTotal, bytesDone, bytesTotal }`. Tell the human
how far it got, then **call `site_backup_push` again with the same `planId`** to keep waiting. That
does not start a second upload, and nothing is committed until every file is up: the backup is
still one commit. Keep re-calling while it answers `inProgress`.

The `planId` is used up when its push finishes, whatever the outcome. After a failure, a second
attempt starts with a fresh `site_backup_plan`. A server restart drops a running push; nothing is
committed, so plan again.

| Result | Meaning |
|---|---|
| `{ pushed: true, commitSha, commitUrl, repository, branch, folder, filesWritten, totalBytes }` | Written. Report the SHA and URL. |
| `{ pushed: false, cancelled: false, inProgress: true, planId, progress, message }` | Still uploading. Report the progress, then call `site_backup_push` again with the same `planId`. |
| `{ pushed: false, cancelled: false, reason: "abandoned" }` | The run ended while the push was waiting. The upload stopped and nothing was committed. Plan again. |
| `{ pushed: false, cancelled: false, code, message }` | Refused. See the codes below. Nothing was written. |

`site_backup_push` has no force option, and every write it makes is a **non-force** ref update on
top of the exact commit the plan saw. That is why `DIVERGED_BRANCH` is a refusal, not a lost commit.

So when a push is refused because the world moved (`PLAN_EXPIRED`, `PLAN_STALE`,
`DIVERGED_BRANCH`), the answer is always **plan again** and show the human the new plan. Never force
the branch through `custom_credential_make_request`, never delete and recreate the branch, and never
rebuild the backup out of `custom_credential_write_files` calls. Each of these would throw away
someone else's commit, or push content the human never reviewed.


## Host operations for skills/github/references/source-control.md

- `source_control_get_capabilities` — read-only. Which providers have a saved connection.
- `source_control_execute_commit` — commits the site's **rendered static export** to a repository.

Neither is a way to put a file in a repository. That is `custom_credential_write_files`.

| | `custom_credential_write_files` | `source_control_execute_commit` |
|---|---|---|
| What it commits | Exactly the files you name, verbatim | A **fresh static copy of the active theme** — generated HTML and assets — that it runs itself |
| Where the content comes from | You | The host's exporter. You do not supply file content at all |
| Deletes anything? | **Never.** It writes named paths and touches nothing else | **Yes.** Unchanged stale files recorded by this destination’s manifest are removed; human-edited stale files are preserved |
| Creates a branch? | No — the branch must already exist | Yes, if the named branch does not exist |
| Which credential | The Access Tokens page's saved custom provider (`label`) | The **Source Control** credential, falling back to a saved `github` API key only when no explicit connection exists |
| Repository layout | Wherever you name | Repository root by default, or the optional `folder` the user named |

So when a task says "push the app to a repo so CI can build it", that is **not**
`source_control_execute_commit`. It is either app source the human already has in a repository, or
specific files you write with `custom_credential_write_files`. Conflating the two wastes a whole
build cycle before anyone notices what was actually committed.

`source_control_execute_commit` is for one job: **publishing the site's rendered output** into a
repository as a portable static copy. Hosting this layout requires configuration; use the static-publish flow for hosted deployment.

An explicit Source Control connection takes priority. If none exists, `source_control_execute_commit`
can use the saved `github` API key; capabilities identify this as `credentialSource:"saved-api-key"`.
A connected Source Control provider does not give `custom_credential_make_request` a label to use.

So: call `source_control_get_capabilities` before you promise a human anything about committing an
export. And never ask a human to paste a token into chat to bridge the gap — open the plugin’s source-control card, which saves it encrypted through that owner.

## Using `source_control_execute_commit`

```
source_control_execute_commit({
  provider: "github",
  owner: "<owner>",
  repo: "<repo>",
  commitMessage: "<message>",
  branch: "<branch>",   // optional — the repository's default branch when omitted
  folder: "static_sites", // optional — empty or omitted means repository root
  dryRun: true
})
```

Only `provider: "github"` is accepted. A gitlab or bitbucket credential can be **saved** and is
reported honestly by `source_control_get_capabilities` with `commitSupported: false` — committing
to either is not implemented. Say that plainly rather than letting a human discover it from a
failed attempt.

| Code | What it means | The right next move |
|---|---|---|
| `no-credential` | No Source Control credential is connected. Returned **without raising a dialog** | Point them at the admin's Source Control page. Call `source_control_get_capabilities` first next time |
| `REPOSITORY_NOT_FOUND` | The token cannot see that `owner/repo` | Confirm the identifiers, then the token's access. Not necessarily a bad token |
| `NO_CHANGES` | Nothing changed since the branch's last commit | **Not a failure.** Say nothing needed to commit |
| `DIVERGED_BRANCH` | Someone else pushed since this call started; the commit was refused rather than overwriting history | The human resolves it, exactly as with any rejected non-fast-forward push |
| `NETWORK_UNREACHABLE` | Could not reach GitHub at all | Says **nothing** about the credential. Do not tell them to replace it. Suggest retrying |
| `PROVIDER_ERROR` | GitHub's API rejected the request — expired token, insufficient scope, permission | The message names what went wrong. Never a raw body, never the credential |
| `EXPORT_FAILED` | The site failed to export cleanly, before any commit was attempted | A host-side problem, not a GitHub one. Fix the export |
