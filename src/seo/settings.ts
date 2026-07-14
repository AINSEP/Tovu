import type { ClockPort, IdGeneratorPort, JsonValue, UUID } from "../core/ports";
import type { PrincipalRepoPort } from "../identity/ports";
import type { SettingsRepoPort } from "../features/settings/ports";
import { getEffective, resolveDefinitionRaw } from "../features/settings/settings";
import { SCOPE_BIT, type SettingValueSchema } from "../features/settings/types";
import { registerDefinitions, set, type AuthorizeFn } from "../features/settings/write-service";
import { SeoSettingsValidationError } from "./errors";
import type { RobotsRule, SeoSettingKey, SeoSettings } from "./types";

/**
 * @file `getSeoSettings`/`setSeoSettings`/`ensureSeoSettingDefinitions`
 * (ADR-PIPE-008 Decision §3, C-005/C-006/C-007) — maps the `site.seo.*`
 * ledger definitions to/from `SeoSettings`, validating `titleTemplate`/
 * `robotsRules` before ANY key is written (all-or-nothing, INV-06).
 *
 * Disclosed "7 vs 8" note: ADR-PIPE-008/tasks.md prose repeatedly says "7"
 * (the conceptual `SeoSettings` field count), but Decision §3's own concrete
 * mapping table lists 8 registered ledger keys — `defaultRobots` decomposes
 * into `default_robots_noindex` + `default_robots_nofollow`. This file
 * registers all 8 keys the table requires; registering only 7 would silently
 * drop half of `defaultRobots`'s round trip. See
 * `__tests__/settings.definitions.test.ts`'s header for the same note.
 *
 * `robotsRules` rides the ledger's new `{type:"json"}` schema variant
 * (T008/C-024) — used exactly once, here, per ADR-PIPE-008 Enforcement.
 * Every other field is scalar-decomposed (Article III).
 */

const SEO_NAMESPACE = "site.seo";

interface SeoDefinitionSpec {
  key: SeoSettingKey;
  schema: SettingValueSchema;
  defaultValue: JsonValue;
}

/** The 8 registered `site.seo.*` definitions (Decision §3's mapping table). */
const SEO_DEFINITIONS: readonly SeoDefinitionSpec[] = [
  { key: "title_template", schema: { type: "string" }, defaultValue: "%s" },
  // Nullable-on-write, but every non-secret definition needs a non-null default (ledger totality,
  // `validateDefinitionInput`) — "" is this file's own "absent" sentinel, unwrapped to `undefined`
  // by `getSeoSettings` below (mirrors `titleTemplate`-shapes-everything, no site-level default here).
  { key: "default_description", schema: { type: "string", nullable: true }, defaultValue: "" },
  { key: "default_og_image", schema: { type: "string", nullable: true }, defaultValue: "" },
  { key: "twitter_site", schema: { type: "string", nullable: true }, defaultValue: "" },
  { key: "default_robots_noindex", schema: { type: "boolean" }, defaultValue: false },
  { key: "default_robots_nofollow", schema: { type: "boolean" }, defaultValue: false },
  { key: "sitemap_enabled", schema: { type: "boolean" }, defaultValue: true },
  { key: "robots_rules", schema: { type: "json" }, defaultValue: [] },
];

export interface EnsureSeoSettingDefinitionsDeps {
  settingsRepo: SettingsRepoPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  principals: PrincipalRepoPort;
}

export interface EnsureSeoSettingDefinitionsInput {
  workspaceId: UUID;
  /** The trusted boot-time actor these writes are attributed to (mirrors `migration.ts`'s convention). */
  systemPrincipalId: UUID;
}

/**
 * Boot-time infra work is trusted by construction (mirrors `migration.ts`'s
 * identical shim) — `ensureSeoSettingDefinitions` ALWAYS uses this, never a
 * caller-supplied `authorize`, since it runs before any request-scoped
 * principal exists to authorize against.
 */
const alwaysAllowBoot: AuthorizeFn = async () => ({ allowed: true, reason: "system_boot" });

function bootWriteServiceDeps(deps: EnsureSeoSettingDefinitionsDeps) {
  return {
    repo: deps.settingsRepo,
    clock: deps.clock,
    ids: deps.ids,
    authorize: alwaysAllowBoot,
    principals: deps.principals,
  };
}

function callerWriteServiceDeps(deps: SeoSettingsWriteDeps) {
  return {
    repo: deps.settingsRepo,
    clock: deps.clock,
    ids: deps.ids,
    authorize: deps.authorize,
    principals: deps.principals,
  };
}

/**
 * REQ-11 — idempotently registers the 8 `site.seo.*` definitions (skip if
 * already registered, mirrors `migration.ts`'s `ensureCoreDefinition`/
 * `ensureThemeDefinitions` pattern exactly). Safe to call on every boot.
 *
 * @complexity O(1) — 8 fixed definitions.
 */
