import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import type { AuthorizeFn } from "../../core/commands/index.js";
import type { SecretSealerPort } from "../webhooks/index.js";

import { askOnce, SURFACE_EXCHANGE_ID_PARAM, type AssistantSurfaceDeps, type SurfaceExchange } from "../../core/tool-surface-exchanges.js";
import { registerToolContributor } from "#src/assistant/index";
import { commitSiteToSourceControl, validateCommitTarget, type ExportSiteBoundFn, type GitHubCommitAdapter, type SourceControlCommitOutcome } from "./commit-site.js";
import { listSourceControlCredentials } from "./store.js";
import type { SourceControlCredentialSetRepoPort, SourceControlProviderId } from "./types.js";

/**
 * @file This domain's agent-tool catalog + wiring — mirrors `features/deployments/
 * publish-agent-tools.ts`'s shape closely (that file's own header explains the MCP-UI held-open
 * exchange gate this reuses; not re-derived here).
 *
 * Two tools:
 * - `source_control_get_capabilities` — read-only, risk `"none"`: reports which providers (github,
 *   gitlab, bitbucket) have a saved credential, by id/label/isDefault/timestamps only — never a
 *   token. Deliberately does NOT report a verified/ready tri-state the way
 *   `deployment_get_static_publish_capabilities` does for its own five providers — there is no
 *   `verify.ts` equivalent for `source_control_credential_sets` yet, and fabricating one would
 *   reproduce the exact false-positive defect that file's own header describes fixing (`configured:
 *   true` here means only "a credential row exists," stated plainly in this tool's description).
 *   Also reports `commitSupported` per provider — `true` for github only this pass (see
 *   `commit-site.ts`'s header on why gitlab/bitbucket have no adapter yet) — so a workspace that
 *   saved a gitlab/bitbucket credential learns from THIS tool that committing isn't available yet,
 *   never from a failed commit attempt (2026-08-16 review requirement).
 * - `source_control_execute_commit` — the MCP-UI-gated write. Same shape as
 *   `deployment_execute_static_publish`: one call opens an exchange, raises a confirmation dialog,
 *   and parks on `ctx.emitSurface` until a human answers. The model's call carries no token field —
 *   the real credential is resolved server-side, only after confirm, by `commit-site.ts`'s
 *   `commitSiteToSourceControl`. Github-only this pass (schema enum has one value) — see
 *   `commit-site.ts`'s header and the committed proposal
 *   (`ADS-memory/reports/2026-08-16-source-control-tools.md`) for why gitlab/bitbucket are deferred
 *   rather than guessed at with no test credentials to verify against.
 *
 *   Only ONE pre-dialog check exists (credential presence, a cheap non-decrypting DB read) — same
 *   "one cheap pre-check, everything else discovered after confirm" shape
 *   `deployment_execute_static_publish` holds for its own `isConfigured()` check. Repository
 *   existence, branch divergence, network reachability, and "nothing changed" are all discovered
 *   DURING the post-confirm `commitSiteToSourceControl` call, never before — a pre-dialog network
 *   touch would require decrypting the credential before a human has agreed to anything, which no
 *   MCP-UI-gated write tool in this codebase does.
 *
 * `gitAdapter` (`SourceControlToolDeps`) has NO production default yet — this dispatch's checkpoint is
 * "the gate works" before "the real GitHub network path is wired" (`github-git-provider.ts`, a
 * follow-up commit). Until that lands, a confirmed commit call fails safe with an explicit
 * `PROVIDER_ERROR` ("no GitHub commit adapter is configured — this is a wiring bug") rather than
 * crashing or silently no-op'ing — see `commit-site.ts`'s own guard for that branch. This is reachable
 * only if a real github credential exists, and none does in this environment yet (`source_control_credential_sets`
 * is empty — the owner will save a real PAT through the admin UI).
 *
 * Architectural role:
 * `features/source-control` domain logic (agent-tool layer). No dependency on
 * `features/deployments/**` — this feature's identity table, decrypt path, and git adapter are all
 * its own (see `commit-site.ts`'s header).
 */

interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** No arguments — matches `publish-agent-tools.ts`'s own `NO_INPUT_SCHEMA`, declared separately here
 *  per this file's own "no dependency on `features/deployments/**`" rule. */
const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

/** Every provider this feature can save a credential for — the fixed iteration order
 *  `source_control_get_capabilities` reports in. Sourced from `SourceControlProviderId`'s own
 *  3-member union (`types.ts`) rather than re-declared as a plain string array, so a fourth provider
 *  added there cannot silently go unreported here without a compile error at this array's own type
 *  annotation. */
const PROVIDER_IDS: readonly SourceControlProviderId[] = ["github", "gitlab", "bitbucket"];

/** Providers `source_control_execute_commit` can actually commit to today — github only. Checked
 *  against `PROVIDER_IDS` by {@link commitSupported} rather than duplicated as a second literal, so
 *  the two lists cannot silently drift apart. */
function commitSupported(providerId: SourceControlProviderId): boolean {
  return providerId === "github";
}

const EXECUTE_COMMIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["provider", "owner", "repo", "commitMessage"],
  properties: {
    provider: {
      type: "string",
      enum: ["github"],
      description:
        "Which connected source control provider to commit to. Only 'github' is supported for commits today — call source_control_get_capabilities first: a gitlab/bitbucket credential can be saved and reported there, but committing to either is not implemented yet.",
    },
    owner: { type: "string", description: "GitHub owner or organization login that owns the target repository." },
    repo: { type: "string", description: "GitHub repository name to commit to." },
    branch: {
      type: "string",
      description:
        "Branch to commit to. Optional; when omitted, the repository's own default branch is used. If the named branch does not exist yet, it is created from this commit. If it exists, this commit is added on top of its current history. NEVER force-pushed: if the branch has moved since this call's confirmation dialog was shown (someone else pushed to it), the commit is refused rather than overwriting that history — see the DIVERGED_BRANCH result below.",
    },
    commitMessage: { type: "string", description: "The git commit message. 1-500 characters." },
  },
} as const;

/**
 * This domain's fixed agent-tool catalog. Both entries are wired.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 */
