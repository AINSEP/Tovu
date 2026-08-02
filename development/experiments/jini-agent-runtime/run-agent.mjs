/**
 * Real end-to-end spawn of a coding-agent CLI through @jini-ai/agent-runtime.
 *
 * Nothing here is mocked: it resolves the real Claude Code binary via the
 * package's launch resolver, spawns it with the package's own buildArgs, and
 * parses the live JSONL stream with the package's own claude-stream handler.
 *
 * Usage: node run-agent.mjs <sandboxDir> <promptFile>
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  claudeAgentDef,
  resolveAgentLaunch,
  applyAgentLaunchEnv,
  createClaudeStreamHandler,
} from '@jini-ai/agent-runtime';

const [sandboxDir, promptFile] = process.argv.slice(2);
const prompt = readFileSync(promptFile, 'utf8');

const launch = resolveAgentLaunch(claudeAgentDef);
if (!launch.launchPath) throw new Error('no launchPath: ' + launch.diagnostic);

const args = claudeAgentDef.buildArgs(prompt, [], [sandboxDir], {}, {
  cwd: sandboxDir,
  newSessionId: randomUUID(),
});
const env = applyAgentLaunchEnv({ ...process.env }, launch);

console.log('[harness] spawn:', launch.launchPath, args.join(' '));
console.log('[harness] cwd:', sandboxDir);

const child = spawn(launch.launchPath, args, { cwd: sandboxDir, env, stdio: ['pipe', 'pipe', 'pipe'] });

const counts = Object.create(null);
let text = '';
const toolCalls = [];
let usage = null;

const shapes = Object.create(null);
const handler = createClaudeStreamHandler((event) => {
  counts[event.type] = (counts[event.type] ?? 0) + 1;
  shapes[event.type] ??= Object.keys(event);
  // NB: the payload field is `delta`, NOT `text`. Undocumented, and because
  // StreamEvent is Record<string, unknown> the wrong guess fails silently.
  if (event.type === 'text_delta') text += event.delta ?? '';
  if (event.type === 'tool_use') toolCalls.push({ name: event.name, input: event.input });
  if (event.type === 'usage') usage = event;
  if (event.type === 'status') console.log('[event] status:', event.status ?? JSON.stringify(event));
});

child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => handler.feed(c));
child.stderr.setEncoding('utf8');
child.stderr.on('data', (c) => process.stderr.write('[stderr] ' + c));

// promptInputFormat === 'stream-json': the CLI expects JSONL user messages on stdin.
child.stdin.write(JSON.stringify({
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text: prompt }] },
}) + '\n');
child.stdin.end();

child.on('close', (code) => {
  handler.flush();
  console.log('\n===== RESULT =====');
  console.log('exit code:', code);
  console.log('parsed event counts:', JSON.stringify(counts));
  console.log('observed event shapes:', JSON.stringify(shapes));
  console.log('tool_use calls:', toolCalls.length);
  for (const t of toolCalls) {
    const arg = t.input?.file_path ?? t.input?.pattern ?? t.input?.command ?? '';
    console.log(`   - ${t.name} ${String(arg).slice(0, 90)}`);
  }
  console.log('usage:', usage ? JSON.stringify(usage) : '(none)');
  console.log('--- assistant text (' + text.length + ' chars) ---');
  console.log(text.slice(0, 1600));
});
