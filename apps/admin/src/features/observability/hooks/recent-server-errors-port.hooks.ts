import type { AdminServerLogs, AdminServerLogsQuery } from "@/lib/api";

/**
 * @file What `use-recent-server-errors.hooks.ts` needs from the outside world — same port split as
 * `observability-status-port.hooks.ts`. `copyText` has the shape of `@jini-ai/ui`'s
 * `ViewerClipboardPort`, so this port is passed straight to `useCopyToClipboard`.
 */
export interface RecentServerErrorsPort {
  getServerLogs(query: AdminServerLogsQuery): Promise<AdminServerLogs>;
  /** Puts `text` on the clipboard; resolves `false` when the browser refused. */
  copyText(text: string): Promise<boolean>;
}
