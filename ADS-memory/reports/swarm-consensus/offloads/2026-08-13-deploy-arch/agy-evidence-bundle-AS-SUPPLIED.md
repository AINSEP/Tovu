# EVIDENCE BUNDLE — verbatim excerpts for CTX-DEPLOY-ARCH-2026-08-13
You have NO file access. Every excerpt you may cite is below. If a claim cannot be judged from this bundle, answer UNVERIFIABLE — do not guess.

## src/server/app.ts:888-906
    webhookSubscriptionRepo: routeDeps.webhookSubscriptionRepo,
    webhookDeliveryRepo: routeDeps.webhookDeliveryRepo,
    idGen: routeDeps.idGen,
    clock: routeDeps.clock,
  }).start?.();

  // Built admin SPA (apps/admin/dist) at /admin; helpful 503 when unbuilt.
  registerAdminStatic(app, {
    distDir: process.env.TOVU_ADMIN_DIST ?? path.resolve(__dirname, "../../apps/admin/dist"),
  });

  // ADR-049 — `@jini-ai/chat-react`'s runtime picker requests agent icons from `/agent-icons/*`
  // at the site root (hardcoded, no `ChatPaneProps` override exists to relocate it — verified
  // against `chat-react@0.2.0`'s `AgentRuntimePicker.tsx`), which sits outside the admin SPA's own
  // `/admin/*`-scoped static serving above. Served from Tovu's own root here (in both dev, via
  // `apps/admin/vite.config.ts`'s matching proxy entry, and prod) rather than duplicated inside
  // `apps/admin/dist` (which would only ever resolve under `/admin/`).
  app.use("/agent-icons", express.static(path.resolve(__dirname, "../public/agent-icons")));


## src/features/theme/theme.ts:24-40

/**
 * ADR-020 capability tier. `declarative` = data-only (safe from anyone),
 * `templated` = LiquidJS-rendered (sandboxed logic, no JS), `handlebars` =
 * Handlebars-rendered (sandboxed logic, no JS — a sibling of `templated` with
 * its own allowlist/worker pair, not a replacement for it), `static` = plain
 * HTML/CSS/JS, no template language at all — every byte editable, a whole
 * `pages/*.html` set instead of one `templates/` route map (see `pages` on
 * {@link DiscoveredTheme}), `code` = trusted signed-plugin JS (not built yet).
 * Absent in `theme.json` ⇒ `declarative`.
 */
export type ThemeTier = "declarative" | "templated" | "handlebars" | "static" | "code";

const THEME_TIERS: readonly ThemeTier[] = ["declarative", "templated", "handlebars", "static", "code"];

/**
 * `theme.json.build` — ADR-020 §5 (2026-08-12): declares which of the two lifecycle classes a

## src/features/theme/theme.ts:318-330
function readJson(path: string): JsonValue {
  return JSON.parse(readFileSync(path, "utf8")) as JsonValue;
}

/** Default an absent/empty `theme.json.tier`; reject a present value this build cannot render. */
function parseTier(value: JsonValue | undefined): ThemeTier {
  if (value === undefined || value === "") return "declarative";
  if (typeof value === "string" && (THEME_TIERS as readonly string[]).includes(value)) {
    return value as ThemeTier;
  }
  throw new Error(`unrecognized theme tier '${String(value)}'`);
}


## src/server/http/site/render.ts:2000-2048
  };

  // Static tier: unlike every other branch below, a static theme's page is already a complete
  // `<!doctype html>` document (tokens, nav, footer, scripts — all of it), not a body fragment
  // `pageShell()` still needs to wrap. Returned directly, bypassing pageShell, when the theme has
  // one for this route. Home only for now — anything else (including a missing pages/index.html)
  // falls through to the existing fallbackBody()/pageShell() path below, same as any other
  // unresolved route on any other tier.
  if (theme.manifest.tier === "static" && route === "home") {
    const staticHtml = renderStaticPage({ theme, pageId: "index", menus: required.staticMenus });
    if (staticHtml) return staticHtml;
  }

  let body: string;
  if (theme.manifest.tier === "templated") {
    const liquidId =
      required.liquidTemplateIdOverride ?? resolveLiquidTemplateId({ route, liquidTemplates: theme.liquidTemplates });
    const source = liquidId ? theme.liquidTemplates[liquidId] : undefined;
    try {
      body = source
        ? await renderLiquidInSandbox({ source, ctx, skipLiquidAllowlist: theme.manifest.skipLiquidAllowlist })
        : fallbackBody();
    } catch (err) {
      // A broken/hostile Liquid template must not 500 the site (SPEC-004
      // REQ-10 spirit) — covers a syntax error, a disallowed tag/filter the
      // worker's defensive re-lint caught, or a sandbox timeout/OOM.
      body = `<!-- theme render error: ${escapeHtml((err as Error).message)} -->${fallbackBody()}`;
    }
  } else if (theme.manifest.tier === "handlebars") {
    // Same contract as the Liquid branch above, engine swapped: resolve the
    // route to a `.hbs` template, render it inside its own `worker_threads`
    // sandbox, and degrade to the built-in fallback body on ANY failure — a
    // syntax error, a disallowed helper/partial/raw-output the worker's
    // defensive re-lint caught, or a sandbox timeout/OOM. Never a 500.
    const hbsId = resolveHandlebarsTemplateId({ route, handlebarsTemplates: theme.handlebarsTemplates });
    const source = hbsId ? theme.handlebarsTemplates[hbsId] : undefined;
    try {
      body = source ? await renderHandlebarsInSandbox({ source, ctx }) : fallbackBody();
    } catch (err) {
      body = `<!-- theme render error: ${escapeHtml((err as Error).message)} -->${fallbackBody()}`;
    }
  } else {
    const templateId = resolveTemplateId({ route, templates: theme.templates });
    const tree = templateId ? theme.templates[templateId] : undefined;
    body = tree ? renderBlock(tree, ctx) : fallbackBody();
  }

  const title = route === "post" && required.post
    ? `${required.post.title} — ${required.siteTitle}`

