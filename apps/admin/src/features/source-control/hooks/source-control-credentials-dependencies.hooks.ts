import { ApiError, API_UNREACHABLE_CODE, WORKSPACE_ID } from "../../../lib/api";
import type {
  AdminSourceControlConnectionInput,
  AdminSourceControlCredentialSummary,
  AdminSourceControlCredentialsSnapshot,
} from "../types";
import type { SourceControlCredentialsPort } from "./source-control-credentials-port.hooks";

/**
 * @file The live {@link SourceControlCredentialsPort} binding.
 *
 * ## Why this file has its own fetch plumbing instead of calling `api.*` like every other feature
 *
 * Every other admin feature's HTTP calls go through the single `request<T>()` helper in
 * `lib/api.ts` and land on the shared `export const api = {...}` object (`listPublishCredentials`
 * and its three siblings are the direct precedent this whole feature mirrors). That file was
 * outside this dispatch's file boundary, so the four calls below reimplement `request()`'s
 * observable behavior locally instead — same non-2xx-to-`ApiError` shaping, same "proxy reachable
 * but nothing answered" vs. "origin unreachable" distinction (`lib/api.ts`'s own `request`/
 * `fetchOrThrowUnreachable` doc comments explain why that distinction exists; reusing `ApiError`
 * and the exported `API_UNREACHABLE_CODE` sentinel keeps this page's errors classifiable by any
 * shared `describeApiError`-style caller the same way a real `api.*` call's errors would be).
 *
 * This is flagged in the feature's own handoff note as a fold-in candidate: once
 * `POST/GET/PUT .../system/source-control/credentials` exists server-side, moving these four calls
 * onto `lib/api.ts` proper (mirroring the publish-credentials block byte for byte) is a mechanical
 * move, not a behavior change — `sourceControlRequest` below is intentionally shaped to disappear
 * without changing what any caller of {@link defaultSourceControlCredentialsPort} observes.
 *
 * Route shape assumed (not yet built — see this feature's backend handoff note for the
 * recommendation to give this its own `source_control_credential_sets` table rather than reusing
 * `publish_credential_sets`, which is closed-typed to static-publish targets): a workspace-scoped
 * CRUD path structurally identical to `.../system/publish/credentials`, at
 * `.../system/source-control/credentials[/:id]`.
 */

const BASE = "/api/admin/v1";

/** Sentinel for "the response body was not parseable JSON" — mirrors `lib/api.ts`'s own
 *  `UNPARSEABLE_BODY`, kept distinct from a body that legitimately parsed to `null`/`{}`. */
const UNPARSEABLE_BODY = Symbol("source-control-unparseable-json-body");

function unreachableApiMessage(status?: number): string {
  const detail = status === undefined ? "" : ` (HTTP ${status})`;
  return `cannot reach the Tovu API${detail} — is the server running?`;
}

/** `fetch`, with the one failure mode it signals by REJECTING (DNS failure, connection refused,
 *  offline, TLS failure) translated into an `ApiError` like every other failure here — mirrors
 *  `lib/api.ts`'s `fetchOrThrowUnreachable` exactly, including re-throwing a caller-cancelled
 *  `AbortError` untouched rather than relabeling it as a reachability failure.
 *  @complexity O(1) plus the request itself. */
async function fetchOrThrowUnreachable(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    if (!(cause instanceof TypeError)) throw cause;
    throw new ApiError(unreachableApiMessage(), 0, API_UNREACHABLE_CODE, { cause: cause.message });
  }
}

/** A response body, parsed as JSON, plus whether that parse actually succeeded — mirrors the
 *  `res.json().catch(...)` + `parsed === UNPARSEABLE_BODY` pair inline in `lib/api.ts`'s
 *  `request()`, pulled into its own function here purely to keep {@link sourceControlRequest}'s own
 *  complexity under this repo's real `apps/admin` 9/9 gate (this file's local reimplementation of
 *  `request()` is not itself grandfathered debt the way `lib/api.ts`'s original is —
 *  `development/scripts/admin-complexity-debt.json` lists that one function at complexity 12/10,
 *  which is exactly why this local copy needs splitting rather than matching it verbatim). The
 *  `unparseable` flag travels forward explicitly rather than being re-derived from the parsed body's
 *  shape (e.g. "is it an empty object") — a genuine application response can legitimately be `{}`,
 *  and conflating that with "nothing parsed at all" would misclassify a real (if empty) app error as
 *  an unreachable-origin failure.
 *  @complexity O(1) plus the body parse. */
