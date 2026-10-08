import express from "express";
import { createApp as createBaseApp } from "#src/server/runtime/composition/app";
import { registerProductRoutes, type CommerceSiteAdapterDeps } from "../products.js";
/** Opt-in test composition for the retained theme adapter. Production createApp stays off. */
export function createCommerceSiteTestApp(deps: CommerceSiteAdapterDeps): express.Express {
  const app = express();
  registerProductRoutes(app, deps);
  app.use(createBaseApp(deps));
  return app;
}
