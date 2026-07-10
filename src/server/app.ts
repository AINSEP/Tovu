import express from "express";
import { randomUUID } from "node:crypto";

import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "../core/events";
import { InMemoryChangeSetRepo } from "../core/commands";
import { InMemoryPostRepo } from "../features/post";
import { InMemoryPresentationSettingsRepo } from "../features/presentation";
import { discoverThemes } from "../features/theme";
import { createWorkspace, InMemoryWorkspaceRepo, WorkspaceConflictError, WorkspaceValidationError } from "../features/workspace";
import path from "node:path";
import { builtInThemesDir } from "./deps";
import { seededPosts, seededPresentation, seededWorkspace } from "./seed";

import { applyDevCors } from "./middleware/dev-cors";
import { registerAdminStatic } from "./middleware/admin-static";
import { registerAuthRoutes, requireAdminSession } from "./middleware/dev-auth";
import { registerAdminPostListRoute } from "./routes/admin/posts/list";
import { registerSiteRoutes } from "./routes/site/pages";
import { registerStoreRoutes } from "./routes/site/store";
import { registerAdminPresentationGetRoute } from "./routes/admin/presentation/get";
import { registerAdminPresentationPatchRoute } from "./routes/admin/presentation/patch-active-theme";
import { registerAdminPostGetRoute } from "./routes/admin/posts/get-by-id";
import { registerAdminPostUpdateRoute } from "./routes/admin/posts/update";
import { registerAdminChangeSetListRoute } from "./routes/admin/change-sets/list";
import { registerAdminChangeSetGetRoute } from "./routes/admin/change-sets/get";
import { registerAdminChangeSetRevertRoute } from "./routes/admin/change-sets/revert";
import { registerContentPostGetRoute } from "./routes/content/posts/get-by-slug";
import { registerHealthRoute } from "./routes/ops/health";
import type { RouteDeps } from "./routes/types";

/**
 * @file HTTP composition root and route wiring.
 *
 * Purpose:
 * Assembles concrete adapters and exposes API endpoints.
 *
 * How it relates to the project:
 * - Default composition uses in-memory adapters seeded from `./seed` — this is
 *   what tests exercise (hermetic, no filesystem). The running server injects
 *   the SQLite composition from `./deps` instead (see `index.ts`).
 * - Calls `createWorkspace` slice for command handling.
 * - Triggers `processOutbox` after successful writes to deliver async events.
 *
 * Architectural role:
 * Keeps transport concerns (HTTP, status codes, request parsing) separate from
 * domain logic. Feature code remains reusable outside Express.
 */

/** In-memory route deps seeded from `./seed`. Default for tests/dev. */
export function createRouteDeps(): RouteDeps {
  const workspaceRepo = new InMemoryWorkspaceRepo([seededWorkspace]);
  const postRepo = new InMemoryPostRepo(seededPosts);
  const presentationRepo = new InMemoryPresentationSettingsRepo([seededPresentation]);

  return {
    workspaceId: seededWorkspace.id,
    workspaceRepo,
    postRepo,
    presentationRepo,
    changeSets: new InMemoryChangeSetRepo(),
    themes: discoverThemes(builtInThemesDir(), "built-in"),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    clock: { nowIso: () => new Date().toISOString() },
    idGen: { newId: () => randomUUID() },
  };
}

export function createApp(routeDeps: RouteDeps = createRouteDeps()) {
  const app = express();
  applyDevCors(app);
  app.use(express.json());

  void routeDeps.bus.subscribe("workspace.created", async (event) => {
    // Demonstration side effect. Replace with indexers/webhooks/etc.
    console.log("event handled:", event.name, event.payload);
  });

  registerHealthRoute(app, routeDeps);

  // Session auth: login/logout/me are ungated; everything else under
  // /api/admin requires a session (dev-grade until the permissions feature).
  registerAuthRoutes(app);
  app.use("/api/admin", requireAdminSession);

  registerAdminPostListRoute(app, routeDeps);
  registerAdminPostGetRoute(app, routeDeps);
  registerAdminPostUpdateRoute(app, routeDeps);
  registerAdminChangeSetListRoute(app, routeDeps);
  registerAdminChangeSetGetRoute(app, routeDeps);
  registerAdminChangeSetRevertRoute(app, routeDeps);
  registerAdminPresentationGetRoute(app, routeDeps);
  registerAdminPresentationPatchRoute(app, routeDeps);
  registerContentPostGetRoute(app, routeDeps);

  // Built admin SPA (apps/admin/dist) at /admin; helpful 503 when unbuilt.
  registerAdminStatic(app, {
    distDir: process.env.TOVU_ADMIN_DIST ?? path.resolve(__dirname, "../../apps/admin/dist"),
  });

  /**
   * Create workspace route.
   *
   * Hybrid execution model:
   * - synchronous command path for validation + persistence
   * - outbox flush to run async side effects reliably
   */
  app.post("/workspaces", async (req, res) => {
    try {
      const { id } = await createWorkspace(
        {
          deps: {
            idGen: routeDeps.idGen,
            clock: routeDeps.clock,
            repo: routeDeps.workspaceRepo,
            outbox: routeDeps.outbox,
          },
          input: {
            name: String(req.body?.name ?? ""),
            slug: String(req.body?.slug ?? ""),
          },
        }
      );

      await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });

      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof WorkspaceValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      if (err instanceof WorkspaceConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });

  // SPIKE: sample Tier-3 store page — must precede the site `/:slug` catch-all.
  registerStoreRoutes(app, routeDeps);

  // Public dummy site — registered last (GET /:slug is a catch-all).
  registerSiteRoutes(app, routeDeps);

  return app;
}

export const app = createApp();
