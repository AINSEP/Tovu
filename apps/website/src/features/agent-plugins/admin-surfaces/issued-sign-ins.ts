import { AsyncLocalStorage } from "node:async_hooks";

import { isHostedSignInLinkPath } from "../../../contracts/core/hosted-sign-in-links.js";

/**
 * @file The per-request registry of sign-in links this host issued while running one admin-surface
 * action, so the admin route can hand the HOST PAGE exactly those links to open.
 *
 * Why: the plugin's frame is sandboxed without `allow-popups`, so it cannot open a sign-in itself,
 * and the host page must never open a URL a plugin made up (an open redirect or phishing page under
 * the admin's trust). The connections port reports every authorization URL it issued here; the
 * route collects them around the dispatch (AsyncLocalStorage keeps concurrent requests apart) and
 * returns them beside the plugin's answer. Only https links and the host's own sign-in links are kept.
 */

/** One link the host page may offer: the host's own authorization URL and when its attempt expires. */
export interface HostSignInLink {
  readonly authorizationUrl: string;
  readonly expiresAt: string;
}

export interface IssuedSignInCollector {
  /** Called by the connections port for each issued sign-in; outside a collection it is a no-op. */
  record(required: HostSignInLink, optional?: Record<string, never>): void;
  /** Runs one action and returns what it issued. */
  collect<T>(required: { readonly run: () => Promise<T> }, optional?: Record<string, never>): Promise<{ readonly value: T; readonly signIns: readonly HostSignInLink[] }>;
}

/** @complexity O(1) per record; collect adds O(1) around the run. */
export function createIssuedSignInCollector(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): IssuedSignInCollector {
  const current = new AsyncLocalStorage<HostSignInLink[]>();
  return {
    record({ authorizationUrl, expiresAt }) {
      const url = URL.parse(authorizationUrl);
      // The host's own sign-in link follows the site's scheme; a provider URL must be https.
      if (url && (url.protocol === "https:" || (url.protocol === "http:" && isHostedSignInLinkPath({ pathname: url.pathname })))) current.getStore()?.push({ authorizationUrl, expiresAt });
    },
    async collect({ run }) {
      const signIns: HostSignInLink[] = [];
      const value = await current.run(signIns, run);
      return { value, signIns };
    },
  };
}
