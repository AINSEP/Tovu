import type { SettingsThemeChoice } from "@jini-ai/ui";
import type { MatchMediaPort } from "@jini-ai/ui/theme";
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useAdminBootScope } from "../lib/admin-boot-scope";
import { useAdminAppearanceSnapshot } from "../hooks/use-admin-appearance-snapshot.hooks";
import {
  APPEARANCE_NAMESPACE,
  INTERFACE_NAMESPACE,
  loadAppearance,
  loadInterface,
  saveAppearance,
  saveInterface,
  type AppearanceConfig,
  type InterfaceConfig,
} from "../lib/settings-tabs";
import {
  applyAdminThemeToDocument,
  rememberAdminThemeChoice,
  resolveAdminThemeDocument,
  resolveAdminThemeBoundary,
  type AdminThemeChoice,
  type AdminThemeStoragePort,
} from "./apply";
import { findAdminTheme } from "./registry";

/**
 * @file The admin theme as React state. The theme id is `core.interface.adminTheme`; the scheme is
 * the existing per-operator `core.appearance.theme` (the same setting Settings → Appearance writes),
 * so both screens drive one value. Both reads reuse the shell's own query keys and loaders
 * (`useInterfacePreferences`, `useAdminAppearance`), so they add no boot request.
 */

export interface AdminThemePort {
  loadInterface(): Promise<InterfaceConfig>;
  loadAppearance(): Promise<AppearanceConfig>;
  saveInterface(next: InterfaceConfig, previous: InterfaceConfig): Promise<readonly string[]>;
  saveAppearance(next: AppearanceConfig, previous: AppearanceConfig): Promise<readonly string[]>;
}

export const defaultAdminThemePort: AdminThemePort = { loadInterface, loadAppearance, saveInterface, saveAppearance };

export interface AdminThemeDocumentEnv {
  root: HTMLElement;
  matchMedia?: MatchMediaPort;
  storage?: AdminThemeStoragePort;
}

/** Follow the already-painted document, including optimistic picks and OS scheme changes.
 * No settings reads: the shell remains the single persistence/controller owner.
 * @complexity O(t) for the bounded installed-theme registry; O(1) observer storage. */
export function useAdminThemeState(_required: object, { root = document.documentElement }: { root?: HTMLElement } = {}) {
  const subscribe = useCallback((notify: () => void) => {
    const observer = new MutationObserver(notify);
    observer.observe(root, { attributes: true, attributeFilter: ["data-admin-theme", "data-color-scheme", "data-theme"] });
    return () => observer.disconnect();
  }, [root]);
  const snapshot = useCallback(() => {
    const themeId = findAdminTheme({ id: root.getAttribute("data-admin-theme") ?? "classic" }).id;
    const scheme = root.getAttribute("data-color-scheme") ?? root.getAttribute("data-theme");
    return `${themeId}/${scheme === "dark" ? "dark" : "light"}`;
  }, [root]);
  const value = useSyncExternalStore(subscribe, snapshot, () => "classic/light");
  const [themeId, scheme] = value.split("/");
  return { themeId: themeId!, scheme: scheme as "light" | "dark" };
}

/** The shared compatibility boundary for screens whose Classic dark paint is unverified. */
export function useAdminThemeBoundary(required: object, optional: { root?: HTMLElement } = {}) {
  return resolveAdminThemeBoundary({ state: useAdminThemeState(required, optional) }, {});
}

function browserEnv(): AdminThemeDocumentEnv {
  return {
    root: document.documentElement,
    matchMedia: typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : undefined,
    storage: safeLocalStorage(),
  };
}

function safeLocalStorage(): AdminThemeStoragePort | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Resolve, paint and remember one choice. */
export function paintAdminTheme({ choice }: { choice: AdminThemeChoice }, env: AdminThemeDocumentEnv): void {
  applyAdminThemeToDocument({ state: resolveAdminThemeDocument({ choice }, { matchMedia: env.matchMedia }) }, { root: env.root });
  rememberAdminThemeChoice({ choice }, { storage: env.storage });
}

/** Share the shell's versioned appearance snapshot; no observer may bypass preview ordering. */
function useStoredSettings({ port, root }: { port: AdminThemePort; root: HTMLElement }, _optional: object = {}) {
  const { queryScope, checking } = useAdminBootScope();
  const fetchInterface = useCallback(() => port.loadInterface(), [port]);
  const interfaceQuery = useFetchQuery({ key: ["settings", INTERFACE_NAMESPACE, queryScope], fetch: fetchInterface }, { enabled: !checking, staleTime: Infinity });
  const appearanceQuery = useAdminAppearanceSnapshot({ port }, { root });
  return { interfaceConfig: interfaceQuery.data, appearance: appearanceQuery.data?.appearance };
}

/**
 * Shell effect: paints the stored choice once both settings have loaded (never the defaults, which
 * would undo the pre-paint bootstrap), and follows the OS while the scheme is "system".
 */
