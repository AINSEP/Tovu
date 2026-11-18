/**
 * @file The boot-line wait of `startTovuServer` (`tovu-server.ts`), split out so that file stays under
 * the size limits. Everything it needs from `tovu-server.ts` (the boot-line parsers, the failure
 * describer, the redactor) is injected through {@link BootPorts}, so this file never imports its
 * parent.
 */
import { createRedactedOutputSink } from "@jini-ai/diagnostics/console-tee";
import type { Readable, Writable } from "node:stream";

/** The most child output one mirror write echoes (same value `tovu-server.ts` uses for failures). */
const MAX_ECHOED_OUTPUT_CHARS = 2_000;

/** Startup output beyond this is a runaway child, not a boot line. */
const MAX_BOOT_OUTPUT_CHARS = 1_000_000;

/** Diagnostics expose only the latest 16 KiB of the redacted tail. */
const OUTPUT_TAIL_KEEP_CHARS = 16_384;

/** The child surface the waiter drives; `tovu-server.ts`'s `SpawnedChild` satisfies it. */
interface BootChild {
  pid?: number;
  stdout: Readable | null;
  stderr: Readable | null;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
}

/** The fields `tovu-server.ts`'s boot line carries that the waiter hands back. */
interface BootFields {
  port: number;
  schemaVersion: number;
  workspaceId: string;
}

/** State `startTovuServer` shares with the waiter: its handle reads `outputTail`, its redactor reads `bootToken`. */
interface BootState {
  outputTail: string;
  bootToken: string | null;
}

/** `tovu-server.ts`'s own parsers and redactor, injected so there is no import back into it. */
interface BootPorts {
  parseBootLine: (required: { text: string }) => BootFields | null;
  parseBootToken: (required: { text: string }) => string | null;
  describeBootFailure: (required: { output: string; fallback: string }) => string;
  redactOutput: (required: { text: string }) => string;
  /** The agent binding's `setIdentity`, when this server has one. */
  setIdentity?: (required: { siteId: string }) => void;
}

/** What a successful wait resolves with. */
interface BootInfo {
  boot: BootFields;
  pid: number;
  origin: string;
}

