import type { Express } from "express";

import type { EventBusPort, OutboxPort, UUID } from "../../core/ports";
import type { ChangeSetRepoPort } from "../../core/commands";
import type { PostRepoPort } from "../../features/post";
import type { PresentationSettingsRepoPort } from "../../features/presentation";
import type { DiscoveredTheme } from "../../features/theme";
import type { WorkspaceRepoPort } from "../../features/workspace";

export interface RouteDeps {
  workspaceId: UUID;
  workspaceRepo: WorkspaceRepoPort;
  postRepo: PostRepoPort;
  presentationRepo: PresentationSettingsRepoPort;
  /** Change-set store for the command gateway (in-memory in v1, ADR-008/018). */
  changeSets: ChangeSetRepoPort;
  /** Themes discovered at boot (built-in + site themes/ dir), SPEC-004 spike. */
  themes: DiscoveredTheme[];
  outbox: OutboxPort;
  bus: EventBusPort;
  clock: { nowIso(): string };
  idGen: { newId(): string };
}

export type RouteRegistrar = (app: Express, deps: RouteDeps) => void;
