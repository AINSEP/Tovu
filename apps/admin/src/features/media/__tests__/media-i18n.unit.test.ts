import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { COMMON_I18N } from "@/lib/i18n-common";
import { MEDIA_DICT, t } from "../media-i18n";
import { MEDIA_ORDER_OPTIONS } from "../rules";
import { Media } from "../Media";
import { useMedia } from "../hooks/use-media.hooks";
import { createFakeMediaPort } from "../hooks/media-dependencies.hooks";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";

afterEach(() => vi.restoreAllMocks());

const COPY_KEYS = ['Edit "{title}"', 'View "{title}" larger', "native", "failed to read file"];

describe("Media copy reaches the active locale", () => {
  it("registers every newly required key in all 21 locales without English placeholders", () => {
    expect(Object.keys(MEDIA_DICT)).toHaveLength(21);
    for (const [locale, dictionary] of Object.entries(MEDIA_DICT)) {
      for (const key of COPY_KEYS) {
        expect(dictionary[key], `${locale}: ${key}`).toBeTruthy();
        expect(dictionary[key], `${locale}: ${key}`).not.toBe(key);
      }
    }
  });

  // Guard the class: accessible attributes must translate authored copy, including templates.
  it("has no untranslated literal copy in Media's accessible labels or placeholders", () => {
    const source = ts.createSourceFile("Media.tsx", readFileSync(resolve(process.cwd(), "src/features/media/Media.tsx"), "utf8"), ts.ScriptTarget.Latest, true);
    const bypasses: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxAttribute(node) && ["aria-label", "title", "placeholder", "alt"].includes(node.name.getText(source))) {
        const value = node.initializer;
        const expression = value && ts.isJsxExpression(value) ? value.expression : value;
        if (expression && ts.isStringLiteralLike(expression) && expression.text.trim()) bypasses.push(node.getText(source));
        if (expression && ts.isTemplateExpression(expression)) {
          const fragments = [expression.head.text, ...expression.templateSpans.map(span => span.literal.text)];
          if (fragments.some(fragment => /[a-zA-Z]/.test(fragment))) bypasses.push(node.getText(source));
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(bypasses).toEqual([]);
  });

  for (const copy of [
    { locale: "es", edit: 'Editar "Sunset $&"', expand: 'Ver "Sunset $&" más grande', native: "tamaño original", read: "no se pudo leer el archivo", upload: "no se pudo subir" },
    { locale: "ja", edit: '「Sunset $&」を編集', expand: '「Sunset $&」を拡大表示', native: "元のサイズ", read: "ファイルを読み込めませんでした", upload: "アップロードに失敗しました" },
  ]) {
    async function renderLocalizedMedia() {
      const port = createFakeMediaPort();
      await port.uploadMedia({ filename: "Sunset $&", contentType: "image/png", dataBase64: "aGk=" });
      const translate = (key: string) => t({ locale: copy.locale, key });
      render(createElement(FetchQueryProvider, {}, createElement(Media, {
        useMediaHook: () => useMedia({ port, locale: copy.locale, t: translate }),
      })));
      return { port, translate };
    }

    it(`${copy.locale}: translates preview actions and the sizing fields reached from Edit`, async () => {
      await renderLocalizedMedia();
      expect(await screen.findByRole("button", { name: copy.expand })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: copy.edit }));
      expect(await screen.findAllByPlaceholderText(copy.native)).toHaveLength(2);
    });

    it.each([null, new DOMException("The selected file is no longer readable", "NotReadableError")])(`${copy.locale}: localizes file-read failures without starting an upload (%s)`, async (readFailure) => {
      const { port, translate } = await renderLocalizedMedia();
      const upload = vi.spyOn(port, "uploadMedia");
      vi.spyOn(FileReader.prototype, "error", "get").mockReturnValue(readFailure);
      vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
        // A missing DOMException exercises the local fallback before any HTTP mutation.
        this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
      });
      fireEvent.click(await screen.findByRole("button", { name: translate("Upload image") }));
      fireEvent.change(screen.getByLabelText(translate("File to upload")), { target: { files: [new File(["broken"], "broken.png", { type: "image/png" })] } });
      fireEvent.click(screen.getByRole("button", { name: translate("Upload"), exact: true }));
      // jsdom's DOMException follows describeApiError's existing non-Error fallback contract.
      expect(await screen.findByRole("alert")).toHaveTextContent(readFailure ? copy.upload : copy.read);
      expect(upload).not.toHaveBeenCalled();
    });

    it(`${copy.locale}: preserves an upload service's specific Error diagnostic`, async () => {
      const { port, translate } = await renderLocalizedMedia();
      vi.spyOn(port, "uploadMedia").mockRejectedValueOnce(new Error("Storage quota reached"));
      fireEvent.click(await screen.findByRole("button", { name: translate("Upload image") }));
      fireEvent.change(screen.getByLabelText(translate("File to upload")), { target: { files: [new File(["pixel"], "photo.png", { type: "image/png" })] } });
      fireEvent.click(screen.getByRole("button", { name: translate("Upload"), exact: true }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Storage quota reached");
    });
  }
});

