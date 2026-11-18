import { PassThrough } from "node:stream";
import type { TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { buildMcpJsonServerEntry, type McpJsonInjectionOptions } from "@jini-ai/daemon";
import { serve } from "@jini-ai/mcp/bin";

/** Connect the real SDK Client to the MCP host's stdio transport through serializing streams: no child process or socket. */
function stdioPair() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const buffer = new ReadBuffer();
  const transport: Transport = {
    start: async () => {
      stdout.on("data", (chunk: Buffer) => {
        buffer.append(chunk);
        let message;
        while ((message = buffer.readMessage()) !== null) transport.onmessage?.(message);
      });
    },
    send: async (message) => { stdin.write(serializeMessage(message)); },
    close: async () => { stdin.end(); transport.onclose?.(); },
  };
  return { stdin, stdout, transport };
}

/** What a bridge launch needs: the run, the credential, the daemon address and the ids the host publishes at startup. */
export interface BridgeLaunch {
  readonly runId: string;
  readonly token: string;
  readonly daemonUrl: string;
  readonly startupToolIds: readonly string[];
  readonly diagnosticToolIds: readonly string[];
  readonly fetchImpl?: typeof fetch;
}

/** Start the real `jini-mcp` host for one run and handshake with it. Cleanup is registered before connect. */
export async function launchMcpBridge({ t, launch }: { t: TestContext; launch: BridgeLaunch }) {
  const options: Pick<McpJsonInjectionOptions, "command" | "daemonUrl" | "startupToolIds" | "diagnosticToolIds"> = {
    command: "jini-mcp", daemonUrl: launch.daemonUrl, startupToolIds: () => launch.startupToolIds, diagnosticToolIds: () => launch.diagnosticToolIds };
  const entry = buildMcpJsonServerEntry({ runId: launch.runId, options }, { credential: launch.token });
  const pair = stdioPair();
  const client = new Client({ name: "tovu-host-test", version: "1" });
  const errors: string[] = [];
  const serving = serve({}, { env: entry.env, fetchImpl: launch.fetchImpl ?? fetch, stdin: pair.stdin, stdout: pair.stdout,
    writeErr: ({ text }) => errors.push(text), exit: ({ code }) => { throw new Error(`bridge exited ${code}: ${errors.join("")}`); } });
  t.after(async () => { await client.close(); pair.stdin.end(); await serving; pair.stdout.destroy(); });
  await Promise.race([client.connect(pair.transport), serving.then(() => { throw new Error("bridge stopped before handshake"); })]);
  const { tools } = await client.listTools();
  return { client, tools };
}

/** The text parts of a tool result, joined. */
export function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as { type: string; text?: string }[]).map(part => part.text ?? "").join("\n");
}
