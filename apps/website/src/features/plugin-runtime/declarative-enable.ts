/**
 * @file The enable path for a plugin's DECLARED contributions (AW-7 Tier 1, 2026-10-04) — wraps the
 * runtime's code-loading `onPluginEnabled` so a `tier-1` (manifest-only) plugin is applied from its
 * manifest and never imported, and a code plugin that also declares content types gets them.
 *
 * Why a wrapper and not a branch inside `composePluginRuntime().onPluginEnabled`: that function (and
 * `manifest.ts`) are being reworked by the in-flight conflict-detection change on the same day, and
 * the declarative path needs nothing from the loader. The composition roots wrap the runtime's
 * `onPluginEnabled` with {@link createDeclarativeAwareEnable} where they hand it to the routes. The
 * follow-ups (recorded in the AW-7 report): run this inside the runtime after its conflict gate, so
 * a tier-1 plugin is checked against other plugins' claims too, and make boot re-attach skip tier-1
 * records (today the boot pass tries to load one, fails to find `server/index.mjs`, and logs a
 * warning — harmless, since declared types are already persisted, but noisy).
 *
 * Order for a code plugin with content types: plan (read-only) → load code → create types. A
 * conflict refuses the enable before the plugin's code is imported, and a failed load leaves no
 * types behind.
 */
import {
  NoopContentTypeIndexProvisioner,
  registerContentType,
  toContentTypeOutbox,
  type ContentTypeRepoPort,
  type ContentTypeWriteServiceDeps,
  type IndexProvisionerPort,
} from "#src/features/content-types/index";

import { PluginInvalidError } from "./activation.js";
import { applyDeclaredContentTypes, planDeclaredContentTypes, validateDeclarativeManifest, type DeclaredContentTypePorts } from "./declarative-content-types.js";
import type { PluginDiscoveryRecord } from "./discovery.js";

export interface CreateDeclarativeAwareEnableRequired {
  readonly workspaceId: string;
  /** The same discovery the runtime uses — the declared manifest is read from its record. */
  readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  /** The runtime's own code-loading enable (`composePluginRuntime().onPluginEnabled`). */
  readonly enableCode: (pluginId: string) => Promise<void>;
  readonly contentTypes: DeclaredContentTypePorts;
}

/**
 * Returns an `onPluginEnabled` that applies declared contributions around the code loader.
 * A record that is missing or not `valid` goes straight to `enableCode`, whose own fail-closed path
 * already reports it (no second error vocabulary). Declaration problems and content-type conflicts
 * throw `PluginInvalidError`, which the enable route maps to 422 and `setPluginEnabled` compensates.
 */
export function createDeclarativeAwareEnable(required: CreateDeclarativeAwareEnableRequired, _optional: Record<string, never> = {}): (pluginId: string) => Promise<void> {
  const { workspaceId, discoverPlugins, enableCode, contentTypes: ports } = required;
  return async function onPluginEnabled(pluginId: string): Promise<void> {
    const manifest = (await discoverPlugins()).find((candidate) => candidate.id === pluginId)?.manifest;
    // Nothing declared and code to load: byte-for-byte the runtime's own path.
    if (!manifest || (manifest.tier !== "tier-1" && manifest.contentTypes == null)) return enableCode(pluginId);

    const { decls, errors } = validateDeclarativeManifest({ manifest });
    if (errors.length > 0) {
      throw new PluginInvalidError(`plugin '${pluginId}' declares something it cannot: ${errors.map((error) => error.message).join("; ")}`);
    }
    const plan = await planDeclaredContentTypes({ ports, workspaceId, decls });
    if (plan.conflicts.length > 0) {
      throw new PluginInvalidError(`plugin '${pluginId}' cannot be turned on: ${plan.conflicts.join("; ")}`);
    }
    // ADR-024 §1: a Tier-1 plugin is zero executable code — the runtime never imports anything for it.
    if (manifest.tier !== "tier-1") await enableCode(pluginId);
    await applyDeclaredContentTypes({ ports, workspaceId, pluginId, plan });
  };
}

export interface CreateDeclaredContentTypePortsRequired {
  readonly repo: ContentTypeRepoPort;
  readonly clock: ContentTypeWriteServiceDeps["clock"];
  readonly ids: { newId: () => string };
  /** The root's raw outbox; wrapped per call with `toContentTypeOutbox` (it needs the workspace). */
  readonly outbox: Parameters<typeof toContentTypeOutbox>[0]["outbox"];
}

export interface CreateDeclaredContentTypePortsOptional {
  /** Defaults to the no-op provisioner — the same one both composition roots use today. */
  readonly indexProvisioner?: IndexProvisionerPort;
}

/**
 * Binds core's `registerContentType` for the provisioner. `authorize` always allows, on purpose: the
 * real authorization already happened one layer up — turning a plugin on requires the plugin-manage
 * permission and the owner's consent, and these types are what that consented action declares
 * (the same reasoning as widgets' `PRE_AUTHORIZED`). The write is recorded as `principalKind:
 * "system"` with the plugin as actor, so the revision log says no human typed this schema.
 */
export function createDeclaredContentTypePorts(
  required: CreateDeclaredContentTypePortsRequired,
  optional: CreateDeclaredContentTypePortsOptional = {}
): DeclaredContentTypePorts {
  const { repo, clock, ids, outbox } = required;
  const indexProvisioner = optional.indexProvisioner ?? new NoopContentTypeIndexProvisioner();
  return {
    findByKey: (params) => repo.findByKey(params),
    async register(input) {
      const deps: ContentTypeWriteServiceDeps = {
        repo,
        clock,
        ids,
        authorize: async () => ({ allowed: true, reason: "declared by an enabled plugin" }),
        indexProvisioner,
        outbox: toContentTypeOutbox({ outbox, clock, idGen: ids, workspaceId: input.workspaceId }),
      };
      const result = await registerContentType({
        deps,
        input: { ...input, principalKind: "system" },
      });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
  };
}
