/** A real HTTP server used only by disk-leak.test; stdout/stderr are its on-disk server log. */
import express from 'express';
import { createServer } from 'node:http';
import { openContentDb } from '../../../platform/db/sqlite/content-db.js';
import { SqliteExternalMcpServerRepo } from '../../../platform/db/sqlite/external-mcp-repo.sqlite.js';
import { InMemoryExternalMcpToolApprovalRepo } from '../../../assistant/external-mcp-tool-approval-adapters.js';
import { InMemoryKeyring } from '../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../webhooks/secret-sealer.aesgcm.js';
import { createNoopObservabilityPort } from '../../../platform/observability/index.js';
import { registerAdminExternalMcpPutRoute } from '../../../server/inbound/admin-http/routes/external-mcp/put.js';
import { registerAdminExternalMcpListRoute } from '../../../server/inbound/admin-http/routes/external-mcp/list.js';
import { registerAdminExternalMcpProbeRoute, createExternalMcpProbeLimiter, type ExternalMcpProbeRouteDeps } from '../../../server/inbound/admin-http/routes/external-mcp/probe.js';

const db = openContentDb(process.argv[2]!);
db.$client.pragma('journal_mode = WAL');
db.$client.pragma('wal_autocheckpoint = 0');
const workspaceId = 'credential-safety';
db.$client.prepare('INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(workspaceId, workspaceId, workspaceId, '1970-01-01T00:00:00.000Z');
const keyring = new InMemoryKeyring();
const deps: ExternalMcpProbeRouteDeps = {
  workspaceId, clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
  authorize: async () => ({ allowed: true, reason: 'matched' }),
  externalMcpServerRepo: new SqliteExternalMcpServerRepo(db),
  externalMcpToolApprovalRepo: new InMemoryExternalMcpToolApprovalRepo(),
  builtInExternalMcpServerIds: [], observability: createNoopObservabilityPort({}),
  siteAssistantSecretKeyring: keyring, siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
  // A hostile upstream error with a credential is the regression: production must discard its text.
  connect: async spec => { throw Object.assign(new Error(`hostile upstream ${spec.headers?.authorization ?? ''}`), { status: 401 }); },
};
const app = express();
app.use(express.json());
app.use((_request, response, next) => {
  response.locals.principal = { id: 'test-owner' };
  response.on('finish', () => console.log(JSON.stringify({ status: response.statusCode })));
  next();
});
registerAdminExternalMcpPutRoute(app, deps);
registerAdminExternalMcpListRoute(app, deps);
registerAdminExternalMcpProbeRoute(app, deps, createExternalMcpProbeLimiter(deps));
const server = createServer(app);
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address === 'object') process.send?.({ url: `http://127.0.0.1:${address.port}` });
});
process.on('SIGTERM', () => {
  server.closeAllConnections();
  server.close(() => { db.$client.close(); process.exit(0); });
});
