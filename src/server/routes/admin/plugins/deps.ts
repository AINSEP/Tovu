import type { Express } from "express";

import type { AuthorizeFn, ChangeSetRepoPort } from "#src/core/commands/index";
import type { ClockPort, IdGeneratorPort, OutboxPort, UUID } from "#src/core/ports";
import type { PluginActivationRepoPort } from "#src/features/plugin-runtime/activation";
import type { PluginDiscoveryRecord } from "#src/features/plugin-runtime/discovery";

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
  workspaceId: UUID;
  authorize: AuthorizeFn;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  changeSets: ChangeSetRepoPort;
  outbox?: OutboxPort;
  pluginActivationRepo: PluginActivationRepoPort;
  /** Pre-bound: `installDir`/`builtIns` already captured by the composition root. */
  discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
}

export type PluginsRouteRegistrar = (app: Express, deps: PluginsRouteDeps) => void;
