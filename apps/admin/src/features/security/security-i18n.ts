import { interpolate } from "../../lib/template-i18n";
import { createDictionaryTranslator } from "../../lib/dictionary-translator";
import type { OtherCredentialStoreInfo } from "./rules";

/** Feature-specific Security copy. Shared chrome such as Save and Cancel falls back to COMMON_I18N. */
const SECURITY_DICT: Record<string, Record<string, string>> = {
  en: {
    "unknown error": "unknown error", "this workspace": "this workspace", All: "All", "Source control": "Source control", Hosting: "Hosting", Media: "Media", AI: "AI", Ops: "Ops", General: "General",
    "External MCP servers": "External MCP servers", "Providers · External MCP": "Providers · External MCP", "No environment variables set": "No environment variables set", "1 environment variable set": "1 environment variable set", "{count} environment variables set": "{count} environment variables set", Connected: "Connected", "Connected as: {label}": "Connected as: {label}",
  },
  es: {
    "unknown error": "error desconocido", "this workspace": "este espacio de trabajo", All: "Todos", "Source control": "Control de código fuente", Hosting: "Alojamiento", Media: "Medios", AI: "IA", Ops: "Operaciones", General: "General",
    "External MCP servers": "Servidores MCP externos", "Providers · External MCP": "Proveedores · MCP externo", "No environment variables set": "No hay variables de entorno configuradas", "1 environment variable set": "1 variable de entorno configurada", "{count} environment variables set": "{count} variables de entorno configuradas", Connected: "Conectado", "Connected as: {label}": "Conectado como: {label}",
  },
  de: {
    "unknown error": "unbekannter Fehler", "this workspace": "dieser Arbeitsbereich", All: "Alle", "Source control": "Quellcodeverwaltung", Hosting: "Hosting", Media: "Medien", AI: "KI", Ops: "Betrieb", General: "Allgemein",
    "External MCP servers": "Externe MCP-Server", "Providers · External MCP": "Anbieter · Externes MCP", "No environment variables set": "Keine Umgebungsvariablen festgelegt", "1 environment variable set": "1 Umgebungsvariable festgelegt", "{count} environment variables set": "{count} Umgebungsvariablen festgelegt", Connected: "Verbunden", "Connected as: {label}": "Verbunden als: {label}",
  },
  fr: {
    "unknown error": "erreur inconnue", "this workspace": "cet espace de travail", All: "Tous", "Source control": "Gestion du code source", Hosting: "Hébergement", Media: "Médias", AI: "IA", Ops: "Opérations", General: "Général",
    "External MCP servers": "Serveurs MCP externes", "Providers · External MCP": "Fournisseurs · MCP externe", "No environment variables set": "Aucune variable d'environnement définie", "1 environment variable set": "1 variable d'environnement définie", "{count} environment variables set": "{count} variables d'environnement définies", Connected: "Connecté", "Connected as: {label}": "Connecté en tant que : {label}",
  },
  it: {
    "unknown error": "errore sconosciuto", "this workspace": "questo spazio di lavoro", All: "Tutti", "Source control": "Controllo del codice sorgente", Hosting: "Hosting", Media: "Media", AI: "IA", Ops: "Operazioni", General: "Generale",
    "External MCP servers": "Server MCP esterni", "Providers · External MCP": "Provider · MCP esterno", "No environment variables set": "Nessuna variabile d'ambiente impostata", "1 environment variable set": "1 variabile d'ambiente impostata", "{count} environment variables set": "{count} variabili d'ambiente impostate", Connected: "Connesso", "Connected as: {label}": "Connesso come: {label}",
  },
  "pt-BR": {
    "unknown error": "erro desconhecido", "this workspace": "este espaço de trabalho", All: "Todos", "Source control": "Controle de código-fonte", Hosting: "Hospedagem", Media: "Mídia", AI: "IA", Ops: "Operações", General: "Geral",
    "External MCP servers": "Servidores MCP externos", "Providers · External MCP": "Provedores · MCP externo", "No environment variables set": "Nenhuma variável de ambiente definida", "1 environment variable set": "1 variável de ambiente definida", "{count} environment variables set": "{count} variáveis de ambiente definidas", Connected: "Conectado", "Connected as: {label}": "Conectado como: {label}",
  },
  pl: {
    "unknown error": "nieznany błąd", "this workspace": "ten obszar roboczy", All: "Wszystkie", "Source control": "Kontrola wersji", Hosting: "Hosting", Media: "Media", AI: "AI", Ops: "Operacje", General: "Ogólne",
    "External MCP servers": "Zewnętrzne serwery MCP", "Providers · External MCP": "Dostawcy · Zewnętrzne MCP", "No environment variables set": "Nie ustawiono zmiennych środowiskowych", "1 environment variable set": "Ustawiono 1 zmienną środowiskową", "{count} environment variables set": "Ustawiono {count} zmiennych środowiskowych", Connected: "Połączono", "Connected as: {label}": "Połączono jako: {label}",
  },
  hu: {
    "unknown error": "ismeretlen hiba", "this workspace": "ez a munkaterület", All: "Összes", "Source control": "Forráskód-kezelés", Hosting: "Tárhely", Media: "Média", AI: "MI", Ops: "Műveletek", General: "Általános",
    "External MCP servers": "Külső MCP-kiszolgálók", "Providers · External MCP": "Szolgáltatók · Külső MCP", "No environment variables set": "Nincsenek beállított környezeti változók", "1 environment variable set": "1 környezeti változó van beállítva", "{count} environment variables set": "{count} környezeti változó van beállítva", Connected: "Csatlakoztatva", "Connected as: {label}": "Csatlakozva mint: {label}",
  },
  tr: {
    "unknown error": "bilinmeyen hata", "this workspace": "bu çalışma alanı", All: "Tümü", "Source control": "Kaynak kod yönetimi", Hosting: "Barındırma", Media: "Medya", AI: "YZ", Ops: "İşlemler", General: "Genel",
    "External MCP servers": "Harici MCP sunucuları", "Providers · External MCP": "Sağlayıcılar · Harici MCP", "No environment variables set": "Ortam değişkeni ayarlanmadı", "1 environment variable set": "1 ortam değişkeni ayarlandı", "{count} environment variables set": "{count} ortam değişkeni ayarlandı", Connected: "Bağlandı", "Connected as: {label}": "Şu olarak bağlandı: {label}",
  },
  ru: {
    "unknown error": "неизвестная ошибка", "this workspace": "это рабочее пространство", All: "Все", "Source control": "Управление исходным кодом", Hosting: "Хостинг", Media: "Медиа", AI: "ИИ", Ops: "Операции", General: "Общее",
    "External MCP servers": "Внешние серверы MCP", "Providers · External MCP": "Провайдеры · Внешний MCP", "No environment variables set": "Переменные окружения не заданы", "1 environment variable set": "Задана 1 переменная окружения", "{count} environment variables set": "Задано переменных окружения: {count}", Connected: "Подключено", "Connected as: {label}": "Подключено как: {label}",
  },
  uk: {
    "unknown error": "невідома помилка", "this workspace": "цей робочий простір", All: "Усі", "Source control": "Керування вихідним кодом", Hosting: "Хостинг", Media: "Медіа", AI: "ШІ", Ops: "Операції", General: "Загальне",
    "External MCP servers": "Зовнішні сервери MCP", "Providers · External MCP": "Постачальники · Зовнішній MCP", "No environment variables set": "Змінні середовища не встановлено", "1 environment variable set": "Встановлено 1 змінну середовища", "{count} environment variables set": "Встановлено змінних середовища: {count}", Connected: "Підключено", "Connected as: {label}": "Підключено як: {label}",
  },
  id: {
    "unknown error": "kesalahan tidak diketahui", "this workspace": "ruang kerja ini", All: "Semua", "Source control": "Kontrol sumber", Hosting: "Hosting", Media: "Media", AI: "AI", Ops: "Operasi", General: "Umum",
    "External MCP servers": "Server MCP eksternal", "Providers · External MCP": "Penyedia · MCP eksternal", "No environment variables set": "Tidak ada variabel lingkungan yang ditetapkan", "1 environment variable set": "1 variabel lingkungan ditetapkan", "{count} environment variables set": "{count} variabel lingkungan ditetapkan", Connected: "Terhubung", "Connected as: {label}": "Terhubung sebagai: {label}",
  },
  ar: {
    "unknown error": "خطأ غير معروف", "this workspace": "مساحة العمل هذه", All: "الكل", "Source control": "إدارة الشفرة المصدرية", Hosting: "الاستضافة", Media: "الوسائط", AI: "الذكاء الاصطناعي", Ops: "العمليات", General: "عام",
    "External MCP servers": "خوادم MCP الخارجية", "Providers · External MCP": "الموفرون · MCP خارجي", "No environment variables set": "لم يتم تعيين متغيرات بيئة", "1 environment variable set": "تم تعيين متغير بيئة واحد", "{count} environment variables set": "تم تعيين {count} من متغيرات البيئة", Connected: "متصل", "Connected as: {label}": "متصل باسم: {label}",
  },
  fa: {
    "unknown error": "خطای ناشناخته", "this workspace": "این فضای کاری", All: "همه", "Source control": "کنترل کد منبع", Hosting: "میزبانی", Media: "رسانه", AI: "هوش مصنوعی", Ops: "عملیات", General: "عمومی",
    "External MCP servers": "سرورهای MCP خارجی", "Providers · External MCP": "ارائه‌دهندگان · MCP خارجی", "No environment variables set": "هیچ متغیر محیطی تنظیم نشده است", "1 environment variable set": "۱ متغیر محیطی تنظیم شده است", "{count} environment variables set": "{count} متغیر محیطی تنظیم شده است", Connected: "متصل", "Connected as: {label}": "متصل به‌عنوان: {label}",
  },
  hi: {
    "unknown error": "अज्ञात त्रुटि", "this workspace": "यह कार्यस्थान", All: "सभी", "Source control": "स्रोत नियंत्रण", Hosting: "होस्टिंग", Media: "मीडिया", AI: "AI", Ops: "संचालन", General: "सामान्य",
    "External MCP servers": "बाहरी MCP सर्वर", "Providers · External MCP": "प्रदाता · बाहरी MCP", "No environment variables set": "कोई परिवेश चर सेट नहीं है", "1 environment variable set": "1 परिवेश चर सेट है", "{count} environment variables set": "{count} परिवेश चर सेट हैं", Connected: "कनेक्टेड", "Connected as: {label}": "इस रूप में कनेक्टेड: {label}",
  },
  bn: {
    "unknown error": "অজানা ত্রুটি", "this workspace": "এই কর্মক্ষেত্র", All: "সব", "Source control": "সোর্স নিয়ন্ত্রণ", Hosting: "হোস্টিং", Media: "মিডিয়া", AI: "AI", Ops: "কার্যক্রম", General: "সাধারণ",
    "External MCP servers": "বাহ্যিক MCP সার্ভার", "Providers · External MCP": "প্রদানকারী · বাহ্যিক MCP", "No environment variables set": "কোনো পরিবেশ ভেরিয়েবল সেট করা নেই", "1 environment variable set": "1টি পরিবেশ ভেরিয়েবল সেট করা আছে", "{count} environment variables set": "{count}টি পরিবেশ ভেরিয়েবল সেট করা আছে", Connected: "সংযুক্ত", "Connected as: {label}": "এই হিসেবে সংযুক্ত: {label}",
  },
  ur: {
    "unknown error": "نامعلوم خرابی", "this workspace": "یہ ورک اسپیس", All: "سب", "Source control": "ماخذ کنٹرول", Hosting: "ہوسٹنگ", Media: "میڈیا", AI: "AI", Ops: "عملیات", General: "عمومی",
    "External MCP servers": "بیرونی MCP سرورز", "Providers · External MCP": "فراہم کنندگان · بیرونی MCP", "No environment variables set": "کوئی ماحول متغیر سیٹ نہیں ہے", "1 environment variable set": "1 ماحول متغیر سیٹ ہے", "{count} environment variables set": "{count} ماحول متغیر سیٹ ہیں", Connected: "منسلک", "Connected as: {label}": "بطور منسلک: {label}",
  },
  ja: {
    "unknown error": "不明なエラー", "this workspace": "このワークスペース", All: "すべて", "Source control": "ソース管理", Hosting: "ホスティング", Media: "メディア", AI: "AI", Ops: "運用", General: "一般",
    "External MCP servers": "外部 MCP サーバー", "Providers · External MCP": "プロバイダー · 外部 MCP", "No environment variables set": "環境変数は設定されていません", "1 environment variable set": "環境変数が 1 件設定されています", "{count} environment variables set": "環境変数が {count} 件設定されています", Connected: "接続済み", "Connected as: {label}": "接続先: {label}",
  },
  ko: {
    "unknown error": "알 수 없는 오류", "this workspace": "이 작업 공간", All: "전체", "Source control": "소스 제어", Hosting: "호스팅", Media: "미디어", AI: "AI", Ops: "운영", General: "일반",
    "External MCP servers": "외부 MCP 서버", "Providers · External MCP": "공급자 · 외부 MCP", "No environment variables set": "설정된 환경 변수가 없습니다", "1 environment variable set": "환경 변수 1개가 설정되었습니다", "{count} environment variables set": "환경 변수 {count}개가 설정되었습니다", Connected: "연결됨", "Connected as: {label}": "다음으로 연결됨: {label}",
  },
  th: {
    "unknown error": "ข้อผิดพลาดที่ไม่ทราบสาเหตุ", "this workspace": "พื้นที่ทำงานนี้", All: "ทั้งหมด", "Source control": "การควบคุมซอร์ส", Hosting: "โฮสติ้ง", Media: "สื่อ", AI: "AI", Ops: "การดำเนินงาน", General: "ทั่วไป",
    "External MCP servers": "เซิร์ฟเวอร์ MCP ภายนอก", "Providers · External MCP": "ผู้ให้บริการ · MCP ภายนอก", "No environment variables set": "ไม่ได้ตั้งค่าตัวแปรสภาพแวดล้อม", "1 environment variable set": "ตั้งค่าตัวแปรสภาพแวดล้อม 1 รายการ", "{count} environment variables set": "ตั้งค่าตัวแปรสภาพแวดล้อม {count} รายการ", Connected: "เชื่อมต่อแล้ว", "Connected as: {label}": "เชื่อมต่อเป็น: {label}",
  },
  "zh-CN": {
    "unknown error": "未知错误", "this workspace": "此工作区", All: "全部", "Source control": "源代码管理", Hosting: "托管", Media: "媒体", AI: "AI", Ops: "运维", General: "常规",
    "External MCP servers": "外部 MCP 服务器", "Providers · External MCP": "提供商 · 外部 MCP", "No environment variables set": "未设置环境变量", "1 environment variable set": "已设置 1 个环境变量", "{count} environment variables set": "已设置 {count} 个环境变量", Connected: "已连接", "Connected as: {label}": "连接身份：{label}",
  },
  "zh-TW": {
    "unknown error": "未知錯誤", "this workspace": "此工作區", All: "全部", "Source control": "原始碼管理", Hosting: "代管", Media: "媒體", AI: "AI", Ops: "維運", General: "一般",
    "External MCP servers": "外部 MCP 伺服器", "Providers · External MCP": "提供者 · 外部 MCP", "No environment variables set": "未設定環境變數", "1 environment variable set": "已設定 1 個環境變數", "{count} environment variables set": "已設定 {count} 個環境變數", Connected: "已連線", "Connected as: {label}": "連線身分：{label}",
  },
};

