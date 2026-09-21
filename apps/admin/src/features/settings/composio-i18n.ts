import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/**
 * @file Dictionary for `ComposioKeyField` — the Composio API key field above the Connectors grid
 * (`ComposioKeyField.tsx`'s own header). Security finding #6 (Low, 2026-09-20 terra review): this
 * field was English-only, the whole surface hardcoded literal copy with no `t()` call at all.
 *
 * `createDictionaryTranslator` falls through to `COMMON_I18N` first, then to the English key
 * itself — "Save"/"Saving…" are already carried there (21 locales each) and are deliberately NOT
 * repeated here (`trash-i18n.ts`'s header on why a duplicate is dead weight that can silently drift).
 * `use-composio-key-field.hooks.ts`'s `placeholder` field returns "comp_..." unmodified when the
 * field is unconfigured — not a dictionary key, and not meant to be translated; `t("comp_...")`
 * passes it straight through the same fallback chain, landing on the literal string itself.
 *
 * Covers the same 21 locales every other feature dictionary in this app ships — see `trash-i18n.ts`'s
 * header for the citation trail (`comments-i18n.ts`, `media-i18n.ts`, `external-mcp-i18n.ts` all
 * agree with each other and with `COMMON_I18N`).
 *
 * `{tail}` (in `"A key ending in {tail} is saved. Paste a new one to replace it."`) is rendered as a
 * real `<code>` element via `lib/template-i18n.ts`'s `splitOnPlaceholders`, not string-interpolated —
 * see `ComposioKeyField.tsx`'s `ComposioKeyConfiguredHelp`, the same technique `ThemeExplore.tsx`
 * already uses for an inline `<code>` node inside translated copy.
 */
