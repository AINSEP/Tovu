import { createBrowserViewerClipboard } from "@jini-ai/ui";

import type { AdminServerLogs } from "@/features/observability/api/observability-api.types";
import { observabilityApi } from "@/features/observability/api/observability-api";
import type { RecentServerErrorsPort } from "./recent-server-errors-port.hooks";

/** @file The only place the Recent errors hook reaches `lib/api` and the clipboard, plus its in-memory test fake. */

const browserClipboard = createBrowserViewerClipboard();

export const defaultRecentServerErrorsPort: RecentServerErrorsPort = {
  getServerLogs: (query, _optional = {}) => observabilityApi.getServerLogs(query),
  copyText: (text) => browserClipboard.copyText(text),
};

export interface FakeRecentServerErrorsPortOptions {
  logs?: AdminServerLogs;
  failWith?: unknown;
  /** What `copyText` resolves; defaults to `true`. */
  copyResult?: boolean;
}

/** An in-memory {@link RecentServerErrorsPort} that records each query it was asked and each text it copied. */
export function createFakeRecentServerErrorsPort(options: FakeRecentServerErrorsPortOptions = {}): RecentServerErrorsPort & { queries: unknown[]; copied: string[] } {
  const queries: unknown[] = [];
  const copied: string[] = [];
  return {
    queries,
    copied,
    async getServerLogs(query, _optional = {}) {
      queries.push(query);
      if (options.failWith !== undefined) throw options.failWith;
      return options.logs ?? { entries: [], matched: 0, buffered: 0, truncated: false, capturing: true };
    },
    async copyText(text) {
      copied.push(text);
      return options.copyResult ?? true;
    },
  };
}
