import {
  api,
  type AdminRedirect,
  type AdminRedirectHitStats,
  type AdminRedirectImportResponse,
  type RedirectImportRule,
} from "@/lib/api";
import type { RedirectsPort } from "./redirects-port.hooks";

/**
 * @file The only place under `features/redirects` that reaches `lib/api` — see
 * `redirects-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `assistant-chats-dependencies
 *  .hooks.ts`'s `defaultAssistantChatsPort`. Each method wraps its `api` counterpart explicitly
 *  rather than pointing at it directly, so a route's default-parameter shape (`createRedirect`'s
 *  `options = {}`, `updateRedirect`'s `options = {}`) stays `lib/api.ts`'s to own. */
export const defaultRedirectsPort: RedirectsPort = {
  listRedirects: () => api.listRedirects(),
  createRedirect: (input, options) => api.createRedirect(input, options),
  updateRedirect: (target, options) => api.updateRedirect(target, options),
  tombstoneRedirect: (id) => api.tombstoneRedirect(id),
  getRedirectHits: (id) => api.getRedirectHits(id),
  importRedirects: (rules) => api.importRedirects(rules),
};

/** Seed state for {@link createFakeRedirectsPort}. */
export interface FakeRedirectsPortOptions {
  redirects?: AdminRedirect[];
  hits?: Record<string, AdminRedirectHitStats>;
  onImport?: (rules: RedirectImportRule[]) => AdminRedirectImportResponse | undefined;
}

/**
 * An in-memory {@link RedirectsPort} for tests — the fake that lets a test describe "the list has
 * these two rules" or "importing this batch fails item 2" directly, instead of hand-building
 * `Response` objects and stubbing global `fetch`. Shipped alongside the real binding per the
 * pattern's "every port gets a fake" rule (see `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeRedirectsPort(options: FakeRedirectsPortOptions = {}): RedirectsPort & {
  /** Every rule currently in the fake's store, in list order. */
  readonly rules: AdminRedirect[];
} {
  const rules = [...(options.redirects ?? [])];
  const hits = new Map(Object.entries(options.hits ?? {}));

  return {
    rules,

    async listRedirects() {
      return { data: [...rules] };
    },

    async createRedirect(input, opts = {}) {
      const created: AdminRedirect = {
        id: `fake-${rules.length + 1}`,
        workspaceId: "fake-ws",
        matchType: input.matchType,
        fromPattern: input.fromPattern,
        toTarget: input.toTarget,
        statusCode: input.statusCode,
        status: "active",
        override: opts.override ?? false,
        priority: opts.priority ?? 0,
        source: "manual",
        sourceEntryId: null,
        fromPathAtCapture: null,
        toPathAtCapture: null,
        createdByPrincipal: "fake-principal",
        createdByPluginId: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        version: 1,
      };
      rules.push(created);
      return { data: created };
    },

    async updateRedirect({ id }, opts = {}) {
      const index = rules.findIndex((rule) => rule.id === id);
      if (index < 0) throw new Error(`fake redirect not found: ${id}`);
      const updated = { ...rules[index]!, ...opts };
      rules[index] = updated;
      return { data: updated };
    },

    async tombstoneRedirect(id) {
      const index = rules.findIndex((rule) => rule.id === id);
      if (index < 0) throw new Error(`fake redirect not found: ${id}`);
      const [removed] = rules.splice(index, 1);
      return { data: removed! };
    },

    async getRedirectHits(id) {
      return {
        data: hits.get(id) ?? { redirectId: id, workspaceId: "fake-ws", hitCount: 0, lastHitAt: null },
      };
    },

    async importRedirects(importedRules) {
      const override = options.onImport?.(importedRules);
      if (override) return override;
      const created = importedRules.map((rule, index) => ({
        id: `fake-import-${index}`,
        workspaceId: "fake-ws",
        matchType: rule.matchType,
        fromPattern: rule.fromPattern,
        toTarget: rule.toTarget,
        statusCode: rule.statusCode,
        status: "active",
        override: rule.override ?? false,
        priority: rule.priority ?? 0,
        source: "import" as const,
        sourceEntryId: null,
        fromPathAtCapture: null,
        toPathAtCapture: null,
        createdByPrincipal: "fake-principal",
        createdByPluginId: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        version: 1,
      }));
      rules.push(...created);
      return { created, failed: [] };
    },
  };
}
