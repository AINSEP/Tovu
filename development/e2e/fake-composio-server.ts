import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/**
 * @file A stand-in for Composio's REST API, faithful to the subset
 * `@jini-ai/integrations/composio`'s provider actually calls during an OAuth handshake.
 *
 * WHY THIS EXISTS: no Composio project key exists in this environment (Jini's own
 * `composio/source-map.md` records that as an accepted verification gap), so the real service
 * cannot be reached. Everything on Tovu's side of the boundary — routes, session auth, the public
 * callback, sealing, the database, the popup/postMessage handshake, the UI — is exercised for real
 * against this. What it CANNOT prove is anything on Composio's real edge: their consent screen,
 * their actual redirect behavior, and their real response shapes.
 *
 * The shapes below were read off the provider's own request/response handling rather than guessed:
 * `getAuthConfigIdForToolkit` → `GET /api/v3.1/auth_configs`, `createManagedAuthConfig` →
 * `POST /api/v3.1/auth_configs`, `createConnectedAccountLink` →
 * `POST /api/v3/connected_accounts/link`, `getValidatedConnectedAccount` →
 * `GET /api/v3/connected_accounts/{id}`, and `disconnect` → `DELETE` on the same path.
 *
 * `getValidatedConnectedAccount` is strict — it rejects unless the account's `user_id`,
 * `auth_config.id`, `toolkit.slug`, and `status` all line up — so this fake has to echo back
 * exactly what it was asked for. That strictness is the point: a fake loose enough to always
 * succeed would prove nothing about the wiring.
 */

export interface FakeComposioOptions {
  /** Must match `composioUserIdFor(workspaceId)` in `src/platform/connectors/composio-service.ts`, or the
   *  provider rejects every account as belonging to a different user. */
  expectedUserId: string;
  /** Set to fail the account lookup, exercising the callback's own failure path. */
  failAccountLookup?: boolean;
  /**
   * Set to answer the key probe with `401`, exercising `PUT /connectors/config`'s
   * "Composio rejected that API key" branch. Only affects `GET /api/v3.1/toolkits`.
   */
  rejectApiKey?: boolean;
  /**
   * Fixed port to bind. Defaults to an ephemeral one, which is right for `node:test` where the test
   * owns both sides; a browser suite must pin it, because the API server is a separate process that
   * needs `TOVU_COMPOSIO_BASE_URL` before it starts.
   */
  port?: number;
}

export interface FakeComposioServer {
  url: string;
  /** The consent URL the last `link` call was told to redirect back to, with `state` intact. */
  lastCallbackUrl: string | null;
  /** Every path the provider requested, for asserting the handshake really happened. */
  requests: string[];
  deletedAccountIds: string[];
  close(): Promise<void>;
}

/**
 * Any presented key containing this substring is refused by the probe endpoint, so a suite sharing
 * one fake can still exercise the rejection path per-test by choosing the key it types.
 */
export const REJECTED_KEY_MARKER = "REJECTME";

const ACCOUNT_ID = "ca_fake_github_1";
const AUTH_CONFIG_ID = "ac_fake_github_1";
const TOOLKIT_SLUG = "GITHUB";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
  });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

/**
 * Boots the fake on an ephemeral port.
 *
 * The `/fake-consent` route is what makes a real browser flow possible: it stands in for Composio's
 * hosted consent screen by immediately 302-ing back to the callback URL the provider registered,
 * preserving the `state` query parameter Composio would preserve and appending the
 * `status`/`connectedAccountId` pair it appends.
 *
 * @complexity O(1) per request.
 * @overallScore 100
 */
export async function startFakeComposio(options: FakeComposioOptions): Promise<FakeComposioServer> {
  const state: FakeComposioServer = {
    url: "",
    lastCallbackUrl: null,
    requests: [],
    deletedAccountIds: [],
    close: async () => {},
  };

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    state.requests.push(`${req.method} ${path}`);

    // Stands in for Composio's hosted consent screen.
    if (path === "/fake-consent") {
      const target = new URL(state.lastCallbackUrl ?? "http://localhost/");
      target.searchParams.set("status", "success");
      target.searchParams.set("connectedAccountId", ACCOUNT_ID);
      res.writeHead(302, { location: target.toString() });
      res.end();
      return;
    }

    // The cheap authenticated read `probeComposioApiKey` uses to verify a key before it is saved,
    // and the same endpoint the provider's own catalog refresh hits.
    if (path === "/api/v3.1/toolkits" && req.method === "GET") {
      // Two ways to get a rejection: the whole server set to refuse (for `node:test`, which
      // constructs the fake directly), or a key carrying the marker below (for the browser suite,
      // which shares ONE fake across every test and so cannot flip a server-wide flag mid-run).
      const presentedKey = String(req.headers["x-api-key"] ?? "");
      if (options.rejectApiKey || presentedKey.includes(REJECTED_KEY_MARKER)) {
        json(res, 401, { error: "invalid api key" });
        return;
      }
      json(res, 200, { items: [{ name: "GitHub", slug: TOOLKIT_SLUG }] });
      return;
    }

    // No auth config exists yet, so the provider will create one.
    if (path === "/api/v3.1/auth_configs" && req.method === "GET") {
      json(res, 200, { items: [] });
      return;
    }

    if (path === "/api/v3.1/auth_configs" && req.method === "POST") {
      json(res, 200, { id: AUTH_CONFIG_ID, toolkit: { slug: TOOLKIT_SLUG }, status: "ENABLED" });
      return;
    }

    if (path === "/api/v3/connected_accounts/link" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}") as { callback_url?: string };
      state.lastCallbackUrl = body.callback_url ?? null;
      json(res, 200, {
        id: ACCOUNT_ID,
        status: "INITIATED",
        redirect_url: `${state.url}/fake-consent`,
      });
      return;
    }

    if (path === `/api/v3/connected_accounts/${ACCOUNT_ID}` && req.method === "GET") {
      if (options.failAccountLookup) {
        json(res, 404, { error: "not found" });
        return;
      }
      json(res, 200, {
        id: ACCOUNT_ID,
        user_id: options.expectedUserId,
        auth_config: { id: AUTH_CONFIG_ID },
        toolkit: { slug: TOOLKIT_SLUG },
        status: "ACTIVE",
        email: "octocat@example.com",
      });
      return;
    }

    if (path === `/api/v3/connected_accounts/${ACCOUNT_ID}` && req.method === "DELETE") {
      state.deletedAccountIds.push(ACCOUNT_ID);
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: `fake composio has no route for ${req.method} ${path}` });
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake composio failed to bind");
  state.url = `http://127.0.0.1:${address.port}`;
  state.close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return state;
}
