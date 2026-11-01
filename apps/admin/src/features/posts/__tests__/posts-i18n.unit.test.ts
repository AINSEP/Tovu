import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import { api } from "@/lib/api";
import { Posts } from "../Posts";
import { PostEditor } from "../PostEditor";
import { PostPublishAtField } from "../PostPublishingFields";
import { createFakePostEditorPort } from "../hooks/post-editor-dependencies.hooks";
import { usePostEditor } from "../hooks/use-post-editor.hooks";
import type { PostEditorController } from "../hooks/use-post-editor.hooks";

import { COMMON_I18N } from "@/lib/i18n-common";
import { POSTS_DICT, t } from "../posts-i18n";

/**
 * @file `POSTS_DICT` cross-locale coverage — same idiom as
 * `taxonomy/__tests__/taxonomy-i18n.unit.test.ts` (read that file's header): `posts-i18n.ts`
 * exported no module-level `t` at all before this fix — `Posts.tsx`, `rules.ts`'s
 * `postRowMenuItems`, and `use-post-editor.hooks.ts` each built their own no-fallback
 * `POSTS_DICT[locale]?.[key] ?? key` closure inline.
 *
 * Added 2026-09-21 alongside the S-I18N fallback fix extension to the rest of the admin app.
 */
describe("POSTS_DICT: cross-locale key parity", () => {
  const locales = Object.keys(POSTS_DICT);

  it("covers the same 21 locales the rest of this app's feature dictionaries ship", () => {
    const EXPECTED_LOCALES = [
      "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
      "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
    ];
    expect(locales.slice().sort()).toEqual(EXPECTED_LOCALES.slice().sort());
  });

  it("every partially-present key is one COMMON_I18N carries in all 21 locales", () => {
    const allKeys = new Set(locales.flatMap((locale) => Object.keys(POSTS_DICT[locale])));
    const unrescuable: string[] = [];
    for (const key of allKeys) {
      const missingIn = locales.filter((locale) => POSTS_DICT[locale][key] === undefined);
      if (missingIn.length === 0) continue;
      if (locales.every((locale) => COMMON_I18N[locale]?.[key] !== undefined)) continue;
      unrescuable.push(`${JSON.stringify(key)} missing in ${missingIn.join(",")}`);
    }
    expect(unrescuable).toEqual([]);
  });

  // "Move" is deliberately empty in the six object-before-verb locales (ja, ko, tr, hi, ur, bn) —
  // see posts-i18n.ts's own header for why (the verb is already embedded in the trailing fragment
  // that follows the quoted title in those languages). Every other key must still be non-empty
  // everywhere.
  const DELIBERATELY_EMPTY: Record<string, string[]> = {
    Move: ["ja", "ko", "tr", "hi", "ur", "bn"],
  };
  it("has a non-empty translation for every key in every locale, except documented deliberate exceptions", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(POSTS_DICT[locale])) {
        if (DELIBERATELY_EMPTY[key]?.includes(locale)) continue;
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * The parity check above could not see a locale left in English: `posts-i18n.ts` used to backfill
 * any key missing from a locale with the English key itself. That is how "Template" — the template
 * select's accessible name — shipped translated only in Spanish. The template picker's copy must be
 * real. (The backfill is gone; `lib/__tests__/untranslated-copy.unit.test.ts` now checks every key.)
 */
describe("POSTS_DICT: template picker copy", () => {
  it.each(["Template", "View Template", "No template chosen", "No templates for this theme"])(
    "translates %j in every locale, not left in English",
    (key) => {
      for (const locale of Object.keys(POSTS_DICT)) expect(t({ locale: locale, key: key }), locale).not.toBe(key);
    },
  );
});

/**
 * Regression for basic words (Cancel, Delete permanently, …) rendering English in every locale
 * (S-I18N fallback fix). `POSTS_DICT.de` carries neither "Cancel" nor "Delete permanently" — both
 * are `COMMON_I18N` keys in all 21 locales, so `t` must fall through to `COMMON_I18N` instead of
 * returning the raw English key.
 */
describe("POSTS_DICT: t() falls back to COMMON_I18N", () => {
  it("translates 'Cancel' in German even though POSTS_DICT.de never carries it", () => {
    expect(POSTS_DICT.de.Cancel).toBeUndefined();
    expect(t({ locale: "de", key: "Cancel" })).toBe(COMMON_I18N.de.Cancel);
  });

  it("translates 'Delete permanently' in German even though POSTS_DICT.de never carries it", () => {
    expect(POSTS_DICT.de["Delete permanently"]).toBeUndefined();
    expect(t({ locale: "de", key: "Delete permanently" })).toBe(COMMON_I18N.de["Delete permanently"]);
  });
});

it("translates the preview consent note in every admin locale", () => {
  const key = "Cookie banner hidden in preview. Embedded videos may not play here; open the page to check.";
  for (const locale of Object.keys(POSTS_DICT)) {
    expect(t({ locale, key }), locale).not.toBe(key);
  }
});

// Exercise the real screen translators; external feature cards keep their own tests.
const language = vi.hoisted(() => ({ locale: "es" }));
vi.mock("@/hooks/use-admin-locale.hooks", () => ({
  useAdminLocale: () => language.locale,
  useWiredAdminLocale: () => language.locale,
}));
vi.mock("../../taxonomy/TermPicker", () => ({ TermPicker: () => null }));
vi.mock("../../content-analysis/ContentAnalysisCard", () => ({ ContentAnalysisCard: () => null }));
vi.mock("@/components/EmbedInsertControl/EmbedInsertControl", () => ({ EmbedInsertControl: () => null }));

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// Union-key parity cannot see a requirement omitted from EVERY locale.
const REQUIRED_POST_COPY = [
  "Drag to reorder", "Saved · version {version}", "Published · version {version}",
  "failed to load post", "could not re-read the current version — your changes are still here, try again",
  "delete failed", "failed to load posts", "failed to create post", "failed to publish post",
  "failed to unpublish post", "failed to delete post", "Publish at", "Scheduled", "Alt text (optional)", "Insert",
];

it.each(REQUIRED_POST_COPY)("provides the required screen key %j in every locale", (key) => {
  for (const locale of Object.keys(POSTS_DICT)) {
    expect(t({ locale, key }), `${locale}: ${key}`).not.toBe(key);
  }
});

const LOCALIZED = [
  { locale: "es", drag: "Arrastrar para reordenar", saved: "Guardado · versión 2", published: "Publicado · versión 2",
    publishAt: "Publicar el", scheduled: "Programado", alt: "Texto alternativo (opcional)", insert: "Insertar",
    load: "No se pudieron cargar las entradas", create: "No se pudo crear la entrada", publish: "No se pudo publicar la entrada",
    unpublish: "No se pudo anular la publicación de la entrada", remove: "No se pudo eliminar la entrada",
    editorLoad: "No se pudo cargar la entrada", editorDelete: "Error al eliminar",
    conflict: "No se pudo volver a leer la versión actual — tus cambios siguen aquí, inténtalo de nuevo" },
  { locale: "ja", drag: "ドラッグして並べ替え", saved: "保存しました · バージョン 2", published: "公開しました · バージョン 2",
    publishAt: "公開日時", scheduled: "公開予約済み", alt: "代替テキスト（任意）", insert: "挿入",
    load: "投稿を読み込めませんでした", create: "投稿を作成できませんでした", publish: "投稿を公開できませんでした",
    unpublish: "投稿の公開を取り消せませんでした", remove: "投稿を削除できませんでした",
    editorLoad: "投稿を読み込めませんでした", editorDelete: "削除に失敗しました",
    conflict: "現在のバージョンを再取得できませんでした — 変更内容は保持されています。もう一度お試しください" },
];

for (const copy of LOCALIZED) {
  describe(`Posts screens in ${copy.locale}`, () => {
    const translate = (key: string) => t({ locale: copy.locale, key });

    it("renders translated scheduling text and the URL dialog's accessible controls", async () => {
      language.locale = copy.locale;
      const port = createFakePostEditorPort();
      function useEditor(id: string) {
        return usePostEditor(id, { port, navigate: vi.fn(), t: translate });
      }
      render(h(PostEditor, { postId: port.post.slug, usePostEditorHook: useEditor }));
      await screen.findByTitle(copy.drag);
      fireEvent.click(screen.getByTitle(translate("Insert image by URL")));
      expect(await screen.findByRole("textbox", { name: copy.alt })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: copy.insert })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: translate("Cancel") }));
      render(h(PostPublishAtField, { publishAtInput: "", setPublishAtInput: vi.fn(), scheduled: true, t: translate }));
      expect(screen.getByLabelText(new RegExp(copy.publishAt))).toBeInTheDocument();
      expect(screen.getByText(copy.scheduled)).toBeInTheDocument();
    });

    it.each(["saved", "published"] as const)("renders the translated %s version notice after saving", async (kind) => {
      const port = createFakePostEditorPort();
      let controller!: PostEditorController;
      function useEditor(id: string) {
        controller = usePostEditor(id, { port, navigate: vi.fn(), t: translate });
        return controller;
      }
      render(h(PostEditor, { postId: port.post.slug, usePostEditorHook: useEditor }));
      await waitFor(() => expect(controller.post).not.toBeNull());
      await waitFor(() => expect(controller.editor).not.toBeNull());
      if (kind === "saved") {
        fireEvent.change(screen.getByRole("textbox", { name: translate("Post title") }), { target: { value: "Updated title" } });
      }
      fireEvent.click(screen.getByRole("button", { name: translate(kind === "published" ? "Publish" : "Save") }));
      expect(await screen.findByText(copy[kind])).toBeInTheDocument();
    });

    it.each(["load", "create", "publish", "unpublish", "remove"] as const)("translates the list %s failure reached through the screen", async (action) => {
      language.locale = copy.locale;
      const post = createFakePostEditorPort().post;
      if (action === "unpublish") post.status = "published";
      vi.spyOn(api, "listPosts").mockImplementation(async () => {
        if (action === "load") throw null;
        return { posts: [{ post }] };
      });
      vi.spyOn(api, "createPost").mockRejectedValue(null);
      vi.spyOn(api, "updatePost").mockRejectedValue(null);
      vi.spyOn(api, "deletePost").mockRejectedValue(null);
      render(h(Posts));
      if (action !== "load") {
        await screen.findByRole("link", { name: post.title });
        if (action === "create") fireEvent.click(screen.getByRole("button", { name: translate("New Post") }));
        else {
          fireEvent.click(screen.getByRole("button", { name: translate('Actions for "{title}"').replace("{title}", post.title) }));
          const key = action === "remove" ? "Delete" : action === "publish" ? "Publish" : "Unpublish";
          fireEvent.click(await screen.findByRole("menuitem", { name: translate(key) }));
          if (action === "remove") {
            const dialog = await screen.findByRole("dialog");
            fireEvent.click(within(dialog).getByRole("button", { name: translate("Move to trash") }));
          }
        }
      }
      expect(await screen.findByText(copy[action])).toBeInTheDocument();
    });

    it.each(["editorLoad", "editorDelete", "conflict"] as const)("translates the editor %s fallback", async (action) => {
      const port = createFakePostEditorPort();
      if (action === "editorLoad") vi.spyOn(port, "getPost").mockRejectedValue(null);
      vi.spyOn(port, "deletePost").mockRejectedValue(null);
      let controller!: PostEditorController;
      function useEditor(id: string) {
        controller = usePostEditor(id, { port, navigate: vi.fn(), t: translate });
        return controller;
      }
      render(h(PostEditor, { postId: port.post.slug, usePostEditorHook: useEditor }));
      if (action !== "editorLoad") {
        await waitFor(() => expect(controller.post).not.toBeNull());
        await waitFor(() => expect(controller.editor).not.toBeNull());
        if (action === "editorDelete") {
          fireEvent.click(screen.getByRole("button", { name: translate("Delete") }));
          const dialog = await screen.findByRole("dialog");
          fireEvent.click(within(dialog).getByRole("button", { name: translate("Move to trash") }));
        }
        else {
          port.simulateConcurrentSave();
          await act(() => controller.save());
          expect(controller.saveConflict).not.toBeNull();
          vi.spyOn(port, "getPost").mockRejectedValue(null);
          await act(() => controller.saveOverwritingConflict());
        }
      }
      expect(await screen.findByText(copy[action])).toBeInTheDocument();
    });
  });
}
