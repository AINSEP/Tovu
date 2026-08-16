/**
 * @file The static-publish sub-feature's agent-tool catalog + wiring (ADR-049 Decision 4's
 * per-domain split, `static-publish/`'s half — see that directory's `types.ts` header for why it is
 * a separate module tree from this directory's sibling `agent-tools.ts`/`tool-registrations.ts`,
 * which cover the continuous-deployment/export/Dockerfile tools instead).
 *
 * Purpose:
 * Deliberately its OWN file, not folded into the sibling `agent-tools.ts`/`tool-registrations.ts` —
 * that split let a concurrent agent own those two files plus `assistant/tool-registrations.ts`'s
 * wiring pass without colliding with this one. `assistant/tool-registrations.ts` imports this file's
 * catalog (its own `deployments/publish-agent-tools` import) and invokes it alongside every other
 * domain's registrations — see that file's own `static-publish` slice comment for the wired half of
 * this story.
 *
 * Three tools, all wired (2026-08-15, this dispatch — previously only the preview was):
 * - `deployment_preview_static_publish` — read-only, risk `"none"`. Unchanged by this dispatch.
 * - `deployment_get_static_publish_capabilities` — NEW. Read-only, risk `"none"`: reports which
 *   providers have a saved credential (by provider id and label only — never a token, ciphertext, or
 *   masked tail), this install's `executionMode`, and — for a provider that is not ready — a
 *   human-readable reason. Reads through `publish-credentials/store.ts`'s `listPublishCredentials`
 *   (never decrypts — see that function's own "read model only" doc) plus
 *   `PublishCredentialSource.isConfigured()` (the same never-decrypting method the preview handler
 *   below already relies on). NEVER calls `resolveForPublish`/`resolveDefaultForPublish`/
 *   `PublishCredentialSource.resolve()` — enforced structurally here (this handler's own deps give it
 *   no `sealer`-carrying path into `resolveForPublish`, whose signature requires one) and proven by
 *   this file's own test (a fake `credentialSource.resolve` that throws if ever called).
 * - `deployment_execute_static_publish` — NEW as a REACHABLE tool. Publishing is the one operation in
 *   this whole domain that breaks the "plain `mutates-durable-state`, nothing external" pattern this
 *   directory's sibling `agent-tools.ts` documents for its own five tools: it sends the current site's
 *   content to the PUBLIC INTERNET using a credential with WRITE access to the owner's external
 *   account, and the result is immediately live — potentially crawled, cached, or indexed within
 *   seconds. That is irreversible in the sense that matters (a later republish overwrites what is
 *   HOSTED, never what was already public).
 *
 *   This used to be declared with `actorClassRule: "confirmer-must-equal-own-delegatedBy"` and
 *   deliberately left unwired, on the same reasoning `recovery/agent-tools.ts` still gives for
 *   `backup_execute_restore` and `database/agent-tools.ts` for
 *   `database_execute_migrate_forward`: `@jini-ai/cms/core`'s
 *   `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` refuses to build any tool carrying that rule
 *   until a real `ExecutionDelegate`-backed confirmation transport exists, and `agent-daemon-server.ts`
 *   builds `createToolExecutor({registry})` with none. That is still true today — nothing about this
 *   dispatch changes it, and the rule/gate stays exactly as strict for those other two tools.
 *
 *   What changed is that this domain does NOT need that transport at all: `content_post_delete`
 *   (`features/post/tool-registrations.ts`) already proved a working confirmation gate exists that
 *   needs no `ExecutionDelegate` — the MCP-UI held-open surface exchange (ADR-055 Decisions 1/2,
 *   `assistant/surface-exchanges.ts`). The model's ONE call to `deployment_execute_static_publish`
 *   opens an exchange, renders a confirmation dialog naming exactly what will be published and where,
 *   and PARKS on `ctx.emitSurface` until a human answers through
 *   `mcp-ui-tool-calls-route.ts` (added to that route's `MCP_UI_REDEEMABLE_TOOL_IDS` allowlist in
 *   `assistant/mcp-ui-tool-calls.ts` as part of this change) — no `ExecutionDelegate`,
 *   `descriptor.requiresConfirmation`, or `resumeConfirmation` involved anywhere. So this tool
 *   deliberately carries NO `actorClassRule` (mirrors `content_post_delete`'s own catalog entry: "the
 *   absence... is on purpose" — declaring the rule here would, correctly, fail the build for a
 *   transport this tool does not use).
 *
 *   The credential itself is still never agent-visible: the model's call carries only
 *   `{target, projectName, ...target-specific fields}` — no token field exists in the schema — and the
 *   real credential is resolved server-side, only after a human confirms, by
 *   `static-publish/adapter.ts`'s `publishStaticSite` (the SAME function `server/routes/admin/system/
 *   publish-site.ts`'s human-session route already calls), from the SAME `PublishCredentialSource`
 *   the preview/capabilities tools only ever ask `isConfigured()` of.
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes the catalog below to decide which tool names an
 * agent session may see at all; `requireToolPermission` enforces the actual permission check at call
 * time. `deployment_execute_static_publish` additionally never even raises its confirmation dialog for
 * a provider with no configured credential (checked via the same non-decrypting `isConfigured()` the
 * other two tools use) — a dialog a human could only ever see to be told "this can't work" wastes
 * their attention.
 *
 * Architectural role:
 * `features/deployments/static-publish` domain logic (agent-tool layer), plus this dispatch's
 * necessary crossing into `#src/server/routes/types`'s `RouteDeps` (type-only) — `publishStaticSite`
 * needs the full composition-root deps bag to run a real `exportSite` pass immediately before
 * publishing, the exact same reason this directory's sibling `tool-registrations.ts` documents for
 * `DeploymentsToolDeps = RouteDeps` and `deployment_trigger_export`. No dependency on this directory's
 * sibling `agent-tools.ts`/`tool-registrations.ts`/`ports.ts`/`types.ts`.
 */
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

