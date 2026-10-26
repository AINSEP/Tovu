import { describe, expect, it } from "vitest";
import { t as mediaT } from "../../media/media-i18n";
import {
  accessTokenDuplicateNameMessage,
  accessTokensLoadErrorMessage,
  copyKeysResultText,
  otherCredentialRemoveDialogBody,
  removeDialogTitle,
  sharedKeyReplaceWarning,
  siteKeyGenerateErrorMessage,
  siteKeyRevealErrorMessage,
  t,
} from "../security-i18n";

/**
 * @file `security-i18n.ts` — scoped copy regressions including the SiteKeyTab "no key yet" note
 * and Media's External Providers deep-link label, not a full sweep of `SECURITY_DICT` (pre-existing
 * dictionary drift elsewhere is out of scope for this fix — same reasoning `roles-i18n.unit.test.ts`
 * gives for its own narrow scope).
 */
const LOCALES = [
  "es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko",
  "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn",
];

describe("site key generation errors", () => {
  it("includes the failure detail in the selected language", () => {
    expect(siteKeyGenerateErrorMessage("es", "disk full")).toBe("No se pudo generar una clave del sitio: disk full");
  });

  it.each(["en", "xx", "constructor"])("uses English generation copy for %s", (locale) => {
    expect(siteKeyGenerateErrorMessage(locale, "disk full")).toBe("Couldn't generate a site key: disk full");
  });
});

describe("Media · External Providers screen label", () => {
  it.each(["en", ...LOCALES])("matches the Media screen and tab labels in %s", (locale) => {
    expect(t({ locale, key: "Media · External Providers" })).toBe(
      `${mediaT({ locale, key: "Media" })} · ${mediaT({ locale, key: "External Providers" })}`,
    );
  });

  it("falls back to the English label for an unrecognized locale", () => {
    expect(t({ locale: "xx", key: "Media · External Providers" })).toBe("Media · External Providers");
  });
});

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
      const translated = t({ locale: locale, key: "A key is created automatically when this site starts." });
      expect(translated.length).toBeGreaterThan(0);
      expect(translated).not.toBe("A key is created automatically when this site starts.");
      expect(translated).toBe(EXPECTED_STARTUP_COPY[locale]);
    });
  }

  it("falls back to the English copy for an unrecognized locale", () => {
    expect(t({ locale: "xx", key: "A key is created automatically when this site starts." })).toBe("A key is created automatically when this site starts.");
  });
});

// BUG: these templates were read as `TEMPLATE[locale] ?? TEMPLATE.en`, so an inherited locale name
// resolved to an Object.prototype member and `interpolate` threw instead of rendering English.
describe.each(["constructor", "toString", "__proto__"])("templated copy for inherited locale name %s", (locale) => {
  // Pins security-i18n.ts:1989: inherited locales retain the external-MCP deletion warning.
  it("falls back to the English templates", () => {
    expect(accessTokensLoadErrorMessage(locale, "boom")).toBe("Couldn't load saved access tokens: boom");
    expect(accessTokenDuplicateNameMessage(locale, "Main", "GitHub")).toBe(
      accessTokenDuplicateNameMessage("en", "Main", "GitHub"),
    );
    expect(removeDialogTitle(locale, "Main")).toBe(removeDialogTitle("en", "Main"));
    expect(siteKeyRevealErrorMessage(locale, "boom")).toBe(siteKeyRevealErrorMessage("en", "boom"));
    expect(otherCredentialRemoveDialogBody(locale, { id: "external-mcp", purposeLabel: "MCP" })).toBe(
      "This deletes the server and its saved credentials. It can't be undone — you'd have to set it up again, and sign in again if it uses OAuth.",
    );
  });
});

