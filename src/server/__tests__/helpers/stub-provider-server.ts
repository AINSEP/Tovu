import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** One scripted reply for {@link startStubProviderServer}: an HTTP status plus the raw response
 *  body bytes — already-framed SSE text for a success reply, or a plain error-JSON string for a
 *  failure reply. Written to the wire verbatim, with no reshaping. */
export interface StubProviderReply {
  readonly status: number;
  readonly body: string;
}

/**
 * Boots a REAL loopback HTTP server standing in for a BYOK/site-assistant provider endpoint
 * (Anthropic/OpenAI/Azure/Google). `@jini-ai/agent-runtime`'s provider adapters
 * (`anthropic-messages.ts`/`openai-chat.ts`/`azure-chat.ts`/`google-messages.ts`) dial their
 * upstream via that package's own `pinnedFetch` — built on `node:https`/`node:http`'s `request()`
 * directly, not `globalThis.fetch` (added by `fix(agent-runtime): close DNS-rebinding TOCTOU with an
 * IP-pinning fetch`, Jini commit `a9352fa8`, wired into every provider adapter shortly after:
 * `1065d442` for Google, `53295e15` for Anthropic). Stubbing `globalThis.fetch` — this whole test
 * suite's pre-existing pattern — therefore no longer intercepts an outbound provider call at all;
 * every request now reaches whatever real host `baseUrl` names.
 *
 * A real loopback listener is the one substitution point that still works: `pinnedFetch`'s DNS-
 * pinning path is a documented no-op for loopback hosts (`validateBaseUrlResolved`'s own comment:
 * "Loopback is intentionally allowed ... for local LLM servers like Ollama"), so pointing a turn's
 * `baseUrl` at `http://127.0.0.1:<port>` reaches this server directly, unpinned, exactly like any
 * other loopback HTTP listener — no DNS lookup, no SSRF-guard rejection, no change to the adapter
 * code under test.
 *
 * `respond` receives a 1-based call counter (so a caller can script a different reply per request —
 * e.g. a tool-call turn followed by a plain-text continuation) and the parsed JSON request body.
 *
 * @complexity O(1) per request — one buffered read of the request body, one scripted reply.
 */
export async function startStubProviderServer(
  t: import("node:test").TestContext,
  respond: (callCount: number, requestBody: Record<string, unknown>) => StubProviderReply,
): Promise<string> {
  let callCount = 0;
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      callCount += 1;
      const raw = Buffer.concat(chunks).toString("utf8");
      const requestBody = raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const reply = respond(callCount, requestBody);
      res.writeHead(reply.status, { "content-type": "text/event-stream" });
      res.end(reply.body);
    });
  });
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
