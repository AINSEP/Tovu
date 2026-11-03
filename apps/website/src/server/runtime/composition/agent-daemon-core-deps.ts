/** ADR-070 retained daemon composition. No site routes, migrations, plugin lifecycle or outbox.
 * The server owns durable attempts and provider plugins; a client opens only already-migrated
 * content/chat kernels for the retained local repositories. Memory never opens a database. */
import path from "node:path";
import { getEffective, InMemorySettingsRepo, INSTRUCTIONS_NAMESPACE, type SettingsRepoPort } from "@jini-ai/core/settings";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import type { AiTraceSink } from "@jini-ai/agent-runtime/ai-trace";
import type { ToolAttemptAuditSink } from "@jini-ai/daemon/tool-audit";
import type { AgentSessionStore } from "#src/assistant/persistence/agent-session-store";
import type { ConversationToolApprovalStore } from "#src/assistant/external-mcp-tool-approval-ports";
import { DaemonCoreError, type DaemonCoreSnapshot, type DaemonDurableRunStore } from "#src/assistant/daemon-core-protocol";
import { openSiteDbClient, type SiteDbClient, type ImportSiteDbDriver, type ResolvePostgresConnectionString } from "#src/platform/db/client/open-site-db-client";
import { resolveSiteStorage } from "#src/platform/site-dir/site-storage";
import type { SiteStorage } from "#src/platform/site-dir/types";
import { SqlSettingsRepo } from "#src/features/settings/repo";
import { SqlToolAttemptAuditSink } from "#src/features/tool-audit/repo";
import { createInMemoryToolAttemptAuditSink } from "#src/features/tool-audit/repo.memory";
import { createInMemoryAgentSessionStore, createSqliteAgentSessionStore } from "#src/assistant/persistence/agent-session-store";
import { createInMemoryConversationToolApprovalStore } from "#src/assistant/external-mcp-tool-approval-adapters";
import { createSqliteConversationToolApprovalStore } from "#src/assistant/persistence/conversation-tool-approval-store";
import { createDaemonCoreClient } from "../../inbound/assistant/agent-daemon-core-client.js";
import { resolvePostgresConnectionString } from "./storage-secret.js";

export interface AgentDaemonResource { close(): Promise<void> }
interface RetainedRepositories {
  readonly settingsRepo: SettingsRepoPort;
  readonly agentSessions: AgentSessionStore;
  readonly conversationToolApprovals: ConversationToolApprovalStore;
  readonly toolAttemptAuditSink: ToolAttemptAuditSink;
}
export interface AgentDaemonCoreDeps extends AgentDaemonResource, RetainedRepositories {
  readonly workspaceId: string;
  readonly siteBinding: DaemonCoreSnapshot["siteBinding"];
  readonly siteStoragePaths: DaemonCoreSnapshot["siteStoragePaths"];
  readonly ownerPrincipalId: Promise<string>;
  readonly instructionsNamespace: string;
  readonly settingsUiTabsReady: Promise<void>;
  readonly siteTitleReady: Promise<void>;
  readonly getEffective: typeof getEffective;
  readonly chatRunLedger: { readonly durable: DaemonDurableRunStore };
  readonly tracker: Tracker;
  readonly aiTraceSink: AiTraceSink | undefined;
  getSessionForAttempt(input: { runId: string }, options?: Record<string, never>): Promise<string | null>;
  flushTelemetry(): Promise<void>;
}
export interface AgentDaemonCoreOptions {
  dbPath?: string;
  storage?: SiteStorage;
  fetch?: typeof fetch;
  importDriver?: ImportSiteDbDriver;
  openClient?: typeof openSiteDbClient;
  resolvePostgresConnectionString?: ResolvePostgresConnectionString;
  onStoreOpened?: (resource: AgentDaemonResource) => void;
}

/** Build the daemon's retained ports over the configured leaf client, closing it on failure.
 * @param required The daemon environment and separately held site RPC credential.
 * @param optional DB/transport seams and shutdown registration; no alternate site composition.
 * @returns Retained ports plus one idempotent close (telemetry drain, then DB client).
 * @throws Refused bootstrap, workspace mismatch or client/repository/shutdown-registration errors.
 * @complexity O(1) composition, one bounded site snapshot and at most one driver import.
 * @example const deps = await createAgentDaemonCoreDeps({ env: process.env, token });
 */
