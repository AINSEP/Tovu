/** Spec/ADR: ADS-memory/.local-artifacts/theme-preview-refresh/design.md */
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  publishThemePreviewRefresh,
  resetThemePreviewRefresh,
  freshPreviewUrl,
  reloadThemePreviews,
  subscribeThemePreviewRefresh,
} from "../theme-preview-refresh";
import { useThemePreviewRefresh } from "../hooks/use-theme-preview-refresh.hooks";
import { ThemePreviewReloadButton } from "../ThemePreviewReloadButton";
import { THEMES_DICT } from "../themes-i18n";
afterEach(resetThemePreviewRefresh);

it("every mounted preview refreshes, including when the open source text is unchanged", () => {
  let n = 0;
  const deps = { makeRevision: () => `revision-${++n}` };
  const a = renderHook(() => useThemePreviewRefresh({ url: "/create-a-theme?lang=en", ...deps }));
  const b = renderHook(() => useThemePreviewRefresh({ url: "/theme-explore/basic/index?v=0", ...deps }));
  expect(a.result.current.url).toBe("/create-a-theme?lang=en&__tovu_preview=revision-1");
  expect(b.result.current.url).toBe("/theme-explore/basic/index?v=0&__tovu_preview=revision-2");
  act(() => publishThemePreviewRefresh({ revision: "revision-3" }));
  expect(a.result.current.url).toBe("/create-a-theme?lang=en&__tovu_preview=revision-3");
  expect(b.result.current.url).toBe("/theme-explore/basic/index?v=0&__tovu_preview=revision-3");
  a.unmount();
  b.unmount();
});

it("tool navigation is local, refreshes every preview, and resets when the editor chooses another source", () => {
  const { result, rerender } = renderHook(
    ({ url }) => useThemePreviewRefresh({ url, makeRevision: () => "initial" }),
    { initialProps: { url: "/theme-explore/basic/index?v=0" } },
  );
  act(() => publishThemePreviewRefresh({ revision: "next", path: "/create-a-theme?lang=en" }));
  expect(result.current.url).toBe("/create-a-theme?lang=en&__tovu_preview=next");
  rerender({ url: "/theme-explore/basic/about?v=0" });
  expect(result.current.url).toBe("/theme-explore/basic/about?v=0&__tovu_preview=next");
});

it("fresh URLs preserve absolute site origin, queries and fragments", () => {
  expect(freshPreviewUrl({ url: "https://localhost:3000/about?lang=en#body", revision: "new" })).toBe(
    "https://localhost:3000/about?lang=en&__tovu_preview=new#body",
  );
  expect(freshPreviewUrl({ url: "/theme-assets/test/css/theme.css?v=0", revision: "new" })).toBe(
    "/theme-preview-assets/new/test/css/theme.css?v=0&__tovu_preview=new",
  );
});

it("reload button has translated label and tooltip and signals a new refresh", () => {
  let calls = 0;
  render(
    <ThemePreviewReloadButton
      label="Reload preview"
      reload={() => {
        calls++;
      }}
    />,
  );
  const button = screen.getByRole("button", { name: "Reload preview" });
  expect(button.getAttribute("title")).toBe("Reload preview");
  expect(button.querySelector("svg")?.getAttribute("stroke-width")).toBe("1.5");
  fireEvent.click(button);
  expect(calls).toBe(1);
});

it("all themes locales translate Reload preview with exact strings", () => {
  const expected = {
    es: "Recargar vista previa",
    id: "Muat ulang pratinjau",
    de: "Vorschau neu laden",
    "zh-CN": "重新加载预览",
    "zh-TW": "重新載入預覽",
    "pt-BR": "Recarregar prévia",
    ru: "Перезагрузить предпросмотр",
    fa: "بارگذاری مجدد پیش‌نمایش",
    ar: "إعادة تحميل المعاينة",
    ja: "プレビューを再読み込み",
    ko: "미리보기 새로고침",
    pl: "Odśwież podgląd",
    hu: "Előnézet újratöltése",
    fr: "Recharger l’aperçu",
    uk: "Перезавантажити попередній перегляд",
    tr: "Önizlemeyi yeniden yükle",
    th: "โหลดตัวอย่างใหม่",
    it: "Ricarica anteprima",
    hi: "पूर्वावलोकन फिर से लोड करें",
    ur: "پیش منظر دوبارہ لوڈ کریں",
    bn: "প্রিভিউ আবার লোড করুন",
  };
  expect(
    Object.fromEntries(Object.entries(THEMES_DICT).map(([locale, dict]) => [locale, dict["Reload preview"]])),
  ).toEqual(expected);
});

