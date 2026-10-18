import { createToolRegistry, ToolInputError, type ToolExecutionContext, type SurfaceEmitter, type ToolRegistration } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';

/** Exercise the real normalization/authorization gate over a domain's actual registration. */
export function executeRegisteredTool(
  { registration, input }: { registration: ToolRegistration; input: unknown },
  { principalId = 'caller', emitSurface }: { principalId?: string; emitSurface?: SurfaceEmitter } = {},
) {
  const registry = createToolRegistry({});
  registry.register(registration);
  return createToolExecutor({ registry }).execute({ principal: { id: principalId }, run: { id: 'normalization-run' }, toolId: registration.descriptor.id, input }, { emitSurface });
}

/** Invoke assembled batch registrations through their owning execution gate; preserve errors. */
export async function invokeRegisteredTool(registration: ToolRegistration, ctx: ToolExecutionContext): Promise<unknown> {
  const registry = createToolRegistry({});
  registry.register(registration);
  const executor = createToolExecutor({ registry }, { delegate: { onConfirm: () => 'confirm' } });
  const result = await executor.execute({ principal: ctx.principal, run: ctx.run, toolId: registration.descriptor.id, input: ctx.input }, { signal: ctx.signal });
  if (result.status === 'completed') return result.output;
  if (result.status === 'cancelled') throw new DOMException('cancelled', 'AbortError');
  if (result.errorKind === 'validation') throw new ToolInputError({ message: result.error ?? result.status });
  throw new Error(result.error ?? result.status);
}

/** Dispatch MCP calls through the real gateway, mounted HTTP route, bridge and executor.
 * Only the network socket is replaced with an in-memory HTTP stream; responses keep their
 * actual status and JSON encoding. The returned content is exactly what the model sees.
 */
export async function executeDelegatedRegisteredTool(
  { registration, input }: { registration: ToolRegistration; input: unknown },
  { principalId = 'caller' }: { principalId?: string } = {},
) {
  const [{ default: express }, { IncomingMessage, ServerResponse }, { PassThrough }, daemon, http, mcp] = await Promise.all([
    import('express'), import('node:http'), import('node:stream'), import('@jini-ai/daemon'),
    import('@jini-ai/daemon/http'), import('@jini-ai/mcp'),
  ]);
  const registry = createToolRegistry({});
  registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = daemon.createRunLifecycle({ eventLog: daemon.createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: 'normalization-context' });
  const app = express();
  app.use(express.json());
  http.registerDelegatedToolRoutes({ app, deps: { lifecycle, toolExecutor, toolRegistry: registry, resolvePrincipal: () => ({ id: principalId }) },
    adapter: { resolvedPortRef: { current: 7456 }, env: {}, allowedOriginsEnvVar: 'JINI_ALLOWED_ORIGINS', webPortEnvVar: 'JINI_WEB_PORT', bindHostEnvVar: 'JINI_BIND_HOST' } });
  const fetchImpl: typeof fetch = async (url, init) => {
    if (String(url) !== 'http://localhost:7456/api/delegated-tool-calls' || init?.method !== 'POST') throw new Error('unexpected delegated transport request');
    const socket = new PassThrough();
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    const body = String(init.body);
    const req = new IncomingMessage(socket as unknown as import('node:net').Socket);
    req.method = 'POST';
    req.url = '/api/delegated-tool-calls';
    req.httpVersion = '1.1';
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;
    req.headers = { host: 'localhost:7456', origin: 'http://localhost:7456', 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) };
    const res = new ServerResponse(req);
    res.assignSocket(socket as unknown as import('node:net').Socket);
    try {
      const finished = new Promise<void>((resolve, reject) => { res.once('finish', resolve); res.once('error', reject); });
      app(req, res);
      req.push(body);
      req.complete = true;
      req.push(null);
      await finished;
      const wire = Buffer.concat(chunks).toString('utf8');
      return new Response(wire.slice(wire.indexOf('\r\n\r\n') + 4), { status: res.statusCode, headers: { 'content-type': 'application/json' } });
    } finally {
      socket.destroy();
    }
  };
  const gateway = mcp.createExecuteDelegatedToolTool({ runId: run.id });
  return mcp.handleToolCall({ name: 'execute_delegated_tool', tools: mcp.buildToolIndex({ tools: [gateway] }), ctx: { baseUrl: 'http://localhost:7456', fetchImpl } },
    { rawArgs: { toolId: registration.descriptor.id, input } });
}

/** The text payload the MCP client presents to the model, including error replies. */
export function delegatedText(result: Awaited<ReturnType<typeof executeDelegatedRegisteredTool>>): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
}