export const t = createDictionaryTranslator(SECURITY_DICT);

/** Load error banner — same `{error}`-interpolated template shape
 *  `publishCredentialsLoadErrorMessage`/`sourceControlCredentialsLoadErrorMessage` use. */
const ACCESS_TOKENS_LOAD_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't load saved access tokens: {error}",
};
export function accessTokensLoadErrorMessage(locale: string, error: string): string {
  return interpolate(ACCESS_TOKENS_LOAD_ERROR_TEMPLATE[locale] ?? ACCESS_TOKENS_LOAD_ERROR_TEMPLATE.en!, { error });
}

/** One row's save-error banner — mirrors `publishCredentialSaveErrorMessage`'s exact shape. */
const ACCESS_TOKEN_SAVE_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't save this token: {error}",
};
export function accessTokenSaveErrorMessage(locale: string, error: string): string {
  return interpolate(ACCESS_TOKEN_SAVE_ERROR_TEMPLATE[locale] ?? ACCESS_TOKEN_SAVE_ERROR_TEMPLATE.en!, { error });
}

/** A failed Remove — its own action-specific wording, distinct from
 *  {@link accessTokenSaveErrorMessage}'s "save" copy, so a failed removal never reads as a failed
 *  save (Terra audit MEDIUM finding, 2026-08-19: `removeToken` used to await its API call with no
 *  error handling at all, so a rejected call produced no visible change). */
