/**
 * @file Spanish dictionary for `use-settings-container.hooks.ts`'s own notice/error strings — the
 * "Raw Settings" ops/debug screen (`Settings.tsx` in this feature) was never touched by the
 * earlier `.tsx`-only translation pass at all (no `useAdminLocale`/dictionary reference anywhere
 * in it), so this file starts scoped to just the hook. Same two-step fallback every other `t()`
 * in this app uses: translated value, else the English source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";
import { interpolate, pickPlural } from "../../lib/template-i18n";

const SETTINGS_RAW_DICT: Record<string, Record<string, string>> = {
  es: {
    "Failed to load namespace": "No se pudo cargar el espacio de nombres",
    "Failed to save value": "No se pudo guardar el valor",
    "Failed to clear value": "No se pudo borrar el valor",
    "Failed to reset namespace": "No se pudo restablecer el espacio de nombres",
  },
  id: {
    "Failed to load namespace": "Gagal memuat namespace",
    "Failed to save value": "Gagal menyimpan nilai",
    "Failed to clear value": "Gagal menghapus nilai",
    "Failed to reset namespace": "Gagal mengatur ulang namespace",
  },
  de: {
    "Failed to load namespace": "Namespace konnte nicht geladen werden",
    "Failed to save value": "Wert konnte nicht gespeichert werden",
    "Failed to clear value": "Wert konnte nicht gelöscht werden",
    "Failed to reset namespace": "Namespace konnte nicht zurückgesetzt werden",
  },
  "zh-CN": {
    "Failed to load namespace": "无法加载命名空间",
    "Failed to save value": "无法保存值",
    "Failed to clear value": "无法清除值",
    "Failed to reset namespace": "无法重置命名空间",
  },
  "zh-TW": {
    "Failed to load namespace": "無法載入命名空間",
    "Failed to save value": "無法儲存值",
    "Failed to clear value": "無法清除值",
    "Failed to reset namespace": "無法重設命名空間",
  },
  "pt-BR": {
    "Failed to load namespace": "Falha ao carregar o namespace",
    "Failed to save value": "Falha ao salvar o valor",
    "Failed to clear value": "Falha ao limpar o valor",
    "Failed to reset namespace": "Falha ao redefinir o namespace",
  },
  ru: {
    "Failed to load namespace": "Не удалось загрузить пространство имён",
    "Failed to save value": "Не удалось сохранить значение",
    "Failed to clear value": "Не удалось очистить значение",
    "Failed to reset namespace": "Не удалось сбросить пространство имён",
  },
  fa: {
    "Failed to load namespace": "بارگذاری فضای‌نام ناموفق بود",
    "Failed to save value": "ذخیره مقدار ناموفق بود",
    "Failed to clear value": "پاک کردن مقدار ناموفق بود",
    "Failed to reset namespace": "بازنشانی فضای‌نام ناموفق بود",
  },
  ar: {
    "Failed to load namespace": "فشل تحميل مساحة الأسماء",
    "Failed to save value": "فشل حفظ القيمة",
    "Failed to clear value": "فشل مسح القيمة",
    "Failed to reset namespace": "فشل إعادة تعيين مساحة الأسماء",
  },
  ja: {
    "Failed to load namespace": "名前空間を読み込めませんでした",
    "Failed to save value": "値を保存できませんでした",
    "Failed to clear value": "値をクリアできませんでした",
    "Failed to reset namespace": "名前空間をリセットできませんでした",
  },
  ko: {
    "Failed to load namespace": "네임스페이스를 불러오지 못했습니다",
    "Failed to save value": "값을 저장하지 못했습니다",
    "Failed to clear value": "값을 지우지 못했습니다",
    "Failed to reset namespace": "네임스페이스를 재설정하지 못했습니다",
  },
  pl: {
    "Failed to load namespace": "Nie udało się załadować przestrzeni nazw",
    "Failed to save value": "Nie udało się zapisać wartości",
    "Failed to clear value": "Nie udało się wyczyścić wartości",
    "Failed to reset namespace": "Nie udało się zresetować przestrzeni nazw",
  },
  hu: {
    "Failed to load namespace": "Nem sikerült betölteni a névteret",
    "Failed to save value": "Nem sikerült menteni az értéket",
    "Failed to clear value": "Nem sikerült törölni az értéket",
    "Failed to reset namespace": "Nem sikerült visszaállítani a névteret",
  },
  fr: {
    "Failed to load namespace": "Échec du chargement de l'espace de noms",
    "Failed to save value": "Échec de l'enregistrement de la valeur",
    "Failed to clear value": "Échec de l'effacement de la valeur",
    "Failed to reset namespace": "Échec de la réinitialisation de l'espace de noms",
  },
  uk: {
    "Failed to load namespace": "Не вдалося завантажити простір імен",
    "Failed to save value": "Не вдалося зберегти значення",
    "Failed to clear value": "Не вдалося очистити значення",
    "Failed to reset namespace": "Не вдалося скинути простір імен",
  },
  tr: {
    "Failed to load namespace": "Ad alanı yüklenemedi",
    "Failed to save value": "Değer kaydedilemedi",
    "Failed to clear value": "Değer temizlenemedi",
    "Failed to reset namespace": "Ad alanı sıfırlanamadı",
  },
  th: {
    "Failed to load namespace": "โหลดเนมสเปซไม่สำเร็จ",
    "Failed to save value": "บันทึกค่าไม่สำเร็จ",
    "Failed to clear value": "ล้างค่าไม่สำเร็จ",
    "Failed to reset namespace": "รีเซ็ตเนมสเปซไม่สำเร็จ",
  },
  it: {
    "Failed to load namespace": "Impossibile caricare il namespace",
    "Failed to save value": "Impossibile salvare il valore",
    "Failed to clear value": "Impossibile cancellare il valore",
    "Failed to reset namespace": "Impossibile ripristinare il namespace",
  },
  hi: {
    "Failed to load namespace": "नेमस्पेस लोड नहीं हो सका",
    "Failed to save value": "मान सहेजा नहीं जा सका",
    "Failed to clear value": "मान साफ़ नहीं हो सका",
    "Failed to reset namespace": "नेमस्पेस रीसेट नहीं हो सका",
  },
  ur: {
    "Failed to load namespace": "نیم اسپیس لوڈ نہیں ہو سکا",
    "Failed to save value": "قدر محفوظ نہیں ہو سکی",
    "Failed to clear value": "قدر صاف نہیں ہو سکی",
    "Failed to reset namespace": "نیم اسپیس ری سیٹ نہیں ہو سکا",
  },
  bn: {
    "Failed to load namespace": "নেমস্পেস লোড করা যায়নি",
    "Failed to save value": "মান সংরক্ষণ করা যায়নি",
    "Failed to clear value": "মান মুছে ফেলা যায়নি",
    "Failed to reset namespace": "নেমস্পেস রিসেট করা যায়নি",
  },
};

export const t = createDictionaryTranslator(SETTINGS_RAW_DICT);

const PRINCIPAL_NOT_FOUND_TEMPLATE: Record<string, string> = {
  en: 'PRINCIPAL_NOT_FOUND: no active principal matches "{principalIdRaw}".',
  es: 'PRINCIPAL_NOT_FOUND: ningún principal activo coincide con "{principalIdRaw}".',
  id: 'PRINCIPAL_NOT_FOUND: tidak ada principal aktif yang cocok dengan "{principalIdRaw}".',
  de: 'PRINCIPAL_NOT_FOUND: Kein aktiver Principal stimmt mit "{principalIdRaw}" überein.',
  "zh-CN": 'PRINCIPAL_NOT_FOUND: 没有活动的主体与 "{principalIdRaw}" 匹配。',
  "zh-TW": 'PRINCIPAL_NOT_FOUND: 沒有作用中的主體與「{principalIdRaw}」相符。',
  "pt-BR": 'PRINCIPAL_NOT_FOUND: nenhum principal ativo corresponde a "{principalIdRaw}".',
  ru: 'PRINCIPAL_NOT_FOUND: ни один активный субъект не соответствует "{principalIdRaw}".',
  fa: 'PRINCIPAL_NOT_FOUND: هیچ principal فعالی با "{principalIdRaw}" مطابقت ندارد.',
  ar: 'PRINCIPAL_NOT_FOUND: لا يوجد كيان نشط يطابق "{principalIdRaw}".',
  ja: 'PRINCIPAL_NOT_FOUND: "{principalIdRaw}" に一致するアクティブなプリンシパルがありません。',
  ko: 'PRINCIPAL_NOT_FOUND: "{principalIdRaw}"와(과) 일치하는 활성 principal이 없습니다.',
  pl: 'PRINCIPAL_NOT_FOUND: żaden aktywny podmiot nie pasuje do "{principalIdRaw}".',
  hu: 'PRINCIPAL_NOT_FOUND: nincs aktív principal, amely megfelelne ennek: "{principalIdRaw}".',
  fr: 'PRINCIPAL_NOT_FOUND: aucun principal actif ne correspond à "{principalIdRaw}".',
  uk: 'PRINCIPAL_NOT_FOUND: жоден активний суб’єкт не відповідає "{principalIdRaw}".',
  tr: 'PRINCIPAL_NOT_FOUND: "{principalIdRaw}" ile eşleşen etkin bir principal yok.',
  th: 'PRINCIPAL_NOT_FOUND: ไม่มี principal ที่ใช้งานอยู่ตรงกับ "{principalIdRaw}"',
  it: 'PRINCIPAL_NOT_FOUND: nessun principal attivo corrisponde a "{principalIdRaw}".',
  hi: 'PRINCIPAL_NOT_FOUND: "{principalIdRaw}" से कोई सक्रिय principal मेल नहीं खाता।',
  ur: 'PRINCIPAL_NOT_FOUND: "{principalIdRaw}" سے کوئی فعال principal مماثل نہیں۔',
  bn: 'PRINCIPAL_NOT_FOUND: "{principalIdRaw}"-এর সাথে কোনো সক্রিয় principal মেলে না।',
};

/** `onSubmitPrincipal`'s no-match error — keeps the `PRINCIPAL_NOT_FOUND:` machine-readable code
 *  prefix untranslated (same convention as an HTTP status code or error code elsewhere in this
 *  app) and only translates the human-readable remainder, which embeds the raw typed input
 *  mid-sentence so it can't be a flat `ES` entry. */
