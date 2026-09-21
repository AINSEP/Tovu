import { api, type AdminWidget } from "@/lib/api";
import type { WidgetsPort } from "./widgets-port.hooks";

/**
 * @file The only place under `features/widgets` that reaches `lib/api` for the six `WidgetsPort`
 * (widget-instance) routes — see `widgets-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultWidgetsPort: WidgetsPort = {
  listWidgets: (options) => api.listWidgets(options),
  getWidget: (id) => api.getWidget(id),
  createWidget: (input) => api.createWidget(input),
  updateWidget: (target) => api.updateWidget(target),
  trashWidget: (id) => api.trashWidget(id),
  purgeWidget: (target, options) => api.purgeWidget(target, options),
};

/** Seed state for {@link createFakeWidgetsPort}. */
export interface FakeWidgetsPortOptions {
  widgets?: AdminWidget[];
  skippedCount?: number;
  whereUsed?: Record<string, { count: number; references: Array<{ kind: "region" | "embed"; sourceEntryId: string; fieldPath: string }> }>;
  /** Lets a test force a specific `purgeWidget` outcome (e.g. throw a `WIDGETS_REFERENCED`
   *  `ApiError`) without the fake having to reimplement the server's own reference-tracking. */
  onPurge?: (id: string, options: { force?: boolean }) => void;
}

/**
 * An in-memory {@link WidgetsPort} for tests — lets a test describe "the library has these two
 * widgets" directly, instead of hand-building `Response` objects and stubbing global `fetch`.
 * Shipped alongside the real binding per the pattern's "every port gets a fake" rule.
 */
export function createFakeWidgetsPort(options: FakeWidgetsPortOptions = {}): WidgetsPort & {
  /** Every widget currently in the fake's store, in list order. */
  readonly widgets: AdminWidget[];
} {
  const widgets = [...(options.widgets ?? [])];

  return {
    widgets,

    async listWidgets(listOptions = {}) {
      const filtered = widgets.filter((w) => {
        if (listOptions.widgetType && w.widgetType !== listOptions.widgetType) return false;
        if (!listOptions.includeInactive && w.status !== "active") return false;
        return true;
      });
      return { widgets: filtered, skippedCount: options.skippedCount };
    },

    async getWidget(id) {
      const widget = widgets.find((w) => w.id === id);
      if (!widget) throw new Error(`fake widget not found: ${id}`);
      return { widget, whereUsed: options.whereUsed?.[id] ?? { count: 0, references: [] } };
    },

    async createWidget(input) {
      const created: AdminWidget = {
        id: `fake-${widgets.length + 1}`,
        workspaceId: "fake-ws",
        slug: `fake-slug-${widgets.length + 1}`,
        title: input.title,
        status: "active",
        widgetType: input.widgetType,
        config: input.config,
        updatedAt: new Date(0).toISOString(),
        version: 1,
      };
      widgets.push(created);
      return { widget: created };
    },

    async updateWidget({ id, config, title }) {
      const index = widgets.findIndex((w) => w.id === id);
      if (index < 0) throw new Error(`fake widget not found: ${id}`);
      const updated: AdminWidget = { ...widgets[index]!, config, title: title ?? widgets[index]!.title, version: widgets[index]!.version + 1 };
      widgets[index] = updated;
      return { widget: updated };
    },

    async trashWidget(id) {
      const index = widgets.findIndex((w) => w.id === id);
      if (index < 0) throw new Error(`fake widget not found: ${id}`);
      const trashed: AdminWidget = { ...widgets[index]!, status: "trash" };
      widgets[index] = trashed;
      return { widget: trashed };
    },

    async purgeWidget({ id }, purgeOptions = {}) {
      options.onPurge?.(id, purgeOptions);
      const index = widgets.findIndex((w) => w.id === id);
      if (index < 0) throw new Error(`fake widget not found: ${id}`);
      widgets[index] = { ...widgets[index]!, status: "purged" };
      return { purged: true };
    },
  };
}