const ACCESS_TOKEN_REMOVE_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't remove this token: {error}",
};
export function accessTokenRemoveErrorMessage(locale: string, error: string): string {
  return interpolate(ACCESS_TOKEN_REMOVE_ERROR_TEMPLATE[locale] ?? ACCESS_TOKEN_REMOVE_ERROR_TEMPLATE.en!, { error });
}

/** A failed "Make default" — same action-specific reasoning as {@link accessTokenRemoveErrorMessage}. */
const ACCESS_TOKEN_MAKE_DEFAULT_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't make this token the default: {error}",
};
export function accessTokenMakeDefaultErrorMessage(locale: string, error: string): string {
  return interpolate(ACCESS_TOKEN_MAKE_DEFAULT_ERROR_TEMPLATE[locale] ?? ACCESS_TOKEN_MAKE_DEFAULT_ERROR_TEMPLATE.en!, { error });
}

/** A duplicate-name rejection — this page's own case, since neither origin store's dictionary has a
 *  template naming a PROVIDER + a NAME the way this page's uniqueness check does (`rules.ts`'s
 *  `accessTokenNameTaken`). */
const ACCESS_TOKEN_DUPLICATE_NAME_TEMPLATE: Record<string, string> = {
  en: 'A token named "{name}" already exists for {provider}.',
};
export function accessTokenDuplicateNameMessage(locale: string, name: string, provider: string): string {
  return interpolate(ACCESS_TOKEN_DUPLICATE_NAME_TEMPLATE[locale] ?? ACCESS_TOKEN_DUPLICATE_NAME_TEMPLATE.en!, { name, provider });
}

