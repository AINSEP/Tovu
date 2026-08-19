/**
 * @file The seam between "how a BYOK turn gets its API key" and "where that key actually lives" —
 * built so the storage backend can be swapped without touching `assistant-byok.ts`'s turn-handling
 * logic (tool execution, SSE framing, system prompt).
 *
 * TWO implementations, not one, as of the server-side keystore (design:
 * `ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-design.md`, owner-approved):
 *
 * - {@link createRequestSuppliedExecutionCredentialPort} — trusts ONLY the credential the browser
 *   sends on this one request; never reads a store. Kept for callers that genuinely want that
 *   narrower contract (and for tests); no longer what `assistant-byok.ts` constructs.
 * - {@link createStoredExecutionCredentialPort} — the one `assistant-byok.ts` uses now. A
 *   request-supplied credential still wins when present (an admin trying a key they haven't saved
 *   yet), and falls back to the admin's own stored row (`execution-credential-store.ts`, scoped to
 *   `(workspaceId, principalId)`) when the request omits one — mirroring the `useStoredCredential`
 *   pattern `apps/admin/src/lib/execution-settings.ts` already established for the sibling
 *   test-connection/list-models routes.
 *
 * Corrected disclosure (an earlier version of this file claimed the stored backing would be a
 * drop-in implementation swap with zero other changes — that claim did not survive contact with the
 * real code and is not repeated here): `resolve()`'s input shape had no identity in it and was
 * synchronous, which cannot express a `(workspaceId, principalId)`-scoped async DB read. Both
 * changed — see {@link ExecutionCredentialPort} below — which is why `assistant-byok.ts` gained one
 * `await` alongside the port swap. Everything downstream of `resolve()` (tool execution, SSE
 * framing, `SYSTEM_PREAMBLE`) is genuinely untouched; the seam still contains the blast radius, just
 * not as literally as the old comment promised.
 */

import { resolveExecutionCredential, type AdminExecutionCredentialRepoPort } from "./execution-credential-store.js";
import type { SecretSealerPort } from "../webhooks/index.js";

export interface ResolvedByokCredential {
  readonly protocol: "anthropic" | "openai" | "azure" | "google";
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model: string;
  readonly maxTokens?: number;
}

/** What the browser sends on one BYOK-run request. Shaped identically to `@jini-ai/ui`'s
 *  `ByokConfig` (minus fields this route has no use for, e.g. `savedByProviderId`) so the frontend
 *  needs no translation layer either. Every field may be omitted/empty — that is exactly the signal
 *  {@link createStoredExecutionCredentialPort} reads as "fall back to the admin's stored row." */
export interface RequestSuppliedByokConfig {
  readonly protocol?: unknown;
  readonly apiKey?: unknown;
  readonly baseUrl?: unknown;
  readonly model?: unknown;
  readonly maxTokens?: unknown;
}

export interface ExecutionCredentialPort {
  /**
   * Resolves the credential for one BYOK turn. Returns `null` for "no usable credential" rather than
   * throwing — same "absence is a value, not an error" convention `resolveSiteAssistantApiKey`
   * (`site-credential-store.ts`) already uses for the sibling visitor-key path, so
   * `assistant-byok.ts` can treat a missing/invalid credential as an ordinary 400/503 branch instead
   * of a caught exception.
   *
   * `Promise`-returning and identity-scoped as of the stored backing
   * (`createStoredExecutionCredentialPort`), which needs `workspaceId`/`principalId` to look up a
   * `(workspace, principal)`-scoped row and needs to await a DB read + decrypt — neither of which
   * {@link createRequestSuppliedExecutionCredentialPort}'s pure, synchronous parse needed. That port
   * still implements this same (now async) signature, just without ever using the identity fields.
   */
  resolve(input: { requestBody: RequestSuppliedByokConfig; workspaceId: string; principalId: string }): Promise<ResolvedByokCredential | null>;
}

const VALID_PROTOCOLS = new Set(["anthropic", "openai", "azure", "google"]);

/**
 * Pure parse of a browser-supplied `RequestSuppliedByokConfig` — no I/O, `null` when any required
 * field is missing/invalid. Shared by both port implementations below:
 * `createRequestSuppliedExecutionCredentialPort` calls it directly, and
 * `createStoredExecutionCredentialPort` tries it first before falling back to the stored row.
 */
function parseRequestSuppliedCredential(requestBody: RequestSuppliedByokConfig): ResolvedByokCredential | null {
  const protocol = requestBody.protocol;
  const apiKey = requestBody.apiKey;
  const model = requestBody.model;
  if (typeof protocol !== "string" || !VALID_PROTOCOLS.has(protocol)) return null;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) return null;
  if (typeof model !== "string" || model.trim().length === 0) return null;
  const baseUrl = typeof requestBody.baseUrl === "string" && requestBody.baseUrl.trim().length > 0 ? requestBody.baseUrl : undefined;
  const maxTokens = typeof requestBody.maxTokens === "number" && requestBody.maxTokens > 0 ? requestBody.maxTokens : undefined;
  return {
    protocol: protocol as ResolvedByokCredential["protocol"],
    apiKey,
    model,
    ...(baseUrl ? { baseUrl } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  };
}

/**
 * Trusts ONLY the credential the browser sends on this one request — never reads a store, never
 * writes anything server-side. See this file's header for when this is (and is not) what
 * `assistant-byok.ts` constructs.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function createRequestSuppliedExecutionCredentialPort(): ExecutionCredentialPort {
  return {
    async resolve({ requestBody }) {
      return parseRequestSuppliedCredential(requestBody);
    },
  };
}

export interface StoredExecutionCredentialPortDeps {
  repo: AdminExecutionCredentialRepoPort;
  sealer: SecretSealerPort;
}

/**
 * The port `assistant-byok.ts` constructs today. Resolution order: a request-supplied credential
 * wins when present (an admin trying a key they haven't saved yet — no DB read needed for that
 * fast path); otherwise falls back to this admin's own stored row
 * (`execution-credential-store.ts`'s `resolveExecutionCredential`, scoped to
 * `(workspaceId, principalId)`). A stored row with no `model` set is treated as unusable (turns
 * always need a model) — same as the request-supplied path's own `model` requirement.
 *
 * Never throws — a decrypt failure on the stored row degrades to `null` (`resolveExecutionCredential`'s
 * own never-throws contract), which `assistant-byok.ts` already treats as an ordinary 400.
 *
 * @complexity O(1) — at most one repo read plus one decrypt, only when the request supplied nothing usable.
 * @overallScore 100
 */
export function createStoredExecutionCredentialPort(deps: StoredExecutionCredentialPortDeps): ExecutionCredentialPort {
  return {
    async resolve({ requestBody, workspaceId, principalId }) {
      const requestSupplied = parseRequestSuppliedCredential(requestBody);
      if (requestSupplied) return requestSupplied;

      const stored = await resolveExecutionCredential(deps, { workspaceId, principalId });
      if (!stored) return null;
      if (!VALID_PROTOCOLS.has(stored.protocol)) return null;
      if (!stored.model || stored.model.trim().length === 0) return null;
      return {
        protocol: stored.protocol as ResolvedByokCredential["protocol"],
        apiKey: stored.apiKey,
        model: stored.model,
        ...(stored.baseUrl ? { baseUrl: stored.baseUrl } : {}),
        ...(stored.maxTokens !== null ? { maxTokens: stored.maxTokens } : {}),
      };
    },
  };
}
