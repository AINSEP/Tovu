/**
 * Browser-safe contract for staging a fleet-chat attachment onto disk over IPC.
 *
 * Runner has no HTTP server (deliberately — see `AGENTS.md`), so it cannot reuse
 * `@jini-ai/chat`'s `createDaemonAttachmentUploader`, which talks to a daemon's `/api/attachments`
 * route. This is the IPC equivalent: the renderer reads a dropped/picked `File`'s bytes and hands
 * them to main, which writes them into Runner's own ephemeral staging directory
 * (`main.ts`) and returns the absolute path. That path is what `@jini-ai/chat/core`'s
 * `ChatAttachment.path` carries, and what `runner-daemon.ts`'s `startChatRun` later forwards to
 * `AgentExecutor.run()` as `imagePaths`/`extraAllowedDirs` — see that module's doc.
 *
 * One invoke channel only. Unlike the daemon uploader, there is no matching `DELETE`: the staging
 * directory is wiped and recreated at every boot (`main.ts`), so an abandoned upload costs disk for
 * at most one session, not indefinitely.
 */
export const RUNNER_CHAT_ATTACHMENT_CHANNELS = {
  /** Writes one file's bytes into the staging directory; resolves its absolute path. */
  save: 'runner:chat-attachments:save',
} as const;

export interface SaveChatAttachmentInput {
  /**
   * The `File`'s original name. Used only to derive the staged copy's extension — never as, or as
   * part of, the staged file's own path — so a crafted name (`../../etc/passwd`) cannot steer where
   * the bytes land. See `main.ts`'s handler.
   */
  name: string;
  /** The file's raw bytes. */
  data: ArrayBuffer;
}

export interface SaveChatAttachmentResult {
  /** Absolute path to the staged copy, inside Runner's own ephemeral staging directory. */
  path: string;
}
