import type { AgentExecutorRuntimePorts } from "@jini-ai/daemon/ports/runtime";
import { createAtomicWriterPort, createFileLockPort } from "@jini-ai/node-adapters/fs";
import { backupOriginalOnce, withFileLock, writeFileAtomicAsync, writeJsonFileAtomicAsync } from "@jini-ai/platform/fs";
import { createProcessControlPort, nodeCommandShell, nodeSpawnPort } from "@jini-ai/node-adapters/process";
import { listProcessSnapshots, stopProcesses, waitForProcessExit } from "@jini-ai/platform/process";
/** Platform's file functions under core's port names; node-adapters takes them injected (it imports no platform implementation). */
const nodeFileLock = createFileLockPort({ withFileLock });
const nodeAtomicWriter = createAtomicWriterPort({ writeFileAtomicAsync, writeJsonFileAtomicAsync, backupOriginalOnce });

/** Platform's process functions behind core's port (node-adapters takes them injected). */
const nodeProcessControl = createProcessControlPort({ functions: { listProcessSnapshots, stopProcesses, waitForProcessExit } });

/**
 * The Node implementations of the OS-facing ports one `@jini-ai/daemon` agent executor needs (spawn, process
 * control, file lock, atomic writer, command shell). The daemon has no default for any of them, so this host
 * states them once, from the env it owns, and `satisfies` proves the match.
 * @param required.hostEnv The env snapshot the runtime owns; only its `ComSpec` is read, for the Windows `.cmd` fallback.
 * @returns The ports to pass as `runtime`. @complexity O(1).
 */
export function createDaemonRuntimePorts({ hostEnv }: { readonly hostEnv: NodeJS.ProcessEnv }, _optional: Record<string, never> = {}): AgentExecutorRuntimePorts {
  return {
    spawn: nodeSpawnPort, processes: nodeProcessControl, fileLock: nodeFileLock, writer: nodeAtomicWriter, commandShell: nodeCommandShell({ env: hostEnv }),
  } satisfies AgentExecutorRuntimePorts;
}
