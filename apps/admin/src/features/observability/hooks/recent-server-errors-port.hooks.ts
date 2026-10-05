import type { AdminServerLogs, AdminServerLogsQuery } from "@/lib/api";

/**
 * @file What `use-recent-server-errors.hooks.ts` needs from the outside world — same port split as
 * `observability-status-port.hooks.ts`.
 */
export interface RecentServerErrorsPort {
  getServerLogs(query: AdminServerLogsQuery): Promise<AdminServerLogs>;
}
