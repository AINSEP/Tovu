import type { Express } from "express";

import type { AuthorizeFn, ChangeSetRepoPort } from "#src/contracts/core/commands/index";
import type { Clock as ClockPort, IdGenerator as IdGeneratorPort, UUID } from "@jini-ai/core/primitives";
import type { OutboxPort } from "@jini-ai/cms/core";
import type { PluginActivationRepoPort } from "@jini-ai/plugins/host";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";
import type { PluginBeforeSavePreview } from "#src/features/plugin-runtime/host-binding";
import type { PluginConflict } from "@jini-ai/plugins/host";
import type { PluginPackageFiles } from "@jini-ai/plugins/host/node";
import type { RemovePluginFn } from "@jini-ai/plugins/host";

/**
 * @file Narrow `RouteDeps` slice for the `plugins` admin HTTP surface (SPEC-005 REQ-10, C-016) —
 * mirrors `routes/admin/content/deps.ts`'s `ContentRouteDeps` narrowing pattern exactly (a genuine
 * narrowing to the fields these 2 registrars actually read, not a widening extension).
 *
 * `discoverPlugins`/`onEnabled`/`onDisabled` are pre-bound closures (installDir/builtIns already
 * captured, hook-registry attach/detach already captured) — the route layer itself never
 * constructs a `discoverPlugins()`/`loadPlugin()` call directly; the composition root
 * (`server/app.ts`/`server/deps.ts`, Programmer's Phase 1 Track D work) builds these closures once
 * and threads them through.
 *
 * Architectural role: TDD-owned type/wiring surface (implementation outline C-016). Not itself a
 * throwing stub (a type-only file has no runtime body to stub) — `list.ts`/`set-enabled.ts`'s
 * handler bodies are what carry the "not implemented" stub behavior.
 */
export interface PluginsRouteDeps {
  pluginInstaller?: import("@jini-ai/plugins/host/node").PluginInstallerPort;
  workspaceId: UUID;
  authorize: AuthorizeFn;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  changeSets: ChangeSetRepoPort;
  outbox?: OutboxPort;
  pluginActivationRepo: PluginActivationRepoPort;
  /** Pre-bound: `installDir`/`builtIns` already captured by the composition root. */
  discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  onPluginEnabled: (pluginId: string) => Promise<void>;
  onPluginDisabled: (pluginId: string) => void;
  /** 2026-10-04 — see `routes/types.ts`'s `PluginRuntimeDeps.listPluginConflicts`. */
  listPluginConflicts?: () => Promise<ReadonlyMap<string, readonly PluginConflict[]>>;
  removePlugin: RemovePluginFn;
  /** 2026-09-13 — pre-bound package-files listing (`installDir`/built-in sources already
   * captured). See `routes/types.ts`'s `PluginRuntimeDeps.readPluginPackageFiles` doc. */
  readPluginPackageFiles: (record: PluginDiscoveryRecord) => Promise<PluginPackageFiles>;
  /** AW-7 Tier 2 — see `routes/types.ts`'s `previewPluginBeforeSave` doc. */
  previewPluginBeforeSave: PluginBeforeSavePreview;
}

export type PluginsRouteRegistrar = (app: Express, deps: PluginsRouteDeps) => void;
