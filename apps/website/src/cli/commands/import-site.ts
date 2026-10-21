import { postJsonToDaemon, readPromptFromFlags } from "@jini-ai/cli";
import { parseSiteImportInput } from "#src/features/site-backup/import-backend";
import { ValidationError } from "#src/platform/site-dir/errors";
import { isLoopbackHost } from "#src/server/runtime/boot/bind-host";
import { isIP } from "node:net";

/** Thin CLI adapter to the SAME authenticated import route, never a second restore lifecycle.
 * Reads {authorization, url|uploadId, displayName?, requestId?} on bounded stdin so credentials,
 * share tokens and owner passwords never become argv. Owner password setup stays in the browser.
 * @throws ValidationError for invalid request/server; transport errors use Jini's CLI contract.
 * @complexity O(request JSON), capped at 16 KiB; the server owns ZIP transfer and verification.
 */
export async function runImportSiteCommand(required: { server: string; workspaceId: string }, optional: {
  readRequest?: () => Promise<string>;
  post?: typeof postJsonToDaemon;
} = {}): Promise<unknown> {
  const server = parseImportServer({ value: required.server });
  if (!required.workspaceId) throw new ValidationError("import: --workspace is required.");
  const text = await readPromptFromFlags({ flags: { "prompt-file": "-" } }, { maxBytes: 16 * 1024, readStdin: optional.readRequest });
  const raw = parseImportRequest({ text });
  const { authorization, ...input } = raw;
  if (typeof authorization !== "string" || !/^Bearer [^\r\n]{1,4096}$/.test(authorization)) throw new ValidationError("import: provide a Bearer API-key authorization in stdin JSON. Never provide an owner password.");
  const parsed = parseSiteImportInput({ input });
  const body = { ...parsed.source, displayName: parsed.displayName, requestId: parsed.requestId };
  const result = await (optional.post ?? postJsonToDaemon)({ base: server.origin, route: "/api/admin/v1/workspaces/" + encodeURIComponent(required.workspaceId) + "/site-imports", body }, { headers: { authorization }, timeoutMs: 5 * 60_000, maxResponseBytes: 64 * 1024 });
  if (result && typeof result === "object" && typeof (result as { setupUrl?: unknown }).setupUrl === "string") return { ...result, setupUrl: new URL((result as { setupUrl: string }).setupUrl, server).href };
  return result;
}

function parseImportServer({ value }: { value: string }, _options: Record<string, never> = {}): URL {
  let server: URL;
  try { server = new URL(value); } catch { throw new ValidationError("import: --server must be an admin server origin."); }
  if (server.username || server.password || server.pathname !== "/" || server.search || server.hash ||
      !isImportProtocolAllowed({ server })) throw new ValidationError("import: use an HTTPS server origin, or HTTP loopback for local development.");
  return server;
}

function isImportProtocolAllowed({ server }: { server: URL }, _options: Record<string, never> = {}): boolean {
  const hostname = server.hostname.replace(/^\[|\]$/g, "");
  return server.protocol === "https:" || Boolean(server.protocol === "http:" && isIP(hostname) && isLoopbackHost(hostname));
}

function parseImportRequest({ text }: { text: string | undefined }, _options: Record<string, never> = {}): Record<string, unknown> {
  let raw: Record<string, unknown>;
  try {
    // `readPromptFromFlags` with `prompt-file: "-"` always yields the stdin text; a missing value
    // would stringify to non-JSON or `null` and fail the shape check below, never parse as a request.
    raw = JSON.parse(String(text)) as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("shape");
  } catch { throw new ValidationError("import: stdin must contain one JSON request object."); }
  return raw;
}
