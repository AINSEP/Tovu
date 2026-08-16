/**
 * @file The static-publish sub-feature's agent-tool catalog + wiring (ADR-049 Decision 4's
 * per-domain split, `static-publish/`'s half — see that directory's `types.ts` header for why it is
 * a separate module tree from this directory's sibling `agent-tools.ts`/`tool-registrations.ts`,
 * which cover the continuous-deployment/export/Dockerfile tools instead).
 *
 * Purpose:
 * Deliberately its OWN file, not folded into the sibling `agent-tools.ts`/`tool-registrations.ts` —
 * that split let a concurrent agent own those two files plus `assistant/tool-registrations.ts`'s
 * wiring pass without colliding with this one. That wiring has since landed: `assistant/
 * tool-registrations.ts` imports this file's catalog (its own `deployments/publish-agent-tools`
 * import) and invokes it alongside every other domain's registrations — see that file's own
 * `deployment_preview_static_publish` comment for the wired half of this story.
 *
 * Risk classification (brief: "not boilerplate here"). This domain's sibling `agent-tools.ts` notes
 * its own five tools are ALL plain `mutates-durable-state` with no excluded/token-gated entry,
 * specifically because none of them "touches the running site's own database or content" or leaves
 * this process. Publishing is the one operation in this whole domain that breaks that pattern: it
 * sends the current site's content to the PUBLIC INTERNET using a credential with WRITE access to
 * the owner's external GitHub/Vercel account, and the result is immediately live — potentially
 * crawled, cached, or indexed within seconds. That is irreversible in the sense that matters (a
 * later republish overwrites what is HOSTED, never what was already public), which puts it in the
 * same class `recovery/agent-tools.ts` reserves for `backup_execute_restore` and
 * `database/agent-tools.ts` reserves for `database_execute_migrate_forward` — both declared with
 * `actorClassRule: "confirmer-must-equal-own-delegatedBy"` and BOTH deliberately never wired,
 * because `@jini-ai/cms/core`'s `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` refuses to
 * build any tool carrying that rule until a real human-confirmation transport exists (verified by
 * reading `registration-kit.ts`'s own guard — this is a structural build-time refusal, not a
 * convention this file has to remember to honor). No such transport exists for a publish "ceremony"
 * yet (no admin-UI confirm-token minting flow, unlike Recovery's own restore ceremony), so
 * `deployment_execute_static_publish` below gets the IDENTICAL treatment: declared, at least as
 * seriously classified as those two precedents, and deliberately unwired. The only real execute path
 * is the human-session admin route (`server/routes/admin/system/publish-site.ts`, cookie-authed, not
 * reachable via any tool call).
 *
 * What IS wired is `deployment_preview_static_publish` — read-only, zero side effects, and reports
 * exactly the facts a model needs before ever suggesting a publish: whether the target's own
 * required fields are valid, the base path a github-pages publish would compute (`/${repo}` —
 * always DERIVED, never caller-supplied, per `static-publish/adapter.ts`'s own base-path
 * discipline), and whether a credential is even configured (a boolean only — see `resolve()`'s own
 * contract, this never touches, echoes, or logs the token itself).
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes the catalog below to decide which tool names an
 * agent session may see at all; `requireToolPermission` enforces the actual permission check at call
 * time — this module performs the one preview read plus that one permission check, nothing else.
 *
 * Architectural role:
 * `features/deployments/static-publish` domain logic (agent-tool layer). Depends only on
 * `./static-publish/index` and `@jini-ai/cms/core`'s registration kit — no dependency on this
 * directory's sibling `agent-tools.ts`/`tool-registrations.ts`/`ports.ts`/`types.ts`.
 */
import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolActorClassRule,
  type AgentToolSideEffect,
  type AuthorizeFn,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import {
  composePublishCredentialSource,
  computeBasePath,
  createEnvPublishCredentialSource,
  publishStaticSite,
  validateStaticPublishConfig,
  type DbPublishCredentialSourceDeps,
  type PublishCredentialSource,
  type StaticPublishConfig,
  type StaticPublishTargetId,
} from "./static-publish/index";
import type { PublishExecutionMode } from "./publish-credentials/execution-mode";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  actorClassRule?: AgentToolActorClassRule;
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** `deployment_preview_static_publish`'s input — the same target-discriminated shape
 *  `publish-site.ts`'s trigger route body uses, minus `projectName` (a preview never runs a real
 *  publish, so there is no commit-message/project-name label to validate). */