export function principalNotFoundMessage(locale: string, principalIdRaw: string): string {
  return interpolate(PRINCIPAL_NOT_FOUND_TEMPLATE[locale] ?? PRINCIPAL_NOT_FOUND_TEMPLATE.en, { principalIdRaw });
}

const SAVED_AT_SCOPE_TEMPLATE: Record<string, string> = {
  en: "Saved {namespace}.{key} at {scope} scope.",
  es: "Se guardó {namespace}.{key} en el ámbito {scope}.",
  id: "{namespace}.{key} disimpan pada cakupan {scope}.",
  de: "{namespace}.{key} im Geltungsbereich {scope} gespeichert.",
  "zh-CN": "已在 {scope} 范围内保存 {namespace}.{key}。",
  "zh-TW": "已在 {scope} 範圍內儲存 {namespace}.{key}。",
  "pt-BR": "{namespace}.{key} salvo no escopo {scope}.",
  ru: "{namespace}.{key} сохранено в области {scope}.",
  fa: "{namespace}.{key} در محدوده {scope} ذخیره شد.",
  ar: "تم حفظ {namespace}.{key} في النطاق {scope}.",
  ja: "{namespace}.{key} を {scope} スコープで保存しました。",
  ko: "{scope} 범위에서 {namespace}.{key}을(를) 저장했습니다.",
  pl: "Zapisano {namespace}.{key} w zakresie {scope}.",
  hu: "A(z) {namespace}.{key} mentve a(z) {scope} hatókörben.",
  fr: "{namespace}.{key} enregistré dans la portée {scope}.",
  uk: "{namespace}.{key} збережено в області {scope}.",
  tr: "{namespace}.{key}, {scope} kapsamında kaydedildi.",
  th: "บันทึก {namespace}.{key} ในขอบเขต {scope} แล้ว",
  it: "{namespace}.{key} salvato nell'ambito {scope}.",
  hi: "{scope} स्कोप में {namespace}.{key} सहेजा गया।",
  ur: "{scope} اسکوپ میں {namespace}.{key} محفوظ ہو گیا۔",
  bn: "{scope} স্কোপে {namespace}.{key} সংরক্ষণ করা হয়েছে।",
};

