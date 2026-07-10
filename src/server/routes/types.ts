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
  /** SPIKE: seam for the sample Tier-3 store plugin (data lives in plugin-owned `p_store__*`
   * tables). Optional — only the SQLite runtime wires it (see `index.ts`). */
  store?: {
    listProducts(): { id: string; title: string; price: number; stock: number; version: number }[];
    checkout(
      productId: string,
      qty: number
    ):
      | { ok: true; orderId: string; remainingStock: number; retries: number }
      | { ok: false; reason: "not-found" | "out-of-stock" | "conflict"; retries: number };
  };
}

export type RouteRegistrar = (app: Express, deps: RouteDeps) => void;