const PREVIEW_STATIC_PUBLISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["target"],
  properties: {
    target: {
      type: "string",
      enum: ["github-pages", "vercel", "netlify", "cloudflare-pages"],
      description:
        "Which host to preview publishing to. 'github-pages' publishes to the gh-pages branch of a GitHub repo and serves from a /<repo> subpath (a GitHub Pages PROJECT site) — the exported site's base path is always rewritten to match, automatically. 'vercel'/'netlify'/'cloudflare-pages' all serve from the domain root and must NOT carry a base path.",
    },
    owner: {
      type: "string",
      description: "GitHub owner or organization login. Required (and only used) when target is 'github-pages'.",
    },
    repo: {
      type: "string",
      description:
        "GitHub repository name. Required (and only used) when target is 'github-pages' — this also determines the base path (/<repo>) every published link will be rewritten to use, so it must exactly match the real repo name.",
    },
    branch: {
      type: "string",
      description: "GitHub Pages publish branch. Optional; defaults to 'gh-pages' if omitted. Only used when target is 'github-pages'.",
    },
    teamId: {
      type: "string",
      description: "Vercel team id. Optional; only used when target is 'vercel'.",
    },
  },
} as const;

/**
 * This domain's fixed agent-tool catalog. Two entries: one wired read-only preview, one declared
 * but permanently unwired execute — see this file's own header for why both are shaped this way.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 */
export const staticPublishAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "deployment_preview_static_publish",
    description:
      "Previews publishing the current site to GitHub Pages, Vercel, Netlify, or Cloudflare Pages WITHOUT publishing anything: validates the target config, reports the base path a real publish would use (always /<repo> for github-pages, never set for the other three — this is computed automatically and cannot be overridden, so it can never mismatch the export), and reports whether a publish credential is configured for that target (true/false only — never the credential itself). Use this before telling a human what a publish would do, or to check readiness. This tool NEVER publishes, writes, or sends anything anywhere — it is a pure read.",
    sideEffects: "none",
    authorization: { permission: "deployments.read" },
    inputSchema: PREVIEW_STATIC_PUBLISH_SCHEMA,
  },
  {
    // Declared, never wired — see this file's header for the full reasoning. Mirrors
    // `recovery/agent-tools.ts`'s `backup_execute_restore` and `database/agent-tools.ts`'s
    // `database_execute_migrate_forward`: same actorClassRule, same structural build-time refusal
    // (`ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` in `@jini-ai/cms/core`'s
    // registration-kit), same "no confirmation-token transport exists for this yet" root cause.
    name: "deployment_execute_static_publish",
    description:
      "Publishes the current site as a static export to GitHub Pages, Vercel, Netlify, or Cloudflare Pages, using a credential with WRITE access to the owner's external account. The result is immediately live on the public internet and may be crawled, cached, or indexed within seconds — irreversible in the sense that matters, since a later republish overwrites what is HOSTED but can never retract what was already public. NEVER agent-callable: publishing requires a human to trigger it through the admin Deployment panel (server/routes/admin/system/publish-site.ts), which authenticates by browser session, not a tool call. No confirmation-token transport exists for this domain yet, so this tool is declared for documentation/risk-classification purposes only and is deliberately never wired — calling it is not possible.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "deployments.publish" },
    actorClassRule: "confirmer-must-equal-own-delegatedBy",
  },
];

const CATALOG_BY_ID = indexCatalogById(staticPublishAgentToolCatalog);

/** Catalog ids deliberately left unwired, with the reason recorded once here (mirrors
 *  `recovery/tool-registrations.ts`'s own `UNWIRED_RECOVERY_TOOL_IDS` constant shape) — consumed by
 *  `buildDomainRegistrations`'s own "every catalog entry is either wired or declared unwired"
 *  tripwire, so a future edit that adds a handler for this id without deliberately choosing to do so
 *  cannot silently slip through: wiring it will fail the build via
 *  `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` (see this file's header) the moment a
 *  handler is added, not fail silently now. */
const UNWIRED_STATIC_PUBLISH_TOOL_IDS = new Set<string>(["deployment_execute_static_publish"]);

/**
 * This wiring layer's OWN risk classification, independent of the catalog's `sideEffects`
 * declaration (`@jini-ai/cms/core`'s `assertToolIsWirable` cross-checks the two and refuses to wire
 * on disagreement). Only the WIRED tool gets an entry — `mergeDerivedRiskMaps`' own contract (see
 * `registration-kit.ts`) is that an unwired tool contributes none, so a future cross-domain risk
 * merge is never asked to reconcile a classification for a tool nothing can ever call.
 */
export const staticPublishDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> resolves credential presence (`PublishCredentialSource.resolve`, read-only: an env var
  // lookup) and validates config shape (`validateStaticPublishConfig`, pure). No filesystem write,
  // no network call, no export run — a preview never calls `publishStaticSite` at all.
  ["deployment_preview_static_publish", "none"],
]);

/** The exact slice of the route-deps bag this domain's tool handler reads. Declared structurally
 *  (mirrors `RecoveryToolDeps`'s own reasoning) rather than importing `server/routes/types`'s
 *  `RouteDeps`, so this module carries no back-edge into the composition root. */
