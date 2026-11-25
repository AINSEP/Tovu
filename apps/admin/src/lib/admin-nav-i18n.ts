import { createDictionaryTranslator } from "@jini-ai/core/text";
import { ADMIN_COMMON_I18N } from "@jini-ai/admin/core/i18n-common";
import { ADMIN_NAV_DICT } from "@jini-ai/admin/shell/lib/admin-nav-i18n";

/** Host-registered panels whose sidebar label Jini's nav dictionary does not carry yet (P11 Storage,
 *  `features/storage/storage-i18n.ts` holds the same word), merged over the package dictionary. */
const HOST_NAV_LABELS: Record<string, string> = { "es": "Almacenamiento", "id": "Penyimpanan", "de": "Speicher", "zh-CN": "存储", "zh-TW": "儲存空間", "pt-BR": "Armazenamento", "ru": "Хранилище", "fa": "فضای ذخیره‌سازی", "ar": "التخزين", "ja": "ストレージ", "ko": "저장 공간", "pl": "Pamięć", "hu": "Tárhely", "fr": "Stockage", "uk": "Сховище", "tr": "Depolama", "th": "พื้นที่จัดเก็บ", "it": "Spazio", "hi": "स्टोरेज", "ur": "اسٹوریج", "bn": "স্টোরেজ" };
const NAV_DICT = Object.fromEntries(Object.entries(ADMIN_NAV_DICT).map(([locale, entries]) => (
  [locale, HOST_NAV_LABELS[locale] === undefined ? entries : { ...entries, Storage: HOST_NAV_LABELS[locale] }]
)));

/** The admin sidebar's label translator, bound here at module scope (rv-g FIX 3: Jini ships the
 *  dictionary and takes the callable). Same two-step fallback every other `t()` in this app uses:
 *  translated value, else the English source string itself — never a raw dictionary-miss placeholder. */
export const translateAdminNavLabel = createDictionaryTranslator({ featureDictionary: NAV_DICT }, { commonDictionary: ADMIN_COMMON_I18N });
