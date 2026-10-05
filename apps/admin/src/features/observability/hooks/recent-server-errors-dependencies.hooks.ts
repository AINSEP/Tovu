import { api, type AdminServerLogs } from "@/lib/api";
import type { RecentServerErrorsPort } from "./recent-server-errors-port.hooks";

/** @file The only place the Recent errors hook reaches `lib/api`, plus its in-memory test fake. */

export const defaultRecentServerErrorsPort: RecentServerErrorsPort = {
  getServerLogs: (query) => api.getServerLogs(query),
};

export interface FakeRecentServerErrorsPortOptions {
  logs?: AdminServerLogs;
  failWith?: unknown;
}

/** An in-memory {@link RecentServerErrorsPort} that records each query it was asked. */
export function createFakeRecentServerErrorsPort(options: FakeRecentServerErrorsPortOptions = {}): RecentServerErrorsPort & { queries: unknown[] } {
  const queries: unknown[] = [];
  return {
    queries,
    async getServerLogs(query) {
      queries.push(query);
      if (options.failWith !== undefined) throw options.failWith;
      return options.logs ?? { entries: [], matched: 0, buffered: 0, truncated: false, capturing: true };
    },
  };
}
