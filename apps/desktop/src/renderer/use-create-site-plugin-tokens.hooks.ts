import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreateSiteInput, CreatedSiteRecord, TokenSignInPlugin } from '../contracts/project.js';
import { runnerInventoryBridge } from './runner-api.js';

/**
 * @file "+ Create website"'s optional "Connect services" fields (2026-09-29) — the desktop twin of
 * the admin's `features/sites/hooks/use-create-site-plugin-tokens.hooks.ts`, with the same rules:
 * which services are offered comes from Tovu (`listTokenSignInPlugins`, every bundled Agent Plugin
 * that takes a pasted token), nothing here names a vendor, an empty field means "skip", and a typed
 * token is checked by `tovu init` before the site is made.
 *
 * Desktop's own credential discipline applies (see `useCreateWebsiteForm`): the token inputs stay
 * uncontrolled, so React never holds a token in state, and they are cleared the moment the create
 * is sent — whether it then succeeds or fails.
 */

export interface CreateSitePluginTokens {
  /** One field per offered service; empty while loading, or when there are none. */
  plugins: readonly TokenSignInPlugin[];
  /** Ref callback for one service's password input. */
  inputRef: (pluginId: string) => (element: HTMLInputElement | null) => void;
  /** Wraps the form's `onCreate` so the typed tokens ride along (then the inputs are cleared). */
  withTokens: (onCreate: (input: CreateSiteInput) => Promise<void>) => (input: CreateSiteInput) => Promise<void>;
}

/**
 * The typed tokens as `CreateSiteInput.agentPluginTokens`: trimmed, blanks dropped, `undefined` when
 * nothing was typed — so a create with no token sends exactly the input it always did.
 * @complexity O(n) in the offered services.
 */
export function tokensForCreate(values: Readonly<Record<string, string>>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [pluginId, value] of Object.entries(values)) {
    if (value.trim() !== '') out[pluginId] = value.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** `supabase` -> `Supabase`, `my-crm` -> `My Crm` — the same rule Tovu uses for a plugin's name. */
function titleCase(pluginId: string): string {
  return pluginId
    .split(/[-_.]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * The line under "is ready" for tokens given with the create, or `null` when none were.
 * @complexity O(n) in the plugin ids.
 */
export function createdTokensNote(record: Pick<CreatedSiteRecord, 'agentPluginTokens'> | null): string | null {
  const tokens = record?.agentPluginTokens;
  if (!tokens || tokens.pluginIds.length === 0) return null;
  const names = tokens.pluginIds.map(titleCase).join(', ');
  return tokens.status === 'saved'
    ? `${names} will connect when this site first starts.`
    : `${names} couldn't be saved. Open the site and ask its assistant to connect it.`;
}

/** `enabled` follows onboarding availability: hidden fields never contribute tokens to create. */
export function useCreateSitePluginTokens(
  _requiredArgs: Record<string, never> = {},
  { enabled = true }: { enabled?: boolean } = {},
): CreateSitePluginTokens {
  const [plugins, setPlugins] = useState<readonly TokenSignInPlugin[]>([]);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    // Owner 2026-10-06: hidden — do not offer tokens while the service section is unavailable.
    if (!enabled) return;
    let live = true;
    const list = runnerInventoryBridge()?.listTokenSignInPlugins;
    if (!list) return;
    list()
      .then((found) => {
        if (live) setPlugins(found);
      })
      // Main already turns a failure into `[]`; this covers a bridge that rejects anyway.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled]);

  const inputRef = useCallback(
    (pluginId: string) => (element: HTMLInputElement | null) => {
      if (element) inputs.current.set(pluginId, element);
      else inputs.current.delete(pluginId);
    },
    [],
  );

  const withTokens = useCallback(
    (onCreate: (input: CreateSiteInput) => Promise<void>) => (input: CreateSiteInput) => {
      const values: Record<string, string> = {};
      for (const [pluginId, element] of inputs.current) {
        // Hidden means no token is sent, including a ref left over from an earlier render.
        if (enabled) values[pluginId] = element.value;
        element.value = '';
      }
      const agentPluginTokens = tokensForCreate(values);
      return onCreate(agentPluginTokens ? { ...input, agentPluginTokens } : input);
    },
    [enabled],
  );

  return { plugins, inputRef, withTokens };
}
