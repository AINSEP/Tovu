import type { SettingsThemeChoice } from "@jini-ai/ui";
import type { MatchMediaPort } from "@jini-ai/ui/theme";
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useCallback, useEffect, useState } from "react";
import { useAdminBootScope } from "../lib/admin-boot-scope";
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
  type AdminThemeChoice,
  type AdminThemeStoragePort,
} from "./apply";

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

function useStoredSettings(port: AdminThemePort) {
  const { queryScope, checking } = useAdminBootScope();
  const fetchInterface = useCallback(() => port.loadInterface(), [port]);
  const fetchAppearance = useCallback(() => port.loadAppearance(), [port]);
  const interfaceQuery = useFetchQuery({ key: ["settings", INTERFACE_NAMESPACE, queryScope], fetch: fetchInterface }, { enabled: !checking, staleTime: Infinity });
  const appearanceQuery = useFetchQuery({ key: ["settings", APPEARANCE_NAMESPACE, queryScope], fetch: fetchAppearance }, { enabled: !checking, staleTime: Infinity });
  return { interfaceConfig: interfaceQuery.data, appearance: appearanceQuery.data };
}

/**
 * Shell effect: paints the stored choice once both settings have loaded (never the defaults, which
 * would undo the pre-paint bootstrap), and follows the OS while the scheme is "system".
 */
export function useAdminThemeDocument(_required: object, { port = defaultAdminThemePort, env }: { port?: AdminThemePort; env?: AdminThemeDocumentEnv } = {}): void {
  const { interfaceConfig, appearance } = useStoredSettings(port);
  const themeId = interfaceConfig?.adminTheme;
  const preference = appearance?.theme;
  useEffect(() => {
    if (themeId === undefined || preference === undefined) return;
    const resolved = env ?? browserEnv();
    const paint = () => paintAdminTheme({ choice: { themeId, preference } }, resolved);
    paint();
    if (preference !== "system" || !resolved.matchMedia) return;
    const media = resolved.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener?.("change", paint);
    return () => media.removeEventListener?.("change", paint);
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

/**
 * Page controller: a click repaints at once, then saves. The pending value shows until the refetch
 * confirms it; a failed save restores the stored choice and reports the error.
 */
export function useAdminThemePicker(_required: object, { port = defaultAdminThemePort, env }: { port?: AdminThemePort; env?: AdminThemeDocumentEnv } = {}): AdminThemePicker {
  const { interfaceConfig, appearance } = useStoredSettings(port);
  const invalidate = useInvalidate();
  const [pending, setPending] = useState<Partial<AdminThemeChoice>>({});
  const [error, setError] = useState<string | null>(null);
  const themeId = pending.themeId ?? interfaceConfig?.adminTheme;
  const preference = pending.preference ?? appearance?.theme;
  const ready = interfaceConfig !== undefined && appearance !== undefined;

  const commit = (next: AdminThemeChoice, save: () => Promise<unknown>, namespace: string, field: keyof AdminThemeChoice) => {
    setError(null);
    setPending((current) => ({ ...current, [field]: next[field] }));
    paintAdminTheme({ choice: next }, env ?? browserEnv());
    save()
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setPending((current) => withoutField(current, field));
        if (interfaceConfig && appearance) paintAdminTheme({ choice: { themeId: interfaceConfig.adminTheme, preference: appearance.theme } }, env ?? browserEnv());
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
      commit({ themeId: nextId, preference }, () => port.saveInterface({ ...interfaceConfig, adminTheme: nextId }, interfaceConfig), INTERFACE_NAMESPACE, "themeId");
    },
    selectPreference: (nextPreference) => {
      if (!interfaceConfig || !appearance || themeId === undefined || nextPreference === preference) return;
      commit({ themeId, preference: nextPreference }, () => port.saveAppearance({ ...appearance, theme: nextPreference }, appearance), APPEARANCE_NAMESPACE, "preference");
    },
  };
}