// TYPE-ONLY — fully erased at compile time, so this creates no runtime require() and cannot recreate
// the circular-load crash a VALUE import of `#src/export/index` caused inside `export-run.ts` and
// (via `static-publish/adapter.ts`'s own `exportSiteLazily`) inside this feature's own preview tool
// wiring — see `adapter.ts`'s header for that trace, and `deployments/tool-registrations.ts`'s
// `DeploymentsToolDeps` doc for why a `type`-only import of the same symbol is safe where a value one
// is not.
import type { RouteDeps } from "#src/server/routes/types";

import { askOnce, SURFACE_EXCHANGE_ID_PARAM, type AssistantSurfaceDeps, type SurfaceExchange } from "../../assistant/surface-exchanges";
import { listPublishCredentials, type PublishCredentialReadDeps } from "./publish-credentials/index";
import {
  composePublishCredentialSource,
  computeBasePath,
  publishStaticSite,
  validateStaticPublishConfig,
  type PublishCredentialSource,
  type StaticPublishConfig,
  type StaticPublishDeps,
  type StaticPublishTargetId,
} from "./static-publish/index";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** No arguments — parameterless read tool. Matches `agent-tools.ts`'s own `NO_INPUT_SCHEMA` exactly;
 *  declared separately here rather than imported from that sibling file, per this file's own
 *  "no dependency on agent-tools.ts" architectural rule (this file's header). */
const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

/** Every provider this feature can publish to or save a credential for — the fixed iteration order
 *  `deployment_get_static_publish_capabilities` reports in. Sourced from `StaticPublishTargetId`'s own
 *  4-member union (`static-publish/types.ts`) rather than re-declared, so a fifth target added there
 *  cannot silently go unreported here without a compile error at this array's own type annotation. */
const PROVIDER_IDS: readonly StaticPublishTargetId[] = ["github-pages", "vercel", "netlify", "cloudflare-pages"];

/** `deployment_preview_static_publish`'s input — the same target-discriminated shape
 *  `publish-site.ts`'s trigger route body uses, minus `projectName` (a preview never runs a real
 *  publish, so there is no commit-message/project-name label to validate). Reused (spread) by
 *  {@link EXECUTE_STATIC_PUBLISH_SCHEMA} below, which adds the one field a real publish needs. */
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

/** `deployment_execute_static_publish`'s input — {@link PREVIEW_STATIC_PUBLISH_SCHEMA}'s fields plus
 *  `projectName`, the one field a real publish needs that a preview does not. Deliberately carries NO
 *  token/credential field of any kind — see this file's header for why that is structural, not just
 *  undocumented. */
const EXECUTE_STATIC_PUBLISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["target", "projectName"],
  properties: {
    ...PREVIEW_STATIC_PUBLISH_SCHEMA.properties,
    projectName: {
      type: "string",
      description:
        "Human-facing label for this publish run — becomes the GitHub commit message subject, or the Vercel/Netlify/Cloudflare Pages project-name seed. 1-200 characters.",
    },
  },
} as const;

