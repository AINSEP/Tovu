import express from "express";
import { createApp as createBaseApp } from "#src/server/runtime/composition/app";
import { registerProductRoutes, type CommerceSiteAdapterDeps } from "../products.js";
export type CommerceSiteTestDeps = CommerceSiteAdapterDeps & NonNullable<Parameters<typeof createBaseApp>[0]>;
/** Opt-in test composition for the retained theme adapter. Production createApp stays off. */
export function createCommerceSiteTestApp(deps: CommerceSiteTestDeps, _optional: Record<string, never> = {}): express.Express {
  const app = express();
  registerProductRoutes(app, deps);
  app.use(createBaseApp(deps));
  return app;
}
