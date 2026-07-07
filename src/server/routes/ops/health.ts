import type { RouteRegistrar } from "../types";

export const registerHealthRoute: RouteRegistrar = (app) => {
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
};
