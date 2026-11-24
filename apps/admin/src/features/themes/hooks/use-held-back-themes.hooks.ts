import { useConfirmRequest, type ConfirmDialogProps } from "@jini-ai/admin/react";
import { interpolate, type Translate } from "@jini-ai/core/text";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ChosenThemeHeldBack, HeldBackCheckResult, HeldBackTheme } from "../api/held-back-themes-api";
import { ApiError } from "../../../lib/admin-http/request";
import { heldBackFailure, isSectionUnavailable, type HeldBackFailure } from "../held-back-themes-failure";
import { defaultHeldBackThemesPort } from "./held-back-themes-dependencies.hooks";
import type { HeldBackThemesPort } from "./held-back-themes-port.hooks";

/**
 * @file Everything the "Held back on import" section does (A452), so `HeldBackThemes.tsx` is markup.
 *
 * The flow: load the list; per row, `check` re-runs the server's safety checks and keeps the answer
 * (with its digest); `requestRestore` opens the approval card and only on accept sends the digest
 * the check returned — the server refuses a theme whose files changed since. A restore moves the
 * theme to its live place (never activates it), so on success the list reloads and `onRestored`
 * lets the Themes screen rescan so the new card appears.
 */

export type HeldBackRowPhase = "idle" | "checking" | "checked" | "restoring";

/** One row's transient state, kept apart from the (server-owned) theme record. */
export interface HeldBackRowState {
  phase: HeldBackRowPhase;
  /** The last passing-or-failing check; cleared whenever a refusal makes it stale. */
  check: HeldBackCheckResult | null;
  /** Why the last check or restore did not go through, or `null`. */
  failure: HeldBackFailure | null;
}

export interface HeldBackThemesController {
  /** `hidden` = 403/404 on the list (no permission, or an older server): the section is not drawn. */
  status: "loading" | "ready" | "error" | "hidden";
  listFailure: HeldBackFailure | null;
  themes: HeldBackTheme[];
  chosenThemeHeldBack: ChosenThemeHeldBack | null;
  /** By theme id; a missing entry means {@link IDLE_ROW}. */
  rows: Record<string, HeldBackRowState>;
  /** "Restored …" after a successful restore, or `null`. */
  restoredNotice: string | null;
  /** Props for the section's one always-mounted `ConfirmDialog`. */
  dialog: ConfirmDialogProps;
  retry: () => Promise<void>;
  check: (required: { themeId: string }) => Promise<void>;
  requestRestore: (required: { themeId: string }) => Promise<void>;
  dismissRestoredNotice: () => void;
}

/** The hook as the Themes screen injects it. */
export type UseHeldBackThemesHook = (required: { t: Translate; onRestored: () => void }) => HeldBackThemesController;

export const IDLE_ROW: HeldBackRowState = { phase: "idle", check: null, failure: null };

type ListState = Pick<HeldBackThemesController, "status" | "listFailure" | "themes" | "chosenThemeHeldBack">;
const LOADING: ListState = { status: "loading", listFailure: null, themes: [], chosenThemeHeldBack: null };

/** Drops row state for themes the server no longer holds (restored, or removed some other way). */
function pruneRows({ rows, themes }: { rows: Record<string, HeldBackRowState>; themes: HeldBackTheme[] }, _optional = {}): Record<string, HeldBackRowState> {
  const held = new Set(themes.map((theme) => theme.id));
  return Object.fromEntries(Object.entries(rows).filter(([themeId]) => held.has(themeId)));
}

/** Whether a rejection says the theme has left quarantine, so the list is stale. */
function isGone({ error }: { error: unknown }, _optional = {}): boolean {
  return error instanceof ApiError && error.code === "HELD_BACK_NOT_FOUND";
}

/**
 * The list query: state plus a `load` that replaces it. Reads `t` through a ref so a translator that
 * changes identity per render cannot re-fire the load effect.
 * @complexity O(themes) per load.
 */
function useHeldBackList(
  { port, tRef, onLoaded }: { port: HeldBackThemesPort; tRef: { current: Translate }; onLoaded: (themes: HeldBackTheme[]) => void },
  _optional = {},
) {
  const [list, setList] = useState<ListState>(LOADING);
  const load = useCallback(async () => {
    try {
      const { themes, chosenThemeHeldBack } = await port.list();
      setList({ status: "ready", listFailure: null, themes, chosenThemeHeldBack });
      onLoaded(themes);
    } catch (error) {
      setList(isSectionUnavailable({ error })
        ? { ...LOADING, status: "hidden" }
        : { ...LOADING, status: "error", listFailure: heldBackFailure({ error, fallbackKey: "failed to load held-back themes", t: tRef.current }) });
    }
  }, [port, tRef, onLoaded]);
  useEffect(() => { void load(); }, [load]);
  return { list, load };
}