/** The Remove confirm dialog's three pieces of copy (`rules.ts`'s own "Remove from Tovu, never
 *  Revoke" load-bearing constraint — `development/todos.md:1208`) — kept as templates rather than
 *  built from `t()` fragments plus raw JSX spans, since the load-bearing FACT here (removing here
 *  does not revoke there) is exactly the kind of sentence that must not fragment across a
 *  flat-dictionary boundary and risk a future translator reordering it into something that drops or
 *  inverts the claim. */
const REMOVE_DIALOG_TITLE_TEMPLATE: Record<string, string> = { en: 'Remove "{name}" from Tovu?' };
export function removeDialogTitle(locale: string, name: string): string {
  return interpolate(REMOVE_DIALOG_TITLE_TEMPLATE[locale] ?? REMOVE_DIALOG_TITLE_TEMPLATE.en!, { name });
}

/** Two placeholders, not one: `{credentialLabel}` (what the saved row is FOR — `AccessTokenProviderInfo.label`,
 *  e.g. "GitHub Pages") and `{vendor}` (who actually issues/revokes it — `AccessTokenProviderInfo.vendorLabel`,
 *  e.g. "GitHub"). Collapsing both into one `{provider}` placeholder was the owner-reported bug: this
 *  sentence told an operator to revoke "on GitHub Pages", which has no revoke console of its own. See
 *  `rules.ts`'s `AccessTokenProviderInfo.vendorLabel` doc for the full reasoning. */
