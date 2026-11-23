/**
 * @file Cross-feature UI-chrome words shared by every `*-i18n.ts` dictionary in this app.
 *
 * The product-neutral entries (Save, Cancel, Delete, the publish-dialog chrome, draft recovery,
 * code wrap, "Built-in", …) now live in `@jini-ai/admin/core/i18n-common` as `ADMIN_COMMON_I18N`, so
 * screens that move into the reusable admin package can fall back to them without importing this
 * file. This file keeps only what names the product and composes the two per locale: the generic
 * dictionary first, this app's own entries last, so a host entry always wins a key collision.
 *
 * A feature dictionary looks up its own keys first; only falls back here on a miss (see
 * `createDictionaryTranslator` in `@jini-ai/core/text`). Tovu's locale rows below govern which
 * locales are exposed, and in what order. Adding a new language means a row in
 * `OLDER_DESTINATION_I18N` below plus a block in `ADMIN_COMMON_I18N`: a Tovu locale missing from Jini
 * throws at module load, so a half-added language fails loudly instead of silently showing English.
 *
 * This does NOT cover the Settings dialog's own content (tab names, form labels inside it) — that
 * ships as a SEPARATE dictionary in the `@jini-ai/ui` package this app depends on
 * (`Jini/packages/ui/src/features/i18n/dictionaries/`), on purpose: that package is reusable across
 * hosts, so a Tovu-specific dictionary has no business living inside it. Same shape/fallback
 * convention as this file, but a genuinely separate dictionary that must be extended on its own —
 * adding a language here does not add it there. Check both before assuming a locale is fully done.
 */
import { ADMIN_COMMON_I18N } from "@jini-ai/admin/core/i18n-common";

/** The Publish Content dialog's notice for a destination running an older build. It names the
 *  product, so it cannot ship inside the reusable dictionary; it is the one common entry Tovu owns. */
const OLDER_DESTINATION_KEY = "is on an older Tovu and can't overwrite these yet. Update it, then publish again.";

/** Tovu's own common entries per locale. The row order is the locale order `COMMON_I18N` has always
 *  had (the language picker and the parity tests read `Object.keys(COMMON_I18N)`), so it is kept here
 *  rather than inherited from the package's dictionary. */
const OLDER_DESTINATION_I18N: Record<string, string> = {
  es: "usa una versión anterior de Tovu y aún no puede sobrescribir estos elementos. Actualízalo y vuelve a publicar.",
  de: "läuft auf einem älteren Tovu und kann das noch nicht überschreiben. Aktualisieren Sie es und veröffentlichen Sie erneut.",
  it: "usa una versione precedente di Tovu e non può ancora sovrascrivere questi elementi. Aggiornalo, poi pubblica di nuovo.",
  "zh-CN": "使用的是旧版 Tovu，还不能覆盖这些内容。请先更新，然后再次发布。",
  "zh-TW": "使用的是舊版 Tovu，尚無法覆寫這些內容。請先更新，再重新發佈。",
  ar: "يعمل بإصدار أقدم من Tovu ولا يمكنه استبدال هذه العناصر بعد. حدّثه، ثم انشر مرة أخرى.",
  fa: "روی نسخه قدیمی‌تر Tovu است و هنوز نمی‌تواند این‌ها را بازنویسی کند. آن را به‌روزرسانی کنید، سپس دوباره منتشر کنید.",
  ru: "работает на устаревшей версии Tovu и пока не может перезаписать эти элементы. Обновите его и опубликуйте снова.",
  ja: "は古いバージョンの Tovu を使用しているため、まだ上書きできません。更新してから再度公開してください。",
  id: "menggunakan Tovu versi lama dan belum bisa menimpa ini. Perbarui, lalu terbitkan lagi.",
  "pt-BR": "está em uma versão antiga do Tovu e ainda não pode sobrescrever esses itens. Atualize-o e publique novamente.",
  ko: "이전 버전의 Tovu를 사용 중이라 아직 덮어쓸 수 없습니다. 업데이트한 후 다시 게시하세요.",
  pl: "działa na starszej wersji Tovu i nie może jeszcze tego nadpisać. Zaktualizuj ją, a potem opublikuj ponownie.",
  hu: "egy régebbi Tovu-verziót futtat, és ezeket még nem tudja felülírni. Frissítse, majd tegye közzé újra.",
  fr: "utilise une version plus ancienne de Tovu et ne peut pas encore écraser ces éléments. Mettez-la à jour, puis publiez à nouveau.",
  uk: "працює на застарілій версії Tovu і поки не може перезаписати це. Оновіть її, а потім опублікуйте знову.",
  tr: "Tovu'nun daha eski bir sürümünü kullanıyor ve bunları henüz üzerine yazamıyor. Güncelleyin, ardından tekrar yayımlayın.",
  th: "ใช้ Tovu เวอร์ชันเก่าและยังเขียนทับรายการเหล่านี้ไม่ได้ กรุณาอัปเดตก่อนแล้วเผยแพร่อีกครั้ง",
  hi: "पुराने Tovu संस्करण पर है और अभी इन्हें अधिलेखित नहीं कर सकता। इसे अपडेट करें, फिर दोबारा प्रकाशित करें।",
  ur: "پرانے Tovu ورژن پر ہے اور ابھی انہیں اوور رائٹ نہیں کر سکتا۔ اسے اپ ڈیٹ کریں، پھر دوبارہ شائع کریں۔",
  bn: "পুরনো Tovu সংস্করণে আছে এবং এখনো এগুলো ওভাররাইট করতে পারে না। এটি আপডেট করুন, তারপর আবার প্রকাশ করুন।",
};

/** Per Tovu locale row: the matching Jini locale spread first, the branded entry last, so the
 *  branded entry wins a key collision. Built inline rather than through an exported helper: the
 *  merge rule itself is product-neutral, and a neutral helper belongs in Jini, not in a host. */
export const COMMON_I18N: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(OLDER_DESTINATION_I18N).map(([locale, olderDestination]) => {
    const jiniEntries = ADMIN_COMMON_I18N[locale];
    if (jiniEntries === undefined) throw new Error(`common dictionary ${locale} is missing from @jini-ai/admin`);
    return [locale, { ...jiniEntries, [OLDER_DESTINATION_KEY]: olderDestination }];
  }),
);