export const COMPOSIO_DICT: Record<string, Record<string, string>> = {
  es: {
    "Composio API key": "Clave de API de Composio",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Guarda una clave de API de Composio para cargar el catálogo de conectores en vivo y conectar cuentas.",
    "A key ending in {tail} is saved. Paste a new one to replace it.":
      "Hay guardada una clave que termina en {tail}. Pega una nueva para reemplazarla.",
    Clear: "Borrar",
    "Replace saved key": "Reemplazar clave guardada",
  },
  id: {
    "Composio API key": "Kunci API Composio",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Simpan kunci API Composio untuk memuat katalog konektor langsung dan menghubungkan akun.",
    "A key ending in {tail} is saved. Paste a new one to replace it.":
      "Kunci yang berakhiran {tail} sudah tersimpan. Tempel yang baru untuk menggantinya.",
    Clear: "Hapus",
    "Replace saved key": "Ganti kunci tersimpan",
  },
  de: {
    "Composio API key": "Composio-API-Schlüssel",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Speichern Sie einen Composio-API-Schlüssel, um den Live-Connector-Katalog zu laden und Konten zu verbinden.",
    "A key ending in {tail} is saved. Paste a new one to replace it.":
      "Ein Schlüssel, der auf {tail} endet, ist gespeichert. Fügen Sie einen neuen ein, um ihn zu ersetzen.",
    Clear: "Löschen",
    "Replace saved key": "Gespeicherten Schlüssel ersetzen",
  },
  "zh-CN": {
    "Composio API key": "Composio API 密钥",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "保存 Composio API 密钥以加载实时连接器目录并连接账户。",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "已保存一个以 {tail} 结尾的密钥。粘贴一个新密钥以替换它。",
    Clear: "清除",
    "Replace saved key": "替换已保存的密钥",
  },
  "zh-TW": {
    "Composio API key": "Composio API 金鑰",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "儲存 Composio API 金鑰以載入即時連接器目錄並連接帳戶。",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "已儲存一個以 {tail} 結尾的金鑰。貼上新的以取代它。",
    Clear: "清除",
    "Replace saved key": "取代已儲存的金鑰",
  },
  "pt-BR": {
    "Composio API key": "Chave de API do Composio",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Salve uma chave de API do Composio para carregar o catálogo de conectores ao vivo e conectar contas.",
    "A key ending in {tail} is saved. Paste a new one to replace it.":
      "Uma chave terminada em {tail} está salva. Cole uma nova para substituí-la.",
    Clear: "Limpar",
    "Replace saved key": "Substituir chave salva",
  },
  ru: {
    "Composio API key": "Ключ API Composio",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Сохраните ключ API Composio, чтобы загрузить актуальный каталог коннекторов и подключить учётные записи.",
    "A key ending in {tail} is saved. Paste a new one to replace it.":
      "Сохранён ключ, оканчивающийся на {tail}. Вставьте новый, чтобы заменить его.",
    Clear: "Очистить",
    "Replace saved key": "Заменить сохранённый ключ",
  },
  fa: {
    "Composio API key": "کلید API Composio",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "یک کلید API Composio را ذخیره کنید تا فهرست اتصال‌دهنده‌های زنده بارگذاری شود و حساب‌ها متصل شوند.",
    "A key ending in {tail} is saved. Paste a new one to replace it.":
      "کلیدی که به {tail} ختم می‌شود ذخیره شده است. برای جایگزینی، کلید جدیدی را جای‌گذاری کنید.",
    Clear: "پاک کردن",
    "Replace saved key": "جایگزینی کلید ذخیره‌شده",
  },
  ar: {
    "Composio API key": "مفتاح API الخاص بـ Composio",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "احفظ مفتاح API الخاص بـ Composio لتحميل كتالوج الموصلات المباشر وربط الحسابات.",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "تم حفظ مفتاح ينتهي بـ {tail}. الصق مفتاحًا جديدًا لاستبداله.",
    Clear: "مسح",
    "Replace saved key": "استبدال المفتاح المحفوظ",
  },
  ja: {
    "Composio API key": "Composio APIキー",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Composio APIキーを保存すると、ライブのコネクタカタログを読み込み、アカウントを接続できます。",
    "A key ending in {tail} is saved. Paste a new one to replace it.":
      "{tail} で終わるキーが保存されています。新しいキーを貼り付けて置き換えてください。",
    Clear: "クリア",
    "Replace saved key": "保存済みのキーを置き換える",
  },
  ko: {
    "Composio API key": "Composio API 키",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Composio API 키를 저장하면 실시간 커넥터 카탈로그를 불러오고 계정을 연결할 수 있습니다.",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "{tail}(으)로 끝나는 키가 저장되어 있습니다. 새 키를 붙여넣어 교체하세요.",
    Clear: "지우기",
    "Replace saved key": "저장된 키 교체",
  },
  pl: {
    "Composio API key": "Klucz API Composio",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Zapisz klucz API Composio, aby wczytać na żywo katalog konektorów i połączyć konta.",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "Zapisano klucz kończący się na {tail}. Wklej nowy, aby go zastąpić.",
    Clear: "Wyczyść",
    "Replace saved key": "Zastąp zapisany klucz",
  },
  hu: {
    "Composio API key": "Composio API kulcs",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Mentsen el egy Composio API kulcsot az élő konnektorkatalógus betöltéséhez és a fiókok csatlakoztatásához.",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "Egy {tail} végződésű kulcs van elmentve. Illesszen be egy újat a cseréhez.",
    Clear: "Törlés",
    "Replace saved key": "Mentett kulcs cseréje",
  },
  fr: {
    "Composio API key": "Clé API Composio",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Enregistrez une clé API Composio pour charger le catalogue de connecteurs en direct et connecter des comptes.",
    "A key ending in {tail} is saved. Paste a new one to replace it.":
      "Une clé se terminant par {tail} est enregistrée. Collez-en une nouvelle pour la remplacer.",
    Clear: "Effacer",
    "Replace saved key": "Remplacer la clé enregistrée",
  },
  uk: {
    "Composio API key": "Ключ API Composio",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Збережіть ключ API Composio, щоб завантажити актуальний каталог конекторів і підключити облікові записи.",
    "A key ending in {tail} is saved. Paste a new one to replace it.":
      "Збережено ключ, що закінчується на {tail}. Вставте новий, щоб замінити його.",
    Clear: "Очистити",
    "Replace saved key": "Замінити збережений ключ",
  },
  tr: {
    "Composio API key": "Composio API anahtarı",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Canlı bağlayıcı kataloğunu yüklemek ve hesapları bağlamak için bir Composio API anahtarı kaydedin.",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "{tail} ile biten bir anahtar kayıtlı. Değiştirmek için yeni bir anahtar yapıştırın.",
    Clear: "Temizle",
    "Replace saved key": "Kayıtlı anahtarı değiştir",
  },
  th: {
    "Composio API key": "คีย์ API ของ Composio",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "บันทึกคีย์ API ของ Composio เพื่อโหลดแคตตาล็อกตัวเชื่อมต่อแบบสดและเชื่อมต่อบัญชี",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "มีคีย์ที่ลงท้ายด้วย {tail} บันทึกไว้แล้ว วางคีย์ใหม่เพื่อแทนที่",
    Clear: "ล้าง",
    "Replace saved key": "แทนที่คีย์ที่บันทึกไว้",
  },
  it: {
    "Composio API key": "Chiave API di Composio",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "Salva una chiave API di Composio per caricare il catalogo dei connettori in tempo reale e collegare gli account.",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "È salvata una chiave che termina con {tail}. Incollane una nuova per sostituirla.",
    Clear: "Cancella",
    "Replace saved key": "Sostituisci chiave salvata",
  },
  hi: {
    "Composio API key": "Composio API कुंजी",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "लाइव कनेक्टर कैटलॉग लोड करने और खाते जोड़ने के लिए एक Composio API कुंजी सहेजें।",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "{tail} पर समाप्त होने वाली एक कुंजी सहेजी गई है। इसे बदलने के लिए एक नई कुंजी पेस्ट करें।",
    Clear: "साफ़ करें",
    "Replace saved key": "सहेजी गई कुंजी बदलें",
  },
  ur: {
    "Composio API key": "Composio API کلید",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "لائیو کنیکٹر کیٹلاگ لوڈ کرنے اور اکاؤنٹس جوڑنے کے لیے ایک Composio API کلید محفوظ کریں۔",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "{tail} پر ختم ہونے والی ایک کلید محفوظ ہے۔ اسے تبدیل کرنے کے لیے نئی کلید پیسٹ کریں۔",
    Clear: "صاف کریں",
    "Replace saved key": "محفوظ شدہ کلید تبدیل کریں",
  },
  bn: {
    "Composio API key": "Composio API কী",
    "Save a Composio API key to load the live connector catalog and connect accounts.":
      "লাইভ কানেক্টর ক্যাটালগ লোড করতে এবং অ্যাকাউন্ট সংযুক্ত করতে একটি Composio API কী সংরক্ষণ করুন।",
    "A key ending in {tail} is saved. Paste a new one to replace it.": "{tail} দিয়ে শেষ হওয়া একটি কী সংরক্ষিত আছে। এটি প্রতিস্থাপন করতে একটি নতুন কী পেস্ট করুন।",
    Clear: "মুছুন",
    "Replace saved key": "সংরক্ষিত কী প্রতিস্থাপন করুন",
  },
};

export const t = createDictionaryTranslator(COMPOSIO_DICT);