export async function ensureSeoSettingDefinitions(
  deps: EnsureSeoSettingDefinitionsDeps,
  input: EnsureSeoSettingDefinitionsInput
): Promise<void> {
  for (const def of SEO_DEFINITIONS) {
    const existing = await resolveDefinitionRaw(
      { repo: deps.settingsRepo },
      { namespace: SEO_NAMESPACE, key: def.key, workspaceId: input.workspaceId }
    );
    if (existing) continue;

    await registerDefinitions({
      deps: bootWriteServiceDeps(deps),
      input: {
        callerPrincipalId: input.systemPrincipalId,
        authWorkspaceId: input.workspaceId,
        definitions: [
          {
            namespace: SEO_NAMESPACE,
            key: def.key,
            ownerKind: "site",
            workspaceId: input.workspaceId,
            schema: def.schema,
            defaultValue: def.defaultValue,
            scopes: SCOPE_BIT.workspace,
            secret: false,
          },
        ],
      },
    });
  }
}

async function readKey(
  settingsRepo: SettingsRepoPort,
  workspaceId: UUID,
  key: SeoSettingKey
): Promise<JsonValue | null> {
  const resolved = await getEffective(
    { repo: settingsRepo },
    { namespace: SEO_NAMESPACE, key, scopeContext: { workspaceId } }
  );
  return resolved ? resolved.value : null;
}

/** Unwraps this file's own `""`-means-absent sentinel (see `SEO_DEFINITIONS`' doc comment). */
function undefinedIfEmpty(value: JsonValue | null): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export interface GetSeoSettingsDeps {
  settingsRepo: SettingsRepoPort;
}

/** REQ-11/12 — reads all 8 `site.seo.*` values via `getEffective`, recomposes `defaultRobots`. */
export async function getSeoSettings(
  deps: GetSeoSettingsDeps,
  input: { workspaceId: UUID }
): Promise<SeoSettings> {
  const [titleTemplate, defaultDescription, defaultOgImage, twitterSite, noindex, nofollow, sitemapEnabled, robotsRules] =
    await Promise.all([
      readKey(deps.settingsRepo, input.workspaceId, "title_template"),
      readKey(deps.settingsRepo, input.workspaceId, "default_description"),
      readKey(deps.settingsRepo, input.workspaceId, "default_og_image"),
      readKey(deps.settingsRepo, input.workspaceId, "twitter_site"),
      readKey(deps.settingsRepo, input.workspaceId, "default_robots_noindex"),
      readKey(deps.settingsRepo, input.workspaceId, "default_robots_nofollow"),
      readKey(deps.settingsRepo, input.workspaceId, "sitemap_enabled"),
      readKey(deps.settingsRepo, input.workspaceId, "robots_rules"),
    ]);

  return {
    titleTemplate: typeof titleTemplate === "string" ? titleTemplate : "%s",
    defaultDescription: undefinedIfEmpty(defaultDescription),
    defaultOgImage: undefinedIfEmpty(defaultOgImage),
    twitterSite: undefinedIfEmpty(twitterSite),
    defaultRobots: { noindex: noindex === true, nofollow: nofollow === true },
    sitemapEnabled: sitemapEnabled !== false,
    robotsRules: Array.isArray(robotsRules) ? (robotsRules as unknown as RobotsRule[]) : [],
  };
}

export interface SeoSettingsWriteDeps extends GetSeoSettingsDeps {
  clock: ClockPort;
  ids: IdGeneratorPort;
  authorize: AuthorizeFn;
  principals: PrincipalRepoPort;
}

export interface SetSeoSettingsInput {
  workspaceId: UUID;
  patch: Partial<SeoSettings>;
  callerPrincipalId: UUID;
}

const MAX_ROBOTS_RULES = 50;
const MAX_RULE_PATH_ENTRIES = 100;
const TITLE_TEMPLATE_MAX_LENGTH = 500;
const DEFAULT_DESCRIPTION_MAX_LENGTH = 500;
const DEFAULT_OG_IMAGE_MAX_LENGTH = 2048;