const REMOVE_DIALOG_BODY_TEMPLATE: Record<string, string> = {
  en: "This deletes Tovu's saved copy of this {credentialLabel} token. It does NOT revoke the token on {vendor} — it stays valid there until you revoke it yourself.",
};
export function removeDialogBody(locale: string, credentialLabel: string, vendor: string): string {
  return interpolate(REMOVE_DIALOG_BODY_TEMPLATE[locale] ?? REMOVE_DIALOG_BODY_TEMPLATE.en!, { credentialLabel, vendor });
}

/** `external-mcp`'s Remove body — the shared {@link removeDialogBody} does not fit: there is no
 *  vendor console to revoke on, and what is lost (a sealed OAuth secret the read API never returns)
 *  cannot be restored. Fully translated, unlike this file's other templates (see its header's KNOWN
 *  GAP): this sentence guards an unrecoverable delete, so it must not degrade to English. */
const REMOVE_DIALOG_EXTERNAL_MCP_BODY: Record<string, string> = {
  en: "This deletes the server and its saved credentials. It can't be undone — you'd have to set it up again, and sign in again if it uses OAuth.",
  es: "Esto elimina el servidor y sus credenciales guardadas. No se puede deshacer: tendrías que configurarlo de nuevo y volver a iniciar sesión si usa OAuth.",
  id: "Ini menghapus server dan kredensial tersimpannya. Tindakan ini tidak dapat dibatalkan — Anda harus menyiapkannya lagi, dan masuk lagi jika menggunakan OAuth.",
  de: "Dadurch werden der Server und seine gespeicherten Zugangsdaten gelöscht. Das lässt sich nicht rückgängig machen – Sie müssten ihn neu einrichten und sich erneut anmelden, falls er OAuth verwendet.",
  "zh-CN": "这会删除该服务器及其已保存的凭据。此操作无法撤销——你需要重新设置它；如果它使用 OAuth，还需要重新登录。",
  "zh-TW": "這會刪除該伺服器及其已儲存的憑證。此操作無法復原——你需要重新設定它；如果它使用 OAuth，還需要重新登入。",
  "pt-BR": "Isso exclui o servidor e as credenciais salvas dele. Não é possível desfazer — você teria que configurá-lo de novo e entrar novamente se ele usar OAuth.",
  ru: "Это удалит сервер и его сохранённые учётные данные. Отменить это нельзя — придётся настроить его заново и снова войти, если он использует OAuth.",
  fa: "این کار سرور و اطلاعات ورود ذخیره‌شده‌اش را حذف می‌کند. قابل بازگشت نیست — باید دوباره آن را راه‌اندازی کنید و اگر از OAuth استفاده می‌کند، دوباره وارد شوید.",
  ar: "سيؤدي هذا إلى حذف الخادم وبيانات الاعتماد المحفوظة الخاصة به. لا يمكن التراجع عن ذلك — سيتعين عليك إعداده من جديد، وتسجيل الدخول مرة أخرى إذا كان يستخدم OAuth.",
  ja: "サーバーと保存済みの認証情報を削除します。元に戻せません。再度使うにはセットアップし直す必要があり、OAuth を使う場合はもう一度サインインが必要です。",
  ko: "서버와 저장된 자격 증명이 삭제됩니다. 되돌릴 수 없습니다. 다시 사용하려면 새로 설정해야 하며, OAuth를 사용하는 경우 다시 로그인해야 합니다.",
  pl: "Spowoduje to usunięcie serwera i jego zapisanych danych uwierzytelniających. Tej operacji nie można cofnąć — trzeba będzie skonfigurować go od nowa i zalogować się ponownie, jeśli używa OAuth.",
  hu: "Ez törli a szervert és a mentett hitelesítő adatait. Nem vonható vissza — újra be kellene állítani, és ha OAuth-ot használ, újra be kellene jelentkezni.",
  fr: "Cela supprime le serveur et ses identifiants enregistrés. Cette action est irréversible : vous devriez le reconfigurer, et vous reconnecter s'il utilise OAuth.",
  uk: "Це видалить сервер і його збережені облікові дані. Скасувати це неможливо — доведеться налаштувати його заново й знову увійти, якщо він використовує OAuth.",
  tr: "Bu işlem sunucuyu ve kayıtlı kimlik bilgilerini siler. Geri alınamaz — yeniden kurmanız ve OAuth kullanıyorsa yeniden oturum açmanız gerekir.",
  th: "การดำเนินการนี้จะลบเซิร์ฟเวอร์และข้อมูลรับรองที่บันทึกไว้ ไม่สามารถเลิกทำได้ — คุณจะต้องตั้งค่าใหม่ และลงชื่อเข้าใช้อีกครั้งหากใช้ OAuth",
  it: "Questa operazione elimina il server e le relative credenziali salvate. Non è reversibile: dovresti configurarlo di nuovo e accedere di nuovo se usa OAuth.",
  hi: "इससे सर्वर और उसके सहेजे गए क्रेडेंशियल हट जाएंगे। इसे पूर्ववत नहीं किया जा सकता — आपको इसे फिर से सेट अप करना होगा, और यदि यह OAuth का उपयोग करता है तो फिर से साइन इन करना होगा।",
  ur: "اس سے سرور اور اس کی محفوظ کردہ اسناد حذف ہو جائیں گی۔ اسے واپس نہیں لیا جا سکتا — آپ کو اسے دوبارہ سیٹ اپ کرنا ہوگا، اور اگر یہ OAuth استعمال کرتا ہے تو دوبارہ سائن ان کرنا ہوگا۔",
  bn: "এটি সার্ভার এবং এর সংরক্ষিত ক্রেডেনশিয়াল মুছে ফেলবে। এটি পূর্বাবস্থায় ফেরানো যাবে না — আপনাকে এটি আবার সেট আপ করতে হবে, এবং OAuth ব্যবহার করলে আবার সাইন ইন করতে হবে।",
};

