import type { AddressInfo } from "node:net";
import express, { type Express, type Request } from "express";

/**
 * @file Shared harness for the host-port tests: an Express app whose admin middleware is faked from
 * request headers (`x-kind` → `authCredentialKind`, `x-grant` → a publish-trust grant), so one server
 * answers session, API-key and publishing-credential requests side by side.
 */

/** The publish-trust grant the fake middleware attaches when a request sends `x-grant: 1`. */
export const PROBE_GRANT = { sourceInstallationId: "src", capabilities: ["probe.write"], entityTypes: ["probe"], generation: 1 };

/** An app with JSON parsing and a fake admin session read from the request headers.
 * @complexity O(1) per request. */
export function fakeAdminApp({ principal = true }: { principal?: boolean } = {}): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, res, next) => {
    if (principal) res.locals.principal = { id: "caller", kind: "user" };
    const kind = req.get("x-kind");
    if (kind) res.locals.authCredentialKind = kind;
    if (req.get("x-grant") === "1") res.locals.publishTrust = PROBE_GRANT;
    next();
  });
  return app;
}

/** Listen on an ephemeral port; `call` answers `{ status, body }` with a JSON (or empty) body.
 * @complexity O(1) setup. */
export async function listen({ app }: { app: Express }) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) => {
    const response = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", ...init.headers } });
    const text = await response.text();
    return { status: response.status, body: text === "" ? undefined : JSON.parse(text) as Record<string, unknown> };
  };
  return { base, call, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Capture what a hand-written helper writes to `res.status(..).json(..)`, for byte-equality checks.
 * @complexity O(1). */
export function captureRes({ locals = {} }: { locals?: Record<string, unknown> } = {}) {
  const written = { status: 0, body: undefined as unknown };
  const res = { locals, status(code: number) { written.status = code; return this; }, json(body: unknown) { written.body = body; return this; } };
  return { res, written };
}