export async function createAgentDaemonCoreDeps(required: { env: NodeJS.ProcessEnv; token: string }, optional: AgentDaemonCoreOptions = {}): Promise<AgentDaemonCoreDeps> {
  const { env, token } = required;
  const site = createDaemonCoreClient({ baseUrl: env.TOVU_SITE_LISTENER_ORIGIN ?? "", token }, { fetch: optional.fetch });
  const snapshot = await site.bootstrap();
  if (env.TOVU_WORKSPACE && env.TOVU_WORKSPACE !== snapshot.workspaceId) throw new DaemonCoreError({ reason: "the daemon workspace does not match its site server" });
  if (env.TOVU_SITE_DIR && path.resolve(env.TOVU_SITE_DIR) !== path.resolve(snapshot.siteBinding.dir)) throw new DaemonCoreError({ reason: "the daemon directory does not match its site server" });
  const client = await openRetainedClient({ env, snapshot }, optional);
  let closing: Promise<void> | undefined;
  /** Telemetry failure cannot leave a borrowed DB connection alive. Idempotence shares the drain. */
  const close = (): Promise<void> => {
    closing ??= site.close().finally(() => client?.close());
    return closing;
  };
  try {
    const ports = retainedRepositories({ client });
    const deps = { ...ports, workspaceId: snapshot.workspaceId, siteBinding: snapshot.siteBinding,
      siteStoragePaths: snapshot.siteStoragePaths, ownerPrincipalId: Promise.resolve(snapshot.ownerPrincipalId),
      instructionsNamespace: INSTRUCTIONS_NAMESPACE, settingsUiTabsReady: Promise.resolve(), siteTitleReady: Promise.resolve(),
      getEffective: client ? getEffective : site.getEffective,
      getSessionForAttempt: site.getSessionForAttempt, chatRunLedger: { durable: site.durable }, tracker: site.tracker,
      aiTraceSink: snapshot.traceEnabled ? site.trace({ capture: snapshot.traceCapture }) : undefined,
      flushTelemetry: site.flush, close,
    };
    optional.onStoreOpened?.({ close });
    return deps;
  } catch (error) {
    // Preserve the composition error even if a failing server also refuses the final telemetry drain.
    await close().catch(() => {});
    throw error;
  }
}

/** Existing memory and kernel-backed adapters, imported from their implementation leaves.
 * Local memory sessions/approvals are intentionally separate; attempt authority above never is.
 * @complexity O(1) repository construction; no queries, migration, seed or plugin recovery.
 */
function retainedRepositories({ client }: { client?: SiteDbClient }, _options = {}): RetainedRepositories {
  if (!client) return { settingsRepo: new InMemorySettingsRepo(), agentSessions: createInMemoryAgentSessionStore(),
    conversationToolApprovals: createInMemoryConversationToolApprovalStore(), toolAttemptAuditSink: createInMemoryToolAttemptAuditSink({}) };
  return { settingsRepo: new SqlSettingsRepo(client.content), agentSessions: createSqliteAgentSessionStore(client.chat),
    conversationToolApprovals: createSqliteConversationToolApprovalStore(client.chat), toolAttemptAuditSink: new SqlToolAttemptAuditSink(client.content) };
}

/** Open the selected driver only for a persistent site. This leaf never owns server boot work.
 * @complexity O(1), one configured driver and at most two connections; memory opens none. */
async function openRetainedClient({ env, snapshot }: { env: NodeJS.ProcessEnv; snapshot: DaemonCoreSnapshot }, optional: AgentDaemonCoreOptions = {}): Promise<SiteDbClient | undefined> {
  if (env.TOVU_DB === "memory") return undefined;
  const dbPath = optional.dbPath ?? snapshot.siteStoragePaths.contentDbPath;
  return (optional.openClient ?? openSiteDbClient)({
    storage: optional.storage ?? resolveSiteStorage(snapshot.siteBinding.dir), dbPath, chatDbPath: path.join(path.dirname(dbPath), "chat.db"),
    resolvePostgresConnectionString: optional.resolvePostgresConnectionString ?? ((storage, required) => resolvePostgresConnectionString(storage, required, { env })),
  }, { env, importDriver: optional.importDriver });
}
