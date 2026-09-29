# Netlify

- **Token:** a personal access token from https://app.netlify.com/user/applications#personal-access-tokens.
  No config fields: Tovu finds or creates the Netlify site from the project name.
- **Site name:** `jini-<project-name>` (lowercase, hyphens). Publishing the same project again updates the
  same site. The prefix is kept for sites published before this plugin existed.
- **Only changed files upload.** Netlify compares file fingerprints and asks only for what it lacks.

## Failure messages and what to tell the person

| Message | Meaning | Next step |
|---|---|---|
| `Netlify token is required.` | No token in the saved credential. | Save a token in Admin, Deployment, Static site. |
| `Invalid token` / `Access Denied` (401/403) | The token is wrong, expired, or revoked. | Make a new token and save it again. |
| `Name has already been taken` | Another Netlify account owns that site name. | Publish under a different project name. |
| `Netlify deployment error.` / `rejected.` | Netlify refused the deploy after upload. | Retry once; if it repeats, check the Netlify dashboard's deploy log. |
| `Payload too large` | One file is over Netlify's size limit. | Find and shrink the large file (usually a video or image). |
| `Netlify returned a non-JSON response.` | Netlify or the network had a hiccup. | Retry in a minute. |
| `fetch timed out after ...` | Netlify did not answer in time. | Retry in a minute. |
