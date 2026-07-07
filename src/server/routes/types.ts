import type { Express } from "express";

import type { EventBusPort, OutboxPort, UUID } from "../../core/ports";
import type { PostRepoPort } from "../../features/post";
import type { PresentationSettingsRepoPort } from "../../features/presentation";
import type { WorkspaceRepoPort } from "../../features/workspace";

export interface RouteDeps {
  workspaceId: UUID;
  workspaceRepo: WorkspaceRepoPort;
  postRepo: PostRepoPort;
  presentationRepo: PresentationSettingsRepoPort;
  outbox: OutboxPort;
  bus: EventBusPort;
  clock: { nowIso(): string };
  idGen: { newId(): string };
}

export type RouteRegistrar = (app: Express, deps: RouteDeps) => void;
