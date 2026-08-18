/**
 * @file SPIKE (probe/deploy-plugin-cloud-sandbox) — a minimal "deploy" plugin, built the same way
 * as `store-plugin.ts` (the concrete Tier-2 template this mirrors): declares its own SQLite table
 * via `declareDataModule()`, no raw DB handle held outside this module. NOT wired into
 * `src/server/bootstrap.ts` — that wiring decision is left to a human.
 *
 * Scope for this pass: a generalized `deploy(target, config)` shape that could in principle cover
 * Vercel, Netlify, GitHub Pages, or AWS, but only the Vercel path is actually implemented. There is
 * no real Vercel token available in this environment, so `deploy("vercel", ...)` cannot complete a
 * real deployment here — it is expected to return the typed `NO_TOKEN_CONFIGURED` error. What this
 * file gets right instead: the call is shaped correctly (real endpoint, real auth header shape,
 * routed through the one guarded outbound-HTTP seam `../../../http` / ADR-038 — never a raw
 * `fetch`, same discipline `comments/spam.external.ts`'s `AkismetSpamCheck` already follows), and
 * every failure mode (missing token, bad config, transport error, non-2xx provider response) is a
 * typed `DeployError`, never a thrown exception out of `deploy()`.
 *
 * `DeployTokenPort` deliberately does NOT reuse `webhooks/ports.ts`'s `KeyringPort` — a Vercel
 * token is an opaque, externally-issued credential that must round-trip verbatim (closer in spirit
 * to that file's `SecretSealerPort` framing: "unlike signing secrets, these must round-trip") than
 * something HKDF-derivable from a root key. What IS mirrored from `keyring.env.ts`/`keyring.memory.ts`
 * is the *shape*: an env-var-backed production adapter plus an in-memory test double behind one
 * small port, rather than a hardcoded secret read inline in this file.
 */
import Database from "better-sqlite3";

import type { HttpClientPort } from "#src/http/index";
import { declareDataModule, type DataModuleDecl } from "../data-module";

export type DeployTarget = "vercel" | "netlify" | "github-pages" | "aws";

export interface DeployConfig {
  readonly [key: string]: unknown;
}

/** The only target implemented this pass. `projectId`/`ref` map to Vercel's real deployments API. */
export interface VercelDeployConfig extends DeployConfig {
  readonly projectId: string;
  readonly teamId?: string;
  /** Git ref/commit to deploy — sent as `gitSource.ref` on Vercel's real deployments API. */
  readonly ref: string;
}

export type DeployErrorCode =
  | "NO_TOKEN_CONFIGURED"
  | "TARGET_NOT_IMPLEMENTED"
  | "INVALID_CONFIG"
  | "TRANSPORT_ERROR"
  | "PROVIDER_ERROR";

export interface DeployError {
  readonly code: DeployErrorCode;
  readonly message: string;
  readonly providerStatus?: number;
}

export type DeployResult =
  | { ok: true; target: DeployTarget; deploymentId: string; deploymentUrl: string }
  | { ok: false; target: DeployTarget; error: DeployError };

export interface DeployHistoryEntry {
  readonly id: string;
  readonly target: DeployTarget;
  readonly status: "triggered" | "failed";
  readonly triggeredAt: number;
  readonly resultSummary: string;
}

/** A slot for a deploy token, keyed by target. Never a hardcoded secret (see file header). */
export interface DeployTokenPort {
  getToken(target: DeployTarget): Promise<string | null>;
}

const ENV_VAR_BY_TARGET: Record<DeployTarget, string> = {
  vercel: "TOVU_DEPLOY_TOKEN_VERCEL",
  netlify: "TOVU_DEPLOY_TOKEN_NETLIFY",
  "github-pages": "TOVU_DEPLOY_TOKEN_GITHUB_PAGES",
  aws: "TOVU_DEPLOY_TOKEN_AWS",
};

/**
 * Production `DeployTokenPort` adapter: resolves a per-target token from an env var. Structurally
 * mirrors `EnvOrFileKeyring` (`integrations/keyring.env.ts`) minus the generated-file fallback —
 * unlike a root key, a deploy token cannot be locally generated; a missing one is a configuration
 * gap, not something this port can self-heal.
 */
