import { type Clock } from "@jini-ai/core/primitives";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { buildDomainRegistrations, indexCatalogById, optionalBoolean, requireInputRecord, requireNoInput, requireString, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
// `ToolInputError` specifically — see `features/post/tool-registrations.ts`'s identical import
// for why: the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a rejection 400 rather
// than redacting it into a message-stripped 500.
import { ToolInputError } from "@jini-ai/core";
import { type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";

import { type AssistantSurfaceDeps } from "../../contracts/core/tool-surface-exchanges.js";
import type { ToolContributor } from "#src/assistant/index";
import {
  commitSiteToSourceControl,
  previewCommitExport,
  validateCommitTarget,
  type ExportSiteBoundFn,
  type SourceControlCommitAdapter,
  type SourceControlCommitOutcome,
} from "./commit-site.js";
import {
  buildSourceControlProvider,
  loadInstalledSourceControlProviders,
  switchedOffPluginSentence,
  type LoadSourceControlProviders,
  type SourceControlProviderDescriptor,
  type SourceControlProviderRegistry,
} from "./provider-registry.js";
import type { RepositoryTargetValidator } from "./provider-module.js";
import { proposeSourceControlCredential } from "./credential-setup.js";
import { isSourceControlProviderId } from "./store.js";
import { listSourceControlCredentials } from "./store.js";
import type { SourceControlCredentialSetRepoPort } from "./types.js";
import type { ObservabilityPort } from "../../platform/observability/index.js";

/**
 * @file This domain's agent-tool catalog + wiring — mirrors `features/deployments/
 * publish-agent-tools.ts`'s shape closely (that file's own header explains the MCP-UI held-open
 * exchange gate this reuses; not re-derived here).
 *
 * Three tools:
 * - `source_control_propose_credential` — opens a provider-defined human form and creates a sealed connection; no secret crosses the model boundary.
 * - `source_control_get_capabilities` — read-only, risk `"none"`: reports which providers (github,
 *   gitlab, bitbucket) have a saved credential, by id/label/isDefault/timestamps only — never a
 *   token. Deliberately does NOT report a verified/ready tri-state the way
 *   `deployment_get_static_publish_capabilities` does for its own five providers — there is no
 *   `verify.ts` equivalent for `source_control_credential_sets` yet, and fabricating one would
 *   reproduce the exact false-positive defect that file's own header describes fixing (`configured:
 *   true` here means only "a credential row exists," stated plainly in this tool's description).
 *   Also reports `commitSupported` per provider — `true` when an enabled Agent Plugin provides that
 *   host (`provider-registry.ts`; the bundled `github` plugin today) — so a workspace that saved a
 *   credential for a host no plugin serves learns from THIS tool that committing isn't available,
 *   never from a failed commit attempt (2026-08-16 review requirement).
 * - `source_control_execute_commit` performs an authorized Git commit after the shared approval gate (owner 2026-10-07). Provider,
 *   credential, target and branch checks still apply; existing Git history preserves overwritten
 *   files. Credentials remain server-side and are never included in the model's call or result.
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

/** A declared host's facts as `source_control_get_capabilities` reports them. @complexity O(1). */
function hostFacts(descriptor: SourceControlProviderDescriptor): { label: string; apiOrigin: string; maxFileBytes?: number } {
  return { label: descriptor.label, apiOrigin: descriptor.apiOrigin, ...(descriptor.maxFileBytes !== undefined ? { maxFileBytes: descriptor.maxFileBytes } : {}) };
}

/**
 * The hosts `source_control_get_capabilities` reports, in order: the ones an enabled plugin provides
 * (registry order), then ones a switched-off plugin declares, then any other host a credential is
 * saved for. No host id is hard-coded here; the registry and the saved rows are the whole list.
 *
 * @complexity O(p + s) providers plus saved credentials.
 */
function reportedProviderIds(registry: SourceControlProviderRegistry, savedProviderIds: readonly string[]): readonly string[] {
  const ids = [...registry.list().map((loaded) => loaded.descriptor.id), ...(registry.switchedOff?.keys() ?? []), ...savedProviderIds];
  return [...new Set(ids)];
}

/** The loader for the workspace's plugin-provided hosts ({@link SourceControlToolDeps.loadSourceControlProviders}),
 *  resolved once here so `credential-setup.ts` takes it as a required port. */
function providerLoader(deps: SourceControlToolDeps): LoadSourceControlProviders {
  return deps.loadSourceControlProviders ?? loadInstalledSourceControlProviders;
}

/** The injected adapter, or the plugin provider's for `providerId`; a caller-safe refusal otherwise. */
async function resolveCommitAdapter(deps: SourceControlToolDeps, providerId: string): Promise<{ ok: true; adapter: SourceControlCommitAdapter } | { ok: false; message: string }> {
  if (deps.gitAdapter) return { ok: true, adapter: deps.gitAdapter };
  const built = await buildSourceControlProvider({ ...(deps.loadSourceControlProviders ? { load: deps.loadSourceControlProviders } : {}), observability: deps.observability, workspaceId: deps.workspaceId, providerId });
  return built.ok ? { ok: true, adapter: { commit: built.provider.commitSite } } : { ok: false, message: built.message };
}

/**
 * The host's display name for `providerId` and its plugin's own owner/repo check, refusing an id no
 * plugin declares and no credential can be saved for (a typo, or a host that does not exist) before
 * anything else runs. A switched-off or saved-only host has no check of its own; the generic rule in
 * `validateCommitTarget` still applies.
 *
 * @throws {ToolInputError} naming the hosts that do exist.
 * @complexity One registry load.
 */
async function requireKnownHost(deps: SourceControlToolDeps, providerId: string): Promise<{ label: string; validateTarget?: RepositoryTargetValidator }> {
  const registry = await providerLoader(deps)(deps.workspaceId);
  const loaded = registry.get(providerId);
  if (loaded !== undefined) return { label: loaded.descriptor.label, ...(loaded.module.validateTarget ? { validateTarget: loaded.module.validateTarget } : {}) };
  if (registry.switchedOff?.has(providerId) || isSourceControlProviderId(providerId)) return { label: providerId };
  const hosts = registry.list().map((loaded) => `'${loaded.descriptor.id}'`);
  throw new ToolInputError({ message: `source_control_execute_commit: '${providerId}' is not a source control host. ${hosts.length > 0 ? `Hosts: ${hosts.join(", ")}` : "No turned-on Agent Plugin provides one"} (see source_control_get_capabilities).` });
}

/** The saved default credential for `providerId`, never decrypted; `null` for a host the credential
 *  store cannot hold. @complexity One repo read. */
async function findSavedDefault(deps: SourceControlToolDeps, providerId: string) {
  if (!isSourceControlProviderId(providerId)) return null;
  return deps.sourceControlCredentialSetRepo.findDefaultByProvider({ workspaceId: deps.workspaceId, providerId });
}

const EXECUTE_COMMIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["provider", "owner", "repo", "commitMessage"],
  properties: {
    provider: {
      type: "string",
      description:
        "Which source control host to commit to: a providerId source_control_get_capabilities lists with commitSupported: true. Call that first; a host listed with commitSupported: false is refused.",
    },
    owner: { type: "string", description: "Owner or organization login that owns the target repository on the host." },
    repo: { type: "string", description: "Repository name to commit to." },
    branch: {
      type: "string",
      description:
        "Branch to commit to. Optional; when omitted, the repository's own default branch is used. If the named branch does not exist yet, it is created from this commit. If it exists, this commit is added on top of its current history. NEVER force-pushed: if the branch has moved since this call read its head (someone else pushed to it), the commit is refused rather than overwriting that history, and the result is {committed:false, code:'DIVERGED_BRANCH'}.",
    },
    commitMessage: { type: "string", description: "The git commit message. 1-500 characters." },
    dryRun: {
      type: "boolean",
      description:
        "Pass dryRun: true first to see how many files the export would commit, without contacting the host. Optional; defaults to false.",
    },
  },
} as const;

/**
 * This domain's fixed agent-tool catalog. Every entry is wired.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 */
export const sourceControlAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "source_control_propose_credential",
    description: "Opens a human form to connect a source control provider for commits or repository backup. Call when no saved credential exists; the person types the token directly into the form and the server seals it. Supply only provider and optional label, never a secret. Before calling it, tell the person the repository rules and ask which repository to use (source_control_get_capabilities guidance). This call waits for submission or cancellation, then returns {saved, credentialId, provider, label}; when nothing was saved it also returns cancelled (true only when the person pressed Cancel) and message saying why — report that, not a guess. Only enabled providers with declared forms are supported. Permission denied or absent form channel refuses the call; invalid form data or a failed save returns saved:false. Creates a credential; editing and deleting remain admin-only. Use source_control_get_capabilities to inspect hosts and saved connections.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "source-control.credentials.write" },
    inputSchema: { type: "object", additionalProperties: false, required: ["provider"], properties: {
      provider: { type: "string", enum: ["github", "gitlab", "bitbucket"], description: "An enabled host listed by source_control_get_capabilities with a declared credential form." },
      label: { type: "string", maxLength: 200, description: "Optional non-secret label to prefill in the human form." },
    } },
  },
  {
    name: "source_control_get_capabilities",
    description:
      "Reports the source control hosts for this workspace — every host a turned-on Agent Plugin provides, every host a plugin declares but is switched off, and every host that has a saved connection — WITHOUT decrypting or exposing any credential. For each provider: providerId; label, apiOrigin (the API base URL a saved custom credential for that host points at) and maxFileBytes (the largest single file the host accepts in a push; absent when it declares none), when a plugin declares the host; whether a credential is configured (a row exists — this is presence only, NOT a live verification that the token still works; a saved credential that the host has since revoked still reports configured:true here and would only be discovered as invalid by an actual commit attempt), every named credential set saved for it (id, label, isDefault, createdAt, updatedAt — NEVER a token or any part of one), and whether committing to that provider is supported yet (commitSupported: true only when an enabled Agent Plugin provides committing to that host; a credential for any other host can be saved and is reported honestly here, but source_control_execute_commit will refuse it; do not imply to the user that saving such a credential enables committing). Call this before telling a human what committing would do, before calling source_control_execute_commit, or whenever asked something like 'can I commit, and where'. Do NOT ask the user to paste a token into this chat — a value typed into chat is written into the conversation transcript, which is exactly what this workspace's encrypted credential store exists to avoid; call source_control_propose_credential to open a human form, which saves it encrypted server-side and never shows it to you.",
    sideEffects: "none",
    authorization: { permission: "source-control.read" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "source_control_execute_commit",
    description:
      "Commits a fresh site export to a source control repository using its saved credential. Requires human approval before exporting to the remote repository with {provider, owner, repo, commitMessage, branch?}; provider must be listed by source_control_get_capabilities with commitSupported:true. Pass dryRun:true to preview files and bytes without contacting the host. Returns {committed:true, owner, repo, branch, branchCreated, commitSha, commitUrl, filesChanged, filesDeleted, divergedPaths}. Reports deleted and diverged paths; only previously exported paths whose live content still matches the export may be removed. Other files and human edits are preserved. Git history retains prior content. Returns {committed:false, reason, message} when the credential or provider is unavailable, and {committed:false, cancelled:false, code, message} when the commit itself fails. Never accepts or exposes a token. Requires source-control.commit.",
    // Genuinely consequential (pushes a real commit into someone's actual git history using a
    // write-scoped external credential) — classified accordingly, cross-checked against
    // `sourceControlDerivedRisk` below at build time. Deliberately carries NO `actorClassRule` — see
    // this file's header for why the MCP-UI held-open exchange gate needs none.
    sideEffects: "mutates-durable-state",
    authorization: { permission: "source-control.commit" },
    inputSchema: EXECUTE_COMMIT_SCHEMA,
  },
];

