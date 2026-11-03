/**
 * @file The fleet chat pane's bridge-backed surfaces. Split out of `App.hooks.ts` (which still
 * re-exports it) with no behaviour change.
 */
import { useEffect, useMemo, useState } from 'react';
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

  const [binding, setBinding] = useState<{ bridge: RunnerInventoryBridge; transport: WorkspaceChatTransport }>();
  // Construction installs a listener, so setup and disposal must share an effect lifetime.
  // StrictMode can discard a render and replay setup/cleanup without rebuilding memoized values.
  useEffect(() => {
    if (bridge === undefined) { setBinding(undefined); return; }
    const transport = createWorkspaceChatTransport(bridge);
    setBinding({ bridge, transport });
    return () => transport.dispose();
  }, [bridge]);
  const transport = binding?.bridge === bridge ? binding?.transport : undefined;

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