## src/server/http/site/liquid-sandbox.ts:1-52
import path from "node:path";
import { Worker, type ResourceLimits } from "node:worker_threads";

import type { SiteRenderContext } from "./render";

/**
 * @file ADR-020 Tier-2 guardrail: render isolation for LiquidJS templates.
 *
 * Purpose:
 * Spawns a fresh `worker_threads` `Worker` per render, bounded by a CPU wall-
 * clock timeout and V8 heap `resourceLimits`, so an adversarial "templated"
 * theme (e.g. an unbounded `{% for %}` loop, or a template that builds an
 * enormous string) cannot hang or OOM the main server process. A
 * `Promise.race` around the synchronous `parseAndRenderSync` call would not
 * help here — synchronous CPU-bound work on the main thread can't be
 * pre-empted by a timer running on that same thread. Running the render on a
 * *separate* thread is what makes `worker.terminate()` able to actually stop
 * it. `worker_threads` is used instead of `isolated-vm`/`vm2`: it ships with
 * Node (no new native dependency), and `vm2` carries known sandbox-escape
 * CVEs while `isolated-vm` needs native compilation.
 *
 * How it relates to the project:
 * Called from `render.ts`'s `renderSite()` in place of the old in-process
 * `renderLiquidBody()`. The actual Liquid engine + component-registry
 * wiring lives in `liquid-worker.ts`, which this module spawns by file path
 * (not by static import, so the main thread never needs to construct a
 * Liquid engine at all).
 */

/** What one render needs, sent to the worker as `workerData` (structured-clone only — plain data, no functions/class instances). */
export interface LiquidWorkerInput {
  source: string;
  ctx: SiteRenderContext;
  /** Mirrors `ThemeManifest.skipLiquidAllowlist` — `loadTheme()` already made this decision at
   * discovery time; the worker's defensive re-lint (in case the file changed on disk since) honors
   * the same choice rather than re-deciding it. */
  skipLiquidAllowlist?: boolean;
}

/** The worker's reply, via `postMessage`. */
export type LiquidWorkerResult = { ok: true; html: string } | { ok: false; error: string };

export interface LiquidSandboxOptions {
  /** Wall-clock budget for one render before the worker is force-terminated. */
  timeoutMs?: number;
  /** V8 heap caps for the worker thread. */
  resourceLimits?: ResourceLimits;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxOldGenerationSizeMb: 64,

## src/index.ts:296-315
    // `mode` duplicated because it is the FIRST entry in `EXECUTION_DEFINITIONS` — by key 2 the
    // loser could already see the winner's rows. Awaiting all three closes the window for every
    // boot-time settings registrar, including the newer `ensureAnalyticsSettingDefinitions`.
    Promise.all([
      deps.identityReady,
      deps.settingsReady,
      deps.seoReady,
      deps.commentsReady,
      deps.commentsSettingsReady,
      deps.executionSettingsReady,
      deps.settingsUiTabsReady,
      deps.analyticsSettingsReady,
    ])
      .then(() => spawnAgentDaemon(deps.workspaceId))
      .catch((error: unknown) => {
        console.error("[index] a boot-readiness promise rejected — not starting the agent daemon", error);
      });
  });
}


## src/assistant/byok-provider-turn.ts:1-24
/**
 * @file One provider-neutral tool-calling turn, dispatched to whichever of `@jini-ai/agent-runtime`'s
 * four `run*ToolTurn` functions matches the admin's chosen BYOK protocol (ADR-049's "API · BYOK"
 * execution mode — see `assistant-byok.ts`'s own header for how this fits into the run).
 *
 * Why a normalized event/type layer exists at all, rather than calling each provider's own
 * `run*ToolTurn` directly from the route: the four providers' turn-event unions are independently
 * declared but structurally identical on every case this module needs (`status`/`text_delta`/
 * `tool_use`/`tool_result`/`usage`/`error`/`end`, each with the same field names) — confirmed by
 * reading all four source files directly, not inferred from naming. `ByokTurnEvent` below is that
 * common shape, deliberately spelled to match `apps/admin/src/lib/assistant-transport.ts`'s own
 * `translateRunAgentPayload(payload)` switch verbatim (same `type` strings, same field names), so
 * `assistant-byok.ts` can hand each event straight to the wire as `payload` and the ALREADY-SHIPPED
 * client-side translator (used today for the daemon path) renders it with zero new frontend
 * branching for the browser side of the pipe.
 *
 * What this module deliberately does NOT do: no tool-loop logic of its own (each provider's own
 * `run*ToolTurn` owns its request/response loop and its own `maxToolTurns` bound), no HTTP call (the
 * provider adapters make those directly), no credential storage (the caller resolves `apiKey` before
 * calling in). This is purely an adapter layer — map tool descriptors in, map tool calls/results and
 * turn events across the boundary, nothing else.
 */
