import { ADMIN_COMMON_I18N } from "@jini-ai/admin/core/i18n-common";

/**
 * @file Cross-feature UI-chrome words shared by every `*-i18n.ts` dictionary in this app —
 * verbs/nouns that recur verbatim across many features (Save, Cancel, Delete, Edit, Enable,
 * Disable, Status, Title, Name, Label, Kind, Timestamp, Updated, Trash, More, and the two save-flow
 * participles). Seeded from real duplication found across the existing per-feature dictionaries
 * (a `grep`-and-diff pass, not guessed) — every value here already matched byte-for-byte across
 * 3+ feature files before this file existed.
 *
 * Deliberately excludes nav/taxonomy nouns like "Content", "People", "Operations", "Marketing",
 * "Studio", "Pages" even though some also repeat across files — those are the admin sidebar's own
 * category vocabulary (canonical source: `admin-nav-i18n.ts`), not generic chrome, and a feature
 * page's use of e.g. "Pages" as a breadcrumb label is coincidental overlap, not the same concept.
 *
 * A feature dictionary looks up its own keys first; only falls back here on a miss (see
 * `createDictionaryTranslator` in `dictionary-translator.ts`). Adding a new language is one block
 * here plus one block per feature file that actually has feature-specific copy — this file is
 * where an entry only has to be translated ONCE instead of once per feature.
 *
 * The product-neutral words live in Jini's `ADMIN_COMMON_I18N` (`@jini-ai/admin/core/i18n-common`);
 * this file keeps only the entries that name the product and composes them over Jini's dictionary
 * per locale (Jini first, host last, so a host entry wins). A new generic word or a new language's
 * generic block is added in Jini; a new locale here also needs its host block below.
 *
 * This does NOT cover the Settings dialog's own content (tab names, form labels inside it) — that
 * ships as a SEPARATE dictionary in the `@jini-ai/ui` package this app depends on
 * (`Jini/packages/ui/src/features/i18n/dictionaries/`), on purpose: that package is reusable across
 * hosts, so a Tovu-specific dictionary has no business living inside it. Same shape/fallback
 * convention as this file, but a genuinely separate dictionary that must be extended on its own —
 * adding a language here does not add it there. Check both before assuming a locale is fully done.
 */

/**
 * The product-naming common entries, per locale, in the original locale set. S9 (2026-09-24): the
 * Publish Content dialog's notice for a live site still on an older version, which cannot overwrite
 * the ticked items yet. It names the product, so it stays out of the reusable Jini dictionary.
 */
const HOST_COMMON_I18N: Record<string, Record<string, string>> = {
  es: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "usa una versión anterior de Tovu y aún no puede sobrescribir estos elementos. Actualízalo y vuelve a publicar." },
  de: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "läuft auf einem älteren Tovu und kann das noch nicht überschreiben. Aktualisieren Sie es und veröffentlichen Sie erneut." },
  it: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "usa una versione precedente di Tovu e non può ancora sovrascrivere questi elementi. Aggiornalo, poi pubblica di nuovo." },
  "zh-CN": { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "使用的是旧版 Tovu，还不能覆盖这些内容。请先更新，然后再次发布。" },
  "zh-TW": { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "使用的是舊版 Tovu，尚無法覆寫這些內容。請先更新，再重新發佈。" },
  ar: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "يعمل بإصدار أقدم من Tovu ولا يمكنه استبدال هذه العناصر بعد. حدّثه، ثم انشر مرة أخرى." },
  fa: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "روی نسخه قدیمی‌تر Tovu است و هنوز نمی‌تواند این‌ها را بازنویسی کند. آن را به‌روزرسانی کنید، سپس دوباره منتشر کنید." },
  ru: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "работает на устаревшей версии Tovu и пока не может перезаписать эти элементы. Обновите его и опубликуйте снова." },
  ja: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "は古いバージョンの Tovu を使用しているため、まだ上書きできません。更新してから再度公開してください。" },
  id: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "menggunakan Tovu versi lama dan belum bisa menimpa ini. Perbarui, lalu terbitkan lagi." },
  "pt-BR": { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "está em uma versão antiga do Tovu e ainda não pode sobrescrever esses itens. Atualize-o e publique novamente." },
  ko: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "이전 버전의 Tovu를 사용 중이라 아직 덮어쓸 수 없습니다. 업데이트한 후 다시 게시하세요." },
  pl: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "działa na starszej wersji Tovu i nie może jeszcze tego nadpisać. Zaktualizuj ją, a potem opublikuj ponownie." },
  hu: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "egy régebbi Tovu-verziót futtat, és ezeket még nem tudja felülírni. Frissítse, majd tegye közzé újra." },
  fr: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "utilise une version plus ancienne de Tovu et ne peut pas encore écraser ces éléments. Mettez-la à jour, puis publiez à nouveau." },
  uk: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "працює на застарілій версії Tovu і поки не може перезаписати це. Оновіть її, а потім опублікуйте знову." },
  tr: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "Tovu'nun daha eski bir sürümünü kullanıyor ve bunları henüz üzerine yazamıyor. Güncelleyin, ardından tekrar yayımlayın." },
  th: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "ใช้ Tovu เวอร์ชันเก่าและยังเขียนทับรายการเหล่านี้ไม่ได้ กรุณาอัปเดตก่อนแล้วเผยแพร่อีกครั้ง" },
  hi: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "पुराने Tovu संस्करण पर है और अभी इन्हें अधिलेखित नहीं कर सकता। इसे अपडेट करें, फिर दोबारा प्रकाशित करें।" },
  ur: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "پرانے Tovu ورژن پر ہے اور ابھی انہیں اوور رائٹ نہیں کر سکتا۔ اسے اپ ڈیٹ کریں، پھر دوبارہ شائع کریں۔" },
  bn: { "is on an older Tovu and can't overwrite these yet. Update it, then publish again.": "পুরনো Tovu সংস্করণে আছে এবং এখনো এগুলো ওভাররাইট করতে পারে না। এটি আপডেট করুন, তারপর আবার প্রকাশ করুন।" },
};

export const COMMON_I18N: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(HOST_COMMON_I18N).map(([locale, hostEntries]) => [locale, { ...ADMIN_COMMON_I18N[locale], ...hostEntries }]),
);
