/**
 * @file The fleet chat pane's bridge-backed surfaces. Split out of `App.hooks.ts` (which still
 * re-exports it) with no behaviour change.
 */
import { useEffect, useMemo } from 'react';
import type {
  ChatPaneProps,
  ChatPaneRuntimeAccess,
  ChatPaneWorkingDirectoryAccess,
} from '@jini-ai/chat/react/chat-pane';
import { runnerInventoryBridge, type RunnerInventoryBridge } from './runner-api.js';
import { createWorkspaceChatTransport, type WorkspaceChatTransport } from './workspace-chat-transport.js';
import { createLocalAttachmentUploader } from './chat-attachments.js';

/**
 * Connects `WorkspaceChatPane` to the fleet chat transport: the bridge lookup, the transport built
 * on top of it, and the runtime-access and working-directory surfaces `ChatPane` needs. All three
 * are one bridge lookup, so they live in one hook rather than one per concern.
 */
export function useWorkspaceChatTransport(
  _required: Record<string, never> = {},
  { getBridge = runnerInventoryBridge }: { getBridge?: () => RunnerInventoryBridge | undefined } = {},
): {
  transport: WorkspaceChatTransport | undefined;
  runtimeAccess: ChatPaneRuntimeAccess | undefined;
  workingDirectoryAccess: ChatPaneWorkingDirectoryAccess | undefined;
  /** `undefined` only when the bridge itself is (no preload). See `RunnerInventoryBridge.getPathForFile`. */
  getPathForFile: ((file: File) => string) | undefined;
  /** `undefined` only when the bridge itself is. See `chat-attachments.ts`'s `createLocalAttachmentUploader`. */
  uploadAttachments: ChatPaneProps['uploadAttachments'];
} {
  const bridge = useMemo(() => getBridge(), [getBridge]);

  const runtimeAccess = useMemo<ChatPaneRuntimeAccess | undefined>(() => {
    if (bridge === undefined) return undefined;

    return {
      listAgents: bridge.listAgents,
      rescanAgents: bridge.rescanAgents,
      daemonOnline: bridge.daemonOnline,
    };
  }, [bridge]);

  const workingDirectoryAccess = useMemo<ChatPaneWorkingDirectoryAccess | undefined>(() => {
    if (bridge === undefined) return undefined;

    return {
      normalizeWorkingDirectory: bridge.normalizeWorkingDirectory,
      pickWorkingDirectory: bridge.pickWorkingDirectory,
      recentDirectories: bridge.recentWorkingDirectories,
      directoryExists: bridge.workingDirectoryExists,
    };
  }, [bridge]);

  // One transport per pane lifetime. It installs the single run-event listener every subscription
  // multiplexes over, so rebuilding it per render would stack duplicate listeners on that channel.
  const transport = useMemo(
    () => (bridge === undefined ? undefined : createWorkspaceChatTransport(bridge)),
    [bridge],
  );

  // The pane that uses this hook is unmounted, not hidden, when the operator closes it —
  // including mid-run. Without this the listener and every live subscription outlive the pane
  // that owned them.
  useEffect(() => () => transport?.dispose(), [transport]);

  // Runner has no HTTP server (`AGENTS.md`), so this is the IPC uploader
  // (`chat-attachments.ts`), not `@jini-ai/chat`'s daemon-backed one — see that module's doc.
  const uploadAttachments = useMemo(
    () => (bridge === undefined ? undefined : createLocalAttachmentUploader(bridge)),
    [bridge],
  );

  return {
    transport,
    runtimeAccess,
    workingDirectoryAccess,
    getPathForFile: bridge?.getPathForFile,
    uploadAttachments,
  };
}