/** `onSubmitValue`'s live-region success announcement — embeds `namespace`/`key`/`scope`
 *  mid-sentence. */
export function savedAtScopeMessage(locale: string, namespace: string, key: string, scope: string): string {
  return interpolate(SAVED_AT_SCOPE_TEMPLATE[locale] ?? SAVED_AT_SCOPE_TEMPLATE.en, { namespace, key, scope });
}

const CLEARED_AT_SCOPE_TEMPLATE: Record<string, string> = {
  en: "Cleared {namespace}.{key} at {scope} scope.",
  es: "Se borró {namespace}.{key} en el ámbito {scope}.",
  id: "{namespace}.{key} dihapus pada cakupan {scope}.",
  de: "{namespace}.{key} im Geltungsbereich {scope} gelöscht.",
  "zh-CN": "已在 {scope} 范围内清除 {namespace}.{key}。",
  "zh-TW": "已在 {scope} 範圍內清除 {namespace}.{key}。",
  "pt-BR": "{namespace}.{key} limpo no escopo {scope}.",
  ru: "{namespace}.{key} очищено в области {scope}.",
  fa: "{namespace}.{key} در محدوده {scope} پاک شد.",
  ar: "تم مسح {namespace}.{key} في النطاق {scope}.",
  ja: "{namespace}.{key} を {scope} スコープでクリアしました。",
  ko: "{scope} 범위에서 {namespace}.{key}을(를) 지웠습니다.",
  pl: "Wyczyszczono {namespace}.{key} w zakresie {scope}.",
  hu: "A(z) {namespace}.{key} törölve a(z) {scope} hatókörben.",
  fr: "{namespace}.{key} effacé dans la portée {scope}.",
  uk: "{namespace}.{key} очищено в області {scope}.",
  tr: "{namespace}.{key}, {scope} kapsamında temizlendi.",
  th: "ล้าง {namespace}.{key} ในขอบเขต {scope} แล้ว",
  it: "{namespace}.{key} cancellato nell'ambito {scope}.",
  hi: "{scope} स्कोप में {namespace}.{key} साफ़ किया गया।",
  ur: "{scope} اسکوپ میں {namespace}.{key} صاف کر دیا گیا۔",
  bn: "{scope} স্কোপে {namespace}.{key} মুছে ফেলা হয়েছে।",
};