describe("copy keys result copy", () => {
  const translate = (key: string) => t({ locale: "en", key });

  // Pins security-i18n.ts:1882: copied results show success with the four-character hint.
  it("shows copied success with the server's four-character hint", () => {
    expect(copyKeysResultText({
      result: { kind: "media-provider", id: "cloudinary", status: "copied", last4: "a1b2" },
      t: translate,
    })).toBe("copied ✓ …a1b2");
  });

  // Pins security-i18n.ts:1882: copied results omit missing or non-four-character hints.
  it.each([undefined, "abc"])("shows copied success without the invalid hint %s", (last4) => {
    expect(copyKeysResultText({
      result: { kind: "media-provider", id: "cloudinary", status: "copied", ...(last4 === undefined ? {} : { last4 }) },
      t: translate,
    })).toBe("copied ✓");
  });

  // Pins security-i18n.ts:1882's non-copied branch: known reasons retain their fixed copy.
  it("shows the target-exists reason for a skipped copy", () => {
    expect(copyKeysResultText({
      result: { kind: "media-provider", id: "cloudinary", status: "skipped", reasonCode: "target-exists" },
      t: translate,
    })).toBe("skipped (already there)");
  });

  // Pins security-i18n.ts:1882's non-copied branch: unknown reasons use the failure copy.
  it("shows the generic failure for an unknown copy reason", () => {
    expect(copyKeysResultText({
      result: { kind: "media-provider", id: "cloudinary", status: "failed", reasonCode: "unknown-reason" },
      t: translate,
    })).toBe("Copying keys failed. Try again.");
  });

  it("shows the generic failure when a failed copy omits its reason", () => {
    expect(copyKeysResultText({
      result: { kind: "media-provider", id: "cloudinary", status: "failed" },
      t: translate,
    })).toBe("Copying keys failed. Try again.");
  });
});

describe("other credential removal copy", () => {
  // Pins security-i18n.ts:1989: external MCP uses its translated unrecoverable-delete warning.
  it.each([
    ["en", "This deletes the server and its saved credentials. It can't be undone — you'd have to set it up again, and sign in again if it uses OAuth."],
    ["es", "Esto elimina el servidor y sus credenciales guardadas. No se puede deshacer: tendrías que configurarlo de nuevo y volver a iniciar sesión si usa OAuth."],
    ["ja", "サーバーと保存済みの認証情報を削除します。元に戻せません。再度使うにはセットアップし直す必要があり、OAuth を使う場合はもう一度サインインが必要です。"],
  ])("warns that external MCP removal cannot be undone in %s", (locale, expected) => {
    const body = otherCredentialRemoveDialogBody(locale, { id: "external-mcp", purposeLabel: "MCP" });
    expect(body).toBe(expected);
    expect(body).not.toContain("does NOT revoke");
  });

  // Pins security-i18n.ts:1989's non-external-MCP branch: replaceable stores keep the shared body.
  it("warns that removing a media token does not revoke it", () => {
    expect(otherCredentialRemoveDialogBody("en", { id: "media-provider", purposeLabel: "Media" })).toBe(
      "This deletes Tovu's saved copy of this Media token. It does NOT revoke the token on Media — it stays valid there until you revoke it yourself.",
    );
  });
});

describe("site key terminology copy", () => {
  for (const locale of LOCALES) {
    it(`has translated site key copy in ${locale}`, () => {
      for (const key of ["Site key", "Active: environment variable {name}"]) {
        expect(t({ locale: locale, key: key })).not.toBe(key);
      }
      expect(t({ locale: locale, key: "Active: environment variable {name}" })).toContain("{name}");
    });
  }
  it("names the key in German and Spanish", () => {
    expect(t({ locale: "de", key: "Site key" })).toBe("Website-Schlüssel");
    expect(t({ locale: "es", key: "Site key" })).toBe("Clave del sitio");
  });
});

describe("Access Tokens project-key strings", () => {
  const KEYS = [
    "Project — used by:", "Project — not used by any site yet", "This site only", "Use on this site",
    "Stop using on this site", "Use on this site to replace this key.", "Save key to",
    "Save to project and use on this site", "Used by 1 other site; it will use the new token too.",
    "Used by {count} other sites; they will use the new token too.",
  ];

  it.each(LOCALES)("translates every usage string in %s", (locale) => {
    for (const key of KEYS) expect(t({ locale, key })).not.toBe(key);
  });

  it("counts only the other sites in the replace warning", () => {
    const en = (key: string) => t({ locale: "en", key });
    expect(sharedKeyReplaceWarning({ usedBy: ["Shop"], usedByThisSite: true, t: en })).toBeNull();
    expect(sharedKeyReplaceWarning({ usedBy: ["Shop"], usedByThisSite: false, t: en })).toBe("Used by 1 other site; it will use the new token too.");
    expect(sharedKeyReplaceWarning({ usedBy: ["Shop", "Docs", "Blog"], usedByThisSite: true, t: en })).toBe("Used by 2 other sites; they will use the new token too.");
    expect(sharedKeyReplaceWarning({ usedBy: ["Shop", "Docs", "Blog"], usedByThisSite: true, t: (key) => t({ locale: "es", key }) }))
      .toBe("La usan 2 sitios más; también usarán el token nuevo.");
  });
});