async function parseResponseBody(res: Response): Promise<{ body: unknown; unparseable: boolean }> {
  const parsed: unknown = await res.json().catch(() => UNPARSEABLE_BODY);
  return parsed === UNPARSEABLE_BODY ? { body: {}, unparseable: true } : { body: parsed, unparseable: false };
}

/** Builds and throws the `ApiError` for a non-2xx response — the branch-heavy half of
 *  `lib/api.ts`'s `request()` (the `noAppEnvelope` distinction plus its two dependent ternaries),
 *  split out for the same complexity-budget reason {@link parseResponseBody} documents. Never
 *  returns normally — the `never` return type lets {@link sourceControlRequest}'s own `if (!res.ok)`
 *  branch read as "the rest of this function only runs on success" without a redundant `return`.
 *  @complexity O(1). */
function throwForErrorResponse(res: Response, parsedBody: unknown, unparseable: boolean): never {
  const body = parsedBody as { error?: unknown; code?: unknown };
  const noAppEnvelope = unparseable && res.status >= 500;
  const message = body?.error ?? (noAppEnvelope ? unreachableApiMessage(res.status) : `request failed (${res.status})`);
  const code = noAppEnvelope ? API_UNREACHABLE_CODE : typeof body?.code === "string" ? body.code : undefined;
  throw new ApiError(String(message), res.status, code, body as Record<string, unknown>);
}

/** The single fetch seam every call below goes through — same observable behavior as `lib/api.ts`'s
 *  `request<T>()` (see this file's header for why it is not that same function), split across
 *  {@link parseResponseBody}/{@link throwForErrorResponse} above to stay under this repo's real
 *  `apps/admin` 9/9 complexity gate without grandfathering — see those two functions' own docs.
 *  @complexity O(1) plus the request and body parse. */
async function sourceControlRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchOrThrowUnreachable(`${BASE}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  const { body, unparseable } = await parseResponseBody(res);
  if (!res.ok) throwForErrorResponse(res, body, unparseable);
  return body as T;
}

const CREDENTIALS_PATH = `/workspaces/${WORKSPACE_ID}/system/source-control/credentials`;

/** The live implementation, as a module-level singleton — matches
 *  `publish-credentials-dependencies.hooks.ts`'s `defaultPublishCredentialsPort`. */
export const defaultSourceControlCredentialsPort: SourceControlCredentialsPort = {
  listCredentials: () => sourceControlRequest<AdminSourceControlCredentialsSnapshot>(CREDENTIALS_PATH),
  createCredential: (input: { label: string; connection: AdminSourceControlConnectionInput; isDefault?: boolean }) =>
    sourceControlRequest<{ credential: AdminSourceControlCredentialSummary }>(CREDENTIALS_PATH, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((res) => res.credential),
  updateCredential: (
    id: string,
    input: { label?: string; connection?: AdminSourceControlConnectionInput; isDefault?: boolean }
  ) =>
    sourceControlRequest<{ credential: AdminSourceControlCredentialSummary }>(`${CREDENTIALS_PATH}/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }).then((res) => res.credential),
  deleteCredential: (id: string) => sourceControlRequest<void>(`${CREDENTIALS_PATH}/${id}`, { method: "DELETE" }),
};

/** An in-memory {@link SourceControlCredentialsPort} for tests. Each of the four calls defaults to a
 *  neutral, overridable stub — matches `createFakePublishCredentialsPort`'s per-call override shape. */
export function createFakeSourceControlCredentialsPort(
  overrides: {
    listCredentials?: SourceControlCredentialsPort["listCredentials"];
    createCredential?: SourceControlCredentialsPort["createCredential"];
    updateCredential?: SourceControlCredentialsPort["updateCredential"];
    deleteCredential?: SourceControlCredentialsPort["deleteCredential"];
  } = {}
): SourceControlCredentialsPort {
  const emptySnapshot: AdminSourceControlCredentialsSnapshot = { credentials: [] };
  return {
    listCredentials: overrides.listCredentials ?? (() => Promise.resolve(emptySnapshot)),
    createCredential:
      overrides.createCredential ?? (() => Promise.reject(new Error("createCredential not stubbed for this test"))),
    updateCredential:
      overrides.updateCredential ?? (() => Promise.reject(new Error("updateCredential not stubbed for this test"))),
    deleteCredential: overrides.deleteCredential ?? (() => Promise.resolve()),
  };
}