const CATALOG_BY_ID = indexCatalogById({ catalog: sourceControlAgentToolCatalog });

/**
 * This wiring layer's OWN risk classification, independent of the catalog's `sideEffects` declaration
 * (`@jini-ai/cms/core`'s `assertToolIsWirable` cross-checks the two).
 */
export const sourceControlDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> `listSourceControlCredentials` (a pure DB read, never decrypts) plus a plain `.length > 0`
  // presence check. No decrypt, no network call.
  ["source_control_get_capabilities", "none"],
  // -> proposeSourceControlCredential -> createSourceControlCredential: seals and inserts a saved connection after human submit.
  ["source_control_propose_credential", "mutates-durable-state"],
  // -> calls `commitSiteToSourceControl`: a real `exportSite` pass plus a real GitHub Git
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
  readonly siteAssistantSecretKeyring: KeyringPort;
  readonly clock: Clock;
  /** Overrides only the existing save-time provider identity probe in tests. */
  readonly fetchFn?: typeof fetch;
  /** `RouteDeps.observability`: a commit's git-host calls are outbound spans. */
  readonly observability?: ObservabilityPort;
  readonly sourceControlExportRootDir: string;
  readonly idGen: { newId(): string };
  /** See `commit-site.ts`'s `ExportSiteBoundFn` doc for what this is and why it replaces the
   *  `routeDeps: RouteDeps` field `commitSiteToSourceControl`'s input used to carry. */
  readonly exportSiteBound: ExportSiteBoundFn;
  /** Overrides the plugin provider's commit adapter, which is the default when this is omitted.
   *  Tests inject a fake here. */
  readonly gitAdapter?: SourceControlCommitAdapter;
  /** This workspace's git-host providers; the installed, enabled Agent Plugins when omitted. */
  readonly loadSourceControlProviders?: LoadSourceControlProviders;
}

