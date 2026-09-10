/**
 * @file Translations for the Providers page (`features/providers/Providers.tsx`) — this feature's
 * own dictionary rather than the shared `lib/admin-nav-i18n.ts` one, the same per-feature
 * convention `integrations-i18n.tsx` and `plugins-i18n.ts` follow, so parallel translation passes
 * over different admin sections cannot collide on one file.
 *
 * `Media` and `Integrations` here are the SAME strings the nav row and group heading use — they
 * were lifted from `lib/admin-nav-i18n.ts` when this file was generated rather than retyped, so
 * the page kicker can never disagree with the group label an operator just clicked.
 *
 * "Composio" is deliberately absent: it is a brand name, so every locale falls through to the
 * English source string, which is the correct rendering rather than a missing translation.
 *
 * Scope note: the TAB BODIES are not translated from here. `MediaProvidersTab`, `ConnectorsBrowser`
 * and `ExternalMcpSettingsPanel` all resolve their own copy through `@jini-ai/ui`'s `useT()`, which
 * reads the `I18nProvider` mounted in `Providers.tsx` — see that file's own comment on why that
 * provider is load-bearing and not decoration.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const PROVIDERS_DICT: Record<string, Record<string, string>> = {
  es: {
    Integrations: "Integraciones",
    Providers: "Proveedores",
    Media: "Multimedia",
    "External MCP": "MCP externo",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Servicios externos a los que se conecta este sitio: generación de multimedia, cuentas de terceros y servidores de herramientas MCP externos.",
  },
  id: {
    Integrations: "Integrasi",
    Providers: "Penyedia",
    Media: "Media",
    "External MCP": "MCP eksternal",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Layanan luar yang terhubung dengan situs ini — pembuatan media, akun pihak ketiga, dan server alat MCP eksternal.",
  },
  de: {
    Integrations: "Integrationen",
    Providers: "Anbieter",
    Media: "Medien",
    "External MCP": "Externes MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Externe Dienste, mit denen diese Website verbunden ist – Medienerzeugung, Drittanbieterkonten und externe MCP-Tool-Server.",
  },
  "zh-CN": {
    Integrations: "集成",
    Providers: "服务商",
    Media: "媒体",
    "External MCP": "外部 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "本站连接的外部服务 — 媒体生成、第三方账户，以及外部 MCP 工具服务器。",
  },
  "zh-TW": {
    Integrations: "整合",
    Providers: "服務商",
    Media: "媒體",
    "External MCP": "外部 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "本站連接的外部服務 — 媒體生成、第三方帳戶，以及外部 MCP 工具伺服器。",
  },
  "pt-BR": {
    Integrations: "Integrações",
    Providers: "Provedores",
    Media: "Mídia",
    "External MCP": "MCP externo",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Serviços externos aos quais este site se conecta — geração de mídia, contas de terceiros e servidores de ferramentas MCP externos.",
  },
  ru: {
    Integrations: "Интеграции",
    Providers: "Провайдеры",
    Media: "Медиа",
    "External MCP": "Внешний MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Внешние сервисы, к которым подключён этот сайт — генерация медиа, сторонние аккаунты и внешние MCP-серверы инструментов.",
  },
  fa: {
    Integrations: "یکپارچه‌سازی‌ها",
    Providers: "ارائه‌دهندگان",
    Media: "رسانه",
    "External MCP": "MCP خارجی",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "سرویس‌های خارجی که این سایت به آن‌ها متصل می‌شود — تولید رسانه، حساب‌های شخص ثالث و سرورهای ابزار MCP خارجی.",
  },
  ar: {
    Integrations: "عمليات التكامل",
    Providers: "المزودون",
    Media: "الوسائط",
    "External MCP": "MCP خارجي",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "الخدمات الخارجية التي يتصل بها هذا الموقع — توليد الوسائط، وحسابات الأطراف الثالثة، وخوادم أدوات MCP الخارجية.",
  },
  ja: {
    Integrations: "連携",
    Providers: "プロバイダー",
    Media: "メディア",
    "External MCP": "外部 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "このサイトが接続する外部サービス — メディア生成、サードパーティのアカウント、外部 MCP ツールサーバー。",
  },
  ko: {
    Integrations: "통합",
    Providers: "공급자",
    Media: "미디어",
    "External MCP": "외부 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "이 사이트가 연결하는 외부 서비스 — 미디어 생성, 서드파티 계정, 외부 MCP 도구 서버.",
  },
  pl: {
    Integrations: "Integracje",
    Providers: "Dostawcy",
    Media: "Media",
    "External MCP": "Zewnętrzny MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Zewnętrzne usługi, z którymi łączy się ta witryna — generowanie mediów, konta zewnętrzne i zewnętrzne serwery narzędzi MCP.",
  },
  hu: {
    Integrations: "Integrációk",
    Providers: "Szolgáltatók",
    Media: "Médiatár",
    "External MCP": "Külső MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Külső szolgáltatások, amelyekhez ez a webhely csatlakozik – médiagenerálás, harmadik féltől származó fiókok és külső MCP-eszközkiszolgálók.",
  },
  fr: {
    Integrations: "Intégrations",
    Providers: "Fournisseurs",
    Media: "Médias",
    "External MCP": "MCP externe",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Services externes auxquels ce site se connecte — génération de médias, comptes tiers et serveurs d'outils MCP externes.",
  },
  uk: {
    Integrations: "Інтеграції",
    Providers: "Провайдери",
    Media: "Медіа",
    "External MCP": "Зовнішній MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Зовнішні сервіси, до яких підключається цей сайт — генерація медіа, сторонні акаунти та зовнішні MCP-сервери інструментів.",
  },
  tr: {
    Integrations: "Entegrasyonlar",
    Providers: "Sağlayıcılar",
    Media: "Medya",
    "External MCP": "Harici MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Bu sitenin bağlandığı dış hizmetler — medya üretimi, üçüncü taraf hesapları ve harici MCP araç sunucuları.",
  },
  th: {
    Integrations: "การผสานการทำงาน",
    Providers: "ผู้ให้บริการ",
    Media: "สื่อ",
    "External MCP": "MCP ภายนอก",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "บริการภายนอกที่ไซต์นี้เชื่อมต่อ — การสร้างสื่อ บัญชีบุคคลที่สาม และเซิร์ฟเวอร์เครื่องมือ MCP ภายนอก",
  },
  it: {
    Integrations: "Integrazioni",
    Providers: "Provider",
    Media: "Media",
    "External MCP": "MCP esterno",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Servizi esterni a cui questo sito si connette: generazione di media, account di terze parti e server di strumenti MCP esterni.",
  },
  hi: {
    Integrations: "इंटीग्रेशन",
    Providers: "प्रदाता",
    Media: "मीडिया",
    "External MCP": "बाहरी MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "बाहरी सेवाएँ जिनसे यह साइट जुड़ती है — मीडिया जनरेशन, थर्ड-पार्टी खाते, और बाहरी MCP टूल सर्वर।",
  },
  ur: {
    Integrations: "انٹیگریشنز",
    Providers: "فراہم کنندگان",
    Media: "میڈیا",
    "External MCP": "بیرونی MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "بیرونی سروسز جن سے یہ سائٹ جڑتی ہے — میڈیا جنریشن، تھرڈ پارٹی اکاؤنٹس، اور بیرونی MCP ٹول سرورز۔",
  },
  bn: {
    Integrations: "ইন্টিগ্রেশন",
    Providers: "প্রদানকারী",
    Media: "মিডিয়া",
    "External MCP": "বাহ্যিক MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "বাহ্যিক পরিষেবা যেগুলির সঙ্গে এই সাইট যুক্ত হয় — মিডিয়া জেনারেশন, তৃতীয় পক্ষের অ্যাকাউন্ট, এবং বাহ্যিক MCP টুল সার্ভার।",
  },
};

/** Same two-step fallback every other `t()` in this app uses: translated value, else the English
 *  source string itself — never a raw dictionary-miss placeholder. */
export const t = createDictionaryTranslator(PROVIDERS_DICT);
