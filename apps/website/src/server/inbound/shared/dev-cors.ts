import type { Express, Request, Response } from "express";

function isAllowedLocalOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

export function applyDevCors(app: Express) {
  app.use((req: Request, res: Response, next) => {
    const origin = req.headers.origin;

    if (origin && isAllowedLocalOrigin(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Methods", "GET,PUT,PATCH,OPTIONS");
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });
}