const EXECUTE_COMMIT_TOOL_ID = "source_control_execute_commit";

/** The validated, typed shape of `source_control_execute_commit`'s input, once parsed. */
interface ParsedCommitCommand {
  provider: string;
  owner: string;
  repo: string;
  commitMessage: string;
  branch: string | undefined;
  dryRun: boolean;
}

/** Reads `source_control_execute_commit`'s raw input; {@link requireValidTarget} checks it once the
 *  host is known. @throws {ToolInputError} on a missing or non-string required field, or a present
 *  non-string `branch` (dropping it would commit to the default branch the model did not name). */
function parseCommitCommand(raw: Record<string, unknown>): ParsedCommitCommand {
  const provider = requireString({ input: raw, key: "provider" });
  const owner = requireString({ input: raw, key: "owner" });
  const repo = requireString({ input: raw, key: "repo" });
  const commitMessage = requireString({ input: raw, key: "commitMessage" });
  if (raw.branch !== undefined && typeof raw.branch !== "string") {
    throw new ToolInputError({ message: `${EXECUTE_COMMIT_TOOL_ID}: 'branch' must be a string when provided` });
  }
  const branch = raw.branch;
  const dryRun = optionalBoolean({ input: raw, key: "dryRun" }) ?? false;
  return { provider, owner, repo, commitMessage, branch, dryRun };
}

