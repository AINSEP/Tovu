import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PassThrough } from "node:stream";

import type { Express } from "express";

/** Dispatches through real Express/native HTTP without opening a listening socket.
 * Raw output lets HTML/security tests exercise the same transport as JSON routes. */
export async function dispatchHttpRequest(
  { app, method, url, body, headers = {} }: { app: Express; method: string; url: string; body?: unknown; headers?: Record<string, string> },
  _options = {},
) {
  const socket = new PassThrough();
  const req = new IncomingMessage(socket as unknown as Socket);
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost", ...headers };
  Object.assign(req, { body });
  req.push(null);
  const res = new ServerResponse(req);
  // The in-memory socket has no HTTP peer to decode transfer framing.
  res.useChunkedEncodingByDefault = false;
  res.assignSocket(socket as unknown as Socket);
  const chunks: Buffer[] = [];
  socket.on("data", (chunk: Buffer) => chunks.push(chunk));
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<{ status: number; body: string; headers: ReturnType<ServerResponse["getHeaders"]> }>((resolve, reject) => {
      deadline = setTimeout(() => reject(new Error("Express request did not finish")), 1000);
      res.on("finish", () => {
        const wire = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, headers: res.getHeaders(), body: wire.slice(wire.indexOf("\r\n\r\n") + 4) });
      });
      res.once("error", reject);
      app(req, res);
    });
  } finally {
    clearTimeout(deadline);
    socket.destroy();
  }
}

/** Preserve the existing JSON test contract over the shared raw transport. */
export async function dispatchJsonRequest(app: Express, method: string, url: string, body?: unknown) {
  const response = await dispatchHttpRequest({ app, method, url, body });
  return { status: response.status, body: JSON.parse(response.body) as unknown };
}
