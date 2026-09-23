import type { Express } from "express";

import type { TrashAuthorizeFn, TrashDb, TrashPort, TrashRegistry } from "#src/features/trash/index";
import type { UserRepoPort } from "@jini-ai/cms/identity";

/**
 * @file The narrow dependency slice the four Trash admin routes read, and the registrar shape
 * `modules/trash.ts` composes them with — the same convention `routes/media/deps.ts` established.
 *
 * `trash` is the whole {@link TrashPort}, including `purgeSelected`. That is deliberate and it is
 * the ONLY place in the product that holds it: permanent deletion is human-only, so the one caller
 * is an authenticated admin route behind the Trash screen's confirm modal. No tool registration
 * anywhere can reach it — see `features/trash/__tests__/tool-registrations.purge-ban.test.ts`.
 *
 * `registry` and `db` are read by `items.ts` (the generic `POST /trash/items` route, via
 * `moveToTrash`) and by `permissions.ts`'s `trashPermissionFor`/`mayActOnEntityType`/
 * `filterVisibleTrashItems`, which `list.ts`/`restore.ts`/`purge.ts` already call with this same
 * `deps` object — one field serving both concerns (plan §8/§9).
 *
 * `userRepo` is read only by `list.ts`, to resolve each row's `actorPrincipalId` to a username for
 * the "Deleted by" column (2026-09-21) — the admin screen must never show a raw principal UUID.
 */
export interface TrashRouteDeps {
  workspaceId: string;
  authorize: TrashAuthorizeFn;
  clock: { nowIso(): string };
  trash: TrashPort;
  registry: TrashRegistry;
  db: TrashDb;
  userRepo: UserRepoPort;
}

export type TrashRouteRegistrar = (app: Express, deps: TrashRouteDeps) => void;

/** Rows per page when the caller does not say. Matches the screen's own first render. */
export const DEFAULT_TRASH_PAGE_SIZE = 50;

/** Hard ceiling on `limit`, so a caller-supplied number can never turn one request into a scan. */
export const MAX_TRASH_PAGE_SIZE = 200;

/** The most rows one restore or purge request may name. Each is its own transaction. */
export const MAX_TRASH_SELECTION = 200;
