import { describe, expect, it } from "vitest";
import {
  accessTokenDuplicateNameMessage,
  accessTokensLoadErrorMessage,
  otherCredentialRemoveDialogBody,
  removeDialogTitle,
  siteKeyRevealErrorMessage,
  t,
} from "../security-i18n";

/**
 * @file `security-i18n.ts` — scoped to the one key the site-key plan (2026-09-24) item 3 added (the
 * SiteKeyTab "no key yet" note), not a full cross-locale sweep of `SECURITY_DICT` (pre-existing
 * dictionary drift elsewhere is out of scope for this fix — same reasoning `roles-i18n.unit.test.ts`
 * gives for its own narrow scope).
 */
const LOCALES = [
  "es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko",
  "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn",
];

const EXPECTED_STARTUP_COPY: Record<string, string> = {
  es: "La clave se crea automáticamente cuando este sitio se inicia.",
  de: "Ein Schlüssel wird automatisch erstellt, wenn diese Website startet.",
  fr: "Une clé est créée automatiquement au démarrage de ce site.",
  it: "Una chiave viene creata automaticamente all'avvio di questo sito.",
  "pt-BR": "Uma chave é criada automaticamente quando este site é iniciado.",
  pl: "Klucz jest tworzony automatycznie podczas uruchamiania tej witryny.",
  hu: "A kulcs automatikusan létrejön, amikor ez a webhely elindul.",
  tr: "Bu site başladığında bir anahtar otomatik olarak oluşturulur.",
  ru: "Ключ создаётся автоматически при запуске этого сайта.",
  uk: "Ключ створюється автоматично під час запуску цього сайту.",
  id: "Kunci dibuat secara otomatis saat situs ini dimulai.",
  ar: "يتم إنشاء مفتاح تلقائيًا عند بدء تشغيل هذا الموقع.",
  fa: "کلید هنگام شروع این سایت به‌طور خودکار ایجاد می‌شود.",
  hi: "यह साइट शुरू होने पर कुंजी स्वचालित रूप से बन जाती है।",
  bn: "এই সাইট শুরু হলে একটি কী স্বয়ংক্রিয়ভাবে তৈরি হয়।",
  ur: "جب یہ سائٹ شروع ہوتی ہے تو ایک کی خودکار طور پر بن جاتی ہے۔",
  ja: "このサイトが起動すると、キーが自動的に作成されます。",
  ko: "이 사이트가 시작되면 키가 자동으로 생성됩니다.",
  th: "คีย์จะถูกสร้างขึ้นโดยอัตโนมัติเมื่อไซต์นี้เริ่มทำงาน",
  "zh-CN": "此站点启动时会自动创建密钥。",
  "zh-TW": "此網站啟動時會自動建立金鑰。",
};

describe('t(locale, "A key is created automatically when this site starts.")', () => {
  for (const locale of LOCALES) {
    it(`translates for ${locale}`, () => {
      const translated = t(locale, "A key is created automatically when this site starts.");
      expect(translated.length).toBeGreaterThan(0);
      expect(translated).not.toBe("A key is created automatically when this site starts.");
      expect(translated).toBe(EXPECTED_STARTUP_COPY[locale]);
    });
  }

  it("falls back to the English copy for an unrecognized locale", () => {
    expect(t("xx", "A key is created automatically when this site starts.")).toBe("A key is created automatically when this site starts.");
  });
});

// BUG: these templates were read as `TEMPLATE[locale] ?? TEMPLATE.en`, so an inherited locale name
// resolved to an Object.prototype member and `interpolate` threw instead of rendering English.
describe.each(["constructor", "toString", "__proto__"])("templated copy for inherited locale name %s", (locale) => {
  it("falls back to the English templates", () => {
    expect(accessTokensLoadErrorMessage(locale, "boom")).toBe("Couldn't load saved access tokens: boom");
    expect(accessTokenDuplicateNameMessage(locale, "Main", "GitHub")).toBe(
      accessTokenDuplicateNameMessage("en", "Main", "GitHub"),
    );
    expect(removeDialogTitle(locale, "Main")).toBe(removeDialogTitle("en", "Main"));
    expect(siteKeyRevealErrorMessage(locale, "boom")).toBe(siteKeyRevealErrorMessage("en", "boom"));
    expect(otherCredentialRemoveDialogBody(locale, { id: "external-mcp", purposeLabel: "MCP" })).toBe(
      otherCredentialRemoveDialogBody("en", { id: "external-mcp", purposeLabel: "MCP" }),
    );
  });
});

describe("site key terminology copy", () => {
  for (const locale of LOCALES) {
    it(`has translated site key copy in ${locale}`, () => {
      for (const key of ["Site key", "Active: environment variable {name}"]) {
        expect(t(locale, key)).not.toBe(key);
      }
      expect(t(locale, "Active: environment variable {name}")).toContain("{name}");
    });
  }
  it("names the key in German and Spanish", () => {
    expect(t("de", "Site key")).toBe("Website-Schlüssel");
    expect(t("es", "Site key")).toBe("Clave del sitio");
  });
});