export function useAdminThemeDocument(_required: object, { port = defaultAdminThemePort, env }: { port?: AdminThemePort; env?: AdminThemeDocumentEnv } = {}): void {
  const { interfaceConfig, appearance } = useStoredSettings({ port, root: env?.root ?? document.documentElement }, {});
  const themeId = interfaceConfig?.adminTheme;
  const preference = appearance?.theme;
  useEffect(() => {
    if (themeId === undefined || preference === undefined) return undefined;
    const resolved = env ?? browserEnv();
    const paint = () => paintAdminTheme({ choice: { themeId, preference } }, resolved);
    paint();
    if (preference !== "system" || !resolved.matchMedia) return undefined;
    const media = resolved.matchMedia("(prefers-color-scheme: dark)");
    // A partial host port must not open a subscription it cannot dispose.
    if (!media.removeEventListener) return undefined;
    media.addEventListener?.("change", paint);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", paint);
    };
  }, [themeId, preference, env]);
}

export interface AdminThemePicker {
  /** False until both settings have loaded; the controls stay disabled meanwhile. */
  ready: boolean;
  themeId: string | undefined;
  preference: SettingsThemeChoice | undefined;
  error: string | null;
  selectTheme(themeId: string): void;
  selectPreference(preference: SettingsThemeChoice): void;
}

function withoutField(choice: Partial<AdminThemeChoice>, field: keyof AdminThemeChoice): Partial<AdminThemeChoice> {
  const { [field]: _dropped, ...rest } = choice;
  return rest;
}

/** Resolve pending overrides, stored values and readiness for the picker. */
function resolvePickerValues(
  { pending, interfaceConfig, appearance }: {
    pending: Partial<AdminThemeChoice>;
    interfaceConfig: InterfaceConfig | undefined;
    appearance: AppearanceConfig | undefined;
  },
  _optional: object = {},
): Pick<AdminThemePicker, "themeId" | "preference" | "ready"> {
  return {
    themeId: pending.themeId ?? interfaceConfig?.adminTheme,
    preference: pending.preference ?? appearance?.theme,
    ready: interfaceConfig !== undefined && appearance !== undefined,
  };
}

/**
 * Page controller: a click repaints at once, then saves. The pending value shows until the refetch
 * confirms it; a failed save restores the stored choice and reports the error.
 */
export function useAdminThemePicker(_required: object, { port = defaultAdminThemePort, env }: { port?: AdminThemePort; env?: AdminThemeDocumentEnv } = {}): AdminThemePicker {
  const { interfaceConfig, appearance } = useStoredSettings({ port, root: env?.root ?? document.documentElement }, {});
  const invalidate = useInvalidate();
  const [pending, setPending] = useState<Partial<AdminThemeChoice>>({});
  const [error, setError] = useState<string | null>(null);
  const { themeId, preference, ready } = resolvePickerValues({ pending, interfaceConfig, appearance }, {});

  // `stored` is the loaded choice a failed save restores. Both callers only commit once both
  // settings have loaded, so they hand it in rather than this re-checking `interfaceConfig &&
  // appearance` inside the rejection handler, where that check could never be false.
  const commit = (
    { next, stored, save, namespace, field }: {
      next: AdminThemeChoice; stored: AdminThemeChoice; save: () => Promise<unknown>; namespace: string; field: keyof AdminThemeChoice;
    },
  ) => {
    const paintEnv = env ?? browserEnv();
    setError(null);
    setPending((current) => ({ ...current, [field]: next[field] }));
    paintAdminTheme({ choice: next }, paintEnv);
    save()
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setPending((current) => withoutField(current, field));
        paintAdminTheme({ choice: stored }, paintEnv);
      })
      .finally(() => invalidate({ key: ["settings", namespace] }));
  };

  // Drop a pending value once the refetched setting agrees, so the card never flicks back.
  const storedThemeId = interfaceConfig?.adminTheme;
  const storedPreference = appearance?.theme;
  useEffect(() => {
    setPending((current) => {
      let next = current;
      if (next.themeId !== undefined && next.themeId === storedThemeId) next = withoutField(next, "themeId");
      if (next.preference !== undefined && next.preference === storedPreference) next = withoutField(next, "preference");
      return next;
    });
  }, [storedThemeId, storedPreference]);

  return {
    ready,
    themeId,
    preference,
    error,
    selectTheme: (nextId) => {
      if (!interfaceConfig || !appearance || preference === undefined || nextId === themeId) return;
      commit({
        next: { themeId: nextId, preference },
        stored: { themeId: interfaceConfig.adminTheme, preference: appearance.theme },
        save: () => port.saveInterface({ ...interfaceConfig, adminTheme: nextId }, interfaceConfig),
        namespace: INTERFACE_NAMESPACE,
        field: "themeId",
      });
    },
    selectPreference: (nextPreference) => {
      if (!interfaceConfig || !appearance || themeId === undefined || nextPreference === preference) return;
      commit({
        next: { themeId, preference: nextPreference },
        stored: { themeId: interfaceConfig.adminTheme, preference: appearance.theme },
        save: () => port.saveAppearance({ ...appearance, theme: nextPreference }, appearance),
        namespace: APPEARANCE_NAMESPACE,
        field: "preference",
      });
    },
  };
}
