import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PassThrough } from "node:stream";

import type { Express } from "express";

/** Dispatches through real Express and native HTTP responses without opening a listening socket. */
export async function dispatchJsonRequest(app: Express, method: string, url: string, body?: unknown) {
  const socket = new PassThrough();
  const req = new IncomingMessage(socket as unknown as Socket);
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost" };
  Object.assign(req, { body });
  req.push(null);
  const res = new ServerResponse(req);
  res.assignSocket(socket as unknown as Socket);
  const chunks: Buffer[] = [];
  socket.on("data", (chunk: Buffer) => chunks.push(chunk));
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      deadline = setTimeout(() => reject(new Error("Express request did not finish")), 1000);
      res.on("finish", () => {
        const wire = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({ status: res.statusCode, body: JSON.parse(wire.slice(wire.indexOf("\r\n\r\n") + 4)) });
        } catch (error) {
          reject(error);
        }
      });
      app(req, res);
    });
  } finally {
    clearTimeout(deadline);
    socket.destroy();
  }
}
