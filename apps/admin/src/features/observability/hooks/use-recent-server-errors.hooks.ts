import { useCallback, useEffect, useState } from "react";

import { describeApiError, type AdminServerLogEntry, type AdminServerLogs } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translateObservability } from "../observability-i18n";
import { defaultRecentServerErrorsPort } from "./recent-server-errors-dependencies.hooks";
import type { RecentServerErrorsPort } from "./recent-server-errors-port.hooks";
import type { Translate } from "@/lib/dictionary-translator";

/**
 * @file State for the Observability screen's Recent errors tab (gap A-04, slice L2): the newest
 * error lines from `GET .../system/server-logs?level=error` — the same `readServerLogs` the
 * `system_read_server_logs` chat tool calls. Loads on mount and on Refresh; no polling.
 */

/** How many error lines the tab asks for. */
export const RECENT_ERRORS_LIMIT = 50;

export interface RecentServerErrorsDependencies {
  port: RecentServerErrorsPort;
  locale: string;
  t: Translate;
}

/** One error line, formatted for display. */
export interface RecentServerErrorRow {
  key: string;
  /** Localized date and time the line was captured. */
  when: string;
  source: AdminServerLogEntry["source"];
  message: string;
}

export interface RecentServerErrorsController {
  /** Newest first, ready to render. Empty until the first load settles. */
  rows: RecentServerErrorRow[];
  /** `null` until the first load settles. */
  logs: AdminServerLogs | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  t: Translate;
}

export function useRecentServerErrors({ port, locale, t }: RecentServerErrorsDependencies): RecentServerErrorsController {
  const [logs, setLogs] = useState<AdminServerLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void port
      .getServerLogs({ level: "error", limit: RECENT_ERRORS_LIMIT })
      .then((result) => setLogs(result))
      .catch((e) => setError(describeApiError(e, translateObservability(locale, "failed to load recent server errors"))))
      .finally(() => setLoading(false));
  }, [port, locale]);

  useEffect(refresh, [refresh]);

  return { rows: logs ? toRows(logs.entries, locale) : [], logs, loading, error, refresh, t };
}

function formatWhen(at: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(at));
  } catch {
    return at;
  }
}

/** Newest first; `seq` restarts after a server restart, so the key also carries the time. */
function toRows(entries: AdminServerLogEntry[], locale: string): RecentServerErrorRow[] {
  return [...entries].reverse().map((entry) => ({ key: `${entry.at}-${entry.seq}`, when: formatWhen(entry.at, locale), source: entry.source, message: entry.message }));
}

/** Binds the real API client and admin locale — the `useWiredX()` half of the pair. */
export function useWiredRecentServerErrors(): RecentServerErrorsController {
  const locale = useAdminLocale();
  const t = useCallback((key: string): string => translateObservability(locale, key), [locale]);
  return useRecentServerErrors({ port: defaultRecentServerErrorsPort, locale, t });
}
