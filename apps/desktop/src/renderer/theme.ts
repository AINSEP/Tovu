/**
 * @file The desktop shell's theme wiring: the storage key, the default and the browser ports this
 * app injects into Jini's `useThemePreference` (which owns the resolve/apply/persist behaviour).
 */
import { useMemo } from 'react';
import { useThemePreference, type ThemePreferencePorts } from '@jini-ai/ui/app-shell';
import type { ColorSchemePreference } from '@jini-ai/ui/theme';

const STORAGE_KEY = 'tovu-runner.theme';

/**
 * Default is `light`, not `system`. Runner is early enough that most of what gets
 * looked at is being designed, and a fixed starting point makes "does this look
 * right" answerable without first asking what the OS is set to. `system` is one
 * click away for anyone who wants it.
 */
const DEFAULT: ColorSchemePreference = 'light';

/** The persisted theme preference, applied to `<html>` as `data-theme` and `color-scheme`. */
export function useTheme(): [ColorSchemePreference, (next: ColorSchemePreference) => void] {
  // Read once per mount: the ports are effect dependencies, so they must stay the same objects.
  const ports = useMemo((): ThemePreferencePorts => ({
    storage: localStorage,
    storageKey: STORAGE_KEY,
    defaultPreference: DEFAULT,
    matchMedia: (query) => window.matchMedia(query),
    root: document.documentElement,
  }), []);
  return useThemePreference(ports);
}
