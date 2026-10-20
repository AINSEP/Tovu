// Composition deps read the site catalog home; this keeps them off the real user home.
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import express from "express";

import { InMemoryPublishContentPeerRepo, type PublishContentPeerRecord } from "#src/features/publish-content/peers";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import type { PublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";

import type { PublishContentRouteDeps, PublishContentRouteRegistrar } from "../deps.js";

/**
 * @file Typed route fixture for this folder's pin tests: the composition's real in-memory
 * `RouteDeps` (so every port is a real implementation, not a cast), with the boundary under test
 * overridden, mounted behind a stand-in for `requireAdminSession` that records the principal and
 * credential kind the request headers name.
 */

export const WS = "ws";
export const BASE = `/api/admin/v1/workspaces/${WS}/publish-content`;

/** `authorize()` that answers `allowed` for every permission and records what was asked. */
export function recordingAuthorize(allowed: boolean | ((permission: string) => boolean) = true): PublishContentRouteDeps["authorize"] & { asked: string[] } {
  const asked: string[] = [];
  const fn = async ({ permission }: { permission: string }) => {
    asked.push(permission);
    return { allowed: typeof allowed === "function" ? allowed(permission) : allowed, reason: "fixture" };
  };
  return Object.assign(fn, { asked });
}

/** The composition's in-memory deps for workspace {@link WS}, with `overrides` applied. */
export function routeDeps(overrides: Partial<PublishContentRouteDeps> = {}): PublishContentRouteDeps {
  const base: PublishContentRouteDeps = { ...createRouteDeps(), workspaceId: WS, authorize: recordingAuthorize() };
  return { ...base, ...overrides };
}

/**
 * An express app with `register` mounted. `x-principal` / `x-kind` headers set the principal and
 * credential kind (defaults: `owner` / `session`); `x-principal: none` leaves no principal at all,
 * the "requireAdminSession did not run" fault. `json: false` mounts no body parser; `publishTrust`
 * records a publishing credential's grant the way the publish-trust gate does.
 */
export function routeApp(
  register: PublishContentRouteRegistrar,
  deps: PublishContentRouteDeps,
  options: { json?: boolean; publishTrust?: PublishTrustContext } = {}
): express.Express {
  const app = express();
  if (options.json !== false) app.use(express.json());
  app.use((req, res, next) => {
    const principal = req.get("x-principal") ?? "owner";
    if (principal !== "none") res.locals.principal = { id: principal };
    res.locals.authCredentialKind = req.get("x-kind") ?? "session";
    if (options.publishTrust) res.locals.publishTrust = options.publishTrust;
    next();
  });
  register(app, deps);
  return app;
}

/** A peer repo whose list/find/delete throw `error`, so each route's catch arm is reached. */
export class FailingPeerRepo extends InMemoryPublishContentPeerRepo {
  constructor(private readonly error: Error) {
    super();
  }
  override async listByWorkspace(): Promise<PublishContentPeerRecord[]> {
    throw this.error;
  }
  override async findById(): Promise<PublishContentPeerRecord | null> {
    throw this.error;
  }
  override async delete(): Promise<void> {
    throw this.error;
  }
}