export const sourceControlAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "source_control_get_capabilities",
    description:
      "Reports which source control providers (github, gitlab, bitbucket) have a saved connection for this workspace, WITHOUT decrypting or exposing any credential: for each provider, whether a credential is configured (a row exists — this is presence only, NOT a live verification that the token still works; a saved credential that GitHub has since revoked still reports configured:true here and would only be discovered as invalid by an actual commit attempt), every named credential set saved for it (id, label, isDefault, createdAt, updatedAt — NEVER a token or any part of one), and whether committing to that provider is supported yet (commitSupported: true for github only — gitlab and bitbucket credentials can be saved and are reported honestly here, but source_control_execute_commit will refuse them; do not imply to the user that saving a gitlab/bitbucket credential enables committing). Call this before telling a human what committing would do, before calling source_control_execute_commit, or whenever asked something like 'can I commit, and where'. Do NOT ask the user to paste a token into this chat — a value typed into chat is written into the conversation transcript, which is exactly what this workspace's encrypted credential store exists to avoid; tell them to connect a provider in the admin's Source Control page instead, which saves it encrypted server-side and never shows it to you.",
    sideEffects: "none",
    authorization: { permission: "source-control.read" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "source_control_execute_commit",
    description:
      "Commits the current site as a FRESH export to a GitHub repository, using the workspace's own SAVED github source control credential (configured by a human in the admin's Source Control page — this tool takes no token field of any kind; do not attempt to supply one). Only 'provider': 'github' is accepted today. HUMAN-GATED: call it with just { provider: 'github', owner, repo, commitMessage, branch? }. This ONE call shows an interactive confirmation dialog naming the repository, the branch, and the commit message, and WAITS: it does not return until the human answers or the dialog times out. There is no second call to make. If the human clicks Commit, THIS SAME CALL runs the export and commit and returns { committed: true, owner, repo, branch, branchCreated, commitSha, commitUrl, filesChanged, filesDeleted, divergedPaths } on success — filesChanged is how many files the current export wrote, filesDeleted is how many paths this same tool previously committed to this repo that are no longer part of the export and were explicitly removed from the target tree (report both to the human; a nonzero filesDeleted means real content was removed from their repository, not merely added). Only paths this tool itself previously wrote, AND whose live content still exactly matches what it wrote, are ever deleted — an existing README, workflow file, any other content already on the branch, or a page this tool once wrote that someone has since hand-edited, is never touched. divergedPaths lists any paths that fell into that last case: no longer part of the export, but preserved because their content no longer matches this tool's own record (or pre-dates this tool's ability to verify that) — tell the human these need their own manual review/cleanup if removal is still wanted. If they click Cancel, it returns { committed: false, cancelled: true, owner, repo }. If nobody answers before the dialog expires (or the run ends first), it returns { committed: false, cancelled: false, reason: 'expired' | 'abandoned' }. If no github credential is configured yet, this returns { committed: false, reason: 'no-credential', message } — pointing to the Source Control page — WITHOUT ever raising a dialog (call source_control_get_capabilities first to check readiness and avoid this). Every other failure — discovered only AFTER the human confirms, since committing needs the real credential and the export needs to run first — is returned as { committed: false, cancelled: false, code, message }: code 'REPOSITORY_NOT_FOUND' means the token cannot see that owner/repo; 'NO_CHANGES' means nothing changed since the branch's last commit, so nothing was written (this is not a failure to report as one — just tell the human nothing needed to commit); 'DIVERGED_BRANCH' means the branch moved (someone else pushed to it) since this call started — the commit was refused rather than overwriting that history, and the human needs to resolve this themselves, the same as any git push rejected for not being a fast-forward; 'NETWORK_UNREACHABLE' means the request could not reach GitHub at all (DNS/connection failure) — this says NOTHING about whether the credential is good, so do not tell the user to replace it, suggest trying again; 'PROVIDER_ERROR' means GitHub's API rejected the request (e.g. an expired or insufficient-scope token, a permission error) — the message names what went wrong, never a raw response body or the credential; 'EXPORT_FAILED' means the site itself failed to export cleanly, before any commit was attempted. Simply wait for the result and report the true outcome to the user — do not tell them a dialog is open and stop, and do not re-call this tool while a call is already pending (a fresh call raises a second, separate dialog rather than answering the first).",
    // Genuinely consequential (pushes a real commit into someone's actual git history using a
    // write-scoped external credential) — classified accordingly, cross-checked against
    // `sourceControlDerivedRisk` below at build time. Deliberately carries NO `actorClassRule` — see
    // this file's header for why the MCP-UI held-open exchange gate needs none.
    sideEffects: "mutates-durable-state",
    authorization: { permission: "source-control.commit" },
    inputSchema: EXECUTE_COMMIT_SCHEMA,
  },
];

const CATALOG_BY_ID = indexCatalogById(sourceControlAgentToolCatalog);

/**
 * This wiring layer's OWN risk classification, independent of the catalog's `sideEffects` declaration
 * (`@jini-ai/cms/core`'s `assertToolIsWirable` cross-checks the two).
 */
export const sourceControlDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> `listSourceControlCredentials` (a pure DB read, never decrypts) plus a plain `.length > 0`
  // presence check. No decrypt, no network call.
  ["source_control_get_capabilities", "none"],
  // -> on confirm, calls `commitSiteToSourceControl`: a real `exportSite` pass plus a real GitHub Git
  // Data API commit using a write-scoped credential — genuinely mutates external durable state.
  ["source_control_execute_commit", "mutates-durable-state"],
]);

