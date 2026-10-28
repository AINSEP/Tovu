import type { Request } from "express";
import { isLoopbackHost } from "#src/server/runtime/boot/bind-host";
import { isLocalAdminUrl } from "#src/server/runtime/boot/local-owner-signin";

/**
 * @file Whether one admin request came from a browser on this same machine. Shared by the routes
 * that act on the host machine itself (copying keys between local sites, opening a native folder
 * dialog). The host-level "is this a local Tovu at all" decision (`isLocalTovuHost`) is separate and
 * stays with each route's caller; this checks the individual request.
 */

function loopbackSockets({ req }: { req: Request }, _options = {}): boolean {
  return isLoopbackHost(req.socket.localAddress?.replace(/^::ffff:/, "")) &&
    isLoopbackHost(req.socket.remoteAddress?.replace(/^::ffff:/, ""));
}

/** Local capability plus real sockets/Host: forwarded headers and a spoofed Host cannot admit a remote caller.
 *  @complexity O(h), h = request header names. */
export function isLocalAdminRequest({ req }: { req: Request }, _options = {}): boolean {
  if (!loopbackSockets({ req })) return false;
  if (Object.keys(req.headers).some(name => name === "forwarded" || name.startsWith("x-forwarded-"))) return false;
  try {
    const url = new URL(`${req.protocol}://${req.get("host")}`);
    if (!isLocalAdminUrl({ url }) || url.host !== req.get("host")) return false;
    return req.get("origin") === undefined || req.get("origin") === url.origin;
  } catch { return false; }
}
