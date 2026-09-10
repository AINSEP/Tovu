/**
 * @file Translations for the Integrations page (`features/providers/Providers.tsx`, route
 * `/admin/providers`) — this feature's own dictionary rather than the shared `lib/admin-nav-i18n.ts`
 * one, the same per-feature convention `integrations-i18n.tsx` and `plugins-i18n.ts` follow, so
 * parallel translation passes over different admin sections cannot collide on one file.
 *
 * `Integrations` and `"Add-Ons"` here are the SAME strings the nav row and group heading use — they
 * were lifted from `lib/admin-nav-i18n.ts` rather than retyped, so the page kicker/title can never
 * disagree with the group label and row label an operator just clicked. `Providers` and `Media`
 * (plus their own description string below) are unused leftovers from before the 2026-09-10 second
 * pass — kept rather than deleted (harmless, reversible) since `Providers.tsx` no longer renders
 * either; see `panels.tsx`'s own comment on the `providers` panel for the rename history.
 *
 * "Composio" is deliberately absent: it is a brand name, so every locale falls through to the
 * English source string, which is the correct rendering rather than a missing translation.
 *
 * Scope note: the TAB BODIES are not translated from here. `ConnectorsBrowser`, `ExternalMcpSettingsPanel`
 * and `IntegrationsTab` all resolve their own copy through `@jini-ai/ui`'s `useT()`, which reads the
 * `I18nProvider` mounted in `Providers.tsx` — see that file's own comment on why that provider is
 * load-bearing and not decoration. The Webhooks tab body (`Integrations`) and the "MCP Server"/
 * "Webhooks" tab LABELS both read from `features/integrations/integrations-i18n.tsx` instead —
 * carried over unchanged from `DeveloperApi.tsx`, not duplicated here.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const PROVIDERS_DICT: Record<string, Record<string, string>> = {
  es: {
    Integrations: "Integraciones",
    "Add-Ons": "Complementos",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Conexiones externas en ambas direcciones — servidores de herramientas MCP externos, cuentas de Composio, el propio servidor MCP de esta instalación y webhooks salientes.",
    Providers: "Proveedores",
    Media: "Multimedia",
    "External MCP": "MCP externo",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Servicios externos a los que se conecta este sitio: generación de multimedia, cuentas de terceros y servidores de herramientas MCP externos.",
  },
  id: {
    Integrations: "Integrasi",
    "Add-Ons": "Pengaya",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Koneksi eksternal dalam dua arah — server alat MCP eksternal, akun Composio, server MCP milik instalasi ini sendiri, dan webhook keluar.",
    Providers: "Penyedia",
    Media: "Media",
    "External MCP": "MCP eksternal",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Layanan luar yang terhubung dengan situs ini — pembuatan media, akun pihak ketiga, dan server alat MCP eksternal.",
  },
  de: {
    Integrations: "Integrationen",
    "Add-Ons": "Add-ons",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Externe Verbindungen in beide Richtungen — externe MCP-Tool-Server, Composio-Konten, der eigene MCP-Server dieser Installation und ausgehende Webhooks.",
    Providers: "Anbieter",
    Media: "Medien",
    "External MCP": "Externes MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Externe Dienste, mit denen diese Website verbunden ist – Medienerzeugung, Drittanbieterkonten und externe MCP-Tool-Server.",
  },
  "zh-CN": {
    Integrations: "集成",
    "Add-Ons": "附加组件",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "双向的外部连接 — 外部 MCP 工具服务器、Composio 账户、本安装自身的 MCP 服务器，以及出站 Webhook。",
    Providers: "服务商",
    Media: "媒体",
    "External MCP": "外部 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "本站连接的外部服务 — 媒体生成、第三方账户，以及外部 MCP 工具服务器。",
  },
  "zh-TW": {
    Integrations: "整合",
    "Add-Ons": "附加元件",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "雙向的外部連線 — 外部 MCP 工具伺服器、Composio 帳戶、本安裝自身的 MCP 伺服器，以及出站 Webhook。",
    Providers: "服務商",
    Media: "媒體",
    "External MCP": "外部 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "本站連接的外部服務 — 媒體生成、第三方帳戶，以及外部 MCP 工具伺服器。",
  },
  "pt-BR": {
    Integrations: "Integrações",
    "Add-Ons": "Complementos",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Conexões externas em ambas as direções — servidores de ferramentas MCP externos, contas do Composio, o próprio servidor MCP desta instalação e webhooks de saída.",
    Providers: "Provedores",
    Media: "Mídia",
    "External MCP": "MCP externo",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Serviços externos aos quais este site se conecta — geração de mídia, contas de terceiros e servidores de ferramentas MCP externos.",
  },
  ru: {
    Integrations: "Интеграции",
    "Add-Ons": "Дополнения",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Внешние подключения в обоих направлениях — внешние MCP-серверы инструментов, аккаунты Composio, собственный MCP-сервер этой установки и исходящие вебхуки.",
    Providers: "Провайдеры",
    Media: "Медиа",
    "External MCP": "Внешний MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Внешние сервисы, к которым подключён этот сайт — генерация медиа, сторонние аккаунты и внешние MCP-серверы инструментов.",
  },
  fa: {
    Integrations: "یکپارچه‌سازی‌ها",
    "Add-Ons": "افزودنی‌ها",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "اتصالات بیرونی در هر دو جهت — سرورهای ابزار MCP خارجی، حساب‌های Composio، سرور MCP خود این نصب، و وب‌هوک‌های خروجی.",
    Providers: "ارائه‌دهندگان",
    Media: "رسانه",
    "External MCP": "MCP خارجی",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "سرویس‌های خارجی که این سایت به آن‌ها متصل می‌شود — تولید رسانه، حساب‌های شخص ثالث و سرورهای ابزار MCP خارجی.",
  },
  ar: {
    Integrations: "عمليات التكامل",
    "Add-Ons": "الوظائف الإضافية",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "اتصالات خارجية في كلا الاتجاهين — خوادم أدوات MCP الخارجية، وحسابات Composio، وخادم MCP الخاص بهذا التثبيت، وWebhooks الصادرة.",
    Providers: "المزودون",
    Media: "الوسائط",
    "External MCP": "MCP خارجي",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "الخدمات الخارجية التي يتصل بها هذا الموقع — توليد الوسائط، وحسابات الأطراف الثالثة، وخوادم أدوات MCP الخارجية.",
  },
  ja: {
    Integrations: "連携",
    "Add-Ons": "アドオン",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "双方向の外部接続 — 外部 MCP ツールサーバー、Composio アカウント、このインストール自身の MCP サーバー、送信 Webhook。",
    Providers: "プロバイダー",
    Media: "メディア",
    "External MCP": "外部 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "このサイトが接続する外部サービス — メディア生成、サードパーティのアカウント、外部 MCP ツールサーバー。",
  },
  ko: {
    Integrations: "통합",
    "Add-Ons": "부가 기능",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "양방향 외부 연결 — 외부 MCP 도구 서버, Composio 계정, 이 설치 자체의 MCP 서버, 발신 웹훅.",
    Providers: "공급자",
    Media: "미디어",
    "External MCP": "외부 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "이 사이트가 연결하는 외부 서비스 — 미디어 생성, 서드파티 계정, 외부 MCP 도구 서버.",
  },
  pl: {
    Integrations: "Integracje",
    "Add-Ons": "Dodatki",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Zewnętrzne połączenia w obu kierunkach — zewnętrzne serwery narzędzi MCP, konta Composio, własny serwer MCP tej instalacji oraz wychodzące webhooki.",
    Providers: "Dostawcy",
    Media: "Media",
    "External MCP": "Zewnętrzny MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Zewnętrzne usługi, z którymi łączy się ta witryna — generowanie mediów, konta zewnętrzne i zewnętrzne serwery narzędzi MCP.",
  },
  hu: {
    Integrations: "Integrációk",
    "Add-Ons": "Kiegészítők",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Külső kapcsolatok mindkét irányban — külső MCP-eszközkiszolgálók, Composio-fiókok, a telepítés saját MCP-kiszolgálója és kimenő webhookok.",
    Providers: "Szolgáltatók",
    Media: "Médiatár",
    "External MCP": "Külső MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Külső szolgáltatások, amelyekhez ez a webhely csatlakozik – médiagenerálás, harmadik féltől származó fiókok és külső MCP-eszközkiszolgálók.",
  },
  fr: {
    Integrations: "Intégrations",
    "Add-Ons": "Modules complémentaires",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Connexions externes dans les deux sens — serveurs d'outils MCP externes, comptes Composio, le propre serveur MCP de cette installation et les webhooks sortants.",
    Providers: "Fournisseurs",
    Media: "Médias",
    "External MCP": "MCP externe",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Services externes auxquels ce site se connecte — génération de médias, comptes tiers et serveurs d'outils MCP externes.",
  },
  uk: {
    Integrations: "Інтеграції",
    "Add-Ons": "Додатки",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Зовнішні з'єднання в обох напрямках — зовнішні MCP-сервери інструментів, облікові записи Composio, власний MCP-сервер цієї інсталяції та вихідні вебхуки.",
    Providers: "Провайдери",
    Media: "Медіа",
    "External MCP": "Зовнішній MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Зовнішні сервіси, до яких підключається цей сайт — генерація медіа, сторонні акаунти та зовнішні MCP-сервери інструментів.",
  },
  tr: {
    Integrations: "Entegrasyonlar",
    "Add-Ons": "Uzantılar",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Her iki yönde de dış bağlantılar — harici MCP araç sunucuları, Composio hesapları, bu kurulumun kendi MCP sunucusu ve giden webhook'lar.",
    Providers: "Sağlayıcılar",
    Media: "Medya",
    "External MCP": "Harici MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Bu sitenin bağlandığı dış hizmetler — medya üretimi, üçüncü taraf hesapları ve harici MCP araç sunucuları.",
  },
  th: {
    Integrations: "การผสานการทำงาน",
    "Add-Ons": "ส่วนเสริม",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "การเชื่อมต่อภายนอกทั้งสองทิศทาง — เซิร์ฟเวอร์เครื่องมือ MCP ภายนอก บัญชี Composio เซิร์ฟเวอร์ MCP ของการติดตั้งนี้เอง และเว็บฮุคขาออก",
    Providers: "ผู้ให้บริการ",
    Media: "สื่อ",
    "External MCP": "MCP ภายนอก",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "บริการภายนอกที่ไซต์นี้เชื่อมต่อ — การสร้างสื่อ บัญชีบุคคลที่สาม และเซิร์ฟเวอร์เครื่องมือ MCP ภายนอก",
  },
  it: {
    Integrations: "Integrazioni",
    "Add-Ons": "Componenti aggiuntivi",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Connessioni esterne in entrambe le direzioni — server di strumenti MCP esterni, account Composio, il server MCP proprio di questa installazione e i webhook in uscita.",
    Providers: "Provider",
    Media: "Media",
    "External MCP": "MCP esterno",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Servizi esterni a cui questo sito si connette: generazione di media, account di terze parti e server di strumenti MCP esterni.",
  },
  hi: {
    Integrations: "इंटीग्रेशन",
    "Add-Ons": "ऐड-ऑन",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "दोनों दिशाओं में बाहरी कनेक्शन — बाहरी MCP टूल सर्वर, Composio खाते, इस इंस्टॉलेशन का अपना MCP सर्वर, और आउटबाउंड वेबहुक।",
    Providers: "प्रदाता",
    Media: "मीडिया",
    "External MCP": "बाहरी MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "बाहरी सेवाएँ जिनसे यह साइट जुड़ती है — मीडिया जनरेशन, थर्ड-पार्टी खाते, और बाहरी MCP टूल सर्वर।",
  },
  ur: {
    Integrations: "انٹیگریشنز",
    "Add-Ons": "ایڈ آنز",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "دونوں سمتوں میں بیرونی رابطے — بیرونی MCP ٹول سرورز، Composio اکاؤنٹس، اس انسٹالیشن کا اپنا MCP سرور، اور آؤٹ باؤنڈ ویب ہکس۔",
    Providers: "فراہم کنندگان",
    Media: "میڈیا",
    "External MCP": "بیرونی MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "بیرونی سروسز جن سے یہ سائٹ جڑتی ہے — میڈیا جنریشن، تھرڈ پارٹی اکاؤنٹس، اور بیرونی MCP ٹول سرورز۔",
  },
  bn: {
    Integrations: "ইন্টিগ্রেশন",
    "Add-Ons": "অ্যাড-অন",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "উভয় দিকে বাহ্যিক সংযোগ — বাহ্যিক MCP টুল সার্ভার, Composio অ্যাকাউন্ট, এই ইনস্টলেশনের নিজস্ব MCP সার্ভার এবং আউটবাউন্ড ওয়েবহুক।",
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