/**
 * The exact slice of the route-deps bag this domain's tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root — same discipline `comments/tool-registrations.ts`'s `CommentsToolDeps`
 * documents for its own narrowing.
 *
 * 2026-08-20 RouteDeps-narrowing fix (supersedes `b6144774`'s config-only attempt, which the owner
 * rejected — see `ADS-memory/reports/2026-08-20-architecture-step2-routedeps-narrowing.md`): this
 * interface used to `extends RouteDeps` outright, on the grounds that `commitSiteToSourceControl`
 * needs the full composition-root bag to run a real `exportSite` pass. That reasoning about
 * `exportSite`'s own requirement was correct — but it does not follow that THIS interface has to name
 * `RouteDeps` to satisfy it. `exportSiteBound` below is the fix: a pre-bound export call, closed over
 * the full `RouteDeps` at the composition root (`server/app.ts`/`server/deps.ts`), threaded down as
 * one narrow field instead of the whole bag. `server/routes/*` satisfies this structurally by passing
 * its existing `RouteDeps` object (which now also carries `exportSiteBound`); nothing there changes.
 */
export interface SourceControlToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly sourceControlCredentialSetRepo: SourceControlCredentialSetRepoPort;
  readonly siteAssistantSecretSealer: SecretSealerPort;
  readonly sourceControlExportRootDir: string;
  readonly idGen: { newId(): string };
  /** See `commit-site.ts`'s `ExportSiteBoundFn` doc for what this is and why it replaces the
   *  `routeDeps: RouteDeps` field `commitSiteToSourceControl`'s input used to carry. */
  readonly exportSiteBound: ExportSiteBoundFn;
  /** The real GitHub Git Data API adapter when set (`github-git-provider.ts`, wired in a follow-up
   *  commit — see this file's header). Tests inject a fake here; production has no default yet. */
  readonly gitAdapter?: GitHubCommitAdapter;
}

const EXECUTE_COMMIT_TOOL_ID = "source_control_execute_commit";

/** The `ui://` URI for one commit-confirmation instance — keyed by the exchange id, same reasoning
 *  `publish-agent-tools.ts`'s own `publishConfirmationUri` documents (a commit has no existing
 *  row/version to key against). */
function commitConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/source-control-execute-commit/${exchangeId}` as UIResourceUri;
}

/**
 * Renders the commit confirmation dialog — the human-facing half of `source_control_execute_commit`'s
 * gate. Mirrors `buildPublishConfirmationResource` (`publish-agent-tools.ts`) closely: Jini's
 * `buildConfirmationSurface` owns HOW a confirmation dialog behaves; this function only decides WHAT a
 * commit confirmation should say.
 *
 * @complexity O(1) — a handful of fixed-size field reads.
 */
function buildCommitConfirmationResource(spec: { owner: string; repo: string; branch: string | undefined; commitMessage: string; exchangeId: string }): UIResource {
  const { owner, repo, branch, commitMessage, exchangeId } = spec;

  return buildConfirmationSurface({
    uri: commitConfirmationUri(exchangeId),
    title: `Commit the site to ${owner}/${repo}?`,
    description: "The current site content will be exported fresh and committed, using this workspace's saved GitHub source control credential.",
    details: [
      { label: "Repository", value: `${owner}/${repo}` },
      { label: "Branch", value: branch ?? "repository's default branch" },
      { label: "Commit message", value: commitMessage },
    ],
    warning:
      "This pushes a real commit to your repository. If the target branch has moved since this dialog opened, the commit is refused rather than overwriting anyone's history.",
    danger: true,
    confirm: {
      label: "Commit",
      toolName: EXECUTE_COMMIT_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    cancel: {
      label: "Cancel",
      toolName: EXECUTE_COMMIT_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-source-control-execute-commit", appVersion: "1" },
    preferredFrameSize: ["100%", "360px"],
  });
}

/** The validated, typed shape of `source_control_execute_commit`'s input, once parsed. */
interface ParsedCommitCommand {
  owner: string;
  repo: string;
  commitMessage: string;
  branch: string | undefined;
}

/**
 * Reads and validates `source_control_execute_commit`'s raw input — provider enum, then
 * owner/repo/branch/commitMessage shape via `validateCommitTarget`. Throws on any invalid field,
 * same as the inline checks this replaces; extracted so the handler itself reads as "parse, then
 * gate, then commit" instead of one long guard-clause chain.
 */
function parseCommitCommand(raw: Record<string, unknown>): ParsedCommitCommand {
  const provider = requireString(raw, "provider");
  if (provider !== "github") {
    throw new Error(
      "source_control_execute_commit: 'provider' must be 'github' — gitlab/bitbucket commits are not supported yet (see source_control_get_capabilities)."
    );
  }
  const owner = requireString(raw, "owner");
  const repo = requireString(raw, "repo");
  const commitMessage = requireString(raw, "commitMessage");
  const branch = typeof raw.branch === "string" ? raw.branch : undefined;

  const configError = validateCommitTarget({ owner, repo, ...(branch !== undefined ? { branch } : {}), commitMessage });
  if (configError !== null) {
    throw new Error(`source_control_execute_commit: ${configError}`);
  }

  return { owner, repo, commitMessage, branch };
}

/**
 * Waits for the human's answer to the commit confirmation dialog and turns it into either
 * "go ahead" or the exact not-confirmed result the tool call should return — a `SurfaceMessage`
 * status (expired/closed) or an explicit cancel are different facts, so each keeps its own
 * `reason`/`note` rather than collapsing to one generic "cancelled" shape.
 */
async function resolveCommitDecision(
  exchange: SurfaceExchange,
  ui: UIResource,
  owner: string,
  repo: string
): Promise<{ confirmed: true } | { confirmed: false; result: unknown }> {
  const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });

  if (answer.status !== "received") {
    return {
      confirmed: false,
      result: {
        committed: false,
        cancelled: false,
        reason: answer.status,
        note:
          answer.status === "expired"
            ? "The user did not respond to the commit confirmation dialog before it expired. Nothing was committed."
            : "The confirmation dialog was closed because the run ended. Nothing was committed.",
      },
    };
  }

  const decision = typeof answer.params.decision === "string" ? answer.params.decision : "confirm";
  if (decision !== "confirm") {
    return { confirmed: false, result: { committed: false, cancelled: true, owner, repo } };
  }

  return { confirmed: true };
}

/**
 * Maps `commitSiteToSourceControl`'s outcome to the tool's result shape — the failure branch stays
 * a typed `{code, message}` pass-through, the success branch reports every field a human or a
 * follow-up call might need, including `divergedPaths` (see the field's own doc at the call site).
 */
function buildCommitOutcomeResult(outcome: SourceControlCommitOutcome): unknown {
  if (!outcome.ok) {
    return { committed: false, cancelled: false, code: outcome.code, message: outcome.message };
  }
  return {
    committed: true,
    owner: outcome.owner,
    repo: outcome.repo,
    branch: outcome.branch,
    branchCreated: outcome.branchCreated,
    commitSha: outcome.commitSha,
    commitUrl: outcome.commitUrl,
    filesChanged: outcome.filesChanged,
    filesDeleted: outcome.filesDeleted,
    // Paths this tool previously committed that the current export dropped, but did NOT delete —
    // their live content no longer matches what this tool itself last wrote (or pre-dates this
    // tool's ability to verify that at all). See `commit-site.ts`'s `SourceControlCommitOutcome`
    // doc. Surfaced so the human is told exactly what survived and why, not just a bare count.
    divergedPaths: outcome.divergedPaths,
  };
}

/**
 * Builds this domain's `guidance` string for `source_control_get_capabilities` — extracted purely for
 * readability, same reasoning `publish-agent-tools.ts`'s own `buildCapabilityGuidance` gives.
 * `undefined` means "nothing to tell the human" (configured AND commit-supported).
 *
 * @complexity O(1) — fixed string interpolation, no iteration.
 */
function buildCapabilityGuidance(providerId: SourceControlProviderId, configured: boolean, commitReady: boolean): string | undefined {
  if (!configured && !commitReady) {
    return `No ${providerId} credential is saved, and committing to ${providerId} is not supported yet — only GitHub is supported for commits today.`;
  }
  if (!configured) {
    return `No ${providerId} credential is saved yet. Connect one in the admin's Source Control page.`;
  }
  if (!commitReady) {
    return `A ${providerId} credential is saved, but committing to ${providerId} is not supported yet — only GitHub is supported for commits today.`;
  }
  return undefined;
}