import type { ToolDescriptor } from "@jini-ai/core";
import {

## src/forms/submit-service.ts:60-95
 *
 * @complexity O(1) plus `validateSubmissionPayload`'s O(n) over declared fields.
 * @overallScore 100
 */
export async function submitForm(required: SubmitFormRequired): Promise<{ status: "accepted" }> {
  const { deps, input } = required;

  // REQ-07/AC-11/AC-12/EC-03 — nonexistent and disabled slugs are indistinguishable.
  const definition = await deps.definitionRepo.findBySlug({ workspaceId: input.workspaceId, slug: input.slug });
  if (!definition || definition.status !== "active") {
    throw new FormDefinitionNotFoundError(`form '${input.slug}' was not found`);
  }

  // REQ-08/INV-04/AC-13 — honeypot check runs before validation/rate-limit/persistence; a trip
  // returns the identical accepted response with zero side effects.
  if (isHoneypotTripped({ hp: input.body[HONEYPOT_KEY] })) {
    return { status: "accepted" };
  }

  const validation = validateSubmissionPayload({ definition, body: input.body });
  if (!validation.valid) {
    throw new FormSubmissionValidationError(
      "submission failed field validation",
      validation.fieldErrors
    );
  }

  // REQ-09/INV-09 — composite (ip, formId) key so two different forms from the same IP are never
  // cross-throttled.
  const rateLimitKey = buildFormsRateLimitKey({ sourceIp: input.sourceIp, formDefinitionId: definition.id });
  const rateLimitResult = deps.rateLimiter.check(rateLimitKey);
  if (!rateLimitResult.allowed) {
    throw new FormRateLimitExceededError(
      `rate limit exceeded for form '${definition.id}'`,
      rateLimitResult.retryAfterSeconds
    );

## src/cli/program.ts:34-60

  program
    .command("init")
    .description("instantiate the starter template into a new install dir")
    .argument("<dir>", "target install directory")
    .option("--name <name>", "site display name (defaults to the directory's basename)")
    .action(async (dir: string, options: { name?: string }) => {
      await runInitCommand({ dir, name: options.name });
    });

  program
    .command("serve")
    .description("validate, migrate, and boot an install dir — serves site + admin")
    .argument("<dir>", "install directory to serve")
    .option("--port <port>", "port to listen on (default: config.json.port, then PORT env, then 3000)")
    .option("--workspace <id>", "workspace id to serve (default: the oldest workspace, if the install has more than one)")
    .action(async (dir: string, options: { port?: string; workspace?: string }) => {
      await runServeCommand({ dir, port: options.port, workspaceId: options.workspace });
    });

  program
    .command("introspect")
    .description("output a machine-readable JSON description of this CLI's own commands and options (for programmatic/agent callers, e.g. Tovu-Runner)")
    .option("--format <format>", 'output format: "commander" (raw command/option shape) or "mcp" (MCP tool definitions)', "commander")
    .action(async (options: { format?: string }) => {
      await runIntrospectCommand({ manifest: introspectProgram(program), format: options.format });
    });

## ls src/server/routes/site/
__tests__
analytics-ingest.ts
comments-submit.ts
forms-submit.ts
media-rendition.ts
newsletter-confirm.ts
newsletter-deps.ts
newsletter-unsubscribe.ts
pages.ts
payments-webhook.ts
products.ts
robots.ts
sitemap.ts
store.ts

## POST handlers in site routes
src/server/routes/site/forms-submit.ts
src/server/routes/site/comments-submit.ts
src/server/routes/site/analytics-ingest.ts
src/server/routes/site/newsletter-unsubscribe.ts
src/server/routes/site/payments-webhook.ts

## container files present?
ls: .dockerignore: No such file or directory
ls: Dockerfile: No such file or directory
ls: docker-compose.yml: No such file or directory
ls: fly.toml: No such file or directory
ls: render.yaml: No such file or directory

## root package.json file: deps + native
file: count = 12
native: @jini-ai/sqlite, argon2, better-sqlite3, sharp
engines: {"node":">=20.6.0"}

## apps/admin file: dep count
10

## .gitignore:16-23
!.env.example
# infra/ is the site's runtime data folder: content.db + WAL sidecars, uploads/, the ADR-041 ops
# journals, plugin snapshots, restore points. None of it is source. README.md stays tracked so the
# directory exists in a fresh clone -- openContentDb does not create the parent, so an absent
# infra/ fails boot with SQLITE_CANTOPEN.
infra/*
!infra/README.md