/**
 * This domain's fixed agent-tool catalog. All three entries are wired — see this file's header for
 * why `deployment_execute_static_publish` (destructive/irreversible) needs no `actorClassRule` despite
 * that.
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
    name: "deployment_get_static_publish_capabilities",
    description:
      "Reports live publish readiness for all four static-publish targets (github-pages, vercel, netlify, cloudflare-pages) WITHOUT decrypting or exposing any credential: for each provider, whether it is ready to publish to right now, every named credential set saved for it (id, label, isDefault, createdAt, updatedAt — NEVER a token, ciphertext, or masked tail), and — for a provider that is NOT ready — a human-readable reason naming what is missing (e.g. no credential saved for this workspace, or a required field such as Cloudflare Pages' account id is not configured). Also reports this install's executionMode ('self-hosted-cli' or 'hosted-api-only'), which affects whether a server-environment-variable credential can ever be used as a fallback. Call this before telling a human what publishing would do, before calling deployment_execute_static_publish, or whenever asked something like 'can I publish, and to where'. Do NOT ask the user to paste an API token, access key, or any other secret into this chat, ever, for any reason — a value typed into chat is written into the conversation transcript, which is exactly what this workspace's encrypted credential store exists to avoid, and this tool has no way to accept one anyway (it takes no input). If a provider is not ready, tell the human to add or fix that provider's credential themselves in the admin's Static Site tab (Deployment panel → Static Site → Publish), which saves it encrypted server-side and never shows it to you.",
    sideEffects: "none",
    authorization: { permission: "deployments.read" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "deployment_execute_static_publish",
    description:
      "Publishes the current site as a FRESH static export to GitHub Pages, Vercel, Netlify, or Cloudflare Pages, using the workspace's own SAVED credential for that provider (configured by a human in the admin's Static Site tab — this tool takes no token/credential field of any kind; do not attempt to supply one). HUMAN-GATED: call it with just { target, projectName, ...any target-specific fields — see deployment_preview_static_publish's schema for those }. This ONE call shows an interactive confirmation dialog naming exactly what will be published and to where, and WAITS: it does not return until the human answers or the dialog times out. There is no second call to make, and no confirmation token to invent or pass. If the human clicks Publish, THIS SAME CALL runs the publish and returns { published: true, target, url, status, basePath? }. If they click Cancel, it returns { published: false, cancelled: true }. If nobody answers before the dialog expires (or the run ends first), it returns { published: false, cancelled: false, reason: 'expired' | 'abandoned' }. If no credential is configured yet for the requested provider, this returns { published: false, reason: 'no-credential', message } — naming the provider and pointing to the Static Site tab — WITHOUT ever raising a dialog (call deployment_get_static_publish_capabilities first to check readiness and avoid this). Every other failure — a saved Cloudflare Pages credential missing its account id, a rejected provider API call, an export failure — is returned as { published: false, code, message } with an actionable message describing what went wrong; it never echoes a credential or a raw provider response body. The result is immediately LIVE on the public internet the moment it returns published:true, and may be crawled, cached, or indexed within seconds — irreversible in the sense that matters, since a later republish overwrites what is HOSTED but can never retract what was already public. Simply wait for the result and report the true outcome to the user — do not tell them a dialog is open and stop, and do not re-call this tool while a call is already pending (a fresh call raises a second, separate dialog rather than answering the first).",
    // Genuinely destructive in the sense that matters for this domain (sends content to the public
    // internet with a write-scoped external credential) — classified accordingly, and cross-checked
    // against `staticPublishDerivedRisk` below at build time (`assertToolIsWirable`) so this
    // declaration cannot quietly soften itself. Deliberately carries NO `actorClassRule` — see this
    // file's header for why the MCP-UI held-open exchange gate needs none.
    sideEffects: "mutates-durable-state",
    authorization: { permission: "deployments.publish" },
    inputSchema: EXECUTE_STATIC_PUBLISH_SCHEMA,
  },
];

const CATALOG_BY_ID = indexCatalogById(staticPublishAgentToolCatalog);

/**
 * This wiring layer's OWN risk classification, independent of the catalog's `sideEffects`
 * declaration (`@jini-ai/cms/core`'s `assertToolIsWirable` cross-checks the two and refuses to wire
 * on disagreement).
 */