/**
 * Builds this domain's `ToolRegistration[]` — same shape every other domain's
 * `build<Domain>Registrations` produces.
 *
 * @param deps - `SourceControlToolDeps` (the narrow slice of `RouteDeps` this domain reads, plus
 *   this file's own test-only `gitAdapter` override).
 * @param surfaces - The held-open confirmation exchange store `source_control_execute_commit` parks
 *   on — required, matching `buildStaticPublishRegistrations`' own shape.
 * @complexity O(1) registration-time cost; each wired handler's own cost is documented at its call
 *   site above.
 */
export function buildSourceControlRegistrations(deps: SourceControlToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    source_control_get_capabilities: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "source-control.read", entityType: "source-control" });

      const saved = await listSourceControlCredentials({ repo: deps.sourceControlCredentialSetRepo }, { workspaceId: deps.workspaceId });

      const providers = PROVIDER_IDS.map((providerId) => {
        const savedCredentials = saved
          .filter((credential) => credential.providerId === providerId)
          .map((credential) => ({ id: credential.id, label: credential.label, isDefault: credential.isDefault, createdAt: credential.createdAt, updatedAt: credential.updatedAt }));
        const configured = savedCredentials.length > 0;
        const ready = commitSupported(providerId);
        const guidance = buildCapabilityGuidance(providerId, configured, ready);

        return {
          providerId,
          configured,
          commitSupported: ready,
          savedCredentials,
          ...(guidance !== undefined ? { guidance } : {}),
        };
      });

      return { providers };
    },

    /**
     * The MCP-UI-gated commit. See `buildCommitConfirmationResource` above for the surface itself
     * and this file's header for why this holds its call open rather than needing
     * `descriptor.requiresConfirmation`/an `ExecutionDelegate`.
     *
     * One call, blocking:
     *  1. Validate input shape (provider enum, owner/repo/branch/commitMessage char classes) — an
     *     explicit early check means a caller with an invalid target never causes a dialog to be
     *     raised at all, mirroring `deployment_execute_static_publish`'s own early-validation
     *     discipline.
     *  2. Check credential presence (a plain repo read, never decrypts) — a dialog a human could
     *     only ever see to be told "this can't work" wastes their attention, so a not-configured
     *     provider is refused before opening anything.
     *  3. Open an exchange, emit the confirmation surface through it, and park on the answer.
     *  4. The answer is the human's decision — confirm, cancel — or a `SurfaceMessage` saying nobody
     *     answered. Every branch returns a truthful result to the SAME call.
     *  5. On confirm, calls `commitSiteToSourceControl` — which resolves the real credential (only
     *     now, only here), runs a fresh export, and performs the real commit.
     */
    source_control_execute_commit: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      const command = parseCommitCommand(raw);

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "source-control.commit", entityType: "source-control" });

      // Fail closed rather than degrade — same posture `deployment_execute_static_publish` takes.
      if (!ctx.emitSurface) {
        throw new Error(
          "source_control_execute_commit: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a commit cannot be gated here. Nothing was committed."
        );
      }

      // Never decrypts — a plain repo read, same "presence only" contract `source_control_get_capabilities`
      // relies on. Checked before raising any dialog so a guaranteed-fail call never wastes a human's
      // attention.
      const existing = await deps.sourceControlCredentialSetRepo.findDefaultByProvider({ workspaceId: deps.workspaceId, providerId: "github" });
      if (!existing) {
        return {
          committed: false,
          reason: "no-credential",
          message: "No GitHub source control credential is configured for this workspace. Connect one in the admin's Source Control page before committing.",
        };
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open({ toolId: EXECUTE_COMMIT_TOOL_ID, principalId: ctx.principal.id }, ctx.emitSurface);
      const ui = buildCommitConfirmationResource({ ...command, exchangeId: exchange.id });

      // A cancelled run must not leave a dialog holding a call nobody is listening to — mirrors
      // `deployment_execute_static_publish`'s identical guard.
      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const decision = await resolveCommitDecision(exchange, ui, command.owner, command.repo);
        if (!decision.confirmed) return decision.result;

        const outcome = await commitSiteToSourceControl(
          { credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, ...(deps.gitAdapter ? { gitAdapter: deps.gitAdapter } : {}) },
          {
            workspaceId: deps.workspaceId,
            sourceControlExportRootDir: deps.sourceControlExportRootDir,
            idGen: deps.idGen,
            exportSiteBound: deps.exportSiteBound,
            owner: command.owner,
            repo: command.repo,
            ...(command.branch !== undefined ? { branch: command.branch } : {}),
            commitMessage: command.commitMessage,
          }
        );

        return buildCommitOutcomeResult(outcome);
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },
  };

  // No `unwiredToolIds`: this domain wires its ENTIRE catalog — a 3rd catalog entry added without a
  // handler fails the build.
  return buildDomainRegistrations({
    domain: "source-control",
    catalogModule: "features/source-control/tool-registrations.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: sourceControlDerivedRisk,
  });
}