/** Mutable bookkeeping of one wait. */
interface BootRun {
  output: string;
  settled: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface BootWait {
  child: BootChild;
  state: BootState;
  ports: BootPorts;
  run: BootRun;
  resolve: (info: BootInfo) => void;
  reject: (error: Error) => void;
}

/** Single-settle guard: whichever of ready / timeout / exit happens first owns the outcome. */
function finish({ run }: { run: BootRun }, _optional = {}): boolean {
  if (run.settled) return false;
  run.settled = true;
  clearTimeout(run.timer);
  return true;
}

/** Reject only if this call is the one that settles the wait. */
function fail({ wait, error }: { wait: BootWait; error: Error }, _optional = {}): void {
  if (finish({ run: wait.run })) wait.reject(error);
}

/** Settle the wait once the accumulated output holds a boot line and the child has a pid. */
function settleOnBootLine({ wait }: { wait: BootWait }, _optional = {}): void {
  const { child, state, ports, run } = wait;
  const boot = ports.parseBootLine({ text: run.output });
  if (boot === null) return;
  // A boot line normally proves this child spawned and has a process id.
  const pid = child.pid;
  if (pid == null) return fail({ wait, error: new Error("tovu serve reported a boot line without a process id") });
  ports.setIdentity?.({ siteId: boot.workspaceId });
  if (!finish({ run })) return;
  state.bootToken = ports.parseBootToken({ text: run.output });
  wait.resolve({ boot, pid, origin: `http://127.0.0.1:${boot.port}` });
  run.output = ""; // Boot parsing is finished; retain only the bounded redacted tail now.
}

/** Accumulate startup output (bounded) until the boot line shows up. */
function acceptChunk({ wait, chunk }: { wait: BootWait; chunk: string }, _optional = {}): void {
  const { run } = wait;
  if (run.settled) return;
  if (run.output.length + chunk.length > MAX_BOOT_OUTPUT_CHARS) {
    return fail({ wait, error: new Error("tovu serve startup output exceeded the diagnostic limit.") });
  }
  run.output += chunk;
  settleOnBootLine({ wait });
}

/** Keep the redacted tail of one stream, bounded, and mirror it; feed raw chunks to the boot parser. */
function readStream({ wait, stream, mirror }: { wait: BootWait; stream: Readable; mirror: Writable }, _optional = {}): void {
  const { state, ports } = wait;
  stream.setEncoding("utf8");
  // The framed sink redacts BEFORE either copy is retained or mirrored, even across chunks.
  const safeMirror = createRedactedOutputSink({ sink: { write(safe: string) {
    state.outputTail += safe;
    // Amortize tail copies across small log lines; diagnostics expose only the latest 16 KiB.
    if (state.outputTail.length > 2 * OUTPUT_TAIL_KEEP_CHARS) state.outputTail = state.outputTail.slice(-OUTPUT_TAIL_KEEP_CHARS);
    return mirror.write(safe);
  } }, redact: ({ text }, _redactOptional = {}) => ports.redactOutput({ text }) }, { maxLength: MAX_ECHOED_OUTPUT_CHARS });
  stream.once("end", () => safeMirror.end());
  stream.on("data", (chunk) => {
    safeMirror.write(chunk);
    acceptChunk({ wait, chunk });
  });
}

/** Reject when the child errors or exits before a boot line. */
function watchChildEnd({ wait }: { wait: BootWait }, _optional = {}): void {
  const { child, ports, run } = wait;
  child.once("error", (error) => fail({ wait, error }));
  child.once("exit", (code, signal) => {
    if (!finish({ run })) return;
    const signalDetail = signal ? ` Signal: ${signal}.` : "";
    const detail = `tovu serve exited (code ${code ?? signal ?? "none"}) before reporting a port.${signalDetail}`;
    wait.reject(new Error(ports.describeBootFailure({ output: ports.redactOutput({ text: run.output }), fallback: detail })));
  });
}

/**
 * Wait for the child's boot line, with a timeout, an exit/error guard and a bounded redacted output
 * tail kept in `state`. Only one outcome is ever delivered.
 *
 * @param required.mirror where the child's output is echoed.
 * @param required.readyTimeoutMs how long to wait for the boot line.
 * @returns the parsed boot fields, the child's pid and the loopback origin.
 * @complexity O(n) in startup output length, bounded by {@link MAX_BOOT_OUTPUT_CHARS}.
 */
function waitForBoot(
  { child, state, ports, mirror, readyTimeoutMs }: {
    child: BootChild; state: BootState; ports: BootPorts; mirror: { stdout: Writable; stderr: Writable }; readyTimeoutMs: number;
  },
  _optional = {},
): Promise<BootInfo> {
  return new Promise<BootInfo>((resolve, reject) => {
    const run: BootRun = { output: "", settled: false, timer: undefined };
    const wait: BootWait = { child, state, ports, run, resolve, reject };
    run.timer = setTimeout(() => {
      const fallback = `tovu serve did not report a port within ${readyTimeoutMs}ms.`;
      fail({ wait, error: new Error(ports.describeBootFailure({ output: ports.redactOutput({ text: run.output }), fallback })) });
    }, readyTimeoutMs);
    if (!child.stdout || !child.stderr) {
      fail({ wait, error: new Error("tovu serve is missing its stdout or stderr stream") });
      return;
    }
    readStream({ wait, stream: child.stdout, mirror: mirror.stdout });
    readStream({ wait, stream: child.stderr, mirror: mirror.stderr });
    watchChildEnd({ wait });
  });
}

export { waitForBoot };
export type { BootChild, BootFields, BootInfo, BootPorts, BootState };
