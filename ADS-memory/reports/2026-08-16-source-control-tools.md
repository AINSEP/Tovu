# Source Control agent tools — proposal

Status: **PROPOSED, not implemented.** Written per dispatch Step 1 ("propose before you build"). Nothing in `src/features/source-control/**` has been touched yet.

Scope: close the gap where `src/features/source-control/` stores a GitHub/GitLab/Bitbucket identity credential but nothing consumes it. This proposal wires an agent-tool surface that commits the site's exported content into a connected repo, gated by the same MCP-UI held-open confirmation exchange `deployment_execute_static_publish` uses.

## Research basis (what this proposal is built against)

- `src/features/source-control/{types,store,repo.memory,aad,index}.ts` — the existing identity-only slice. `store.ts` deliberately has no decrypt/resolve function yet ("the day a git-operating feature needs one, it can be added the same way `resolveForPublish`/`resolveDefaultForPublish` were added" — this proposal is that day).
- `src/features/deployments/publish-agent-tools.ts` — the shipped template for a human-gated, MCP-UI-confirmed write tool with no `actorClassRule`/`ExecutionDelegate`. Copied structurally throughout.
- `src/features/deployments/publish-credentials/store.ts:402-461` — `resolveForPublish`/`resolveDefaultForPublish`, the decrypt pattern to mirror.
- `src/features/deployments/static-publish/adapter.ts` — `publishStaticSite`'s `exportSiteLazily` (a `require()` deferred past the risk of the same circular-import crash `assistant/tool-registrations.ts -> ... -> export/index.ts -> server/app.ts -> assistant` produced once), plus its `toDeployFile` mapping from `ExportReport`.
- `/Users/la/Programming/Jini/packages/devops/src/deploy/github-pages.ts` (read-only, for research — not importable: none of its blob/tree/commit/ref helpers are exported, and this domain is deliberately not a `DeployTarget`, see below). It is the existing precedent for "no git library, plain `fetch` against GitHub's Git Data API" — blob → tree → commit → ref update. This proposal's GitHub adapter is a strict *subset* of that plumbing (no Pages-site-enable, no build-poll, no reachability-wait — none of that is a "commit source" concern) with one deliberate divergence flagged below (no `force: true`).
- `src/server/routes/types.ts:673-684` — `RouteDeps.sourceControlCredentialSetRepo` already exists and is already wired in both composition roots (`server/app.ts`, `server/deps.ts` — verified by grep, not re-read in full here). No new `RouteDeps` field is needed for the write path.
- `src/assistant/tool-registrations.ts` / `src/assistant/mcp-ui-tool-calls.ts` — the two registration points named in the dispatch.
- `src/server/routes/admin/system/source-control-credentials.ts:45` — the existing permission string `source-control.credentials.write`, already in use for the admin CRUD route. This proposal's namespace mirrors it (`source-control.read`, `source-control.commit` — permissions are free-form strings checked by `requireToolPermission`, no central enum to update).
- `src/features/deployments/publish-credentials/types.ts:53-56` — confirms `GitHubPagesConnectionInput` is `{providerId: "github-pages", token}`. Relevant to Step 2 below: the publish-side GitHub provider id is `"github-pages"`, source-control's is `"github"` — same token field shape, different id string. Reuse must map one to the other explicitly, not assume string equality.

## Tool list

