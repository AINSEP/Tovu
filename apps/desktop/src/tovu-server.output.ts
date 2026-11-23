import { createRedactedOutputSink } from "@jini-ai/diagnostics/console-tee";
import type { ChildReadinessFailure, ChildReadinessOutputSink } from "@jini-ai/sidecar/supervisor/node";
import type { Writable } from "node:stream";

/** The most child output one mirror write or one boot-failure message echoes. */
const MAX_ECHOED_OUTPUT_CHARS = 2_000;
/** Diagnostics expose only the latest 16 KiB of the redacted tail. */
const OUTPUT_TAIL_KEEP_CHARS = 16_384;

/** State shared with the handle's outputTail and the launch-secret redactor. */
export interface BootState {
  outputTail: string;
  bootToken: string | null;
}

/** Keep the redacted tail of one stream, bounded, and mirror it. */
export function createBootOutputSink(
  { stream, state, mirror, redactOutput }: {
    stream: "stdout" | "stderr"; state: BootState; mirror: { stdout: Writable; stderr: Writable };
    redactOutput: (required: { text: string }) => string;
  },
  _optional = {},
): ChildReadinessOutputSink {
  // The framed sink redacts BEFORE either copy is retained or mirrored, even across chunks.
  return createRedactedOutputSink(
    { sink: mirror[stream], redact: ({ text }, _redactOptional = {}) => redactOutput({ text }) },
    { maxLength: MAX_ECHOED_OUTPUT_CHARS, retain: state, tailKeepChars: OUTPUT_TAIL_KEEP_CHARS },
  );
}

/** Compose the most useful failure message available: Tovu's own error line, else the raw tail.
 *  `output` is the whole (redacted) text: Tovu prints its error line last, so only the fallback
 *  tail is capped (from its start, where a native fatal error names itself), never the text
 *  searched for that line. */
function describeBootFailure(
  { output, fallback, parseCliErrorLine }: {
    output: string; fallback: string;
    parseCliErrorLine: (required: { text: string }) => { code: string; message: string } | null;
  },
  _optional = {},
): string {
  const cliError = parseCliErrorLine({ text: output });
  if (cliError !== null) return `tovu serve failed: ${cliError.code}: ${cliError.message}`;
  const tail = output.trim().split("\n").slice(-5).join("\n").slice(0, MAX_ECHOED_OUTPUT_CHARS);
  return tail.length > 0 ? `${fallback}\n${tail}` : fallback;
}

/** Preserve the CLI wording while the shared waiter owns readiness timing and settlement. */
export function describeServeReadinessFailure(
  { failure, redactOutput, parseCliErrorLine }: {
    failure: ChildReadinessFailure; redactOutput: (required: { text: string }) => string;
    parseCliErrorLine: (required: { text: string }) => { code: string; message: string } | null;
  },
  _optional = {},
): string {
  if (failure.type === "missing-pid") return "tovu serve reported a boot line without a process id";
  if (failure.type === "missing-stream") return "tovu serve is missing its stdout or stderr stream";
  if (failure.type === "output-limit") return "tovu serve startup output exceeded the diagnostic limit.";
  const fallback = failure.type === "timeout"
    ? `tovu serve did not report a port within ${failure.readyTimeoutMs}ms.`
    : `tovu serve exited (code ${failure.code ?? failure.signal ?? "none"}) before reporting a port.${failure.signal ? ` Signal: ${failure.signal}.` : ""}`;
  return describeBootFailure({ output: redactOutput({ text: failure.text }), fallback, parseCliErrorLine });
}