/**
 * Contributes Source Control's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module.
 *
 * 2026-08-17: Source Control was tried for the tool-contribution registry in Stage 2 batch 2 and
 * reverted the same session — a plain relative/`#src/*` importer grep of `features/source-control`
 * itself found nothing risky (only `server/*`, `db/sqlite/*`, and admin routes — none reachable from
 * `assistant`), but that grep missed the real path: `assistant/tool-registrations.ts` already
 * value-imports `createVendorCredential`/`listVendorCredentials`/`PUBLISH_PROVIDER_TO_VENDOR`/
 * `updateVendorCredential` from `features/vendor-credentials/index` (for
 * `StaticPublishToolDeps.vendorCredentials`'s real implementation), and
 * `features/vendor-credentials/dual-read.ts` itself value-imported `resolveDefaultForSourceControl`
 * from `../source-control/store` for its legacy-fallback read. So `assistant` reached INTO this
 * domain transitively through `vendor-credentials`, even though nothing reached OUT of it that way.
 * Adding `registerToolContributor` here (a `source-control -> assistant` edge) closed a real
 * 3-module cycle: `assistant, features/source-control, features/vendor-credentials` (confirmed via
 * `check:architecture --list`: largest strongly-connected component, runtime-only, went 0 -> 3).
 *
 * Retried and landed here per
 * `ADS-memory/reports/architecture/2026-08-17-vendor-credentials-cycle-design-options.md` (Option
 * B): `dual-read.ts`'s two legacy-table value imports (`resolveDefaultForPublish`/
 * `resolveDefaultForSourceControl`) are now injected via `VendorCredentialDualReadDeps`, typed with
 * locally-declared structural signatures instead of imported function types — see that file's own
 * header. That removes the `features/vendor-credentials -> features/source-control` edge outright
 * (the `assistant -> vendor-credentials` edge for `list`/`create`/`update`/`providerToVendor` stays,
 * but it no longer reaches this domain transitively). `check:architecture` now reports 0 module
 * cycles / largest SCC 0 with Source Control wired this way.
 */
export function contributeSourceControlTools(): void {
  registerToolContributor({ domain: "source-control", build: buildSourceControlRegistrations, risk: sourceControlDerivedRisk });
}