export class EnvDeployTokenKeyring implements DeployTokenPort {
  private readonly envVarByTarget: Record<DeployTarget, string>;

  constructor(options: { envVarByTarget?: Partial<Record<DeployTarget, string>> } = {}) {
    this.envVarByTarget = { ...ENV_VAR_BY_TARGET, ...options.envVarByTarget };
  }

  async getToken(target: DeployTarget): Promise<string | null> {
    const envVarName = this.envVarByTarget[target];
    const value = process.env[envVarName];
    return value && value.trim().length > 0 ? value.trim() : null;
  }
}

/**
 * In-memory `DeployTokenPort` test/dev double — mirrors `InMemoryKeyring`
 * (`integrations/keyring.memory.ts`). Holds tokens only in memory, settable per test.
 */
export class InMemoryDeployTokenKeyring implements DeployTokenPort {
  private readonly tokens = new Map<DeployTarget, string>();

  constructor(seed: Partial<Record<DeployTarget, string>> = {}) {
    for (const [target, token] of Object.entries(seed)) {
      if (token) this.tokens.set(target as DeployTarget, token);
    }
  }

  setToken(target: DeployTarget, token: string | null): void {
    if (token === null) this.tokens.delete(target);
    else this.tokens.set(target, token);
  }

  async getToken(target: DeployTarget): Promise<string | null> {
    return this.tokens.get(target) ?? null;
  }
}

export interface DeployApi {
  deploy(target: DeployTarget, config: DeployConfig): Promise<DeployResult>;
  listHistory(limit?: number): DeployHistoryEntry[];
}

export const DEPLOY_PLUGIN_ID = "deploy";
const DEPLOYS = `p_${DEPLOY_PLUGIN_ID}__deploys`;

export const DEPLOY_MANIFEST: DataModuleDecl = {
  pluginId: DEPLOY_PLUGIN_ID,
  pluginTier: "tier-2",
  provenance: { sourceUrl: "builtin://deploy", publisher: "tovu-core" },
  tables: [
    {
      name: "deploys",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "target", type: "TEXT", notNull: true },
        { name: "status", type: "TEXT", notNull: true },
        { name: "triggered_at", type: "INTEGER", notNull: true },
        { name: "result_summary", type: "TEXT", notNull: true },
      ],
    },
  ],
};

const VERCEL_API_BASE = "https://api.vercel.com";
const DEFAULT_TIMEOUT_MS = 10_000;

function vercelDeploymentsUrl(config: VercelDeployConfig): string {
  const path = "/v13/deployments";
  return config.teamId ? `${VERCEL_API_BASE}${path}?teamId=${encodeURIComponent(config.teamId)}` : `${VERCEL_API_BASE}${path}`;
}

function isVercelConfig(config: DeployConfig): config is VercelDeployConfig {
  return (
    typeof config.projectId === "string" &&
    config.projectId.length > 0 &&
    typeof config.ref === "string" &&
    config.ref.length > 0
  );
}

interface DeployRow {
  id: string;
  target: string;
  status: string;
  triggered_at: number;
  result_summary: string;
}