Three tools. Smaller surface considered and rejected: a single "commit" tool with no capabilities read would force a dialog to be raised for calls that can't work (no credential, repo not found) — the publish domain already rejected that shape for the identical reason (`buildCapabilityGuidance`'s doc). No fourth tool for "list branches" or "list repos" — the model doesn't need repo/branch discovery; the human types or already knows the repo they're connecting (same posture the Source Control admin page itself takes: it never lists a provider's repos, it only stores a token).

### 1. `source_control_get_capabilities` — read

- `sideEffects: "none"`, `authorization: { permission: "source-control.read" }`, `inputSchema`: `NO_INPUT_SCHEMA` (no arguments — same as `deployment_get_static_publish_capabilities`).
- For each of `github`/`gitlab`/`bitbucket`: whether a credential is saved (`configured: boolean`), the saved credential sets' `{id, label, isDefault, createdAt, updatedAt}` (never a token), and a `guidance` string.
- **Deliberately does NOT report a `verified`/`ready` tri-state the way `deployment_get_static_publish_capabilities` does.** There is no `verify.ts` equivalent for source-control credentials today (grepped: none exists) — inventing one would be scope creep beyond "closing the gap," and a fabricated "ready: true" that never actually checked anything would repeat exactly the false-positive defect the publish domain's `verify.ts` header describes fixing. `configured: true` here means only "a credential row exists," and the tool description says so plainly, same honesty discipline as the *original*, pre-verify-fix `deployment_get_static_publish_capabilities`.
- For `gitlab`/`bitbucket`, `guidance` always includes "committing is not available for this provider yet" regardless of `configured` — see Provider scope below. This keeps the read tool honest and provider-agnostic even though only GitHub commits for real this pass.
- Never decrypts. Reads through `listSourceControlCredentials` (already exists, pure DB read) plus a new non-decrypting `findDefaultByProvider` presence check (repo method already exists) — no new decrypt-adjacent surface added by this tool.

### 2. `source_control_execute_commit` — write, MCP-UI gated

- `sideEffects: "mutates-durable-state"`, `authorization: { permission: "source-control.commit" }`.
- Input: `{ provider: "github", owner: string, repo: string, branch?: string, commitMessage: string }`. `provider` is in the schema (not hardcoded) so the schema stays honest about what `source_control_get_capabilities` already reports for gitlab/bitbucket, but the handler rejects anything but `"github"` today with a clear `{committed: false, reason: "unsupported-provider", message}` — before any credential check, before any dialog. See Provider scope below for why.
- No token field — structural guarantee, identical to every write tool in `publish-agent-tools.ts`.
- One call, blocking, same five-step shape as `deployment_execute_static_publish`:
  1. Validate `owner`/`repo`/`branch` shape (same char-class regexes `static-publish/adapter.ts` already uses for identical GitHub path-segment fields — reused by literal copy of the three regexes, not an import, matching that file's own "no dependency on the sibling agent-tools.ts" convention applied one level over).
  2. Check credential presence (`findDefaultByProvider`, non-decrypting) — refuse before raising a dialog if absent.
  3. Open an exchange, raise a confirmation dialog naming **exactly**: the repo (`owner/repo`), the branch (and whether it will be *created* or *advanced* — see below), the commit message, and file count from the export. Park on the answer.
  4. On confirm: decrypt (new `resolveDefaultForSourceControl`, see below), run a fresh `exportSite` pass (same lazy-import trick, source-control's own copy — see Export reuse below), build the commit via the GitHub Git Data API adapter (new, this feature's own file), advance the branch ref.
  5. Return a truthful result. See Failure contract below for the exact shape.

### 3. No third read tool

Considered `source_control_preview_commit` (mirroring `deployment_preview_static_publish`) to let the model report file counts before committing. **Rejected**: `source_control_get_capabilities` already tells the model whether it *can* commit; the confirmation dialog itself (step 3 above) is where the human sees what's about to happen, and that dialog is the honest place to compute file count — a separate preview tool would either duplicate a full `exportSite` pass (expensive, and this codebase already treats `exportSite` as "not cheap enough to run twice per commit," see `adapter.ts`'s header) or lie by reporting a stale count. One export pass per real commit attempt, not two.

## Export reuse: yes, same `exportSite`, own lazy-import copy

`static-publish/adapter.ts`'s `publishStaticSite` already runs a fresh `exportSite` pass before publishing (full re-export, `clean: true`, no base path for anything but github-pages). This proposal reuses `#src/export/index`'s `exportSite` the same way, **not** by importing `static-publish/adapter.ts`'s private `exportSiteLazily` (unexported, and cross-domain import here would recreate exactly the coupling `publish-agent-tools.ts`'s header says the two catalogs deliberately avoid) — by writing source-control's own copy of the identical `require()`-deferred pattern, with the identical comment explaining the circular-import hazard (`assistant/tool-registrations.ts -> features/source-control/agent-tools.ts -> #src/export/index -> ... -> server/app.ts -> assistant`). This is intentional duplication of a ~6-line function, not a shared helper, because the two domains must stay independently developable (the exact reason `publish-agent-tools.ts` is its own file rather than folded into `deployments/agent-tools.ts`).

No base path: a source-control commit is not a hosted site, so `computeBasePath`'s github-pages special case does not apply — `exportSite` is called with no `basePath` regardless of provider.

Committed content = the full export tree (HTML routes + assets), same `ExportedRoute`/`ExportedAsset` → `{path, data, contentType}` shape `toDeployFile` already extracts, mapped locally (own small helper, not imported — same "no dependency on the sibling catalog" rule).

**Open question for the owner/reviewer, not decided here:** commit at the target repo's root, or under a configurable subdirectory? This proposal defaults to **root** (simplest, matches every static-publish target's own no-subdirectory assumption) and treats a subdirectory option as a deliberately deferred v2 — flag if that default is wrong before I build against it.

