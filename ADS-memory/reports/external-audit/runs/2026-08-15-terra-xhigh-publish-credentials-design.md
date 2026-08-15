# Design — Terra 5.6 (xhigh) on publish credentials, git-push, and user/agent education

**Date:** 2026-08-15 · **Peer:** `gpt-5.6-terra`, `model_reasoning_effort="xhigh"`, codex-cli 0.147.0
**Target:** detached worktree at `95596eb` · **Run:** `turn.completed`, 0 `error` / 0 `turn.failed`,
22 `command_execution` + 4 `web_search`

**Headline: the Coordinator's generic git-push adapter idea is HOLED** — a git push is a deploy
*trigger* for an already-connected project, not a provisioning path. Terra verified this against all
four providers' live docs, not from memory.

> Terra had no `node_modules` and ran no tests. Source-confirmed + doc-confirmed only.
> **Not yet independently re-verified by the Coordinator.**

---

## VERDICT ON THE GIT-PUSH PREMISE

**HOLED, not dead.** A git push is a deploy trigger only after the host has been configured to watch that repository and branch. It is not a generic provisioning path.

Netlify requires Git-provider authorization and linking a repository before pushes deploy; Cloudflare requires its Git integration to be authorized and a Pages project connected; Vercel requires importing/connecting the repository and configuring its production branch; Render requires a linked repo branch. [Netlify](https://docs.netlify.com/deploy/create-deploys/), [Cloudflare](https://developers.cloudflare.com/pages/configuration/git-integration/), [Vercel](https://vercel.com/docs/git), [Render](https://render.com/docs/deploys)

GitHub Pages is not uniform either: it needs a configured Pages source—branch root or `/docs`—or an Actions workflow. The current adapter deliberately targets a project-site `/<repo>` base path and a `gh-pages` branch, so it already embodies target-specific knowledge. [`adapter.ts:107`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/src/features/deployments/static-publish/adapter.ts:107) [GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

Keep git push as a later, advanced **“push exported files to an already-connected deployment repository”** adapter. It is useful for Render and arbitrary preconfigured CI/CD, and optionally for Git-connected Vercel/Netlify/Cloudflare projects. Do not build it as the answer to hosted publishing, and do not build it first for GitHub Pages, Netlify, Cloudflare, or Vercel: Jini already has direct API deployment/provisioning paths for those hosts. INFERRED from source: GitHub Pages creates/enables its Pages site, Vercel uploads files directly, and Netlify/Cloudflare create or find the remote site/project. [`github-pages.ts:75`](/Users/la/Programming/Jini/packages/devops/src/deploy/github-pages.ts:75) [`vercel.ts:75`](/Users/la/Programming/Jini/packages/devops/src/deploy/vercel.ts:75) [`netlify.ts:50`](/Users/la/Programming/Jini/packages/devops/src/deploy/netlify.ts:50) [`cloudflare-pages.ts:921`](/Users/la/Programming/Jini/packages/devops/src/deploy/cloudflare-pages.ts:921)

## RECOMMENDATION

Ship one execution-aware publishing design:

- Self-hosted mode: prefer the local assistant/CLI route; no stored provider credential is needed.
- Hosted mode: use direct API publishing through a workspace-scoped encrypted **provider connection**.
- Later: offer Git trigger as a separate mode with a visible “provider project must already be connected” prerequisite.

The owner’s conclusion is right for hosted Tovu, with one correction: store a named provider connection, not “one API key per provider.” The current seam is appropriately placed for this evolution, but it is too narrow today: `StaticPublishTargetId` is intentionally closed to GitHub Pages and Vercel, and `PublishCredentialSource` returns only one token. [`types.ts:31`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/src/features/deployments/static-publish/types.ts:31) [`types.ts:74`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/src/features/deployments/static-publish/types.ts:74)

Keep the closed union for API adapters, but make the registry open:

```ts
type ProviderRecord = {
  id: string;
  name: string;
  basePath: "root" | "subpath";
  cli?: { command: string };
  credentialEnv?: string; // self-hosted legacy/operator fallback only
  docsUrl: string;
  api?: { targetId: ApiStaticPublishTargetId; credentialProfileId: string };
  gitPush?: { requiresPreconnectedProject: true };
};
```

`api.targetId` is the closed, reviewed adapter union. `custom` has no `api` entry and therefore cannot silently receive a token-based adapter. `gitPush` changes the record shape because `basePath` alone cannot express its prerequisite or branch/repository configuration.

Treat GitHub Pages as **“GitHub Pages — project site”** while the current adapter retains `/<repo>` behavior; do not claim it covers `<owner>.github.io` root sites without a reviewed `siteKind` addition.

## CREDENTIAL MODEL

Create `publish_credential_sets` with a migration, following ADR-058’s sealed-secret pattern rather than using settings or environment variables.

```text
PK:        (workspace_id, id)
unique:    (workspace_id, provider_id, label)

workspace_id, id, provider_id, label,
sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg,
created_at, updated_at, last_verified_at, verification_state
```

The encrypted payload is a strict, closed union used only by API adapters:

```ts
{ target: "github-pages"; token: string }
{ target: "vercel"; token: string; teamId?: string }
{ target: "cloudflare-pages"; token: string; accountId: string }
{ target: "netlify"; token: string }
```

This models Cloudflare’s required account ID and Vercel’s optional team scope without adding provider-specific database columns. Repository/branch/project settings belong to the publish target configuration, which references the credential-set ID.

Use two source operations:

- `describeCredential(...)` returns only `configured`, provider, label, and timestamps.
- `resolveForPublish(...)` fetches by `(workspaceId, credentialSetId)`, confirms its provider matches the selected closed API target, decrypts it, and returns the discriminated adapter input.

Never use `resolveForPublish` from preview or agent education. The present preview resolves the credential merely to return a boolean; split that before stored credentials land. [`publish-agent-tools.ts:215`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/src/features/deployments/publish-agent-tools.ts:215)

Never read back:

- Any token, deploy key, private key, passphrase, or encrypted payload.
- A token suffix in an agent tool, logs, analytics, errors, audit payloads, exports, or browser storage.
- Provider error bodies or request headers.

Return to the human credential-management UI only: provider, safe user-chosen label, configured/not configured, created/updated/verified timestamps, and a generic verification result. I recommend **not returning last four characters**; `updatedAt` and an explicit label are enough to identify a connection without disclosing token material. The existing ADR-058 schema permits a masked suffix, but that is not required for this stronger deployment-secret design. [`schema.ts:1320`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/src/db/schema.ts:1320)

Bind encryption authentication data to `workspaceId + providerId + credentialSetId`. The present AES-GCM sealer deliberately uses one derived key across workspaces and no per-record AAD, so add an AAD/context parameter for the new table. [`secret-sealer.aesgcm.ts:22`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/src/integrations/secret-sealer.aesgcm.ts:22) This makes ciphertext transplant across tenant/provider/connection fail authentication.

Hosted composition must never fall back to global `GITHUB_TOKEN`/`VERCEL_TOKEN`: the current env source explicitly ignores `workspaceId`. [`credentials.ts:33`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/src/features/deployments/static-publish/credentials.ts:33)

## UI DISCLOSURE

Use an explicit server-provided execution capability, not `NODE_ENV` or PATH detection:

```ts
"self-hosted-cli" | "hosted-api-only"
```

### Self-hosted CLI

Show:

> Publish from this machine  
> Recommended: use Tovu’s local assistant. It uses the CLI sign-in already on this machine. No deployment API key is required or stored in Tovu.

Then show detected `gh`, `vercel`, etc. and the “Ask the assistant to publish” action. If missing:

> Install and sign in to the provider CLI, then ask the assistant to publish.

Keep manual export as an equal escape hatch. Hide credential setup behind a collapsed **“Advanced: publish with server-side provider credentials”** disclosure. A self-hosted user is never told they must supply a token.

This agrees with the current product intent: the Static Site tab already describes the assistant/CLI route as the recommended no-stored-credential path. [`StaticSiteTab.tsx:125`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/apps/admin/src/features/deployment/StaticSiteTab.tsx:125)

### Hosted API-only

Replace that primary card with:

> Publish from this hosted workspace  
> This workspace cannot use your computer’s terminal or CLI sign-in. To publish here, connect a provider and save its required credentials.

On provider selection, show exact fields and scope guidance:

- GitHub Pages: repository owner/repo/branch plus a repository-scoped write token.
- Vercel: access token; team ID only when publishing into a team.
- Cloudflare Pages: API token and account ID.
- Netlify: token, when that adapter is enabled.

Under the form:

> Stored encrypted on the server. Tovu’s assistant can see only whether this connection is ready. It cannot read it or publish with it.

For the future Git trigger option, say:

> Connect this repository to this provider first. A push updates an already-configured project; it does not create or connect one.

This is a product judgement: it makes the hosted constraint visible at the moment it matters, without turning the self-hosted screen into a credential-sales pitch.

## AGENT EDUCATION

Add one new read-only tool: `deployment_get_static_publish_capabilities`.

It returns the same safe facts the UI uses:

```ts
{
  executionMode,
  providers: [{
    id, name, docsUrl, basePath,
    cli: { available: boolean } | null,
    api: { supported: boolean, requiredFields: string[], configured: boolean },
    gitPush: { supported: boolean, requiresPreconnectedProject: true } | null
  }],
  assistantMayPublish: false
}
```

It must return neither a token hint nor provider IDs, remote URLs, raw errors, or credential values. Its description should instruct the model never to ask a user to paste a token into chat; direct them to the credential form.

Why this wins:

- Extending `deployment_preview_static_publish` conflates target validation with education, requires a target choice, and remains tied to the closed API union.
- A static capability-fact string will drift from runtime mode, CLI availability, and credential state.
- Documentation is less discoverable and cannot state live readiness.

The execute tool remains untouched and unwired. Its existing catalog deliberately marks it confirmation-gated and structurally unavailable; only the read-only preview is wired. [`publish-agent-tools.ts:24`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/src/features/deployments/publish-agent-tools.ts:24) [`publish-agent-tools.ts:140`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/src/features/deployments/publish-agent-tools.ts:140)

## SEQUENCING

1. Fund the hosted-critical vertical first: execution capability, provider registry, encrypted credential-set migration/repo/routes/source, and hosted/self-hosted disclosure for the existing GitHub Pages and Vercel adapters. Add the read-only capability tool in this phase.
2. Harden Jini’s secret-bearing HTTP paths, then add Cloudflare Pages and Netlify direct API profiles/adapters. This is more valuable than git push.
3. Add a Git-trigger adapter for Render and deliberately preconfigured custom/CI repositories. Support one transport at a time—prefer SSH deploy keys with pinned host keys—rather than pretending “git token” is universal.
4. Only then consider provider-specific Git-connection provisioning, if OAuth/App installation flows justify it.

## TRAPS

- A hosted process cannot retain the current process-wide publish status or `infra/publish/<target>` directory: both are single-workspace shapes. Key runs and ephemeral output by workspace/run, with durable status and cleanup. [`publish-site.ts:60`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/src/server/routes/admin/system/publish-site.ts:60) [`adapter.ts:111`](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/26fce7d6-9823-40d7-9909-744ecd7f0e28/scratchpad/terra-wt2/src/features/deployments/static-publish/adapter.ts:111)
- Keep `redirect: "manual"` plus redirect rejection for every authenticated provider request. INFERRED: Jini guards GitHub/Vercel, while the Netlify/Cloudflare direct adapters shown do not yet share that guard. [`redirect-guard.ts:4`](/Users/la/Programming/Jini/packages/devops/src/deploy/redirect-guard.ts:4)
- A Git adapter needs remote URL allowlisting, SSH known-host pinning, branch protection/conflict behavior, a dedicated deployment repo/branch, and a strict rule against pushing exports over a source branch.
- Cloudflare Git integration and Direct Upload are different project modes and cannot be freely switched later; show that before the user chooses.
- Validate/token-test at save time, record only a safe outcome, and fail closed on decrypt/verification failure. Never silently use another workspace’s credential or a global env fallback.
- Make credential form state ephemeral: no localStorage, query parameters, client logging, session replay, or analytics capture.
- All runtime claims above are **INFERRED** from source and current provider documentation; no tests were executed because this checkout has no `node_modules`.
