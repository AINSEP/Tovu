# Cloudflare Pages

- **Credential:** an API token with the **Cloudflare Pages: Edit** permission
  (https://dash.cloudflare.com/profile/api-tokens) plus the **account ID** (right side of the Cloudflare
  dashboard home). Both are saved together in Admin, Deployment, Static site.
- **Project name:** `jini-<project-name>` (lowercase, hyphens). Publishing the same project again updates the
  same Pages project. The prefix is kept for projects published before this plugin existed.
- **Address:** `https://jini-<project-name>.pages.dev`.
- **Only changed files upload.** Cloudflare compares file fingerprints and asks only for what it lacks.
- **Size limit:** each file must be 25 MiB or smaller.
- **`_headers` and `_redirects`:** the root copies are sent as Cloudflare config, never served as public
  files. A copy inside a folder is an ordinary file.

## Failure messages and what to tell the person

| Message | Meaning | Next step |
|---|---|---|
| `Cloudflare API token is required.` | No token in the saved credential. | Save a token in Admin, Deployment, Static site. |
| `Cloudflare account ID is required.` | The credential has no account ID. | Save the credential again with the account ID. |
| `Authentication error` (401/403) | The token is wrong, expired, or lacks Pages: Edit. | Make a new token with Pages: Edit and save it again. |
| `Cloudflare Pages assets must be 25.00 MiB or smaller: ...` | One file is too big for Cloudflare. | Shrink or remove the named file (usually a video). |
| `Cloudflare returned a non-JSON response.` | Cloudflare or the network had a hiccup. | Retry in a minute. |
| `fetch timed out after ...` | Cloudflare did not answer in time. | Retry in a minute. |