## GitHub Git Data API adapter — new file, this feature's own

New `src/features/source-control/github-git-provider.ts` (name open to bikeshedding). Plain `fetch` against `https://api.github.com`, no new dependency — same choice `github-pages.ts` already made and this codebase already trusts. Four calls, in order:

1. `GET /repos/{owner}/{repo}` — confirms the repo exists and (if `branch` was omitted) reads `default_branch` to use. A 404 here means "repository-not-found" and is checked **before** raising the confirmation dialog, same "never raise a dialog a human can only be told 'no' through" discipline `deployment_execute_static_publish` applies to its own no-credential check.
2. `GET /repos/{owner}/{repo}/git/ref/heads/{branch}` — the branch's current tip, or 404 meaning "branch does not exist yet, will be created." Also fetches the tip commit's `tree.sha` (one more small `GET /git/commits/{sha}`, only if the branch exists) to support the no-changes check below.
3. Blob-dedup + tree creation, byte-identical logic to `github-pages.ts`'s `createGitHubTreeFromFiles` (blobs deduped by content hash, no `base_tree` — the new tree fully replaces the file listing, which is exactly right for a mirror-of-the-export commit: a file the export no longer produces silently drops out of the new tree, i.e. deletions are handled for free, not as a special case).
4. Commit creation (parent = current tip, or no parents for a brand-new branch), then ref update.

**Deliberate divergence from `github-pages.ts`: no `force: true`.** `updateGitHubRef`'s own doc there justifies `force: true` as "last publish wins" — correct for a disposable build artifact. It is wrong here: this commits into what may be someone's real, actively-used git history, and a force-push can discard commits a human made through their own normal git workflow between our ref-read and our ref-update. This adapter does a plain (non-force) ref update; GitHub rejects it with 422 "not a fast forward" if the branch moved underneath us, and that rejection is surfaced as its own distinct failure code (`diverged`, see below) rather than silently overwritten or folded into a generic provider error.

**No-changes check**: before creating a commit, compare the freshly-built tree's sha against the current branch tip's tree sha (step 2's extra `GET`). Equal ⇒ skip the commit entirely and return `{committed: false, reason: "no-changes"}` — never create an empty commit. This is a real behavior a test must cover (two commits in a row with no edits between them), not just a comment.

## Failure contract

Every branch returns a truthful, credential-free result to the same call — never throws for an expected "didn't happen" outcome, matching `deployment_execute_static_publish`'s ADR-055 Decision 6 posture.

| Situation | Result | Dialog raised? |
|---|---|---|
| No credential saved for `provider` | `{committed:false, reason:"no-credential", message}` naming the provider and pointing at the Source Control tab | No |
| `provider` is gitlab/bitbucket | `{committed:false, reason:"unsupported-provider", message}` | No |
| Repo doesn't exist / token can't see it (404 on step 1) | `{committed:false, reason:"repository-not-found", message}` | No |
| Human cancels the dialog | `{committed:false, cancelled:true}` | Yes |
| Dialog expires / run ends before an answer | `{committed:false, cancelled:false, reason:"expired"\|"abandoned"}` | Yes |
| Nothing changed since the last commit | `{committed:false, reason:"no-changes", message}` | Yes (the dialog can't know this until the export runs, which happens only after confirm — so this is discovered post-confirm, same timing `deployment_execute_static_publish` accepts for its own post-confirm export failures) |
| Branch moved (non-fast-forward) | `{committed:false, code:"DIVERGED_BRANCH", message}` — telling the human to reconcile manually, never force | Yes |
| Provider rejected the call (401/403/422 other than divergence, malformed response) | `{committed:false, code:"PROVIDER_ERROR", message}` — `message` is `err.message` only, same "never the raw response body, never a token" boundary `publish-agent-tools.ts` documents for its own catch | Yes |
| **Network unreachable** (fetch throws — DNS failure, connection refused, timeout — no HTTP response at all) | `{committed:false, code:"NETWORK_UNREACHABLE", message}` — **distinct from `PROVIDER_ERROR`** | Yes |
| Export itself fails (a route/asset failed to render) | `{committed:false, code:"EXPORT_FAILED", message}`, same contract `publishStaticSite` already has | Yes |
| Success | `{committed:true, provider, owner, repo, branch, branchCreated: boolean, commitSha, commitUrl, filesChanged: number}` | Yes |

**On the network-vs-rejected distinction specifically** (named directly in the dispatch as the defect that cost a full debugging cycle today): the adapter's four `fetch` calls are wrapped so that a **thrown** error (network-level — Node's `fetch` throws a `TypeError`/`cause`-carrying error for DNS/connection failures, never returns a `Response`) is caught and mapped to `NETWORK_UNREACHABLE` at the point of the throw, before it can be conflated with an **HTTP response that came back with a non-2xx status** (`PROVIDER_ERROR` — the request reached GitHub, and GitHub said no). These are two different `catch`/branch sites in the adapter, not one shared catch that stringifies both. A unit test asserts each maps to its own code from a faked `fetch` that (a) throws and (b) resolves 4xx, respectively — this is the direct regression-test analog of `deployment_get_static_publish_capabilities`'s own `"unreachable"` vs `"invalid"` distinction, applied to the write path instead of a cached read.

## Registration wiring

- New `src/features/source-control/tool-registrations.ts` — `buildSourceControlRegistrations(deps, surfaces)`, mirroring `buildStaticPublishRegistrations`'s shape (two exported symbols: `buildSourceControlRegistrations`, `sourceControlDerivedRisk`; `SourceControlToolDeps extends RouteDeps` plus the same test-only `buildTarget`-equivalent override for the GitHub adapter, so tests never touch real `fetch`).
- `assistant/tool-registrations.ts`: one new import block + one new `DOMAIN_SLICES` entry (`{ domain: "source-control", build: buildSourceControlRegistrations, risk: sourceControlDerivedRisk }`), placed near `static-publish` with a comment explaining why it's a fourth sibling rather than folded into either `deployments` or `static-publish` (identity/commit is a third, distinct concern from continuous-deployment and static-hosting-publish — `types.ts`'s own header already makes this case). `AssistantToolRegistryDeps` gains `& SourceControlToolDeps` in the intersection.
- `assistant/mcp-ui-tool-calls.ts`: `source_control_execute_commit` added to `MCP_UI_REDEEMABLE_TOOL_IDS`, with a comment citing the same shape-justification `deployment_execute_static_publish`'s own entry gives (opens an exchange, parks on `ctx.emitSurface`).
- These are the exact "specific registration lines" the dispatch scoped me to touch in both files — no other edit to either file.

