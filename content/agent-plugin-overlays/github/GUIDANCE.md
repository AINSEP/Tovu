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