export const staticPublishDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> resolves credential presence (`PublishCredentialSource.isConfigured`, read-only) and validates
  // config shape (`validateStaticPublishConfig`, pure). No filesystem write, no network call, no
  // export run — a preview never calls `publishStaticSite` at all.
  ["deployment_preview_static_publish", "none"],
  // -> `listPublishCredentials` (a pure DB read, never decrypts — `publish-credentials/store.ts`'s own
  // doc) plus `PublishCredentialSource.isConfigured` per provider (same non-decrypting contract the
  // preview tool relies on). No write, no decrypt, no network call.
  ["deployment_get_static_publish_capabilities", "none"],
  // -> on confirm, calls `publishStaticSite`: a real `exportSite` pass plus a real provider API call
  // (GitHub/Vercel/Netlify/Cloudflare Pages) using a write-scoped credential — genuinely mutates
  // external durable state. See this file's header for the full risk story.
  ["deployment_execute_static_publish", "mutates-durable-state"],
]);

/**
 * The exact slice of the route-deps bag this domain's tool handlers read. Unlike this file's previous
 * revision (preview-only), this is now `RouteDeps` itself rather than a narrow structural stand-in —
 * `deployment_execute_static_publish`'s confirmed path calls `publishStaticSite`, which needs the
 * FULL composition-root bag to run a real `exportSite` pass (identical reasoning to this directory's
 * sibling `tool-registrations.ts`'s `DeploymentsToolDeps = RouteDeps`; see that file's own doc for why
 * no honest narrower type exists). This also fixes a real, latent gap the preview-only revision left
 * behind: that revision's `dbCredentialDeps?` field was never populated by the one real production
 * caller (`agent-daemon-server.ts` spreads the flat `RouteDeps`-shaped bag with no nested
 * `dbCredentialDeps` key), so the DB-backed credential store was silently never consulted by any
 * static-publish agent tool — only the env-var fallback ever ran. Reading `publishCredentialSetRepo`/
 * `siteAssistantSecretSealer`/`publishExecutionMode` directly off this (now-required) `RouteDeps`
 * shape, exactly as `publish-site.ts`'s own route already does, closes that gap.
 */
