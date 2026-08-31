import { api } from "@/lib/api";
import type { ThemeExploreFileEntry, ThemeExplorePort } from "./theme-explore-port.hooks";

/**
 * @file The only place under `features/themes` that reaches `lib/api` for the six
 * `ThemeExplorePort` routes — see `theme-explore-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. Each method narrows the real route's wider response down
 *  to what the port declares (see `theme-explore-port.hooks.ts`'s own doc comment on why). */
export const defaultThemeExplorePort: ThemeExplorePort = {
  getThemeDetail: (themeId) => api.getThemeDetail(themeId),
  getThemeFile: (themeId, path) => api.getThemeFile(themeId, path),
  putThemeFile: (themeId, path, content) => api.putThemeFile(themeId, path, content),
  resetThemeFile: (themeId, path) => api.resetThemeFile(themeId, path),
  renameThemeFile: (themeId, path, name) => api.renameThemeFile(themeId, path, name),
  copyThemeFile: (themeId, path) => api.copyThemeFile(themeId, path),
  deleteThemeFile: (themeId, path) => api.deleteThemeFile(themeId, path),
  setPagePublished: (themeId, page, published) => api.setThemePagePublished(themeId, page, published),
};

/** Seed state for {@link createFakeThemeExplorePort}. */
export interface FakeThemeExplorePortOptions {
  detail?: {
    id: string;
    name: string;
    tier: string;
    apiVersion?: 2;
    status: string;
    errors: string[];
    lineage: { from?: string; tier?: string; version?: string; catalog?: string } | null;
    hasOriginal: boolean;
  };
  files?: ThemeExploreFileEntry[];
  /** File contents keyed by path — what `getThemeFile`/successful saves/resets resolve to. */
  contents?: Record<string, string>;
}

/**
 * An in-memory {@link ThemeExplorePort} for tests — lets a test describe "this theme has these
 * files, this one has this source" directly, instead of hand-building `Response` objects and
 * stubbing global `fetch`. Shipped alongside the real binding per the pattern's "every port gets a
 * fake" rule.
 */
export function createFakeThemeExplorePort(options: FakeThemeExplorePortOptions = {}): ThemeExplorePort {
  const detail = options.detail ?? { id: "basic", name: "Basic", tier: "declarative", status: "active", errors: [], lineage: null, hasOriginal: true };
  let files = [...(options.files ?? [{ path: "pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true }])];
  const contents = new Map(Object.entries(options.contents ?? { "pages/index.html": "<html></html>" }));

  return {
    async getThemeDetail() {
      return { ...detail, files: [...files] };
    },

    async getThemeFile(_themeId, path) {
      const content = contents.get(path);
      if (content === undefined) throw new Error(`fake theme file not found: ${path}`);
      return { content };
    },

    async putThemeFile(_themeId, path, content) {
      contents.set(path, content);
      return { path, bytes: content.length };
    },

    async resetThemeFile(_themeId, path) {
      const original = contents.get(path) ?? "";
      return { content: original };
    },

    async renameThemeFile(_themeId, path, name) {
      const nextPath = path.slice(0, path.lastIndexOf("/") + 1) + name;
      const content = contents.get(path);
      if (content !== undefined) {
        contents.delete(path);
        contents.set(nextPath, content);
      }
      files = files.map((f) => (f.path === path ? { ...f, path: nextPath } : f));
      return { path: nextPath };
    },

    async copyThemeFile(_themeId, path) {
      const base = path.slice(path.lastIndexOf("/") + 1);
      const dot = base.lastIndexOf(".");
      const copyName = dot > 0 ? `${base.slice(0, dot)}-1${base.slice(dot)}` : `${base}-1`;
      const nextPath = path.slice(0, path.lastIndexOf("/") + 1) + copyName;
      const original = files.find((f) => f.path === path);
      if (original) files = [...files, { ...original, path: nextPath }];
      const content = contents.get(path);
      if (content !== undefined) contents.set(nextPath, content);
      return { path: nextPath };
    },

    async deleteThemeFile(_themeId, path) {
      files = files.filter((f) => f.path !== path);
      contents.delete(path);
      return { path };
    },

    async setPagePublished(_themeId, page, published) {
      // Same basename-minus-`.html` derivation `explore.ts`'s `pageIdForPagePath` uses — a fake
      // stand-in for that lookup, not a second copy of the real predicate this port has no business
      // re-implementing.
      const target = files.find((f) => f.group === "page" && f.path.slice(f.path.lastIndexOf("/") + 1) === `${page}.html`);
      if (!target) throw new Error(`fake theme page not found: ${page}`);
      files = files.map((f) => (f === target ? { ...f, published } : f));
      return { page, published };
    },
  };
}
