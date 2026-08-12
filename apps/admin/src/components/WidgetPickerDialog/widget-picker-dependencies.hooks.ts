import { api, type AdminWidget } from "../../lib/api";
import type { WidgetPickerPort } from "./widget-picker-port.hooks";

/**
 * @file The only place under `components/WidgetPickerDialog` that reaches `lib/api` — see
 * `widget-picker-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultWidgetPickerPort: WidgetPickerPort = {
  listWidgets: (options) => api.listWidgets(options),
  createWidget: (input) => api.createWidget(input),
};

/** Seed state for {@link createFakeWidgetPickerPort}. */
export interface FakeWidgetPickerPortOptions {
  widgets?: AdminWidget[];
  /** When set, `createWidget()` rejects with this instead of resolving — for create-failure
   *  tests. */
  createError?: Error;
}

/**
 * An in-memory {@link WidgetPickerPort} for tests — lets a test describe "these widgets already
 * exist" directly, instead of stubbing global `fetch`. Shipped alongside the real binding per the
 * pattern's "every port gets a fake" rule.
 */
export function createFakeWidgetPickerPort(options: FakeWidgetPickerPortOptions = {}): WidgetPickerPort & {
  /** Every widget currently in the fake's store, in list order. */
  readonly widgets: AdminWidget[];
} {
  const widgets = [...(options.widgets ?? [])];

  return {
    widgets,
    async listWidgets({ widgetType }) {
      return { widgets: widgets.filter((w) => w.widgetType === widgetType && w.status === "active") };
    },
    async createWidget(input) {
      if (options.createError) throw options.createError;
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
  };
}