## New decrypt function: `resolveDefaultForSourceControl`

Added to `source-control/store.ts`, byte-for-byte mirroring `resolveDefaultForPublish`'s shape and doc discipline (same "no such row (null) vs. genuine decrypt failure (thrown)" contract):

```ts
export async function resolveDefaultForSourceControl(
  deps: { repo: SourceControlCredentialSetRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; providerId: SourceControlProviderId }
): Promise<{ id: UUID; label: string; connection: SourceControlConnectionInput } | null>
```

This is the "real caller" `store.ts`'s own header said would justify adding a decrypt path — cited directly rather than invented. `resolveForSourceControl` (by-id, not just by-default) is **not** added — nothing in this proposal's tool list needs to resolve a *specific, non-default* credential set (the commit tool always resolves the provider's default, same as `deployment_execute_static_publish`'s own `credentialSource.resolve`). Adding it now would be the exact "dead code with no caller" the store.ts header warns against for the decrypt path in general.

## Step 2 — publish-credential reuse (server capability only)

Design, not yet built:

- New `src/features/source-control/reuse-publish-credential.ts` — the **one file** that imports across the `source-control` → `deployments/publish-credentials` boundary (read-only: `resolveDefaultForPublish`). This is a deliberate, one-directional dependency this proposal is introducing (never the reverse), for the specific reason the owner named ("offer to reuse the publish token"). **Flagging for explicit sign-off**: this is a real new cross-feature edge, and containing it to one file (rather than spreading the import through `store.ts`) is my proposed way to keep it auditable — say if a different placement is wanted.
- `offerPublishCredentialReuse(deps, {workspaceId}) => {available: boolean, label?: string}` — non-decrypting: `available` is true only when a default `github-pages` publish credential exists AND no default `github` source-control credential already exists yet (reuse is an *offer to fill a gap*, not a silent overwrite of something the human already set up deliberately here).
- `reusePublishCredentialForSourceControl(deps, {workspaceId, label}) => SourceControlCredentialSummary` — the actual reseal: `resolveDefaultForPublish({...}, {workspaceId, providerId: "github-pages"})` → decrypt → **remap `providerId: "github-pages"` to `"github"` explicitly** (the id-string mismatch this proposal's research section flags) → `createSourceControlCredential` with `{providerId: "github", token: connection.token}`. Never returns the token — return type is the same secret-free `SourceControlCredentialSummary` every other write in this feature already returns.
- **What the admin UI needs** (for source-control-ui, not built by me): one GET to learn whether to show a "Reuse your publish token" affordance and its label, one POST to actually do it. I am not adding the HTTP route for either — `src/server/routes/admin/system/source-control-credentials.ts` is outside the scope list I was given (`src/features/source-control/**` plus two named registration files), and it's plausible source-control-ui already owns that route file given they own the UI pages that would call it. **Asking, not assuming**: should I add the two route handlers there, or does that belong to source-control-ui? I'll hold Step 2's route wiring until this is answered; the two functions above (the actual server capability) are still mine to build either way.

## Provider scope: GitHub only, this pass

`source_control_execute_commit` implements GitHub only. GitLab (Commit API, single-call, no blob/tree/ref plumbing) and Bitbucket (`src` multipart endpoint) both need their own from-scratch adapters — no Jini precedent exists for either the way `github-pages.ts` exists for GitHub, and the dispatch's own task list (task #9: "Test committing to GitHub via the AI assistant under Source Control") only names GitHub as the near-term acceptance target. Writing GitLab/Bitbucket adapters against API shapes with no test credentials to exercise them against would be exactly the "long evidence-shaped comment that encodes inference as observation" failure mode this project has been burned by before — I'd be guessing at untested request/response shapes. Proposing GitHub-only for real implementation, with the read tool (`source_control_get_capabilities`) staying honest about gitlab/bitbucket ("credential saved, commit not available yet") rather than hiding them. **Flagging this scope call explicitly** since the dispatch didn't say GitHub-only outright — say if GitLab/Bitbucket should be in this pass too before I start.

Also **not** touching the known Bitbucket username-vs-email defect (dispatch constraint #7) — moot for this pass anyway since Bitbucket commit isn't implemented, but noting I did not build anything that assumes the stored username is correct for a future Bitbucket REST call either.

## Test plan (per dispatch rule: every behavior ships a test demonstrated RED first)

All under `src/features/source-control/**/*.test.ts`, run via `node --import tsx --test "src/features/source-control/**/*.test.ts"` from the Tovu root, scoped, per constraint #5.

- `store.unit.test.ts` (extend existing or new file): `resolveDefaultForSourceControl` — no-row returns null; decrypt-failure throws; happy path round-trips a sealed connection.
- `github-git-provider.unit.test.ts`: faked `fetch` per case — repo-not-found (404 on step 1), branch-does-not-exist-yet (creates ref), branch-exists-and-advances (fast-forward), **non-fast-forward rejection maps to `DIVERGED_BRANCH`**, **thrown fetch error maps to `NETWORK_UNREACHABLE` distinctly from a 4xx/5xx response mapping to `PROVIDER_ERROR`**, no-changes short-circuit (tree sha equality skips the commit call entirely — asserted by spying that the commit-creation fetch is never called), blob dedup (two files with identical content produce one blob call, not two).
- `tool-registrations.unit.test.ts`: `source_control_get_capabilities` never calls the sealer/decrypt path (fake sealer that throws if invoked — same proof technique `publish-agent-tools.ts`'s own header cites for its capabilities tool); `source_control_execute_commit` — no-credential returns without opening an exchange (spy on `surfaces.surfaceExchanges.open`, assert not called); confirm path runs export + commit against a faked `buildTarget`-equivalent; cancel/expired/abandoned each return their documented shape without committing.
- `reuse-publish-credential.unit.test.ts`: `offerPublishCredentialReuse` false when no publish credential exists; false when a source-control github credential already exists; true otherwise. `reusePublishCredentialForSourceControl` round-trips a fake sealed publish credential into a new source-control row with the id remapped, and the returned summary carries no token field (type-level, plus a runtime `JSON.stringify` doesn't contain the fake token value — a concrete negative assertion, not just a type claim).

## Summary of open questions for team-lead review

1. Commit at repo root only, this pass — confirm, or is a subdirectory needed now?
2. GitHub-only for real commit support this pass — confirm, or must GitLab/Bitbucket ship too?
3. Step 2's HTTP route (`source-control-credentials.ts` or a new route file) — mine to add, or source-control-ui's?
4. The one cross-feature import (`source-control/reuse-publish-credential.ts` → `deployments/publish-credentials/store.ts`) — proposed contained to one file; confirm that's an acceptable shape for this one, deliberate exception.

Nothing else in this proposal is blocked on an answer — I can start Step 1's tool-list implementation (capabilities + commit tool + GitHub adapter + registration wiring) against my own defaults above while these four are reviewed, since 1-2-4 are all reversible before I touch the two agent-registration files, and none of them change the failure contract or test plan.