/** Declare the deploy plugin's table through core (snapshot→DDL) and return the deploy API. */
export async function activateDeploy(
  required: { db: Database.Database; dbPath: string; httpClient: HttpClientPort; tokenPort: DeployTokenPort },
  _optional: Record<string, never> = {}
): Promise<DeployApi> {
  const { db, dbPath, httpClient, tokenPort } = required;
  const result = await declareDataModule({ db, dbPath, decl: DEPLOY_MANIFEST });
  if (!result.ok) {
    throw new Error(`deploy dataModule declaration failed: ${result.error?.code} — ${result.error?.message}`);
  }

  function recordHistory(entry: { target: DeployTarget; status: "triggered" | "failed"; resultSummary: string }): void {
    const id = `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(
      `INSERT INTO "${DEPLOYS}" (id, target, status, triggered_at, result_summary) VALUES (?, ?, ?, ?, ?)`
    ).run(id, entry.target, entry.status, Date.now(), entry.resultSummary);
  }

  async function deployVercel(config: DeployConfig): Promise<DeployResult> {
    if (!isVercelConfig(config)) {
      const error: DeployError = { code: "INVALID_CONFIG", message: "vercel deploy requires 'projectId' and 'ref'" };
      recordHistory({ target: "vercel", status: "failed", resultSummary: error.message });
      return { ok: false, target: "vercel", error };
    }

    const token = await tokenPort.getToken("vercel");
    if (!token) {
      const error: DeployError = {
        code: "NO_TOKEN_CONFIGURED",
        message: `no Vercel deploy token configured (expected ${ENV_VAR_BY_TARGET.vercel} or a DeployTokenPort entry)`,
      };
      recordHistory({ target: "vercel", status: "failed", resultSummary: error.message });
      return { ok: false, target: "vercel", error };
    }

    try {
      const response = await httpClient.send({
        method: "POST",
        url: vercelDeploymentsUrl(config),
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ name: config.projectId, project: config.projectId, gitSource: { ref: config.ref } }),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });

      if (response.status < 200 || response.status >= 300) {
        const error: DeployError = {
          code: "PROVIDER_ERROR",
          message: `Vercel API returned ${response.status}: ${response.bodyText.slice(0, 300)}`,
          providerStatus: response.status,
        };
        recordHistory({ target: "vercel", status: "failed", resultSummary: error.message });
        return { ok: false, target: "vercel", error };
      }

      const body = JSON.parse(response.bodyText || "{}") as { id?: string; url?: string };
      const deploymentId = body.id ?? "unknown";
      const deploymentUrl = body.url ? `https://${body.url}` : "unknown";
      recordHistory({ target: "vercel", status: "triggered", resultSummary: `deployment ${deploymentId} triggered` });
      return { ok: true, target: "vercel", deploymentId, deploymentUrl };
    } catch (err) {
      // Transport failure, timeout, or an EgressPolicy refusal — never thrown out of deploy().
      const message = err instanceof Error ? err.message : String(err);
      const error: DeployError = { code: "TRANSPORT_ERROR", message };
      recordHistory({ target: "vercel", status: "failed", resultSummary: error.message });
      return { ok: false, target: "vercel", error };
    }
  }

  return {
    async deploy(target: DeployTarget, config: DeployConfig): Promise<DeployResult> {
      if (target === "vercel") return deployVercel(config);
      const error: DeployError = {
        code: "TARGET_NOT_IMPLEMENTED",
        message: `deploy target '${target}' is not implemented yet`,
      };
      recordHistory({ target, status: "failed", resultSummary: error.message });
      return { ok: false, target, error };
    },
    listHistory(limit = 50): DeployHistoryEntry[] {
      const rows = db
        .prepare(
          `SELECT id, target, status, triggered_at, result_summary FROM "${DEPLOYS}" ORDER BY triggered_at DESC LIMIT ?`
        )
        .all(limit) as DeployRow[];
      return rows.map((row) => ({
        id: row.id,
        target: row.target as DeployTarget,
        status: row.status as "triggered" | "failed",
        triggeredAt: row.triggered_at,
        resultSummary: row.result_summary,
      }));
    },
  };
}

/**
 * Boot helper: open a dedicated connection to the site db and activate the deploy plugin on it.
 * Mirrors `bootstrapStore`'s dedicated-connection + busy-timeout pattern (`store-plugin.ts`).
 * `httpClient`/`tokenPort` are required inputs rather than constructed here — this codebase has no
 * composition-root-wired `EgressPolicy` default yet to copy (the same disclosed gap
 * `comments/spam.external.ts`'s own header notes for `AkismetSpamCheck`).
 */
export async function bootstrapDeploy(required: {
  dbPath: string;
  httpClient: HttpClientPort;
  tokenPort: DeployTokenPort;
}): Promise<DeployApi> {
  const { dbPath, httpClient, tokenPort } = required;
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return activateDeploy({ db, dbPath, httpClient, tokenPort });
}