export interface StaticPublishToolDeps extends RouteDeps {
  /** Test-only override — when supplied, replaces the composed `PublishCredentialSource` entirely
   *  (DB-backed + env-fallback composition, `publishCredentialSetRepo`/`siteAssistantSecretSealer`/
   *  `publishExecutionMode` are all ignored). Production never sets this. */
  credentialSource?: PublishCredentialSource;
  /** Test-only override for `publishStaticSite`'s own `StaticPublishDeps.buildTarget` — lets a test
   *  substitute a fake `DeployTarget` so `deployment_execute_static_publish`'s CONFIRMED path can be
   *  exercised end-to-end without ever constructing a real GitHub/Vercel/Netlify/Cloudflare Pages
   *  client or touching `fetch` (mirrors `static-publish/adapter.ts`'s own test-injection seam,
   *  "adapter tests with a faked deploy target — do not hit real providers in tests"). Production
   *  never sets this — `publishStaticSite`'s own default (the real Jini adapters) applies. */
  buildTarget?: StaticPublishDeps["buildTarget"];
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

const EXECUTE_STATIC_PUBLISH_TOOL_ID = "deployment_execute_static_publish";

/** The `ui://` URI for one publish-confirmation instance. Keyed by the exchange id (unique per raised
 *  dialog) rather than by an entity+version the way `deleteConfirmationUri`
 *  (`features/post/delete-confirmation-ui.ts`) keys its own — a publish has no existing row/version to
 *  key against, so the exchange id is what keeps two dialogs raised for the same target from
 *  colliding on one URI. */
function publishConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/deployment-execute-static-publish/${exchangeId}` as UIResourceUri;
}

/**
 * Renders the publish confirmation dialog — the human-facing half of `deployment_execute_static_publish`'s
 * gate (this file's header). Mirrors `buildDeleteConfirmationResource`
 * (`features/post/delete-confirmation-ui.ts`) closely: Jini's `buildConfirmationSurface` owns HOW a
 * confirmation dialog behaves (the real MCP-UI handshake, safe interpolation, status text); this
 * function only decides WHAT a publish confirmation should say. Colocated in this file rather than
 * split into its own `publish-confirmation-ui.ts`, unlike the Posts/Pages precedent — this dispatch's
 * scope is this one file plus `assistant/**`, and the content here is small enough not to need its own
 * module.
 *
 * @complexity O(1) — a handful of fixed-size field reads.
 */
function buildPublishConfirmationResource(spec: {
  config: StaticPublishConfig;
  projectName: string;
  basePath: string | undefined;
  exchangeId: string;
}): UIResource {
  const { config, projectName, basePath, exchangeId } = spec;

  return buildConfirmationSurface({
    uri: publishConfirmationUri(exchangeId),
    title: `Publish the site to ${config.target}?`,
    description: "The current site content will be exported fresh and published live, using this workspace's saved credential for this provider.",
    details: [
      { label: "Target", value: config.target },
      { label: "Project name", value: projectName },
      ...(config.target === "github-pages" ? [{ label: "Repository", value: `${config.owner}/${config.repo}` }] : []),
      ...(basePath !== undefined ? [{ label: "Base path", value: basePath }] : []),
    ],
    warning:
      "This goes live on the public internet immediately and may be crawled, cached, or indexed within seconds. A later republish overwrites what is hosted but can never retract what was already public.",
    danger: true,
    confirm: {
      label: "Publish",
      toolName: EXECUTE_STATIC_PUBLISH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    // A tool action, not a bare dismiss — matches `buildDeleteConfirmationResource`'s own reasoning:
    // cancelling posts back and resolves the parked call immediately rather than stranding the agent's
    // call open until the idle deadline.
    cancel: {
      label: "Cancel",
      toolName: EXECUTE_STATIC_PUBLISH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-deployment-execute-static-publish", appVersion: "1" },
    preferredFrameSize: ["100%", "360px"],
  });
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
 * @param deps - `RouteDeps` plus this file's own test-only overrides (`credentialSource`,
 *   `buildTarget`). `credentialSource` defaults to the same DB-first, env-fallback-only-in-
 *   `"self-hosted-cli"`-mode composition `publish-site.ts`'s route constructs.
 * @param surfaces - The held-open confirmation exchange store `deployment_execute_static_publish`
 *   parks on — see this file's header. Required, matching `buildPostRegistrations`' own shape (the
 *   other domain whose gate needs this), since a domain with no store at all could never wire this
 *   tool's gate at all.
 * @complexity O(1) registration-time cost; each wired handler's own cost is documented at its call
 *   site above (preview/capabilities: O(1) plus the provider count; execute: one `exportSite` pass
 *   plus one provider API call, only after a human confirms).
 */
export function buildStaticPublishRegistrations(deps: StaticPublishToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const credentialSource =
    deps.credentialSource ??
    composePublishCredentialSource({
      workspaceId: deps.workspaceId,
      executionMode: deps.publishExecutionMode,
      dbDeps: { repo: deps.publishCredentialSetRepo, sealer: deps.siteAssistantSecretSealer },
    });

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

    /**
     * Never decrypts — reads through `listPublishCredentials` (a pure DB read; see that function's
     * own "read model only" doc in `publish-credentials/store.ts`) and `credentialSource.isConfigured`
     * (this file's own preview handler already relies on the identical never-decrypting contract).
     * Structurally cannot reach `resolveForPublish`/`resolveDefaultForPublish`: this handler is never
     * given a `SecretSealerPort`, and both of those functions require one.
     */
    deployment_get_static_publish_capabilities: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "site-publish" });

      const saved = await listPublishCredentials({ repo: deps.publishCredentialSetRepo } satisfies PublishCredentialReadDeps, {
        workspaceId: deps.workspaceId,
      });

      const providers = await Promise.all(
        PROVIDER_IDS.map(async (providerId) => {
          const savedCredentials = saved
            .filter((credential) => credential.providerId === providerId)
            .map((credential) => ({
              id: credential.id,
              label: credential.label,
              isDefault: credential.isDefault,
              createdAt: credential.createdAt,
              updatedAt: credential.updatedAt,
            }));
          const readiness = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target: providerId });

          return {
            providerId,
            ready: readiness.configured,
            savedCredentials,
            ...(readiness.configured ? {} : { guidance: readiness.reason }),
          };
        })
      );

      return { executionMode: deps.publishExecutionMode, providers };
    },

    /**
     * The MCP-UI-gated publish. See `buildPublishConfirmationResource` above for the surface itself
     * and this file's header for why this holds its call open (`assistant/surface-exchanges.ts`)
     * rather than needing `descriptor.requiresConfirmation`/an `ExecutionDelegate`.
     *
     * One call, blocking:
     *  1. Validate the config shape (same validation `publishStaticSite` performs internally — an
     *     explicit early check here means a caller with an invalid config never causes a dialog to be
     *     raised at all, mirroring `publish-site.ts`'s route's own early-validation discipline).
     *  2. Check credential readiness (`isConfigured()`, never decrypts) — a dialog a human could only
     *     ever see to be told "this can't work" wastes their attention, so a not-ready provider is
     *     refused before opening anything.
     *  3. Open an exchange, emit the confirmation surface through it, and park on the answer.
     *  4. The answer is the human's decision — confirm, cancel — or a `SurfaceMessage` saying nobody
     *     answered (`expired`/`abandoned`). Every branch returns a truthful result to the SAME call;
     *     none of them throw for "no answer", because the model is still alive to read the result
     *     (ADR-055 Decision 6, same posture `content_post_delete` takes).
     *  5. On confirm, calls `publishStaticSite` — the SAME function `publish-site.ts`'s human-session
     *     route calls — which resolves the real credential (only now, only here) and runs a fresh
     *     export immediately before publishing.
     *
     * No fallback to a two-call shape when `ctx.emitSurface` is unavailable: an execution context that
     * cannot hold this call open cannot run this tool at all — identical posture to
     * `content_post_delete`'s own handler.
     */
    deployment_execute_static_publish: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      const target = requireString(raw, "target");
      if (target !== "github-pages" && target !== "vercel" && target !== "netlify" && target !== "cloudflare-pages") {
        throw new Error("'target' must be one of: github-pages, vercel, netlify, cloudflare-pages");
      }
      const projectName = requireString(raw, "projectName");

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.publish", entityType: "site-publish" });

      const config = buildPreviewConfig(raw);
      const validationError = validateStaticPublishConfig(config);
      if (validationError !== null) {
        throw new Error(`deployment_execute_static_publish: ${validationError}`);
      }

      // Fail closed rather than degrade — see this handler's own doc comment above.
      if (!ctx.emitSurface) {
        throw new Error(
          "deployment_execute_static_publish: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a live publish cannot be gated here. Nothing was published."
        );
      }

      // Never decrypts (same `isConfigured()` contract the preview/capabilities handlers use above).
      // Checked before raising any dialog so a guaranteed-fail call never wastes a human's attention.
      const readiness = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target });
      if (!readiness.configured) {
        return {
          published: false,
          cancelled: false,
          reason: "no-credential",
          message: `No publish credential is configured for '${target}'. Add one in the admin's Static Site tab (Deployment panel → Static Site → Publish) before publishing. (${readiness.reason})`,
        };
      }

      const basePath = computeBasePath(config);
      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: EXECUTE_STATIC_PUBLISH_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );
      const ui = buildPublishConfirmationResource({ config, projectName, basePath, exchangeId: exchange.id });

      // A cancelled run must not leave a dialog holding a call nobody is listening to, nor hold this
      // handler open until the idle deadline — mirrors `content_post_delete`'s identical guard.
      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });

        // ADR-055 Decision 6: the no-answer path is a result, not an exception. Nothing was published
        // either way, and the model is still alive to read this and say something sensible.
        if (answer.status !== "received") {
          return {
            published: false,
            cancelled: false,
            reason: answer.status,
            note:
              answer.status === "expired"
                ? "The user did not respond to the publish confirmation dialog before it expired. Nothing was published."
                : "The confirmation dialog was closed because the run ended. Nothing was published.",
          };
        }

        const decision = typeof answer.params["decision"] === "string" ? answer.params["decision"] : "confirm";
        if (decision !== "confirm") {
          return { published: false, cancelled: true, target, projectName };
        }

        const outcome = await publishStaticSite(
          { credentialSource, ...(deps.buildTarget !== undefined ? { buildTarget: deps.buildTarget } : {}) },
          { workspaceId: deps.workspaceId, routeDeps: deps, config, projectName }
        );

        if (!outcome.ok) {
          // Every branch of `publishStaticSite`'s own failure contract (`static-publish/types.ts`'s
          // `StaticPublishOutcome` doc, `adapter.ts`'s own `catch`) is already an actionable,
          // credential-free message: `NO_CREDENTIALS_CONFIGURED` names the provider via the resolved
          // credential source's own reason text, a Cloudflare-Pages-credential-missing-its-account-id
          // failure names the exact missing field (`buildJiniTarget`'s own `DeployError`), and
          // `PROVIDER_ERROR` is `err.message` only — never a raw response body, never a credential.
          // Passed straight through rather than re-wrapped.
          return { published: false, cancelled: false, code: outcome.code, message: outcome.message };
        }

        return {
          published: true,
          target: outcome.targetId,
          url: outcome.url,
          status: outcome.status,
          ...(outcome.deploymentId !== undefined ? { deploymentId: outcome.deploymentId } : {}),
          ...(outcome.basePath !== undefined ? { basePath: outcome.basePath } : {}),
        };
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },
  };

  // No `unwiredToolIds`: this domain now wires its ENTIRE catalog, same tripwire discipline as
  // Posts/Pages/Forms/Entries/Widgets — a 4th catalog entry added without a handler fails the build.
  return buildDomainRegistrations({
    domain: "static-publish",
    catalogModule: "features/deployments/publish-agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: staticPublishDerivedRisk,
  });
}
