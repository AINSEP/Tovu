import type {
  AdminRedirect,
  AdminRedirectHitStats,
  AdminRedirectImportResponse,
  RedirectImportRule,
} from "@/lib/api";

/**
 * @file What this feature's three hooks (`use-redirects`, `use-hit-count-cell`,
 * `use-import-redirects-form`) need from the outside world, as an interface rather than a direct
 * `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace): this file declares, `redirects-dependencies.hooks.ts`
 * binds the real `api` client, and nothing else under `features/redirects` imports `lib/api` for
 * these six routes. One shared port rather than one per hook — all three hooks read the same
 * `/redirects` resource and a test double for one is a test double for the resource, not for a
 * single screen.
 *
 * `describeApiError` (used by `use-import-redirects-form.hooks.ts`) is deliberately NOT part of this
 * port: it is a pure error-message rule with no I/O, and per the pattern a hook imports rules
 * directly rather than having them injected — see `assistant-chats-port.hooks.ts`'s own "what is
 * deliberately NOT in this port" section for the identical reasoning about `persistableMessages`.
 */
export interface RedirectsPort {
  listRedirects(): Promise<{ data: AdminRedirect[] }>;
  createRedirect(
    input: { matchType: string; fromPattern: string; toTarget: string; statusCode: number },
    options?: { override?: boolean; priority?: number }
  ): Promise<{ data: AdminRedirect }>;
  updateRedirect(
    target: { id: string },
    options?: Partial<{
      matchType: string;
      fromPattern: string;
      toTarget: string;
      statusCode: number;
      status: string;
      override: boolean;
      priority: number;
    }>
  ): Promise<{ data: AdminRedirect }>;
  tombstoneRedirect(id: string): Promise<{ data: AdminRedirect }>;
  getRedirectHits(id: string): Promise<{ data: AdminRedirectHitStats }>;
  importRedirects(rules: RedirectImportRule[]): Promise<AdminRedirectImportResponse>;
}