/**
 * The owner/repo/branch/commitMessage shape via `validateCommitTarget`, with the host plugin's own
 * owner/repo rules first. Runs before any permission check or dialog.
 *
 * @throws {ToolInputError} on any invalid field.
 * @complexity O(1).
 */
function requireValidTarget(command: ParsedCommitCommand, validateTarget: RepositoryTargetValidator | undefined): void {
  const { owner, repo, branch, commitMessage } = command;
  const configError = validateCommitTarget({ owner, repo, ...(branch !== undefined ? { branch } : {}), commitMessage }, validateTarget);
  if (configError !== null) {
    throw new ToolInputError({ message: `source_control_execute_commit: ${configError}` });
  }
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
function buildCapabilityGuidance(providerId: string, configured: boolean, commitReady: boolean, switchedOffPluginId: string | undefined): string | undefined {
  const switchOn = switchedOffPluginId === undefined ? "" : `: ${switchedOffPluginSentence(switchedOffPluginId)}`;
  if (!configured && !commitReady) {
    return `No ${providerId} credential is saved, and no enabled Agent Plugin supports committing to ${providerId}${switchOn || "."}`;
  }
  if (!configured) {
    // Demo dry run 2026-10-05: the token form opened before the person had heard any of this.
    return `No ${providerId} credential is saved yet. First tell the person what is needed and ask which repository (owner/name) to use: ` +
      "for a site backup it must be private and already have at least one commit (for example a README), and the token needs " +
      "Contents read and write on it. Then call source_control_propose_credential to open the human credential form.";
  }
  if (!commitReady) {
    return `A ${providerId} credential is saved, but no enabled Agent Plugin supports committing to ${providerId}${switchOn || "."}`;
  }
  return undefined;
}

/**
 * Builds this domain's `ToolRegistration[]` — same shape every other domain's
 * `build<Domain>Registrations` produces.
 *
 * @param deps - `SourceControlToolDeps` (the narrow slice of `RouteDeps` this domain reads, plus
 *   this file's own test-only `gitAdapter` override).
 * @param surfaces - The surface exchange store used by the credential setup forms; commits run
 *   on — required, matching `buildStaticPublishRegistrations`' own shape.
 * @complexity O(1) registration-time cost; each wired handler's own cost is documented at its call
 *   site above.
 */
export function buildSourceControlRegistrations(deps: SourceControlToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    source_control_propose_credential: (ctx, optional = {}) => proposeSourceControlCredential({ ctx, deps: { ...deps, loadSourceControlProviders: providerLoader(deps) }, surfaces }, optional),
    source_control_get_capabilities: async (ctx) => {
      requireNoInput({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "source-control.read" }, { entityType: "source-control" });

      const saved = await listSourceControlCredentials({ repo: deps.sourceControlCredentialSetRepo }, { workspaceId: deps.workspaceId });
      const registry = await providerLoader(deps)(deps.workspaceId);

      const providers = reportedProviderIds(registry, saved.map((credential) => credential.providerId)).map((providerId) => {
        const savedCredentials = saved
          .filter((credential) => credential.providerId === providerId)
          .map((credential) => ({ id: credential.id, label: credential.label, isDefault: credential.isDefault, createdAt: credential.createdAt, updatedAt: credential.updatedAt }));
        const configured = savedCredentials.length > 0;
        const loaded = registry.get(providerId);
        const ready = loaded !== undefined;
        const guidance = buildCapabilityGuidance(providerId, configured, ready, registry.switchedOff?.get(providerId));

        return {
          providerId,
          ...(loaded ? hostFacts(loaded.descriptor) : {}),
          configured,
          commitSupported: ready,
          savedCredentials,
          ...(guidance !== undefined ? { guidance } : {}),
        };
      });

      return { providers };
    },

    /** Shared owner 2026-10-07 approval precedes real export commits, which can remove stale paths;
     * dry-run previews stay direct. Target, credential and branch checks remain. */
    source_control_execute_commit: async (ctx) => {
      const raw = requireInputRecord({ input: ctx.input });
      const command = parseCommitCommand(raw);

      const host = await requireKnownHost(deps, command.provider);
      const hostLabel = host.label;
      requireValidTarget(command, host.validateTarget);
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "source-control.commit" }, { entityType: "source-control" });

      if (command.dryRun) {
        // Same "presence only" read `source_control_get_capabilities` and the real-commit path
        // below both rely on — never decrypts. No dialog: a dry run only previews what a real
        // commit would export, so it never opens the confirmation surface or touches `emitSurface`.
        const existing = await findSavedDefault(deps, command.provider);
        const preview = await previewCommitExport({
          workspaceId: deps.workspaceId,
          sourceControlExportRootDir: deps.sourceControlExportRootDir,
          idGen: deps.idGen,
          exportSiteBound: deps.exportSiteBound,
          owner: command.owner,
          repo: command.repo,
          ...(command.branch !== undefined ? { branch: command.branch } : {}),
          commitMessage: command.commitMessage,
        }, host.validateTarget);
        if (!preview.ok) {
          return {
            dryRun: true,
            committed: false,
            owner: command.owner,
            repo: command.repo,
            branch: command.branch,
            credentialConfigured: existing !== null,
            code: preview.code,
            message: preview.message,
          };
        }
        return {
          dryRun: true,
          committed: false,
          owner: command.owner,
          repo: command.repo,
          branch: command.branch,
          credentialConfigured: existing !== null,
          fileCount: preview.fileCount,
          totalBytes: preview.totalBytes,
          paths: preview.paths,
          note: "Nothing was sent. Call again without dryRun to commit.",
        };
      }

      // Never decrypts — a plain repo read, same "presence only" contract `source_control_get_capabilities`
      // relies on. Checked before raising any dialog so a guaranteed-fail call never wastes a human's
      // attention.
      const existing = await findSavedDefault(deps, command.provider);
      if (!existing) {
        return {
          committed: false,
          reason: "no-credential",
          message: `No ${hostLabel} source control credential is configured for this workspace. Call source_control_propose_credential to open a human credential form before committing.`,
        };
      }
      const commitAdapter = await resolveCommitAdapter(deps, command.provider);
      if (!commitAdapter.ok) return { committed: false, reason: "no-provider", message: commitAdapter.message };

      // The run ended during the pre-dialog reads: no dialog, and no call left waiting on an abort already past.
      if (ctx.signal.aborted) return { committed: false, cancelled: false, reason: "abandoned" };
      const outcome = await commitSiteToSourceControl(
        { providerId: existing.providerId, credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: commitAdapter.adapter, ...(host.validateTarget ? { validateTarget: host.validateTarget } : {}) },
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
export function contributeSourceControlTools(): ToolContributor {
  return { domain: "source-control", build: buildSourceControlRegistrations, risk: sourceControlDerivedRisk };
}