function validateSeoSettingsPatch(patch: Partial<SeoSettings>): void {
  if (patch.titleTemplate !== undefined) {
    if (typeof patch.titleTemplate !== "string" || !patch.titleTemplate.includes("%s")) {
      throw new SeoSettingsValidationError("titleTemplate must contain '%s' at least once");
    }
    if (patch.titleTemplate.length > TITLE_TEMPLATE_MAX_LENGTH) {
      throw new SeoSettingsValidationError(`titleTemplate must be at most ${TITLE_TEMPLATE_MAX_LENGTH} characters`);
    }
  }

  if (patch.defaultDescription !== undefined && patch.defaultDescription !== null) {
    if (typeof patch.defaultDescription !== "string") {
      throw new SeoSettingsValidationError("defaultDescription must be a string");
    }
    if (patch.defaultDescription.length > DEFAULT_DESCRIPTION_MAX_LENGTH) {
      throw new SeoSettingsValidationError(
        `defaultDescription must be at most ${DEFAULT_DESCRIPTION_MAX_LENGTH} characters`
      );
    }
  }

  if (patch.defaultOgImage !== undefined && patch.defaultOgImage !== null) {
    if (typeof patch.defaultOgImage !== "string") {
      throw new SeoSettingsValidationError("defaultOgImage must be a string");
    }
    if (patch.defaultOgImage.length > DEFAULT_OG_IMAGE_MAX_LENGTH) {
      throw new SeoSettingsValidationError(`defaultOgImage must be at most ${DEFAULT_OG_IMAGE_MAX_LENGTH} characters`);
    }
  }

  if (patch.defaultRobots !== undefined) {
    if (
      typeof patch.defaultRobots !== "object" ||
      patch.defaultRobots === null ||
      typeof patch.defaultRobots.noindex !== "boolean" ||
      typeof patch.defaultRobots.nofollow !== "boolean"
    ) {
      throw new SeoSettingsValidationError("defaultRobots requires boolean noindex/nofollow");
    }
  }

  if (patch.sitemapEnabled !== undefined && typeof patch.sitemapEnabled !== "boolean") {
    throw new SeoSettingsValidationError("sitemapEnabled must be a boolean");
  }

  if (patch.robotsRules !== undefined) {
    if (!Array.isArray(patch.robotsRules)) {
      throw new SeoSettingsValidationError("robotsRules must be an array");
    }
    if (patch.robotsRules.length > MAX_ROBOTS_RULES) {
      throw new SeoSettingsValidationError(`robotsRules may contain at most ${MAX_ROBOTS_RULES} rules`);
    }
    for (const rule of patch.robotsRules) {
      if (!rule || typeof rule.userAgent !== "string" || rule.userAgent.trim() === "") {
        throw new SeoSettingsValidationError("each robots rule requires a non-empty userAgent");
      }
      for (const field of ["allow", "disallow"] as const) {
        const list = rule[field];
        if (list === undefined) continue;
        if (!Array.isArray(list)) {
          throw new SeoSettingsValidationError(`robots rule '${field}' must be an array`);
        }
        if (list.length > MAX_RULE_PATH_ENTRIES) {
          throw new SeoSettingsValidationError(`robots rule '${field}' may contain at most ${MAX_RULE_PATH_ENTRIES} entries`);
        }
      }
    }
  }
}

/** REQ-11/15 chokepoint write: validate ALL fields (all-or-nothing) -> decompose -> N ledger `set()` calls. */
export async function setSeoSettings(deps: SeoSettingsWriteDeps, input: SetSeoSettingsInput): Promise<SeoSettings> {
  validateSeoSettingsPatch(input.patch);

  const writes: Array<{ key: SeoSettingKey; value: JsonValue }> = [];
  if (input.patch.titleTemplate !== undefined) {
    writes.push({ key: "title_template", value: input.patch.titleTemplate });
  }
  if (input.patch.defaultDescription !== undefined) {
    writes.push({ key: "default_description", value: input.patch.defaultDescription ?? "" });
  }
  if (input.patch.defaultOgImage !== undefined) {
    writes.push({ key: "default_og_image", value: input.patch.defaultOgImage ?? "" });
  }
  if (input.patch.twitterSite !== undefined) {
    writes.push({ key: "twitter_site", value: input.patch.twitterSite ?? "" });
  }
  if (input.patch.defaultRobots !== undefined) {
    writes.push({ key: "default_robots_noindex", value: input.patch.defaultRobots.noindex });
    writes.push({ key: "default_robots_nofollow", value: input.patch.defaultRobots.nofollow });
  }
  if (input.patch.sitemapEnabled !== undefined) {
    writes.push({ key: "sitemap_enabled", value: input.patch.sitemapEnabled });
  }
  if (input.patch.robotsRules !== undefined) {
    writes.push({ key: "robots_rules", value: input.patch.robotsRules as unknown as JsonValue });
  }

  for (const write of writes) {
    await set({
      deps: callerWriteServiceDeps(deps),
      input: {
        namespace: SEO_NAMESPACE,
        key: write.key,
        scope: "workspace",
        value: write.value,
        workspaceId: input.workspaceId,
        authWorkspaceId: input.workspaceId,
        callerPrincipalId: input.callerPrincipalId,
      },
    });
  }

  return getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: input.workspaceId });
}
