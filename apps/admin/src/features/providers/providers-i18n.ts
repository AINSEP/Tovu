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
 *
 * EXCEPTION (2026-09-20 platform review, Finding 3): `ConnectorsBrowser`'s `gate` prop is
 * host-supplied copy, not one of Jini's own strings — Jini renders `gate.title`/`gate.body`/
 * `gate.ctaLabel` verbatim (`ConnectorGate.tsx`), with no `useT()` of its own, so unlike every other
 * string on this tab it is NOT translated by the `I18nProvider` above. It was passed as raw English
 * literals until this fix, reachable even with the Composio tab button hidden (`security/rules.ts`
 * deep-links to `/providers?tab=composio`). `composioGateCopy` below translates those three strings
 * here, on the host side, before they ever reach Jini.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

export const PROVIDERS_DICT: Record<string, Record<string, string>> = {
  es: {
    "Saved — restart Tovu to connect": "Guardado — reinicia Tovu para conectar", "Changes apply when Tovu restarts": "Los cambios se aplican al reiniciar Tovu", "Coming soon": "Próximamente", "Nothing below is connected to anything yet.": "Aún no hay nada conectado abajo.", "Webhooks can't fire yet — nothing here is wired up.": "Los webhooks aún no pueden activarse; aquí no hay nada conectado.",
    Integrations: "Integraciones",
    "Add-Ons": "Complementos",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Conexiones externas en ambas direcciones — servidores de herramientas MCP externos, cuentas de Composio, el propio servidor MCP de esta instalación y webhooks salientes.",
    Providers: "Proveedores",
    Media: "Multimedia",
    "External MCP": "MCP externo",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Servicios externos a los que se conecta este sitio: generación de multimedia, cuentas de terceros y servidores de herramientas MCP externos.",
    "Add your Composio API key to continue": "Añade tu clave de API de Composio para continuar",
    "Paste your key above to load available integrations.": "Pega tu clave arriba para cargar las integraciones disponibles.",
    "Get API Key": "Obtener clave de API",
  },
  id: {
    "Saved — restart Tovu to connect": "Tersimpan — mulai ulang Tovu untuk terhubung", "Changes apply when Tovu restarts": "Perubahan berlaku saat Tovu dimulai ulang", "Coming soon": "Segera hadir", "Nothing below is connected to anything yet.": "Belum ada apa pun di bawah yang terhubung.", "Webhooks can't fire yet — nothing here is wired up.": "Webhook belum dapat berjalan — belum ada yang terhubung di sini.",
    Integrations: "Integrasi",
    "Add-Ons": "Pengaya",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Koneksi eksternal dalam dua arah — server alat MCP eksternal, akun Composio, server MCP milik instalasi ini sendiri, dan webhook keluar.",
    Providers: "Penyedia",
    Media: "Media",
    "External MCP": "MCP eksternal",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Layanan luar yang terhubung dengan situs ini — pembuatan media, akun pihak ketiga, dan server alat MCP eksternal.",
    "Add your Composio API key to continue": "Tambahkan kunci API Composio Anda untuk melanjutkan",
    "Paste your key above to load available integrations.": "Tempelkan kunci Anda di atas untuk memuat integrasi yang tersedia.",
    "Get API Key": "Dapatkan Kunci API",
  },
  de: {
    "Saved — restart Tovu to connect": "Gespeichert — starten Sie Tovu neu, um eine Verbindung herzustellen", "Changes apply when Tovu restarts": "Änderungen werden beim Neustart von Tovu wirksam", "Coming soon": "Demnächst", "Nothing below is connected to anything yet.": "Unten ist noch nichts verbunden.", "Webhooks can't fire yet — nothing here is wired up.": "Webhooks können noch nicht ausgelöst werden — hier ist noch nichts verbunden.",
    Integrations: "Integrationen",
    "Add-Ons": "Add-ons",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Externe Verbindungen in beide Richtungen — externe MCP-Tool-Server, Composio-Konten, der eigene MCP-Server dieser Installation und ausgehende Webhooks.",
    Providers: "Anbieter",
    Media: "Medien",
    "External MCP": "Externes MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Externe Dienste, mit denen diese Website verbunden ist – Medienerzeugung, Drittanbieterkonten und externe MCP-Tool-Server.",
    "Add your Composio API key to continue": "Fügen Sie Ihren Composio-API-Schlüssel hinzu, um fortzufahren",
    "Paste your key above to load available integrations.": "Fügen Sie Ihren Schlüssel oben ein, um die verfügbaren Integrationen zu laden.",
    "Get API Key": "API-Schlüssel anfordern",
  },
  "zh-CN": {
    "Saved — restart Tovu to connect": "已保存 — 重启 Tovu 以连接", "Changes apply when Tovu restarts": "重启 Tovu 后将应用更改", "Coming soon": "即将推出", "Nothing below is connected to anything yet.": "下方尚未连接任何内容。", "Webhooks can't fire yet — nothing here is wired up.": "Webhook 还无法触发 — 此处尚未连接任何内容。",
    Integrations: "集成",
    "Add-Ons": "附加组件",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "双向的外部连接 — 外部 MCP 工具服务器、Composio 账户、本安装自身的 MCP 服务器，以及出站 Webhook。",
    Providers: "服务商",
    Media: "媒体",
    "External MCP": "外部 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "本站连接的外部服务 — 媒体生成、第三方账户，以及外部 MCP 工具服务器。",
    "Add your Composio API key to continue": "添加您的 Composio API 密钥以继续",
    "Paste your key above to load available integrations.": "在上方粘贴您的密钥以加载可用的集成。",
    "Get API Key": "获取 API 密钥",
  },
  "zh-TW": {
    "Saved — restart Tovu to connect": "已儲存 — 重新啟動 Tovu 以連線", "Changes apply when Tovu restarts": "重新啟動 Tovu 時會套用變更", "Coming soon": "即將推出", "Nothing below is connected to anything yet.": "下方尚未連線任何內容。", "Webhooks can't fire yet — nothing here is wired up.": "Webhook 尚無法觸發 — 此處尚未連線任何內容。",
    Integrations: "整合",
    "Add-Ons": "附加元件",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "雙向的外部連線 — 外部 MCP 工具伺服器、Composio 帳戶、本安裝自身的 MCP 伺服器，以及出站 Webhook。",
    Providers: "服務商",
    Media: "媒體",
    "External MCP": "外部 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "本站連接的外部服務 — 媒體生成、第三方帳戶，以及外部 MCP 工具伺服器。",
    "Add your Composio API key to continue": "新增您的 Composio API 金鑰以繼續",
    "Paste your key above to load available integrations.": "在上方貼上您的金鑰以載入可用的整合。",
    "Get API Key": "取得 API 金鑰",
  },
  "pt-BR": {
    "Saved — restart Tovu to connect": "Salvo — reinicie o Tovu para conectar", "Changes apply when Tovu restarts": "As alterações são aplicadas quando o Tovu reinicia", "Coming soon": "Em breve", "Nothing below is connected to anything yet.": "Nada abaixo está conectado a nada ainda.", "Webhooks can't fire yet — nothing here is wired up.": "Os webhooks ainda não podem disparar — nada aqui está conectado.",
    Integrations: "Integrações",
    "Add-Ons": "Complementos",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Conexões externas em ambas as direções — servidores de ferramentas MCP externos, contas do Composio, o próprio servidor MCP desta instalação e webhooks de saída.",
    Providers: "Provedores",
    Media: "Mídia",
    "External MCP": "MCP externo",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Serviços externos aos quais este site se conecta — geração de mídia, contas de terceiros e servidores de ferramentas MCP externos.",
    "Add your Composio API key to continue": "Adicione sua chave de API do Composio para continuar",
    "Paste your key above to load available integrations.": "Cole sua chave acima para carregar as integrações disponíveis.",
    "Get API Key": "Obter chave de API",
  },
  ru: {
    "Saved — restart Tovu to connect": "Сохранено — перезапустите Tovu для подключения", "Changes apply when Tovu restarts": "Изменения применятся после перезапуска Tovu", "Coming soon": "Скоро", "Nothing below is connected to anything yet.": "Ниже пока ничего не подключено.", "Webhooks can't fire yet — nothing here is wired up.": "Вебхуки пока не могут срабатывать — здесь ничего не подключено.",
    Integrations: "Интеграции",
    "Add-Ons": "Дополнения",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Внешние подключения в обоих направлениях — внешние MCP-серверы инструментов, аккаунты Composio, собственный MCP-сервер этой установки и исходящие вебхуки.",
    Providers: "Провайдеры",
    Media: "Медиа",
    "External MCP": "Внешний MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Внешние сервисы, к которым подключён этот сайт — генерация медиа, сторонние аккаунты и внешние MCP-серверы инструментов.",
    "Add your Composio API key to continue": "Добавьте ключ API Composio, чтобы продолжить",
    "Paste your key above to load available integrations.": "Вставьте ключ выше, чтобы загрузить доступные интеграции.",
    "Get API Key": "Получить ключ API",
  },
  fa: {
    "Saved — restart Tovu to connect": "ذخیره شد — برای اتصال Tovu را راه‌اندازی مجدد کنید", "Changes apply when Tovu restarts": "تغییرات با راه‌اندازی مجدد Tovu اعمال می‌شوند", "Coming soon": "به‌زودی", "Nothing below is connected to anything yet.": "هنوز چیزی در پایین به چیزی متصل نیست.", "Webhooks can't fire yet — nothing here is wired up.": "وب‌هوک‌ها هنوز نمی‌توانند اجرا شوند — چیزی در اینجا متصل نیست.",
    Integrations: "یکپارچه‌سازی‌ها",
    "Add-Ons": "افزودنی‌ها",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "اتصالات بیرونی در هر دو جهت — سرورهای ابزار MCP خارجی، حساب‌های Composio، سرور MCP خود این نصب، و وب‌هوک‌های خروجی.",
    Providers: "ارائه‌دهندگان",
    Media: "رسانه",
    "External MCP": "MCP خارجی",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "سرویس‌های خارجی که این سایت به آن‌ها متصل می‌شود — تولید رسانه، حساب‌های شخص ثالث و سرورهای ابزار MCP خارجی.",
    "Add your Composio API key to continue": "برای ادامه، کلید API ‏Composio خود را اضافه کنید",
    "Paste your key above to load available integrations.": "کلید خود را در بالا جای‌گذاری کنید تا یکپارچه‌سازی‌های موجود بارگیری شوند.",
    "Get API Key": "دریافت کلید API",
  },
  ar: {
    "Saved — restart Tovu to connect": "تم الحفظ — أعد تشغيل Tovu للاتصال", "Changes apply when Tovu restarts": "تُطبّق التغييرات عند إعادة تشغيل Tovu", "Coming soon": "قريبًا", "Nothing below is connected to anything yet.": "لا يوجد شيء أدناه متصل بأي شيء بعد.", "Webhooks can't fire yet — nothing here is wired up.": "لا يمكن لخطافات الويب العمل بعد — لا شيء هنا موصول.",
    Integrations: "عمليات التكامل",
    "Add-Ons": "الوظائف الإضافية",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "اتصالات خارجية في كلا الاتجاهين — خوادم أدوات MCP الخارجية، وحسابات Composio، وخادم MCP الخاص بهذا التثبيت، وWebhooks الصادرة.",
    Providers: "المزودون",
    Media: "الوسائط",
    "External MCP": "MCP خارجي",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "الخدمات الخارجية التي يتصل بها هذا الموقع — توليد الوسائط، وحسابات الأطراف الثالثة، وخوادم أدوات MCP الخارجية.",
    "Add your Composio API key to continue": "أضف مفتاح API الخاص بـ Composio للمتابعة",
    "Paste your key above to load available integrations.": "الصق مفتاحك أعلاه لتحميل عمليات التكامل المتاحة.",
    "Get API Key": "احصل على مفتاح API",
  },
  ja: {
    "Saved — restart Tovu to connect": "保存しました — 接続するには Tovu を再起動してください", "Changes apply when Tovu restarts": "Tovu の再起動時に変更が適用されます", "Coming soon": "近日公開", "Nothing below is connected to anything yet.": "下の項目はまだ何にも接続されていません。", "Webhooks can't fire yet — nothing here is wired up.": "Webhook はまだ発火できません — ここでは何も接続されていません。",
    Integrations: "連携",
    "Add-Ons": "アドオン",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "双方向の外部接続 — 外部 MCP ツールサーバー、Composio アカウント、このインストール自身の MCP サーバー、送信 Webhook。",
    Providers: "プロバイダー",
    Media: "メディア",
    "External MCP": "外部 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "このサイトが接続する外部サービス — メディア生成、サードパーティのアカウント、外部 MCP ツールサーバー。",
    "Add your Composio API key to continue": "続行するには Composio の API キーを追加してください",
    "Paste your key above to load available integrations.": "利用可能な連携を読み込むには、上にキーを貼り付けてください。",
    "Get API Key": "API キーを取得",
  },
  ko: {
    "Saved — restart Tovu to connect": "저장됨 — 연결하려면 Tovu를 다시 시작하세요", "Changes apply when Tovu restarts": "Tovu를 다시 시작하면 변경 사항이 적용됩니다", "Coming soon": "곧 제공", "Nothing below is connected to anything yet.": "아래 항목은 아직 아무것에도 연결되어 있지 않습니다.", "Webhooks can't fire yet — nothing here is wired up.": "웹훅은 아직 실행할 수 없습니다 — 여기에는 연결된 항목이 없습니다.",
    Integrations: "통합",
    "Add-Ons": "부가 기능",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "양방향 외부 연결 — 외부 MCP 도구 서버, Composio 계정, 이 설치 자체의 MCP 서버, 발신 웹훅.",
    Providers: "공급자",
    Media: "미디어",
    "External MCP": "외부 MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "이 사이트가 연결하는 외부 서비스 — 미디어 생성, 서드파티 계정, 외부 MCP 도구 서버.",
    "Add your Composio API key to continue": "계속하려면 Composio API 키를 추가하세요",
    "Paste your key above to load available integrations.": "사용 가능한 통합을 불러오려면 위에 키를 붙여 넣으세요.",
    "Get API Key": "API 키 받기",
  },
  pl: {
    "Saved — restart Tovu to connect": "Zapisano — uruchom ponownie Tovu, aby się połączyć", "Changes apply when Tovu restarts": "Zmiany zostaną zastosowane po ponownym uruchomieniu Tovu", "Coming soon": "Wkrótce", "Nothing below is connected to anything yet.": "Nic poniżej nie jest jeszcze podłączone.", "Webhooks can't fire yet — nothing here is wired up.": "Webhooki nie mogą jeszcze działać — nic tutaj nie jest podłączone.",
    Integrations: "Integracje",
    "Add-Ons": "Dodatki",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Zewnętrzne połączenia w obu kierunkach — zewnętrzne serwery narzędzi MCP, konta Composio, własny serwer MCP tej instalacji oraz wychodzące webhooki.",
    Providers: "Dostawcy",
    Media: "Media",
    "External MCP": "Zewnętrzny MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Zewnętrzne usługi, z którymi łączy się ta witryna — generowanie mediów, konta zewnętrzne i zewnętrzne serwery narzędzi MCP.",
    "Add your Composio API key to continue": "Dodaj klucz API Composio, aby kontynuować",
    "Paste your key above to load available integrations.": "Wklej klucz powyżej, aby wczytać dostępne integracje.",
    "Get API Key": "Uzyskaj klucz API",
  },
  hu: {
    "Saved — restart Tovu to connect": "Mentve — a csatlakozáshoz indítsa újra a Tovut", "Changes apply when Tovu restarts": "A módosítások a Tovu újraindításakor lépnek életbe", "Coming soon": "Hamarosan", "Nothing below is connected to anything yet.": "Alább még semmi sincs semmihez csatlakoztatva.", "Webhooks can't fire yet — nothing here is wired up.": "A webhookok még nem indíthatók el — itt még semmi sincs bekötve.",
    Integrations: "Integrációk",
    "Add-Ons": "Kiegészítők",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Külső kapcsolatok mindkét irányban — külső MCP-eszközkiszolgálók, Composio-fiókok, a telepítés saját MCP-kiszolgálója és kimenő webhookok.",
    Providers: "Szolgáltatók",
    Media: "Médiatár",
    "External MCP": "Külső MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Külső szolgáltatások, amelyekhez ez a webhely csatlakozik – médiagenerálás, harmadik féltől származó fiókok és külső MCP-eszközkiszolgálók.",
    "Add your Composio API key to continue": "A folytatáshoz adja meg a Composio API-kulcsát",
    "Paste your key above to load available integrations.": "Illessze be a kulcsát fent az elérhető integrációk betöltéséhez.",
    "Get API Key": "API-kulcs beszerzése",
  },
  fr: {
    "Saved — restart Tovu to connect": "Enregistré — redémarrez Tovu pour vous connecter", "Changes apply when Tovu restarts": "Les modifications s’appliquent au redémarrage de Tovu", "Coming soon": "Bientôt disponible", "Nothing below is connected to anything yet.": "Rien ci-dessous n’est encore connecté.", "Webhooks can't fire yet — nothing here is wired up.": "Les webhooks ne peuvent pas encore se déclencher — rien n’est connecté ici.",
    Integrations: "Intégrations",
    "Add-Ons": "Modules complémentaires",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Connexions externes dans les deux sens — serveurs d'outils MCP externes, comptes Composio, le propre serveur MCP de cette installation et les webhooks sortants.",
    Providers: "Fournisseurs",
    Media: "Médias",
    "External MCP": "MCP externe",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Services externes auxquels ce site se connecte — génération de médias, comptes tiers et serveurs d'outils MCP externes.",
    "Add your Composio API key to continue": "Ajoutez votre clé API Composio pour continuer",
    "Paste your key above to load available integrations.": "Collez votre clé ci-dessus pour charger les intégrations disponibles.",
    "Get API Key": "Obtenir une clé API",
  },
  uk: {
    "Saved — restart Tovu to connect": "Збережено — перезапустіть Tovu для підключення", "Changes apply when Tovu restarts": "Зміни буде застосовано після перезапуску Tovu", "Coming soon": "Незабаром", "Nothing below is connected to anything yet.": "Нижче ще нічого не підключено.", "Webhooks can't fire yet — nothing here is wired up.": "Вебхуки ще не можуть спрацьовувати — тут нічого не підключено.",
    Integrations: "Інтеграції",
    "Add-Ons": "Додатки",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Зовнішні з'єднання в обох напрямках — зовнішні MCP-сервери інструментів, облікові записи Composio, власний MCP-сервер цієї інсталяції та вихідні вебхуки.",
    Providers: "Провайдери",
    Media: "Медіа",
    "External MCP": "Зовнішній MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Зовнішні сервіси, до яких підключається цей сайт — генерація медіа, сторонні акаунти та зовнішні MCP-сервери інструментів.",
    "Add your Composio API key to continue": "Додайте свій ключ API Composio, щоб продовжити",
    "Paste your key above to load available integrations.": "Вставте ключ вище, щоб завантажити доступні інтеграції.",
    "Get API Key": "Отримати ключ API",
  },
  tr: {
    "Saved — restart Tovu to connect": "Kaydedildi — bağlanmak için Tovu'yu yeniden başlatın", "Changes apply when Tovu restarts": "Değişiklikler Tovu yeniden başlatıldığında uygulanır", "Coming soon": "Yakında", "Nothing below is connected to anything yet.": "Aşağıda henüz hiçbir şey bağlı değil.", "Webhooks can't fire yet — nothing here is wired up.": "Webhook'lar henüz tetiklenemez — burada hiçbir şey bağlı değil.",
    Integrations: "Entegrasyonlar",
    "Add-Ons": "Uzantılar",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Her iki yönde de dış bağlantılar — harici MCP araç sunucuları, Composio hesapları, bu kurulumun kendi MCP sunucusu ve giden webhook'lar.",
    Providers: "Sağlayıcılar",
    Media: "Medya",
    "External MCP": "Harici MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Bu sitenin bağlandığı dış hizmetler — medya üretimi, üçüncü taraf hesapları ve harici MCP araç sunucuları.",
    "Add your Composio API key to continue": "Devam etmek için Composio API anahtarınızı ekleyin",
    "Paste your key above to load available integrations.": "Kullanılabilir entegrasyonları yüklemek için anahtarınızı yukarıya yapıştırın.",
    "Get API Key": "API Anahtarı Al",
  },
  th: {
    "Saved — restart Tovu to connect": "บันทึกแล้ว — รีสตาร์ท Tovu เพื่อเชื่อมต่อ", "Changes apply when Tovu restarts": "การเปลี่ยนแปลงจะมีผลเมื่อ Tovu รีสตาร์ท", "Coming soon": "เร็วๆ นี้", "Nothing below is connected to anything yet.": "ด้านล่างยังไม่มีสิ่งใดเชื่อมต่ออยู่", "Webhooks can't fire yet — nothing here is wired up.": "เว็บฮุกยังทำงานไม่ได้ — ที่นี่ยังไม่มีอะไรเชื่อมต่ออยู่",
    Integrations: "การผสานการทำงาน",
    "Add-Ons": "ส่วนเสริม",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "การเชื่อมต่อภายนอกทั้งสองทิศทาง — เซิร์ฟเวอร์เครื่องมือ MCP ภายนอก บัญชี Composio เซิร์ฟเวอร์ MCP ของการติดตั้งนี้เอง และเว็บฮุคขาออก",
    Providers: "ผู้ให้บริการ",
    Media: "สื่อ",
    "External MCP": "MCP ภายนอก",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "บริการภายนอกที่ไซต์นี้เชื่อมต่อ — การสร้างสื่อ บัญชีบุคคลที่สาม และเซิร์ฟเวอร์เครื่องมือ MCP ภายนอก",
    "Add your Composio API key to continue": "เพิ่มคีย์ API ของ Composio เพื่อดำเนินการต่อ",
    "Paste your key above to load available integrations.": "วางคีย์ของคุณด้านบนเพื่อโหลดการผสานรวมที่พร้อมใช้งาน",
    "Get API Key": "รับคีย์ API",
  },
  it: {
    "Saved — restart Tovu to connect": "Salvato — riavvia Tovu per connetterti", "Changes apply when Tovu restarts": "Le modifiche vengono applicate al riavvio di Tovu", "Coming soon": "Prossimamente", "Nothing below is connected to anything yet.": "Nulla qui sotto è ancora connesso.", "Webhooks can't fire yet — nothing here is wired up.": "I webhook non possono ancora attivarsi — qui non è collegato nulla.",
    Integrations: "Integrazioni",
    "Add-Ons": "Componenti aggiuntivi",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "Connessioni esterne in entrambe le direzioni — server di strumenti MCP esterni, account Composio, il server MCP proprio di questa installazione e i webhook in uscita.",
    Providers: "Provider",
    Media: "Media",
    "External MCP": "MCP esterno",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "Servizi esterni a cui questo sito si connette: generazione di media, account di terze parti e server di strumenti MCP esterni.",
    "Add your Composio API key to continue": "Aggiungi la tua chiave API di Composio per continuare",
    "Paste your key above to load available integrations.": "Incolla la chiave qui sopra per caricare le integrazioni disponibili.",
    "Get API Key": "Ottieni chiave API",
  },
  hi: {
    "Saved — restart Tovu to connect": "सहेजा गया — कनेक्ट करने के लिए Tovu को पुनः प्रारंभ करें", "Changes apply when Tovu restarts": "Tovu के पुनः प्रारंभ होने पर बदलाव लागू होंगे", "Coming soon": "जल्द आ रहा है", "Nothing below is connected to anything yet.": "नीचे अभी कुछ भी कनेक्ट नहीं है।", "Webhooks can't fire yet — nothing here is wired up.": "वेबहुक अभी चल नहीं सकते — यहां कुछ भी जुड़ा नहीं है।",
    Integrations: "इंटीग्रेशन",
    "Add-Ons": "ऐड-ऑन",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "दोनों दिशाओं में बाहरी कनेक्शन — बाहरी MCP टूल सर्वर, Composio खाते, इस इंस्टॉलेशन का अपना MCP सर्वर, और आउटबाउंड वेबहुक।",
    Providers: "प्रदाता",
    Media: "मीडिया",
    "External MCP": "बाहरी MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "बाहरी सेवाएँ जिनसे यह साइट जुड़ती है — मीडिया जनरेशन, थर्ड-पार्टी खाते, और बाहरी MCP टूल सर्वर।",
    "Add your Composio API key to continue": "जारी रखने के लिए अपनी Composio API कुंजी जोड़ें",
    "Paste your key above to load available integrations.": "उपलब्ध इंटीग्रेशन लोड करने के लिए ऊपर अपनी कुंजी पेस्ट करें।",
    "Get API Key": "API कुंजी प्राप्त करें",
  },
  ur: {
    "Saved — restart Tovu to connect": "محفوظ ہوگیا — جڑنے کے لیے Tovu دوبارہ شروع کریں", "Changes apply when Tovu restarts": "Tovu دوبارہ شروع ہونے پر تبدیلیاں لاگو ہوں گی", "Coming soon": "جلد آرہا ہے", "Nothing below is connected to anything yet.": "نیچے ابھی کچھ بھی کسی چیز سے منسلک نہیں ہے۔", "Webhooks can't fire yet — nothing here is wired up.": "ویب ہکس ابھی چل نہیں سکتے — یہاں کچھ بھی منسلک نہیں ہے۔",
    Integrations: "انٹیگریشنز",
    "Add-Ons": "ایڈ آنز",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "دونوں سمتوں میں بیرونی رابطے — بیرونی MCP ٹول سرورز، Composio اکاؤنٹس، اس انسٹالیشن کا اپنا MCP سرور، اور آؤٹ باؤنڈ ویب ہکس۔",
    Providers: "فراہم کنندگان",
    Media: "میڈیا",
    "External MCP": "بیرونی MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "بیرونی سروسز جن سے یہ سائٹ جڑتی ہے — میڈیا جنریشن، تھرڈ پارٹی اکاؤنٹس، اور بیرونی MCP ٹول سرورز۔",
    "Add your Composio API key to continue": "جاری رکھنے کے لیے اپنی Composio API کلید شامل کریں",
    "Paste your key above to load available integrations.": "دستیاب انٹیگریشنز لوڈ کرنے کے لیے اپنی کلید اوپر پیسٹ کریں۔",
    "Get API Key": "API کلید حاصل کریں",
  },
  bn: {
    "Saved — restart Tovu to connect": "সংরক্ষিত — সংযোগ করতে Tovu পুনরায় চালু করুন", "Changes apply when Tovu restarts": "Tovu পুনরায় চালু হলে পরিবর্তনগুলি প্রয়োগ হবে", "Coming soon": "শীঘ্রই আসছে", "Nothing below is connected to anything yet.": "নিচে এখনও কিছুই সংযুক্ত নেই।", "Webhooks can't fire yet — nothing here is wired up.": "ওয়েবহুক এখনও চালু হতে পারে না — এখানে কিছুই সংযুক্ত নেই।",
    Integrations: "ইন্টিগ্রেশন",
    "Add-Ons": "অ্যাড-অন",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.":
      "উভয় দিকে বাহ্যিক সংযোগ — বাহ্যিক MCP টুল সার্ভার, Composio অ্যাকাউন্ট, এই ইনস্টলেশনের নিজস্ব MCP সার্ভার এবং আউটবাউন্ড ওয়েবহুক।",
    Providers: "প্রদানকারী",
    Media: "মিডিয়া",
    "External MCP": "বাহ্যিক MCP",
    "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.":
      "বাহ্যিক পরিষেবা যেগুলির সঙ্গে এই সাইট যুক্ত হয় — মিডিয়া জেনারেশন, তৃতীয় পক্ষের অ্যাকাউন্ট, এবং বাহ্যিক MCP টুল সার্ভার।",
    "Add your Composio API key to continue": "চালিয়ে যেতে আপনার Composio API কী যোগ করুন",
    "Paste your key above to load available integrations.": "উপলভ্য ইন্টিগ্রেশন লোড করতে উপরে আপনার কী পেস্ট করুন।",
    "Get API Key": "API কী নিন",
  },
};

/** Same two-step fallback every other `t()` in this app uses: translated value, else the English
 *  source string itself — never a raw dictionary-miss placeholder. */
export const t = createDictionaryTranslator(PROVIDERS_DICT);

/** Host-supplied copy for Jini's `ConnectorGate` — Jini renders these props verbatim (no `useT()` of
 *  its own), so they must arrive already translated. See this file's header, "EXCEPTION" note. */
export function composioGateCopy(locale: string): { title: string; body: string; ctaLabel: string } {
  return {
    title: t(locale, "Add your Composio API key to continue"),
    body: t(locale, "Paste your key above to load available integrations."),
    ctaLabel: t(locale, "Get API Key"),
  };
}
