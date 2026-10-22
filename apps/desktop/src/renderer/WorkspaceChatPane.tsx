/**
 * @file The fleet-operator workspace chat panel. It has NO call site today, deliberately: the
 * host-page chat FAB that opened it was removed because the fleet chat has no main-process half
 * (see the comment closing `App`'s JSX in `App.tsx`, and `one-chat-fab-wiring.test.ts`), and this
 * pane is kept for the in-chrome panel a real workspace chat should become. It lived inside
 * `App.tsx` until it was moved here so it can be rendered and verified on its own, rather than
 * sitting as code no test could reach.
 */
import { ConversationList } from '@jini-ai/chat/react';
import { ChatPane } from '@jini-ai/chat/react/chat-pane';
import { useWorkspaceChatPane, WORKSPACE_RUN_CONTEXT } from './use-workspace-chat-pane.hooks.js';

type WorkspaceChatPanePorts = Parameters<typeof useWorkspaceChatPane>[1];

/** The two `@jini-ai/chat` components this pane composes; production passes none and gets the real ones. */
interface WorkspaceChatPaneComponents {
  ConversationList?: typeof ConversationList;
  ChatPane?: typeof ChatPane;
}

export function WorkspaceChatPane({
  onClose,
  ports,
  components: { ConversationList: Conversations = ConversationList, ChatPane: Chat = ChatPane } = {},
}: {
  onClose: () => void;
  /** `useWorkspaceChatPane`'s hook ports, passed straight through; production passes none. */
  ports?: WorkspaceChatPanePorts;
  /**
   * Test seam for the composed chat components. A test renders the pane against recording stand-ins
   * because a linked `@jini-ai/chat` resolves its own copy of React outside a bundler, and because
   * what this pane owns is the props it hands them — the components themselves are tested in Jini.
   */
  components?: WorkspaceChatPaneComponents;
}) {
  // Everything this pane holds and every handler it wires, including the capture-phase folder drop
  // (`captureFolderDrop`) and `WORKSPACE_RUN_CONTEXT`. See `use-workspace-chat-pane.hooks.ts`.
  const {
    transport,
    runtimeAccess,
    workingDirectoryAccess,
    uploadAttachments,
    conversations,
    deleteConfirmation,
    listItems,
    conversationIdProp,
    workingDirectory,
    setWorkingDirectory,
    composerHandle,
    onDropCapture,
  } = useWorkspaceChatPane({}, ports);

  return (
    <aside className="runner-chat-pane" aria-label="Runner chat" onDropCapture={onDropCapture}>
      <header className="runner-chat-pane__head">
        <div>
          <p>Runner operator</p>
          <h2>Workspace chat</h2>
        </div>
        <div className="runner-chat-pane__head-actions">
          {/* The conversation switcher lives in the `<aside>`'s own header, not `ChatPane`'s (see
              `header={<></>}` below for why) — it doubles as the "New thread" affordance via its
              own "New" button, which creates a REAL conversation and switches to it rather than
              silently discarding whatever is on screen. */}
          {transport !== undefined && (
            <Conversations
              // A mutable copy of the hook's readonly list — see `workspaceConversationView`.
              conversations={listItems}
              activeConversationId={conversations.activeId}
              onSelect={conversations.select}
              onCreate={conversations.create}
              onDelete={conversations.remove}
              onRename={conversations.rename}
              confirmDelete={deleteConfirmation.confirmDelete}
            />
          )}
          <button type="button" onClick={onClose} aria-label="Close Runner chat">×</button>
        </div>
      </header>
      {deleteConfirmation.pendingTitle !== null && (
        // Inline, not `window.confirm` — a native modal would block this renderer's own IPC (see
        // `useConversationDeleteConfirmation`'s doc, and commit `204f3e6` for the project-delete
        // precedent this mirrors).
        <div className="runner-chat-pane__confirm" role="alertdialog" aria-label="Confirm delete">
          <p>
            Delete “{deleteConfirmation.pendingTitle}”? This can’t be undone.
          </p>
          <div className="runner-chat-pane__confirm-actions">
            <button type="button" onClick={() => deleteConfirmation.resolvePending(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="runner-chat-pane__confirm-delete"
              onClick={() => deleteConfirmation.resolvePending(true)}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {transport === undefined || runtimeAccess === undefined ? (
        <p className="runner-chat-pane__status">
          Open Runner desktop to scan locally installed agent CLIs.
        </p>
      ) : (
        <Chat
          // Remounts the pane on a real conversation switch, never on the incidental `activeId`
          // move a lazy adoption makes mid-turn — see `paneKey`'s own doc on `UseRunnerConversations`.
          key={conversations.paneKey}
          transport={transport}
          runtimeAccess={runtimeAccess}
          runContext={WORKSPACE_RUN_CONTEXT}
          initialMessages={conversations.initialMessages}
          {...conversationIdProp}
          onMessagesChange={conversations.onMessagesChange}
          // Replaces `ChatPane`'s own default header (title + a "New thread" button wired to its
          // own `onReset`, which only clears the local transcript and writes nothing durable) with
          // an empty fragment — not `title`/`undefined` alone, since `resolveChatPaneHeader` falls
          // back to the default on `undefined` too. The real switcher and "New thread" action live
          // in the `<aside>`'s own header above instead: Runner already renders its own "Runner
          // operator / Workspace chat" title bar there, so putting a second one here would stack two
          // headers rather than integrate with the one that already exists (see Tovu's
          // `AssistantDock.tsx`, which resolves the same default-header problem by replacing it
          // with its own header content directly, in a dock with no separate title bar above it).
          header={<></>}
          placeholder="Ask about the fleet, or tell it what to run"
          variant="workspace"
          workingDirectory={workingDirectory}
          onChangeWorkingDirectory={setWorkingDirectory}
          workingDirectoryAccess={workingDirectoryAccess}
          composerHandle={composerHandle}
          uploadAttachments={uploadAttachments}
          // Deliberately unrestricted, unlike Tovu's `attachmentAccept="image/*"`: that limit
          // exists because Tovu's daemon-side pipeline only handles images today, and Runner has
          // no such pipeline to outrun — a staged file's absolute path is simply handed to the
          // fleet agent (`runner-daemon.ts`'s `imagePaths`/`extraAllowedDirs`), which already has
          // full filesystem/Bash access on this machine and can act on any file type directly.
        />
      )}
    </aside>
  );
}
