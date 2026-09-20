import type { Express } from "express";

import type { TrashAuthorizeFn } from "#src/features/trash/index";
import type { TrashPort } from "#src/features/trash/index";

/**
 * @file The narrow dependency slice the three Trash admin routes read, and the registrar shape
 * `modules/trash.ts` composes them with — the same convention `routes/media/deps.ts` established.
 *
 * `trash` is the whole {@link TrashPort}, including `purgeSelected`. That is deliberate and it is
 * the ONLY place in the product that holds it: permanent deletion is human-only, so the one caller
 * is an authenticated admin route behind the Trash screen's confirm modal. No tool registration
 * anywhere can reach it — see `features/trash/__tests__/tool-registrations.purge-ban.test.ts`.
 */
export interface TrashRouteDeps {
  workspaceId: string;
  authorize: TrashAuthorizeFn;
  clock: { nowIso(): string };
  trash: TrashPort;
}

export type TrashRouteRegistrar = (app: Express, deps: TrashRouteDeps) => void;

/** Rows per page when the caller does not say. Matches the screen's own first render. */
export const DEFAULT_TRASH_PAGE_SIZE = 50;

/** Hard ceiling on `limit`, so a caller-supplied number can never turn one request into a scan. */
export const MAX_TRASH_PAGE_SIZE = 200;

/** The most rows one restore or purge request may name. Each is its own transaction. */
export const MAX_TRASH_SELECTION = 200;