/**
 * @file `MEDIA_DICT` cross-locale coverage — the exact gap a live audit caught 2026-09-07: `Media.tsx`
 * gained a new copy string ("Uploaded videos appear here once you add them.") when the Videos tab's
 * empty state was fixed to no longer claim video wasn't supported, but the string was added to
 * `Media.tsx` only — none of the 21 locale blocks in `media-i18n.ts` got a translation for it. Per
 * this file's own header, `rules.ts`'s `t` is `MEDIA_DICT[locale]?.[key] ?? key`: a missing entry
 * doesn't error, it silently renders the raw English string to a non-English locale. That silence is
 * exactly why this needs a standing test, not a one-time fix — mirrors
 * `lib/__tests__/i18n-common.unit.test.ts`'s cross-locale parity idiom (same two assertions: identical
 * key sets, no empty values), applied to this feature's own dictionary instead of the shared one.
 *
 * Per that file's own comment, new keys/locales are NOT asserted individually here — this test keeps
 * verifying structure so it stays correct as `MEDIA_DICT` grows, rather than becoming a second place
 * (besides `Media.tsx` itself) that must be remembered for every future copy string.
 */
describe("MEDIA_DICT: cross-locale key parity", () => {
  const locales = Object.keys(MEDIA_DICT);

  it("has at least one locale", () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it("ships the exact same key set across every locale block", () => {
    const [firstLocale, ...rest] = locales;
    const referenceKeys = Object.keys(MEDIA_DICT[firstLocale]).sort();
    for (const locale of rest) {
      expect(Object.keys(MEDIA_DICT[locale]).sort(), `locale ${locale} key set`).toEqual(referenceKeys);
    }
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(MEDIA_DICT[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  // The specific regression: key-set parity alone would NOT have caught this bug (the key was
  // missing from every locale equally, so all 21 blocks agreed with each other) — only checking that
  // every key `Media.tsx` actually calls `t(...)` with is present catches "added to source, added to
  // zero locales."
  it("covers every copy string Media.tsx's MediaTypeEmptyState/Media screen call t() with (spot check: the video empty-state copy this audit found missing)", () => {
    for (const locale of locales) {
      expect(MEDIA_DICT[locale]["Uploaded videos appear here once you add them."], `locale ${locale}`).toBeTruthy();
    }
  });

  it("translates every literal t() key in Media.tsx and rules.ts, plus the order-option labels, in every locale", () => {
    const keys = new Set(MEDIA_ORDER_OPTIONS.map((option) => option.label));
    for (const filename of ["Media.tsx", "rules.ts"]) {
      const source = ts.createSourceFile(filename, readFileSync(resolve(process.cwd(), "src/features/media", filename), "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node)) {
          const callee = node.expression;
          const isTranslator = (ts.isIdentifier(callee) && callee.text === "t")
            || (ts.isPropertyAccessExpression(callee) && callee.name.text === "t");
          const [key] = node.arguments;
          if (isTranslator && key && ts.isStringLiteralLike(key)) keys.add(key.text);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(keys.has("Uploaded videos appear here once you add them.")).toBe(true);
    for (const locale of locales) {
      for (const key of keys) {
        expect(MEDIA_DICT[locale][key] ?? COMMON_I18N[locale]?.[key], `${locale} translation for ${JSON.stringify(key)}`).toBeTruthy();
      }
    }
  });
});

/**
 * S-I18N fallback fix (same shape as `widgets`/`forms`/`collections`/`taxonomy`, see those
 * dictionaries' own `t() falls back to COMMON_I18N` tests): `media-i18n.ts`'s `t` was a bare
 * `MEDIA_DICT[locale]?.[key] ?? key` with no shared-dictionary fallback. Every key `Media.tsx`
 * currently calls `t()` with happens to already be duplicated into `MEDIA_DICT` for all 21 locales
 * (confirmed by the parity test above), so this dictionary's OWN copy never rendered raw English —
 * but the exported `t`/`translate` is also called directly by `rules.ts` and `use-media.hooks.ts`
 * for any future key, and a generic `COMMON_I18N` word this dictionary doesn't carry (it never
 * needed to, since it duplicates Save/Cancel/Delete permanently locally) still fell straight to
 * English instead of the shared translation.
 */
describe("MEDIA_DICT: t() falls back to COMMON_I18N", () => {
  it("translates 'Kind' in German even though MEDIA_DICT.de never carries it", () => {
    expect(MEDIA_DICT.de.Kind).toBeUndefined();
    expect(t({ locale: "de", key: "Kind" })).toBe(COMMON_I18N.de.Kind);
  });
});