/**
 * @param required.port - The held-back-themes routes (see `held-back-themes-port.hooks.ts`).
 * @param required.t - Bound Themes translator.
 * @param required.onRestored - Called after a successful restore, once the list has reloaded.
 * @param optional.useConfirmation - Seam for Jini's `useConfirmRequest`; defaults to it.
 * @complexity O(themes) state; at most one approval dialog open (a second request denies the first).
 */
export function useHeldBackThemes(
  required: { port: HeldBackThemesPort; t: Translate; onRestored: () => void },
  optional: { useConfirmation?: typeof useConfirmRequest } = {},
): HeldBackThemesController {
  const { port } = required;
  const tRef = useRef(required.t);
  tRef.current = required.t;
  const onRestoredRef = useRef(required.onRestored);
  onRestoredRef.current = required.onRestored;
  const approval = (optional.useConfirmation ?? useConfirmRequest)({});
  const [rows, setRows] = useState<Record<string, HeldBackRowState>>({});
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);
  const onLoaded = useCallback((themes: HeldBackTheme[]) => setRows((previous) => pruneRows({ rows: previous, themes })), []);
  const { list, load } = useHeldBackList({ port, tRef, onLoaded });

  const patchRow = (themeId: string, patch: Partial<HeldBackRowState>) =>
    setRows((previous) => ({ ...previous, [themeId]: { ...(previous[themeId] ?? IDLE_ROW), ...patch } }));

  /** A refusal makes the stored check stale, so the row goes back to "Check" with the reason shown. */
  function refuse({ themeId, error, fallbackKey }: { themeId: string; error: unknown; fallbackKey: string }) {
    patchRow(themeId, { phase: "idle", check: null, failure: heldBackFailure({ error, fallbackKey, t: tRef.current }) });
    if (isGone({ error })) void load();
  }

  async function check({ themeId }: { themeId: string }) {
    patchRow(themeId, { phase: "checking", failure: null });
    try {
      patchRow(themeId, { phase: "checked", check: await port.check({ themeId }), failure: null });
    } catch (error) {
      refuse({ themeId, error, fallbackKey: "failed to check theme" });
    }
  }

  async function restore({ themeId, name, approvedDigest }: { themeId: string; name: string; approvedDigest: string }) {
    patchRow(themeId, { phase: "restoring", failure: null });
    try {
      await port.restore({ themeId, approvedDigest });
    } catch (error) {
      refuse({ themeId, error, fallbackKey: "failed to restore theme" });
      return;
    }
    setRestoredNotice(interpolate({ template: tRef.current("Restored \"{name}\". It is switched off until you activate it."), vars: { name } }));
    await load();
    onRestoredRef.current();
  }

  async function requestRestore({ themeId }: { themeId: string }) {
    const checked = rows[themeId]?.check;
    // No passing, name-free check means no digest to approve: nothing to ask the owner about.
    if (!checked?.passes || !checked.digest || checked.nameTaken) return;
    const name = list.themes.find((theme) => theme.id === themeId)?.name ?? themeId;
    const t = tRef.current;
    const accepted = await approval.confirm({
      dialog: {
        title: interpolate({ template: t("Restore {name}?"), vars: { name } }),
        body: t("It becomes a normal theme and stays switched off until you activate it. Nothing is deleted."),
        confirmLabel: t("Restore"),
      },
    });
    if (accepted) await restore({ themeId, name, approvedDigest: checked.digest });
  }

  return {
    ...list,
    rows,
    restoredNotice,
    dialog: approval.dialog,
    retry: async () => { setRestoredNotice(null); await load(); },
    check,
    requestRestore,
    dismissRestoredNotice: () => setRestoredNotice(null),
  };
}

/** The live hook: the real port, bound to the Themes screen's translator and rescan. */
export function useWiredHeldBackThemes({ t, onRestored }: { t: Translate; onRestored: () => void }, _optional = {}): HeldBackThemesController {
  return useHeldBackThemes({ port: defaultHeldBackThemesPort, t, onRestored });
}