/** `composio-connector`'s Remove body — here the shared {@link removeDialogBody} would be FALSE:
 *  `POST …/connectors/:id/disconnect` revokes the account at Composio (that route's own header),
 *  so "It does NOT revoke the token" must never be said about this store. Fully translated for the
 *  same reason as {@link REMOVE_DIALOG_EXTERNAL_MCP_BODY}. */
const REMOVE_DIALOG_COMPOSIO_CONNECTOR_BODY: Record<string, string> = {
  en: "This disconnects the account and revokes its access at Composio. To use it again, you'd have to connect it and sign in again.",
  es: "Esto desconecta la cuenta y revoca su acceso en Composio. Para volver a usarla, tendrías que conectarla e iniciar sesión de nuevo.",
  id: "Ini memutus akun dan mencabut aksesnya di Composio. Untuk menggunakannya lagi, Anda harus menghubungkannya dan masuk lagi.",
  de: "Dadurch wird das Konto getrennt und sein Zugriff bei Composio widerrufen. Um es wieder zu nutzen, müssten Sie es erneut verbinden und sich neu anmelden.",
  "zh-CN": "这会断开该账户，并在 Composio 撤销其访问权限。要再次使用，你需要重新连接并重新登录。",
  "zh-TW": "這會中斷該帳戶的連線，並在 Composio 撤銷其存取權限。要再次使用，你需要重新連線並重新登入。",
  "pt-BR": "Isso desconecta a conta e revoga o acesso dela no Composio. Para usá-la de novo, você teria que conectá-la e entrar novamente.",
  ru: "Это отключит аккаунт и отзовёт его доступ в Composio. Чтобы снова им пользоваться, придётся подключить его и войти заново.",
  fa: "این کار حساب را قطع می‌کند و دسترسی آن را در Composio لغو می‌کند. برای استفادهٔ دوباره، باید دوباره آن را متصل کنید و وارد شوید.",
  ar: "سيؤدي هذا إلى فصل الحساب وإلغاء وصوله في Composio. لاستخدامه مجددًا، سيتعين عليك ربطه وتسجيل الدخول مرة أخرى.",
  ja: "アカウントの接続を解除し、Composio でのアクセス権を取り消します。再度使うには、もう一度接続してサインインする必要があります。",
  ko: "계정 연결이 해제되고 Composio에서 액세스 권한이 취소됩니다. 다시 사용하려면 다시 연결하고 로그인해야 합니다.",
  pl: "Spowoduje to odłączenie konta i cofnięcie jego dostępu w Composio. Aby znów z niego korzystać, trzeba będzie połączyć je ponownie i się zalogować.",
  hu: "Ez leválasztja a fiókot, és visszavonja a hozzáférését a Composióban. Az újbóli használathoz újra össze kellene kapcsolni és be kellene jelentkezni.",
  fr: "Cela déconnecte le compte et révoque son accès sur Composio. Pour l'utiliser à nouveau, vous devriez le reconnecter et vous connecter de nouveau.",
  uk: "Це від'єднає обліковий запис і відкличе його доступ у Composio. Щоб знову ним користуватися, доведеться під'єднати його й увійти заново.",
  tr: "Bu işlem hesabın bağlantısını keser ve Composio'daki erişimini iptal eder. Yeniden kullanmak için tekrar bağlamanız ve oturum açmanız gerekir.",
  th: "การดำเนินการนี้จะยกเลิกการเชื่อมต่อบัญชีและเพิกถอนสิทธิ์การเข้าถึงใน Composio หากต้องการใช้อีกครั้ง คุณจะต้องเชื่อมต่อและลงชื่อเข้าใช้ใหม่",
  it: "Questa operazione scollega l'account e ne revoca l'accesso su Composio. Per usarlo di nuovo, dovresti ricollegarlo e accedere di nuovo.",
  hi: "इससे खाता डिस्कनेक्ट हो जाएगा और Composio पर उसकी पहुँच रद्द हो जाएगी। इसे फिर से उपयोग करने के लिए आपको इसे दोबारा कनेक्ट करना और साइन इन करना होगा।",
  ur: "اس سے اکاؤنٹ منقطع ہو جائے گا اور Composio پر اس کی رسائی منسوخ ہو جائے گی۔ اسے دوبارہ استعمال کرنے کے لیے آپ کو اسے پھر سے منسلک کر کے سائن ان کرنا ہوگا۔",
  bn: "এটি অ্যাকাউন্টটি সংযোগ বিচ্ছিন্ন করবে এবং Composio-তে এর অ্যাক্সেস প্রত্যাহার করবে। আবার ব্যবহার করতে, আপনাকে এটি আবার সংযুক্ত করে সাইন ইন করতে হবে।",
};

