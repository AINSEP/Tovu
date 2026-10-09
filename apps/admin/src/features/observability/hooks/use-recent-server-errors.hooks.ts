import { useCallback, useEffect, useMemo, useState } from "react";

import { describeApiError, type AdminServerLogEntry, type AdminServerLogs } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translateObservability } from "../observability-i18n";
import {
  formatErrorCopyText,
  groupErrorEntries,
  segmentErrorPaths,
  summarizeErrorMessage,
  type ErrorMessageSegment,
  type RecentErrorGroup,
} from "../recent-errors-rules";
import { defaultRecentServerErrorsPort } from "./recent-server-errors-dependencies.hooks";
import type { RecentServerErrorsPort } from "./recent-server-errors-port.hooks";
import type { Translate } from "@jini-ai/ui/panel-kit";

/**
 * @file State for the Observability screen's Recent errors tab (gap A-04, slice L2): the newest
 * error lines from `GET .../system/server-logs?level=error` — the same `readServerLogs` the
 * `system_read_server_logs` chat tool calls. Loads on mount and on Refresh; no polling. Repeats of
 * the same error (stack frames aside) are grouped into one row with a count; shaping lives in `recent-errors-rules.ts`.
 */

/** How many error lines the tab asks for. */
export const RECENT_ERRORS_LIMIT = 50;

export interface RecentServerErrorsDependencies {
  port: RecentServerErrorsPort;
  locale: string;
  t: Translate;
}

/** One distinct error (repeats grouped by `groupErrorEntries`), formatted for display. */
export interface RecentServerErrorRow {
  key: string;
  /** Localized date and time of the newest occurrence. */
  when: string;
  /** ISO time of the newest occurrence, for `<time dateTime>`. */
  at: string;
  /** Localized time of the oldest occurrence; `null` when the error happened once. */
  firstWhen: string | null;
  /** ISO time of the oldest occurrence, for the First seen `<time dateTime>`; `null` with `firstWhen`. */
  firstAt: string | null;
  source: AdminServerLogEntry["source"];
  /** The message's leading `[tag]`, e.g. `assistant`, or `null`. */
  scope: string | null;
  /** One line, for the collapsed row. */
  summary: string;
  /** The full message (already secret-redacted by the server). */
  message: string;
  /** `message` with file paths shortened for display; each carries its full path. */
  segments: ErrorMessageSegment[];
  count: number;
  /** What the Copy button puts on the clipboard. */
  copyText: string;
}

export interface RecentServerErrorsController {
  /** Newest first, ready to render. Empty until the first load settles. */
  rows: RecentServerErrorRow[];
  /** `null` until the first load settles. */
  logs: AdminServerLogs | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Clipboard for the per-row Copy buttons (`useRecentErrorItem`). */
  clipboard: Pick<RecentServerErrorsPort, "copyText">;
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
      .catch((e) => setError(describeApiError(e, translateObservability({ locale: locale, key: "failed to load recent server errors" }))))
      .finally(() => setLoading(false));
  }, [port, locale]);

  useEffect(refresh, [refresh]);

  const rows = useMemo(() => (logs ? toRows(logs.entries, locale) : []), [logs, locale]);
  return { rows, logs, loading, error, refresh, clipboard: port, t };
}

function formatWhen(at: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(at));
  } catch {
    return at;
  }
}

/** Newest first, repeats of the same error grouped. Memoized by the caller: segmenting 50 stack traces
 *  on every render would redo the same regex work for nothing. */
function toRows(entries: AdminServerLogEntry[], locale: string): RecentServerErrorRow[] {
  return groupErrorEntries({ entries }).map((group) => toRow(group, locale));
}

function toRow(group: RecentErrorGroup, locale: string): RecentServerErrorRow {
  const { latest, earliest, count } = group;
  const { scope, summary } = summarizeErrorMessage({ message: latest.message });
  return {
    key: group.key,
    when: formatWhen(latest.at, locale),
    at: latest.at,
    firstWhen: count > 1 ? formatWhen(earliest.at, locale) : null,
    firstAt: count > 1 ? earliest.at : null,
    source: latest.source,
    scope,
    summary,
    message: latest.message,
    segments: segmentErrorPaths({ message: latest.message }),
    count,
    copyText: formatErrorCopyText({ group }),
  };
}

/** Binds the real API client and admin locale — the `useWiredX()` half of the pair. */
export function useWiredRecentServerErrors(): RecentServerErrorsController {
  const locale = useAdminLocale();
  const t = useCallback((key: string): string => translateObservability({ locale: locale, key: key }), [locale]);
  return useRecentServerErrors({ port: defaultRecentServerErrorsPort, locale, t });
}
