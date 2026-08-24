import type { Translate } from "../../../lib/dictionary-translator";
import { useFetchQuery } from "../../../lib/fetch-query";
import { useWiredAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { KEYS, resolveSchemaStateWarning, type SchemaStateWarning } from "../rules";
import { t } from "../database-i18n";
import { defaultSchemaStateSectionPort } from "./schema-state-section-dependencies.hooks";
import type { SchemaStateSectionPort } from "./schema-state-section-port.hooks";

/**
 * @file Everything the Database screen's drift warning does, so `Database.tsx` stays markup only.
 * Same `useX(dependencies)` / `useWiredX()` shape as this feature's three older sections.
 *
 * This is the client half of the gap closed on 2026-08-24: `src/db/drift.ts`'s `getDriftStatus` was
 * built, correct, and reachable only from an agent tool, so a site owner on a diverged database was
 * never told. `Database.tsx`'s own header used to record the drift banner as having "no route yet".
 *
 * ALL of the decision lives in `rules.ts`'s pure `resolveSchemaStateWarning` — this hook only feeds
 * it the two inputs (`state`, `error`) and hands back what it returns. That split is deliberate:
 * the honesty rules (a failed check must warn; an unrecognised status must warn; only a confirmed
 * `"in-sync"` may stay silent) are worth testing without a React tree around them.
 *
 * NO `refetchInterval`/polling: drift changes only when someone migrates, which is a deliberate act
 * that reloads this screen anyway. A background poll would add request volume for no new signal.
 */

export interface SchemaStateSectionController {
  /** The one warning to render, or `null` for "confirmed clean" / "not read yet" — distinguish
   *  those two with {@link SchemaStateSectionController.settled}, never by treating `null` alone as
   *  good news. */
  warning: SchemaStateWarning | null;
  /** Whether the first read has finished, either way. Exists so a caller cannot mistake the
   *  pre-read silence for a clean bill of health. */
  settled: boolean;
  /** Bound translator — `key` already resolved against the caller's locale, so `Database.tsx`
   *  never imports `useAdminLocale`/`database-i18n` for this section. */
  t: Translate;
}

export interface SchemaStateSectionDependencies {
  port: SchemaStateSectionPort;
}

/**
 * @param deps Injected dependencies — the `SchemaStateSectionPort` to read drift status through.
 * @returns The resolved warning (or `null`), whether the read has settled, and a bound `t`.
 */
export function useSchemaStateSection(deps: SchemaStateSectionDependencies): SchemaStateSectionController {
  const { port } = deps;
  const locale = useWiredAdminLocale();
  const boundT: Translate = (key: string): string => t(locale, key);

  const query = useFetchQuery({ key: KEYS.schemaState, fetch: () => port.getDatabaseSchemaState() });

  // `query.error` is passed through as a plain presence flag, not as display copy: the user-facing
  // sentence for a failed check comes from `resolveSchemaStateWarning`, which says the same honest
  // thing regardless of WHICH transport error occurred. A raw `describeApiError` string here would
  // put transport vocabulary in front of a non-technical site owner for no added meaning.
  const warning = resolveSchemaStateWarning({
    state: query.data ?? null,
    error: query.error ? "unavailable" : null,
  });

  return { warning, settled: query.status !== "loading", t: boundT };
}

/**
 * Binds the real `/api/.../database/schema-state` client — see
 * `schema-state-section-dependencies.hooks.ts`. The zero-argument half of the pair, so
 * `Database.tsx` composes this and a test composes {@link useSchemaStateSection} with
 * `createFakeSchemaStateSectionPort`.
 *
 * @returns Same controller shape as {@link useSchemaStateSection}, bound to the real port.
 */
export function useWiredSchemaStateSection(): SchemaStateSectionController {
  return useSchemaStateSection({ port: defaultSchemaStateSectionPort });
}
