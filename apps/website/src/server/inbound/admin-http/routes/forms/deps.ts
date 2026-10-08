import type { FormCommandExecutorPort } from "@jini-ai/cms/forms";
import type { Clock } from "@jini-ai/core/primitives";
import type { Express } from "express";

import type { FormsDeps, RouteDeps } from "#src/server/routes/types";

/**
 * @file Forms admin composition contract (ADR-046/SPEC-041).
 *
 * CRUD/submission-list routes compose `FormsDeps` with identity, clock, ids, change-sets
 * and outbox for the write service. See `FormsDeps` in `server/routes/types.ts` for the
 * public submission boundary. This HTTP surface is distinct from the Forms notification
 * subscriber (SPEC-031).
 */
// The package clock is bound here explicitly; composition supplies nowMs rather than an ISO getter.
export type FormsRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "idGen" | "changeSets" | "outbox"> & FormsDeps & {
  clock: Clock;
  executeCommand: FormCommandExecutorPort;
};

export type FormsRouteRegistrar = (app: Express, deps: FormsRouteDeps) => void;
