/**
 * The @jini-ai/agent-runtime adapter for AgentRunnerPort.
 *
 * IMPORTANT (external-consumption constraint, verified empirically):
 * @jini-ai/agent-runtime is ESM-only and its `exports` map declares only an
 * `"import"` condition — no `"require"`, no `"default"`. Tovu is
 * `"type": "commonjs"`. Consequences:
 *
 *   - A *static* `import ... from '@jini-ai/agent-runtime'` typechecks clean
 *     under module=NodeNext and then throws ERR_PACKAGE_PATH_NOT_EXPORTED at
 *     runtime. TypeScript gives a false green light.
 *   - Under module=CommonJS, `await import(...)` is downleveled to `require()`
 *     and fails the same way.
 *
 * The only combination that compiles AND runs from CommonJS Tovu is
 * module/moduleResolution = NodeNext plus a *dynamic* import, below.
 */
import type {
  AgentRunnerPort,
  AgentTurnEvent,
  AgentTurnRequest,
  AgentTurnResult,
} from './agent-runner.port.js';

type JiniRuntime = typeof import('@jini-ai/agent-runtime');

let cached: Promise<JiniRuntime> | null = null;
function loadJini(): Promise<JiniRuntime> {
  cached ??= import('@jini-ai/agent-runtime');
  return cached;
}

export function createJiniAgentRunner(): AgentRunnerPort {
  return {
    async listAvailableAgents() {
      const { detectAgents } = await loadJini();
      const agents = await detectAgents();
      return agents.map((a) => ({ id: a.id, version: a.version ?? null, available: a.available }));
    },

    async runTurn(req: AgentTurnRequest, onEvent: (e: AgentTurnEvent) => void): Promise<AgentTurnResult> {
      const { claudeAgentDef, resolveAgentLaunch, applyAgentLaunchEnv, createClaudeStreamHandler } =
        await loadJini();
      const { spawn } = await import('node:child_process');
      const { randomUUID } = await import('node:crypto');

      const launch = resolveAgentLaunch(claudeAgentDef);
      if (!launch.launchPath) throw new Error(`agent unavailable: ${launch.diagnostic ?? 'no launch path'}`);

      const args = claudeAgentDef.buildArgs(req.prompt, [], [req.workingDir], { model: req.model ?? null }, {
        cwd: req.workingDir,
        newSessionId: randomUUID(),
      });
      const env = applyAgentLaunchEnv({ ...process.env }, launch);
      const child = spawn(launch.launchPath, args, { cwd: req.workingDir, env, stdio: ['pipe', 'pipe', 'pipe'] });

      const result: AgentTurnResult = { exitCode: null, text: '', toolCalls: [], costUsd: null };

      const handler = createClaudeStreamHandler((raw) => {
        const e = raw as AgentTurnEvent;
        if (e.type === 'text_delta') result.text += e.delta;
        if (e.type === 'tool_use') result.toolCalls.push({ name: e.name, input: e.input });
        if (e.type === 'usage') result.costUsd = e.costUsd;
        onEvent(e);
      });

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (c: string) => handler.feed(c));

      child.stdin.write(
        JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: req.prompt }] } }) + '\n',
      );
      child.stdin.end();

      return await new Promise<AgentTurnResult>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => {
          handler.flush();
          result.exitCode = code;
          resolve(result);
        });
      });
    },
  };
}