/** The Tier-2 Remove dialog's body, per store — the two non-replaceable stores get their own
 *  wording (above), the other four keep {@link removeDialogBody} with `purposeLabel` for both
 *  placeholders, exactly as before (Tier 2 has no vendor/destination split — its deep links go to
 *  Tovu's own screens). @complexity O(1). */
export function otherCredentialRemoveDialogBody(locale: string, store: Pick<OtherCredentialStoreInfo, "id" | "purposeLabel">): string {
  if (store.id === "external-mcp") return REMOVE_DIALOG_EXTERNAL_MCP_BODY[locale] ?? REMOVE_DIALOG_EXTERNAL_MCP_BODY.en!;
  if (store.id === "composio-connector") return REMOVE_DIALOG_COMPOSIO_CONNECTOR_BODY[locale] ?? REMOVE_DIALOG_COMPOSIO_CONNECTOR_BODY.en!;
  return removeDialogBody(locale, store.purposeLabel, store.purposeLabel);
}

const REMOVE_DIALOG_LAST_ROW_TEMPLATE: Record<string, string> = {
  en: "This is the only saved {provider} token — after removing it, nothing here will be marked as connected.",
};
export function removeDialogLastRowNote(locale: string, provider: string): string {
  return interpolate(REMOVE_DIALOG_LAST_ROW_TEMPLATE[locale] ?? REMOVE_DIALOG_LAST_ROW_TEMPLATE.en!, { provider });
}

