import { parse } from "cookie";
import type { Request } from "express";

/** Reads one request cookie without middleware. `cookie.parse` preserves malformed percent
 * escapes instead of throwing; authentication still validates the resulting token. Missing headers
 * remain anonymous, including direct handler invocations that omit the headers bag.
 * @returns The decoded value, or undefined when absent. */
export function readRequestCookie(
  { request, name }: { request: Pick<Request, "headers">; name: string },
  _optional: Record<string, never> = {},
): string | undefined {
  return parse(request.headers?.cookie ?? "")[name];
}