it("existing SSE connection receives theme refreshes without opening a second connection", async () => {
  const { subscribeToSettingsChanges } = await import("@/lib/settings-events");
  const listeners = new Map<string, (event: { data: string }) => void>();
  let closed = false;
  const source = {
    addEventListener: (name: string, handler: (event: { data: string }) => void) =>
      listeners.set(name, handler),
    close: () => {
      closed = true;
    },
    readyState: 1,
  };
  let connections = 0;
  const dispose = subscribeToSettingsChanges("ws", {
    open: () => {
      connections++;
      return source as never;
    },
  });
  const { result } = renderHook(() =>
    useThemePreviewRefresh({ url: "/about", makeRevision: () => "before" }),
  );
  act(() => listeners.get("theme-preview-refresh")?.({ data: JSON.stringify({ revision: "sse-revision" }) }));
  expect(result.current.url).toBe("/about?__tovu_preview=sse-revision");
  expect(connections).toBe(1);
  dispose();
  expect(closed).toBe(true);
});

it("pending previews remount with a fresh POST action; tool navigation instead uses a public GET", async () => {
  const { useThemePreviewFrame } = await import("../hooks/use-theme-preview-refresh.hooks");
  const { result } = renderHook(() =>
    useThemePreviewFrame({
      liveUrl: "/about",
      templateUrl:
        "/api/admin/v1/workspaces/workspace-local/posts/p/template-preview?templateChoice=posts-sidebar.html",
      canShowLiveSite: false,
      makeRevision: () => "before",
    }),
  );
  expect(result.current.canShowLiveSite).toBe(false);
  expect(result.current.templateUrl).toBe(
    "/api/admin/v1/workspaces/workspace-local/posts/p/template-preview?templateChoice=posts-sidebar.html&__tovu_preview=before",
  );
  act(() => publishThemePreviewRefresh({ revision: "after", path: "/create-a-theme" }));
  expect(result.current.canShowLiveSite).toBe(true);
  expect(result.current.liveUrl).toBe("/create-a-theme?__tovu_preview=after");
});

it("automatic refresh retains the current tool-selected path until the editor changes source", () => {
  const { result } = renderHook(() =>
    useThemePreviewRefresh({ url: "/theme-explore/basic/index?v=0", makeRevision: () => "initial" }),
  );
  act(() => publishThemePreviewRefresh({ revision: "navigate", path: "/create-a-theme" }));
  act(() => publishThemePreviewRefresh({ revision: "css-save" }));
  expect(result.current.url).toBe("/create-a-theme?__tovu_preview=css-save");
});

it("DI preview origins are preserved just like real site origins", () => {
  expect(freshPreviewUrl({ url: "fake://template-preview/pg1?templateChoice=", revision: "test" })).toBe(
    "fake://template-preview/pg1?templateChoice=&__tovu_preview=test",
  );
});

it("manual POST plus its SSE echo loads every preview exactly once", async () => {
  const seen: string[] = [];
  const dispose = subscribeThemePreviewRefresh({ listener: ({ revision }) => seen.push(revision) });
  let finish!: (response: { revision: string }) => void;
  const pending = reloadThemePreviews({ request: () => new Promise((resolve) => { finish = resolve; }) });
  expect(seen).toEqual([]);
  publishThemePreviewRefresh({ revision: "manual-result" });
  finish({ revision: "manual-result" });
  await pending;
  expect(seen).toEqual(["manual-result"]);
  dispose();
});

it("a resolved explore id is authoritative for alias and empty theme props", async () => {
  const { useThemeExplorePreview } = await import("../hooks/use-theme-explore-preview.hooks");
  for (const themeId of ["old-alias", ""]) {
    const h = renderHook(() => useThemeExplorePreview({
      themeId, detail: { id: "resolved" },
      files: [{ path: "pages/index.html", label: "index", kind: "page" } as never],
      selected: "pages/index.html", previewNonce: 0,
    }, { makeRevision: () => "initial" }));
    expect(h.result.current).toBe("/theme-explore/resolved/index?v=0&__tovu_preview=initial");
    h.unmount();
  }
});

it("explore save nonce and content notifications leave reload ownership to the durable feed", async () => {
  const { useThemeExplorePreview } = await import("../hooks/use-theme-explore-preview.hooks");
  const { publishContentRefresh } = await import("@/lib/content-refresh-bus");
  const h = renderHook(({ previewNonce }) => useThemeExplorePreview({
    themeId: "resolved", detail: { id: "resolved" },
    files: [{ path: "pages/index.html", label: "index", kind: "page" } as never],
    selected: "pages/index.html", previewNonce,
  }, { makeRevision: () => "initial" }), { initialProps: { previewNonce: 0 } });
  const initial = h.result.current;
  h.rerender({ previewNonce: 1 });
  act(() => publishContentRefresh());
  expect(h.result.current).toBe(initial);
  act(() => publishThemePreviewRefresh({ revision: "saved" }));
  expect(h.result.current).toBe("/theme-explore/resolved/index?v=0&__tovu_preview=saved");
});

it("interleaved POST results and SSE echoes publish each durable revision only once", () => {
  const seen: string[] = [];
  const dispose = subscribeThemePreviewRefresh({ listener: ({ revision }) => seen.push(revision) });
  publishThemePreviewRefresh({ revision: "first" });
  publishThemePreviewRefresh({ revision: "second" });
  publishThemePreviewRefresh({ revision: "first" });
  publishThemePreviewRefresh({ revision: "second" });
  expect(seen).toEqual(["first", "second"]);
  dispose();
});