/** Site Token tab's load-error banner — same `{error}`-interpolated shape as
 *  {@link accessTokensLoadErrorMessage}. */
const SITE_TOKEN_LOAD_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't load the Site Token's status: {error}",
};
export function siteTokenLoadErrorMessage(locale: string, error: string): string {
  return interpolate(SITE_TOKEN_LOAD_ERROR_TEMPLATE[locale] ?? SITE_TOKEN_LOAD_ERROR_TEMPLATE.en!, { error });
}

/** Site Token tab's generic generate-error banner — used when the failure is neither of the two
 *  known markers (`ENV_VAR_ACTIVE`/`ALREADY_EXISTS`, both handled with their own fixed copy in
 *  `SiteTokenTab.tsx` rather than this template, since neither needs an `{error}` slot). */
const SITE_TOKEN_GENERATE_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't generate a key: {error}",
};
export function siteTokenGenerateErrorMessage(locale: string, error: string): string {
  return interpolate(SITE_TOKEN_GENERATE_ERROR_TEMPLATE[locale] ?? SITE_TOKEN_GENERATE_ERROR_TEMPLATE.en!, { error });
}

/** Site Token tab's reveal-error banner — same `{error}`-interpolated shape. Unlike generate,
 *  reveal has no known-marker cases to special-case (a reveal either works or fails outright), so
 *  this is the only error template that call site needs. */
const SITE_TOKEN_REVEAL_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't reveal the Site Token: {error}",
};
export function siteTokenRevealErrorMessage(locale: string, error: string): string {
  return interpolate(SITE_TOKEN_REVEAL_ERROR_TEMPLATE[locale] ?? SITE_TOKEN_REVEAL_ERROR_TEMPLATE.en!, { error });
}