/** `onClearValue`'s live-region success announcement — same shape as {@link savedAtScopeMessage}. */
export function clearedAtScopeMessage(locale: string, namespace: string, key: string, scope: string): string {
  return interpolate(CLEARED_AT_SCOPE_TEMPLATE[locale] ?? CLEARED_AT_SCOPE_TEMPLATE.en, { namespace, key, scope });
}

const RESET_NAMESPACE_TEMPLATE: Record<string, { one: string; other: string }> = {
  en: {
    one: "Reset {clearedCount} setting(s) in {namespace} ({scope} scope) to defaults.",
    other: "Reset {clearedCount} setting(s) in {namespace} ({scope} scope) to defaults.",
  },
  es: {
    one: "Se restableció {clearedCount} configuración en {namespace} (ámbito {scope}) a sus valores predeterminados.",
    other: "Se restablecieron {clearedCount} configuraciones en {namespace} (ámbito {scope}) a sus valores predeterminados.",
  },
  id: {
    one: "Mengatur ulang {clearedCount} pengaturan di {namespace} (cakupan {scope}) ke nilai default.",
    other: "Mengatur ulang {clearedCount} pengaturan di {namespace} (cakupan {scope}) ke nilai default.",
  },
  de: {
    one: "{clearedCount} Einstellung in {namespace} ({scope}-Bereich) auf Standardwerte zurückgesetzt.",
    other: "{clearedCount} Einstellungen in {namespace} ({scope}-Bereich) auf Standardwerte zurückgesetzt.",
  },
  "zh-CN": {
    one: "已将 {namespace}（{scope} 范围）中的 {clearedCount} 项设置重置为默认值。",
    other: "已将 {namespace}（{scope} 范围）中的 {clearedCount} 项设置重置为默认值。",
  },
  "zh-TW": {
    one: "已將 {namespace}（{scope} 範圍）中的 {clearedCount} 項設定重設為預設值。",
    other: "已將 {namespace}（{scope} 範圍）中的 {clearedCount} 項設定重設為預設值。",
  },
  "pt-BR": {
    one: "{clearedCount} configuração em {namespace} (escopo {scope}) redefinida para os padrões.",
    other: "{clearedCount} configurações em {namespace} (escopo {scope}) redefinidas para os padrões.",
  },
  ru: {
    one: "Сброшена {clearedCount} настройка в {namespace} (область {scope}) до значений по умолчанию.",
    other: "Сброшено {clearedCount} настроек в {namespace} (область {scope}) до значений по умолчанию.",
  },
  fa: {
    one: "{clearedCount} تنظیم در {namespace} (محدوده {scope}) به مقادیر پیش‌فرض بازنشانی شد.",
    other: "{clearedCount} تنظیم در {namespace} (محدوده {scope}) به مقادیر پیش‌فرض بازنشانی شد.",
  },
  ar: {
    one: "تمت إعادة تعيين إعداد واحد ({clearedCount}) في {namespace} (النطاق {scope}) إلى القيم الافتراضية.",
    other: "تمت إعادة تعيين {clearedCount} إعدادات في {namespace} (النطاق {scope}) إلى القيم الافتراضية.",
  },
  ja: {
    one: "{namespace}（{scope} スコープ）の {clearedCount} 件の設定を既定値にリセットしました。",
    other: "{namespace}（{scope} スコープ）の {clearedCount} 件の設定を既定値にリセットしました。",
  },
  ko: {
    one: "{namespace}({scope} 범위)의 설정 {clearedCount}개를 기본값으로 재설정했습니다.",
    other: "{namespace}({scope} 범위)의 설정 {clearedCount}개를 기본값으로 재설정했습니다.",
  },
  pl: {
    one: "Zresetowano {clearedCount} ustawienie w {namespace} (zakres {scope}) do wartości domyślnych.",
    other: "Zresetowano {clearedCount} ustawień w {namespace} (zakres {scope}) do wartości domyślnych.",
  },
  hu: {
    one: "Alaphelyzetbe állítva {clearedCount} beállítás itt: {namespace} ({scope} hatókör).",
    other: "Alaphelyzetbe állítva {clearedCount} beállítás itt: {namespace} ({scope} hatókör).",
  },
  fr: {
    one: "{clearedCount} paramètre réinitialisé dans {namespace} (portée {scope}) aux valeurs par défaut.",
    other: "{clearedCount} paramètres réinitialisés dans {namespace} (portée {scope}) aux valeurs par défaut.",
  },
  uk: {
    one: "Скинуто {clearedCount} налаштування в {namespace} (область {scope}) до типових значень.",
    other: "Скинуто {clearedCount} налаштувань в {namespace} (область {scope}) до типових значень.",
  },
  tr: {
    one: "{namespace} içinde ({scope} kapsamı) {clearedCount} ayar varsayılanlara sıfırlandı.",
    other: "{namespace} içinde ({scope} kapsamı) {clearedCount} ayar varsayılanlara sıfırlandı.",
  },
  th: {
    one: "รีเซ็ต {clearedCount} การตั้งค่าใน {namespace} (ขอบเขต {scope}) เป็นค่าเริ่มต้นแล้ว",
    other: "รีเซ็ต {clearedCount} การตั้งค่าใน {namespace} (ขอบเขต {scope}) เป็นค่าเริ่มต้นแล้ว",
  },
  it: {
    one: "{clearedCount} impostazione ripristinata ai valori predefiniti in {namespace} (ambito {scope}).",
    other: "{clearedCount} impostazioni ripristinate ai valori predefiniti in {namespace} (ambito {scope}).",
  },
  hi: {
    one: "{namespace} ({scope} स्कोप) की {clearedCount} सेटिंग को डिफ़ॉल्ट पर रीसेट किया गया।",
    other: "{namespace} ({scope} स्कोप) की {clearedCount} सेटिंग को डिफ़ॉल्ट पर रीसेट किया गया।",
  },
  ur: {
    one: "{namespace} ({scope} اسکوپ) کی {clearedCount} سیٹنگ کو ڈیفالٹ پر ری سیٹ کر دیا گیا۔",
    other: "{namespace} ({scope} اسکوپ) کی {clearedCount} سیٹنگ کو ڈیفالٹ پر ری سیٹ کر دیا گیا۔",
  },
  bn: {
    one: "{namespace}-এর ({scope} স্কোপ) {clearedCount}টি সেটিং ডিফল্টে রিসেট করা হয়েছে।",
    other: "{namespace}-এর ({scope} স্কোপ) {clearedCount}টি সেটিং ডিফল্টে রিসেট করা হয়েছে।",
  },
};

/** `onConfirmReset`'s live-region success announcement — Spanish singular/plural agreement on the
 *  cleared-count ("1 configuración" vs "N configuraciones") the English "setting(s)" shorthand
 *  doesn't need. */
export function resetNamespaceMessage(locale: string, clearedCount: number, namespace: string, scope: string): string {
  const forms = RESET_NAMESPACE_TEMPLATE[locale] ?? RESET_NAMESPACE_TEMPLATE.en;
  return interpolate(pickPlural(clearedCount, forms), { clearedCount, namespace, scope });
}
