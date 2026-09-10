# Source Control: publishing the site's export, and why it is not a file write

Tovu has a second, narrower pair of GitHub tools. They are easy to reach for by mistake, because
their names sound general and they are not.

- `source_control_get_capabilities` — read-only. Which providers have a saved connection.
- `source_control_execute_commit` — commits the site's **rendered static export** to a repository.

Neither is a way to put a file in a repository. That is `custom_credential_write_files`.

---

## The distinction that actually matters

**App source is not a rendered export.**

| | `custom_credential_write_files` | `source_control_execute_commit` |
|---|---|---|
| What it commits | Exactly the files you name, verbatim | A **fresh static export of the whole site** — generated HTML and assets — that it runs itself |
| Where the content comes from | You | Tovu's exporter. You do not supply file content at all |
| Deletes anything? | **Never.** It writes named paths and touches nothing else | **Yes.** Paths it previously wrote that the export no longer produces are explicitly removed |
| Creates a branch? | No — the branch must already exist | Yes, if the named branch does not exist |
| Which credential | The Access Tokens page's saved custom provider (`label`) | A **separate** credential saved on the admin's **Source Control** page |
| Repository layout | Wherever you name | Repository **root** only. No subdirectory option exists |

A container build needs **app source** — the repository's real code, its Dockerfile, its lockfiles.
A rendered export is the *output* of running that code, and a build handed one either fails or,
worse, succeeds and ships a static site where a server was expected.

So when a task says "push the app to a repo so CI can build it", that is **not**
`source_control_execute_commit`. It is either app source the human already has in a repository, or
specific files you write with `custom_credential_write_files`. Conflating the two wastes a whole
build cycle before anyone notices what was actually committed.

`source_control_execute_commit` is for one job: **publishing the site's rendered output** into a
repository — for GitHub Pages, for a static host, for an archive of what the site looks like now.

---

## Two credential stores, not one

This surprises people and is worth stating flatly.

- `custom_credential_*` reads the **Access Tokens** page's *Add custom provider* table. That is
  where a credential labelled `github` lives.
- `source_control_*` reads a **separate** table, connected on the admin's **Source Control** page.

A workspace can have one and not the other. **A saved `github` custom credential does not make
`source_control_execute_commit` work**, and a connected Source Control provider does not give
`custom_credential_make_request` a label to use.

So: call `source_control_get_capabilities` before you promise a human anything about committing an
export. And never ask a human to paste a token into chat to bridge the gap — point them at the
admin page that saves it encrypted, which is exactly what that page is for.

---

## Using `source_control_execute_commit`

```
source_control_execute_commit({
  provider: "github",
  owner: "<owner>",
  repo: "<repo>",
  commitMessage: "<message>",
  branch: "<branch>"   // optional — the repository's default branch when omitted
})
```

Only `provider: "github"` is accepted. A gitlab or bitbucket credential can be **saved** and is
reported honestly by `source_control_get_capabilities` with `commitSupported: false` — committing
to either is not implemented. Say that plainly rather than letting a human discover it from a
failed attempt.

Like every gated write here, **one call raises the dialog and waits.** There is no second call.

### Reading the result

On success: `{ committed: true, branchCreated, commitSha, commitUrl, filesChanged, filesDeleted,
divergedPaths }`.

**Report `filesDeleted` to the human, always.** A nonzero value means real content was *removed*
from their repository, not merely added. Only paths this tool itself previously wrote, whose live
content still exactly matches what it wrote, are ever deleted — an existing README, a workflow
file, anything hand-edited since, is never touched.

`divergedPaths` lists paths that fell into that last case: no longer part of the export, but
preserved because their content no longer matches this tool's own record. Tell the human those need
their own manual review if removal is still wanted. Silence here reads as "everything is clean",
which is the opposite of what a non-empty `divergedPaths` means.

### The failure codes, and what each one is telling you

| Code | What it means | The right next move |
|---|---|---|
| `no-credential` | No Source Control credential is connected. Returned **without raising a dialog** | Point them at the admin's Source Control page. Call `source_control_get_capabilities` first next time |
| `REPOSITORY_NOT_FOUND` | The token cannot see that `owner/repo` | Confirm the identifiers, then the token's access. Not necessarily a bad token |
| `NO_CHANGES` | Nothing changed since the branch's last commit | **Not a failure.** Say nothing needed to commit |
| `DIVERGED_BRANCH` | Someone else pushed since this call started; the commit was refused rather than overwriting history | The human resolves it, exactly as with any rejected non-fast-forward push |
| `NETWORK_UNREACHABLE` | Could not reach GitHub at all | Says **nothing** about the credential. Do not tell them to replace it. Suggest retrying |
| `PROVIDER_ERROR` | GitHub's API rejected the request — expired token, insufficient scope, permission | The message names what went wrong. Never a raw body, never the credential |
| `EXPORT_FAILED` | The site failed to export cleanly, before any commit was attempted | A Tovu-side problem, not a GitHub one. Fix the export |

`{ committed: false, cancelled: true }` is a human declining. Say so and stop.

Wait for the result and report the true outcome. Do not tell a human a dialog is open and then
stop, and do not call again while a call is pending — a fresh call raises a second, separate dialog
rather than answering the first.
