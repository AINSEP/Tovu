import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { onTeardown } from "#src/__tests__/fixtures/teardown";

/** One scripted reply for {@link startStubProviderServer}: an HTTP status plus the raw response
 *  body bytes — already-framed SSE text for a success reply, or a plain error-JSON string for a
 *  failure reply. Written to the wire verbatim, with no reshaping. */
export interface StubProviderReply {
  readonly status: number;
  readonly body: string;
}

/** The raw request line {@link startStubProviderServer} hands its `respond` callback alongside the
 *  parsed body. `url` is the request-target as written on the wire (path + query), which is the ONE
 *  observable that distinguishes the four providers from each other: Anthropic posts to
 *  `/v1/messages`, OpenAI/Azure to `/v1/chat/completions` (or `/openai/deployments/...`), Google to
 *  `/v1beta/models/<model>:streamGenerateContent`. A test that only inspects the request BODY cannot
 *  tell which provider was called and will pass against a route that ignores the configured one. */
export interface StubProviderRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
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
 * e.g. a tool-call turn followed by a plain-text continuation), the parsed JSON request body, and
 * the raw {@link StubProviderRequest} line. The third argument is additive: every caller written
 * before it existed simply declares two parameters and is unaffected.
 *
 * Every request is answered. If `respond` throws (typically an `assert` the caller placed inside
 * it), the stub replies 500 and the test fails with that original error from an `after` hook
 * registered at throw time. Before this, the throw escaped the request handler unanswered: the
 * route under test sat on the open upstream socket until `pinnedFetch`'s 300 s idle timeout, the
 * test hit its own timeout with no useful message, and the open sockets kept the whole file from
 * exiting. The error hook is registered late on purpose: node:test skips every `after` hook that
 * follows a throwing one, so rejecting from this server's own close hook would leave the route's
 * test server (registered later) open and hang the file again.
 *
 * @complexity O(1) per request — one buffered read of the request body, one scripted reply.
 */
export async function startStubProviderServer(
  t: import("node:test").TestContext,
  respond: (callCount: number, requestBody: Record<string, unknown>, request: StubProviderRequest) => StubProviderReply,
): Promise<string> {
  let callCount = 0;
  let respondFailed = false;
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      callCount += 1;
      let reply: StubProviderReply;
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        const requestBody = raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {};
        reply = respond(callCount, requestBody, { method: req.method ?? "", url: req.url ?? "", headers: req.headers });
      } catch (error) {
        // Also logged now: when the test body then fails on the 500, node:test reports that failure, not this one.
        console.error("stub provider respond() threw:", error);
        if (!respondFailed) t.after(() => { throw error; });
        respondFailed = true;
        reply = { status: 500, body: JSON.stringify({ error: { message: "stub provider respond() threw" } }) };
      }
      res.writeHead(reply.status, { "content-type": "text/event-stream" });
      res.end(reply.body);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  onTeardown({ t, step: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
