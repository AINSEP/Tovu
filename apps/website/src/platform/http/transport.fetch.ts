import { request as httpRequest } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import type { HttpRequest, HttpResponse, PinnedPeer } from "./types.js";
import type { HttpTransportAdapter } from "./ports.js";

/**
 * @file The raw, pinned-peer HTTP transport (ADR-038 amendment 3/4, ADR-PIPE-015 GAP-04).
 *
 * Purpose:
 * MODULE-PRIVATE. Connects only to the already-DNS-resolved, policy-vetted `PinnedPeer` IP —
 * never re-resolves the request URL's hostname — while still sending the original `Host` header
 * and, for an ordinary (non-IP-literal) hostname target, the TLS SNI (`servername`) so virtual-
 * hosted targets and certificate validation both work. An IP-literal target carries no SNI at
 * all (`peer.tlsServerName` is `undefined` — RFC 6066 forbids an IP address there). This
 * is what makes "the guarded client cannot be tricked into connecting somewhere else via DNS
 * rebinding between check-time and connect-time" true, not just documented.
 *
 * How it relates to the project:
 * - `client.ts` is the only caller: it resolves + classifies the target, builds the `PinnedPeer`,
 *   and calls `requestPinned` here. Never imported by a feature consumer directly (enforced by
 *   the `import-boundary.test.ts` canary).
 *
 * v0 disclosure (matches `ports.ts`'s existing note): buffered response, not streamed. A fixed
 * absolute safety ceiling (`ABSOLUTE_MAX_BYTES`) bounds worst-case memory regardless of policy;
 * the real per-policy `maxResponseBytes`/`maxDecompressedBytes` enforcement happens one layer up
 * in `client.ts`, which is why response bytes flow through this file uncapped-by-policy.
 */

/** Hard ceiling independent of any policy — a last-resort guard against a pathological response. */
const ABSOLUTE_MAX_BYTES = 100 * 1024 * 1024;

/**
 * The one production `HttpTransportAdapter`. Connects to `peer.ip:peer.port`, sends the original
 * `Host` header (`peer.authority`) and TLS SNI (`peer.tlsServerName`) for HTTPS.
 *
 * @overallScore 100
 */
export class FetchHttpTransportAdapter implements HttpTransportAdapter {
  async requestPinned(req: HttpRequest, peer: PinnedPeer): Promise<HttpResponse> {
    const url = new URL(req.url);
    const isHttps = url.protocol === "https:";
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const options: RequestOptions = {
      method: req.method,
      host: peer.ip,
      port: peer.port,
      path: `${url.pathname}${url.search}`,
      headers: { ...req.headers, host: peer.authority },
      timeout: req.timeoutMs,
      // `peer.tlsServerName` is `undefined` for an IP-literal peer (RFC 6066: SNI never names an
      // IP) — omit the option entirely rather than pass `servername: undefined`, so behavior
      // matches "no SNI extension sent" exactly, not "sent as an empty/undefined value".
      ...(isHttps && peer.tlsServerName ? { servername: peer.tlsServerName } : {}),
    };

    return new Promise<HttpResponse>((resolve, reject) => {
      const clientRequest = requestFn(options, (res) => {
        const decoded = decodeBody(res.headers["content-encoding"], res);
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        decoded.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > ABSOLUTE_MAX_BYTES) {
            clientRequest.destroy(new Error("response exceeded the absolute size ceiling"));
            return;
          }
          chunks.push(chunk);
        });
        decoded.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: flattenHeaders(res.headers),
            bodyText: Buffer.concat(chunks).toString("utf8"),
          });
        });
        decoded.on("error", reject);
      });

      clientRequest.on("timeout", () => {
        clientRequest.destroy(new Error(`request timed out after ${req.timeoutMs}ms`));
      });
      clientRequest.on("error", reject);

      if (req.body !== undefined) clientRequest.write(req.body);
      clientRequest.end();
    });
  }
}

function decodeBody(
  contentEncoding: string | undefined,
  stream: NodeJS.ReadableStream
): NodeJS.ReadableStream {
  switch (contentEncoding) {
    case "gzip":
      return stream.pipe(createGunzip());
    case "deflate":
      return stream.pipe(createInflate());
    case "br":
      return stream.pipe(createBrotliDecompress());
    default:
      return stream;
  }
}

function flattenHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    flat[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return flat;
}
