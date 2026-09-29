# Vercel

- **Token:** an access token from https://vercel.com/account/tokens. Saved in Admin, Deployment, Static site.
- **Team (optional):** the publish config's `teamId` puts the project under a Vercel team instead of the
  personal account. Leave it out for a personal account; a blank one is refused.
- **Project name:** the project name, lowercased with hyphens (up to 80 characters). Publishing again
  updates the same project.
- **Security headers:** this plugin writes them into a root `vercel.json`; a `vercel.json` in the site
  itself is replaced.
- **Deployment Protection:** new Vercel projects often require a Vercel login to view. Tovu detects that
  and reports the link as protected rather than live.

## Failure messages and what to tell the person

| Message | Meaning | Next step |
|---|---|---|
| `Vercel token is required.` | No token in the saved credential. | Save a token in Admin, Deployment, Static site. |
| `You don't have permission to create a project.` | The token cannot create projects (often the wrong team). | Check the token's scope or the `teamId`. |
| `Deployment is protected by Vercel. ...` | The site is up but behind Vercel's login. | In Vercel, turn off Deployment Protection for the project, or add a custom domain. |
| `Vercel deployment failed.` | Vercel refused the build after upload. | Retry once; if it repeats, check the deployment log in the Vercel dashboard. |
| `... attempted to redirect an authenticated request ...` | Something between Tovu and Vercel redirected the call; Tovu refused to send the token on. | Retry later; if it repeats, check the server's network or proxy. |
| `Vercel returned a non-JSON response.` / `fetch timed out after ...` | Vercel or the network had a hiccup. | Retry in a minute. |
