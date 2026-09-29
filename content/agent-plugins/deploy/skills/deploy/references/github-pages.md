# GitHub Pages

- **Token:** a fine-grained personal access token (https://github.com/settings/personal-access-tokens)
  for the repository, with **Contents: Read and write** and **Pages: Read and write**. Saved in Admin,
  Deployment, Static site.
- **Config fields:** `owner` (user or organization), `repo`, and optional `branch` (default `gh-pages`).
  Tovu commits the site to that branch and switches GitHub Pages on for it if it is off.
- **Address:** `https://<owner>.github.io/<repo>/`. The site is built with every link under `/<repo>`,
  so previewing shows that base path.
- **`.nojekyll`:** this plugin adds it, so GitHub does not run Jekyll and drop files whose names start
  with `_`.
- **Security headers:** GitHub Pages cannot set custom response headers, so none are sent.

## Failure messages and what to tell the person

| Message | Meaning | Next step |
|---|---|---|
| `GitHub token is required.` | No token in the saved credential. | Save a token in Admin, Deployment, Static site. |
| `invalid GitHub owner '...'` / `invalid GitHub repo '...'` / `invalid branch name '...'` | A config field has a typo or bad characters. | Correct the owner, repo, or branch name. |
| `Bad credentials` / `Resource not accessible by personal access token` (401/403) | The token is wrong, expired, or lacks the permissions above. | Make a new token for this repo with Contents and Pages write access. |
| `Not Found` (404) | The repo does not exist, or the token cannot see it. | Check the owner and repo names and the token's repository access. |
| `GitHub Pages build errored.` | GitHub accepted the files but its Pages build failed. | Retry once; if it repeats, check the repo's Pages settings. |
| `... attempted to redirect an authenticated request ...` | Something redirected the call; Tovu refused to send the token on. | Retry later; if it repeats, check the server's network or proxy. |
| `GitHub returned a non-JSON response.` / `fetch timed out after ...` | GitHub or the network had a hiccup. | Retry in a minute. |
