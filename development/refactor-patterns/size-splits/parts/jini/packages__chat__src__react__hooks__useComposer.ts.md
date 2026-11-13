### jini:packages/chat/src/react/hooks/useComposer.ts
- **Over:** `useComposer` 208
- **Phase:** now · **Batch:** size-12
- **Tests:** `src/react/hooks/__tests__/useComposer.test.ts`, `src/react/hooks/__tests__/useComposer.draft-debounce.test.tsx`, `src/react/hooks/__tests__/useComposer.release-check.test.tsx`, `src/react/hooks/__tests__/useComposer.lifecycle.cov-j2.test.tsx`, `src/react/components/__tests__/Composer.test.tsx` (smoke). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | interfaces, `browserPageLifecycle`, `EMPTY_MENTION`, `DRAFT_PERSIST_DEBOUNCE_MS`, `useDeferredDraftWrite`, `canReleaseAttachments` | draft write plumbing |
| B folders | `const [folders, setFolders]`, `addFolders`, `removeFolder` | pinned folders per conversation |
| C restore | `validateAttachmentsRef` (+ `.current =`), `attachmentsHydratedForRef`, restore effect ~L365, persist effect ~L406 | restore/persist staged attachments per conversation |
| D attach actions | `addAttachment`, `addAttachments`, `removeAttachment`, `clearAttachments` | edit the attachment list |
| E mention | `openMention`, `closeMention`, `selectMention` | @-mention popover |
| F core (stays) | draft state, `attachments`/`agent`/`mention` state, `pendingUploadsRef`, `deferredWrite`, `commitDraft`, `history`, `setDraft`, draftRef, conversation-change effect, `reset`, `canSubmit`, return memo | the composer |

- **Splits** (sub-hooks at module level above `useComposer`, below `useDeferredDraftWrite`; each called exactly where its first statement stood):
  1. `useComposerFolders({ conversationId }: UseComposerFoldersInput): { folders; setFolders; addFolders; removeFolder }` ← unit B (the "persist inside the updater" comment moves). Only state + callbacks, no effects.
  2. `useAttachmentRestore({ conversationId, validateAttachments, attachments, setAttachments }: UseAttachmentRestoreInput): void` ← unit C verbatim (comments move), called at ~L353 (after the conversation-change effect, so effect order is unchanged). Uses `canReleaseAttachments` as before.
  3. `useAttachmentActions({ project, composerSlots, pendingUploadsRef, setAttachments }: UseAttachmentActionsInput): { addAttachment; addAttachments; removeAttachment; clearAttachments }` ← unit D.
  4. `useMentionPopover({ composerSlots, draft, setDraft, setMention }: UseMentionPopoverInput): { openMention; closeMention; selectMention }` ← unit E.
- **Importers to update:** none (no export moves).
- **After:** `useComposer` ~92; sub-hooks ~20 / ~42 / ~30 / ~32; file ~370.
- **Risks / notes:** effect order must stay: `useDeferredDraftWrite`'s effects → conversation-change effect (~L321) → restore effect → persist effect. Keep every `useCallback` dependency array identical. `mention` state stays in the core (the conversation-change effect calls `setMention`).