export interface StaticPublishToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  /** Pre-built source (tests inject a fake here). When omitted, one is composed from
   *  `dbCredentialDeps`/`executionMode` below — see `buildStaticPublishRegistrations`'s own doc. */
  credentialSource?: PublishCredentialSource;
  /** Omitted only in tests that pass `credentialSource` directly — a real caller always has a
   *  `publishCredentialSetRepo`/`siteAssistantSecretSealer` pair (`RouteDeps`'s own fields) to pass
   *  through here. Declared as this narrow shape rather than importing `RouteDeps` itself, so this
   *  module still carries no back-edge into the composition root (this file's own header). */
  dbCredentialDeps?: DbPublishCredentialSourceDeps;
  /** Defaults to `"self-hosted-cli"` — see `publish-credentials/execution-mode.ts`'s own safe-default
   *  reasoning. */
  executionMode?: PublishExecutionMode;
}

function buildPreviewConfig(raw: Record<string, unknown>): StaticPublishConfig {
  const target = raw.target as StaticPublishTargetId;
  if (target === "github-pages") {
    const owner = typeof raw.owner === "string" ? raw.owner : "";
    const repo = typeof raw.repo === "string" ? raw.repo : "";
    return { target, owner, repo, ...(typeof raw.branch === "string" ? { branch: raw.branch } : {}) };
  }
  if (target === "vercel") {
    return { target, ...(typeof raw.teamId === "string" ? { teamId: raw.teamId } : {}) };
  }
  if (target === "netlify") {
    return { target };
  }
  // target === "cloudflare-pages" — no target-specific field: `accountId` lives on the credential,
  // not this config (see `static-publish/types.ts`'s `CloudflarePagesPublishConfig` doc).
  return { target: "cloudflare-pages" };
}

/**
 * Builds this domain's `ToolRegistration[]` — the same shape every other domain's
 * `build<Domain>Registrations` produces (see e.g. `recovery/tool-registrations.ts`'s
 * `buildRecoveryRegistrations`). Called by `assistant/tool-registrations.ts`, which imports
 * `buildStaticPublishRegistrations`/`staticPublishDerivedRisk` from this file and lists them as
 * their own `"static-publish"` entry in `DOMAIN_SLICES` — see that file's own comment on that entry
 * for why static-publish stays a separate slice rather than folding into this directory's sibling
 * `deployments`/`agent-tools.ts` slice.
 *
 * @param deps - `credentialSource` defaults to the same env-var + DB-backed composition
 *   `publish-site.ts`'s route constructs (`dbCredentialDeps` provided) or a plain workspace-bound env
 *   source (`dbCredentialDeps` omitted — e.g. tests), so a caller wiring this in production does not
 *   have to also remember to build one. Only `isConfigured()` is ever reached (this file's own
 *   header: the preview handler never calls `resolve()`), so which composition applies barely
 *   matters here — it matters for `publish-site.ts`'s trigger route, which shares this same function.
 * @complexity O(1) registration-time cost; the wired handler's own cost is O(1) (an env lookup plus
 *   a handful of regex tests).
 */
export function buildStaticPublishRegistrations(deps: StaticPublishToolDeps): ToolRegistration[] {
  const credentialSource =
    deps.credentialSource ??
    (deps.dbCredentialDeps
      ? composePublishCredentialSource({ workspaceId: deps.workspaceId, executionMode: deps.executionMode ?? "self-hosted-cli", dbDeps: deps.dbCredentialDeps })
      : createEnvPublishCredentialSource(deps.workspaceId));

  const handlers: Record<string, ToolHandler> = {
    deployment_preview_static_publish: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      const target = requireString(raw, "target");
      if (target !== "github-pages" && target !== "vercel" && target !== "netlify" && target !== "cloudflare-pages") {
        throw new Error("'target' must be one of: github-pages, vercel, netlify, cloudflare-pages");
      }

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "site-publish" });

      const config = buildPreviewConfig(raw);
      const validationError = validateStaticPublishConfig(config);
      const basePath = validationError ? undefined : computeBasePath(config);
      // `isConfigured()`, NOT `resolve()` — this is an agent-facing read; per this file's own header
      // (and `static-publish/types.ts`'s `PublishCredentialSource` doc) an agent-facing path must
      // never be able to resolve a real credential, even indirectly by reading `.ok` off it.
      const credential = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target });

      return {
        target,
        valid: validationError === null,
        ...(validationError !== null ? { validationError } : {}),
        basePath: basePath ?? null,
        credentialsConfigured: credential.configured,
        ...(!credential.configured ? { credentialGuidance: credential.reason } : {}),
        willInjectNojekyll: target === "github-pages",
      };
    },
  };

  return buildDomainRegistrations({
    domain: "static-publish",
    catalogModule: "features/deployments/publish-agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: staticPublishDerivedRisk,
    unwiredToolIds: UNWIRED_STATIC_PUBLISH_TOOL_IDS,
  });
}
